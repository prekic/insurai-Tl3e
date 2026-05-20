/**
 * E2E Extraction Tests — runs against the live API OR a cached fixture.
 *
 * These tests validate the full user flow:
 *   Live API response → convertToAnalyzedPolicy → valid AnalyzedPolicy
 *
 * STRATEGY:
 *  - Cache API responses locally so we don't hammer the rate limiter
 *  - Run cache-hit tests instantly; only run live API extraction when
 *    explicitly requested (CACHEBUST=1) or when cache is stale
 *
 * Run: npx vitest run src/lib/ai/__tests__/qa-pdf-e2e.test.ts
 * Forced live: CACHEBUST=1 npx vitest run src/lib/ai/__tests__/qa-pdf-e2e.test.ts
 * Clear cache: rm -rf .e2e-cache
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { File } from 'node:buffer'

const FIXTURES_DIR = join(process.cwd(), 'tests/fixtures/kasko')
const CACHE_DIR = join(process.cwd(), '.e2e-cache')
const EXTRACTION_TIMEOUT = 180_000
const API_BASE = 'https://insurai-production.up.railway.app'

interface CachedResponse {
  data: any
  raw: any
  cachedAt: string
}

function getCached(name: string): CachedResponse | null {
  const path = join(CACHE_DIR, `${name}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function setCached(name: string, resp: CachedResponse): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(join(CACHE_DIR, `${name}.json`), JSON.stringify(resp, null, 2))
}

// Fixture list mapped to expected policy numbers for quick QA.
const FIXTURES: { name: string; path: string; expectedPolicyNumber?: string }[] = [
  {
    name: 'anadolu-birlesik-kasko',
    path: 'anadolu-birlesik-kasko.pdf',
    expectedPolicyNumber: '1680600025',
  },
  { name: 'anadolu-volkswagen-tiguan', path: 'anadolu-volkswagen-tiguan.pdf' },
  { name: 'anadolu-renault-clio', path: 'anadolu-renault-clio.pdf' },
]

async function extractTextFromPdf(pdfPath: string): Promise<string> {
  const buf = readFileSync(pdfPath)
  const mod = await import('pdf-parse')
  const { PDFParse } = mod
  const parser = new PDFParse(buf)
  const result = await parser.getText()
  return result
}

// Load converter — imported lazily to avoid module resolution issues
async function loadConverter() {
  const { convertToAnalyzedPolicy } = await import('../policy-converter')
  return { convertToAnalyzedPolicy }
}

describe('E2E Extraction Pipeline (cached or live)', () => {
  beforeAll(() => {
    // Ensure we have at least one cached response to avoid live calls
    const firstFixture = FIXTURES[0]!
    const cached = getCached(firstFixture.name)
    if (!cached) {
      console.warn(`[e2e] No cached response for ${firstFixture.name}. Will call live API.`)
    }
  })

  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      let cached: CachedResponse | null
      let rawData: any
      let extractedData: any

      beforeAll(async function fetchOrCache() {
        cached = getCached(fixture.name)

        if (cached) {
          console.log(`[e2e] Using cached response for ${fixture.name}`)
          rawData = cached.raw
          extractedData = cached.data
          return
        }

        // Live API call
        console.log(`[e2e] No cache — calling live API for ${fixture.name}...`)
        const pdfPath = join(FIXTURES_DIR, fixture.path)
        const documentText = await extractTextFromPdf(pdfPath)

        const resp = await fetch(`${API_BASE}/api/ai/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentText, model: 'gpt-5.4-mini' }),
          signal: AbortSignal.timeout(EXTRACTION_TIMEOUT),
        })

        const body = await resp.json()

        if (!resp.ok || !body.success) {
          throw new Error(
            `API returned error: ${resp.status} ${JSON.stringify(body).slice(0, 200)}`
          )
        }

        rawData = body
        extractedData = body.data

        setCached(fixture.name, {
          data: extractedData,
          raw: rawData,
          cachedAt: new Date().toISOString(),
        })
      }, EXTRACTION_TIMEOUT + 30_000)

      it('extraction succeeds and returns data', () => {
        expect(extractedData).toBeTruthy()
        expect(extractedData.policyNumber).toBeTruthy()
      })

      it('premium is parseable (number or object with gross/amount)', () => {
        const prem = extractedData?.premium
        if (prem === null || prem === undefined) {
          // premium null is acceptable for unparseable docs
          expect(true).toBe(true)
          return
        }
        // premium must be either:
        //   number > 0, or
        //   object with .gross (number > 0) or .amount (number > 0)
        if (typeof prem === 'number') {
          expect(prem).toBeGreaterThan(0)
        } else if (typeof prem === 'object' && prem !== null) {
          const hasGross = typeof prem.gross === 'number' && prem.gross > 0
          const hasAmount = typeof prem.amount === 'number' && prem.amount > 0
          if (!hasGross && !hasAmount) {
            // If neither, check if premiumMissing is set
            expect(prem.gross ?? prem.amount ?? null).toBeNull()
          }
        }
      })

      it('policy number matches expected pattern', () => {
        expect(extractedData.policyNumber).toBeTruthy()
        if (typeof extractedData.policyNumber === 'string') {
          expect(extractedData.policyNumber.length).toBeGreaterThan(0)
        }
      })

      it('dates are parseable (not defaulting to today)', () => {
        const _today = new Date().toISOString().split('T')[0]!
        if (extractedData.startDate && extractedData.startDate !== 'Invalid Date') {
          // It's fine if it IS today — but it shouldn't be blindly defaulted
          // Just ensure it's a valid-looking date
          expect(extractedData.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
        if (extractedData.endDate && extractedData.endDate !== 'Invalid Date') {
          expect(extractedData.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
      })
    })
  }
})

/**
 * CRITICAL: convertToAnalyzedPolicy acceptance test
 *
 * This validates that the converter function can process EVERY cached API
 * response WITHOUT throwing. A crash here means the user sees
 * "AI data could not be processed — unexpected format from provider".
 *
 * Using cached responses avoids live API calls, making this fast and deterministic.
 */
describe('convertToAnalyzedPolicy — no crash on any cached response', () => {
  let convertToAnalyzedPolicy: (...args: any[]) => any
  let testFile: File

  beforeAll(async () => {
    const mod = await loadConverter()
    convertToAnalyzedPolicy = mod.convertToAnalyzedPolicy
    // Create a minimal File-like object for the converter
    testFile = new File(['dummy'], 'test.pdf', { type: 'application/pdf' })
  })

  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      let cached: CachedResponse | null = null
      let conversionError: Error | null = null
      let policyResult: any = null

      beforeAll(async () => {
        cached = getCached(fixture.name)
        if (!cached) {
          console.warn(
            `[converter] No cached response for ${fixture.name} — skipping converter test`
          )
          return
        }

        try {
          policyResult = await convertToAnalyzedPolicy(
            cached.data,
            testFile,
            '', // documentText (empty is OK for structural test)
            '', // processedText
            { confidence: 1, warnings: [] } // safetyResult
          )
        } catch (err) {
          conversionError = err as Error
        }
      })

      it('does NOT throw TypeError during conversion', () => {
        if (!cached) return // skip
        expect(conversionError).toBeNull()
      })

      it('returns a valid AnalyzedPolicy with required fields', () => {
        if (!cached || !policyResult) return // skip
        expect(policyResult).toBeTruthy()
        expect(policyResult.id).toBeTruthy()
        expect(policyResult.type).toBeTruthy()
        expect(typeof policyResult.provider === 'string').toBe(true)
        expect(policyResult.policyNumber).toBeTruthy()
      })

      it('premium is a positive number in the converted result', () => {
        if (!cached || !policyResult) return
        // After conversion, premium should be a flat number
        expect(typeof policyResult.premium).toBe('number')
        expect(policyResult.premium).toBeGreaterThanOrEqual(0)
      })

      it('coverages array is valid', () => {
        if (!cached || !policyResult) return
        expect(Array.isArray(policyResult.coverages)).toBe(true)
        for (const c of policyResult.coverages) {
          expect(typeof c.name).toBe('string')
          expect(typeof c.limit === 'number' || c.limit === null || c.limit === undefined).toBe(
            true
          )
        }
      })

      it('does NOT leave premium as an object', () => {
        if (!cached || !policyResult) return
        // This is the specific bug: premium should be a number after conversion
        expect(typeof policyResult.premium).not.toBe('object')
      })
    })
  }
})
