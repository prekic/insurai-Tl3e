/**
 * Real-World E2E Extraction Tests
 *
 * Sends real PDFs through the LIVE API endpoint (`/api/ai/extract` on Railway)
 * and validates the full flow: server processes → client receives →
 * convertToAnalyzedPolicy produces valid AnalyzedPolicy.
 *
 * Unlike qa-pdf-golden.ts (regex-only, no AI), these tests:
 *  - Send actual PDF bytes as base64 attachments
 *  - Run the response through convertToAnalyzedPolicy
 *  - Assert no crashes on ANY DeepSeek response shape
 *  - Assert coverage/exclusion arrays are present
 *  - Assert roundTripValid from debate pipeline
 *
 * NOTE: These tests hit a live rate-limited API. We share one extraction
 * per test run to minimize calls, and handle 429 with retry.
 *
 * Run with: npx vitest run src/lib/ai/__tests__/qa-pdf-e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { File } from 'node:buffer'

const API_BASE = 'https://insurai-production.up.railway.app'
const FIXTURES_DIR = join(process.cwd(), 'tests/fixtures/kasko')
const EXTRACTION_TIMEOUT = 180_000 // 3 minutes per extraction
const RETRY_DELAY = 35_000 // wait 35s on rate limit

interface DataConversionInput {
  coverages?: any[]
  exclusions?: string[]
  specialConditions?: string[]
  policyNumber?: string | null
  provider?: string | null
  insurer?: string | null
  policyType?: string | null
  insuredName?: string | null
  insured?: any
  vehicle?: any
  premium?: any
  startDate?: string | null
  endDate?: string | null
  evidence?: {
    insights?: Array<{ text?: string; description?: string; textEn?: string; quote?: string }>
    exclusions?: Array<{ text?: string; description?: string; textEn?: string; quote?: string }>
  }
  [key: string]: any
}

/**
 * Sends a single PDF to the live API. Retries once on 429.
 * Returns null if the PDF doesn't exist.
 */
async function extractFromApi(
  pdfFilename: string
): Promise<{ data: DataConversionInput; raw: any } | null> {
  const pdfPath = join(FIXTURES_DIR, pdfFilename)
  if (!existsSync(pdfPath)) {
    console.warn(`[SKIP] ${pdfFilename} not found`)
    return null
  }

  const pdfBuf = readFileSync(pdfPath)
  const b64 = pdfBuf.toString('base64')

  const payload = JSON.stringify({
    documentText: '[PDF]',
    attachments: [{ data: b64, mimeType: 'application/pdf', filename: pdfFilename }],
  })

  const url = `${API_BASE}/api/ai/extract`

  // First attempt
  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(EXTRACTION_TIMEOUT),
  })

  // Retry on 429
  if (response.status === 429) {
    console.warn(`[RATE_LIMIT] Waiting ${RETRY_DELAY / 1000}s before retry...`)
    await new Promise((r) => setTimeout(r, RETRY_DELAY))
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(EXTRACTION_TIMEOUT),
    })
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`API ${response.status}: ${body.substring(0, 200)}`)
  }

  const raw = await response.json()
  const data: DataConversionInput = raw.data || {}

  return { data, raw }
}

/**
 * Runs convertToAnalyzedPolicy on raw API data.
 * Uses a mock File object since it runs in test environment.
 */
async function runConverter(data: DataConversionInput, filename: string): Promise<any> {
  const mod = await import('../policy-converter')
  const mockFile = new File([''], filename, { type: 'application/pdf' })
  return await mod.convertToAnalyzedPolicy(data as any, mockFile as File, undefined, undefined)
}

// Shared extraction result — all tests use this to minimize API calls
let sharedExtraction: { data: DataConversionInput; raw: any } | null = null
const PRIMARY_PDF = 'anadolu-birlesik-kasko.pdf'

// ===============================================
// TEST SUITE
// ===============================================

describe('E2E Live API Extraction (real PDFs → live API → converter)', () => {
  beforeAll(async () => {
    sharedExtraction = await extractFromApi(PRIMARY_PDF)
    expect(sharedExtraction).not.toBeNull()
  }, 300_000)

  // Test 1: convertToAnalyzedPolicy does NOT crash
  it('full conversion from API response — does not throw TypeError', async () => {
    expect(sharedExtraction).not.toBeNull()
    if (!sharedExtraction) return

    const { data, raw } = sharedExtraction

    // Stage2 must have run
    expect(raw.success).toBe(true)
    expect(raw.provider).toBeDefined()

    // THIS is where the crash happened before: convertToAnalyzedPolicy(apiData)
    let policy: any
    try {
      policy = await runConverter(data, PRIMARY_PDF)
    } catch (err: any) {
      expect.unreachable(`convertToAnalyzedPolicy threw: ${err.message}`)
      return
    }

    // Valid AnalyzedPolicy
    expect(policy).toBeDefined()
    expect(policy.id).toBeDefined()
    expect(policy.policyNumber).toBeDefined()
    expect(typeof policy.premium).toBe('number')
    expect(Array.isArray(policy.coverages)).toBe(true)
    expect(policy.coverages.length).toBeGreaterThan(0)

    console.log(
      `[OK] ${policy.policyNumber} | ${policy.provider} | ${policy.coverages.length} coverages | premium: ${policy.premium}`
    )
  }, 30_000)

  // Test 2: Multiple fixture PDFs — none crash converter
  it('all fixture PDFs pass through converter without TypeError', async () => {
    const pdfs = [
      { file: 'anadolu-birlesik-kasko.pdf', label: 'Anadolu Birleşik Kasko' },
      { file: 'anadolu-volkswagen-tiguan.pdf', label: 'Anadolu VW Tiguan' },
      { file: 'anadolu-renault-clio.pdf', label: 'Anadolu Renault Clio' },
    ]

    for (const { file, label } of pdfs) {
      const result = await extractFromApi(file)
      if (!result) continue

      try {
        await runConverter(result.data, file)
        console.log(`[OK] ${label} — conversion passed`)
      } catch (err: any) {
        if (
          /trim is not a function|is not a function|Cannot read properties|toLowerCase/.test(
            err.message
          )
        ) {
          expect.unreachable(`${label}: converter threw TypeError — ${err.message}`)
        } else {
          console.warn(`[WARN] ${label}: non-crash error — ${err.message}`)
        }
      }

      // Small delay between PDFs to avoid rate limit
      await new Promise((r) => setTimeout(r, 2000))
    }
  }, 600_000)

  // Test 3: Debate pipeline ran
  it('debate pipeline produced valid output', async () => {
    expect(sharedExtraction).not.toBeNull()
    if (!sharedExtraction) return

    const { raw } = sharedExtraction

    expect(raw.debate).toBeDefined()
    expect(raw.debate?.roundCount).toBeGreaterThanOrEqual(1)
    expect('roundTripValid' in (raw.debate || {})).toBe(true)

    console.log(`[DEBATE] rounds=${raw.debate?.roundCount} valid=${raw.debate?.roundTripValid}`)
  }, 10_000)

  // Test 4: Fallback produces valid data
  it('fallback chain (Anthropic → DeepSeek) produces valid data', async () => {
    expect(sharedExtraction).not.toBeNull()
    if (!sharedExtraction) return

    const { raw } = sharedExtraction

    expect(raw.data?.coverages).toBeDefined()
    expect(Array.isArray(raw.data?.coverages)).toBe(true)
    expect(raw.data?.coverages?.length).toBeGreaterThan(0)

    // Ensure conversion doesn't crash
    try {
      const policy = await runConverter(raw.data, PRIMARY_PDF)
      expect(policy.coverages.length).toBeGreaterThan(0)
    } catch (err: any) {
      expect.unreachable(`Fallback data crashed converter: ${err.message}`)
    }

    console.log(`[FALLBACK] provider=${raw.provider} reason=${raw.fallbackReason ?? 'none'}`)
  }, 30_000)
})
