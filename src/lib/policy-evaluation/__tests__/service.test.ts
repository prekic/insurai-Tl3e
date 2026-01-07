/**
 * Tests for PolicyEvaluationService
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PolicyEvaluationService, policyEvaluator } from '../index'
import type { Policy } from '@/types/policy'

// =============================================================================
// MOCK DATA FACTORY
// =============================================================================

function createMockPolicy(overrides: Partial<Policy> = {}): Policy {
  const now = new Date()
  const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const expiryDate = new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000)

  return {
    id: 'test-policy-1',
    policyNumber: 'POL-2026-001',
    provider: 'Test Insurance',
    logo: '/test-logo.png',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 15000,
    monthlyPremium: 1250,
    deductible: 5000,
    startDate: startDate.toISOString(),
    expiryDate: expiryDate.toISOString(),
    status: 'active',
    uploadDate: now.toISOString(),
    fileName: 'test-policy.pdf',
    documentType: 'policy',
    insuranceLine: 'Auto',
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 2000, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 200000, deductible: 1000, included: true },
      { name: 'Fire', nameTr: 'Yangın', limit: 200000, deductible: 500, included: true },
    ],
    exclusions: ['Racing', 'War'],
    specialConditions: [],
    ...overrides,
  }
}

function createHighScorePolicy(): Policy {
  return createMockPolicy({
    id: 'high-score',
    coverage: 800000,
    premium: 12000,
    deductible: 2000,
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 300000, deductible: 500, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 300000, deductible: 500, included: true },
      { name: 'Fire', nameTr: 'Yangın', limit: 300000, deductible: 0, included: true },
      { name: 'Glass', nameTr: 'Cam', limit: 20000, deductible: 0, included: true },
      { name: 'Roadside Assistance', nameTr: 'Yol Yardım', limit: 5000, deductible: 0, included: true },
    ],
  })
}

function createLowScorePolicy(): Policy {
  return createMockPolicy({
    id: 'low-score',
    coverage: 150000,
    premium: 20000,
    deductible: 15000,
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 100000, deductible: 10000, included: true },
    ],
    exclusions: ['Theft', 'Fire', 'Natural disasters', 'Glass', 'Vandalism', 'Flooding', 'Hail', 'Parking', 'Key loss', 'Personal effects', 'Legal'],
  })
}

function createMediumScorePolicy(): Policy {
  return createMockPolicy({
    id: 'medium-score',
    coverage: 400000,
    premium: 14000,
    deductible: 6000,
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 3000, included: true },
      { name: 'Fire', nameTr: 'Yangın', limit: 200000, deductible: 3000, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 150000, deductible: 2000, included: true },
    ],
  })
}

function createNonCompliantPolicy(): Policy {
  const now = new Date()
  const startDate = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000)
  const expiryDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // Expired

  return createMockPolicy({
    id: 'non-compliant',
    startDate: startDate.toISOString(),
    expiryDate: expiryDate.toISOString(),
    status: 'expired',
  })
}

// =============================================================================
// TESTS
// =============================================================================

describe('PolicyEvaluationService', () => {
  let service: PolicyEvaluationService

  beforeEach(() => {
    service = new PolicyEvaluationService()
  })

  // =========================================================================
  // CONSTRUCTOR
  // =========================================================================

  describe('Constructor', () => {
    it('should create service without config', () => {
      const svc = new PolicyEvaluationService()
      expect(svc).toBeDefined()
    })

    it('should create service with custom config', () => {
      const svc = new PolicyEvaluationService({
        weights: { premium: 40, coverage: 30, deductible: 10, compliance: 10, value: 10 },
      })
      expect(svc).toBeDefined()
    })
  })

  // =========================================================================
  // evaluate()
  // =========================================================================

  describe('evaluate()', () => {
    it('should evaluate a single policy', () => {
      const policy = createMockPolicy()
      const evaluation = service.evaluate(policy)

      expect(evaluation).toBeDefined()
      expect(evaluation.policyId).toBe(policy.id)
      expect(evaluation.overallScore).toBeGreaterThanOrEqual(0)
    })

    it('should return complete evaluation structure', () => {
      const policy = createMockPolicy()
      const evaluation = service.evaluate(policy)

      expect(evaluation.grade).toBeDefined()
      expect(evaluation.status).toBeDefined()
      expect(evaluation.scoreBreakdown).toBeDefined()
      expect(evaluation.marketComparison).toBeDefined()
      expect(evaluation.compliance).toBeDefined()
      expect(evaluation.recommendations).toBeDefined()
      expect(evaluation.summary).toBeDefined()
    })

    it('should use service config for evaluation', () => {
      const customService = new PolicyEvaluationService({
        weights: { premium: 50, coverage: 20, deductible: 10, compliance: 10, value: 10 },
      })
      const policy = createMockPolicy()
      const evaluation = customService.evaluate(policy)

      expect(evaluation.scoreBreakdown.premium.weight).toBe(50)
      expect(evaluation.scoreBreakdown.coverage.weight).toBe(20)
    })
  })

  // =========================================================================
  // evaluateMultiple()
  // =========================================================================

  describe('evaluateMultiple()', () => {
    it('should evaluate multiple policies', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy(), createMediumScorePolicy()]
      const evaluations = service.evaluateMultiple(policies)

      expect(evaluations).toHaveLength(3)
    })

    it('should return evaluation for each policy', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const evaluations = service.evaluateMultiple(policies)

      expect(evaluations[0].policyId).toBe('high-score')
      expect(evaluations[1].policyId).toBe('low-score')
    })

    it('should handle empty array', () => {
      const evaluations = service.evaluateMultiple([])
      expect(evaluations).toHaveLength(0)
    })

    it('should handle single policy array', () => {
      const evaluations = service.evaluateMultiple([createMockPolicy()])
      expect(evaluations).toHaveLength(1)
    })
  })

  // =========================================================================
  // compare()
  // =========================================================================

  describe('compare()', () => {
    it('should compare 2 policies', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const comparison = service.compare(policies)

      expect(comparison).toBeDefined()
      expect(comparison.policies).toHaveLength(2)
    })

    it('should compare 3 policies', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy(), createMediumScorePolicy()]
      const comparison = service.compare(policies)

      expect(comparison.policies).toHaveLength(3)
    })

    it('should apply custom labels', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const comparison = service.compare(policies, ['Best Option', 'Budget Option'])

      expect(comparison.policies[0].label).toBe('Best Option')
      expect(comparison.policies[1].label).toBe('Budget Option')
    })

    it('should return winners', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const comparison = service.compare(policies)

      expect(comparison.winners.overallBest).toBeDefined()
      expect(comparison.winners.bestPremium).toBeDefined()
      expect(comparison.winners.bestCoverage).toBeDefined()
    })

    it('should throw for less than 2 policies', () => {
      expect(() => service.compare([createMockPolicy()])).toThrow()
    })
  })

  // =========================================================================
  // quickCompare()
  // =========================================================================

  describe('quickCompare()', () => {
    it('should return quick comparison result', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const result = service.quickCompare(policies)

      expect(result.winner).toBeDefined()
      expect(result.scores).toHaveLength(2)
      expect(result.premiumRange).toBeDefined()
      expect(result.coverageRange).toBeDefined()
    })

    it('should identify correct winner', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const result = service.quickCompare(policies)

      // High score policy should win
      const highScoreResult = result.scores.find(s => s.policyId === 'high-score')
      const lowScoreResult = result.scores.find(s => s.policyId === 'low-score')

      expect(highScoreResult?.score).toBeGreaterThan(lowScoreResult?.score ?? 0)
    })
  })

  // =========================================================================
  // compareCoverage()
  // =========================================================================

  describe('compareCoverage()', () => {
    it('should compare specific coverage across policies', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const result = service.compareCoverage(policies, 'Collision')

      expect(result.available.length).toBeGreaterThan(0)
    })

    it('should identify policies missing coverage', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const result = service.compareCoverage(policies, 'Glass')

      // Only high-score has Glass
      expect(result.available.some(a => a.policyId === 'high-score')).toBe(true)
      expect(result.notAvailable).toContain('low-score')
    })

    it('should identify best policy for coverage', () => {
      const policies = [createHighScorePolicy(), createMediumScorePolicy()]
      const result = service.compareCoverage(policies, 'Collision')

      expect(result.best).toBe('high-score') // Higher limit, lower deductible
    })
  })

  // =========================================================================
  // getBest()
  // =========================================================================

  describe('getBest()', () => {
    it('should return best policy and its evaluation', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy(), createMediumScorePolicy()]
      const result = service.getBest(policies)

      expect(result.policy).toBeDefined()
      expect(result.evaluation).toBeDefined()
    })

    it('should return high score policy as best', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy(), createMediumScorePolicy()]
      const result = service.getBest(policies)

      expect(result.policy.id).toBe('high-score')
    })

    it('should handle single policy', () => {
      const policies = [createMockPolicy()]
      const result = service.getBest(policies)

      expect(result.policy.id).toBe('test-policy-1')
    })
  })

  // =========================================================================
  // sortByScore()
  // =========================================================================

  describe('sortByScore()', () => {
    it('should sort policies by score (best first)', () => {
      const policies = [createLowScorePolicy(), createHighScorePolicy(), createMediumScorePolicy()]
      const sorted = service.sortByScore(policies)

      expect(sorted[0].policy.id).toBe('high-score')
      // Scores should be in descending order
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].evaluation.overallScore).toBeGreaterThanOrEqual(sorted[i].evaluation.overallScore)
      }
    })

    it('should include evaluation for each sorted policy', () => {
      const policies = [createLowScorePolicy(), createHighScorePolicy()]
      const sorted = service.sortByScore(policies)

      sorted.forEach(item => {
        expect(item.policy).toBeDefined()
        expect(item.evaluation).toBeDefined()
        expect(item.evaluation.policyId).toBe(item.policy.id)
      })
    })

    it('should handle empty array', () => {
      const sorted = service.sortByScore([])
      expect(sorted).toHaveLength(0)
    })
  })

  // =========================================================================
  // filterByMinScore()
  // =========================================================================

  describe('filterByMinScore()', () => {
    it('should filter policies below minimum score', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy(), createMediumScorePolicy()]
      const filtered = service.filterByMinScore(policies, 60)

      // Low score policy should be filtered out (it has many issues)
      expect(filtered.length).toBeLessThan(policies.length)
    })

    it('should return all policies for very low threshold', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const filtered = service.filterByMinScore(policies, 0)

      expect(filtered).toHaveLength(2)
    })

    it('should return no policies for very high threshold', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const filtered = service.filterByMinScore(policies, 100)

      expect(filtered).toHaveLength(0)
    })

    it('should handle empty array', () => {
      const filtered = service.filterByMinScore([], 50)
      expect(filtered).toHaveLength(0)
    })
  })

  // =========================================================================
  // getNonCompliant()
  // =========================================================================

  describe('getNonCompliant()', () => {
    it('should return policies with critical compliance issues', () => {
      const policies = [createHighScorePolicy(), createNonCompliantPolicy()]
      const nonCompliant = service.getNonCompliant(policies)

      expect(nonCompliant.some(p => p.id === 'non-compliant')).toBe(true)
    })

    it('should not include compliant policies', () => {
      const policies = [createHighScorePolicy(), createMediumScorePolicy()]
      const nonCompliant = service.getNonCompliant(policies)

      // Active, valid policies should be compliant
      expect(nonCompliant.length).toBe(0)
    })

    it('should handle all compliant policies', () => {
      const policies = [createHighScorePolicy(), createMediumScorePolicy()]
      const nonCompliant = service.getNonCompliant(policies)

      expect(nonCompliant).toHaveLength(0)
    })

    it('should handle empty array', () => {
      const nonCompliant = service.getNonCompliant([])
      expect(nonCompliant).toHaveLength(0)
    })
  })

  // =========================================================================
  // getSummaryStats()
  // =========================================================================

  describe('getSummaryStats()', () => {
    it('should return summary statistics', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy(), createMediumScorePolicy()]
      const stats = service.getSummaryStats(policies)

      expect(stats.count).toBe(3)
      expect(stats.avgScore).toBeGreaterThanOrEqual(0)
      expect(stats.minScore).toBeGreaterThanOrEqual(0)
      expect(stats.maxScore).toBeGreaterThanOrEqual(stats.minScore)
    })

    it('should calculate correct average score', () => {
      const policies = [createHighScorePolicy(), createMediumScorePolicy()]
      const stats = service.getSummaryStats(policies)

      expect(stats.avgScore).toBeGreaterThan(0)
      expect(stats.avgScore).toBeLessThanOrEqual(100)
    })

    it('should count compliant policies', () => {
      const policies = [createHighScorePolicy(), createNonCompliantPolicy()]
      const stats = service.getSummaryStats(policies)

      expect(stats.compliantCount).toBeGreaterThanOrEqual(0)
      expect(stats.compliantCount).toBeLessThanOrEqual(stats.count)
    })

    it('should calculate average premium and coverage', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const stats = service.getSummaryStats(policies)

      expect(stats.avgPremium).toBeGreaterThan(0)
      expect(stats.avgCoverage).toBeGreaterThan(0)
    })

    it('should calculate grade distribution', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy(), createMediumScorePolicy()]
      const stats = service.getSummaryStats(policies)

      expect(stats.gradeDistribution).toBeDefined()
      expect(stats.gradeDistribution).toHaveProperty('A')
      expect(stats.gradeDistribution).toHaveProperty('B')
      expect(stats.gradeDistribution).toHaveProperty('C')
      expect(stats.gradeDistribution).toHaveProperty('D')
      expect(stats.gradeDistribution).toHaveProperty('F')

      // Sum should equal count
      const total = Object.values(stats.gradeDistribution).reduce((a, b) => a + b, 0)
      expect(total).toBe(stats.count)
    })
  })

  // =========================================================================
  // generateReport()
  // =========================================================================

  describe('generateReport()', () => {
    it('should generate comparison report', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const report = service.generateReport(policies)

      expect(report.comparison).toBeDefined()
      expect(report.summary).toBeTruthy()
      expect(report.summaryTR).toBeTruthy()
    })

    it('should apply custom labels to report', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const report = service.generateReport(policies, ['Premium Plan', 'Basic Plan'])

      expect(report.summary).toContain('Premium Plan')
    })

    it('should include comparison metrics in summary', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const report = service.generateReport(policies)

      expect(report.summary).toContain('TL')
      expect(report.summaryTR).toContain('TL')
    })

    it('should reference winner in summary', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const labels = ['Option A', 'Option B']
      const report = service.generateReport(policies, labels)

      // Summary should mention the recommended policy
      expect(report.summary.includes('recommended') || report.summary.includes('Option')).toBe(true)
    })
  })

  // =========================================================================
  // SINGLETON INSTANCE
  // =========================================================================

  describe('policyEvaluator singleton', () => {
    it('should be a PolicyEvaluationService instance', () => {
      expect(policyEvaluator).toBeInstanceOf(PolicyEvaluationService)
    })

    it('should be usable for evaluation', () => {
      const policy = createMockPolicy()
      const evaluation = policyEvaluator.evaluate(policy)

      expect(evaluation).toBeDefined()
      expect(evaluation.overallScore).toBeGreaterThanOrEqual(0)
    })

    it('should be usable for comparison', () => {
      const policies = [createHighScorePolicy(), createLowScorePolicy()]
      const comparison = policyEvaluator.compare(policies)

      expect(comparison).toBeDefined()
      expect(comparison.winners).toBeDefined()
    })
  })
})
