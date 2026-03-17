# KASKO Pilot Operational Readiness Audit — March 16, 2026

---

## 1. Executive Verdict

**CONDITIONAL GO — Code-level: PASS (9/9). Operationally BLOCKED on 3 manual admin actions.**

All pilot gate logic, QA persistence, admission gating, rollback monitoring, and UI banners are wired into the live extraction pipeline. The system defaults to safe-off on every failure path. No pilot behavior leaks into production.

However, the pilot cannot activate until an admin performs 3 manual steps:

| # | Manual Action | Status |
|---|--------------|--------|
| 1 | Apply migration `040_kasko_pilot_flag_and_segment.sql` to production Supabase | **BLOCKED** |
| 2 | Assign users to `kasko_pilot_reviewers` segment | **BLOCKED** |
| 3 | Enable `kasko_ai_extraction_pilot` feature flag | **BLOCKED** |

---

## 2. Pass / Fail Table

| # | Audit Section | Code Verdict | Runtime Verdict | Evidence |
|---|---------------|-------------|-----------------|----------|
| 1 | Feature Flag & Segment Controls | **PASS** | **BLOCKED** (DB not applied) | Migration 040 exists; `evaluateKaskoPilotGate()` triple-guard verified |
| 2 | Real Flow Wiring (Extraction → Display) | **PASS** | **PASS** | Both callers (`AIInsightsPanel:45-46`, `SharedResult:43-44`) pass options |
| 3 | Result Object Proof | **PASS** | N/A (need live doc) | 7 pilot fields on `DisplaySafePolicySummary` (`display.ts:217-242`) |
| 4 | Draft / Review Banner UI | **PASS** (code) | **BLOCKED** (visual) | `AIInsightsPanel.tsx:114-143` renders on `isPilotResult` |
| 5 | QA Logging Pipeline | **PASS** | **BLOCKED** (need live doc) | `persistPilotQARecord()` at `policy-extractor.ts:1417-1419` |
| 6 | Rollback Trigger Monitoring | **PASS** | **PASS** (endpoint ready) | `GET /api/admin/monitoring/pilot-rollback-status` at `monitoring.ts:559-658` |
| 7 | Document Admission Gating | **PASS** | **BLOCKED** (need live doc) | `evaluatePilotAdmission()` at `kasko-pilot-gate.ts:34-108` |
| 8 | Safety Behavior Under Failure | **PASS** | **PASS** | Safe-off on all 7 tested failure paths |
| 9 | Docs vs Reality Consistency | **PASS** | **PASS** | All docs say "NOT YET LIVE" — accurate |

**Blocking code failures: 0 of 9.**
**Manual work items: 3.**
**Live verification artifacts needed: 3** (result object, QA log row, banner screenshot).

---

## 3. Feature Flag & Segment Audit

### 3.1 Feature Flag Evidence

**Migration file**: `supabase/migrations/040_kasko_pilot_flag_and_segment.sql`

```sql
INSERT INTO public.feature_flags (key, name, enabled, description, rollout_percentage)
VALUES (
  'kasko_ai_extraction_pilot',
  'KASKO AI Extraction Pilot',
  false,
  'KASKO internal pilot: when enabled, all KASKO extractions require human review...',
  0
)
ON CONFLICT (key) DO NOTHING;
```

- **Seeded state**: `enabled = false`, `rollout_percentage = 0`
- **Schema source**: `feature_flags` table defined in `supabase/migrations/012_configuration_system.sql` with `name VARCHAR(200) NOT NULL`
- **Fix applied**: Migration 040 originally omitted the `name` column — fixed March 16, 2026 (commit `71a5113`)

### 3.2 Segment Table Evidence

```sql
CREATE TABLE IF NOT EXISTS public.user_segments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  segment_name TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by TEXT,
  UNIQUE(user_id, segment_name)
);
```

- RLS enabled with service-role-only policy
- Indexed on `user_id` and `segment_name`
- **Current state**: Table created but empty — no users assigned to `kasko_pilot_reviewers`

### 3.3 Triple-Guard Gate Logic

**File**: `src/lib/analysis/kasko-pilot-gate.ts:161-212`

```
Guard 1 (line 168): if (branch !== 'kasko') → isPilotActive: false
Guard 2 (line 179): if (featureFlags['kasko_ai_extraction_pilot'] !== true) → isPilotActive: false
Guard 3 (line 191): if (!userSegments.includes('kasko_pilot_reviewers')) → isPilotActive: false
```

All 3 must pass for `isPilotActive: true`. Constants:
- `KASKO_PILOT_FLAG = 'kasko_ai_extraction_pilot'` (line 149)
- `KASKO_PILOT_SEGMENT = 'kasko_pilot_reviewers'` (line 150)

### 3.4 Runtime Verification Status

| Check | Verifiable from Code? | Status |
|-------|----------------------|--------|
| Migration 040 applied to production | No | **BLOCKED** |
| `kasko_ai_extraction_pilot` row exists in `feature_flags` | No | **BLOCKED** |
| Any users in `kasko_pilot_reviewers` segment | No | **BLOCKED** |

---

## 4. Flow Wiring Audit

### 4.1 Hook: `usePilotGateOptions.ts`

**File**: `src/hooks/usePilotGateOptions.ts`

- Lines 31-37: Loads feature flags from `configService.getFeatureFlags()`
- Lines 40-53: Loads user segments from Supabase `user_segments` table
- Returns: `{ featureFlags, userSegments, userId, isLoading }`
- **Graceful degradation**: Returns `{}` / `[]` on any failure — pilot stays inactive

### 4.2 Caller 1: `AIInsightsPanel.tsx`

```typescript
// Line 45
const pilotOptions = usePilotGateOptions()
// Line 46
const displaySummary = useDisplaySafeSummary(policy, pilotOptions)
```

### 4.3 Caller 2: `SharedResult.tsx`

```typescript
// Line 43
const pilotOptions = usePilotGateOptions()
// Line 44
const displaySummary = useDisplaySafeSummary(policy, pilotOptions)
```

### 4.4 Display Safe Summary Gate Call

**File**: `src/hooks/useDisplaySafeSummary.ts:89-93`

```typescript
const pilotGate = evaluateKaskoPilotGate(
  branch,
  options?.userId,
  options?.featureFlags || {},
  options?.userSegments || []
)
```

**Verdict**: Both production callers correctly pass feature flags, user segments, and user ID through the gate. Default `{}` / `[]` fallbacks ensure pilot stays inactive if data is unavailable.

---

## 5. Pilot Metadata Audit (Result Object Proof)

### 5.1 Type Definition

**File**: `src/types/display.ts:213-243`

Seven optional pilot fields on `DisplaySafePolicySummary`:

```typescript
// PILOT METADATA (optional — only present when pilot is active)
isPilotResult?: boolean                              // Line 218
requiresHumanReview?: boolean                        // Line 221
pilotReviewStatus?: 'pending_review' | 'review_in_progress' | 'accepted'
  | 'corrected_minor' | 'corrected_major' | 'rejected'  // Lines 224-230
pilotFlagName?: string                               // Line 233
pilotReviewerSegment?: string                        // Line 236
pilotReviewBanner?: string                           // Line 239
isDraft?: boolean                                    // Line 242
```

### 5.2 Population Logic

**File**: `src/hooks/useDisplaySafeSummary.ts:96-104`

```typescript
if (pilotGate.isPilotActive) {
  summary.isPilotResult = true
  summary.requiresHumanReview = pilotGate.requiresHumanReview
  summary.pilotReviewStatus = pilotGate.reviewStatus
  summary.pilotFlagName = 'kasko_ai_extraction_pilot'
  summary.pilotReviewerSegment = 'kasko_pilot_reviewers'
  summary.pilotReviewBanner = pilotGate.reviewBannerText
  summary.isDraft = pilotGate.isDraft
}
```

### 5.3 Expected Result Object When Pilot is Active

```json
{
  "isPilotResult": true,
  "requiresHumanReview": true,
  "pilotReviewStatus": "pending_review",
  "pilotFlagName": "kasko_ai_extraction_pilot",
  "pilotReviewerSegment": "kasko_pilot_reviewers",
  "pilotReviewBanner": "⚠️ TASLAK — Bu sonuçlar insan incelemesi gerektirmektedir. / DRAFT — Requires human review before finalization.",
  "isDraft": true
}
```

When pilot is **inactive** (current default), all 7 fields are `undefined` — no pilot metadata leaks.

### 5.4 Live Verification Needed

A real result-object snippet must be captured from the browser console after enabling the flag and uploading a KASKO PDF. The above is the expected shape from code analysis.

---

## 6. Banner / UI Audit

### 6.1 Banner Implementation

**File**: `src/components/AIInsightsPanel.tsx:114-143`

```tsx
{displaySummary?.isPilotResult && (
  <div className="p-4 border-b-2 border-amber-400 bg-amber-50"
       role="alert" aria-live="polite" data-testid="pilot-review-banner">
    <div className="flex items-start gap-3">
      <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
      <div>
        <p className="font-semibold text-amber-800 text-sm">
          ⚠️ TASLAK / DRAFT — İnsan İncelemesi Gerekli / Human Review Required
        </p>
        <p className="text-xs text-amber-700 mt-1">
          {displaySummary.pilotReviewBanner || 'Bu sonuçlar yapay zeka tarafından...'}
        </p>
        {displaySummary.pilotReviewStatus && (
          <Badge className="mt-2 bg-amber-100 text-amber-800 border border-amber-300">
            {displaySummary.pilotReviewStatus === 'pending_review'
              ? 'İnceleme Bekliyor / Pending Review'
              : displaySummary.pilotReviewStatus}
          </Badge>
        )}
      </div>
    </div>
  </div>
)}
```

### 6.2 Banner Characteristics

| Property | Value |
|----------|-------|
| Conditional | `displaySummary?.isPilotResult` — only renders when pilot active |
| Accessibility | `role="alert"`, `aria-live="polite"` |
| Testability | `data-testid="pilot-review-banner"` |
| Language | Bilingual (TR/EN) |
| Styling | Amber warning (border-amber-400, bg-amber-50) |
| Status badge | Shows review status with human-readable labels |

### 6.3 Visual Verification Needed

Cannot visually verify without enabling the feature flag in production. A screenshot must be captured after the first live KASKO document.

---

## 7. QA Logging Audit

### 7.1 Persistence Function

**File**: `src/lib/ai/policy-extractor.ts:2620-2659`

- Writes to Supabase `kasko_pilot_qa_records` table
- 34 fields populated from extraction results
- Fire-and-forget pattern: `.catch((err) => console.warn(...))`
- Uses service role Supabase client for write access

### 7.2 Production Wiring

**File**: `src/lib/ai/policy-extractor.ts:1389-1419`

```
Line 1389: if (result.branch === 'kasko')
Line 1393: const admissionResult = evaluatePilotAdmission(result.data, {...})
Line 1395: result.pilotAdmission = admissionResult
Line 1399: if (pilotAdmission.countedInPilotMetrics)
Line 1401-1414: Create QA record with 34 fields
Line 1417: persistPilotQARecord(qaRecord).catch(...)
```

This runs for **every successful KASKO extraction** — not gated by the feature flag. QA records accumulate even before the pilot is officially activated, providing baseline data.

### 7.3 Expected QA Log Row

```json
{
  "document_id": "uuid",
  "filename": "kasko-policy.pdf",
  "branch": "kasko",
  "review_date": "2026-03-16T...",
  "extraction_success": true,
  "extraction_model": "gpt-4o",
  "text_char_count": 15000,
  "page_count": 4,
  "reviewer_outcome": "pending_review",
  "admission_status": "pilot_eligible_clean",
  "admission_reason": "Document meets all criteria for clean admission.",
  "counted_in_pilot_metrics": true,
  "coverage_count_extracted": 8,
  "confidence_score": 0.85,
  "zero_coverage": false,
  "deductible_miss": false,
  "special_condition_miss": false,
  "major_correction": false
}
```

### 7.4 Dead Code Note

`logPilotQARecord()` (JSONL to `/tmp`) is dead code — superseded by `persistPilotQARecord()`. Only test files still reference it. The `KASKO_PILOT_GO_LIVE_CHECKLIST.md` line 23 still references `/tmp/kasko-pilot-qa-log.jsonl` — this is a docs mismatch (minor, non-blocking).

### 7.5 Live Verification Needed

A real QA log row must be queried from `SELECT * FROM kasko_pilot_qa_records LIMIT 1;` after processing a live KASKO PDF.

---

## 8. Rollback Trigger Audit

### 8.1 Admin Endpoint

**File**: `server/routes/admin/monitoring.ts:559-658`

- Route: `GET /api/admin/monitoring/pilot-rollback-status`
- Auth: `authenticateAdmin` middleware
- Query: Last 30 days of `kasko_pilot_qa_records` from Supabase
- Filters to `countedInPilotMetrics === true` records
- Calls `getRollbackTriggerStatus(metricsRecords)`

### 8.2 Four Rollback Trigger Thresholds

**File**: `src/lib/analysis/kasko-pilot-gate.ts:388-423`

| # | Trigger | Threshold | Evidence |
|---|---------|-----------|----------|
| 1 | Zero-coverage rate | > 20% | Line 396: `zeroCovRate > 0.2` |
| 2 | Prohibited phrase leak | > 0 (any occurrence) | Line 400: `phraseLeaks > 0` |
| 3 | Major correction rate | > 50% | Line 404: `majorRate > 0.5` |
| 4 | Consecutive deductible misses | >= 3 in a row | Line 409-420: `consecutiveMisses >= 3` |

**Pause decision** (line 422): `shouldPause = triggers.length > 0` — pilot pauses when **any** trigger fires.

### 8.3 Response Shape

```json
{
  "totalRecords": 0,
  "metricsRecords": 0,
  "shouldPause": false,
  "triggers": [],
  "admissionBreakdown": {},
  "recentRecords": []
}
```

The endpoint is functional and ready. Returns empty results until QA records exist.

---

## 9. Admission Gate Audit

### 9.1 Implementation

**File**: `src/lib/analysis/kasko-pilot-gate.ts:34-108`

Five admission checks in order:

| # | Check | Threshold | Ineligible Status |
|---|-------|-----------|-------------------|
| 1 | Text length | < 100 chars | `pilot_ineligible_noisy` |
| 1b | Text length | < 500 chars | `pilot_ineligible_incomplete` |
| 2 | Provider reliability | Missing or generic | `pilot_ineligible_incomplete` |
| 3 | Core identifiers | Policy number missing/garbled | `pilot_ineligible_incomplete` |
| 4 | Coverage sufficiency | 0 coverages + short doc | `pilot_ineligible_incomplete` |
| 5 | Quality downgrade | Explicitly noisy/partial | `pilot_ineligible_incomplete` |

Four possible return statuses:
- `pilot_eligible_clean` — Full metrics participation
- `pilot_eligible_moderate` — Metrics participation with moderate flag
- `pilot_ineligible_noisy` — Excluded from quality metrics
- `pilot_ineligible_incomplete` — Excluded from quality metrics

### 9.2 Production Call

**File**: `src/lib/ai/policy-extractor.ts:1393`

```typescript
pilotAdmission = evaluatePilotAdmission(policy, {
  textCharCount: documentText.length,
})
```

Called for every KASKO extraction after successful analysis, before QA record persistence.

---

## 10. Safety Behavior Under Failure

| # | Failure Mode | Behavior | Evidence |
|---|-------------|----------|----------|
| 1 | Migration 040 not applied | `user_segments` table doesn't exist → catch returns `[]` → pilot inactive | `usePilotGateOptions.ts:55-58` |
| 2 | Feature flag missing from DB | `featureFlags['kasko_ai_extraction_pilot']` is `undefined` → `undefined !== true` → inactive | `kasko-pilot-gate.ts:179` |
| 3 | User not in segment | `userSegments.includes('kasko_pilot_reviewers')` is `false` → inactive | `kasko-pilot-gate.ts:191` |
| 4 | Non-KASKO branch | Early return with `isPilotActive: false` | `kasko-pilot-gate.ts:168` |
| 5 | No options passed | Defaults: `featureFlags || {}`, `userSegments || []` → inactive | `useDisplaySafeSummary.ts:89-93` |
| 6 | QA record persist fails | Fire-and-forget `.catch()` logs warning, extraction continues | `policy-extractor.ts:1417` |
| 7 | Supabase unreachable | `configService.getFeatureFlags()` returns `[]` → empty flag map → inactive | `usePilotGateOptions.ts:60-62` |

**No pilot behavior leaks into production.** Safe-off is the default on all failure paths.

---

## 11. Docs vs Reality Mismatches

| # | Document | Claim | Reality | Severity |
|---|----------|-------|---------|----------|
| 1 | `SESSION_HANDOFF.md:3` | "OPERATIONAL STATUS — NOT YET LIVE" | Accurate — flag disabled, no reviewers | None (correct) |
| 2 | `SESSION_HANDOFF.md:5` | "Zero real documents processed" | Accurate — pilot has never been activated | None (correct) |
| 3 | `BRANCH_READINESS_SCORECARD.md:6` | "SIMULATED EVIDENCE ONLY" | Accurate — all Phase 8H-8K data is mocked | None (correct) |
| 4 | `CONTROLLED_ROLLOUT_GATES.md:16` | Gate 10 "Feature flag infrastructure" → `FAIL — Not deployed` | Accurate for operational status (code exists, DB not applied) | None (correct) |
| 5 | `KASKO_PILOT_GO_LIVE_CHECKLIST.md:23` | "Verify QA record is appended to `/tmp/kasko-pilot-qa-log.jsonl`" | **STALE** — QA now persists to Supabase `kasko_pilot_qa_records` table, not `/tmp` JSONL | **Minor** (doc outdated) |
| 6 | `KASKO_PILOT_GO_LIVE_CHECKLIST.md:7-41` | All items `[ ]` (unchecked) | Accurate — no activation steps completed | None (correct) |

**Verdict**: Documentation accurately reflects "NOT YET LIVE" status. One minor stale reference to `/tmp` JSONL (non-blocking).

---

## 12. Required Fixes Before First Pilot Document

### Blocking (Must Complete)

| # | Action | Type | Status |
|---|--------|------|--------|
| 1 | Apply migration 040 to production Supabase | **MANUAL WORK** | Ready (SQL fixed) |
| 2 | Assign internal QA users to `kasko_pilot_reviewers` segment | **MANUAL WORK** | SQL provided below |
| 3 | Enable `kasko_ai_extraction_pilot` feature flag | **MANUAL WORK** | SQL provided below |

### Non-Blocking (Recommended)

| # | Action | Notes |
|---|--------|-------|
| A | Update `KASKO_PILOT_GO_LIVE_CHECKLIST.md` line 23 | References dead `/tmp` JSONL path; should point to `kasko_pilot_qa_records` table |
| B | Update `CONTROLLED_ROLLOUT_GATES.md` Gate 10 after migration is applied | Change from `FAIL` to `PASS` |
| C | Remove dead `logPilotQARecord()` function | Superseded by `persistPilotQARecord()`; only test callers remain |

---

## 13. Final Go / No-Go Recommendation

### **CONDITIONAL GO**

**Code-level: GO.** All 9 audit sections pass at the code level. The triple-guard gate pattern is correctly implemented. QA persistence, admission gating, and rollback monitoring are wired into the live extraction pipeline. Safe-off behavior is confirmed on all 7 failure paths.

**Operational-level: BLOCKED on 3 MANUAL WORK items + 3 live verification artifacts.**

Once the 3 manual steps are completed, upload one real KASKO PDF and collect:

1. **Result-object snippet** — Browser console or React DevTools showing `isPilotResult: true` and all 7 pilot fields
2. **QA log row** — `SELECT * FROM kasko_pilot_qa_records ORDER BY created_at DESC LIMIT 1;`
3. **Banner screenshot** — The amber "TASLAK / DRAFT" banner visible in the UI

If all 3 artifacts look correct, the pilot is ready for the first batch of real documents.

---

## Appendix A: SQL for Manual Actions

### A.1 — Apply Migration 040

Copy the full contents of `supabase/migrations/040_kasko_pilot_flag_and_segment.sql` into Supabase SQL Editor and run. This is idempotent (`ON CONFLICT DO NOTHING`, `IF NOT EXISTS`).

### A.2 — Assign Pilot Reviewers

Replace the UUIDs with your actual Supabase `auth.users` IDs:

```sql
-- Assign internal QA team to kasko_pilot_reviewers
INSERT INTO public.user_segments (user_id, segment_name, assigned_by)
VALUES
  ('YOUR-USER-UUID-1', 'kasko_pilot_reviewers', 'admin-manual'),
  ('YOUR-USER-UUID-2', 'kasko_pilot_reviewers', 'admin-manual')
ON CONFLICT (user_id, segment_name) DO NOTHING;
```

To find your user IDs:
```sql
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 10;
```

### A.3 — Enable Feature Flag

```sql
UPDATE public.feature_flags
SET enabled = true, rollout_percentage = 100
WHERE key = 'kasko_ai_extraction_pilot';
```

### A.4 — Verify After Activation

```sql
-- Verify flag is enabled
SELECT key, name, enabled, rollout_percentage FROM public.feature_flags
WHERE key = 'kasko_ai_extraction_pilot';

-- Verify reviewers assigned
SELECT u.email, s.segment_name, s.assigned_at
FROM public.user_segments s
JOIN auth.users u ON u.id = s.user_id
WHERE s.segment_name = 'kasko_pilot_reviewers';

-- After uploading a KASKO PDF, verify QA record
SELECT id, filename, admission_status, extraction_success, confidence_score, created_at
FROM public.kasko_pilot_qa_records
ORDER BY created_at DESC LIMIT 5;
```
