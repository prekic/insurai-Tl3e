# Session Handoff — March 27, 2026

## Branch

`claude/load-project-context-nqrry`

## What Was Done This Session (11 commits)

### 1. KASKO Pilot — Migrations, Activation, Live Verification
- **Migration 040** applied to production Supabase (user_segments, kasko_pilot_qa_records, feature flag)
- **Migration 041** applied (RLS hardening, SECURITY INVOKER views)
- **Pilot activated**: flag enabled (100%), 2 reviewers assigned (prekic@gmail.com + testadmin@insur.ai)
- **Live extraction verified**: 16-page KASKO PDF, Anadolu Sigorta, 9 coverages, confidence 0.9625
- **22 QA records**: all `pilot_eligible_clean`, zero safety violations across all 4 rollback thresholds

### 2. Phase 8L Formal Evaluation Report
- Created `docs/KASKO_PILOT_PHASE_8L_EVALUATION_2026_03_27.md` (203 lines)
- Result: 8/11 blocking criteria PASS, 1 FAIL (duration 8/14 days), 2 BLOCKED (no reviewer verdicts, no ineligible doc testing)
- Recommended graduation date: April 5, 2026 (needs diverse PDFs + 2-week duration)

### 3. Production Release Safety Patch — 6 Blockers Fixed
All 6 production blockers addressed with code changes + 79 regression tests:

| # | Blocker | Commit | Tests |
|---|---------|--------|-------|
| B4 | **Draft Gating** — exports/share/comparison disabled for draft policies | `5e6ee6c` | 21 |
| B1 | **Benchmark Honesty** — premium score capped at 75, "estimate" wording, disclaimer | `c1984bd` | 9 |
| B3+B6 | **Score Explainability** — dual-score explanation, estimated contract quality flag, weight breakdown | `2ecb3c3` | 7 |
| B2 | **Deductible Transparency** — percentage extracted from conditional deductibles, EOOP understatement warning | `f2032b8` | 17 |
| B5 | **Assistance Label Accuracy** — verified existing logic correct, minor condition fix | `4c7fa56` | 7 |
| — | **Regression tests** for all 5 phases | `16cd014` | 61 |

### 4. Benchmark Confidence System (Deep Fix)
- **5-factor context assessment**: vehicle class, model year, geography, insurer, coverage level
- **3 confidence levels**: `high` (3+ factors → full comparison), `low` (1-2 → comparison with caveat), `suppressed` (0 → card hidden)
- Prevents the exact "68% above average" false conclusion from bare/decontextualized policies
- Premium score returns neutral 70 when suppressed, with missing-factor explanation
- **18 regression tests** including the exact failure case
- Commit: `f83bb27`

## Commits (This Session)

| # | SHA | Message |
|---|-----|---------|
| 1 | `13360b4` | docs: document KASKO pilot live results |
| 2 | `319f337` | docs: Phase 8L formal evaluation report |
| 3 | `5e6ee6c` | fix(safety): hard-gate draft policies from export, share, comparison (B4) |
| 4 | `c1984bd` | fix(safety): cap premium score at 75 for unverified benchmarks (B1) |
| 5 | `2ecb3c3` | fix(safety): explain contradictory scores, flag estimated contract quality (B3+B6) |
| 6 | `f2032b8` | fix(safety): extract and surface percentage deductibles (B2) |
| 7 | `4c7fa56` | fix(safety): preserve assistance coverage limits (B5) |
| 8 | `16cd014` | test: add 61 regression tests for all 6 production blockers |
| 9 | `f83bb27` | fix(safety): benchmark confidence system — suppress/qualify false conclusions |
| 10 | `35e4b26` | docs: session handoff — safety patch, benchmark confidence, pilot evaluation |
| 11 | `df59856` | fix(test): update 5 evaluator-branches assertions for benchmark safety changes |

## Files Changed (19 files, +2,586/−579 lines)

| File | Change |
|------|--------|
| `src/components/PolicyDetailView.tsx` | Draft gating, benchmark disclaimer, score explanation, deductible display, confidence UI |
| `src/components/SharedResult.tsx` | TASLAK/DRAFT banner for shared draft links |
| `src/components/ComparePolicies.tsx` | Draft label in comparison selector; new imports: `usePilotGateOptions`, `evaluateKaskoPilotGate` |
| `src/lib/policy-evaluation/evaluator.ts` | `assessBenchmarkConfidence()`, premium score cap, suppression logic |
| `src/lib/policy-evaluation/types.ts` | `BenchmarkConfidence`, `BenchmarkContextFactor`, `benchmarkDisclaimer` |
| `src/lib/policy-evaluation/evaluator-branches.test.ts` | **FIXED**: 5 assertions updated for benchmark cap and indicative wording |
| `src/lib/actuarial-engine/engine.ts` | `contractQualityIsEstimated` flag (both sync + async paths) |
| `src/lib/actuarial-engine/types.ts` | Added `contractQualityIsEstimated` to result type |
| `src/lib/ai/policy-extractor.ts` | Extract `deductiblePercent` from conditional deductibles |
| `src/types/policy.ts` | Added `deductiblePercent` field to AnalyzedPolicy |
| `docs/KASKO_PILOT_PHASE_8L_EVALUATION_2026_03_27.md` | Phase 8L evaluation report |
| `src/components/__tests__/draft-gating.test.tsx` | **NEW**: 21 tests for B4 draft gating |
| `src/lib/actuarial-engine/__tests__/contract-quality-estimated.test.ts` | **NEW**: 7 tests for B3 estimated flag |
| `src/lib/ai/__tests__/deductible-percentage-extraction.test.ts` | **NEW**: 17 tests for B2 percentage extraction |
| `src/lib/analysis/__tests__/assistance-label-accuracy.test.ts` | **NEW**: 7 tests for B5 assistance labels |
| `src/lib/policy-evaluation/__tests__/benchmark-confidence.test.ts` | **NEW**: 18 tests for benchmark confidence system |
| `src/lib/policy-evaluation/__tests__/evaluator-benchmark-honesty.test.ts` | **NEW**: 9 tests for B1 premium cap |

## New Patterns Introduced

### BenchmarkConfidence System
- **Location**: `src/lib/policy-evaluation/evaluator.ts` → `assessBenchmarkConfidence()`
- **Type**: `src/lib/policy-evaluation/types.ts` → `BenchmarkConfidence`
- **5 factors checked**: vehicleInfo.vehicleClass, vehicleInfo.year, location, provider, coverage
- **UI gating**: PolicyDetailView hides Market Comparison card when `evaluation.benchmarkConfidence.level === 'suppressed'`
- **Follow this pattern** when adding new context-dependent conclusions anywhere in the app

### Draft Export Gating
- **Location**: `PolicyDetailView.tsx` → `draftExportBlocked()` callback
- **Pattern**: Check `displaySummary?.isDraft` before any action that produces user-facing output
- **Applies to**: export (PDF/CSV/Excel/Text), share, and UI scores (amber overlay)

## Non-Critical Issues (Carry Forward)

1. **Processing log PATCH 404** — `PATCH /api/ai/processing-log/:id` returns 404 after initial CREATE. Route/table ID mismatch. Non-blocking.
2. **QA Record `display_mode` always "unknown"** — pilot gate doesn't populate this from review-thresholds.ts. Low priority.
3. **`user_preferences` 406 error** — GET with `category=eq.email` returns 406. Missing Accept header or schema mismatch. Pre-existing.
4. **Missing PWA icons** — `vite.svg`, `icon-144x144.png` return 404. Cosmetic.
5. **Duplicate GoTrueClient warning** — during pilot QA persistence. Non-blocking.
6. **`isDraft` not persisted to DB** — computed dynamically from feature flag. If flag disabled, draft status disappears. Needs schema migration for proper fix.

## Residual Risks After Safety Patch

| Risk | Severity | Why Remains |
|------|----------|-------------|
| Benchmark data stale (2024-12-01) | Medium | Needs external market research |
| EOOP can't model % deductibles in Monte Carlo | Medium | Warning added; full fix needs schema+adapter pipeline change |
| Grade thresholds arbitrary (A=90, B=80) | Low | Needs calibration against real outcomes |
| Coverage score conflates presence/quality | Low | Explained to user instead of restructured |
| TOPSIS weights not shown to user | Low | Needs new UI component |

## Next Steps (Priority Order)

1. **Verify Railway deployment** — sandbox push doesn't trigger webhook. Use `mcp__github__push_files` or Railway manual deploy to get safety patch live.
2. **Upload diverse KASKO PDFs** — Phase 8L needs 5+ unique documents from different providers for graduation readiness.
3. **Fix Processing Log PATCH 404** — investigate route/table mismatch. The POST works but PATCH fails.
4. **Wire `display_mode` into QA records** — read from `review-thresholds.ts` evaluation, pass into QA record persistence.
5. **Persist `isDraft` to DB** — add `is_draft` column to policies table via migration so draft status survives flag changes.
6. **Fix `user_preferences` 406** — likely needs `Accept: application/json` header or schema alignment.

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) are NEVER overwritten
2. Header hydration touches ONLY: `insured_person`, `start_date`, `expiry_date`
3. Full test suite not run without justification (>10 min)
4. Pilot evidence must be from real live data only
5. Never add `VITE_` prefix to API keys
6. `auditLogs` array MUST have `MAX_ENTRIES` cap after every `.push()` call
7. All admin endpoints under `/api/admin/` that aren't auth-related MUST have `authenticateAdmin` or `requireSuperAdmin()` middleware
8. Segment names must be in `VALID_SEGMENT_NAMES` allowlist
9. **NEW**: Any user-facing market conclusion must be gated by `BenchmarkConfidence` — if factors are missing, downgrade or suppress
10. **NEW**: Draft policies must not be exportable, shareable, or comparable without clear TASLAK/DRAFT labeling

## Session-Specific Gotchas

1. **Railway Sandbox Proxy Push**: `git push` via sandbox goes through `127.0.0.1` proxy — does NOT trigger Railway webhook. Use `mcp__github__push_files` for auto-deploy.
2. **Admin Sub-Route Test Mock Path**: Must mock `'../routes/admin/shared.js'` — NOT `'../../middleware/admin-auth.js'`.
3. **BenchmarkConfidence requires AnalyzedPolicy fields**: The `assessBenchmarkConfidence()` function casts `Policy` to `AnalyzedPolicy` to access `vehicleInfo` and `location`. If these fields are missing/undefined, confidence degrades gracefully.
4. **evaluatePremium signature changed**: Now accepts optional 3rd parameter `confidence?: BenchmarkConfidence`. Existing tests that mock `evaluatePremium` may need updating if they check call signatures.
5. **evaluator-branches.test.ts had 5 broken assertions**: The benchmark score cap (75) and wording change ("market average" → "market estimate") broke 5 existing tests. Fixed in commit `df59856`. Any future test that asserts on premium score values or issue text must use the new wording: "market estimate", "(indicative benchmark)", and score ≤75 for below-average comparisons.
6. **ComparePolicies.tsx now imports pilot gate hooks**: `usePilotGateOptions` and `evaluateKaskoPilotGate` are imported. Existing tests don't render ComparePolicies directly (only test hooks/data), but if new component tests are written, these hooks must be mocked.
