import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { PolicyComparison } from '@/lib/policy-evaluation/types'
import type { Policy, PolicyType, PolicyStatus } from '@/types/policy'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockComparePolicies = vi.fn()

vi.mock('@/lib/policy-evaluation', () => ({
  comparePolicies: (...args: unknown[]) => mockComparePolicies(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextPolicyId = 1

function createMockPolicy(overrides: Partial<Policy> = {}): Policy {
  const id = `policy-${nextPolicyId++}`
  return {
    id,
    policyNumber: `POL-${id}`,
    provider: 'Allianz',
    logo: '',
    type: 'kasko' as PolicyType,
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 12000,
    monthlyPremium: 1000,
    deductible: 5000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active' as PolicyStatus,
    uploadDate: '2026-01-01',
    fileName: 'policy.pdf',
    documentType: 'policy',
    coverages: [],
    exclusions: [],
    specialConditions: [],
    insuranceLine: 'kara_araclari',
    ...overrides,
  }
}

function createMockComparison(policyIds: string[]): PolicyComparison {
  return {
    comparedAt: new Date().toISOString(),
    policies: policyIds.map((id, i) => ({
      policy: createMockPolicy({ id }),
      evaluation: {
        policyId: id,
        policyNumber: `POL-${id}`,
        policyType: 'kasko' as PolicyType,
        evaluatedAt: new Date().toISOString(),
        overallScore: 80 - i * 5,
        grade: 'B' as const,
        status: 'good' as const,
        scoreBreakdown: {
          premium: { category: 'Premium', categoryTR: 'Prim', score: 75, weight: 20, details: '', detailsTR: '', issues: [], issuesTR: [] },
          coverage: { category: 'Coverage', categoryTR: 'Teminat', score: 80, weight: 30, details: '', detailsTR: '', issues: [], issuesTR: [] },
          deductible: { category: 'Deductible', categoryTR: 'Muafiyet', score: 70, weight: 15, details: '', detailsTR: '', issues: [], issuesTR: [] },
          compliance: { category: 'Compliance', categoryTR: 'Uyum', score: 90, weight: 20, details: '', detailsTR: '', issues: [], issuesTR: [] },
          value: { category: 'Value', categoryTR: 'Deger', score: 85, weight: 15, details: '', detailsTR: '', issues: [], issuesTR: [] },
        },
        marketComparison: { premiumPercentile: 60, coveragePercentile: 70, isAboveAverageValue: true, competitivePosition: 'competitive' as const },
        compliance: { isCompliant: true, mandatoryMet: true, minimumLimitsMet: true, issues: [] },
        recommendations: [],
        summary: { strengths: [], strengthsTR: [], weaknesses: [], weaknessesTR: [], immediateActions: [], immediateActionsTR: [] },
      },
      label: `Policy ${i + 1}`,
    })),
    winners: {
      overallBest: policyIds[0],
      bestPremium: policyIds[0],
      bestCoverage: policyIds[0],
      bestValue: policyIds[0],
      bestCompliance: policyIds[0],
    },
    metrics: [],
    coverageMatrix: [],
    rankings: policyIds.map((id, i) => ({
      policyId: id,
      overallRank: i + 1,
      premiumRank: i + 1,
      coverageRank: i + 1,
      valueRank: i + 1,
    })),
    analysis: {
      recommendation: 'Policy 1 recommended',
      recommendationTR: 'Police 1 onerilir',
      keyDifferences: [],
      tradeoffs: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Import hooks lazily (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  usePolicyComparison,
  useCompareSelection,
  useCompareUrlState,
} from './usePolicyComparison'

// ===========================================================================
// usePolicyComparison
// ===========================================================================

describe('usePolicyComparison', () => {
  beforeEach(() => {
    nextPolicyId = 1
    mockComparePolicies.mockReset()
  })

  // -------------------------------------------------------------------------
  // Validation: policy count
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('returns invalid for 0 policies', () => {
      const { result } = renderHook(() => usePolicyComparison([]))

      expect(result.current.isValid).toBe(false)
      expect(result.current.validationMessage).toBe('Select at least 2 policies to compare')
      expect(result.current.comparison).toBeNull()
      expect(result.current.error).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })

    it('returns invalid for 1 policy', () => {
      const policies = [createMockPolicy()]
      const { result } = renderHook(() => usePolicyComparison(policies))

      expect(result.current.isValid).toBe(false)
      expect(result.current.validationMessage).toBe('Select at least 2 policies to compare')
      expect(result.current.comparison).toBeNull()
      expect(mockComparePolicies).not.toHaveBeenCalled()
    })

    it('returns valid for 2 policies', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      const ids = policies.map(p => p.id)
      const mockResult = createMockComparison(ids)
      mockComparePolicies.mockReturnValue(mockResult)

      const { result } = renderHook(() => usePolicyComparison(policies))

      expect(result.current.isValid).toBe(true)
      expect(result.current.validationMessage).toBeNull()
      expect(result.current.comparison).toBe(mockResult)
    })

    it('returns valid for 3 policies', () => {
      const policies = [createMockPolicy(), createMockPolicy(), createMockPolicy()]
      const ids = policies.map(p => p.id)
      mockComparePolicies.mockReturnValue(createMockComparison(ids))

      const { result } = renderHook(() => usePolicyComparison(policies))

      expect(result.current.isValid).toBe(true)
      expect(result.current.validationMessage).toBeNull()
      expect(result.current.comparison).not.toBeNull()
    })

    it('returns valid for 4 policies', () => {
      const policies = Array.from({ length: 4 }, () => createMockPolicy())
      const ids = policies.map(p => p.id)
      mockComparePolicies.mockReturnValue(createMockComparison(ids))

      const { result } = renderHook(() => usePolicyComparison(policies))

      expect(result.current.isValid).toBe(true)
      expect(result.current.validationMessage).toBeNull()
    })

    it('returns invalid for 5 policies', () => {
      const policies = Array.from({ length: 5 }, () => createMockPolicy())

      const { result } = renderHook(() => usePolicyComparison(policies))

      expect(result.current.isValid).toBe(false)
      expect(result.current.validationMessage).toBe('Maximum 4 policies can be compared')
      expect(result.current.comparison).toBeNull()
      expect(mockComparePolicies).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // comparePolicies invocation
  // -------------------------------------------------------------------------

  describe('comparePolicies invocation', () => {
    it('passes policies to comparePolicies', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      mockComparePolicies.mockReturnValue(createMockComparison(policies.map(p => p.id)))

      renderHook(() => usePolicyComparison(policies))

      expect(mockComparePolicies).toHaveBeenCalledTimes(1)
      expect(mockComparePolicies).toHaveBeenCalledWith(policies, undefined, undefined)
    })

    it('passes labels option to comparePolicies', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      const labels = ['Current', 'Alternative']
      mockComparePolicies.mockReturnValue(createMockComparison(policies.map(p => p.id)))

      renderHook(() => usePolicyComparison(policies, { labels }))

      expect(mockComparePolicies).toHaveBeenCalledWith(policies, labels, undefined)
    })

    it('passes config option to comparePolicies', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      const config = { weights: { premium: 30, coverage: 25, deductible: 15, compliance: 15, value: 15 } }
      mockComparePolicies.mockReturnValue(createMockComparison(policies.map(p => p.id)))

      renderHook(() => usePolicyComparison(policies, { config }))

      expect(mockComparePolicies).toHaveBeenCalledWith(policies, undefined, config)
    })

    it('passes both labels and config to comparePolicies', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      const labels = ['A', 'B']
      const config = { strictCompliance: false }
      mockComparePolicies.mockReturnValue(createMockComparison(policies.map(p => p.id)))

      renderHook(() => usePolicyComparison(policies, { labels, config }))

      expect(mockComparePolicies).toHaveBeenCalledWith(policies, labels, config)
    })

    it('does not call comparePolicies when validation fails (too few)', () => {
      renderHook(() => usePolicyComparison([createMockPolicy()]))
      expect(mockComparePolicies).not.toHaveBeenCalled()
    })

    it('does not call comparePolicies when validation fails (too many)', () => {
      renderHook(() => usePolicyComparison(Array.from({ length: 5 }, () => createMockPolicy())))
      expect(mockComparePolicies).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('catches Error thrown by comparePolicies and returns it', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      const error = new Error('Comparison failed: invalid data')
      mockComparePolicies.mockImplementation(() => { throw error })

      const { result } = renderHook(() => usePolicyComparison(policies))

      expect(result.current.error).toBe(error)
      expect(result.current.comparison).toBeNull()
      expect(result.current.isValid).toBe(true) // validation passed, execution failed
      expect(result.current.validationMessage).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })

    it('wraps non-Error thrown values in a generic Error', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      mockComparePolicies.mockImplementation(() => { throw 'string error' })  

      const { result } = renderHook(() => usePolicyComparison(policies))

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('Failed to compare policies')
      expect(result.current.comparison).toBeNull()
    })

    it('wraps thrown null in a generic Error', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      mockComparePolicies.mockImplementation(() => { throw null })  

      const { result } = renderHook(() => usePolicyComparison(policies))

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('Failed to compare policies')
    })
  })

  // -------------------------------------------------------------------------
  // Memoization
  // -------------------------------------------------------------------------

  describe('memoization', () => {
    it('does not recompute when policies reference changes but content is identical', () => {
      const p1 = createMockPolicy({ id: 'p1', premium: 1000, coverage: 500000 })
      const p2 = createMockPolicy({ id: 'p2', premium: 2000, coverage: 600000 })
      mockComparePolicies.mockReturnValue(createMockComparison(['p1', 'p2']))

      const { rerender } = renderHook(
        ({ policies }) => usePolicyComparison(policies),
        { initialProps: { policies: [p1, p2] } }
      )

      expect(mockComparePolicies).toHaveBeenCalledTimes(1)

      // Create new array reference with same policy objects
      rerender({ policies: [p1, p2] })

      // Should still be 1 call because the hash (id:premium:coverage) is identical
      expect(mockComparePolicies).toHaveBeenCalledTimes(1)
    })

    it('recomputes when a policy premium changes', () => {
      const p1 = createMockPolicy({ id: 'p1', premium: 1000, coverage: 500000 })
      const p2 = createMockPolicy({ id: 'p2', premium: 2000, coverage: 600000 })
      mockComparePolicies.mockReturnValue(createMockComparison(['p1', 'p2']))

      const { rerender } = renderHook(
        ({ policies }) => usePolicyComparison(policies),
        { initialProps: { policies: [p1, p2] } }
      )

      expect(mockComparePolicies).toHaveBeenCalledTimes(1)

      // Change premium on p1
      const p1Updated = { ...p1, premium: 1500 }
      rerender({ policies: [p1Updated, p2] })

      expect(mockComparePolicies).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  // isLoading is always false (synchronous)
  // -------------------------------------------------------------------------

  describe('isLoading', () => {
    it('is always false for valid policies', () => {
      const policies = [createMockPolicy(), createMockPolicy()]
      mockComparePolicies.mockReturnValue(createMockComparison(policies.map(p => p.id)))

      const { result } = renderHook(() => usePolicyComparison(policies))
      expect(result.current.isLoading).toBe(false)
    })

    it('is always false for invalid policies', () => {
      const { result } = renderHook(() => usePolicyComparison([]))
      expect(result.current.isLoading).toBe(false)
    })
  })
})

// ===========================================================================
// useCompareSelection
// ===========================================================================

describe('useCompareSelection', () => {
  beforeEach(() => {
    nextPolicyId = 1
  })

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts with empty selection', () => {
      const { result } = renderHook(() => useCompareSelection())

      expect(result.current.selectedIds).toEqual([])
      expect(result.current.selectionCount).toBe(0)
      expect(result.current.canAdd).toBe(true)
      expect(result.current.canCompare).toBe(false)
      expect(result.current.maxPolicies).toBe(4)
    })

    it('respects custom maxPolicies', () => {
      const { result } = renderHook(() => useCompareSelection(3))

      expect(result.current.maxPolicies).toBe(3)
      expect(result.current.canAdd).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // togglePolicy
  // -------------------------------------------------------------------------

  describe('togglePolicy', () => {
    it('adds a policy when not selected', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.togglePolicy('p1') })

      expect(result.current.selectedIds).toEqual(['p1'])
      expect(result.current.selectionCount).toBe(1)
    })

    it('removes a policy when already selected', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.togglePolicy('p1') })
      act(() => { result.current.togglePolicy('p1') })

      expect(result.current.selectedIds).toEqual([])
      expect(result.current.selectionCount).toBe(0)
    })

    it('does not add beyond maxPolicies', () => {
      const { result } = renderHook(() => useCompareSelection(2))

      act(() => { result.current.togglePolicy('p1') })
      act(() => { result.current.togglePolicy('p2') })
      act(() => { result.current.togglePolicy('p3') })

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
      expect(result.current.selectionCount).toBe(2)
    })

    it('still allows removing when at max', () => {
      const { result } = renderHook(() => useCompareSelection(2))

      act(() => { result.current.togglePolicy('p1') })
      act(() => { result.current.togglePolicy('p2') })

      // At max, try to remove
      act(() => { result.current.togglePolicy('p1') })

      expect(result.current.selectedIds).toEqual(['p2'])
      expect(result.current.selectionCount).toBe(1)
    })

    it('toggle add, remove, add cycle', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.togglePolicy('p1') })
      expect(result.current.selectedIds).toEqual(['p1'])

      act(() => { result.current.togglePolicy('p1') })
      expect(result.current.selectedIds).toEqual([])

      act(() => { result.current.togglePolicy('p1') })
      expect(result.current.selectedIds).toEqual(['p1'])
    })
  })

  // -------------------------------------------------------------------------
  // addPolicy
  // -------------------------------------------------------------------------

  describe('addPolicy', () => {
    it('adds a new policy', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })

      expect(result.current.selectedIds).toEqual(['p1'])
    })

    it('prevents duplicates', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p1') })

      expect(result.current.selectedIds).toEqual(['p1'])
      expect(result.current.selectionCount).toBe(1)
    })

    it('respects maxPolicies limit', () => {
      const { result } = renderHook(() => useCompareSelection(2))

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p2') })
      act(() => { result.current.addPolicy('p3') })

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
    })

    it('does nothing when adding duplicate at max capacity', () => {
      const { result } = renderHook(() => useCompareSelection(2))

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p2') })
      act(() => { result.current.addPolicy('p1') }) // duplicate + at max

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
    })
  })

  // -------------------------------------------------------------------------
  // removePolicy
  // -------------------------------------------------------------------------

  describe('removePolicy', () => {
    it('removes an existing policy', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p2') })
      act(() => { result.current.removePolicy('p1') })

      expect(result.current.selectedIds).toEqual(['p2'])
    })

    it('is a no-op for non-existent policy', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.removePolicy('p999') })

      expect(result.current.selectedIds).toEqual(['p1'])
    })

    it('can empty the selection', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.removePolicy('p1') })

      expect(result.current.selectedIds).toEqual([])
      expect(result.current.selectionCount).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // clearSelection
  // -------------------------------------------------------------------------

  describe('clearSelection', () => {
    it('clears all selected policies', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p2') })
      act(() => { result.current.addPolicy('p3') })
      act(() => { result.current.clearSelection() })

      expect(result.current.selectedIds).toEqual([])
      expect(result.current.selectionCount).toBe(0)
      expect(result.current.canCompare).toBe(false)
      expect(result.current.canAdd).toBe(true)
    })

    it('is a no-op when already empty', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.clearSelection() })

      expect(result.current.selectedIds).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // setSelection
  // -------------------------------------------------------------------------

  describe('setSelection', () => {
    it('replaces entire selection', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.setSelection(['p2', 'p3']) })

      expect(result.current.selectedIds).toEqual(['p2', 'p3'])
    })

    it('truncates to maxPolicies', () => {
      const { result } = renderHook(() => useCompareSelection(2))

      act(() => { result.current.setSelection(['p1', 'p2', 'p3', 'p4']) })

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
    })

    it('can set empty selection', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.setSelection([]) })

      expect(result.current.selectedIds).toEqual([])
    })

    it('respects default maxPolicies of 4', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.setSelection(['p1', 'p2', 'p3', 'p4', 'p5']) })

      expect(result.current.selectedIds).toEqual(['p1', 'p2', 'p3', 'p4'])
    })
  })

  // -------------------------------------------------------------------------
  // canAdd / canCompare / selectionCount
  // -------------------------------------------------------------------------

  describe('computed properties', () => {
    it('canAdd is true when below max', () => {
      const { result } = renderHook(() => useCompareSelection(3))

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p2') })

      expect(result.current.canAdd).toBe(true)
    })

    it('canAdd is false when at max', () => {
      const { result } = renderHook(() => useCompareSelection(2))

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p2') })

      expect(result.current.canAdd).toBe(false)
    })

    it('canCompare is false with 0 selections', () => {
      const { result } = renderHook(() => useCompareSelection())
      expect(result.current.canCompare).toBe(false)
    })

    it('canCompare is false with 1 selection', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })

      expect(result.current.canCompare).toBe(false)
    })

    it('canCompare is true with 2 selections', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p2') })

      expect(result.current.canCompare).toBe(true)
    })

    it('canCompare is true with 4 selections', () => {
      const { result } = renderHook(() => useCompareSelection())

      act(() => { result.current.setSelection(['p1', 'p2', 'p3', 'p4']) })

      expect(result.current.canCompare).toBe(true)
    })

    it('selectionCount reflects current state', () => {
      const { result } = renderHook(() => useCompareSelection())

      expect(result.current.selectionCount).toBe(0)

      act(() => { result.current.addPolicy('p1') })
      expect(result.current.selectionCount).toBe(1)

      act(() => { result.current.addPolicy('p2') })
      expect(result.current.selectionCount).toBe(2)

      act(() => { result.current.removePolicy('p1') })
      expect(result.current.selectionCount).toBe(1)

      act(() => { result.current.clearSelection() })
      expect(result.current.selectionCount).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Edge case: maxPolicies = 1
  // -------------------------------------------------------------------------

  describe('edge case: maxPolicies = 1', () => {
    it('can only select one policy', () => {
      const { result } = renderHook(() => useCompareSelection(1))

      act(() => { result.current.addPolicy('p1') })
      act(() => { result.current.addPolicy('p2') })

      expect(result.current.selectedIds).toEqual(['p1'])
      expect(result.current.canAdd).toBe(false)
      expect(result.current.canCompare).toBe(false) // need >= 2
    })
  })
})

// ===========================================================================
// useCompareUrlState
// ===========================================================================

describe('useCompareUrlState', () => {
  const originalLocation = window.location
  const _originalHistory = window.history

  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    nextPolicyId = 1
    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
  })

  afterEach(() => {
    // Reset URL
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
    replaceStateSpy.mockRestore()
  })

  function setUrl(search: string) {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search, pathname: '/compare' },
      writable: true,
    })
  }

  // -------------------------------------------------------------------------
  // Reading IDs from URL
  // -------------------------------------------------------------------------

  describe('reading IDs from URL', () => {
    it('returns empty arrays when no ids param', () => {
      setUrl('')
      const policies = [createMockPolicy({ id: 'p1' })]

      const { result } = renderHook(() => useCompareUrlState(policies))

      expect(result.current.selectedIds).toEqual([])
      expect(result.current.selectedPolicies).toEqual([])
      expect(result.current.invalidIds).toEqual([])
      expect(result.current.hasInvalidIds).toBe(false)
    })

    it('returns valid IDs that exist in policies', () => {
      setUrl('?ids=p1,p2')
      const p1 = createMockPolicy({ id: 'p1' })
      const p2 = createMockPolicy({ id: 'p2' })
      const p3 = createMockPolicy({ id: 'p3' })

      const { result } = renderHook(() => useCompareUrlState([p1, p2, p3]))

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
      expect(result.current.selectedPolicies).toHaveLength(2)
      expect(result.current.selectedPolicies[0].id).toBe('p1')
      expect(result.current.selectedPolicies[1].id).toBe('p2')
    })

    it('filters out IDs not present in policies', () => {
      setUrl('?ids=p1,deleted1,p2,deleted2')
      const p1 = createMockPolicy({ id: 'p1' })
      const p2 = createMockPolicy({ id: 'p2' })

      const { result } = renderHook(() => useCompareUrlState([p1, p2]))

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
      expect(result.current.selectedPolicies).toHaveLength(2)
    })

    it('handles empty string values from split', () => {
      setUrl('?ids=p1,,p2,')
      const p1 = createMockPolicy({ id: 'p1' })
      const p2 = createMockPolicy({ id: 'p2' })

      const { result } = renderHook(() => useCompareUrlState([p1, p2]))

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
    })
  })

  // -------------------------------------------------------------------------
  // Invalid IDs detection
  // -------------------------------------------------------------------------

  describe('invalid IDs detection', () => {
    it('detects IDs that do not match any policy', () => {
      setUrl('?ids=p1,ghost1,ghost2')
      const p1 = createMockPolicy({ id: 'p1' })

      const { result } = renderHook(() => useCompareUrlState([p1]))

      expect(result.current.invalidIds).toEqual(['ghost1', 'ghost2'])
      expect(result.current.hasInvalidIds).toBe(true)
    })

    it('hasInvalidIds is false when all IDs are valid', () => {
      setUrl('?ids=p1,p2')
      const p1 = createMockPolicy({ id: 'p1' })
      const p2 = createMockPolicy({ id: 'p2' })

      const { result } = renderHook(() => useCompareUrlState([p1, p2]))

      expect(result.current.invalidIds).toEqual([])
      expect(result.current.hasInvalidIds).toBe(false)
    })

    it('all IDs invalid returns empty selectedPolicies', () => {
      setUrl('?ids=ghost1,ghost2')
      const p1 = createMockPolicy({ id: 'p1' })

      const { result } = renderHook(() => useCompareUrlState([p1]))

      expect(result.current.selectedIds).toEqual([])
      expect(result.current.selectedPolicies).toEqual([])
      expect(result.current.invalidIds).toEqual(['ghost1', 'ghost2'])
    })
  })

  // -------------------------------------------------------------------------
  // setSelectedIds updates URL
  // -------------------------------------------------------------------------

  describe('setSelectedIds', () => {
    it('updates search params and calls replaceState with new IDs', () => {
      setUrl('')
      const policies = [createMockPolicy({ id: 'p1' }), createMockPolicy({ id: 'p2' })]

      const { result } = renderHook(() => useCompareUrlState(policies))

      act(() => { result.current.setSelectedIds(['p1', 'p2']) })

      expect(replaceStateSpy).toHaveBeenCalledWith(
        {},
        '',
        '/compare?ids=p1%2Cp2'
      )
    })

    it('removes ids param when setting empty array', () => {
      setUrl('?ids=p1,p2')
      const policies = [createMockPolicy({ id: 'p1' }), createMockPolicy({ id: 'p2' })]

      const { result } = renderHook(() => useCompareUrlState(policies))

      act(() => { result.current.setSelectedIds([]) })

      expect(replaceStateSpy).toHaveBeenCalledWith(
        {},
        '',
        '/compare'
      )
    })

    it('updates the internal state after setting IDs', () => {
      setUrl('')
      const p1 = createMockPolicy({ id: 'p1' })
      const p2 = createMockPolicy({ id: 'p2' })

      const { result } = renderHook(() => useCompareUrlState([p1, p2]))

      act(() => { result.current.setSelectedIds(['p1', 'p2']) })

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
      expect(result.current.selectedPolicies).toHaveLength(2)
    })
  })

  // -------------------------------------------------------------------------
  // clearSelection
  // -------------------------------------------------------------------------

  describe('clearSelection', () => {
    it('clears IDs and updates URL', () => {
      setUrl('?ids=p1,p2')
      const p1 = createMockPolicy({ id: 'p1' })
      const p2 = createMockPolicy({ id: 'p2' })

      const { result } = renderHook(() => useCompareUrlState([p1, p2]))

      act(() => { result.current.clearSelection() })

      expect(result.current.selectedIds).toEqual([])
      expect(result.current.selectedPolicies).toEqual([])
      expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/compare')
    })
  })

  // -------------------------------------------------------------------------
  // canCompare
  // -------------------------------------------------------------------------

  describe('canCompare', () => {
    it('is false with 0 valid IDs', () => {
      setUrl('')
      const { result } = renderHook(() => useCompareUrlState([createMockPolicy({ id: 'p1' })]))
      expect(result.current.canCompare).toBe(false)
    })

    it('is false with 1 valid ID', () => {
      setUrl('?ids=p1')
      const { result } = renderHook(() => useCompareUrlState([createMockPolicy({ id: 'p1' })]))
      expect(result.current.canCompare).toBe(false)
    })

    it('is true with 2 valid IDs', () => {
      setUrl('?ids=p1,p2')
      const p1 = createMockPolicy({ id: 'p1' })
      const p2 = createMockPolicy({ id: 'p2' })
      const { result } = renderHook(() => useCompareUrlState([p1, p2]))
      expect(result.current.canCompare).toBe(true)
    })

    it('is true with 4 valid IDs', () => {
      setUrl('?ids=p1,p2,p3,p4')
      const policies = ['p1', 'p2', 'p3', 'p4'].map(id => createMockPolicy({ id }))
      const { result } = renderHook(() => useCompareUrlState(policies))
      expect(result.current.canCompare).toBe(true)
    })

    it('is false with 5 valid IDs', () => {
      setUrl('?ids=p1,p2,p3,p4,p5')
      const policies = ['p1', 'p2', 'p3', 'p4', 'p5'].map(id => createMockPolicy({ id }))
      const { result } = renderHook(() => useCompareUrlState(policies))
      expect(result.current.canCompare).toBe(false)
    })

    it('is false when some IDs are invalid reducing count below 2', () => {
      setUrl('?ids=p1,ghost')
      const p1 = createMockPolicy({ id: 'p1' })
      const { result } = renderHook(() => useCompareUrlState([p1]))
      expect(result.current.canCompare).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Policy order preserved
  // -------------------------------------------------------------------------

  describe('ordering', () => {
    it('selectedPolicies matches URL order', () => {
      setUrl('?ids=p3,p1,p2')
      const p1 = createMockPolicy({ id: 'p1', provider: 'Allianz' })
      const p2 = createMockPolicy({ id: 'p2', provider: 'AXA' })
      const p3 = createMockPolicy({ id: 'p3', provider: 'Anadolu' })

      const { result } = renderHook(() => useCompareUrlState([p1, p2, p3]))

      expect(result.current.selectedPolicies.map(p => p.id)).toEqual(['p3', 'p1', 'p2'])
    })
  })

  // -------------------------------------------------------------------------
  // Edge case: policies change after initial render
  // -------------------------------------------------------------------------

  describe('reacting to policy list changes', () => {
    it('recalculates validIds when policies array changes', () => {
      setUrl('?ids=p1,p2')
      const p1 = createMockPolicy({ id: 'p1' })
      const p2 = createMockPolicy({ id: 'p2' })

      const { result, rerender } = renderHook(
        ({ policies }) => useCompareUrlState(policies),
        { initialProps: { policies: [p1, p2] } }
      )

      expect(result.current.selectedIds).toEqual(['p1', 'p2'])
      expect(result.current.invalidIds).toEqual([])

      // Remove p2 from available policies
      rerender({ policies: [p1] })

      expect(result.current.selectedIds).toEqual(['p1'])
      expect(result.current.invalidIds).toEqual(['p2'])
      expect(result.current.hasInvalidIds).toBe(true)
    })
  })
})
