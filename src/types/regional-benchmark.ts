/**
 * Regional Benchmarking Types
 * Location intelligence for Turkish insurance market
 */

import type { PolicyType } from './policy'
import type { TurkishRegion } from './market-data'

// =============================================================================
// Province Types
// =============================================================================

/**
 * Turkish province (il) codes following official numbering
 */
export type ProvinceCode =
  | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10'
  | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20'
  | '21' | '22' | '23' | '24' | '25' | '26' | '27' | '28' | '29' | '30'
  | '31' | '32' | '33' | '34' | '35' | '36' | '37' | '38' | '39' | '40'
  | '41' | '42' | '43' | '44' | '45' | '46' | '47' | '48' | '49' | '50'
  | '51' | '52' | '53' | '54' | '55' | '56' | '57' | '58' | '59' | '60'
  | '61' | '62' | '63' | '64' | '65' | '66' | '67' | '68' | '69' | '70'
  | '71' | '72' | '73' | '74' | '75' | '76' | '77' | '78' | '79' | '80' | '81'

/**
 * Province information
 */
export interface Province {
  code: ProvinceCode
  name: string
  nameTr: string
  region: TurkishRegion
  population: number
  area: number // km²
  density: number // people/km²
  urbanRatio: number // 0-1
  coordinates: {
    lat: number
    lng: number
  }
}

// =============================================================================
// Risk Factor Types
// =============================================================================

/**
 * Natural disaster risk levels
 */
export type RiskLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high'

/**
 * Earthquake zone classification (AFAD)
 */
export type EarthquakeZone = 1 | 2 | 3 | 4 | 5

/**
 * Regional risk profile
 */
export interface RegionalRiskProfile {
  region: TurkishRegion
  provinceCode?: ProvinceCode

  // Natural disaster risks
  earthquake: {
    zone: EarthquakeZone
    level: RiskLevel
    historicalEvents: number // Count in last 20 years
    avgMagnitude: number
  }
  flood: {
    level: RiskLevel
    annualFrequency: number
    avgDamage: number // TRY
  }
  fire: {
    forestFireRisk: RiskLevel
    urbanFireRate: number // per 100k population
  }
  storm: {
    level: RiskLevel
    annualEvents: number
  }

  // Crime & security risks
  crime: {
    theftRate: number // per 100k population
    vehicleTheftRate: number
    burglaryRate: number
    overallLevel: RiskLevel
  }

  // Traffic risks
  traffic: {
    accidentRate: number // per 100k vehicles
    fatalityRate: number
    congestionLevel: RiskLevel
  }

  // Health risks
  health: {
    hospitalDensity: number // per 100k population
    avgResponseTime: number // minutes
    healthcareAccess: RiskLevel // lower = better access
  }
}

// =============================================================================
// Regional Benchmark Types
// =============================================================================

/**
 * Regional insurance statistics
 */
export interface RegionalInsuranceStats {
  region: TurkishRegion
  provinceCode?: ProvinceCode

  // Market size
  totalPolicies: number
  totalPremiumVolume: number // TRY
  marketPenetration: number // 0-1
  insurancePerCapita: number // TRY

  // By policy type
  policyDistribution: Record<PolicyType, {
    count: number
    premiumVolume: number
    avgPremium: number
    marketShare: number // within region
  }>

  // Claims data
  claimsData: {
    totalClaims: number
    claimsPaid: number // TRY
    avgClaimAmount: number
    claimsRatio: number // claims / premiums
    avgSettlementDays: number
  }

  // Growth trends
  growth: {
    yoyPremiumGrowth: number
    yoyPolicyGrowth: number
    yoyClaimsGrowth: number
  }

  dataDate: string
  source: string
}

/**
 * Regional premium benchmarks
 */
export interface RegionalPremiumBenchmark {
  region: TurkishRegion
  provinceCode?: ProvinceCode
  policyType: PolicyType

  // Premium statistics (annual, TRY)
  premium: {
    min: number
    max: number
    average: number
    median: number
    percentile10: number
    percentile25: number
    percentile75: number
    percentile90: number
  }

  // Comparison to national average
  vsNational: {
    difference: number // TRY
    percentage: number // % difference
    ranking: number // 1 = cheapest region
    totalRegions: number
  }

  // Factors affecting premium
  factors: {
    riskAdjustment: number // 0.5-2.0
    competitionAdjustment: number
    claimsHistoryAdjustment: number
    regulatoryAdjustment: number
  }

  // Trend
  trend: {
    direction: 'increasing' | 'stable' | 'decreasing'
    yoyChange: number
    projection6m: number
  }
}

/**
 * Regional comparison result
 */
export interface RegionalComparison {
  sourceRegion: TurkishRegion
  targetRegion: TurkishRegion
  policyType: PolicyType

  // Premium comparison
  premiumDifference: {
    amount: number
    percentage: number
    sourceRank: number
    targetRank: number
  }

  // Risk comparison
  riskComparison: {
    sourceRiskScore: number
    targetRiskScore: number
    primaryRiskDifference: string
  }

  // Market comparison
  marketComparison: {
    sourcePenetration: number
    targetPenetration: number
    sourceCompetition: number
    targetCompetition: number
  }

  // Insights
  insights: RegionalInsight[]
}

/**
 * Regional insight
 */
export interface RegionalInsight {
  type: 'advantage' | 'disadvantage' | 'neutral' | 'recommendation'
  category: 'premium' | 'risk' | 'coverage' | 'market' | 'regulatory'
  message: string
  messageTr: string
  impact: 'high' | 'medium' | 'low'
}

// =============================================================================
// Location Intelligence Types
// =============================================================================

/**
 * Location analysis result
 */
export interface LocationAnalysis {
  // Detected location
  province: Province
  region: TurkishRegion
  confidence: number // 0-1

  // Risk assessment
  riskProfile: RegionalRiskProfile
  overallRiskScore: number // 0-100
  riskRanking: number // among all provinces

  // Insurance context
  insuranceStats: RegionalInsuranceStats
  premiumBenchmarks: Record<PolicyType, RegionalPremiumBenchmark>

  // Recommendations
  recommendations: LocationRecommendation[]
}

/**
 * Location-based recommendation
 */
export interface LocationRecommendation {
  type: 'coverage' | 'provider' | 'premium' | 'risk_mitigation'
  priority: 'high' | 'medium' | 'low'
  title: string
  titleTr: string
  description: string
  descriptionTr: string
  estimatedImpact?: {
    premiumChange?: number
    riskReduction?: number
  }
}

/**
 * Nearby comparison for relocation analysis
 */
export interface NearbyComparison {
  currentProvince: Province
  nearbyProvinces: {
    province: Province
    distance: number // km
    premiumDifference: Record<PolicyType, number>
    riskDifference: number
    advantages: string[]
    disadvantages: string[]
  }[]
}

// =============================================================================
// Aggregate Statistics
// =============================================================================

/**
 * National aggregate statistics
 */
export interface NationalStatistics {
  totalPolicies: number
  totalPremiumVolume: number
  marketPenetration: number
  avgPremiumPerCapita: number

  byRegion: Record<TurkishRegion, {
    policyCount: number
    premiumVolume: number
    marketShare: number
    penetration: number
  }>

  byPolicyType: Record<PolicyType, {
    policyCount: number
    premiumVolume: number
    avgPremium: number
    growth: number
  }>

  trends: {
    yoyGrowth: number
    projectedGrowth: number
    marketConcentration: number // HHI index
  }

  dataDate: string
  source: string
}

/**
 * Regional ranking
 */
export interface RegionalRanking {
  policyType: PolicyType
  metric: 'premium' | 'claims' | 'penetration' | 'risk' | 'value'

  rankings: {
    rank: number
    region: TurkishRegion
    value: number
    vsAverage: number
  }[]

  insights: string[]
}
