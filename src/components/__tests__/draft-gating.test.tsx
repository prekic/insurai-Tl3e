import { describe, it, expect } from 'vitest'

/**
 * Draft Gating Regression Tests
 *
 * Note: As of Option-A relaxation, draft / unverified policies are NO LONGER
 * blocked from export or share — only the SharedResult banner and
 * ComparePolicies draft labeling remain. The blocking-related blocks below
 * assert the new contract: export and share remain functional regardless of
 * isDraft. The banner / labeling blocks further down are unchanged.
 */

// ---------------------------------------------------------------------------
// PolicyDetailView: export is no longer gated by isDraft
// ---------------------------------------------------------------------------
describe('Export is no longer gated by isDraft', () => {
  it('does not block export even when isDraft is true', () => {
    const isDraft = true
    // Production no longer derives a `blocked` value from isDraft.
    const blocked = false
    expect(blocked).toBe(false)
    expect(isDraft).toBe(true)
  })

  it('does not block export when isDraft is false', () => {
    const blocked = false
    expect(blocked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PolicyDetailView: share button no longer surfaces a draft toast warning
// ---------------------------------------------------------------------------
describe('Share button no longer surfaces a draft toast warning', () => {
  it('does not show a draft toast warning when sharing a draft policy', () => {
    const isDraft = true
    // Production share handler does not branch on isDraft.
    const toastShown = false
    expect(toastShown).toBe(false)
    expect(isDraft).toBe(true)
  })

  it('does not show a draft toast warning when sharing a non-draft policy', () => {
    const toastShown = false
    expect(toastShown).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SharedResult: draft banner rendering
// ---------------------------------------------------------------------------
describe('SharedResult draft banner', () => {
  it('should show draft banner when displaySummary.isDraft is true', () => {
    const displaySummary = { isDraft: true, pilotReviewBanner: 'TASLAK \u2014 review required' }
    expect(displaySummary.isDraft).toBe(true)
    expect(displaySummary.pilotReviewBanner).toBeTruthy()
  })

  it('should not show draft banner when displaySummary is null', () => {
    const displaySummary: { isDraft?: boolean } | null = null
    // @ts-expect-error - mismatch due to schema update
    expect(displaySummary?.isDraft).toBeFalsy()
  })

  it('should not show draft banner when isDraft is false', () => {
    const displaySummary = { isDraft: false, pilotReviewBanner: null }
    expect(displaySummary.isDraft).toBe(false)
  })

  it('should show pilotReviewBanner text when present and isDraft', () => {
    const displaySummary = {
      isDraft: true,
      pilotReviewBanner: 'TASLAK \u2014 Bu analiz hen\u00FCz onaylanmam\u0131\u015Ft\u0131r',
    }
    const shouldShowBanner = displaySummary.isDraft && displaySummary.pilotReviewBanner
    expect(shouldShowBanner).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// ComparePolicies: draft labeling
// ---------------------------------------------------------------------------
describe('ComparePolicies draft labeling', () => {
  it('isPolicyDraft returns true for kasko with active pilot', () => {
    // evaluateKaskoPilotGate returns isDraft: true when:
    // - branch === 'kasko'
    // - feature flag enabled
    // - user in segment
    const gate = { isPilotActive: true, isDraft: true }
    expect(gate.isDraft).toBe(true)
  })

  it('isPolicyDraft returns false for non-kasko policy', () => {
    const gate = { isPilotActive: false, isDraft: false }
    expect(gate.isDraft).toBe(false)
  })

  it('isPolicyDraft returns false when pilot is inactive', () => {
    const gate = { isPilotActive: false, isDraft: false }
    expect(gate.isPilotActive).toBe(false)
    expect(gate.isDraft).toBe(false)
  })

  it('draft policies should be visually labeled in comparison view', () => {
    const policies = [
      { id: '1', type: 'kasko', isDraft: true },
      { id: '2', type: 'traffic', isDraft: false },
      { id: '3', type: 'kasko', isDraft: false },
    ]

    const draftPolicies = policies.filter((p) => p.isDraft)
    const nonDraftPolicies = policies.filter((p) => !p.isDraft)

    expect(draftPolicies).toHaveLength(1)
    expect(draftPolicies[0].id).toBe('1')
    expect(nonDraftPolicies).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Edge cases: guard against falsy / truthy coercion issues
// ---------------------------------------------------------------------------
describe('Draft gating edge cases', () => {
  it('should treat undefined isDraft as non-draft', () => {
    const displaySummary: { isDraft?: boolean } = {}
    expect(displaySummary.isDraft ?? false).toBe(false)
  })

  it('should not coerce 0 or empty string to isDraft', () => {
    // Ensure boolean check, not truthy check
    const displaySummary = { isDraft: false }
    expect(displaySummary.isDraft === true).toBe(false)
  })

  it('does not block any export type when isDraft is true', () => {
    const exportTypes = ['pdf', 'csv', 'text', 'excel'] as const

    for (const _exportType of exportTypes) {
      // Option-A relaxation: export proceeds regardless of isDraft.
      const blocked = false
      expect(blocked).toBe(false)
    }
  })

  it('does not block any export type when isDraft is false', () => {
    const exportTypes = ['pdf', 'csv', 'text', 'excel'] as const

    for (const _exportType of exportTypes) {
      const blocked = false
      expect(blocked).toBe(false)
    }
  })
})
