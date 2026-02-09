/**
 * Gap Detection Module
 * Comprehensive policy gap analysis for InsurAI
 */

// Main engine
export { analyzeGapsComprehensive, getQuickGapSummary } from './engine'

// Individual analyzers
export {
  analyzeCoverageGaps,
  analyzeLimitGaps,
  analyzeDeductibleGaps,
  analyzeExclusionGaps,
  analyzeTemporalGaps,
  analyzeComplianceGaps,
} from './analyzers'

// Re-export types for convenience
export type {
  GapCategory,
  GapSubCategory,
  GapSeverity,
  DetectedGap,
  GapRemediation,
  ComprehensiveGapAnalysis,
  PrioritizedGap,
  GapRecommendation,
  GapDetectionConfig,
} from '@/types/gap'

export {
  DEFAULT_GAP_CONFIG,
  GAP_SEVERITY_CONFIG,
  calculateGapPriority,
  getUrgencyLevel,
  getGapSeverityColor,
  getGapSeverityLabel,
} from '@/types/gap'

/**
 * Gap Detection Service
 * High-level interface for gap detection operations
 */
import type { AnalyzedPolicy } from '@/types/policy'
import type { TurkishRegion } from '@/types/market-data'
import type { ComprehensiveGapAnalysis, DetectedGap } from '@/types/gap'
import { analyzeGapsComprehensive, getQuickGapSummary } from './engine'

export class GapDetectionService {
  /**
   * Perform full gap analysis on a policy
   */
  static async analyzePolicy(
    policy: AnalyzedPolicy,
    region?: TurkishRegion
  ): Promise<ComprehensiveGapAnalysis> {
    return analyzeGapsComprehensive(policy, { region })
  }

  /**
   * Get quick summary for dashboard
   */
  static async getQuickSummary(policy: AnalyzedPolicy): Promise<{
    score: number
    criticalCount: number
    topIssue: string | null
    recommendation: string | null
  }> {
    return getQuickGapSummary(policy)
  }

  /**
   * Get top N gaps by priority
   */
  static async getTopGaps(policy: AnalyzedPolicy, count = 5): Promise<DetectedGap[]> {
    const analysis = await analyzeGapsComprehensive(policy)
    return analysis.prioritizedGaps.slice(0, count).map(pg => pg.gap)
  }

  /**
   * Get gaps by severity
   */
  static async getGapsBySeverity(
    policy: AnalyzedPolicy,
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  ): Promise<DetectedGap[]> {
    const analysis = await analyzeGapsComprehensive(policy)
    return analysis.gapsBySeverity[severity] ?? []
  }

  /**
   * Get critical and high priority gaps
   */
  static async getCriticalGaps(policy: AnalyzedPolicy): Promise<DetectedGap[]> {
    const analysis = await analyzeGapsComprehensive(policy)
    return [
      ...(analysis.gapsBySeverity.critical ?? []),
      ...(analysis.gapsBySeverity.high ?? []),
    ]
  }

  /**
   * Get gap score for quick display
   */
  static async getGapScore(policy: AnalyzedPolicy): Promise<number> {
    const analysis = await analyzeGapsComprehensive(policy)
    return analysis.overallScore
  }

  /**
   * Check if policy has critical compliance issues
   */
  static async hasComplianceIssues(policy: AnalyzedPolicy): Promise<boolean> {
    const analysis = await analyzeGapsComprehensive(policy)
    const complianceGaps = analysis.gapsByCategory.compliance ?? []
    return complianceGaps.some(g => g.severity === 'critical' || g.severity === 'high')
  }

  /**
   * Get estimated cost to close all gaps
   */
  static async getRemediationCost(policy: AnalyzedPolicy): Promise<number> {
    const analysis = await analyzeGapsComprehensive(policy)
    return analysis.financialSummary.estimatedRemediationCost
  }

  /**
   * Get expected financial exposure from gaps
   */
  static async getFinancialExposure(policy: AnalyzedPolicy): Promise<number> {
    const analysis = await analyzeGapsComprehensive(policy)
    return analysis.financialSummary.totalExpectedLoss
  }

  /**
   * Generate action items from gaps
   */
  static async getActionItems(policy: AnalyzedPolicy): Promise<Array<{
    priority: 'critical' | 'high' | 'medium' | 'low'
    action: string
    actionTr: string
    estimatedCost: number | null
  }>> {
    const analysis = await analyzeGapsComprehensive(policy)

    return analysis.prioritizedGaps.slice(0, 10).map(pg => ({
      priority: pg.urgencyLevel === 'immediate' ? 'critical' :
                pg.urgencyLevel === 'soon' ? 'high' :
                pg.urgencyLevel === 'planned' ? 'medium' : 'low',
      action: pg.gap.remediation.action,
      actionTr: pg.gap.remediation.actionTr,
      estimatedCost: pg.gap.remediation.estimatedCost,
    }))
  }
}
