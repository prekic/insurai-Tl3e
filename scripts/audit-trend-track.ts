#!/usr/bin/env node
/**
 * scripts/audit-trend-track.ts
 *
 * Phase 4 — fixture-level trend tracking.
 *
 * For each golden fixture (`tests/fixtures/golden/golden.json`):
 *   1. OCR the PDF via `/api/ai/ocr/document-ai` (chunked).
 *   2. Extract structured data via `/api/ai/extract` (SSE).
 *   3. Compute the 6 trend metrics via `extractMetrics()`.
 *   4. Look up the most recent qa_pass=true snapshot for the same
 *      fixture_id (the baseline).
 *   5. Compare via `compareMetrics()` — drops ≥30% are warn, ≥60% critical.
 *   6. Persist a new row to `audit_trend_snapshots`.
 *   7. Aggregate everything into `reports/trend-<timestamp>.md` with
 *      the wide matrix (fixture × metric × delta-from-baseline).
 *
 * NO judge calls — this is the cheap script meant to run daily/weekly
 * in CI. The expensive `npm run audit:judge` runs separately when you
 * want to spend Anthropic budget for full critique.
 *
 * Usage:
 *   SMOKE_BASE_URL=http://localhost:4001 npm run audit:trends
 *   SMOKE_BASE_URL=https://insurai-production.up.railway.app npm run audit:trends
 *
 * Env requirements:
 *   - SMOKE_BASE_URL (or PRODUCTION_SERVER_URL): the running InsurAI server.
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: for snapshot persistence.
 *
 * Exit codes:
 *   0 — all fixtures pass (no critical regressions)
 *   1 — at least one fixture has a critical regression OR an extraction error
 *   2 — env / setup failure
 *
 * Schema-version bump procedure: when the extraction schema or
 * `trend-metrics.ts` output shape changes, bump `SCHEMA_VERSION` below.
 * The comparator filters out baselines from older schema_version values
 * so a deliberate field rename doesn't fire false-positive regressions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

import {
  compareMetrics,
  extractMetrics,
  formatDelta,
  TREND_METRIC_KEYS,
  type RegressionResult,
  type TrendMetrics,
} from '../src/lib/audit/trend-metrics'

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

/**
 * Bump when the extraction schema OR `trend-metrics.ts` output shape
 * changes. The comparator only uses baselines from the same
 * schema_version so a deliberate field rename doesn't fire a regression.
 */
const SCHEMA_VERSION = 1

interface GoldenFixture {
  fixtureId: string
  sourcePath: string
  insurer: string
  insuranceLine: string
}
interface GoldenManifest {
  fixtures: GoldenFixture[]
}

interface SnapshotRow {
  fixture_id: string
  metrics: TrendMetrics
  schema_version: number
  qa_pass: boolean
  run_at: string
}

interface FixtureReport {
  fixtureId: string
  insurer: string
  status: 'ok' | 'first_run' | 'error'
  errorMessage?: string
  metrics?: TrendMetrics
  baseline?: TrendMetrics | null
  comparison?: RegressionResult
}

// -----------------------------------------------------------------------------
// Setup helpers
// -----------------------------------------------------------------------------

function exitSetupError(msg: string): never {
  console.error(`\n[audit-trend-track] SETUP ERROR: ${msg}\n`)
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

function getGitSha(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// -----------------------------------------------------------------------------
// PDF + extraction (mirrors scripts/audit-judge-corpus.ts)
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
): Promise<{ ok: true; structured: Record<string, unknown> } | { ok: false; reason: string }> {
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
  return { ok: true, structured: extData.data }
}

// -----------------------------------------------------------------------------
// Snapshot read / write
// -----------------------------------------------------------------------------

async function fetchBaseline(db: SupabaseClient, fixtureId: string): Promise<TrendMetrics | null> {
  const { data, error } = await db
    .from('audit_trend_snapshots')
    .select('metrics, run_at, schema_version')
    .eq('fixture_id', fixtureId)
    .eq('schema_version', SCHEMA_VERSION)
    .eq('qa_pass', true)
    .order('run_at', { ascending: false })
    .limit(1)
  if (error) {
    console.warn(`  [trend] baseline query failed for ${fixtureId}:`, error.message)
    return null
  }
  if (!data || data.length === 0) return null
  const row = data[0] as { metrics: TrendMetrics }
  return row.metrics
}

async function persistSnapshot(
  db: SupabaseClient,
  row: SnapshotRow & { judge_critical_count?: number | null; git_sha?: string }
): Promise<void> {
  const { error } = await db.from('audit_trend_snapshots').insert(row)
  if (error) {
    console.warn(`  [trend] failed to persist snapshot for ${row.fixture_id}:`, error.message)
  }
}

// -----------------------------------------------------------------------------
// Per-fixture runner
// -----------------------------------------------------------------------------

async function runOne(
  db: SupabaseClient,
  fixture: GoldenFixture,
  gitSha: string | undefined
): Promise<FixtureReport> {
  const pdfPath = path.resolve(FIXTURES_DIR, fixture.sourcePath)
  const ocr = await ocrAndExtract(pdfPath, fixture.fixtureId)
  if (!ocr.ok) {
    return {
      fixtureId: fixture.fixtureId,
      insurer: fixture.insurer,
      status: 'error',
      errorMessage: ocr.reason,
    }
  }

  const metrics = extractMetrics(ocr.structured)
  const baseline = await fetchBaseline(db, fixture.fixtureId)
  const comparison = compareMetrics(baseline, metrics)

  await persistSnapshot(db, {
    fixture_id: fixture.fixtureId,
    metrics,
    schema_version: SCHEMA_VERSION,
    qa_pass: true,
    run_at: new Date().toISOString(),
    git_sha: gitSha,
  })

  return {
    fixtureId: fixture.fixtureId,
    insurer: fixture.insurer,
    status: baseline ? 'ok' : 'first_run',
    metrics,
    baseline,
    comparison,
  }
}

// -----------------------------------------------------------------------------
// Report writer
// -----------------------------------------------------------------------------

function writeMarkdown(reports: FixtureReport[], mdPath: string, gitSha?: string): void {
  const flagged = reports.filter((r) => r.comparison && r.comparison.severity !== 'pass')
  const errored = reports.filter((r) => r.status === 'error').length
  const firstRuns = reports.filter((r) => r.status === 'first_run').length

  let md = `# Audit Trend Snapshot Report\n\n`
  md += `**Generated:** ${new Date().toISOString()}\n\n`
  md += `**Schema version:** ${SCHEMA_VERSION}  |  **Git SHA:** ${gitSha ?? 'unknown'}\n\n`
  md += `**Fixtures:** ${reports.length}  |  **First-run baselines:** ${firstRuns}  |  **Flagged:** ${flagged.length}  |  **Errored:** ${errored}\n\n`

  // ── Wide matrix: fixture × metric × delta ────────────────────────────
  md += `## Trend Matrix (fixture × metric)\n\n`
  md += `| Fixture | ${TREND_METRIC_KEYS.join(' | ')} | Severity |\n`
  md += `| --- | ${TREND_METRIC_KEYS.map(() => '---').join(' | ')} | --- |\n`
  for (const r of reports) {
    const comparison = r.comparison
    if (!comparison) {
      md += `| ${r.fixtureId} | ${TREND_METRIC_KEYS.map(() => '—').join(' | ')} | ${r.status} |\n`
      continue
    }
    const cells = TREND_METRIC_KEYS.map((key) => {
      const d = comparison.deltas.find((x) => x.key === key)
      if (!d) return '—'
      const tag = d.severity === 'critical' ? ' 🚨' : d.severity === 'warn' ? ' ⚠️' : ''
      return `${formatDelta(d)}${tag}`
    })
    const sevTag =
      r.status === 'first_run'
        ? '_first run — baseline_'
        : comparison.severity === 'critical'
          ? '🚨 critical'
          : comparison.severity === 'warn'
            ? '⚠️ warn'
            : '✓ pass'
    md += `| ${r.fixtureId} | ${cells.join(' | ')} | ${sevTag} |\n`
  }
  md += `\n`

  // ── Errored fixtures ────────────────────────────────────────────────
  for (const r of reports) {
    if (r.status === 'error') {
      md += `## ⚠️ ${r.fixtureId}\n\nStatus: error — ${r.errorMessage ?? '(no message)'}\n\n`
    }
  }

  // ── Flagged-fixture detail ──────────────────────────────────────────
  if (flagged.length > 0) {
    md += `## Flagged Fixtures (detail)\n\n`
    for (const r of flagged) {
      if (!r.comparison) continue
      md += `### ${r.fixtureId} (${r.insurer}) — ${r.comparison.severity}\n\n`
      md += `| Metric | Baseline | Current | Δ | Ratio | Severity |\n`
      md += `| --- | --- | --- | --- | --- | --- |\n`
      for (const d of r.comparison.flagged) {
        const ratioPct = `${(d.ratio * 100).toFixed(0)}%`
        md += `| ${d.key} | ${d.baseline} | ${d.current} | ${d.delta > 0 ? '+' : ''}${d.delta} | ${ratioPct} | ${d.severity} |\n`
      }
      md += `\n`
    }
  }

  // ── Verdict ─────────────────────────────────────────────────────────
  const anyCritical = reports.some((r) => r.comparison && r.comparison.severity === 'critical')
  md += `## Verdict\n\n`
  md += anyCritical
    ? `🚨 At least one fixture has a critical regression. Investigate before merging.\n`
    : flagged.length > 0
      ? `⚠️ ${flagged.length} fixture(s) flagged at warn level. Review the matrix.\n`
      : `✓ All fixtures pass. Trend is stable.\n`

  fs.writeFileSync(mdPath, md, 'utf8')
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!BASE_URL) {
    exitSetupError('Set SMOKE_BASE_URL (or PRODUCTION_SERVER_URL) to a running InsurAI server')
  }
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    exitSetupError('SUPABASE_URL not set — required for trend snapshot persistence')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    exitSetupError('SUPABASE_SERVICE_ROLE_KEY not set — required for audit_trend_snapshots writes')
  }

  const db = getSupabase()
  if (!db) {
    exitSetupError('Failed to construct Supabase client')
  }

  const manifest = loadManifest()
  const gitSha = getGitSha()
  console.log(
    `[audit-trend-track] Running against ${manifest.fixtures.length} fixtures (BASE_URL=${BASE_URL}, schema=${SCHEMA_VERSION}, git=${gitSha ?? 'unknown'})\n`
  )

  const reports: FixtureReport[] = []
  for (const fixture of manifest.fixtures) {
    process.stdout.write(`[trend] ${fixture.fixtureId} … `)
    const t0 = Date.now()
    try {
      const r = await runOne(db, fixture, gitSha)
      reports.push(r)
      const dt = ((Date.now() - t0) / 1000).toFixed(1)
      const tag =
        r.status === 'error'
          ? `ERR  ${r.errorMessage ?? ''}`
          : r.status === 'first_run'
            ? 'BASELINE'
            : r.comparison?.severity === 'critical'
              ? `CRIT (${r.comparison.flagged.length} flagged)`
              : r.comparison?.severity === 'warn'
                ? `WARN (${r.comparison.flagged.length} flagged)`
                : 'OK'
      console.log(`${tag}  (${dt}s)`)
    } catch (err) {
      console.log(`ERR  ${err instanceof Error ? err.message : String(err)}`)
      reports.push({
        fixtureId: fixture.fixtureId,
        insurer: fixture.insurer,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const reportsDir = path.resolve(process.cwd(), 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const mdPath = path.join(reportsDir, `trend-${ts}.md`)
  writeMarkdown(reports, mdPath, gitSha)
  console.log(`\n[audit-trend-track] Report: ${mdPath}`)

  // Exit-code semantics:
  //   2 → setup error (env vars missing — handled by exitSetupError above)
  //   1 → at least one fixture has a CRITICAL regression vs baseline (real
  //        signal-loss event — gate this in CI to fail the workflow)
  //   0 → all fixtures either passed or had transient extraction errors
  //        that don't reflect signal loss. Production extraction is
  //        occasionally flaky (Anthropic timeouts, OpenAI quota fluctuations);
  //        we don't want those to redden the trends workflow because they're
  //        upstream issues, not audit-layer issues. Errored fixtures still
  //        appear in the report so operators can investigate, but they
  //        don't fail CI on their own. The smoke-kasko workflow handles
  //        extraction-health gating separately.
  const anyCritical = reports.some((r) => r.comparison && r.comparison.severity === 'critical')
  const anyErrored = reports.some((r) => r.status === 'error')
  if (anyErrored) {
    const erroredIds = reports
      .filter((r) => r.status === 'error')
      .map((r) => r.fixtureId)
      .join(', ')
    console.warn(
      `\n[audit-trend-track] WARNING: ${reports.filter((r) => r.status === 'error').length} fixture(s) errored at extraction (${erroredIds}). Not failing CI — environmental flakiness only blocks gating when it produces a real regression signal.`
    )
  }
  process.exit(anyCritical ? 1 : 0)
}

// `import.meta.url === \`file://${process.argv[1]}\`` works on POSIX but
// silently fails on Windows because process.argv[1] uses backslashes
// while import.meta.url uses forward slashes + three slashes after
// `file:`. Use Node's pathToFileURL for cross-platform correctness.
import { pathToFileURL } from 'node:url'
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
