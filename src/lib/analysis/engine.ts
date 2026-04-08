import {
  AnalysisBundle,
  ScoreBundle,
  ScoreDetail,
  ScoreFamily,
  InsightBundle,
  BenchmarkBundle,
} from '@/types/analysis'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'
import { normalizeBranchExtraction } from '@/lib/ai/extraction-normalizer'

import { generateScoreBundle } from './scoring'
import { generateInsightBundle } from './insights'
import { generateBenchmarkBundle } from './benchmarks'

const ANALYSIS_MODEL_VERSION = '1.0.0'
const SAFE_DEFAULT_VERSION = 'safe-default'

/**
 * Build a complete safe-default AnalysisBundle that downstream consumers can
 * traverse without optional chaining (Issue #333).
 *
 * Previously, the safe-default returned a partial stub with `{ overall: 0,
 * components: {} }` cast through `as unknown as AnalysisBundle`, which crashed
 * any consumer accessing `analysis.scoreBundle.scores.extractionQualityScore`.
 * The new helper returns a fully-shaped bundle where every score family
 * contains a suppressed ScoreDetail with scoreValue: 0 — consumers see a
 * consistent shape and the suppressionReason explains why.
 */
function createSafeDefaultBundle(
  policyId: string,
  validation: ValidationResult | undefined,
  reason: string
): AnalysisBundle {
  const generatedAt = new Date().toISOString()

  const safeScore = (name: ScoreFamily): ScoreDetail => ({
    scoreName: name,
    scoreValue: 0,
    scoreScale: 100,
    scoreVersion: SAFE_DEFAULT_VERSION,
    scoreInputs: {},
    scoreRulesApplied: ['SAFE_DEFAULT'],
    confidence: 0,
    warnings: [reason],
    generatedAt,
    suppressed: true,
    suppressionReason: reason,
  })

  const scoreBundle: ScoreBundle = {
    internalOverallScore: {
      value: 0,
      derivationRule: 'SAFE_DEFAULT',
      contributingFamilies: [],
      internalOnly: true,
    },
    scores: {
      extractionQualityScore: safeScore('extractionQualityScore'),
      policyStructureScore: safeScore('policyStructureScore'),
      consumerSafetyScore: safeScore('consumerSafetyScore'),
      competitivenessScore: safeScore('competitivenessScore'),
      riskAttentionScore: safeScore('riskAttentionScore'),
    },
    bundleVersion: SAFE_DEFAULT_VERSION,
    generatedAt,
  }

  const insightBundle: InsightBundle = {
    insights: [],
    bundleVersion: SAFE_DEFAULT_VERSION,
    generatedAt,
  }

  const benchmarkBundle: BenchmarkBundle = {
    references: {},
    comparisons: [],
    bundleVersion: SAFE_DEFAULT_VERSION,
    generatedAt,
  }

  return {
    policyId: policyId || 'unknown',
    validatorResult: validation || { isValid: false, flags: [] },
    scoreBundle,
    insightBundle,
    benchmarkBundle,
    analysisVersion: SAFE_DEFAULT_VERSION,
    generatedAt,
  }
}

/**
 * The core orchestration function for Phase 4 Analysis.
 * Generates the unified AnalysisBundle required by downstream consumers.
 *
 * Pipeline order:
 * 0. Branch-specific post-extraction normalization (Phase 6B)
 * 1. Benchmarks (Workstream C)
 * 2. Scoring (Workstream A)
 * 3. Insights (Workstream B)
 *
 * Strict separation of concerns:
 * - Benchmarks are generated first, then passed to scoring so competitivenessScore
 *   can determine whether to suppress itself based on provenance.
 * - Scores don't write benchmarks.
 * - Insights don't mutate facts.
 *
 * @param policyId    The ID of the stored policy to attach this analysis to
 * @param data        The structured extraction data produced by Phase 3 AI Pipeline
 * @param validation  The deterministic validation result produced by Phase 3 Validator
 * @returns AnalysisBundle  The safe, versioned, structured analysis output
 */
export function generateAnalysisBundle(
  policyId: string,
  data: ExtractedPolicyData,
  validation: ValidationResult
): AnalysisBundle {
  const generatedAt = new Date().toISOString()

  // Defensive: ensure inputs are usable
  if (!data) {
    return createSafeDefaultBundle(policyId, validation, 'null_extraction_data')
  }

  try {
    // 0. Branch-specific post-extraction normalization (Phase 6B)
    normalizeBranchExtraction(data)

    // 1. Benchmarks first (Workstream C) — needed by scoring to gate competitivenessScore
    const benchmarkBundle = generateBenchmarkBundle(data)

    // 2. Scoring (Workstream A) — receives benchmark bundle for competitiveness gating
    const scoreBundle = generateScoreBundle(data, validation, benchmarkBundle)

    // 3. Insights (Workstream B & suppression rules)
    const insightBundle = generateInsightBundle(data)

    return {
      policyId,
      validatorResult: validation,
      scoreBundle,
      insightBundle,
      benchmarkBundle,
      analysisVersion: ANALYSIS_MODEL_VERSION,
      generatedAt,
    }
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err)
    console.warn('[AnalysisEngine] Pipeline failed, returning safe defaults:', errMessage)
    return createSafeDefaultBundle(policyId, validation, `pipeline_error: ${errMessage}`)
  }
}
