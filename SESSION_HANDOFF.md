# Session Handoff — April 11, 2026 (Pilot Batch Phase A — Committed)

> **Session type**: Implementation. Extended `scripts/pilot-batch-ingest.ts` to close the two structural gaps that were blocking pilot ingestion: no OCR fallback and no `policies`-table writer. Phase B (credentials) and Phase C (real execution) remain blocked — **user deferred env delivery to a future session**.

## Current State

**Branch**: `claude/load-project-context-vaXCi` — clean, pushed.
**Working tree**: clean (after the two commits below).
**Test state**: No new automated tests added — Phase A verification was done via typecheck + ESLint + Prettier + three manual `tsx` smoke runs. See "Verification evidence" below.

## What This Session Produced

| # | SHA | Message | Scope |
|---|-----|---------|-------|
| 1 | `e1174df` | `feat(pilot-batch): add Document AI OCR fallback + policies table writer` | 1 file, +292/−9 |
| 2 | (next commit) | `feat(pilot-batch): preflight validation for --persist-policies` + handoff docs sync | script + SESSION_HANDOFF.md + CLAUDE.md |

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
| `parseExtractedDate()` helper | Inlined minimal slice of `src/lib/ai/policy-extractor.ts:1609-1637` (cannot import directly per CLAUDE.md gotcha #16 — Vite env crash under tsx). Handles ISO, DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD. Marked `// MIRRORS src/lib/ai/policy-extractor.ts:1609-1637 — keep in sync`. |
| `findDuplicatePolicy()` helper | Simple `.select('id').eq(policy_number, provider, user_id).limit(1)` idempotency check so the script is safe to re-run without creating duplicate rows. |
| `persistToPoliciesTable()` helper (~80 lines) | Uses service-role Supabase client. Constructs `PolicyInsert` shape: `user_id`, `policy_number`, `provider`, `type='kasko'`, `type_tr='Kasko'`, `coverage` (first coverage limit), `premium` (scalar or `{amount}`), `deductible`, `start_date`, `expiry_date`, `insured_person`, `status='active'`, `document_type='policy'`, `raw_data` (with `coverages` as array — required by `backfill-evaluation-scores.ts:24`). Returns `{ok, id?, skipped?, error?}`. |
| `--persist-policies` + `--reviewer-id=<uuid>` CLI flags | Opt-in, default off. Also accepts `PILOT_REVIEWER_USER_ID` env var. Wired into `main()` as Step 6 after QA persist. Unreachable in dry-run mode (verified). |
| Initial `admissionStatus` default renamed `'skipped'` → `'not_attempted'` | Dry-run / text-extraction-fail artifacts no longer collide with legitimate pilot-gate `'skipped'` admission outcomes. Type-safe: `BatchResultEntry.admissionStatus` is plain `string` at `src/lib/analysis/batch-ingest-helpers.ts`. |
| Header JSDoc + argv usage text | Documents all new flags. |

## Phase A+1 — What This Session Added On Top (next commit)

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

## Verification Evidence (all credential-free, all green)

| Check | Result |
|-------|--------|
| `tsc -p <isolated tsconfig with @/* path aliases + strict>` | 0 errors |
| `eslint scripts/pilot-batch-ingest.ts` | 0 errors, 0 new warnings |
| `prettier --check scripts/pilot-batch-ingest.ts` | clean (1 auto-fix applied in Phase A via `--write`) |
| `npx tsx …/real-kasko-pdf --dry-run` | 8/10 pdfjs OK · 2/10 hit OCR fallback → clean `No GCP credentials found` error in `entry.error` · `admissionStatus: not_attempted: 10` · exit 0 |
| `npx tsx …/real-kasko-pdf --dry-run --persist-policies` | Identical to plain dry-run (gating proven) · exit 0 |
| `npx tsx …/real-kasko-pdf --persist-policies` (full mode, no env) | Preflight fails fast with 3-item error list · exit 1 (no LLM calls) |
| `npx tsx …/real-kasko-pdf --persist-policies --reviewer-id=not-a-uuid` | Preflight rejects malformed UUID · exit 1 |

**Gotcha hit and fixed during verification**: `splitPdf().chunks` returns `Uint8Array[]`, not `File[]` — the initial draft called `chunk.arrayBuffer()` which doesn't exist on `Uint8Array`. Fixed to `Buffer.from(chunk).toString('base64')` directly. Typecheck caught it before commit.

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
15. **NEW**: `pilot-batch-ingest.ts` `parseExtractedDate()` MIRRORS `policy-extractor.ts:1609-1637` — keep in sync when production date parsing changes
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
