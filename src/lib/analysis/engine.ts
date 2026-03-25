import { AnalysisBundle } from '@/types/analysis'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'
import { normalizeBranchExtraction } from '@/lib/ai/extraction-normalizer'

import { generateScoreBundle } from './scoring'
import { generateInsightBundle } from './insights'
import { generateBenchmarkBundle } from './benchmarks'

const ANALYSIS_MODEL_VERSION = '1.0.0'

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
    return {
      policyId: policyId || 'unknown',
      validatorResult: validation || { isValid: false, flags: [] },
      scoreBundle: { overall: 0, components: {} },
      insightBundle: { strengths: [], warnings: [], recommendations: [] },
      benchmarkBundle: { comparisons: [], hasBenchmarkData: false },
      analysisVersion: ANALYSIS_MODEL_VERSION,
      generatedAt,
    } as unknown as AnalysisBundle
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
    console.warn(
      '[AnalysisEngine] Pipeline failed, returning safe defaults:',
      err instanceof Error ? err.message : String(err)
    )
    return {
      policyId: policyId || 'unknown',
      validatorResult: validation || { isValid: false, flags: [] },
      scoreBundle: { overall: 0, components: {} },
      insightBundle: {
        strengths: [],
        warnings: ['Analysis pipeline encountered an error'],
        recommendations: [],
      },
      benchmarkBundle: { comparisons: [], hasBenchmarkData: false },
      analysisVersion: ANALYSIS_MODEL_VERSION,
      generatedAt,
    } as unknown as AnalysisBundle
  }
}
