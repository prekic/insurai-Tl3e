#!/usr/bin/env node
/**
 * scripts/audit-judge-corpus.ts
 *
 * Phase 3 — runs the audit judge against a curated golden corpus.
 *
 * For each fixture in `tests/fixtures/golden/golden.json`:
 *   1. Load + chunk the PDF (≤10 pages per chunk for Document AI).
 *   2. POST chunks to `/api/ai/ocr/document-ai` to get raw text.
 *   3. POST raw text to `/api/ai/extract` (SSE) to get structured extraction.
 *   4. Call `runAuditJudge()` in-process with raw text + structured data.
 *   5. Aggregate findings into `reports/judge-<timestamp>.md`.
 *
 * Mirrors `scripts/audit-end-to-end.ts` HTTP plumbing (gotcha #45 — keep
 * the script self-contained; don't import client-side `src/lib/` modules
 * that pull in Vite env). The exception is `runAuditJudge` which lives in
 * `server/services/` and is Node-safe by design.
 *
 * Usage:
 *   SMOKE_BASE_URL=http://localhost:4001 npm run audit:judge
 *   SMOKE_BASE_URL=https://insurai-production.up.railway.app npm run audit:judge
 *
 * Env requirements:
 *   - SMOKE_BASE_URL (or PRODUCTION_SERVER_URL): the running InsurAI server.
 *   - ANTHROPIC_API_KEY: for the audit-judge LLM call.
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: for prompt cache + persistence.
 *
 * Exit codes:
 *   0 — all fixtures clean (no critical findings)
 *   1 — at least one fixture has critical_count > 0 OR a fixture errored
 *   2 — env / setup failure (no BASE_URL, no fixtures.json, etc.)
 *
 * See tests/fixtures/golden/README.md for fixture-manifest schema.
 */

import * as dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

import { runAuditJudge, type AuditJudgeResult } from '../server/services/audit-judge-service'

dotenv.config()

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const BASE_URL = (process.env.SMOKE_BASE_URL || process.env.PRODUCTION_SERVER_URL || '').replace(
  /\/+$/,
  ''
)
const REQUEST_TIMEOUT_MS = 240_000
const DOCUMENT_AI_PAGE_LIMIT = 10
const FIXTURES_DIR = path.resolve('tests/fixtures/golden')
const MANIFEST_PATH = path.join(FIXTURES_DIR, 'golden.json')

interface GoldenFixture {
  fixtureId: string
  sourcePath: string
  insurer: string
  insuranceLine: string
  country: string
  yearBucket: number
  expectedCoverages: string[]
  expectedConditionalDeductibles: string[]
  expectedExclusions: string[]
  expectedBundleProducts: string[]
  expectedNamedScenarios: string[]
  forbiddenPhrases: string[]
  criticalFlags: string[]
  notes: string
}

interface GoldenManifest {
  fixtures: GoldenFixture[]
}

interface RunReport {
  fixtureId: string
  insurer: string
  status: 'ok' | 'cache_hit' | 'skipped' | 'error'
  criticalCount: number
  findingCount: number
  costUsd: number
  errorMessage?: string
  judgement?: AuditJudgeResult
}

// -----------------------------------------------------------------------------
// Setup helpers
// -----------------------------------------------------------------------------

function exitSetupError(msg: string): never {
  console.error(`\n[audit-judge-corpus] SETUP ERROR: ${msg}\n`)
  process.exit(2)
}

function loadManifest(): GoldenManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    exitSetupError(`Manifest not found: ${MANIFEST_PATH}`)
  }
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8')
    const parsed = JSON.parse(raw) as GoldenManifest
    if (!Array.isArray(parsed.fixtures) || parsed.fixtures.length === 0) {
      exitSetupError('golden.json has no fixtures')
    }
    return parsed
  } catch (err) {
    exitSetupError(
      `Failed to parse ${MANIFEST_PATH}: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

// -----------------------------------------------------------------------------
// PDF + extraction helpers (mirror audit-end-to-end.ts)
// -----------------------------------------------------------------------------

async function splitPdf(buf: Buffer): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true })
  const total = src.getPageCount()
  if (total <= DOCUMENT_AI_PAGE_LIMIT) return [new Uint8Array(buf)]
  const out: Uint8Array[] = []
  for (let i = 0; i < Math.ceil(total / DOCUMENT_AI_PAGE_LIMIT); i++) {
    const start = i * DOCUMENT_AI_PAGE_LIMIT
    const end = Math.min(start + DOCUMENT_AI_PAGE_LIMIT, total)
    const chunk = await PDFDocument.create()
    const idx = Array.from({ length: end - start }, (_, k) => start + k)
    const copied = await chunk.copyPages(src, idx)
    for (const p of copied) chunk.addPage(p)
    out.push(await chunk.save())
  }
  return out
}

async function postJson(
  url: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const raw = await res.text()
    let data: unknown = null
    try {
      data = JSON.parse(raw)
    } catch {
      /* not json */
    }
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(t)
  }
}

async function postSse(
  url: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const raw = await res.text()
    if (!res.ok) return { ok: false, status: res.status, data: null }
    let last = ''
    for (const line of raw.split(/\r?\n/)) if (line.startsWith('data:')) last = line.slice(5).trim()
    let data: unknown = null
    try {
      data = JSON.parse(last || raw)
    } catch {
      /* not json */
    }
    return { ok: true, status: res.status, data }
  } finally {
    clearTimeout(t)
  }
}

interface OcrResponse {
  success: boolean
  data?: { text?: string }
}
interface ExtractResponse {
  success: boolean
  data?: Record<string, unknown>
}

async function ocrAndExtract(
  pdfPath: string,
  fixtureId: string
): Promise<
  { ok: true; rawText: string; structured: Record<string, unknown> } | { ok: false; reason: string }
> {
  if (!fs.existsSync(pdfPath)) {
    return { ok: false, reason: `PDF not found: ${pdfPath}` }
  }
  const buf = fs.readFileSync(pdfPath)
  const chunks = await splitPdf(buf)
  const texts: string[] = []
  for (const chunk of chunks) {
    const docB64 = Buffer.from(chunk).toString('base64')
    const r = await postJson(`${BASE_URL}/api/ai/ocr/document-ai`, { documentBase64: docB64 })
    if (!r.ok || !(r.data as OcrResponse | null)?.success) {
      return { ok: false, reason: `[${fixtureId}] OCR failed (HTTP ${r.status})` }
    }
    texts.push((r.data as OcrResponse).data?.text || '')
  }
  const rawText = texts.join('\n\n[PAGE BREAK]\n\n')
  const ext = await postSse(`${BASE_URL}/api/ai/extract`, {
    documentText: rawText,
    policyType: 'kasko',
  })
  const extData = ext.data as ExtractResponse | null
  if (!ext.ok || !extData?.success || !extData.data) {
    return { ok: false, reason: `[${fixtureId}] extraction failed (HTTP ${ext.status})` }
  }
  return { ok: true, rawText, structured: extData.data }
}

// -----------------------------------------------------------------------------
// Per-fixture run
// -----------------------------------------------------------------------------

async function runOne(fixture: GoldenFixture): Promise<RunReport> {
  const pdfPath = path.resolve(FIXTURES_DIR, fixture.sourcePath)
  const ocr = await ocrAndExtract(pdfPath, fixture.fixtureId)
  if (!ocr.ok) {
    return {
      fixtureId: fixture.fixtureId,
      insurer: fixture.insurer,
      status: 'error',
      criticalCount: 0,
      findingCount: 0,
      costUsd: 0,
      errorMessage: ocr.reason,
    }
  }

  // The fixture manifest carries a curated yearBucket; pass it to the judge
  // via a synthetic startDate so the typology-hash function gets a clean
  // input. (Real production calls supply the actual policy startDate.)
  const syntheticStartDate = `01.01.${fixture.yearBucket}`

  const result = await runAuditJudge({
    insuranceLine: fixture.insuranceLine,
    country: fixture.country,
    startDate: syntheticStartDate,
    insurer: fixture.insurer,
    rawText: ocr.rawText,
    structuredExtraction: ocr.structured,
    policyId: null,
    fixtureId: fixture.fixtureId,
  })

  if (!result) {
    return {
      fixtureId: fixture.fixtureId,
      insurer: fixture.insurer,
      status: 'skipped',
      criticalCount: 0,
      findingCount: 0,
      costUsd: 0,
      errorMessage:
        'runAuditJudge returned null — circuit breaker, missing prompt, or unrecoverable error',
    }
  }

  return {
    fixtureId: fixture.fixtureId,
    insurer: fixture.insurer,
    status: result.cacheHit ? 'cache_hit' : 'ok',
    criticalCount: result.criticalCount,
    findingCount: result.findings.length,
    costUsd: result.costUsd,
    judgement: result,
  }
}

// -----------------------------------------------------------------------------
// Report writer
// -----------------------------------------------------------------------------

function writeMarkdown(reports: RunReport[], mdPath: string): void {
  const totalCost = reports.reduce((s, r) => s + (r.costUsd ?? 0), 0)
  const cacheHits = reports.filter((r) => r.status === 'cache_hit').length
  const errored = reports.filter((r) => r.status === 'error').length
  const skipped = reports.filter((r) => r.status === 'skipped').length
  const anyCritical = reports.some((r) => r.criticalCount > 0)

  let md = `# Audit Judge Corpus Report\n\n`
  md += `**Generated:** ${new Date().toISOString()}\n\n`
  md += `**Fixtures:** ${reports.length}  |  **Cache hits:** ${cacheHits}  |  **Errored:** ${errored}  |  **Skipped:** ${skipped}\n\n`
  md += `**Total Anthropic cost:** $${totalCost.toFixed(4)}\n\n`

  md += `## Summary\n\n`
  md += `| Fixture | Insurer | Status | Findings | Critical | Cost ($) |\n`
  md += `|---|---|---|---|---|---|\n`
  for (const r of reports) {
    md += `| ${r.fixtureId} | ${r.insurer} | ${r.status} | ${r.findingCount} | ${r.criticalCount} | ${(r.costUsd ?? 0).toFixed(4)} |\n`
  }
  md += `\n`

  for (const r of reports) {
    if (r.status === 'error' || r.status === 'skipped') {
      md += `## ⚠️ ${r.fixtureId}\n\nStatus: \`${r.status}\` — ${r.errorMessage ?? '(no message)'}\n\n`
      continue
    }
    if (!r.judgement) continue
    md += `## ${r.fixtureId} (${r.insurer})\n\n`
    md += `- Cache hit: ${r.judgement.cacheHit}\n`
    md += `- Typology hash: \`${r.judgement.typologyHash.slice(0, 16)}…\`\n`
    md += `- Findings: ${r.findingCount} (critical: ${r.criticalCount})\n\n`
    if (r.judgement.findings.length === 0) {
      md += `_No findings — extraction looks clean._\n\n`
      continue
    }
    md += `| Kind | Severity | Quote-verified | Message |\n`
    md += `|---|---|---|---|\n`
    for (const f of r.judgement.findings) {
      const msg = f.message.replace(/\|/g, '\\|').slice(0, 200)
      md += `| ${f.kind} | ${f.severity} | ${f.quoteVerified === false ? '❌' : '✓'} | ${msg} |\n`
    }
    md += `\n`
  }

  md += `## Verdict\n\n`
  md += anyCritical
    ? `❌ At least one fixture has critical findings. Review the report and address before merging.\n`
    : `✅ All fixtures clean. Safe to ship.\n`

  fs.writeFileSync(mdPath, md, 'utf8')
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!BASE_URL) {
    exitSetupError('Set SMOKE_BASE_URL (or PRODUCTION_SERVER_URL) to a running InsurAI server')
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    exitSetupError('ANTHROPIC_API_KEY not set — the audit judge cannot run without it')
  }
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    exitSetupError(
      'SUPABASE_URL not set — required for prompt cache + audit_judgements persistence'
    )
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    exitSetupError('SUPABASE_SERVICE_ROLE_KEY not set — required for audit_judgements writes')
  }

  const manifest = loadManifest()
  console.log(
    `[audit-judge-corpus] Running against ${manifest.fixtures.length} fixtures (BASE_URL=${BASE_URL})\n`
  )

  const reports: RunReport[] = []
  for (const fixture of manifest.fixtures) {
    process.stdout.write(`[audit-judge] ${fixture.fixtureId} … `)
    const t0 = Date.now()
    try {
      const r = await runOne(fixture)
      reports.push(r)
      const dt = ((Date.now() - t0) / 1000).toFixed(1)
      const tag =
        r.status === 'ok'
          ? `OK   findings=${r.findingCount} critical=${r.criticalCount}`
          : r.status === 'cache_hit'
            ? `HIT  findings=${r.findingCount} critical=${r.criticalCount}`
            : r.status === 'skipped'
              ? `SKIP ${r.errorMessage ?? ''}`
              : `ERR  ${r.errorMessage ?? ''}`
      console.log(`${tag}  (${dt}s)`)
    } catch (err) {
      console.log(`ERR  ${err instanceof Error ? err.message : String(err)}`)
      reports.push({
        fixtureId: fixture.fixtureId,
        insurer: fixture.insurer,
        status: 'error',
        criticalCount: 0,
        findingCount: 0,
        costUsd: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const reportsDir = path.resolve(process.cwd(), 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const mdPath = path.join(reportsDir, `judge-${ts}.md`)
  writeMarkdown(reports, mdPath)
  console.log(`\n[audit-judge-corpus] Report: ${mdPath}`)

  const anyCritical = reports.some((r) => r.criticalCount > 0)
  const anyErrored = reports.some((r) => r.status === 'error')
  process.exit(anyCritical || anyErrored ? 1 : 0)
}

// Cross-platform main() guard — `import.meta.url === \`file://${argv}\``
// silently no-ops on Windows due to backslash / triple-slash mismatch.
import { pathToFileURL } from 'node:url'
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
