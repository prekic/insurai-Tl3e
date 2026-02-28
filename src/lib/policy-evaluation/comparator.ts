/* eslint-disable @typescript-eslint/no-non-null-assertion -- Assertions used after sort/find operations where existence is guaranteed */
/**
 * Multi-Policy Comparator
 *
 * Compares 2-4 policies against each other, identifying
 * the best option for different criteria.
 */

import type { Policy, Coverage } from '@/types/policy'
import type {
  PolicyComparison,
  ComparisonPolicy,
  ComparisonMetric,
  CoverageComparison,
  KeyDifference,
  Tradeoff,
  EvaluationConfig,
} from './types'
import { evaluatePolicy } from './evaluator'
import { getPremiumBenchmark } from '@/data'
import { evaluateAndRankPolicies } from '../actuarial-engine/engine'
import { mapAnalyzedToActuarialInput } from '../actuarial-engine/adapter'
import type { AnalyzedPolicy } from '@/types/policy'
import type { ActuarialPolicyInput } from '../actuarial-engine/types'

// =============================================================================
// MAIN COMPARISON FUNCTION
// =============================================================================

export function comparePolicies(
  policies: Policy[],
  labels?: string[],
  config?: Partial<EvaluationConfig>
): PolicyComparison {
  // Validate input
  if (policies.length < 2) {
    throw new Error('At least 2 policies are required for comparison')
  }
  if (policies.length > 4) {
    throw new Error('Maximum 4 policies can be compared at once')
  }

  // Evaluate each policy
  const comparisonPolicies: ComparisonPolicy[] = policies.map((policy, index) => ({
    policy,
    evaluation: evaluatePolicy(policy, config),
    label: labels?.[index] || `Policy ${index + 1}`,
  }))

  // Determine winners
  const winners = determineWinners(comparisonPolicies)

  // Generate comparison metrics
  const metrics = generateMetrics(comparisonPolicies)

  // Generate coverage matrix
  const coverageMatrix = generateCoverageMatrix(comparisonPolicies)

  // Generate Actuarial Rankings (only for supported types)
  const supportedTypes = ['kasko', 'traffic', 'dask', 'zas']
  let actuarialResults: ReturnType<typeof evaluateAndRankPolicies> = []
  let actuarialInputs: ActuarialPolicyInput[] = []

  // Only evaluate via Actuarial Engine if all compared policies are supported
  const allSupported = policies.every((p) => supportedTypes.includes(p.type))
  if (allSupported) {
    actuarialInputs = policies.map((p) => mapAnalyzedToActuarialInput(p as AnalyzedPolicy))
    actuarialResults = evaluateAndRankPolicies(actuarialInputs)
  }

  // Generate rankings
  const rankings = generateRankings(comparisonPolicies, actuarialInputs, actuarialResults)

  // Generate analysis
  const analysis = generateAnalysis(comparisonPolicies, winners, coverageMatrix)

  return {
    comparedAt: new Date().toISOString(),
    policies: comparisonPolicies,
    winners,
    metrics,
    coverageMatrix,
    rankings,
    analysis,
  }
}

// =============================================================================
// DETERMINE WINNERS
// =============================================================================

function determineWinners(policies: ComparisonPolicy[]): PolicyComparison['winners'] {
  // Find best by overall score
  const overallBest = policies.reduce((best, current) =>
    current.evaluation.overallScore > best.evaluation.overallScore ? current : best
  )

  // Find best premium (lowest is better)
  const bestPremium = policies.reduce((best, current) =>
    current.policy.premium < best.policy.premium ? current : best
  )

  // Find best coverage (highest is better)
  const bestCoverage = policies.reduce((best, current) =>
    current.policy.coverage > best.policy.coverage ? current : best
  )

  // Find best value (highest value score)
  const bestValue = policies.reduce((best, current) =>
    current.evaluation.scoreBreakdown.value.score > best.evaluation.scoreBreakdown.value.score
      ? current
      : best
  )

  // Find best compliance (highest compliance score)
  const bestCompliance = policies.reduce((best, current) =>
    current.evaluation.scoreBreakdown.compliance.score >
    best.evaluation.scoreBreakdown.compliance.score
      ? current
      : best
  )

  return {
    overallBest: overallBest.policy.id,
    bestPremium: bestPremium.policy.id,
    bestCoverage: bestCoverage.policy.id,
    bestValue: bestValue.policy.id,
    bestCompliance: bestCompliance.policy.id,
  }
}

// =============================================================================
// GENERATE METRICS
// =============================================================================

function generateMetrics(policies: ComparisonPolicy[]): ComparisonMetric[] {
  const metrics: ComparisonMetric[] = []

  // Premium comparison
  const premiums = policies.map((p) => p.policy.premium)
  const minPremium = Math.min(...premiums)
  const maxPremium = Math.max(...premiums)

  metrics.push({
    name: 'Annual Premium',
    nameTR: 'Yıllık Prim',
    unit: 'TRY',
    values: policies.map((p) => ({
      policyId: p.policy.id,
      value: p.policy.premium,
      isBest: p.policy.premium === minPremium,
      isWorst: p.policy.premium === maxPremium,
      percentile: calculatePercentile(p.policy.premium, premiums, false),
    })),
    higherIsBetter: false,
  })

  // Monthly premium
  metrics.push({
    name: 'Monthly Premium',
    nameTR: 'Aylık Prim',
    unit: 'TRY',
    values: policies.map((p) => ({
      policyId: p.policy.id,
      value: p.policy.monthlyPremium,
      isBest:
        p.policy.monthlyPremium === Math.min(...policies.map((pp) => pp.policy.monthlyPremium)),
      isWorst:
        p.policy.monthlyPremium === Math.max(...policies.map((pp) => pp.policy.monthlyPremium)),
    })),
    higherIsBetter: false,
  })

  // Total coverage
  const coverages = policies.map((p) => p.policy.coverage)
  const maxCoverage = Math.max(...coverages)
  const minCoverage = Math.min(...coverages)

  metrics.push({
    name: 'Total Coverage',
    nameTR: 'Toplam Teminat',
    unit: 'TRY',
    values: policies.map((p) => ({
      policyId: p.policy.id,
      value: p.policy.coverage,
      isBest: p.policy.coverage === maxCoverage,
      isWorst: p.policy.coverage === minCoverage,
      percentile: calculatePercentile(p.policy.coverage, coverages, true),
    })),
    higherIsBetter: true,
  })

  // Deductible
  const deductibles = policies.map((p) => p.policy.deductible)
  const minDeductible = Math.min(...deductibles)
  const maxDeductible = Math.max(...deductibles)

  metrics.push({
    name: 'Deductible',
    nameTR: 'Muafiyet',
    unit: 'TRY',
    values: policies.map((p) => ({
      policyId: p.policy.id,
      value: p.policy.deductible,
      isBest: p.policy.deductible === minDeductible,
      isWorst: p.policy.deductible === maxDeductible,
    })),
    higherIsBetter: false,
  })

  // Coverage-to-Premium Ratio
  const ratios = policies.map((p) => p.policy.coverage / p.policy.premium)
  const maxRatio = Math.max(...ratios)
  const minRatio = Math.min(...ratios)

  metrics.push({
    name: 'Coverage/Premium Ratio',
    nameTR: 'Teminat/Prim Oranı',
    unit: 'x',
    values: policies.map((p, i) => ({
      policyId: p.policy.id,
      value: Number(ratios[i].toFixed(1)),
      isBest: ratios[i] === maxRatio,
      isWorst: ratios[i] === minRatio,
    })),
    higherIsBetter: true,
  })

  // Number of coverages
  const coverageCounts = policies.map((p) => p.policy.coverages.filter((c) => c.included).length)
  const maxCount = Math.max(...coverageCounts)
  const minCount = Math.min(...coverageCounts)

  metrics.push({
    name: 'Included Coverages',
    nameTR: 'Dahil Teminatlar',
    unit: '',
    values: policies.map((p, i) => ({
      policyId: p.policy.id,
      value: coverageCounts[i],
      isBest: coverageCounts[i] === maxCount,
      isWorst: coverageCounts[i] === minCount,
    })),
    higherIsBetter: true,
  })

  // Overall Score
  const scores = policies.map((p) => p.evaluation.overallScore)
  const maxScore = Math.max(...scores)
  const minScore = Math.min(...scores)

  metrics.push({
    name: 'Overall Score',
    nameTR: 'Genel Puan',
    unit: '/100',
    values: policies.map((p) => ({
      policyId: p.policy.id,
      value: p.evaluation.overallScore,
      isBest: p.evaluation.overallScore === maxScore,
      isWorst: p.evaluation.overallScore === minScore,
    })),
    higherIsBetter: true,
  })

  // Grade
  metrics.push({
    name: 'Grade',
    nameTR: 'Not',
    unit: '',
    values: policies.map((p) => ({
      policyId: p.policy.id,
      value: p.evaluation.grade,
      isBest: p.evaluation.grade === 'A',
      isWorst: p.evaluation.grade === 'F',
    })),
    higherIsBetter: true,
  })

  // Add market benchmark if available
  const firstPolicy = policies[0]
  const benchmark = getPremiumBenchmark(
    firstPolicy.policy.type === 'traffic' ? 'zmss' : firstPolicy.policy.type
  )
  if (benchmark) {
    const premiumMetric = metrics.find((m) => m.name === 'Annual Premium')
    if (premiumMetric) {
      premiumMetric.marketBenchmark = benchmark.avgPremium
    }
  }

  return metrics
}

function calculatePercentile(value: number, allValues: number[], higherIsBetter: boolean): number {
  const sorted = [...allValues].sort((a, b) => (higherIsBetter ? b - a : a - b))
  const rank = sorted.indexOf(value)
  return Math.round((1 - rank / (sorted.length - 1 || 1)) * 100)
}

// =============================================================================
// GENERATE COVERAGE MATRIX
// =============================================================================

function generateCoverageMatrix(policies: ComparisonPolicy[]): CoverageComparison[] {
  // Collect all unique coverage names across all policies
  const allCoverageNames = new Map<string, { en: string; tr: string }>()

  for (const p of policies) {
    for (const c of p.policy.coverages) {
      if (!allCoverageNames.has(c.name.toLowerCase())) {
        allCoverageNames.set(c.name.toLowerCase(), {
          en: c.name,
          tr: c.nameTr || c.name,
        })
      }
    }
  }

  const comparisons: CoverageComparison[] = []

  for (const [key, names] of allCoverageNames) {
    const coverageData = policies.map((p) => {
      const coverage = p.policy.coverages.find((c) => c.name.toLowerCase() === key)
      return {
        policyId: p.policy.id,
        included: coverage?.included ?? false,
        limit: coverage?.limit ?? 0,
        deductible: coverage?.deductible ?? 0,
        score: calculateCoverageScore(coverage),
      }
    })

    // Find best and worst
    const includedPolicies = coverageData.filter((d) => d.included)

    let bestPolicyId = ''
    let worstPolicyId = ''

    if (includedPolicies.length > 0) {
      const best = includedPolicies.reduce((a, b) => (a.score > b.score ? a : b))
      const worst = includedPolicies.reduce((a, b) => (a.score < b.score ? a : b))
      bestPolicyId = best.policyId
      worstPolicyId = worst.policyId
    }

    comparisons.push({
      coverageName: names.en,
      coverageNameTR: names.tr,
      policies: coverageData,
      bestPolicyId,
      worstPolicyId,
    })
  }

  // Sort by how many policies include the coverage (most common first)
  comparisons.sort((a, b) => {
    const aIncluded = a.policies.filter((p) => p.included).length
    const bIncluded = b.policies.filter((p) => p.included).length
    return bIncluded - aIncluded
  })

  return comparisons
}

function calculateCoverageScore(coverage: Coverage | undefined): number {
  if (!coverage || !coverage.included) return 0

  let score = 50 // Base score for being included

  // Score based on limit
  if (coverage.limit > 500000) score += 30
  else if (coverage.limit > 100000) score += 20
  else if (coverage.limit > 50000) score += 10

  // Deduct for high deductible
  if (coverage.limit > 0) {
    const deductibleRatio = coverage.deductible / coverage.limit
    if (deductibleRatio > 0.1) score -= 20
    else if (deductibleRatio > 0.05) score -= 10
    else if (deductibleRatio === 0) score += 10
  }

  return Math.max(0, Math.min(100, score))
}

// =============================================================================
// GENERATE RANKINGS
// =============================================================================

function generateRankings(
  policies: ComparisonPolicy[],
  actuarialInputs: ActuarialPolicyInput[],
  actuarialResults: ReturnType<typeof evaluateAndRankPolicies>
): PolicyComparison['rankings'] {
  // Sort by different criteria
  const byOverall = [...policies].sort(
    (a, b) => b.evaluation.overallScore - a.evaluation.overallScore
  )
  const byPremium = [...policies].sort((a, b) => a.policy.premium - b.policy.premium)
  const byCoverage = [...policies].sort((a, b) => b.policy.coverage - a.policy.coverage)
  const byValue = [...policies].sort(
    (a, b) => b.evaluation.scoreBreakdown.value.score - a.evaluation.scoreBreakdown.value.score
  )

  return policies.map((p) => {
    // Find matching actuarial result index from inputs
    const actuarialIndex = actuarialInputs.findIndex((inp) => inp.policyId === p.policy.id)
    const actuarialInfo =
      actuarialIndex >= 0 ? actuarialResults[actuarialIndex]?.ranking : undefined

    return {
      policyId: p.policy.id,
      overallRank: byOverall.findIndex((pp) => pp.policy.id === p.policy.id) + 1,
      premiumRank: byPremium.findIndex((pp) => pp.policy.id === p.policy.id) + 1,
      coverageRank: byCoverage.findIndex((pp) => pp.policy.id === p.policy.id) + 1,
      valueRank: byValue.findIndex((pp) => pp.policy.id === p.policy.id) + 1,

      // Actuarial Engine Integration
      actuarialRank: actuarialInfo?.rank,
      actuarialCloseness: actuarialInfo?.topsisCloseness,
      actuarialGrade: actuarialInfo?.grade,
    }
  })
}

// =============================================================================
// GENERATE ANALYSIS
// =============================================================================

function generateAnalysis(
  policies: ComparisonPolicy[],
  winners: PolicyComparison['winners'],
  coverageMatrix: CoverageComparison[]
): PolicyComparison['analysis'] {
  const keyDifferences = identifyKeyDifferences(policies, coverageMatrix)
  const tradeoffs = identifyTradeoffs(policies, winners)

  // Generate main recommendation
  const bestPolicy = policies.find((p) => p.policy.id === winners.overallBest)!
  const recommendation = generateMainRecommendation(bestPolicy, policies, winners)

  return {
    recommendation: recommendation.en,
    recommendationTR: recommendation.tr,
    keyDifferences,
    tradeoffs,
  }
}

function identifyKeyDifferences(
  policies: ComparisonPolicy[],
  coverageMatrix: CoverageComparison[]
): KeyDifference[] {
  const differences: KeyDifference[] = []

  // Premium difference
  const premiums = policies.map((p) => p.policy.premium)
  const premiumRange = Math.max(...premiums) - Math.min(...premiums)
  const avgPremium = premiums.reduce((a, b) => a + b, 0) / premiums.length

  if (premiumRange / avgPremium > 0.3) {
    const cheapest = policies.reduce((a, b) => (a.policy.premium < b.policy.premium ? a : b))
    differences.push({
      aspect: 'Premium',
      aspectTR: 'Prim',
      description: `Premium varies by ${Math.round((premiumRange / avgPremium) * 100)}% across policies`,
      descriptionTR: `Prim poliçeler arasında %${Math.round((premiumRange / avgPremium) * 100)} farklılık gösteriyor`,
      significance: premiumRange / avgPremium > 0.5 ? 'major' : 'moderate',
      favoredPolicy: cheapest.policy.id,
    })
  }

  // Coverage difference
  const coverages = policies.map((p) => p.policy.coverage)
  const coverageRange = Math.max(...coverages) - Math.min(...coverages)
  const avgCoverage = coverages.reduce((a, b) => a + b, 0) / coverages.length

  if (coverageRange / avgCoverage > 0.2) {
    const highest = policies.reduce((a, b) => (a.policy.coverage > b.policy.coverage ? a : b))
    differences.push({
      aspect: 'Coverage Amount',
      aspectTR: 'Teminat Tutarı',
      description: `Coverage varies by ${Math.round((coverageRange / avgCoverage) * 100)}% across policies`,
      descriptionTR: `Teminat poliçeler arasında %${Math.round((coverageRange / avgCoverage) * 100)} farklılık gösteriyor`,
      significance: coverageRange / avgCoverage > 0.4 ? 'major' : 'moderate',
      favoredPolicy: highest.policy.id,
    })
  }

  // Coverage breadth difference
  const coverageCounts = policies.map((p) => p.policy.coverages.filter((c) => c.included).length)
  const countRange = Math.max(...coverageCounts) - Math.min(...coverageCounts)

  if (countRange >= 3) {
    const mostCoverages = policies.reduce((a, b) =>
      a.policy.coverages.filter((c) => c.included).length >
      b.policy.coverages.filter((c) => c.included).length
        ? a
        : b
    )
    differences.push({
      aspect: 'Coverage Breadth',
      aspectTR: 'Teminat Kapsamı',
      description: `Number of included coverages varies by ${countRange}`,
      descriptionTR: `Dahil edilen teminat sayısı ${countRange} farklılık gösteriyor`,
      significance: countRange >= 5 ? 'major' : 'moderate',
      favoredPolicy: mostCoverages.policy.id,
    })
  }

  // Unique coverages
  const uniqueCoverages = coverageMatrix.filter((c) => {
    const includedCount = c.policies.filter((p) => p.included).length
    return includedCount === 1
  })

  if (uniqueCoverages.length > 0) {
    for (const coverage of uniqueCoverages.slice(0, 3)) {
      const policyWithCoverage = coverage.policies.find((p) => p.included)
      if (policyWithCoverage) {
        differences.push({
          aspect: 'Unique Coverage',
          aspectTR: 'Benzersiz Teminat',
          description: `Only one policy includes ${coverage.coverageName}`,
          descriptionTR: `Sadece bir poliçe ${coverage.coverageNameTR} teminatını içeriyor`,
          significance: 'minor',
          favoredPolicy: policyWithCoverage.policyId,
        })
      }
    }
  }

  return differences
}

function identifyTradeoffs(
  policies: ComparisonPolicy[],
  winners: PolicyComparison['winners']
): Tradeoff[] {
  const tradeoffs: Tradeoff[] = []

  // Check if different policies win different categories
  if (winners.bestPremium !== winners.bestCoverage) {
    const cheapest = policies.find((p) => p.policy.id === winners.bestPremium)!
    const mostCoverage = policies.find((p) => p.policy.id === winners.bestCoverage)!

    tradeoffs.push({
      option1: {
        policyId: cheapest.policy.id,
        advantage: 'Lower premium',
        advantageTR: 'Daha düşük prim',
      },
      option2: {
        policyId: mostCoverage.policy.id,
        advantage: 'Higher coverage',
        advantageTR: 'Daha yüksek teminat',
      },
      recommendation: `Choose ${cheapest.label} to save money, or ${mostCoverage.label} for better protection`,
      recommendationTR: `Para biriktirmek için ${cheapest.label}, daha iyi koruma için ${mostCoverage.label} seçin`,
    })
  }

  if (winners.bestValue !== winners.overallBest) {
    const bestValue = policies.find((p) => p.policy.id === winners.bestValue)!
    const overallBest = policies.find((p) => p.policy.id === winners.overallBest)!

    tradeoffs.push({
      option1: {
        policyId: bestValue.policy.id,
        advantage: 'Best value for money',
        advantageTR: 'En iyi fiyat/performans',
      },
      option2: {
        policyId: overallBest.policy.id,
        advantage: 'Best overall quality',
        advantageTR: 'En iyi genel kalite',
      },
      recommendation: `${bestValue.label} offers better value, while ${overallBest.label} has higher overall quality`,
      recommendationTR: `${bestValue.label} daha iyi değer sunarken, ${overallBest.label} daha yüksek genel kaliteye sahip`,
    })
  }

  return tradeoffs
}

function generateMainRecommendation(
  bestPolicy: ComparisonPolicy,
  allPolicies: ComparisonPolicy[],
  winners: PolicyComparison['winners']
): { en: string; tr: string } {
  // Check if one policy clearly dominates
  const bestWinsCategories = [
    winners.overallBest === bestPolicy.policy.id,
    winners.bestPremium === bestPolicy.policy.id,
    winners.bestCoverage === bestPolicy.policy.id,
    winners.bestValue === bestPolicy.policy.id,
    winners.bestCompliance === bestPolicy.policy.id,
  ].filter(Boolean).length

  if (bestWinsCategories >= 4) {
    return {
      en: `${bestPolicy.label} is clearly the best choice, leading in ${bestWinsCategories} out of 5 categories with an overall score of ${bestPolicy.evaluation.overallScore}/100.`,
      tr: `${bestPolicy.label} açıkça en iyi seçim, 5 kategoriden ${bestWinsCategories}'inde lider ve genel puanı ${bestPolicy.evaluation.overallScore}/100.`,
    }
  }

  if (bestWinsCategories >= 3) {
    return {
      en: `${bestPolicy.label} is recommended with a score of ${bestPolicy.evaluation.overallScore}/100, though other options may suit specific needs better.`,
      tr: `${bestPolicy.label} ${bestPolicy.evaluation.overallScore}/100 puanıyla önerilir, ancak diğer seçenekler belirli ihtiyaçlara daha uygun olabilir.`,
    }
  }

  // No clear winner
  const scores = allPolicies.map((p) => p.evaluation.overallScore)
  const scoreDiff = Math.max(...scores) - Math.min(...scores)

  if (scoreDiff < 10) {
    return {
      en: `All policies are closely matched. Consider your priorities: premium savings, coverage breadth, or specific coverages needed.`,
      tr: `Tüm poliçeler birbirine yakın. Önceliklerinizi göz önünde bulundurun: prim tasarrufu, teminat genişliği veya gereken spesifik teminatlar.`,
    }
  }

  return {
    en: `${bestPolicy.label} has the highest overall score (${bestPolicy.evaluation.overallScore}/100), but review the tradeoffs before deciding.`,
    tr: `${bestPolicy.label} en yüksek genel puana sahip (${bestPolicy.evaluation.overallScore}/100), ancak karar vermeden önce takasları inceleyin.`,
  }
}

// =============================================================================
// QUICK COMPARISON HELPERS
// =============================================================================

/**
 * Quick comparison - returns just the winner and basic stats
 */
export function quickCompare(policies: Policy[]): {
  winner: string
  scores: { policyId: string; score: number }[]
  premiumRange: { min: number; max: number; diff: number }
  coverageRange: { min: number; max: number; diff: number }
} {
  const evaluations = policies.map((p) => ({
    policy: p,
    evaluation: evaluatePolicy(p),
  }))

  const winner = evaluations.reduce((a, b) =>
    a.evaluation.overallScore > b.evaluation.overallScore ? a : b
  )

  const premiums = policies.map((p) => p.premium)
  const coverages = policies.map((p) => p.coverage)

  return {
    winner: winner.policy.id,
    scores: evaluations.map((e) => ({
      policyId: e.policy.id,
      score: e.evaluation.overallScore,
    })),
    premiumRange: {
      min: Math.min(...premiums),
      max: Math.max(...premiums),
      diff: Math.max(...premiums) - Math.min(...premiums),
    },
    coverageRange: {
      min: Math.min(...coverages),
      max: Math.max(...coverages),
      diff: Math.max(...coverages) - Math.min(...coverages),
    },
  }
}

/**
 * Compare specific coverage across policies
 */
export function compareCoverage(
  policies: Policy[],
  coverageName: string
): {
  available: { policyId: string; limit: number; deductible: number }[]
  notAvailable: string[]
  best: string | null
} {
  const results = policies.map((p) => {
    const coverage = p.coverages.find(
      (c) =>
        c.name.toLowerCase().includes(coverageName.toLowerCase()) ||
        c.nameTr?.toLowerCase().includes(coverageName.toLowerCase())
    )
    return {
      policyId: p.id,
      coverage,
    }
  })

  const available = results
    .filter((r) => r.coverage?.included)
    .map((r) => ({
      policyId: r.policyId,
      limit: r.coverage?.limit ?? 0,
      deductible: r.coverage?.deductible ?? 0,
    }))

  const notAvailable = results.filter((r) => !r.coverage?.included).map((r) => r.policyId)

  const best =
    available.length > 0
      ? available.reduce((a, b) => {
          // Best = highest limit with lowest deductible
          const aScore = a.limit - a.deductible * 2
          const bScore = b.limit - b.deductible * 2
          return aScore > bScore ? a : b
        }).policyId
      : null

  return { available, notAvailable, best }
}
