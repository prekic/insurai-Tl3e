/**
 * Tests for evaluateSimpleDisplayMode — lightweight display mode for pilot QA records
 *
 * Bug: All 22 QA records had display_mode: 'unknown' instead of 'full'/'restricted'
 * Fix: Added evaluateSimpleDisplayMode() to kasko-pilot-gate.ts, wired into policy-extractor.ts
 */
import { describe, it, expect } from 'vitest'
import { evaluateSimpleDisplayMode } from '../kasko-pilot-gate'

describe('evaluateSimpleDisplayMode', () => {
  it('returns "full" for high confidence with all fields present', () => {
    const result = evaluateSimpleDisplayMode(0.95, {
      policyNumber: 'POL-001',
      provider: 'Allianz',
      coverages: [{ name: 'Collision' }],
    })
    expect(result.mode).toBe('full')
    expect(result.triggers).toEqual([])
  })

  it('returns "full" at exactly 0.6 confidence', () => {
    const result = evaluateSimpleDisplayMode(0.6, {
      policyNumber: 'POL-001',
      provider: 'AXA',
      coverages: [{ name: 'Fire' }],
    })
    expect(result.mode).toBe('full')
    expect(result.triggers).toEqual([])
  })

  it('returns "human_review_required" for very low confidence (<0.3)', () => {
    const result = evaluateSimpleDisplayMode(0.2, {
      policyNumber: 'POL-001',
      provider: 'Allianz',
      coverages: [{ name: 'Collision' }],
    })
    expect(result.mode).toBe('human_review_required')
    expect(result.triggers).toContain('LOW_CONFIDENCE_HUMAN_REVIEW')
  })

  it('returns "human_review_required" at exactly 0.0 confidence', () => {
    const result = evaluateSimpleDisplayMode(0, {
      policyNumber: 'POL-001',
      provider: 'Allianz',
      coverages: [],
    })
    expect(result.mode).toBe('human_review_required')
    expect(result.triggers).toContain('LOW_CONFIDENCE_HUMAN_REVIEW')
  })

  it('returns "restricted" for low confidence (0.3-0.59)', () => {
    const result = evaluateSimpleDisplayMode(0.45, {
      policyNumber: 'POL-001',
      provider: 'Allianz',
      coverages: [{ name: 'Collision' }],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('LOW_CONFIDENCE_RESTRICTED')
  })

  it('returns "restricted" when policy number is missing', () => {
    const result = evaluateSimpleDisplayMode(0.9, {
      policyNumber: null,
      provider: 'Allianz',
      coverages: [{ name: 'Collision' }],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('MISSING_POLICY_NUMBER')
  })

  it('returns "restricted" when provider is missing', () => {
    const result = evaluateSimpleDisplayMode(0.9, {
      policyNumber: 'POL-001',
      provider: null,
      coverages: [{ name: 'Collision' }],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('MISSING_PROVIDER')
  })

  it('returns "restricted" when coverages array is empty', () => {
    const result = evaluateSimpleDisplayMode(0.9, {
      policyNumber: 'POL-001',
      provider: 'Allianz',
      coverages: [],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('NO_COVERAGES_EXTRACTED')
  })

  it('returns "restricted" when coverages is undefined', () => {
    const result = evaluateSimpleDisplayMode(0.9, {
      policyNumber: 'POL-001',
      provider: 'Allianz',
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('NO_COVERAGES_EXTRACTED')
  })

  it('accumulates multiple triggers', () => {
    const result = evaluateSimpleDisplayMode(0.5, {
      policyNumber: null,
      provider: null,
      coverages: [],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('LOW_CONFIDENCE_RESTRICTED')
    expect(result.triggers).toContain('MISSING_POLICY_NUMBER')
    expect(result.triggers).toContain('MISSING_PROVIDER')
    expect(result.triggers).toContain('NO_COVERAGES_EXTRACTED')
    expect(result.triggers).toHaveLength(4)
  })

  it('human_review short-circuits even with all fields present', () => {
    const result = evaluateSimpleDisplayMode(0.1, {
      policyNumber: 'POL-001',
      provider: 'Allianz',
      coverages: [{ name: 'Collision' }],
    })
    // Should return immediately without checking other fields
    expect(result.mode).toBe('human_review_required')
    expect(result.triggers).toEqual(['LOW_CONFIDENCE_HUMAN_REVIEW'])
  })

  it('handles boundary at exactly 0.3 (not human_review)', () => {
    const result = evaluateSimpleDisplayMode(0.3, {
      policyNumber: 'POL-001',
      provider: 'Allianz',
      coverages: [{ name: 'Collision' }],
    })
    // 0.3 is NOT < 0.3, so should NOT be human_review_required
    // 0.3 IS < 0.6, so should be restricted
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('LOW_CONFIDENCE_RESTRICTED')
  })

  it('treats empty string policyNumber as missing', () => {
    const result = evaluateSimpleDisplayMode(0.9, {
      policyNumber: '',
      provider: 'Allianz',
      coverages: [{ name: 'Collision' }],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('MISSING_POLICY_NUMBER')
  })
})
