# Session Handoff — March 9, 2026 (Exclusion i18n + Mobile Extraction Resilience)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | ✅ Passing (typecheck clean, 0 errors) |
| **ESLint** | 0 errors |
| **Tests** | 15,850+ tests passing, 0 failures |
| **Branch** | `claude/load-project-context-Mhtah` — 3 commits, pushed |

---

## This Session — 3 Fixes

### 1. Exclusions Displaying in Turkish When Locale is English

**Problem**: PolicyDetailView showed Turkish exclusion text ("Anahtarla çalışan araçlarda...") even when the app was set to English.

**Root Cause**: Three-layer gap:
- AI prompts (Anthropic/OpenAI) did not strongly require `exclusionsEn` population
- No fallback translation when AI failed to provide English exclusions
- `convertToAnalyzedPolicy()` passed `exclusionsEn: null` when AI didn't comply

**Fix** (commit `4a3e26f`):
- Created `src/lib/i18n/exclusion-translations.ts` — 60+ Turkish→English exclusion pattern translations as extraction-time fallback
- `ensureExclusionsEn()` fills gaps: AI-provided → pattern-match translation → Turkish fallback
- Wired into all 3 extraction paths: `convertToAnalyzedPolicy`, evidence merge post-processing, `comprehensiveToAnalyzedPolicy`
- Strengthened AI prompts in `server/routes/ai.ts` (Anthropic schema) and `extraction-schema.ts` (OpenAI JSON schema) with CRITICAL instructions for `exclusionsEn`
- 21 new tests in `exclusion-translations.test.ts`

### 2. "Ask Your Insurer" Card Layout Improvement

**Problem**: The clarification cards had awkward badge placement, weak visual hierarchy, tiny icons, and inconsistent spacing.

**Fix** (commit `e40ddfc`):
- Badge moved to top-right corner (`flex justify-between items-start`)
- Topic names strengthened to `font-semibold text-gray-900`
- HelpCircle icon enlarged (14px) and top-aligned for multi-line questions
- Softer card borders (`blue-100`) with subtle `shadow-sm`
- Compact badge styling (`text-[11px]`, `shrink-0`, `whitespace-nowrap`)
- Fixed invalid `item.questionEn` access on `missingImportantExclusions` type (doesn't have that field)

### 3. Mobile Tab Suspension Killing Extraction

**Problem**: On mobile, when user backgrounds the tab during extraction, the browser kills the HTTP fetch connection but freezes JS timers. On return, the fetch is dead but the promise never resolves, causing `CLIENT_TIMEOUT_UMBRELLA` timeout with ugly diagnostic codes shown to user.

**Fix** (commit `303da34`):
- `visibilitychange` listener detects tab resume during in-flight extraction
- Checks if result was saved in background (extraction may have completed) → redirects to results
- Otherwise auto-retries extraction (up to 2 times) with 1.5s delay for network reconnect
- Diagnostic codes (`[code=CLIENT_TIMEOUT_UMBRELLA]`, `[req=ext-xxx | timing...]`) moved to `console.warn` only — users see clean message
- Client fetch timeout increased from 120s → 135s (was less than server's 125s budget, causing premature client abort)

### Commits (oldest → newest)

| Commit | Type | Summary |
|--------|------|---------|
| `4a3e26f` | fix(i18n) | Ensure exclusions display in English when locale is EN |
| `e40ddfc` | fix | Improve Ask Your Insurer card layout for mobile |
| `303da34` | fix | Mobile tab suspension killing extraction + clean error messages |

### Key Files Changed

| File | Change |
|------|--------|
| `src/lib/i18n/exclusion-translations.ts` | **NEW** 60+ Turkish→English exclusion pattern translations with `ensureExclusionsEn()` |
| `src/lib/i18n/exclusion-translations.test.ts` | **NEW** 21 tests for exclusion translation |
| `src/lib/ai/policy-extractor.ts` | Wired `ensureExclusionsEn()` into 3 extraction paths |
| `src/lib/ai/extraction-schema.ts` | Strengthened `exclusionsEn` description in OpenAI JSON schema |
| `server/routes/ai.ts` | Added CRITICAL instructions for `exclusionsEn` in Anthropic prompt |
| `src/components/PolicyDetailView.tsx` | Redesigned Ask Your Insurer card layout, fixed invalid `questionEn` access |
| `src/components/TryAnalysis.tsx` | Visibility change auto-retry, clean error messages, extraction in-flight tracking |
| `src/lib/ai/config.ts` | Client fetch timeout 120s → 135s (aligned with server 125s budget) |

---

## ⚠️ Gotchas for Next Session

1. **Exclusion Translation Fallback is Pattern-Based**: `exclusion-translations.ts` uses substring matching — patterns like `"deprem"` match any exclusion containing that word. If AI extraction improves and always provides `exclusionsEn`, the fallback becomes a no-op. But for now, it's essential.
2. **`missingImportantExclusions` Has No `questionEn` Field**: The type from `kasko-knowledge.ts` only has `{ name, nameEn, question, importance }`. Do NOT access `item.questionEn` on this type — use `item.question` for both locales.
3. **Mobile Visibility Auto-Retry**: `retryCountRef` caps at 2 retries. The retry is triggered by `visibilitychange` to `visible` ONLY when `extractionInFlightRef.current` is true. The retry clears stale timers and resets state before re-running.
4. **Client/Server Timeout Chain**: Server budget = 125s, client fetch = 135s, client umbrella = 150s. The client fetch MUST exceed the server budget so the server can return a proper `BUDGET_EXHAUSTED` error with diagnostics.
5. **Diagnostic Codes No Longer Shown to Users**: `[code=...]` and `[req=...]` are logged to `console.warn` only. If you need to debug extraction failures, check the browser console. The user sees: "Analysis timed out. The AI service may be busy. Please try again."
6. **Do NOT re-add AbortController.abort() on TryAnalysis unmount.** Extraction should run to completion; `saveTrialResult()` persists it for when the user returns.
7. **🚨 TESTING PROTOCOL WARNING 🚨**: Never run the full test suite (`npm run test` or `vitest run`) without explicit user permission. It takes over 10 minutes. Always test files in isolation.

---

## Priority Next Steps

1. **Merge & Deploy** — Branch `claude/load-project-context-Mhtah` is ready to merge. All 3 commits are clean.
2. **Production Validation** — After deploy:
   - Test exclusion display: Upload a Turkish policy, switch locale to EN, verify exclusions show in English
   - Test mobile extraction: On phone, upload a file, switch to another app for 30s, return — should auto-retry or show results
   - Verify Anthropic API health: `GET /api/ai/diagnose` — check `anthropic.valid`
3. **Monitor Extraction Success Rate** — Check admin Extraction Health tab for error rate after deploy. If Anthropic credits are genuinely exhausted, the server falls back to OpenAI automatically, but latency increases.
4. **Bilingual Evidence Quotes** — Previous session added `quoteTr` to extraction schema. Verify it's populated in real extractions after merge.
