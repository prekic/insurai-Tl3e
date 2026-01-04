/**
 * Mitigation Recommender Tests
 *
 * Tests for risk mitigation recommendations
 */

import { describe, it, expect } from 'vitest'
import {
  generateMitigations,
  getQuickWins,
  calculatePotentialReduction,
  estimateMitigationCost,
  getMitigationSummary,
} from './mitigation-recommender'
import type { RiskScore, RiskMitigation } from '@/types/risk'

const createMockRiskScore = (categoryScores: Partial<Record<string, number>> = {}): RiskScore => ({
  overall: 50,
  level: 'moderate',
  categories: {
    coverage_gaps: {
      score: categoryScores.coverage_gaps ?? 30,
      level: 'low',
      factors: []
    },
    pricing: {
      score: categoryScores.pricing ?? 20,
      level: 'low',
      factors: []
    },
    provider: {
      score: categoryScores.provider ?? 25,
      level: 'low',
      factors: []
    },
    temporal: {
      score: categoryScores.temporal ?? 10,
      level: 'very_low',
      factors: []
    },
    geographic: {
      score: categoryScores.geographic ?? 15,
      level: 'low',
      factors: []
    },
    concentration: {
      score: categoryScores.concentration ?? 20,
      level: 'low',
      factors: []
    },
    deductible: {
      score: categoryScores.deductible ?? 25,
      level: 'low',
      factors: []
    },
    exclusions: {
      score: categoryScores.exclusions ?? 30,
      level: 'low',
      factors: []
    },
  },
  topFactors: [],
  confidence: {
    overall: 0.8,
    dataQuality: 0.75,
    modelCertainty: 0.85,
  },
  percentile: 50,
  calculatedAt: Date.now(),
  modelVersion: '1.0.0',
})

describe('Mitigation Recommender', () => {
  describe('generateMitigations', () => {
    it('should return an array of mitigations', () => {
      const riskScore = createMockRiskScore()
      const mitigations = generateMitigations(riskScore)

      expect(Array.isArray(mitigations)).toBe(true)
    })

    it('should generate mitigations for high coverage gap scores', () => {
      const riskScore = createMockRiskScore({ coverage_gaps: 65 })
      const mitigations = generateMitigations(riskScore)

      const coverageGapMitigations = mitigations.filter(m => m.category === 'coverage_gaps')
      expect(coverageGapMitigations.length).toBeGreaterThan(0)
    })

    it('should generate critical mitigation for very high scores', () => {
      const riskScore = createMockRiskScore({ coverage_gaps: 70 })
      const mitigations = generateMitigations(riskScore)

      const criticalMitigations = mitigations.filter(m => m.priority === 'critical')
      expect(criticalMitigations.length).toBeGreaterThan(0)
    })

    it('should generate high priority mitigation for high scores', () => {
      const riskScore = createMockRiskScore({ pricing: 55 })
      const mitigations = generateMitigations(riskScore)

      const highMitigations = mitigations.filter(m => m.priority === 'high')
      expect(highMitigations.length).toBeGreaterThan(0)
    })

    it('should generate medium priority mitigation for moderate scores', () => {
      const riskScore = createMockRiskScore({ pricing: 35 })
      const mitigations = generateMitigations(riskScore)

      const mediumMitigations = mitigations.filter(m =>
        m.category === 'pricing' && m.priority === 'medium'
      )
      expect(mediumMitigations.length).toBeGreaterThan(0)
    })

    it('should generate temporal mitigations for high temporal risks', () => {
      const riskScore = createMockRiskScore({ temporal: 85 })
      const mitigations = generateMitigations(riskScore)

      const temporalMitigations = mitigations.filter(m => m.category === 'temporal')
      expect(temporalMitigations.length).toBeGreaterThan(0)
      expect(temporalMitigations[0].priority).toBe('critical')
    })

    it('should sort mitigations by priority and impact', () => {
      const riskScore = createMockRiskScore({
        coverage_gaps: 70,
        temporal: 55,
        pricing: 35,
      })
      const mitigations = generateMitigations(riskScore)

      if (mitigations.length >= 2) {
        const priorityOrder: Record<string, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        }

        for (let i = 1; i < mitigations.length; i++) {
          const prevPriority = priorityOrder[mitigations[i - 1].priority]
          const currPriority = priorityOrder[mitigations[i].priority]

          if (prevPriority === currPriority) {
            expect(mitigations[i - 1].expectedImpact).toBeGreaterThanOrEqual(
              mitigations[i].expectedImpact
            )
          } else {
            expect(prevPriority).toBeLessThanOrEqual(currPriority)
          }
        }
      }
    })

    it('should include issue description in each mitigation', () => {
      const riskScore = createMockRiskScore({ coverage_gaps: 70 })
      const mitigations = generateMitigations(riskScore)

      mitigations.forEach(m => {
        expect(m.issue).toBeDefined()
        expect(m.issue.length).toBeGreaterThan(0)
      })
    })

    it('should include recommendation in each mitigation', () => {
      const riskScore = createMockRiskScore({ coverage_gaps: 70 })
      const mitigations = generateMitigations(riskScore)

      mitigations.forEach(m => {
        expect(m.recommendation).toBeDefined()
        expect(m.recommendation.length).toBeGreaterThan(0)
      })
    })

    it('should include expected impact for each mitigation', () => {
      const riskScore = createMockRiskScore({ coverage_gaps: 70 })
      const mitigations = generateMitigations(riskScore)

      mitigations.forEach(m => {
        expect(m.expectedImpact).toBeDefined()
        expect(m.expectedImpact).toBeGreaterThan(0)
      })
    })

    it('should include difficulty for each mitigation', () => {
      const riskScore = createMockRiskScore({ coverage_gaps: 70 })
      const mitigations = generateMitigations(riskScore)

      mitigations.forEach(m => {
        expect(['easy', 'moderate', 'difficult']).toContain(m.difficulty)
      })
    })

    it('should return empty array for low risk scores', () => {
      const riskScore = createMockRiskScore({
        coverage_gaps: 10,
        pricing: 10,
        provider: 10,
        temporal: 5,
        geographic: 10,
        concentration: 15,
        deductible: 10,
        exclusions: 10,
      })
      const mitigations = generateMitigations(riskScore)

      expect(mitigations.length).toBe(0)
    })
  })

  describe('getQuickWins', () => {
    it('should return easy mitigations with high impact', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'high',
          category: 'pricing',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 15,
          difficulty: 'easy',
        },
        {
          priority: 'critical',
          category: 'coverage_gaps',
          issue: 'Issue 2',
          recommendation: 'Rec 2',
          expectedImpact: 25,
          difficulty: 'moderate',
        },
        {
          priority: 'medium',
          category: 'temporal',
          issue: 'Issue 3',
          recommendation: 'Rec 3',
          expectedImpact: 12,
          difficulty: 'easy',
        },
      ]

      const quickWins = getQuickWins(mitigations)

      expect(quickWins.length).toBeLessThanOrEqual(3)
      quickWins.forEach(qw => {
        expect(qw.difficulty).toBe('easy')
        expect(qw.expectedImpact).toBeGreaterThanOrEqual(10)
      })
    })

    it('should return at most 3 quick wins', () => {
      const mitigations: RiskMitigation[] = Array(5).fill(null).map((_, i) => ({
        priority: 'high' as const,
        category: 'pricing' as const,
        issue: `Issue ${i}`,
        recommendation: `Rec ${i}`,
        expectedImpact: 15,
        difficulty: 'easy' as const,
      }))

      const quickWins = getQuickWins(mitigations)

      expect(quickWins.length).toBe(3)
    })

    it('should filter out difficult mitigations', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'high',
          category: 'pricing',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 20,
          difficulty: 'complex',
        },
        {
          priority: 'high',
          category: 'coverage_gaps',
          issue: 'Issue 2',
          recommendation: 'Rec 2',
          expectedImpact: 15,
          difficulty: 'easy',
        },
      ]

      const quickWins = getQuickWins(mitigations)

      expect(quickWins.every(qw => qw.difficulty === 'easy')).toBe(true)
    })

    it('should filter out low impact mitigations', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'medium',
          category: 'pricing',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 5, // Low impact
          difficulty: 'easy',
        },
        {
          priority: 'high',
          category: 'coverage_gaps',
          issue: 'Issue 2',
          recommendation: 'Rec 2',
          expectedImpact: 15,
          difficulty: 'easy',
        },
      ]

      const quickWins = getQuickWins(mitigations)

      expect(quickWins.every(qw => qw.expectedImpact >= 10)).toBe(true)
    })

    it('should return empty array if no quick wins available', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'high',
          category: 'pricing',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 20,
          difficulty: 'complex',
        },
      ]

      const quickWins = getQuickWins(mitigations)

      expect(quickWins.length).toBe(0)
    })
  })

  describe('calculatePotentialReduction', () => {
    it('should calculate total potential reduction', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'high',
          category: 'pricing',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 15,
          difficulty: 'easy',
        },
        {
          priority: 'high',
          category: 'coverage_gaps',
          issue: 'Issue 2',
          recommendation: 'Rec 2',
          expectedImpact: 20,
          difficulty: 'easy',
        },
      ]

      const reduction = calculatePotentialReduction(mitigations)

      // 70% effectiveness: (15 + 20) * 0.7 = 24.5
      expect(reduction).toBeCloseTo(24.5, 0)
    })

    it('should cap reduction at 50 points', () => {
      const mitigations: RiskMitigation[] = Array(10).fill(null).map((_, i) => ({
        priority: 'high' as const,
        category: 'pricing' as const,
        issue: `Issue ${i}`,
        recommendation: `Rec ${i}`,
        expectedImpact: 20,
        difficulty: 'easy' as const,
      }))

      const reduction = calculatePotentialReduction(mitigations)

      expect(reduction).toBe(50)
    })

    it('should return 0 for empty mitigations', () => {
      const reduction = calculatePotentialReduction([])

      expect(reduction).toBe(0)
    })
  })

  describe('estimateMitigationCost', () => {
    it('should estimate cost based on premium', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'high',
          category: 'coverage_gaps',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 20,
          estimatedCost: 30, // 30% increase
          difficulty: 'easy',
        },
      ]

      const cost = estimateMitigationCost(mitigations, 10000)

      expect(cost).toBeCloseTo(3000, 0)
    })

    it('should compound multiple cost increases', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'high',
          category: 'coverage_gaps',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 20,
          estimatedCost: 20,
          difficulty: 'easy',
        },
        {
          priority: 'high',
          category: 'deductible',
          issue: 'Issue 2',
          recommendation: 'Rec 2',
          expectedImpact: 15,
          estimatedCost: 10,
          difficulty: 'easy',
        },
      ]

      const cost = estimateMitigationCost(mitigations, 10000)

      // Compound: (1.2 * 1.1 - 1) * 10000 = 3200
      expect(cost).toBeCloseTo(3200, 0)
    })

    it('should return null for null premium', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'high',
          category: 'coverage_gaps',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 20,
          estimatedCost: 30,
          difficulty: 'easy',
        },
      ]

      const cost = estimateMitigationCost(mitigations, null)

      expect(cost).toBeNull()
    })

    it('should return 0 for mitigations without cost', () => {
      const mitigations: RiskMitigation[] = [
        {
          priority: 'high',
          category: 'pricing',
          issue: 'Issue 1',
          recommendation: 'Rec 1',
          expectedImpact: 15,
          difficulty: 'easy',
          // No estimatedCost
        },
      ]

      const cost = estimateMitigationCost(mitigations, 10000)

      expect(cost).toBe(0)
    })
  })

  describe('getMitigationSummary', () => {
    it('should count mitigations by priority', () => {
      const mitigations: RiskMitigation[] = [
        { priority: 'critical', category: 'coverage_gaps', issue: '', recommendation: '', expectedImpact: 30, difficulty: 'easy' },
        { priority: 'critical', category: 'temporal', issue: '', recommendation: '', expectedImpact: 25, difficulty: 'easy' },
        { priority: 'high', category: 'pricing', issue: '', recommendation: '', expectedImpact: 15, difficulty: 'easy' },
        { priority: 'high', category: 'provider', issue: '', recommendation: '', expectedImpact: 12, difficulty: 'moderate' },
        { priority: 'high', category: 'deductible', issue: '', recommendation: '', expectedImpact: 10, difficulty: 'easy' },
        { priority: 'medium', category: 'exclusions', issue: '', recommendation: '', expectedImpact: 8, difficulty: 'easy' },
        { priority: 'low', category: 'geographic', issue: '', recommendation: '', expectedImpact: 5, difficulty: 'easy' },
      ]

      const summary = getMitigationSummary(mitigations)

      expect(summary.critical).toBe(2)
      expect(summary.high).toBe(3)
      expect(summary.medium).toBe(1)
      expect(summary.low).toBe(1)
    })

    it('should include total impact', () => {
      const mitigations: RiskMitigation[] = [
        { priority: 'high', category: 'pricing', issue: '', recommendation: '', expectedImpact: 15, difficulty: 'easy' },
        { priority: 'high', category: 'coverage_gaps', issue: '', recommendation: '', expectedImpact: 20, difficulty: 'easy' },
      ]

      const summary = getMitigationSummary(mitigations)

      expect(summary.totalImpact).toBeGreaterThan(0)
    })

    it('should return zeros for empty mitigations', () => {
      const summary = getMitigationSummary([])

      expect(summary.critical).toBe(0)
      expect(summary.high).toBe(0)
      expect(summary.medium).toBe(0)
      expect(summary.low).toBe(0)
      expect(summary.totalImpact).toBe(0)
    })
  })
})
