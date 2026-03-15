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

/** At this many contradictions, escalate to human_review_required */
export const MIN_CONTRADICTION_FOR_REVIEW = 3

// ============================================================================
// CONTRADICTION DETECTION
// ============================================================================

/**
 * Known contradiction pairs.
 * Each entry: [positive pattern, negative pattern, label].
 * Both patterns are tested case-insensitively against the combined text of
 * specialConditions + exclusions. If BOTH match, a contradiction is logged.
 */
const CONTRADICTION_PAIRS: [RegExp, RegExp, string][] = [
  // Average clause
  [
    /average\s*clause\s*(applies|uygulanır|geçerli)/i,
    /average\s*clause\s*(does\s*not|geçerli\s*değil|hariç|yoktur)/i,
    'average_clause',
  ],
  // Network
  [
    /network|anlaşmalı/i,
    /no\s*network|ağ\s*(yok|gerekli\s*değil)|network\s*not\s*required/i,
    'network',
  ],
  // Waiting period
  [
    /waiting\s*period|bekleme\s*süresi/i,
    /immediate\s*coverage|bekleme\s*(yok|süresi\s*yoktur)|waiting.*none|no\s*waiting/i,
    'waiting_period',
  ],
  // Warehouse-to-warehouse
  [
    /warehouse.to.warehouse\s*(applies|included|coverage|geçerli|dahil)/i,
    /warehouse.to.warehouse\s*(excluded|hariç|EXCLUDED|HARİÇ)|w2w\s*(excluded|hariç)/i,
    'w2w',
  ],
  // Deductible
  [
    /muafiyet.*₺?\s*\d+|deductible.*\d+/i,
    /muafiyet\s*(yok|yoktur)|no\s*deductible|muafiyet\s*uygulanmaz/i,
    'deductible',
  ],
  // Copay
  [
    /%\s*\d+\s*(katılım|copay|co-?pay)|katılım\s*payı\s*%?\s*\d+/i,
    /katılım\s*payı\s*(yok|yoktur)|%\s*0\s*(katılım|copay)|copay.*none/i,
    'copay',
  ],
  // BI indemnity period (conflicting values)
  [
    /indemnity\s*period:\s*(\d+)\s*month/i,
    /indemnity\s*period:\s*(\d+)\s*month/i,
    'bi_indemnity_conflict',
  ],
  // Alarm warranty
  [
    /alarm\s*(warranty|zorunlu|must|required|aktif)/i,
    /alarm\s*(not\s*required|gerekli\s*değil|optional)/i,
    'alarm_warranty',
  ],
  // ICC conflict (name says A, description says C or vice versa)
  [/icc\s*\(?a\)?/i, /icc\s*\(?c\)?/i, 'icc_conflict'],
]

export interface ContradictionResult {
  label: string
  positiveMatch: string
  negativeMatch: string
}

/**
 * Scans specialConditions, exclusions, and coverage descriptions for
 * logically contradictory statements.
 *
 * Returns an array of contradiction findings.
 */
export function detectConditionContradictions(data: ExtractedPolicyData): ContradictionResult[] {
  const results: ContradictionResult[] = []
  const allTexts = [
    ...(data.specialConditions || []),
    ...(data.exclusions || []),
    ...(data.coverages || []).map((c) => `${c.name || ''} ${c.description || ''}`),
  ]
  const combined = allTexts.join(' | ')

  for (const [posRe, negRe, label] of CONTRADICTION_PAIRS) {
    // Special case: bi_indemnity_conflict — detect two different values
    if (label === 'bi_indemnity_conflict') {
      const biMatches = combined.match(/indemnity\s*period:\s*(\d+)\s*month/gi)
      if (biMatches && biMatches.length >= 2) {
        const values = biMatches.map((m) => m.match(/(\d+)/)?.[1]).filter(Boolean)
        const unique = [...new Set(values)]
        if (unique.length >= 2) {
          results.push({
            label,
            positiveMatch: biMatches[0],
            negativeMatch: biMatches[1],
          })
        }
      }
      continue
    }

    const posMatch = combined.match(posRe)
    const negMatch = combined.match(negRe)
    if (posMatch && negMatch) {
      results.push({
        label,
        positiveMatch: posMatch[0],
        negativeMatch: negMatch[0],
      })
    }
  }

  return results
}

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
 * 6. Condition contradictions detected → restricted (≥1) or human_review_required (≥3)
 * 7. Critical fields missing → restricted
 * 8. Otherwise → full
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

  // Rule 6: Condition contradictions (Phase 7A — DEF-006/008/009/010)
  const contradictions = detectConditionContradictions(data)
  if (contradictions.length >= MIN_CONTRADICTION_FOR_REVIEW) {
    triggers.push({
      triggerRule: 'CONDITION_CONTRADICTIONS_HIGH',
      severity: 'critical',
      message: `${contradictions.length} condition contradictions detected: ${contradictions.map((c) => c.label).join(', ')}. Human review required.`,
    })
  } else if (contradictions.length > 0) {
    triggers.push({
      triggerRule: 'CONDITION_CONTRADICTIONS',
      severity: 'warning',
      message: `${contradictions.length} condition contradiction(s) detected: ${contradictions.map((c) => c.label).join(', ')}. Display restricted.`,
    })
  }

  // Rule 7: Moderate confidence → restricted
  // Catches borderline samples (0.60–0.75 confidence) regardless of warning count.
  // These are too uncertain for `full` display without further verification.
  const MODERATE_CONFIDENCE_CEILING = 0.75
  if (overallConf >= MIN_OVERALL_CONFIDENCE && overallConf < MODERATE_CONFIDENCE_CEILING) {
    triggers.push({
      triggerRule: 'MODERATE_CONFIDENCE',
      severity: 'warning',
      message: `Overall confidence (${(overallConf * 100).toFixed(0)}%) is in moderate range (${MIN_OVERALL_CONFIDENCE * 100}%–${MODERATE_CONFIDENCE_CEILING * 100}%). Display restricted for safety.`,
    })
  }

  // Rule 8: Low confidence + warning saturation → human_review_required
  // If confidence is below restricted threshold AND multiple warnings exist
  const WARNING_SATURATION_THRESHOLD = 3
  if (overallConf < MIN_OVERALL_CONFIDENCE && warningCount >= WARNING_SATURATION_THRESHOLD) {
    triggers.push({
      triggerRule: 'LOW_CONFIDENCE_WARNING_SATURATION',
      severity: 'critical',
      message: `Low confidence (${(overallConf * 100).toFixed(0)}%) combined with ${warningCount} warnings exceeds safety threshold. Human review required.`,
    })
  }

  // Rule 9: Multiple trigger escalation
  // If 3+ warning-level triggers have accumulated at low confidence, escalate to critical
  const TRIGGER_ESCALATION_THRESHOLD = 3
  const warningTriggerCount = triggers.filter((t) => t.severity === 'warning').length
  if (overallConf < MIN_OVERALL_CONFIDENCE && warningTriggerCount >= TRIGGER_ESCALATION_THRESHOLD) {
    triggers.push({
      triggerRule: 'TRIGGER_COUNT_ESCALATION',
      severity: 'critical',
      message: `${warningTriggerCount} warning triggers accumulated at low confidence (${(overallConf * 100).toFixed(0)}%). Escalating to human review.`,
    })
  }

  // Rule 10: Zero-coverage extraction safety (Phase 8E — DEF-EX-003)
  // If no coverages were extracted at all, the extraction is too shallow
  // to safely display as "full". Force at least restricted mode.
  const coverageCount = data.coverages?.length ?? 0
  if (coverageCount === 0) {
    triggers.push({
      triggerRule: 'ZERO_COVERAGES_EXTRACTED',
      severity: 'warning',
      message: 'No coverages were extracted from the document. Extraction may be incomplete.',
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
