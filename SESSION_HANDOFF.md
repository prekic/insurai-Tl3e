# Session Handoff — March 10, 2026 (AI Insight Rules Dashboard)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | ✅ Passing (typecheck clean, 0 errors) |
| **ESLint** | 0 errors |
| **Tests** | 15,850+ tests passing, 0 failures |
| **Branch** | `insuraigemini202603092125` — 5 commits, pushed |

---

## This Session — New Features & Fixes

### 1. Dynamic AI Insight Guidelines (Admin Dashboard)

**Problem**: The AI sometimes hallucinates incorrect or overly critical missing coverages (e.g., flagging "collision" missing on a comprehensive Kasko policy). We had hardcoded `if`/`else` rules in backend source code to prevent this.

**Fix** (commits `6010ee3`, `d249e35`):
- Created Supabase table `ai_insight_guidelines` with migration `032_ai_insight_guidelines.sql`.
- Updated `POST /api/ai/sense-check` to fetch rules scoped to `policy_type` and `region_code` (with `*` global wildcards).
- Injected the dynamic output into the `systemPrompt`.
- Created an extensive Admin UI Dashboard (`InsightsTab.tsx`) with full CRUD and active toggling abilities, accessible via the sidebar under "AI Insights".
- Created ADR `018-dynamic-ai-insight-guidelines.md` documenting the architecture decision to shift to DB-controlled rules.

### 2. VKN vs TC Kimlik Validation False Positives

**Problem**: False positive identification of national ID formats.

**Fix** (commit `7db3d6e`):
- Ensured validation differentiates between VKN (Tax IDs for companies) and TC Kimlik correctly.

### 3. TypeScript Casting for Extraction Data

**Problem**: Extraction typing mismatch during AI output parsing.

**Fix** (commit `c9094de`):
- Patched TypeScript casting issues for robust runtime parsing of extraction data.

### 4. 502/504 Errors on Proxy Extraction Timeout

**Problem**: Prolonged extraction tasks occasionally trigger 502 (Bad Gateway) or 504 (Gateway Timeout) from proxies (like Railway/Cloudflare) before the internal server budget runs out.

**Fix** (commit `35010e5`):
- Handled 502/504 errors specifically on proxy timeout to provide better user feedback instead of crashing or showing unstructured server dump errors.

### Commits (oldest → newest)

| Commit | Type | Summary |
|--------|------|---------|
| `7db3d6e` | fix(ai) | resolve vkn vs tc kimlik validation false positives |
| `6010ee3` | feat(ai) | implement ai sense checking for policy insights |
| `c9094de` | fix(ai) | typescript casting for extraction data |
| `35010e5` | fix(ai) | handle 502/504 errors on proxy extraction timeout to provide better user feedback |
| `d249e35` | feat(admin) | add AI insights management dashboard |

### Key Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/032_ai_insight_guidelines.sql` | **NEW** Migration for AI sense-checking rules table |
| `src/types/supabase.ts` | Automatically tracked DB types for new table |
| `server/routes/ai.ts` | Removed hardcoded rules. Dynamically fetch rules from Supabase and concat to prompt |
| `src/components/admin/tabs/InsightsTab.tsx` | **NEW** The React Admin UI dashboard for managing insight rules |
| `src/components/admin/AdminLayout.tsx` | Linked "AI Insights" in the global Admin navigation view |
| `src/components/admin/AdminDashboard.tsx` | Registered `InsightsTab` into the rendering switch case |
| `src/components/admin/tabs/index.ts` | Exported `InsightsTab` |
| `src/types/admin.ts` | Added `'insights'` to `AdminSection` routing type |
| `src/components/PolicyDetailView.tsx` | TypeScript casting patches for extraction data parsing |
| `src/lib/ai/config.ts` | Thresholds and config for proxy timeout resilience |
| `src/lib/ai/policy-extractor.ts` | Proxy timeout resilience logic handling 502/504 edge cases |
| `src/lib/extraction/turkish-patterns.ts` | Regex/validation logic fix for VKN vs TC Kimlik false positives |
| `src/lib/extraction/turkish-patterns.test.ts` | Unit tests for VKN vs TC Kimlik validation |
| `src/lib/i18n/translations-*.ts` | Localized UI feedback messages for proxy timeouts |
| `docs/adr/018-dynamic-ai-insight-guidelines.md` | **NEW** ADR documenting the architectural shift |

---

## ⚠️ Gotchas for Next Session

1. **Rule Caching Pipeline**: Currently, `POST /api/ai/sense-check` executes a `select` query directly against `ai_insight_guidelines` on every request. If extraction traffic rises significantly, we might need a node cache mechanism (e.g. `lru-cache`) to hold the rules in memory with a short TTL, reducing DB load.
2. **Supabase Client Context in Admin Component**: `InsightsTab.tsx` leverages the client-side Supabase object exported from `src/lib/supabase/client.ts`. This works securely because the dashboard itself is rendered behind an authenticated route lock.

---

## Priority Next Steps

1. **Merge & Deploy** — Branch `insuraigemini202603092125` is ready to merge. 
2. **Production Validation** — After deploying, navigate to `/admin/insights` and create a dummy rule for a Kasko policy (`*` region) that forces the AI to append an exclamation mark to an insight. Perform a PDF extraction and verify the AI respects the new global rule. Delete the rule afterward.
3. **Database Seed Verification** — Ensure that `032_ai_insight_guidelines.sql` runs perfectly on production through the established CI/CD pipeline or migration runner.
