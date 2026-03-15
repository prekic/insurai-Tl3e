import { describe, it, expect } from 'vitest'
import { generateInsightBundle } from '../insights'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

describe('generateInsightBundle', () => {
  it('emits positive_confirmed for KASKO with rayic deger', () => {
    const data = {
      policyType: 'kasko',
      coverages: [{ name: 'Kasko', isMarketValue: true, deductible: 0 }],
    } as ExtractedPolicyData

    const bundle = generateInsightBundle(data)
    const rayic = bundle.insights.find((i) => i.generatedByRule === 'DETERMINISTIC_RAYIC_DEGER')
    expect(rayic).toBeDefined()
    expect(rayic!.type).toBe('positive_confirmed')
    expect(rayic!.basisType).toBe('policy_fact')
    expect(rayic!.displayEligibility).toBe(true)
  })

  it('emits unresolved_data_gap when KASKO lacks market value', () => {
    const data = {
      policyType: 'kasko',
      coverages: [{ name: 'Kasko', isMarketValue: false, deductible: 0 }],
    } as ExtractedPolicyData

    const bundle = generateInsightBundle(data)
    const missing = bundle.insights.find((i) => i.generatedByRule === 'MISSING_RAYIC_DEGER')
    expect(missing).toBeDefined()
    expect(missing!.type).toBe('unresolved_data_gap')
  })

  it('conditional deductible fact does not become positive_confirmed', () => {
    const data = {
      policyType: 'kasko',
      coverages: [{ name: 'Kasko', isMarketValue: true, deductible: 0 }],
    } as ExtractedPolicyData

    const bundle = generateInsightBundle(data)
    const noDeductible = bundle.insights.find(
      (i) => i.generatedByRule === 'DETERMINISTIC_NO_DEDUCTIBLE_CONDITIONAL'
    )
    expect(noDeductible).toBeDefined()
    // Must be conditional, NOT confirmed
    expect(noDeductible!.type).toBe('positive_conditional')
    expect(noDeductible!.basisType).toBe('conditional_policy_fact')
  })

  it('suppresses dangerous AI insight containing "fully covered"', () => {
    const data = {
      policyType: 'kasko',
      coverages: [],
      evidence: {
        insights: [{ text: 'Test', textEn: 'This policy is fully covered', quote: 'src' }],
      },
    } as ExtractedPolicyData

    const bundle = generateInsightBundle(data)
    const suppressed = bundle.insights.find((i) => i.generatedByRule === 'AI_RAW_FILTERED')
    expect(suppressed).toBeDefined()
    expect(suppressed!.displayEligibility).toBe(false)
    expect(suppressed!.blockingReason).toContain('fully covered')
  })

  it('suppresses "no deductible" phrase from AI insights', () => {
    const data = {
      policyType: 'kasko',
      coverages: [],
      evidence: {
        insights: [{ text: 'Test', textEn: 'There is no deductible at all', quote: 'src' }],
      },
    } as ExtractedPolicyData

    const bundle = generateInsightBundle(data)
    const suppressed = bundle.insights.find((i) => i.generatedByRule === 'AI_RAW_FILTERED')
    expect(suppressed).toBeDefined()
    expect(suppressed!.displayEligibility).toBe(false)
  })

  it('suppresses Turkish prohibited phrase "tam kapsamlı"', () => {
    const data = {
      policyType: 'kasko',
      coverages: [],
      evidence: {
        insights: [{ text: 'Test', textEn: 'tam kapsamlı koruma', quote: 'src' }],
      },
    } as ExtractedPolicyData

    const bundle = generateInsightBundle(data)
    const suppressed = bundle.insights.find((i) => i.generatedByRule === 'AI_RAW_FILTERED')
    expect(suppressed).toBeDefined()
    expect(suppressed!.displayEligibility).toBe(false)
  })

  it('allows safe AI insight through', () => {
    const data = {
      policyType: 'kasko',
      coverages: [],
      evidence: {
        insights: [{ text: 'İyi', textEn: 'Covers theft damage up to limit', quote: 'src' }],
      },
    } as ExtractedPolicyData

    const bundle = generateInsightBundle(data)
    const allowed = bundle.insights.find((i) => i.generatedByRule === 'AI_RAW_ALLOWED')
    expect(allowed).toBeDefined()
    expect(allowed!.displayEligibility).toBe(true)
    expect(allowed!.basisType).toBe('conditional_policy_fact')
  })
})
