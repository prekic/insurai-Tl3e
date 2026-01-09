import { useMemo, useCallback, useState } from 'react'
import type { Policy } from '@/types/policy'
import type { PolicyComparison, EvaluationConfig } from '@/lib/policy-evaluation/types'
import { comparePolicies } from '@/lib/policy-evaluation'

interface UsePolicyComparisonOptions {
  config?: Partial<EvaluationConfig>
  labels?: string[]
}

interface UsePolicyComparisonResult {
  comparison: PolicyComparison | null
  isLoading: boolean
  error: Error | null
  isValid: boolean
  validationMessage: string | null
}

/**
 * Hook for comparing multiple policies.
 * Validates that 2-4 policies are provided and returns comparison results.
 *
 * @param policies - Array of 2-4 policies to compare
 * @param options - Configuration options including labels
 * @returns Comparison result, validation state, and errors
 *
 * @example
 * ```tsx
 * const { comparison, isValid, validationMessage } = usePolicyComparison(selectedPolicies)
 * if (!isValid) {
 *   return <p>{validationMessage}</p>
 * }
 * return <ComparisonTable comparison={comparison} />
 * ```
 */
export function usePolicyComparison(
  policies: Policy[],
  options: UsePolicyComparisonOptions = {}
): UsePolicyComparisonResult {
  const { config, labels } = options

  // Validate policy count
  const validation = useMemo(() => {
    if (policies.length < 2) {
      return { isValid: false, message: 'Select at least 2 policies to compare' }
    }
    if (policies.length > 4) {
      return { isValid: false, message: 'Maximum 4 policies can be compared' }
    }
    return { isValid: true, message: null }
  }, [policies.length])

  // Create a stable hash for memoization
  const policiesHash = useMemo(() => {
    return policies
      .map(p => `${p.id}:${p.premium}:${p.coverage}`)
      .sort()
      .join('|')
  }, [policies])

  const result = useMemo<UsePolicyComparisonResult>(() => {
    if (!validation.isValid) {
      return {
        comparison: null,
        isLoading: false,
        error: null,
        isValid: false,
        validationMessage: validation.message,
      }
    }

    try {
      const comparison = comparePolicies(policies, labels, config)
      return {
        comparison,
        isLoading: false,
        error: null,
        isValid: true,
        validationMessage: null,
      }
    } catch (e) {
      return {
        comparison: null,
        isLoading: false,
        error: e instanceof Error ? e : new Error('Failed to compare policies'),
        isValid: true,
        validationMessage: null,
      }
    }
  }, [policiesHash, labels, config, validation]) // eslint-disable-line react-hooks/exhaustive-deps

  return result
}

/**
 * Hook for managing policy selection state for comparison.
 * Handles adding/removing policies from selection with validation.
 *
 * @param maxPolicies - Maximum number of policies that can be selected (default: 4)
 * @returns Selection state and handlers
 *
 * @example
 * ```tsx
 * const { selectedIds, togglePolicy, clearSelection, canAdd, canCompare } = useCompareSelection()
 *
 * <PolicyCard
 *   onSelect={() => togglePolicy(policy.id)}
 *   isSelected={selectedIds.includes(policy.id)}
 *   disabled={!canAdd && !selectedIds.includes(policy.id)}
 * />
 *
 * <Button onClick={handleCompare} disabled={!canCompare}>
 *   Compare ({selectedIds.length})
 * </Button>
 * ```
 */
export function useCompareSelection(maxPolicies: number = 4) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const togglePolicy = useCallback((policyId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(policyId)) {
        return prev.filter(id => id !== policyId)
      }
      if (prev.length >= maxPolicies) {
        return prev // Don't add if at max
      }
      return [...prev, policyId]
    })
  }, [maxPolicies])

  const addPolicy = useCallback((policyId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(policyId) || prev.length >= maxPolicies) {
        return prev
      }
      return [...prev, policyId]
    })
  }, [maxPolicies])

  const removePolicy = useCallback((policyId: string) => {
    setSelectedIds(prev => prev.filter(id => id !== policyId))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
  }, [])

  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(ids.slice(0, maxPolicies))
  }, [maxPolicies])

  const canAdd = selectedIds.length < maxPolicies
  const canCompare = selectedIds.length >= 2

  return {
    selectedIds,
    togglePolicy,
    addPolicy,
    removePolicy,
    clearSelection,
    setSelection,
    canAdd,
    canCompare,
    selectionCount: selectedIds.length,
    maxPolicies,
  }
}

/**
 * Hook for syncing comparison selection with URL state.
 * Enables shareable/bookmarkable comparison URLs.
 *
 * @param policies - All available policies (for validation)
 * @returns Selection state synced with URL
 *
 * @example
 * ```tsx
 * // URL: /compare?ids=abc,def,ghi
 * const { selectedPolicies, setSelectedIds } = useCompareUrlState(allPolicies)
 * ```
 */
export function useCompareUrlState(policies: Policy[]) {
  const [searchParams, setSearchParams] = useState<URLSearchParams>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search)
    }
    return new URLSearchParams()
  })

  // Get IDs from URL
  const urlIds = useMemo(() => {
    const idsParam = searchParams.get('ids')
    if (!idsParam) return []
    return idsParam.split(',').filter(Boolean)
  }, [searchParams])

  // Validate IDs against available policies
  const validIds = useMemo(() => {
    const policyIds = new Set(policies.map(p => p.id))
    return urlIds.filter(id => policyIds.has(id))
  }, [urlIds, policies])

  // Get invalid IDs (policies that were deleted)
  const invalidIds = useMemo(() => {
    const policyIds = new Set(policies.map(p => p.id))
    return urlIds.filter(id => !policyIds.has(id))
  }, [urlIds, policies])

  // Get selected policies
  const selectedPolicies = useMemo(() => {
    const policyMap = new Map(policies.map(p => [p.id, p]))
    return validIds.map(id => policyMap.get(id)).filter((p): p is Policy => p !== undefined)
  }, [validIds, policies])

  // Update URL
  const setSelectedIds = useCallback((ids: string[]) => {
    const newParams = new URLSearchParams(searchParams)
    if (ids.length > 0) {
      newParams.set('ids', ids.join(','))
    } else {
      newParams.delete('ids')
    }
    setSearchParams(newParams)

    // Update browser URL without reload
    if (typeof window !== 'undefined') {
      const newUrl = ids.length > 0
        ? `${window.location.pathname}?${newParams.toString()}`
        : window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [searchParams])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
  }, [setSelectedIds])

  return {
    selectedIds: validIds,
    selectedPolicies,
    invalidIds,
    hasInvalidIds: invalidIds.length > 0,
    setSelectedIds,
    clearSelection,
    canCompare: validIds.length >= 2 && validIds.length <= 4,
  }
}
