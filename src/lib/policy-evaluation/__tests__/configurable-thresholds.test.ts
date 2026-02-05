/**
 * Tests for configurable grade and status thresholds in policy evaluation
 */

import { describe, it, expect } from 'vitest'
import {
  getGradeFromScore,
  getStatusFromScore,
  convertDatabaseConfigToEvaluatorConfig,
} from '../types'
import { evaluatePolicy, type EvaluatePolicyOptions } from '../evaluator'
import type { Policy } from '@/types/policy'

describe('Configurable Grade Thresholds', () => {
  describe('getGradeFromScore', () => {
    it('should return correct grades with default thresholds', () => {
      expect(getGradeFromScore(95)).toBe('A')
      expect(getGradeFromScore(90)).toBe('A')
      expect(getGradeFromScore(85)).toBe('B')
      expect(getGradeFromScore(80)).toBe('B')
      expect(getGradeFromScore(75)).toBe('C')
      expect(getGradeFromScore(70)).toBe('C')
      expect(getGradeFromScore(65)).toBe('D')
      expect(getGradeFromScore(60)).toBe('D')
      expect(getGradeFromScore(50)).toBe('F')
      expect(getGradeFromScore(0)).toBe('F')
    })

    it('should use custom thresholds when provided', () => {
      const customThresholds = {
        gradeAThreshold: 95,
        gradeBThreshold: 85,
        gradeCThreshold: 75,
        gradeDThreshold: 65,
      }

      // With custom thresholds, 90 is now B instead of A
      expect(getGradeFromScore(90, customThresholds)).toBe('B')
      expect(getGradeFromScore(95, customThresholds)).toBe('A')
      expect(getGradeFromScore(80, customThresholds)).toBe('C')
      expect(getGradeFromScore(70, customThresholds)).toBe('D')
      expect(getGradeFromScore(60, customThresholds)).toBe('F')
    })

    it('should handle edge cases at threshold boundaries', () => {
      const thresholds = {
        gradeAThreshold: 90,
        gradeBThreshold: 80,
        gradeCThreshold: 70,
        gradeDThreshold: 60,
      }

      expect(getGradeFromScore(90, thresholds)).toBe('A')
      expect(getGradeFromScore(89.99, thresholds)).toBe('B')
      expect(getGradeFromScore(80, thresholds)).toBe('B')
      expect(getGradeFromScore(79.99, thresholds)).toBe('C')
      expect(getGradeFromScore(70, thresholds)).toBe('C')
      expect(getGradeFromScore(69.99, thresholds)).toBe('D')
      expect(getGradeFromScore(60, thresholds)).toBe('D')
      expect(getGradeFromScore(59.99, thresholds)).toBe('F')
    })

    it('should handle very lenient thresholds', () => {
      const lenientThresholds = {
        gradeAThreshold: 80,
        gradeBThreshold: 60,
        gradeCThreshold: 40,
        gradeDThreshold: 20,
      }

      expect(getGradeFromScore(80, lenientThresholds)).toBe('A')
      expect(getGradeFromScore(60, lenientThresholds)).toBe('B')
      expect(getGradeFromScore(40, lenientThresholds)).toBe('C')
      expect(getGradeFromScore(20, lenientThresholds)).toBe('D')
      expect(getGradeFromScore(10, lenientThresholds)).toBe('F')
    })

    it('should handle very strict thresholds', () => {
      const strictThresholds = {
        gradeAThreshold: 98,
        gradeBThreshold: 95,
        gradeCThreshold: 90,
        gradeDThreshold: 85,
      }

      expect(getGradeFromScore(98, strictThresholds)).toBe('A')
      expect(getGradeFromScore(95, strictThresholds)).toBe('B')
      expect(getGradeFromScore(90, strictThresholds)).toBe('C')
      expect(getGradeFromScore(85, strictThresholds)).toBe('D')
      expect(getGradeFromScore(80, strictThresholds)).toBe('F')
    })
  })

  describe('getStatusFromScore', () => {
    it('should return correct status with default thresholds', () => {
      expect(getStatusFromScore(92)).toBe('excellent')
      expect(getStatusFromScore(82)).toBe('good')
      expect(getStatusFromScore(72)).toBe('fair')
      expect(getStatusFromScore(52)).toBe('poor')
      expect(getStatusFromScore(32)).toBe('critical')
    })

    it('should use custom thresholds when provided', () => {
      const customThresholds = {
        statusExcellentThreshold: 95,
        statusGoodThreshold: 85,
        statusFairThreshold: 75,
        statusPoorThreshold: 65,
      }

      expect(getStatusFromScore(95, customThresholds)).toBe('excellent')
      expect(getStatusFromScore(90, customThresholds)).toBe('good')
      expect(getStatusFromScore(80, customThresholds)).toBe('fair')
      expect(getStatusFromScore(70, customThresholds)).toBe('poor')
      expect(getStatusFromScore(60, customThresholds)).toBe('critical')
    })

    it('should handle edge cases at threshold boundaries', () => {
      const thresholds = {
        statusExcellentThreshold: 90,
        statusGoodThreshold: 80,
        statusFairThreshold: 70,
        statusPoorThreshold: 50,
      }

      expect(getStatusFromScore(90, thresholds)).toBe('excellent')
      expect(getStatusFromScore(89.99, thresholds)).toBe('good')
      expect(getStatusFromScore(80, thresholds)).toBe('good')
      expect(getStatusFromScore(79.99, thresholds)).toBe('fair')
    })
  })
})

describe('convertDatabaseConfigToEvaluatorConfig', () => {
  it('should convert weight values correctly', () => {
    const dbConfig = {
      weightPremium: 25,
      weightCoverage: 35,
      weightDeductible: 10,
      weightCompliance: 15,
      weightValue: 15,
    }

    const result = convertDatabaseConfigToEvaluatorConfig(dbConfig)

    expect(result.weights).toBeDefined()
    expect(result.weights?.premium).toBe(25)
    expect(result.weights?.coverage).toBe(35)
    expect(result.weights?.deductible).toBe(10)
    expect(result.weights?.compliance).toBe(15)
    expect(result.weights?.value).toBe(15)
  })

  it('should use defaults for missing weight values', () => {
    const dbConfig = {
      weightPremium: 30,
      // Other weights not specified
    }

    const result = convertDatabaseConfigToEvaluatorConfig(dbConfig)

    expect(result.weights?.premium).toBe(30)
    // Other weights should use defaults
    expect(result.weights?.coverage).toBeDefined()
    expect(result.weights?.deductible).toBeDefined()
  })

  it('should copy boolean options', () => {
    const dbConfig = {
      strictCompliance: true,
      includeOptionalCoverages: false,
      useRegionalBenchmarks: true,
    }

    const result = convertDatabaseConfigToEvaluatorConfig(dbConfig)

    expect(result.strictCompliance).toBe(true)
    expect(result.includeOptionalCoverages).toBe(false)
    expect(result.useRegionalBenchmarks).toBe(true)
  })

  it('should handle empty database config', () => {
    const result = convertDatabaseConfigToEvaluatorConfig({})

    expect(result).toEqual({})
  })

  it('should handle partial weight specification', () => {
    const dbConfig = {
      weightPremium: 20,
      weightCoverage: 40,
      // Other weights undefined
    }

    const result = convertDatabaseConfigToEvaluatorConfig(dbConfig)

    expect(result.weights?.premium).toBe(20)
    expect(result.weights?.coverage).toBe(40)
  })
})

describe('evaluatePolicy with EvaluatePolicyOptions', () => {
  const createTestPolicy = (): Policy => ({
    id: 'test-policy-1',
    policyNumber: 'POL-2026-001',
    provider: 'Test Sigorta',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 100000,
    premium: 5000,
    deductible: 1000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [
      { name: 'Collision', nameTr: 'Çarpma', limit: 100000, deductible: 1000, included: true },
    ],
    exclusions: [],
  })

  it('should accept options object with config', () => {
    const policy = createTestPolicy()
    const options: EvaluatePolicyOptions = {
      config: {
        weights: {
          premium: 30,
          coverage: 30,
          deductible: 10,
          compliance: 15,
          value: 15,
        },
      },
    }

    const result = evaluatePolicy(policy, options)

    expect(result).toBeDefined()
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
    expect(result.overallScore).toBeLessThanOrEqual(100)
  })

  it('should use custom grade thresholds', () => {
    const policy = createTestPolicy()
    const options: EvaluatePolicyOptions = {
      gradeThresholds: {
        gradeAThreshold: 95,
        gradeBThreshold: 85,
        gradeCThreshold: 75,
        gradeDThreshold: 65,
      },
    }

    const result = evaluatePolicy(policy, options)

    expect(result).toBeDefined()
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade)
  })

  it('should use custom status thresholds', () => {
    const policy = createTestPolicy()
    const options: EvaluatePolicyOptions = {
      statusThresholds: {
        statusExcellentThreshold: 95,
        statusGoodThreshold: 85,
        statusFairThreshold: 75,
        statusPoorThreshold: 65,
      },
    }

    const result = evaluatePolicy(policy, options)

    expect(result).toBeDefined()
    expect(['excellent', 'good', 'fair', 'poor', 'critical']).toContain(result.status)
  })

  it('should support backward compatibility with direct config', () => {
    const policy = createTestPolicy()
    // Old signature: evaluatePolicy(policy, config)
    const result = evaluatePolicy(policy, {
      weights: {
        premium: 20,
        coverage: 30,
        deductible: 15,
        compliance: 20,
        value: 15,
      },
    })

    expect(result).toBeDefined()
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
  })

  it('should combine config with custom thresholds', () => {
    const policy = createTestPolicy()
    const options: EvaluatePolicyOptions = {
      config: {
        weights: {
          premium: 25,
          coverage: 35,
          deductible: 10,
          compliance: 15,
          value: 15,
        },
      },
      gradeThresholds: {
        gradeAThreshold: 92,
        gradeBThreshold: 82,
        gradeCThreshold: 72,
        gradeDThreshold: 62,
      },
      statusThresholds: {
        statusExcellentThreshold: 92,
        statusGoodThreshold: 82,
        statusFairThreshold: 72,
        statusPoorThreshold: 50,
      },
    }

    const result = evaluatePolicy(policy, options)

    expect(result).toBeDefined()
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade)
    expect(['excellent', 'good', 'fair', 'poor', 'critical']).toContain(result.status)
  })

  it('should use default thresholds when not provided in options', () => {
    const policy = createTestPolicy()
    const options: EvaluatePolicyOptions = {
      config: {
        weights: {
          premium: 20,
          coverage: 30,
          deductible: 15,
          compliance: 20,
          value: 15,
        },
      },
      // No threshold overrides
    }

    const result = evaluatePolicy(policy, options)

    // Should use DEFAULT_GRADE_THRESHOLDS and DEFAULT_STATUS_THRESHOLDS
    expect(result).toBeDefined()
    // With default thresholds, 90+ is A
    if (result.overallScore >= 90) {
      expect(result.grade).toBe('A')
    }
  })
})
