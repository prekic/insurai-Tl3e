/**
 * Turkish Insurance Market Data Types
 * Based on SEDDK (Sigortacılık ve Özel Emeklilik Düzenleme ve Denetleme Kurumu)
 * and TSB (Türkiye Sigorta Birliği) market statistics
 */

import type { PolicyType } from './policy'

/**
 * Turkish geographic regions for regional pricing
 */
export type TurkishRegion =
  | 'marmara' // Istanbul, Bursa, Kocaeli, etc.
  | 'ege' // Izmir, Denizli, Aydın, etc.
  | 'akdeniz' // Antalya, Adana, Mersin, etc.
  | 'ic_anadolu' // Ankara, Konya, Eskişehir, etc.
  | 'karadeniz' // Samsun, Trabzon, etc.
  | 'dogu_anadolu' // Erzurum, Van, Elazığ, etc.
  | 'guneydogu' // Gaziantep, Diyarbakır, Şanlıurfa, etc.

/**
 * Major Turkish insurance providers
 */
export type InsuranceProvider =
  | 'allianz'
  | 'axa'
  | 'anadolu'
  | 'aksigorta'
  | 'mapfre'
  | 'sompo'
  | 'zurich'
  | 'hdi'
  | 'turkiye'
  | 'groupama'
  | 'ergo'
  | 'ray'
  | 'generali'
  | 'neova'
  | 'quick'

/**
 * Provider information
 */
export interface ProviderInfo {
  id: InsuranceProvider
  name: string
  nameTr: string
  logo?: string
  marketShare: number // Percentage
  rating: number // 1-5 customer satisfaction
  established: number // Year
  headquarters: string
}

/**
 * Premium range for a specific coverage type
 */
export interface PremiumRange {
  min: number
  max: number
  average: number
  median: number
  percentile25: number
  percentile75: number
}

/**
 * Coverage benchmark for specific coverage items
 */
export interface CoverageBenchmark {
  name: string
  nameTr: string
  typicalLimit: number
  minLimit: number
  maxLimit: number
  typicalDeductible: number
  minDeductible: number
  maxDeductible: number
  inclusionRate: number // Percentage of policies that include this
}

/**
 * Market statistics for a policy type
 */
export interface PolicyTypeMarketData {
  type: PolicyType
  typeTr: string

  // Premium statistics (annual, in TRY)
  premiumRange: PremiumRange

  // Coverage statistics
  coverageRange: {
    min: number
    max: number
    average: number
    median: number
  }

  // Common coverages for this policy type
  commonCoverages: CoverageBenchmark[]

  // Common exclusions
  commonExclusions: string[]

  // Market trends
  trends: {
    premiumChangeYoY: number // Year-over-year percentage change
    claimsRatio: number // Claims paid / premiums collected
    marketGrowth: number // Annual growth percentage
  }

  // Regional adjustments (multiplier from base)
  regionalFactors: Record<TurkishRegion, number>

  // Last updated
  dataDate: string
  source: string

  /**
   * Provenance metadata for benchmark claims.
   * When present and valid, reviewer-mode recommendations may cite
   * percentile rankings and YoY trends. When absent, those claims
   * are suppressed in favour of a safe "needs verification" fallback.
   */
  provenance?: BenchmarkProvenance
}

/**
 * Provenance metadata proving a benchmark dataset's origin.
 * All three fields must be non-empty for the gate to open.
 *
 * - source: authoritative data source (e.g. "TSB/SEDDK 2025 Yıllık İstatistik")
 * - date:   ISO-8601 date the dataset was published or last refreshed
 * - cohort: description of the comparison group (e.g. "Türkiye kasko poliçeleri, 2024 Q4")
 */
export interface BenchmarkProvenance {
  source: string
  date: string
  cohort: string
}

/**
 * Provider-specific pricing for a policy type
 */
export interface ProviderPricing {
  provider: InsuranceProvider
  policyType: PolicyType

  // Premium relative to market average (1.0 = average)
  premiumFactor: number

  // Coverage value relative to premium (higher = better value)
  valueRating: number

  // Customer satisfaction for this product
  satisfactionRating: number

  // Claims processing speed (1-5, higher = faster)
  claimsSpeed: number

  // Typical discounts offered
  discounts: {
    name: string
    nameTr: string
    percentage: number
    condition: string
  }[]
}

/**
 * Risk factors that affect premium calculation
 */
export interface RiskFactors {
  // For Kasko/Traffic
  vehicleAge?: number
  vehicleValue?: number
  driverAge?: number
  driverExperience?: number
  accidentHistory?: number

  // For Home/DASK
  buildingAge?: number
  buildingType?: 'apartment' | 'detached' | 'villa' | 'commercial'
  constructionType?: 'reinforced' | 'masonry' | 'steel' | 'wood'
  floorCount?: number
  squareMeters?: number

  // For Health
  age?: number
  smoker?: boolean
  preExistingConditions?: number
  coverageScope?: 'basic' | 'standard' | 'comprehensive' | 'premium'

  // For Business
  businessType?: string
  employeeCount?: number
  annualRevenue?: number
  riskCategory?: 'low' | 'medium' | 'high'
}

/**
 * Benchmark comparison result
 */
export interface BenchmarkResult {
  // User's policy position
  premiumPercentile: number // 0-100, lower = cheaper
  coveragePercentile: number // 0-100, higher = better
  valueScore: number // 0-100, composite score

  // Comparisons
  premiumVsAverage: number // Percentage difference
  coverageVsAverage: number // Percentage difference

  // Regional context
  region: TurkishRegion
  regionalAdjustedPercentile: number

  // Provider context
  providerRank: number // Among all providers
  providerCount: number

  // Recommendations
  insights: BenchmarkInsight[]
}

/**
 * Specific insight from benchmarking
 */
export interface BenchmarkInsight {
  type: 'positive' | 'warning' | 'recommendation' | 'info'
  category: 'premium' | 'coverage' | 'provider' | 'regional' | 'market'
  message: string
  messageTr: string
  priority: number // 1-5, higher = more important
  actionable: boolean
}

/**
 * Gap analysis result
 */
export interface GapAnalysis {
  // Missing coverages compared to market standard
  missingCoverages: {
    coverage: CoverageBenchmark
    importance: 'critical' | 'recommended' | 'optional'
    estimatedCost: number
  }[]

  // Underinsured coverages
  underinsuredCoverages: {
    coverageName: string
    currentLimit: number
    recommendedLimit: number
    marketAverageLimit: number
    riskLevel: 'high' | 'medium' | 'low'
  }[]

  // High deductibles
  highDeductibles: {
    coverageName: string
    currentDeductible: number
    marketAverageDeductible: number
    percentileRank: number
  }[]

  // Exclusion warnings
  exclusionWarnings: {
    exclusion: string
    riskLevel: 'high' | 'medium' | 'low'
    recommendation: string
  }[]

  // Overall gap score (0-100, higher = more gaps)
  gapScore: number

  // Estimated cost to close gaps
  estimatedCostToClose: number
}

/**
 * Market comparison summary
 */
export interface MarketComparison {
  policyType: PolicyType
  region: TurkishRegion

  // Premium analysis
  userPremium: number
  marketAverage: number
  marketMedian: number
  premiumPercentile: number
  premiumRating: 'excellent' | 'good' | 'average' | 'above_average' | 'expensive'

  // Coverage analysis
  userCoverage: number
  marketAverageCoverage: number
  coveragePercentile: number
  coverageRating: 'comprehensive' | 'adequate' | 'basic' | 'minimal'

  // Value analysis
  userValueRatio: number // Coverage per TRY premium
  marketValueRatio: number
  valueRating: 'excellent' | 'good' | 'average' | 'poor'

  // Provider comparison
  providerMarketShare: number
  providerRating: number
  providerRank: number

  // Trend context
  marketTrend: 'increasing' | 'stable' | 'decreasing'
  trendPercentage: number
}
