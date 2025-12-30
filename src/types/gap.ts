/**
 * Comprehensive Gap Detection Types
 * Structured taxonomy for insurance policy gap analysis
 */

import type { PolicyType } from './policy'
import type { TurkishRegion, CoverageBenchmark } from './market-data'

// =============================================================================
// Gap Categories
// =============================================================================

/**
 * Primary gap categories
 */
export type GapCategory =
  | 'coverage'     // Missing or incomplete coverage
  | 'limit'        // Insufficient coverage limits
  | 'deductible'   // High deductible issues
  | 'exclusion'    // Problematic exclusions
  | 'temporal'     // Coverage period gaps
  | 'compliance'   // Regulatory compliance issues
  | 'portfolio'    // Cross-policy gaps

/**
 * Gap sub-categories for detailed classification
 */
export type GapSubCategory =
  // Coverage sub-categories
  | 'missing_critical'     // Critical coverage not present
  | 'missing_recommended'  // Recommended coverage not present
  | 'missing_optional'     // Optional coverage not present
  | 'partial_coverage'     // Coverage exists but incomplete
  // Limit sub-categories
  | 'severely_underinsured' // <40% of market average
  | 'underinsured'          // 40-70% of market average
  | 'marginally_low'        // 70-90% of market average
  // Deductible sub-categories
  | 'excessive_deductible'  // >2x market average
  | 'high_deductible'       // 1.5-2x market average
  | 'above_average'         // 1.2-1.5x market average
  // Exclusion sub-categories
  | 'high_risk_exclusion'   // Critical risk excluded
  | 'common_claim_excluded' // Frequently claimed items excluded
  | 'regional_risk'         // Region-specific risk excluded
  // Temporal sub-categories
  | 'coverage_lapse'        // Gap between policies
  | 'expiring_soon'         // Policy expiring within 30 days
  | 'retroactive_gap'       // No retroactive coverage
  | 'waiting_period'        // Waiting period issues
  // Compliance sub-categories
  | 'mandatory_missing'     // Required by law but missing
  | 'regulatory_shortfall'  // Below regulatory minimums
  | 'documentation_gap'     // Required documentation missing
  // Portfolio sub-categories
  | 'overlap'               // Duplicate coverage
  | 'coordination_gap'      // Poor coordination between policies
  | 'asset_uncovered'       // Asset not covered by any policy

// =============================================================================
// Gap Severity
// =============================================================================

/**
 * Gap severity levels with clear thresholds
 */
export type GapSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/**
 * Severity configuration with scoring weights
 */
export interface SeverityConfig {
  level: GapSeverity
  label: string
  labelTr: string
  color: string
  weight: number
  urgencyDays: number | null
}

/**
 * Severity configurations
 */
export const GAP_SEVERITY_CONFIG: Record<GapSeverity, SeverityConfig> = {
  critical: {
    level: 'critical',
    label: 'Critical',
    labelTr: 'Kritik',
    color: 'red',
    weight: 100,
    urgencyDays: 7,
  },
  high: {
    level: 'high',
    label: 'High',
    labelTr: 'Yüksek',
    color: 'orange',
    weight: 75,
    urgencyDays: 14,
  },
  medium: {
    level: 'medium',
    label: 'Medium',
    labelTr: 'Orta',
    color: 'yellow',
    weight: 50,
    urgencyDays: 30,
  },
  low: {
    level: 'low',
    label: 'Low',
    labelTr: 'Düşük',
    color: 'blue',
    weight: 25,
    urgencyDays: 90,
  },
  info: {
    level: 'info',
    label: 'Informational',
    labelTr: 'Bilgi',
    color: 'gray',
    weight: 10,
    urgencyDays: null,
  },
}

// =============================================================================
// Gap Definition
// =============================================================================

/**
 * A detected gap in coverage
 */
export interface DetectedGap {
  // Identification
  id: string
  category: GapCategory
  subCategory: GapSubCategory

  // Description
  title: string
  titleTr: string
  description: string
  descriptionTr: string

  // Severity
  severity: GapSeverity
  severityScore: number // 0-100

  // Impact
  financialImpact: {
    potentialLoss: number
    probability: number // 0-1
    expectedLoss: number // potentialLoss * probability
  }

  // Context
  affectedCoverage?: string
  affectedCoverageTr?: string
  marketReference?: {
    benchmark: CoverageBenchmark
    comparison: 'below' | 'missing' | 'excluded'
    percentile: number // Where this falls in market
  }

  // Remediation
  remediation: GapRemediation

  // Metadata
  detectedAt: string
  confidence: number // 0-1
  source: 'coverage' | 'limit' | 'deductible' | 'exclusion' | 'temporal' | 'compliance' | 'portfolio'
}

/**
 * Remediation action for a gap
 */
export interface GapRemediation {
  action: string
  actionTr: string
  estimatedCost: number | null
  difficulty: 'easy' | 'moderate' | 'complex'
  timeToResolve: string // e.g., "1-2 days", "1 week"
  steps: string[]
  stepsTr: string[]
  alternatives?: {
    action: string
    actionTr: string
    tradeoff: string
  }[]
}

// =============================================================================
// Gap Analysis Results
// =============================================================================

/**
 * Comprehensive gap analysis result
 */
export interface ComprehensiveGapAnalysis {
  // Summary
  overallScore: number // 0-100 (0 = no gaps, 100 = severe gaps)
  gapCount: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }

  // Categorized gaps
  gaps: DetectedGap[]
  gapsByCategory: Record<GapCategory, DetectedGap[]>
  gapsBySeverity: Record<GapSeverity, DetectedGap[]>

  // Financial summary
  financialSummary: {
    totalPotentialLoss: number
    totalExpectedLoss: number
    estimatedRemediationCost: number
    costBenefitRatio: number // expected loss / remediation cost
  }

  // Priority list
  prioritizedGaps: PrioritizedGap[]

  // Recommendations
  topRecommendations: GapRecommendation[]

  // Metadata
  analyzedAt: string
  policyId: string
  policyType: PolicyType
  region?: TurkishRegion
  confidence: number
}

/**
 * Gap with priority score
 */
export interface PrioritizedGap {
  gap: DetectedGap
  priorityScore: number // 0-100
  priorityRank: number
  urgencyLevel: 'immediate' | 'soon' | 'planned' | 'monitor'
  reasoning: string
}

/**
 * Actionable recommendation
 */
export interface GapRecommendation {
  id: string
  title: string
  titleTr: string
  description: string
  descriptionTr: string

  // What gaps this addresses
  addressesGaps: string[] // gap IDs

  // Impact if implemented
  impactScore: number // 0-100
  gapsResolved: number
  riskReduction: number // percentage

  // Cost-benefit
  estimatedCost: number
  expectedSavings: number
  roi: number // (savings - cost) / cost

  // Implementation
  difficulty: 'easy' | 'moderate' | 'complex'
  timeframe: string
  priority: 1 | 2 | 3 | 4 | 5
}

// =============================================================================
// Gap Detection Configuration
// =============================================================================

/**
 * Configuration for gap detection
 */
export interface GapDetectionConfig {
  // Thresholds
  thresholds: {
    missingCoverageMinInclusionRate: number // Min market inclusion rate to flag as missing
    underinsuredThreshold: number // % below market average to flag
    highDeductibleMultiplier: number // Multiple of market average to flag
    expiryWarningDays: number // Days before expiry to warn
  }

  // Weights for scoring
  categoryWeights: Record<GapCategory, number>

  // Policy type specific rules
  policyTypeRules: Partial<Record<PolicyType, PolicyTypeGapRules>>

  // Regional considerations
  regionRules: Partial<Record<TurkishRegion, RegionalGapRules>>
}

/**
 * Policy type specific gap detection rules
 */
export interface PolicyTypeGapRules {
  mandatoryCoverages: string[]
  criticalExclusions: string[]
  minimumLimits: Record<string, number>
  typicalDeductibles: Record<string, number>
}

/**
 * Regional gap detection rules
 */
export interface RegionalGapRules {
  earthquakeRisk: 'low' | 'medium' | 'high' | 'very_high'
  floodRisk: 'low' | 'medium' | 'high'
  regionalCoverages: string[]
  riskMultiplier: number
}

/**
 * Default gap detection configuration
 */
export const DEFAULT_GAP_CONFIG: GapDetectionConfig = {
  thresholds: {
    missingCoverageMinInclusionRate: 50,
    underinsuredThreshold: 70, // Flag if below 70% of market average
    highDeductibleMultiplier: 1.5,
    expiryWarningDays: 30,
  },
  categoryWeights: {
    coverage: 30,
    limit: 25,
    deductible: 15,
    exclusion: 15,
    temporal: 10,
    compliance: 5,
    portfolio: 0, // Only applies to multi-policy analysis
  },
  policyTypeRules: {
    home: {
      mandatoryCoverages: ['yangın', 'deprem', 'hırsızlık'],
      criticalExclusions: ['deprem', 'sel', 'hırsızlık'],
      minimumLimits: { 'yangın': 500000, 'hırsızlık': 50000 },
      typicalDeductibles: { 'yangın': 1000, 'hırsızlık': 500 },
    },
    kasko: {
      mandatoryCoverages: ['hasar', 'hırsızlık', 'cam kırılması'],
      criticalExclusions: ['hırsızlık', 'deprem'],
      minimumLimits: { 'hasar': 200000, 'hırsızlık': 100000 },
      typicalDeductibles: { 'hasar': 2000, 'hırsızlık': 1000 },
    },
    health: {
      mandatoryCoverages: ['yatış', 'ameliyat', 'ayakta tedavi'],
      criticalExclusions: ['kanser', 'kronik hastalık'],
      minimumLimits: { 'yatış': 1000000, 'ameliyat': 500000 },
      typicalDeductibles: { 'ayakta': 100, 'yatış': 0 },
    },
    business: {
      mandatoryCoverages: ['yangın', 'hırsızlık', 'sorumluluk'],
      criticalExclusions: ['iş durması', 'siber saldırı'],
      minimumLimits: { 'yangın': 1000000, 'sorumluluk': 500000 },
      typicalDeductibles: { 'yangın': 5000, 'hırsızlık': 2500 },
    },
  },
  regionRules: {
    marmara: {
      earthquakeRisk: 'very_high',
      floodRisk: 'medium',
      regionalCoverages: ['deprem'],
      riskMultiplier: 1.3,
    },
    ege: {
      earthquakeRisk: 'high',
      floodRisk: 'low',
      regionalCoverages: ['deprem'],
      riskMultiplier: 1.2,
    },
    akdeniz: {
      earthquakeRisk: 'medium',
      floodRisk: 'medium',
      regionalCoverages: ['sel'],
      riskMultiplier: 1.1,
    },
    karadeniz: {
      earthquakeRisk: 'medium',
      floodRisk: 'high',
      regionalCoverages: ['sel', 'heyelan'],
      riskMultiplier: 1.15,
    },
    ic_anadolu: {
      earthquakeRisk: 'medium',
      floodRisk: 'low',
      regionalCoverages: [],
      riskMultiplier: 1.0,
    },
    dogu_anadolu: {
      earthquakeRisk: 'very_high',
      floodRisk: 'low',
      regionalCoverages: ['deprem'],
      riskMultiplier: 1.25,
    },
    guneydogu: {
      earthquakeRisk: 'high',
      floodRisk: 'low',
      regionalCoverages: ['deprem'],
      riskMultiplier: 1.15,
    },
  },
}

// =============================================================================
// Gap Trend Tracking
// =============================================================================

/**
 * Historical gap tracking
 */
export interface GapHistory {
  policyId: string
  analyses: {
    date: string
    overallScore: number
    gapCount: number
    criticalCount: number
  }[]
  trend: 'improving' | 'stable' | 'worsening'
  changeRate: number // % change per analysis
}

/**
 * Gap trend summary
 */
export interface GapTrend {
  category: GapCategory
  trend: 'improving' | 'stable' | 'worsening'
  previousScore: number
  currentScore: number
  change: number
  changePercent: number
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get severity color for UI
 */
export function getGapSeverityColor(severity: GapSeverity): string {
  return GAP_SEVERITY_CONFIG[severity].color
}

/**
 * Get severity label in Turkish
 */
export function getGapSeverityLabel(severity: GapSeverity, turkish = false): string {
  const config = GAP_SEVERITY_CONFIG[severity]
  return turkish ? config.labelTr : config.label
}

/**
 * Calculate priority score for a gap
 */
export function calculateGapPriority(gap: DetectedGap): number {
  const severityWeight = GAP_SEVERITY_CONFIG[gap.severity].weight
  const financialWeight = Math.min(100, gap.financialImpact.expectedLoss / 10000 * 50)
  const confidenceWeight = gap.confidence * 20
  const remediationEase = gap.remediation.difficulty === 'easy' ? 30 :
                          gap.remediation.difficulty === 'moderate' ? 20 : 10

  return Math.min(100, (severityWeight * 0.4) + (financialWeight * 0.3) +
                       (confidenceWeight * 0.15) + (remediationEase * 0.15))
}

/**
 * Determine urgency level from priority score
 */
export function getUrgencyLevel(priorityScore: number): PrioritizedGap['urgencyLevel'] {
  if (priorityScore >= 80) return 'immediate'
  if (priorityScore >= 60) return 'soon'
  if (priorityScore >= 40) return 'planned'
  return 'monitor'
}

/**
 * Generate gap ID
 */
export function generateGapId(category: GapCategory, subCategory: GapSubCategory, index: number): string {
  return `gap-${category}-${subCategory}-${index}-${Date.now().toString(36)}`
}
