import { describe, it, expect } from 'vitest'
import {
  evaluateDisplayMode,
  RESTRICTED_THRESHOLD,
  HUMAN_REVIEW_THRESHOLD,
  MAX_AMBIGUITY_FLAGS,
  MIN_OVERALL_CONFIDENCE,
} from '../review-thresholds'
import { generateAnalysisBundle } from '../engine'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'

function makeData(overrides: Partial<ExtractedPolicyData> = {}): ExtractedPolicyData {
  return {
    policyType: 'kasko',
    premium: 12000,
    confidence: {
      overall: 0.95,
      premium: 0.95,
      coverages: 0.9,
      policyNumber: 0.99,
      provider: 0.99,
      dates: 0.99,
    },
    coverages: [{ name: 'Kasko', isMarketValue: true, deductible: 0 }],
    exclusions: [],
    specialConditions: [],
    policyNumber: 'K-001',
    provider: 'Test Sigorta',
    ...overrides,
  } as ExtractedPolicyData
}

describe('evaluateDisplayMode', () => {
  it('returns full mode for high-quality extraction', () => {
    const data = makeData()
    const validation: ValidationResult = { isValid: true, flags: [] }
    const analysis = generateAnalysisBundle('test', data, validation)
    const result = evaluateDisplayMode(data, validation, analysis)

    expect(result.mode).toBe('full')
    expect(result.triggers).toHaveLength(0)
  })

  it('returns human_review_required when validator has blocking errors', () => {
    const data = makeData()
    const validation: ValidationResult = {
      isValid: false,
      // @ts-expect-error - mismatch due to schema update
      flags: [{ level: 'Error', message: 'Critical conflict', ruleId: 'E1' }],
    }
    const analysis = generateAnalysisBundle('test', data, validation)
    const result = evaluateDisplayMode(data, validation, analysis)

    expect(result.mode).toBe('human_review_required')
    expect(result.triggers.some((t) => t.triggerRule === 'VALIDATOR_BLOCKING_ERRORS')).toBe(true)
  })

  it('returns restricted when overall confidence is below threshold', () => {
    const data = makeData({
      confidence: {
        overall: 0.4,
        premium: 0.4,
        coverages: 0.3,
        policyNumber: 0.5,
        provider: 0.5,
        dates: 0.5,
      },
    })
    const validation: ValidationResult = { isValid: true, flags: [] }
    const analysis = generateAnalysisBundle('test', data, validation)
    const result = evaluateDisplayMode(data, validation, analysis)

    expect(result.mode).toBe('restricted')
    expect(result.triggers.some((t) => t.triggerRule === 'LOW_OVERALL_CONFIDENCE')).toBe(true)
  })

  it('returns restricted when ambiguity count exceeds threshold', () => {
    const data = makeData()
    const validation: ValidationResult = {
      isValid: false,
      flags: Array.from({ length: MAX_AMBIGUITY_FLAGS + 1 }, (_, i) => ({
        level: 'Warning' as const,
        message: `Test ${i}`,
        ruleId: `W${i}`,
      })),
    }
    const analysis = generateAnalysisBundle('test', data, validation)
    const result = evaluateDisplayMode(data, validation, analysis)

    expect(result.mode).toBe('restricted')
    expect(result.triggers.some((t) => t.triggerRule === 'HIGH_AMBIGUITY_COUNT')).toBe(true)
  })

  it('returns restricted when critical fields are missing', () => {
    const data = makeData({ policyNumber: null, provider: null })
    const validation: ValidationResult = { isValid: true, flags: [] }
    const analysis = generateAnalysisBundle('test', data, validation)
    const result = evaluateDisplayMode(data, validation, analysis)

    expect(result.mode).toBe('restricted')
    expect(result.triggers.some((t) => t.triggerRule === 'MISSING_POLICY_NUMBER')).toBe(true)
    expect(result.triggers.some((t) => t.triggerRule === 'MISSING_PROVIDER')).toBe(true)
  })

  it('exports threshold constants for testability', () => {
    expect(RESTRICTED_THRESHOLD).toBe(50)
    expect(HUMAN_REVIEW_THRESHOLD).toBe(30)
    expect(MAX_AMBIGUITY_FLAGS).toBe(5)
    expect(MIN_OVERALL_CONFIDENCE).toBe(0.6)
  })
})
