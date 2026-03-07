# Session Handoff — March 7, 2026 (Extraction Timeout Resilience & Diagnostic Error Threading)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | ✅ Passing (typecheck clean, Railway build verified) |
| **TypeCheck** | 0 errors |
| **ESLint** | 0 errors |
| **Tests** | 15,850+ tests passing, 0 failures |
| **Branch** | `claude/load-project-context-ggw3q` — 8 new commits, pushed |

---

## This Session — 8 Commits Fixing Production Extraction Timeouts

Production users on `/try` experienced recurring "Analysis timed out" and "Load failed" errors. Root causes were: abort-on-unmount wasting server work, missing fetch timeout on the proxy call, stale timeout promises from previous attempts, and error messages stripping all diagnostic context.

### Commits (oldest → newest)

| Commit | Type | Summary |
|--------|------|---------|
| `e4f01d0` | fix | Abort in-flight extraction on component unmount (initial approach, later reversed) |
| `952680d` | fix | Server-side diagnostic instrumentation for "Load failed" errors — `phaseTiming`, `fallbackChain`, `REQUEST_BUDGET_MS` budget system |
| `33747bf` | fix | Prevent extraction timeout stacking — fresh timeout per attempt |
| `0a430e8` | feat | Pipeline phase timing diagnostics (`clientPhaseTiming`) on `ExtractionError` |
| `7ca2727` | fix | **Reverse abort-on-unmount** — let extraction complete, persist result, guard UI updates with `isMounted` ref |
| `cd3c4f3` | fix | Add 120s `AbortSignal.timeout()` to `extractViaProxy` fetch |
| `53d4e48` | fix | Move `FETCH_TIMEOUT_MS` before `try` block to fix `TS2304` scope error |
| `5f6412e` | feat | Thread `errorCode`/`requestId`/timing through 5-layer pipeline into user-visible error messages |

### Key Files Changed

| File | Change |
|------|--------|
| `server/routes/ai.ts` | Budget system (105s total, 50s primary, 45s fallback), per-phase timing, `fallbackChain`, error codes (`BUDGET_EXHAUSTED`, `ANTHROPIC_SDK_TIMEOUT`, etc.) |
| `src/lib/ai/config.ts` | `extractViaProxy` return type extended with `errorCode`, `clientElapsedMs`. 120s fetch timeout. HTTP error path and catch block both surface diagnostics. |
| `src/lib/ai/providers/openai.ts` | Enriched `Error` with `errorCode`, `requestId`, `serverPhaseTiming`, `serverElapsedMs` from proxy result |
| `src/lib/ai/providers/claude.ts` | Same enriched error pattern as openai.ts |
| `src/lib/ai/policy-extractor.ts` | Extracts proxy diagnostic fields from enriched errors, merges server timing (prefixed `server_`), returns `errorCode`/`requestId` on `ExtractionError` |
| `src/components/TryAnalysis.tsx` | Removed abort-on-unmount. Builds `[code=X \| req=Y \| timing...]` diagnostic suffix. `isMounted` ref guards state updates. |
| `server/services/config-service.ts` | Added `DB_QUERY_TIMEOUT_MS = 8_000` and `Promise.race` timeout wrapper for Supabase config queries to prevent indefinite hangs during extraction |
| `server/services/prompt-service.ts` | Added `DB_QUERY_TIMEOUT_MS = 8_000` and `withTimeout()` helper for prompt DB queries — same timeout pattern as config-service |
| `src/lib/ai/extraction-schema.ts` | Added `serverPhaseTiming?: Record<string, number>` and `serverElapsedMs?: number` to `ExtractedPolicyData._proxyMeta` interface |
| `src/lib/ai/config.test.ts` | Loosened `extractViaProxy` fetch assertion from exact match to `expect.objectContaining()` to accommodate new `signal` and `x-user-id` headers |

---

## ⚠️ Gotchas for Next Session

1. **Do NOT re-add AbortController.abort() on TryAnalysis unmount.** The abort propagates to the server proxy fetch, wasting AI provider work and producing confusing "Load failed" errors. Extraction should run to completion; `saveTrialResult()` preserves the result for when the user returns.

2. **FETCH_TIMEOUT_MS (120s) must exceed REQUEST_BUDGET_MS (105s).** If the client times out before the server, you lose all server-side diagnostic timing data. The server needs time to return a proper `BUDGET_EXHAUSTED` response with `phaseTiming` and `fallbackChain`.

3. **`ExtractionError` interface has new fields.** `errorCode?: string` and `requestId?: string` were added. Any new error return paths in `policy-extractor.ts` catch block should set these from `proxyErrorCode` / `proxyRequestId`.

4. **`extractViaProxy` return type was extended.** New fields: `errorCode?: string`, `clientElapsedMs?: number`. If you add new error return paths in `config.ts`, set both.

5. **Provider adapters create enriched errors.** `openai.ts` and `claude.ts` both attach `errorCode`, `requestId`, `serverPhaseTiming`, `serverElapsedMs` to thrown `Error` objects. If adding new provider adapters, follow this pattern or diagnostics will be dropped.

6. **Server budget constants.** `REQUEST_BUDGET_MS = 105000`, `PRIMARY_TIMEOUT_MS = 50000`, `FALLBACK_TIMEOUT_MS = 45000` in `server/routes/ai.ts`. Adjust based on production latency data.

7. **DB_QUERY_TIMEOUT_MS (8s) in config-service and prompt-service.** Both `server/services/config-service.ts` and `server/services/prompt-service.ts` now wrap Supabase queries in `Promise.race` with an 8-second timeout. If a query hangs (e.g., Supabase connection pool exhausted), the service returns defaults instead of blocking the extraction pipeline indefinitely.

8. **`_proxyMeta` on `ExtractedPolicyData` has new fields.** `serverPhaseTiming?: Record<string, number>` and `serverElapsedMs?: number` were added to the `_proxyMeta` interface in `extraction-schema.ts`. Provider adapters populate these from the proxy response.

---

## Priority Next Steps

1. **Merge & Deploy** — This branch is ready to merge. All tests pass, typecheck clean. Deploy to Railway and verify diagnostic suffixes appear in production timeout errors.
2. **Production Validation** — Upload a PDF on `/try`, navigate away mid-extraction, return. Confirm result is persisted and displayed. Trigger a timeout (large PDF with slow provider) and verify the error message contains `[code=... | req=... | timing...]`.
3. **Budget Tuning** — Review Railway logs for `phaseTiming` entries after deploy. If Anthropic consistently takes >45s, consider raising `PRIMARY_TIMEOUT_MS`. If config load is slow, investigate `configLoad_ms` values.
4. **Test Coverage for New Error Paths** — The diagnostic threading code has been verified via typecheck and existing tests (183 passing across config/TryAnalysis/policy-extractor), but dedicated unit tests for the specific enriched-error construction in openai.ts/claude.ts catch blocks would add safety margin.
