/**
 * Expand a Supabase PostgrestError (or any error-shaped object) into
 * structured log fields. Replaces the recurring `error: String(err)` and
 * `error: error.message` patterns that produced literal `"[object Object]"`
 * (or hid `code`/`details`/`hint`) in Railway logs.
 *
 * Usage:
 *   import { pgErr } from '../lib/pg-err.js'
 *   log.error('Failed to insert', { documentId, ...pgErr(err) })
 *
 * Sibling pattern previously inlined in `admin-notification-service.ts`
 * (PR #384) and `processing-log-service.ts` (PR #393). This helper unifies
 * the shape so future sites can opt in with one import.
 */
export function pgErr(err: unknown): Record<string, unknown> {
  const e = err as {
    code?: string | null
    message?: string | null
    details?: string | null
    hint?: string | null
  } | null
  return {
    pgCode: e?.code ?? null,
    pgMessage: e?.message ?? null,
    pgDetails: e?.details ?? null,
    pgHint: e?.hint ?? null,
  }
}
