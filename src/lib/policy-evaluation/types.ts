/**
 * Policy Evaluation Types
 *
 * Types for policy evaluation against market benchmarks
 * and multi-policy comparison functionality.
 */

import type { Policy, PolicyType } from '@/types/policy'

// =============================================================================
// EVALUATION RESULT TYPES
// =============================================================================

export type EvaluationGrade = 'A' | 'B' | 'C' | 'D' | 'F'
export type EvaluationStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'critical'

export interface ScoreBreakdown {
  category: string
  categoryTR: string
  score: number // 0-100
  weight: number // Percentage weight
  details: string
  detailsTR: string
  issues: string[]
  issuesTR: string[]
}

export interface PolicyEvaluation {
  // Policy reference
  policyId: string
  policyNumber: string
  policyType: PolicyType
  evaluatedAt: string

  // Overall scores
  overallScore: number // 0-100
  grade: EvaluationGrade
  status: EvaluationStatus

  // Category scores
  scoreBreakdown: {
    premium: ScoreBreakdown
    coverage: ScoreBreakdown
    deductible: ScoreBreakdown
    compliance: ScoreBreakdown
    value: ScoreBreakdown // Value for money
  }

  // Market comparison
  marketComparison: {
    premiumPercentile: number // Where this policy falls (0-100)
    coveragePercentile: number
    isAboveAverageValue: boolean
    competitivePosition: 'leader' | 'competitive' | 'average' | 'below_average' | 'lagging'
  }

  // Regulatory compliance
  compliance: {
    isCompliant: boolean
    mandatoryMet: boolean
    minimumLimitsMet: boolean
    issues: ComplianceIssue[]
  }

  // Recommendations
  recommendations: Recommendation[]

  // Summary
  summary: {
    strengths: string[]
    strengthsTR: string[]
    weaknesses: string[]
    weaknessesTR: string[]
    immediateActions: string[]
    immediateActionsTR: string[]
  }
}

export interface ComplianceIssue {
  type: 'missing_coverage' | 'below_minimum' | 'expired' | 'regulatory'
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  descriptionTR: string
  regulation?: string
  requiredValue?: number
  actualValue?: number
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low'
  type: 'increase_coverage' | 'reduce_deductible' | 'add_coverage' | 'review_premium' | 'compliance' | 'optimize'
  title: string
  titleTR: string
  description: string
  descriptionTR: string
  estimatedImpact?: {
    premiumChange?: number
    coverageChange?: number
    riskReduction?: number
  }
}

// =============================================================================
// MULTI-POLICY COMPARISON TYPES
// =============================================================================

export interface ComparisonPolicy {
  policy: Policy
  evaluation: PolicyEvaluation
  label?: string // Custom label like "Current Policy", "Option A"
}

export interface CoverageComparison {
  coverageName: string
  coverageNameTR: string
  policies: {
    policyId: string
    included: boolean
    limit: number
    deductible: number
    score: number // Relative score 0-100
  }[]
  bestPolicyId: string
  worstPolicyId: string
  marketBenchmark?: number
}

export interface PolicyComparison {
  comparedAt: string
  policies: ComparisonPolicy[]

  // Winner by category
  winners: {
    overallBest: string // policyId
    bestPremium: string
    bestCoverage: string
    bestValue: string
    bestCompliance: string
  }

  // Side-by-side metrics
  metrics: ComparisonMetric[]

  // Coverage comparison matrix
  coverageMatrix: CoverageComparison[]

  // Relative rankings
  rankings: {
    policyId: string
    overallRank: number
    premiumRank: number
    coverageRank: number
    valueRank: number
  }[]

  // Analysis summary
  analysis: {
    recommendation: string
    recommendationTR: string
    keyDifferences: KeyDifference[]
    tradeoffs: Tradeoff[]
  }
}

export interface ComparisonMetric {
  name: string
  nameTR: string
  unit: string
  values: {
    policyId: string
    value: number | string
    isBest: boolean
    isWorst: boolean
    percentile?: number
  }[]
  marketBenchmark?: number
  higherIsBetter: boolean
}

export interface KeyDifference {
  aspect: string
  aspectTR: string
  description: string
  descriptionTR: string
  significance: 'major' | 'moderate' | 'minor'
  favoredPolicy: string // policyId
}

export interface Tradeoff {
  option1: {
    policyId: string
    advantage: string
    advantageTR: string
  }
  option2: {
    policyId: string
    advantage: string
    advantageTR: string
  }
  recommendation: string
  recommendationTR: string
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface EvaluationConfig {
  // Weight distribution for scoring (should sum to 100)
  weights: {
    premium: number
    coverage: number
    deductible: number
    compliance: number
    value: number
  }

  // Strictness levels
  strictCompliance: boolean
  includeOptionalCoverages: boolean

  // Market comparison settings
  useRegionalBenchmarks: boolean
  region?: string
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  weights: {
    premium: 20,
    coverage: 30,
    deductible: 15,
    compliance: 20,
    value: 15,
  },
  strictCompliance: true,
  includeOptionalCoverages: true,
  useRegionalBenchmarks: true,
}

// =============================================================================
// HELPER TYPE GUARDS
// =============================================================================

export function isExcellent(score: number): boolean {
  return score >= 90
}

export function isGood(score: number): boolean {
  return score >= 75 && score < 90
}

export function isFair(score: number): boolean {
  return score >= 60 && score < 75
}

export function isPoor(score: number): boolean {
  return score >= 40 && score < 60
}

export function isCritical(score: number): boolean {
  return score < 40
}

export function getGradeFromScore(score: number): EvaluationGrade {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export function getStatusFromScore(score: number): EvaluationStatus {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 60) return 'fair'
  if (score >= 40) return 'poor'
  return 'critical'
}
