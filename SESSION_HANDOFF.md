# Session Handoff — April 25, 2026 — Fixing Kasko Extraction Pipeline UI & Data Mapping

> **Session type**: UI Regression Fix + E2E Stabilization + Trial Limit Adjustment. Fixed the `VehicleInfoCard` unmounting issue by gracefully handling undefined metadata. Hardened the extraction mapping in `policy-converter.ts` to correctly map LLM vehicle fields. Added strict 'Cannot Verify' trap assertions in `e2e/real-user-proof.spec.ts`. Adjusted the anonymous trial upload limit to 100.

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1: Monitor Trial Upload Limit
The free trial usage limit was adjusted to 100 (`TRIAL_MAX_UPLOADS = 100` in `src/lib/free-trial.ts`). Monitor server resources and API costs to ensure this raised limit doesn't lead to abuse or excessive billing.

### Priority 2: Verify E2E Suite in CI
The `real-user-proof.spec.ts` test suite has been fortified with strict `FORBIDDEN` checks against "Cannot Verify" texts on the policy detail page. Ensure these pass consistently on CI. If any test fails, it means the extraction pipeline failed to map critical vehicle data (make, model, year, plate) to the frontend.

### Priority 3: Implement Self-Healing Loop Architecture
The self-healing loop architecture design (planned earlier) is now ready to implement since this pipeline merge is complete. Focus on creating the LLM-as-a-Judge system to automatically retry and correct extraction failures.

## Current State

**Branch**: `fix-kasko-vehicle-mapping` (PR #371 merged to main).
**Recent Commits**:
- `feat: set free trial usage limit to 100`
- `fix(extraction): correctly map structured LLM vehicle metadata to UI`
- `feat: add real-user-proof E2E test with visual audit screenshots`
- `fix: complete vehicleInfo round-trip mapping and E2E integrity hardening`

**Tests**: E2E `real-user-proof.spec.ts` passes flawlessly across WebKit, Mobile Safari, Chromium, and Mobile Chrome.

## What This Session Produced

### Phase 1 — UI Regression Fix
Fixed `VehicleInfoCard.tsx` crashing when `vehicleInfo` was `undefined` or missing properties. Implemented an empty object fallback so that individual fields display "Cannot Verify" instead of hiding the entire UI section.

### Phase 2 — Extraction Pipeline Mapping
Refactored `policy-converter.ts` to directly map the structured LLM `vehicle` data (make, model, year, plate) to the frontend `vehicleInfo` object, replacing brittle and failure-prone legacy regex parsing. 

### Phase 3 — E2E Test Hardening
Enhanced `e2e/real-user-proof.spec.ts` with strict visual checks. The tests now explicitly assert that the text "Cannot Verify" is NOT present on the Kasko policy page, ensuring that the extraction pipeline is successfully piping data to the UI.

### Phase 4 — Trial Limit Adjustment
Raised the daily trial upload limit from 3 to 100 in `src/lib/free-trial.ts` to prevent user friction during onboarding.

## Environment / Configuration
- No new environment variables added.
- `TRIAL_MAX_UPLOADS` in `src/lib/free-trial.ts` is now 100.

## New Patterns / Gotchas Introduced (cross-ref to CLAUDE.md)

| # | Topic | CLAUDE.md gotcha |
|---|-------|------------------|
| 1 | `VehicleInfoCard` UI Fallback for missing data | #110 |
| 2 | E2E 'Cannot Verify' Forbidden Assertions | #111 |
| 3 | Trial Limit Adjustment | #112 |

## Non-Negotiable Rules (Carry Forward — Unchanged)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) NEVER overwritten.
2. Full test suite NEVER run without explicit user permission (>10 min).
3. Pilot evidence from real live data only.
4. All new AI extraction routes MUST follow the `/api/ai/extract/:provider` pattern in `server/routes/ai/`.
5. The use of `as unknown as` is a code smell — prefer explicit typing and safe fallbacks.
6. Market conclusions gated by `BenchmarkConfidence`.
7. Extraction schema changes go in `shared/extraction-schema.ts` ONLY.
8. Turkish regex patterns must handle Turkish İ (U+0130) via `[iİ]`.
9. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`.
10. `isIncluded()` treats `undefined` as included (industry standard).
11. Grade recalibrations require n ≥ 50 sample size.
12. When adding a coverage-item schema property, update THREE places: `properties`, `required[]`, AND the count-assertion tests (see gotcha #47 / #95).
13. When adding a value-label alias to `VEHICLE_FIELD_ALIASES`, remember that `matchLabeledField()` requires a KV separator (`:`, tab, 2+ spaces) — single-space is now also accepted in the AXA tabular fallback path (gotcha #89, extended).
14. NEVER wrap structural translation keys (`t.global.unlimited`, `t.policy.noUpperLimit`) in `applySafeWording()` — destroys the signal (gotcha #90).
15. Before claiming any extraction-quality fix complete, run `npm run qa:extraction` and confirm the relevant check's pass rate moved (gotcha #102).
16. Any code path that writes free-form text into a JSONB column MUST apply `sanitizeForJsonb`-style C0+surrogate stripping first (gotcha #106).
17. Any new ingest path that lands rows in `policies` MUST preserve `raw_data.extractedText` and populate `raw_data.vehicleInfo` for kasko/traffic types (gotcha #105).
18. Do not use useless regex escapes (`\/`, `\.`) in regex strings or character classes. They trigger ESLint `no-useless-escape` and will fail the pre-commit hook (gotcha #108).
19. Unused imports or variables will trigger the Husky pre-commit hook, stashing your commit. Fix the linting issue and re-commit rather than using `--no-verify` (gotcha #109).
