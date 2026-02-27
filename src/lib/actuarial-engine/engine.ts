/**
 * Actuarial Engine — Main Orchestrator
 *
 * Executes the full 4-layer evaluation pipeline:
 *   1. Layer A: Analyze exclusions, validate evidence
 *   2. Layer B: Compliance gate → if not eligible, stop
 *   3. Layer C: Monte Carlo EOOP calculation
 *   4. Layer D: TOPSIS ranking (multi-policy only)
 *
 * Returns a complete PolicyEvaluationResult.
 */

import type {
  ActuarialPolicyInput,
  ActuarialEvaluationOptions,
  PolicyEvaluationResult,
  MonteCarloConfig,
  SemanticExclusionImpact,
  Money,
} from './types'
import { executeComplianceGate } from './layer-b/compliance-gate'
import { analyzeExclusions } from './layer-a/semantic-exclusions'
import { generateEvidenceCoverageReport, quickReviewCheck } from './layer-a/evidence-tracker'
import { calculateEOOP } from './layer-c/monte-carlo'
import { getScenariosForPolicyType } from './layer-c/scenario-library'
import { type TOPSISPolicyInput, rankPolicies } from './layer-d/topsis'
import { DEFAULT_TOPSIS_CRITERIA } from './layer-d/topsis'
import {
  DEFAULT_MONTE_CARLO_CONFIG,
  computeContractQualityScore,
  computeCoverageBreadthScore,
  computeDeductibleExposure,
  computeComplianceScore,
} from './config/defaults'

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE POLICY EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full 4-layer actuarial evaluation on a single policy.
 *
 * @param policy - The actuarial policy input
 * @param options - Evaluation options (optional)
 * @returns Complete PolicyEvaluationResult
 */
export function runFullEvaluation(
  policy: ActuarialPolicyInput,
  options?: ActuarialEvaluationOptions
): PolicyEvaluationResult {
  const now = new Date()

  // ── Layer A: Semantic Exclusion Analysis ─────────────────────────────
  let semanticExclusions: SemanticExclusionImpact[]

  if (options?.skipSemanticAnalysis && policy.semanticExclusions) {
    // Use pre-computed exclusions
    semanticExclusions = policy.semanticExclusions
  } else {
    semanticExclusions = analyzeExclusions(policy.exclusionTexts)
  }

  // Evidence coverage report
  const evidenceCoverage = generateEvidenceCoverageReport(policy, semanticExclusions)

  // Quick review check
  const reviewCheck = quickReviewCheck(policy, semanticExclusions)

  // ── Layer B: Compliance Gate ─────────────────────────────────────────
  const checkDate = options?.effectiveDate ?? now
  const { compliance, productMismatches } = executeComplianceGate(policy, checkDate)

  // If not eligible, return early with blocking result
  if (!compliance.eligible) {
    return buildBlockedResult({
      policy,
      compliance,
      productMismatches,
      semanticExclusions,
      evidenceCoverage,
      needsReview: reviewCheck.needsReview,
      now,
    })
  }

  // ── Layer C: Monte Carlo EOOP ────────────────────────────────────────
  const mcConfig: MonteCarloConfig = {
    ...DEFAULT_MONTE_CARLO_CONFIG,
    ...options?.monteCarloConfig,
  }

  const scenarios = options?.scenarioOverrides ?? getScenariosForPolicyType(policy.policyType)

  const eoopResult = calculateEOOP(policy, scenarios, mcConfig, semanticExclusions)

  // Compute supporting scores for TOPSIS
  const contractQualityScore = policy.indemnityMechanics
    ? computeContractQualityScore(
        policy.indemnityMechanics.partsStandard.value,
        policy.indemnityMechanics.repairNetworkRule.value,
        policy.indemnityMechanics.rayicMethod.value,
        policy.indemnityMechanics.rayicMethodIsConcrete.value
      )
    : 50 // Default for unknown

  // Per-scenario scores (0-100, based on coverage quality for each scenario)
  const scenarioScores: Record<string, number> = {}
  for (const sr of eoopResult.scenarioBreakdown) {
    // Score based on how well the policy covers this scenario
    // Lower expected cost relative to loss → better score
    if (sr.excludedBySemantic) {
      scenarioScores[sr.scenarioCode] = 0 // Excluded = no coverage
    } else if (sr.occurrenceCount === 0) {
      scenarioScores[sr.scenarioCode] = 100 // No occurrence = no penalty
    } else {
      // Score is inverse of OOP ratio — lower OOP = better
      const scenario = scenarios.find((s) => s.code === sr.scenarioCode)
      if (scenario && sr.avgOutOfPocket > 0) {
        const expectedLoss = getExpectedLossForScenario(scenario)
        const oopRatio = Math.min(1, sr.avgOutOfPocket / expectedLoss)
        scenarioScores[sr.scenarioCode] = Math.round((1 - oopRatio) * 100)
      } else {
        scenarioScores[sr.scenarioCode] = 100
      }
    }
  }

  return {
    eligible: true,
    blockingReasons: [],
    warnings: compliance.warnings,
    productMismatches,
    compliance,
    semanticExclusions,
    indemnityMechanics: policy.indemnityMechanics,
    evidenceCoverage,
    scenarioScores,
    expectedOutOfPocket: eoopResult,
    contractQualityScore,
    configSnapshot: {
      ruleset: compliance.rulesetVersion,
      monteCarlo: `mc-${mcConfig.numSimulations}-seed${mcConfig.seed ?? 'random'}`,
    },
    needsReview: reviewCheck.needsReview,
    evaluatedAt: now.toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-POLICY COMPARISON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates and ranks multiple policies using the full pipeline + TOPSIS.
 *
 * @param policies - Array of actuarial policy inputs
 * @param options - Evaluation options (optional)
 * @returns Array of PolicyEvaluationResult with TOPSIS rankings
 */
export function evaluateAndRankPolicies(
  policies: ActuarialPolicyInput[],
  options?: ActuarialEvaluationOptions
): PolicyEvaluationResult[] {
  // Step 1: Evaluate each policy individually
  const evaluations = policies.map((policy) => runFullEvaluation(policy, options))

  // Step 2: Build TOPSIS inputs for eligible policies
  const eligiblePolicies: Array<{
    index: number
    evaluation: PolicyEvaluationResult
    policy: ActuarialPolicyInput
  }> = []

  for (let i = 0; i < evaluations.length; i++) {
    if (evaluations[i].eligible) {
      eligiblePolicies.push({
        index: i,
        evaluation: evaluations[i],
        policy: policies[i],
      })
    }
  }

  if (eligiblePolicies.length <= 1 || options?.skipRanking) {
    // Single policy or ranking skipped — return without TOPSIS
    return evaluations
  }

  // Step 3: Build TOPSIS decision matrix
  const topsisInputs: TOPSISPolicyInput[] = eligiblePolicies.map(({ policy, evaluation }) => {
    const includedCodes = new Set(policy.coverages.filter((c) => c.included).map((c) => c.code))

    const coverageBreadth = computeCoverageBreadthScore(includedCodes)

    const deductibleExposure = computeDeductibleExposure(
      policy.coverages.map((c) => ({
        code: c.code,
        deductibleAmount: resolveDeductibleAmount(c.deductible?.value),
        limitAmount: resolveLimitAmount(c.limit?.value),
        included: c.included,
      }))
    )

    const complianceScore = computeComplianceScore(
      evaluation.eligible,
      evaluation.warnings.length,
      evaluation.blockingReasons.length
    )

    return {
      policyId: policy.policyId,
      values: {
        eoop: evaluation.expectedOutOfPocket.expectedCost.amount,
        premium: policy.premium.amount,
        coverage_breadth: coverageBreadth,
        compliance_score: complianceScore,
        contract_quality: evaluation.contractQualityScore,
        deductible_exposure: deductibleExposure,
      },
    }
  })

  // Step 4: Run TOPSIS
  const topsisResults = rankPolicies(topsisInputs, DEFAULT_TOPSIS_CRITERIA)

  // Step 5: Map TOPSIS results back to evaluations
  for (const topsisResult of topsisResults) {
    const ep = eligiblePolicies.find(({ policy }) => policy.policyId === topsisResult.policyId)
    if (ep) {
      evaluations[ep.index].ranking = {
        topsisCloseness: topsisResult.closeness,
        rank: topsisResult.rank,
        grade: closenessToGrade(topsisResult.closeness),
      }
    }
  }

  return evaluations
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildBlockedResult(params: {
  policy: ActuarialPolicyInput
  compliance: PolicyEvaluationResult['compliance']
  productMismatches: PolicyEvaluationResult['productMismatches']
  semanticExclusions: SemanticExclusionImpact[]
  evidenceCoverage: PolicyEvaluationResult['evidenceCoverage']
  needsReview: boolean
  now: Date
}): PolicyEvaluationResult {
  const zeroCost: Money = { currency: params.policy.premium.currency, amount: 0 }

  return {
    eligible: false,
    blockingReasons: params.compliance.blockingReasons,
    warnings: params.compliance.warnings,
    productMismatches: params.productMismatches,
    compliance: params.compliance,
    semanticExclusions: params.semanticExclusions,
    indemnityMechanics: params.policy.indemnityMechanics,
    evidenceCoverage: params.evidenceCoverage,
    scenarioScores: {},
    expectedOutOfPocket: {
      expectedCost: zeroCost,
      premium: params.policy.premium,
      expectedUncoveredLoss: zeroCost,
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
      scenarioBreakdown: [],
      config: DEFAULT_MONTE_CARLO_CONFIG,
      contractQualityFactor: 1,
    },
    contractQualityScore: 0,
    configSnapshot: {
      ruleset: params.compliance.rulesetVersion,
    },
    needsReview: params.needsReview,
    evaluatedAt: params.now.toISOString(),
  }
}

function closenessToGrade(closeness: number): string {
  if (closeness >= 0.8) return 'A'
  if (closeness >= 0.6) return 'B'
  if (closeness >= 0.4) return 'C'
  if (closeness >= 0.2) return 'D'
  return 'F'
}

function resolveDeductibleAmount(spec: import('./types').DeductibleSpec | undefined): number {
  if (!spec) return 0
  if ('kind' in spec) {
    if (spec.kind === 'none') return 0
    if (spec.kind === 'pct') return spec.percent // Will need loss amount context
  }
  return (spec as Money).amount
}

function resolveLimitAmount(spec: import('./types').CoverageLimitSpec | undefined): number {
  if (!spec) return 0
  if ('kind' in spec && spec.kind === 'unlimited') return Infinity
  return (spec as Money).amount
}

/**
 * Gets a rough expected loss for a scenario (for scoring purposes).
 */
function getExpectedLossForScenario(scenario: import('./types').RiskScenario): number {
  const dist = scenario.lossDistribution
  switch (dist.type) {
    case 'lognormal':
      return Math.exp(dist.mu + (dist.sigma * dist.sigma) / 2)
    case 'pareto':
      return dist.alpha > 1 ? (dist.alpha * dist.xMin) / (dist.alpha - 1) : dist.xMin * 10
    case 'uniform':
      return (dist.min + dist.max) / 2
  }
}
