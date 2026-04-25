/**
 * scripts/backfill-vehicle-info.ts
 *
 * Repairs the 69-of-70 kasko policies that are missing make/model/year in
 * raw_data.vehicleInfo. The diagnostic script
 * (scripts/diagnose-vehicle-extraction.ts) revealed that nearly every row
 * was ingested via scripts/pilot-batch-ingest.ts, which persists
 * structured fields but does NOT preserve the source PDF text — so the
 * production conversion path's regex-based vehicle extractor never saw
 * any input to work on.
 *
 * For each row, this script:
 *   1. Reads `raw_data.sourceFilename` to find the original PDF in
 *      `policies/` (the 51 ERDEMİR PDFs committed in commit 6c95abb).
 *   2. Re-parses the PDF locally with `pdf-parse` (Node-native, free, no
 *      AI tokens, ~1 sec per PDF).
 *   3. Runs the same `extractVehicleInfoFromText()` the production
 *      conversion path uses on freshly-uploaded policies.
 *   4. Writes the recovered text AND the extracted vehicleInfo back to
 *      `raw_data` (so future QA-gate runs see the same shape as a fresh
 *      upload, and a future re-extraction can use the stored text).
 *
 * Read paths considered, in order:
 *   1. raw_data.extractedText (already preserved — 1/70 rows in the pilot)
 *   2. PDF on disk in policies/ keyed by raw_data.sourceFilename
 *
 * Usage:
 *   # Preview without writing
 *   npx tsx scripts/backfill-vehicle-info.ts
 *
 *   # Apply
 *   npx tsx scripts/backfill-vehicle-info.ts --apply
 *
 *   # Optional: filter to a single policy ID
 *   npx tsx scripts/backfill-vehicle-info.ts --apply --policy-id <uuid>
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Exit code: 0 on success (including dry-run); 1 on env / fetch errors.
 *
 * After running, re-run `npm run qa:extraction` to confirm the
 * VEHICLE_COMPLETENESS check moved from 0% to a high pass rate.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { parseArgs } from 'node:util'

import { extractVehicleInfoFromText } from '../src/lib/ai/turkish-utils'
import type { Database } from '../src/lib/supabase/types'

dotenv.config()

const POLICIES_DIR = path.resolve(process.cwd(), 'policies')

interface PolicyRow {
  id: string
  provider: string
  policy_number: string | null
  raw_data: Record<string, unknown> | null
}

type Outcome =
  | 'already_complete' // make + model + year all present and non-empty
  | 'updated' // had stored text; regex recovered fields; DB updated
  | 'updated_with_text' // re-parsed PDF; recovered text + fields; DB updated
  | 'no_pdf' // no sourceFilename, or PDF not found, or PDF unreadable
  | 'no_text_extracted' // PDF parsed but produced < 100 chars
  | 'no_fields_recovered' // text available but regex returned undefined / empty
  | 'dry_run_would_update' // dry run + we would have updated
  | 'error' // DB write or other unexpected error

interface BackfillResult {
  id: string
  policyNumber: string
  provider: string
  outcome: Outcome
  before: { make?: string; model?: string; year?: number }
  after?: { make?: string; model?: string; year?: number }
  detail?: string
}

/**
 * Strip characters that PostgreSQL's JSONB parser rejects with
 * "unsupported Unicode escape sequence". The most common offender is
 * NUL (U+0000) — observed on the Anadolu VW Golf 2001 PDF — but lone
 * UTF-16 surrogate halves and other C0 controls are also unsafe.
 *
 * Built from a string so the source stays grep-friendly (no literal
 * NULs in regex literals which would corrupt the source file).
 */
function sanitizeForJsonb(text: string): string {
  // Intentional: stripping control characters IS the point of this regex.
  // PG JSONB rejects NUL with "unsupported Unicode escape sequence"; we
  // strip the C0 range (except TAB/LF/CR) plus unpaired surrogates so every
  // downstream JSONB write succeeds.
  // eslint-disable-next-line no-control-regex
  const c0 = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')
  return text
    .replace(c0, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

async function loadPdfText(filename: string): Promise<string | null> {
  try {
    const filepath = path.join(POLICIES_DIR, filename)
    const buf = await fs.readFile(filepath)
    const mod = await import('pdf-parse')
    const { PDFParse } = mod as unknown as {
      PDFParse: new (data: Uint8Array) => {
        getText(): Promise<{ pages: Array<{ text: string }> }>
      }
    }
    const parser = new PDFParse(new Uint8Array(buf))
    const result = await parser.getText()
    const raw = result.pages.map((p) => p.text).join('\n')
    return sanitizeForJsonb(raw)
  } catch {
    return null
  }
}

function readVehicleStored(rd: Record<string, unknown> | null): {
  make?: string
  model?: string
  year?: number
} {
  if (!rd) return {}
  const v = rd.vehicleInfo as Record<string, unknown> | undefined
  if (!v) return {}
  return {
    make: typeof v.make === 'string' && v.make.length >= 2 ? v.make : undefined,
    model: typeof v.model === 'string' && v.model.length >= 2 ? v.model : undefined,
    year: typeof v.year === 'number' ? v.year : undefined,
  }
}

import { extractWithDocumentAI } from '../src/lib/ai/document-ocr'

async function processRow(
  row: PolicyRow,
  isDryRun: boolean,
  supabase: ReturnType<typeof createClient<Database>>
): Promise<BackfillResult> {
  const before = readVehicleStored(row.raw_data)
  const isComplete = Boolean(before.make && before.model && before.year)
  if (isComplete) {
    return {
      id: row.id,
      policyNumber: row.policy_number ?? '',
      provider: row.provider,
      outcome: 'already_complete',
      before,
    }
  }

  const rd = row.raw_data ?? {}
  const storedText = typeof rd.extractedText === 'string' ? (rd.extractedText as string) : ''
  let text = storedText
  let textRecovered = false

  if (text.length < 100) {
    const filename = typeof rd.sourceFilename === 'string' ? rd.sourceFilename : undefined
    if (!filename) {
      return {
        id: row.id,
        policyNumber: row.policy_number ?? '',
        provider: row.provider,
        outcome: 'no_pdf',
        before,
        detail: 'no sourceFilename and no stored extractedText',
      }
    }
    const recovered = await loadPdfText(filename)
    if (!recovered) {
      return {
        id: row.id,
        policyNumber: row.policy_number ?? '',
        provider: row.provider,
        outcome: 'no_pdf',
        before,
        detail: `pdf not readable in policies/: ${filename}`,
      }
    }
    if (recovered.length < 100) {
      console.log(`         [OCR FALLBACK] Triggering Document AI for ${filename}...`)
      try {
        const filepath = path.join(POLICIES_DIR, filename)
        const buf = await fs.readFile(filepath)
        const file = new File([buf], filename, { type: 'application/pdf' })
        const result = await extractWithDocumentAI(file)
        if (result.success) {
          text = sanitizeForJsonb(result.data.text)
          textRecovered = true
          console.log(`         [OCR FALLBACK] Success: extracted ${text.length} chars`)
        } else {
          return {
            id: row.id,
            policyNumber: row.policy_number ?? '',
            provider: row.provider,
            outcome: 'no_text_extracted',
            before,
            detail: `Document AI failed: ${result.error.message}`,
          }
        }
      } catch (err) {
        return {
          id: row.id,
          policyNumber: row.policy_number ?? '',
          provider: row.provider,
          outcome: 'no_text_extracted',
          before,
          detail: `Document AI threw error: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    } else {
      text = recovered
      textRecovered = true
    }
  }

  const vehicle = extractVehicleInfoFromText(text)
  if (!vehicle || (!vehicle.make && !vehicle.model && !vehicle.year)) {
    return {
      id: row.id,
      policyNumber: row.policy_number ?? '',
      provider: row.provider,
      outcome: 'no_fields_recovered',
      before,
      detail: textRecovered
        ? `regex returned no fields after parsing PDF (${text.length} chars)`
        : `regex returned no fields from stored extractedText (${text.length} chars)`,
    }
  }

  const after = {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
  }

  if (isDryRun) {
    return {
      id: row.id,
      policyNumber: row.policy_number ?? '',
      provider: row.provider,
      outcome: 'dry_run_would_update',
      before,
      after,
    }
  }

  // Merge new fields into existing vehicleInfo (don't overwrite plate, usage, etc.)
  const existingVehicle = (rd.vehicleInfo as Record<string, unknown> | undefined) ?? {}
  const mergedVehicle: Record<string, unknown> = { ...existingVehicle }
  if (vehicle.make) mergedVehicle.make = vehicle.make
  if (vehicle.model) mergedVehicle.model = vehicle.model
  if (vehicle.year) mergedVehicle.year = vehicle.year
  if (vehicle.plate && !existingVehicle.plate) mergedVehicle.plate = vehicle.plate
  if (vehicle.engineNo && !existingVehicle.engineNo) mergedVehicle.engineNo = vehicle.engineNo
  if (vehicle.chassisNo && !existingVehicle.chassisNo) mergedVehicle.chassisNo = vehicle.chassisNo

  const newRawData: Record<string, unknown> = {
    ...rd,
    vehicleInfo: mergedVehicle,
    ...(textRecovered ? { extractedText: text } : {}),
  }

  // Supabase TS inference for `.update()` resolves to `never` when the
  // generated Database schema lacks an `Update` shape for `policies`; we
  // escape via `as any` on the table reference. Same pattern is used in
  // scripts/backfill-evaluation-scores.ts.

  const { error } = await (supabase.from('policies') as any)
    .update({ raw_data: newRawData })
    .eq('id', row.id)

  if (error) {
    return {
      id: row.id,
      policyNumber: row.policy_number ?? '',
      provider: row.provider,
      outcome: 'error',
      before,
      after,
      detail: `DB update failed: ${error.message}`,
    }
  }

  return {
    id: row.id,
    policyNumber: row.policy_number ?? '',
    provider: row.provider,
    outcome: textRecovered ? 'updated_with_text' : 'updated',
    before,
    after,
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      'policy-id': { type: 'string' },
      limit: { type: 'string' },
    },
  })

  const isDryRun = !values.apply
  const policyIdFilter = values['policy-id']
  const limit = values.limit ? parseInt(values.limit, 10) : 200

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  console.log(
    `Mode:        ${isDryRun ? 'DRY-RUN (use --apply to write)' : 'APPLY (will UPDATE the DB)'}`
  )
  console.log(`Limit:       ${limit}`)
  if (policyIdFilter) console.log(`Policy ID:   ${policyIdFilter}`)
  console.log(`PDFs dir:    ${POLICIES_DIR}\n`)

  const supabase = createClient<Database>(url, key)

  let query = supabase
    .from('policies')
    .select('id, provider, policy_number, raw_data')
    .eq('type', 'kasko')
    .limit(limit)
  if (policyIdFilter) query = query.eq('id', policyIdFilter)

  const { data, error } = await query
  if (error) {
    console.error('Fetch failed:', error.message)
    process.exit(1)
  }
  if (!data || data.length === 0) {
    console.log('No kasko policies match the filter.')
    process.exit(0)
  }

  const rows = data as unknown as PolicyRow[]
  console.log(`Processing ${rows.length} rows...\n`)

  const results: BackfillResult[] = []
  for (const row of rows) {
    const result = await processRow(row, isDryRun, supabase)
    results.push(result)

    const tag =
      result.outcome === 'updated_with_text'
        ? 'TEXT+VEH'
        : result.outcome === 'updated'
          ? 'VEH    '
          : result.outcome === 'dry_run_would_update'
            ? 'WOULD  '
            : result.outcome === 'already_complete'
              ? 'SKIP   '
              : result.outcome === 'no_pdf'
                ? 'NO_PDF '
                : result.outcome === 'no_text_extracted'
                  ? 'NO_TXT '
                  : result.outcome === 'no_fields_recovered'
                    ? 'NO_VEH '
                    : 'ERROR  '
    const summary = result.after
      ? `make=${result.after.make ?? '-'} model=${(result.after.model ?? '-').slice(0, 30)} year=${result.after.year ?? '-'}`
      : (result.detail ?? '')
    console.log(
      `${tag}  ${result.id.slice(0, 8)} (${result.provider.slice(0, 24).padEnd(24)}) #${result.policyNumber}`
    )
    if (summary) console.log(`         ${summary}`)
    // For error outcomes, ALSO print the detail line — the make/model/year
    // values are what we attempted to write, not what we successfully wrote.
    if (result.outcome === 'error' && result.detail) {
      console.log(`         ${result.detail}`)
    }
  }

  // Summary
  console.log('\n=== Summary ===')
  const counts: Record<Outcome, number> = {
    already_complete: 0,
    updated: 0,
    updated_with_text: 0,
    no_pdf: 0,
    no_text_extracted: 0,
    no_fields_recovered: 0,
    dry_run_would_update: 0,
    error: 0,
  }
  for (const r of results) counts[r.outcome]++
  for (const [k, v] of (Object.entries(counts) as Array<[Outcome, number]>).filter(
    ([, n]) => n > 0
  )) {
    console.log(`  ${String(v).padStart(3)}  ${k}`)
  }

  console.log()
  if (isDryRun) {
    const wouldUpdate = counts.dry_run_would_update
    console.log(`DRY-RUN: ${wouldUpdate} rows would be updated. Re-run with --apply to write.`)
    if (counts.no_pdf > 0) {
      console.log(
        `         ${counts.no_pdf} rows have no usable PDF — they'll stay broken until re-uploaded.`
      )
    }
    if (counts.no_fields_recovered > 0) {
      console.log(
        `         ${counts.no_fields_recovered} rows have text but the regex couldn't find vehicle fields — likely insurer-specific format quirks; consider adding aliases to shared/field-aliases.ts.`
      )
    }
  } else {
    const totalUpdated = counts.updated + counts.updated_with_text
    console.log(`APPLIED: ${totalUpdated} rows updated.`)
    console.log('Next: re-run `npm run qa:extraction` and confirm VEHICLE_COMPLETENESS rose.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
