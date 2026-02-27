/**
 * TOPSIS Sensitivity Analysis & XAI (Explainable AI) Summaries
 *
 * Provides two capabilities:
 * 1. Weight sensitivity analysis — perturbs each criterion weight
 *    to determine how stable the ranking is. Reports "flip points"
 *    where the winner changes.
 *
 * 2. XAI natural language summaries — generates human-readable
 *    explanations of why a policy ranked where it did, in both
 *    English and Turkish.
 */

import type {
  SensitivityFlipPoint,
  SensitivityResult,
  TOPSISCriterion,
  TOPSISResult,
} from '../types'
import { type TOPSISPolicyInput, rankPolicies } from './topsis'

// ─────────────────────────────────────────────────────────────────────────────
// SENSITIVITY ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes ranking sensitivity to weight changes.
 *
 * For each criterion, perturbs the weight across a range of steps
 * (default ±50% in 10% increments) and checks if the winner changes.
 *
 * @param policies - Policy inputs for TOPSIS
 * @param baseCriteria - Base criteria with weights
 * @param perturbationSteps - Number of steps in each direction (default 5 = ±50% in 10% increments)
 * @returns SensitivityResult with flip points and stability score
 */
export function analyzeSensitivity(
  policies: TOPSISPolicyInput[],
  baseCriteria: TOPSISCriterion[],
  perturbationSteps: number = 5
): SensitivityResult {
  if (policies.length <= 1) {
    return {
      baseRanking: rankPolicies(policies, baseCriteria),
      flipPoints: [],
      stabilityScore: 1.0,
    }
  }

  const baseRanking = rankPolicies(policies, baseCriteria)
  const baseWinner = baseRanking[0].policyId
  const flipPoints: SensitivityFlipPoint[] = []

  let totalPerturbations = 0
  let stableCount = 0

  for (const criterion of baseCriteria) {
    const originalWeight = criterion.weight
    const stepSize = originalWeight / perturbationSteps

    // Perturb in both directions
    for (let step = -perturbationSteps; step <= perturbationSteps; step++) {
      if (step === 0) continue // Skip base case

      const perturbedWeight = originalWeight + step * stepSize
      if (perturbedWeight <= 0 || perturbedWeight >= 1) continue

      // Redistribute the weight change proportionally across other criteria
      const weightDelta = perturbedWeight - originalWeight
      const otherWeightTotal = baseCriteria
        .filter((c) => c.code !== criterion.code)
        .reduce((sum, c) => sum + c.weight, 0)

      if (otherWeightTotal === 0) continue

      const perturbedCriteria = baseCriteria.map((c) => {
        if (c.code === criterion.code) {
          return { ...c, weight: perturbedWeight }
        }
        // Proportionally adjust other weights to maintain sum = 1.0
        const adjustmentRatio = (c.weight / otherWeightTotal) * -weightDelta
        return { ...c, weight: c.weight + adjustmentRatio }
      })

      try {
        const perturbedRanking = rankPolicies(policies, perturbedCriteria)
        const perturbedWinner = perturbedRanking[0].policyId

        totalPerturbations++

        if (perturbedWinner === baseWinner) {
          stableCount++
        } else {
          flipPoints.push({
            criterionCode: criterion.code,
            originalWeight,
            flippedWeight: perturbedWeight,
            oldWinner: baseWinner,
            newWinner: perturbedWinner,
          })
        }
      } catch {
        // Skip invalid weight combinations
      }
    }
  }

  const stabilityScore = totalPerturbations > 0 ? stableCount / totalPerturbations : 1.0

  return {
    baseRanking,
    flipPoints,
    stabilityScore: Math.round(stabilityScore * 1000) / 1000,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// XAI SUMMARY GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a natural language explanation of a TOPSIS ranking result.
 *
 * @param result - TOPSIS result for a single policy
 * @param allResults - All TOPSIS results for comparison context
 * @param criteria - The criteria used for ranking
 * @param locale - 'en' or 'tr'
 * @returns Human-readable explanation string
 */
export function generateXAISummary(
  result: TOPSISResult,
  allResults: TOPSISResult[],
  criteria: TOPSISCriterion[],
  locale: 'en' | 'tr' = 'en'
): string {
  const totalPolicies = allResults.length
  const rank = result.rank
  const closeness = result.closeness

  // Find top strengths and weaknesses
  const strengths: string[] = []
  const weaknesses: string[] = []

  for (const criterion of criteria) {
    const score = result.weightedScores[criterion.code] ?? 0
    const allScores = allResults.map((r) => r.weightedScores[criterion.code] ?? 0)
    const maxScore = Math.max(...allScores)
    const minScore = Math.min(...allScores)
    const range = maxScore - minScore

    if (range === 0) continue

    const relativePosition = (score - minScore) / range

    const isBest =
      criterion.direction === 'benefit' ? relativePosition > 0.8 : relativePosition < 0.2
    const isWorst =
      criterion.direction === 'benefit' ? relativePosition < 0.2 : relativePosition > 0.8

    if (isBest) strengths.push(criterion.code)
    if (isWorst) weaknesses.push(criterion.code)
  }

  if (locale === 'tr') {
    return generateTurkishSummary(rank, totalPolicies, closeness, strengths, weaknesses, criteria)
  }

  return generateEnglishSummary(rank, totalPolicies, closeness, strengths, weaknesses, criteria)
}

function getCriterionLabel(code: string, criteria: TOPSISCriterion[], locale: 'en' | 'tr'): string {
  const c = criteria.find((cr) => cr.code === code)
  return locale === 'tr' ? (c?.labelTr ?? code) : (c?.label ?? code)
}

function generateEnglishSummary(
  rank: number,
  totalPolicies: number,
  closeness: number,
  strengths: string[],
  weaknesses: string[],
  criteria: TOPSISCriterion[]
): string {
  const parts: string[] = []

  // Rank statement
  if (rank === 1) {
    parts.push(
      `This policy ranks #1 out of ${totalPolicies} with a TOPSIS closeness score of ${closeness.toFixed(3)}.`
    )
  } else {
    parts.push(
      `This policy ranks #${rank} out of ${totalPolicies} (closeness: ${closeness.toFixed(3)}).`
    )
  }

  // Strengths
  if (strengths.length > 0) {
    const labels = strengths.map((s) => getCriterionLabel(s, criteria, 'en'))
    parts.push(`Key strengths: ${labels.join(', ')}.`)
  }

  // Weaknesses
  if (weaknesses.length > 0) {
    const labels = weaknesses.map((w) => getCriterionLabel(w, criteria, 'en'))
    parts.push(`Areas for improvement: ${labels.join(', ')}.`)
  }

  // Performance tier
  if (closeness >= 0.8) {
    parts.push('Overall: Excellent policy positioning.')
  } else if (closeness >= 0.6) {
    parts.push('Overall: Good policy with some room for improvement.')
  } else if (closeness >= 0.4) {
    parts.push('Overall: Average positioning — consider alternatives.')
  } else {
    parts.push('Overall: Below average — significant gaps compared to alternatives.')
  }

  return parts.join(' ')
}

function generateTurkishSummary(
  rank: number,
  totalPolicies: number,
  closeness: number,
  strengths: string[],
  weaknesses: string[],
  criteria: TOPSISCriterion[]
): string {
  const parts: string[] = []

  // Sıralama
  if (rank === 1) {
    parts.push(
      `Bu poliçe ${totalPolicies} poliçe arasında ${closeness.toFixed(3)} TOPSIS yakınlık skoru ile 1. sırada.`
    )
  } else {
    parts.push(
      `Bu poliçe ${totalPolicies} poliçe arasında ${rank}. sırada (yakınlık: ${closeness.toFixed(3)}).`
    )
  }

  // Güçlü yönler
  if (strengths.length > 0) {
    const labels = strengths.map((s) => getCriterionLabel(s, criteria, 'tr'))
    parts.push(`Güçlü yönler: ${labels.join(', ')}.`)
  }

  // Zayıf yönler
  if (weaknesses.length > 0) {
    const labels = weaknesses.map((w) => getCriterionLabel(w, criteria, 'tr'))
    parts.push(`Geliştirilmesi gereken alanlar: ${labels.join(', ')}.`)
  }

  // Performans seviyesi
  if (closeness >= 0.8) {
    parts.push('Genel değerlendirme: Mükemmel poliçe konumlandırması.')
  } else if (closeness >= 0.6) {
    parts.push('Genel değerlendirme: İyi poliçe, iyileştirme alanları mevcut.')
  } else if (closeness >= 0.4) {
    parts.push('Genel değerlendirme: Ortalama konumlandırma — alternatifleri değerlendirin.')
  } else {
    parts.push(
      'Genel değerlendirme: Ortalamanın altında — alternatiflere kıyasla önemli eksiklikler mevcut.'
    )
  }

  return parts.join(' ')
}

/**
 * Generates a sensitivity summary explaining ranking stability.
 */
export function generateSensitivitySummary(
  sensitivityResult: SensitivityResult,
  locale: 'en' | 'tr' = 'en'
): string {
  const { stabilityScore, flipPoints } = sensitivityResult

  if (locale === 'tr') {
    if (stabilityScore >= 0.9) {
      return `Sıralama yüksek oranda kararlı (kararlılık: ${(stabilityScore * 100).toFixed(0)}%). Ağırlık değişikliklerinden etkilenmiyor.`
    }
    if (stabilityScore >= 0.7) {
      return `Sıralama büyük ölçüde kararlı (kararlılık: ${(stabilityScore * 100).toFixed(0)}%). ${flipPoints.length} ağırlık değişikliğinde kazanan değişiyor.`
    }
    return `Sıralama hassas (kararlılık: ${(stabilityScore * 100).toFixed(0)}%). ${flipPoints.length} ağırlık değişikliğinde kazanan değişiyor — sonuçları dikkatli değerlendirin.`
  }

  if (stabilityScore >= 0.9) {
    return `Ranking is highly stable (stability: ${(stabilityScore * 100).toFixed(0)}%). Not affected by weight changes.`
  }
  if (stabilityScore >= 0.7) {
    return `Ranking is mostly stable (stability: ${(stabilityScore * 100).toFixed(0)}%). ${flipPoints.length} weight change(s) flip the winner.`
  }
  return `Ranking is sensitive to weights (stability: ${(stabilityScore * 100).toFixed(0)}%). ${flipPoints.length} weight change(s) flip the winner — interpret results carefully.`
}
