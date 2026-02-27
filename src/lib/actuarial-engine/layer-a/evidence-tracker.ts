/**
 * Layer A — Evidence Pointer Management and Validation
 *
 * Tracks the provenance of every extracted data point back to
 * the source PDF. Validates evidence coverage and flags fields
 * that need human review due to missing or low-confidence evidence.
 *
 * Key principle: If a field has no EvidencePointer, it's
 * potentially hallucinated and should be reviewed.
 */

import type {
  EvidenceCoverageReport,
  EvidenceValidation,
  FieldWithEvidence,
  SemanticExclusionImpact,
  ActuarialPolicyInput,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum confidence threshold for evidence to be considered reliable. */
const MIN_EVIDENCE_CONFIDENCE = 0.6

/** Minimum number of evidence pointers required for a field to be trusted. */
const MIN_EVIDENCE_COUNT = 1

// ─────────────────────────────────────────────────────────────────────────────
// FIELD VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the evidence for a single extracted field.
 *
 * @param fieldPath - Dot-separated path to the field (e.g., "premium.amount")
 * @param field - The field with evidence to validate
 * @returns EvidenceValidation with review status
 */
export function validateEvidence(
  fieldPath: string,
  field: FieldWithEvidence<unknown>
): EvidenceValidation {
  const evidence = field.evidence ?? []
  const evidenceCount = evidence.length
  const hasEvidence = evidenceCount >= MIN_EVIDENCE_COUNT

  // Calculate average confidence across all evidence pointers
  const avgConfidence =
    evidenceCount > 0 ? evidence.reduce((sum, e) => sum + e.confidence, 0) / evidenceCount : 0

  // Determine if review is needed
  let needsReview = false
  let reason: string | undefined

  if (!hasEvidence) {
    needsReview = true
    reason = 'No evidence pointers — field value may be inferred or hallucinated'
  } else if (avgConfidence < MIN_EVIDENCE_CONFIDENCE) {
    needsReview = true
    reason = `Average evidence confidence (${avgConfidence.toFixed(2)}) below threshold (${MIN_EVIDENCE_CONFIDENCE})`
  }

  return {
    fieldPath,
    hasEvidence,
    evidenceCount,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    needsReview,
    reason,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE COVERAGE REPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates an evidence coverage report for all evidence-tracked fields
 * in a policy evaluation.
 *
 * @param policy - The actuarial policy input
 * @param semanticExclusions - Semantic exclusion impacts to check
 * @returns Complete evidence coverage report
 */
export function generateEvidenceCoverageReport(
  policy: ActuarialPolicyInput,
  semanticExclusions: SemanticExclusionImpact[]
): EvidenceCoverageReport {
  const validations: EvidenceValidation[] = []

  // Check coverage-level evidence
  for (const coverage of policy.coverages) {
    if (coverage.limit) {
      validations.push(validateEvidence(`coverages.${coverage.code}.limit`, coverage.limit))
    }
    if (coverage.deductible) {
      validations.push(
        validateEvidence(`coverages.${coverage.code}.deductible`, coverage.deductible)
      )
    }
  }

  // Check indemnity mechanics evidence
  if (policy.indemnityMechanics) {
    const im = policy.indemnityMechanics
    validations.push(validateEvidence('indemnityMechanics.partsStandard', im.partsStandard))
    validations.push(validateEvidence('indemnityMechanics.repairNetworkRule', im.repairNetworkRule))
    validations.push(validateEvidence('indemnityMechanics.rayicMethod', im.rayicMethod))
    validations.push(
      validateEvidence('indemnityMechanics.rayicMethodIsConcrete', im.rayicMethodIsConcrete)
    )
  }

  // Check raw extraction evidence
  if (policy.rawExtractionData) {
    for (const [key, field] of Object.entries(policy.rawExtractionData)) {
      validations.push(validateEvidence(`rawExtraction.${key}`, field))
    }
  }

  // Check semantic exclusion evidence
  for (let i = 0; i < semanticExclusions.length; i++) {
    const excl = semanticExclusions[i]
    validations.push({
      fieldPath: `semanticExclusions[${i}]`,
      hasEvidence: excl.evidence.length > 0,
      evidenceCount: excl.evidence.length,
      avgConfidence:
        excl.evidence.length > 0
          ? excl.evidence.reduce((sum, e) => sum + e.confidence, 0) / excl.evidence.length
          : 0,
      needsReview: excl.needsReview ?? excl.evidence.length === 0,
      reason:
        excl.evidence.length === 0 ? 'Semantic exclusion has no evidence pointers' : undefined,
    })
  }

  // Compute totals
  const totalFields = validations.length
  const fieldsWithEvidence = validations.filter((v) => v.hasEvidence).length
  const coveragePercent =
    totalFields > 0 ? Math.round((fieldsWithEvidence / totalFields) * 100) : 100

  const fieldsNeedingReview = validations.filter((v) => v.needsReview)
  const overallNeedsReview = fieldsNeedingReview.length > 0

  return {
    totalFields,
    fieldsWithEvidence,
    coveragePercent,
    fieldsNeedingReview,
    overallNeedsReview,
  }
}

/**
 * Quick check to determine if a policy evaluation needs human review.
 *
 * Checks:
 * 1. Any semantic exclusion has empty evidence
 * 2. Any critical field has low confidence
 * 3. Indemnity mechanics has unspecified values
 */
export function quickReviewCheck(
  policy: ActuarialPolicyInput,
  semanticExclusions: SemanticExclusionImpact[]
): { needsReview: boolean; reasons: string[] } {
  const reasons: string[] = []

  // Check semantic exclusion evidence
  const exclusionsWithoutEvidence = semanticExclusions.filter(
    (e) => e.evidence.length === 0 && e.severity !== 'info'
  )
  if (exclusionsWithoutEvidence.length > 0) {
    reasons.push(
      `${exclusionsWithoutEvidence.length} semantic exclusion(s) have no evidence pointers`
    )
  }

  // Check indemnity mechanics
  if (policy.indemnityMechanics) {
    const im = policy.indemnityMechanics
    if (im.partsStandard.value === 'unspecified') {
      reasons.push('Parts standard is unspecified')
    }
    if (im.repairNetworkRule.value === 'unspecified') {
      reasons.push('Repair network rule is unspecified')
    }
    if (im.rayicMethod.value === 'unspecified') {
      reasons.push('Rayiç (market value) method is unspecified')
    }

    // Check for missing evidence on critical indemnity mechanics fields
    const criticalFields = [
      { field: im.partsStandard, name: 'partsStandard' },
      { field: im.repairNetworkRule, name: 'repairNetworkRule' },
      { field: im.rayicMethod, name: 'rayicMethod' },
    ]
    const fieldsWithoutEvidence = criticalFields.filter(
      ({ field }) => (field.evidence ?? []).length === 0
    )
    if (fieldsWithoutEvidence.length > 0) {
      reasons.push(
        `${fieldsWithoutEvidence.length} indemnity mechanics field(s) have no evidence pointers`
      )
    }
  } else {
    reasons.push('No indemnity mechanics extracted — contract quality assessment may be inaccurate')
  }

  // Check overall extraction confidence
  if (policy.rawExtractionData) {
    const lowConfidenceFields = Object.entries(policy.rawExtractionData).filter(
      ([, field]) => field.confidence !== undefined && field.confidence < MIN_EVIDENCE_CONFIDENCE
    )
    if (lowConfidenceFields.length > 0) {
      reasons.push(`${lowConfidenceFields.length} field(s) have low extraction confidence`)
    }
  }

  return {
    needsReview: reasons.length > 0,
    reasons,
  }
}
