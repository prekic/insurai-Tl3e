import { AnalysisBundle } from '@/types/analysis'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'

import { generateScoreBundle } from './scoring'
import { generateInsightBundle } from './insights'
import { generateBenchmarkBundle } from './benchmarks'

const ANALYSIS_MODEL_VERSION = '1.0.0'

/**
 * The core orchestration function for Phase 4 Analysis.
 * Generates the unified AnalysisBundle required by UI and downstream consumers.
 *
 * This enforces strict separation of concerns:
 * - Scores don't write benchmarks
 * - Insights don't mutate facts
 *
 * @param policyId    The ID of the stored policy to attach this analysis to
 * @param data        The structured extraction data produced by Phase 3 Ai Pipeline
 * @param validation  The deterministic validation result produced by Phase 3 Validator
 * @returns AnalysisBundle  The safe, versioned, structured analysis output
 */
export function generateAnalysisBundle(
  policyId: string,
  data: ExtractedPolicyData,
  validation: ValidationResult
): AnalysisBundle {
  const generatedAt = new Date().toISOString()

  // 1. Scoring (Workstream A & deterministic extraction quality)
  const scoreBundle = generateScoreBundle(data, validation)

  // 2. Insights (Workstream B & suppression rules)
  const insightBundle = generateInsightBundle(data)

  // 3. Benchmarks (Workstream C & metadata provenance)
  const benchmarkBundle = generateBenchmarkBundle(data)

  return {
    policyId,
    validatorResult: validation,
    scoreBundle,
    insightBundle,
    benchmarkBundle,
    analysisVersion: ANALYSIS_MODEL_VERSION,
    generatedAt,
  }
}
