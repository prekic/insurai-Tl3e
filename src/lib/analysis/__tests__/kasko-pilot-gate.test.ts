/**
 * Phase 8F — KASKO Pilot Gate Tests
 *
 * Narrowly scoped tests for pilot gating and review-state logic.
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateKaskoPilotGate,
  isValidReviewTransition,
  createPilotReviewMetadata,
  generatePilotDocumentId,
} from '../kasko-pilot-gate'

// ============================================================================
// Feature flag gating
// ============================================================================

describe('KASKO pilot gate — feature flag gating', () => {
  const flags = { kasko_ai_extraction_pilot: true }
  const segments = ['kasko_pilot_reviewers']

  it('activates pilot for kasko + flag + segment', () => {
    const result = evaluateKaskoPilotGate('kasko', 'user-1', flags, segments)
    expect(result.isPilotActive).toBe(true)
    expect(result.requiresHumanReview).toBe(true)
    expect(result.isDraft).toBe(true)
    expect(result.reviewStatus).toBe('pending_review')
  })

  it('does NOT activate for non-kasko branch', () => {
    const result = evaluateKaskoPilotGate('traffic', 'user-1', flags, segments)
    expect(result.isPilotActive).toBe(false)
  })

  it('does NOT activate when flag is disabled', () => {
    const result = evaluateKaskoPilotGate(
      'kasko',
      'user-1',
      { kasko_ai_extraction_pilot: false },
      segments
    )
    expect(result.isPilotActive).toBe(false)
  })

  it('does NOT activate when flag is missing', () => {
    const result = evaluateKaskoPilotGate('kasko', 'user-1', {}, segments)
    expect(result.isPilotActive).toBe(false)
  })

  it('does NOT activate when user is not in segment', () => {
    const result = evaluateKaskoPilotGate('kasko', 'user-1', flags, ['other_segment'])
    expect(result.isPilotActive).toBe(false)
  })

  it('shows review banner in Turkish and English', () => {
    const result = evaluateKaskoPilotGate('kasko', 'user-1', flags, segments)
    expect(result.reviewBannerText).toContain('TASLAK')
    expect(result.reviewBannerText).toContain('DRAFT')
    expect(result.reviewBannerText).toContain('Human Review')
  })
})

// ============================================================================
// Review state transitions
// ============================================================================

describe('KASKO pilot gate — review state transitions', () => {
  it('pending_review → review_in_progress is valid', () => {
    expect(isValidReviewTransition('pending_review', 'review_in_progress')).toBe(true)
  })

  it('review_in_progress → accepted is valid', () => {
    expect(isValidReviewTransition('review_in_progress', 'accepted')).toBe(true)
  })

  it('review_in_progress → corrected_major is valid', () => {
    expect(isValidReviewTransition('review_in_progress', 'corrected_major')).toBe(true)
  })

  it('review_in_progress → rejected is valid', () => {
    expect(isValidReviewTransition('review_in_progress', 'rejected')).toBe(true)
  })

  it('accepted → anything is invalid (terminal state)', () => {
    expect(isValidReviewTransition('accepted', 'pending_review')).toBe(false)
    expect(isValidReviewTransition('accepted', 'rejected')).toBe(false)
  })

  it('pending_review → accepted directly is invalid (must go through in_progress)', () => {
    expect(isValidReviewTransition('pending_review', 'accepted')).toBe(false)
  })

  it('rejected → pending_review is valid (re-queue)', () => {
    expect(isValidReviewTransition('rejected', 'pending_review')).toBe(true)
  })
})

// ============================================================================
// Metadata and ID generation
// ============================================================================

describe('KASKO pilot gate — metadata', () => {
  it('creates metadata with pending_review status', () => {
    const meta = createPilotReviewMetadata('PILOT-KASKO-20260315-001')
    expect(meta.reviewStatus).toBe('pending_review')
    expect(meta.pilotDocumentId).toBe('PILOT-KASKO-20260315-001')
  })

  it('generates sequential document IDs', () => {
    const id1 = generatePilotDocumentId()
    const id2 = generatePilotDocumentId()
    expect(id1).toMatch(/^PILOT-KASKO-\d{8}-\d{3}$/)
    expect(id2).toMatch(/^PILOT-KASKO-\d{8}-\d{3}$/)
    expect(id1).not.toBe(id2)
  })
})

// ============================================================================
// Integration: pilot gate does not affect non-pilot flow
// ============================================================================

describe('KASKO pilot gate — non-interference', () => {
  const allBranches = ['traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat']

  it.each(allBranches)('does not interfere with %s branch', (branch) => {
    const result = evaluateKaskoPilotGate(branch, 'user-1', { kasko_ai_extraction_pilot: true }, [
      'kasko_pilot_reviewers',
    ])
    expect(result.isPilotActive).toBe(false)
    expect(result.requiresHumanReview).toBe(false)
    expect(result.isDraft).toBe(false)
  })
})
