# Session Handoff — March 15, 2026 (Dynamic AI Guidelines & Vitest Crash Fix)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | ✅ Passing |
| **ESLint** | 0 errors |
| **Tests** | All tests passing (100% on `usePolicyComparison` suite) |
| **Branch** | `insuraigemini202603151015` — Ready to push |
| **Deployment** | Pending Railway deployment |

---

## This Session — Completed Work

### 1. Dynamic AI Insight Guidelines
**Feature**: Completely eliminated hardcoded AI sense-check rules from the codebase in favor of a new Admin UI and DB table (`ai_insight_guidelines`) that allows dynamic, on-the-fly tweaking of anti-hallucination instructions.
**Fix**: 
- Added a `ai_insight_guidelines` DB table and seeded it with migrated rules.
- Created `/admin/insights` UI tab for administrators to configure constraints per Policy Type and Region.
- Ensured backend dynamic guidelines immediately overwrite generic prompts for AI extraction calls.

### 2. Evidence Storage & Translation Prompts
**Feature**: The AI often hallucinated evidence or failed to explicitly quote the text for the interactive UI.
**Fix**: 
- Added `quoteTr` to the `extraction-schema.ts` explicitly demanding the AI return the exact matched text translated to Turkish.
- Updated Anthropic guidelines to explicitly restrict AI from summarizing quote fields and mandating strict JSON array parsing.

### 3. Vitest "Heap Out of Memory" Worker Crash Fix
**Feature**: The CI pipeline was hanging and silently dying during `usePolicyComparison.test.ts` due to an infinitely-propagating re-render memory leak in background React testing containers.
**Fix**: 
- Isolated the cause to inline arrays supplied to `@testing-library/react`'s `renderHook()` (e.g., `renderHook(() => usePolicyComparison([createMockPolicy()]))`). This generated sequentially unique mocked IDs causing a new memory reference on every boolean hook render phase.
- Extracted inline dynamic arrays into variable definitions executed *prior* to `renderHook`, resolving all infinite looping cascades. Test suite now effortlessly hits 66/66 cleanly.

---

## Key Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/032_ai_insight_guidelines.sql` | **NEW** DB table for Dynamic Rules Engine (from prior session) |
| `supabase/migrations/037_update_master_extraction_prompt.sql` | **NEW** Synchronized the DB master extraction prompt with the refined backend hardcoded JSON Schema prompt |
| `src/components/admin/tabs/InsightsTab.tsx` | **NEW** Admin interface for managing rule constraints |
| `src/lib/ai/policy-extractor.ts` | **FIX** Merged DB guidelines into JSON Schema prompt construction |
| `src/lib/ai/providers/claude.ts` & `openai.ts` | **FIX** Explicitly separated JSON schema construction from baseline extraction text |
| `server/routes/ai.ts` | **FIX** Merged dynamic guidelines directly into Anthropic's JSON schema prompt building logic and deleted hardcoded fallback arrays |
| `server/services/prompt-service.ts` | **FIX** Audited generic fallback prompts; injected primary anti-hallucination rules directly into base fallback prompt |
| `scripts/test-local-anthropic.ts` | **NEW** Test script to manually verify Claude extractions bypassing the frontend |
| `src/hooks/usePolicyComparison.test.ts` | **FIX** Fixed infinite hook re-renders crashing vitest workers |
| `src/lib/ai/prompts.ts` | **FIX** Audited generic fallback prompts for stricter constraints |
| `src/lib/ai/kasko-parser-prompts.ts` | **FIX** Removed hardcoded fallback limits |

---

## Priority Next Steps

1. **Verify on Railway** — Merge Branch, allow Release Please to bump the SemVer version, deploy to staging Railway environment.
2. **Setup Admin Test Insight Rule** — Navigate to `/admin/insights`, create an arbitrary rule (e.g., `guidance: Verify TC Kimlik numbers strictly`) to prove the AI respects the DB prompt during the next analysis extraction.
3. **Database Migration Sync** — Ensure `037_update_master_extraction_prompt.sql` processes cleanly on the Railway Supabase DB instance.
