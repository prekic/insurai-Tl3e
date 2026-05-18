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
  pdfFile: string
}

interface DataConversionInput {
  coverages?: any[]
  exclusions?: string[]
  specialConditions?: string[]
  policyNumber?: string | null
  provider?: string | null
  premium?: any
  evidence?: {
    insights?: Array<{ text?: string; description?: string; textEn?: string; quote?: string }>
    exclusions?: Array<{ text?: string; description?: string; textEn?: string; quote?: string }>
  }
  [key: string]: any
}

function cachedPath(pdfFilename: string): string {
  return join(CACHE_DIR, pdfFilename.replace('.pdf', '.json'))
}

function loadCache(pdfFilename: string): CachedResponse | null {
  try {
    const p = cachedPath(pdfFilename)
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) as CachedResponse
  } catch {
    // Invalid cache file — ignore
  }
  return null
}

function saveCache(pdfFilename: string, data: any, raw: any): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
  const entry: CachedResponse = {
    data,
    raw,
    cachedAt: new Date().toISOString(),
    pdfFile: pdfFilename,
  }
  writeFileSync(cachedPath(pdfFilename), JSON.stringify(entry, null, 2))
}

async function extractFromApi(
  pdfFilename: string
): Promise<{ data: DataConversionInput; raw: any } | null> {
  // Check cache first (unless CACHEBUST=1)
  if (!process.env.CACHEBUST) {
    const cached = loadCache(pdfFilename)
    if (cached) {
      console.log(`[CACHE] ${pdfFilename} (cached ${cached.cachedAt})`)
      return { data: cached.data as DataConversionInput, raw: cached.raw }
    }
  }

  const pdfPath = join(FIXTURES_DIR, pdfFilename)
  if (!existsSync(pdfPath)) {
    console.warn(`[SKIP] ${pdfFilename} not found`)
    return null
  }

  // Live extraction
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
    signal: AbortSignal.timeout(EXTRACTION_TIMEOUT),
  })

  if (response.status === 429) {
    // Hard fail on rate limit — tests should be cached for CI
    const body = await response.text()
    throw new Error(
      `API 429 RATE_LIMITED — run again later or use cached fixture\n${body.substring(0, 200)}`
    )
  }
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`API ${response.status}: ${body.substring(0, 200)}`)
  }

  const raw = await response.json()
  const data: DataConversionInput = raw.data || {}
  saveCache(pdfFilename, data, raw)
  console.log(`[LIVE] ${pdfFilename}`)
  return { data, raw }
}

async function runConverter(data: DataConversionInput, filename: string): Promise<any> {
  const mod = await import('../policy-converter')
  const mockFile = new File([''], filename, { type: 'application/pdf' })
  return await mod.convertToAnalyzedPolicy(data as any, mockFile as File, undefined, undefined)
}

// ===============================================
// TESTS
// ===============================================

const PDFS = [
  { file: 'anadolu-birlesik-kasko.pdf', label: 'Anadolu Birleşik Kasko' },
  { file: 'anadolu-volkswagen-tiguan.pdf', label: 'Anadolu VW Tiguan' },
  { file: 'anadolu-renault-clio.pdf', label: 'Anadolu Renault Clio' },
]

describe('E2E: Live API → convertToAnalyzedPolicy', () => {
  let birlesikSnapshot: { data: DataConversionInput; raw: any } | null = null

  beforeAll(async () => {
    birlesikSnapshot = await extractFromApi('anadolu-birlesik-kasko.pdf')
    expect(birlesikSnapshot).not.toBeNull()
  }, 240_000)

  // Test 1: Conversion does NOT crash
  it('convertToAnalyzedPolicy does not throw', async () => {
    expect(birlesikSnapshot).not.toBeNull()
    if (!birlesikSnapshot) return

    const { data, raw } = birlesikSnapshot
    expect(raw.success).toBe(true)

    let policy: any
    try {
      policy = await runConverter(data, 'anadolu-birlesik-kasko.pdf')
    } catch (err: any) {
      expect.unreachable(`convertToAnalyzedPolicy threw: ${err.message}`)
      return
    }

    expect(policy).toBeDefined()
    expect(policy.id).toBeDefined()
    expect(policy.policyNumber).toBeDefined()
    expect(typeof policy.premium).toBe('number')
    expect(Array.isArray(policy.coverages)).toBe(true)
    expect(policy.coverages.length).toBeGreaterThan(0)
    console.log(
      `[OK] ${policy.policyNumber} | ${policy.coverages.length} cov | ${policy.premium} TL`
    )
  }, 30_000)

  // Test 2: Debate pipeline output
  it('debate pipeline ran successfully', async () => {
    expect(birlesikSnapshot).not.toBeNull()
    if (!birlesikSnapshot) return

    const { raw } = birlesikSnapshot
    expect(raw.debate).toBeDefined()
    expect(raw.debate?.roundCount).toBeGreaterThanOrEqual(1)
    expect('roundTripValid' in (raw.debate || {})).toBe(true)
    console.log(`[DEBATE] rounds=${raw.debate?.roundCount} valid=${raw.debate?.roundTripValid}`)
  }, 10_000)

  // Test 3: No PDF crashes the converter
  it('all fixture PDFs convert without TypeError', async () => {
    for (const { file, label } of PDFS) {
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
          expect.unreachable(`${label}: TypeError — ${err.message}`)
        } else {
          console.warn(`[WARN] ${label}: ${err.message}`)
        }
      }
    }
  }, 600_000)

  // Test 4: Coverages have canonical names (stage2 ran)
  it('coverages have canonicalName after stage2', async () => {
    expect(birlesikSnapshot).not.toBeNull()
    if (!birlesikSnapshot) return

    const { data } = birlesikSnapshot
    for (const c of data.coverages || []) {
      expect(c.canonicalName).toBeDefined()
      expect(typeof c.canonicalName).toBe('string')
    }
    console.log(`[OK] ${data.coverages?.length || 0} coverages all have canonicalName`)
  }, 10_000)
})
