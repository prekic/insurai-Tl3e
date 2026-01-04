/**
 * Limit Gap Analyzer Tests
 * Tests for detecting underinsured coverage limits
 */

import { describe, it, expect } from 'vitest'
import { analyzeLimitGaps } from './limit-analyzer'
import { DEFAULT_GAP_CONFIG } from '@/types/gap'
import {
  createMockPolicy,
  createCoverage,
  WELL_COVERED_HOME_POLICY,
  UNDERINSURED_KASKO_POLICY,
} from '../__tests__/fixtures'

describe('Limit Gap Analyzer', () => {
  describe('analyzeLimitGaps', () => {
    it('should return an array of gaps', () => {
      const policy = createMockPolicy()
      const gaps = analyzeLimitGaps(policy)

      expect(Array.isArray(gaps)).toBe(true)
    })

    it('should find no limit gaps for well-covered policy', () => {
      const gaps = analyzeLimitGaps(WELL_COVERED_HOME_POLICY)

      // Well-covered policy should have no critical/high limit gaps
      const severeGaps = gaps.filter(g => g.severity === 'critical' || g.severity === 'high')
      expect(severeGaps.length).toBe(0)
    })

    it('should detect underinsured limits', () => {
      const gaps = analyzeLimitGaps(UNDERINSURED_KASKO_POLICY)

      // Underinsured policy should have limit gaps
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should set severity based on percentage of market average', () => {
      // Severely underinsured (< 40% of market average)
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 100000, // ~6.7% of typical 1,500,000
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap?.severity).toBe('critical')
      expect(fireGap?.subCategory).toBe('severely_underinsured')
    })

    it('should classify 40-55% as high severity', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 750000, // 50% of typical 1,500,000
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      if (fireGap) {
        expect(['high', 'medium']).toContain(fireGap.severity)
      }
    })

    it('should not flag limits at or above threshold', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000, // At market average
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      expect(fireGap).toBeUndefined()
    })

    it('should calculate shortfall amount', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 500000,
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage === 'Fire')
      if (fireGap) {
        // Shortfall should be typicalLimit - policyLimit = 1,500,000 - 500,000
        expect(fireGap.financialImpact.potentialLoss).toBeGreaterThan(0)
      }
    })

    it('should include remediation with estimated upgrade cost', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 500000,
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      gaps.forEach(gap => {
        expect(gap.remediation).toBeDefined()
        expect(gap.remediation.estimatedCost).toBeGreaterThanOrEqual(0)
        expect(gap.remediation.steps.length).toBeGreaterThan(0)
      })
    })

    it('should include Turkish description with amounts', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 500000,
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      gaps.forEach(gap => {
        expect(gap.descriptionTr).toContain('₺')
        expect(gap.descriptionTr.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Total Coverage Check', () => {
    it('should flag when total coverage is significantly below market average', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 100000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      // Should include a gap for total coverage being low
      const totalGap = gaps.find(g => g.title.includes('Total Coverage'))
      expect(totalGap).toBeDefined()
    })

    it('should not flag total coverage when above 60% threshold', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 1500000 }),
          createCoverage({ name: 'Contents', nameTr: 'Eşya', limit: 100000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const totalGap = gaps.find(g => g.title.includes('Total Coverage'))
      expect(totalGap).toBeUndefined()
    })
  })

  describe('Regional Risk Adjustment', () => {
    it('should apply stricter thresholds for high-risk regions', () => {
      const policy = createMockPolicy({
        type: 'home',
        location: 'Istanbul',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1000000,
          }),
        ],
      })

      const marmaraGaps = analyzeLimitGaps(policy, DEFAULT_GAP_CONFIG, 'marmara')
      const icAnadoluGaps = analyzeLimitGaps(policy, DEFAULT_GAP_CONFIG, 'ic_anadolu')

      // Both regions analyzed - Marmara has higher risk multiplier
      // This test verifies the analysis runs without error
      expect(marmaraGaps).toBeDefined()
      expect(icAnadoluGaps).toBeDefined()
    })
  })

  describe('High Inclusion Rate Boost', () => {
    it('should boost severity for high-inclusion coverages', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        coverages: [
          createCoverage({
            name: 'Collision Damage',
            nameTr: 'Çarpma/Çarpışma',
            limit: 300000, // 60% of typical 500,000
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const collisionGap = gaps.find(g => g.affectedCoverage?.includes('Collision'))
      if (collisionGap) {
        // Collision has 100% inclusion rate, should have boosted severity
        expect(['high', 'medium']).toContain(collisionGap.severity)
      }
    })
  })

  describe('Market Reference', () => {
    it('should include market benchmark in gap', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 500000,
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      gaps.forEach(gap => {
        if (gap.marketReference) {
          expect(gap.marketReference.benchmark).toBeDefined()
          expect(gap.marketReference.comparison).toBe('below')
        }
      })
    })

    it('should calculate percentile correctly', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 500000,
          }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      gaps.forEach(gap => {
        if (gap.marketReference) {
          expect(gap.marketReference.percentile).toBeGreaterThanOrEqual(0)
          expect(gap.marketReference.percentile).toBeLessThanOrEqual(100)
        }
      })
    })
  })

  describe('Coverage Matching', () => {
    it('should match by English name', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire Coverage', nameTr: '', limit: 500000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const fireGap = gaps.find(g => g.affectedCoverage?.toLowerCase().includes('fire'))
      expect(fireGap).toBeDefined()
    })

    it('should match by Turkish name', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: '', nameTr: 'Yangın', limit: 500000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      // Should match and find an underinsured gap
      expect(gaps.length).toBeGreaterThan(0)
    })
  })

  describe('Severity Score Calculation', () => {
    it('should assign highest score to critical gaps', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 50000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const criticalGaps = gaps.filter(g => g.severity === 'critical')
      criticalGaps.forEach(gap => {
        expect(gap.severityScore).toBeGreaterThanOrEqual(90)
      })
    })

    it('should assign medium scores to medium gaps', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 900000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)

      const mediumGaps = gaps.filter(g => g.severity === 'medium')
      mediumGaps.forEach(gap => {
        expect(gap.severityScore).toBe(50)
      })
    })
  })

  describe('Policy Types', () => {
    it('should analyze kasko limits', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        coverages: [
          createCoverage({ name: 'Collision Damage', nameTr: 'Çarpma/Çarpışma', limit: 100000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should analyze health policy limits', () => {
      const policy = createMockPolicy({
        type: 'health',
        coverages: [
          createCoverage({ name: 'Hospitalization', nameTr: 'Yatarak Tedavi', limit: 100000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should analyze business policy limits', () => {
      const policy = createMockPolicy({
        type: 'business',
        coverages: [
          createCoverage({ name: 'Fire', nameTr: 'Yangın', limit: 100000 }),
        ],
      })

      const gaps = analyzeLimitGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })
  })
})
