/**
 * scripts/diagnose-vehicle-extraction.ts
 *
 * Read-only diagnostic for the vehicle-extraction failure surfaced by the
 * QA gate (`npm run qa:extraction`). Determines:
 *
 *   A. Population split per provider × has-extractedText-or-not.
 *      Tells us how many rows the regex-based backfill can repair vs how
 *      many need a different path (re-extract from PDF, or accept loss).
 *
 *   B. Top-level raw_data keys present on a sample AXA row (or whichever
 *      provider has the largest no_extractedText cohort). Surfaces any
 *      unexpected key that might be hiding the source PDF text under a
 *      name our 5-name probe didn't check.
 *
 *   C. Text-field lengths across 5 standard field names on the first 5
 *      no_extractedText rows. Confirms whether the text is genuinely
 *      absent or just under an unexpected name.
 *
 * Usage:
 *   npx tsx scripts/diagnose-vehicle-extraction.ts
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Read-only against the DB — never writes to any table.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

import type { Database } from '../src/lib/supabase/types'

dotenv.config()

interface PolicyRow {
  id: string
  provider: string
  policy_number: string | null
  raw_data: Record<string, unknown> | null
}

const TEXT_FIELD_NAMES = [
  'extractedText',
  'processedText',
  'text',
  'documentText',
  'rawText',
] as const

function fieldLen(rd: Record<string, unknown> | null, name: string): number | null {
  if (!rd) return null
  const v = rd[name]
  return typeof v === 'string' ? v.length : null
}

function describeJsonValue(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `array len=${v.length}`
  if (typeof v === 'string') {
    const preview = v.length > 60 ? v.slice(0, 60).replace(/\s+/g, ' ') + '…' : v
    return `string len=${v.length}  "${preview}"`
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>)
    return keys.length > 6
      ? `object keys=[${keys.slice(0, 6).join(',')},...+${keys.length - 6}]`
      : `object keys=[${keys.join(',')}]`
  }
  return typeof v
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    console.error('Add them to .env or export them before running.')
    process.exit(1)
  }

  const supabase = createClient<Database>(url, key)

  console.log('Fetching kasko policies...')
  const { data, error } = await supabase
    .from('policies')
    .select('id, provider, policy_number, raw_data')
    .eq('type', 'kasko')
    .limit(500)

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }
  if (!data || data.length === 0) {
    console.log('No kasko policies found.')
    process.exit(0)
  }

  const rows = data as unknown as PolicyRow[]
  console.log(`Fetched ${rows.length} kasko policies.\n`)

  // ───────────────────────────────────────────────────────────────────────
  // A. Population split per provider × has-extractedText-or-not
  // ───────────────────────────────────────────────────────────────────────
  console.log('=== A. Population split (provider × has extractedText?) ===\n')
  const buckets: Record<'has' | 'no', Record<string, number>> = {
    has: {},
    no: {},
  }
  for (const row of rows) {
    const len = fieldLen(row.raw_data, 'extractedText')
    const bucket = len !== null && len > 100 ? 'has' : 'no'
    buckets[bucket][row.provider] = (buckets[bucket][row.provider] || 0) + 1
  }
  for (const b of ['has', 'no'] as const) {
    const label =
      b === 'has' ? 'has_extractedText (backfillable)' : 'no_extractedText (needs different path)'
    const total = Object.values(buckets[b]).reduce((s, n) => s + n, 0)
    console.log(`[${label}] — ${total} rows`)
    const sorted = Object.entries(buckets[b]).sort(([, a], [, c]) => c - a)
    for (const [provider, n] of sorted) {
      console.log(`  ${String(n).padStart(3)}  ${provider}`)
    }
    console.log()
  }

  // Pick the largest "no_extractedText" provider for sections B + C.
  // Fall back to AXA if it's there, otherwise the first row of "no" bucket.
  const noBucketSorted = Object.entries(buckets.no).sort(([, a], [, c]) => c - a)
  const targetProvider =
    noBucketSorted.find(([p]) => /AXA/i.test(p))?.[0] ?? noBucketSorted[0]?.[0] ?? null

  // ───────────────────────────────────────────────────────────────────────
  // B. raw_data top-level keys for one row from the no_extractedText cohort
  // ───────────────────────────────────────────────────────────────────────
  console.log(
    `=== B. raw_data keys for one no_extractedText row${targetProvider ? ` (provider=${targetProvider})` : ''} ===\n`
  )
  const sampleRow = targetProvider
    ? rows.find(
        (r) => r.provider === targetProvider && (fieldLen(r.raw_data, 'extractedText') ?? 0) <= 100
      )
    : null

  if (!sampleRow) {
    console.log('  (no sample row found — every row has extractedText, congratulations)\n')
  } else {
    console.log(
      `  Sample policy: ${sampleRow.id} (${sampleRow.provider} / ${sampleRow.policy_number ?? 'NO_PN'})`
    )
    if (!sampleRow.raw_data) {
      console.log('  raw_data is null\n')
    } else {
      const keys = Object.keys(sampleRow.raw_data).sort()
      console.log(`  ${keys.length} top-level keys:\n`)
      for (const k of keys) {
        console.log(`    ${k.padEnd(28)}  ${describeJsonValue(sampleRow.raw_data[k])}`)
      }
      console.log()
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // C. Text-field lengths across 5 standard names on first 5 no-text rows
  // ───────────────────────────────────────────────────────────────────────
  console.log(
    '=== C. Text-field lengths on first 5 no_extractedText rows (per known field name) ===\n'
  )
  const noTextSample = rows
    .filter((r) => (fieldLen(r.raw_data, 'extractedText') ?? 0) <= 100)
    .slice(0, 5)
  if (noTextSample.length === 0) {
    console.log('  (every row has extractedText)\n')
  } else {
    for (const r of noTextSample) {
      const lens = TEXT_FIELD_NAMES.map((name) => {
        const len = fieldLen(r.raw_data, name)
        return `${name}=${len === null ? 'null' : len}`
      }).join('  ')
      console.log(
        `  ${r.id.slice(0, 8)} (${r.provider.slice(0, 24).padEnd(24)}) #${r.policy_number ?? '-'}`
      )
      console.log(`    ${lens}`)
    }
    console.log()
  }

  // ───────────────────────────────────────────────────────────────────────
  // Verdict
  // ───────────────────────────────────────────────────────────────────────
  const totalHas = Object.values(buckets.has).reduce((s, n) => s + n, 0)
  const totalNo = Object.values(buckets.no).reduce((s, n) => s + n, 0)

  console.log('=== Verdict ===\n')
  console.log(`  Backfillable (has extractedText):  ${totalHas} / ${rows.length}`)
  console.log(`  Needs different path (no text):    ${totalNo} / ${rows.length}`)
  console.log()
  if (totalHas > 0) {
    console.log(
      `  → Backfill path: run extractVehicleInfoFromText() on raw_data.extractedText for the ${totalHas} "has" rows.`
    )
    console.log(
      '    Expected to recover make/model/year on most of them. The remainder will need new aliases'
    )
    console.log('    in shared/field-aliases.ts (insurer-specific format quirks).\n')
  }
  if (totalNo > 0) {
    console.log(`  → For the ${totalNo} rows without text, see Section B above:`)
    console.log(
      '    • If you spot an unexpected text-bearing key (e.g. fullText, pdfText), the backfill is'
    )
    console.log('      a one-line change to read that key in addition to extractedText.')
    console.log(
      '    • If no text-bearing key exists, the only path is re-extracting from the original PDF.'
    )
    console.log('      Decide whether you have those PDFs accessible.\n')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
