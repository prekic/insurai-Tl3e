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
| **Branch** | `gemini20260228` |
| **Production Status** | Nixpacks + healthcheck config deployed; actuarial engine UI integrations implemented (adapter, ComparePolicies, PolicyDetailView) |

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

**Integrated** into the production pipeline — built adapter `mapAnalyzedToActuarialInput` from `AnalyzedPolicy` → `ActuarialPolicyInput` and added UI displays.
- **ComparePolicies.tsx**: Shows TOPSIS Closeness Score and Grade.
- **PolicyDetailView.tsx**: Shows Expected Out-of-Pocket (EOOP) details and Contract Quality bounds.
- **`src/lib/policy-evaluation/types.ts`**: Added `actuarialRank`, `actuarialCloseness`, `actuarialGrade` fields to `PolicyComparison` type.
- **`src/lib/policy-evaluation/comparator.ts`**: Lint auto-format (arrow function parentheses) + TOPSIS score integration into comparison results.

### 1b. Actuarial Engine Admin Configuration UI
- Added Admin Dashboard tab "Actuarial Engine" (`ActuarialTab.tsx`) for managing engine parameters.
- Backend API (`server/routes/admin/actuarial.ts`): `GET /api/admin/actuarial/configs` and `POST /api/admin/actuarial/configs/:name/version`.
- Supports editing Monte Carlo simulation params, TOPSIS criteria weights, Kasko risk scenarios, and compliance rules via JSON editor with versioning.

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

### Gotcha: Actuarial Engine Integration
- Engine uses its own type system (`CanonicalCoverage` codes, `EvidencePointer`, `IndemnityMechanics`) — `src/lib/actuarial-engine/adapter.ts` converts from `Policy`/`Coverage`.
- Always import from `@/lib/actuarial-engine` barrel, never from individual layer files.
- **Trial Restriction**: The actuarial engine's UI (TOPSIS ranking, EOOP calculation, Contract Quality metrics) is explicitly hidden from anonymous/free trial users via a check on `isTrialResult` in the component level (`PolicyDetailView.tsx` and protected routes).

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

### P2 — Actuarial Engine Production Enablement
1. **Database**: Apply `028_actuarial_engine_schema.sql` to production Supabase when ready to enable the engine (idempotent, safe to run)
2. **Feature Flag**: Flip `actuarial_engine_enabled` to `true` after migration is applied
3. **Admin UI** ✅ (completed this session): Config panel at Admin Dashboard → "Actuarial Engine" tab for scenario frequencies, TOPSIS weights, Monte Carlo params


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
| **Feb 28 (Current)** | **Actuarial engine (4-layer), admin config UI, deployment hardening, output eval tests (162), free-trial restriction** | **`gemini20260228`** |
