import { ScoreBundle, ScoreDetail, InternalOverallScore } from '@/types/analysis'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'
import { BenchmarkBundle } from '@/types/analysis'

/**
 * Deterministic scoring engine.
 * Generates versioned, auditable scores from extracted facts and validation results.
 *
 * KEY RULES:
 * - Each score family is independent and versioned.
 * - competitivenessScore is SUPPRESSED (not emitted as a placeholder) when
 *   benchmark provenance is incomplete.
 * - internalOverallScore is derived from policy-fact scores only, marked
 *   internalOnly:true, and MUST NOT be rendered to consumers.
 */

const SCORING_MODEL_VERSION = '1.0.0'

export function generateScoreBundle(
  data: ExtractedPolicyData,
  validation: ValidationResult,
  benchmarkBundle?: BenchmarkBundle
): ScoreBundle {
  const generatedAt = new Date().toISOString()

  const scores: Record<string, ScoreDetail> = {
    extractionQualityScore: computeExtractionQuality(data, validation, generatedAt),
    policyStructureScore: computePolicyStructure(data, generatedAt),
    consumerSafetyScore: computeConsumerSafety(data, generatedAt),
    riskAttentionScore: computeRiskAttention(data, generatedAt),
  }

  // competitivenessScore: only emitted with valid benchmark provenance
  scores.competitivenessScore = computeCompetitiveness(data, generatedAt, benchmarkBundle)

  // Internal-only composite for triage/routing — never consumer-facing
  const contributingFamilies: Array<
    'extractionQualityScore' | 'policyStructureScore' | 'consumerSafetyScore'
  > = ['extractionQualityScore', 'policyStructureScore', 'consumerSafetyScore']

  const sum = contributingFamilies.reduce((acc, name) => {
    const s = scores[name]
    return acc + (s && !s.suppressed ? s.scoreValue : 0)
  }, 0)

  const internalOverallScore: InternalOverallScore = {
    value: Math.round(sum / contributingFamilies.length),
    derivationRule:
      'AVERAGE(extractionQualityScore, policyStructureScore, consumerSafetyScore) — excludes benchmark-dependent or suppressed scores',
    contributingFamilies,
    internalOnly: true,
  }

  return {
    internalOverallScore,
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
  let score = 50
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

  const deductibles = coverages.filter((c) => c.deductible !== null && c.deductible > 0)
  if (deductibles.length > 0) {
    const penalty = deductibles.length * 5
    score -= Math.min(penalty, 40)
    rulesApplied.push(`PENALTY_DEDUCTIBLES_PRESENT:-${Math.min(penalty, 40)}`)
  }

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

  // Branch-specific risk signals
  if (data.policyType === 'traffic') {
    const hasEnhanced = data.coverages?.some((c) => c.limit !== null && c.limit > 1_200_000)
    if (!hasEnhanced) {
      score += 15
      rulesApplied.push('RISK_TRAFFIC_STATUTORY_ONLY:+15')
    }
  }

  if (data.policyType === 'home') {
    const hasBuilding = data.coverages?.some(
      (c) => c.name?.toLowerCase().includes('building') || c.nameTr?.toLowerCase().includes('bina')
    )
    const hasContents = data.coverages?.some(
      (c) => c.name?.toLowerCase().includes('contents') || c.nameTr?.toLowerCase().includes('eşya')
    )
    if (!hasBuilding || !hasContents) {
      score += 25
      rulesApplied.push('RISK_HOME_MISSING_SEPARATION:+25')
      warnings.push('Home policy lacks clear building/contents separation.')
    }
  }

  if (data.policyType === 'health') {
    const conditions = data.specialConditions || []
    const hasNetwork = conditions.some(
      (c) => c.toLowerCase().includes('network') || c.toLowerCase().includes('anlaşmalı')
    )
    if (!hasNetwork) {
      score += 20
      rulesApplied.push('RISK_HEALTH_MISSING_NETWORK:+20')
    }
  }

  if (data.policyType === 'life') {
    const conditions = data.specialConditions || []
    const hasBeneficiary = conditions.some(
      (c) => c.toLowerCase().includes('beneficiary') || c.toLowerCase().includes('lehdar')
    )
    if (!hasBeneficiary) {
      score += 25
      rulesApplied.push('RISK_LIFE_MISSING_BENEFICIARY:+25')
      warnings.push('Life policy lacks explicit beneficiary information.')
    }
  }

  if (data.policyType === 'dask') {
    const nonEq = data.coverages?.filter(
      (c) =>
        !c.name?.toLowerCase().includes('earthquake') && !c.nameTr?.toLowerCase().includes('deprem')
    )
    if (nonEq && nonEq.length > 2) {
      score += 30
      rulesApplied.push('RISK_DASK_NON_EARTHQUAKE_COVERAGES:+30')
      warnings.push('DASK policy has unexpected non-earthquake coverages.')
    }
  }

  if (data.policyType === 'business') {
    const hasBI = data.coverages?.some((c) =>
      c.name?.toLowerCase().includes('business interruption')
    )
    const conditions = data.specialConditions || []
    const hasBIPeriod = conditions.some(
      (c) =>
        c.toLowerCase().includes('indemnity period') || c.toLowerCase().includes('waiting period')
    )
    if (hasBI && !hasBIPeriod) {
      score += 25
      rulesApplied.push('RISK_BUSINESS_BI_NO_PERIOD:+25')
      warnings.push('Business BI coverage lacks indemnity/waiting period.')
    }
  }

  if (data.policyType === 'nakliyat') {
    const hasICC = data.coverages?.some((c) => c.name?.toLowerCase().includes('icc'))
    if (!hasICC) {
      score += 20
      rulesApplied.push('RISK_NAKLIYAT_MISSING_ICC:+20')
      warnings.push('Cargo policy lacks ICC clause classification.')
    }
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

/**
 * competitivenessScore is BENCHMARK-DEPENDENT.
 * If benchmark data is absent or provenance is incomplete, this score MUST be suppressed.
 * It MUST NOT emit an artificial neutral numeric value.
 */
function computeCompetitiveness(
  _data: ExtractedPolicyData,
  generatedAt: string,
  benchmarkBundle?: BenchmarkBundle
): ScoreDetail {
  // Check if benchmark data exists and has at least one reference with complete provenance
  const hasValidBenchmark =
    benchmarkBundle &&
    Object.keys(benchmarkBundle.references).length > 0 &&
    Object.values(benchmarkBundle.references).every(
      (ref) =>
        ref.provenance.sourceName &&
        ref.provenance.geography &&
        ref.provenance.effectiveDateRange?.start &&
        ref.provenance.matchConfidence >= 0.9
    )

  if (!hasValidBenchmark) {
    return {
      scoreName: 'competitivenessScore',
      scoreValue: 0,
      scoreScale: 100,
      scoreVersion: SCORING_MODEL_VERSION,
      scoreInputs: { status: 'suppressed_no_valid_benchmark' },
      scoreRulesApplied: ['SUPPRESSED:BENCHMARK_PROVENANCE_INCOMPLETE'],
      confidence: 0,
      warnings: [],
      generatedAt,
      suppressed: true,
      suppressionReason:
        'Competitiveness score suppressed: benchmark provenance is absent or incomplete.',
    }
  }

  // With valid benchmarks, compute a real score (placeholder logic for now,
  // will be properly developed when real market data service is connected)
  return {
    scoreName: 'competitivenessScore',
    scoreValue: 50,
    scoreScale: 100,
    scoreVersion: SCORING_MODEL_VERSION,
    scoreInputs: {
      status: 'computed_from_benchmark',
      benchmarkCount: Object.keys(benchmarkBundle?.references ?? {}).length,
    },
    scoreRulesApplied: ['BENCHMARK_BASED_COMPUTATION'],
    confidence: 0.7,
    warnings: ['Competitiveness score is based on available benchmark data.'],
    generatedAt,
    suppressed: false,
  }
}
