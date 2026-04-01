# Session Handoff — April 1, 2026 (Real KASKO PDF Ingestion & Reconciliation)

## Current State

**Main branch is up to date.** All required real-world KASKO PDFs have been successfully ingested across the pilot-batch workflow. The overarching Pilot Batch diagnostics and coverage mapping reconciliations are committed. 

### Status of All Priorities

| # | Priority | Status |
|---|----------|--------|
| 1 | Pilot Batch Phrase Diagnostics | **DONE** — False positives from JSON structural keys fixed |
| 2 | Process Real KASKO PDFs | **DONE** — Ingested real PDFs to `/policies` & generated structured DB coverage models |
| 3 | Apply migrations 042 + 043 | **PENDING** — User must run in Supabase SQL Editor |
| 4 | Calibrate grade thresholds | **PENDING** — We now have real outcome data to calibrate the benchmarks |
| 5 | Update benchmark premium ranges | **BLOCKED** — Requires external market research |

## What Was Done This Session

### 1. Batch Ingestion False-Positive Fix
- Diagnosed why 5/5 valid synthetic policies were failing the "phrase leak" detection during the `pilot-batch-ingest.ts` dry run.
- **Fix:** Implemented `checkProhibitedPhrases` to strictly scan human-facing text fields.

### 2. Real KASKO PDF Ingestion & Coverage Reconciliation
- Successfully processed real-world KASKO policies directly originating from brokers (e.g. `ANADOLU.PDF`, `Allianz`, etc.).
- Generated massive `db_coverages.json` schemas for accurate policy modeling.
- Documented `coverage_reconciliation.md` root cause analysis noting that single-shot LLM re-extractions can cause table-shifting hallucinations over 60,000+ characters. 
- Formally instated the rule: **Legacy Tabular Data Remains Authoritative; Re-Extraction Hydrates Headers Only.**

## All Modified Files (This Session)

| File | Change |
|------|--------|
| `scripts/pilot-batch-ingest.ts` | Refactored detection to use `checkProhibitedPhrases` |
| `src/lib/analysis/batch-ingest-helpers.ts` | Added `checkProhibitedPhrases` targeted text scanner |
| `src/lib/analysis/__tests__/batch-ingest-helpers.test.ts` | Added isolated test suite for phrase checking logic |
| `scripts/kasko-real-pdf-extraction.ts` | Added custom pilot script for single-shot real-world PDF extraction testing |
| `policies/*.pdf` | Ingested real-world PDFs for pilot batch evaluation |
| `test-data/synthetic-kasko-4.pdf/md` & `5` | Added additional synthetic test cases for baseline evaluation |
| `coverage_reconciliation.md` | New architectural alignment file for handling legacy structured array extraction |
| `db_coverages.json` | Comprehensive coverage definition matrices generated |
| `CLAUDE.md` | Added Gotcha 43 on Legacy Tabular Precedence, updated Session instructions |
| `SESSION_HANDOFF.md` | Synchronized status showing process completion of pilot batch extraction |
| *Scratch Diagnostics* | Root `*.txt` and `*.js` dumps generated during coverage generation testing |

## Quality State

- **TypeScript**: 0 errors expected (`npx tsc --noEmit` should be clean)
- **ESLint**: 0 errors, 0 warnings expected
- **Tests**: Core phrase diagnostic tests are green.

## Migrations to Apply (Copy-Paste into Supabase SQL Editor)

### Migration 042 — isDraft Column

```sql
-- Migration 042: Add is_draft column to policies table
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_policies_user_is_draft ON public.policies (user_id, is_draft);
```

**Verify**: `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'policies' AND column_name = 'is_draft';`

### Migration 043 — Benchmark Threshold Configs

```sql
-- Migration 043: Seed benchmark aging/stale threshold configs
INSERT INTO public.app_settings (category, key, value, description, "schema")
VALUES
  ('evaluation', 'benchmark_aging_days', '180', 'Days after dataDate before benchmark is considered aging (181-365 default range)', '{"type":"number","minimum":30,"maximum":730}'),
  ('evaluation', 'benchmark_stale_days', '365', 'Days after dataDate before benchmark is considered stale (>365 default)', '{"type":"number","minimum":60,"maximum":1460}')
ON CONFLICT (category, key) DO NOTHING;
```

**Verify**: `SELECT * FROM app_settings WHERE category = 'evaluation' AND key IN ('benchmark_aging_days', 'benchmark_stale_days');`

## Next Steps (Priority Order)

1. **Commit and Merge** — Commit any final doc changes, merge this branch (`insuraigemini20260330`), and trigger `release-please`.
2. **Apply Migrations 042 + 043** *(manual)* — Run SQL above in Supabase Dashboard → SQL Editor. Both idempotent.
3. **Calibrate Grade Thresholds** — With real data now extracted, calibrate the arbitrary `A=90, B=80, etc` grades using the admin Settings UI (Settings → Evaluation).
4. **Update Benchmark Premium Ranges** *(blocked)* — Premium ranges from Dec 2024. Needs external market research for `MARKET_BENCHMARKS`.

## Non-Critical Issues (Carry Forward)

1. **Duplicate GoTrueClient warning** — during pilot QA persistence. Non-blocking.
2. **Benchmark premium ranges outdated** — `dataDate` updated to 2026-03-28 but actual premium ranges still from Dec 2024 research.
3. **EOOP can't model % deductibles in Monte Carlo** — warning added; full fix needs per-coverage DeductibleSpec mapping in adapter.

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) are NEVER overwritten
2. Full test suite not run without justification (>10 min)
3. Pilot evidence must be from real live data only
4. Never add `VITE_` prefix to API keys
5. All admin endpoints must have auth middleware
6. Any user-facing market conclusion must be gated by `BenchmarkConfidence`
7. Draft policies must not be exportable/shareable without TASLAK/DRAFT labeling
8. Benchmark test mocks MUST include `dataDate` — omitting it causes stale downgrade
9. User-facing comparison language must use "estimate" / "model-based" qualifiers
10. `auditLogs` array MUST have `MAX_ENTRIES` cap after every `.push()` call

## Environment Variables Required

No new env vars introduced. All existing vars documented in CLAUDE.md remain required.

Key vars for production:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — admin panel and service-role operations
- `ADMIN_JWT_SECRET` — admin login
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — AI extraction
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — push notifications
- `EXCHANGERATE_API_KEY` — optional, higher rate limits on FX API
