/**
 * ML-based Risk Scoring Engine
 * Provides comprehensive risk assessment for insurance policies
 */

import type { AnalyzedPolicy } from '@/types/policy'
import type {
  RiskAssessment,
  RiskScore,
  RiskPrediction,
  RiskMitigation,
  RiskComparison,
} from '@/types/risk'
import { calculateRiskScore, predictRisk } from './risk-scorer'
import { extractFeatures } from './feature-extractor'
import {
  generateMitigations,
  getQuickWins,
  calculatePotentialReduction,
} from './mitigation-recommender'

export { extractFeatures } from './feature-extractor'
export { calculateRiskScore, predictRisk } from './risk-scorer'
export {
  generateMitigations,
  getQuickWins,
  calculatePotentialReduction,
  getMitigationSummary,
} from './mitigation-recommender'
export type { RiskFeatures } from '@/types/risk'

/**
 * Risk Assessment Service
 * Main entry point for risk scoring
 */
export class RiskAssessmentService {
  /**
   * Perform complete risk assessment on a policy
   */
  static assessPolicy(policy: AnalyzedPolicy): RiskAssessment {
    // Extract features
    const features = extractFeatures(policy)

    // Calculate risk score
    const score = calculateRiskScore(policy)

    // Generate prediction with confidence intervals
    const prediction = predictRisk(score)

    // Generate mitigation recommendations
    const mitigations = generateMitigations(score)

    return {
      score,
      prediction,
      features,
      mitigations,
    }
  }

  /**
   * Assess multiple policies and provide portfolio context
   */
  static assessPortfolio(
    policies: AnalyzedPolicy[]
  ): RiskAssessment[] {
    const assessments = policies.map(policy => this.assessPolicy(policy))

    // Add portfolio context to each assessment
    const avgRisk = assessments.length > 0
      ? assessments.reduce((sum, a) => sum + a.score.overall, 0) / assessments.length
      : 0

    // Find correlated risks (same high-risk categories across policies)
    const correlatedRisks = this.findCorrelatedRisks(assessments)

    for (const assessment of assessments) {
      assessment.portfolioContext = {
        totalPolicies: policies.length,
        averageRisk: avgRisk,
        correlatedRisks,
      }
    }

    return assessments
  }

  /**
   * Compare risk between two policies
   */
  static comparePolicies(
    policy1: AnalyzedPolicy,
    policy2: AnalyzedPolicy
  ): RiskComparison[] {
    const assessment1 = this.assessPolicy(policy1)
    const assessment2 = this.assessPolicy(policy2)

    const keyDifferences: RiskComparison['keyDifferences'] = []

    // Compare category scores
    for (const category of Object.keys(assessment1.score.categories) as (keyof typeof assessment1.score.categories)[]) {
      const score1 = assessment1.score.categories[category]?.score ?? 0
      const score2 = assessment2.score.categories[category]?.score ?? 0
      const diff = score1 - score2

      if (Math.abs(diff) >= 10) {
        keyDifferences.push({
          factor: category,
          thisPolicy: score1,
          otherPolicy: score2,
          impact: diff > 0 ? 'worse' : 'better',
        })
      }
    }

    return [
      {
        policyId: policy1.id,
        policyType: policy1.type,
        riskScore: assessment1.score.overall,
        riskLevel: assessment1.score.level,
        keyDifferences,
      },
      {
        policyId: policy2.id,
        policyType: policy2.type,
        riskScore: assessment2.score.overall,
        riskLevel: assessment2.score.level,
        keyDifferences: keyDifferences.map(d => ({
          ...d,
          thisPolicy: d.otherPolicy,
          otherPolicy: d.thisPolicy,
          impact: d.impact === 'better' ? 'worse' : d.impact === 'worse' ? 'better' : 'similar',
        })),
      },
    ]
  }

  /**
   * Find risks that are correlated across multiple policies
   */
  private static findCorrelatedRisks(assessments: RiskAssessment[]): string[] {
    if (assessments.length < 2) return []

    const highRiskCategories = new Map<string, number>()

    for (const assessment of assessments) {
      for (const [category, data] of Object.entries(assessment.score.categories)) {
        if (data && data.score >= 50) {
          highRiskCategories.set(
            category,
            (highRiskCategories.get(category) ?? 0) + 1
          )
        }
      }
    }

    // Return categories that appear in majority of policies
    const threshold = Math.ceil(assessments.length / 2)
    return Array.from(highRiskCategories.entries())
      .filter(([, count]) => count >= threshold)
      .map(([category]) => category)
  }

  /**
   * Get risk score for quick display (lightweight)
   */
  static getQuickRiskScore(policy: AnalyzedPolicy): {
    score: number
    level: RiskScore['level']
    topIssue: string | null
  } {
    const riskScore = calculateRiskScore(policy)

    return {
      score: riskScore.overall,
      level: riskScore.level,
      topIssue: riskScore.topFactors[0]?.description ?? null,
    }
  }

  /**
   * Check if policy needs immediate attention
   */
  static needsAttention(policy: AnalyzedPolicy): boolean {
    const score = calculateRiskScore(policy)
    return score.level === 'high' || score.level === 'very_high'
  }

  /**
   * Get action items for a policy
   */
  static getActionItems(
    policy: AnalyzedPolicy
  ): Array<{ priority: RiskMitigation['priority']; action: string }> {
    const assessment = this.assessPolicy(policy)
    const quickWins = getQuickWins(assessment.mitigations)

    return quickWins.map(m => ({
      priority: m.priority,
      action: m.recommendation,
    }))
  }
}

/**
 * Risk scoring utilities
 */
export const RiskUtils = {
  /**
   * Format risk score for display
   */
  formatScore(score: number): string {
    return `${Math.round(score)}/100`
  },

  /**
   * Get risk trend description
   */
  getTrendDescription(prediction: RiskPrediction): string {
    const trendLabels = {
      improving: 'İyileşme eğiliminde',
      stable: 'Stabil',
      worsening: 'Kötüleşme eğiliminde',
    }
    return trendLabels[prediction.trend]
  },

  /**
   * Calculate improvement potential
   */
  getImprovementPotential(assessment: RiskAssessment): number {
    return calculatePotentialReduction(assessment.mitigations)
  },
}
