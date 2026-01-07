/* eslint-disable @typescript-eslint/no-non-null-assertion -- Assertion used after filter operation where existence is guaranteed */
/**
 * Policy Evaluation Module
 *
 * Evaluates policies against market benchmarks using the Turkish
 * insurance knowledge database, and enables multi-policy comparison.
 *
 * Features:
 * - Single policy evaluation against market benchmarks
 * - Compliance checking against SEDDK regulations
 * - Multi-policy comparison (2-4 policies)
 * - Coverage matrix comparison
 * - Value-for-money analysis
 * - Actionable recommendations
 *
 * Usage:
 * ```typescript
 * import { evaluatePolicy, comparePolicies } from '@/lib/policy-evaluation'
 *
 * // Evaluate single policy
 * const evaluation = evaluatePolicy(myPolicy)
 * console.log(evaluation.overallScore) // 0-100
 * console.log(evaluation.grade) // A, B, C, D, F
 *
 * // Compare multiple policies
 * const comparison = comparePolicies([policy1, policy2, policy3])
 * console.log(comparison.winners.overallBest) // Best policy ID
 * console.log(comparison.analysis.recommendation) // Human-readable recommendation
 * ```
 */

// Main functions
export { evaluatePolicy } from './evaluator'
export { comparePolicies, quickCompare, compareCoverage } from './comparator'

// Types
export type {
  // Evaluation types
  EvaluationGrade,
  EvaluationStatus,
  ScoreBreakdown,
  PolicyEvaluation,
  ComplianceIssue,
  Recommendation,

  // Comparison types
  ComparisonPolicy,
  CoverageComparison,
  PolicyComparison,
  ComparisonMetric,
  KeyDifference,
  Tradeoff,

  // Configuration
  EvaluationConfig,
} from './types'

export {
  DEFAULT_EVALUATION_CONFIG,
  getGradeFromScore,
  getStatusFromScore,
  isExcellent,
  isGood,
  isFair,
  isPoor,
  isCritical,
} from './types'

// =============================================================================
// POLICY EVALUATION SERVICE
// =============================================================================

import type { Policy } from '@/types/policy'
import type {
  PolicyEvaluation,
  PolicyComparison,
  EvaluationConfig,
} from './types'
import { evaluatePolicy } from './evaluator'
import { comparePolicies, quickCompare, compareCoverage } from './comparator'

/**
 * High-level Policy Evaluation Service
 *
 * Provides a convenient interface for all evaluation and comparison operations.
 */
export class PolicyEvaluationService {
  private config: Partial<EvaluationConfig>

  constructor(config?: Partial<EvaluationConfig>) {
    this.config = config || {}
  }

  /**
   * Evaluate a single policy against market benchmarks
   */
  evaluate(policy: Policy): PolicyEvaluation {
    return evaluatePolicy(policy, this.config)
  }

  /**
   * Evaluate multiple policies and return evaluations
   */
  evaluateMultiple(policies: Policy[]): PolicyEvaluation[] {
    return policies.map(p => evaluatePolicy(p, this.config))
  }

  /**
   * Compare 2-4 policies against each other
   */
  compare(policies: Policy[], labels?: string[]): PolicyComparison {
    return comparePolicies(policies, labels, this.config)
  }

  /**
   * Quick comparison - just get winner and basic stats
   */
  quickCompare(policies: Policy[]) {
    return quickCompare(policies)
  }

  /**
   * Compare a specific coverage across policies
   */
  compareCoverage(policies: Policy[], coverageName: string) {
    return compareCoverage(policies, coverageName)
  }

  /**
   * Get the best policy from a list
   */
  getBest(policies: Policy[]): { policy: Policy; evaluation: PolicyEvaluation } {
    const evaluations = policies.map(p => ({
      policy: p,
      evaluation: evaluatePolicy(p, this.config),
    }))

    return evaluations.reduce((best, current) =>
      current.evaluation.overallScore > best.evaluation.overallScore ? current : best
    )
  }

  /**
   * Get policies sorted by score (best first)
   */
  sortByScore(policies: Policy[]): { policy: Policy; evaluation: PolicyEvaluation }[] {
    return policies
      .map(p => ({
        policy: p,
        evaluation: evaluatePolicy(p, this.config),
      }))
      .sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore)
  }

  /**
   * Filter policies by minimum score
   */
  filterByMinScore(policies: Policy[], minScore: number): Policy[] {
    return policies.filter(p => {
      const evaluation = evaluatePolicy(p, this.config)
      return evaluation.overallScore >= minScore
    })
  }

  /**
   * Get policies with critical compliance issues
   */
  getNonCompliant(policies: Policy[]): Policy[] {
    return policies.filter(p => {
      const evaluation = evaluatePolicy(p, this.config)
      return !evaluation.compliance.isCompliant
    })
  }

  /**
   * Get summary statistics for a set of policies
   */
  getSummaryStats(policies: Policy[]): {
    count: number
    avgScore: number
    minScore: number
    maxScore: number
    compliantCount: number
    avgPremium: number
    avgCoverage: number
    gradeDistribution: Record<string, number>
  } {
    const evaluations = policies.map(p => ({
      policy: p,
      evaluation: evaluatePolicy(p, this.config),
    }))

    const scores = evaluations.map(e => e.evaluation.overallScore)
    const grades = evaluations.map(e => e.evaluation.grade)

    const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    grades.forEach(g => gradeDistribution[g]++)

    return {
      count: policies.length,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      compliantCount: evaluations.filter(e => e.evaluation.compliance.isCompliant).length,
      avgPremium: Math.round(policies.reduce((a, p) => a + p.premium, 0) / policies.length),
      avgCoverage: Math.round(policies.reduce((a, p) => a + p.coverage, 0) / policies.length),
      gradeDistribution,
    }
  }

  /**
   * Generate comparison report
   */
  generateReport(policies: Policy[], labels?: string[]): {
    comparison: PolicyComparison
    summary: string
    summaryTR: string
  } {
    const comparison = comparePolicies(policies, labels, this.config)

    const winner = comparison.policies.find(p => p.policy.id === comparison.winners.overallBest)!

    const summary = `Comparison of ${policies.length} policies: ${winner.label} is recommended ` +
      `with a score of ${winner.evaluation.overallScore}/100 (${winner.evaluation.grade}). ` +
      `Key differences include premium (${comparison.metrics.find(m => m.name === 'Annual Premium')?.values.map(v => `${v.value.toLocaleString('tr-TR')} TL`).join(' vs ')}) ` +
      `and coverage (${comparison.metrics.find(m => m.name === 'Total Coverage')?.values.map(v => `${v.value.toLocaleString('tr-TR')} TL`).join(' vs ')}).`

    const summaryTR = `${policies.length} poliçenin karşılaştırması: ${winner.label} ` +
      `${winner.evaluation.overallScore}/100 puanıyla (${winner.evaluation.grade}) önerilir. ` +
      `Temel farklılıklar: prim (${comparison.metrics.find(m => m.name === 'Annual Premium')?.values.map(v => `${v.value.toLocaleString('tr-TR')} TL`).join(' - ')}) ` +
      `ve teminat (${comparison.metrics.find(m => m.name === 'Total Coverage')?.values.map(v => `${v.value.toLocaleString('tr-TR')} TL`).join(' - ')}).`

    return { comparison, summary, summaryTR }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default evaluation service instance
 */
export const policyEvaluator = new PolicyEvaluationService()
