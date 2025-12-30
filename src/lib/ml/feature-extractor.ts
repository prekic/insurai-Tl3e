/**
 * Feature Extraction for Risk Scoring
 * Extracts ML-ready features from analyzed policies
 */

import type { AnalyzedPolicy, PolicyType } from '@/types/policy'
import type { RiskFeatures } from '@/types/risk'
import { MarketDataService } from '@/lib/market-data/service'
import { detectRegionFromAddress } from '@/lib/market-data/region-detector'
import type { TurkishRegion } from '@/types/market-data'

/**
 * Minimum recommended coverages by policy type
 */
const MINIMUM_COVERAGES: Record<PolicyType, string[]> = {
  kasko: ['hasar', 'hırsızlık', 'cam', 'ihtiyari mali mesuliyet'],
  traffic: ['maddi', 'manevi', 'tedavi'],
  home: ['yangın', 'hırsızlık', 'deprem', 'su', 'cam'],
  health: ['yatarak tedavi', 'ayakta tedavi', 'ilaç'],
  life: ['vefat', 'maluliyet', 'kritik hastalık'],
  dask: ['deprem'],
  business: ['yangın', 'hırsızlık', 'iş durması', 'sorumluluk'],
}

/**
 * High-risk exclusions that significantly impact coverage
 */
const HIGH_RISK_EXCLUSIONS = [
  'deprem', 'sel', 'terör', 'savaş', 'grev',
  'ihmal', 'kasıt', 'alkol', 'meslek hastalığı',
  'mevcut hastalık', 'kronik', 'ruhsal',
]

/**
 * Provider ratings database (1-5 scale)
 */
const PROVIDER_RATINGS: Record<string, number> = {
  'allianz': 4.5,
  'axa sigorta': 4.3,
  'anadolu sigorta': 4.2,
  'aksigorta': 4.1,
  'sompo sigorta': 4.0,
  'mapfre sigorta': 4.0,
  'zurich sigorta': 4.0,
  'groupama sigorta': 3.9,
  'hdi sigorta': 3.8,
  'türk nippon sigorta': 3.7,
  'neova sigorta': 3.6,
  'quick sigorta': 3.5,
  'ray sigorta': 3.5,
  'bereket sigorta': 3.4,
  'magdeburger sigorta': 3.3,
}

/**
 * Extract ML features from an analyzed policy
 */
export function extractFeatures(policy: AnalyzedPolicy): RiskFeatures {
  const policyType = policy.type as PolicyType | null
  const region = detectRegionFromPolicy(policy)
  const regionFactor = region ? getRegionRiskFactor(region) : 1.0

  // Calculate coverage metrics
  const coverageMetrics = calculateCoverageMetrics(policy, policyType)

  // Calculate deductible metrics
  const deductibleMetrics = calculateDeductibleMetrics(policy)

  // Get provider metrics
  const providerMetrics = getProviderMetrics(policy.provider)

  // Calculate temporal features
  const temporalFeatures = calculateTemporalFeatures(policy)

  // Get pricing metrics
  const pricingMetrics = calculatePricingMetrics(policy, policyType, region)

  // Analyze exclusions
  const exclusionMetrics = analyzeExclusions(policy)

  return {
    // Policy characteristics
    policyType,
    premiumAmount: policy.premium,
    totalCoverageLimit: coverageMetrics.totalLimit,
    coverageCount: policy.coverages.length,

    // Coverage quality
    hasMinimumCoverages: coverageMetrics.hasMinimum,
    coverageGapCount: coverageMetrics.gapCount,
    coverageRatio: coverageMetrics.ratio,

    // Deductible exposure
    averageDeductible: deductibleMetrics.average,
    maxDeductible: deductibleMetrics.max,
    deductibleToPremiumRatio: deductibleMetrics.toPremiumRatio,

    // Provider characteristics
    providerRating: providerMetrics.rating,
    providerMarketShare: providerMetrics.marketShare,
    providerClaimRatio: providerMetrics.claimRatio,

    // Temporal features
    policyDuration: temporalFeatures.duration,
    daysToExpiry: temporalFeatures.daysToExpiry,
    isExpired: temporalFeatures.isExpired,
    renewalRequired: temporalFeatures.renewalRequired,

    // Geographic features
    regionRiskFactor: regionFactor,
    urbanFactor: getUrbanFactor(policy),

    // Exclusions & conditions
    exclusionCount: policy.exclusions?.length ?? 0,
    hasHighRiskExclusions: exclusionMetrics.hasHighRisk,
    specialConditionCount: policy.specialConditions?.length ?? 0,

    // Pricing features
    premiumPercentile: pricingMetrics.percentile,
    priceToMarketRatio: pricingMetrics.toMarketRatio,
  }
}

/**
 * Calculate coverage-related metrics
 */
function calculateCoverageMetrics(
  policy: AnalyzedPolicy,
  policyType: PolicyType | null
): {
  totalLimit: number | null
  hasMinimum: boolean
  gapCount: number
  ratio: number
} {
  // Calculate total coverage limit
  const totalLimit = policy.coverages.reduce((sum, c) => {
    return sum + (c.limit ?? 0)
  }, 0) || null

  // Check minimum coverages
  const minimumCoverages = policyType ? MINIMUM_COVERAGES[policyType] : []
  const policyConverageNames = policy.coverages.map(c =>
    c.name.toLowerCase().trim()
  )

  const presentCoverages = minimumCoverages.filter(min =>
    policyConverageNames.some(name => name.includes(min))
  )

  const gapCount = minimumCoverages.length - presentCoverages.length
  const hasMinimum = gapCount === 0
  const ratio = minimumCoverages.length > 0
    ? presentCoverages.length / minimumCoverages.length
    : 1

  return { totalLimit, hasMinimum, gapCount, ratio }
}

/**
 * Calculate deductible-related metrics
 */
function calculateDeductibleMetrics(policy: AnalyzedPolicy): {
  average: number | null
  max: number | null
  toPremiumRatio: number | null
} {
  const deductibles = policy.coverages
    .map(c => c.deductible)
    .filter((d): d is number => d !== null && d !== undefined)

  if (deductibles.length === 0) {
    return { average: null, max: null, toPremiumRatio: null }
  }

  const average = deductibles.reduce((a, b) => a + b, 0) / deductibles.length
  const max = Math.max(...deductibles)
  const toPremiumRatio = policy.premium
    ? average / policy.premium
    : null

  return { average, max, toPremiumRatio }
}

/**
 * Get provider metrics
 */
function getProviderMetrics(provider: string | null): {
  rating: number | null
  marketShare: number | null
  claimRatio: number | null
} {
  if (!provider) {
    return { rating: null, marketShare: null, claimRatio: null }
  }

  const normalizedProvider = provider.toLowerCase().trim()
  const rating = PROVIDER_RATINGS[normalizedProvider] ?? null

  // Get market share from MarketDataService if available
  // Default to null if not found
  const marketShare = rating ? (rating / 5) * 0.15 : null // Rough estimate

  // Claim ratio based on rating (inverse relationship)
  const claimRatio = rating ? 0.85 - (rating - 3) * 0.05 : null

  return { rating, marketShare, claimRatio }
}

/**
 * Calculate temporal features
 */
function calculateTemporalFeatures(policy: AnalyzedPolicy): {
  duration: number | null
  daysToExpiry: number | null
  isExpired: boolean
  renewalRequired: boolean
} {
  const now = Date.now()
  let duration: number | null = null
  let daysToExpiry: number | null = null
  let isExpired = false
  let renewalRequired = false

  if (policy.startDate && policy.expiryDate) {
    const start = new Date(policy.startDate).getTime()
    const end = new Date(policy.expiryDate).getTime()

    duration = Math.floor((end - start) / (1000 * 60 * 60 * 24))
    daysToExpiry = Math.floor((end - now) / (1000 * 60 * 60 * 24))
    isExpired = daysToExpiry < 0
    renewalRequired = daysToExpiry >= 0 && daysToExpiry <= 30
  }

  return { duration, daysToExpiry, isExpired, renewalRequired }
}

/**
 * Calculate pricing metrics
 */
function calculatePricingMetrics(
  policy: AnalyzedPolicy,
  policyType: PolicyType | null,
  region: TurkishRegion | null
): {
  percentile: number | null
  toMarketRatio: number | null
} {
  if (!policy.premium || !policyType) {
    return { percentile: null, toMarketRatio: null }
  }

  try {
    const benchmark = MarketDataService.analyzePolicyBenchmark(policy, region ?? undefined)
    // Convert percentage difference to ratio (e.g., -10% -> 0.9, +10% -> 1.1)
    const toMarketRatio = 1 + (benchmark.premiumVsAverage / 100)
    return {
      percentile: benchmark.premiumPercentile,
      toMarketRatio,
    }
  } catch {
    return { percentile: null, toMarketRatio: null }
  }
}

/**
 * Analyze exclusions for high-risk items
 */
function analyzeExclusions(policy: AnalyzedPolicy): {
  hasHighRisk: boolean
} {
  const exclusions = policy.exclusions ?? []
  const normalizedExclusions = exclusions.map(e => e.toLowerCase())

  const hasHighRisk = HIGH_RISK_EXCLUSIONS.some(risk =>
    normalizedExclusions.some(exc => exc.includes(risk))
  )

  return { hasHighRisk }
}

/**
 * Detect region from policy address
 */
function detectRegionFromPolicy(policy: AnalyzedPolicy): TurkishRegion | null {
  const address = policy.insuredAddress
  if (!address) return null

  return detectRegionFromAddress(address)
}

/**
 * Get region risk factor
 */
function getRegionRiskFactor(region: TurkishRegion): number {
  const factors: Record<TurkishRegion, number> = {
    marmara: 1.15,
    ege: 1.05,
    akdeniz: 1.00,
    ic_anadolu: 0.95,
    karadeniz: 0.90,
    dogu_anadolu: 0.85,
    guneydogu: 0.85,
  }
  return factors[region]
}

/**
 * Get urban vs rural factor
 */
function getUrbanFactor(policy: AnalyzedPolicy): number {
  const address = policy.insuredAddress?.toLowerCase() ?? ''

  // Major cities have higher risk factor
  const majorCities = ['istanbul', 'ankara', 'izmir', 'antalya', 'bursa', 'adana']

  if (majorCities.some(city => address.includes(city))) {
    return 1.2
  }

  // Secondary cities
  const secondaryCities = ['gaziantep', 'konya', 'mersin', 'kayseri', 'eskişehir']

  if (secondaryCities.some(city => address.includes(city))) {
    return 1.1
  }

  // Rural areas
  return 0.9
}

/**
 * Normalize features for model input
 */
export function normalizeFeatures(features: RiskFeatures): Record<string, number> {
  return {
    // Coverage features (0-1 scale)
    coverage_ratio: features.coverageRatio,
    coverage_gap_normalized: Math.min(features.coverageGapCount / 5, 1),
    has_minimum: features.hasMinimumCoverages ? 0 : 1, // Risk is 1 if missing

    // Deductible features
    deductible_ratio: Math.min(features.deductibleToPremiumRatio ?? 0, 1),

    // Provider features
    provider_score: features.providerRating
      ? 1 - (features.providerRating - 1) / 4  // Invert: lower rating = higher risk
      : 0.5,

    // Temporal features
    expiry_risk: features.isExpired
      ? 1
      : features.renewalRequired
        ? 0.7
        : Math.max(0, 1 - (features.daysToExpiry ?? 365) / 365),

    // Geographic features
    region_risk: (features.regionRiskFactor - 0.8) / 0.7, // Normalize to 0-1
    urban_risk: (features.urbanFactor - 0.9) / 0.3,

    // Exclusion features
    exclusion_risk: features.hasHighRiskExclusions ? 0.8 : 0.2,
    condition_complexity: Math.min(features.specialConditionCount / 10, 1),

    // Pricing features
    pricing_risk: features.priceToMarketRatio !== null
      ? Math.abs(features.priceToMarketRatio - 1)
      : 0.5,
  }
}
