/**
 * Captures pipeline output under the CURRENT pipeline state as of the
 * capture date. This is NOT a pre-wrap baseline. The output reflects the
 * full pipeline including Stage 2 orchestrator with adapter-driven
 * required coverage injection.
 *
 * Use this artifact as a reference point for "what the pipeline produces
 * today" — not as evidence of any property of pre-wrap behavior.
 */

/**
 * Runtime dependencies:
 * - Server must be running at SMOKE_BASE_URL (default http://localhost:3000)
 * - Server must have access to Anthropic API and Document AI credentials
 * - SKIP_AI_RATE_LIMIT=true must be set on the server to avoid 429s
 *
 * Run from repo root:
 *   tsx scripts/capture-internal-current-baseline.ts
 *
 * Output: tests/fixtures/baseline/internal-current/<fixture>.json (5 files)
 */
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

const FIXTURES_DIR = path.resolve('tests/fixtures/kasko')
const BASELINE_DIR = path.resolve('tests/fixtures/baseline/internal-current')
const _RUNS = 1 // one run per fixture; kept for documentation
const REQUEST_TIMEOUT_MS = 180_000
const DOCUMENT_AI_PAGE_LIMIT = 10

const FIXTURES = [
  'anadolu-volkswagen-golf.pdf',
  'anadolu-volkswagen-tiguan.pdf',
  'anadolu-renault-clio.pdf',
  'anadolu-birlesik-kasko.pdf',
  'allianz-peugeot.pdf',
]

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

  const sourceSha = createHash('sha256').update(pdfBytes).digest('hex')
  const total = chunks.length

  let combined = ''
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const documentBase64 = Buffer.from(chunk).toString('base64')
    const cacheKey = `${sourceSha}:${i}/${total}`
    const res = await fetch(`${baseUrl}/api/ai/ocr/document-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentBase64, cacheKey }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(`OCR failed: ${res.status}`)
    }
    const json = (await res.json()) as any
    if (!json.success || !json.data?.text) {
      throw new Error(`OCR returned non-success: ${json.error ?? 'empty text'}`)
    }
    combined += json.data.text + '\n'
  }
  return combined
}

async function extractOnce(baseUrl: string, documentText: string): Promise<any> {
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
    throw new Error(`Extract returned no data SSE event.`)
  }
  return JSON.parse(lastPayload)
}

async function main() {
  const baseUrl =
    process.env.SMOKE_BASE_URL ?? process.env.PRODUCTION_SERVER_URL ?? 'http://localhost:3000'
  const captureDate = new Date().toISOString()
  const headCommit = execSync('git rev-parse HEAD').toString().trim()

  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true })
  }

  for (const fixture of FIXTURES) {
    const fixturePath = path.join(FIXTURES_DIR, fixture)
    if (!fs.existsSync(fixturePath)) {
      console.warn(`[WARN] Fixture not found: ${fixturePath}`)
      continue
    }

    console.log(`Processing fixture: ${fixture}`)
    const pdfBytes = new Uint8Array(fs.readFileSync(fixturePath))
    console.log(`  OCR...`)
    const documentText = await chunkAndOcr(baseUrl, pdfBytes)

    console.log(`  Run 1/1...`)
    let extraction: any = null
    try {
      extraction = await extractOnce(baseUrl, documentText)
    } catch (err: any) {
      console.error(`  Run failed:`, err.message)
      extraction = { error: err.message }
    }

    const output = {
      _metadata: {
        captureDate,
        captureType: 'internal-current',
        pipelineState: 'post-orchestrator with enforce:true overrides',
        temperature: 0.1,
        headCommit,
        warning:
          'NOT a pre-wrap baseline. Reflects current pipeline state including all Phase 1 Wrap modifications.',
      },
      extraction,
    }

    const outPath = path.join(BASELINE_DIR, `${fixture}.json`)
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2))
    console.log(`  Saved to ${outPath}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
