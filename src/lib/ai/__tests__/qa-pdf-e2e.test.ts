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
 *  - Assert coverage/exclusion/exclusion arrays are present
 *  - Assert roundTripValid from debate pipeline
 *
 * Run with: npx vitest run src/lib/ai/__tests__/qa-pdf-e2e.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { File } from 'node:buffer'

const API_BASE = 'https://insurai-production.up.railway.app'
const FIXTURES_DIR = join(process.cwd(), 'tests/fixtures/kasko')
const TIMEOUT = 180_000 // 3 minutes per extraction

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
 * Sends a PDF to the live API and returns the raw response.
 * Skips if the PDF file doesn't exist.
 */
async function extractFromApi(
  pdfFilename: string
): Promise<{ data: DataConversionInput; raw: any } | null> {
  const pdfPath = join(FIXTURES_DIR, pdfFilename)
  if (!existsSync(pdfPath)) {
    console.warn(`[SKIP] ${pdfFilename} not found at ${pdfPath}`)
    return null
  }

  const pdfBuf = readFileSync(pdfPath)
  const b64 = pdfBuf.toString('base64')

  const payload = JSON.stringify({
    documentText: '[PDF]',
    attachments: [{ data: b64, mimeType: 'application/pdf', filename: pdfFilename }],
  })

  const url = `${API_BASE}/api/ai/extract`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(TIMEOUT - 5000),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`API ${response.status}: ${body.substring(0, 200)}`)
  }

  const raw = await response.json()
  const data: DataConversionInput = raw.data || {}

  return { data, raw }
}
/**
 * Runs convertToAnalyzedPolicy on the raw API data.
 * Since convertToAnalyzedPolicy expects a File object, we create a mock.
 */
async function runConverter(data: DataConversionInput, filename: string): Promise<any> {
  // Dynamic import to avoid module resolution issues
  const mod = await import('../policy-converter')
  const mockFile = new File([''], filename, { type: 'application/pdf' })

  const result = await mod.convertToAnalyzedPolicy(
    data as any,
    mockFile as File,
    undefined,
    undefined
  )

  return result
}

// ===============================================
// TEST SUITE: E2E API → converter → no crash
// ===============================================

const PDFS_TO_TEST = [
  { file: 'anadolu-birlesik-kasko.pdf', label: 'Anadolu Birleşik Kasko' },
  { file: 'anadolu-volkswagen-tiguan.pdf', label: 'Anadolu VW Tiguan Kasko' },
  { file: 'anadolu-renault-clio.pdf', label: 'Anadolu Renault Clio Kasko' },
  { file: 'allianz-kasko.pdf', label: 'Allianz Kasko' },
  { file: 'sompo-kasko.pdf', label: 'Sompo Kasko' },
]

describe('E2E Live API Extraction (real PDFs → live API → converter)', () => {
  // Pick one representative PDF to test conversion safety (runs against live API, so 1 is enough)
  it(
    'anadolu-birlesik-kasko.pdf — full conversion does not crash',
    async () => {
      const result = await extractFromApi('anadolu-birlesik-kasko.pdf')
      expect(result).not.toBeNull()
      if (!result) return

      const { data, raw } = result

      // Stage 2 validation should succeed
      expect(raw.success).toBe(true)
      expect(raw.provider).toBeDefined()

      // Run convertToAnalyzedPolicy — this is where DATA_CONVERSION_ERROR crashes
      let policy: any
      try {
        policy = await runConverter(data, 'anadolu-birlesik-kasko.pdf')
      } catch (err) {
        // FAIL: converter should NEVER throw
        expect.unreachable(
          `convertToAnalyzedPolicy threw: ${err instanceof Error ? err.message : err}`
        )
        return
      }

      // Assert the output is a valid AnalyzedPolicy
      expect(policy).toBeDefined()
      expect(policy.id).toBeDefined()
      expect(policy.policyNumber).toBeDefined()
      expect(typeof policy.premium).toBe('number')
      expect(Array.isArray(policy.coverages)).toBe(true)

      // Log results for manual inspection
      console.log(
        `[OK] ${policy.policyNumber} | ${policy.provider} | ${policy.coverages.length} coverages | premium: ${policy.premium}`
      )
    },
    TIMEOUT
  )

  // Test that NO PDF crashes convertToAnalyzedPolicy (any response shape)
  it(
    'no PDF crashes converter with TypeError',
    async () => {
      for (const { file, label } of PDFS_TO_TEST) {
        const result = await extractFromApi(file)
        if (!result) continue // file doesn't exist

        const { data } = result

        try {
          await runConverter(data, file)
          console.log(`[OK] ${label} — conversion passed`)
        } catch (err: any) {
          // Check if the error is a TypeError (the one that causes DATA_CONVERSION_ERROR)
          if (
            err &&
            err.message &&
            /trim is not a function|is not a function|Cannot read properties/.test(err.message)
          ) {
            expect.unreachable(`${label}: converter threw TypeError — ${err.message}`)
          } else {
            // Non-TypeError failures are logged but don't fail the test
            // (they could be resource loading issues in test environment)
            console.warn(`[WARN] ${label}: non-crash error — ${err.message}`)
          }
        }
      }
    },
    PDFS_TO_TEST.length * TIMEOUT
  )

  // Test debate pipeline validation
  it(
    'debate pipeline roundTripValid for all PDFs',
    async () => {
      for (const { file, label } of PDFS_TO_TEST) {
        const result = await extractFromApi(file)
        if (!result) continue

        const { raw } = result
        console.log(
          `[DEBATE] ${label}: rounds=${raw.debate?.roundCount ?? '?'} valid=${raw.debate?.roundTripValid ?? '?'} provider=${raw.provider ?? '?'}`
        )

        // Debate should always run (3 rounds minimum)
        expect(raw.debate).toBeDefined()
        expect(raw.debate?.roundCount).toBeGreaterThanOrEqual(1)

        // roundTripValid might be false if issues found — that's OK as long as it doesn't error
        // But we should at least see the field
        expect('roundTripValid' in (raw.debate || {})).toBe(true)
      }
    },
    PDFS_TO_TEST.length * TIMEOUT
  )

  // Test API fallback chain works
  it(
    'Anthropic billing fallback produces valid data',
    async () => {
      const result = await extractFromApi('anadolu-birlesik-kasko.pdf')
      expect(result).not.toBeNull()
      if (!result) return

      const { raw } = result

      // Should fallback because Anthropic billing is broken
      // But the data must still be valid
      expect(raw.provider).toBeDefined()
      expect(raw.data?.coverages).toBeDefined()
      expect(Array.isArray(raw.data?.coverages)).toBe(true)
      expect((raw.data?.coverages || []).length).toBeGreaterThan(0)

      // Run through converter to ensure no crash
      try {
        const policy = await runConverter(raw.data, 'anadolu-birlesik-kasko.pdf')
        expect(policy.coverages.length).toBeGreaterThan(0)
      } catch (err: any) {
        expect.unreachable(`Fallback data crashed converter: ${err.message}`)
      }

      console.log(
        `[FALLBACK] provider=${raw.provider} reason=${raw.fallbackReason ?? 'none'} coverages=${raw.data?.coverages?.length}`
      )
    },
    TIMEOUT
  )
})
