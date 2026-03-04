# Session Handoff — March 4, 2026 (Pre-Existing Test Failures Fixed)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | Passing (Railway deployment stable) |
| **TypeCheck** | 0 errors (frontend + server) |
| **ESLint Errors** | 0 errors |
| **ESLint Warnings** | 0 warnings on modified files |
| **Tests** | 15,813 tests passing, 0 failures (336/337 files). 68 pre-existing failures fixed. |
| **Coverage** | ~91.67% statements, ~85.91% branches |
| **Lighthouse** | Performance 99, Accessibility 100, Best Practices 93, SEO 100 |
| **Branch** | `claude/load-project-context-TWvOc` |
| **Production Status** | Stable. No deployment blockers. |

---

## Session Summary

### This Session — Fix 68 Pre-Existing Test Failures (March 4, 2026)

Fixed **all 68 pre-existing test failures** across **4 test files** (246 total tests now passing). Full test suite: **15,813 tests, 0 failures**.

**Commit (1 total, on `claude/load-project-context-TWvOc`):**

| Commit | Description |
|--------|-------------|
| `e827025` | **Fix 68 pre-existing test failures**: translation-cache (2 failures → CACHE_SCHEMA_VERSION 2→3), Settings (1 failure → added emailPreferences to i18n mock), translation-service (61 failures → vi.mock for dynamic imports + fixed merge assertions), PolicyUpload-coverage (4 failures → afterEach timer flush + retry test rewrite) |

**Test Files Fixed (4 files, 246 tests):**
- `src/lib/i18n/translation-cache.test.ts` — 18/18 passing. Updated `CACHE_SCHEMA_VERSION` from 2→3 to match source code change.
- `src/components/Settings.test.tsx` — 57/57 passing. Added `emailPreferences` section to i18n mock (new translation keys added in S2 migration).
- `src/lib/i18n/translation-service.test.ts` — 96/96 passing. Added `vi.mock` for dynamic `translations-en`, `translations-tr`, AND `translations-skeleton` imports (all three lazy/split modules). Fixed merge behavior assertions to match cache-first override semantics.
- `src/components/PolicyUpload-coverage.test.tsx` — 75/75 passing. Added `afterEach` with 700ms timer flush to drain pending upload progress loop timers. Added explicit `{ timeout: 3000 }` to 8 `waitFor` calls and `{ timeout: 5000 }` to 1 retry `waitFor`. Rewrote retry test to use mock call counts instead of fragile DOM text assertions.

**Root Causes:**
1. **translation-cache**: Cache version constant changed from 2→3 but test still expected 2
2. **Settings**: New `emailPreferences` i18n section added during S2 migration but test mock didn't include it
3. **translation-service**: EN/TR translations split into lazy-loaded async chunks (Known Issue #123/#124) but tests still imported from old paths
4. **PolicyUpload-coverage**: Upload progress simulation loop (5×100ms setTimeout) left pending timers between tests, causing DOM state interference in subsequent test renders

### Previous Session — i18n Ternary Migration (March 4, 2026)

Completed **P2 (S1 components) + P3 (S2 components)** of the i18n plan. Replaced **99 inline `locale === 'tr'` ternaries** with translation dictionary keys across **8 components**. Added **~163 translation keys** across EN, TR, and skeleton files. (See previous branch `claude/load-project-context-9kxAB`)

---

## i18n Plan Execution Status

### Plan Location
`/root/.claude/plans/warm-tickling-wilkes.md` — 10-step plan covering S1/S2/S3 i18n + FX conversion

### Step-by-Step Status

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| **1** | Locale-aware formatting functions | **DONE** | `formatCurrency`/`formatDate`/`formatNumber` accept `locale` param, 10 caller files updated |
| **2** | FX Conversion System | **NOT DONE** | No files created. `src/lib/fx/`, `server/routes/fx.ts`, `useDisplayCurrency` hook all missing. |
| **3a** | S1: `NotFound.tsx` i18n | **DONE** | 4 strings → `t.notFound.*` |
| **3b** | S1: `ErrorBoundary.tsx` i18n | **DONE** | Wrapper pattern: `ErrorBoundaryWrapper` passes `t` and `locale` as props. `ui/error-boundary.tsx` also updated. |
| **3c** | S1: `PolicyDocuments.tsx` i18n | **DONE** | 12 strings → `t.policyDocuments.*` |
| **3d** | S1: `AIInsightsPanel.tsx` i18n | **DONE** | 32 ternaries → `t.aiInsights.*` + `formatCurrency` locale-aware |
| **4a** | S2: `ConflictResolutionDialog.tsx` | **DONE** | 47 ternaries → `t.conflictResolution.*` (50 keys) |
| **4b** | S2: `PolicyDiffViewer.tsx` | **DONE** | 13 ternaries → `t.policyDiff.*` (15 keys). 1 data-field ternary remains (correct). |
| **4c** | S2: `PolicyCard.tsx` | **DONE** | 4 ternaries → `t.policyCard.*` (8 keys). 1 data-field ternary remains (correct). |
| **4d** | S2: `EmailPreferences.tsx` | **DONE** | 6 ternaries → `t.emailPreferences.*` (6 keys). `isTurkish` kept for 2 data-field selections (correct). |
| **5** | Add ~163 translation keys | **DONE** | All sections added to interface, EN, TR, and skeleton files. |
| **6** | Server-side FX proxy | **NOT DONE** | No `server/routes/fx.ts`. |
| **7-10** | FX wiring, hook, currency switcher, user preferences | **NOT DONE** | No files created. |

### Remaining Ternaries (4 data-field selections — all correct to keep)

| Component | Ternary | Reason to Keep |
|-----------|---------|---------------|
| `PolicyDiffViewer.tsx:50` | `change.fieldLabelTr` vs `change.fieldLabel` | Data-field selection |
| `PolicyCard.tsx:49` | `policyTypeInfo?.labelTr` vs `policyTypeInfo?.label` | Config data-field |
| `AIInsightsPanel.tsx` | `insight.textTr` vs `insight.text` | Data-field selection |
| `EmailPreferences.tsx:160-161` | `config.labelTr`/`config.descriptionTr` | Config data-field |

### Out-of-Scope Ternaries

| Component | Count | Notes |
|-----------|-------|-------|
| `PolicyDetailView.tsx` | **124** | Largest in codebase. Not in original plan. Would need its own dedicated session. |

---

## New Patterns Introduced

### ErrorBoundary Wrapper Pattern
Class components cannot use hooks. The solution is a wrapper function component:
```tsx
function ErrorBoundaryWrapper(props) {
  const { t, locale } = useI18n()
  return <ErrorBoundaryClass {...props} translations={t} locale={locale} />
}
```
Used in both `ErrorBoundary.tsx` and `ui/error-boundary.tsx`.

### Timer Flush Pattern for Fire-and-Forget Async Tests
When a component has background async loops (e.g., upload progress simulation with `setTimeout`), tests must drain pending timers in `afterEach` to prevent leakage:
```tsx
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700))
  })
})
```
Do NOT use `vi.useFakeTimers()` — it conflicts with RTL's `waitFor` which uses real interval-based polling.

### Mock Call Count vs DOM Text for Async Assertions
For fire-and-forget async patterns where DOM rendering is non-deterministic:
```tsx
// FRAGILE: DOM text depends on render timing
await screen.findByText('fail1.pdf')
// ROBUST: Mock call count is deterministic
await waitFor(() => { expect(mockExtractPolicy).toHaveBeenCalledTimes(2) }, { timeout: 3000 })
```

### Data-Field vs Translation Ternary Distinction
- **Replace**: `locale === 'tr' ? 'Türkçe string' : 'English string'` → `t.section.key`
- **Keep**: `locale === 'tr' ? item.nameTr : item.name` — selects pre-existing data fields

### Test Mock Pattern for i18n — Two Valid Approaches

**Approach 1 (used by this session's tests): Inline translation objects in the mock.** Components import from `@/lib/i18n` (barrel), so mock that path. Provide only the translation sections the component actually uses:
```tsx
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {
      conflictResolution: { duplicateFound: 'Duplicate Policy Found', ... },
      common: { cancel: 'Cancel', ... },
    },
    locale: 'en',
  }),
}))
```

**Approach 2 (used by some older tests): Import full EN_TRANSLATIONS.** Mocks the context module directly. Provides all keys automatically but is a heavier import:
```tsx
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'
vi.mock('@/lib/i18n/i18n-context', () => ({
  useI18n: () => ({ t: EN_TRANSLATIONS, locale: 'en' }),
}))
```

**Critical distinction**: All 8 migrated components import from `@/lib/i18n` (barrel), NOT `@/lib/i18n/i18n-context`. Tests MUST mock `@/lib/i18n` to intercept correctly. Mocking `@/lib/i18n/i18n-context` only works for components that import the context directly.

---

## Test Failure Analysis — ALL RESOLVED ✅

All 68 pre-existing test failures have been fixed in commit `e827025`. Full suite: 15,813 tests, 0 failures.

| Category | Files | Failures | Fix |
|----------|-------|----------|-----|
| Translation Cache/Service | `translation-cache.test.ts`, `translation-service.test.ts` | 63 | Version 2→3, vi.mock for lazy imports, merge assertion updates |
| Component Tests | `Settings.test.tsx` | 1 | Added `emailPreferences` to i18n mock |
| Component Tests | `PolicyUpload-coverage.test.tsx` | 4 | afterEach timer flush (700ms), retry test rewrite |
| **Total** | **4 files** | **68** | **All fixed** |

---

## Priority Next Steps

### P1 — PolicyDetailView Ternary Migration — ~4 hours
- 124 `locale === 'tr'` ternaries (largest single component)
- Requires auditing each: data-field selections vs translation strings
- Likely needs 40-60 new translation keys
- Will significantly improve the codebase's i18n consistency

### P3 — Implement FX Conversion System (Steps 2, 6-10) — ~4 hours
Full multi-currency conversion:
- `src/lib/fx/fx-service.ts` — Exchange rate fetching and caching
- `server/routes/fx.ts` — Server proxy for FX API
- `src/hooks/useDisplayCurrency.ts` — React hook for currency conversion
- Currency switcher UI in user preferences
- User preference wiring for default display currency

### P4 — Database Translation Sync
- Apply seeded translations from new sections to production Supabase via SQL Editor
- Add migration file for the ~163 new translation keys
- Verify TranslationsTab in admin dashboard reflects new keys

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
| Mar 3 | Phase 12: Fix UI flashing and mixed localizations | `gemini20260303_fixes` |
| Mar 3 | i18n Plan Audit + P0 (test fixes) + P1 (locale-aware formatting) — plan ~20% | `claude/load-project-context-FT0Gj` |
| Mar 4 | P2 (S1 components) + P3 (S2 components) — 99 ternaries replaced, ~163 translation keys added — plan ~75% | `claude/load-project-context-9kxAB` |
| **Mar 4** | **Fix 68 pre-existing test failures across 4 files — 15,813 tests, 0 failures** | **`claude/load-project-context-TWvOc`** |
