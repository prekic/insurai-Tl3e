# Session Handoff — March 11, 2026 (AI Prompts & UI Execution Schema)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | ✅ Passing (typecheck clean, 0 errors) |
| **ESLint** | 0 errors |
| **Tests** | All tests passing, 0 failures |
| **Branch** | `insuraigemini202603110438` — 7 commits, pushed |

---

## This Session — New Features & Fixes

### 1. Fix Duplicate AI Insights Firing

**Problem**: AI insights (Strengths, Gaps, Recommendations) and Sense-Check rules were generating duplicate entries in the final output because `generateAIInsightsAsync` was being called twice during the policy extraction phase.

**Fix** (commits `92e5ef6`, `180fb31`, `e73275b`):
- Prevented the duplicate `generateAIInsightsAsync` call in `src/lib/ai/policy-extractor.ts`.
- Combined default and dynamic guidelines in the sense-check logic.
- Enforced stricter anti-hallucination rules in the extraction prompt to prevent false positives.

### 2. Make AI Prompts Editable via Database

**Problem**: Critical AI prompts, such as the AI Insights Sense-Check prompt, were hardcoded in the codebase backend, preventing administrators from dynamically adjusting AI behavior on the fly.

**Fix** (commit `9ea842e`):
- Migrated the "AI Insights - Sense Check" prompt to the `prompt_templates` database table using migration `007_seed_insight_prompts.sql`.
- Updated `prompt-service.ts` to fetch and render the prompt dynamically, including setting up a highly resilient fallback prompt if the database is unreachable.
- Refactored `/api/ai/sense-check` endpoint to use the new database-driven system.

### 3. Prompt Preview in Insights Tab

**Problem**: Administrators lacked a way to see the *exact* final prompt that gets sent to the LLM (combining the base prompt, static rules, and dynamic database rules).

**Fix** (commit `9bc01a5`):
- Created a new GET route `/api/ai/sense-check-prompt-preview` that replicates the backend prompt engineering logic without sending it to the AI.
- Added a "Preview Prompt" button in the Insights Tab (`InsightsTab.tsx`) that opens a readable dialog containing the final compiled prompt.

### 4. Admin Prompts UI Execution Flow Schema

**Problem**: The Admin dashboard's list of Prompt Templates lacked a visual hierarchy explaining exactly which prompts fired in what order during the automated extraction pipeline.

**Fix** (commits `e3a968e`, `61346ab`):
- Implemented a `Pipeline Execution Flow` visual schema in `PromptsTab.tsx`.
- Defined a robust sequencing logic mapping (e.g., `1a`, `1b`, `1c`, `3a`, `3b`) to handle linear steps and path branching.
- Verified that all edge-case prompt variants (Document Preprocessing, Extraction Quality Scoring, Coverage Gap Analysis) are visually accounted for in the execution map.

### Commits (oldest → newest)

| Commit | Type | Summary |
|--------|------|---------|
| `92e5ef6` | fix(ai) | resolve duplicate AI insights by preventing duplicate generateAIInsightsAsync call |
| `180fb31` | fix(ai) | combine default and dynamic guidelines in sense-check and allow adding insights |
| `e73275b` | fix(ai) | enforce stricter anti-hallucination rules in extraction prompt |
| `9bc01a5` | feat(admin) | add prompt preview to insights tab |
| `9ea842e` | feat(admin) | make AI Insights sense-check prompt editable via database |
| `e3a968e` | feat(admin) | add visual execution schema and sort prompts by pipeline order |
| `61346ab` | feat(admin) | expand execution flow schema with all prompt templates including OCR, scoring, and gap analysis |

### Key Files Changed

| File | Change |
|------|--------|
| `src/lib/ai/policy-extractor.ts` | **FIX** Removed duplicate AI Insight generation calls |
| `server/routes/ai.ts` | Refactored sense-check logic to use DB prompt, added preview endpoint |
| `server/services/prompt-service.ts` | Configured dynamic fetching and base mappings for AI sense-check prompt |
| `supabase/migrations/007_seed_insight_prompts.sql` | **NEW** Inserted the AI Insights prompt to the `prompt_templates` table |
| `src/components/admin/tabs/InsightsTab.tsx` | Added "Preview Prompt" button and compilation UI |
| `src/components/admin/tabs/PromptsTab.tsx` | Built visual Pipeline Execution Flow schema mapping |
| `src/lib/ai/extraction-schema.ts` | **FIX** Enforced explicit anti-hallucination instructions requiring `null` outputs for missing values |

---

## ⚠️ Gotchas for Next Session

1. **Prompt Template Variables**: The `AI Insights - Sense Check` prompt strictly expects `{{policy_data}}`, `{{raw_insights}}`, and `{{guidelines}}` as variable keys. If an administrator breaks these template strings in the UI, the sense-check endpoint might fail.
2. **Execution Order Mapping**: In `PromptsTab.tsx`, `PROMPT_EXECUTION_ORDER` requires exactly matching the prompt `name` from the database. If a new prompt is added via the DB, it will appear at the bottom of the execution track unless manually mapped in the component.
3. **Extraction Anti-Hallucination Guardrails**: The extraction prompts in `src/lib/ai/extraction-schema.ts` were strictly updated to instruct the model to return `null` when finding missing fields. If future features are built relying on empty arrays or empty strings for specific fields (e.g. deductibles or dates), that parsing logic will need to handle `null`.

---

## Priority Next Steps

1. **Merge & Deploy** — Branch `insuraigemini202603110438` is ready to merge. 
2. **Production Validation** — Test editing the AI Insights prompt in production by changing a single parameter, executing a document analysis, and ensuring the new edit applies seamlessly.
3. **Seed Verification** — Ensure the `007_seed_insight_prompts.sql` migration fires safely through the CI/CD deployment logic on the production DB.
