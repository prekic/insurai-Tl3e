/**
 * Regression tests for KASKO QA audit findings.
 *
 * Tests the 9 bugs identified during human evaluation of the
 * AXA Erdemir Kasko policy. Each test targets a specific bug fix.
 */
import { describe, it, expect } from 'vitest'
import { normalizeOCRTextForExtraction } from '@/lib/policy-utils'
import { extractVehicleInfoFromText, parseTurkishCurrency } from '@/lib/ai/turkish-utils'
import { evaluatePolicy } from '@/lib/policy-evaluation/evaluator'
import type { AnalyzedPolicy } from '@/types/policy'

// ============================================================================
// Bug #1: Premium 10× inflation — Turkish number format
// ============================================================================

describe('Bug #1: Turkish number format normalization', () => {
  it('normalizes 5-digit number: 10.805,80 → 10805.80', () => {
    const result = normalizeOCRTextForExtraction('Ödenecek Prim: 10.805,80 TL')
    expect(result).toContain('10805.80')
    expect(result).not.toContain('10.805,80')
  })

  it('normalizes 6-digit number: 875.674,88 → 875674.88', () => {
    const result = normalizeOCRTextForExtraction('Toplam: 875.674,88 TL')
    expect(result).toContain('875674.88')
  })

  it('normalizes 7-digit number: 3.000.000,00 → 3000000.00', () => {
    const result = normalizeOCRTextForExtraction('Limit: 3.000.000,00 TL')
    expect(result).toContain('3000000.00')
  })

  it('normalizes large number: 12.345.678.901,23 → 12345678901.23', () => {
    const result = normalizeOCRTextForExtraction('Bedel: 12.345.678.901,23 TL')
    expect(result).toContain('12345678901.23')
  })

  it('does NOT corrupt dates like 15.01.2026', () => {
    const result = normalizeOCRTextForExtraction('Tarih: 15.01.2026')
    // Dates have dd.mm.yyyy format — should NOT be treated as currency
    expect(result).toContain('15.01.2026')
  })

  it('does NOT corrupt 4-digit numbers like 2016 (year)', () => {
    const result = normalizeOCRTextForExtraction('Model Bilgisi: 2016')
    expect(result).toContain('2016')
  })

  it('parseTurkishCurrency correctly parses 10.805,80', () => {
    const result = parseTurkishCurrency('10.805,80 TL')
    expect(result).toBeCloseTo(10805.8, 2)
  })

  it('parseTurkishCurrency correctly parses 10.291,24', () => {
    const result = parseTurkishCurrency('10.291,24')
    expect(result).toBeCloseTo(10291.24, 2)
  })

  it('handles net premium BSMV breakdown', () => {
    const text = 'Net Prim: 10.291,24 TL\nBSMV: 514,56 TL\nÖdenecek Prim: 10.805,80 TL'
    const normalized = normalizeOCRTextForExtraction(text)
    expect(normalized).toContain('10291.24')
    // 514,56 has no dot-thousands separator, so OCR normalizer correctly
    // leaves it unchanged. parseTurkishCurrency handles it separately.
    expect(parseTurkishCurrency('514,56')).toBeCloseTo(514.56, 2)
    expect(normalized).toContain('10805.80')
  })
})

// ============================================================================
// Bug #2: IMM misread as missing
// ============================================================================

describe('Bug #2: IMM detection with "Mali Sorumluluk" label', () => {
  function makePolicy(coverages: AnalyzedPolicy['coverages']): AnalyzedPolicy {
    return {
      id: 'test-imm',
      policyNumber: 'IMM-TEST',
      provider: 'Test',
      type: 'kasko',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      premium: 10000,
      currency: 'TRY',
      coverage: 3000000,
      coverages,
      deductible: 0,
      exclusions: [],
      status: 'active',
    } as AnalyzedPolicy
  }

  it('detects IMM via "Mali Sorumluluk — Bedeni ve Maddi"', () => {
    const policy = makePolicy([
      {
        name: 'Mali Sorumluluk — Bedeni ve Maddi',
        nameTr: 'Mali Sorumluluk',
        limit: 3000000,
        included: true,
        isUnlimited: false,
        isMarketValue: false,
        category: 'liability',
      },
    ])
    const result = evaluatePolicy(policy)
    const immCard = result.scenarioCards?.find((c) => c.id === 'imm-scenario')
    expect(immCard).toBeDefined()
    // Should NOT say "lacks IMM"
    expect(immCard?.description).not.toMatch(/lacks/i)
    // Should report the limited amount
    expect(immCard?.financialStatus).toBe('risk') // limited = risk
  })

  it('detects IMM via "Artan Mali Sorumluluk"', () => {
    const policy = makePolicy([
      {
        name: 'Artan Mali Sorumluluk',
        nameTr: 'Artan Mali Sorumluluk',
        limit: 0,
        included: true,
        isUnlimited: true,
        isMarketValue: false,
        category: 'liability',
      },
    ])
    const result = evaluatePolicy(policy)
    const immCard = result.scenarioCards?.find((c) => c.id === 'imm-scenario')
    expect(immCard).toBeDefined()
    expect(immCard?.financialStatus).toBe('covered') // unlimited = covered
  })

  it('detects IMM via "Bedeni ve Maddi" in nameTr', () => {
    const policy = makePolicy([
      {
        name: 'Voluntary Liability',
        nameTr: 'Bedeni ve Maddi Zarar',
        limit: 5000000,
        included: true,
        isUnlimited: false,
        isMarketValue: false,
        category: 'liability',
      },
    ])
    const result = evaluatePolicy(policy)
    const immCard = result.scenarioCards?.find((c) => c.id === 'imm-scenario')
    expect(immCard).toBeDefined()
    expect(immCard?.description).not.toMatch(/lacks/i)
  })
})

// ============================================================================
// Bug #3: Model year extraction failure
// ============================================================================

describe('Bug #3: Model year extraction from "Model Bilgisi"', () => {
  it('extracts year from "Model Bilgisi: 2016"', () => {
    const info = extractVehicleInfoFromText('Model Bilgisi: 2016\nMarka: MERCEDES')
    expect(info?.year).toBe(2016)
  })

  it('still extracts from "Model Yılı: 2020"', () => {
    const info = extractVehicleInfoFromText('Model Yılı: 2020\nMarka: BMW')
    expect(info?.year).toBe(2020)
  })

  it('extracts from bare "MODEL: 1997"', () => {
    const info = extractVehicleInfoFromText('MODEL: 1997\nMARKA: IVECO')
    expect(info?.year).toBe(1997)
  })
})

// ============================================================================
// Bug #4: Deductible score contradiction
// ============================================================================

describe('Bug #4: Deductible score caps when conditionalDeductibles present', () => {
  function makePolicy(conditionals: unknown[]): AnalyzedPolicy {
    return {
      id: 'test-ded',
      policyNumber: 'DED-TEST',
      provider: 'Test',
      type: 'kasko',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      premium: 10000,
      currency: 'TRY',
      coverage: 500000,
      coverages: [
        {
          name: 'Kasko',
          limit: 500000,
          included: true,
          isUnlimited: false,
          isMarketValue: false,
          category: 'main',
        },
      ],
      deductible: 0,
      exclusions: [],
      status: 'active',
      conditionalDeductibles: conditionals,
    } as unknown as AnalyzedPolicy
  }

  it('scores ≤ 80 when conditional deductibles exist', () => {
    // conditionalDeductibles is typed as string[] per the schema (gotcha
    // #93). Pre-Sprint-2-#7 the evaluator never iterated the array so an
    // object slipped through; now that we emit one Issue per entry the
    // input must be schema-correct strings.
    const policy = makePolicy(['Glass repairs outside AXA network: %20'])
    const result = evaluatePolicy(policy)
    const dedScore = result.scoreBreakdown.deductible
    expect(dedScore).toBeDefined()
    expect(dedScore.score).toBeLessThanOrEqual(80)
    expect(dedScore.details).toContain('conditional deductible')
  })

  it('scores 95 when no conditional deductibles', () => {
    const policy = makePolicy([])
    const result = evaluatePolicy(policy)
    const dedScore = result.scoreBreakdown.deductible
    expect(dedScore).toBeDefined()
    expect(dedScore.score).toBe(95)
  })
})

// ============================================================================
// Bug #5: Fleet clause scenario card
// ============================================================================

describe('Bug #5: Fleet count trap detection', () => {
  function makePolicy(specialConditions: string[]): AnalyzedPolicy {
    return {
      id: 'test-fleet',
      policyNumber: 'FLEET-TEST',
      provider: 'Test',
      type: 'kasko',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      premium: 50000,
      currency: 'TRY',
      coverage: 500000,
      coverages: [
        {
          name: 'Kasko',
          limit: 500000,
          included: true,
          isUnlimited: false,
          isMarketValue: false,
          category: 'main',
        },
      ],
      deductible: 0,
      exclusions: [],
      specialConditions,
      status: 'active',
    } as unknown as AnalyzedPolicy
  }

  it('generates fleet-risk card when "Poliçe Adet Kontrol" clause present', () => {
    const policy = makePolicy([
      'POLİÇE ADET KONTROL KLOZU: Filo 10 adetten aşağı düşerse prim farkı zeyl düzenlenir.',
    ])
    const result = evaluatePolicy(policy)
    const fleetCard = result.scenarioCards?.find((c) => c.id === 'fleet-risk')
    expect(fleetCard).toBeDefined()
    expect(fleetCard?.financialStatus).toBe('risk')
  })

  it('does not generate fleet card when no fleet clause', () => {
    const policy = makePolicy([])
    const result = evaluatePolicy(policy)
    const fleetCard = result.scenarioCards?.find((c) => c.id === 'fleet-risk')
    expect(fleetCard).toBeUndefined()
  })
})

// ============================================================================
// Bug #9: Manevi tazminat detection
// ============================================================================

describe('Bug #9: Manevi Tazminat positive finding', () => {
  function makePolicy(coverages: AnalyzedPolicy['coverages']): AnalyzedPolicy {
    return {
      id: 'test-manevi',
      policyNumber: 'MAN-TEST',
      provider: 'Test',
      type: 'kasko',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      premium: 10000,
      currency: 'TRY',
      coverage: 500000,
      coverages,
      deductible: 0,
      exclusions: [],
      status: 'active',
    } as AnalyzedPolicy
  }

  it('generates manevi-tazminat card when coverage mentions it', () => {
    const policy = makePolicy([
      {
        name: 'IMM — Manevi Tazminat dahil',
        nameTr: 'Mali Sorumluluk',
        limit: 3000000,
        included: true,
        isUnlimited: false,
        isMarketValue: false,
        category: 'liability',
        description:
          'Manevi Tazminat talepleri bedeni zararlar limitleri ile teminat kapsamına dahil edilmiştir',
      },
    ])
    const result = evaluatePolicy(policy)
    const maneviCard = result.scenarioCards?.find((c) => c.id === 'manevi-tazminat')
    expect(maneviCard).toBeDefined()
    expect(maneviCard?.financialStatus).toBe('covered')
  })
})

// ============================================================================
// Bug #6: Contextual risk linking (Industry classifier)
// ============================================================================

describe('Bug #6: Contextual risk linking', () => {
  function makePolicy(insuredPerson: string, exclusions: string[]): AnalyzedPolicy {
    return {
      id: 'test-context',
      policyNumber: 'CTX-TEST',
      provider: 'Test',
      type: 'kasko',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      premium: 10000,
      currency: 'TRY',
      coverage: 500000,
      coverages: [
        {
          name: 'Kasko',
          limit: 500000,
          included: true,
          isUnlimited: false,
          isMarketValue: false,
          category: 'main',
        },
      ],
      deductible: 0,
      exclusions,
      status: 'active',
      insuredPerson,
    } as unknown as AnalyzedPolicy
  }

  it('generates contextual-risk card for mining company with quarry exclusion', () => {
    const policy = makePolicy('ÖRNEK MADENCİLİK A.Ş.', [
      'Maden ocakları ve şantiye sahasında meydana gelen zararlar teminat dışıdır.',
    ])
    const result = evaluatePolicy(policy)
    const riskCard = result.scenarioCards?.find((c) => c.id === 'contextual-risk')
    expect(riskCard).toBeDefined()
    expect(riskCard?.financialStatus).toBe('risk')
    expect(riskCard?.description).toContain('mining')
  })

  it('generates contextual-risk card for construction company with site exclusion', () => {
    const policy = makePolicy('ÖZKAN HAFRİYAT İNŞAAT LTD', ['Santiye sahaları kapsam dışıdır.'])
    const result = evaluatePolicy(policy)
    const riskCard = result.scenarioCards?.find((c) => c.id === 'contextual-risk')
    expect(riskCard).toBeDefined()
    expect(riskCard?.financialStatus).toBe('risk')
    expect(riskCard?.description).toContain('construction')
  })

  it('does not generate risk card if no exclusions match', () => {
    const policy = makePolicy('ÖRNEK MADENCİLİK A.Ş.', ['Alkol kullanımı teminat dışıdır.'])
    const result = evaluatePolicy(policy)
    const riskCard = result.scenarioCards?.find((c) => c.id === 'contextual-risk')
    expect(riskCard).toBeUndefined()
  })

  it('does not generate risk card for generic company even with quarry exclusion', () => {
    const policy = makePolicy('ÖRNEK YAZILIM A.Ş.', [
      'Şantiye sahasında meydana gelen zararlar teminat dışıdır.',
    ])
    const result = evaluatePolicy(policy)
    const riskCard = result.scenarioCards?.find((c) => c.id === 'contextual-risk')
    expect(riskCard).toBeUndefined()
  })
})
