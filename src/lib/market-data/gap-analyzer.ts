/**
 * Gap Analyzer
 * Analyzes policy coverage gaps against market standards
 */

import type { PolicyType, Coverage, AnalyzedPolicy } from '@/types/policy'
import type {
  TurkishRegion,
  CoverageBenchmark,
  GapAnalysis,
  BenchmarkInsight,
} from '@/types/market-data'
import { MARKET_BENCHMARKS } from '@/data/market-data/benchmarks'
import { marketDataProvider } from './market-data-provider'

/**
 * Analyze coverage gaps in a policy (async, DB-backed with static fallback)
 */
export async function analyzeGaps(
  policy: AnalyzedPolicy,
  region: TurkishRegion = 'marmara'
): Promise<GapAnalysis> {
  const benchmark = await marketDataProvider.getBenchmark(policy.type)

  const missingCoverages = findMissingCoverages(policy.coverages, benchmark.commonCoverages)
  const underinsuredCoverages = findUnderinsuredCoverages(policy.coverages, benchmark.commonCoverages)
  const highDeductibles = findHighDeductibles(policy.coverages, benchmark.commonCoverages)
  const exclusionWarnings = analyzeExclusions(policy.exclusions, policy.type)

  // Calculate overall gap score (0-100, higher = more gaps)
  const gapScore = calculateGapScore(
    missingCoverages,
    underinsuredCoverages,
    highDeductibles,
    exclusionWarnings
  )

  // Estimate cost to close gaps
  const estimatedCostToClose = await estimateGapClosureCostAsync(
    missingCoverages,
    underinsuredCoverages,
    policy.type,
    region
  )

  return {
    missingCoverages,
    underinsuredCoverages,
    highDeductibles,
    exclusionWarnings,
    gapScore,
    estimatedCostToClose,
  }
}

/**
 * Synchronous version for backward compatibility (uses static data only)
 */
export function analyzeGapsSync(
  policy: AnalyzedPolicy,
  region: TurkishRegion = 'marmara'
): GapAnalysis {
  const benchmark = MARKET_BENCHMARKS[policy.type]

  const missingCoverages = findMissingCoverages(policy.coverages, benchmark.commonCoverages)
  const underinsuredCoverages = findUnderinsuredCoverages(policy.coverages, benchmark.commonCoverages)
  const highDeductibles = findHighDeductibles(policy.coverages, benchmark.commonCoverages)
  const exclusionWarnings = analyzeExclusions(policy.exclusions, policy.type)

  const gapScore = calculateGapScore(
    missingCoverages,
    underinsuredCoverages,
    highDeductibles,
    exclusionWarnings
  )

  const estimatedCostToClose = estimateGapClosureCost(
    missingCoverages,
    underinsuredCoverages,
    policy.type,
    region
  )

  return {
    missingCoverages,
    underinsuredCoverages,
    highDeductibles,
    exclusionWarnings,
    gapScore,
    estimatedCostToClose,
  }
}

/**
 * Find coverages that are missing from the policy but common in market
 */
function findMissingCoverages(
  policyCoverages: Coverage[],
  marketCoverages: CoverageBenchmark[]
): GapAnalysis['missingCoverages'] {
  const missing: GapAnalysis['missingCoverages'] = []

  for (const marketCoverage of marketCoverages) {
    // Only consider coverages included in >50% of policies
    if (marketCoverage.inclusionRate < 50) continue

    const hasIt = policyCoverages.some((c) =>
      matchesCoverage(c.name, marketCoverage.name) ||
      matchesCoverage(c.nameTr, marketCoverage.nameTr)
    )

    if (!hasIt) {
      // Determine importance based on inclusion rate
      let importance: 'critical' | 'recommended' | 'optional' = 'optional'
      if (marketCoverage.inclusionRate >= 90) {
        importance = 'critical'
      } else if (marketCoverage.inclusionRate >= 70) {
        importance = 'recommended'
      }

      // Estimate additional cost (rough estimate: 5-15% of typical limit)
      const estimatedCost = Math.round(marketCoverage.typicalLimit * 0.008)

      missing.push({
        coverage: marketCoverage,
        importance,
        estimatedCost,
      })
    }
  }

  return missing
}

/**
 * Find coverages where limits are below market average
 */
function findUnderinsuredCoverages(
  policyCoverages: Coverage[],
  marketCoverages: CoverageBenchmark[]
): GapAnalysis['underinsuredCoverages'] {
  const underinsured: GapAnalysis['underinsuredCoverages'] = []

  for (const policyCoverage of policyCoverages) {
    const marketCoverage = marketCoverages.find(
      (m) =>
        matchesCoverage(policyCoverage.name, m.name) ||
        matchesCoverage(policyCoverage.nameTr, m.nameTr)
    )

    if (!marketCoverage) continue

    // Check if limit is significantly below market average (>30% below)
    const percentOfAverage = (policyCoverage.limit / marketCoverage.typicalLimit) * 100

    if (percentOfAverage < 70) {
      let riskLevel: 'high' | 'medium' | 'low' = 'low'
      if (percentOfAverage < 40) {
        riskLevel = 'high'
      } else if (percentOfAverage < 55) {
        riskLevel = 'medium'
      }

      underinsured.push({
        coverageName: policyCoverage.nameTr || policyCoverage.name,
        currentLimit: policyCoverage.limit,
        recommendedLimit: marketCoverage.typicalLimit,
        marketAverageLimit: marketCoverage.typicalLimit,
        riskLevel,
      })
    }
  }

  return underinsured
}

/**
 * Find coverages with deductibles above market average
 */
function findHighDeductibles(
  policyCoverages: Coverage[],
  marketCoverages: CoverageBenchmark[]
): GapAnalysis['highDeductibles'] {
  const highDeductibles: GapAnalysis['highDeductibles'] = []

  for (const policyCoverage of policyCoverages) {
    if (policyCoverage.deductible === 0) continue

    const marketCoverage = marketCoverages.find(
      (m) =>
        matchesCoverage(policyCoverage.name, m.name) ||
        matchesCoverage(policyCoverage.nameTr, m.nameTr)
    )

    if (!marketCoverage) continue

    // Check if deductible is significantly above market average
    if (policyCoverage.deductible > marketCoverage.typicalDeductible * 1.5) {
      const range = marketCoverage.maxDeductible - marketCoverage.minDeductible
      const percentileRank = range > 0
        ? ((policyCoverage.deductible - marketCoverage.minDeductible) / range) * 100
        : 50

      highDeductibles.push({
        coverageName: policyCoverage.nameTr || policyCoverage.name,
        currentDeductible: policyCoverage.deductible,
        marketAverageDeductible: marketCoverage.typicalDeductible,
        percentileRank: Math.round(Math.min(100, Math.max(0, percentileRank))),
      })
    }
  }

  return highDeductibles
}

/**
 * Analyze policy exclusions for risk
 */
function analyzeExclusions(
  exclusions: string[],
  policyType: PolicyType
): GapAnalysis['exclusionWarnings'] {
  const warnings: GapAnalysis['exclusionWarnings'] = []

  // High-risk exclusions by policy type
  const riskExclusions: Record<PolicyType, { pattern: RegExp; risk: 'high' | 'medium' | 'low'; rec: string }[]> = {
    kasko: [
      { pattern: /deprem|earthquake/i, risk: 'high', rec: 'Deprem teminatı eklenmesini değerlendirin' },
      { pattern: /sel|flood/i, risk: 'medium', rec: 'Sel hasarı için ek teminat değerlendirin' },
      { pattern: /hırsızlık|theft/i, risk: 'high', rec: 'Hırsızlık teminatı kritik öneme sahiptir' },
    ],
    traffic: [],
    home: [
      { pattern: /hırsızlık|theft/i, risk: 'high', rec: 'Hırsızlık teminatı eklenmeli' },
      { pattern: /sel|flood/i, risk: 'medium', rec: 'Sel hasarı için konut sigortası değerlendirin' },
      { pattern: /cam|glass/i, risk: 'low', rec: 'Cam kırılması teminatı düşünülebilir' },
    ],
    health: [
      { pattern: /kanser|cancer/i, risk: 'high', rec: 'Kritik hastalık teminatı eklenmeli' },
      { pattern: /yurtdışı|abroad/i, risk: 'medium', rec: 'Yurtdışı tedavi teminatı değerlendirin' },
      { pattern: /diş|dental/i, risk: 'low', rec: 'Diş tedavisi teminatı düşünülebilir' },
    ],
    life: [
      { pattern: /kaza|accident/i, risk: 'high', rec: 'Kaza sonucu vefat teminatı eklenmeli' },
      { pattern: /maluliyet|disability/i, risk: 'high', rec: 'Maluliyet teminatı kritik öneme sahip' },
    ],
    dask: [],
    business: [
      { pattern: /iş durması|business interruption/i, risk: 'high', rec: 'İş durması teminatı kritik' },
      { pattern: /siber|cyber/i, risk: 'medium', rec: 'Siber güvenlik teminatı değerlendirin' },
      { pattern: /sorumluluk|liability/i, risk: 'high', rec: 'Sorumluluk teminatı eklenmeli' },
    ],
    nakliyat: [
      { pattern: /emtia|cargo/i, risk: 'high', rec: 'Emtia hasarı teminatı kritik öneme sahip' },
      { pattern: /yükleme|boşaltma|loading|unloading/i, risk: 'high', rec: 'Yükleme/boşaltma teminatı eklenmeli' },
      { pattern: /hırsızlık|theft/i, risk: 'high', rec: 'Hırsızlık teminatı kritik' },
      { pattern: /doğal afet|natural disaster/i, risk: 'medium', rec: 'Doğal afet teminatı değerlendirin' },
      { pattern: /depo|warehouse/i, risk: 'medium', rec: 'Depo riski teminatı düşünülebilir' },
    ],
  }

  const typeExclusions = riskExclusions[policyType] || []

  for (const exclusion of exclusions) {
    for (const { pattern, risk, rec } of typeExclusions) {
      if (pattern.test(exclusion)) {
        warnings.push({
          exclusion,
          riskLevel: risk,
          recommendation: rec,
        })
        break
      }
    }
  }

  return warnings
}

/**
 * Calculate overall gap score
 */
function calculateGapScore(
  missingCoverages: GapAnalysis['missingCoverages'],
  underinsuredCoverages: GapAnalysis['underinsuredCoverages'],
  highDeductibles: GapAnalysis['highDeductibles'],
  exclusionWarnings: GapAnalysis['exclusionWarnings']
): number {
  let score = 0

  // Missing coverages (weight: 40%)
  for (const missing of missingCoverages) {
    if (missing.importance === 'critical') score += 15
    else if (missing.importance === 'recommended') score += 8
    else score += 3
  }

  // Underinsured coverages (weight: 30%)
  for (const under of underinsuredCoverages) {
    if (under.riskLevel === 'high') score += 12
    else if (under.riskLevel === 'medium') score += 6
    else score += 2
  }

  // High deductibles (weight: 15%)
  for (const deduct of highDeductibles) {
    if (deduct.percentileRank > 80) score += 5
    else if (deduct.percentileRank > 60) score += 3
    else score += 1
  }

  // Exclusion warnings (weight: 15%)
  for (const warning of exclusionWarnings) {
    if (warning.riskLevel === 'high') score += 8
    else if (warning.riskLevel === 'medium') score += 4
    else score += 1
  }

  return Math.min(100, score)
}

/**
 * Estimate cost to close all gaps
 */
async function estimateGapClosureCostAsync(
  missingCoverages: GapAnalysis['missingCoverages'],
  underinsuredCoverages: GapAnalysis['underinsuredCoverages'],
  policyType: PolicyType,
  region: TurkishRegion
): Promise<number> {
  const benchmark = await marketDataProvider.getBenchmark(policyType)
  const regionalFactor = benchmark.regionalFactors[region] || 1.0

  let totalCost = 0
  for (const missing of missingCoverages) {
    totalCost += missing.estimatedCost * regionalFactor
  }
  for (const under of underinsuredCoverages) {
    const upgradeFactor = under.recommendedLimit / under.currentLimit
    const upgradeMultiplier = Math.log2(upgradeFactor) * 0.15
    const baseCost = benchmark.premiumRange.average * 0.1
    totalCost += baseCost * upgradeMultiplier * regionalFactor
  }
  return Math.round(totalCost)
}

/**
 * Estimate cost to close all gaps (sync version, static data only)
 */
function estimateGapClosureCost(
  missingCoverages: GapAnalysis['missingCoverages'],
  underinsuredCoverages: GapAnalysis['underinsuredCoverages'],
  policyType: PolicyType,
  region: TurkishRegion
): number {
  const benchmark = MARKET_BENCHMARKS[policyType]
  const regionalFactor = benchmark.regionalFactors[region] || 1.0

  let totalCost = 0

  // Cost for missing coverages
  for (const missing of missingCoverages) {
    totalCost += missing.estimatedCost * regionalFactor
  }

  // Cost to upgrade underinsured coverages (rough estimate)
  for (const under of underinsuredCoverages) {
    const upgradeFactor = under.recommendedLimit / under.currentLimit
    const upgradeMultiplier = Math.log2(upgradeFactor) * 0.15 // Diminishing cost increase
    const baseCost = benchmark.premiumRange.average * 0.1
    totalCost += baseCost * upgradeMultiplier * regionalFactor
  }

  return Math.round(totalCost)
}

/**
 * Check if two coverage names match (fuzzy)
 */
function matchesCoverage(name1: string, name2: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-zğüşıöç0-9]/gi, '')
  return normalize(name1).includes(normalize(name2)) ||
         normalize(name2).includes(normalize(name1))
}

/**
 * Generate insights from gap analysis
 */
export function generateGapInsights(gaps: GapAnalysis): BenchmarkInsight[] {
  const insights: BenchmarkInsight[] = []

  // Missing critical coverages
  const criticalMissing = gaps.missingCoverages.filter(m => m.importance === 'critical')
  if (criticalMissing.length > 0) {
    insights.push({
      type: 'warning',
      category: 'coverage',
      message: `Missing ${criticalMissing.length} critical coverage(s) that ${criticalMissing[0].coverage.inclusionRate}% of policies include`,
      messageTr: `Poliçelerin %${criticalMissing[0].coverage.inclusionRate}'ının sahip olduğu ${criticalMissing.length} kritik teminat eksik`,
      priority: 5,
      actionable: true,
    })
  }

  // Underinsured
  const highRiskUnderinsured = gaps.underinsuredCoverages.filter(u => u.riskLevel === 'high')
  if (highRiskUnderinsured.length > 0) {
    insights.push({
      type: 'warning',
      category: 'coverage',
      message: `${highRiskUnderinsured.length} coverage(s) significantly below market average`,
      messageTr: `${highRiskUnderinsured.length} teminat piyasa ortalamasının önemli ölçüde altında`,
      priority: 4,
      actionable: true,
    })
  }

  // High deductibles
  if (gaps.highDeductibles.length > 0) {
    const avgPercentile = gaps.highDeductibles.reduce((sum, d) => sum + d.percentileRank, 0) / gaps.highDeductibles.length
    insights.push({
      type: 'warning',
      category: 'premium',
      message: `Deductibles are in the ${Math.round(avgPercentile)}th percentile - higher than average`,
      messageTr: `Muafiyet tutarları yüzde ${Math.round(avgPercentile)}'lik dilimde - ortalamanın üzerinde`,
      priority: 3,
      actionable: true,
    })
  }

  // Overall gap score
  if (gaps.gapScore < 20) {
    insights.push({
      type: 'positive',
      category: 'coverage',
      message: 'Policy coverage aligns well with market standards',
      messageTr: 'Poliçe teminatları piyasa standartlarıyla uyumlu',
      priority: 2,
      actionable: false,
    })
  } else if (gaps.gapScore > 50) {
    insights.push({
      type: 'warning',
      category: 'coverage',
      message: `Significant coverage gaps detected (score: ${gaps.gapScore}/100)`,
      messageTr: `Önemli teminat eksiklikleri tespit edildi (skor: ${gaps.gapScore}/100)`,
      priority: 5,
      actionable: true,
    })
  }

  // Cost to close gaps
  if (gaps.estimatedCostToClose > 0) {
    insights.push({
      type: 'recommendation',
      category: 'premium',
      message: `Estimated ₺${gaps.estimatedCostToClose.toLocaleString('tr-TR')} additional premium to close gaps`,
      messageTr: `Eksiklikleri kapatmak için tahmini ₺${gaps.estimatedCostToClose.toLocaleString('tr-TR')} ek prim`,
      priority: 2,
      actionable: true,
    })
  }

  return insights.sort((a, b) => b.priority - a.priority)
}
