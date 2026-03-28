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
  LayerTimings,
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
 * Determine EOOP precision based on adapter metadata flags.
 * Percentage and conditional deductibles cannot be fully modeled in Monte Carlo
 * because they depend on loss magnitude, which varies per scenario.
 */
function computeEoopPrecision(policy: ActuarialPolicyInput): {
  eoopPrecision: 'full' | 'partial' | 'suppressed'
  eoopLimitations: string[]
} {
  const meta = policy as ActuarialPolicyInput & {
    _hasPercentageDeductible?: boolean
    _deductiblePercent?: number
    _hasConditionalDeductibles?: boolean
    _conditionalDeductibleCount?: number
  }

  const limitations: string[] = []

  if (meta._hasPercentageDeductible && meta._deductiblePercent) {
    limitations.push(
      `${meta._deductiblePercent}% proportional deductible detected — actual out-of-pocket varies with loss amount and is likely higher than shown`
    )
  }

  if (meta._hasConditionalDeductibles) {
    limitations.push(
      `${meta._conditionalDeductibleCount} conditional deductible condition(s) detected — exposure depends on claim circumstances (e.g., service network, repair type)`
    )
  }

  if (limitations.length === 0) {
    return { eoopPrecision: 'full', eoopLimitations: [] }
  }

  return { eoopPrecision: 'partial', eoopLimitations: limitations }
}

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
  const evalStart = performance.now()

  // ── Layer A: Semantic Exclusion Analysis ─────────────────────────────
  const layerAStart = performance.now()
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
  const layerA_ms = performance.now() - layerAStart

  // ── Layer B: Compliance Gate ─────────────────────────────────────────
  const layerBStart = performance.now()
  const checkDate = options?.effectiveDate ?? now
  const { compliance, productMismatches } = executeComplianceGate(policy, checkDate)
  const layerB_ms = performance.now() - layerBStart

  // If not eligible, return early with blocking result
  if (!compliance.eligible) {
    const total_ms = performance.now() - evalStart
    return buildBlockedResult({
      policy,
      compliance,
      productMismatches,
      semanticExclusions,
      evidenceCoverage,
      needsReview: reviewCheck.needsReview,
      now,
      layerTimings: { layerA_ms, layerB_ms, layerC_ms: 0, total_ms },
    })
  }

  // ── Layer C: Monte Carlo EOOP ────────────────────────────────────────
  const layerCStart = performance.now()
  const mcConfig: MonteCarloConfig = {
    ...DEFAULT_MONTE_CARLO_CONFIG,
    ...options?.monteCarloConfig,
  }

  const scenarios = options?.scenarioOverrides ?? getScenariosForPolicyType(policy.policyType)

  // Safety guard: block EOOP computation when premium is missing/zero
  const isPremiumMissing =
    policy.premium.amount <= 0 ||
    (policy as ActuarialPolicyInput & { _premiumMissing?: boolean })._premiumMissing === true
  const eoopResult = isPremiumMissing
    ? buildInsufficientDataEOOP(policy, scenarios, mcConfig)
    : calculateEOOP(policy, scenarios, mcConfig, semanticExclusions)
  const layerC_ms = performance.now() - layerCStart

  // Compute supporting scores for TOPSIS
  const contractQualityIsEstimated = !policy.indemnityMechanics
  const contractQualityScore = policy.indemnityMechanics
    ? computeContractQualityScore(
        policy.indemnityMechanics.partsStandard.value,
        policy.indemnityMechanics.repairNetworkRule.value,
        policy.indemnityMechanics.rayicMethod.value,
        policy.indemnityMechanics.rayicMethodIsConcrete.value
      )
    : 50 // Default for unknown — flagged via contractQualityIsEstimated

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

  const total_ms = performance.now() - evalStart

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
    contractQualityIsEstimated,
    ...computeEoopPrecision(policy),
    layerTimings: { layerA_ms, layerB_ms, layerC_ms, total_ms },
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
  const layerDStart = performance.now()
  const topsisResults = rankPolicies(topsisInputs, DEFAULT_TOPSIS_CRITERIA)
  const layerD_ms = performance.now() - layerDStart

  // Step 5: Map TOPSIS results back to evaluations
  for (const topsisResult of topsisResults) {
    const ep = eligiblePolicies.find(({ policy }) => policy.policyId === topsisResult.policyId)
    if (ep) {
      evaluations[ep.index].ranking = {
        topsisCloseness: topsisResult.closeness,
        rank: topsisResult.rank,
        grade: closenessToGrade(topsisResult.closeness),
      }
      // Add Layer D timing to each eligible evaluation
      const timings = evaluations[ep.index].layerTimings
      if (timings) {
        timings.layerD_ms = layerD_ms
      }
    }
  }

  return evaluations
}

/**
 * Evaluates and ranks multiple policies asynchronously using the full pipeline + TOPSIS.
 * Utilizes Web Workers for Monte Carlo simulations if enabled.
 *
 * @param policies - Array of actuarial policy inputs
 * @param options - Evaluation options (optional)
 * @returns Promise resolving to an array of PolicyEvaluationResult with TOPSIS rankings
 */
export async function evaluateAndRankPoliciesAsync(
  policies: ActuarialPolicyInput[],
  options?: ActuarialEvaluationOptions
): Promise<PolicyEvaluationResult[]> {
  // Step 1: Evaluate each policy individually (in parallel)
  const evalPromises = policies.map((policy) => runFullEvaluationAsync(policy, options))
  const evaluations = await Promise.all(evalPromises)

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
  const layerDStart = performance.now()
  const topsisResults = rankPolicies(topsisInputs, DEFAULT_TOPSIS_CRITERIA)
  const layerD_ms = performance.now() - layerDStart

  // Step 5: Map TOPSIS results back to evaluations
  for (const topsisResult of topsisResults) {
    const ep = eligiblePolicies.find(({ policy }) => policy.policyId === topsisResult.policyId)
    if (ep) {
      evaluations[ep.index].ranking = {
        topsisCloseness: topsisResult.closeness,
        rank: topsisResult.rank,
        grade: closenessToGrade(topsisResult.closeness),
      }
      // Add Layer D timing to each eligible evaluation
      const timings = evaluations[ep.index].layerTimings
      if (timings) {
        timings.layerD_ms = layerD_ms
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
  layerTimings: LayerTimings
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
    layerTimings: params.layerTimings,
    configSnapshot: {
      ruleset: params.compliance.rulesetVersion,
    },
    needsReview: params.needsReview,
    evaluatedAt: params.now.toISOString(),
  }
}

/**
 * Returns an EOOP result indicating insufficient data instead of computing with zeros.
 * Used when premium is missing/zero — prevents misleading 0 TRY EOOP output.
 */
function buildInsufficientDataEOOP(
  policy: ActuarialPolicyInput,
  _scenarios: import('./types').RiskScenario[],
  config: MonteCarloConfig
): import('./types').EOOPResult {
  const insufficientMoney: Money = { currency: policy.premium.currency, amount: -1 }
  return {
    expectedCost: insufficientMoney,
    premium: { ...policy.premium },
    expectedUncoveredLoss: insufficientMoney,
    percentiles: { p5: -1, p25: -1, p50: -1, p75: -1, p95: -1 },
    scenarioBreakdown: [],
    config,
    contractQualityFactor: -1,
    _insufficientData: true,
  } as import('./types').EOOPResult & { _insufficientData: boolean }
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
/**
 * Runs the full 4-layer actuarial evaluation on a single policy asynchronously
 * using a Web Worker for the Monte Carlo simulation (Layer C).
 */
export async function runFullEvaluationAsync(
  policy: ActuarialPolicyInput,
  options?: ActuarialEvaluationOptions
): Promise<PolicyEvaluationResult> {
  const now = new Date()
  const evalStart = performance.now()

  // ── Layer A: Semantic Exclusion Analysis ─────────────────────────────
  const layerAStart = performance.now()
  let semanticExclusions: SemanticExclusionImpact[]
  if (options?.skipSemanticAnalysis && policy.semanticExclusions) {
    semanticExclusions = policy.semanticExclusions
  } else {
    semanticExclusions = analyzeExclusions(policy.exclusionTexts)
  }
  const evidenceCoverage = generateEvidenceCoverageReport(policy, semanticExclusions)
  const reviewCheck = quickReviewCheck(policy, semanticExclusions)
  const layerA_ms = performance.now() - layerAStart

  // ── Layer B: Compliance Gate ─────────────────────────────────────────
  const layerBStart = performance.now()
  const checkDate = options?.effectiveDate ?? now
  const { compliance, productMismatches } = executeComplianceGate(policy, checkDate)
  const layerB_ms = performance.now() - layerBStart

  if (!compliance.eligible) {
    const total_ms = performance.now() - evalStart
    return buildBlockedResult({
      policy,
      compliance,
      productMismatches,
      semanticExclusions,
      evidenceCoverage,
      needsReview: reviewCheck.needsReview,
      now,
      layerTimings: { layerA_ms, layerB_ms, layerC_ms: 0, total_ms },
    })
  }

  // ── Layer C: Monte Carlo EOOP (Asynchronous) ───────────────────────
  const layerCStart = performance.now()
  const mcConfig: MonteCarloConfig = {
    ...DEFAULT_MONTE_CARLO_CONFIG,
    ...options?.monteCarloConfig,
  }
  const scenarios = options?.scenarioOverrides ?? getScenariosForPolicyType(policy.policyType)

  const eoopResult = await runMonteCarloInWorker(policy, scenarios, mcConfig, semanticExclusions)
  const layerC_ms = performance.now() - layerCStart

  // ── Layer D & Post-Processing ──────────────────────────────────────
  // (Same as synchronous version but leveraging eoopResult)
  const contractQualityIsEstimated = !policy.indemnityMechanics
  const contractQualityScore = policy.indemnityMechanics
    ? computeContractQualityScore(
        policy.indemnityMechanics.partsStandard.value,
        policy.indemnityMechanics.repairNetworkRule.value,
        policy.indemnityMechanics.rayicMethod.value,
        policy.indemnityMechanics.rayicMethodIsConcrete.value
      )
    : 50

  const scenarioScores: Record<string, number> = {}
  for (const sr of eoopResult.scenarioBreakdown) {
    if (sr.excludedBySemantic) {
      scenarioScores[sr.scenarioCode] = 0
    } else if (sr.occurrenceCount === 0) {
      scenarioScores[sr.scenarioCode] = 100
    } else {
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

  const total_ms = performance.now() - evalStart

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
    contractQualityIsEstimated,
    layerTimings: { layerA_ms, layerB_ms, layerC_ms, total_ms },
    configSnapshot: {
      ruleset: compliance.rulesetVersion,
      monteCarlo: `mc-worker-${mcConfig.numSimulations}-seed${mcConfig.seed ?? 'random'}`,
    },
    needsReview: reviewCheck.needsReview,
    evaluatedAt: now.toISOString(),
  }
}

/**
 * Internal helper to run simulations in a background thread.
 */
function runMonteCarloInWorker(
  policy: ActuarialPolicyInput,
  scenarios: import('./types').RiskScenario[],
  config: import('./types').MonteCarloConfig,
  semanticExclusions: import('./types').SemanticExclusionImpact[]
): Promise<import('./types').EOOPResult> {
  return new Promise((resolve, reject) => {
    // In a browser/Vite environment, we instantiate the worker.
    // In Node.js testing environments, we fall back to synchronous to avoid worker complexity.
    if (typeof Worker === 'undefined') {
      try {
        const result = calculateEOOP(policy, scenarios, config, semanticExclusions)
        return resolve(result)
      } catch (err) {
        return reject(err)
      }
    }

    const worker = new Worker(new URL('./actuarial.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (e: MessageEvent<import('./actuarial.worker').ActuarialWorkerResponse>) => {
      if (e.data.error) {
        reject(new Error(e.data.error))
      } else {
        resolve(e.data.result)
      }
      worker.terminate()
    }

    worker.onerror = (err) => {
      reject(err)
      worker.terminate()
    }

    worker.postMessage({
      policy,
      scenarios,
      config,
      semanticExclusions,
    })
  })
}
