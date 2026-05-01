/**
 * Phase 3 follow-up — browser-safe wrapper for the per-policy
 * `/api/ai/audit-judge` endpoint.
 *
 * Architecture: the audit-judge runs server-side (it needs
 * ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY which are NEVER in the
 * browser bundle). The browser fires off a small POST after extraction
 * completes and forgets about it; the server returns 202 Accepted
 * immediately and runs the actual judgement in the background.
 *
 * Fire-and-forget semantics on the client:
 *   - No `await` — the calling code shouldn't block the user-facing
 *     extraction-success path.
 *   - Errors are caught and logged via `console.warn`; never re-thrown.
 *   - When `apiProxyUrl` is unavailable (offline / dev without backend),
 *     the call is silently skipped.
 *
 * Test gating: `process.env.NODE_ENV === 'test'` short-circuits the
 * call (gotcha #1 — un-awaited fetches steal mock assertions).
 */

import { env } from '../env.js'

export interface SubmitAuditJudgeInput {
  insuranceLine: string
  country?: string
  startDate: string | null | undefined
  insurer: string
  rawText: string
  structuredExtraction: unknown
  policyId?: string | null
  fixtureId?: string | null
}

/**
 * POST the audit-judge request and return immediately. Never throws.
 * Returns true when the request was successfully dispatched (202),
 * false when skipped or failed — callers don't need this signal in
 * normal operation, but tests use it.
 */
export async function submitAuditJudge(input: SubmitAuditJudgeInput): Promise<boolean> {
  // Test gate — gotcha #1.
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return false
  }

  // No proxy URL → skip silently. This happens in offline dev or when
  // the user runs the frontend without the backend server.
  const proxyUrl = env.proxyUrl
  if (!proxyUrl) return false

  // Sanity-check inputs before consuming a network round-trip.
  if (!input.startDate || !input.insurer || !input.rawText || !input.structuredExtraction) {
    return false
  }

  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`${proxyUrl}/api/ai/audit-judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        insuranceLine: input.insuranceLine,
        country: input.country ?? 'TR',
        startDate: input.startDate,
        insurer: input.insurer,
        rawText: input.rawText,
        structuredExtraction: input.structuredExtraction,
        policyId: input.policyId ?? null,
        fixtureId: input.fixtureId ?? null,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    return res.status === 202
  } catch (err) {
    // Fire-and-forget — never propagate. Log at warn level so DevTools
    // shows the diagnostic without breaking the user-facing flow.
    if (typeof console !== 'undefined') {
      console.warn(
        '[AuditJudge] dispatch failed:',
        err instanceof Error ? err.message : String(err)
      )
    }
    return false
  }
}
