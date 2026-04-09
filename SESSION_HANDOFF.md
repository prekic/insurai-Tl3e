# Session Handoff — April 9, 2026 (Context Audit & Migration Confirmation)

> **Session type**: Read-only audit. Loaded project context, reviewed all 4 carry-forward items, confirmed 2 migrations applied to production.
>
> **What this session produced**: No code changes. Verified migrations 042 + 043 successfully applied to production Supabase. Audited remaining follow-up items and documented their current blockers.

## Current State

**Branch**: `claude/load-project-context-Yjmcl` — clean, 0 commits ahead of `origin/main`.
**Working tree**: clean.
**Last merged PR**: #337 (`claude/load-project-context-7iIk0`) — PR-A test fix + PR-B schema parity.
**Test state**: No test changes this session. Known passing: 16,155+ tests across 337+ files.

## What Was Done This Session

1. **Loaded full project context** — read `.cursorrules`, `CLAUDE.md`, `SESSION_HANDOFF.md`, verified git state
2. **Audited all 4 carry-forward items** in detail:
   - Migration 042 (`is_draft` column) — **NOW APPLIED** ✅
   - Migration 043 (benchmark threshold configs) — **NOW APPLIED** ✅
   - Benchmark premium ranges — still blocked on market research
   - Schema unification — still blocked on rootDir constraint; parity test provides interim coverage
3. **Updated handoff documentation** (this file)

## Status of All Carry-Forward Priorities

| # | Priority | Status |
|---|----------|--------|
| 0 | **🔴 URGENT — Rotate leaked secrets from Apr 8 session** | **PENDING — user must do** (Supabase service role, ADMIN_JWT_SECRET, OpenAI/Anthropic keys, GCP SA, VAPID keypair, exchangerate-host key) |
| 1 | Apply Migration 042 (`is_draft` column on `policies`) | **✅ DONE** — applied to production Supabase (Apr 9) |
| 2 | Apply Migration 043 (benchmark aging/stale threshold configs) | **✅ DONE** — applied to production Supabase (Apr 9) |
| 3 | Bulk ingest pilot KASKO PDFs (50+ for calibration) | **BLOCKED — no PDFs available; `upload/real-kasko-pdf/` does not exist; needs user PDF drops** |
| 4 | Execute backfill: `npx tsx scripts/backfill-evaluation-scores.ts --apply` | **BLOCKED — depends on #3 + Supabase credentials in `.env`** |
| 5 | Calibrate grade thresholds: `scripts/calibrate-grade-thresholds.ts` | **BLOCKED — depends on #4, needs 50+ scored policies** |
| 6 | Update benchmark premium ranges | **BLOCKED — needs external TSB/SEDDK 2025 market research** |
| 7 | Schema unification (`shared/extraction-schema.ts`) | **DEFERRED — blocked by `server/tsconfig.json` rootDir + `railway.json` startCommand constraint. Parity test at `server/__tests__/extraction-schema-parity.test.ts` (10 tests) enforces structural alignment on every CI run.** |

## Migration Status (Production Supabase)

| Migration | Status | Applied |
|-----------|--------|---------|
| 001–041 | ✅ Applied | Pre-existing |
| 042 `add_is_draft_to_policies` | ✅ Applied | Apr 9, 2026 |
| 043 `seed_benchmark_threshold_configs` | ✅ Applied | Apr 9, 2026 |

**What 042 enables**: `is_draft BOOLEAN DEFAULT false` on `policies` table + index. Draft status now persists across sessions/page refreshes.

**What 043 enables**: `benchmark_aging_days` (180) and `benchmark_stale_days` (365) now admin-configurable via Settings → Evaluation UI.

## Deferred Items — Detailed Status

### Benchmark Premium Ranges (Priority 6)
- **File**: `src/data/market-data/benchmarks.ts` (1089 lines, 8 policy types)
- **Problem**: Premium numbers (min/max/avg/median/percentiles) date from Dec 2024 estimates
- **Safety**: No `provenance` on any entry → benchmark provenance gate suppresses all premium percentile claims in reviewer mode. This is working as designed.
- **To unblock**: Need real TSB/SEDDK 2025 annual statistics. Update `premiumRange` values, then add `provenance: { source, date, cohort }` to enable claims.
- **Coverage benchmarks are current**: SEDDK 2025 traffic limits, exclusion lists, regional factors, inclusion rates all valid.

### Schema Unification (Priority 7)
- **Two copies**: `src/lib/ai/extraction-schema.ts` (637 lines, client) and `server/schemas/extraction-schema.ts` (387 lines, server)
- **Syntax divergence**: Client uses `type: ['string', 'null']`, server uses `anyOf` — both valid JSON Schema but structurally different
- **Block**: `server/tsconfig.json` rootDir prevents importing from `shared/`; `railway.json` startCommand tied to `dist-server/` output structure
- **Interim safeguard**: 10-test parity suite catches key/required drift. Does NOT catch type representation or enum value differences.
- **To unblock**: Would need monorepo tooling (turborepo/nx), workspace-aware build commands, or a build-time copy/generate script.

## Next Steps for the Next Agent (Priority Order)

1. **🔴 URGENT — Rotate leaked secrets** (user action; cannot be done by agent)
2. **Bulk ingest pilot KASKO PDFs** — needs user to drop 50+ real PDFs into `upload/real-kasko-pdf/`
3. **Run evaluation backfill** — `npx tsx scripts/backfill-evaluation-scores.ts --apply` (needs Supabase credentials in `.env`)
4. **Calibrate grade thresholds** — `scripts/calibrate-grade-thresholds.ts` (needs 50+ scored policies from step 3)
5. **Update benchmark premium ranges** — blocked on external market research (TSB/SEDDK 2025 data)
6. **Schema unification** — deferred; parity test sufficient for now

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
11. Any change to either `extraction-schema.ts` MUST be mirrored manually — parity test at `server/__tests__/extraction-schema-parity.test.ts` will catch drift on CI
12. `ProcessingLogger.onStageChange()` listener errors are caught individually — do NOT add rethrow logic
13. `translations-skeleton.ts` accepts new KEYS with empty-string VALUES — what's forbidden is non-empty content

## Environment Variables Required

No new env vars introduced. All existing vars from CLAUDE.md remain required:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — admin panel and service-role operations
- `ADMIN_JWT_SECRET` — admin login
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — AI extraction
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — push notifications
- `EXCHANGERATE_API_KEY` — optional, FX rate higher tier
- `GCP_SERVICE_ACCOUNT_BASE64` — Document AI OCR

**🔴 ALL KEYS LISTED ABOVE MUST BE ROTATED** — they were exposed earlier in the April 8 session.

## Quality State

**This session**: Read-only audit. No code changes, no test runs.
**Known test state**: 16,155+ tests, 0 failures, ~91.67% statements, ~85.91% branches coverage.
**Last code session** (Apr 9, PR #337): 4 isolated test runs (all green), ESLint + Prettier clean.
