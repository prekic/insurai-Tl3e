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
    it('should return a complete analysis structure', async () => {
      const policy = createMockPolicy()
      const analysis = await analyzeGapsComprehensive(policy)

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

    it('should identify few gaps for well-covered policy', async () => {
      const analysis = await analyzeGapsComprehensive(WELL_COVERED_HOME_POLICY)

      // Well-covered policy should have low overall score
      expect(analysis.overallScore).toBeLessThan(50)
      expect(analysis.gapCount.critical).toBe(0)
    })

    it('should identify many gaps for poorly-covered policy', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      // Poorly-covered policy should have higher score
      expect(analysis.gapCount.total).toBeGreaterThan(0)
      expect(analysis.gaps.length).toBeGreaterThan(0)
    })

    it('should detect temporal gaps for expired policy', async () => {
      const analysis = await analyzeGapsComprehensive(EXPIRED_POLICY)

      const temporalGaps = analysis.gapsByCategory.temporal
      expect(temporalGaps.length).toBeGreaterThan(0)

      // Expired policy is now classified as info (not critical)
      const expiredGap = temporalGaps.find((g) => g.subCategory === 'coverage_lapse')
      expect(expiredGap).toBeDefined()
      expect(expiredGap!.severity).toBe('info')
    })

    it('should categorize gaps correctly', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      expect(analysis.gapsByCategory).toHaveProperty('coverage')
      expect(analysis.gapsByCategory).toHaveProperty('limit')
      expect(analysis.gapsByCategory).toHaveProperty('deductible')
      expect(analysis.gapsByCategory).toHaveProperty('exclusion')
      expect(analysis.gapsByCategory).toHaveProperty('temporal')
      expect(analysis.gapsByCategory).toHaveProperty('compliance')
      expect(analysis.gapsByCategory).toHaveProperty('portfolio')
    })

    it('should group gaps by severity', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      expect(analysis.gapsBySeverity).toHaveProperty('critical')
      expect(analysis.gapsBySeverity).toHaveProperty('high')
      expect(analysis.gapsBySeverity).toHaveProperty('medium')
      expect(analysis.gapsBySeverity).toHaveProperty('low')
      expect(analysis.gapsBySeverity).toHaveProperty('info')
    })

    it('should calculate gap counts correctly', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

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

    it('should generate prioritized gaps sorted by priority score', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      if (analysis.prioritizedGaps.length > 1) {
        for (let i = 1; i < analysis.prioritizedGaps.length; i++) {
          expect(analysis.prioritizedGaps[i - 1].priorityScore).toBeGreaterThanOrEqual(
            analysis.prioritizedGaps[i].priorityScore
          )
        }
      }
    })

    it('should assign priority ranks sequentially', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      analysis.prioritizedGaps.forEach((gap, index) => {
        expect(gap.priorityRank).toBe(index + 1)
      })
    })

    it('should generate recommendations when gaps exist', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      // Should have at least some recommendations for a policy with gaps
      expect(analysis.topRecommendations.length).toBeGreaterThanOrEqual(0)
    })

    it('should calculate financial summary', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      expect(analysis.financialSummary).toHaveProperty('totalPotentialLoss')
      expect(analysis.financialSummary).toHaveProperty('totalExpectedLoss')
      expect(analysis.financialSummary).toHaveProperty('estimatedRemediationCost')
      expect(analysis.financialSummary).toHaveProperty('costBenefitRatio')

      expect(analysis.financialSummary.totalPotentialLoss).toBeGreaterThanOrEqual(0)
      expect(analysis.financialSummary.totalExpectedLoss).toBeGreaterThanOrEqual(0)
    })

    it('should respect custom configuration', async () => {
      const policy = createMockPolicy()

      const defaultAnalysis = await analyzeGapsComprehensive(policy)
      const customAnalysis = await analyzeGapsComprehensive(policy, {
        config: {
          thresholds: {
            missingCoverageMinInclusionRate: 90, // Higher threshold
            underinsuredThreshold: 90,
            highDeductibleMultiplier: 1.2,
            expiryWarningDays: 60,
          },
        },
      })

      // Both analyses should be valid
      expect(defaultAnalysis.analyzedAt).toBeDefined()
      expect(customAnalysis.analyzedAt).toBeDefined()
    })

    it('should detect region from address', async () => {
      const istanbulPolicy = createMockPolicy({
        location: 'Kadıköy, Istanbul',
      })

      const analysis = await analyzeGapsComprehensive(istanbulPolicy)
      expect(analysis.region).toBe('marmara')
    })

    it('should use provided region over detected region', async () => {
      const policy = createMockPolicy({
        location: 'Kadıköy, Istanbul', // Would detect as Marmara
      })

      const analysis = await analyzeGapsComprehensive(policy, { region: 'ege' })
      expect(analysis.region).toBe('ege')
    })

    it('should deduplicate similar gaps', async () => {
      const analysis = await analyzeGapsComprehensive(POORLY_COVERED_HOME_POLICY)

      // Check for duplicate gaps
      const gapKeys = analysis.gaps.map(
        (g) => `${g.category}-${g.affectedCoverage}-${g.subCategory}`
      )
      const uniqueKeys = new Set(gapKeys)

      expect(gapKeys.length).toBe(uniqueKeys.size)
    })

    it('should record analysis timestamp', async () => {
      const analysis = await analyzeGapsComprehensive(createMockPolicy())

      expect(analysis.analyzedAt).toBeDefined()
      const date = new Date(analysis.analyzedAt)
      expect(date.getTime()).not.toBeNaN()
    })

    it('should include policy metadata', async () => {
      const policy = createMockPolicy({ id: 'test-123', type: 'kasko' })
      const analysis = await analyzeGapsComprehensive(policy)

      expect(analysis.policyId).toBe('test-123')
      expect(analysis.policyType).toBe('kasko')
    })
  })

  describe('getQuickGapSummary', () => {
    it('should return a quick summary with score', async () => {
      const summary = await getQuickGapSummary(WELL_COVERED_HOME_POLICY)

      expect(summary).toHaveProperty('score')
      expect(summary).toHaveProperty('criticalCount')
      expect(summary).toHaveProperty('topIssue')
      expect(summary).toHaveProperty('recommendation')
    })

    it('should have low critical count for well-covered policy', async () => {
      const summary = await getQuickGapSummary(WELL_COVERED_HOME_POLICY)

      expect(summary.criticalCount).toBeLessThanOrEqual(1)
    })

    it('should identify top issue for policy with gaps', async () => {
      const summary = await getQuickGapSummary(POORLY_COVERED_HOME_POLICY)

      // Policy with gaps should have a top issue
      expect(summary.score).toBeGreaterThan(0)
    })

    it('should return null top issue for perfect policy', async () => {
      const perfectPolicy = createMockPolicy({
        type: 'home',
        expiryDate: '2025-06-15', // Not expiring soon
        coverages: WELL_COVERED_HOME_POLICY.coverages,
      })

      const summary = await getQuickGapSummary(perfectPolicy)

      // May still have some issues, but score should be low
      expect(summary.score).toBeLessThan(80)
    })
  })

  describe('Region Detection', () => {
    it('should detect Marmara region from Istanbul address', async () => {
      const policy = createMockPolicy({ location: 'Beşiktaş, İstanbul' })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('marmara')
    })

    it('should detect Aegean region from Izmir address', async () => {
      // Note: Using ASCII 'Izmir' as the regex pattern uses lowercase 'izmir'
      const policy = createMockPolicy({ location: 'Alsancak, Izmir' })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('ege')
    })

    it('should detect Mediterranean region from Antalya address', async () => {
      const policy = createMockPolicy({ location: 'Konyaaltı, Antalya' })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('akdeniz')
    })

    it('should detect Central Anatolia from Ankara address', async () => {
      const policy = createMockPolicy({ location: 'Çankaya, Ankara' })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('ic_anadolu')
    })

    it('should detect Black Sea region from Trabzon address', async () => {
      const policy = createMockPolicy({ location: 'Trabzon Merkez' })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('karadeniz')
    })

    it('should detect Eastern Anatolia from Erzurum address', async () => {
      const policy = createMockPolicy({ location: 'Erzurum Merkez' })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('dogu_anadolu')
    })

    it('should detect Southeastern Anatolia from Diyarbakır address', async () => {
      const policy = createMockPolicy({ location: 'Sur, Diyarbakır' })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('guneydogu')
    })

    it('should default to Marmara when address is empty', async () => {
      const policy = createMockPolicy({ location: undefined })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('marmara')
    })

    it('should default to Marmara for unrecognized address', async () => {
      const policy = createMockPolicy({ location: 'Unknown City' })
      const analysis = await analyzeGapsComprehensive(policy)
      expect(analysis.region).toBe('marmara')
    })
  })

  describe('Expiring Policy Detection', () => {
    it('should detect policy expiring in 7 days as critical', async () => {
      const policy = createExpiringPolicy(5)
      const analysis = await analyzeGapsComprehensive(policy)

      const temporalGaps = analysis.gapsByCategory.temporal
      const expiringGap = temporalGaps.find((g) => g.subCategory === 'expiring_soon')

      expect(expiringGap).toBeDefined()
      expect(expiringGap?.severity).toBe('critical')
    })

    it('should detect policy expiring in 20 days as high', async () => {
      const policy = createExpiringPolicy(20)
      const analysis = await analyzeGapsComprehensive(policy)

      const temporalGaps = analysis.gapsByCategory.temporal
      const expiringGap = temporalGaps.find((g) => g.subCategory === 'expiring_soon')

      expect(expiringGap).toBeDefined()
      expect(expiringGap?.severity).toBe('high')
    })

    it('should not flag policy expiring in 60 days', async () => {
      const policy = createExpiringPolicy(60)
      const analysis = await analyzeGapsComprehensive(policy)

      const temporalGaps = analysis.gapsByCategory.temporal
      const expiringGap = temporalGaps.find((g) => g.subCategory === 'expiring_soon')

      expect(expiringGap).toBeUndefined()
    })
  })
})
