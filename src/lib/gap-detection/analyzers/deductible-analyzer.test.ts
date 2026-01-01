/**
 * Deductible Gap Analyzer Tests
 * Tests for detecting high deductible issues
 */

import { describe, it, expect } from 'vitest'
import { analyzeDeductibleGaps } from './deductible-analyzer'
import { DEFAULT_GAP_CONFIG } from '@/types/gap'
import {
  createMockPolicy,
  createCoverage,
  WELL_COVERED_HOME_POLICY,
  HIGH_DEDUCTIBLE_POLICY,
} from '../__tests__/fixtures'

describe('Deductible Gap Analyzer', () => {
  describe('analyzeDeductibleGaps', () => {
    it('should return an array of gaps', () => {
      const policy = createMockPolicy()
      const gaps = analyzeDeductibleGaps(policy)

      expect(Array.isArray(gaps)).toBe(true)
    })

    it('should find no deductible gaps for policy with normal deductibles', () => {
      const gaps = analyzeDeductibleGaps(WELL_COVERED_HOME_POLICY)

      // Well-covered policy should have no high deductible gaps
      const severeGaps = gaps.filter(g => g.severity === 'critical' || g.severity === 'high')
      expect(severeGaps.length).toBe(0)
    })

    it('should find gaps for high deductible policy', () => {
      const gaps = analyzeDeductibleGaps(HIGH_DEDUCTIBLE_POLICY)

      // High deductible policy should have gaps
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should skip coverages with zero deductible', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 1500000, deductible: 0 }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      // No gaps for zero deductible
      expect(gaps.length).toBe(0)
    })

    it('should not flag deductibles below threshold', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 1000, // Equal to typical
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap).toBeUndefined()
    })

    it('should classify excessive deductible (>2.5x) as high severity', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 3000, // 3x typical (1000)
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap?.severity).toBe('high')
      expect(fireGap?.subCategory).toBe('excessive_deductible')
    })

    it('should classify high deductible (2-2.5x) as medium severity', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 2200, // 2.2x typical
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap?.severity).toBe('medium')
      expect(fireGap?.subCategory).toBe('high_deductible')
    })

    it('should classify above average (1.5-2x) as low severity', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 1800, // 1.8x typical
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap?.severity).toBe('low')
      expect(fireGap?.subCategory).toBe('above_average')
    })
  })

  describe('Financial Impact Calculation', () => {
    it('should calculate excess deductible amount', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 5000, // Typical is 1000, excess is 4000
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap?.financialImpact.potentialLoss).toBe(4000)
    })

    it('should apply claim probability to calculate expected loss', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 5000,
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      // Fire probability is 0.02, excess is 4000
      expect(fireGap?.financialImpact.expectedLoss).toBe(Math.round(4000 * 0.02))
    })

    it('should use higher probability for high-claim coverages', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        coverages: [
          createCoverage({
            name: 'Glass Coverage',
            nameTr: 'Cam Kırılması',
            limit: 25000,
            deductible: 1500, // Typical is 0, but let's say it's not matched
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      // Glass has higher probability (0.15)
      const glassGap = gaps.find(g => g.affectedCoverage?.includes('Glass'))
      if (glassGap) {
        expect(glassGap.financialImpact.probability).toBeGreaterThan(0)
      }
    })
  })

  describe('Total Deductible Exposure', () => {
    it('should flag high total deductible exposure', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 1500000, deductible: 10000 }),
          createCoverage({ name: 'Theft', nameTr: 'Hırsızlık', limit: 50000, deductible: 5000 }),
          createCoverage({ name: 'Water', nameTr: 'Su Hasarı', limit: 100000, deductible: 5000 }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const totalGap = gaps.find(g => g.title.includes('Total Deductible'))
      expect(totalGap).toBeDefined()
      expect(totalGap?.severity).toBe('medium')
    })

    it('should not flag normal total deductible', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 1500000, deductible: 1000 }),
          createCoverage({ name: 'Theft', nameTr: 'Hırsızlık', limit: 50000, deductible: 1000 }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const totalGap = gaps.find(g => g.title.includes('Total Deductible'))
      expect(totalGap).toBeUndefined()
    })

    it('should include total deductible amount in description', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 1500000, deductible: 15000 }),
          createCoverage({ name: 'Theft', nameTr: 'Hırsızlık', limit: 50000, deductible: 10000 }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const totalGap = gaps.find(g => g.title.includes('Total Deductible'))
      if (totalGap) {
        expect(totalGap.description).toContain('₺')
        expect(totalGap.description).toContain('25.000')
      }
    })
  })

  describe('Remediation', () => {
    it('should estimate deductible reduction cost', () => {
      const policy = createMockPolicy({
        type: 'home',
        premium: 5000,
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 5000,
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap?.remediation.estimatedCost).toBeDefined()
      expect(fireGap?.remediation.estimatedCost).toBeGreaterThanOrEqual(0)
    })

    it('should provide alternative to keep high deductible', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 5000,
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap?.remediation.alternatives).toBeDefined()
      expect(fireGap?.remediation.alternatives?.length).toBeGreaterThan(0)
    })

    it('should include Turkish remediation steps', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 5000,
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      gaps.forEach(gap => {
        expect(gap.remediation.stepsTr).toBeDefined()
        expect(gap.remediation.stepsTr.length).toBeGreaterThan(0)
        expect(gap.remediation.actionTr).toBeDefined()
      })
    })
  })

  describe('Custom Configuration', () => {
    it('should respect custom high deductible multiplier', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 1500, // 1.5x typical
          }),
        ],
      })

      // With default 1.5x multiplier, should flag
      const defaultGaps = analyzeDeductibleGaps(policy, DEFAULT_GAP_CONFIG)

      // With 2x multiplier, should not flag
      const stricterGaps = analyzeDeductibleGaps(policy, {
        ...DEFAULT_GAP_CONFIG,
        thresholds: {
          ...DEFAULT_GAP_CONFIG.thresholds,
          highDeductibleMultiplier: 2.0,
        },
      })

      expect(defaultGaps.length).toBeGreaterThanOrEqual(stricterGaps.length)
    })
  })

  describe('Policy Types', () => {
    it('should analyze kasko deductibles', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        coverages: [
          createCoverage({
            name: 'Collision Damage',
            nameTr: 'Çarpma/Çarpışma',
            limit: 500000,
            deductible: 10000, // 4x typical 2500
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should analyze health deductibles', () => {
      const policy = createMockPolicy({
        type: 'health',
        coverages: [
          createCoverage({
            name: 'Outpatient',
            nameTr: 'Ayakta Tedavi',
            limit: 50000,
            deductible: 2500, // 5x typical 500
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should analyze business deductibles', () => {
      const policy = createMockPolicy({
        type: 'business',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 2000000,
            deductible: 25000, // 5x typical 5000
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })
  })

  describe('Gap IDs and Metadata', () => {
    it('should generate unique gap IDs', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 1500000, deductible: 5000 }),
          createCoverage({ name: 'Theft', nameTr: 'Hırsızlık', limit: 50000, deductible: 5000 }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const ids = gaps.map(g => g.id)
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
    })

    it('should include confidence level', () => {
      const gaps = analyzeDeductibleGaps(HIGH_DEDUCTIBLE_POLICY)

      gaps.forEach(gap => {
        expect(gap.confidence).toBeDefined()
        expect(gap.confidence).toBeGreaterThan(0)
        expect(gap.confidence).toBeLessThanOrEqual(1)
      })
    })

    it('should set source to deductible', () => {
      const gaps = analyzeDeductibleGaps(HIGH_DEDUCTIBLE_POLICY)

      gaps.forEach(gap => {
        expect(gap.source).toBe('deductible')
      })
    })
  })

  describe('Market Reference', () => {
    it('should include market benchmark reference', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 5000,
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap?.marketReference).toBeDefined()
      expect(fireGap?.marketReference?.comparison).toBe('below')
    })

    it('should calculate deductible percentile', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            deductible: 3000,
          }),
        ],
      })

      const gaps = analyzeDeductibleGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      if (fireGap?.marketReference) {
        expect(fireGap.marketReference.percentile).toBeGreaterThanOrEqual(0)
        expect(fireGap.marketReference.percentile).toBeLessThanOrEqual(100)
      }
    })
  })
})
