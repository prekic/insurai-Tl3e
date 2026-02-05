import { useMemo, useState, useEffect } from 'react'
import type { Policy } from '@/types/policy'
import type { PolicyEvaluation, EvaluationConfig } from '@/lib/policy-evaluation/types'
import { evaluatePolicy, convertDatabaseConfigToEvaluatorConfig } from '@/lib/policy-evaluation'
import { configService } from '@/lib/config'
import type { EvaluationConfig as DatabaseEvaluationConfig } from '@/lib/config/types'

interface UsePolicyEvaluationOptions {
  config?: Partial<EvaluationConfig>
  /** Skip fetching database config and use only provided config or defaults */
  skipDatabaseConfig?: boolean
  enabled?: boolean
}

interface UsePolicyEvaluationResult {
  evaluation: PolicyEvaluation | null
  isLoading: boolean
  error: Error | null
}

/**
 * Hook for evaluating a single policy against market benchmarks.
 * Automatically fetches evaluation configuration from database if available.
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
  const { config, enabled = true, skipDatabaseConfig = false } = options
  const [dbConfig, setDbConfig] = useState<DatabaseEvaluationConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(!skipDatabaseConfig)

  // Fetch database configuration
  useEffect(() => {
    if (skipDatabaseConfig) {
      setConfigLoading(false)
      return
    }

    let mounted = true
    configService
      .getEvaluationConfig()
      .then((config) => {
        if (mounted) {
          setDbConfig(config)
          setConfigLoading(false)
        }
      })
      .catch(() => {
        // Fall back to defaults on error
        if (mounted) {
          setConfigLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [skipDatabaseConfig])

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

  // Merge database config with provided config
  const mergedConfig = useMemo(() => {
    if (!dbConfig) return config

    // Convert database config to evaluator format
    const evaluatorConfig = convertDatabaseConfigToEvaluatorConfig(dbConfig)

    // Merge: provided config overrides database config
    return { ...evaluatorConfig, ...config }
  }, [dbConfig, config])

  // Extract grade and status thresholds from database config
  const gradeThresholds = useMemo(() => {
    if (!dbConfig) return undefined
    return {
      gradeAThreshold: dbConfig.gradeAThreshold,
      gradeBThreshold: dbConfig.gradeBThreshold,
      gradeCThreshold: dbConfig.gradeCThreshold,
      gradeDThreshold: dbConfig.gradeDThreshold,
    }
  }, [dbConfig])

  const statusThresholds = useMemo(() => {
    if (!dbConfig) return undefined
    return {
      statusExcellentThreshold: dbConfig.statusExcellentThreshold,
      statusGoodThreshold: dbConfig.statusGoodThreshold,
      statusFairThreshold: dbConfig.statusFairThreshold,
      statusPoorThreshold: dbConfig.statusPoorThreshold,
    }
  }, [dbConfig])

  const result = useMemo<UsePolicyEvaluationResult>(() => {
    // Still loading config
    if (configLoading) {
      return { evaluation: null, isLoading: true, error: null }
    }

    if (!enabled || !policy) {
      return { evaluation: null, isLoading: false, error: null }
    }

    try {
      const evaluation = evaluatePolicy(policy, {
        config: mergedConfig,
        gradeThresholds,
        statusThresholds,
      })
      return { evaluation, isLoading: false, error: null }
    } catch (e) {
      return {
        evaluation: null,
        isLoading: false,
        error: e instanceof Error ? e : new Error('Failed to evaluate policy'),
      }
    }
  }, [policyHash, mergedConfig, gradeThresholds, statusThresholds, enabled, configLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  return result
}

/**
 * Hook for evaluating multiple policies at once.
 * Automatically fetches evaluation configuration from database if available.
 * Useful for dashboard views that need to display scores for many policies.
 *
 * @param policies - Array of policies to evaluate
 * @param options - Configuration options
 * @returns Object containing evaluations map, loading state, and any error
 *
 * @example
 * ```tsx
 * const { evaluations, isLoading } = usePolicyEvaluations(policies)
 * if (!isLoading) {
 *   policies.map(p => {
 *     const eval = evaluations.get(p.id)
 *     return <PolicyCard policy={p} grade={eval?.grade} />
 *   })
 * }
 * ```
 */
export function usePolicyEvaluations(
  policies: Policy[],
  options: UsePolicyEvaluationOptions = {}
): { evaluations: Map<string, PolicyEvaluation>; isLoading: boolean } {
  const { config, enabled = true, skipDatabaseConfig = false } = options
  const [dbConfig, setDbConfig] = useState<DatabaseEvaluationConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(!skipDatabaseConfig)

  // Fetch database configuration
  useEffect(() => {
    if (skipDatabaseConfig) {
      setConfigLoading(false)
      return
    }

    let mounted = true
    configService
      .getEvaluationConfig()
      .then((config) => {
        if (mounted) {
          setDbConfig(config)
          setConfigLoading(false)
        }
      })
      .catch(() => {
        // Fall back to defaults on error
        if (mounted) {
          setConfigLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [skipDatabaseConfig])

  // Create a stable hash of all policies
  const policiesHash = useMemo(() => {
    if (!policies.length) return ''
    return policies
      .map(p => `${p.id}:${p.premium}:${p.coverage}:${p.deductible}`)
      .sort()
      .join('|')
  }, [policies])

  // Merge database config with provided config
  const mergedConfig = useMemo(() => {
    if (!dbConfig) return config

    // Convert database config to evaluator format
    const evaluatorConfig = convertDatabaseConfigToEvaluatorConfig(dbConfig)

    // Merge: provided config overrides database config
    return { ...evaluatorConfig, ...config }
  }, [dbConfig, config])

  // Extract grade and status thresholds from database config
  const gradeThresholds = useMemo(() => {
    if (!dbConfig) return undefined
    return {
      gradeAThreshold: dbConfig.gradeAThreshold,
      gradeBThreshold: dbConfig.gradeBThreshold,
      gradeCThreshold: dbConfig.gradeCThreshold,
      gradeDThreshold: dbConfig.gradeDThreshold,
    }
  }, [dbConfig])

  const statusThresholds = useMemo(() => {
    if (!dbConfig) return undefined
    return {
      statusExcellentThreshold: dbConfig.statusExcellentThreshold,
      statusGoodThreshold: dbConfig.statusGoodThreshold,
      statusFairThreshold: dbConfig.statusFairThreshold,
      statusPoorThreshold: dbConfig.statusPoorThreshold,
    }
  }, [dbConfig])

  const evaluations = useMemo(() => {
    const map = new Map<string, PolicyEvaluation>()

    if (configLoading || !enabled || !policies.length) {
      return map
    }

    for (const policy of policies) {
      try {
        const evaluation = evaluatePolicy(policy, {
          config: mergedConfig,
          gradeThresholds,
          statusThresholds,
        })
        map.set(policy.id, evaluation)
      } catch {
        // Skip policies that fail evaluation
        console.warn(`Failed to evaluate policy ${policy.id}`)
      }
    }

    return map
  }, [policiesHash, mergedConfig, gradeThresholds, statusThresholds, enabled, configLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  return { evaluations, isLoading: configLoading }
}
