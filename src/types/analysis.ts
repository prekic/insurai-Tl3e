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
}

export interface ScoreBundle {
  overallScore: number
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

export interface BenchmarkReference {
  benchmarkId: string
  branch: string
  productType: string
  marketSegment: string
  geography: string
  effectiveDateRange: { start: string; end?: string }
  sourceName: string
  sourceVersion: string
  dataQuality: 'high' | 'medium' | 'low'
  matchType: 'exact' | 'approximate' | 'inferred'
  matchConfidence: number
  metricName: string
  metricValue: number | string
  currency?: string
  notes?: string
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
