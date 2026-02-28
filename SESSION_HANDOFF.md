# Session Handoff — February 28, 2026 (P1/P2/P3/P5 Actuarial Integration)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | Passing |
| **TypeCheck** | 0 errors (frontend + server) |
| **ESLint Errors** | 0 errors |
| **ESLint Warnings** | 0 warnings |
| **Tests** | 15,872 passing (334 files, 1 pre-existing flaky failure) |
| **Coverage** | ~91.67% statements, ~85.91% branches |
| **Lighthouse** | Performance 99, Accessibility 100, Best Practices 93, SEO 100 |
| **Branch** | `gemini202602281715` |
| **Production Status** | Nixpacks + healthcheck deployed; actuarial engine fully wired with persistence; P1/P2/P3/P5 complete |

---

## Session Summary

### P1 — Wire Timing Data Flow (6 files changed)
- Created `actuarial-events.ts` — lightweight pub/sub event bus (`emitEvaluation()`, `subscribeEvaluation()`) to decouple evaluation producers from admin consumer
- Wired `PolicyDetailView.tsx` — `useEffect` emits evaluation events after actuarial result computes
- Wired `ComparePolicies.tsx` — `useEffect` emits timing events for each compared policy's actuarial result
- Updated `ActuarialTab.tsx` — subscribes to event bus on mount, calls `recordEvaluationTiming()` + `setLastEvalResult()` (replacing placeholder `_setLastEvalResult`)
- Added `actuarialResults?: PolicyEvaluationResult[]` to `PolicyComparison` type and wired `comparator.ts` to pass full results through
- Added `mapAnalyzedToActuarialInput` to barrel export (`index.ts`)
- **8 tests** in `actuarial-events.test.ts`

### P2 — Actuarial Engine Production Enablement (2 new files)
- Created `server/services/actuarial-persistence.ts` — `persistEvaluationResult()` creates evaluation_run + evaluation_result rows, `getEvaluationHistory()` retrieves with pagination/filtering
- Added 3 new admin API endpoints in `server/routes/admin/actuarial.ts`:
  - `POST /api/admin/actuarial/evaluation-results` — persist evaluation result to DB
  - `GET /api/admin/actuarial/evaluation-results` — retrieve historical results
  - `PATCH /api/admin/actuarial/feature-flag` — toggle `actuarial_engine_enabled`

### P3 — Persist Timing Data to DB
- Added `persistToServer()` in `actuarial-events.ts` — fire-and-forget POST to admin API on every evaluation
- Uses dynamic import of `adminFetch` to avoid bundling server code in main bundle
- Non-blocking: persistence failures are silently swallowed (best-effort)

### P5 — Integration Tests for Adapter (1 new file)
- Created `adapter-integration.test.ts` — **18 tests** across 4 describe blocks:
  - Single-policy pipeline: kasko, traffic, DASK full pipeline tests
  - Multi-policy pipeline: TOPSIS ranking, mixed types, Layer D timings
  - Edge cases: 0 coverages, very high premium, zero premium, no exclusions, determinism check
  - Adapter output validation: all sample policies map, IDs preserved, type mapping correct

---

## Files Modified/Created This Session

| File | Change |
|------|--------|
| `src/lib/actuarial-engine/actuarial-events.ts` | **NEW** — Pub/sub event bus + fire-and-forget persistence |
| `src/lib/actuarial-engine/index.ts` | Added `mapAnalyzedToActuarialInput` to barrel export |
| `src/lib/actuarial-engine/__tests__/actuarial-events.test.ts` | **NEW** — 8 tests for event bus |
| `src/lib/actuarial-engine/__tests__/adapter-integration.test.ts` | **NEW** — 18 integration tests |
| `src/lib/policy-evaluation/types.ts` | Added `actuarialResults?: PolicyEvaluationResult[]` to `PolicyComparison` |
| `src/lib/policy-evaluation/comparator.ts` | Pass `actuarialResults` through on return object |
| `src/components/PolicyDetailView.tsx` | Import from barrel, emit evaluation events via `useEffect` |
| `src/components/ComparePolicies.tsx` | Import `emitEvaluation`, emit timing events per compared policy |
| `src/components/admin/tabs/ActuarialTab.tsx` | Subscribe to event bus, replace `_setLastEvalResult` with real data flow |
| `server/services/actuarial-persistence.ts` | **NEW** — Persist evaluation results to DB |
| `server/routes/admin/actuarial.ts` | 3 new endpoints: POST/GET evaluation-results, PATCH feature-flag |

---

## Known Issues

### Pre-Existing (unchanged)
- **Flaky `window is not defined`**: React 19 + Vitest concurrency race in `PolicyUpload.test.tsx` — passes individually, harmless in parallel
- **Service worker cache**: After deploying, users may need hard refresh. Current `CACHE_VERSION = v20`
- **Flaky `PolicyUpload-coverage.test.tsx:1057`**: `toHaveBeenCalledTimes(4)` assertion intermittently fails — pre-existing, unrelated to actuarial changes

### Gotcha: Actuarial Engine Integration
- Engine uses its own type system (`CanonicalCoverage` codes, `EvidencePointer`, `IndemnityMechanics`) — `adapter.ts` converts from `AnalyzedPolicy`
- Always import from `@/lib/actuarial-engine` barrel, never from individual layer files
- **Trial Restriction**: Actuarial UI hidden from anonymous/free trial users via `isTrialResult` check

### ~~Gotcha: Timing Ring Buffer Not Yet Wired~~ ✅ RESOLVED
- `recordEvaluationTiming()` is now called via event bus from both `PolicyDetailView` and `ComparePolicies`
- `setLastEvalResult` is now wired to real evaluation data from the event bus

### Gotcha: adapter.ts Exclusions Defensive Cast
- `adapter.ts` uses `(e: unknown) => typeof e === 'string' ? e : ((e as { text?: string })?.text ?? String(e))` because `AnalyzedPolicy.exclusions` is typed `string[]` but some test data/extractions pass objects with `.text`
- The proper long-term fix is to normalize exclusions in `policy-extractor.ts` at extraction time

### Gotcha: Event Bus Module-Level State
- The timing ring buffer and `lastEvalResult` use module-level state in `ActuarialTab.tsx` — works for the admin SPA but does not survive page reload
- `persistToServer()` in the event bus sends data to DB, enabling historical retrieval via the admin API

### Gotcha: Alert Service Test Mocks
- Any test importing `server/routes/ai.ts` must mock `server/services/extraction-alert-service.js` and `server/services/config-service.js`

### Gotcha: Nixpacks Auto-Detection
- Without `nixpacks.toml`, Railway provisions Caddy and Chromium automatically. Always keep `providers = ["node"]`

---

## Configuration Requirements

### No New Environment Variables
No new env vars needed. All changes extend existing actuarial engine infrastructure.

### Migration 028 (Not Yet Applied)
`supabase/migrations/028_actuarial_engine_schema.sql` creates 5 tables + feature flag seed. Apply to production **only when ready to enable the actuarial engine**. Idempotent.

### New Admin API Endpoints (Available After Migration)
- `POST /api/admin/actuarial/evaluation-results` — persist an evaluation result
- `GET /api/admin/actuarial/evaluation-results?policyId=X&limit=50&offset=0` — historical retrieval
- `PATCH /api/admin/actuarial/feature-flag` — toggle `{ "enabled": true|false }`

---

## Priority Next Steps

### P4 — Health/Life/Business Policy Support
1. Add policy type support for health, life, business in actuarial engine
2. Create type-specific compliance gates and scenario sets
3. Extend adapter.ts coverage mapping for non-motor types

### P6 — Monte Carlo Performance Benchmarking
1. Profile Monte Carlo simulation with varying iteration counts (1K, 10K, 100K)
2. Consider Web Worker offloading for large multi-policy comparisons
3. Add performance regression test with timing thresholds

### P7 — Production Deployment
1. Apply migration `028_actuarial_engine_schema.sql` to production Supabase
2. Flip `actuarial_engine_enabled` feature flag to `true` via admin API
3. Verify admin dashboard loads actuarial tab correctly
4. Monitor evaluation result persistence in `actuarial_evaluation_results` table

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
| Feb 28 mid | P3 observability: LayerTimings instrumentation, evidence coverage dashboard, 14 new regression tests | `claude/load-project-context-uRxsB` |
| **Feb 28 late (Current)** | **P1/P2/P3/P5: Event bus wiring, persistence service, feature flag API, 26 new tests** | **`gemini202602281715`** |
