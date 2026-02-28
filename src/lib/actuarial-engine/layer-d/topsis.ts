/**
 * TOPSIS (Technique for Order of Preference by Similarity to Ideal Solution)
 *
 * Implements the MCDA (Multi-Criteria Decision Analysis) ranking algorithm.
 *
 * Algorithm steps:
 * 1. Build decision matrix (policies × criteria)
 * 2. Normalize: rᵢⱼ = xᵢⱼ / √(Σxᵢⱼ²)
 * 3. Weight: vᵢⱼ = wⱼ × rᵢⱼ
 * 4. Identify ideal (A⁺) and negative-ideal (A⁻) solutions
 * 5. Calculate Euclidean distances D⁺ᵢ and D⁻ᵢ
 * 6. Compute relative closeness: Cᵢ = D⁻ᵢ / (D⁺ᵢ + D⁻ᵢ)
 * 7. Rank by Cᵢ (higher = better)
 */

import type { TOPSISCriterion, TOPSISResult } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CRITERIA
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_TOPSIS_CRITERIA: TOPSISCriterion[] = [
  {
    code: 'eoop',
    label: 'Expected Out-of-Pocket',
    labelTr: 'Beklenen Cepten Harcama',
    weight: 0.3,
    direction: 'cost',
  },
  {
    code: 'premium',
    label: 'Annual Premium',
    labelTr: 'Yıllık Prim',
    weight: 0.2,
    direction: 'cost',
  },
  {
    code: 'coverage_breadth',
    label: 'Coverage Breadth',
    labelTr: 'Teminat Genişliği',
    weight: 0.2,
    direction: 'benefit',
  },
  {
    code: 'compliance_score',
    label: 'Compliance Score',
    labelTr: 'Uyum Skoru',
    weight: 0.1,
    direction: 'benefit',
  },
  {
    code: 'contract_quality',
    label: 'Contract Quality',
    labelTr: 'Sözleşme Kalitesi',
    weight: 0.1,
    direction: 'benefit',
  },
  {
    code: 'deductible_exposure',
    label: 'Deductible Exposure',
    labelTr: 'Muafiyet Maruziyeti',
    weight: 0.1,
    direction: 'cost',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// TOPSIS INPUT
// ─────────────────────────────────────────────────────────────────────────────

/** Raw decision matrix entry for a single policy. */
export interface TOPSISPolicyInput {
  policyId: string
  /** Values for each criterion, keyed by criterion code. */
  values: Record<string, number>
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPSIS IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ranks policies using the TOPSIS algorithm.
 *
 * @param policies - Array of policy inputs with criterion values
 * @param criteria - TOPSIS criteria with weights and directions
 * @returns Array of TOPSISResult sorted by rank (1 = best)
 */
export function rankPolicies(
  policies: TOPSISPolicyInput[],
  criteria?: TOPSISCriterion[]
): TOPSISResult[] {
  const activeCriteria = criteria ?? DEFAULT_TOPSIS_CRITERIA

  if (policies.length === 0) return []

  // Single policy — rank is always 1
  if (policies.length === 1) {
    return [
      {
        policyId: policies[0].policyId,
        closeness: 1.0,
        rank: 1,
        distanceToIdeal: 0,
        distanceToNegativeIdeal: 0,
        normalizedScores: {},
        weightedScores: {},
      },
    ]
  }

  // Validate weights sum to ~1.0
  const weightSum = activeCriteria.reduce((sum, c) => sum + c.weight, 0)
  if (Math.abs(weightSum - 1.0) > 0.01) {
    throw new Error(`TOPSIS weights must sum to 1.0 (got ${weightSum.toFixed(4)})`)
  }

  const n = policies.length
  const m = activeCriteria.length

  // ── Step 1: Build decision matrix ─────────────────────────────────────
  // matrix[i][j] = value of policy i on criterion j
  const matrix: number[][] = new Array(n)
  for (let i = 0; i < n; i++) {
    matrix[i] = new Array(m)
    for (let j = 0; j < m; j++) {
      matrix[i][j] = policies[i].values[activeCriteria[j].code] ?? 0
    }
  }

  // ── Step 2: Normalize matrix ──────────────────────────────────────────
  // rᵢⱼ = xᵢⱼ / √(Σ xₖⱼ² for k=1..n)
  const normalized: number[][] = new Array(n)
  for (let i = 0; i < n; i++) {
    normalized[i] = new Array(m)
  }

  for (let j = 0; j < m; j++) {
    let sumOfSquares = 0
    for (let i = 0; i < n; i++) {
      sumOfSquares += matrix[i][j] * matrix[i][j]
    }
    const norm = Math.sqrt(sumOfSquares)

    for (let i = 0; i < n; i++) {
      normalized[i][j] = norm > 0 ? matrix[i][j] / norm : 0
    }
  }

  // ── Step 3: Apply weights ─────────────────────────────────────────────
  // vᵢⱼ = wⱼ × rᵢⱼ
  const weighted: number[][] = new Array(n)
  for (let i = 0; i < n; i++) {
    weighted[i] = new Array(m)
    for (let j = 0; j < m; j++) {
      weighted[i][j] = activeCriteria[j].weight * normalized[i][j]
    }
  }

  // ── Step 4: Determine ideal and negative-ideal solutions ──────────────
  // A⁺ⱼ = max(vᵢⱼ) for benefit criteria, min(vᵢⱼ) for cost criteria
  // A⁻ⱼ = min(vᵢⱼ) for benefit criteria, max(vᵢⱼ) for cost criteria
  const idealPositive: number[] = new Array(m)
  const idealNegative: number[] = new Array(m)

  for (let j = 0; j < m; j++) {
    const columnValues = weighted.map((row) => row[j])
    const maxVal = Math.max(...columnValues)
    const minVal = Math.min(...columnValues)

    if (activeCriteria[j].direction === 'benefit') {
      idealPositive[j] = maxVal
      idealNegative[j] = minVal
    } else {
      idealPositive[j] = minVal // Lower is better for cost criteria
      idealNegative[j] = maxVal
    }
  }

  // ── Step 5: Calculate Euclidean distances ─────────────────────────────
  // D⁺ᵢ = √(Σ(vᵢⱼ - A⁺ⱼ)²)
  // D⁻ᵢ = √(Σ(vᵢⱼ - A⁻ⱼ)²)
  const distPositive: number[] = new Array(n)
  const distNegative: number[] = new Array(n)

  for (let i = 0; i < n; i++) {
    let sumPosSquared = 0
    let sumNegSquared = 0

    for (let j = 0; j < m; j++) {
      sumPosSquared += (weighted[i][j] - idealPositive[j]) ** 2
      sumNegSquared += (weighted[i][j] - idealNegative[j]) ** 2
    }

    distPositive[i] = Math.sqrt(sumPosSquared)
    distNegative[i] = Math.sqrt(sumNegSquared)
  }

  // ── Step 6: Relative closeness ────────────────────────────────────────
  // Cᵢ = D⁻ᵢ / (D⁺ᵢ + D⁻ᵢ)
  const results: TOPSISResult[] = policies.map((policy, i) => {
    const dPlus = distPositive[i]
    const dMinus = distNegative[i]
    const total = dPlus + dMinus
    const closeness = total > 0 ? dMinus / total : 0.5

    // Build normalized and weighted score maps
    const normalizedScores: Record<string, number> = {}
    const weightedScores: Record<string, number> = {}
    for (let j = 0; j < m; j++) {
      const code = activeCriteria[j].code
      normalizedScores[code] = Math.round(normalized[i][j] * 10000) / 10000
      weightedScores[code] = Math.round(weighted[i][j] * 10000) / 10000
    }

    return {
      policyId: policy.policyId,
      closeness: Math.round(closeness * 10000) / 10000,
      rank: 0, // Filled in Step 7
      distanceToIdeal: Math.round(dPlus * 10000) / 10000,
      distanceToNegativeIdeal: Math.round(dMinus * 10000) / 10000,
      normalizedScores,
      weightedScores,
    }
  })

  // ── Step 7: Rank by closeness (descending) ────────────────────────────
  results.sort((a, b) => b.closeness - a.closeness)
  results.forEach((r, idx) => {
    r.rank = idx + 1
  })

  return results
}

/**
 * Validates that criteria weights are valid for TOPSIS.
 * Returns an error message if invalid, undefined if valid.
 */
export function validateCriteria(criteria: TOPSISCriterion[]): string | undefined {
  if (criteria.length === 0) return 'At least one criterion is required'

  const weightSum = criteria.reduce((sum, c) => sum + c.weight, 0)
  if (Math.abs(weightSum - 1.0) > 0.01) {
    return `Weights must sum to 1.0 (got ${weightSum.toFixed(4)})`
  }

  for (const c of criteria) {
    if (c.weight < 0 || c.weight > 1) {
      return `Weight for ${c.code} must be between 0 and 1 (got ${c.weight})`
    }
  }

  return undefined
}
