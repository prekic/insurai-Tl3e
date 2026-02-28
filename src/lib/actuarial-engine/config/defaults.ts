/**
 * Default Configuration for the Actuarial Engine
 *
 * All values are Turkish market defaults calibrated from
 * SEDDK/TSB statistics and industry experience. Every value
 * is intended to be configurable via admin settings.
 *
 * Categories:
 * - Monte Carlo simulation parameters
 * - TOPSIS default weights
 * - Contract quality scoring parameters
 * - Coverage breadth scoring
 */

import type { MonteCarloConfig, TOPSISCriterion } from '../types'
import { DEFAULT_TOPSIS_CRITERIA } from '../layer-d/topsis'

// ─────────────────────────────────────────────────────────────────────────────
// MONTE CARLO DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_MONTE_CARLO_CONFIG: MonteCarloConfig = {
  numSimulations: 10_000,
  confidenceInterval: 0.9,
  seed: undefined, // Random seed unless specified
}

/**
 * Monte Carlo config for golden regression tests (deterministic).
 */
export const TEST_MONTE_CARLO_CONFIG: MonteCarloConfig = {
  numSimulations: 10_000,
  confidenceInterval: 0.9,
  seed: 42,
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPSIS DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

/** Re-export for convenience. */
export const DEFAULT_TOPSIS_WEIGHTS: TOPSISCriterion[] = DEFAULT_TOPSIS_CRITERIA

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT QUALITY SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contract quality score weights.
 * These are used to compute a 0-100 contract quality score
 * from indemnity mechanics for the TOPSIS contract_quality criterion.
 */
export const CONTRACT_QUALITY_WEIGHTS = {
  /** Weight for parts standard (original vs equivalent vs unspecified). */
  partsStandard: 0.35,
  /** Weight for repair network rule (choice vs insurer vs unspecified). */
  repairNetwork: 0.3,
  /** Weight for rayiç method clarity. */
  rayicMethod: 0.35,
} as const

/**
 * Scoring map for contract quality sub-components.
 * Each value is a score from 0 to 100.
 */
export const CONTRACT_QUALITY_SCORES = {
  partsStandard: {
    original: 100,
    equivalent: 60,
    unspecified: 30,
  },
  repairNetwork: {
    insured_choice: 100,
    insurer_network: 50,
    unspecified: 20,
  },
  rayicMethod: {
    tsb_list: 100,
    expert_report: 70,
    unknown: 20,
    unspecified: 10,
  },
} as const

/**
 * Computes a 0–100 contract quality score from indemnity mechanics.
 */
export function computeContractQualityScore(
  partsStandard: string,
  repairNetwork: string,
  rayicMethod: string,
  rayicIsConcrete: boolean
): number {
  const partsScore =
    CONTRACT_QUALITY_SCORES.partsStandard[
      partsStandard as keyof typeof CONTRACT_QUALITY_SCORES.partsStandard
    ] ?? 30

  const networkScore =
    CONTRACT_QUALITY_SCORES.repairNetwork[
      repairNetwork as keyof typeof CONTRACT_QUALITY_SCORES.repairNetwork
    ] ?? 20

  let rayicScore: number =
    CONTRACT_QUALITY_SCORES.rayicMethod[
      rayicMethod as keyof typeof CONTRACT_QUALITY_SCORES.rayicMethod
    ] ?? 10

  // Bonus for concrete rayiç method
  if (rayicIsConcrete && rayicScore < 100) {
    rayicScore = Math.min(100, rayicScore + 20)
  }

  return Math.round(
    partsScore * CONTRACT_QUALITY_WEIGHTS.partsStandard +
      networkScore * CONTRACT_QUALITY_WEIGHTS.repairNetwork +
      rayicScore * CONTRACT_QUALITY_WEIGHTS.rayicMethod
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE BREADTH SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard coverage codes expected in a comprehensive kasko policy.
 * Each code has a weight reflecting its importance.
 */
export const KASKO_COVERAGE_WEIGHTS: Record<string, number> = {
  COLLISION: 0.2,
  THEFT: 0.15,
  FIRE: 0.1,
  NATURAL_DISASTER: 0.1,
  FLOOD: 0.1,
  EARTHQUAKE: 0.1,
  GLASS: 0.05,
  PERSONAL_ACCIDENT: 0.05,
  THIRD_PARTY_LIABILITY: 0.1,
  LEGAL_PROTECTION: 0.05,
}

/**
 * Computes a coverage breadth score (0–100) based on which
 * coverages are included in the policy.
 *
 * @param includedCodes - Set of included coverage codes
 * @param referenceWeights - Expected coverage weights (defaults to kasko)
 * @returns Score from 0 to 100
 */
export function computeCoverageBreadthScore(
  includedCodes: Set<string>,
  referenceWeights?: Record<string, number>
): number {
  const weights = referenceWeights ?? KASKO_COVERAGE_WEIGHTS

  let totalWeight = 0
  let coveredWeight = 0

  for (const [code, weight] of Object.entries(weights)) {
    totalWeight += weight
    if (includedCodes.has(code)) {
      coveredWeight += weight
    }
  }

  if (totalWeight === 0) return 100
  return Math.round((coveredWeight / totalWeight) * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUCTIBLE EXPOSURE SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a deductible exposure score — higher means more
 * out-of-pocket risk from deductibles.
 *
 * The score is the weighted average of deductible-to-limit ratios
 * across all coverages.
 */
export function computeDeductibleExposure(
  coverages: Array<{
    code: string
    deductibleAmount: number
    limitAmount: number
    included: boolean
  }>
): number {
  let totalWeight = 0
  let weightedExposure = 0

  for (const cov of coverages) {
    if (!cov.included || cov.limitAmount <= 0) continue

    const weight = KASKO_COVERAGE_WEIGHTS[cov.code] ?? 0.05
    const ratio = cov.deductibleAmount / cov.limitAmount
    totalWeight += weight
    weightedExposure += ratio * weight
  }

  if (totalWeight === 0) return 0

  // Normalize to 0–100 scale (higher = worse)
  return Math.round((weightedExposure / totalWeight) * 100 * 10) / 10
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE SCORING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts compliance gate results to a 0–100 score.
 * Fully compliant = 100, each warning deducts points.
 */
export function computeComplianceScore(
  eligible: boolean,
  warningCount: number,
  blockingCount: number
): number {
  if (!eligible || blockingCount > 0) return 0

  // Each warning deducts points (diminishing returns)
  let score = 100
  for (let i = 0; i < warningCount; i++) {
    score -= Math.max(5, 15 - i * 2) // First warnings hurt more
  }

  return Math.max(0, Math.round(score))
}
