/**
 * Tests for Policy Evaluation Types and Helper Functions
 */

import { describe, it, expect } from 'vitest'
import {
  getGradeFromScore,
  getStatusFromScore,
  isExcellent,
  isGood,
  isFair,
  isPoor,
  isCritical,
  DEFAULT_EVALUATION_CONFIG,
} from '../types'

describe('Policy Evaluation Types', () => {
  // =========================================================================
  // GRADE FUNCTIONS
  // =========================================================================

  describe('getGradeFromScore', () => {
    it('should return A for scores >= 90', () => {
      expect(getGradeFromScore(90)).toBe('A')
      expect(getGradeFromScore(95)).toBe('A')
      expect(getGradeFromScore(100)).toBe('A')
    })

    it('should return B for scores 80-89', () => {
      expect(getGradeFromScore(80)).toBe('B')
      expect(getGradeFromScore(85)).toBe('B')
      expect(getGradeFromScore(89)).toBe('B')
    })

    it('should return C for scores 70-79', () => {
      expect(getGradeFromScore(70)).toBe('C')
      expect(getGradeFromScore(75)).toBe('C')
      expect(getGradeFromScore(79)).toBe('C')
    })

    it('should return D for scores 60-69', () => {
      expect(getGradeFromScore(60)).toBe('D')
      expect(getGradeFromScore(65)).toBe('D')
      expect(getGradeFromScore(69)).toBe('D')
    })

    it('should return F for scores < 60', () => {
      expect(getGradeFromScore(0)).toBe('F')
      expect(getGradeFromScore(30)).toBe('F')
      expect(getGradeFromScore(59)).toBe('F')
    })
  })

  describe('getStatusFromScore', () => {
    it('should return excellent for scores >= 90', () => {
      expect(getStatusFromScore(90)).toBe('excellent')
      expect(getStatusFromScore(100)).toBe('excellent')
    })

    it('should return good for scores 75-89', () => {
      expect(getStatusFromScore(75)).toBe('good')
      expect(getStatusFromScore(85)).toBe('good')
      expect(getStatusFromScore(89)).toBe('good')
    })

    it('should return fair for scores 60-74', () => {
      expect(getStatusFromScore(60)).toBe('fair')
      expect(getStatusFromScore(70)).toBe('fair')
      expect(getStatusFromScore(74)).toBe('fair')
    })

    it('should return poor for scores 40-59', () => {
      expect(getStatusFromScore(40)).toBe('poor')
      expect(getStatusFromScore(50)).toBe('poor')
      expect(getStatusFromScore(59)).toBe('poor')
    })

    it('should return critical for scores < 40', () => {
      expect(getStatusFromScore(0)).toBe('critical')
      expect(getStatusFromScore(20)).toBe('critical')
      expect(getStatusFromScore(39)).toBe('critical')
    })
  })

  // =========================================================================
  // SCORE CLASSIFICATION FUNCTIONS
  // =========================================================================

  describe('isExcellent', () => {
    it('should return true for scores >= 90', () => {
      expect(isExcellent(90)).toBe(true)
      expect(isExcellent(95)).toBe(true)
      expect(isExcellent(100)).toBe(true)
    })

    it('should return false for scores < 90', () => {
      expect(isExcellent(89)).toBe(false)
      expect(isExcellent(50)).toBe(false)
      expect(isExcellent(0)).toBe(false)
    })
  })

  describe('isGood', () => {
    it('should return true for scores 75-89', () => {
      expect(isGood(75)).toBe(true)
      expect(isGood(82)).toBe(true)
      expect(isGood(89)).toBe(true)
    })

    it('should return false for scores outside 75-89', () => {
      expect(isGood(74)).toBe(false)
      expect(isGood(90)).toBe(false)
      expect(isGood(50)).toBe(false)
    })
  })

  describe('isFair', () => {
    it('should return true for scores 60-74', () => {
      expect(isFair(60)).toBe(true)
      expect(isFair(67)).toBe(true)
      expect(isFair(74)).toBe(true)
    })

    it('should return false for scores outside 60-74', () => {
      expect(isFair(59)).toBe(false)
      expect(isFair(75)).toBe(false)
      expect(isFair(90)).toBe(false)
    })
  })

  describe('isPoor', () => {
    it('should return true for scores 40-59', () => {
      expect(isPoor(40)).toBe(true)
      expect(isPoor(50)).toBe(true)
      expect(isPoor(59)).toBe(true)
    })

    it('should return false for scores outside 40-59', () => {
      expect(isPoor(39)).toBe(false)
      expect(isPoor(60)).toBe(false)
      expect(isPoor(80)).toBe(false)
    })
  })

  describe('isCritical', () => {
    it('should return true for scores < 40', () => {
      expect(isCritical(0)).toBe(true)
      expect(isCritical(20)).toBe(true)
      expect(isCritical(39)).toBe(true)
    })

    it('should return false for scores >= 40', () => {
      expect(isCritical(40)).toBe(false)
      expect(isCritical(50)).toBe(false)
      expect(isCritical(100)).toBe(false)
    })
  })

  // =========================================================================
  // DEFAULT CONFIG
  // =========================================================================

  describe('DEFAULT_EVALUATION_CONFIG', () => {
    it('should have weights that sum to 100', () => {
      const { weights } = DEFAULT_EVALUATION_CONFIG
      const sum = weights.premium + weights.coverage + weights.deductible + weights.compliance + weights.value
      expect(sum).toBe(100)
    })

    it('should have correct default weight values', () => {
      expect(DEFAULT_EVALUATION_CONFIG.weights.premium).toBe(20)
      expect(DEFAULT_EVALUATION_CONFIG.weights.coverage).toBe(30)
      expect(DEFAULT_EVALUATION_CONFIG.weights.deductible).toBe(15)
      expect(DEFAULT_EVALUATION_CONFIG.weights.compliance).toBe(20)
      expect(DEFAULT_EVALUATION_CONFIG.weights.value).toBe(15)
    })

    it('should have strict compliance enabled by default', () => {
      expect(DEFAULT_EVALUATION_CONFIG.strictCompliance).toBe(true)
    })

    it('should include optional coverages by default', () => {
      expect(DEFAULT_EVALUATION_CONFIG.includeOptionalCoverages).toBe(true)
    })

    it('should use regional benchmarks by default', () => {
      expect(DEFAULT_EVALUATION_CONFIG.useRegionalBenchmarks).toBe(true)
    })
  })

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle boundary scores correctly', () => {
      // Test exact boundaries
      expect(getGradeFromScore(90)).toBe('A')
      expect(getGradeFromScore(89.99)).toBe('B') // Just below A
      expect(getGradeFromScore(80)).toBe('B')
      expect(getGradeFromScore(79.99)).toBe('C') // Just below B
      expect(getGradeFromScore(70)).toBe('C')
      expect(getGradeFromScore(69.99)).toBe('D') // Just below C
      expect(getGradeFromScore(60)).toBe('D')
      expect(getGradeFromScore(59.99)).toBe('F') // Just below D
    })

    it('should handle negative scores', () => {
      expect(getGradeFromScore(-10)).toBe('F')
      expect(getStatusFromScore(-10)).toBe('critical')
      expect(isCritical(-10)).toBe(true)
    })

    it('should handle scores above 100', () => {
      expect(getGradeFromScore(110)).toBe('A')
      expect(getStatusFromScore(110)).toBe('excellent')
      expect(isExcellent(110)).toBe(true)
    })
  })
})
