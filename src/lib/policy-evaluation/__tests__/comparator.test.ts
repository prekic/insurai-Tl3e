/**
 * Tests for Multi-Policy Comparator
 */

import { describe, it, expect } from 'vitest'
import { comparePolicies, quickCompare, compareCoverage } from '../comparator'
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

// Create policies with distinct characteristics for comparison
function createCheapPolicy(): Policy {
  return createMockPolicy({
    id: 'cheap-policy',
    policyNumber: 'CHEAP-001',
    provider: 'Budget Insurance',
    coverage: 300000,
    premium: 8000,
    monthlyPremium: 667,
    deductible: 10000,
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 150000, deductible: 5000, included: true },
      { name: 'Fire', nameTr: 'Yangın', limit: 150000, deductible: 5000, included: true },
    ],
  })
}

function createPremiumPolicy(): Policy {
  return createMockPolicy({
    id: 'premium-policy',
    policyNumber: 'PREM-001',
    provider: 'Premium Insurance',
    coverage: 1000000,
    premium: 25000,
    monthlyPremium: 2083,
    deductible: 2000,
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 400000, deductible: 500, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 400000, deductible: 500, included: true },
      { name: 'Fire', nameTr: 'Yangın', limit: 400000, deductible: 0, included: true },
      { name: 'Natural Disasters', nameTr: 'Doğal Afetler', limit: 300000, deductible: 1000, included: true },
      { name: 'Glass', nameTr: 'Cam', limit: 20000, deductible: 0, included: true },
      { name: 'Roadside Assistance', nameTr: 'Yol Yardım', limit: 5000, deductible: 0, included: true },
      { name: 'Legal Protection', nameTr: 'Hukuki Koruma', limit: 50000, deductible: 0, included: true },
    ],
  })
}

function createBalancedPolicy(): Policy {
  return createMockPolicy({
    id: 'balanced-policy',
    policyNumber: 'BAL-001',
    provider: 'Balanced Insurance',
    coverage: 600000,
    premium: 14000,
    monthlyPremium: 1167,
    deductible: 5000,
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 250000, deductible: 2000, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 250000, deductible: 2000, included: true },
      { name: 'Fire', nameTr: 'Yangın', limit: 250000, deductible: 1000, included: true },
      { name: 'Glass', nameTr: 'Cam', limit: 15000, deductible: 0, included: true },
    ],
  })
}

function createFourthPolicy(): Policy {
  return createMockPolicy({
    id: 'fourth-policy',
    policyNumber: 'FOUR-001',
    provider: 'Fourth Insurance',
    coverage: 450000,
    premium: 12000,
    monthlyPremium: 1000,
    deductible: 7500,
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 3000, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 200000, deductible: 3000, included: true },
      { name: 'Natural Disasters', nameTr: 'Doğal Afetler', limit: 200000, deductible: 2500, included: true },
    ],
  })
}

// =============================================================================
// TESTS
// =============================================================================

describe('Multi-Policy Comparator', () => {
  // =========================================================================
  // comparePolicies FUNCTION
  // =========================================================================

  describe('comparePolicies', () => {
    describe('Input Validation', () => {
      it('should throw error for less than 2 policies', () => {
        const policy = createMockPolicy()
        expect(() => comparePolicies([policy])).toThrow('At least 2 policies are required')
      })

      it('should throw error for more than 4 policies', () => {
        const policies = [
          createMockPolicy({ id: 'p1' }),
          createMockPolicy({ id: 'p2' }),
          createMockPolicy({ id: 'p3' }),
          createMockPolicy({ id: 'p4' }),
          createMockPolicy({ id: 'p5' }),
        ]
        expect(() => comparePolicies(policies)).toThrow('Maximum 4 policies')
      })

      it('should accept 2 policies', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        expect(() => comparePolicies(policies)).not.toThrow()
      })

      it('should accept 3 policies', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy(), createBalancedPolicy()]
        expect(() => comparePolicies(policies)).not.toThrow()
      })

      it('should accept 4 policies', () => {
        const policies = [
          createCheapPolicy(),
          createPremiumPolicy(),
          createBalancedPolicy(),
          createFourthPolicy(),
        ]
        expect(() => comparePolicies(policies)).not.toThrow()
      })
    })

    describe('Basic Structure', () => {
      it('should return valid comparison structure', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.comparedAt).toBeDefined()
        expect(comparison.policies).toHaveLength(2)
        expect(comparison.winners).toBeDefined()
        expect(comparison.metrics).toBeDefined()
        expect(comparison.coverageMatrix).toBeDefined()
        expect(comparison.rankings).toBeDefined()
        expect(comparison.analysis).toBeDefined()
      })

      it('should include evaluations for each policy', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        comparison.policies.forEach(p => {
          expect(p.policy).toBeDefined()
          expect(p.evaluation).toBeDefined()
          expect(p.evaluation.overallScore).toBeGreaterThanOrEqual(0)
        })
      })

      it('should apply custom labels', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const labels = ['Option A', 'Option B']
        const comparison = comparePolicies(policies, labels)

        expect(comparison.policies[0].label).toBe('Option A')
        expect(comparison.policies[1].label).toBe('Option B')
      })

      it('should use default labels when not provided', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.policies[0].label).toBe('Policy 1')
        expect(comparison.policies[1].label).toBe('Policy 2')
      })
    })

    describe('Winners Determination', () => {
      it('should identify overall best policy', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy(), createBalancedPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.winners.overallBest).toBeDefined()
        expect(['cheap-policy', 'premium-policy', 'balanced-policy']).toContain(comparison.winners.overallBest)
      })

      it('should identify cheapest policy', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.winners.bestPremium).toBe('cheap-policy')
      })

      it('should identify highest coverage policy', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.winners.bestCoverage).toBe('premium-policy')
      })

      it('should identify best value policy', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy(), createBalancedPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.winners.bestValue).toBeDefined()
      })

      it('should identify best compliance policy', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.winners.bestCompliance).toBeDefined()
      })
    })

    describe('Metrics Generation', () => {
      it('should include premium metrics', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const annualPremium = comparison.metrics.find(m => m.name === 'Annual Premium')
        expect(annualPremium).toBeDefined()
        expect(annualPremium?.unit).toBe('TRY')
        expect(annualPremium?.higherIsBetter).toBe(false)
      })

      it('should include coverage metrics', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const coverage = comparison.metrics.find(m => m.name === 'Total Coverage')
        expect(coverage).toBeDefined()
        expect(coverage?.higherIsBetter).toBe(true)
      })

      it('should include deductible metrics', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const deductible = comparison.metrics.find(m => m.name === 'Deductible')
        expect(deductible).toBeDefined()
        expect(deductible?.higherIsBetter).toBe(false)
      })

      it('should include coverage-to-premium ratio', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const ratio = comparison.metrics.find(m => m.name === 'Coverage/Premium Ratio')
        expect(ratio).toBeDefined()
        expect(ratio?.unit).toBe('x')
        expect(ratio?.higherIsBetter).toBe(true)
      })

      it('should include overall score metric', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const score = comparison.metrics.find(m => m.name === 'Overall Score')
        expect(score).toBeDefined()
        expect(score?.unit).toBe('/100')
      })

      it('should mark best and worst values', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const premium = comparison.metrics.find(m => m.name === 'Annual Premium')
        expect(premium?.values.some(v => v.isBest)).toBe(true)
        expect(premium?.values.some(v => v.isWorst)).toBe(true)
      })

      it('should include bilingual metric names', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        comparison.metrics.forEach(metric => {
          expect(metric.name).toBeTruthy()
          expect(metric.nameTR).toBeTruthy()
        })
      })
    })

    describe('Coverage Matrix', () => {
      it('should list all unique coverages across policies', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        // Premium policy has more coverages
        expect(comparison.coverageMatrix.length).toBeGreaterThanOrEqual(2)
      })

      it('should indicate which policies include each coverage', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const collision = comparison.coverageMatrix.find(c =>
          c.coverageName.toLowerCase().includes('collision')
        )
        expect(collision).toBeDefined()
        expect(collision?.policies.every(p => p.included)).toBe(true) // Both have collision
      })

      it('should identify coverage gaps', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        // Cheap policy doesn't have Glass, Natural Disasters, etc.
        const glass = comparison.coverageMatrix.find(c =>
          c.coverageName.toLowerCase().includes('glass')
        )

        if (glass) {
          const cheapPolicyData = glass.policies.find(p => p.policyId === 'cheap-policy')
          expect(cheapPolicyData?.included).toBe(false)
        }
      })

      it('should identify best policy for each coverage', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        comparison.coverageMatrix.forEach(coverage => {
          const includedCount = coverage.policies.filter(p => p.included).length
          if (includedCount > 0) {
            expect(coverage.bestPolicyId).toBeTruthy()
          }
        })
      })

      it('should score coverages based on limit and deductible', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        comparison.coverageMatrix.forEach(coverage => {
          coverage.policies.forEach(p => {
            if (p.included) {
              expect(p.score).toBeGreaterThanOrEqual(0)
              expect(p.score).toBeLessThanOrEqual(100)
            } else {
              expect(p.score).toBe(0)
            }
          })
        })
      })
    })

    describe('Rankings', () => {
      it('should generate rankings for each policy', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy(), createBalancedPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.rankings).toHaveLength(3)
      })

      it('should include multiple ranking dimensions', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        comparison.rankings.forEach(ranking => {
          expect(ranking.policyId).toBeDefined()
          expect(ranking.overallRank).toBeGreaterThanOrEqual(1)
          expect(ranking.premiumRank).toBeGreaterThanOrEqual(1)
          expect(ranking.coverageRank).toBeGreaterThanOrEqual(1)
          expect(ranking.valueRank).toBeGreaterThanOrEqual(1)
        })
      })

      it('should rank cheaper policy better for premium', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const cheapRanking = comparison.rankings.find(r => r.policyId === 'cheap-policy')
        expect(cheapRanking?.premiumRank).toBe(1)
      })

      it('should rank higher coverage policy better for coverage', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        const premiumRanking = comparison.rankings.find(r => r.policyId === 'premium-policy')
        expect(premiumRanking?.coverageRank).toBe(1)
      })
    })

    describe('Analysis', () => {
      it('should generate main recommendation', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        expect(comparison.analysis.recommendation).toBeTruthy()
        expect(comparison.analysis.recommendationTR).toBeTruthy()
      })

      it('should identify key differences', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        // Premium varies significantly
        expect(comparison.analysis.keyDifferences.length).toBeGreaterThan(0)
      })

      it('should identify tradeoffs when different policies win different categories', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        // Cheap wins on premium, Premium wins on coverage
        expect(comparison.analysis.tradeoffs.length).toBeGreaterThan(0)
      })

      it('should include bilingual key differences', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        comparison.analysis.keyDifferences.forEach(diff => {
          expect(diff.aspect).toBeTruthy()
          expect(diff.aspectTR).toBeTruthy()
          expect(diff.description).toBeTruthy()
          expect(diff.descriptionTR).toBeTruthy()
        })
      })

      it('should include significance level for differences', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        comparison.analysis.keyDifferences.forEach(diff => {
          expect(['major', 'moderate', 'minor']).toContain(diff.significance)
        })
      })

      it('should include tradeoff recommendations', () => {
        const policies = [createCheapPolicy(), createPremiumPolicy()]
        const comparison = comparePolicies(policies)

        comparison.analysis.tradeoffs.forEach(tradeoff => {
          expect(tradeoff.option1.policyId).toBeTruthy()
          expect(tradeoff.option1.advantage).toBeTruthy()
          expect(tradeoff.option2.policyId).toBeTruthy()
          expect(tradeoff.option2.advantage).toBeTruthy()
          expect(tradeoff.recommendation).toBeTruthy()
          expect(tradeoff.recommendationTR).toBeTruthy()
        })
      })
    })

    describe('Four Policy Comparison', () => {
      it('should handle 4 policies correctly', () => {
        const policies = [
          createCheapPolicy(),
          createPremiumPolicy(),
          createBalancedPolicy(),
          createFourthPolicy(),
        ]
        const comparison = comparePolicies(policies)

        expect(comparison.policies).toHaveLength(4)
        expect(comparison.rankings).toHaveLength(4)
      })

      it('should rank all 4 policies', () => {
        const policies = [
          createCheapPolicy(),
          createPremiumPolicy(),
          createBalancedPolicy(),
          createFourthPolicy(),
        ]
        const comparison = comparePolicies(policies)

        const overallRanks = comparison.rankings.map(r => r.overallRank).sort()
        expect(overallRanks).toEqual([1, 2, 3, 4])
      })
    })
  })

  // =========================================================================
  // quickCompare FUNCTION
  // =========================================================================

  describe('quickCompare', () => {
    it('should return winner policy ID', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = quickCompare(policies)

      expect(result.winner).toBeDefined()
      expect(['cheap-policy', 'premium-policy']).toContain(result.winner)
    })

    it('should return scores for all policies', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = quickCompare(policies)

      expect(result.scores).toHaveLength(2)
      result.scores.forEach(s => {
        expect(s.policyId).toBeDefined()
        expect(s.score).toBeGreaterThanOrEqual(0)
        expect(s.score).toBeLessThanOrEqual(100)
      })
    })

    it('should return premium range', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = quickCompare(policies)

      expect(result.premiumRange.min).toBe(8000) // Cheap policy
      expect(result.premiumRange.max).toBe(25000) // Premium policy
      expect(result.premiumRange.diff).toBe(17000)
    })

    it('should return coverage range', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = quickCompare(policies)

      expect(result.coverageRange.min).toBe(300000) // Cheap policy
      expect(result.coverageRange.max).toBe(1000000) // Premium policy
      expect(result.coverageRange.diff).toBe(700000)
    })

    it('should work with 3 policies', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy(), createBalancedPolicy()]
      const result = quickCompare(policies)

      expect(result.scores).toHaveLength(3)
    })
  })

  // =========================================================================
  // compareCoverage FUNCTION
  // =========================================================================

  describe('compareCoverage', () => {
    it('should find coverage by English name', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = compareCoverage(policies, 'Collision')

      expect(result.available.length).toBeGreaterThan(0)
    })

    it('should find coverage by Turkish name', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = compareCoverage(policies, 'Çarpışma')

      expect(result.available.length).toBeGreaterThan(0)
    })

    it('should find coverage by partial name match', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = compareCoverage(policies, 'coll')

      expect(result.available.length).toBeGreaterThan(0)
    })

    it('should list policies that have the coverage', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = compareCoverage(policies, 'Collision')

      result.available.forEach(a => {
        expect(a.policyId).toBeDefined()
        expect(a.limit).toBeGreaterThan(0)
        expect(typeof a.deductible).toBe('number')
      })
    })

    it('should list policies that do not have the coverage', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = compareCoverage(policies, 'Glass')

      // Only premium policy has glass
      expect(result.available.some(a => a.policyId === 'premium-policy')).toBe(true)
      expect(result.notAvailable).toContain('cheap-policy')
    })

    it('should identify best policy for specific coverage', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = compareCoverage(policies, 'Collision')

      expect(result.best).toBeDefined()
      // Premium policy has higher limit and lower deductible
      expect(result.best).toBe('premium-policy')
    })

    it('should return null best when coverage not found', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = compareCoverage(policies, 'Nonexistent Coverage')

      expect(result.best).toBeNull()
      expect(result.available).toHaveLength(0)
    })

    it('should return all policies as not available for missing coverage', () => {
      const policies = [createCheapPolicy(), createPremiumPolicy()]
      const result = compareCoverage(policies, 'Nonexistent')

      expect(result.notAvailable).toHaveLength(2)
    })
  })

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle identical policies', () => {
      const policy1 = createMockPolicy({ id: 'policy-1' })
      const policy2 = createMockPolicy({ id: 'policy-2' })
      const comparison = comparePolicies([policy1, policy2])

      // Both should have same score
      expect(comparison.policies[0].evaluation.overallScore)
        .toBe(comparison.policies[1].evaluation.overallScore)
    })

    it('should handle policies with no coverages', () => {
      const policy1 = createMockPolicy({ id: 'p1', coverages: [] })
      const policy2 = createMockPolicy({ id: 'p2', coverages: [] })

      expect(() => comparePolicies([policy1, policy2])).not.toThrow()
    })

    it('should handle policies with same premium but different coverage', () => {
      const policy1 = createMockPolicy({ id: 'p1', premium: 10000, coverage: 500000 })
      const policy2 = createMockPolicy({ id: 'p2', premium: 10000, coverage: 300000 })
      const comparison = comparePolicies([policy1, policy2])

      expect(comparison.winners.bestCoverage).toBe('p1')
    })

    it('should handle very different policy types gracefully', () => {
      const kaskoPolicy = createMockPolicy({ id: 'kasko', type: 'kasko' })
      const healthPolicy = createMockPolicy({
        id: 'health',
        type: 'health',
        typeTr: 'Sağlık',
        coverages: [
          { name: 'Hospitalization', nameTr: 'Yatarak Tedavi', limit: 500000, deductible: 0, included: true },
        ],
      })

      // Should not throw even though comparing different types
      expect(() => comparePolicies([kaskoPolicy, healthPolicy])).not.toThrow()
    })
  })
})
