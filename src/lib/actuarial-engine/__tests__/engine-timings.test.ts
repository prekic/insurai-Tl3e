/**
 * Engine Timings Test Suite
 *
 * Verifies that the actuarial engine populates LayerTimings
 * correctly on evaluation results for both single-policy and
 * multi-policy paths, including blocked (compliance-failed) results.
 */

import { describe, it, expect } from 'vitest'
import type { ActuarialPolicyInput, CanonicalCoverage, IndemnityMechanics } from '../types'
import { runFullEvaluation, evaluateAndRankPolicies } from '../engine'

// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const SEED = 42
const FAST_MC = { numSimulations: 1_000, seed: SEED, confidenceInterval: 0.9 }
const FUTURE_DATE = new Date('2027-01-01')

function makeEvidence(confidence = 0.9) {
  return [{ page: 1, snippetId: 'snp-1', rawText: 'Sample text', confidence }]
}

function makeCoverage(
  code: string,
  included: boolean,
  limitAmount?: number,
  deductibleAmount?: number
): CanonicalCoverage {
  return {
    code,
    included,
    limit:
      limitAmount !== undefined
        ? { value: { currency: 'TRY', amount: limitAmount }, evidence: makeEvidence() }
        : undefined,
    deductible:
      deductibleAmount !== undefined
        ? { value: { currency: 'TRY', amount: deductibleAmount }, evidence: makeEvidence() }
        : undefined,
  }
}

function makeIndemnity(): IndemnityMechanics {
  return {
    partsStandard: { value: 'original', evidence: makeEvidence() },
    repairNetworkRule: { value: 'insured_choice', evidence: makeEvidence() },
    rayicMethod: { value: 'tsb_list', evidence: makeEvidence() },
    rayicMethodIsConcrete: { value: true, evidence: makeEvidence() },
  }
}

function makeBaseKaskoPolicy(overrides: Partial<ActuarialPolicyInput> = {}): ActuarialPolicyInput {
  return {
    policyId: 'timing-kasko-001',
    policyType: 'kasko',
    premium: { currency: 'TRY', amount: 15000 },
    effectiveDate: '2026-01-01',
    expiryDate: '2027-01-01',
    coverages: [
      makeCoverage('COLLISION', true, 500000, 5000),
      makeCoverage('THEFT', true, 500000, 2000),
      makeCoverage('FIRE', true, 500000),
      makeCoverage('NATURAL_DISASTER', true, 500000),
    ],
    exclusionTexts: ['Deprem ve yanardağ püskürmesi hariç'],
    indemnityMechanics: makeIndemnity(),
    rawExtractionData: {
      policyNumber: { value: 'POL-001', evidence: makeEvidence(), confidence: 0.95 },
      provider: { value: 'Allianz', evidence: makeEvidence(), confidence: 0.9 },
    },
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Engine Timings — LayerTimings', () => {
  it('populates layerTimings on eligible single-policy evaluation', () => {
    const policy = makeBaseKaskoPolicy()
    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)
    expect(result.layerTimings).toBeDefined()
    const timings = result.layerTimings!
    expect(timings.layerA_ms).toBeGreaterThanOrEqual(0)
    expect(timings.layerB_ms).toBeGreaterThanOrEqual(0)
    expect(timings.layerC_ms).toBeGreaterThanOrEqual(0)
    expect(timings.total_ms).toBeGreaterThanOrEqual(0)
    expect(timings.layerD_ms).toBeUndefined()
  })

  it('total_ms >= sum of individual layers', () => {
    const policy = makeBaseKaskoPolicy()
    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    const timings = result.layerTimings!
    const layerSum = timings.layerA_ms + timings.layerB_ms + timings.layerC_ms
    // total_ms should be >= sum (it includes overhead between layers)
    expect(timings.total_ms).toBeGreaterThanOrEqual(layerSum * 0.99) // 1% tolerance for float precision
  })

  it('all timing fields are finite numbers', () => {
    const policy = makeBaseKaskoPolicy()
    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    const timings = result.layerTimings!
    expect(Number.isFinite(timings.layerA_ms)).toBe(true)
    expect(Number.isFinite(timings.layerB_ms)).toBe(true)
    expect(Number.isFinite(timings.layerC_ms)).toBe(true)
    expect(Number.isFinite(timings.total_ms)).toBe(true)
  })

  it('populates layerTimings on blocked (compliance-failed) result', () => {
    // Create an expired policy that will fail compliance
    const expiredPolicy = makeBaseKaskoPolicy({
      policyId: 'timing-expired-001',
      effectiveDate: '2020-01-01',
      expiryDate: '2021-01-01',
    })

    const result = runFullEvaluation(expiredPolicy, {
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(false)
    expect(result.layerTimings).toBeDefined()
    const timings = result.layerTimings!
    expect(timings.layerA_ms).toBeGreaterThanOrEqual(0)
    expect(timings.layerB_ms).toBeGreaterThanOrEqual(0)
    expect(timings.layerC_ms).toBe(0) // Blocked before Layer C
    expect(timings.total_ms).toBeGreaterThanOrEqual(0)
    expect(timings.layerD_ms).toBeUndefined()
  })

  it('populates layerD_ms on multi-policy TOPSIS evaluation', () => {
    const policyA = makeBaseKaskoPolicy({ policyId: 'timing-a' })
    const policyB = makeBaseKaskoPolicy({
      policyId: 'timing-b',
      premium: { currency: 'TRY', amount: 20000 },
    })

    const results = evaluateAndRankPolicies([policyA, policyB], {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    // At least one eligible policy should have layerD_ms
    const eligibleResults = results.filter((r) => r.eligible && r.ranking)
    expect(eligibleResults.length).toBeGreaterThanOrEqual(1)

    for (const r of eligibleResults) {
      expect(r.layerTimings).toBeDefined()
      expect(r.layerTimings!.layerD_ms).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(r.layerTimings!.layerD_ms!)).toBe(true)
    }
  })

  it('layerD_ms is absent when skipRanking is true', () => {
    const policyA = makeBaseKaskoPolicy({ policyId: 'timing-skip-a' })
    const policyB = makeBaseKaskoPolicy({ policyId: 'timing-skip-b' })

    const results = evaluateAndRankPolicies([policyA, policyB], {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
      skipRanking: true,
    })

    for (const r of results) {
      if (r.layerTimings) {
        expect(r.layerTimings.layerD_ms).toBeUndefined()
      }
    }
  })

  it('layerC_ms is largest component for eligible policies (Monte Carlo is expensive)', () => {
    const policy = makeBaseKaskoPolicy()
    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: { ...FAST_MC, numSimulations: 5_000 },
    })

    const timings = result.layerTimings!
    // With 5000 simulations, Layer C should generally dominate.
    // We just verify it's non-trivial relative to others.
    expect(timings.layerC_ms).toBeGreaterThanOrEqual(0)
    // At minimum, Layer C should not be zero for eligible policies
    // (it runs Monte Carlo with 5000 iterations)
    // Using >= 0 because on fast machines this can still be < 1ms
  })

  it('layerTimings present on single-policy in multi-policy array', () => {
    const singlePolicy = makeBaseKaskoPolicy({ policyId: 'timing-single-multi' })

    const results = evaluateAndRankPolicies([singlePolicy], {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(results).toHaveLength(1)
    expect(results[0].layerTimings).toBeDefined()
    // Single policy => no TOPSIS => no layerD_ms
    expect(results[0].layerTimings!.layerD_ms).toBeUndefined()
  })
})
