/**
 * Pre-flight experiment: Capture baseline at strict T=0.
 * Runs 5 fixtures × 3 runs each, saves to tests/fixtures/baseline/T0_strict/
 * Then compares runs for byte-level identity.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

const FIXTURES_DIR = path.resolve('tests/fixtures/kasko')
const BASELINE_DIR = path.resolve('tests/fixtures/baseline/T0_strict')
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
    process.env.SMOKE_BASE_URL ?? process.env.PRODUCTION_SERVER_URL ?? 'http://localhost:4001'

  // Verify temperature is 0
  console.log(`[Pre-flight] Verifying temperature=0 at ${baseUrl}...`)
  const configRes = await fetch(`${baseUrl}/api/config/ai`)
  const configData = (await configRes.json()) as any
  const currentTemp = configData?.data?.temperature
  console.log(`[Pre-flight] Current temperature: ${currentTemp}`)
  if (currentTemp !== 0) {
    console.error(`[ABORT] Temperature is ${currentTemp}, not 0. Set it to 0 first.`)
    process.exit(1)
  }

  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true })
  }

  for (const fixture of FIXTURES) {
    const fixturePath = path.join(FIXTURES_DIR, fixture)
    if (!fs.existsSync(fixturePath)) {
      console.warn(`[WARN] Fixture not found: ${fixturePath}`)
      continue
    }

    console.log(`\nProcessing fixture: ${fixture}`)
    const pdfBytes = new Uint8Array(fs.readFileSync(fixturePath))
    console.log(`  OCR... (cached)`)
    const documentText = await chunkAndOcr(baseUrl, pdfBytes)

    const runsData = []
    for (let i = 1; i <= RUNS; i++) {
      console.log(`  Run ${i}/${RUNS}...`)
      const startMs = Date.now()
      try {
        const result = await extractOnce(baseUrl, documentText)
        const elapsedMs = Date.now() - startMs
        console.log(`    ✓ Completed in ${elapsedMs}ms`)
        runsData.push(result)
      } catch (err: any) {
        console.error(`    ✗ Run ${i} failed:`, err.message)
        runsData.push({ error: err.message })
      }
    }

    const baselineData = {
      fixture,
      temperature: 0,
      documentTextLength: documentText.length,
      runs: runsData,
    }
    const outPath = path.join(BASELINE_DIR, `${fixture}.json`)
    fs.writeFileSync(outPath, JSON.stringify(baselineData, null, 2))
    console.log(`  Saved to ${outPath}`)
  }

  // Variance analysis
  console.log('\n\n=== STRICT T=0 VARIANCE ANALYSIS ===\n')
  const files = fs.readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, file), 'utf8'))
    const runs = data.runs.filter((r: any) => !r.error)
    if (runs.length < 2) {
      console.log(`${data.fixture}: INSUFFICIENT RUNS (${runs.length} successful)`)
      continue
    }

    // Normalize: strip non-deterministic metadata
    const normalize = (d: any) => {
      const clone = JSON.parse(JSON.stringify(d))
      delete clone.usage
      delete clone.cost
      delete clone.requestId
      delete clone.elapsedMs
      delete clone.phaseTiming
      delete clone.model
      delete clone.provider
      delete clone.route
      delete clone.fallback
      delete clone.fallbackReason
      delete clone.fallbackChain
      delete clone.serverPhaseTiming
      delete clone.serverElapsedMs
      return JSON.stringify(clone.data, null, 0)
    }

    const normalized = runs.map(normalize)
    const allIdentical = normalized.every((n: string) => n === normalized[0])

    if (allIdentical) {
      console.log(`${data.fixture}: ✅ IDENTICAL across ${runs.length} runs`)
    } else {
      // Deep diff
      for (let i = 1; i < normalized.length; i++) {
        if (normalized[i] !== normalized[0]) {
          const a = JSON.parse(normalized[0])
          const b = JSON.parse(normalized[i])
          const diffs: string[] = []
          function findDiffs(obj1: any, obj2: any, path: string) {
            const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})])
            for (const k of keys) {
              const fullPath = path ? `${path}.${k}` : k
              const v1 = obj1?.[k]
              const v2 = obj2?.[k]
              if (JSON.stringify(v1) !== JSON.stringify(v2)) {
                if (
                  typeof v1 === 'object' &&
                  typeof v2 === 'object' &&
                  v1 !== null &&
                  v2 !== null &&
                  !Array.isArray(v1)
                ) {
                  findDiffs(v1, v2, fullPath)
                } else {
                  diffs.push(fullPath)
                }
              }
            }
          }
          findDiffs(a, b, '')
          console.log(`${data.fixture}: ❌ run0 vs run${i}: ${diffs.length} field diffs`)
          for (const d of diffs.slice(0, 15)) {
            const v1 = JSON.stringify(eval(`a?.${d.split('.').join('?.')}`)).slice(0, 80)
            const v2 = JSON.stringify(eval(`b?.${d.split('.').join('?.')}`)).slice(0, 80)
            console.log(`    ${d}:`)
            console.log(`      run0: ${v1}`)
            console.log(`      run${i}: ${v2}`)
          }
          if (diffs.length > 15) console.log(`    ... and ${diffs.length - 15} more`)
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
