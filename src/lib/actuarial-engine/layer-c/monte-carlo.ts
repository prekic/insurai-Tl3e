/**
 * Monte Carlo EOOP (Expected Out-of-Pocket) Engine
 *
 * Implements the actuarial valuation formula:
 *   EOOP = P + Σ(ρⱼ × Eⱼ(Lⱼ, Dⱼ, Cⱼ))
 *
 * Where:
 *   P    = annual premium
 *   ρⱼ   = annual frequency of scenario j
 *   Eⱼ   = expected out-of-pocket for scenario j
 *   Lⱼ   = loss severity (sampled from distribution)
 *   Dⱼ   = deductible for applicable coverage
 *   Cⱼ   = coverage limit for applicable coverage
 *
 * The engine runs N simulations (default 10,000), each representing
 * one possible year of policy ownership. For each simulation:
 * 1. Determine which scenarios occur (Bernoulli with frequency ρⱼ)
 * 2. Sample loss amounts from the scenario's distribution
 * 3. Apply deductible and coverage limits
 * 4. Account for semantic exclusions (policyholder pays full loss)
 * 5. Accumulate total out-of-pocket costs
 *
 * After all simulations, compute mean, percentiles, and per-scenario breakdowns.
 */

import type {
  ActuarialPolicyInput,
  CanonicalCoverage,
  CoverageLimitSpec,
  DeductibleSpec,
  EOOPResult,
  IndemnityMechanics,
  Money,
  MonteCarloConfig,
  RiskScenario,
  ScenarioResult,
  SemanticExclusionImpact,
} from '../types'
import { createSeededRNG, bernoulli } from './rng'
import { sampleLoss } from './loss-model'

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MC_CONFIG: MonteCarloConfig = {
  numSimulations: 10_000,
  confidenceInterval: 0.9,
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT QUALITY SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a contract quality factor (0.0–1.0) based on indemnity mechanics.
 *
 * A factor of 1.0 means no penalty — the contract is clear and favourable.
 * Lower values represent worse contract quality, which multiplies out-of-pocket costs.
 *
 * Key penalties:
 * - Equivalent parts (vs OEM): policyholder absorbs quality difference
 * - Insurer-controlled repair network: may use cheaper repairs
 * - Unspecified rayiç method: ambiguity in claim settlement
 */
export function computeContractQualityFactor(mechanics: IndemnityMechanics | undefined): number {
  if (!mechanics) return 0.85 // Unknown = moderate penalty

  let factor = 1.0

  // Parts standard penalty
  switch (mechanics.partsStandard.value) {
    case 'original':
      break // No penalty — OEM parts
    case 'equivalent':
      factor *= 0.9 // 10% penalty — equivalent parts reduce claim value
      break
    case 'unspecified':
      factor *= 0.85 // 15% penalty — ambiguity favours insurer
      break
  }

  // Repair network penalty
  switch (mechanics.repairNetworkRule.value) {
    case 'insured_choice':
      break // No penalty — insured picks the shop
    case 'insurer_network':
      factor *= 0.93 // 7% penalty — insurer may use cheaper network
      break
    case 'unspecified':
      factor *= 0.9 // 10% penalty
      break
  }

  // Rayiç method penalty
  if (!mechanics.rayicMethodIsConcrete.value) {
    factor *= 0.8 // 20% penalty — vague rayiç method = heavy ambiguity
  } else {
    switch (mechanics.rayicMethod.value) {
      case 'tsb_list':
        break // No penalty — standardised TSB reference
      case 'expert_report':
        factor *= 0.95 // 5% — subject to interpretation
        break
      case 'unknown':
      case 'unspecified':
        factor *= 0.8 // 20% penalty — heavy ambiguity
        break
    }
  }

  return factor
}

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the best matching coverage for a scenario from the policy's coverages.
 * A scenario lists affected coverage codes — we look for any match that is included.
 */
function findMatchingCoverage(
  scenario: RiskScenario,
  coverages: CanonicalCoverage[]
): CanonicalCoverage | undefined {
  for (const covCode of scenario.affectedCoverages) {
    const match = coverages.find((c) => c.code === covCode && c.included)
    if (match) return match
  }
  return undefined
}

/**
 * Resolves the deductible amount from a DeductibleSpec.
 * If the deductible is percentage-based, applies it to the loss amount.
 */
function resolveDeductible(spec: DeductibleSpec | undefined, lossAmount: number): number {
  if (!spec) return 0

  if ('kind' in spec) {
    if (spec.kind === 'none') return 0
    if (spec.kind === 'pct') return lossAmount * (spec.percent / 100)
  }

  // Absolute Money deductible
  return (spec as Money).amount
}

/**
 * Resolves the coverage limit amount from a CoverageLimitSpec.
 */
function resolveCoverageLimit(spec: CoverageLimitSpec | undefined): number {
  if (!spec) return Infinity

  if ('kind' in spec && spec.kind === 'unlimited') return Infinity

  return (spec as Money).amount
}

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC EXCLUSION MATCHING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a scenario is negated by any semantic exclusion.
 * Returns the exclusion text if found, undefined otherwise.
 */
function findExcludingClause(
  scenarioCode: string,
  exclusions: SemanticExclusionImpact[]
): string | undefined {
  for (const excl of exclusions) {
    if (
      excl.affectedScenarios.includes(scenarioCode) &&
      (excl.severity === 'blocking' || excl.severity === 'critical')
    ) {
      return excl.exclusionText
    }
  }
  return undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// PERCENTILE CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a specific percentile from a sorted array.
 * Uses linear interpolation between adjacent elements.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0

  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)

  if (lower === upper) return sorted[lower]

  const fraction = idx - lower
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MONTE CARLO ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the Expected Out-of-Pocket (EOOP) cost using Monte Carlo simulation.
 *
 * @param policy - The actuarial policy input
 * @param scenarios - Applicable risk scenarios
 * @param config - Monte Carlo configuration (optional)
 * @param semanticExclusions - Semantic exclusion analysis results (optional)
 * @returns EOOPResult with expected costs, percentiles, and scenario breakdowns
 */
export function calculateEOOP(
  policy: ActuarialPolicyInput,
  scenarios: RiskScenario[],
  config?: Partial<MonteCarloConfig>,
  semanticExclusions?: SemanticExclusionImpact[]
): EOOPResult {
  const mcConfig: MonteCarloConfig = {
    ...DEFAULT_MC_CONFIG,
    ...config,
  }

  const rng = createSeededRNG(mcConfig.seed ?? Date.now())
  const numSims = mcConfig.numSimulations
  const exclusions = semanticExclusions ?? policy.semanticExclusions ?? []

  // Compute contract quality factor
  const contractQualityFactor = computeContractQualityFactor(policy.indemnityMechanics)

  // Pre-compute coverage matches and exclusion status for each scenario
  const scenarioMeta = scenarios.map((scenario) => ({
    scenario,
    coverage: findMatchingCoverage(scenario, policy.coverages),
    excludingClause: findExcludingClause(scenario.code, exclusions),
  }))

  // Track per-scenario totals for breakdown
  const scenarioTotals = new Map<string, { totalOOP: number; occurrences: number }>()
  for (const { scenario } of scenarioMeta) {
    scenarioTotals.set(scenario.code, { totalOOP: 0, occurrences: 0 })
  }

  // Simulation results — total annual out-of-pocket for each simulation
  const simResults: number[] = new Array(numSims)

  // ── Run simulations ─────────────────────────────────────────────────────
  for (let sim = 0; sim < numSims; sim++) {
    let annualOOP = 0

    for (const { scenario, coverage, excludingClause } of scenarioMeta) {
      // Step 1: Does this event occur this year? (Bernoulli trial)
      if (!bernoulli(rng, scenario.frequency)) continue

      // Step 2: Sample loss severity from distribution
      const rawLoss = sampleLoss(rng, scenario.lossDistribution)

      let outOfPocket: number

      // Step 3: Check if excluded by semantic analysis
      if (excludingClause) {
        // Exclusion negates coverage — policyholder pays full loss
        outOfPocket = rawLoss
      } else if (!coverage) {
        // No matching coverage in the policy — policyholder pays full loss
        outOfPocket = rawLoss
      } else {
        // Step 4: Apply deductible
        const deductibleSpec = coverage.deductible?.value
        const deductible = resolveDeductible(deductibleSpec, rawLoss)

        // Step 5: Apply coverage limit
        const limitSpec = coverage.limit?.value
        const coverageLimit = resolveCoverageLimit(limitSpec)

        // Out-of-pocket = deductible + any excess beyond coverage limit
        // The insurer pays min(loss - deductible, coverageLimit)
        // Policyholder pays the rest
        const lossAfterDeductible = Math.max(0, rawLoss - deductible)
        const insurerPays = Math.min(lossAfterDeductible, coverageLimit)
        outOfPocket = deductible + (lossAfterDeductible - insurerPays)
      }

      // Apply contract quality factor (worse contracts → higher effective OOP)
      // A factor < 1.0 means the contract has ambiguity that may reduce actual payout
      outOfPocket = outOfPocket / contractQualityFactor

      annualOOP += outOfPocket

      // Track per-scenario
      const tracker = scenarioTotals.get(scenario.code)
      if (tracker) {
        tracker.totalOOP += outOfPocket
        tracker.occurrences += 1
      }
    }

    simResults[sim] = annualOOP
  }

  // ── Compute statistics ──────────────────────────────────────────────────

  // Add premium to each simulation result for total cost
  const premium = policy.premium.amount
  const totalCosts = simResults.map((oop) => premium + oop)

  // Sort for percentile computation
  const sortedTotalCosts = [...totalCosts].sort((a, b) => a - b)

  // Mean EOOP = premium + mean uncovered loss
  const meanOOP = simResults.reduce((sum, v) => sum + v, 0) / numSims
  const meanTotal = premium + meanOOP

  // Per-scenario breakdown
  const scenarioBreakdown: ScenarioResult[] = scenarioMeta.map(({ scenario, excludingClause }) => {
    const tracker = scenarioTotals.get(scenario.code)
    return {
      scenarioCode: scenario.code,
      expectedCost: (tracker?.totalOOP ?? 0) / numSims,
      avgOutOfPocket:
        (tracker?.occurrences ?? 0) > 0
          ? (tracker?.totalOOP ?? 0) / (tracker?.occurrences ?? 1)
          : 0,
      occurrenceCount: tracker?.occurrences ?? 0,
      excludedBySemantic: excludingClause !== undefined,
      excludingClause,
    }
  })

  return {
    expectedCost: {
      currency: policy.premium.currency,
      amount: Math.round(meanTotal * 100) / 100,
    },
    premium: { ...policy.premium },
    expectedUncoveredLoss: {
      currency: policy.premium.currency,
      amount: Math.round(meanOOP * 100) / 100,
    },
    percentiles: {
      p5: Math.round(percentile(sortedTotalCosts, 5) * 100) / 100,
      p25: Math.round(percentile(sortedTotalCosts, 25) * 100) / 100,
      p50: Math.round(percentile(sortedTotalCosts, 50) * 100) / 100,
      p75: Math.round(percentile(sortedTotalCosts, 75) * 100) / 100,
      p95: Math.round(percentile(sortedTotalCosts, 95) * 100) / 100,
    },
    scenarioBreakdown,
    config: mcConfig,
    contractQualityFactor,
  }
}
