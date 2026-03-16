# SESSION HANDOFF

## ⚠️ OPERATIONAL STATUS — NOT YET LIVE

**All Phase 8H–8K metrics were produced from simulated/mocked data in test files. Zero real documents have been processed through the live pilot pipeline.**

The KASKO pilot code is now fully wired into the production extraction pipeline (as of March 2026), but the feature flag (`kasko_ai_extraction_pilot`) remains **disabled** and no users have been assigned to the `kasko_pilot_reviewers` segment. The pilot is operationally inactive until an admin explicitly enables the flag and assigns reviewers.

## CURRENT STATUS
We are in the middle of executing the **Controlled Rollout** for the KASKO AI Extraction Pilot.
- **Completed:** Phase 8I (Admission Rules), Phase 8J (Batch 2 Simulation & Logic), Phase 8K (Operational Mock Scale Evaluation).
- **Completed:** Comprehensive audit identified 6 blocking failures; all 6 now resolved (see "What Was Accomplished" below).
- **Blocked:** Phase 8L (Actual Broader Guarded Internal KASKO Pilot) is currently blocked due to a lack of actual real-world operational inputs or existing QA logs.

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

## NEXT STEPS FOR THE NEXT SESSION
1. **Apply Migration 040:** Run `040_kasko_pilot_flag_and_segment.sql` on the production Supabase instance.
2. **Assign Pilot Reviewers:** Add internal QA team user IDs to the `user_segments` table with `segment_name = 'kasko_pilot_reviewers'`.
3. **Enable Feature Flag:** Set `kasko_ai_extraction_pilot` to `enabled=true` via admin Feature Flags panel.
4. **Acquire Live Pilot Data:** Process real KASKO PDFs through the now-wired pipeline.
5. **Execute Phase 8L:** Once real data is available, evaluate *real* all-doc safety metrics and *real* eligible-doc quality metrics from the `kasko_pilot_qa_records` table.
6. **Monitor Rollback Triggers:** Use `GET /api/admin/monitoring/pilot-rollback-status` to check for safety threshold breaches.
7. **Production Validation Planning:** If Phase 8L metrics are genuinely strong, plot the final production-readiness validation phase for KASKO.
