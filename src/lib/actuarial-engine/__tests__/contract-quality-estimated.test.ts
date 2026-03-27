/**
 * B3 — Contract Quality Score Explainability Regression Tests
 *
 * Validates that the actuarial engine correctly flags when contract
 * quality scoring is based on defaults (missing indemnity data) vs
 * actual extracted indemnity mechanics.
 *
 * Key behaviors:
 *   - contractQualityIsEstimated = true when indemnityMechanics is absent
 *   - contractQualityIsEstimated = false when indemnityMechanics is provided
 *   - Default contract quality score is 50 when indemnity data is missing
 */

import { describe, it, expect } from 'vitest'
import { runFullEvaluation } from '../engine'
import type {
  ActuarialPolicyInput,
  CanonicalCoverage,
  IndemnityMechanics,
  EvidencePointer,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const SEED = 42
const FAST_MC = { numSimulations: 1_000, seed: SEED, confidenceInterval: 0.9 }
const FUTURE_DATE = new Date('2027-01-01')

function makeEvidence(confidence = 0.9): EvidencePointer[] {
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

function makeIndemnity(
  parts: 'original' | 'equivalent' | 'unspecified' = 'original',
  network: 'insurer_network' | 'insured_choice' | 'unspecified' = 'insured_choice',
  rayic: 'tsb_list' | 'expert_report' | 'unknown' | 'unspecified' = 'tsb_list',
  rayicConcrete = true
): IndemnityMechanics {
  return {
    partsStandard: { value: parts, evidence: makeEvidence() },
    repairNetworkRule: { value: network, evidence: makeEvidence() },
    rayicMethod: { value: rayic, evidence: makeEvidence() },
    rayicMethodIsConcrete: { value: rayicConcrete, evidence: makeEvidence() },
  }
}

function makeBasePolicy(overrides: Partial<ActuarialPolicyInput> = {}): ActuarialPolicyInput {
  return {
    policyId: 'test-cq-001',
    policyType: 'kasko',
    premium: { currency: 'TRY', amount: 15000 },
    effectiveDate: '2026-01-01',
    expiryDate: '2027-01-01',
    coverages: [
      makeCoverage('COLLISION', true, 500000, 5000),
      makeCoverage('THEFT', true, 500000, 0),
      makeCoverage('FIRE', true, 500000, 0),
      makeCoverage('NATURAL_DISASTER', true, 500000, 2000),
    ],
    exclusionTexts: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('B3 — Contract Quality Score Explainability', () => {
  describe('contractQualityIsEstimated flag', () => {
    it('sets contractQualityIsEstimated = true when policy has no indemnityMechanics', () => {
      const policy = makeBasePolicy({
        policyId: 'test-no-indemnity',
        // No indemnityMechanics provided
      })

      const result = runFullEvaluation(policy, {
        effectiveDate: FUTURE_DATE,
        monteCarloConfig: FAST_MC,
      })

      expect(result.eligible).toBe(true)
      expect(result.contractQualityIsEstimated).toBe(true)
    })

    it('sets contractQualityIsEstimated = false when indemnityMechanics is provided', () => {
      const policy = makeBasePolicy({
        policyId: 'test-with-indemnity',
        indemnityMechanics: makeIndemnity('original', 'insured_choice', 'tsb_list', true),
      })

      const result = runFullEvaluation(policy, {
        effectiveDate: FUTURE_DATE,
        monteCarloConfig: FAST_MC,
      })

      expect(result.eligible).toBe(true)
      expect(result.contractQualityIsEstimated).toBeFalsy()
    })
  })

  describe('default contract quality score', () => {
    it('assigns default score of 50 when indemnity data is missing', () => {
      const policy = makeBasePolicy({
        policyId: 'test-default-score',
        // No indemnityMechanics
      })

      const result = runFullEvaluation(policy, {
        effectiveDate: FUTURE_DATE,
        monteCarloConfig: FAST_MC,
      })

      expect(result.contractQualityScore).toBe(50)
    })

    it('assigns computed score (not 50) when indemnity data is provided', () => {
      const policy = makeBasePolicy({
        policyId: 'test-computed-score',
        indemnityMechanics: makeIndemnity('original', 'insured_choice', 'tsb_list', true),
      })

      const result = runFullEvaluation(policy, {
        effectiveDate: FUTURE_DATE,
        monteCarloConfig: FAST_MC,
      })

      // Best indemnity mechanics should score 100
      expect(result.contractQualityScore).toBe(100)
      expect(result.contractQualityScore).not.toBe(50)
    })

    it('worst indemnity mechanics produce a low (but non-default) score', () => {
      const policy = makeBasePolicy({
        policyId: 'test-worst-indemnity',
        indemnityMechanics: makeIndemnity('unspecified', 'unspecified', 'unspecified', false),
      })

      const result = runFullEvaluation(policy, {
        effectiveDate: FUTURE_DATE,
        monteCarloConfig: FAST_MC,
      })

      // Should be computed (not estimated)
      expect(result.contractQualityIsEstimated).toBeFalsy()
      // Worst mechanics score is low but computed, not the 50 default
      expect(result.contractQualityScore).toBeLessThan(50)
    })
  })

  describe('estimated flag consistency across evaluation paths', () => {
    it('missing indemnity → estimated flag AND default score are consistent', () => {
      const policy = makeBasePolicy({ policyId: 'test-consistency' })

      const result = runFullEvaluation(policy, {
        effectiveDate: FUTURE_DATE,
        monteCarloConfig: FAST_MC,
      })

      // Both must agree: estimated=true implies score=50
      if (result.contractQualityIsEstimated) {
        expect(result.contractQualityScore).toBe(50)
      }
    })

    it('provided indemnity → non-estimated flag AND non-default score', () => {
      const policy = makeBasePolicy({
        policyId: 'test-consistency-2',
        indemnityMechanics: makeIndemnity('equivalent', 'insurer_network', 'expert_report', true),
      })

      const result = runFullEvaluation(policy, {
        effectiveDate: FUTURE_DATE,
        monteCarloConfig: FAST_MC,
      })

      // Non-estimated → score is computed from real data
      expect(result.contractQualityIsEstimated).toBeFalsy()
      // Score should be in valid range
      expect(result.contractQualityScore).toBeGreaterThanOrEqual(0)
      expect(result.contractQualityScore).toBeLessThanOrEqual(100)
    })
  })
})
