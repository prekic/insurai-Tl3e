# Session Handoff — March 3, 2026 (Locale-Aware Formatting — P0+P1 Complete)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | Passing (Railway deployment stable) |
| **TypeCheck** | 0 errors (frontend + server) |
| **ESLint Errors** | 0 errors |
| **ESLint Warnings** | 0 warnings |
| **Tests** | 15,897 tests total: 15,869 passing, 28 failing (pre-existing), 18 skipped across 337 files |
| **Coverage** | ~91.67% statements, ~85.91% branches |
| **Lighthouse** | Performance 99, Accessibility 100, Best Practices 93, SEO 100 |
| **Branch** | `claude/load-project-context-FT0Gj` |
| **Production Status** | Stable. No deployment needed for this session's changes (formatting is backward-compatible). |

---

## Session Summary

### This Session — Locale-Aware Formatting (March 3, 2026)

Implemented **P0 + P1** of the i18n plan, making all formatting functions locale-aware and updating all caller files.

**Commits (5 total, all on `claude/load-project-context-FT0Gj`):**

| Commit | Description |
|--------|-------------|
| `c8f731e` | Documentation: comprehensive i18n plan audit and session handoff (start of session) |
| `ab5ba59` | **P0**: Fix 27 Turkish assertions → English in `PolicyDetailView-branches.test.tsx` (re-applied lost fixes from prior session) |
| `4c42c57` | **P1 Step 1**: Make `formatCurrency`/`formatCurrencyCompact`/`formatDate`/`formatNumber` locale-aware in `src/lib/utils.ts` — added `INTL_LOCALE_MAP`, `getIntlLocale()` helper, optional `locale` parameter (defaults to `'tr'`) |
| `93a9d0e` | **P1 Step 2**: Update ~10 caller files to pass `locale` from `useI18n()` — 7 components + `export.ts` (7 functions) + `pdf-export/templates.ts` (4 templates + `fieldHTML` helper) |
| `cbc3aeb` | Documentation: update CLAUDE.md and SESSION_HANDOFF.md for P0+P1 handoff |

**Source Files Changed (11 files in this session's commits + 2 docs):**
- `src/lib/utils.ts` — Core formatting functions with `INTL_LOCALE_MAP`
- `src/components/PolicyCard.tsx` — 3 formatting calls
- `src/components/PolicyDashboard.tsx` — 6 formatting calls
- `src/components/PolicyDetailView.tsx` — ~20 formatting calls
- `src/components/PolicyDiffViewer.tsx` — 2 formatting calls
- `src/components/ComparePolicies.tsx` — 3 calls + added `useI18n()` to `QuickStatsCard` sub-component
- `src/components/SharedResult.tsx` — 8 calls (replaced hardcoded `toLocaleString('tr-TR')`)
- `src/components/AllSamplesDemo.tsx` — 5 formatting calls
- `src/lib/export.ts` — ~30 calls across 7 export functions, all accept `locale` param
- `src/lib/pdf-export/templates.ts` — ~25 calls across 4 template functions + `fieldHTML` helper
- `src/components/PolicyDetailView-branches.test.tsx` — 27 assertion fixes
- `CLAUDE.md` — Updated utility docs, Known Issue #149, gotchas
- `SESSION_HANDOFF.md` — Full rewrite with session status

**Note:** `git diff origin/main...HEAD` shows 17 files because 4 additional files (`.dockerignore`, `nixpacks.toml`, `package.json`, `package-lock.json`) were changed by prior commits on this branch (`eaea3d1`, `951db91`) before this session started.

---

## i18n Plan Execution Status

### Plan Location
`/root/.claude/plans/warm-tickling-wilkes.md` — 10-step plan covering S1/S2/S3 i18n + FX conversion

### Step-by-Step Status

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| **1** | Make `formatCurrency`/`formatDate`/`formatNumber` locale-aware | **DONE** | Commit `4c42c57` — `INTL_LOCALE_MAP`, `getIntlLocale()`, all 4 functions updated. Commit `93a9d0e` — all ~10 caller files updated. |
| **2** | FX Conversion System | **NOT DONE** | `src/lib/fx/` does not exist. No `server/routes/fx.ts`. No `useDisplayCurrency` hook. |
| **3a** | S1: `NotFound.tsx` i18n | **PARTIAL** | Has `useI18n()` but 4 strings still hardcoded English. No `notFound` translation section. |
| **3b** | S1: `ErrorBoundary.tsx` i18n | **NOT DONE** | Class component, no hooks. 8+ hardcoded strings. Needs wrapper pattern. |
| **3c** | S1: `PolicyDocuments.tsx` i18n | **NOT DONE** | No hooks. 13+ hardcoded strings. |
| **3d** | S1: `AIInsightsPanel.tsx` i18n | **NOT DONE** | Uses `locale` prop with 32 ternaries. Needs `useTranslation()` + ~50 keys. |
| **4a** | S2: `ConflictResolutionDialog.tsx` | **NOT DONE** | Has `useI18n()` but 47 ternaries remain. No `conflictResolution` section. |
| **4b** | S2: `PolicyDiffViewer.tsx` | **NOT DONE** | Has `useI18n()` but 18 ternaries remain. No `policyDiff` section. |
| **4c** | S2: `PolicyCard.tsx` | **NOT DONE** | Has `useI18n()` but 5 ternaries remain. |
| **4d** | S2: `EmailPreferences.tsx` | **NOT DONE** | Has `useI18n()` but uses `isTurkish` config pattern. No `emailPreferences` section. |
| **5** | Add ~163 translation keys | **NOT DONE** | Sections `conflictResolution`, `policyDiff`, `policyDocuments`, `errorBoundary`, `aiInsights` (full), `emailPreferences`, `fx` all missing. |
| **6** | Server-side FX proxy | **NOT DONE** | No `server/routes/fx.ts`. |
| **7-10** | FX wiring, hook, currency switcher, user preferences | **NOT DONE** | No files created. |

### Ternary Count Summary (103 total remaining)

| Component | `locale === 'tr'` Count | Has i18n Hook |
|-----------|------------------------|---------------|
| ConflictResolutionDialog.tsx | 47 | Yes (useI18n) |
| AIInsightsPanel.tsx | 32 | No (locale prop) |
| PolicyDiffViewer.tsx | 18 | Yes (useI18n) |
| PolicyCard.tsx | 5 | Yes (useI18n) |
| EmailPreferences.tsx | 1 | Yes (useI18n) |
| **PolicyDetailView.tsx** | **124** | Yes (useI18n) — **not in plan scope but largest ternary count** |

---

## Test Failure Analysis (28 failures across 6 files — all pre-existing)

### Category 1: Translation Cache/Service (7 failures — pre-existing)

**`src/lib/i18n/translation-service.test.ts`** — 5 failures
- Tests expect cache-first behavior but implementation merges with preloaded translations
- Assertions like "should return cached translations when cached version matches API version" fail because the service now deep-merges cached + preloaded

**`src/lib/i18n/translation-cache.test.ts`** — 2 failures
- `getCachedTranslations` returns `null` instead of expected cache hit
- `setCachedTranslations` writes 3 localStorage entries instead of expected 2

### Category 2: Component Test Regressions (5 failures — pre-existing)

**`src/components/PolicyUpload-coverage.test.tsx`** — 4-5 failures
- Tests for AI extraction source display, confidence warnings, and navigation timing
- Likely broken by recent `isMounted` ref changes or async timing updates

### Category 3: Server Test Regressions (16 failures — pre-existing)

**`server/__tests__/routes-branches.test.ts`** — 6 failures
**`server/__tests__/ai-routes-extended.test.ts`** — 10 failures
- Server route tests — likely broken by recent actuarial engine or extraction metrics changes

### Category 4: Environment (1 failure — network)

**`src/__tests__/integration/dependencies.test.ts`** — 1 failure
- `should have accessible PDF.js worker URL` — 10s timeout fetching CDN URL
- Network-dependent test; not a code issue

---

## Known Issues & Gotchas

### Gotcha: Locale-Aware Formatting — Always Pass `locale`
When adding new `formatCurrency` or `formatDate` calls, **always** pass the `locale` parameter:
- In React components: `const { locale } = useI18n(); formatCurrency(amount, 'TRY', locale)`
- In non-React files: Accept `locale: string = 'tr'` as function parameter
- In pdf-export templates: Derive from `options.language`: `const locale = isTr ? 'tr' : 'en'`
- Bare `formatCurrency(amount)` still works (defaults to `'tr'`) but defeats the purpose of locale-awareness

### Gotcha: `formatCurrencyCompact` Silently Ignores `locale`
`formatCurrencyCompact(amount, currency, _locale?)` accepts a locale parameter (for API consistency) but **does not use it**. It uses a hardcoded `CURRENCY_SYMBOLS` lookup to produce compact output like `₺980M` or `$5.2K`. The underscore prefix (`_locale`) suppresses ESLint/TS unused variable warnings. If locale-aware compact formatting is needed in the future, this function must be updated.

### Gotcha: QuickStatsCard in ComparePolicies.tsx
`QuickStatsCard` is a sub-component that receives `t` as a prop but needed its own `useI18n()` call for `locale`. This was added in commit `93a9d0e`. If adding new sub-components that need formatting, remember to either pass locale as a prop or call `useI18n()` directly.

### Gotcha: export.ts and templates.ts Are Non-React
These files cannot use hooks. The pattern is to accept `locale` as a function parameter with default `'tr'`. Template functions derive locale from `options.language` which is already available.

### Gotcha: Shadcn NPM Cache Pollution
The shadcn UI command installation (`npx shadcn@latest add ...`) can fail due to `ERR_MODULE_NOT_FOUND` via npm cache pollution. Fix: `npm cache clean --force` or manual component file creation.

### Gotcha: Admin API Endpoint Native Fetching Bug
Components under `/admin/*` must ALWAYS use `adminFetch` from `@/lib/admin/api`. Standard `fetch` calls fail with random 401 errors.

### Gotcha: Nixpacks Caddy Auto-Detection on Railway
Railway's Nixpacks builder auto-detects `index.html` in `dist/` and provisions Caddy. Fix: `providers = ["node"]` in `nixpacks.toml`.

### Gotcha: Nixpacks Vite Cache Poisoning
Nixpacks mounts `node_modules/.cache` persistently across builds. Stale Rollup caches can cause false-positive errors. Fix: prepend `rm -rf node_modules/.cache node_modules/.vite` to build scripts.

### Gotcha: Unhandled Rejections in React 19 / Vitest Teardown
Async state updates can outlive JSDOM teardown. Fix: `isMounted` ref pattern in components with async loops.

---

## Priority Next Steps

### P2 — Implement i18n Plan Steps 3-5: S1 Components + Translation Keys — ~3 hours
1. Add ~163 translation keys to `translations-en.ts`, `translations-tr.ts`, `translations-skeleton.ts`, `translations.ts` (interface)
2. Migrate `NotFound.tsx` (finish 4 remaining strings)
3. Migrate `ErrorBoundary.tsx` (wrapper function component pattern)
4. Migrate `PolicyDocuments.tsx` (add `useTranslation()`)
5. Migrate `AIInsightsPanel.tsx` (largest — 32 ternaries → translation keys)

### P3 — Implement i18n Plan Step 4: S2 Components — ~2 hours
Replace inline ternaries with translation keys in:
- `ConflictResolutionDialog.tsx` (47 ternaries)
- `PolicyDiffViewer.tsx` (18 ternaries)
- `PolicyCard.tsx` (5 ternaries)
- `EmailPreferences.tsx` (~10 `isTurkish` uses)

### P4 — Fix Pre-Existing Test Failures (28 failures) — ~2 hours
- Translation cache/service tests (7): Update assertions to match current merge behavior
- PolicyUpload-coverage tests (4-5): Fix async timing assertions
- Server route tests (16): Update mocks for recent actuarial/metrics changes

### P5 — Implement FX Conversion System (Steps 2, 6-10) — ~4 hours
Full multi-currency conversion: `fx-service.ts`, server proxy, `useDisplayCurrency` hook, currency switcher UI, user preference wiring.

---

## Environment Requirements

| Variable | Required For | Notes |
|----------|-------------|-------|
| `SUPABASE_URL` | Admin panel, DB operations | Server-side only |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin panel | Server-side only |
| `ADMIN_JWT_SECRET` | Admin login | Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `OPENAI_API_KEY` | AI extraction | Server-side only |
| `ANTHROPIC_API_KEY` | AI extraction | Server-side only |
| `GOOGLE_CLOUD_API_KEY` | Vision OCR | Must have Cloud Vision API + Document AI API enabled |
| `GCP_SERVICE_ACCOUNT_BASE64` | Document AI OCR | Base64-encoded service account JSON |
| `VAPID_PUBLIC_KEY` | Push notifications | Generate with `web-push` package |
| `VAPID_PRIVATE_KEY` | Push notifications | Keep secret |
| `VAPID_SUBJECT` | Push notifications | `mailto:` address |
| `VITE_SUPABASE_URL` | Frontend Supabase | Build-time only |
| `VITE_SUPABASE_ANON_KEY` | Frontend Supabase | Build-time only |
| `VITE_GA_MEASUREMENT_ID` | GA4 analytics | Optional |

---

## Session Context Chain

| Session | Key Deliverables | Branch |
|---------|-----------------|--------|
| Feb 28 mid | P3 observability: LayerTimings, evidence coverage dashboard | `claude/load-project-context-uRxsB` |
| Feb 28 late | P1/P2/P3/P5: Event bus wiring, persistence service, feature flag API | `gemini202602281715` |
| Mar 1 early | Phase 7: Production deployment (Migration 028 + Feature Flag) | `gemini202603010814` |
| Mar 1 late | Phase 8: Web Worker + Health/Life/Business policy support | `gemini20260301` |
| Mar 1 end | Phase 9: Actuarial DB trackers & admin performance dashboards | `gemini202603011952` |
| Mar 2 | Phase 10: Flaky test cleanup, Vitest memory leak fixes | `gemini202604020525` |
| Mar 2 | Phase 11: Fix pdfSuccess crash and node crypto build failure | `gemini202603021907` |
| Mar 3 | Phase 12: Fix UI flashing and mixed localizations in PolicyDetailView | `gemini20260303_fixes` |
| Mar 3 | i18n Plan Audit — documented plan is ~5% executed, 56 test failures categorized | `claude/load-project-context-FT0Gj` |
| **Mar 3** | **P0 (test fixes) + P1 (locale-aware formatting functions + 10 caller files updated) — plan now ~20%** | **`claude/load-project-context-FT0Gj`** |
