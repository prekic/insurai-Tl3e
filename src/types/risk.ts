/**
 * Risk Scoring Types
 * ML-based risk assessment for insurance policies
 */

import type { PolicyType } from './policy'

/**
 * Risk level categories
 */
export type RiskLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high'

/**
 * Risk category for classification
 */
export type RiskCategory =
  | 'coverage_gaps'      // Missing or insufficient coverage
  | 'pricing'            // Premium vs market pricing
  | 'provider'           // Insurance company stability
  | 'temporal'           // Policy timing and expiration
  | 'geographic'         // Location-based risks
  | 'concentration'      // Over-reliance on single coverage
  | 'deductible'         // High deductible exposure
  | 'exclusions'         // Risky exclusions present

/**
 * Individual risk factor with score and explanation
 */
export interface RiskFactor {
  category: RiskCategory
  name: string
  score: number           // 0-100, higher = more risk
  weight: number          // Importance weight 0-1
  level: RiskLevel
  description: string
  recommendation?: string
  confidence: number      // Model confidence 0-1
}

/**
 * Composite risk score with breakdown
 */
export interface RiskScore {
  // Overall risk score (0-100, higher = more risk)
  overall: number
  level: RiskLevel

  // Category-level scores
  categories: {
    [K in RiskCategory]?: {
      score: number
      level: RiskLevel
      factors: RiskFactor[]
    }
  }

  // Top risk factors sorted by impact
  topFactors: RiskFactor[]

  // Confidence in the assessment
  confidence: {
    overall: number
    dataQuality: number    // How complete is the input data
    modelCertainty: number // How confident is the model
  }

  // Comparison to market
  percentile: number       // Risk percentile vs similar policies

  // Metadata
  calculatedAt: number
  modelVersion: string
}

/**
 * Risk prediction with confidence intervals
 */
export interface RiskPrediction {
  // Point estimate
  expectedRisk: number

  // Confidence intervals
  intervals: {
    low: number    // 10th percentile
    median: number // 50th percentile
    high: number   // 90th percentile
  }

  // Probability of risk levels
  probabilities: {
    [K in RiskLevel]: number
  }

  // Trend analysis
  trend: 'improving' | 'stable' | 'worsening'
  trendConfidence: number
}

/**
 * Risk model features extracted from policy
 */
export interface RiskFeatures {
  // Policy characteristics
  policyType: PolicyType | null
  premiumAmount: number | null
  totalCoverageLimit: number | null
  coverageCount: number

  // Coverage quality
  hasMinimumCoverages: boolean
  coverageGapCount: number
  coverageRatio: number           // Actual vs recommended

  // Deductible exposure
  averageDeductible: number | null
  maxDeductible: number | null
  deductibleToPremiumRatio: number | null

  // Provider characteristics
  providerRating: number | null   // 1-5 stars
  providerMarketShare: number | null
  providerClaimRatio: number | null

  // Temporal features
  policyDuration: number | null   // Days
  daysToExpiry: number | null
  isExpired: boolean
  renewalRequired: boolean

  // Geographic features
  regionRiskFactor: number        // 0.8-1.5
  urbanFactor: number             // Urban vs rural risk

  // Exclusions & conditions
  exclusionCount: number
  hasHighRiskExclusions: boolean
  specialConditionCount: number

  // Pricing features
  premiumPercentile: number | null
  priceToMarketRatio: number | null
}

/**
 * Historical risk data for trend analysis
 */
export interface RiskHistory {
  timestamp: number
  score: number
  level: RiskLevel
  topFactors: string[]
}

/**
 * Risk comparison between policies
 */
export interface RiskComparison {
  policyId: string
  policyType: PolicyType | null
  riskScore: number
  riskLevel: RiskLevel
  keyDifferences: {
    factor: string
    thisPolicy: number
    otherPolicy: number
    impact: 'better' | 'worse' | 'similar'
  }[]
}

/**
 * Risk mitigation recommendation
 */
export interface RiskMitigation {
  priority: 'critical' | 'high' | 'medium' | 'low'
  category: RiskCategory
  issue: string
  recommendation: string
  expectedImpact: number  // Points of risk reduction
  estimatedCost?: number  // Estimated premium increase
  difficulty: 'easy' | 'moderate' | 'complex'
}

/**
 * Complete risk assessment result
 */
export interface RiskAssessment {
  // Core scores
  score: RiskScore
  prediction: RiskPrediction

  // Features used in calculation
  features: RiskFeatures

  // Actionable recommendations
  mitigations: RiskMitigation[]

  // Portfolio context (if multiple policies)
  portfolioContext?: {
    totalPolicies: number
    averageRisk: number
    correlatedRisks: string[]
  }
}

/**
 * Risk model configuration
 */
export interface RiskModelConfig {
  version: string

  // Feature weights by category
  weights: {
    [K in RiskCategory]: number
  }

  // Thresholds for risk levels
  thresholds: {
    very_low: number    // 0-20
    low: number         // 21-35
    moderate: number    // 36-55
    high: number        // 56-75
    very_high: number   // 76-100
  }

  // Policy type specific adjustments
  policyTypeFactors: {
    [K in PolicyType]?: number
  }
}

/**
 * Default risk level thresholds
 */
export const RISK_THRESHOLDS = {
  very_low: 20,
  low: 35,
  moderate: 55,
  high: 75,
  very_high: 100,
} as const

/**
 * Default category weights
 */
export const DEFAULT_CATEGORY_WEIGHTS: Record<RiskCategory, number> = {
  coverage_gaps: 0.25,
  pricing: 0.15,
  provider: 0.15,
  temporal: 0.10,
  geographic: 0.10,
  concentration: 0.10,
  deductible: 0.10,
  exclusions: 0.05,
}

/**
 * Get risk level from score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score <= RISK_THRESHOLDS.very_low) return 'very_low'
  if (score <= RISK_THRESHOLDS.low) return 'low'
  if (score <= RISK_THRESHOLDS.moderate) return 'moderate'
  if (score <= RISK_THRESHOLDS.high) return 'high'
  return 'very_high'
}

/**
 * Get human-readable risk level label
 */
export function getRiskLevelLabel(level: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    very_low: 'Çok Düşük Risk',
    low: 'Düşük Risk',
    moderate: 'Orta Risk',
    high: 'Yüksek Risk',
    very_high: 'Çok Yüksek Risk',
  }
  return labels[level]
}

/**
 * Get risk level color for UI
 */
export function getRiskLevelColor(level: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    very_low: '#22c55e',  // green-500
    low: '#84cc16',       // lime-500
    moderate: '#eab308',  // yellow-500
    high: '#f97316',      // orange-500
    very_high: '#ef4444', // red-500
  }
  return colors[level]
}
