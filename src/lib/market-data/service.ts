/**
 * Market Data Service
 * Comprehensive insurance benchmarking service for Turkish market
 */

import type { PolicyType, AnalyzedPolicy } from '@/types/policy'
import type {
  TurkishRegion,
  ProviderInfo,
  PolicyTypeMarketData,
  BenchmarkResult,
  BenchmarkInsight,
  MarketComparison,
  GapAnalysis,
} from '@/types/market-data'
import {
  MARKET_BENCHMARKS,
  calculatePremiumPercentile,
  calculateCoveragePercentile,
  getRegionalFactor,
} from '@/data/market-data/benchmarks'
import {
  INSURANCE_PROVIDERS,
  findProviderByName,
  getProviderRank,
  getProvidersByMarketShare,
} from '@/data/market-data/providers'
import { detectRegionFromAddress } from './region-detector'
import { analyzeGaps, generateGapInsights } from './gap-analyzer'

/**
 * Market Data Service class
 * Provides comprehensive benchmarking capabilities
 */
export class MarketDataService {
  /**
   * Get comprehensive benchmark analysis for a policy
   */
  static analyzePolicyBenchmark(
    policy: AnalyzedPolicy,
    region?: TurkishRegion
  ): BenchmarkResult {
    const detectedRegion = region || detectRegionFromAddress(policy.location)
    const benchmark = MARKET_BENCHMARKS[policy.type]

    // Calculate percentiles
    const premiumPercentile = calculatePremiumPercentile(
      policy.premium,
      policy.type,
      detectedRegion
    )
    const coveragePercentile = calculateCoveragePercentile(
      policy.coverage,
      policy.type
    )

    // Calculate value score (coverage per premium)
    const userValueRatio = policy.coverage / policy.premium
    const marketValueRatio = benchmark.coverageRange.average / benchmark.premiumRange.average
    const valueScore = Math.min(100, Math.round((userValueRatio / marketValueRatio) * 50))

    // Regional adjustment
    const regionalFactor = getRegionalFactor(policy.type, detectedRegion)
    const adjustedPremium = policy.premium / regionalFactor
    const regionalAdjustedPercentile = calculatePremiumPercentile(
      adjustedPremium,
      policy.type
    )

    // Provider analysis
    const providerInfo = findProviderByName(policy.provider)
    const providerRank = providerInfo ? getProviderRank(providerInfo.id) : 0
    const providerCount = Object.keys(INSURANCE_PROVIDERS).length

    // Comparisons
    const premiumVsAverage = ((policy.premium - benchmark.premiumRange.average) / benchmark.premiumRange.average) * 100
    const coverageVsAverage = ((policy.coverage - benchmark.coverageRange.average) / benchmark.coverageRange.average) * 100

    // Generate insights
    const insights = this.generateBenchmarkInsights(
      policy,
      premiumPercentile,
      coveragePercentile,
      valueScore,
      detectedRegion,
      providerInfo
    )

    return {
      premiumPercentile,
      coveragePercentile,
      valueScore,
      premiumVsAverage: Math.round(premiumVsAverage),
      coverageVsAverage: Math.round(coverageVsAverage),
      region: detectedRegion,
      regionalAdjustedPercentile,
      providerRank,
      providerCount,
      insights,
    }
  }

  /**
   * Get market comparison summary
   */
  static getMarketComparison(
    policy: AnalyzedPolicy,
    region?: TurkishRegion
  ): MarketComparison {
    const detectedRegion = region || detectRegionFromAddress(policy.location)
    const benchmark = MARKET_BENCHMARKS[policy.type]
    const providerInfo = findProviderByName(policy.provider)

    const premiumPercentile = calculatePremiumPercentile(
      policy.premium,
      policy.type,
      detectedRegion
    )
    const coveragePercentile = calculateCoveragePercentile(
      policy.coverage,
      policy.type
    )

    // Rating calculations
    const premiumRating = this.getPremiumRating(premiumPercentile)
    const coverageRating = this.getCoverageRating(coveragePercentile)

    const userValueRatio = policy.coverage / policy.premium
    const marketValueRatio = benchmark.coverageRange.average / benchmark.premiumRange.average
    const valueRating = this.getValueRating(userValueRatio, marketValueRatio)

    // Market trend
    const marketTrend = benchmark.trends.premiumChangeYoY > 5
      ? 'increasing'
      : benchmark.trends.premiumChangeYoY < -5
        ? 'decreasing'
        : 'stable'

    return {
      policyType: policy.type,
      region: detectedRegion,
      userPremium: policy.premium,
      marketAverage: benchmark.premiumRange.average,
      marketMedian: benchmark.premiumRange.median,
      premiumPercentile,
      premiumRating,
      userCoverage: policy.coverage,
      marketAverageCoverage: benchmark.coverageRange.average,
      coveragePercentile,
      coverageRating,
      userValueRatio,
      marketValueRatio,
      valueRating,
      providerMarketShare: providerInfo?.marketShare ?? 0,
      providerRating: providerInfo?.rating ?? 0,
      providerRank: providerInfo ? getProviderRank(providerInfo.id) : 0,
      marketTrend,
      trendPercentage: benchmark.trends.premiumChangeYoY,
    }
  }

  /**
   * Get gap analysis for a policy
   */
  static analyzeGaps(
    policy: AnalyzedPolicy,
    region?: TurkishRegion
  ): GapAnalysis {
    const detectedRegion = region || detectRegionFromAddress(policy.location)
    return analyzeGaps(policy, detectedRegion)
  }

  /**
   * Get gap insights
   */
  static getGapInsights(gaps: GapAnalysis): BenchmarkInsight[] {
    return generateGapInsights(gaps)
  }

  /**
   * Get benchmark data for a policy type
   */
  static getBenchmarkData(policyType: PolicyType): PolicyTypeMarketData {
    return MARKET_BENCHMARKS[policyType]
  }

  /**
   * Get all providers sorted by market share
   */
  static getProviders(): ProviderInfo[] {
    return getProvidersByMarketShare()
  }

  /**
   * Get provider information
   */
  static getProviderInfo(providerName: string): ProviderInfo | undefined {
    return findProviderByName(providerName)
  }

  /**
   * Calculate regional adjustment factor
   */
  static getRegionalFactor(policyType: PolicyType, region: TurkishRegion): number {
    return getRegionalFactor(policyType, region)
  }

  /**
   * Get recommended coverage based on policy type and region
   */
  static getRecommendedCoverages(
    policyType: PolicyType,
    region: TurkishRegion = 'marmara'
  ): { name: string; nameTr: string; recommendedLimit: number; importance: string }[] {
    const benchmark = MARKET_BENCHMARKS[policyType]
    const regionalFactor = getRegionalFactor(policyType, region)

    return benchmark.commonCoverages
      .filter(c => c.inclusionRate >= 50)
      .map(c => ({
        name: c.name,
        nameTr: c.nameTr,
        recommendedLimit: Math.round(c.typicalLimit * regionalFactor),
        importance: c.inclusionRate >= 90 ? 'critical' :
                   c.inclusionRate >= 70 ? 'recommended' : 'optional',
      }))
      .sort((a, b) => {
        const order = { critical: 0, recommended: 1, optional: 2 }
        return (order[a.importance as keyof typeof order] || 2) -
               (order[b.importance as keyof typeof order] || 2)
      })
  }

  /**
   * Generate benchmark insights
   */
  private static generateBenchmarkInsights(
    policy: AnalyzedPolicy,
    premiumPercentile: number,
    coveragePercentile: number,
    valueScore: number,
    region: TurkishRegion,
    providerInfo: ProviderInfo | undefined
  ): BenchmarkInsight[] {
    const insights: BenchmarkInsight[] = []
    const benchmark = MARKET_BENCHMARKS[policy.type]

    // Premium insights
    if (premiumPercentile < 25) {
      insights.push({
        type: 'positive',
        category: 'premium',
        message: `Premium is in the bottom 25% - excellent value`,
        messageTr: `Prim alt %25'lik dilimde - mükemmel değer`,
        priority: 4,
        actionable: false,
      })
    } else if (premiumPercentile > 75) {
      insights.push({
        type: 'warning',
        category: 'premium',
        message: `Premium is in the top 25% - consider comparing alternatives`,
        messageTr: `Prim üst %25'lik dilimde - alternatifleri karşılaştırın`,
        priority: 4,
        actionable: true,
      })
    }

    // Coverage insights
    if (coveragePercentile < 25) {
      insights.push({
        type: 'warning',
        category: 'coverage',
        message: `Coverage is in the bottom 25% - may be underinsured`,
        messageTr: `Teminat alt %25'lik dilimde - yetersiz sigorta riski`,
        priority: 5,
        actionable: true,
      })
    } else if (coveragePercentile > 75) {
      insights.push({
        type: 'positive',
        category: 'coverage',
        message: `Coverage is in the top 25% - comprehensive protection`,
        messageTr: `Teminat üst %25'lik dilimde - kapsamlı koruma`,
        priority: 3,
        actionable: false,
      })
    }

    // Value insights
    if (valueScore > 70) {
      insights.push({
        type: 'positive',
        category: 'premium',
        message: `Excellent value ratio - more coverage per lira than average`,
        messageTr: `Mükemmel değer oranı - lira başına ortalamadan fazla teminat`,
        priority: 4,
        actionable: false,
      })
    } else if (valueScore < 30) {
      insights.push({
        type: 'recommendation',
        category: 'premium',
        message: `Below average value ratio - review coverage vs premium`,
        messageTr: `Ortalamanın altında değer oranı - teminat/prim oranını gözden geçirin`,
        priority: 4,
        actionable: true,
      })
    }

    // Provider insights
    if (providerInfo) {
      if (providerInfo.rating >= 4.2) {
        insights.push({
          type: 'positive',
          category: 'provider',
          message: `${providerInfo.name} has excellent customer ratings (${providerInfo.rating}/5)`,
          messageTr: `${providerInfo.nameTr} mükemmel müşteri puanına sahip (${providerInfo.rating}/5)`,
          priority: 2,
          actionable: false,
        })
      }
      if (providerInfo.marketShare > 8) {
        insights.push({
          type: 'info',
          category: 'provider',
          message: `${providerInfo.name} is a market leader (${providerInfo.marketShare}% share)`,
          messageTr: `${providerInfo.nameTr} pazar lideri (%${providerInfo.marketShare} pay)`,
          priority: 1,
          actionable: false,
        })
      }
    }

    // Market trend insights
    if (benchmark.trends.premiumChangeYoY > 30) {
      insights.push({
        type: 'info',
        category: 'market',
        message: `This market segment saw ${Math.round(benchmark.trends.premiumChangeYoY)}% premium increase YoY`,
        messageTr: `Bu segment yıllık %${Math.round(benchmark.trends.premiumChangeYoY)} prim artışı gördü`,
        priority: 2,
        actionable: false,
      })
    }

    // Regional insights
    const regionalFactor = getRegionalFactor(policy.type, region)
    if (regionalFactor > 1.1) {
      insights.push({
        type: 'info',
        category: 'regional',
        message: `${region} region has ${Math.round((regionalFactor - 1) * 100)}% higher premiums than average`,
        messageTr: `${region} bölgesi ortalamadan %${Math.round((regionalFactor - 1) * 100)} daha yüksek prime sahip`,
        priority: 1,
        actionable: false,
      })
    } else if (regionalFactor < 0.9) {
      insights.push({
        type: 'positive',
        category: 'regional',
        message: `${region} region has ${Math.round((1 - regionalFactor) * 100)}% lower premiums than average`,
        messageTr: `${region} bölgesi ortalamadan %${Math.round((1 - regionalFactor) * 100)} daha düşük prime sahip`,
        priority: 1,
        actionable: false,
      })
    }

    return insights.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Get premium rating
   */
  private static getPremiumRating(
    percentile: number
  ): MarketComparison['premiumRating'] {
    if (percentile < 20) return 'excellent'
    if (percentile < 40) return 'good'
    if (percentile < 60) return 'average'
    if (percentile < 80) return 'above_average'
    return 'expensive'
  }

  /**
   * Get coverage rating
   */
  private static getCoverageRating(
    percentile: number
  ): MarketComparison['coverageRating'] {
    if (percentile > 75) return 'comprehensive'
    if (percentile > 50) return 'adequate'
    if (percentile > 25) return 'basic'
    return 'minimal'
  }

  /**
   * Get value rating
   */
  private static getValueRating(
    userRatio: number,
    marketRatio: number
  ): MarketComparison['valueRating'] {
    const ratio = userRatio / marketRatio
    if (ratio > 1.25) return 'excellent'
    if (ratio > 0.9) return 'good'
    if (ratio > 0.6) return 'average'
    return 'poor'
  }
}

/**
 * Convenience function to get market comparison data
 * Compatible with existing marketComparison field format
 */
export function generateMarketComparisonData(
  premium: number,
  _coverage: number,
  policyType: PolicyType,
  location?: string
): { averagePremium: number; averageCoverage: number; percentile: number } {
  const region = detectRegionFromAddress(location)
  const benchmark = MARKET_BENCHMARKS[policyType]
  const percentile = calculatePremiumPercentile(premium, policyType, region)

  // Note: _coverage reserved for future coverage percentile calculations
  return {
    averagePremium: benchmark.premiumRange.average,
    averageCoverage: benchmark.coverageRange.average,
    percentile,
  }
}
