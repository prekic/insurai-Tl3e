import { ScoreBundle, ScoreDetail } from '@/types/analysis'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'

/**
 * Deterministic scoring engine.
 * Generates versioned, auditable scores from extracted facts and validation results.
 */

const SCORING_MODEL_VERSION = '1.0.0'

export function generateScoreBundle(
  data: ExtractedPolicyData,
  validation: ValidationResult
): ScoreBundle {
  const generatedAt = new Date().toISOString()
  const scores: Record<string, ScoreDetail> = {
    extractionQualityScore: computeExtractionQuality(data, validation, generatedAt),
    policyStructureScore: computePolicyStructure(data, generatedAt),
    consumerSafetyScore: computeConsumerSafety(data, generatedAt),
    competitivenessScore: computeCompetitiveness(data, generatedAt), // Placeholder until Benchmark Layer
    riskAttentionScore: computeRiskAttention(data, generatedAt),
  }

  const overallScore = Math.round(
    (scores.extractionQualityScore.scoreValue +
      scores.policyStructureScore.scoreValue +
      scores.consumerSafetyScore.scoreValue) /
      3
  )

  return {
    overallScore,
    scores,
    bundleVersion: SCORING_MODEL_VERSION,
    generatedAt,
  }
}

function computeExtractionQuality(
  data: ExtractedPolicyData,
  validation: ValidationResult,
  generatedAt: string
): ScoreDetail {
  const inputs = {
    overallConfidence: data.confidence?.overall || 0,
    flagCount: validation.flags.length,
    errorCount: validation.flags.filter((f) => f.level === 'Error').length,
    warningCount: validation.flags.filter((f) => f.level === 'Warning').length,
  }

  let score = inputs.overallConfidence * 100
  const rulesApplied: string[] = []
  const warnings: string[] = []

  if (inputs.errorCount > 0) {
    score -= inputs.errorCount * 30
    rulesApplied.push('PENALTY_VALIDATOR_ERRORS:-30_PER_ERROR')
  }
  if (inputs.warningCount > 0) {
    score -= inputs.warningCount * 10
    rulesApplied.push('PENALTY_VALIDATOR_WARNINGS:-10_PER_WARNING')
  }

  if (score < 0) score = 0
  if (score > 100) score = 100

  return {
    scoreName: 'extractionQualityScore',
    scoreValue: Math.round(score),
    scoreScale: 100,
    scoreVersion: SCORING_MODEL_VERSION,
    scoreInputs: inputs,
    scoreRulesApplied: rulesApplied,
    confidence: inputs.overallConfidence,
    warnings,
    generatedAt,
  }
}

function computePolicyStructure(data: ExtractedPolicyData, generatedAt: string): ScoreDetail {
  const coverages = data.coverages || []
  let score = 50 // Base structure score
  const rulesApplied: string[] = []
  const warnings: string[] = []

  const hasMarketValue = coverages.some((c) => c.isMarketValue)
  const hasUnlimited = coverages.some((c) => c.isUnlimited)
  const coverageCount = coverages.length

  if (hasMarketValue) {
    score += 20
    rulesApplied.push('BONUS_MARKET_VALUE_PRESENT:+20')
  }
  if (hasUnlimited) {
    score += 15
    rulesApplied.push('BONUS_UNLIMITED_COVERAGE_PRESENT:+15')
  }

  if (coverageCount >= 10) {
    score += 15
    rulesApplied.push('BONUS_HIGH_COVERAGE_COUNT:+15')
  } else if (coverageCount < 3) {
    score -= 20
    rulesApplied.push('PENALTY_LOW_COVERAGE_COUNT:-20')
    warnings.push('Policy has very few coverages identified.')
  }

  if (score < 0) score = 0
  if (score > 100) score = 100

  return {
    scoreName: 'policyStructureScore',
    scoreValue: Math.round(score),
    scoreScale: 100,
    scoreVersion: SCORING_MODEL_VERSION,
    scoreInputs: { coverageCount, hasMarketValue, hasUnlimited },
    scoreRulesApplied: rulesApplied,
    confidence: data.confidence?.coverages || 0.8,
    warnings,
    generatedAt,
  }
}

function computeConsumerSafety(data: ExtractedPolicyData, generatedAt: string): ScoreDetail {
  let score = 70
  const rulesApplied: string[] = []
  const warnings: string[] = []

  const coverages = data.coverages || []

  // High/Negative deductibles impact safety
  const deductibles = coverages.filter((c) => c.deductible !== null && c.deductible > 0)
  if (deductibles.length > 0) {
    const penalty = deductibles.length * 5
    score -= Math.min(penalty, 40)
    rulesApplied.push(`PENALTY_DEDUCTIBLES_PRESENT:-${Math.min(penalty, 40)}`)
  }

  // Ambiguous phrasing impacts consumer safety
  if (data.specialConditions && data.specialConditions.length > 5) {
    score -= 10
    rulesApplied.push('PENALTY_HIGH_SPECIAL_CONDITIONS:-10')
    warnings.push('High volume of special conditions may reduce consumer clarity.')
  }

  if (score < 0) score = 0
  if (score > 100) score = 100

  return {
    scoreName: 'consumerSafetyScore',
    scoreValue: Math.round(score),
    scoreScale: 100,
    scoreVersion: SCORING_MODEL_VERSION,
    scoreInputs: {
      deductibleCount: deductibles.length,
      conditionsCount: data.specialConditions?.length || 0,
    },
    scoreRulesApplied: rulesApplied,
    confidence: 0.9,
    warnings,
    generatedAt,
  }
}

function computeRiskAttention(data: ExtractedPolicyData, generatedAt: string): ScoreDetail {
  // Higher score = More attention required (riskier)
  let score = 20
  const rulesApplied: string[] = []
  const warnings: string[] = []

  const exclusionCount = data.exclusions?.length || 0
  if (exclusionCount > 10) {
    score += 40
    rulesApplied.push('RISK_HIGH_EXCLUSIONS:+40')
  } else if (exclusionCount > 5) {
    score += 20
    rulesApplied.push('RISK_MEDIUM_EXCLUSIONS:+20')
  }

  if (data.policyType === 'kasko' && !data.coverages?.some((c) => c.isMarketValue)) {
    score += 30
    rulesApplied.push('RISK_MISSING_MARKET_VALUE_IN_KASKO:+30')
    warnings.push('KASKO policy lacks clear market value statement.')
  }

  if (score > 100) score = 100

  return {
    scoreName: 'riskAttentionScore',
    scoreValue: Math.round(score),
    scoreScale: 100,
    scoreVersion: SCORING_MODEL_VERSION,
    scoreInputs: { exclusionCount },
    scoreRulesApplied: rulesApplied,
    confidence: 0.85,
    warnings,
    generatedAt,
  }
}

function computeCompetitiveness(_data: ExtractedPolicyData, generatedAt: string): ScoreDetail {
  // Placeholder - benchmark dependent
  return {
    scoreName: 'competitivenessScore',
    scoreValue: 50,
    scoreScale: 100,
    scoreVersion: SCORING_MODEL_VERSION,
    scoreInputs: { status: 'pending_benchmark' },
    scoreRulesApplied: ['DEFAULT_PLACEHOLDER:50'],
    confidence: 0,
    warnings: ['Competitiveness score requires Benchmark Layer data to be accurate.'],
    generatedAt,
  }
}
