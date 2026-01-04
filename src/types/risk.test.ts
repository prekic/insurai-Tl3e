/**
 * Risk Types Tests
 *
 * Tests for risk scoring helper functions
 */

import { describe, it, expect } from 'vitest'
import {
  getRiskLevel,
  getRiskLevelLabel,
  getRiskLevelColor,
  RISK_THRESHOLDS,
  DEFAULT_CATEGORY_WEIGHTS,
} from './risk'
import type { RiskLevel, RiskCategory } from './risk'

describe('Risk Types', () => {
  describe('RISK_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(RISK_THRESHOLDS.very_low).toBe(20)
      expect(RISK_THRESHOLDS.low).toBe(35)
      expect(RISK_THRESHOLDS.moderate).toBe(55)
      expect(RISK_THRESHOLDS.high).toBe(75)
      expect(RISK_THRESHOLDS.very_high).toBe(100)
    })

    it('should have thresholds in ascending order', () => {
      expect(RISK_THRESHOLDS.very_low).toBeLessThan(RISK_THRESHOLDS.low)
      expect(RISK_THRESHOLDS.low).toBeLessThan(RISK_THRESHOLDS.moderate)
      expect(RISK_THRESHOLDS.moderate).toBeLessThan(RISK_THRESHOLDS.high)
      expect(RISK_THRESHOLDS.high).toBeLessThan(RISK_THRESHOLDS.very_high)
    })
  })

  describe('DEFAULT_CATEGORY_WEIGHTS', () => {
    it('should have weights for all categories', () => {
      const categories: RiskCategory[] = [
        'coverage_gaps',
        'pricing',
        'provider',
        'temporal',
        'geographic',
        'concentration',
        'deductible',
        'exclusions',
      ]

      categories.forEach((category) => {
        expect(DEFAULT_CATEGORY_WEIGHTS[category]).toBeDefined()
        expect(typeof DEFAULT_CATEGORY_WEIGHTS[category]).toBe('number')
      })
    })

    it('should have weights that sum to 1.0', () => {
      const total = Object.values(DEFAULT_CATEGORY_WEIGHTS).reduce(
        (sum, weight) => sum + weight,
        0
      )
      expect(total).toBeCloseTo(1.0, 5)
    })

    it('should have all weights between 0 and 1', () => {
      Object.values(DEFAULT_CATEGORY_WEIGHTS).forEach((weight) => {
        expect(weight).toBeGreaterThan(0)
        expect(weight).toBeLessThanOrEqual(1)
      })
    })

    it('should have coverage_gaps as highest weight', () => {
      const maxWeight = Math.max(...Object.values(DEFAULT_CATEGORY_WEIGHTS))
      expect(DEFAULT_CATEGORY_WEIGHTS.coverage_gaps).toBe(maxWeight)
    })
  })

  describe('getRiskLevel', () => {
    it('should return very_low for scores 0-20', () => {
      expect(getRiskLevel(0)).toBe('very_low')
      expect(getRiskLevel(10)).toBe('very_low')
      expect(getRiskLevel(20)).toBe('very_low')
    })

    it('should return low for scores 21-35', () => {
      expect(getRiskLevel(21)).toBe('low')
      expect(getRiskLevel(28)).toBe('low')
      expect(getRiskLevel(35)).toBe('low')
    })

    it('should return moderate for scores 36-55', () => {
      expect(getRiskLevel(36)).toBe('moderate')
      expect(getRiskLevel(45)).toBe('moderate')
      expect(getRiskLevel(55)).toBe('moderate')
    })

    it('should return high for scores 56-75', () => {
      expect(getRiskLevel(56)).toBe('high')
      expect(getRiskLevel(65)).toBe('high')
      expect(getRiskLevel(75)).toBe('high')
    })

    it('should return very_high for scores above 75', () => {
      expect(getRiskLevel(76)).toBe('very_high')
      expect(getRiskLevel(90)).toBe('very_high')
      expect(getRiskLevel(100)).toBe('very_high')
    })

    it('should handle boundary values correctly', () => {
      // At boundary values
      expect(getRiskLevel(20)).toBe('very_low')
      expect(getRiskLevel(20.01)).toBe('low')
      expect(getRiskLevel(35)).toBe('low')
      expect(getRiskLevel(35.01)).toBe('moderate')
      expect(getRiskLevel(55)).toBe('moderate')
      expect(getRiskLevel(55.01)).toBe('high')
      expect(getRiskLevel(75)).toBe('high')
      expect(getRiskLevel(75.01)).toBe('very_high')
    })

    it('should handle negative scores as very_low', () => {
      expect(getRiskLevel(-5)).toBe('very_low')
      expect(getRiskLevel(-100)).toBe('very_low')
    })

    it('should handle scores above 100 as very_high', () => {
      expect(getRiskLevel(101)).toBe('very_high')
      expect(getRiskLevel(150)).toBe('very_high')
    })
  })

  describe('getRiskLevelLabel', () => {
    it('should return Turkish label for very_low', () => {
      expect(getRiskLevelLabel('very_low')).toBe('Çok Düşük Risk')
    })

    it('should return Turkish label for low', () => {
      expect(getRiskLevelLabel('low')).toBe('Düşük Risk')
    })

    it('should return Turkish label for moderate', () => {
      expect(getRiskLevelLabel('moderate')).toBe('Orta Risk')
    })

    it('should return Turkish label for high', () => {
      expect(getRiskLevelLabel('high')).toBe('Yüksek Risk')
    })

    it('should return Turkish label for very_high', () => {
      expect(getRiskLevelLabel('very_high')).toBe('Çok Yüksek Risk')
    })

    it('should return labels for all risk levels', () => {
      const levels: RiskLevel[] = ['very_low', 'low', 'moderate', 'high', 'very_high']

      levels.forEach((level) => {
        const label = getRiskLevelLabel(level)
        expect(label).toBeDefined()
        expect(typeof label).toBe('string')
        expect(label.length).toBeGreaterThan(0)
      })
    })

    it('should contain "Risk" in all Turkish labels', () => {
      const levels: RiskLevel[] = ['very_low', 'low', 'moderate', 'high', 'very_high']

      levels.forEach((level) => {
        expect(getRiskLevelLabel(level)).toContain('Risk')
      })
    })
  })

  describe('getRiskLevelColor', () => {
    it('should return green color for very_low', () => {
      expect(getRiskLevelColor('very_low')).toBe('#22c55e')
    })

    it('should return lime color for low', () => {
      expect(getRiskLevelColor('low')).toBe('#84cc16')
    })

    it('should return yellow color for moderate', () => {
      expect(getRiskLevelColor('moderate')).toBe('#eab308')
    })

    it('should return orange color for high', () => {
      expect(getRiskLevelColor('high')).toBe('#f97316')
    })

    it('should return red color for very_high', () => {
      expect(getRiskLevelColor('very_high')).toBe('#ef4444')
    })

    it('should return valid hex colors for all levels', () => {
      const levels: RiskLevel[] = ['very_low', 'low', 'moderate', 'high', 'very_high']
      const hexPattern = /^#[0-9a-f]{6}$/i

      levels.forEach((level) => {
        expect(getRiskLevelColor(level)).toMatch(hexPattern)
      })
    })

    it('should have different colors for each level', () => {
      const levels: RiskLevel[] = ['very_low', 'low', 'moderate', 'high', 'very_high']
      const colors = levels.map(getRiskLevelColor)
      const uniqueColors = new Set(colors)

      expect(uniqueColors.size).toBe(levels.length)
    })

    it('should have colors that transition from green to red', () => {
      // Colors should visually progress from safe (green) to danger (red)
      const veryLow = getRiskLevelColor('very_low')
      const veryHigh = getRiskLevelColor('very_high')

      // Green channel should be higher in very_low
      const veryLowGreen = parseInt(veryLow.slice(3, 5), 16)
      const veryHighGreen = parseInt(veryHigh.slice(3, 5), 16)
      expect(veryLowGreen).toBeGreaterThan(veryHighGreen)

      // Red channel should be higher in very_high
      const veryLowRed = parseInt(veryLow.slice(1, 3), 16)
      const veryHighRed = parseInt(veryHigh.slice(1, 3), 16)
      expect(veryHighRed).toBeGreaterThan(veryLowRed)
    })
  })

  describe('Integration: getRiskLevel → getRiskLevelLabel', () => {
    it('should provide consistent mapping from score to label', () => {
      const testCases = [
        { score: 10, expectedLabel: 'Çok Düşük Risk' },
        { score: 30, expectedLabel: 'Düşük Risk' },
        { score: 50, expectedLabel: 'Orta Risk' },
        { score: 70, expectedLabel: 'Yüksek Risk' },
        { score: 90, expectedLabel: 'Çok Yüksek Risk' },
      ]

      testCases.forEach(({ score, expectedLabel }) => {
        const level = getRiskLevel(score)
        const label = getRiskLevelLabel(level)
        expect(label).toBe(expectedLabel)
      })
    })
  })

  describe('Integration: getRiskLevel → getRiskLevelColor', () => {
    it('should provide consistent mapping from score to color', () => {
      const testCases = [
        { score: 10, expectedColor: '#22c55e' },
        { score: 30, expectedColor: '#84cc16' },
        { score: 50, expectedColor: '#eab308' },
        { score: 70, expectedColor: '#f97316' },
        { score: 90, expectedColor: '#ef4444' },
      ]

      testCases.forEach(({ score, expectedColor }) => {
        const level = getRiskLevel(score)
        const color = getRiskLevelColor(level)
        expect(color).toBe(expectedColor)
      })
    })
  })
})
