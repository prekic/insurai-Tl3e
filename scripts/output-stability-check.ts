#!/usr/bin/env node
/**
 * Sprint 3 PR-S3.5 — Output Stability Test (Round-4 reviewer Test B)
 *
 * Runs production extraction on the same fixture N times (default 5)
 * and reports per-panel variance. Pass criteria: variance < 10% per
 * panel after temperature pin to 0 (manual operator step before run).
 *
 * Wired into `.github/workflows/output-stability.yml` as a manual
 * `workflow_dispatch` job. NOT scheduled — each run costs N × ~$0.015
 * Anthropic credits + ~5 minutes wall-clock.
 *
 * NO API keys baked into source — all secrets come from env. The
 * production deploy holds the Anthropic key and the script just hits
 * the SSE extraction endpoint.
 *
 * Required env:
 *   SMOKE_BASE_URL  — production server origin (falls back to
 *                     PRODUCTION_SERVER_URL)
 *   STABILITY_RUNS  — number of runs (default 5)
 *   STABILITY_FIXTURE — fixture filename in tests/fixtures/kasko/
 *                       (default 'anadolu-birlesik-kasko.pdf')
 *
 * Exit codes:
 *   0 — pass: max variance < 10% per panel
 *   1 — fail: any panel ≥ 10% variance
 *   2 — setup error
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'

const FIXTURES_DIR = path.resolve('tests/fixtures/kasko')
const DEFAULT_RUNS = 5
const VARIANCE_THRESHOLD_PCT = 10
const REQUEST_TIMEOUT_MS = 180_000
const DOCUMENT_AI_PAGE_LIMIT = 10 // Mirrors src/lib/ai/pdf-splitter.ts:11

interface PanelMetrics {
  coverages: number
  exclusions: number
  conditionalDeductibles: number
  hasUnlimited: boolean
  hasIsBundle: boolean
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
    const base64 = Buffer.from(chunk).toString('base64')
    const res = await fetch(`${baseUrl}/api/ai/ocr/document-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64: base64 }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`OCR failed: ${res.status}`)
    const json = (await res.json()) as { text?: string }
    combined += (json.text ?? '') + '\n'
  }
  return combined
}

async function extractOnce(baseUrl: string, documentText: string): Promise<PanelMetrics> {
  const res = await fetch(`${baseUrl}/api/ai/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ documentText, policyType: 'kasko' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Extract failed: ${res.status}`)

  const text = await res.text()
  // Final SSE event holds the JSON. Pattern matches smoke-kasko.ts.
  const lines = text.split('\n').filter((l) => l.startsWith('data: '))
  const lastDataLine = lines[lines.length - 1] ?? ''
  const payload = lastDataLine.replace(/^data:\s*/, '').trim()
  const parsed = JSON.parse(payload) as {
    data?: {
      coverages?: unknown[]
      exclusions?: unknown[]
      conditionalDeductibles?: unknown[]
      isBundle?: boolean | null
    }
  }
  const data = parsed.data ?? {}
  const coverages = Array.isArray(data.coverages) ? data.coverages : []

  return {
    coverages: coverages.length,
    exclusions: Array.isArray(data.exclusions) ? data.exclusions.length : 0,
    conditionalDeductibles: Array.isArray(data.conditionalDeductibles)
      ? data.conditionalDeductibles.length
      : 0,
    hasUnlimited: coverages.some((c) => (c as { isUnlimited?: boolean })?.isUnlimited === true),
    hasIsBundle: data.isBundle === true,
  }
}

function computeVariancePercent(values: number[]): number {
  if (values.length === 0) return 0
  const max = Math.max(...values)
  const min = Math.min(...values)
  if (max === 0) return 0
  return Math.round(((max - min) / max) * 100)
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
  console.log('OUTPUT STABILITY CHECK — Sprint 3 PR-S3.5 (Test B)')
  console.log('━'.repeat(80))
  console.log(`Fixture: ${fixtureName}`)
  console.log(`Runs:    ${runs}`)
  console.log(`Threshold: <${VARIANCE_THRESHOLD_PCT}% variance per panel`)
  console.log()

  const pdfBytes = new Uint8Array(fs.readFileSync(fixturePath))

  console.log(`[1/${runs + 1}] OCR (one-time chunked extraction)...`)
  const documentText = await chunkAndOcr(baseUrl, pdfBytes)
  console.log(`         Got ${documentText.length} chars of text`)
  console.log()

  const metrics: PanelMetrics[] = []
  for (let i = 0; i < runs; i++) {
    process.stdout.write(`[${i + 2}/${runs + 1}] Extract run ${i + 1}/${runs}... `)
    const m = await extractOnce(baseUrl, documentText)
    metrics.push(m)
    console.log(
      `coverages=${m.coverages} exclusions=${m.exclusions} condDed=${m.conditionalDeductibles}`
    )
  }

  console.log()
  console.log('Variance per panel:')
  const coverageVar = computeVariancePercent(metrics.map((m) => m.coverages))
  const exclusionVar = computeVariancePercent(metrics.map((m) => m.exclusions))
  const condDedVar = computeVariancePercent(metrics.map((m) => m.conditionalDeductibles))
  const unlimitedFlips = new Set(metrics.map((m) => m.hasUnlimited)).size > 1 ? 100 : 0
  const bundleFlips = new Set(metrics.map((m) => m.hasIsBundle)).size > 1 ? 100 : 0

  console.log(
    `  coverages           ${coverageVar}%${coverageVar >= VARIANCE_THRESHOLD_PCT ? ' ⚠' : ''}`
  )
  console.log(
    `  exclusions          ${exclusionVar}%${exclusionVar >= VARIANCE_THRESHOLD_PCT ? ' ⚠' : ''}`
  )
  console.log(
    `  conditionalDeducts  ${condDedVar}%${condDedVar >= VARIANCE_THRESHOLD_PCT ? ' ⚠' : ''}`
  )
  console.log(
    `  hasUnlimited flips  ${unlimitedFlips}%${unlimitedFlips > 0 ? ' ⚠ — boolean field flipped' : ''}`
  )
  console.log(
    `  isBundle flips      ${bundleFlips}%${bundleFlips > 0 ? ' ⚠ — boolean field flipped' : ''}`
  )

  const maxVar = Math.max(coverageVar, exclusionVar, condDedVar, unlimitedFlips, bundleFlips)
  console.log()
  if (maxVar < VARIANCE_THRESHOLD_PCT) {
    console.log(`✓ PASS — max variance ${maxVar}% < ${VARIANCE_THRESHOLD_PCT}% threshold`)
    process.exit(0)
  } else {
    console.log(`✗ FAIL — max variance ${maxVar}% ≥ ${VARIANCE_THRESHOLD_PCT}% threshold`)
    console.log()
    console.log('  Investigation steps:')
    console.log('  1. Verify ai.temperature was pinned to 0 in app_settings before this run')
    console.log('  2. If still high, check policy-converter.ts for non-deterministic post-processing')
    console.log('  3. Boolean flips usually indicate prompt ambiguity — review the prompt section')
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('✗ Stability check crashed:', err)
    process.exit(2)
  })
}
