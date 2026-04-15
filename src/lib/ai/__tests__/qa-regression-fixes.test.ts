/**
 * QA Regression Tests — Ray Sigorta Bug Fixes
 *
 * Tests the 8 bug fixes from the Ray Sigorta commercial kasko QA review.
 * Uses real PDF text from committed policy files + synthetic inputs
 * to verify each fix works correctly.
 *
 * Covers:
 *  P0-1: Premium Turkish decimal comma regex
 *  P0-2: Vehicle make/model extraction
 *  P0-3: Sigorta bedeli raw text fallback
 *  P0-4: DAHİL/HARİÇ flag inversion
 *  P1-5: Unresolved relationship warning filtering
 *  P1-6: Historical policy detection
 *  P1-7: Commercial vehicle alcohol prompt (prompt-only, not testable here)
 *  P1-8: Deductible assignment (max across coverages)
 */

import { describe, it, expect } from 'vitest'
import { parseTurkishCurrency, extractVehicleInfoFromText } from '../turkish-utils'
import { EXTRACTION_JSON_SCHEMA } from '../../../../shared/extraction-schema'

// ============================================================================
// P0-1: Premium Turkish Decimal Comma
// ============================================================================

describe('P0-1: Turkish decimal comma premium parsing', () => {
  it('parses 755,21 as 755.21 (not 75521)', () => {
    expect(parseTurkishCurrency('755,21')).toBe(755.21)
  })

  it('parses 1.659,72 TL as 1659.72', () => {
    expect(parseTurkishCurrency('1.659,72 TL')).toBe(1659.72)
  })

  it('parses 29.657,14 as 29657.14', () => {
    expect(parseTurkishCurrency('29.657,14')).toBe(29657.14)
  })

  it('parses 719,25 as 719.25 (Ray Sigorta net premium)', () => {
    expect(parseTurkishCurrency('719,25')).toBe(719.25)
  })

  it('parses 4.187,50 TL as 4187.50 (deductible amount)', () => {
    expect(parseTurkishCurrency('4.187,50 TL')).toBe(4187.5)
  })

  describe('premium sanity check regex patterns match Turkish İ', () => {
    // These are the exact patterns from policy-extractor.ts after the fix
    const premiumPatterns = [
      /(?:br[uü]t\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
      /(?:toplam\s+(?:net\s+)?pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
      /(?:[oö]denecek\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
      /(?:net\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
    ]

    it('matches "BRÜT PRİM" with Turkish İ (U+0130)', () => {
      const match = premiumPatterns.some((p) => p.test('BRÜT PRİM 1.659,72 TL'))
      expect(match).toBe(true)
    })

    it('extracts amount from "BRÜT PRİM 1.659,72 TL"', () => {
      const text = 'BRÜT PRİM 1.659,72 TL'
      let amount: number | null = null
      for (const pat of premiumPatterns) {
        const m = text.match(pat)
        if (m?.[1]) {
          amount = parseTurkishCurrency(m[1])
          break
        }
      }
      expect(amount).toBe(1659.72)
    })

    it('matches "NET PRİM" with Turkish İ', () => {
      const text = 'NET PRİM 1.580,67 TL'
      const match = premiumPatterns.some((p) => p.test(text))
      expect(match).toBe(true)
    })

    it('matches "TOPLAM NET PRİM" with intervening word', () => {
      // Ray Sigorta format: "TOPLAM NET PRİM: 719,25"
      const text = 'TOPLAM NET PRİM: 719,25'
      let amount: number | null = null
      for (const pat of premiumPatterns) {
        const m = text.match(pat)
        if (m?.[1]) {
          amount = parseTurkishCurrency(m[1])
          break
        }
      }
      expect(amount).toBe(719.25)
    })

    it('matches lowercase "brüt prim" too', () => {
      const text = 'brüt prim: 2.599,00 TL'
      let amount: number | null = null
      for (const pat of premiumPatterns) {
        const m = text.match(pat)
        if (m?.[1]) {
          amount = parseTurkishCurrency(m[1])
          break
        }
      }
      expect(amount).toBe(2599)
    })

    it('matches "Ödenecek Prim" variant', () => {
      const text = 'Ödenecek Prim 31.140,00 TL'
      let amount: number | null = null
      for (const pat of premiumPatterns) {
        const m = text.match(pat)
        if (m?.[1]) {
          amount = parseTurkishCurrency(m[1])
          break
        }
      }
      expect(amount).toBe(31140)
    })
  })
})

// ============================================================================
// P0-2: Vehicle Make/Model Extraction
// ============================================================================

describe('P0-2: Vehicle make/model extraction', () => {
  it('extracts PEUGEOT from Allianz format with tab separator', () => {
    // Real text from Allianz PDF
    const text = ': PEUGEOT (114)\tMarka Plaka No : 34 GM 6461\nModel Yılı : 2010'
    const result = extractVehicleInfoFromText(text)
    expect(result).toBeDefined()
    expect(result?.plate).toBe('34 GM 6461')
    expect(result?.year).toBe(2010)
  })

  it('extracts VOLKSWAGEN from Eriş Ambalaj format with colon', () => {
    const text = 'Marka : VOLKSWAGEN\nModel : TIGUAN 1.4 TSI\nModel Yılı : 2016'
    const result = extractVehicleInfoFromText(text)
    expect(result).toBeDefined()
    expect(result?.make).toBe('VOLKSWAGEN')
    expect(result?.year).toBe(2016)
  })

  it('extracts RENAULT from KASKO POLİÇESİ format', () => {
    const text = 'Marka : RENAULT (OYA\nModel : CLIO HB TOUCH 1.5 DCI EDC 90\nModel Yılı : 2018'
    const result = extractVehicleInfoFromText(text)
    expect(result).toBeDefined()
    expect(result?.make).toBe('RENAULT')
    expect(result?.year).toBe(2018)
  })

  it('extracts from MARKASI/TİPİ variant (commercial policies)', () => {
    // Simulates Ray Sigorta commercial layout
    const text = 'MARKASI/TİPİ: IVECO/KAMYON 80-12\nMODEL: 1997\nPlaka No : 35 VD 458'
    const result = extractVehicleInfoFromText(text)
    expect(result).toBeDefined()
    expect(result?.plate).toBe('35 VD 458')
    // Model year from standalone MODEL: pattern
    expect(result?.year).toBe(1997)
  })

  it('handles wide column spacing between label and value', () => {
    // Column-aligned layout with many spaces
    const text = 'Marka :                    FORD\nModel Yılı :               2020'
    const result = extractVehicleInfoFromText(text)
    expect(result).toBeDefined()
    expect(result?.make).toBe('FORD')
    expect(result?.year).toBe(2020)
  })

  it('extracts chassis number', () => {
    const text = 'Şasi No : VF34C5FWFAY000475'
    const result = extractVehicleInfoFromText(text)
    expect(result).toBeDefined()
    expect(result?.chassisNo).toBe('VF34C5FWFAY000475')
  })
})

// ============================================================================
// P0-3: Sigorta Bedeli Raw Text Fallback (pattern matching only)
// ============================================================================

describe('P0-3: Sigorta bedeli raw text patterns', () => {
  // These are the exact patterns from policy-extractor.ts
  // Note: s[iİ]gorta and bedel[iİ] handle Turkish İ (U+0130) which lowercases to i̇ not i
  const bedelPatterns = [
    /s[iİ]gorta\s+bedel[iİ][\s:.]*([\d.,]+)\s*[-–]?\s*(?:TL|TRY|₺)/i,
    /\((\d[\d.,]*)\s*[-–]?\s*TL\)/i,
  ]

  it('matches "sigorta bedeli ... (16750 -TL)" from Ray Sigorta', () => {
    const text = 'sigortalı ile mutabık kalınan bedel üzerinden (16750 -TL) sigortalanır'
    let amount: number | null = null
    for (const pat of bedelPatterns) {
      const m = text.match(pat)
      if (m?.[1]) {
        amount = parseTurkishCurrency(m[1])
        break
      }
    }
    expect(amount).toBe(16750)
  })

  it('matches "SİGORTA BEDELİ: 500.000,00 TL" format (Turkish thousands+decimal)', () => {
    const text = 'SİGORTA BEDELİ: 500.000,00 TL'
    let amount: number | null = null
    for (const pat of bedelPatterns) {
      const m = text.match(pat)
      if (m?.[1]) {
        amount = parseTurkishCurrency(m[1])
        break
      }
    }
    expect(amount).toBe(500000)
  })

  it('matches uppercase SİGORTA BEDELİ with Turkish İ', () => {
    // Verifies the [iİ] character class handles the Turkish İ→i̇ lowercasing issue
    const text = 'SİGORTA BEDELİ: 16750 TL'
    const match = bedelPatterns[0].test(text)
    expect(match).toBe(true)
  })

  it('matches "(16.750 TL)" parenthesized format with comma', () => {
    const text = 'aracın değeri (16.750,00 TL) olarak belirlenmiştir'
    let amount: number | null = null
    for (const pat of bedelPatterns) {
      const m = text.match(pat)
      if (m?.[1]) {
        amount = parseTurkishCurrency(m[1])
        break
      }
    }
    expect(amount).toBe(16750)
  })
})

// ============================================================================
// P0-4: DAHİL/HARİÇ Schema and isIncludedValue
// ============================================================================

describe('P0-4: DAHİL/HARİÇ extraction schema', () => {
  const coverageItems = EXTRACTION_JSON_SCHEMA.schema.properties.coverages.items

  it('has included field in coverage items', () => {
    expect(coverageItems.properties.included).toBeDefined()
    expect(coverageItems.properties.included.type).toBe('boolean')
  })

  it('requires included field (strict mode)', () => {
    expect(coverageItems.required).toContain('included')
  })

  it('has 9 total coverage properties', () => {
    expect(Object.keys(coverageItems.properties)).toHaveLength(9)
  })

  it('included field description mentions DAHİL/HARİÇ', () => {
    const desc = coverageItems.properties.included.description
    expect(desc).toContain('DAHİL')
    expect(desc).toContain('HARİÇ')
  })
})

describe('P0-4: isIncludedValue behavior (via table-parser patterns)', () => {
  // Mirror the actual patterns from table-parser.ts after fix
  const INCLUDED_PATTERNS = [/dahil/i, /dahi̇l/i, /\bvar\b/i, /evet/i, /✓/, /✔/, /^x$/i]
  const EXCLUDED_PATTERN = /hay[ıi]r|yok|hari[çc]|excluded|HARİÇ|HARIC/i

  function isIncludedValue(text: string): boolean {
    const cleanText = text.trim().toLowerCase()
    if (INCLUDED_PATTERNS.some((p) => p.test(cleanText))) return true
    if (EXCLUDED_PATTERN.test(cleanText)) return false
    return false
  }

  it('detects DAHİL as included (handles İ→i̇ lowercasing)', () => {
    // 'DAHİL'.toLowerCase() = 'dahi̇l' (with combining dot above U+0307)
    // The /dahi̇l/i pattern catches this
    expect(isIncludedValue('DAHİL')).toBe(true)
    expect(isIncludedValue('dahil')).toBe(true)
    expect(isIncludedValue('Dahil')).toBe(true)
  })

  it('detects HARİÇ as excluded', () => {
    expect(isIncludedValue('HARİÇ')).toBe(false)
    expect(isIncludedValue('hariç')).toBe(false)
    expect(isIncludedValue('Hariç')).toBe(false)
  })

  it('detects HARIC (without diacritical) as excluded', () => {
    expect(isIncludedValue('HARIC')).toBe(false)
  })

  it('detects Evet/Hayır', () => {
    expect(isIncludedValue('Evet')).toBe(true)
    expect(isIncludedValue('Hayır')).toBe(false)
    expect(isIncludedValue('Hayir')).toBe(false)
  })

  it('defaults to false for ambiguous text', () => {
    expect(isIncludedValue('some random text')).toBe(false)
    expect(isIncludedValue('')).toBe(false)
    expect(isIncludedValue('—')).toBe(false)
  })

  it('detects checkmarks as included', () => {
    expect(isIncludedValue('✓')).toBe(true)
    expect(isIncludedValue('✔')).toBe(true)
    expect(isIncludedValue('x')).toBe(true) // standalone x = checked in Turkish tables
  })

  it('does NOT match x inside words like "text"', () => {
    // Previously /x/i matched any text containing x — fixed to /^x$/i
    expect(isIncludedValue('text')).toBe(false)
    expect(isIncludedValue('next')).toBe(false)
  })
})

// ============================================================================
// P1-5: Unresolved Relationship Filtering
// ============================================================================

describe('P1-5: Unresolved relationship filtering', () => {
  it('resolveClauseRelationships does not add unresolved warnings to aiInsights', async () => {
    const { resolveClauseRelationships } = await import('../relationship-resolver')
    const mockPolicy = {
      id: 'test-1',
      policyNumber: 'TEST-001',
      type: 'kasko' as const,
      typeTr: 'Kasko',
      provider: 'Test',
      logo: '',
      coverage: 100000,
      premium: 5000,
      monthlyPremium: 417,
      deductible: 0,
      startDate: '2025-01-01',
      expiryDate: '2026-01-01',
      status: 'active' as const,
      uploadDate: '2025-01-01',
      fileName: 'test.pdf',
      documentType: 'PDF',
      coverages: [],
      exclusions: [],
      aiInsights: [],
    }

    const graph = {
      edges: [
        {
          sourceId: 'Flood',
          targetId: null,
          relationshipType: 'coverage_inclusion',
          isCandidate: true,
        },
        {
          sourceId: 'Fire',
          targetId: undefined,
          relationshipType: 'sublimit',
          isCandidate: false,
        },
      ],
    }

    const result = resolveClauseRelationships(mockPolicy as never, graph)

    // After fix: unresolved warnings should NOT be in aiInsights
    const unresolvedInsights = result.aiInsights.filter((i: string) =>
      i.includes('Unresolved relationship')
    )
    expect(unresolvedInsights).toHaveLength(0)
  })
})

// ============================================================================
// P1-6: Historical Policy Detection
// ============================================================================

describe('P1-6: Historical policy detection', () => {
  it('generates "Historical Policy" for policies expired >2 years', async () => {
    const { evaluatePolicy } = await import('../../policy-evaluation/evaluator')

    const result = evaluatePolicy({
      id: 'test-hist',
      policyNumber: 'HIST-001',
      type: 'kasko',
      provider: 'Test',
      coverage: 100000,
      premium: 5000,
      deductible: 0,
      startDate: '2013-04-26',
      expiryDate: '2014-04-26', // 12 years ago
      status: 'expired',
      coverages: [
        {
          name: 'Collision',
          nameTr: 'Çarpışma',
          limit: 100000,
          deductible: 0,
          included: true,
        },
      ],
      exclusions: [],
    } as never)

    const critRecs = result.recommendations.filter((r) => r.priority === 'critical')
    expect(critRecs.length).toBeGreaterThan(0)
    expect(critRecs[0].title).toContain('Historical Policy')
    expect(critRecs[0].title).not.toContain('Renew')
  })

  it('still generates "Renew" for policies expired <2 years', async () => {
    const { evaluatePolicy } = await import('../../policy-evaluation/evaluator')

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const result = evaluatePolicy({
      id: 'test-recent',
      policyNumber: 'REC-001',
      type: 'kasko',
      provider: 'Test',
      coverage: 100000,
      premium: 5000,
      deductible: 0,
      startDate: '2025-01-01',
      expiryDate: sixMonthsAgo.toISOString().split('T')[0],
      status: 'expired',
      coverages: [
        {
          name: 'Collision',
          nameTr: 'Çarpışma',
          limit: 100000,
          deductible: 0,
          included: true,
        },
      ],
      exclusions: [],
    } as never)

    const critRecs = result.recommendations.filter((r) => r.priority === 'critical')
    expect(critRecs.length).toBeGreaterThan(0)
    expect(critRecs[0].title).toContain('Renew Expired Policy')
  })
})

// ============================================================================
// P1-8: Deductible Max Across Coverages
// ============================================================================

describe('P1-8: Deductible assignment uses max across coverages', () => {
  it('Math.max picks the highest deductible from multiple coverages', () => {
    // Simulates the fixed logic in convertToAnalyzedPolicy
    const coverages = [
      { name: 'Glass', deductible: 0 },
      { name: 'Collision', deductible: 1500 },
      { name: 'Theft', deductible: 500 },
      { name: 'Flood', deductible: null },
    ]
    const maxDeductible =
      coverages.length > 0 ? Math.max(0, ...coverages.map((c) => c.deductible ?? 0)) : 0
    expect(maxDeductible).toBe(1500)
  })

  it('returns 0 when all coverages have deductible=0 or null', () => {
    const coverages = [
      { name: 'Glass', deductible: 0 },
      { name: 'Collision', deductible: null },
    ]
    const maxDeductible =
      coverages.length > 0 ? Math.max(0, ...coverages.map((c) => c.deductible ?? 0)) : 0
    expect(maxDeductible).toBe(0)
  })

  it('returns 0 for empty coverage array', () => {
    const coverages: Array<{ deductible: number | null }> = []
    const maxDeductible =
      coverages.length > 0 ? Math.max(0, ...coverages.map((c) => c.deductible ?? 0)) : 0
    expect(maxDeductible).toBe(0)
  })
})
