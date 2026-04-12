import { describe, it, expect } from 'vitest'
import { generateScoreBundle } from '../scoring'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'

describe('generateScoreBundle', () => {
  // @ts-expect-error - mismatch due to schema update
  const baseData = {
    policyType: 'kasko',
    premium: 12000,
    confidence: { overall: 0.95, premium: 0.95, coverages: 0.9 },
    coverages: [
      { name: 'Kasko', isMarketValue: true, deductible: 0 },
      { name: 'IMM', limit: 10000000, deductible: 0 },
    ],
    exclusions: [],
    specialConditions: [],
  } as ExtractedPolicyData

  const validValidation: ValidationResult = { isValid: true, flags: [] }

  it('produces all 5 distinct score families', () => {
    const bundle = generateScoreBundle(baseData, validValidation)
    const names = Object.keys(bundle.scores)
    expect(names).toContain('extractionQualityScore')
    expect(names).toContain('policyStructureScore')
    expect(names).toContain('consumerSafetyScore')
    expect(names).toContain('competitivenessScore')
    expect(names).toContain('riskAttentionScore')
  })

  it('each score family has distinct scoreName matching its key', () => {
    const bundle = generateScoreBundle(baseData, validValidation)
    for (const [key, detail] of Object.entries(bundle.scores)) {
      expect(detail.scoreName).toBe(key)
    }
  })

  it('internalOverallScore is marked internalOnly:true', () => {
    const bundle = generateScoreBundle(baseData, validValidation)
    expect(bundle.internalOverallScore.internalOnly).toBe(true)
    expect(bundle.internalOverallScore.derivationRule).toContain('AVERAGE')
    expect(bundle.internalOverallScore.contributingFamilies).not.toContain('competitivenessScore')
  })

  it('competitivenessScore is suppressed when no benchmark bundle provided', () => {
    const bundle = generateScoreBundle(baseData, validValidation) // no benchmark
    const comp = bundle.scores.competitivenessScore
    expect(comp.suppressed).toBe(true)
    expect(comp.suppressionReason).toContain('suppressed')
    expect(comp.scoreValue).toBe(0) // not an artificial 50
  })

  it('competitivenessScore is suppressed when benchmark bundle has incomplete provenance', () => {
    const incompleteBenchmark = {
      references: {
        ref1: {
          benchmarkId: 'ref1',
          branch: 'kasko',
          provenance: {
            sourceName: '',
            sourceVersion: 'v1',
            geography: 'tr-TR',
            effectiveDateRange: { start: '2024-01-01' },
            marketSegment: 'retail',
            productType: 'standard',
            matchType: 'approximate' as const,
            matchConfidence: 0.95,
            dataQuality: 'high' as const,
          },
          metricName: 'avg_premium',
          metricValue: 15000,
        },
      },
      comparisons: [],
      bundleVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
    }
    const bundle = generateScoreBundle(baseData, validValidation, incompleteBenchmark)
    const comp = bundle.scores.competitivenessScore
    expect(comp.suppressed).toBe(true)
  })

  it('extractionQualityScore is penalized by validation warnings', () => {
    const warningValidation: ValidationResult = {
      isValid: false,
      flags: [
        // @ts-expect-error - mismatch due to schema update
        { level: 'Warning', message: 'test', ruleId: 'T1' },
        // @ts-expect-error - mismatch due to schema update
        { level: 'Warning', message: 'test2', ruleId: 'T2' },
      ],
    }
    const bundle = generateScoreBundle(baseData, warningValidation)
    const ext = bundle.scores.extractionQualityScore
    // Base 95 - 2*10 = 75
    expect(ext.scoreValue).toBe(75)
  })

  it('extractionQualityScore is severely penalized by errors', () => {
    const errorValidation: ValidationResult = {
      isValid: false,
      // @ts-expect-error - mismatch due to schema update
      flags: [{ level: 'Error', message: 'critical', ruleId: 'E1' }],
    }
    const bundle = generateScoreBundle(baseData, errorValidation)
    const ext = bundle.scores.extractionQualityScore
    // Base 95 - 30 = 65
    expect(ext.scoreValue).toBe(65)
  })
})
