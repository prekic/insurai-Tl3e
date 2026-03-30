# Session Handoff — March 28, 2026 (Updated: Post-Trim Session)

## Current State

**Main branch is up to date.** Latest commits on main: `efbdba6` (PR #312), `bdb2365` (PR #311).

### Status of All Priorities

| # | Priority | Status |
|---|----------|--------|
| 1 | Merge handoff branch to main | **DONE** — PRs #309/#310 merged |
| 2 | Deploy to production | **DONE** — Triggered via MCP commit to main |
| 3 | Trim CLAUDE.md | **DONE** — PR #311 merged. 404KB → 151KB |
| 4 | Fix ESLint errors | **DONE** — PR #312 merged. 18 errors → 0 |
| 5 | Apply migrations 042 + 043 | **PENDING** — User must run in Supabase SQL Editor |
| 6 | Upload diverse KASKO PDFs | **BLOCKED** — Requires real PDF files from 5+ providers |
| 7 | Calibrate grade thresholds | **BLOCKED** — Requires real outcome data |
| 8 | Update benchmark premium ranges | **BLOCKED** — Requires external market research |

## What Was Done This Session

### 1. CLAUDE.md Trim (PR #311 — commit `bdb2365`)
- Archived all 178 historical Known Issue entries to `docs/KNOWN_ISSUES_ARCHIVE.md` (197KB)
- Replaced Known Issues section (2656 lines, 194KB) with 15-entry key active patterns table
- Trimmed Common Gotchas section (676 lines, 61KB) to 100 essential lines
- Result: CLAUDE.md 5931 → 2722 lines, 404KB → 151KB
- File is now pushable via MCP `push_files` in a single commit

### 2. ESLint Config Fix (PR #312 — commit `efbdba6`)
- `scripts/generate-pwa-icons.mjs` had 18 `no-undef` errors (`Buffer`, `console`)
- Root cause: ESLint scripts config matched `*.{ts,js}` but not `*.mjs`, and lacked Node globals
- Fix: Added `.mjs` to glob pattern and `globals.node` to languageOptions in `eslint.config.js`
- Result: 0 ESLint errors, 0 warnings across entire codebase

### 3. CLAUDE.md Next Session Instructions Updated
- Marked trim task as done (item #3)
- Added blocked/manual status labels to remaining items

## All Modified Files (This Session)

| File | Change |
|------|--------|
| `CLAUDE.md` | Trimmed from 404KB → 151KB; updated Next Session Instructions |
| `docs/KNOWN_ISSUES_ARCHIVE.md` | **NEW** — 178 historical Known Issue entries (197KB) |
| `eslint.config.js` | Added `.mjs` glob + Node globals to scripts config |

## Quality State

- **TypeScript**: 0 errors (`npx tsc --noEmit` clean)
- **ESLint**: 0 errors, 0 warnings (`npx eslint . --max-warnings 0` clean)
- **Tests**: ~16,142+ across 340+ files, 0 failures (not re-run this session — no code changes)

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

1. **Apply Migrations 042 + 043** *(manual)* — Run SQL above in Supabase Dashboard → SQL Editor. Both idempotent.
2. **Upload Diverse KASKO PDFs** *(blocked)* — Phase 8L graduation needs 5+ unique documents from different providers. Target: April 5, 2026.
3. **Calibrate Grade Thresholds** *(blocked)* — A=90, B=80 etc. are arbitrary. Need real outcome data. Admin UI: Settings → Evaluation.
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
