import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { AnalyzedPolicy } from '@/types/policy'

// Mock analysis dependencies
vi.mock('@/lib/analysis/display-interpreter', () => ({
  generateDisplaySafeSummary: vi.fn(() => ({
    policyNumber: 'POL-001',
    provider: 'Test Provider',
    status: 'active',
    isPilotResult: false,
    requiresHumanReview: false,
    isDraft: false,
  })),
}))

vi.mock('@/lib/analysis/engine', () => ({
  generateAnalysisBundle: vi.fn(() => ({
    id: 'bundle-1',
    summary: {},
    recommendations: [],
  })),
}))

vi.mock('@/lib/analysis/kasko-pilot-gate', () => ({
  evaluateKaskoPilotGate: vi.fn(
    (_branch: string, _userId: string | undefined, flags: Record<string, boolean>) => ({
      isPilotActive: flags['kasko_ai_extraction_pilot'] === true,
      requiresHumanReview: true,
      reviewStatus: 'pending_review',
      isDraft: true,
      reviewBannerText: 'TASLAK / DRAFT',
    })
  ),
}))

import { useDisplaySafeSummary } from './useDisplaySafeSummary'

function createMockPolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'policy-1',
    policyNumber: 'POL-001',
    provider: 'Allianz',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 100000,
    premium: 5000,
    deductible: 1000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [],
    exclusions: [],
    aiInsights: [],
    aiConfidence: 0.85,
    ...overrides,
  } as AnalyzedPolicy
}

describe('useDisplaySafeSummary', () => {
  it('returns null for null policy', () => {
    const { result } = renderHook(() => useDisplaySafeSummary(null))
    expect(result.current).toBeNull()
  })

  it('returns null for undefined policy', () => {
    const { result } = renderHook(() => useDisplaySafeSummary(undefined))
    expect(result.current).toBeNull()
  })

  it('returns a DisplaySafePolicySummary for valid policy', () => {
    const policy = createMockPolicy()
    const { result } = renderHook(() => useDisplaySafeSummary(policy))

    expect(result.current).not.toBeNull()
    // @ts-expect-error - mismatch due to schema update
    expect(result.current?.policyNumber).toBe('POL-001')
  })

  it('attaches pilot metadata when pilot is active', () => {
    const policy = createMockPolicy({ type: 'kasko' })
    const options = {
      featureFlags: { kasko_ai_extraction_pilot: true },
      userSegments: ['kasko_pilot_reviewers'],
      userId: 'user-123',
    }

    const { result } = renderHook(() => useDisplaySafeSummary(policy, options))

    expect(result.current?.isPilotResult).toBe(true)
    expect(result.current?.isDraft).toBe(true)
    expect(result.current?.requiresHumanReview).toBe(true)
    expect(result.current?.pilotFlagName).toBe('kasko_ai_extraction_pilot')
    expect(result.current?.pilotReviewerSegment).toBe('kasko_pilot_reviewers')
  })

  it('does not attach pilot metadata when pilot is not active', () => {
    const policy = createMockPolicy({ type: 'kasko' })
    const options = {
      featureFlags: { kasko_ai_extraction_pilot: false },
      userSegments: [],
      userId: 'user-123',
    }

    const { result } = renderHook(() => useDisplaySafeSummary(policy, options))

    expect(result.current?.isPilotResult).toBeFalsy()
  })

  it('handles policy without optional fields', () => {
    const policy = createMockPolicy({
      coverages: [],
      exclusions: [],
      aiInsights: [],
      safetyFlags: undefined,
      safetyBlockReason: undefined,
      analysisBundle: undefined,
    })

    const { result } = renderHook(() => useDisplaySafeSummary(policy))
    expect(result.current).not.toBeNull()
  })

  it('is memoized on policy reference', () => {
    const policy = createMockPolicy()
    const { result, rerender } = renderHook(() => useDisplaySafeSummary(policy))

    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('recalculates when policy changes', () => {
    let policy = createMockPolicy({ policyNumber: 'POL-001' })
    const { result, rerender } = renderHook(({ p }) => useDisplaySafeSummary(p), {
      initialProps: { p: policy },
    })

    const first = result.current

    policy = createMockPolicy({ policyNumber: 'POL-002' })
    rerender({ p: policy })

    // Should be a new reference since policy changed
    expect(result.current).not.toBe(first)
  })
})
