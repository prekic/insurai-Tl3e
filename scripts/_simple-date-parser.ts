/**
 * _simple-date-parser.ts
 *
 * Standalone Node-safe date parser used by pilot batch scripts that need to
 * normalize LLM-extracted date strings into ISO `YYYY-MM-DD` format without
 * pulling in `src/lib/ai/policy-extractor.ts` (which would crash under `npx tsx`
 * due to its Vite `import.meta.env` dependencies — see CLAUDE.md gotcha #16).
 *
 * DERIVED from `src/lib/ai/policy-extractor.ts:1609-1637`, with one
 * **intentional divergence** to fix a latent bug in the production function:
 *
 *   Production always calls `new Date(raw)` first, falling back to manual
 *   parsing only when the date is NaN. But V8's Date constructor silently
 *   mis-parses `"01.12.2024"` (Turkish DD.MM.YYYY meaning Dec 1, 2024) as
 *   January 12, 2024 — it only fails cleanly (NaN) when the day component
 *   is ≥13. This means every real KASKO PDF where both day and month are
 *   ≤12 gets its start_date and expiry_date silently day/month-swapped.
 *
 *   Observed with Node 22: `new Date('01.12.2024').toISOString()` →
 *   `'2024-01-12T00:00:00.000Z'` — should be `'2024-12-01'`.
 *
 *   This function always tries the manual parser FIRST for strings matching
 *   the dot/dash/slash 3-part pattern. Node's Date constructor is only used
 *   for strings that don't match (ISO datetimes with `T`/`Z`, locale strings,
 *   etc.). This is guaranteed to produce correct results for Turkish KASKO
 *   dates without losing ISO compatibility.
 *
 *   TODO(future-session): Port this fix back to
 *   `src/lib/ai/policy-extractor.ts:1609-1637`. See SESSION_HANDOFF.md for
 *   the flagged carry-forward item.
 *
 * Supported input formats:
 *   - Turkish DD.MM.YYYY: "15.12.2024" — Turkish insurance standard
 *   - DD-MM-YYYY:       "15-12-2024"
 *   - DD/MM/YYYY:       "15/12/2024"
 *   - YYYY-MM-DD:       "2024-12-15" — ISO short form
 *   - ISO datetime:     "2024-12-15T00:00:00Z", "2024-12-15T12:00:00+03:00"
 *   - undefined / empty / invalid: returns the fallback date
 *
 * The fallback is `now() + fallbackOffsetDays * 86_400_000`, formatted as
 * `YYYY-MM-DD`. Used by `persistToPoliciesTable()` to provide sensible
 * defaults when the LLM fails to extract `startDate` (offset 0 = today) or
 * `expiryDate` (offset 365 = one year from today).
 */

export function parseExtractedDate(raw: string | undefined, fallbackOffsetDays: number): string {
  const fallback = new Date(Date.now() + fallbackOffsetDays * 86_400_000)
    .toISOString()
    .split('T')[0]
  if (!raw) return fallback

  // Try manual parser FIRST for strings with a 3-part dot/dash/slash separator
  // pattern. This is authoritative for Turkish DD.MM.YYYY inputs because V8's
  // Date constructor mis-parses them when day ≤ 12 (see header comment).
  const parts = raw.split(/[./-]/)
  if (parts.length === 3) {
    let d: Date | null = null
    if (parts[2].length === 4) {
      // DD.MM.YYYY / DD-MM-YYYY / DD/MM/YYYY (trailing 4-digit year)
      d = new Date(
        `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T00:00:00Z`
      )
    } else if (parts[0].length === 4) {
      // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD (leading 4-digit year)
      d = new Date(
        `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}T00:00:00Z`
      )
    }
    if (d && !isNaN(d.getTime())) {
      return d.toISOString().split('T')[0]
    }
    // If manual parser produced an invalid date (e.g. 3-part string with
    // garbage components or an ISO datetime where parts[2] contains a `T`),
    // fall through to Node's Date constructor below.
  }

  // Fall back to Node's Date constructor for ISO datetimes, locale strings,
  // and anything else that isn't a clean 3-part dot/dash/slash date.
  const d = new Date(raw)
  return isNaN(d.getTime()) ? fallback : d.toISOString().split('T')[0]
}
