import type { Evidence } from '@/types/policy'
import type { ValidationResult } from '@/lib/ai/validator'

// ============================================================================
// WORKSTREAM A: SCORING BUNDLE
// ============================================================================

export type ScoreFamily =
  | 'extractionQualityScore'
  | 'policyStructureScore'
  | 'consumerSafetyScore'
  | 'competitivenessScore'
  | 'riskAttentionScore'

export interface ScoreDetail {
  scoreName: ScoreFamily
  scoreValue: number
  scoreScale: number
  scoreVersion: string
  scoreInputs: Record<string, unknown>
  scoreRulesApplied: string[]
  confidence: number
  evidenceRefs?: Evidence[]
  benchmarkRefs?: string[]
  warnings: string[]
  generatedAt: string
  /** When true, this score was suppressed because required inputs are missing */
  suppressed?: boolean
  /** Human-readable reason explaining why this score was suppressed */
  suppressionReason?: string
}

/**
 * Internal-only composite score derived from policy-fact scores only.
 * MUST NOT be rendered to consumers. Exists solely for internal triage/routing.
 */
export interface InternalOverallScore {
  /** The numerical composite value */
  value: number
  /** Derivation rule describing how the value was computed */
  derivationRule: string
  /** Which score families contributed to this composite */
  contributingFamilies: ScoreFamily[]
  /** Hard flag: this value is never consumer-facing */
  internalOnly: true
}

export interface ScoreBundle {
  /** Internal-only composite score for triage. Never rendered to consumers. */
  internalOverallScore: InternalOverallScore
  scores: Record<string, ScoreDetail>
  bundleVersion: string
  generatedAt: string
}

// ============================================================================
// WORKSTREAM B: INSIGHT BUNDLE
// ============================================================================

export type InsightCategory =
  | 'positive_confirmed'
  | 'positive_conditional'
  | 'caution_confirmed'
  | 'caution_conditional'
  | 'benchmark_observation'
  | 'unresolved_data_gap'

export type InsightBasisType =
  | 'policy_fact'
  | 'conditional_policy_fact'
  | 'benchmark'
  | 'unresolved'

export interface InsightDetail {
  id: string
  type: InsightCategory
  severity: 'low' | 'medium' | 'high' | 'critical'
  text_internal: string
  basisType: InsightBasisType
  evidenceRefs?: Evidence[]
  benchmarkRefId?: string
  displayEligibility: boolean
  blockingReason?: string
  generatedByRule: string
  generatedAt: string
}

export interface InsightBundle {
  insights: InsightDetail[]
  bundleVersion: string
  generatedAt: string
}

// ============================================================================
// WORKSTREAM C: BENCHMARK BUNDLE
// ============================================================================

/**
 * Full provenance object for a benchmark data source.
 * Every field is mandatory for display eligibility except `notes` and `referenceId`.
 */
export interface BenchmarkProvenance {
  sourceName: string
  sourceVersion: string
  geography: string
  effectiveDateRange: { start: string; end?: string }
  marketSegment: string
  productType: string
  matchType: 'exact' | 'approximate' | 'inferred'
  matchConfidence: number
  dataQuality: 'high' | 'medium' | 'low'
  notes?: string
  /** Optional secondary identifier for cross-referencing */
  referenceId?: string
}

export interface BenchmarkReference {
  benchmarkId: string
  branch: string
  provenance: BenchmarkProvenance
  metricName: string
  metricValue: number | string
  currency?: string
}

export interface BenchmarkComparison {
  comparisonId: string
  benchmarkId: string
  comparedField: string
  policyValue: number | string
  benchmarkValue: number | string
  difference: number | string
  confidence: number
  displayEligibility: boolean
  reasonIfSuppressed?: string
}

export interface BenchmarkBundle {
  references: Record<string, BenchmarkReference>
  comparisons: BenchmarkComparison[]
  bundleVersion: string
  generatedAt: string
}

// ============================================================================
// WORKSTREAM D: UNIFIED ANALYSIS BUNDLE
// ============================================================================

export interface AnalysisBundle {
  policyId: string
  validatorResult: ValidationResult
  scoreBundle: ScoreBundle
  insightBundle: InsightBundle
  benchmarkBundle: BenchmarkBundle
  analysisVersion: string
  generatedAt: string
}
