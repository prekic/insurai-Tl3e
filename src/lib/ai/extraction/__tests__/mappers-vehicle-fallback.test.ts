import { describe, it, expect, vi } from 'vitest'

import { comprehensiveToAnalyzedPolicy } from '../mappers'
import type { ComprehensiveExtractionResult } from '../../policy-extractor'
import type { StructuredPolicyData } from '../../kasko-parser-prompts'

vi.mock('@/lib/i18n/coverage-names', () => ({
  lookupCoverageNameTr: () => null,
}))
vi.mock('@/lib/i18n/exclusion-translations', () => ({
  ensureExclusionsEn: (xs: string[]) => xs,
}))
vi.mock('@/lib/market-data/service', () => ({
  generateMarketComparisonData: () => undefined,
}))
vi.mock('../../insight-translator', () => ({
  translateInsightsToTr: (xs: string[]) => xs,
}))

function makeStructured(
  vehicle: Partial<StructuredPolicyData['vehicle']> | null
): StructuredPolicyData {
  return {
    policy: {
      policyNumber: 'POL-1',
      sbmPolicyNumber: null,
      provider: 'AXA SİGORTA A.Ş.',
      productName: null,
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      issueDate: null,
    },
    insured: { name: 'Test', tcKimlik: null, vkn: null, address: null, phone: null, email: null },
    vehicle: vehicle as StructuredPolicyData['vehicle'],
    premium: { netPremium: 1000, tax: 100, totalPremium: 1100, currency: 'TRY', paymentPlan: null },
    coverages: [],
    exclusions: [],
  } as unknown as StructuredPolicyData
}

function makeResult(
  vehicle: Partial<StructuredPolicyData['vehicle']> | null
): ComprehensiveExtractionResult {
  return {
    success: true,
    policyBrief: null,
    structuredData: makeStructured(vehicle),
    watchOuts: [],
    qualityScore: 80,
    sectionsFound: [],
    preprocessingStats: { garbageBlocksRemoved: 0, qrBlocksRemoved: 0 },
  } as unknown as ComprehensiveExtractionResult
}

const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test.pdf', {
  type: 'application/pdf',
})

describe('comprehensiveToAnalyzedPolicy — vehicleInfo regex fallback', () => {
  it('uses regex fallback when LLM returns vehicle: null', () => {
    const rawText = `
      Plaka : 34 ABC 123
      Marka : RENAULT
      Tip   : MEGANE
      Model Yılı : 2018
    `
    const policy = comprehensiveToAnalyzedPolicy(makeResult(null), file, rawText, rawText)
    expect(policy?.vehicleInfo?.make).toBe('RENAULT')
    expect(policy?.vehicleInfo?.model).toContain('MEGANE')
    expect(policy?.vehicleInfo?.year).toBe(2018)
    expect(policy?.vehicleInfo?.plate).toBe('34 ABC 123')
  })

  it('uses regex fallback to fill gaps when LLM returns only plate', () => {
    const rawText = `
      Plaka : 67 LJ 968
      Marka : FORD
      Tip   : FOCUS
      İmal Yılı : 2020
    `
    const policy = comprehensiveToAnalyzedPolicy(
      makeResult({
        plate: '67 LJ 968',
        make: '',
        model: '',
        year: 0,
        chassisNumber: null,
        engineNumber: null,
        usageType: 'private',
        fuelType: null,
        hasLPG: false,
      }),
      file,
      rawText,
      rawText
    )
    // LLM provided plate; regex fills make/model/year
    expect(policy?.vehicleInfo?.plate).toBe('67 LJ 968')
    expect(policy?.vehicleInfo?.make).toBe('FORD')
    expect(policy?.vehicleInfo?.model).toContain('FOCUS')
    expect(policy?.vehicleInfo?.year).toBe(2020)
  })

  it('LLM value wins when both LLM and regex have a value', () => {
    const rawText = `Marka : RENAULT\nTip : MEGANE\nModel Yılı : 2015`
    const policy = comprehensiveToAnalyzedPolicy(
      makeResult({
        plate: '34 ABC 123',
        make: 'PEUGEOT', // disagrees with regex (RENAULT) — LLM wins
        model: '208',
        year: 2022,
        chassisNumber: null,
        engineNumber: null,
        usageType: 'private',
        fuelType: null,
        hasLPG: false,
      }),
      file,
      rawText,
      rawText
    )
    expect(policy?.vehicleInfo?.make).toBe('PEUGEOT')
    expect(policy?.vehicleInfo?.model).toBe('208')
    expect(policy?.vehicleInfo?.year).toBe(2022)
  })

  it('returns vehicleInfo undefined when both LLM and text yield nothing', () => {
    const rawText = `No vehicle info here at all.`
    const policy = comprehensiveToAnalyzedPolicy(makeResult(null), file, rawText, rawText)
    expect(policy?.vehicleInfo).toBeUndefined()
  })
})
