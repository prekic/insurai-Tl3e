# Session Handoff — March 28, 2026

## Current State

**All code work is merged to `main` (at `f7b6683`).** Branch `claude/project-handoff-docs-0XYw6` has 1 documentation-only commit ahead (`d18cb1b`) — updates to CLAUDE.md and SESSION_HANDOFF.md. This commit should be merged to main.

## What Was Done in Recent Sessions (Merged PRs #296-#306)

### Safety Governance & Explainability (PRs #303, #304, #306)

| Feature | Description | Key Files |
|---------|-------------|-----------|
| Benchmark Confidence Gating | 5-factor context assessment (vehicle class, model year, geography, insurer, coverage level). Suppresses or warns when data is insufficient. | `evaluator.ts`, `types.ts` |
| Benchmark Freshness | 3-state system (current ≤180d, aging 181-365d, stale >365d). Stale data downgrades confidence one step, hedges language. | `evaluator.ts`, `benchmark-service.ts`, `PolicyDetailView.tsx` |
| EOOP Precision | Flags percentage/conditional deductibles that can't be fully modeled. Shows `~` prefix, amber color, limitation panel. | `adapter.ts`, `engine.ts`, `types.ts` |
| TOPSIS Weight Transparency | Collapsible panel showing 6 criteria with weights, direction badges, and "model-based ranking, not objective truth" disclaimer. | `ComparePolicies.tsx` |
| Grade Threshold Disclosure | "Top Score Drivers" summary + model disclosure below grade badge. GradeBadge hover with calibration notice. | `PolicyDetailView.tsx`, `GradeBadge.tsx` |
| Draft Export/Share Gating | Blocks PDF/CSV/Excel/Text export and sharing for draft policies. Shows TASLAK/DRAFT banner. | `PolicyDetailView.tsx`, `SharedResult.tsx`, `ComparePolicies.tsx` |
| Language Softening | "Recommended choice" → "Top-ranked by model", "above/below average" → "above/below market estimate" | `translations-en.ts`, `translations-tr.ts` |

### Bug Fixes (PR #304)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Processing Log PATCH 404 | `.single()` returns PGRST116 on 0 rows + race condition | `.maybeSingle()` + client retry on 404 |
| QA Record display_mode "unknown" | Never evaluated | Added `evaluateSimpleDisplayMode()` |
| user_preferences 406 | `.single()` on non-existent row | `.maybeSingle()` in configuration-service.ts |

### Security Hardening (PR #300)

- Actuarial admin routes now require auth
- Memory leak caps on all in-memory arrays/maps
- Mass assignment protection on admin endpoints
- Input validation with Zod on backfill/segments routes
- Debug log cleanup (98 lines removed from policy-extractor.ts)
- 95 new tests (admin-backfill, admin-segments, usePilotGateOptions, useDisplaySafeSummary)

### Documentation (PR #306)

- SESSION_HANDOFF.md with full commit table and file manifest
- CLAUDE.md gotchas #23-35 documenting all new patterns
- SESSION_OUTPUT.txt for copy-paste reference

## Test Count

~16,088+ tests across 340+ files, 0 failures, 0 lint errors.

## New Gotchas Introduced (Documented in CLAUDE.md #23-35)

- **#23**: Benchmark Confidence Gating — all market comparisons gated by 5-factor assessment
- **#24**: Draft Export/Share Gating — check `isDraft` on all output paths
- **#25**: Contract Quality `contractQualityIsEstimated` flag — both sync/async paths must set it
- **#26**: `evaluatePremium()` now accepts optional 3rd param `confidence`
- **#27**: Benchmark Freshness — stale data downgrades confidence, test mocks MUST include `dataDate`
- **#28**: EOOP Precision — adapter flags percentage/conditional deductibles
- **#29**: TOPSIS Weight Transparency — panel uses `DEFAULT_TOPSIS_CRITERIA` export
- **#30**: Grade Threshold Disclosure — config-driven via `getGradeFromScore(score, thresholds?)`
- **#31**: Language Softening — never use unqualified "best" or "recommended"
- **#32**: `.single()` → `.maybeSingle()` pattern for potentially empty Supabase queries
- **#33**: Processing Log PATCH race condition — client retries once on 404
- **#34**: `evaluateSimpleDisplayMode()` — lightweight mode eval for pilot QA
- **#35**: Benchmark mock `dataDate` requirement — omitting it causes stale downgrade

## Non-Critical Issues (Carry Forward)

1. **Missing PWA icons** — `vite.svg`, `icon-144x144.png` return 404. Cosmetic only.
2. **Duplicate GoTrueClient warning** — during pilot QA persistence. Non-blocking.
3. **`isDraft` not persisted to DB** — computed dynamically from feature flag. Needs `is_draft` column migration.
4. **Benchmark data stale (2024-12-01)** — freshness governance now flags this; needs external market research to update.
5. **EOOP can't model % deductibles in Monte Carlo** — warning added; full fix needs per-coverage DeductibleSpec mapping in adapter.

## Next Steps (Priority Order)

1. **Deploy to Production** — All merged to `main`. Railway needs a deploy trigger (sandbox `git push` doesn't trigger webhook — use `mcp__github__push_files` or Railway manual deploy).
2. **Upload Diverse KASKO PDFs** — Phase 8L graduation needs 5+ unique documents from different providers (currently all 22 QA records are from the same Anadolu Sigorta PDF). Target: April 5, 2026.
3. **Persist `isDraft` to DB** — Add `is_draft` column to `policies` table via migration so draft status survives feature flag changes.
4. **Calibrate Grade Thresholds** — A=90, B=80 etc. are arbitrary. Need real outcome data. Thresholds are now config-driven (`benchmarkAgingDays`, `benchmarkStaleDays` in `EvaluationConfig`; grade thresholds via admin Settings UI).
5. **Update Benchmark Data** — Current data is Dec 2024, benchmark freshness governance flags it as stale (>365 days). Needs external market research to update `dataDate` and premium ranges in `MARKET_BENCHMARKS`.

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

All existing env vars documented in CLAUDE.md remain required. No new env vars were introduced in recent sessions.

Key vars for production:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — required for admin panel and service-role operations
- `ADMIN_JWT_SECRET` — required for admin login
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — AI extraction
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — push notifications
- `EXCHANGERATE_API_KEY` — optional, for higher rate limits on FX API
