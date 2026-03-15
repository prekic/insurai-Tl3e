import type { AnalysisBundle } from '@/types/analysis'
import type { DisplayMode, ReviewTrigger } from '@/types/display'
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import type { ValidationResult } from '@/lib/ai/validator'

// ============================================================================
// THRESHOLD CONSTANTS
// ============================================================================

/** Below this extraction quality score, display is restricted */
export const RESTRICTED_THRESHOLD = 50

/** Below this extraction quality score, human review is required */
export const HUMAN_REVIEW_THRESHOLD = 30

/** Max ambiguity flags before triggering restricted mode */
export const MAX_AMBIGUITY_FLAGS = 5

/** Below this overall confidence, trigger restricted mode */
export const MIN_OVERALL_CONFIDENCE = 0.6

// ============================================================================
// DISPLAY MODE EVALUATION
// ============================================================================

export interface DisplayModeResult {
  mode: DisplayMode
  triggers: ReviewTrigger[]
}

/**
 * Evaluates the appropriate display mode based on extraction quality,
 * validation results, and analysis bundle metrics.
 *
 * Rules (applied in order of severity):
 * 1. Validator blocking errors → human_review_required
 * 2. Extraction quality score below HUMAN_REVIEW_THRESHOLD → human_review_required
 * 3. Overall confidence below MIN_OVERALL_CONFIDENCE → restricted
 * 4. Extraction quality below RESTRICTED_THRESHOLD → restricted
 * 5. Ambiguity count above MAX_AMBIGUITY_FLAGS → restricted
 * 6. Critical fields missing → restricted
 * 7. Otherwise → full
 */
export function evaluateDisplayMode(
  data: ExtractedPolicyData,
  validation: ValidationResult,
  analysis: AnalysisBundle
): DisplayModeResult {
  const triggers: ReviewTrigger[] = []

  // Rule 1: Validator blocking errors
  const blockingErrors = validation.flags.filter((f) => f.level === 'Error')
  if (blockingErrors.length > 0) {
    triggers.push({
      triggerRule: 'VALIDATOR_BLOCKING_ERRORS',
      severity: 'critical',
      message: `${blockingErrors.length} blocking validation error(s) detected.`,
    })
  }

  // Rule 2: Extraction quality score check
  const extScore = analysis.scoreBundle.scores.extractionQualityScore
  if (extScore && extScore.scoreValue < HUMAN_REVIEW_THRESHOLD) {
    triggers.push({
      triggerRule: 'EXTRACTION_QUALITY_BELOW_HUMAN_REVIEW',
      severity: 'critical',
      message: `Extraction quality score (${extScore.scoreValue}) is below human review threshold (${HUMAN_REVIEW_THRESHOLD}).`,
    })
  } else if (extScore && extScore.scoreValue < RESTRICTED_THRESHOLD) {
    triggers.push({
      triggerRule: 'EXTRACTION_QUALITY_BELOW_RESTRICTED',
      severity: 'warning',
      message: `Extraction quality score (${extScore.scoreValue}) is below restricted threshold (${RESTRICTED_THRESHOLD}).`,
    })
  }

  // Rule 3: Overall confidence
  const overallConf = data.confidence?.overall || 0
  if (overallConf < MIN_OVERALL_CONFIDENCE) {
    triggers.push({
      triggerRule: 'LOW_OVERALL_CONFIDENCE',
      severity: 'warning',
      message: `Overall extraction confidence (${(overallConf * 100).toFixed(0)}%) is below minimum (${MIN_OVERALL_CONFIDENCE * 100}%).`,
    })
  }

  // Rule 4: Ambiguity count
  const warningCount = validation.flags.filter((f) => f.level === 'Warning').length
  if (warningCount > MAX_AMBIGUITY_FLAGS) {
    triggers.push({
      triggerRule: 'HIGH_AMBIGUITY_COUNT',
      severity: 'warning',
      message: `${warningCount} ambiguity warnings exceed threshold of ${MAX_AMBIGUITY_FLAGS}.`,
    })
  }

  // Rule 5: Critical fields missing
  if (!data.policyNumber) {
    triggers.push({
      triggerRule: 'MISSING_POLICY_NUMBER',
      severity: 'warning',
      message: 'Policy number could not be extracted.',
      field: 'policyNumber',
    })
  }
  if (!data.provider) {
    triggers.push({
      triggerRule: 'MISSING_PROVIDER',
      severity: 'warning',
      message: 'Insurance provider could not be identified.',
      field: 'provider',
    })
  }

  // Determine mode
  const hasCritical = triggers.some((t) => t.severity === 'critical')
  const hasWarning = triggers.some((t) => t.severity === 'warning')

  let mode: DisplayMode = 'full'
  if (hasCritical) {
    mode = 'human_review_required'
  } else if (hasWarning) {
    mode = 'restricted'
  }

  return { mode, triggers }
}
