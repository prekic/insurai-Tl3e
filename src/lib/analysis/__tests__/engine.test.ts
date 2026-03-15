import { describe, it, expect } from 'vitest'
import { generateAnalysisBundle } from '../engine'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'

describe('generateAnalysisBundle', () => {
  it('correctly generates separated analysis bundles for a KASKO policy', () => {
    const mockData: ExtractedPolicyData = {
      policyType: 'kasko',
      policyNumber: '12345',
      provider: 'Test Sigorta',
      premium: 12000,
      confidence: {
        overall: 0.95,
        premium: 0.95,
        coverages: 0.9,
        policyNumber: 0.99,
        provider: 0.99,
        dates: 0.99,
      },
      coverages: [
        {
          name: 'Kasko',
          isMarketValue: true, // Rayiç değer flag
          deductible: 0,
        },
        {
          name: 'İMM',
          limit: 10000000, // 10 Million IMM
          isUnlimited: false,
          deductible: 0,
        },
      ],
      exclusions: [],
      specialConditions: [],
    } as ExtractedPolicyData

    const mockValidation: ValidationResult = {
      isValid: true,
      flags: [],
    }

    const bundle = generateAnalysisBundle('test-pol-1', mockData, mockValidation)

    // 1. Check Root
    expect(bundle.policyId).toBe('test-pol-1')
    expect(bundle.analysisVersion).toBe('1.0.0')

    // 2. Check Scores (Workstream A)
    expect(bundle.scoreBundle.overallScore).toBeGreaterThan(0)
    // Structure score should be high due to Rayic Deger and high IMM
    const structScore = bundle.scoreBundle.scores.policyStructureScore
    expect(structScore?.scoreValue).toBeGreaterThanOrEqual(8)

    // Consumer Safety should be high due to no deductibles
    const safetyScore = bundle.scoreBundle.scores.consumerSafetyScore
    expect(safetyScore?.scoreValue).toBeGreaterThanOrEqual(70)

    // 3. Check Insights (Workstream B)
    // Should have deterministic Rayic Deger insight
    const rayicInsight = bundle.insightBundle.insights.find(
      (i) => i.generatedByRule === 'DETERMINISTIC_RAYIC_DEGER'
    )
    expect(rayicInsight).toBeDefined()
    expect(rayicInsight?.type).toBe('positive_confirmed')

    // 4. Check Benchmarks (Workstream C)
    // Should have reference and comparison
    expect(bundle.benchmarkBundle.comparisons.length).toBeGreaterThan(0)
    const premiumComp = bundle.benchmarkBundle.comparisons.find(
      (c) => c.comparedField === 'premium'
    )
    expect(premiumComp).toBeDefined()
    // Since confidence is high (0.95), display must be true
    expect(premiumComp?.displayEligibility).toBe(true)
  })

  it('suppresses benchmark display and insights appropriately for low confidence extractions', () => {
    const mockData: ExtractedPolicyData = {
      policyType: 'kasko',
      premium: 12000,
      confidence: {
        overall: 0.6,
        premium: 0.6, // LOW CONFIDENCE
        coverages: 0.5,
      },
      coverages: [{ name: 'Kasko', isMarketValue: false, deductible: 5000 }],
      evidence: {
        insights: [
          { text: 'Has strict deductible', textEn: 'fully covered', quote: 'test' }, // Danger word
        ],
      },
    } as ExtractedPolicyData

    const mockValidation: ValidationResult = {
      isValid: false,
      flags: [{ level: 'Warning', message: 'Low confidence test', ruleId: 'TEST_01' }],
    }

    const bundle = generateAnalysisBundle('test-pol-2', mockData, mockValidation)

    // Benchmark comparison should be suppressed due to low confidence (0.60 < 0.90)
    const premiumComp = bundle.benchmarkBundle.comparisons.find(
      (c) => c.comparedField === 'premium'
    )
    expect(premiumComp?.displayEligibility).toBe(false)
    expect(premiumComp?.reasonIfSuppressed).toContain('Suppressed')

    // Dangerous insight word ('fully covered') should be suppressed
    const filteredAiInsight = bundle.insightBundle.insights.find(
      (i) => i.generatedByRule === 'AI_RAW_FILTERED'
    )
    expect(filteredAiInsight).toBeDefined()
    expect(filteredAiInsight?.displayEligibility).toBe(false)

    // Extraction quality score should be penalized for warning flag
    const extScore = bundle.scoreBundle.scores.extractionQualityScore
    expect(extScore?.scoreValue).toBe(50)
  })
})
