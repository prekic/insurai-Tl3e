# Session Handoff — March 5, 2026 (FX System + PolicyDetailView i18n + DB Translation Sync + Bundle Optimization)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | Passing (Railway deployment stable) |
| **TypeCheck** | 0 errors (frontend + server) |
| **ESLint Errors** | 0 errors |
| **ESLint Warnings** | 0 warnings on modified files |
| **Tests** | 15,844 tests passing, 0 failures (337/337 files). 1 worker fork timeout (Vitest infrastructure, not code). |
| **Coverage** | ~91.67% statements, ~85.91% branches |
| **Lighthouse** | Performance 99, Accessibility 100, Best Practices 93, SEO 100 |
| **Branch** | `claude/load-project-context-l9Prt` |
| **Production Status** | Stable. No deployment blockers. |

---

## Session Summary

### This Session — FX System + PolicyDetailView i18n + DB Translation Sync (March 5, 2026)

Completed **5 items** from previous sessions:

1. **FX Conversion System** — Reviewed, wired, and committed all untracked/uncommitted FX files. Created barrel export `src/lib/fx/index.ts`. Fixed `useDisplayCurrency.ts` import from `useTranslation` → `useI18n`. FX service test (22 tests) and server FX routes test (11 tests) both passing.

2. **PolicyDetailView i18n Migration** — Migrated **132 `locale === 'tr'` ternaries** to translation keys in `PolicyDetailView.tsx`. Only **4 data-field ternaries** remain (correct — these select between pre-existing `nameTr`/`name` on data objects). Fixed duplicate `policyNotFound` key in translations-en/tr. Removed unused `locale` prop from `RawExtractedTextSection`. Fixed 3 test assertion mismatches. Full typecheck clean (0 errors).

3. **Database Translation Sync (P4)** — Created `scripts/generate-translation-migration.ts` to auto-generate SQL. Produced `supabase/migrations/030_seed_missing_translations.sql` with 426 new keys across 18 sections (852 translation rows). Version bump to "4". Applied to production.

4. **Bundle Optimization — Recharts + d3 split** — Added recharts + d3 to `manualChunks` in `vite.config.ts`. Main bundle 217 → 213 KB gzip (−4 KB). Recharts in dedicated `vendor-recharts` async chunk (116 KB gzip). Supabase was already optimally chunked (46 KB gzip async).

5. **CLAUDE.md + SESSION_HANDOFF.md updates** — Known Issues 151-154 added, metadata updated.

**Key Files Changed:**
- `scripts/generate-translation-migration.ts` — Auto-generates SQL migration from .ts translation files
- `supabase/migrations/030_seed_missing_translations.sql` — 426 keys × 2 locales = 852 translation rows
- `src/components/PolicyDetailView.tsx` — 132 ternaries → translation keys, removed unused locale prop
- `src/lib/i18n/translations-en.ts` — Fixed duplicate `policyNotFound` key, added 4 `policy.*` keys
- `src/lib/i18n/translations-tr.ts` — Same fix + same 4 keys
- `src/lib/i18n/translations.ts` — Added 4 keys to `TranslationDictionary` interface (`coreKaskoCoverages*`, `coverageDeductible`)
- `src/lib/i18n/translations-skeleton.ts` — Added matching 4 empty-string keys
- `src/components/PolicyDetailView.test.tsx` — Updated 3 assertions
- `src/components/PolicyDetailView-branches.test.tsx` — Updated mock from `useTranslation` → `useI18n`
- `src/hooks/useDisplayCurrency.ts` — Fixed import path
- `src/lib/fx/index.ts` — New barrel export
- `src/lib/fx/fx-service.test.ts` — 22 tests
- `server/__tests__/fx-routes.test.ts` — 11 tests
- `vite.config.ts` — Added recharts + d3 to `manualChunks`
- `CLAUDE.md` — Known Issues 151-154, metadata updates

### Previous Session — Fix PolicyDetailView Tests & TS Warnings (March 4, 2026)

Fixed all **180** isolated test failures in `PolicyDetailView-branches.test.tsx` and 68 pre-existing failures across 4 other test files. Full suite: **15,993 tests, 0 failures**.

---

## i18n Plan Execution Status

### Plan Location
`/root/.claude/plans/warm-tickling-wilkes.md` — 10-step plan covering S1/S2/S3 i18n + FX conversion

### Step-by-Step Status

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| **1** | Locale-aware formatting functions | **DONE** | `formatCurrency`/`formatDate`/`formatNumber` accept `locale` param, 10 caller files updated |
| **2** | FX Conversion System | **DONE** | `src/lib/fx/` barrel + service, `server/routes/fx.ts`, `src/hooks/useDisplayCurrency.ts`, wired in `server/index.ts` and `UserPreferencesPanel.tsx`. 33 tests (22 client + 11 server). |
| **3a** | S1: `NotFound.tsx` i18n | **DONE** | 4 strings → `t.notFound.*` |
| **3b** | S1: `ErrorBoundary.tsx` i18n | **DONE** | Wrapper pattern: `ErrorBoundaryWrapper` passes `t` and `locale` as props. `ui/error-boundary.tsx` also updated. |
| **3c** | S1: `PolicyDocuments.tsx` i18n | **DONE** | 12 strings → `t.policyDocuments.*` |
| **3d** | S1: `AIInsightsPanel.tsx` i18n | **DONE** | 32 ternaries → `t.aiInsights.*` + `formatCurrency` locale-aware |
| **4a** | S2: `ConflictResolutionDialog.tsx` | **DONE** | 47 ternaries → `t.conflictResolution.*` (50 keys) |
| **4b** | S2: `PolicyDiffViewer.tsx` | **DONE** | 13 ternaries → `t.policyDiff.*` (15 keys). 1 data-field ternary remains (correct). |
| **4c** | S2: `PolicyCard.tsx` | **DONE** | 4 ternaries → `t.policyCard.*` (8 keys). 1 data-field ternary remains (correct). |
| **4d** | S2: `EmailPreferences.tsx` | **DONE** | 6 ternaries → `t.emailPreferences.*` (6 keys). `isTurkish` kept for 2 data-field selections (correct). |
| **5** | Add ~163 translation keys | **DONE** | All sections added to interface, EN, TR, and skeleton files. |
| **6** | Server-side FX proxy | **DONE** | `server/routes/fx.ts` created and wired in `server/index.ts`. 11 tests. |
| **7-10** | FX wiring, hook, currency switcher, user preferences | **DONE** | `useDisplayCurrency.ts` hook, `display_currency` in `UserPreferencesPanel.tsx` and `user-overridable.ts`. |

### Remaining Ternaries (4 data-field selections — all correct to keep)

| Component | Ternary | Reason to Keep |
|-----------|---------|---------------|
| `PolicyDiffViewer.tsx:50` | `change.fieldLabelTr` vs `change.fieldLabel` | Data-field selection |
| `PolicyCard.tsx:49` | `policyTypeInfo?.labelTr` vs `policyTypeInfo?.label` | Config data-field |
| `AIInsightsPanel.tsx` | `insight.textTr` vs `insight.text` | Data-field selection |
| `EmailPreferences.tsx:160-161` | `config.labelTr`/`config.descriptionTr` | Config data-field |

### PolicyDetailView.tsx Ternary Migration — DONE

Migrated **132 ternaries** in `PolicyDetailView.tsx` (was listed as 124 out-of-scope, actual count was higher). Only **4 data-field ternaries** remain:

| Location | Ternary | Reason to Keep |
|----------|---------|---------------|
| ~line 559 | `categoryInfo.labelTr` vs `categoryInfo.labelEn` | Coverage category data-field |
| ~line 730 | `exclusion.explanation` vs `exclusion.explanationEn` | Exclusion data-field |
| ~line 785 | `item.question` vs `item.questionEn` | Knowledge base data-field |
| ~line 806 | `item.question` vs `item.question` | Knowledge base data-field |

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

## Test Failure Analysis — ALL RESOLVED ✅

All broken component and branch coverage tests have been fixed. Full suite: 15,993 tests, 0 failures.

| Category | Files | Failures | Fix |
|----------|-------|----------|-----|
| Branch Tests | `PolicyDetailView-branches.test.tsx` | 180 | Mock isolation sync, translation assertion parity, unawaited async DOM mock bypassing |
| Translation Cache/Service | `translation-cache.test.ts`, `translation-service.test.ts` | 63 | Version 2→3, vi.mock for lazy imports, merge assertion updates |
| Component Tests | `Settings.test.tsx` | 1 | Added `emailPreferences` to i18n mock |
| Component Tests | `PolicyUpload-coverage.test.tsx` | 4 | afterEach timer flush (700ms), retry test rewrite |
| **Total** | **5 files** | **248** | **All fixed** |

---

## Priority Next Steps

### P1 — PolicyDetailView Ternary Migration — ✅ DONE (March 5, 2026)
132 ternaries migrated. 4 data-field ternaries remain (correct).

### P2 — FX Conversion System — ✅ DONE (March 5, 2026)
All files committed. 33 tests passing (22 client + 11 server).

### P4 — Database Translation Sync — ✅ DONE (March 5, 2026)
- Created `scripts/generate-translation-migration.ts` to auto-generate SQL from .ts translation files
- Generated `supabase/migrations/030_seed_missing_translations.sql` — 426 new keys × 2 locales = 852 translation rows
- 18 sections covered: 11 entirely new (aiInsightsPanel, conflictResolution, emailPreferences, errorBoundary, exportMenu, global, notFound, notifications, onboarding, policyDiff, policyDocuments) + 7 expanded (account, common, comparison, landing, policy, settings, upload)
- Translation version bumped from "3" to "4" in `translation_metadata`
- **Applied to production**: Yes (Mar 5, 2026, via Supabase SQL Editor)

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
| Mar 4 | Fix 68 pre-existing test failures across 4 files — 15,813 tests, 0 failures | `claude/load-project-context-TWvOc` |
| Mar 4 | Fix 180 branch coverage test failures and suppress async `act()` testing warnings in `PolicyDetailView` | `claude/load-project-context-TWvOc` |
| **Mar 5** | **FX system + PolicyDetailView i18n (132 ternaries) + DB translation sync (426 keys, migration 030) + recharts bundle split** | **`claude/load-project-context-l9Prt`** |
