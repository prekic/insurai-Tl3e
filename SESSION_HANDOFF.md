# Session Handoff — March 30, 2026 (Trustworthiness Sprint Finalization)

## Current State

**Main branch is up to date.** Uncommitted changes exist for UI test hardening in `src/components/__tests__/TrustworthinessUI.test.tsx`.

### Status of All Priorities

| # | Priority | Status |
|---|----------|--------|
| 1 | Trustworthiness UI Hardening Tests | **DONE** — Regression tests finalized for provisional gating |
| 2 | Apply migrations 042 + 043 | **PENDING** — User must run in Supabase SQL Editor |
| 3 | Upload diverse KASKO PDFs | **BLOCKED** — Requires real PDF files from 5+ providers |
| 4 | Calibrate grade thresholds | **BLOCKED** — Requires real outcome data |
| 5 | Update benchmark premium ranges | **BLOCKED** — Requires external market research |

## What Was Done This Session

### 1. Trustworthiness UI Hardening
- Finalized UI regression test suite for the "Trustworthiness Hardening" sprint.
- Updated 3 tests in `TrustworthinessUI.test.tsx` to correctly mock the specific properties that trigger `isProvisional` status: `aiConfidence < 0.85`, `benchmarkStatus === 'untrusted'`, and `benchmark === undefined`.
- Verified that the "UNVERIFIED AI OUTPUT" banner is rendered and export/share actions are blocked for provisional results.

## All Modified Files (This Session)

| File | Change |
|------|--------|
| `src/components/__tests__/TrustworthinessUI.test.tsx` | Updated 3 UI regression tests to mock specific provisional status properties |
| `CLAUDE.md` | Added Gotcha 41 regarding Provisional Status UI Mocking, updated Last Updated date |
| `SESSION_HANDOFF.md` | Updated status and session info for Trustworthiness Hardening |

## Quality State

- **TypeScript**: 0 errors expected (`npx tsc --noEmit` should be clean)
- **ESLint**: 0 errors, 0 warnings expected
- **Tests**: Re-run of `TrustworthinessUI.test.tsx` passes successfully.

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

1. **Commit and Merge** — Commit the changes to `TrustworthinessUI.test.tsx` and merge.
2. **Apply Migrations 042 + 043** *(manual)* — Run SQL above in Supabase Dashboard → SQL Editor. Both idempotent.
3. **Upload Diverse KASKO PDFs** *(blocked)* — Phase 8L graduation needs 5+ unique documents from different providers.
4. **Calibrate Grade Thresholds** *(blocked)* — A=90, B=80 etc. are arbitrary. Need real outcome data. Admin UI: Settings → Evaluation.
5. **Update Benchmark Premium Ranges** *(blocked)* — Premium ranges from Dec 2024. Needs external market research for `MARKET_BENCHMARKS`.

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
