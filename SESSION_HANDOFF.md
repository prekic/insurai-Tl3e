# Session Handoff — March 27, 2026

## Branch

`claude/load-project-context-RcmfR`

## What Was Done This Session

### 1. Fixed 3 Non-Critical Bugs (commit `8398d2a`)

| Bug | Root Cause | Fix | Tests |
|-----|-----------|-----|-------|
| **Processing Log PATCH 404** | `.single()` returns PGRST116 error on 0 rows + race condition between POST commit and PATCH | Server: `.single()` → `.maybeSingle()` + null check; Client: 1-retry with 500ms delay on 404 | 12 |
| **QA Record display_mode "unknown"** | `createPilotQARecord()` defaults to `'unknown'` and nothing overwrites it | Added `evaluateSimpleDisplayMode()` to kasko-pilot-gate.ts, wired into policy-extractor.ts QA record creation | 13 |
| **user_preferences 406** | `.single()` returns HTTP 406 when 0 rows match (new users have no prefs) | `.single()` → `.maybeSingle()` in configuration-service.ts `getUserPreferences()` | 0 (one-line fix) |

### 2. Production Safety Audit — Verified Complete

All 6 blockers from the previous session confirmed fixed with 79 passing regression tests:
- Benchmark confidence (18 tests) — 5-factor context assessment, suppression at 0 factors
- Benchmark honesty (9 tests) — premium score capped at 75
- Draft gating (21 tests) — export/share/comparison blocked
- Deductible extraction (17 tests) — percentage extraction from conditional deductibles
- Contract quality (7 tests) — `contractQualityIsEstimated` flag
- Assistance labels (7 tests) — verified correct
- Evaluator branches (74 tests) — no regressions

### 3. Production Safety Deep Audit (Prompts 2-6 from user request)

All 5 audit areas **already complete** from previous session:
- **Prompt 2 (Benchmark Logic)**: `assessBenchmarkConfidence()` + premium cap + 3 confidence levels
- **Prompt 3 (Deductible Engine)**: `classifyExclusions()` + `deductiblePercent` + conditional deductible arrays
- **Prompt 4 (Score Consistency)**: `contractQualityIsEstimated` flag + dual-score explanation
- **Prompt 5 (Draft Gating)**: `draftExportBlocked()` + TASLAK banners + export/share blocking
- **Prompt 6 (Explainability)**: `BenchmarkConfidence` type with 5 factors, bilingual disclaimers

## Commits (This Session)

| # | SHA | Message |
|---|-----|---------|
| 1 | `8398d2a` | fix: resolve 3 non-critical bugs — processing log 404, QA display_mode, user_preferences 406 |

## Files Changed (8 files, +610/−22 lines)

| File | Change |
|------|--------|
| `server/services/processing-log-service.ts` | `.single()` → `.maybeSingle()` in updateProcessingLog(), added null check + diagnostic log |
| `src/lib/processing-log-api.ts` | Added retry logic (1 retry, 500ms delay on 404) |
| `src/lib/config/configuration-service.ts` | `.single()` → `.maybeSingle()` in getUserPreferences() |
| `src/lib/analysis/kasko-pilot-gate.ts` | Added `evaluateSimpleDisplayMode()` function |
| `src/lib/ai/policy-extractor.ts` | Wired display mode evaluation into QA record creation |
| `server/__tests__/processing-log-update.test.ts` | **NEW**: 7 tests for server-side .maybeSingle() fix |
| `src/lib/__tests__/processing-log-api-retry.test.ts` | **NEW**: 8 tests for client-side 404 retry |
| `src/lib/analysis/__tests__/evaluate-simple-display-mode.test.ts` | **NEW**: 13 tests for display mode evaluator |

## Non-Critical Issues (Carry Forward)

1. **Missing PWA icons** — `vite.svg`, `icon-144x144.png` return 404. Cosmetic.
2. **Duplicate GoTrueClient warning** — during pilot QA persistence. Non-blocking.
3. **`isDraft` not persisted to DB** — computed dynamically from feature flag. Needs schema migration.
4. **Benchmark data stale (2024-12-01)** — needs external market research, not a code fix.
5. **EOOP can't model % deductibles in Monte Carlo** — warning added; full fix needs schema change.

## Next Steps (Priority Order)

1. **Deploy to production** — sandbox push doesn't trigger Railway webhook. Use `mcp__github__push_files` or Railway manual deploy.
2. **Upload diverse KASKO PDFs** — Phase 8L graduation needs 5+ unique documents from different providers.
3. **Persist `isDraft` to DB** — add `is_draft` column to policies table via migration so draft status survives flag changes.
4. **Calibrate grade thresholds** — A=90, B=80, etc. are arbitrary; need real outcome data.
5. **Add TOPSIS weight visibility** — user can't see what weights drive the multi-criteria ranking.

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) are NEVER overwritten
2. Full test suite not run without justification (>10 min)
3. Pilot evidence must be from real live data only
4. Never add `VITE_` prefix to API keys
5. All admin endpoints must have auth middleware
6. Any user-facing market conclusion must be gated by `BenchmarkConfidence`
7. Draft policies must not be exportable/shareable without TASLAK/DRAFT labeling
8. Segment names must be in `VALID_SEGMENT_NAMES` allowlist
9. `auditLogs` array MUST have `MAX_ENTRIES` cap after every `.push()` call
