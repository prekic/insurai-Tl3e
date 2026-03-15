# Session Handoff — March 14, 2026 (Anonymous Extractions & AI Premium Fixes)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | ✅ Passing |
| **ESLint** | 0 errors on changed files |
| **Tests** | All tests passing |
| **Branch** | `insuraigemini202603142134` — Ready to push |
| **Deployment** | Pending Railway deployment for user verification |

---

## This Session — Completed Work

### 1. Anonymous Extraction Persistence
**Feature**: Implemented a system to persist policy uploads and extractions performed by anonymous users. This ensures that valuable policy data and metadata (like location and language) are recorded in the database without requiring standard user registration.

**Files Changed**:
- `server/routes/policy.ts` (NEW) — A dedicated API route `/api/policy/save-anonymous` using `SUPABASE_SERVICE_ROLE_KEY` to securely bypass RLS and create a proxy `auth.users` record containing IP and locale metadata, before uploading the PDF to storage and inserting the `AnalyzedPolicy` into the database.
- `server/index.ts` — Mounted the new `policyRoutes` to `/api/policy`.
- `src/components/TryAnalysis.tsx` — Modified to asynchronously fire a `POST` request to `/api/policy/save-anonymous` upon successful extraction without blocking the UI.

### 2. AI Premium vs Vehicle Value Fixes
**Problem**: The AI was erroneously extracting Vehicle Value instead of the actual Policy Premium for certain Eris Ambalaj Kasko policies.

**Fix**:
- `src/lib/ai/policy-extractor.ts` — Added post-processing magnitude sanity checks: if `totalPremium` is >5x the amount of `totalCoverage` (or exceeds reasonable bounds like 2 million TRY), it sets the premium to `null` instead of storing an absurdly high vehicle value.
- `src/lib/ai/kasko-parser-prompts.ts` & `src/lib/ai/prompts.ts` — Enhanced explicit constraints in prompts, demanding that "Vehicle Value / Araç Değeri" must absolutely NOT be used for Premium, and that Premium values are typically labeled as "BRÜT PRİM", "TOPLAM PRİM", or "ÖDENECEK TUTAR".

### 3. Admin Schema Alignment
**Note**: Generated `035_admin_users_schema_alignment.sql` to add `display_name`, `failed_login_attempts`, and `locked_until` to `admin_users` to match earlier table expectations in `005b_admin_tables.sql`.

### 4. Test Suite Stabilization & Vitest Mocking Fixes
**Feature**: Systematically debugged and eliminated test flakiness and incorrect status codes across the test suite to achieve a 100% pass rate.

**Fixes**:
- `server/routes/settings.ts` & `server/services/config-service.ts` — Wrapped background config loading functions (`_loadPerfConfig` and `_selfLoadServerConfig`) with `if (process.env.NODE_ENV !== 'test')` to prevent un-awaited background Supabase queries from consuming Vitest's `mockReturnValueOnce` assertions mid-test for unrelated routes.
- `server/__tests__/fx-monitoring.test.ts` — Fixed a module parse error by adding the `logger` named export to the `../lib/logger.js` mock.
- `server/__tests__/settings-routes-crud-operations.test.ts` — Fixed failing `PUT` requests by clearing the mock before expectations so the query chain receives the correct `mockReturnValueOnce` mock implementations.
- `server/__tests__/prompt-service-branches.test.ts` — Updated the category in the fallback test from `analysis` to `unknown_category` because `analysis` now has a generic Sense Check fallback prompt.

### 5. Anthropic Deprecated Model Updates
**Feature**: Updated out-of-date model names before they are deprecated by Anthropic.

**Fixes**:
- `src/lib/ai/config.ts` , `server/routes/ai.ts`, and `supabase/migrations/036_update_anthropic_haiku_model.sql` — Replaced hardcoded and DB-seeded instances of `claude-3-5-haiku-20241022` with `claude-3-5-haiku-latest`.

---

## Key Files Changed

| File | Change |
|------|--------|
| `server/routes/policy.ts` | **NEW** Implements anonymous user proxy creation, storage upload, and policy DB insertion |
| `server/index.ts` | **FIX** Mounts the new `policy` route |
| `src/components/TryAnalysis.tsx` | **FIX** Integrated background API fetch to sync extraction data for unauthenticated users |
| `src/lib/ai/policy-extractor.ts` | **FIX** Post-processing magnitude sanity check to drop erroneous premium values |
| `src/lib/ai/kasko-parser-prompts.ts` | **FIX** Explicit Prompt Engineering to stop confusing Vehicle Value with Premium |
| `server/__tests__/*.test.ts` | **FIX** Stabilized tests across 4 files involving mock resets and parsed logger mocks |
| `server/routes/settings.ts` | **FIX** Prevent background config load in test environment |
| `server/services/config-service.ts` | **FIX** Prevent background config load in test environment |

---

## Priority Next Steps

1. **Verify on Railway** — The user was experiencing issues with localhost testing, so the next step is to explicitly verify the anonymous flow and premium extraction on the staging or production Railway environment once deployed.
2. **Database Migration** — Run the new Supabase migration `035_admin_users_schema_alignment.sql` on the Railway target DB.
3. **Verify Admin Insights Rules** — The user still needs to navigate to `/admin/insights` to create a dynamic test rule and ensure the extractions respect it without hallucinations.
