/**
 * Adapter → Engine Integration Tests
 *
 * End-to-end tests that push real sample policy data through the full pipeline:
 *   AnalyzedPolicy → mapAnalyzedToActuarialInput() → runFullEvaluation() / evaluateAndRankPolicies()
 *
 * These tests validate that the adapter correctly feeds the engine and that
 * results are structurally valid with sensible value ranges.
 */

import { describe, it, expect } from 'vitest'
import { mapAnalyzedToActuarialInput } from '../adapter'
import { runFullEvaluation, evaluateAndRankPolicies } from '../engine'
import { samplePolicies } from '@/data/sample-policies'
import type { AnalyzedPolicy } from '@/types/policy'
import type { PolicyEvaluationResult, ActuarialPolicyInput } from '../types'

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const kaskoPolicy = samplePolicies.find((p) => p.type === 'kasko')!
const trafficPolicy = samplePolicies.find((p) => p.type === 'traffic')!
const homePolicy = samplePolicies.find((p) => p.type === 'home')!

/** Create a DASK-like policy for testing since sample data doesn't include one. */
function makeDaskPolicy(): AnalyzedPolicy {
  // @ts-expect-error - mismatch due to schema update
  return {
    id: 'dask-001',
    policyNumber: 'DASK-2024-001',
    provider: 'DASK',
    logo: '🟠',
    type: 'dask',
    typeTr: 'Zorunlu Deprem Sigortası',
    coverage: 640000,
    premium: 800,
    monthlyPremium: 67,
    deductible: 12800,
    startDate: '2024-01-01',
    expiryDate: '2025-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [
      { name: 'Earthquake', nameTr: 'Deprem', limit: 640000, deductible: 12800, included: true },
    ],
    exclusions: ['War and terrorism'],
    aiConfidence: 0.96,
    aiInsights: ['Standard DASK coverage'],
  }
}

function makeHealthPolicy(): AnalyzedPolicy {
  const now = new Date()
  const nextYear = new Date()
  nextYear.setFullYear(now.getFullYear() + 1)

  return {
    id: 'health-001',
    policyNumber: 'HEALTH-2024-001',
    provider: 'Allianz',
    logo: '🔵',
    // @ts-expect-error - mismatch due to schema update
    type: 'sağlık',
    typeTr: 'Tamamlayıcı Sağlık',
    coverage: 0,
    premium: 12000,
    monthlyPremium: 1000,
    startDate: now.toISOString().split('T')[0],
    expiryDate: nextYear.toISOString().split('T')[0],
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [
      // @ts-expect-error - mismatch due to schema update
      {
        name: 'Inpatient Stay',
        nameTr: 'Yatarak Tedavi',
        limit: 0,
        isUnlimited: true,
        included: true,
      },
      // @ts-expect-error - mismatch due to schema update
      { name: 'Outpatient Treatment', nameTr: 'Ayakta Tedavi', limit: 5000, included: true },
    ],
    exclusions: ['Existing conditions'],
    aiConfidence: 0.98,
    aiInsights: ['Comprehensive health plan'],
  }
}

function makeLifePolicy(): AnalyzedPolicy {
  const now = new Date()
  const nextYear = new Date()
  nextYear.setFullYear(now.getFullYear() + 1)

  return {
    id: 'life-001',
    policyNumber: 'LIFE-2024-001',
    provider: 'Anadolu Hayat',
    logo: '🟢',
    // @ts-expect-error - mismatch due to schema update
    type: 'hayat',
    typeTr: 'Hayat Sigortası',
    coverage: 1000000,
    premium: 2400,
    monthlyPremium: 200,
    startDate: now.toISOString().split('T')[0],
    expiryDate: nextYear.toISOString().split('T')[0],
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [
      // @ts-expect-error - mismatch due to schema update
      { name: 'Death Benefit', nameTr: 'Vefat Teminatı', limit: 1000000, included: true },
    ],
    exclusions: ['Extreme sports'],
    aiConfidence: 0.95,
  }
}

function makeBusinessPolicy(): AnalyzedPolicy {
  const now = new Date()
  const nextYear = new Date()
  nextYear.setFullYear(now.getFullYear() + 1)

  return {
    id: 'business-001',
    policyNumber: 'BIZ-2024-001',
    provider: 'Aksigorta',
    logo: '🏢',
    type: 'business',
    typeTr: 'İşyeri Sigortası',
    coverage: 5000000,
    premium: 15000,
    monthlyPremium: 1250,
    startDate: now.toISOString().split('T')[0],
    expiryDate: nextYear.toISOString().split('T')[0],
    status: 'active',
    insuredPerson: 'Business Corp',
    coverages: [
      // @ts-expect-error - mismatch due to schema update
      { name: 'Fire', nameTr: 'Yangın', limit: 5000000, included: true },
      // @ts-expect-error - mismatch due to schema update
      { name: 'Liability', nameTr: 'Sorumluluk', limit: 1000000, included: true },
    ],
    exclusions: ['Industrial strike'],
    aiConfidence: 0.97,
  }
}

// ---------------------------------------------------------------------------
// Single-Policy Full Pipeline (runFullEvaluation)
// ---------------------------------------------------------------------------

describe('Adapter → Engine Integration', () => {
  describe('single-policy pipeline via runFullEvaluation', () => {
    it('processes a kasko policy through the full pipeline', () => {
      const input = mapAnalyzedToActuarialInput(kaskoPolicy)
      const result = runFullEvaluation(input)

      // Structural assertions
      expect(result).toBeDefined()
      expect(typeof result.eligible).toBe('boolean')
      expect(result.compliance).toBeDefined()
      expect(result.semanticExclusions).toBeDefined()
      expect(result.evidenceCoverage).toBeDefined()
      expect(result.expectedOutOfPocket).toBeDefined()
      expect(result.evaluatedAt).toBeTruthy()

      // Timing data must be present
      expect(result.layerTimings).toBeDefined()
      expect(result.layerTimings!.total_ms).toBeGreaterThan(0)
      expect(result.layerTimings!.layerA_ms).toBeGreaterThanOrEqual(0)
      expect(result.layerTimings!.layerB_ms).toBeGreaterThanOrEqual(0)
      expect(result.layerTimings!.layerC_ms).toBeGreaterThanOrEqual(0)

      // Evidence coverage must have valid structure
      expect(result.evidenceCoverage.totalFields).toBeGreaterThanOrEqual(0)
      expect(result.evidenceCoverage.coveragePercent).toBeGreaterThanOrEqual(0)
      expect(result.evidenceCoverage.coveragePercent).toBeLessThanOrEqual(100)
    })

    it('processes a traffic policy through the full pipeline', () => {
      const input = mapAnalyzedToActuarialInput(trafficPolicy)
      const result = runFullEvaluation(input)

      expect(result).toBeDefined()
      expect(typeof result.eligible).toBe('boolean')
      expect(result.compliance).toBeDefined()
      expect(result.expectedOutOfPocket).toBeDefined()
      expect(result.layerTimings).toBeDefined()
      expect(result.layerTimings!.total_ms).toBeGreaterThan(0)
    })

    it('processes a DASK policy through the full pipeline', () => {
      const daskPolicy = makeDaskPolicy()
      const input = mapAnalyzedToActuarialInput(daskPolicy)
      const result = runFullEvaluation(input)

      expect(result).toBeDefined()
      expect(typeof result.eligible).toBe('boolean')
      expect(result.compliance).toBeDefined()
      expect(result.expectedOutOfPocket).toBeDefined()
      expect(result.layerTimings).toBeDefined()
      expect(result.layerTimings!.total_ms).toBeGreaterThan(0)
    })

    it('processes a Health policy through the full pipeline', () => {
      const healthPolicy = makeHealthPolicy()
      const input = mapAnalyzedToActuarialInput(healthPolicy)
      const result = runFullEvaluation(input)

      expect(result.eligible).toBe(true)
      expect(input.policyType).toBe('health')
      expect(input.coverages.some((c) => c.code === 'INPATIENT')).toBe(true)
      expect(result.expectedOutOfPocket.scenarioBreakdown).toContainEqual(
        expect.objectContaining({ scenarioCode: 'HOSPITALIZATION_STAY' })
      )
    })

    it('processes a Life policy through the full pipeline', () => {
      const lifePolicy = makeLifePolicy()
      const input = mapAnalyzedToActuarialInput(lifePolicy)
      const result = runFullEvaluation(input)

      expect(result.eligible).toBe(true)
      expect(input.policyType).toBe('life')
      expect(input.coverages.some((c) => c.code === 'DEATH_BENEFIT')).toBe(true)
    })

    it('processes a Business policy through the full pipeline', () => {
      const businessPolicy = makeBusinessPolicy()
      const input = mapAnalyzedToActuarialInput(businessPolicy)
      const result = runFullEvaluation(input)

      expect(result.eligible).toBe(true)
      expect(input.policyType).toBe('business')
      expect(input.coverages.some((c) => c.code === 'FIRE')).toBe(true)
    })

    it('produces eligible result with valid EOOP for kasko', () => {
      const input = mapAnalyzedToActuarialInput(kaskoPolicy)
      const result = runFullEvaluation(input)

      if (result.eligible) {
        // EOOP should be a positive number
        expect(result.expectedOutOfPocket.expectedCost.amount).toBeGreaterThanOrEqual(0)
        expect(result.expectedOutOfPocket.premium.amount).toBe(kaskoPolicy.premium)
        expect(result.expectedOutOfPocket.percentiles.p50).toBeGreaterThanOrEqual(0)
        expect(result.expectedOutOfPocket.percentiles.p95).toBeGreaterThanOrEqual(
          result.expectedOutOfPocket.percentiles.p5
        )

        // Contract quality factor should be between 0 and 1
        expect(result.expectedOutOfPocket.contractQualityFactor).toBeGreaterThan(0)
        expect(result.expectedOutOfPocket.contractQualityFactor).toBeLessThanOrEqual(1)
      }
    })

    it('produces valid scenario scores for eligible kasko', () => {
      const input = mapAnalyzedToActuarialInput(kaskoPolicy)
      const result = runFullEvaluation(input)

      if (result.eligible) {
        // Scenario scores should be a non-empty record when eligible
        const scenarioKeys = Object.keys(result.scenarioScores)
        expect(scenarioKeys.length).toBeGreaterThan(0)

        // All scores should be finite numbers
        for (const [key, score] of Object.entries(result.scenarioScores)) {
          expect(typeof score).toBe('number')
          expect(isFinite(score)).toBe(true)
          expect(key).toBeTruthy()
        }
      } else {
        // Blocked policies may have empty scenario scores
        expect(result.scenarioScores).toBeDefined()
      }
    })

    it('produces contract quality score in valid range', () => {
      const input = mapAnalyzedToActuarialInput(kaskoPolicy)
      const result = runFullEvaluation(input)

      expect(result.contractQualityScore).toBeGreaterThanOrEqual(0)
      expect(result.contractQualityScore).toBeLessThanOrEqual(100)
    })

    it('does not crash for unsupported policy type (home)', () => {
      const input = mapAnalyzedToActuarialInput(homePolicy)
      // Should not throw — engine handles gracefully
      const result = runFullEvaluation(input)

      expect(result).toBeDefined()
      expect(typeof result.eligible).toBe('boolean')
      expect(result.layerTimings).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Multi-Policy Pipeline (evaluateAndRankPolicies)
  // ---------------------------------------------------------------------------

  describe('multi-policy pipeline via evaluateAndRankPolicies', () => {
    it('ranks two kasko-type policies with valid TOPSIS scores', () => {
      // Create two variants of the kasko policy
      const policy1 = { ...kaskoPolicy, id: 'kasko-compare-1' }
      const policy2 = {
        ...kaskoPolicy,
        id: 'kasko-compare-2',
        premium: 6200,
        coverage: 600000,
        deductible: 1000,
      }

      const inputs = [policy1, policy2].map(mapAnalyzedToActuarialInput)
      const results = evaluateAndRankPolicies(inputs)

      expect(results).toHaveLength(2)

      // Count how many are eligible — TOPSIS only runs when 2+ are eligible
      const eligibleResults = results.filter((r: PolicyEvaluationResult) => r.eligible)

      if (eligibleResults.length >= 2) {
        // Both should have ranking data when eligible
        eligibleResults.forEach((r: PolicyEvaluationResult) => {
          expect(r.ranking).toBeDefined()
          expect(r.ranking!.rank).toBeGreaterThanOrEqual(1)
          expect(r.ranking!.rank).toBeLessThanOrEqual(2)
          expect(r.ranking!.topsisCloseness).toBeGreaterThanOrEqual(0)
          expect(r.ranking!.topsisCloseness).toBeLessThanOrEqual(1)
          expect(r.ranking!.grade).toMatch(/^[ABCDF]$/)
        })

        // Ranks should be unique
        const ranks = eligibleResults.map((r: PolicyEvaluationResult) => r.ranking!.rank)
        expect(new Set(ranks).size).toBe(eligibleResults.length)
      } else {
        // With fewer than 2 eligible, TOPSIS is skipped — ranking is undefined
        results.forEach((r: PolicyEvaluationResult) => {
          expect(r).toBeDefined()
          expect(typeof r.eligible).toBe('boolean')
        })
      }
    })

    it('handles mixed supported types (kasko + traffic)', () => {
      const inputs: ActuarialPolicyInput[] = [kaskoPolicy, trafficPolicy].map(
        mapAnalyzedToActuarialInput
      )
      const results = evaluateAndRankPolicies(inputs)

      expect(results).toHaveLength(2)
      results.forEach((r: PolicyEvaluationResult) => {
        expect(r).toBeDefined()
        expect(typeof r.eligible).toBe('boolean')
        expect(r.layerTimings).toBeDefined()
      })
    })

    it('produces Layer D timings for multi-policy evaluations', () => {
      const policy1 = { ...kaskoPolicy, id: 'timing-1' }
      const policy2 = { ...kaskoPolicy, id: 'timing-2', premium: 5500 }

      const inputs = [policy1, policy2].map(mapAnalyzedToActuarialInput)
      const results = evaluateAndRankPolicies(inputs)

      // Layer D timing is only set for eligible policies when TOPSIS runs
      const eligibleWithTimings = results.filter(
        (r: PolicyEvaluationResult) => r.eligible && r.layerTimings?.layerD_ms !== undefined
      )

      // At least check that results were produced
      expect(results).toHaveLength(2)
      results.forEach((r: PolicyEvaluationResult) => {
        expect(r.layerTimings).toBeDefined()
        expect(r.layerTimings!.total_ms).toBeGreaterThan(0)
      })

      // If 2+ were eligible, Layer D should be present
      const eligibleCount = results.filter((r: PolicyEvaluationResult) => r.eligible).length
      if (eligibleCount >= 2) {
        expect(eligibleWithTimings.length).toBeGreaterThan(0)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles policy with zero coverages without crashing', () => {
      const emptyPolicy: AnalyzedPolicy = {
        ...kaskoPolicy,
        id: 'edge-no-coverages',
        coverages: [],
      }

      const input = mapAnalyzedToActuarialInput(emptyPolicy)
      expect(input.coverages).toEqual([])

      // Should not throw
      const result = runFullEvaluation(input)
      expect(result).toBeDefined()
      expect(typeof result.eligible).toBe('boolean')
    })

    it('handles policy with very high premium', () => {
      const expensivePolicy: AnalyzedPolicy = {
        ...kaskoPolicy,
        id: 'edge-expensive',
        premium: 999999,
        monthlyPremium: 83333,
      }

      const input = mapAnalyzedToActuarialInput(expensivePolicy)
      const result = runFullEvaluation(input)

      expect(result).toBeDefined()
      expect(result.expectedOutOfPocket.premium.amount).toBe(999999)
    })

    it('handles policy with zero premium', () => {
      const freePolicy: AnalyzedPolicy = {
        ...kaskoPolicy,
        id: 'edge-free',
        premium: 0,
        monthlyPremium: 0,
      }

      const input = mapAnalyzedToActuarialInput(freePolicy)
      const result = runFullEvaluation(input)

      expect(result).toBeDefined()
      expect(result.expectedOutOfPocket.premium.amount).toBe(0)
    })

    it('handles policy with no exclusions', () => {
      const noExclusions: AnalyzedPolicy = {
        ...kaskoPolicy,
        id: 'edge-no-exclusions',
        exclusions: [],
      }

      const input = mapAnalyzedToActuarialInput(noExclusions)
      expect(input.exclusionTexts).toEqual([])

      const result = runFullEvaluation(input)
      expect(result).toBeDefined()
    })

    it('produces stable results across multiple runs (determinism check)', () => {
      const input = mapAnalyzedToActuarialInput(kaskoPolicy)

      const result1 = runFullEvaluation(input)
      const result2 = runFullEvaluation(input)

      // Contract quality score should be deterministic
      expect(result1.contractQualityScore).toBe(result2.contractQualityScore)

      // Eligibility should be deterministic
      expect(result1.eligible).toBe(result2.eligible)
    })
  })

  // ---------------------------------------------------------------------------
  // Adapter Output Validation
  // ---------------------------------------------------------------------------

  describe('adapter output structure', () => {
    it('maps all sample policies without error', () => {
      for (const policy of samplePolicies) {
        expect(() => mapAnalyzedToActuarialInput(policy)).not.toThrow()
      }
    })

    it('preserves policy IDs through the adapter', () => {
      for (const policy of samplePolicies) {
        const input = mapAnalyzedToActuarialInput(policy)
        expect(input.policyId).toBe(policy.id)
      }
    })

    it('maps all supported policy types correctly', () => {
      const typeMappings = [
        { raw: 'kasko', expected: 'kasko' },
        { raw: 'trafik', expected: 'traffic' },
        { raw: 'dask', expected: 'dask' },
        { raw: 'zas', expected: 'zas' },
        { raw: 'sağlık', expected: 'health' },
        { raw: 'health', expected: 'health' },
        { raw: 'hayat', expected: 'life' },
        { raw: 'life', expected: 'life' },
        { raw: 'isyeri', expected: 'business' },
        { raw: 'business', expected: 'business' },
      ]
      for (const mapping of typeMappings) {
        const policy: AnalyzedPolicy = {
          ...kaskoPolicy,
          id: `type-${mapping.raw}`,
          // @ts-expect-error - mismatch due to schema update
          type: mapping.raw,
        }
        const input = mapAnalyzedToActuarialInput(policy)
        expect(input.policyType).toBe(mapping.expected)
      }
    })
  })
})
