/**
 * Actuarial Events — Lightweight Pub/Sub for Evaluation Results
 *
 * Decouples evaluation producers (PolicyDetailView, ComparePolicies)
 * from consumers (ActuarialTab) without circular import issues.
 *
 * @example
 * ```ts
 * // Producer — after running actuarial evaluation
 * import { emitEvaluation } from '@/lib/actuarial-engine'
 * emitEvaluation(result)
 *
 * // Consumer — subscribe in Admin tab
 * import { subscribeEvaluation } from '@/lib/actuarial-engine'
 * useEffect(() => subscribeEvaluation(handler), [])
 * ```
 */

import type { PolicyEvaluationResult } from './types'

export interface EvaluationEvent {
  policyId: string
  result: PolicyEvaluationResult
  timestamp: string
}

type EvaluationListener = (event: EvaluationEvent) => void

const listeners = new Set<EvaluationListener>()

/**
 * Subscribe to actuarial evaluation events.
 * Returns an unsubscribe function (compatible with React useEffect cleanup).
 */
export function subscribeEvaluation(listener: EvaluationListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Emit an actuarial evaluation event.
 * Called by consumer components after running the engine.
 */
export function emitEvaluation(policyId: string, result: PolicyEvaluationResult): void {
  const event: EvaluationEvent = {
    policyId,
    result,
    timestamp: new Date().toISOString(),
  }
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // Never let a listener error break the emitter
    }
  }

  // P3: Fire-and-forget persistence to server (non-blocking)
  persistToServer(event).catch(() => {
    // Silently swallow — persistence is best-effort
  })
}

/**
 * Fire-and-forget persistence to the server.
 * Uses dynamic import of adminFetch to avoid bundling server code in the main bundle.
 */
async function persistToServer(event: EvaluationEvent): Promise<void> {
  try {
    const { adminFetch } = await import('@/lib/admin/api')
    await adminFetch('/api/admin/actuarial/evaluation-results', {
      method: 'POST',
      body: JSON.stringify({
        policyId: event.policyId,
        resultData: event.result,
        eligible: event.result.eligible,
        blockingReasonCount: event.result.blockingReasons.length,
        warningCount: event.result.warnings.length,
        expectedOopAmount: event.result.expectedOutOfPocket?.expectedCost?.amount,
        contractQualityScore: event.result.contractQualityScore,
        topsisCloseness: event.result.ranking?.topsisCloseness,
        topsisRank: event.result.ranking?.rank,
        topsisGrade: event.result.ranking?.grade,
        needsReview: event.result.needsReview,
        durationMs: event.result.layerTimings?.total_ms,
        monteCarloLowerBound: event.result.expectedOutOfPocket?.percentiles?.p5,
        monteCarloUpperBound: event.result.expectedOutOfPocket?.percentiles?.p95,
      }),
    })
  } catch {
    // Best-effort — silently ignore network/auth failures
  }
}

/**
 * Returns the current number of active listeners (useful for testing).
 */
export function getListenerCount(): number {
  return listeners.size
}
