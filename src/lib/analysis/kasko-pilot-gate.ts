/**
 * KASKO Internal Pilot — Review Gate
 *
 * Provides pilot gating logic that:
 * 1. Checks if the KASKO pilot feature flag is active
 * 2. Tags extraction results with review status
 * 3. Provides review-state transitions
 *
 * IMPORTANT: During the internal pilot, ALL KASKO extractions require human review.
 * KASKO is internal-pilot-ready with mandatory human review, not production-ready.
 */

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
