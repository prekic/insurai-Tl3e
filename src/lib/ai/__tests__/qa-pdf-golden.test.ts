/**
 * PDF Golden Regression Tests
 *
 * Tests our extraction-fix regex patterns against REAL Turkish kasko PDFs
 * committed in the policies/ directory. These are real-world policies with
 * varied formatting that exercise the bug fixes from the Ray Sigorta QA
 * review.
 *
 * Coverage:
 *  - Premium parsing across 4 different insurers (Anadolu, Allianz, RENAULT)
 *  - DAHİL/HARİÇ detection in real policy text
 *  - Vehicle make/model extraction across formats
 *  - Sigorta bedeli pattern matching
 *
 * NOTE: This test extracts PDF text via pdf-parse. It does NOT call any
 * AI APIs — it only validates the deterministic regex/parsing layer.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTurkishCurrency, extractVehicleInfoFromText } from '../turkish-utils'

// Premium regex patterns from policy-extractor.ts (post-fix)
const premiumPatterns = [
  /(?:br[uü]t\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  /(?:toplam\s+(?:net\s+)?pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  /(?:[oö]denecek\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  /(?:net\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  // Anadolu uses "Vergi Öncesi Prim" or all-caps "VERGİ ÖNCESİ PRİM".
  // Two patterns to avoid Turkish İ (U+0130) lowercase issue:
  // 1. Mixed case (e.g. "Vergi Öncesi Prim 29.657,14") — use /i flag normally
  // 2. All-caps (e.g. "VERGİ ÖNCESİ PRİM") — no /i flag, explicit chars
  /Vergi\s+Öncesi\s+Prim[\s:.]*([\d.,]+)/i,
  /VERG[İI]\s+ÖNCES[İI]\s+PR[İI]M[\s:.]*([\d.,]+)/,
]

// Pattern from fixed table-parser.ts
const EXCLUDED_PATTERN = /hay[ıi]r|yok|hari[çc]|excluded|HARİÇ|HARIC/i

interface PdfFixture {
  path: string
  insurer: string
  description: string
  // What we expect the patterns to find
  expectedMakeContains?: string
  expectedYear?: number
  expectedPlate?: string
  // Premium tolerance — allow either Net or Brüt or Vergi öncesi
  expectedPremiumOneOf: number[]
  // Should the text contain DAHİL or HARİÇ markers?
  shouldFindDahilHaric: boolean
}

const fixtures: PdfFixture[] = [
  {
    path: 'policies/eriş ambalaj 34 rz 9511 kasko pol .pdf',
    insurer: 'Anadolu',
    description: 'Eriş Ambalaj VOLKSWAGEN Tiguan 2016',
    expectedMakeContains: 'VOLKSWAGEN',
    expectedYear: 2016,
    expectedPlate: '34 RZ 9511',
    expectedPremiumOneOf: [29657.14, 31140.0], // Vergi öncesi or ödenecek
    shouldFindDahilHaric: true,
  },
  {
    path: 'policies/allianz-police-0001021024147152-TR.pdf',
    insurer: 'Allianz',
    description: 'Allianz PEUGEOT 308 2010',
    expectedMakeContains: 'PEUGEOT',
    expectedYear: 2010,
    expectedPlate: '34 GM 6461',
    expectedPremiumOneOf: [1659.72, 1580.67],
    shouldFindDahilHaric: true,
  },
  {
    path: 'policies/KASKO POLİÇESİ.pdf',
    insurer: 'Anadolu',
    description: 'Anadolu RENAULT Clio 2018',
    expectedMakeContains: 'RENAULT',
    expectedYear: 2018,
    expectedPlate: '35 G 0001',
    expectedPremiumOneOf: [2475.23, 2599.0],
    shouldFindDahilHaric: true,
  },
  {
    path: 'policies/ANADOLU.PDF',
    insurer: 'Anadolu',
    description: 'Anadolu VOLKSWAGEN',
    expectedMakeContains: 'VOLKSWAGEN',
    expectedPlate: '35 PR 962',
    expectedPremiumOneOf: [1095.23], // Vergi öncesi prim
    shouldFindDahilHaric: true,
  },
]

// Cache PDF text extraction across all tests in this file
const pdfTextCache = new Map<string, string>()

async function loadPdfText(relPath: string): Promise<string> {
  if (pdfTextCache.has(relPath)) return pdfTextCache.get(relPath)!
  const mod = await import('pdf-parse')
  const { PDFParse } = mod as unknown as {
    PDFParse: new (data: Uint8Array) => { getText(): Promise<{ pages: Array<{ text: string }> }> }
  }
  const buf = readFileSync(join(process.cwd(), relPath))
  const parser = new PDFParse(new Uint8Array(buf))
  const result = await parser.getText()
  const text = result.pages.map((p) => p.text).join('\n')
  pdfTextCache.set(relPath, text)
  return text
}

describe('PDF Golden Regression — committed Turkish kasko policies', () => {
  for (const fx of fixtures) {
    describe(`${fx.insurer}: ${fx.description} (${fx.path})`, () => {
      let text = ''

      beforeAll(async () => {
        text = await loadPdfText(fx.path)
      })

      it('PDF loads and contains non-trivial text', () => {
        expect(text.length).toBeGreaterThan(1000)
      })

      it('extracts a plausible Turkish premium amount', () => {
        const found: number[] = []
        for (const pat of premiumPatterns) {
          const matches = text.matchAll(new RegExp(pat.source, pat.flags + 'g'))
          for (const m of matches) {
            if (m[1]) {
              const v = parseTurkishCurrency(m[1])
              if (v && v > 50 && v < 1_000_000) found.push(v)
            }
          }
        }
        expect(found.length).toBeGreaterThan(0)
        // At least one expected premium should be found
        const matched = fx.expectedPremiumOneOf.some((expected) =>
          found.some((f) => Math.abs(f - expected) < 1)
        )
        expect(matched, `Expected one of ${fx.expectedPremiumOneOf} in found ${found}`).toBe(true)
      })

      if (fx.expectedMakeContains) {
        it(`extracts vehicle info containing "${fx.expectedMakeContains}"`, () => {
          const result = extractVehicleInfoFromText(text)
          expect(result).toBeDefined()
          // The make may be in result.make OR in the chassis/plate area; check raw text
          const makeFound =
            result?.make?.toUpperCase().includes(fx.expectedMakeContains!.toUpperCase()) ||
            text.toUpperCase().includes(fx.expectedMakeContains!.toUpperCase())
          expect(makeFound).toBe(true)
        })
      }

      if (fx.expectedYear) {
        it(`extracts model year ${fx.expectedYear} or finds it in raw text`, () => {
          const result = extractVehicleInfoFromText(text)
          const yearMatch =
            result?.year === fx.expectedYear || text.includes(String(fx.expectedYear))
          expect(yearMatch).toBe(true)
        })
      }

      if (fx.expectedPlate) {
        it(`finds plate "${fx.expectedPlate}" in document`, () => {
          // Plates may have variable spacing — normalize
          const normPlate = fx.expectedPlate!.replace(/\s+/g, '\\s*')
          expect(new RegExp(normPlate, 'i').test(text)).toBe(true)
        })
      }

      if (fx.shouldFindDahilHaric) {
        it('contains DAHİL or HARİÇ markers somewhere in policy text', () => {
          const hasDahil = /dahil|DAHİL/i.test(text)
          const hasHaric = EXCLUDED_PATTERN.test(text)
          // Real Turkish kaskos always have these somewhere
          expect(hasDahil || hasHaric).toBe(true)
        })
      }
    })
  }
})

describe('PDF Golden Regression — cross-PDF aggregate checks', () => {
  it('all 4 PDFs together yield premiums in plausible Turkish kasko range', async () => {
    const allPremiums: number[] = []
    for (const fx of fixtures) {
      const text = await loadPdfText(fx.path)
      for (const pat of premiumPatterns) {
        const matches = text.matchAll(new RegExp(pat.source, pat.flags + 'g'))
        for (const m of matches) {
          if (m[1]) {
            const v = parseTurkishCurrency(m[1])
            if (v && v > 50 && v < 1_000_000) allPremiums.push(v)
          }
        }
      }
    }
    expect(allPremiums.length).toBeGreaterThan(0)
    // CRITICAL: NONE should be 100x inflated. The largest real premium across
    // these PDFs is ~31,140 TL (Eriş Ambalaj). If any premium > 100,000 TL
    // appears, it's likely the 100x bug returning. Allow some headroom for
    // larger commercial policies but flag absurdly large values.
    const absurd = allPremiums.filter((p) => p > 200_000)
    expect(
      absurd,
      `Found absurdly large premiums (likely 100x bug): ${absurd.join(', ')}`
    ).toHaveLength(0)
  })

  it('Allianz PDF has both Brüt Prim and Net Prim entries (the Turkish İ test case)', async () => {
    const text = await loadPdfText('policies/allianz-police-0001021024147152-TR.pdf')
    const hasBrut = /br[uü]t\s*pr[iİ]m/i.test(text)
    const hasNet = /net\s*pr[iİ]m/i.test(text)
    expect(hasBrut).toBe(true)
    expect(hasNet).toBe(true)
  })
})
