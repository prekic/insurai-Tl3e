import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

const FIXTURES_DIR = path.resolve('tests/fixtures/kasko')
const BASELINE_DIR = path.resolve('tests/fixtures/baseline/T0')
const RUNS = 3
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

    const runsData = []
    for (let i = 1; i <= RUNS; i++) {
      console.log(`  Run ${i}/${RUNS}...`)
      try {
        const result = await extractOnce(baseUrl, documentText)
        runsData.push(result)
      } catch (err: any) {
        console.error(`  Run ${i} failed:`, err.message)
        runsData.push({ error: err.message })
      }
    }

    const baselineData = { fixture, documentTextLength: documentText.length, runs: runsData }
    const outPath = path.join(BASELINE_DIR, `${fixture}.json`)
    fs.writeFileSync(outPath, JSON.stringify(baselineData, null, 2))
    console.log(`  Saved to ${outPath}`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
