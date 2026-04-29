#!/usr/bin/env node
/**
 * Kasko Vehicle Extraction Smoke Test
 *
 * For each PDF fixture in tests/fixtures/kasko/:
 *   1. Base64-encode the PDF
 *   2. POST to {SMOKE_BASE_URL}/api/ai/ocr/document-ai → text
 *   3. POST to {SMOKE_BASE_URL}/api/ai/extract/anthropic → ExtractedPolicyData
 *   4. Assert data.vehicle.make / .model are populated and match expected
 *
 * Direct extraction-quality smoke — does NOT exercise the persistence layer
 * (route tests cover that). Verifies that the production AI pipeline,
 * including the prompt mandate from PR #399, returns vehicle.make/.model
 * for real Turkish kasko policies.
 *
 * Required env vars:
 *   SMOKE_BASE_URL   — origin of the production server (e.g.
 *                      https://insurai-production.up.railway.app). Falls
 *                      back to PRODUCTION_SERVER_URL if SMOKE_BASE_URL
 *                      is unset.
 *
 * Exit codes:
 *   0  pass rate ≥ PASS_THRESHOLD
 *   1  pass rate < PASS_THRESHOLD
 *   2  setup error (missing env, no fixtures, manifest unparseable)
 *
 * See tests/fixtures/kasko/README.md for fixture conventions.
 */
import fs from 'node:fs'
import path from 'node:path'

const PASS_THRESHOLD = 80
const REQUEST_TIMEOUT_MS = 90_000
const FIXTURES_DIR = path.resolve('tests/fixtures/kasko')

interface Fixture {
  file: string
  expectedMake: string
  expectedModel?: string
  insurer: string
  notes?: string
}

interface FixturesManifest {
  fixtures: Fixture[]
}

interface ExtractedValues {
  make: string
  model: string
  confidence: number
}

interface FixtureResult {
  fixture: Fixture
  status: 'pass' | 'fail'
  reason?: string
  extracted?: ExtractedValues
}

function exitSetupError(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(2)
}

function getBaseUrl(): string {
  const v = process.env.SMOKE_BASE_URL || process.env.PRODUCTION_SERVER_URL
  if (!v || !v.trim()) {
    exitSetupError(
      'Missing env var: set SMOKE_BASE_URL or PRODUCTION_SERVER_URL ' +
        '(e.g. https://insurai-production.up.railway.app)'
    )
  }
  return v.replace(/\/+$/, '')
}

function loadFixtures(): Fixture[] {
  if (!fs.existsSync(FIXTURES_DIR)) {
    exitSetupError(
      `Fixture directory not found: ${FIXTURES_DIR}\n` +
        `  Create it and add PDFs per tests/fixtures/kasko/README.md.`
    )
  }
  const manifestPath = path.join(FIXTURES_DIR, 'fixtures.json')
  if (!fs.existsSync(manifestPath)) {
    exitSetupError(
      `Manifest not found: ${manifestPath}\n` +
        `  See tests/fixtures/kasko/README.md for the format.`
    )
  }
  let manifest: FixturesManifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    exitSetupError(
      `Failed to parse fixtures.json: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) {
    exitSetupError('fixtures.json has no fixtures. Add at least one entry.')
  }

  const present: Fixture[] = []
  const missing: string[] = []
  for (const f of manifest.fixtures) {
    if (!f.file || !f.expectedMake || !f.insurer) {
      console.warn(`⚠ Skipping malformed fixture entry: ${JSON.stringify(f)}`)
      continue
    }
    const pdfPath = path.join(FIXTURES_DIR, f.file)
    if (fs.existsSync(pdfPath)) {
      present.push(f)
    } else {
      missing.push(f.file)
    }
  }
  if (missing.length > 0) {
    console.warn(`⚠ Skipping ${missing.length} fixture(s) — PDFs missing: ${missing.join(', ')}`)
  }
  if (present.length === 0) {
    exitSetupError(
      `No fixture PDFs found in ${FIXTURES_DIR}.\n` +
        `  fixtures.json references files that don't exist on disk.\n` +
        `  See tests/fixtures/kasko/README.md.`
    )
  }
  return present
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await res.text()
    let data: T | null = null
    try {
      data = JSON.parse(raw) as T
    } catch {
      data = null
    }
    return { ok: res.ok, status: res.status, data, raw }
  } finally {
    clearTimeout(timer)
  }
}

async function ocrPdf(baseUrl: string, pdfBuffer: Buffer): Promise<string> {
  const documentBase64 = pdfBuffer.toString('base64')
  const result = await postJson<{ success: boolean; data?: { text?: string }; error?: string }>(
    `${baseUrl}/api/ai/ocr/document-ai`,
    { documentBase64 },
    REQUEST_TIMEOUT_MS
  )
  if (!result.ok || !result.data?.success) {
    throw new Error(
      `OCR failed: HTTP ${result.status} — ${result.data?.error ?? result.raw.slice(0, 200)}`
    )
  }
  const text = result.data.data?.text ?? ''
  if (!text.trim()) throw new Error('OCR returned empty text')
  return text
}

async function extractAnthropic(
  baseUrl: string,
  documentText: string
): Promise<Record<string, unknown>> {
  const result = await postJson<{
    success: boolean
    data?: Record<string, unknown>
    error?: string
  }>(
    `${baseUrl}/api/ai/extract/anthropic`,
    { documentText, policyType: 'kasko' },
    REQUEST_TIMEOUT_MS
  )
  if (!result.ok || !result.data?.success || !result.data.data) {
    throw new Error(
      `Extract failed: HTTP ${result.status} — ${result.data?.error ?? result.raw.slice(0, 200)}`
    )
  }
  return result.data.data
}

function checkExtraction(extractedData: Record<string, unknown>, fixture: Fixture): FixtureResult {
  const vehicle = extractedData.vehicle as Record<string, unknown> | null | undefined
  const make = typeof vehicle?.make === 'string' ? vehicle.make : ''
  const model = typeof vehicle?.model === 'string' ? vehicle.model : ''
  const qs = extractedData.qualityScore as Record<string, unknown> | undefined
  const confidence = typeof qs?.total === 'number' ? qs.total / 100 : 0
  const extracted: ExtractedValues = { make, model, confidence }

  if (!make.trim()) {
    return { fixture, status: 'fail', reason: 'data.vehicle.make is empty', extracted }
  }
  if (!model.trim()) {
    return { fixture, status: 'fail', reason: 'data.vehicle.model is empty', extracted }
  }
  if (!make.toLowerCase().includes(fixture.expectedMake.toLowerCase())) {
    return {
      fixture,
      status: 'fail',
      reason: `make mismatch: expected "${fixture.expectedMake}", got "${make}"`,
      extracted,
    }
  }
  if (fixture.expectedModel && !model.toLowerCase().includes(fixture.expectedModel.toLowerCase())) {
    return {
      fixture,
      status: 'fail',
      reason: `model mismatch: expected "${fixture.expectedModel}", got "${model}"`,
      extracted,
    }
  }
  return { fixture, status: 'pass', extracted }
}

async function runFixture(baseUrl: string, fixture: Fixture): Promise<FixtureResult> {
  const pdfPath = path.join(FIXTURES_DIR, fixture.file)
  const pdfBuffer = fs.readFileSync(pdfPath)
  const text = await ocrPdf(baseUrl, pdfBuffer)
  const extractedData = await extractAnthropic(baseUrl, text)
  return checkExtraction(extractedData, fixture)
}

async function main(): Promise<void> {
  console.log('► Kasko vehicle extraction smoke test')
  const baseUrl = getBaseUrl()
  console.log(`► Target: ${baseUrl}`)

  const fixtures = loadFixtures()
  console.log(`► Loaded ${fixtures.length} fixture(s) from ${FIXTURES_DIR}`)
  console.log(`► Pass threshold: ${PASS_THRESHOLD}%`)

  const results: FixtureResult[] = []

  for (const fixture of fixtures) {
    console.log(
      `\n┄ ${fixture.insurer} (${fixture.file}) — expecting make ~ "${fixture.expectedMake}"`
    )
    try {
      const result = await runFixture(baseUrl, fixture)
      results.push(result)
      if (result.status === 'pass' && result.extracted) {
        console.log(
          `  ✓ make="${result.extracted.make}" model="${result.extracted.model}" confidence=${result.extracted.confidence.toFixed(2)}`
        )
      } else {
        console.log(`  ✗ ${result.reason}`)
        if (result.extracted) {
          console.log(`    extracted: ${JSON.stringify(result.extracted)}`)
        }
      }
    } catch (err) {
      const reason = `exception: ${err instanceof Error ? err.message : String(err)}`
      results.push({ fixture, status: 'fail', reason })
      console.log(`  ✗ ${reason}`)
    }
  }

  const passed = results.filter((r) => r.status === 'pass').length
  const total = results.length
  const passRate = total > 0 ? (passed / total) * 100 : 0
  console.log('\n━ Summary')
  console.log(`  ${passed}/${total} pass (${passRate.toFixed(1)}%)`)
  console.log(`  Threshold: ${PASS_THRESHOLD}% — ${passRate >= PASS_THRESHOLD ? 'PASS' : 'FAIL'}`)

  process.exit(passRate >= PASS_THRESHOLD ? 0 : 1)
}

main().catch((err) => {
  console.error('✗ Fatal error:', err instanceof Error ? err.stack : err)
  process.exit(2)
})
