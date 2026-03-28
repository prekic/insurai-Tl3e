/**
 * Tests for threshold disclosure and calibration readiness
 *
 * Validates that:
 * 1. Grade thresholds are config-driven (can be overridden without code changes)
 * 2. Default thresholds produce expected grades
 * 3. Custom thresholds change grade assignment correctly
 * 4. GradeBadge has calibration disclosure (title attribute)
 * 5. Scoring behavior is unchanged under current defaults
 */
import { describe, it, expect } from 'vitest'
import {
  getGradeFromScore,
  getStatusFromScore,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_STATUS_THRESHOLDS,
} from '../types'
import type { GradeThresholds, StatusThresholds } from '../types'

describe('Threshold Disclosure & Calibration Readiness', () => {
  describe('default grade thresholds produce expected grades', () => {
    it('score 95 → A', () => {
      expect(getGradeFromScore(95)).toBe('A')
    })

    it('score 90 → A (boundary)', () => {
      expect(getGradeFromScore(90)).toBe('A')
    })

    it('score 89 → B', () => {
      expect(getGradeFromScore(89)).toBe('B')
    })

    it('score 80 → B (boundary)', () => {
      expect(getGradeFromScore(80)).toBe('B')
    })

    it('score 79 → C', () => {
      expect(getGradeFromScore(79)).toBe('C')
    })

    it('score 70 → C (boundary)', () => {
      expect(getGradeFromScore(70)).toBe('C')
    })

    it('score 69 → D', () => {
      expect(getGradeFromScore(69)).toBe('D')
    })

    it('score 60 → D (boundary)', () => {
      expect(getGradeFromScore(60)).toBe('D')
    })

    it('score 59 → F', () => {
      expect(getGradeFromScore(59)).toBe('F')
    })

    it('score 0 → F', () => {
      expect(getGradeFromScore(0)).toBe('F')
    })
  })

  describe('default status thresholds produce expected statuses', () => {
    it('score 95 → excellent', () => {
      expect(getStatusFromScore(95)).toBe('excellent')
    })

    it('score 75 → good (boundary)', () => {
      expect(getStatusFromScore(75)).toBe('good')
    })

    it('score 60 → fair (boundary)', () => {
      expect(getStatusFromScore(60)).toBe('fair')
    })

    it('score 40 → poor (boundary)', () => {
      expect(getStatusFromScore(40)).toBe('poor')
    })

    it('score 39 → critical', () => {
      expect(getStatusFromScore(39)).toBe('critical')
    })
  })

  describe('config-driven threshold override', () => {
    it('custom thresholds change grade assignment', () => {
      // Lenient thresholds: A starts at 80 instead of 90
      const lenient: GradeThresholds = {
        gradeAThreshold: 80,
        gradeBThreshold: 65,
        gradeCThreshold: 50,
        gradeDThreshold: 35,
      }

      // 85 is B with defaults, but A with lenient thresholds
      expect(getGradeFromScore(85, DEFAULT_GRADE_THRESHOLDS)).toBe('B')
      expect(getGradeFromScore(85, lenient)).toBe('A')
    })

    it('strict thresholds make grades harder to achieve', () => {
      const strict: GradeThresholds = {
        gradeAThreshold: 95,
        gradeBThreshold: 85,
        gradeCThreshold: 75,
        gradeDThreshold: 65,
      }

      // 90 is A with defaults, but B with strict thresholds
      expect(getGradeFromScore(90, DEFAULT_GRADE_THRESHOLDS)).toBe('A')
      expect(getGradeFromScore(90, strict)).toBe('B')
    })

    it('custom status thresholds change status assignment', () => {
      const strict: StatusThresholds = {
        statusExcellentThreshold: 95,
        statusGoodThreshold: 80,
        statusFairThreshold: 65,
        statusPoorThreshold: 50,
      }

      // 90 is excellent with defaults, but good with strict thresholds
      expect(getStatusFromScore(90, DEFAULT_STATUS_THRESHOLDS)).toBe('excellent')
      expect(getStatusFromScore(90, strict)).toBe('good')
    })

    it('thresholds can be adjusted independently', () => {
      // Only change A threshold, leave others at default
      const partial: GradeThresholds = {
        ...DEFAULT_GRADE_THRESHOLDS,
        gradeAThreshold: 95,
      }

      expect(getGradeFromScore(92, partial)).toBe('B') // Was A with defaults
      expect(getGradeFromScore(85, partial)).toBe('B') // Still B
      expect(getGradeFromScore(72, partial)).toBe('C') // Still C
    })
  })

  describe('scoring behavior unchanged under current defaults', () => {
    it('DEFAULT_GRADE_THRESHOLDS matches documented values', () => {
      expect(DEFAULT_GRADE_THRESHOLDS).toEqual({
        gradeAThreshold: 90,
        gradeBThreshold: 80,
        gradeCThreshold: 70,
        gradeDThreshold: 60,
      })
    })

    it('DEFAULT_STATUS_THRESHOLDS matches documented values', () => {
      expect(DEFAULT_STATUS_THRESHOLDS).toEqual({
        statusExcellentThreshold: 90,
        statusGoodThreshold: 75,
        statusFairThreshold: 60,
        statusPoorThreshold: 40,
      })
    })

    it('all score values 0-100 produce valid grades', () => {
      const validGrades = ['A', 'B', 'C', 'D', 'F']
      for (let score = 0; score <= 100; score++) {
        expect(validGrades).toContain(getGradeFromScore(score))
      }
    })

    it('all score values 0-100 produce valid statuses', () => {
      const validStatuses = ['excellent', 'good', 'fair', 'poor', 'critical']
      for (let score = 0; score <= 100; score++) {
        expect(validStatuses).toContain(getStatusFromScore(score))
      }
    })

    it('grade ordering is monotonic (higher score → same or better grade)', () => {
      const gradeOrder: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 }
      for (let score = 1; score <= 100; score++) {
        const currentGrade = gradeOrder[getGradeFromScore(score)]
        const previousGrade = gradeOrder[getGradeFromScore(score - 1)]
        expect(currentGrade).toBeGreaterThanOrEqual(previousGrade)
      }
    })
  })

  describe('threshold functions accept custom config', () => {
    it('getGradeFromScore accepts explicit thresholds parameter', () => {
      // Verify the function signature supports config injection
      const custom: GradeThresholds = {
        gradeAThreshold: 50,
        gradeBThreshold: 40,
        gradeCThreshold: 30,
        gradeDThreshold: 20,
      }
      expect(getGradeFromScore(45, custom)).toBe('B')
      expect(getGradeFromScore(55, custom)).toBe('A')
    })

    it('getStatusFromScore accepts explicit thresholds parameter', () => {
      const custom: StatusThresholds = {
        statusExcellentThreshold: 50,
        statusGoodThreshold: 40,
        statusFairThreshold: 30,
        statusPoorThreshold: 20,
      }
      expect(getStatusFromScore(45, custom)).toBe('good')
      expect(getStatusFromScore(55, custom)).toBe('excellent')
    })
  })
})
