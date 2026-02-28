# Session Handoff — February 28, 2026 (P3 Actuarial Observability)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | Passing |
| **TypeCheck** | 0 errors (frontend + server) |
| **ESLint Errors** | 0 errors |
| **ESLint Warnings** | 0 warnings |
| **Tests** | 15,848 passing (333 files, 0 failures) |
| **Coverage** | ~91.67% statements, ~85.91% branches |
| **Lighthouse** | Performance 99, Accessibility 100, Best Practices 93, SEO 100 |
| **Branch** | `claude/load-project-context-uRxsB` |
| **Production Status** | Nixpacks + healthcheck deployed; actuarial engine UI integrated; P3 observability complete |

---

## Session Summary

### P3.1 — Actuarial Engine Timing Instrumentation
- Added `LayerTimings` interface to `types.ts`: `layerA_ms`, `layerB_ms`, `layerC_ms`, optional `layerD_ms`, `total_ms`
- Instrumented `engine.ts` with `performance.now()` around each layer in both `runFullEvaluation()` and `evaluateAndRankPolicies()`
- Blocked (compliance-failed) results set `layerC_ms = 0` and `layerD_ms = undefined`
- Multi-policy TOPSIS evaluations add `layerD_ms` to each eligible result
- Added `PerformanceTimingsCard` component in `ActuarialTab.tsx`: evaluation count, avg/min/max total time, per-layer averages
- Exported `recordEvaluationTiming()` with in-memory ring buffer (max 50 entries) for client-side timing capture
- **8 tests** in `engine-timings.test.ts`

### P3.2 — Evidence Coverage Dashboard
- Created `EvidenceCoveragePanel.tsx` (~294 lines) with 3 summary cards:
  - Coverage Rate (color-coded: green ≥80%, amber ≥50%, red <50%)
  - Fields With Evidence (count/total)
  - Review Status (needs review vs verified)
- Confidence distribution histogram (5 buckets, 0-100%)
- Fields Needing Review table (field path, evidence count, confidence %, reason)
- Integrated into `ActuarialTab.tsx` below the performance section
- **12 tests** in `EvidenceCoveragePanel.test.tsx`

### P3.3 — Expanded Golden Regression Tests (+14 tests)
- **Kasko Extended** (5 tests): luxury high-limit vehicle, full supplementary coverage, zero deductible, no coverages included, zero exclusion texts
- **Traffic Extended** (3 tests): exact SEDDK 2026 minimums (passes), 1₺ below minimum (fails), maximum limits
- **DASK/ZAS Extended** (3 tests): exactly 2% deductible (passes), ZAS with multiple perils, coverage exceeding max
- **Cross-Cutting** (3 tests): identical policies equal TOPSIS ranking, mixed policy types in multi-eval, configSnapshot always present
- **Total**: 40 golden regression tests (26 existing + 14 new), all deterministic with seed=42

### Additional Fixes
- Fixed pre-existing `no-non-null-assertion` ESLint warning in `engine.ts` (extracted narrowed variable)
- Fixed pre-existing TS error in `adapter.ts` (exclusions type mismatch — `string[]` vs object with `.text`)
- Removed unused `Eye` import and prefixed unused `_setLastEvalResult` in `ActuarialTab.tsx`
- Removed unused `vi` import from `EvidenceCoveragePanel.test.tsx`

---

## Files Modified/Created This Session

| File | Change |
|------|--------|
| `src/lib/actuarial-engine/types.ts` | Added `LayerTimings` interface, `layerTimings?` field on `PolicyEvaluationResult` |
| `src/lib/actuarial-engine/engine.ts` | Added `performance.now()` timing instrumentation, fixed non-null assertion |
| `src/lib/actuarial-engine/index.ts` | Added `LayerTimings` to barrel type exports |
| `src/lib/actuarial-engine/adapter.ts` | Fixed exclusions mapping type error (defensive `unknown` cast) |
| `src/lib/actuarial-engine/__tests__/golden-regression.test.ts` | +434 lines: 14 new tests across 4 describe blocks |
| `src/lib/actuarial-engine/__tests__/engine-timings.test.ts` | **NEW** — 8 tests for LayerTimings |
| `src/components/admin/tabs/ActuarialTab.tsx` | Added PerformanceTimingsCard, EvidenceCoveragePanel, recordEvaluationTiming() |
| `src/components/admin/tabs/settings/EvidenceCoveragePanel.tsx` | **NEW** — Evidence coverage dashboard component |
| `src/components/admin/tabs/settings/EvidenceCoveragePanel.test.tsx` | **NEW** — 12 tests |
| `CLAUDE.md` | Updated test counts, added Known Issues #143-145 |

---

## Known Issues

### Pre-Existing (unchanged)
- **Flaky `window is not defined`**: React 19 + Vitest concurrency race in `PolicyUpload.test.tsx` — passes individually, harmless in parallel
- **Service worker cache**: After deploying, users may need hard refresh. Current `CACHE_VERSION = v20`

### Gotcha: Actuarial Engine Integration
- Engine uses its own type system (`CanonicalCoverage` codes, `EvidencePointer`, `IndemnityMechanics`) — `adapter.ts` converts from `AnalyzedPolicy`
- Always import from `@/lib/actuarial-engine` barrel, never from individual layer files
- **Trial Restriction**: Actuarial UI hidden from anonymous/free trial users via `isTrialResult` check

### Gotcha: Timing Ring Buffer Not Yet Wired
- `recordEvaluationTiming()` is exported from `ActuarialTab.tsx` but not yet called from `ComparePolicies` or `PolicyDetailView`
- `_setLastEvalResult` is a placeholder — needs external callers to pass evaluation results to the evidence panel
- Both are ready for wiring but require a follow-up to connect the data flow

### Gotcha: adapter.ts Exclusions Defensive Cast
- `adapter.ts` uses `(e: unknown) => typeof e === 'string' ? e : ((e as { text?: string })?.text ?? String(e))` because `AnalyzedPolicy.exclusions` is typed `string[]` but some test data/extractions pass objects with `.text`
- The proper long-term fix is to normalize exclusions in `policy-extractor.ts` at extraction time

### Gotcha: EvidenceCoveragePanel Path
- `EvidenceCoveragePanel.tsx` lives at `src/components/admin/tabs/settings/` (alongside other settings panels) but is imported by `ActuarialTab.tsx`, not SettingsTab

### Gotcha: Alert Service Test Mocks
- Any test importing `server/routes/ai.ts` must mock `server/services/extraction-alert-service.js` and `server/services/config-service.js`

### Gotcha: Nixpacks Auto-Detection
- Without `nixpacks.toml`, Railway provisions Caddy and Chromium automatically. Always keep `providers = ["node"]`

---

## Configuration Requirements

### No New Environment Variables
No new env vars needed. All changes are frontend-only or extend existing actuarial engine infrastructure.

### Migration 028 (Not Yet Applied)
`supabase/migrations/028_actuarial_engine_schema.sql` creates 5 tables + feature flag seed. Apply to production **only when ready to enable the actuarial engine**. Idempotent.

---

## Priority Next Steps

### P1 — Wire Timing Data Flow
1. Call `recordEvaluationTiming()` from `ComparePolicies.tsx` and `PolicyDetailView.tsx` after actuarial evaluation
2. Pass `PolicyEvaluationResult` to `ActuarialTab` to populate the evidence coverage panel
3. Consider persisting timing data to DB for historical analysis

### P2 — Actuarial Engine Production Enablement
1. **Database**: Apply `028_actuarial_engine_schema.sql` to production Supabase
2. **Feature Flag**: Flip `actuarial_engine_enabled` to `true`
3. **Verify**: Admin Dashboard → "Actuarial Engine" tab loads config sets

### P3 — Further Quality Improvements
1. Add health/life/business policy type support to actuarial engine (currently only kasko/traffic/dask/zas)
2. Add integration tests for actuarial adapter with real sample policy data
3. Performance benchmarking: Monte Carlo simulation speed with varying iteration counts

---

## Session Context Chain

| Session | Key Deliverables | Branch |
|---------|-----------------|--------|
| Feb 25 early | Export dropdown, onboarding, extraction observability, admin mobile | `claude/complete-handoff-docs-Goirm` |
| Feb 25 late | Extraction health dashboard, Excel export, comparison enhancements, DB metrics | `claude/load-project-context-3VUJ2` |
| Feb 26 early | Extraction health hourly chart, processing log cleanup, ExtractionHealthTab tests | `claude/load-project-context-e6OeC` |
| Feb 26 late | Extraction health alerting, configurable retention, Benchmark UI builds | `claude/load-project-context-6D3KI` |
| Feb 27 | Alert email wiring, configurable checkIntervalMs + minRequests, migration 027 | `claude/load-project-context-yjssq` |
| Feb 28 early | Actuarial engine (4-layer), admin config UI, deployment hardening, output eval tests (162) | `gemini20260228` |
| **Feb 28 late (Current)** | **P3 observability: LayerTimings instrumentation, evidence coverage dashboard, 14 new regression tests** | **`claude/load-project-context-uRxsB`** |
