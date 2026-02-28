/**
 * Actuarial Persistence Service
 *
 * Server-side service for persisting actuarial evaluation results
 * and timing data to the database. Used by the admin API routes.
 */

import { logger } from '../lib/logger.js'
import { getSupabaseWithError } from '../routes/admin/shared.js'

const log = logger.child('actuarial-persistence')

export interface PersistEvaluationInput {
  policyId: string
  /** Full evaluation result payload (JSONB) */
  resultData: Record<string, unknown>
  /** Whether the policy passed compliance */
  eligible: boolean
  /** Blocking reason count */
  blockingReasonCount: number
  /** Warning count */
  warningCount: number
  /** Expected out-of-pocket amount */
  expectedOopAmount?: number
  /** Contract quality score */
  contractQualityScore?: number
  /** TOPSIS data (multi-policy only) */
  topsisCloseness?: number
  topsisRank?: number
  topsisGrade?: string
  /** Whether the evaluation needs review */
  needsReview: boolean
  /** Duration in milliseconds */
  durationMs?: number
}

/**
 * Persists an evaluation result to the database.
 * Creates both an evaluation_run and evaluation_result row.
 *
 * @returns The created result ID or null on failure
 */
export async function persistEvaluationResult(
  input: PersistEvaluationInput
): Promise<string | null> {
  try {
    const { client: supabase, error: dbError } = getSupabaseWithError()
    if (!supabase) {
      log.warn('Cannot persist evaluation result: database not configured', { error: dbError })
      return null
    }

    // 1. Create an evaluation run
    const { data: run, error: runError } = await supabase
      .from('actuarial_evaluation_runs')
      .insert({
        policy_id: input.policyId,
        status: 'completed',
        duration_ms: input.durationMs,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (runError || !run) {
      log.error('Failed to create evaluation run', {
        error: runError?.message,
        policyId: input.policyId,
      })
      return null
    }

    // 2. Create the evaluation result
    const { data: result, error: resultError } = await supabase
      .from('actuarial_evaluation_results')
      .insert({
        run_id: run.id,
        policy_id: input.policyId,
        eligible: input.eligible,
        blocking_reason_count: input.blockingReasonCount,
        warning_count: input.warningCount,
        expected_oop_amount: input.expectedOopAmount,
        contract_quality_score: input.contractQualityScore,
        needs_review: input.needsReview,
        topsis_closeness: input.topsisCloseness,
        topsis_rank: input.topsisRank,
        topsis_grade: input.topsisGrade,
        result_data: input.resultData,
      })
      .select('id')
      .single()

    if (resultError || !result) {
      log.error('Failed to create evaluation result', {
        error: resultError?.message,
        runId: run.id,
      })
      return null
    }

    log.info('Persisted evaluation result', {
      resultId: result.id,
      runId: run.id,
      policyId: input.policyId,
      eligible: input.eligible,
    })

    return result.id
  } catch (error) {
    log.error('Unexpected error persisting evaluation result', {
      error: error instanceof Error ? error.message : String(error),
      policyId: input.policyId,
    })
    return null
  }
}

/**
 * Retrieves historical evaluation results with optional filtering.
 */
export async function getEvaluationHistory(options: {
  policyId?: string
  limit?: number
  offset?: number
}): Promise<{ data: unknown[]; total: number } | null> {
  try {
    const { client: supabase, error: dbError } = getSupabaseWithError()
    if (!supabase) {
      log.warn('Cannot fetch evaluation history: database not configured', { error: dbError })
      return null
    }

    let query = supabase
      .from('actuarial_evaluation_results')
      .select('*, run:actuarial_evaluation_runs(*)', { count: 'exact' })
      .order('evaluated_at', { ascending: false })
      .limit(options.limit || 50)
      .range(options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1)

    if (options.policyId) {
      query = query.eq('policy_id', options.policyId)
    }

    const { data, error, count } = await query

    if (error) {
      log.error('Failed to fetch evaluation history', { error: error.message })
      return null
    }

    return { data: data || [], total: count || 0 }
  } catch (error) {
    log.error('Unexpected error fetching evaluation history', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
