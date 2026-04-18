# Runbook: Phase E — KASKO Pilot Production Scale-Up

This runbook covers advancing the KASKO pilot from internal-reviewer-only (Phase D) to production-wide rollout. Use this after CLAUDE.md "Next Session Instructions" items for Phase D have cleared and the rollback-trigger monitor has been quiet for 14 consecutive days.

## Context

Phase D gates KASKO AI extraction behind two toggles:

1. `feature_flags.enabled` on `kasko_ai_extraction_pilot`
2. Membership in the `kasko_pilot_reviewers` segment (table `user_segments`)

Phase E adds a **third** sub-filter: `feature_flags.rollout_percentage`. Deterministic per-user bucketing via `computeRolloutBucket(userId, flagKey)` lets us admit a controlled fraction of segment members at each step. The segment is still the primary gate — rollout % only filters within the segment.

**Safe-off design**: every step is reversible by setting `rollout_percentage = 0` in the admin UI. The feature flag stays `enabled=true`; Phase D behavior resumes instantly.

---

## 1. Entry Criteria

All five must hold before starting Phase E.

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1.1 | Pilot sample count ≥ 50 | Admin UI → Extraction Health → Pilot Monitoring Tile (D1) or SQL `SELECT COUNT(*) FROM kasko_pilot_qa_records WHERE counted_in_pilot_metrics = true` |
| 1.2 | Zero rollback triggers fired for 14 consecutive days | `GET /api/admin/monitoring/pilot-rollback-status` returns `{ shouldPause: false }` daily for 14 days |
| 1.3 | Bugs #9, #13, #14 shipped to production | `git log main --oneline | grep -E "discounts|niche|confidence-penalty"` — all three should appear |
| 1.4 | MIN_SAMPLE_SIZE reverted to 50 in `src/lib/policy-evaluation/calibration.ts` | `grep -n MIN_SAMPLE_SIZE src/lib/policy-evaluation/calibration.ts` → must be `50` |
| 1.5 | Production-mode calibration applied | `npx tsx scripts/calibrate-grade-thresholds.ts --production --apply` ran successfully and wrote an audit row (see `app_settings.evaluation.grade_thresholds_last_calibrated`) |

If any row is `—`, **do not advance**. Investigate, remediate, wait for the monitor to re-clear, then re-check.

---

## 2. Rollout Ladder

Phase E is coarse by design (product decision: rely on rollback-trigger monitoring rather than drag out soak windows):

| Step | `rollout_percentage` | Soak window | Advance criterion |
|------|:-:|:-:|-------------------|
| E1 | **25** | 7 calendar days | `shouldPause=false` for the full 7 days |
| E2 | **100** | — | Phase F planning begins |

Each step advances only if the rollback monitor stays clean for the full soak window. Any trigger fire → instant rollback (see §5).

---

## 3. Advancing a Rollout Step

### 3.1 Set the percentage

1. Admin UI → **Configuration** → **Feature Flags**
2. Locate `kasko_ai_extraction_pilot`
3. Set `rolloutPercentage` to `25` (E1) or `100` (E2) via the slider/input
4. Click Save. Webhook fires `feature_flag.toggled` for downstream automation.

Equivalent SQL (emergency path only — prefer UI for audit trail):

```sql
UPDATE public.feature_flags
SET rollout_percentage = 25, updated_at = NOW()
WHERE key = 'kasko_ai_extraction_pilot';
```

### 3.2 Monitor daily

Every 24h during the soak window:

```bash
curl -sH "Authorization: Bearer $ADMIN_TOKEN" \
  "$FRONTEND_URL/api/admin/monitoring/pilot-rollback-status" | jq '.data'
```

Assert:
- `.shouldPause == false`
- `.triggers` is an empty array
- `.metricsRecords` is trending up (sample is growing)
- `.calibration.sampleCount >= 50` (must remain true)

Also check the admin Monitoring → Pilot Rollback Status tile (D1) which surfaces the same data plus the last calibration audit record.

### 3.3 Advance only if clean

Do **not** advance to E2 if any trigger fires during the E1 soak — even once. If clean for 7 calendar days (full days, not fewer), proceed to E2 by repeating 3.1 with `rolloutPercentage=100`.

---

## 4. Managing Reviewers (Segment Membership)

Phase E still requires users to be in `kasko_pilot_reviewers` before the rollout bucket applies. Use the admin UI tab introduced in this session.

### 4.1 View current members

Admin UI → **Segments** → ensure `kasko_pilot_reviewers` is selected in the dropdown. Table shows `user_id`, `assigned_at`, and (if tracked) `assigned_by`.

### 4.2 Bulk-add members

1. Click **Add Members**
2. Paste one UUID per line (or separated by spaces/commas) into the textarea
3. The UI validates each token client-side; invalid rows appear under "Invalid" and are skipped silently
4. Click **Add N users**
5. Summary shows `Added: N · Already assigned: M · Errors: K`

The endpoint is `POST /api/admin/segments` — one request per user. The 409 `ALREADY_ASSIGNED` response is treated as a no-op.

### 4.3 Remove a member

Click the red trash icon in the member's row. Requires confirmation. DELETE hits `/api/admin/segments/:userId/kasko_pilot_reviewers`.

### 4.4 Finding user UUIDs

The admin UI does **not** currently resolve emails → UUIDs (follow-up task). Three options to obtain UUIDs:

**Option A — Supabase Studio**:
1. Authentication → Users
2. Filter by email
3. Copy the UUID column

**Option B — SQL**:
```sql
SELECT id, email, created_at
FROM auth.users
WHERE email IN ('reviewer1@example.com', 'reviewer2@example.com')
ORDER BY created_at DESC;
```

**Option C — CLI** (requires local `.env` with `SUPABASE_SERVICE_ROLE_KEY`):
```bash
npx tsx -e "
  import 'dotenv/config'
  import { createClient } from '@supabase/supabase-js'
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const r = await s.auth.admin.listUsers({ page: 1, perPage: 100 })
  console.log(r.data.users
    .filter(u => ['a@x.com','b@x.com'].includes(u.email))
    .map(u => ({ id: u.id, email: u.email })))
"
```

---

## 5. Rollback Protocol

### 5.1 Any rollback trigger fires

Immediate action, within minutes:

1. Admin UI → Configuration → Feature Flags → `kasko_ai_extraction_pilot`
2. Set `rolloutPercentage = 0` — **leave `enabled=true`**

This reverts the pilot to Phase D behavior: only segment members see pilot extraction, and all Phase D safety nets stay in place.

Emergency SQL:

```sql
UPDATE public.feature_flags
SET rollout_percentage = 0, updated_at = NOW()
WHERE key = 'kasko_ai_extraction_pilot';
```

### 5.2 Investigate

Pull recent QA records:

```sql
SELECT document_id, review_date, admission_status, triggers_fired,
       zero_coverage, major_correction, deductible_miss, phrase_clean
FROM kasko_pilot_qa_records
WHERE counted_in_pilot_metrics = true
  AND review_date > NOW() - INTERVAL '7 days'
ORDER BY review_date DESC
LIMIT 50;
```

The four triggers (zero-coverage rate >20%, phrase leak, major-correction rate >50%, 3+ consecutive deductible misses) are defined in `getRollbackTriggerStatus()` at `src/lib/analysis/kasko-pilot-gate.ts:453-488`.

### 5.3 Re-advance

Only re-advance after three consecutive clean days post-remediation. Return to §3.

---

## 6. Draft Label Removal (Phase F preview)

Once Phase E E2 (100%) has soaked for ≥ 14 days with zero triggers and ≥ 100 new samples, Phase F will lift the TASLAK/DRAFT label on pilot extractions. This is documented in a separate runbook (TBD) because it requires:

- Reviewer acceptance-rate metrics > 95%
- Zero prohibited-phrase leaks for 30 days
- Calibration thresholds re-computed under production sample size

Phase F is out of scope for this runbook.

---

## Appendix A — Useful SQL

### A.1 Current segment members
```sql
SELECT user_id, assigned_at, assigned_by
FROM public.user_segments
WHERE segment_name = 'kasko_pilot_reviewers'
ORDER BY assigned_at DESC;
```

### A.2 Rollback triggers by day (last 30 days)
```sql
SELECT DATE(review_date) AS day,
       COUNT(*) AS records,
       COUNT(*) FILTER (WHERE zero_coverage) AS zero_cov,
       COUNT(*) FILTER (WHERE major_correction) AS major_corr,
       COUNT(*) FILTER (WHERE NOT phrase_clean) AS phrase_leaks
FROM public.kasko_pilot_qa_records
WHERE counted_in_pilot_metrics = true
  AND review_date > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

### A.3 Per-user bucket lookup (dry-run which users would be in at 25%)

There's no built-in SQL query — the bucket is computed JS-side via `hashString(userId + 'kasko_ai_extraction_pilot') % 100`. To preview, run:

```bash
npx tsx -e "
  import { computeRolloutBucket } from './src/lib/config/rollout-hash'
  const ids = ['uuid-1', 'uuid-2', 'uuid-3']
  for (const id of ids) {
    const b = computeRolloutBucket(id, 'kasko_ai_extraction_pilot')
    console.log({ userId: id, bucket: b, activeAt25: b < 25 })
  }
"
```

### A.4 Last calibration audit
```sql
SELECT value FROM public.app_settings
WHERE category = 'evaluation'
  AND key = 'grade_thresholds_last_calibrated';
```
Returns JSON `{ appliedAt, sampleCount, forced, minSample, production, filterType, thresholds }`.

---

## Appendix B — Verification Commands

### B.1 Confirm rollout bucketing is deterministic
```bash
npx vitest run src/lib/analysis/__tests__/kasko-pilot-gate.test.ts
```
Must show 29/29 pass including the "bucket assignment is deterministic per userId" and "50% rollout buckets ~half of 1000 synthetic users" tests.

### B.2 Confirm admin segments API is reachable
```bash
curl -sH "Authorization: Bearer $ADMIN_TOKEN" \
  "$FRONTEND_URL/api/admin/segments?name=kasko_pilot_reviewers" | jq
```

### B.3 Force a single user's bucket (debug)
Same as A.3 above — call `computeRolloutBucket()` directly with a specific UUID.

---

## Related Files

- `src/lib/config/rollout-hash.ts` — shared `computeRolloutBucket()` helper
- `src/lib/analysis/kasko-pilot-gate.ts` — gate logic with rollout bucket check (Phase E)
- `src/hooks/usePilotGateOptions.ts` — surfaces `rolloutPercentage` per flag
- `src/components/admin/tabs/SegmentsTab.tsx` — reviewer management UI
- `server/routes/admin/segments.ts` — backend API for member CRUD
- `server/routes/admin/monitoring.ts` — rollback status + calibration tile data
- `scripts/calibrate-grade-thresholds.ts` — production calibration script (`--production` flag)
