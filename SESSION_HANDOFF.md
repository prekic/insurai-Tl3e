# Session Handoff — February 28, 2026 (Actuarial Engine, Deployment Hardening, Output Evaluation Tests)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | Passing |
| **TypeCheck** | 0 errors |
| **ESLint Errors** | 0 errors |
| **ESLint Warnings** | 0 warnings |
| **Tests** | 15,753 passing (329 files, 0 failures) |
| **Coverage** | ~91.67% statements, ~85.91% branches |
| **Lighthouse** | Performance 99, Accessibility 100, Best Practices 93, SEO 100 |
| **Branch** | `claude/load-project-context-yjssq` |
| **Production Status** | Nixpacks + healthcheck config deployed; actuarial engine NOT yet activated (feature flag off) |

---

## Session Summary

### 1. Modular Actuarial Engine (`dc6beae`)
New 4-layer actuarial evaluation engine at `src/lib/actuarial-engine/` (4,916 lines, 17 files):

- **Layer A** — Semantic exclusion analysis + evidence pointer validation
- **Layer B** — Compliance gates (SEDDK 2025/2026 traffic limits, DASK 2% deductible, "Tam Kasko" product name validation)
- **Layer C** — Monte Carlo EOOP simulation (10,000 iterations, lognormal/Pareto loss models, deterministic Mulberry32 PRNG)
- **Layer D** — TOPSIS MCDA ranking + weight sensitivity analysis + XAI natural-language summaries

Key functions: `runFullEvaluation(policy)` for single policy, `evaluateAndRankPolicies([...])` for multi-policy comparison.

Database: Migration `028_actuarial_engine_schema.sql` creates 5 tables. Feature flag `actuarial_engine_enabled` = false.

**Not yet integrated** into the production pipeline — requires adapter from `AnalyzedPolicy` → `ActuarialPolicyInput`.

### 2. Railway Deployment Hardening (`1f34759`, `acc190f`)
- Created `nixpacks.toml` with `providers = ["node"]` to disable Caddy/Chromium auto-detection that caused port conflicts
- Fixed invalid Nix package names (`nodejs_22` → extend-defaults `"..."`)
- Added `healthcheckPath: "/api/health"` + `healthcheckTimeout: 60` to `railway.json`
- Fixed `content.ts` CSV export column alignment (server-side field names) and `monitoring.ts` import errors

### 3. Output Evaluation Tests (`c19118c`)
162 new tests across 3 files validating AI extraction and policy evaluation output quality:
- `evaluation-scoring-sample-data.test.ts` (63 tests) — Coverage scoring, grade thresholds, recommendations
- `extraction-output-quality.test.ts` (38 tests) — Extraction field validation, completeness, format
- `sample-policy-output-evaluation.test.ts` (61 tests) — End-to-end evaluation of all 5 sample policy types

---

## Known Issues

### Pre-Existing (unchanged)
- **Flaky `window is not defined`**: React 19 + Vitest concurrency race in `PolicyUpload.test.tsx` — passes individually, harmless in parallel
- **Service worker cache**: After deploying, users may need hard refresh. Current `CACHE_VERSION = v20`

### Gotcha: Supabase DB Push & Manual Migrations
- `npx supabase db push` requires `npx supabase link` first. Fallback: apply SQL via `psql $SUPABASE_URL -f supabase/migrations/xxx.sql` or Supabase Dashboard SQL Editor.

### Gotcha: BenchmarksTab Multiple DOM Elements in Tests
- `getByText(/4\.?500/)` matches both table data and informational text. Use `getAllByText(...)[0]`.

### Gotcha: Alert Service Test Mocks
- Any test importing `server/routes/ai.ts` must mock `server/services/extraction-alert-service.js` and `server/services/config-service.js`.

### Gotcha: Nixpacks Auto-Detection
- Without `nixpacks.toml`, Railway provisions Caddy and Chromium automatically. Always keep `providers = ["node"]`.
- `nixpacks.toml` and `railway.json` must stay in sync on install/build/start commands.

### Gotcha: Actuarial Engine Not Wired
- `actuarial_engine_enabled` flag exists but flipping it to `true` has no effect until the adapter layer is built.
- Engine uses its own type system (`CanonicalCoverage` codes, `EvidencePointer`, `IndemnityMechanics`) — not directly compatible with `Coverage`/`AnalyzedPolicy`.
- Always import from `@/lib/actuarial-engine` barrel, never from individual layer files.

---

## Configuration Requirements

### No New Environment Variables
No new env vars needed. Migration 028 creates tables and seeds a feature flag but does not require runtime configuration changes.

### Migration 028 (Not Yet Applied)
`supabase/migrations/028_actuarial_engine_schema.sql` creates 5 tables + feature flag seed. Apply to production **only when ready to enable the actuarial engine**. Idempotent (`CREATE TABLE IF NOT EXISTS`).

---

## Priority Next Steps

### P1 — Deploy & Monitor
1. Verify Railway deployment with new `nixpacks.toml` and healthcheck configuration
2. Confirm healthcheck endpoint `/api/health` responds correctly for Railway's liveness probe
3. Monitor build logs for any Caddy/Chromium auto-detection regressions

### P2 — Actuarial Engine Integration
1. **Adapter layer**: Build `AnalyzedPolicy` → `ActuarialPolicyInput` converter that maps:
   - `Coverage[]` → `CanonicalCoverage[]` (using coverage code standardization)
   - `exclusions: string[]` → semantic exclusion analysis input
   - `startDate`/`expiryDate` → `effectiveDate`/`expiryDate` (Date objects)
   - `raw_data.indemnity` → `IndemnityMechanics` (parts standard, repair network, rayiç method)
2. **Apply migration 028** to production Supabase
3. **Admin UI**: Add actuarial config management panel (scenario frequencies, TOPSIS weights, Monte Carlo params)
4. **Compare page**: Integrate TOPSIS ranking into `ComparePolicies.tsx` (display closeness scores, sensitivity analysis)
5. **Policy detail**: Show EOOP breakdown and compliance gate results in `PolicyDetailView.tsx`

### P3 — Quality & Observability
1. Add actuarial engine metrics to extraction health monitoring
2. Build evidence coverage dashboard for admin panel
3. Expand golden regression tests for health/life/business policy types (currently only kasko/traffic/dask/zas)

---

## Session Context Chain

| Session | Key Deliverables | Branch |
|---------|-----------------|--------|
| Feb 25 early | Export dropdown, onboarding, extraction observability, admin mobile | `claude/complete-handoff-docs-Goirm` |
| Feb 25 late | Extraction health dashboard, Excel export, comparison enhancements, DB metrics | `claude/load-project-context-3VUJ2` |
| Feb 26 early | Extraction health hourly chart, processing log cleanup, ExtractionHealthTab tests | `claude/load-project-context-e6OeC` |
| Feb 26 late | Extraction health alerting, configurable retention, Benchmark UI builds | `claude/load-project-context-6D3KI` |
| Feb 26 | Production Extraction Health Verification, App_Settings Debugging, E2E Rollout | `gemini20260226` |
| Feb 26 | Historical Trend Charts, CSV Export, Cron Job Monitoring | `feat/admin-monitoring-extras` |
| Feb 27 | Alert email wiring, configurable checkIntervalMs + minRequests, migration 027 | `claude/load-project-context-yjssq` |
| **Feb 28 (Current)** | **Actuarial engine (4-layer), deployment hardening (nixpacks), output eval tests (162)** | **`claude/load-project-context-yjssq`** |
