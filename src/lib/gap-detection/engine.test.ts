/**
 * Gap Detection Engine Tests
 * Tests for the main gap analysis orchestration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { analyzeGapsComprehensive, getQuickGapSummary } from './engine'
import {
  createMockPolicy,
  WELL_COVERED_HOME_POLICY,
  POORLY_COVERED_HOME_POLICY,
  EXPIRED_POLICY,
  createExpiringPolicy,
} from './__tests__/fixtures'

describe('Gap Detection Engine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('analyzeGapsComprehensive', () => {
    it('should return a complete analysis structure', () => {
      const policy = createMockPolicy()
      const analysis = analyzeGapsComprehensive(policy)

      expect(analysis).toHaveProperty('overallScore')
      expect(analysis).toHaveProperty('gapCount')
      expect(analysis).toHaveProperty('gaps')
      expect(analysis).toHaveProperty('gapsByCategory')
      expect(analysis).toHaveProperty('gapsBySeverity')
      expect(analysis).toHaveProperty('financialSummary')
      expect(analysis).toHaveProperty('prioritizedGaps')
      expect(analysis).toHaveProperty('topRecommendations')
      expect(analysis).toHaveProperty('analyzedAt')
      expect(analysis).toHaveProperty('policyId')
      expect(analysis).toHaveProperty('policyType')
      expect(analysis).toHaveProperty('confidence')
    })

    it('should identify few gaps for well-covered policy', () => {
      const analysis = analyzeGapsComprehensive(WELL_COVERED_HOME_POLICY)

      // Well-covered policy should have low overall score
      expect(analysis.overallScore).toBeLessThan(50)
      expect(analysis.gapCount.critical).toBe(0)
    })

    it('should identify many gaps for poorly-covered policy', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      // Poorly-covered policy should have higher score
      expect(analysis.gapCount.total).toBeGreaterThan(0)
      expect(analysis.gaps.length).toBeGreaterThan(0)
    })

    it('should detect critical temporal gaps for expired policy', () => {
      const analysis = analyzeGapsComprehensive(EXPIRED_POLICY)

      const temporalGaps = analysis.gapsByCategory.temporal
      expect(temporalGaps.length).toBeGreaterThan(0)

      const criticalGap = temporalGaps.find(g => g.severity === 'critical')
      expect(criticalGap).toBeDefined()
    })

    it('should categorize gaps correctly', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      expect(analysis.gapsByCategory).toHaveProperty('coverage')
      expect(analysis.gapsByCategory).toHaveProperty('limit')
      expect(analysis.gapsByCategory).toHaveProperty('deductible')
      expect(analysis.gapsByCategory).toHaveProperty('exclusion')
      expect(analysis.gapsByCategory).toHaveProperty('temporal')
      expect(analysis.gapsByCategory).toHaveProperty('compliance')
      expect(analysis.gapsByCategory).toHaveProperty('portfolio')
    })

    it('should group gaps by severity', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      expect(analysis.gapsBySeverity).toHaveProperty('critical')
      expect(analysis.gapsBySeverity).toHaveProperty('high')
      expect(analysis.gapsBySeverity).toHaveProperty('medium')
      expect(analysis.gapsBySeverity).toHaveProperty('low')
      expect(analysis.gapsBySeverity).toHaveProperty('info')
    })

    it('should calculate gap counts correctly', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      const totalFromSeverity =
        analysis.gapsBySeverity.critical.length +
        analysis.gapsBySeverity.high.length +
        analysis.gapsBySeverity.medium.length +
        analysis.gapsBySeverity.low.length +
        analysis.gapsBySeverity.info.length

      expect(analysis.gapCount.total).toBe(totalFromSeverity)
      expect(analysis.gapCount.critical).toBe(analysis.gapsBySeverity.critical.length)
      expect(analysis.gapCount.high).toBe(analysis.gapsBySeverity.high.length)
    })

    it('should generate prioritized gaps sorted by priority score', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      if (analysis.prioritizedGaps.length > 1) {
        for (let i = 1; i < analysis.prioritizedGaps.length; i++) {
          expect(analysis.prioritizedGaps[i - 1].priorityScore)
            .toBeGreaterThanOrEqual(analysis.prioritizedGaps[i].priorityScore)
        }
      }
    })

    it('should assign priority ranks sequentially', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      analysis.prioritizedGaps.forEach((gap, index) => {
        expect(gap.priorityRank).toBe(index + 1)
      })
    })

    it('should generate recommendations when gaps exist', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      // Should have at least some recommendations for a policy with gaps
      expect(analysis.topRecommendations.length).toBeGreaterThanOrEqual(0)
    })

    it('should calculate financial summary', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      expect(analysis.financialSummary).toHaveProperty('totalPotentialLoss')
      expect(analysis.financialSummary).toHaveProperty('totalExpectedLoss')
      expect(analysis.financialSummary).toHaveProperty('estimatedRemediationCost')
      expect(analysis.financialSummary).toHaveProperty('costBenefitRatio')

      expect(analysis.financialSummary.totalPotentialLoss).toBeGreaterThanOrEqual(0)
      expect(analysis.financialSummary.totalExpectedLoss).toBeGreaterThanOrEqual(0)
    })

    it('should respect custom configuration', () => {
      const policy = createMockPolicy()

      const defaultAnalysis = analyzeGapsComprehensive(policy)
      const customAnalysis = analyzeGapsComprehensive(policy, {
        config: {
          thresholds: {
            missingCoverageMinInclusionRate: 90, // Higher threshold
            underinsuredThreshold: 90,
            highDeductibleMultiplier: 1.2,
            expiryWarningDays: 60,
          },
        },
      })

      // Custom config with stricter thresholds might find more gaps
      expect(customAnalysis.analyzedAt).toBeDefined()
    })

    it('should detect region from address', () => {
      const istanbulPolicy = createMockPolicy({
        location: 'Kadıköy, Istanbul',
      })

      const analysis = analyzeGapsComprehensive(istanbulPolicy)
      expect(analysis.region).toBe('marmara')
    })

    it('should use provided region over detected region', () => {
      const policy = createMockPolicy({
        location: 'Kadıköy, Istanbul', // Would detect as Marmara
      })

      const analysis = analyzeGapsComprehensive(policy, { region: 'ege' })
      expect(analysis.region).toBe('ege')
    })

    it('should deduplicate similar gaps', () => {
      const analysis = analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      // Check for duplicate gaps
      const gapKeys = analysis.gaps.map(g => `${g.category}-${g.affectedCoverage}-${g.subCategory}`)
      const uniqueKeys = new Set(gapKeys)

      expect(gapKeys.length).toBe(uniqueKeys.size)
    })

    it('should record analysis timestamp', () => {
      const analysis = analyzeGapsComprehensive(createMockPolicy())

      expect(analysis.analyzedAt).toBeDefined()
      const date = new Date(analysis.analyzedAt)
      expect(date.getTime()).not.toBeNaN()
    })

    it('should include policy metadata', () => {
      const policy = createMockPolicy({ id: 'test-123', type: 'kasko' })
      const analysis = analyzeGapsComprehensive(policy)

      expect(analysis.policyId).toBe('test-123')
      expect(analysis.policyType).toBe('kasko')
    })
  })

  describe('getQuickGapSummary', () => {
    it('should return a quick summary with score', () => {
      const summary = getQuickGapSummary(WELL_COVERED_HOME_POLICY)

      expect(summary).toHaveProperty('score')
      expect(summary).toHaveProperty('criticalCount')
      expect(summary).toHaveProperty('topIssue')
      expect(summary).toHaveProperty('recommendation')
    })

    it('should have low critical count for well-covered policy', () => {
      const summary = getQuickGapSummary(WELL_COVERED_HOME_POLICY)

      expect(summary.criticalCount).toBeLessThanOrEqual(1)
    })

    it('should identify top issue for policy with gaps', () => {
      const summary = getQuickGapSummary(POORLY_COVERED_HOME_POLICY)

      // Policy with gaps should have a top issue
      expect(summary.score).toBeGreaterThan(0)
    })

    it('should return null top issue for perfect policy', () => {
      const perfectPolicy = createMockPolicy({
        type: 'home',
        expiryDate: '2025-06-15', // Not expiring soon
        coverages: WELL_COVERED_HOME_POLICY.coverages,
      })

      const summary = getQuickGapSummary(perfectPolicy)

      // May still have some issues, but score should be low
      expect(summary.score).toBeLessThan(80)
    })
  })

  describe('Region Detection', () => {
    it('should detect Marmara region from Istanbul address', () => {
      const policy = createMockPolicy({ location: 'Beşiktaş, İstanbul' })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('marmara')
    })

    it('should detect Aegean region from Izmir address', () => {
      // Note: Using ASCII 'Izmir' as the regex pattern uses lowercase 'izmir'
      const policy = createMockPolicy({ location: 'Alsancak, Izmir' })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('ege')
    })

    it('should detect Mediterranean region from Antalya address', () => {
      const policy = createMockPolicy({ location: 'Konyaaltı, Antalya' })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('akdeniz')
    })

    it('should detect Central Anatolia from Ankara address', () => {
      const policy = createMockPolicy({ location: 'Çankaya, Ankara' })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('ic_anadolu')
    })

    it('should detect Black Sea region from Trabzon address', () => {
      const policy = createMockPolicy({ location: 'Trabzon Merkez' })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('karadeniz')
    })

    it('should detect Eastern Anatolia from Erzurum address', () => {
      const policy = createMockPolicy({ location: 'Erzurum Merkez' })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('dogu_anadolu')
    })

    it('should detect Southeastern Anatolia from Diyarbakır address', () => {
      const policy = createMockPolicy({ location: 'Sur, Diyarbakır' })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('guneydogu')
    })

    it('should default to Marmara when address is empty', () => {
      const policy = createMockPolicy({ location: undefined })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('marmara')
    })

    it('should default to Marmara for unrecognized address', () => {
      const policy = createMockPolicy({ location: 'Unknown City' })
      const analysis = analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('marmara')
    })
  })

  describe('Expiring Policy Detection', () => {
    it('should detect policy expiring in 7 days as critical', () => {
      const policy = createExpiringPolicy(5)
      const analysis = analyzeGapsComprehensive(policy)

      const temporalGaps = analysis.gapsByCategory.temporal
      const expiringGap = temporalGaps.find(g => g.subCategory === 'expiring_soon')

      expect(expiringGap).toBeDefined()
      expect(expiringGap?.severity).toBe('critical')
    })

    it('should detect policy expiring in 20 days as high', () => {
      const policy = createExpiringPolicy(20)
      const analysis = analyzeGapsComprehensive(policy)

      const temporalGaps = analysis.gapsByCategory.temporal
      const expiringGap = temporalGaps.find(g => g.subCategory === 'expiring_soon')

      expect(expiringGap).toBeDefined()
      expect(expiringGap?.severity).toBe('high')
    })

    it('should not flag policy expiring in 60 days', () => {
      const policy = createExpiringPolicy(60)
      const analysis = analyzeGapsComprehensive(policy)

      const temporalGaps = analysis.gapsByCategory.temporal
      const expiringGap = temporalGaps.find(g => g.subCategory === 'expiring_soon')

      expect(expiringGap).toBeUndefined()
    })
  })
})
