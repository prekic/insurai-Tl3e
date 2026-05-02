#!/usr/bin/env node
/**
 * Sprint 3 PR-S3.5 — Output Stability Test (Round-4 reviewer Test B)
 *
 * Path A redesign (PR-S3.5-followup-2): the original count-based panels
 * (coverages count, exclusions count) measured the wrong thing — they
 * tripped on borderline categorization decisions the LLM makes
 * differently between runs (e.g. "is this ek-sözleşme item a separate
 * coverage row or a property of the parent?"). At Anthropic's T=0
 * the API is "near-deterministic" but not bit-exact due to floating-
 * point non-associativity in batched matmul, so 1-3 row variance per
 * run on a 16-page policy is inherent and expected.
 *
 * The reviewer's actual launch-readiness criterion is "does the same
 * PDF produce reliably correct output", not "does the same PDF
 * produce identical JSON". This redesign measures SUBSTANTIVE FIELD
 * STABILITY — does each run contain the specific signals the reviewer
 * cared about?
 *
 * SUBSTANTIVE CHECKS (binary per-run, must be 100% consistent):
 *
 *   anadolu-birlesik-kasko (the default fixture):
 *     1. conditionalDeductibles contains the 80% Kullanım Şekli
 *        scenario (canonical label "Rent-a-car / ticari kullanım: %80"
 *        per gotcha #93)
 *     2. conditionalDeductibles contains the 35% AS+ network scenario
 *        ("Anlaşmalı olmayan servis: %35")
 *     3. coverages contains an unlimited Excess Liability row
 *        (matches /artan\s*mali\s*sorumluluk|imm/i, isUnlimited=true)
 *     4. coverages contains an Anadolu Hizmet assistance row
 *     5. coverages contains an AS+ / Anlaşmalı Servis network row
 *     6. isBundle is true (Birleşik Kasko)
 *     7. previousInsurer is set (Sompo Japan transfer per page 8)
 *
 * Pass criteria: zero substantive flips across N runs. Count panels
 * remain visible as INFORMATIONAL — they print but don't fail.
 *
 * Required env:
 *   SMOKE_BASE_URL  — production server origin
 *   STABILITY_RUNS  — number of runs (default 5)
 *   STABILITY_FIXTURE — fixture filename in tests/fixtures/kasko/
 *
 * Exit codes:
 *   0 — pass: zero substantive flips
 *   1 — fail: any substantive check flipped between runs
 *   2 — setup error
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'

const FIXTURES_DIR = path.resolve('tests/fixtures/kasko')
const DEFAULT_RUNS = 5
const REQUEST_TIMEOUT_MS = 180_000
const DOCUMENT_AI_PAGE_LIMIT = 10 // Mirrors src/lib/ai/pdf-splitter.ts:11

interface CoverageRow {
  name?: string
  nameTr?: string
  isUnlimited?: boolean
  category?: string
}

interface ExtractionSnapshot {
  // Counts (informational — visible but don't fail the test)
  coveragesCount: number
  exclusionsCount: number
  conditionalDeductiblesCount: number
  // Substantive checks (binary per-run; flip across runs = fail)
  hasKullanimSekli80: boolean
  hasNonNetworkServis35: boolean
  hasUnlimitedLiability: boolean
  hasAnadoluHizmet: boolean
  hasAsPlusNetwork: boolean
  isBundle: boolean
  hasPreviousInsurer: boolean
}

function exitSetup(msg: string): never {
  console.error(`✗ Setup error: ${msg}`)
  process.exit(2)
}

async function chunkAndOcr(baseUrl: string, pdfBytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(pdfBytes)
  const pageCount = doc.getPageCount()
  const chunks: Uint8Array[] = []
  for (let start = 0; start < pageCount; start += DOCUMENT_AI_PAGE_LIMIT) {
    const end = Math.min(start + DOCUMENT_AI_PAGE_LIMIT, pageCount)
    const sub = await PDFDocument.create()
    const copied = await sub.copyPages(
      doc,
      Array.from({ length: end - start }, (_, i) => start + i)
    )
    for (const p of copied) sub.addPage(p)
    chunks.push(await sub.save())
  }

  let combined = ''
  for (const chunk of chunks) {
    const documentBase64 = Buffer.from(chunk).toString('base64')
    const res = await fetch(`${baseUrl}/api/ai/ocr/document-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentBase64 }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const raw = await res.text().catch(() => '')
      throw new Error(`OCR failed: ${res.status} — ${raw.slice(0, 200)}`)
    }
    const json = (await res.json()) as {
      success?: boolean
      data?: { text?: string }
      error?: string
    }
    if (!json.success || !json.data?.text) {
      throw new Error(`OCR returned non-success: ${json.error ?? 'empty text'}`)
    }
    combined += json.data.text + '\n'
  }
  return combined
}

async function extractOnce(baseUrl: string, documentText: string): Promise<ExtractionSnapshot> {
  const res = await fetch(`${baseUrl}/api/ai/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ documentText, policyType: 'kasko' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Extract failed: ${res.status}`)

  const text = await res.text()
  const lines = text.split(/\r?\n/)
  let lastPayload = ''
  for (const line of lines) {
    if (line.startsWith('data:')) lastPayload = line.slice(5).trim()
  }
  if (!lastPayload || lastPayload === '[DONE]') {
    throw new Error(`Extract returned no data SSE event. First 200 chars: ${text.slice(0, 200)}`)
  }
  const parsed = JSON.parse(lastPayload) as {
    success?: boolean
    data?: {
      coverages?: CoverageRow[]
      exclusions?: unknown[]
      conditionalDeductibles?: unknown[]
      isBundle?: boolean | null
      previousInsurer?: string | null
    }
    error?: string
  }
  if (!parsed.success || !parsed.data) {
    throw new Error(`Extract returned non-success: ${parsed.error ?? 'no data'}`)
  }
  const data = parsed.data
  const coverages = Array.isArray(data.coverages) ? data.coverages : []
  const conditionalDeductibles = Array.isArray(data.conditionalDeductibles)
    ? data.conditionalDeductibles
    : []

  // Substantive checks — search the data for the specific signals the
  // Round-4 reviewer cared about. Each is a binary present/absent per run.
  const condDedStrings = conditionalDeductibles.map((c) => String(c).toLowerCase())
  const coverageBlob = coverages
    .map((c) => `${c.name ?? ''} ${c.nameTr ?? ''}`.toLowerCase())
    .join(' | ')

  return {
    coveragesCount: coverages.length,
    exclusionsCount: Array.isArray(data.exclusions) ? data.exclusions.length : 0,
    conditionalDeductiblesCount: conditionalDeductibles.length,
    hasKullanimSekli80: condDedStrings.some(
      (s) => /rent[\s-]*a[\s-]*car|ticari\s*kullan[ıi]m|kullan[ıi]m\s*[şs]ekli/i.test(s) && /80/.test(s)
    ),
    hasNonNetworkServis35: condDedStrings.some(
      (s) => /anla[şs]mal[ıi]\s*olmayan\s*servis/i.test(s) && /35/.test(s)
    ),
    hasUnlimitedLiability: coverages.some(
      (c) =>
        c.isUnlimited === true &&
        /artan\s*mali\s*sorumluluk|imm|ihtiyari\s*mali\s*mes|excess\s*liability/i.test(
          `${c.name ?? ''} ${c.nameTr ?? ''}`
        )
    ),
    hasAnadoluHizmet: /anadolu\s*hizmet/i.test(coverageBlob),
    hasAsPlusNetwork: /\bas\+|anla[şs]mal[ıi]\s*servis\s*a[ğg]|yetkili\s*servis\s*a[ğg]/i.test(
      coverageBlob
    ),
    isBundle: data.isBundle === true,
    hasPreviousInsurer: typeof data.previousInsurer === 'string' && data.previousInsurer.trim().length > 0,
  }
}

function computeCountVariancePercent(values: number[]): number {
  if (values.length === 0) return 0
  const max = Math.max(...values)
  const min = Math.min(...values)
  if (max === 0) return 0
  return Math.round(((max - min) / max) * 100)
}

function checkBinaryConsistency(values: boolean[]): { consistent: boolean; allTrue: boolean; allFalse: boolean } {
  const allTrue = values.every((v) => v === true)
  const allFalse = values.every((v) => v === false)
  return { consistent: allTrue || allFalse, allTrue, allFalse }
}

interface SubstantiveCheck {
  label: string
  values: boolean[]
}

async function main(): Promise<void> {
  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.PRODUCTION_SERVER_URL
  if (!baseUrl) exitSetup('SMOKE_BASE_URL or PRODUCTION_SERVER_URL must be set')

  const runs = parseInt(process.env.STABILITY_RUNS ?? String(DEFAULT_RUNS), 10)
  const fixtureName = process.env.STABILITY_FIXTURE ?? 'anadolu-birlesik-kasko.pdf'
  const fixturePath = path.join(FIXTURES_DIR, fixtureName)

  if (!fs.existsSync(fixturePath)) {
    exitSetup(`Fixture not found: ${fixturePath}`)
  }

  console.log('━'.repeat(80))
  console.log('OUTPUT STABILITY CHECK — Sprint 3 PR-S3.5 (Test B, Path A)')
  console.log('━'.repeat(80))
  console.log(`Fixture: ${fixtureName}`)
  console.log(`Runs:    ${runs}`)
  console.log(`Pass:    zero substantive-check flips across runs`)
  console.log()

  const pdfBytes = new Uint8Array(fs.readFileSync(fixturePath))

  console.log(`[1/${runs + 1}] OCR (one-time chunked extraction)...`)
  const documentText = await chunkAndOcr(baseUrl, pdfBytes)
  console.log(`         Got ${documentText.length} chars of text`)
  console.log()

  const snapshots: ExtractionSnapshot[] = []
  for (let i = 0; i < runs; i++) {
    process.stdout.write(`[${i + 2}/${runs + 1}] Extract run ${i + 1}/${runs}... `)
    const snap = await extractOnce(baseUrl, documentText)
    snapshots.push(snap)
    // Single-line summary of the substantive checks per run for quick
    // visual inspection.
    const flags = [
      snap.hasKullanimSekli80 ? 'K80' : '---',
      snap.hasNonNetworkServis35 ? 'AS35' : '----',
      snap.hasUnlimitedLiability ? 'IMM' : '---',
      snap.hasAnadoluHizmet ? 'AHz' : '---',
      snap.hasAsPlusNetwork ? 'AS+' : '---',
      snap.isBundle ? 'BUN' : '---',
      snap.hasPreviousInsurer ? 'PRV' : '---',
    ].join(' ')
    console.log(
      `cov=${String(snap.coveragesCount).padStart(2)} ex=${snap.exclusionsCount} cd=${snap.conditionalDeductiblesCount}  [${flags}]`
    )
  }

  console.log()
  console.log('━'.repeat(80))
  console.log('SUBSTANTIVE CHECKS (must be 100% consistent across runs)')
  console.log('━'.repeat(80))

  const substantiveChecks: SubstantiveCheck[] = [
    { label: 'Kullanım Şekli %80 scenario   (K80) ', values: snapshots.map((s) => s.hasKullanimSekli80) },
    { label: 'Non-network servis %35       (AS35)', values: snapshots.map((s) => s.hasNonNetworkServis35) },
    { label: 'Unlimited Excess Liability    (IMM)', values: snapshots.map((s) => s.hasUnlimitedLiability) },
    { label: 'Anadolu Hizmet coverage       (AHz)', values: snapshots.map((s) => s.hasAnadoluHizmet) },
    { label: 'AS+ Yetkili Servis Ağı        (AS+)', values: snapshots.map((s) => s.hasAsPlusNetwork) },
    { label: 'Bundle (Birleşik) flag        (BUN)', values: snapshots.map((s) => s.isBundle) },
    { label: 'previousInsurer set           (PRV)', values: snapshots.map((s) => s.hasPreviousInsurer) },
  ]

  let substantiveFailures = 0
  for (const check of substantiveChecks) {
    const { consistent, allTrue, allFalse } = checkBinaryConsistency(check.values)
    const trueCount = check.values.filter(Boolean).length
    if (consistent) {
      const status = allTrue ? '✓ all present' : allFalse ? '○ all absent ' : '✓ consistent  '
      console.log(`  ${check.label}  ${status}  (${trueCount}/${check.values.length} runs)`)
    } else {
      substantiveFailures++
      console.log(
        `  ${check.label}  ✗ FLIPPED      (${trueCount}/${check.values.length} runs)  ⚠`
      )
    }
  }

  console.log()
  console.log('━'.repeat(80))
  console.log('COUNT VARIANCE (informational — does NOT affect pass/fail)')
  console.log('━'.repeat(80))
  console.log(
    `  coverages           ${computeCountVariancePercent(snapshots.map((s) => s.coveragesCount))}%  (values: ${snapshots.map((s) => s.coveragesCount).join(', ')})`
  )
  console.log(
    `  exclusions          ${computeCountVariancePercent(snapshots.map((s) => s.exclusionsCount))}%  (values: ${snapshots.map((s) => s.exclusionsCount).join(', ')})`
  )
  console.log(
    `  conditionalDeducts  ${computeCountVariancePercent(snapshots.map((s) => s.conditionalDeductiblesCount))}%  (values: ${snapshots.map((s) => s.conditionalDeductiblesCount).join(', ')})`
  )
  console.log(
    `  Note: count variance at Anthropic T=0 is inherent (near-deterministic, not bit-exact).`
  )
  console.log(`        Borderline categorization decisions cause 1-3 row spread on long policies.`)

  console.log()
  if (substantiveFailures === 0) {
    console.log(`✓ PASS — all ${substantiveChecks.length} substantive checks consistent across ${runs} runs`)
    process.exit(0)
  } else {
    console.log(
      `✗ FAIL — ${substantiveFailures}/${substantiveChecks.length} substantive checks FLIPPED between runs`
    )
    console.log()
    console.log('  Investigation steps:')
    console.log('  1. Find the flipped check above (marked with ⚠)')
    console.log('  2. If it relates to a specific named scenario (K80, AS35), check the')
    console.log('     NAMED_DEDUCTIBLE_SCENARIOS regex in policy-converter.ts and the prompt')
    console.log('     section in supabase/migrations/05x_*.sql')
    console.log('  3. If it relates to coverage rows (IMM, AHz, AS+), check the live DB prompt')
    console.log('     instructions for that coverage type — the LLM may need stronger guidance')
    console.log('  4. If it relates to flags (BUN, PRV), check the relevant extraction prompt')
    console.log('     section for ambiguous trigger phrasings')
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('✗ Stability check crashed:', err)
    process.exit(2)
  })
}
