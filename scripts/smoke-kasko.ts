#!/usr/bin/env node
/**
 * Kasko Vehicle Extraction Smoke Test
 *
 * For each PDF fixture in tests/fixtures/kasko/:
 *   1. Split into ≤10-page chunks via pdf-lib (Document AI's hard limit)
 *   2. Base64-encode each chunk
 *   3. POST to {SMOKE_BASE_URL}/api/ai/ocr/document-ai → text per chunk
 *   4. Concatenate text across chunks
 *   5. POST to {SMOKE_BASE_URL}/api/ai/extract (SSE keepalive) → ExtractedPolicyData
 *   6. Assert data.vehicleMake / .vehicleModel are populated and match expected
 *
 * Direct extraction-quality smoke — does NOT exercise the persistence layer
 * (route tests cover that). Verifies that the production AI pipeline returns
 * vehicle make/model for real Turkish kasko policies, including multi-page
 * fleet PDFs that exceed Document AI's 15-page limit.
 *
 * Required env vars:
 *   SMOKE_BASE_URL   — origin of the production server. Falls back to
 *                      PRODUCTION_SERVER_URL if SMOKE_BASE_URL is unset.
 *
 * Exit codes:
 *   0  pass rate ≥ PASS_THRESHOLD (skipped fixtures excluded from denominator)
 *   1  pass rate < PASS_THRESHOLD
 *   2  setup error (missing env, no fixtures, manifest unparseable)
 *
 * See tests/fixtures/kasko/README.md for fixture conventions.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

const PASS_THRESHOLD = 80
const REQUEST_TIMEOUT_MS = 180_000 // SSE keepalive holds the connection; AI extractions land 60-120s
const FIXTURES_DIR = path.resolve('tests/fixtures/kasko')

// Mirrors src/lib/ai/pdf-splitter.ts DOCUMENT_AI_PAGE_LIMIT — keep in sync.
// Production reduced this from the documented 15 to 10 to avoid 20MB payload
// 403s on dense PDFs (see pdf-splitter.ts line 11).
const DOCUMENT_AI_PAGE_LIMIT = 10

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
  status: 'pass' | 'fail' | 'skip'
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

/**
 * POST with Accept: text/event-stream. The /api/ai/extract endpoint streams
 * `:keepalive` comments every 10s while the AI runs (Railway has a 30s edge
 * timeout) and then sends one final `data: <json>` SSE event with the result.
 */
async function postSse<T>(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await res.text()
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, raw }
    }
    // Pull the last `data: ...` line and parse its JSON payload.
    const lines = raw.split(/\r?\n/)
    let payload: T | null = null
    let last = ''
    for (const line of lines) {
      if (line.startsWith('data:')) {
        last = line.slice(5).trim()
      }
    }
    if (last) {
      try {
        payload = JSON.parse(last) as T
      } catch {
        payload = null
      }
    } else {
      // Fallback: server didn't honor the Accept header and returned plain JSON
      try {
        payload = JSON.parse(raw) as T
      } catch {
        payload = null
      }
    }
    return { ok: true, status: res.status, data: payload, raw }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Split a PDF into ≤DOCUMENT_AI_PAGE_LIMIT-page chunks using pdf-lib. Mirrors
 * the splitting logic in src/lib/ai/pdf-splitter.ts so the smoke can exercise
 * multi-page fleet PDFs that exceed Document AI's hard limit. Returns the
 * original buffer in a single-element array when no split is needed.
 */
async function splitPdfBuffer(pdfBuffer: Buffer): Promise<Uint8Array[]> {
  const sourceBytes = new Uint8Array(pdfBuffer)
  const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true })
  const totalPages = sourceDoc.getPageCount()
  if (totalPages <= DOCUMENT_AI_PAGE_LIMIT) {
    return [sourceBytes]
  }
  const chunks: Uint8Array[] = []
  const numChunks = Math.ceil(totalPages / DOCUMENT_AI_PAGE_LIMIT)
  for (let i = 0; i < numChunks; i++) {
    const start = i * DOCUMENT_AI_PAGE_LIMIT
    const end = Math.min(start + DOCUMENT_AI_PAGE_LIMIT, totalPages)
    const chunkDoc = await PDFDocument.create()
    const indices = Array.from({ length: end - start }, (_, idx) => start + idx)
    const copied = await chunkDoc.copyPages(sourceDoc, indices)
    for (const page of copied) chunkDoc.addPage(page)
    chunks.push(await chunkDoc.save())
  }
  return chunks
}

async function ocrChunk(baseUrl: string, chunk: Uint8Array): Promise<string> {
  const documentBase64 = Buffer.from(chunk).toString('base64')
  const result = await postJson<{ success: boolean; data?: { text?: string }; error?: string }>(
    `${baseUrl}/api/ai/ocr/document-ai`,
    { documentBase64 },
    REQUEST_TIMEOUT_MS
  )
  if (!result.ok || !result.data?.success) {
    const errMsg = result.data?.error ?? result.raw.slice(0, 200)
    throw new Error(`OCR failed: HTTP ${result.status} — ${errMsg}`)
  }
  const text = result.data.data?.text ?? ''
  if (!text.trim()) throw new Error('OCR returned empty text')
  return text
}

async function ocrPdf(baseUrl: string, pdfBuffer: Buffer): Promise<string> {
  const chunks = await splitPdfBuffer(pdfBuffer)
  if (chunks.length === 1) {
    return ocrChunk(baseUrl, chunks[0])
  }
  console.log(`    (splitting into ${chunks.length} chunks of ≤${DOCUMENT_AI_PAGE_LIMIT} pages)`)
  const texts: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = await ocrChunk(baseUrl, chunks[i])
    texts.push(chunkText)
  }
  // Join with a page-marker separator so layout-sensitive regex anchors in the
  // extractor (e.g. "Marka :", "Plaka :") don't accidentally match across the
  // boundary between two chunks.
  return texts.join('\n\n[PAGE BREAK]\n\n')
}

async function extractUnified(
  baseUrl: string,
  documentText: string
): Promise<Record<string, unknown>> {
  const result = await postSse<{
    success: boolean
    data?: Record<string, unknown>
    error?: string
  }>(`${baseUrl}/api/ai/extract`, { documentText, policyType: 'kasko' }, REQUEST_TIMEOUT_MS)
  if (!result.ok || !result.data?.success || !result.data.data) {
    const errMsg = result.data?.error ?? result.raw.slice(0, 200)
    throw new Error(`Extract failed: HTTP ${result.status} — ${errMsg}`)
  }
  return result.data.data
}

function checkExtraction(extractedData: Record<string, unknown>, fixture: Fixture): FixtureResult {
  // The /api/ai/extract response uses FLAT top-level fields per the canonical
  // EXTRACTION_JSON_SCHEMA (vehicleMake, vehicleModel, vehicleYear, vehiclePlate),
  // NOT a nested `vehicle: { make, model }` object. The comprehensive parser
  // uses the nested shape, but that's a different code path.
  const make = typeof extractedData.vehicleMake === 'string' ? extractedData.vehicleMake : ''
  const model = typeof extractedData.vehicleModel === 'string' ? extractedData.vehicleModel : ''
  const qs = extractedData.qualityScore as Record<string, unknown> | undefined
  const confidence = typeof qs?.total === 'number' ? qs.total : 0
  const extracted: ExtractedValues = { make, model, confidence }

  if (!make.trim()) {
    return { fixture, status: 'fail', reason: 'vehicleMake is empty', extracted }
  }
  if (!model.trim()) {
    return { fixture, status: 'fail', reason: 'vehicleModel is empty', extracted }
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
  // splitPdfBuffer in ocrPdf handles the Document AI 15-page hard limit by
  // mirroring src/lib/ai/pdf-splitter.ts. No 'skip' path needed any more —
  // multi-page fleet PDFs are now first-class fixtures.
  const text = await ocrPdf(baseUrl, pdfBuffer)
  const extractedData = await extractUnified(baseUrl, text)
  return checkExtraction(extractedData, fixture)
}

async function main(): Promise<void> {
  console.log('► Kasko vehicle extraction smoke test')
  const baseUrl = getBaseUrl()
  console.log(`► Target: ${baseUrl}`)

  const fixtures = loadFixtures()
  console.log(`► Loaded ${fixtures.length} fixture(s) from ${FIXTURES_DIR}`)
  console.log(`► Pass threshold: ${PASS_THRESHOLD}% (skipped fixtures excluded from denominator)`)

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
      } else if (result.status === 'skip') {
        console.log(`  ⊘ skip: ${result.reason}`)
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
  const skipped = results.filter((r) => r.status === 'skip').length
  const evaluated = results.length - skipped
  const passRate = evaluated > 0 ? (passed / evaluated) * 100 : 0
  console.log('\n━ Summary')
  console.log(`  ${passed}/${evaluated} pass (${passRate.toFixed(1)}%) — skipped ${skipped}`)
  console.log(`  Threshold: ${PASS_THRESHOLD}% — ${passRate >= PASS_THRESHOLD ? 'PASS' : 'FAIL'}`)

  process.exit(passRate >= PASS_THRESHOLD ? 0 : 1)
}

main().catch((err) => {
  console.error('✗ Fatal error:', err instanceof Error ? err.stack : err)
  process.exit(2)
})
