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

// ============================================================================
// Phase E — Gradual rollout via rolloutPercentage
// ============================================================================

describe('evaluateKaskoPilotGate — Phase E gradual rollout', () => {
  const SEGMENT = ['kasko_pilot_reviewers']

  it('activates at 100% rollout regardless of userId bucket', () => {
    for (const userId of ['a', 'b', 'user-123', '00000000-0000-0000-0000-000000000001']) {
      const result = evaluateKaskoPilotGate(
        'kasko',
        userId,
        { kasko_ai_extraction_pilot: { enabled: true, rolloutPercentage: 100 } },
        SEGMENT
      )
      expect(result.isPilotActive).toBe(true)
    }
  })

  it('rejects segment members when rolloutPercentage is 0', () => {
    for (const userId of ['a', 'b', 'c']) {
      const result = evaluateKaskoPilotGate(
        'kasko',
        userId,
        { kasko_ai_extraction_pilot: { enabled: true, rolloutPercentage: 0 } },
        SEGMENT
      )
      expect(result.isPilotActive).toBe(false)
    }
  })

  it('bucket assignment is deterministic per userId', () => {
    const flags = { kasko_ai_extraction_pilot: { enabled: true, rolloutPercentage: 50 } }
    // Same userId → same result across 20 invocations
    const userId = 'e2e-test-user-42'
    const first = evaluateKaskoPilotGate('kasko', userId, flags, SEGMENT).isPilotActive
    for (let i = 0; i < 20; i++) {
      expect(evaluateKaskoPilotGate('kasko', userId, flags, SEGMENT).isPilotActive).toBe(first)
    }
  })

  it('anonymous users (no userId) skip the bucket check', () => {
    // Undefined userId: the segment check also treats undefined as allowed,
    // so pilot activates despite low rollout percentage.
    const result = evaluateKaskoPilotGate(
      'kasko',
      undefined,
      { kasko_ai_extraction_pilot: { enabled: true, rolloutPercentage: 5 } },
      SEGMENT
    )
    expect(result.isPilotActive).toBe(true)
  })

  it('distribution sanity: 50% rollout buckets ~half of 1000 synthetic users', () => {
    const flags = { kasko_ai_extraction_pilot: { enabled: true, rolloutPercentage: 50 } }
    let active = 0
    for (let i = 0; i < 1000; i++) {
      const userId = `synthetic-user-${i}`
      if (evaluateKaskoPilotGate('kasko', userId, flags, SEGMENT).isPilotActive) active++
    }
    // Chi-square-ish sanity: 50% should produce 400-600 on 1000 samples.
    // Wide band guards against flakiness while still catching gross bias.
    expect(active).toBeGreaterThanOrEqual(400)
    expect(active).toBeLessThanOrEqual(600)
  })

  it('back-compat: legacy boolean flag form is treated as fully rolled out', () => {
    // Critical: existing call sites pass Record<string, boolean>. They must
    // continue to activate the pilot (no silent regression to 0%).
    const result = evaluateKaskoPilotGate(
      'kasko',
      'user-1',
      { kasko_ai_extraction_pilot: true },
      SEGMENT
    )
    expect(result.isPilotActive).toBe(true)
  })

  it('segment is PRIMARY gate — out-of-bucket users never activate even at 100%', () => {
    const result = evaluateKaskoPilotGate(
      'kasko',
      'user-1',
      { kasko_ai_extraction_pilot: { enabled: true, rolloutPercentage: 100 } },
      ['other_segment']
    )
    expect(result.isPilotActive).toBe(false)
  })
})
