# Session Handoff — March 1, 2026 (Follow-Up Review & Adapter Cleanup)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | Passing |
| **TypeCheck** | 0 errors (frontend + server) |
| **ESLint Errors** | 0 errors |
| **ESLint Warnings** | 0 warnings |
| **Tests** | 15,888 tests (15,886 passing, 335 files, 1 pre-existing flaky failure) |
| **Coverage** | ~91.67% statements, ~85.91% branches |
| **Lighthouse** | Performance 99, Accessibility 100, Best Practices 93, SEO 100 |
| **Branch** | `claude/load-project-context-x62uW` |
| **Production Status** | **Actuarial Engine Deployed & Enabled**; migration 028 applied; feature flag enabled at 100%; all follow-up items resolved. |

---

## Session Summary

### Follow-Up Review & Adapter Cleanup (March 1, 2026)

Investigated 4 follow-up items flagged in the previous session's handoff. Found 1 actionable cleanup and 3 items already complete:

1. **adapter.ts Exclusions Cleanup** ✅ — Removed unnecessary defensive `(e: unknown)` cast from `adapter.ts:176`. `AnalyzedPolicy.exclusions` is typed `string[]` and `policy-extractor.ts` always produces `string[]`. Fixed test data in `adapter.test.ts` that violated the type contract by passing objects instead of strings. Adapter now uses direct passthrough `policy.exclusions || []`.

2. **Timing Ring Buffer Wiring** — Already complete. `recordEvaluationTiming()` is called internally via the event bus subscriber in `ActuarialTab.tsx` (line 59). `setLastEvalResult` is wired to real evaluation data from the same subscriber (line 62). Data flow: `PolicyDetailView`/`ComparePolicies` → `emitEvaluation()` → event bus → `ActuarialTab` subscriber.

3. **ComparePolicies / PolicyDetailView Timing Calls** — Already complete. Both components call `emitEvaluation()` after evaluation, which triggers the ActuarialTab subscriber that internally handles timing recording. Direct calls to `recordEvaluationTiming()` are unnecessary.

4. **Admin Actuarial Routes Mock Path** — Correct, no bug. The mock path `../services/actuarial-persistence.js` resolves correctly relative to the test file. All 26 tests pass.

### P4 & P6 — Noted as Future Roadmap
- **P4 (Health/Life/Business Policy Support)**: Extend actuarial engine to support health, life, business policy types with type-specific compliance gates and scenario sets. Not started.
- **P6 (Monte Carlo Performance Benchmarking)**: Profile simulation at 1K/10K/100K iterations; Web Worker offloading for UI responsiveness. Feasibility confirmed (engine is pure JS, zero DOM/React deps, JSON-serializable I/O). Not started.

---

## Files Modified This Session

| File | Change |
|------|--------|
| `src/lib/actuarial-engine/adapter.ts` | Simplified exclusion mapping: removed `(e: unknown)` cast, now `policy.exclusions \|\| []` |
| `src/lib/actuarial-engine/__tests__/adapter.test.ts` | Fixed `makePolicy()` helper to use `string[]` exclusions; fixed exclusion test data |
| `SESSION_HANDOFF.md` | Updated to reflect resolved gotchas |
| `CLAUDE.md` | Marked timing ring buffer and adapter exclusion gotchas as resolved |

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

---

## Priority Next Steps

### P4 — Health/Life/Business Policy Support (Future)
1. Add policy type support for health, life, business in actuarial engine
2. Create type-specific compliance gates and scenario sets
3. Extend `adapter.ts` coverage mapping for non-motor types

### P6 — Monte Carlo Performance Benchmarking (Future)
1. Profile Monte Carlo simulation with varying iteration counts (1K, 10K, 100K)
2. Web Worker offloading for large multi-policy comparisons (feasibility confirmed — engine is pure JS, zero DOM deps)

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
| Feb 28 late | P1/P2/P3/P5: Event bus wiring, persistence service, feature flag API, 26 tests | `gemini202602281715` |
| Mar 1 early | Phase 7: Production deployment (Migration 028 + Feature Flag), 26 passing actuarial tests | `gemini202603010814` |
| **Mar 1 late (Current)** | **Follow-up review: adapter exclusion cleanup, confirmed event bus wiring complete, P4/P6 noted as roadmap** | **`claude/load-project-context-x62uW`** |
