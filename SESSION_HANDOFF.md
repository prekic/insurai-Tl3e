# SESSION HANDOFF

## ⚠️ OPERATIONAL STATUS — NOT YET LIVE (Activation Ready)

**All Phase 8H–8K metrics were produced from simulated/mocked data in test files. Zero real documents have been processed through the live pilot pipeline.**

The KASKO pilot code is now fully wired into the production extraction pipeline and has passed a comprehensive 12-section operational audit (see `docs/KASKO_PILOT_OPERATIONAL_AUDIT_2026_03_16.md`). The feature flag (`kasko_ai_extraction_pilot`) remains **disabled** and no users have been assigned to the `kasko_pilot_reviewers` segment. The pilot is **activation-ready** — 3 manual admin actions are required to go live.

## CURRENT STATUS
- **Completed:** Phase 8I (Admission Rules), Phase 8J (Batch 2 Simulation & Logic), Phase 8K (Operational Mock Scale Evaluation).
- **Completed:** Comprehensive audit identified 6 blocking failures; all 6 resolved in code.
- **Completed:** Migration 040 schema fix — `name` column added to `feature_flags` INSERT (commit `71a5113`).
- **Completed:** Full 12-section operational audit report with evidence structures (commit `2d3f540`).
- **Blocked:** Phase 8L (Actual Broader Guarded Internal KASKO Pilot) — blocked on 3 manual activation steps + real KASKO PDF data.

## IMMEDIATE NEXT STEPS (Priority Order)

### 1. Apply Migration 040 to Production Supabase (MANUAL)
Run `supabase/migrations/040_kasko_pilot_flag_and_segment.sql` in Supabase Dashboard → SQL Editor.

**Verify:**
```sql
SELECT key, name, enabled, rollout_percentage FROM feature_flags WHERE key = 'kasko_ai_extraction_pilot';
-- Expected: 'kasko_ai_extraction_pilot', 'KASKO AI Extraction Pilot', false, 0
```

### 2. Assign Pilot Reviewers (MANUAL)
```sql
-- Find user IDs first:
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 10;

-- Then assign (replace UUID):
INSERT INTO public.user_segments (user_id, segment_name, assigned_by)
VALUES
  ('YOUR-USER-UUID', 'kasko_pilot_reviewers', 'admin_manual_assignment')
ON CONFLICT (user_id, segment_name) DO NOTHING;
```

### 3. Enable Feature Flag (MANUAL)
```sql
UPDATE public.feature_flags
SET enabled = true, rollout_percentage = 100
WHERE key = 'kasko_ai_extraction_pilot';
```

### 4. Collect Live Verification Artifacts
After Steps 1–3, log in as an assigned reviewer and upload a real KASKO PDF. Collect:
- **Result-object snippet**: Check browser console for `isPilotResult: true` in the display summary
- **QA log row**: `SELECT * FROM kasko_pilot_qa_records ORDER BY created_at DESC LIMIT 1;`
- **Banner screenshot**: Amber "TASLAK / DRAFT" banner above AI insights panel

### 5. Execute Phase 8L
Once real data exists in `kasko_pilot_qa_records`, evaluate:
- All-doc safety metrics (zero-coverage rate, phrase leaks)
- Eligible-doc quality metrics (field accuracy, correction rate)

### 6. Monitor Rollback Triggers
Use `GET /api/admin/monitoring/pilot-rollback-status` to check for safety threshold breaches.

### 7. Production Validation Planning
If Phase 8L metrics pass, plot the final production-readiness validation phase for KASKO.

## WHAT WAS ACCOMPLISHED — THIS SESSION (March 16, 2026)

1. **Migration 040 Schema Fix** (`71a5113`):
   - Fixed NOT NULL constraint violation: added missing `name` column to `feature_flags` INSERT
   - Root cause: `feature_flags` table (migration 012) has `name VARCHAR(200) NOT NULL`, but original migration 040 omitted it

2. **Comprehensive 12-Section Operational Audit Report** (`2d3f540`):
   - Created `docs/KASKO_PILOT_OPERATIONAL_AUDIT_2026_03_16.md` (515 lines)
   - Covers all 9 KASKO pilot subsystems with pass/fail verdicts
   - Includes: exact line references, expected result-object JSON, expected QA log JSON, docs-vs-reality mismatch table, SQL appendix for all 3 manual activation steps

## WHAT WAS ACCOMPLISHED — PILOT WIRING SESSION (March 2026)

A comprehensive audit (saved at `/root/.claude/plans/merry-roaming-minsky.md`) found that the pilot was "code-complete but operationally dead" — every gate, monitor, and logging function existed in isolation from the live extraction pipeline. **All 6 blocking issues have now been resolved:**

1. **DB Migration for Feature Flag & Segments** (`supabase/migrations/040_kasko_pilot_flag_and_segment.sql`):
   - Seeds `kasko_ai_extraction_pilot` flag (disabled by default, 0% rollout)
   - Creates `user_segments` table with RLS for segment-based gating
   - Creates `kasko_pilot_qa_records` table for persistent QA logging (replaces /tmp JSONL approach)

2. **Component Wiring — Feature Flags & User Segments**:
   - Created `src/hooks/usePilotGateOptions.ts` — loads feature flags via `configService.getFeatureFlags()` and user segments from Supabase
   - Wired into `AIInsightsPanel.tsx` and `SharedResult.tsx` — both now pass `{ featureFlags, userSegments, userId }` to `useDisplaySafeSummary()`
   - The draft/review banner in `AIInsightsPanel.tsx` (lines 112-141) will now activate when the flag is enabled and user is in the segment

3. **Pilot Admission in Extraction Pipeline** (`src/lib/ai/policy-extractor.ts`):
   - `evaluatePilotAdmission()` is now called for every KASKO extraction after successful analysis
   - Classifies documents into 4 statuses before metrics measurement
   - Result attached to `ExtractionResult.pilotAdmission`

4. **QA Record Persistence** (`src/lib/ai/policy-extractor.ts`):
   - `persistPilotQARecord()` writes to Supabase `kasko_pilot_qa_records` table (fire-and-forget)
   - Replaces the old `logPilotQARecord()` JSONL approach with proper DB persistence
   - Populates all 30+ fields from extraction results

5. **Admin Rollback Trigger Monitoring** (`server/routes/admin/monitoring.ts`):
   - `GET /api/admin/monitoring/pilot-rollback-status` endpoint
   - Fetches last 30 days of QA records, evaluates `getRollbackTriggerStatus()`
   - Returns trigger status, admission breakdown, and recent records

6. **Documentation Updated** (this file + `BRANCH_READINESS_SCORECARD.md`):
   - Clearly distinguishes simulated evidence from operational status

## WHAT WAS ACCOMPLISHED — PREVIOUS SESSION (Phases 8I-8K)
1. **Admission Gating Specifications & Logic:** Drafted explicit rules in `docs/KASKO_PILOT_ADMISSION_RULES.md` and implemented `evaluatePilotAdmission` to protect pilot metrics from noisy/broken inputs (e.g. garbled text, totally missing layouts).
2. **Success Criteria Stratification:** Safety metrics are evaluated against ALL inputs. Quality metrics (fields, accuracy) are evaluated ONLY against eligible inputs (`docs/KASKO_PILOT_QA_SCHEMA.md`).
3. **Phase 8J (Batch 2 Simulation):** Authored `docs/KASKO_PILOT_BATCH_2_PLAN.md` and created simulated inputs (`src/lib/analysis/pilot-batch2-samples.ts`) to validate the new admission gate logic (`src/lib/analysis/__tests__/pilot-8j-batch2.test.ts`).
4. **Phase 8K (Simulated Operational Scale Completion):** Hand-wrote mock operational inputs (`src/lib/analysis/pilot-8k-real-docs.ts`) to simulate a broader guarded queue (`src/lib/analysis/__tests__/pilot-8k-operational.test.ts`). The wording across `CONTROLLED_ROLLOUT_GATES.md`, `BRANCH_READINESS_SCORECARD.md`, and the defect logs was scrubbed to heavily emphasize that Stage 8K was simulated/mocked evidence, NOT live evidence.
5. **Phase 8L Block:** Halted Phase 8L execution intentionally under the NON-SIMULATION guard. The repository only contains 3 KASKO PDFs, and there is no existing `kasko_pilot_qa_log.csv` to evaluate.

## KNOWN ISSUES & GOTCHAS
- **Phase 8L Block:** Do not proceed with Phase 8L without either (a) a real QA export containing human review outcomes or (b) at least 7 *more* real KASKO PDF policies uploaded to the workspace to perform live extraction against.
- **Provider Accuracy:** Simulated documents with generic names often resulted in missing provider assignments if not explicitly mocked. Ensure real documents have clear provider letterheads for the unified processor to catch.
- **Feature Flag Disabled:** The `kasko_ai_extraction_pilot` flag is seeded as `enabled=false`. An admin must explicitly enable it via the Feature Flags admin panel before the pilot activates.
- **No Reviewers Assigned:** The `kasko_pilot_reviewers` segment has no members. An admin must assign users to this segment before they can participate in the pilot.
- **Migration 040 Required:** `supabase/migrations/040_kasko_pilot_flag_and_segment.sql` must be applied to the production Supabase instance before the pilot can function.
- **Migration 040 Schema Fix Applied:** The original migration 040 omitted the `name` column in the `feature_flags` INSERT. This was fixed in commit `71a5113`. Ensure you run the **current** version of the migration file, not a cached/old version.
- **Dead JSONL Path in Go-Live Checklist:** `docs/KASKO_PILOT_GO_LIVE_CHECKLIST.md` line 23 references `/tmp/kasko-pilot-qa-log.jsonl` — this path is dead code. QA records now persist to the Supabase `kasko_pilot_qa_records` table via `persistPilotQARecord()`.
- **Safe-Off Design:** All 7 failure modes (migration not applied, flag missing, user not in segment, non-KASKO branch, no options passed, QA persist fails, Supabase unreachable) default to pilot inactive. The system cannot accidentally activate.
- **Misleading RLS Comment in Migration 040:** Lines 87 and 90 of `040_kasko_pilot_flag_and_segment.sql` comment says "admin-only access via service role" but the actual RLS policy is `USING (true) WITH CHECK (true)` — open to ALL roles including `anon`. Both `persistPilotQARecord()` (uses `VITE_SUPABASE_ANON_KEY`) and `usePilotGateOptions` (uses anon key) depend on this open policy. **Do NOT tighten the RLS based on the comment** without first updating these callers to use the service role key, or they will silently fail.
- **Cross-Realm Dynamic Import in monitoring.ts:** `server/routes/admin/monitoring.ts:640` uses `await import('../../src/lib/analysis/kasko-pilot-gate.js' as string)` — a server-side Express route dynamically importing a client-side `src/lib/` module. This works because both share the same TypeScript compilation target, but could break if server/client builds diverge (e.g., separate ESM/CJS targets).
