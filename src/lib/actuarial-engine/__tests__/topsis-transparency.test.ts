/**
 * Tests for TOPSIS weight transparency
 *
 * Validates that:
 * 1. DEFAULT_TOPSIS_CRITERIA has all required fields (labels, weights, direction)
 * 2. Weights sum to 1.0
 * 3. All criteria have bilingual labels
 * 4. rankPolicies() includes normalizedScores and weightedScores in results
 * 5. Contribution breakdown is available per criterion
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_TOPSIS_CRITERIA } from '../layer-d/topsis'
import { rankPolicies } from '../layer-d/topsis'
import type { TOPSISCriterion } from '../types'

describe('TOPSIS Weight Transparency', () => {
  describe('DEFAULT_TOPSIS_CRITERIA structure', () => {
    it('has 6 criteria', () => {
      expect(DEFAULT_TOPSIS_CRITERIA).toHaveLength(6)
    })

    it('weights sum to exactly 1.0', () => {
      const sum = DEFAULT_TOPSIS_CRITERIA.reduce((acc, c) => acc + c.weight, 0)
      expect(sum).toBeCloseTo(1.0, 4)
    })

    it('every criterion has a non-empty label', () => {
      for (const c of DEFAULT_TOPSIS_CRITERIA) {
        expect(c.label.length).toBeGreaterThan(0)
      }
    })

    it('every criterion has a non-empty Turkish label', () => {
      for (const c of DEFAULT_TOPSIS_CRITERIA) {
        expect(c.labelTr.length).toBeGreaterThan(0)
      }
    })

    it('every criterion has a valid direction', () => {
      for (const c of DEFAULT_TOPSIS_CRITERIA) {
        expect(['benefit', 'cost']).toContain(c.direction)
      }
    })

    it('every criterion has a weight between 0 and 1', () => {
      for (const c of DEFAULT_TOPSIS_CRITERIA) {
        expect(c.weight).toBeGreaterThan(0)
        expect(c.weight).toBeLessThanOrEqual(1)
      }
    })

    it('every criterion has a unique code', () => {
      const codes = DEFAULT_TOPSIS_CRITERIA.map((c) => c.code)
      expect(new Set(codes).size).toBe(codes.length)
    })

    it('contains expected criteria codes', () => {
      const codes = DEFAULT_TOPSIS_CRITERIA.map((c) => c.code)
      expect(codes).toContain('eoop')
      expect(codes).toContain('premium')
      expect(codes).toContain('coverage_breadth')
      expect(codes).toContain('compliance_score')
      expect(codes).toContain('contract_quality')
      expect(codes).toContain('deductible_exposure')
    })

    it('EOOP has the highest weight (30%)', () => {
      const eoop = DEFAULT_TOPSIS_CRITERIA.find((c) => c.code === 'eoop')
      expect(eoop?.weight).toBe(0.3)
      // Verify it's the highest
      for (const c of DEFAULT_TOPSIS_CRITERIA) {
        expect(eoop!.weight).toBeGreaterThanOrEqual(c.weight)
      }
    })

    it('cost criteria are correctly marked', () => {
      const costCodes = DEFAULT_TOPSIS_CRITERIA.filter((c) => c.direction === 'cost').map(
        (c) => c.code
      )
      expect(costCodes).toContain('eoop')
      expect(costCodes).toContain('premium')
      expect(costCodes).toContain('deductible_exposure')
    })

    it('benefit criteria are correctly marked', () => {
      const benefitCodes = DEFAULT_TOPSIS_CRITERIA.filter((c) => c.direction === 'benefit').map(
        (c) => c.code
      )
      expect(benefitCodes).toContain('coverage_breadth')
      expect(benefitCodes).toContain('compliance_score')
      expect(benefitCodes).toContain('contract_quality')
    })
  })

  describe('rankPolicies() contribution breakdown', () => {
    const CRITERIA: TOPSISCriterion[] = DEFAULT_TOPSIS_CRITERIA

    function makePolicyInput(id: string, values: Record<string, number>) {
      return { policyId: id, values }
    }

    it('includes normalizedScores for all criteria', () => {
      const results = rankPolicies(
        [
          makePolicyInput('A', {
            eoop: 10000,
            premium: 5000,
            coverage_breadth: 80,
            compliance_score: 90,
            contract_quality: 70,
            deductible_exposure: 30,
          }),
          makePolicyInput('B', {
            eoop: 15000,
            premium: 7000,
            coverage_breadth: 60,
            compliance_score: 80,
            contract_quality: 50,
            deductible_exposure: 50,
          }),
        ],
        CRITERIA
      )

      for (const result of results) {
        for (const criterion of CRITERIA) {
          expect(result.normalizedScores).toHaveProperty(criterion.code)
          expect(typeof result.normalizedScores[criterion.code]).toBe('number')
        }
      }
    })

    it('includes weightedScores for all criteria', () => {
      const results = rankPolicies(
        [
          makePolicyInput('A', {
            eoop: 10000,
            premium: 5000,
            coverage_breadth: 80,
            compliance_score: 90,
            contract_quality: 70,
            deductible_exposure: 30,
          }),
          makePolicyInput('B', {
            eoop: 15000,
            premium: 7000,
            coverage_breadth: 60,
            compliance_score: 80,
            contract_quality: 50,
            deductible_exposure: 50,
          }),
        ],
        CRITERIA
      )

      for (const result of results) {
        for (const criterion of CRITERIA) {
          expect(result.weightedScores).toHaveProperty(criterion.code)
          const ws = result.weightedScores[criterion.code]
          const ns = result.normalizedScores[criterion.code]
          // Weighted score = weight × normalized score
          expect(ws).toBeCloseTo(criterion.weight * ns, 3)
        }
      }
    })

    it('ranks the better policy first', () => {
      const results = rankPolicies(
        [
          makePolicyInput('Good', {
            eoop: 8000,
            premium: 4000,
            coverage_breadth: 90,
            compliance_score: 95,
            contract_quality: 80,
            deductible_exposure: 20,
          }),
          makePolicyInput('Bad', {
            eoop: 20000,
            premium: 10000,
            coverage_breadth: 40,
            compliance_score: 60,
            contract_quality: 30,
            deductible_exposure: 80,
          }),
        ],
        CRITERIA
      )

      expect(results[0].policyId).toBe('Good')
      expect(results[0].rank).toBe(1)
      expect(results[0].closeness).toBeGreaterThan(results[1].closeness)
    })

    it('closeness values are between 0 and 1', () => {
      const results = rankPolicies(
        [
          makePolicyInput('A', {
            eoop: 10000,
            premium: 5000,
            coverage_breadth: 80,
            compliance_score: 90,
            contract_quality: 70,
            deductible_exposure: 30,
          }),
          makePolicyInput('B', {
            eoop: 15000,
            premium: 7000,
            coverage_breadth: 60,
            compliance_score: 80,
            contract_quality: 50,
            deductible_exposure: 50,
          }),
        ],
        CRITERIA
      )

      for (const result of results) {
        expect(result.closeness).toBeGreaterThanOrEqual(0)
        expect(result.closeness).toBeLessThanOrEqual(1)
      }
    })

    it('single policy gets closeness 1.0 and rank 1', () => {
      const results = rankPolicies(
        [
          makePolicyInput('Solo', {
            eoop: 10000,
            premium: 5000,
            coverage_breadth: 80,
            compliance_score: 90,
            contract_quality: 70,
            deductible_exposure: 30,
          }),
        ],
        CRITERIA
      )

      expect(results).toHaveLength(1)
      expect(results[0].closeness).toBe(1.0)
      expect(results[0].rank).toBe(1)
    })
  })
})
