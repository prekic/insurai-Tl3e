import { useMemo } from 'react'
import type { Policy } from '@/types/policy'
import type { PolicyEvaluation, EvaluationConfig } from '@/lib/policy-evaluation/types'
import { evaluatePolicy } from '@/lib/policy-evaluation'

interface UsePolicyEvaluationOptions {
  config?: Partial<EvaluationConfig>
  enabled?: boolean
}

interface UsePolicyEvaluationResult {
  evaluation: PolicyEvaluation | null
  isLoading: boolean
  error: Error | null
}

/**
 * Hook for evaluating a single policy against market benchmarks.
 * Results are memoized based on policy data to avoid unnecessary re-computation.
 *
 * @param policy - The policy to evaluate (or undefined/null)
 * @param options - Configuration options
 * @returns Evaluation result, loading state, and error
 *
 * @example
 * ```tsx
 * const { evaluation } = usePolicyEvaluation(policy)
 * if (evaluation) {
 *   console.log(evaluation.grade) // 'A', 'B', 'C', 'D', or 'F'
 *   console.log(evaluation.overallScore) // 0-100
 * }
 * ```
 */
export function usePolicyEvaluation(
  policy: Policy | undefined | null,
  options: UsePolicyEvaluationOptions = {}
): UsePolicyEvaluationResult {
  const { config, enabled = true } = options

  // Create a stable hash of policy data for memoization
  // This ensures we re-evaluate only when relevant policy data changes
  const policyHash = useMemo(() => {
    if (!policy) return null
    return [
      policy.id,
      policy.premium,
      policy.coverage,
      policy.deductible,
      policy.type,
      policy.status,
      policy.expiryDate,
      policy.coverages?.length || 0,
      policy.exclusions?.length || 0,
    ].join('|')
  }, [policy])

  const result = useMemo<UsePolicyEvaluationResult>(() => {
    if (!enabled || !policy) {
      return { evaluation: null, isLoading: false, error: null }
    }

    try {
      const evaluation = evaluatePolicy(policy, config)
      return { evaluation, isLoading: false, error: null }
    } catch (e) {
      return {
        evaluation: null,
        isLoading: false,
        error: e instanceof Error ? e : new Error('Failed to evaluate policy'),
      }
    }
  }, [policyHash, config, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return result
}

/**
 * Hook for evaluating multiple policies at once.
 * Useful for dashboard views that need to display scores for many policies.
 *
 * @param policies - Array of policies to evaluate
 * @param options - Configuration options
 * @returns Map of policy ID to evaluation result
 *
 * @example
 * ```tsx
 * const evaluations = usePolicyEvaluations(policies)
 * policies.map(p => {
 *   const eval = evaluations.get(p.id)
 *   return <PolicyCard policy={p} grade={eval?.grade} />
 * })
 * ```
 */
export function usePolicyEvaluations(
  policies: Policy[],
  options: UsePolicyEvaluationOptions = {}
): Map<string, PolicyEvaluation> {
  const { config, enabled = true } = options

  // Create a stable hash of all policies
  const policiesHash = useMemo(() => {
    if (!policies.length) return ''
    return policies
      .map(p => `${p.id}:${p.premium}:${p.coverage}:${p.deductible}`)
      .sort()
      .join('|')
  }, [policies])

  return useMemo(() => {
    const evaluations = new Map<string, PolicyEvaluation>()

    if (!enabled || !policies.length) {
      return evaluations
    }

    for (const policy of policies) {
      try {
        const evaluation = evaluatePolicy(policy, config)
        evaluations.set(policy.id, evaluation)
      } catch {
        // Skip policies that fail evaluation
        console.warn(`Failed to evaluate policy ${policy.id}`)
      }
    }

    return evaluations
  }, [policiesHash, config, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
