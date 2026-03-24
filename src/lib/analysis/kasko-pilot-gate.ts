/**
 * KASKO Internal Pilot — Review Gate
 *
 * Provides pilot gating logic that:
 * 1. Checks if the KASKO pilot feature flag is active
 * 2. Tags extraction results with review status
 * 3. Provides review-state transitions
 *
 * IMPORTANT: During the internal pilot, ALL KASKO extractions require human review.
 * IMPORTANT: During the internal pilot, ALL KASKO extractions require human review.
 * KASKO is internal-pilot-ready with mandatory human review, not production-ready.
 */

// ============================================================================
// PILOT ADMISSION
// ============================================================================

export type PilotAdmissionStatus =
  | 'pilot_eligible_clean'
  | 'pilot_eligible_moderate'
  | 'pilot_ineligible_noisy'
  | 'pilot_ineligible_incomplete'

export interface PilotAdmissionGateResult {
  status: PilotAdmissionStatus
  reason: string
  countedInPilotMetrics: boolean
}

/**
 * Classifies an incoming document before its performance is measured in the pilot.
 * It prevents garbage/incomplete documents from unfairly depressing AI accuracy metrics.
 */
export function evaluatePilotAdmission(
  extractedData: { policyNumber?: string | null; provider?: string | null; coverages?: unknown[] },
  meta: { textCharCount: number; documentQuality?: string; pageCompleteness?: string }
): PilotAdmissionGateResult {
  const { policyNumber, provider, coverages = [] } = extractedData
  const charCount = meta.textCharCount || 0

  // 1. Length / Density Check
  if (charCount < 500) {
    if (charCount < 100) {
      return {
        status: 'pilot_ineligible_noisy',
        reason: 'Text density too low (<100 chars). Likely a failed OCR or empty scan.',
        countedInPilotMetrics: false,
      }
    }
    return {
      status: 'pilot_ineligible_incomplete',
      reason: 'Extracted text is too short (<500 chars) to be a full policy.',
      countedInPilotMetrics: false,
    }
  }

  // 2. Provider Reliability Check
  if (!provider || provider.trim() === '' || provider === 'Sigorta A.Ş.') {
    return {
      status: 'pilot_ineligible_incomplete',
      reason: 'Provider missing or generic ("Sigorta A.Ş."). Unreliable input.',
      countedInPilotMetrics: false,
    }
  }

  // 3. Core Identifiers Check
  if (!policyNumber || policyNumber.includes('??')) {
    return {
      status: 'pilot_ineligible_incomplete',
      reason: 'Policy number missing or heavily garbled.',
      countedInPilotMetrics: false,
    }
  }

  // 4. Coverage Sufficiency
  if (coverages.length === 0 && charCount < 3000) {
    return {
      status: 'pilot_ineligible_incomplete',
      reason: 'No coverages found in a relatively short document.',
      countedInPilotMetrics: false,
    }
  }

  // 5. Quality Downgrade
  // Explicitly labeled noisy docs that somehow bypassed the length checks
  if (meta.documentQuality === 'noisy' || meta.pageCompleteness === 'partial') {
    return {
      status: 'pilot_ineligible_incomplete',
      reason: `Document explicitly missing pages or extremely noisy: ${meta.documentQuality} / ${meta.pageCompleteness}`,
      countedInPilotMetrics: false,
    }
  }

  if (meta.documentQuality === 'moderate') {
    return {
      status: 'pilot_eligible_moderate',
      reason: 'Document admitted with moderate quality flags.',
      countedInPilotMetrics: true,
    }
  }

  // Default: Clean Admittance
  return {
    status: 'pilot_eligible_clean',
    reason: 'Document meets all criteria for clean admission.',
    countedInPilotMetrics: true,
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type PilotReviewStatus =
  | 'pending_review' // Extraction complete, awaiting human review
  | 'review_in_progress' // Reviewer has started checking
  | 'accepted' // Reviewer approved without changes
  | 'corrected_minor' // Reviewer made minor adjustments
  | 'corrected_major' // Reviewer made major corrections
  | 'rejected' // Extraction fundamentally unusable

export interface PilotReviewGateResult {
  /** Whether the pilot is active for this extraction */
  isPilotActive: boolean
  /** Initial review status for the extraction */
  reviewStatus: PilotReviewStatus
  /** Whether the result can be trusted without review */
  requiresHumanReview: boolean
  /** Banner text to show in the UI */
  reviewBannerText: string
  /** Whether the result should be labeled as draft */
  isDraft: boolean
}

export interface PilotReviewMetadata {
  pilotDocumentId: string
  reviewStatus: PilotReviewStatus
  reviewerUserId?: string
  reviewStartedAt?: string
  reviewCompletedAt?: string
  correctionCategories?: string[]
  reviewerNotes?: string
}

// ============================================================================
// FEATURE FLAG CHECK
// ============================================================================

const KASKO_PILOT_FLAG = 'kasko_ai_extraction_pilot'
const KASKO_PILOT_SEGMENT = 'kasko_pilot_reviewers'

/**
 * Check if the KASKO pilot is active for a given user and branch.
 *
 * @param branch - The insurance branch (must be 'kasko' for pilot)
 * @param userId - The current user's ID
 * @param featureFlags - Map of feature flag keys to their enabled status
 * @param userSegments - The user's assigned segments
 * @returns PilotReviewGateResult with gating information
 */
export function evaluateKaskoPilotGate(
  branch: string,
  userId: string | undefined,
  featureFlags: Record<string, boolean>,
  userSegments: string[] = []
): PilotReviewGateResult {
  // Only applies to KASKO
  if (branch !== 'kasko') {
    return {
      isPilotActive: false,
      reviewStatus: 'pending_review',
      requiresHumanReview: false,
      reviewBannerText: '',
      isDraft: false,
    }
  }

  // Check feature flag
  const flagEnabled = featureFlags[KASKO_PILOT_FLAG] === true
  if (!flagEnabled) {
    return {
      isPilotActive: false,
      reviewStatus: 'pending_review',
      requiresHumanReview: false,
      reviewBannerText: '',
      isDraft: false,
    }
  }

  // Check user segment
  const userInSegment = userSegments.includes(KASKO_PILOT_SEGMENT) || !userId
  if (!userInSegment) {
    return {
      isPilotActive: false,
      reviewStatus: 'pending_review',
      requiresHumanReview: false,
      reviewBannerText: '',
      isDraft: false,
    }
  }

  // Pilot is active for this user + branch
  return {
    isPilotActive: true,
    reviewStatus: 'pending_review',
    requiresHumanReview: true,
    reviewBannerText:
      '⚠️ TASLAK — İnsan İncelemesi Gerekli / DRAFT — Requires Human Review. ' +
      'Bu sonuçlar yapay zeka tarafından oluşturulmuştur ve insan onayı olmadan kesinleşmiş değildir.',
    isDraft: true,
  }
}

// ============================================================================
// REVIEW STATE TRANSITIONS
// ============================================================================

/**
 * Validate that a review status transition is allowed.
 * Prevents going backwards or skipping steps.
 */
export function isValidReviewTransition(from: PilotReviewStatus, to: PilotReviewStatus): boolean {
  const ALLOWED: Record<PilotReviewStatus, PilotReviewStatus[]> = {
    pending_review: ['review_in_progress'],
    review_in_progress: ['accepted', 'corrected_minor', 'corrected_major', 'rejected'],
    accepted: [],
    corrected_minor: [],
    corrected_major: [],
    rejected: ['pending_review'], // Can re-queue after rejection + fix
  }

  return (ALLOWED[from] || []).includes(to)
}

/**
 * Create initial pilot review metadata for a new extraction.
 */
export function createPilotReviewMetadata(documentId: string): PilotReviewMetadata {
  return {
    pilotDocumentId: documentId,
    reviewStatus: 'pending_review',
  }
}

/**
 * Generate a sequential pilot document ID.
 */
let _pilotCounter = 0
export function generatePilotDocumentId(): string {
  _pilotCounter++
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '')
  return `PILOT-KASKO-${timestamp}-${String(_pilotCounter).padStart(3, '0')}`
}

// ============================================================================
// QA OUTCOME LOGGING
// ============================================================================

export type CorrectionCategory =
  | 'policy_number'
  | 'provider'
  | 'dates'
  | 'premium'
  | 'coverage_count'
  | 'coverage_detail'
  | 'deductible'
  | 'conditional_deductible'
  | 'special_conditions'
  | 'endorsements'
  | 'exclusions'
  | 'unlimited_handling'
  | 'rayic_deger'
  | 'service_type'
  | 'display_mode'
  | 'prohibited_phrase'
  | 'other'

export interface PilotQARecord {
  documentId: string
  filename: string
  branch: string
  reviewDate: string
  reviewerUserId: string

  extractionSuccess: boolean
  extractionModel: string
  textCharCount: number
  pageCount: number

  reviewerOutcome: PilotReviewStatus
  reviewTimeMinutes: number
  correctionCategories: CorrectionCategory[]
  criticalFieldsMissed: string[]

  displayMode: string
  triggersFired: string[]
  phraseClean: boolean
  foundProhibitedPhrases: string[]

  // NEW: Pilot Admission (Phase 8I)
  admissionStatus: PilotAdmissionStatus
  admissionReason: string
  countedInPilotMetrics: boolean

  coverageCountExtracted: number
  specialConditionCount: number

  hasRayicDeger: boolean
  hasConditionalDeductible: boolean
  sourceQuoteCount: number
  confidenceScore: number

  zeroCoverage: boolean
  deductibleMiss: boolean
  specialConditionMiss: boolean
  majorCorrection: boolean

  // Reviewer-critical extraction quality fields
  premiumMissing: boolean
  insuredMissing: boolean
  deductibleUncertain: boolean
  coverageContradiction: boolean
  actuarialBlockedDueToMissingInputs: boolean
  reviewerMajorCorrectionReason: string

  reviewerNotes: string
}

/**
 * Create a new pilot QA record with defaults.
 */
export function createPilotQARecord(
  documentId: string,
  filename: string,
  reviewerUserId: string
): PilotQARecord {
  return {
    documentId,
    filename,
    branch: 'kasko',
    reviewDate: new Date().toISOString(),
    reviewerUserId,
    extractionSuccess: false,
    extractionModel: 'unknown',
    textCharCount: 0,
    pageCount: 0,
    reviewerOutcome: 'pending_review',
    reviewTimeMinutes: 0,
    correctionCategories: [],
    criticalFieldsMissed: [],
    displayMode: 'unknown',
    triggersFired: [],
    phraseClean: true,
    foundProhibitedPhrases: [],
    admissionStatus: 'pilot_eligible_clean',
    admissionReason: 'Default initialization',
    countedInPilotMetrics: true,
    coverageCountExtracted: 0,
    specialConditionCount: 0,
    hasRayicDeger: false,
    hasConditionalDeductible: false,
    sourceQuoteCount: 0,
    confidenceScore: 0,
    zeroCoverage: false,
    deductibleMiss: false,
    specialConditionMiss: false,
    majorCorrection: false,
    premiumMissing: false,
    insuredMissing: false,
    deductibleUncertain: false,
    coverageContradiction: false,
    actuarialBlockedDueToMissingInputs: false,
    reviewerMajorCorrectionReason: '',
    reviewerNotes: '',
  }
}

/**
 * Serialize and log a QA record. In production this would go to Supabase;
 * during pilot it appends to a local JSONL file.
 */
export function logPilotQARecord(record: PilotQARecord): string {
  const json = JSON.stringify(record)

  // In Node.js environments, append to JSONL file
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as unknown as { process?: unknown }).process !== 'undefined'
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs')
      fs.appendFileSync('/tmp/kasko-pilot-qa-log.jsonl', json + '\n')
    } catch {
      // Silently fail in browser environments
    }
  }

  return json
}

/**
 * Check rollback trigger status based on accumulated QA records.
 */
export function getRollbackTriggerStatus(records: PilotQARecord[]): {
  shouldPause: boolean
  triggers: string[]
} {
  if (records.length === 0) return { shouldPause: false, triggers: [] }

  const triggers: string[] = []

  const zeroCovRate = records.filter((r) => r.zeroCoverage).length / records.length
  if (zeroCovRate > 0.2)
    triggers.push(`ZERO_COVERAGE_RATE: ${(zeroCovRate * 100).toFixed(0)}% > 20%`)

  const phraseLeaks = records.filter((r) => !r.phraseClean).length
  if (phraseLeaks > 0)
    triggers.push(`PHRASE_LEAK: ${phraseLeaks} document(s) with prohibited phrases`)

  const majorRate = records.filter((r) => r.majorCorrection).length / records.length
  if (majorRate > 0.5)
    triggers.push(`MAJOR_CORRECTION_RATE: ${(majorRate * 100).toFixed(0)}% > 50%`)

  // Check for consecutive deductible misses
  let consecutiveMisses = 0
  for (const r of records) {
    if (r.deductibleMiss) {
      consecutiveMisses++
      if (consecutiveMisses >= 3) {
        triggers.push(`CONSECUTIVE_DEDUCTIBLE_MISS: ${consecutiveMisses} in a row`)
        break
      }
    } else {
      consecutiveMisses = 0
    }
  }

  return { shouldPause: triggers.length > 0, triggers }
}
