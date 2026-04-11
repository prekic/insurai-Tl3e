# Session Handoff — April 11, 2026 (Pilot Batch Phase A+ — Committed + Follow-ups)

> **Session type**: Implementation. Extended `scripts/pilot-batch-ingest.ts` to close the two structural gaps that were blocking pilot ingestion: no OCR fallback and no `policies`-table writer. Phase B (credentials) and Phase C (real execution) remain blocked — **user deferred env delivery to a future session**. Follow-up work added in the same session: preflight validation, unit tests for the extracted date parser, a runbook, and discovery of a **latent production bug in `policy-extractor.ts:1609-1637`** (flagged for fix, not repaired in production this session).

## 🎯 Immediate Next Steps for the Next Agent (priority order)

1. **🔴 Rotate leaked secrets** from Apr 8 session (user action — Supabase service role, admin JWT, OpenAI/Anthropic, GCP, VAPID, exchangerate-host). See CLAUDE.md "Next Session Instructions" #1.
2. **🔴 Provide `.env`** for Phase B unblock. **Fastest path**: `cp .env.example .env` and fill in the 6 required keys. `.env.example` now documents all 6 (as of commit after QA audit): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GCP_SERVICE_ACCOUNT_BASE64` (or `GOOGLE_APPLICATION_CREDENTIALS` as alternative), and `PILOT_REVIEWER_USER_ID` (a valid `auth.users` UUID — see runbook §1.2 for 3 sourcing options). `.env` is in `.gitignore` and will not be committed.
3. **Run pilot batch ingestion** (Phase C step 1):
   ```bash
   npx tsx scripts/pilot-batch-ingest.ts ./upload/real-kasko-pdf --persist-policies
   ```
   Expected: 8-10 new rows in `policies` table, ~3-5 min wall time, ~$0.20-0.50 API cost. Preflight fails fast if env is missing.
4. **Run evaluation backfill** (Phase C step 2):
   ```bash
   npx tsx scripts/backfill-evaluation-scores.ts --apply --limit=200
   ```
   Accept the `VITE_SUPABASE_URL` stack trace — gotcha #45, non-fatal.
5. **🔴 Fix production DD.MM.YYYY bug** in `src/lib/ai/policy-extractor.ts:1609-1637` (see "Latent Production Bug" section below). Can be done in parallel with #3-#4. Requires: port the manual-parser-first fix from `scripts/_simple-date-parser.ts`, add regression tests in `policy-extractor.test.ts`, decide on backfill strategy for existing corrupted `policies` rows.
6. **Grade threshold calibration** (`scripts/calibrate-grade-thresholds.ts`) — blocked on 50+ scored policies. A single 10-PDF batch is not enough; defer until more PDFs are ingested.
7. **Market benchmark research** — blocked on external TSB/SEDDK 2025 data input.

Full runbook for steps 3-4: `docs/runbooks/03-pilot-batch-ingestion.md` (prereqs, verification SQL, troubleshooting).

## Current State

**Branch**: `claude/load-project-context-vaXCi` — clean, pushed.
**Working tree**: clean (after the four commits below).
**Test state**: 22 new unit tests in `scripts/__tests__/simple-date-parser.test.ts`, all green in isolation. Plus typecheck + ESLint + Prettier + dry-run smoke runs on the script itself.

## What This Session Produced

| # | SHA | Message | Scope |
|---|-----|---------|-------|
| 1 | `e1174df` | `feat(pilot-batch): add Document AI OCR fallback + policies table writer` | 1 file, +292/−9 |
| 2 | `3cd6445` | `feat(pilot-batch): preflight validation + handoff docs sync` | 3 files, +203/−89 |
| 3 | `ea97912` | `feat(pilot-batch): runbook + extracted date parser + latent bug fix` | 6 files, +578/−32 |
| 4 | `89dca4a` | `chore(docs): session handoff + CLAUDE.md gotcha #52 + non-negotiable rules #11/#12` | 2 files, +32/−7 |

## 🔴 Latent Production Bug Discovered — Flagged for Future Fix

**Location**: `src/lib/ai/policy-extractor.ts:1609-1637` (`convertToAnalyzedPolicy` date parsing).

**Bug**: The function always calls `new Date(rawEndDate)` first, falling back to manual parsing only when the result is `NaN`. But V8's `Date` constructor silently **mis-parses Turkish DD.MM.YYYY strings where day ≤ 12** as MM.DD.YYYY (day/month swapped), returning a valid-but-wrong date that never reaches the fallback branch.

**Concrete reproduction** (Node 22.22):
```js
new Date('01.12.2024').toISOString()  // → '2024-01-12T00:00:00.000Z'  ❌ should be 2024-12-01
new Date('05.03.2024').toISOString()  // → '2024-05-03T00:00:00.000Z'  ❌ should be 2024-03-05
new Date('15.12.2024').toISOString()  // → RangeError: Invalid time value (falls through correctly)
new Date('31.01.2025').toISOString()  // → RangeError: Invalid time value (falls through correctly)
```

**Impact scope**:
- Every KASKO policy in Turkey uses DD.MM.YYYY. Roughly **half** of all date strings have both day and month ≤ 12 (statistical fraction depending on distribution).
- Affected fields: `startDate`, `expiryDate` (and therefore `status` inference — `'active'` vs `'expiring'` vs `'expired'` — which depends on `expiryDate`).
- The bug is silent: it does not throw, does not log warnings. Mis-parsed dates are persisted to `policies.start_date` and `policies.expiry_date`, and propagate into `evaluation`, `PolicyDetailView`, exports, and the grade threshold calibration.
- **Has been in production since at least Apr 8, 2026** (the existing KASKO pilot sample runs would have hit this) and probably much earlier — the inlined copy in `pilot-batch-ingest.ts` explicitly claims to MIRROR this production code.

**Why it wasn't caught sooner**: Unit tests of `convertToAnalyzedPolicy` likely use ISO-format date strings (which parse correctly), not DD.MM.YYYY. End-to-end tests with real PDFs may have masked this because Turkish PDFs sometimes have day ≥13 (which falls through to the manual parser correctly) or a mix that statistically hides the swap.

**How it was discovered**: While writing unit tests for the extracted `parseExtractedDate` helper in this session, the `01.12.2024` → `2025-12-01` test case failed with `2024-01-12`. Direct probing of Node's `Date` constructor confirmed the bug is in V8's parser, not the wrapper logic.

**Fix applied to `scripts/_simple-date-parser.ts`** (this session): always try the manual 3-part split parser FIRST for strings matching dot/dash/slash separator pattern. Only fall back to `new Date(raw)` for ISO datetimes or other non-3-part formats. This produces correct results for all Turkish KASKO dates while preserving ISO compatibility. 22 unit tests now pass including real KASKO policy dates from `upload/real-kasko-pdf/`.

**TODO for a future session (NOT done this session)**:
1. Port the same fix into `src/lib/ai/policy-extractor.ts:1609-1637` — replace the `new Date(rawEndDate)` → `isNaN` → manual-parse cascade with the manual-parser-first approach.
2. Decide whether to backfill existing `policies` rows that may have been mis-parsed. Query: `SELECT id, start_date, expiry_date, raw_data->>'startDate' as raw_start, raw_data->>'endDate' as raw_end FROM policies WHERE type = 'kasko' AND raw_data IS NOT NULL;` — rows where `raw_start` / `raw_end` are dot-separated AND both day and month ≤ 12 are suspect and need re-parsing.
3. Add regression tests in `src/lib/ai/__tests__/policy-extractor.test.ts` (or wherever `convertToAnalyzedPolicy` is tested) that cover Turkish DD.MM.YYYY with day ≤ 12.
4. Consider whether any other code paths in the codebase use `new Date(turkishDateString)` — audit with grep.

**Why this session did not fix production**: The user's guidance was "do whatever you can other than [Phase B/C]". Touching `policy-extractor.ts` is a production code change that:
- Affects the entire extraction pipeline, not just the pilot batch script
- Requires running the production test suite to verify no regressions — forbidden without user permission per the 10-min rule
- Has uncertain blast radius for existing `policies` rows (do we backfill? migrate? leave historical data alone?)
- Is better scoped as a dedicated fix PR with full review rather than a side-task

The pilot batch script's isolated fix is the correct "safe to land now" scope. Flagging the production bug for dedicated follow-up is the responsible handoff.

## Why This Session Happened

The previous session's `pilot-batch-ingest.ts` run at `2026-04-11 10:29` (captured in `/tmp/pilot-batch-results.json`) was a `--dry-run` that exercised only pdfjs text parsing. Zero PDFs reached `kasko_pilot_qa_records`; zero reached the `policies` table. Investigation revealed two structural gaps:

1. **No OCR fallback** — 2 of 10 PDFs in `upload/real-kasko-pdf/` (`4.4. Kasko.pdf` @ 32 chars, `KRK_35 VD 458 Kasko Police_32630901_3.pdf` @ 10 chars) are scanned/image-only. `extractTextFromPdfFile()` only used pdfjs-dist and marked them failed.
2. **No `policies`-table writer** — the script only persisted to `kasko_pilot_qa_records`, but `scripts/backfill-evaluation-scores.ts:98` queries `from('policies')`. This misalignment is why CLAUDE.md tasks #4 → #5 → #6 never reached end-to-end completion in past sessions.

## Phase A — What Was Implemented (commit `e1174df`)

All changes in `scripts/pilot-batch-ingest.ts` (+292 / −9 lines, one file):

| Change | Details |
|--------|---------|
| `extractViaDocumentAI()` helper (~100 lines) | Direct Document AI REST call via `google-auth-library@^10.5.0` (already in deps). 3 credential sources: `GCP_SERVICE_ACCOUNT_BASE64` (env) → `GOOGLE_APPLICATION_CREDENTIALS` (file path) → `./gcp-service-account.json` default. Uses `splitPdf()` from `src/lib/ai/pdf-splitter.ts:43` for >10-page PDFs. Gracefully returns structured `{success: false, error}` when creds missing — never throws. Mirrors `scripts/test-document-ai.ts:49-95`. |
| OCR fallback wired into `main()` Step 1 | After pdfjs returns <50 chars, retries via Document AI. On success, overwrites `textResult`. On failure, preserves both error strings in a joined message. Preserves existing behavior when pdfjs succeeds. |
| `parseExtractedDate()` helper | Originally inlined as a MIRROR of `src/lib/ai/policy-extractor.ts:1609-1637` (cannot import directly per CLAUDE.md gotcha #16 — Vite env crash under tsx). **Apr 11 follow-up commit `ea97912` extracted it to `scripts/_simple-date-parser.ts` and fixed the V8 DD.MM.YYYY day≤12 bug that was inherited from production.** The shared module is now DERIVED FROM production but intentionally diverges — see gotcha #52 + rule #11. Handles ISO, DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD with 22 unit tests in `scripts/__tests__/simple-date-parser.test.ts`. |
| `findDuplicatePolicy()` helper | Simple `.select('id').eq(policy_number, provider, user_id).limit(1)` idempotency check so the script is safe to re-run without creating duplicate rows. |
| `persistToPoliciesTable()` helper (~80 lines) | Uses service-role Supabase client. Constructs `PolicyInsert` shape: `user_id`, `policy_number`, `provider`, `type='kasko'`, `type_tr='Kasko'`, `coverage` (first coverage limit), `premium` (scalar or `{amount}`), `deductible`, `start_date`, `expiry_date`, `insured_person`, `status='active'`, `document_type='policy'`, `raw_data` (with `coverages` as array — required by `backfill-evaluation-scores.ts:24`). Returns `{ok, id?, skipped?, error?}`. |
| `--persist-policies` + `--reviewer-id=<uuid>` CLI flags | Opt-in, default off. Also accepts `PILOT_REVIEWER_USER_ID` env var. Wired into `main()` as Step 6 after QA persist. Unreachable in dry-run mode (verified). |
| Initial `admissionStatus` default renamed `'skipped'` → `'not_attempted'` | Dry-run / text-extraction-fail artifacts no longer collide with legitimate pilot-gate `'skipped'` admission outcomes. Type-safe: `BatchResultEntry.admissionStatus` is plain `string` at `src/lib/analysis/batch-ingest-helpers.ts`. |
| Header JSDoc + argv usage text | Documents all new flags. |

## Phase A+1 — What This Session Added On Top (commit `3cd6445`)

**Preflight validation in `pilot-batch-ingest.ts`:**

When `--persist-policies` is set AND `--dry-run` is NOT set, the script now fails fast at startup if any of the following are missing:
- `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- A reviewer UUID (`--reviewer-id=<uuid>` or `PILOT_REVIEWER_USER_ID` env)
- A well-formed UUID — basic regex check (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`)

This saves the next session from running 8 LLM extractions (and burning API tokens) only to hit a Supabase error at insert time. Dry-run path is unaffected — preflight explicitly skips when `--dry-run` is present so Phase A verification still works without credentials.

Exit behavior:
- `--persist-policies` with no env → exit 1 with multi-line error listing missing items
- `--persist-policies --reviewer-id=not-a-uuid` → exit 1 with clear message
- `--dry-run` (any args) → exit 0 unchanged

**Note**: preflight does NOT verify the UUID exists in `auth.users`. That would require a live Supabase query; defer to the actual insert which will hard-fail on FK violation with a clear error message.

## Phase A+2 — Runbook + Extracted Parser + Unit Tests (commit `ea97912`)

Three additions, all credential-free:

1. **`docs/runbooks/03-pilot-batch-ingestion.md`** — full end-to-end runbook for next session. Sections:
   - Prerequisites (env vars, reviewer UUID sourcing with 3 options, PDF directory conventions)
   - §2 Verification (credential-free smoke test)
   - §3 Full ingestion (flag reference, expected duration/cost/results)
   - §4 Post-run verification SQL queries for `policies` and `kasko_pilot_qa_records`
   - §5 Downstream evaluation backfill
   - §6 Grade threshold calibration (blocked on 50+ scored policies)
   - §7 Troubleshooting (7 common failure modes with fixes)
   - §8 Related files reference
   - §9 History

2. **`scripts/_simple-date-parser.ts`** — extracted `parseExtractedDate` from the inlined copy in `pilot-batch-ingest.ts` into a standalone Node-safe module. Matches the `_proxy-bootstrap.mjs` convention for underscore-prefixed script helpers. Pure logic, no deps, no Vite env. Contains the production-bug fix described above.

3. **`scripts/__tests__/simple-date-parser.test.ts`** — 22 unit tests covering:
   - ISO 8601 formats (short and datetime-with-timezone)
   - Turkish DD.MM.YYYY with various day/month combinations
   - DD-MM-YYYY, DD/MM/YYYY separator variants
   - YYYY-MM-DD leading 4-digit format
   - Undefined / empty / invalid → fallback with correct offset arithmetic
   - Real KASKO dates from `upload/real-kasko-pdf/` — these were the tests that caught the production bug
   - Output format assertion: always `YYYY-MM-DD`, never contains `T`

   All 22 pass in isolation via `npx vitest run scripts/__tests__/simple-date-parser.test.ts`.

4. **`scripts/pilot-batch-ingest.ts`** — removed the inlined `parseExtractedDate` function, replaced with `import { parseExtractedDate } from './_simple-date-parser'`. No behavioral change to the script other than the bug fix (since the shared module has the same signature and more-correct output for Turkish dates).

## Verification Evidence (all credential-free, all green)

| Check | Result |
|-------|--------|
| `tsc -p <isolated tsconfig with @/* path aliases + strict>` | 0 errors |
| `eslint scripts/pilot-batch-ingest.ts scripts/_simple-date-parser.ts scripts/__tests__/simple-date-parser.test.ts` | 0 errors, 0 new warnings |
| `prettier --check` on all 3 files | clean |
| `npx vitest run scripts/__tests__/simple-date-parser.test.ts` | **22/22 passed** |
| `npx tsx …/real-kasko-pdf --dry-run` | 8/10 pdfjs OK · 2/10 hit OCR fallback → clean `No GCP credentials found` error in `entry.error` · `admissionStatus: not_attempted: 10` · exit 0 |
| `npx tsx …/real-kasko-pdf --dry-run --persist-policies` | Identical to plain dry-run (gating proven) · exit 0 |
| `npx tsx …/real-kasko-pdf --persist-policies` (full mode, no env) | Preflight fails fast with 3-item error list · exit 1 (no LLM calls) |
| `npx tsx …/real-kasko-pdf --persist-policies --reviewer-id=not-a-uuid` | Preflight rejects malformed UUID · exit 1 |

**Tactical gotchas hit this session (all documented in CLAUDE.md Developer Gotchas #52-#56)**:
- **#52** 🔴 V8 `Date` constructor silently mis-parses Turkish DD.MM.YYYY when day ≤ 12 (latent production bug, pilot fix applied)
- **#53** Vitest v4 removed `--reporter=basic` — fails with `Failed to load url basic`. Omit the flag or use `--reporter=default`
- **#54** Standalone `tsc` on `scripts/**/*.ts` needs an isolated tsconfig with `baseUrl` + `paths` for `@/*` aliases — root `tsconfig.json` only covers `src/`
- **#55** `splitPdf().chunks` returns `Uint8Array[]`, NOT `File[]` — use `Buffer.from(chunk).toString('base64')` directly, do NOT call `chunk.arrayBuffer()` (it doesn't exist on `Uint8Array`)
- **#56** Node `File` global requires Node ≥ 20 — `scripts/pilot-batch-ingest.ts` constructs `new File([buf], ...)` which will crash on Node 18

Future agents re-running any Phase C verification should read these five gotchas first to avoid re-discovering them.

## What's Still Blocked — For Next Session

### Phase B — Credentials (USER ACTION REQUIRED)

Create `/home/user/insurai/.env` with all of:

```bash
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...   # service_role key, NOT anon
GCP_SERVICE_ACCOUNT_BASE64=<base64-encoded JSON key file>
PILOT_REVIEWER_USER_ID=<a valid auth.users UUID>
```

`.env` is already in `.gitignore` — it will not be committed.

**Reminder**: all keys must be rotated after this session per CLAUDE.md "Next Session Instructions" #1 (leaked in Apr 8 session).

### Getting the reviewer UUID

The `policies.user_id` column has a `REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL` constraint. Options:

1. **Use an existing user**: Supabase Studio → Authentication → Users → grab any UUID (e.g. your own `prekic@gmail.com`).
2. **Query via service role** (after `.env` is set):
   ```sql
   SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;
   ```
   Or via CLI:
   ```
   npx tsx -e "
     import { createClient } from '@supabase/supabase-js'
     const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
     s.from('auth.users').select('id, email').limit(5).then(r => console.log(r.data))
   "
   ```
3. **Check `user_segments` for a pre-seeded `kasko_pilot_reviewers`**: migration 040 defines this segment.

### Phase C — Execution (after Phase B)

```bash
# 1. Full pilot ingest (expected cost: ~$0.20-0.50 total in API calls, ~3-5 min wall time)
npx tsx scripts/pilot-batch-ingest.ts ./upload/real-kasko-pdf --persist-policies

# 2. Verify in Supabase:
#    SELECT id, policy_number, provider, type, raw_data->'coverages' as cov
#    FROM policies
#    WHERE raw_data->>'_batchIngested' = 'true'
#    ORDER BY created_at DESC LIMIT 20;
#    Expected: 8-10 new rows (10 if Document AI OCR recovers the 2 scanned PDFs)

# 3. Generate evaluation scores for the newly ingested policies:
npx tsx scripts/backfill-evaluation-scores.ts --apply --limit=200
#    Accept the VITE_SUPABASE_URL stack trace — gotcha #45 says non-fatal

# 4. Grade threshold calibration (task #6) is STILL blocked:
#    needs 50+ scored policies, this batch gives us only ~10
```

### Phase D — Commit + handoff

Nothing to commit after execution — the script persists directly. Only action: update this file with actual ingest counts and remaining gap to the 50-row calibration threshold.

## Carry-Forward Priorities

| # | Priority | Status |
|---|----------|--------|
| 0 | 🔴 URGENT — Rotate leaked secrets from Apr 8 session | **PENDING — user must do** |
| 1 | Migration 042 applied | ✅ DONE (Apr 9) |
| 2 | Migration 043 applied | ✅ DONE (Apr 9) |
| 3 | Schema unification | ✅ DONE (Apr 9, PR #338) |
| 4 | Pilot batch ingestion script ready | ✅ DONE (Apr 11, this session) |
| 4a | **🔴 NEW — Fix DD.MM.YYYY bug in `policy-extractor.ts:1609-1637`** | **PENDING — see "Latent Production Bug Discovered" section above**. Pilot batch has the fix; production still has the bug. Scope: ~5 lines of code change + regression tests + decide on backfill strategy for existing `policies` rows. |
| 5 | Pilot batch ingestion executed | **BLOCKED — needs Phase B credentials (next session)** |
| 6 | Evaluation backfill executed | **BLOCKED on #5** |
| 7 | Grade threshold calibration | **BLOCKED on 50+ scored policies (only 10 available after #5)** |
| 8 | Benchmark premium ranges update | **BLOCKED — needs TSB/SEDDK 2025 market research** |

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) NEVER overwritten
2. Full test suite NEVER run without explicit user permission (>10 min)
3. Pilot evidence from real live data only
4. Never `VITE_` prefix on API keys
5. All admin endpoints must have auth middleware
6. Market conclusions gated by `BenchmarkConfidence`
7. Draft policies: TASLAK/DRAFT labeling on export/share
8. Benchmark test mocks MUST include `dataDate`
9. User-facing comparison: "estimate" / "model-based" qualifiers
10. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`
11. Extraction schema changes go in `shared/extraction-schema.ts` only
12. `ProcessingLogger.onStageChange()` listener errors are caught individually
13. `translations-skeleton.ts` accepts new KEYS with empty-string VALUES
14. Server `__dirname` paths: `dist-server/server/` is the base — need 2 levels up to reach project root
15. **UPDATED (Apr 11)**: `scripts/_simple-date-parser.ts` `parseExtractedDate()` is **DERIVED from but INTENTIONALLY DIVERGES** from `src/lib/ai/policy-extractor.ts:1609-1637`. The shared module implements the correct manual-parser-first approach that fixes the V8 DD.MM.YYYY day≤12 bug (see CLAUDE.md gotcha #52). Keep the shared module authoritative for pilot scripts until production is patched (task #4b). **Do NOT** revert it to match production — that would re-introduce the swapped-date bug on Turkish KASKO policies.
16. **NEW**: `pilot-batch-ingest.ts` `persistToPoliciesTable()` writes `raw_data.coverages` as array — required by `backfill-evaluation-scores.ts:24`; do not break this contract

## Environment Variables Required

No new env vars introduced by Phase A. All existing vars from CLAUDE.md remain required, plus the new optional-but-required-for-Phase-C:
- `PILOT_REVIEWER_USER_ID` (or `--reviewer-id=<uuid>` flag) — valid `auth.users` UUID
- `GCP_SERVICE_ACCOUNT_BASE64` — already documented; now also consumed by the batch script's OCR fallback

**🔴 ALL KEYS MUST BE ROTATED** — they were exposed earlier in the April 8 session.

## Quality State

**This session**: 0 new test files. 3 manual smoke runs of the script (dry-run, dry-run+persist-policies, full-mode preflight checks). All verification commands green. Pre-commit hook (`lint-staged` running ESLint + Prettier) auto-ran on commit `e1174df` and made no modifications.

**Known test state** (unchanged from previous session): 16,155+ tests, ~91.67% statements, ~85.91% branches coverage.

## Key Files Modified (This Session Only)

- `scripts/pilot-batch-ingest.ts` — Phase A + Phase A+1 preflight (+292/−9 in commit 1, additional ~40 lines in commit 2)
- `SESSION_HANDOFF.md` — this file (complete rewrite)
- `CLAUDE.md` — "Next Session Instructions" trimmed to reflect Phase A done + Phase B unblock

## Anti-Patterns Not Repeated

- No `.env` written to working tree (would have been `.gitignore`'d anyway, but no credentials to write in the first place)
- No full test suite run (>10 min rule)
- No commit to production extraction code — all changes isolated to the batch script
- No attempts to import `policy-extractor.ts` from the standalone script (gotcha #16 — inlined the minimal slice instead)
- No `as unknown as` casts (gotcha #48)
- No push to `main` — commits stay on `claude/load-project-context-vaXCi`
- No PR created (user has not explicitly asked)
