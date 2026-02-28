/**
 * Golden Regression Test Suite — Actuarial Engine
 *
 * 12 deterministic test cases using seeded RNG (seed=42).
 * These tests verify correct behaviour across all 4 layers:
 *   1. Layer A: Semantic exclusions + evidence tracking
 *   2. Layer B: Compliance gates
 *   3. Layer C: Monte Carlo EOOP
 *   4. Layer D: TOPSIS ranking + sensitivity
 *
 * IMPORTANT: All Monte Carlo tests use seed=42 and 1,000 simulations
 * for speed + determinism. Results are stable across runs.
 */

import { describe, it, expect } from 'vitest'
import type { ActuarialPolicyInput, CanonicalCoverage, IndemnityMechanics } from '../types'
import { runFullEvaluation, evaluateAndRankPolicies } from '../engine'
import { calculateEOOP } from '../layer-c/monte-carlo'
import { KASKO_SCENARIOS } from '../layer-c/scenario-library'
import { analyzeExclusions } from '../layer-a/semantic-exclusions'
import { validateEvidence } from '../layer-a/evidence-tracker'
import { rankPolicies, DEFAULT_TOPSIS_CRITERIA } from '../layer-d/topsis'
import { analyzeSensitivity } from '../layer-d/sensitivity'
import type { TOPSISPolicyInput } from '../layer-d/topsis'

// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const SEED = 42
const FAST_MC = { numSimulations: 1_000, seed: SEED, confidenceInterval: 0.9 }

/** Helper: effective date far in the future so policies don't expire */
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

function makeIndemnity(
  parts: 'original' | 'equivalent' | 'unspecified',
  network: 'insurer_network' | 'insured_choice' | 'unspecified',
  rayic: 'tsb_list' | 'expert_report' | 'unknown' | 'unspecified',
  rayicConcrete: boolean
): IndemnityMechanics {
  return {
    partsStandard: { value: parts, evidence: makeEvidence() },
    repairNetworkRule: { value: network, evidence: makeEvidence() },
    rayicMethod: { value: rayic, evidence: makeEvidence() },
    rayicMethodIsConcrete: { value: rayicConcrete, evidence: makeEvidence() },
  }
}

function makeBaseKaskoPolicy(overrides: Partial<ActuarialPolicyInput> = {}): ActuarialPolicyInput {
  return {
    policyId: 'test-kasko-001',
    policyType: 'kasko',
    premium: { currency: 'TRY', amount: 15000 },
    effectiveDate: '2026-01-01',
    expiryDate: '2027-01-01',
    coverages: [
      makeCoverage('COLLISION', true, 500000, 5000),
      makeCoverage('THEFT', true, 500000, 0),
      makeCoverage('FIRE', true, 500000, 0),
      makeCoverage('NATURAL_DISASTER', true, 500000, 2000),
      makeCoverage('GLASS', true, 25000, 0),
    ],
    exclusionTexts: [],
    indemnityMechanics: makeIndemnity('original', 'insured_choice', 'tsb_list', true),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('Actuarial Engine — Golden Regression Tests', () => {
  // ── Test 1: Kasko Basic ──────────────────────────────────────────────────
  it('1. Kasko Basic: core perils only → eligible, NOT penalized for missing flood/EQ', () => {
    const policy = makeBaseKaskoPolicy()

    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    // Should be eligible (basic kasko with core perils = valid)
    expect(result.eligible).toBe(true)
    expect(result.blockingReasons).toHaveLength(0)

    // Should NOT have Tam Kasko mismatch (no product name claimed)
    expect(result.productMismatches).toHaveLength(0)

    // EOOP should be calculated
    expect(result.expectedOutOfPocket.expectedCost.amount).toBeGreaterThan(0)
    expect(result.expectedOutOfPocket.premium.amount).toBe(15000)

    // Should have scenario scores for covered perils
    expect(Object.keys(result.scenarioScores).length).toBeGreaterThan(0)

    // Contract quality should be 100 (best: OEM parts, insured choice, TSB list)
    expect(result.contractQualityScore).toBe(100)
  })

  // ── Test 2: Tam Kasko Mismatch ──────────────────────────────────────────
  it('2. Tam Kasko Mismatch: "Tam Kasko" but missing flood/EQ → blocked', () => {
    const policy = makeBaseKaskoPolicy({
      policyId: 'test-tam-mismatch',
      marketedProductName: 'Tam Kasko',
      // Missing FLOOD and EARTHQUAKE coverages
    })

    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    // Should be blocked due to product name mismatch
    expect(result.eligible).toBe(false)
    expect(result.productMismatches.length).toBeGreaterThan(0)

    const mismatch = result.productMismatches[0]
    expect(mismatch.marketedName).toBe('Tam Kasko')
    expect(mismatch.missingCoverages).toContain('FLOOD')
    expect(mismatch.missingCoverages).toContain('EARTHQUAKE')
    expect(mismatch.severity).toBe('blocking')

    // Blocking reasons should include product mismatch
    expect(result.blockingReasons.some((r) => r.code === 'PRODUCT_NAME_MISMATCH')).toBe(true)
  })

  // ── Test 3: Semantic Exclusion ──────────────────────────────────────────
  it('3. Semantic Exclusion: flood included but underground water exclusion → drops flood score', () => {
    const policy = makeBaseKaskoPolicy({
      policyId: 'test-semantic-excl',
      coverages: [
        makeCoverage('COLLISION', true, 500000, 5000),
        makeCoverage('THEFT', true, 500000, 0),
        makeCoverage('FIRE', true, 500000, 0),
        makeCoverage('NATURAL_DISASTER', true, 500000, 2000),
        makeCoverage('FLOOD', true, 300000, 5000),
        makeCoverage('GLASS', true, 25000, 0),
      ],
      exclusionTexts: [
        'Yer altı suları ve kanalizasyon taşması sonucu oluşan hasarlar kapsam dışıdır.',
      ],
    })

    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)

    // Semantic exclusions should detect the flood-related exclusion
    const floodExclusions = result.semanticExclusions.filter((e) =>
      e.affectedScenarios.includes('SCN_FLOOD')
    )
    expect(floodExclusions.length).toBeGreaterThan(0)

    // The flood scenario should show as excluded in the EOOP breakdown
    const floodBreakdown = result.expectedOutOfPocket.scenarioBreakdown.find(
      (s) => s.scenarioCode === 'SCN_FLOOD'
    )
    if (floodBreakdown) {
      expect(floodBreakdown.excludedBySemantic).toBe(true)
    }
  })

  // ── Test 4: Rayiç Ambiguity ─────────────────────────────────────────────
  it('4. Rayiç Ambiguity: rayicMethod = "unspecified" → heavy contract quality penalty', () => {
    const goodPolicy = makeBaseKaskoPolicy({
      policyId: 'test-good-quality',
      indemnityMechanics: makeIndemnity('original', 'insured_choice', 'tsb_list', true),
    })

    const badPolicy = makeBaseKaskoPolicy({
      policyId: 'test-bad-quality',
      indemnityMechanics: makeIndemnity('original', 'insured_choice', 'unspecified', false),
    })

    const goodResult = runFullEvaluation(goodPolicy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    const badResult = runFullEvaluation(badPolicy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    // Good policy: contract quality = 100
    expect(goodResult.contractQualityScore).toBe(100)
    // Bad policy: rayiç unspecified + not concrete → heavy penalty
    expect(badResult.contractQualityScore).toBeLessThan(70)

    // Bad policy should have higher EOOP (worse contract = more out of pocket)
    expect(badResult.expectedOutOfPocket.expectedCost.amount).toBeGreaterThan(
      goodResult.expectedOutOfPocket.expectedCost.amount
    )
  })

  // ── Test 5: Indemnity Quality ───────────────────────────────────────────
  it('5. Indemnity Quality: equivalent parts + insurer network → lower score vs OEM + choice', () => {
    const premiumPolicy = makeBaseKaskoPolicy({
      policyId: 'test-premium-indemnity',
      indemnityMechanics: makeIndemnity('original', 'insured_choice', 'tsb_list', true),
    })

    const budgetPolicy = makeBaseKaskoPolicy({
      policyId: 'test-budget-indemnity',
      indemnityMechanics: makeIndemnity('equivalent', 'insurer_network', 'expert_report', true),
    })

    const premResult = runFullEvaluation(premiumPolicy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    const budgetResult = runFullEvaluation(budgetPolicy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    // Premium: 100 (best possible)
    expect(premResult.contractQualityScore).toBe(100)
    // Budget: penalized for equivalent parts (-10%), insurer network (-7%), expert report (-5%)
    expect(budgetResult.contractQualityScore).toBeLessThan(premResult.contractQualityScore)
    expect(budgetResult.contractQualityScore).toBeGreaterThan(50) // Not catastrophically bad

    // Budget policy EOOP should be higher
    expect(budgetResult.expectedOutOfPocket.expectedCost.amount).toBeGreaterThan(
      premResult.expectedOutOfPocket.expectedCost.amount
    )
  })

  // ── Test 6: Expired Policy ──────────────────────────────────────────────
  it('6. Expired Policy: Layer B gate → eligible = false', () => {
    const expiredPolicy = makeBaseKaskoPolicy({
      policyId: 'test-expired',
      effectiveDate: '2024-01-01',
      expiryDate: '2025-01-01',
    })

    // Check with a date after expiry
    const result = runFullEvaluation(expiredPolicy, {
      effectiveDate: new Date('2025-06-01'),
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(false)
    expect(result.blockingReasons.some((r) => r.code === 'POLICY_EXPIRED')).toBe(true)

    // EOOP should be zeroed out for blocked policies
    expect(result.expectedOutOfPocket.expectedCost.amount).toBe(0)
  })

  // ── Test 7: Traffic 2026 Below Minimums ─────────────────────────────────
  it('7. Traffic 2026: below SEDDK 2026 minimums → eligible = false', () => {
    const trafficPolicy: ActuarialPolicyInput = {
      policyId: 'test-traffic-2026',
      policyType: 'traffic',
      premium: { currency: 'TRY', amount: 3000 },
      effectiveDate: '2026-07-01',
      expiryDate: '2027-07-01',
      coverages: [
        // 2026 SEDDK minimum for bodily injury per person is 3,600,000 TRY
        // This policy only has 2,000,000 → below minimum
        makeCoverage('BODILY_INJURY_PER_PERSON', true, 2_000_000),
        makeCoverage('BODILY_INJURY_PER_ACCIDENT', true, 18_000_000),
        makeCoverage('MATERIAL_DAMAGE_PER_VEHICLE', true, 400_000),
        makeCoverage('MATERIAL_DAMAGE_PER_ACCIDENT', true, 800_000),
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(trafficPolicy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(false)
    expect(result.blockingReasons.some((r) => r.code.startsWith('TRAFFIC_BELOW_SEDDK_'))).toBe(true)
  })

  // ── Test 8: DASK/ZAS Deductible Mismatch ───────────────────────────────
  it('8. DASK/ZAS: deductible ≠ 2% → critical blocking', () => {
    const daskPolicy: ActuarialPolicyInput = {
      policyId: 'test-dask-deductible',
      policyType: 'dask',
      premium: { currency: 'TRY', amount: 2000 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      insuredValue: { currency: 'TRY', amount: 2_000_000 },
      coverages: [
        {
          code: 'EARTHQUAKE',
          included: true,
          limit: { value: { currency: 'TRY', amount: 2_800_000 }, evidence: makeEvidence() },
          // Deductible should be 2% but this is 5% → blocking
          deductible: {
            value: { kind: 'pct' as const, percent: 5 },
            evidence: makeEvidence(),
          },
        },
        {
          code: 'EQ_STRUCTURAL',
          included: true,
          limit: { value: { currency: 'TRY', amount: 2_800_000 }, evidence: makeEvidence() },
          deductible: {
            value: { kind: 'pct' as const, percent: 5 },
            evidence: makeEvidence(),
          },
        },
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(daskPolicy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(false)
    expect(
      result.blockingReasons.some(
        (r) => r.code === 'DASK_WRONG_DEDUCTIBLE' || r.message.toLowerCase().includes('deductible')
      )
    ).toBe(true)
  })

  // ── Test 9: Deductible Adequacy ─────────────────────────────────────────
  it('9. Deductible Adequacy: high deductible → higher EOOP', () => {
    const lowDeductible = makeBaseKaskoPolicy({
      policyId: 'test-low-ded',
      coverages: [
        makeCoverage('COLLISION', true, 500000, 2000),
        makeCoverage('THEFT', true, 500000, 0),
        makeCoverage('FIRE', true, 500000, 0),
        makeCoverage('NATURAL_DISASTER', true, 500000, 2000),
        makeCoverage('GLASS', true, 25000, 0),
      ],
    })

    const highDeductible = makeBaseKaskoPolicy({
      policyId: 'test-high-ded',
      coverages: [
        makeCoverage('COLLISION', true, 500000, 25000),
        makeCoverage('THEFT', true, 500000, 10000),
        makeCoverage('FIRE', true, 500000, 10000),
        makeCoverage('NATURAL_DISASTER', true, 500000, 15000),
        makeCoverage('GLASS', true, 25000, 5000),
      ],
    })

    const lowResult = calculateEOOP(lowDeductible, KASKO_SCENARIOS, FAST_MC)
    const highResult = calculateEOOP(highDeductible, KASKO_SCENARIOS, FAST_MC)

    // Higher deductible → higher expected uncovered losses
    expect(highResult.expectedUncoveredLoss.amount).toBeGreaterThan(
      lowResult.expectedUncoveredLoss.amount
    )
  })

  // ── Test 10: Premium Percentiles ────────────────────────────────────────
  it('10. Premium Percentiles: lower premium with same coverage → lower EOOP', () => {
    const cheapPolicy = makeBaseKaskoPolicy({
      policyId: 'test-cheap-premium',
      premium: { currency: 'TRY', amount: 8000 },
    })

    const expensivePolicy = makeBaseKaskoPolicy({
      policyId: 'test-expensive-premium',
      premium: { currency: 'TRY', amount: 25000 },
    })

    const cheapEOOP = calculateEOOP(cheapPolicy, KASKO_SCENARIOS, FAST_MC)
    const expensiveEOOP = calculateEOOP(expensivePolicy, KASKO_SCENARIOS, FAST_MC)

    // Same coverage quality → same uncovered losses, but different total EOOP due to premium
    // EOOP = premium + expected uncovered losses
    // Lower premium → lower total EOOP (better value)
    expect(cheapEOOP.expectedCost.amount).toBeLessThan(expensiveEOOP.expectedCost.amount)

    // Uncovered losses should be similar (same coverages)
    const lossDiff = Math.abs(
      cheapEOOP.expectedUncoveredLoss.amount - expensiveEOOP.expectedUncoveredLoss.amount
    )
    // Should be identical with same seed
    expect(lossDiff).toBeLessThan(1) // Floating point tolerance

    // Percentiles should reflect the premium difference
    expect(cheapEOOP.percentiles.p50).toBeLessThan(expensiveEOOP.percentiles.p50)
  })

  // ── Test 11: Sensitivity Flip ───────────────────────────────────────────
  it('11. Sensitivity Flip: weight perturbation → winner can change', () => {
    // Create two policies with different strengths
    const cheapButNarrow: TOPSISPolicyInput = {
      policyId: 'cheap-narrow',
      values: {
        eoop: 12000, // Low EOOP (good)
        premium: 8000, // Low premium (good)
        coverage_breadth: 40, // Narrow coverage (bad)
        compliance_score: 80,
        contract_quality: 60,
        deductible_exposure: 15000, // High deductible (bad)
      },
    }

    const expensiveButBroad: TOPSISPolicyInput = {
      policyId: 'expensive-broad',
      values: {
        eoop: 22000, // Higher EOOP (bad)
        premium: 20000, // Higher premium (bad)
        coverage_breadth: 95, // Broad coverage (good)
        compliance_score: 95,
        contract_quality: 90,
        deductible_exposure: 3000, // Low deductible (good)
      },
    }

    const policies = [cheapButNarrow, expensiveButBroad]

    // Default weights favour EOOP (0.30) + premium (0.20) = 0.50 cost focus
    // → cheap-narrow should win
    const baseResults = rankPolicies(policies, DEFAULT_TOPSIS_CRITERIA)
    expect(baseResults[0].policyId).toBe('cheap-narrow')

    // Run sensitivity analysis
    const sensitivity = analyzeSensitivity(policies, DEFAULT_TOPSIS_CRITERIA)

    // At least one flip should exist when coverage_breadth weight increases enough
    // (shifting focus from cost to coverage)
    expect(sensitivity.stabilityScore).toBeLessThan(1.0) // Not perfectly stable

    // Verify we have flip points
    expect(sensitivity.flipPoints.length).toBeGreaterThan(0)

    // At least one flip should involve coverage_breadth or deductible_exposure
    const relevantFlips = sensitivity.flipPoints.filter(
      (fp) => fp.criterionCode === 'coverage_breadth' || fp.criterionCode === 'deductible_exposure'
    )
    expect(relevantFlips.length).toBeGreaterThan(0)
  })

  // ── Test 12: Evidence Enforcement ───────────────────────────────────────
  it('12. Evidence Enforcement: missing EvidencePointer → needsReview = true', () => {
    // Policy with NO evidence on indemnity mechanics
    const noEvidencePolicy = makeBaseKaskoPolicy({
      policyId: 'test-no-evidence',
      indemnityMechanics: {
        partsStandard: { value: 'original', evidence: [] }, // Empty evidence
        repairNetworkRule: { value: 'insured_choice', evidence: [] },
        rayicMethod: { value: 'tsb_list', evidence: [] },
        rayicMethodIsConcrete: { value: true, evidence: [] },
      },
    })

    const result = runFullEvaluation(noEvidencePolicy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)
    expect(result.needsReview).toBe(true)

    // Evidence coverage should flag missing evidence
    expect(result.evidenceCoverage.overallNeedsReview).toBe(true)
    expect(result.evidenceCoverage.fieldsNeedingReview.length).toBeGreaterThan(0)

    // Individual field validation should flag review
    const validation = validateEvidence(
      'indemnityMechanics.partsStandard',
      noEvidencePolicy.indemnityMechanics!.partsStandard
    )
    expect(validation.needsReview).toBe(true)
    expect(validation.hasEvidence).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL LAYER-SPECIFIC REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Layer A — Semantic Exclusion Regression', () => {
  it('detects Turkish flood exclusion pattern', () => {
    const exclusions = analyzeExclusions(['Sel teminatı kapsam dışıdır.'])

    expect(exclusions.length).toBeGreaterThan(0)
    const floodExcl = exclusions.find((e) => e.affectedScenarios.includes('SCN_FLOOD'))
    expect(floodExcl).toBeDefined()
    expect(floodExcl!.severity).toBe('blocking')
  })

  it('detects Turkish earthquake exclusion pattern', () => {
    const exclusions = analyzeExclusions(['Deprem teminatı kapsam dışıdır.'])

    expect(exclusions.length).toBeGreaterThan(0)
    const eqExcl = exclusions.find((e) => e.affectedScenarios.includes('SCN_EARTHQUAKE'))
    expect(eqExcl).toBeDefined()
  })

  it('detects theft exclusion pattern', () => {
    const exclusions = analyzeExclusions(['Hırsızlık teminatı kapsam dışıdır.'])

    expect(exclusions.length).toBeGreaterThan(0)
    const theftExcl = exclusions.find((e) => e.affectedScenarios.includes('SCN_THEFT'))
    expect(theftExcl).toBeDefined()
  })
})

describe('Layer B — Compliance Gate Regression', () => {
  it('passes valid kasko policy', () => {
    const policy = makeBaseKaskoPolicy()
    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)
    expect(result.compliance.rulesetVersion).toBeDefined()
  })

  it('blocks invalid date range (expiry before effective)', () => {
    const policy = makeBaseKaskoPolicy({
      effectiveDate: '2026-06-01',
      expiryDate: '2026-01-01', // Before effective
    })

    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(false)
    expect(result.blockingReasons.some((r) => r.code === 'INVALID_DATE_RANGE')).toBe(true)
  })

  it('blocks zero premium', () => {
    const policy = makeBaseKaskoPolicy({
      premium: { currency: 'TRY', amount: 0 },
    })

    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(false)
    expect(result.blockingReasons.some((r) => r.code === 'INVALID_PREMIUM')).toBe(true)
  })
})

describe('Layer C — Monte Carlo EOOP Regression', () => {
  it('deterministic output with seed=42', () => {
    const policy = makeBaseKaskoPolicy()

    const result1 = calculateEOOP(policy, KASKO_SCENARIOS, FAST_MC)
    const result2 = calculateEOOP(policy, KASKO_SCENARIOS, FAST_MC)

    // Same seed → identical results
    expect(result1.expectedCost.amount).toBe(result2.expectedCost.amount)
    expect(result1.percentiles.p50).toBe(result2.percentiles.p50)
    expect(result1.percentiles.p95).toBe(result2.percentiles.p95)
  })

  it('EOOP components sum correctly', () => {
    const policy = makeBaseKaskoPolicy()
    const result = calculateEOOP(policy, KASKO_SCENARIOS, FAST_MC)

    // EOOP = premium + uncovered losses
    const reconstructed = policy.premium.amount + result.expectedUncoveredLoss.amount
    expect(Math.abs(result.expectedCost.amount - reconstructed)).toBeLessThan(0.02)
  })

  it('percentiles are monotonically increasing', () => {
    const policy = makeBaseKaskoPolicy()
    const result = calculateEOOP(policy, KASKO_SCENARIOS, FAST_MC)

    expect(result.percentiles.p5).toBeLessThanOrEqual(result.percentiles.p25)
    expect(result.percentiles.p25).toBeLessThanOrEqual(result.percentiles.p50)
    expect(result.percentiles.p50).toBeLessThanOrEqual(result.percentiles.p75)
    expect(result.percentiles.p75).toBeLessThanOrEqual(result.percentiles.p95)
  })

  it('contract quality factor penalizes bad contracts', () => {
    const goodPolicy = makeBaseKaskoPolicy({
      indemnityMechanics: makeIndemnity('original', 'insured_choice', 'tsb_list', true),
    })

    const badPolicy = makeBaseKaskoPolicy({
      indemnityMechanics: makeIndemnity('equivalent', 'insurer_network', 'unspecified', false),
    })

    const goodResult = calculateEOOP(goodPolicy, KASKO_SCENARIOS, FAST_MC)
    const badResult = calculateEOOP(badPolicy, KASKO_SCENARIOS, FAST_MC)

    // Good contract: factor near 1.0
    expect(goodResult.contractQualityFactor).toBe(1.0)
    // Bad contract: factor significantly less than 1.0
    expect(badResult.contractQualityFactor).toBeLessThan(0.7)
  })
})

describe('Layer D — TOPSIS Ranking Regression', () => {
  it('ranks lower EOOP + premium higher with default weights', () => {
    const policies: TOPSISPolicyInput[] = [
      {
        policyId: 'best',
        values: {
          eoop: 10000,
          premium: 8000,
          coverage_breadth: 80,
          compliance_score: 90,
          contract_quality: 85,
          deductible_exposure: 5000,
        },
      },
      {
        policyId: 'worst',
        values: {
          eoop: 30000,
          premium: 25000,
          coverage_breadth: 60,
          compliance_score: 70,
          contract_quality: 50,
          deductible_exposure: 20000,
        },
      },
    ]

    const results = rankPolicies(policies, DEFAULT_TOPSIS_CRITERIA)

    expect(results[0].policyId).toBe('best')
    expect(results[0].rank).toBe(1)
    expect(results[1].rank).toBe(2)
    expect(results[0].closeness).toBeGreaterThan(results[1].closeness)
  })

  it('handles three-policy ranking with clear hierarchy', () => {
    const policies: TOPSISPolicyInput[] = [
      {
        policyId: 'gold',
        values: {
          eoop: 12000,
          premium: 10000,
          coverage_breadth: 95,
          compliance_score: 95,
          contract_quality: 95,
          deductible_exposure: 2000,
        },
      },
      {
        policyId: 'silver',
        values: {
          eoop: 18000,
          premium: 15000,
          coverage_breadth: 75,
          compliance_score: 80,
          contract_quality: 70,
          deductible_exposure: 8000,
        },
      },
      {
        policyId: 'bronze',
        values: {
          eoop: 28000,
          premium: 22000,
          coverage_breadth: 50,
          compliance_score: 60,
          contract_quality: 45,
          deductible_exposure: 18000,
        },
      },
    ]

    const results = rankPolicies(policies, DEFAULT_TOPSIS_CRITERIA)

    expect(results[0].policyId).toBe('gold')
    expect(results[1].policyId).toBe('silver')
    expect(results[2].policyId).toBe('bronze')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// EXPANDED REGRESSION TESTS (P3.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('Kasko Extended Scenarios', () => {
  it('luxury vehicle with high limits produces higher EOOP', () => {
    const luxury = makeBaseKaskoPolicy({
      policyId: 'luxury-001',
      premium: { currency: 'TRY', amount: 40000 },
      coverages: [
        makeCoverage('COLLISION', true, 2_000_000, 10000),
        makeCoverage('THEFT', true, 2_000_000, 0),
        makeCoverage('FIRE', true, 2_000_000, 0),
        makeCoverage('NATURAL_DISASTER', true, 2_000_000, 5000),
        makeCoverage('FLOOD', true, 1_000_000, 5000),
        makeCoverage('EARTHQUAKE', true, 1_000_000, 10000),
        makeCoverage('GLASS', true, 50000, 0),
      ],
    })
    const standard = makeBaseKaskoPolicy({ policyId: 'standard-001' })

    const luxResult = runFullEvaluation(luxury, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })
    const stdResult = runFullEvaluation(standard, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(luxResult.eligible).toBe(true)
    // Higher premium drives higher total EOOP even with better coverage
    expect(luxResult.expectedOutOfPocket.expectedCost.amount).toBeGreaterThan(
      stdResult.expectedOutOfPocket.expectedCost.amount
    )
  })

  it('full coverage with all supplementary add-ons: no false penalties', () => {
    const fullCoverage = makeBaseKaskoPolicy({
      policyId: 'full-coverage-001',
      coverages: [
        makeCoverage('COLLISION', true, 500000, 3000),
        makeCoverage('THEFT', true, 500000, 0),
        makeCoverage('FIRE', true, 500000, 0),
        makeCoverage('NATURAL_DISASTER', true, 500000, 2000),
        makeCoverage('FLOOD', true, 300000, 2000),
        makeCoverage('EARTHQUAKE', true, 300000, 5000),
        makeCoverage('GLASS', true, 25000, 0),
        makeCoverage('PERSONAL_ACCIDENT', true, 100000, 0),
        makeCoverage('LEGAL_PROTECTION', true, 50000, 0),
        makeCoverage('TOWING', true, 10000, 0),
      ],
    })

    const result = runFullEvaluation(fullCoverage, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)
    expect(result.blockingReasons).toHaveLength(0)
    expect(result.productMismatches).toHaveLength(0)
    // All known scenarios should have scores assigned
    expect(Object.keys(result.scenarioScores).length).toBeGreaterThanOrEqual(6)
  })

  it('zero deductible policy: lower uncovered losses', () => {
    const zeroDed = makeBaseKaskoPolicy({
      policyId: 'zero-ded-001',
      coverages: [
        makeCoverage('COLLISION', true, 500000, 0),
        makeCoverage('THEFT', true, 500000, 0),
        makeCoverage('FIRE', true, 500000, 0),
        makeCoverage('NATURAL_DISASTER', true, 500000, 0),
        makeCoverage('GLASS', true, 25000, 0),
      ],
    })
    const highDed = makeBaseKaskoPolicy({
      policyId: 'high-ded-001',
      coverages: [
        makeCoverage('COLLISION', true, 500000, 20000),
        makeCoverage('THEFT', true, 500000, 10000),
        makeCoverage('FIRE', true, 500000, 5000),
        makeCoverage('NATURAL_DISASTER', true, 500000, 10000),
        makeCoverage('GLASS', true, 25000, 5000),
      ],
    })

    const zeroResult = runFullEvaluation(zeroDed, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })
    const highResult = runFullEvaluation(highDed, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(zeroResult.eligible).toBe(true)
    expect(highResult.eligible).toBe(true)
    // Zero deductible → lower uncovered losses
    expect(zeroResult.expectedOutOfPocket.expectedUncoveredLoss.amount).toBeLessThan(
      highResult.expectedOutOfPocket.expectedUncoveredLoss.amount
    )
  })

  it('policy with no coverages included: still evaluates gracefully', () => {
    const noCov = makeBaseKaskoPolicy({
      policyId: 'no-cov-001',
      coverages: [
        makeCoverage('COLLISION', false, 500000, 5000),
        makeCoverage('THEFT', false, 500000, 0),
      ],
    })

    const result = runFullEvaluation(noCov, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    // Should still be eligible (not blocked by compliance) but have high uncovered losses
    expect(result.eligible).toBe(true)
    expect(result.expectedOutOfPocket.expectedUncoveredLoss.amount).toBeGreaterThanOrEqual(0)
  })

  it('policy with zero exclusion texts: semantic analysis handles gracefully', () => {
    const policy = makeBaseKaskoPolicy({
      policyId: 'no-excl-001',
      exclusionTexts: [],
    })

    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)
    expect(result.semanticExclusions).toHaveLength(0)
    // No exclusions → no scenario should be excluded
    const excludedScenarios = result.expectedOutOfPocket.scenarioBreakdown.filter(
      (s) => s.excludedBySemantic
    )
    expect(excludedScenarios).toHaveLength(0)
  })
})

describe('Traffic Extended Scenarios', () => {
  it('traffic at exactly SEDDK 2026 minimums: passes compliance', () => {
    const trafficExact: ActuarialPolicyInput = {
      policyId: 'traffic-exact-2026',
      policyType: 'traffic',
      premium: { currency: 'TRY', amount: 5000 },
      effectiveDate: '2026-06-01',
      expiryDate: '2027-06-01',
      coverages: [
        makeCoverage('BODILY_INJURY_PER_PERSON', true, 3_600_000),
        makeCoverage('BODILY_INJURY_PER_ACCIDENT', true, 18_000_000),
        makeCoverage('MATERIAL_DAMAGE_PER_VEHICLE', true, 400_000),
        makeCoverage('MATERIAL_DAMAGE_PER_ACCIDENT', true, 800_000),
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(trafficExact, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)
    // No blocking reasons related to SEDDK limits
    const seddkBlocking = result.blockingReasons.filter((r) =>
      r.code.startsWith('TRAFFIC_BELOW_SEDDK_')
    )
    expect(seddkBlocking).toHaveLength(0)
  })

  it('traffic 1₺ below SEDDK minimum for bodily injury: fails compliance', () => {
    const trafficBelow: ActuarialPolicyInput = {
      policyId: 'traffic-below-2026',
      policyType: 'traffic',
      premium: { currency: 'TRY', amount: 4000 },
      effectiveDate: '2026-06-01',
      expiryDate: '2027-06-01',
      coverages: [
        makeCoverage('BODILY_INJURY_PER_PERSON', true, 3_599_999), // 1₺ below
        makeCoverage('BODILY_INJURY_PER_ACCIDENT', true, 18_000_000),
        makeCoverage('MATERIAL_DAMAGE_PER_VEHICLE', true, 400_000),
        makeCoverage('MATERIAL_DAMAGE_PER_ACCIDENT', true, 800_000),
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(trafficBelow, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(false)
    expect(
      result.blockingReasons.some((r) => r.code === 'TRAFFIC_BELOW_SEDDK_BODILYINJURYPERPERSON')
    ).toBe(true)
  })

  it('traffic with maximum limits: optimal EOOP', () => {
    const trafficMax: ActuarialPolicyInput = {
      policyId: 'traffic-max-2026',
      policyType: 'traffic',
      premium: { currency: 'TRY', amount: 8000 },
      effectiveDate: '2026-06-01',
      expiryDate: '2027-06-01',
      coverages: [
        makeCoverage('BODILY_INJURY_PER_PERSON', true, 10_000_000),
        makeCoverage('BODILY_INJURY_PER_ACCIDENT', true, 50_000_000),
        makeCoverage('MATERIAL_DAMAGE_PER_VEHICLE', true, 2_000_000),
        makeCoverage('MATERIAL_DAMAGE_PER_ACCIDENT', true, 5_000_000),
      ],
      exclusionTexts: [],
    }

    const trafficMin: ActuarialPolicyInput = {
      policyId: 'traffic-min-2026',
      policyType: 'traffic',
      premium: { currency: 'TRY', amount: 4000 },
      effectiveDate: '2026-06-01',
      expiryDate: '2027-06-01',
      coverages: [
        makeCoverage('BODILY_INJURY_PER_PERSON', true, 3_600_000),
        makeCoverage('BODILY_INJURY_PER_ACCIDENT', true, 18_000_000),
        makeCoverage('MATERIAL_DAMAGE_PER_VEHICLE', true, 400_000),
        makeCoverage('MATERIAL_DAMAGE_PER_ACCIDENT', true, 800_000),
      ],
      exclusionTexts: [],
    }

    const maxResult = runFullEvaluation(trafficMax, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })
    const minResult = runFullEvaluation(trafficMin, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(maxResult.eligible).toBe(true)
    expect(minResult.eligible).toBe(true)

    // Higher limits → lower uncovered losses
    expect(maxResult.expectedOutOfPocket.expectedUncoveredLoss.amount).toBeLessThanOrEqual(
      minResult.expectedOutOfPocket.expectedUncoveredLoss.amount
    )
  })
})

describe('DASK/ZAS Extended Scenarios', () => {
  it('DASK with exactly 2% deductible: passes compliance', () => {
    const daskCompliant: ActuarialPolicyInput = {
      policyId: 'dask-compliant-001',
      policyType: 'dask',
      premium: { currency: 'TRY', amount: 2500 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      insuredValue: { currency: 'TRY', amount: 2_000_000 },
      coverages: [
        {
          code: 'EARTHQUAKE',
          included: true,
          limit: { value: { currency: 'TRY', amount: 2_000_000 }, evidence: makeEvidence() },
          deductible: {
            value: { kind: 'pct' as const, percent: 2 },
            evidence: makeEvidence(),
          },
        },
        {
          code: 'EQ_STRUCTURAL',
          included: true,
          limit: { value: { currency: 'TRY', amount: 2_000_000 }, evidence: makeEvidence() },
          deductible: {
            value: { kind: 'pct' as const, percent: 2 },
            evidence: makeEvidence(),
          },
        },
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(daskCompliant, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)
    const daskBlocking = result.blockingReasons.filter((r) => r.code.includes('DASK'))
    expect(daskBlocking).toHaveLength(0)
  })

  it('ZAS product with multiple perils: evaluates all scenarios', () => {
    const zasPolicy: ActuarialPolicyInput = {
      policyId: 'zas-multi-peril',
      policyType: 'zas',
      premium: { currency: 'TRY', amount: 3500 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      insuredValue: { currency: 'TRY', amount: 2_500_000 },
      coverages: [
        {
          code: 'EARTHQUAKE',
          included: true,
          limit: { value: { currency: 'TRY', amount: 2_500_000 }, evidence: makeEvidence() },
          deductible: { value: { kind: 'pct' as const, percent: 2 }, evidence: makeEvidence() },
        },
        {
          code: 'FLOOD',
          included: true,
          limit: { value: { currency: 'TRY', amount: 1_000_000 }, evidence: makeEvidence() },
          deductible: { value: { kind: 'pct' as const, percent: 2 }, evidence: makeEvidence() },
        },
        {
          code: 'STORM',
          included: true,
          limit: { value: { currency: 'TRY', amount: 800_000 }, evidence: makeEvidence() },
          deductible: { value: { kind: 'pct' as const, percent: 2 }, evidence: makeEvidence() },
        },
        {
          code: 'WILDFIRE',
          included: true,
          limit: { value: { currency: 'TRY', amount: 600_000 }, evidence: makeEvidence() },
          deductible: { value: { kind: 'pct' as const, percent: 2 }, evidence: makeEvidence() },
        },
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(zasPolicy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.eligible).toBe(true)
    // ZAS scenarios include both ZAS-specific and DASK scenarios
    expect(result.expectedOutOfPocket.scenarioBreakdown.length).toBeGreaterThanOrEqual(3)
  })

  it('DASK coverage exceeding max coverage: warning but not blocking', () => {
    const daskExcessive: ActuarialPolicyInput = {
      policyId: 'dask-excessive-001',
      policyType: 'dask',
      premium: { currency: 'TRY', amount: 5000 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      insuredValue: { currency: 'TRY', amount: 5_000_000 }, // Exceeds 2026 max of 3.2M
      coverages: [
        {
          code: 'EARTHQUAKE',
          included: true,
          limit: { value: { currency: 'TRY', amount: 5_000_000 }, evidence: makeEvidence() },
          deductible: { value: { kind: 'pct' as const, percent: 2 }, evidence: makeEvidence() },
        },
      ],
      exclusionTexts: [],
    }

    const result = runFullEvaluation(daskExcessive, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    // Should produce a warning but not block
    const maxCoverageWarning = result.warnings.find((w) => w.code === 'DASK_EXCEEDS_MAX_COVERAGE')
    expect(maxCoverageWarning).toBeDefined()
    // Should still be eligible
    expect(result.eligible).toBe(true)
  })
})

describe('Cross-Cutting Edge Cases', () => {
  it('multi-policy comparison where all policies are identical: equal rankings', () => {
    const policyA = makeBaseKaskoPolicy({ policyId: 'identical-a' })
    const policyB = makeBaseKaskoPolicy({ policyId: 'identical-b' })

    const results = evaluateAndRankPolicies([policyA, policyB], {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(results).toHaveLength(2)
    expect(results[0].eligible).toBe(true)
    expect(results[1].eligible).toBe(true)

    // Both should have rankings
    expect(results[0].ranking).toBeDefined()
    expect(results[1].ranking).toBeDefined()

    // Closeness scores should be identical (same inputs → same TOPSIS score)
    expect(results[0].ranking!.topsisCloseness).toBe(results[1].ranking!.topsisCloseness)
  })

  it('mixed policy types in multi-policy evaluation: each evaluates with correct scenarios', () => {
    const kasko = makeBaseKaskoPolicy({ policyId: 'mixed-kasko' })
    const traffic: ActuarialPolicyInput = {
      policyId: 'mixed-traffic',
      policyType: 'traffic',
      premium: { currency: 'TRY', amount: 5000 },
      effectiveDate: '2026-01-01',
      expiryDate: '2027-01-01',
      coverages: [
        makeCoverage('BODILY_INJURY_PER_PERSON', true, 3_600_000),
        makeCoverage('BODILY_INJURY_PER_ACCIDENT', true, 18_000_000),
        makeCoverage('MATERIAL_DAMAGE_PER_VEHICLE', true, 400_000),
        makeCoverage('MATERIAL_DAMAGE_PER_ACCIDENT', true, 800_000),
      ],
      exclusionTexts: [],
    }

    const results = evaluateAndRankPolicies([kasko, traffic], {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(results).toHaveLength(2)
    // Both should be eligible
    expect(results[0].eligible).toBe(true)
    expect(results[1].eligible).toBe(true)

    // Kasko should have kasko-specific scenarios
    const kaskoResult = results.find((r) =>
      r.expectedOutOfPocket.scenarioBreakdown.some(
        (s) => s.scenarioCode === 'SCN_PARTIAL_COLLISION'
      )
    )
    expect(kaskoResult).toBeDefined()

    // Traffic should have traffic-specific scenarios
    const trafficResult = results.find((r) =>
      r.expectedOutOfPocket.scenarioBreakdown.some(
        (s) => s.scenarioCode === 'SCN_BODILY_INJURY_MINOR'
      )
    )
    expect(trafficResult).toBeDefined()
  })

  it('evaluation result always includes configSnapshot', () => {
    const policy = makeBaseKaskoPolicy({ policyId: 'config-snapshot-001' })

    const result = runFullEvaluation(policy, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(result.configSnapshot).toBeDefined()
    expect(result.configSnapshot.ruleset).toBeDefined()
    expect(result.configSnapshot.monteCarlo).toContain('mc-1000')
    expect(result.evaluatedAt).toBeDefined()
    // evaluatedAt should be a valid ISO string
    expect(new Date(result.evaluatedAt).getTime()).toBeGreaterThan(0)
  })
})

describe('Multi-Policy End-to-End Regression', () => {
  it('evaluateAndRankPolicies produces TOPSIS rankings for eligible policies', () => {
    const policies: ActuarialPolicyInput[] = [
      makeBaseKaskoPolicy({
        policyId: 'multi-1',
        premium: { currency: 'TRY', amount: 12000 },
        coverages: [
          makeCoverage('COLLISION', true, 600000, 3000),
          makeCoverage('THEFT', true, 600000, 0),
          makeCoverage('FIRE', true, 600000, 0),
          makeCoverage('NATURAL_DISASTER', true, 600000, 2000),
          makeCoverage('FLOOD', true, 300000, 5000),
          makeCoverage('EARTHQUAKE', true, 300000, 10000),
          makeCoverage('GLASS', true, 30000, 0),
        ],
      }),
      makeBaseKaskoPolicy({
        policyId: 'multi-2',
        premium: { currency: 'TRY', amount: 18000 },
        coverages: [
          makeCoverage('COLLISION', true, 500000, 5000),
          makeCoverage('THEFT', true, 500000, 0),
          makeCoverage('FIRE', true, 500000, 0),
          makeCoverage('NATURAL_DISASTER', true, 500000, 2000),
          makeCoverage('GLASS', true, 25000, 0),
        ],
      }),
    ]

    const results = evaluateAndRankPolicies(policies, {
      effectiveDate: FUTURE_DATE,
      monteCarloConfig: FAST_MC,
    })

    expect(results).toHaveLength(2)
    expect(results[0].eligible).toBe(true)
    expect(results[1].eligible).toBe(true)

    // Both should have rankings
    expect(results[0].ranking).toBeDefined()
    expect(results[1].ranking).toBeDefined()

    // Rankings should be 1 and 2
    const ranks = results.map((r) => r.ranking!.rank).sort()
    expect(ranks).toEqual([1, 2])

    // Grades should be assigned
    for (const result of results) {
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.ranking!.grade)
    }
  })

  it('blocked policies do not receive TOPSIS ranking', () => {
    const policies: ActuarialPolicyInput[] = [
      makeBaseKaskoPolicy({
        policyId: 'eligible-one',
        premium: { currency: 'TRY', amount: 12000 },
      }),
      makeBaseKaskoPolicy({
        policyId: 'expired-one',
        effectiveDate: '2024-01-01',
        expiryDate: '2025-01-01',
      }),
    ]

    const results = evaluateAndRankPolicies(policies, {
      effectiveDate: new Date('2025-06-01'),
      monteCarloConfig: FAST_MC,
    })

    const eligible = results.find((r) => r.eligible)
    const blocked = results.find((r) => !r.eligible)

    expect(eligible).toBeDefined()
    expect(blocked).toBeDefined()
    expect(blocked!.ranking).toBeUndefined()
  })
})
