/**
 * QA Field Accuracy Tests
 *
 * Tests that the /api/ai/extract endpoint returns CORRECT values
 * for structured fields — not just that they exist or don't crash.
 *
 * Built in response to Erdem's May 19 CSV audit which found:
 *  - Policy number = filename token ("Yenileme") instead of real Poliçe No
 *  - Dates defaulting to today's date (silent fallback)
 *  - Insurer and insured completely missing
 *  - Premium wrong / "Not Specified"
 *  - Exclusions entirely empty (most dangerous gap)
 *  - Deductibles not surfaced
 *  - Vehicle details missing
 *
 * CRITICAL: Sends REAL PDF text (extracted via pdf-parse) as documentText,
 * NOT a placeholder like '[PDF]'. Without real text, the LLM hallucinates.
 *
 * Run: npx vitest run server/__tests__/qa-field-accuracy.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const API_BASE = 'https://insurai-production.up.railway.app'
const FIXTURES_DIR = join(process.cwd(), 'tests/fixtures/kasko')
const TIMEOUT = 300_000

// =============================================================================
// PDF Text Extraction
// =============================================================================

async function extractTextFromPdf(filename: string): Promise<string> {
  const filePath = join(FIXTURES_DIR, filename)
  const buf = readFileSync(filePath)
  const mod = await import('pdf-parse')
  const { PDFParse } = mod as unknown as {
    PDFParse: new (data: Uint8Array) => { getText(): Promise<{ pages: Array<{ text: string }> }> }
  }
  const parser = new PDFParse(new Uint8Array(buf))
  const result = await parser.getText()
  return result.pages.map((p: any) => p.text).join('\n')
}

// =============================================================================
// Ground Truth — reference values extracted manually from each fixture PDF
// =============================================================================

interface CoverageCheck {
  canonicalName?: string
  limit?: number | 'RAYIC_DEGER' | 'UNLIMITED' | null
  deductible?: number | string | null
  category?: string
  included?: boolean
}

interface ForbiddenValue {
  field: string
  values: (string | number)[]
  reason: string
}

interface FieldAccuracyGroundTruth {
  minCoverages: number
  requiredCoverageCanonicalNames?: string[]
  coverageChecks?: CoverageCheck[]

  policyNumber?: string | RegExp
  provider?: string | RegExp
  insurer?: string | RegExp
  insuredName?: string | RegExp

  startDate?: string | RegExp
  endDate?: string | RegExp

  premium?: number | string
  premiumNet?: number | string | null

  vehicleMake?: string | RegExp
  vehicleModel?: string | RegExp
  vehiclePlate?: string | RegExp
  vehicleYear?: number
  vin?: string | RegExp
  engineNo?: string | RegExp

  policyType?: string
  isBundle?: boolean

  minExclusions?: number
  requiredExclusionTexts?: string[]

  minConditionalDeductibles?: number
  requiredDeductibleTriggers?: string[]

  paymentFrequency?: string
  currency?: string
  vehicleUsage?: string

  forbiddenValues?: ForbiddenValue[]

  minConfidence?: number
  expectedDiscountInfo?: string | RegExp
  previousInsurer?: string | RegExp
  branchName?: string | RegExp

  requiresOcr?: boolean
}

const GROUND_TRUTH: Record<string, FieldAccuracyGroundTruth> = {

  // ===========================================================================
  // Anadolu Birleşik Kasko
  // PDF: Birleşik Kasko Teklifi (offer), Eriş Ambalaj Sanayi
  // 2016 VW Tiguan, 34 RZ 9511
  // ===========================================================================
  'anadolu-birlesik-kasko.pdf': {
    minCoverages: 10,
    requiredCoverageCanonicalNames: [
      'MAIN_KASKO_COVERAGE',
      'EXCESS_LIABILITY',
      'LEGAL_PROTECTION',
      'THEFT',
      'FIRE',
      'SEAT_PERSONAL_ACCIDENT_DEATH',
      'SEAT_PERSONAL_ACCIDENT_DISABILITY',
      'GLASS_DAMAGE_PROTECTION',
      'MINI_REPAIR',
      'WRONG_FUEL',
      'EARTHQUAKE',
      'FLOOD_WATER_DAMAGE',
      'REPLACEMENT_VEHICLE',
    ],
    coverageChecks: [
      { canonicalName: 'MAIN_KASKO_COVERAGE', limit: 'RAYIC_DEGER', category: 'main', included: true },
      { canonicalName: 'EXCESS_LIABILITY', limit: 'UNLIMITED', category: 'liability', included: true },
      { canonicalName: 'LEGAL_PROTECTION', limit: 40000, included: true },
      { canonicalName: 'SEAT_PERSONAL_ACCIDENT_DEATH', limit: 10000, included: true },
      { canonicalName: 'SEAT_PERSONAL_ACCIDENT_DISABILITY', limit: 10000, included: true },
      { canonicalName: 'REPLACEMENT_VEHICLE', included: true },
    ],

    // Policy identity
    // PDF is a TEKLIF (offer) not a bound policy. Teklif No: T155336589
    policyNumber: 'T155336589',
    insurer: /ANADOLU ANONİM TÜRK SİGORTA/,
    insuredName: /ERİŞ AMBALAJ/,
    // Vehicle — LLM currently misses these (prompt gap)
    vehicleMake: /VOLKSWAGEN/i,
    vehicleModel: /TIGUAN/i,
    vehiclePlate: /34[\s]*RZ[\s]*9511/i,
    vehicleYear: 2016,
    vin: /WVGZZZ5NZHW862628/i,
    engineNo: /CZE307964/i,
    // Dates from PDF: 08/10/2015 - 08/10/2016
    startDate: /2015-10-08|08[/.]10[/.]2015/,
    endDate: /2016-10-08|08[/.]10[/.]2016/,
    // Premium: net 1,150 TL (offer amount)
    premium: 1150,
    // Bundle
    policyType: 'kasko',
    isBundle: true,
    // Exclusions
    minExclusions: 5,
    requiredExclusionTexts: [
      'servis', 'pert', 'LPG', 'kiralık', 'anahtar', 'siber', 'salgın', 'yaptırım',
    ],
    // Deductibles
    minConditionalDeductibles: 3,
    requiredDeductibleTriggers: ['servis', 'pert', 'LPG'],
    // Forbidden defaults
    forbiddenValues: [
      { field: 'startDate', values: ['2026-05-19', '2026-05-18', '2024-01-01', '2025-12-28'], reason: 'DATE defaulting' },
      { field: 'endDate', values: ['2027-05-19', '2025-01-01', '2026-12-28'], reason: 'DATE defaulting' },
      { field: 'policyNumber', values: ['Yenileme', 'yenileme', 'KASKO2024000001', 'KASKO-2024-12345', '1680600025'], reason: 'POLICY NUMBER hallucinating' },
      { field: 'insuredName', values: ['Cannot Verify', 'cannot verify', 'Not Specified'], reason: 'INSURED defaulting' },
    ],
    currency: 'TRY',
  },

  // ===========================================================================
  // Anadolu VW Tiguan (individual policy, Eriş Ambalaj fleet)
  // ===========================================================================
  'anadolu-volkswagen-tiguan.pdf': {
    minCoverages: 8,
    requiredCoverageCanonicalNames: [
      'MAIN_KASKO_COVERAGE',
      'THIRD_PARTY_LIABILITY',
      'EARTHQUAKE',
      'FLOOD_WATER_DAMAGE',
      'WRONG_FUEL',
      'GLASS_DAMAGE_PROTECTION',
    ],
    coverageChecks: [
      { canonicalName: 'MAIN_KASKO_COVERAGE', limit: 'RAYIC_DEGER', category: 'main', included: true },
    ],
    policyNumber: /^\d{10}$/,
    insurer: /ANADOLU/i,
    vehicleMake: /VOLKSWAGEN/i,
    vehicleModel: /TIGUAN/i,
    vehiclePlate: /34[\s]*RZ[\s]*9511/i,
    vehicleYear: 2016,
    vin: /WVGZZZ5NZHW862628/i,
    engineNo: /CZE307964/i,
    premium: 31140,
    minExclusions: 3,
    requiredExclusionTexts: ['servis', 'pert'],
    minConditionalDeductibles: 2,
    requiredDeductibleTriggers: ['servis', 'pert'],
    forbiddenValues: [
      { field: 'policyNumber', values: ['Yenileme', 'KASKO-2024', 'KASKO2024'], reason: 'POLICY number hallucinating' },
      { field: 'startDate', values: ['2026-05-19', '2024-01-01'], reason: 'DATE defaulting' },
    ],
    currency: 'TRY',
  },

  // ===========================================================================
  // Anadolu Renault Clio
  // ===========================================================================
  'anadolu-renault-clio.pdf': {
    minCoverages: 8,
    requiredCoverageCanonicalNames: [
      'MAIN_KASKO_COVERAGE',
      'THIRD_PARTY_LIABILITY',
      'MINI_REPAIR',
      'GLASS_DAMAGE_PROTECTION',
    ],
    policyNumber: /^\d{10}$/,
    insurer: /ANADOLU/i,
    vehicleMake: /RENAULT/i,
    vehicleModel: /CLIO/i,
    vehiclePlate: /35[\s]*G[\s]*0001/i,
    vehicleYear: 2018,
    minExclusions: 1,
    forbiddenValues: [
      { field: 'policyNumber', values: ['Yenileme', 'KASKO-2024', 'KASKO2024'], reason: 'POLICY number hallucinating' },
      { field: 'startDate', values: ['2026-05-19', '2024-01-01'], reason: 'DATE defaulting' },
    ],
  },
}

// =============================================================================
// Helpers
// =============================================================================

function matchValue(value: any, expected: string | RegExp | number | undefined | null): boolean {
  if (expected === undefined || expected === null) return true
  if (typeof value === 'undefined' || value === null) return false
  if (expected instanceof RegExp) return expected.test(String(value))
  if (typeof expected === 'number') return Number(value) === expected
  return String(value) === String(expected)
}

async function postExtract(
  pdfFilename: string,
  pdfText: string
): Promise<{ res: Response; body: any; data: any }> {
  const url = `${API_BASE}/api/ai/extract`

  const payload = JSON.stringify({
    documentText: pdfText,
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(TIMEOUT - 5000),
  })

  let body: any
  try {
    body = await res.json()
  } catch {
    body = { parseError: await res.text() }
  }

  return { res, body, data: body.data || body }
}

// =============================================================================
// Tests
// =============================================================================

describe('QA: Field Accuracy — structured extraction correctness', () => {

  for (const [pdfFile, gt] of Object.entries(GROUND_TRUTH)) {
    describe(pdfFile, () => {
      let data: any
      let body: any
      // extraction result
      let _extractionOk: boolean

      beforeAll(async () => {
        // Extract PDF text from the actual file and send IT — NOT a placeholder
        const pdfText = await extractTextFromPdf(pdfFile)
        expect(pdfText.length).toBeGreaterThan(100)

        const result = await postExtract(pdfFile, pdfText)
        body = result.body
        data = result.data
        _extractionOk = body.success === true && data !== undefined
      }, TIMEOUT)

      it('returns success status', () => {
        expect(body.success).toBe(true)
        expect(data).toBeDefined()
        expect(data.coverages).toBeDefined()
      })

      // =======================================================================
      // 1. POLICY NUMBER — must match real document Poliçe No
      // =======================================================================

      it('policyNumber is correct (not hallucinated)', () => {
        expect(data.policyNumber).toBeDefined()
        const pn = String(data.policyNumber)
        // Must NOT be the synthetic patterns
        expect(pn).not.toMatch(/^yenileme$/i)
        expect(pn).not.toMatch(/^KASKO/i)
        expect(pn).not.toMatch(/^POLICY/i)
        // Must be a real-looking value
        expect(pn.length).toBeGreaterThanOrEqual(8)
        if (gt.policyNumber) {
          expect(matchValue(data.policyNumber, gt.policyNumber)).toBe(true)
        }
      })

      // =======================================================================
      // 2. INSURER / INSURED
      // =======================================================================

      it('insurer is extracted correctly', () => {
        if (gt.insurer) {
          expect(matchValue(data.insurer, gt.insurer)).toBe(true)
        } else {
          expect(String(data.insurer || '')).not.toMatch(/unknown/i)
        }
      })

      it('insuredName is extracted correctly', () => {
        if (gt.insuredName) {
          expect(matchValue(data.insuredName, gt.insuredName)).toBe(true)
        } else {
          const val = String(data.insuredName || '')
          expect(val).not.toMatch(/cannot verify/i)
          expect(val).not.toMatch(/not specified/i)
        }
      })

      it('provider is correct', () => {
        const p = String(data.provider || '')
        expect(p).not.toMatch(/unknown/i)
        if (gt.provider) {
          expect(matchValue(data.provider, gt.provider)).toBe(true)
        }
      })

      // =======================================================================
      // 3. DATES — must NOT default
      // =======================================================================

      it("startDate is correct (not today's date)", () => {
        expect(data.startDate).toBeDefined()
        const sd = String(data.startDate)
        // Not today or 2024-01-01 (synthetic)
        expect(sd).not.toMatch(/^2026-05-1[89]/)
        expect(sd).not.toMatch(/^2026-05-2/)
        expect(sd).not.toMatch(/^2024-01-01/)
        if (gt.startDate) {
          expect(matchValue(data.startDate, gt.startDate)).toBe(true)
        }
      })

      it("endDate is correct (not today+1yr)", () => {
        expect(data.endDate).toBeDefined()
        const ed = String(data.endDate)
        expect(ed).not.toMatch(/^2027-05-1[89]/)
        expect(ed).not.toMatch(/^2027-05-2/)
        expect(ed).not.toMatch(/^2025-01-01/)
        if (gt.endDate) {
          expect(matchValue(data.endDate, gt.endDate)).toBe(true)
        }
      })

      // =======================================================================
      // 4. PREMIUM
      // =======================================================================

      it('premium is extracted correctly', () => {
        expect(data.premium).toBeDefined()
        // Extract total premium regardless of shape
        let actualPremium: any = data.premium
        if (typeof data.premium === 'object') {
          actualPremium = data.premium.total ?? data.premium.amount ?? data.premium.net
        }
        expect(actualPremium).toBeDefined()
        expect(typeof actualPremium).toBe('number')
        expect(actualPremium).toBeGreaterThan(0)

        // Must not be a placeholder message
        if (typeof data.premium === 'string') {
          expect(data.premium.toLowerCase()).not.toMatch(/(not specified|unknown|cannot verify)/)
        }

        if (gt.premium !== undefined) {
          expect(matchValue(actualPremium, gt.premium)).toBe(true)
        }
      })

      // =======================================================================
      // 5. VEHICLE
      // =======================================================================

      it('vehicle make is correct', () => {
        if (gt.vehicleMake) {
          expect(matchValue(data.vehicleMake, gt.vehicleMake)).toBe(true)
        } else {
          expect(String(data.vehicleMake || '')).not.toMatch(/unknown/i)
        }
      })

      it('vehicle model is correct', () => {
        if (gt.vehicleModel) {
          expect(matchValue(data.vehicleModel, gt.vehicleModel)).toBe(true)
        }
      })

      it('vehicle plate is correct', () => {
        if (gt.vehiclePlate) {
          expect(matchValue(data.vehiclePlate, gt.vehiclePlate)).toBe(true)
        }
      })

      it('vehicle year is correct', () => {
        if (gt.vehicleYear !== undefined) {
          expect(Number(data.vehicleYear)).toBe(gt.vehicleYear)
        }
      })

      it('VIN/chassis number is correct', () => {
        if (gt.vin) {
          expect(matchValue(data.vin, gt.vin)).toBe(true)
        }
      })

      // =======================================================================
      // 6. COVERAGES
      // =======================================================================

      it(`has at least ${gt.minCoverages} coverages`, () => {
        expect(data.coverages.length).toBeGreaterThanOrEqual(gt.minCoverages)
      })

      if (gt.requiredCoverageCanonicalNames && gt.requiredCoverageCanonicalNames.length > 0) {
        it('includes all required coverages', () => {
          const present = new Set(data.coverages.map((c: any) => c.canonicalName || c.name))
          for (const name of gt.requiredCoverageCanonicalNames) {
            expect(present.has(name)).toBe(true)
          }
        })
      }

      if (gt.coverageChecks && gt.coverageChecks.length > 0) {
        for (const cc of gt.coverageChecks) {
          if (!cc.canonicalName) continue
          it(`coverage ${cc.canonicalName} has correct properties`, () => {
            const cov = data.coverages.find(
              (c: any) => (c.canonicalName || c.name) === cc.canonicalName
            )
            expect(cov).toBeDefined()

            if (cc.limit !== undefined) {
              if (cc.limit === 'RAYIC_DEGER') {
                expect(cov.isMarketValue).toBe(true)
              } else if (cc.limit === 'UNLIMITED') {
                expect(cov.isUnlimited).toBe(true)
              } else if (cc.limit !== null) {
                expect(Number(cov.limit)).toBe(cc.limit)
              }
            }

            if (cc.category !== undefined) {
              expect(cov.category).toBe(cc.category)
            }

            if (cc.included !== undefined) {
              expect(typeof cov.included).toBe('boolean')
              expect(cov.included).toBe(cc.included)
            }
          })
        }
      }

      // =======================================================================
      // 7. EXCLUSIONS
      // =======================================================================

      if (gt.minExclusions !== undefined) {
        it(`has at least ${gt.minExclusions} exclusions`, () => {
          const exclusions = Array.isArray(data.exclusions) ? data.exclusions : []
          expect(exclusions.length).toBeGreaterThanOrEqual(gt.minExclusions)
        })
      }

      if (gt.requiredExclusionTexts && gt.requiredExclusionTexts.length > 0) {
        it('includes specific exclusions', () => {
          const exclusions = Array.isArray(data.exclusions) ? data.exclusions : []
          const allText = exclusions.map((e: any) =>
            typeof e === 'string' ? e : (e.description || e.text || '')
          ).join(' ').toLowerCase()

          for (const text of gt.requiredExclusionTexts) {
            expect(allText.includes(text.toLowerCase())).toBe(true)
          }
        })
      }

      // =======================================================================
      // 8. CONDITIONAL DEDUCTIBLES
      // =======================================================================

      if (gt.minConditionalDeductibles !== undefined) {
        it(`has at least ${gt.minConditionalDeductibles} conditional deductibles`, () => {
          const deductibles = Array.isArray(data.conditionalDeductibles) ? data.conditionalDeductibles : []
          expect(deductibles.length).toBeGreaterThanOrEqual(gt.minConditionalDeductibles)
        })
      }

      if (gt.requiredDeductibleTriggers && gt.requiredDeductibleTriggers.length > 0) {
        it('includes specific deductible triggers', () => {
          const deductibles = Array.isArray(data.conditionalDeductibles) ? data.conditionalDeductibles : []
          const allTriggers = deductibles.map((d: any) =>
            (d.trigger || d.description || d.name || '') + ' ' + (d.condition || d.text || '')
          ).join(' ').toLowerCase()

          for (const trigger of gt.requiredDeductibleTriggers) {
            expect(allTriggers.includes(trigger.toLowerCase())).toBe(true)
          }
        })
      }

      // =======================================================================
      // 9. FORBIDDEN VALUES
      // =======================================================================

      if (gt.forbiddenValues) {
        for (const fv of gt.forbiddenValues) {
          it(`${fv.field} does not contain forbidden defaults`, () => {
            const val = data[fv.field]
            const strVal = String(val ?? '').toLowerCase()
            for (const bad of fv.values) {
              if (typeof bad === 'number') {
                expect(val).not.toBe(bad)
              } else {
                expect(strVal).not.toBe(bad.toLowerCase())
              }
            }
          })
        }
      }

      // =======================================================================
      // 10. POLICY TYPE & BUNDLE
      // =======================================================================

      it('policyType is correct', () => {
        expect(data.policyType).toBeDefined()
        if (gt.policyType) {
          expect(data.policyType).toBe(gt.policyType)
        }
      })

      it('isBundle flag is correct', () => {
        if (gt.isBundle !== undefined) {
          expect(data.isBundle).toBe(gt.isBundle)
        }
      })

      // =======================================================================
      // 11. OTHER FIELDS
      // =======================================================================

      it('currency is correct', () => {
        if (gt.currency) {
          expect(data.currency).toBe(gt.currency)
        }
      })

      it('paymentFrequency is correct', () => {
        if (gt.paymentFrequency) {
          expect(data.paymentFrequency).toBe(gt.paymentFrequency)
        }
      })

      it('previousInsurer is correct', () => {
        if (gt.previousInsurer) {
          expect(matchValue(data.previousInsurer, gt.previousInsurer)).toBe(true)
        }
      })
    })
  }
})
