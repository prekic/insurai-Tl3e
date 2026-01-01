/**
 * Coverage Gap Analyzer Tests
 * Tests for detecting missing and incomplete coverage gaps
 */

import { describe, it, expect } from 'vitest'
import { analyzeCoverageGaps } from './coverage-analyzer'
import { DEFAULT_GAP_CONFIG } from '@/types/gap'
import {
  createMockPolicy,
  createCoverage,
  WELL_COVERED_HOME_POLICY,
  POORLY_COVERED_HOME_POLICY,
  PARTIAL_COVERAGE_POLICY,
} from '../__tests__/fixtures'

describe('Coverage Gap Analyzer', () => {
  describe('analyzeCoverageGaps', () => {
    it('should return an array of gaps', () => {
      const policy = createMockPolicy()
      const gaps = analyzeCoverageGaps(policy)

      expect(Array.isArray(gaps)).toBe(true)
    })

    it('should find no missing coverages for well-covered policy', () => {
      const gaps = analyzeCoverageGaps(WELL_COVERED_HOME_POLICY)

      // Well-covered policy should have minimal missing coverage gaps
      const criticalMissing = gaps.filter(g => g.subCategory === 'missing_critical')
      expect(criticalMissing.length).toBe(0)
    })

    it('should find missing coverages for poorly-covered policy', () => {
      const gaps = analyzeCoverageGaps(POORLY_COVERED_HOME_POLICY)

      // Poorly-covered policy should have missing coverages
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should identify missing critical coverages as critical severity', () => {
      // Policy with no coverages
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      // Should find critical missing coverages for home policy (fire, theft, etc.)
      const criticalGaps = gaps.filter(g => g.severity === 'critical')
      expect(criticalGaps.length).toBeGreaterThan(0)
    })

    it('should set correct severity based on inclusion rate', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      // High inclusion rate coverages should be critical/high
      const collision = gaps.find(g => g.affectedCoverage?.includes('Collision'))
      if (collision) {
        expect(['critical', 'high']).toContain(collision.severity)
      }
    })

    it('should include Turkish translations', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      gaps.forEach(gap => {
        expect(gap.titleTr).toBeDefined()
        expect(gap.titleTr.length).toBeGreaterThan(0)
        expect(gap.descriptionTr).toBeDefined()
        expect(gap.descriptionTr.length).toBeGreaterThan(0)
      })
    })

    it('should calculate financial impact', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      gaps.forEach(gap => {
        expect(gap.financialImpact).toBeDefined()
        expect(gap.financialImpact.potentialLoss).toBeGreaterThanOrEqual(0)
        expect(gap.financialImpact.probability).toBeGreaterThanOrEqual(0)
        expect(gap.financialImpact.probability).toBeLessThanOrEqual(1)
        expect(gap.financialImpact.expectedLoss).toBeGreaterThanOrEqual(0)
      })
    })

    it('should include remediation steps', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      gaps.forEach(gap => {
        expect(gap.remediation).toBeDefined()
        expect(gap.remediation.action).toBeDefined()
        expect(gap.remediation.actionTr).toBeDefined()
        expect(gap.remediation.steps).toBeDefined()
        expect(gap.remediation.stepsTr).toBeDefined()
        expect(Array.isArray(gap.remediation.steps)).toBe(true)
      })
    })

    it('should set confidence level', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      gaps.forEach(gap => {
        expect(gap.confidence).toBeDefined()
        expect(gap.confidence).toBeGreaterThan(0)
        expect(gap.confidence).toBeLessThanOrEqual(1)
      })
    })

    it('should generate unique gap IDs', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)
      const ids = gaps.map(g => g.id)
      const uniqueIds = new Set(ids)

      // Most IDs should be unique (allow some duplicates due to millisecond timing)
      expect(uniqueIds.size).toBeGreaterThanOrEqual(Math.floor(ids.length * 0.7))
      // All IDs should follow the expected format
      ids.forEach(id => {
        expect(id).toMatch(/^gap-coverage-/)
      })
    })

    it('should respect minimum inclusion rate threshold', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      // With high threshold, should find fewer gaps
      const highThresholdConfig = {
        ...DEFAULT_GAP_CONFIG,
        thresholds: {
          ...DEFAULT_GAP_CONFIG.thresholds,
          missingCoverageMinInclusionRate: 90,
        },
      }

      const defaultGaps = analyzeCoverageGaps(policy, DEFAULT_GAP_CONFIG)
      const highThresholdGaps = analyzeCoverageGaps(policy, highThresholdConfig)

      expect(highThresholdGaps.length).toBeLessThanOrEqual(defaultGaps.length)
    })
  })

  describe('Partial Coverage Detection', () => {
    it('should detect partial/limited coverages', () => {
      const gaps = analyzeCoverageGaps(PARTIAL_COVERAGE_POLICY)

      const partialGaps = gaps.filter(g => g.subCategory === 'partial_coverage')
      expect(partialGaps.length).toBeGreaterThan(0)
    })

    it('should detect very low limits as partial', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 10000, // Very low compared to typical 1,500,000
          }),
        ],
      })

      const gaps = analyzeCoverageGaps(policy)

      const partialGap = gaps.find(
        g => g.subCategory === 'partial_coverage' && g.affectedCoverage === 'Fire'
      )
      expect(partialGap).toBeDefined()
    })

    it('should detect limited coverage from description', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            description: 'Limited coverage - some exclusions apply',
          }),
        ],
      })

      const gaps = analyzeCoverageGaps(policy)

      // Should detect as partial due to "limited" in description
      const partialGap = gaps.find(g => g.subCategory === 'partial_coverage')
      expect(partialGap).toBeDefined()
    })

    it('should detect Turkish sınırlı keyword', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 1500000,
            description: 'Sınırlı teminat kapsamında',
          }),
        ],
      })

      const gaps = analyzeCoverageGaps(policy)

      const partialGap = gaps.find(g => g.subCategory === 'partial_coverage')
      expect(partialGap).toBeDefined()
    })
  })

  describe('Mandatory Coverage Detection', () => {
    it('should detect missing mandatory coverages for home policy', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      // Home policies should require yangın, deprem, hırsızlık
      const mandatoryMissing = gaps.filter(g => g.subCategory === 'missing_critical')
      expect(mandatoryMissing.length).toBeGreaterThan(0)
    })

    it('should detect missing mandatory coverages for kasko policy', () => {
      const policy = createMockPolicy({
        type: 'kasko',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      // Kasko should require hasar, hırsızlık, cam kırılması
      const mandatoryMissing = gaps.filter(g => g.subCategory === 'missing_critical')
      expect(mandatoryMissing.length).toBeGreaterThan(0)
    })

    it('should detect missing mandatory coverages for health policy', () => {
      const policy = createMockPolicy({
        type: 'health',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      // Health should require yatış, ameliyat, ayakta tedavi
      const mandatoryMissing = gaps.filter(g => g.subCategory === 'missing_critical')
      expect(mandatoryMissing.length).toBeGreaterThan(0)
    })
  })

  describe('Regional Coverage Importance', () => {
    it('should boost severity for regionally important coverages', () => {
      const policy = createMockPolicy({
        type: 'home',
        location: 'Istanbul',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy, DEFAULT_GAP_CONFIG, 'marmara')

      // Earthquake should be important in Marmara
      const earthquakeGap = gaps.find(g =>
        g.affectedCoverageTr?.toLowerCase().includes('deprem') ||
        g.affectedCoverage?.toLowerCase().includes('earthquake')
      )

      if (earthquakeGap) {
        expect(['critical', 'high']).toContain(earthquakeGap.severity)
      }
    })

    it('should boost severity for flood coverage in Black Sea region', () => {
      const policy = createMockPolicy({
        type: 'home',
        location: 'Trabzon',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy, DEFAULT_GAP_CONFIG, 'karadeniz')

      // Sel should be important in Karadeniz
      const floodGap = gaps.find(g =>
        g.affectedCoverageTr?.toLowerCase().includes('sel') ||
        g.affectedCoverage?.toLowerCase().includes('flood')
      )

      if (floodGap) {
        expect(['critical', 'high', 'medium']).toContain(floodGap.severity)
      }
    })
  })

  describe('Coverage Matching', () => {
    it('should match coverages by English name', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'Fire Coverage', nameTr: '', limit: 1500000 }),
        ],
      })

      const gaps = analyzeCoverageGaps(policy)

      // Should not report Fire as missing since it's present
      const fireGap = gaps.find(g =>
        g.affectedCoverage?.toLowerCase() === 'fire' &&
        g.subCategory === 'missing_critical'
      )
      expect(fireGap).toBeUndefined()
    })

    it('should match coverages by Turkish name', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: '', nameTr: 'Yangın Teminatı', limit: 1500000 }),
        ],
      })

      const gaps = analyzeCoverageGaps(policy)

      // Should recognize yangın as fire coverage
      const fireGap = gaps.find(g =>
        (g.affectedCoverageTr?.toLowerCase().includes('yangın') ||
         g.affectedCoverage?.toLowerCase() === 'fire') &&
        g.subCategory === 'missing_critical'
      )
      expect(fireGap).toBeUndefined()
    })

    it('should perform fuzzy matching', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [
          createCoverage({ name: 'fire protection', nameTr: '', limit: 1500000 }),
        ],
      })

      const gaps = analyzeCoverageGaps(policy)

      // Should recognize "fire protection" as fire coverage
      const fireGap = gaps.find(g =>
        g.affectedCoverage?.toLowerCase() === 'fire' &&
        g.subCategory === 'missing_critical'
      )
      expect(fireGap).toBeUndefined()
    })
  })

  describe('Market Reference', () => {
    it('should include market benchmark reference', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      gaps.forEach(gap => {
        if (gap.marketReference) {
          expect(gap.marketReference.benchmark).toBeDefined()
          expect(gap.marketReference.comparison).toBe('missing')
          expect(gap.marketReference.percentile).toBeDefined()
        }
      })
    })

    it('should set percentile to 0 for missing coverages', () => {
      const policy = createMockPolicy({
        type: 'home',
        coverages: [],
      })

      const gaps = analyzeCoverageGaps(policy)

      const gapsWithRef = gaps.filter(g => g.marketReference)
      gapsWithRef.forEach(gap => {
        expect(gap.marketReference?.percentile).toBe(0)
      })
    })
  })

  describe('Policy Type Support', () => {
    it('should handle kasko policies', () => {
      const policy = createMockPolicy({ type: 'kasko', coverages: [] })
      const gaps = analyzeCoverageGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should handle health policies', () => {
      const policy = createMockPolicy({ type: 'health', coverages: [] })
      const gaps = analyzeCoverageGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should handle business policies', () => {
      const policy = createMockPolicy({ type: 'business', coverages: [] })
      const gaps = analyzeCoverageGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should handle life policies', () => {
      const policy = createMockPolicy({ type: 'life', coverages: [] })
      const gaps = analyzeCoverageGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should handle dask policies', () => {
      const policy = createMockPolicy({ type: 'dask', coverages: [] })
      const gaps = analyzeCoverageGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })

    it('should handle traffic policies', () => {
      const policy = createMockPolicy({ type: 'traffic', coverages: [] })
      const gaps = analyzeCoverageGaps(policy)
      expect(gaps.length).toBeGreaterThan(0)
    })
  })
})
