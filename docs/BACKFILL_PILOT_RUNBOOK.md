# Legacy Header Hydration — Backfill Pilot Runbook

> Last updated: March 24, 2026

## Purpose

Hydrate missing header fields (`insured_person`, `start_date`, `expiry_date`) on legacy policy records using values already present in `raw_data` / `extracted_data` JSONB columns. Legacy structured arrays (`coverages`, `exclusions`, `insights`) are NEVER modified.

---

## Prerequisites

- PR #299 merged to `main` and deployed to Railway
- Admin account with `super_admin` role
- `curl` and `python3` (or `jq`) available locally

---

## 1. Obtain Admin JWT

```bash
TOKEN=$(curl -s -X POST \
  https://insurai-production.up.railway.app/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "Token: ${TOKEN:0:20}..."
```

If this fails, check `/api/admin/diagnostics` (no auth required) for config issues.

---

## 2. Run Dry-Run

```bash
curl -s \
  "https://insurai-production.up.railway.app/api/admin/backfill/pilot?limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool | tee pilot_dry_run.json
```

### What to inspect in dry-run output

| Field | What to check |
|-------|---------------|
| `data.total` | Should equal the requested limit |
| `data.buckets` | Breakdown across 4 categories |
| `data.records[].bucket` | Each record's classification |
| `data.records[].current` | Current DB values (may show nulls) |
| `data.records[].proposed` | What would be written (only for `recoverableFromRawData`) |
| `data.records[].deltas` | Per-field before/after with `changed` flag |
| `data.records[].legacy_arrays` | Coverage/exclusion/insight counts (must NOT change) |
| `data.warnings` | Date format warnings, suspicious values |
| `data.errors` | Should be empty for dry-run |

### Go / No-Go Checks

Before proceeding to write, verify ALL of these:

- [ ] No records have `proposed.source` other than `'raw_data'`
- [ ] No proposed dates look like today's date (would indicate fake fallback)
- [ ] No proposed `insured_person` is `"-"`, `"N/A"`, or empty string
- [ ] All proposed dates match `YYYY-MM-DD` format (check `warnings` array)
- [ ] `legacy_arrays` counts are reasonable (not all zeros unless expected)
- [ ] `errors` array is empty
- [ ] Proposed values look like real insurance data (Turkish names, real date ranges)

---

## 3. Execute Write

Only after dry-run passes all checks:

```bash
curl -s -X POST \
  "https://insurai-production.up.railway.app/api/admin/backfill/pilot" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true, "limit": 10}' \
  | python3 -m json.tool | tee pilot_write.json
```

**Note:** Without `"confirm": true`, the endpoint returns 400. This is a safety gate.

### Write output inspection

| Field | Expected |
|-------|----------|
| `data.write_summary.updated` | Number of records actually modified |
| `data.write_summary.skipped` | Records where proposed == current |
| `data.write_summary.errors` | Should be 0 |
| `data.write_summary.all_arrays_stable` | **MUST be `true`** |
| `data.records[].write_action` | `updated`, `skipped_no_changes`, or `skipped_wrong_bucket` |
| `data.records[].verification` | Post-write array count check per record |

### CRITICAL: If `all_arrays_stable` is `false`

**STOP immediately.** Check `data.errors` for records with `CRITICAL: Legacy arrays changed`. These records need manual investigation in the Supabase SQL Editor.

---

## 4. Post-Write Verification

Verify specific records by ID:

```bash
# Extract IDs of updated records from write output
UPDATED_IDS=$(python3 -c "
import json
with open('pilot_write.json') as f:
    data = json.load(f)['data']
ids = [r['id'] for r in data['records'] if r.get('write_action') == 'updated']
print(','.join(ids))
")

curl -s \
  "https://insurai-production.up.railway.app/api/admin/backfill/verify?ids=$UPDATED_IDS" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool | tee pilot_verify.json
```

---

## 5. Pagination for Larger Cohorts

Use `offset` to page through records:

```bash
# Page 1 (records 0-9)
curl -s "https://...backfill/pilot?limit=10&offset=0" -H "Authorization: Bearer $TOKEN"

# Page 2 (records 10-19)
curl -s "https://...backfill/pilot?limit=10&offset=10" -H "Authorization: Bearer $TOKEN"
```

For write with specific IDs:

```bash
curl -s -X POST "https://...backfill/pilot" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true, "ids": ["uuid-1", "uuid-2", "uuid-3"]}'
```

---

## 6. Rollback Procedure

If a write produces incorrect results:

### Manual SQL rollback (Supabase SQL Editor)

```sql
-- Revert a specific record to its previous values
UPDATE policies SET
  insured_person = 'PREVIOUS_VALUE',
  start_date = 'PREVIOUS_DATE',
  expiry_date = 'PREVIOUS_DATE'
WHERE id = 'POLICY_UUID';
```

The `pilot_write.json` output contains `current` values for every processed record — use these as the rollback source.

### Identify all records updated by backfill

```sql
-- Check audit_logs for backfill actions
SELECT * FROM audit_logs
WHERE action LIKE 'backfill_pilot_%'
ORDER BY created_at DESC;
```

---

## 7. Acceptance Criteria

The limited pilot is successful if ALL of these are true:

- [ ] Only `insured_person`, `start_date`, `expiry_date` columns were modified
- [ ] Legacy arrays (`coverages`, `exclusions`, `insights`) counts are unchanged for every record
- [ ] No record received a current-day date as a fallback
- [ ] No record received `insured_person = "-"` or empty string
- [ ] No `requiresReExtraction` or `unrecoverable` records were written to
- [ ] Post-write verification confirms `all_arrays_stable: true`
- [ ] Proposed values came from `raw_data` / `extracted_data`, not from AI re-extraction
- [ ] At least 1 record was successfully hydrated (pilot produced evidence)

---

## 8. Pilot Report Template

After execution, fill this with real data:

```
PILOT COHORT SUMMARY
  Total scanned:         ___
  Modern (no action):    ___
  Recoverable:           ___
  Requires re-extraction: ___
  Unrecoverable:         ___
  Actually updated:      ___
  Skipped (no changes):  ___
  Errors:                ___

BEFORE / AFTER EXAMPLES (2-3 records)

  Record 1: [ID]
    Before: insured=___ start_date=___ expiry_date=___
    After:  insured=___ start_date=___ expiry_date=___
    Source: raw_data
    Legacy arrays changed: NO
    Coverages: ___ Exclusions: ___ Insights: ___

  Record 2: [ID]
    ...

SAFETY CHECK
  Only header fields hydrated?           YES/NO
  Any legacy arrays changed?             YES/NO
  Any current-day date fallback?         YES/NO
  Any misleading insured rendering?      YES/NO

RECOMMENDATION
  Ready for broader rollout?             YES/NO
```

---

## 9. Staged Rollout Plan

| Stage | Scope | Gate |
|-------|-------|------|
| 1 | 10 records (this pilot) | Manual QA of every record |
| 2 | 50 records | Zero array corruption, <5% unrecoverable |
| 3 | 200 records | Automated verification passes, sampling QA |
| 4 | Full population | Stage 3 results approved, rollback procedure verified |

### Gating criteria between stages

- Zero `CRITICAL: Legacy arrays changed` errors
- All `write_summary.all_arrays_stable === true`
- No date-format warnings in `warnings` array
- Acceptable unrecoverable rate documented
- Manual QA signs off representative examples from each bucket

### Segmentation options

- `offset` / `limit` for ordered pagination
- `ids` for targeted subsets
- Future: filter by `type` (kasko, traffic, etc.) or `provider`

---

## 10. What NOT to Do

- Do NOT run the full test suite (`npm test`) during pilot — it takes 10+ minutes
- Do NOT use the CLI script (`scripts/backfill_legacy_policies.ts`) for re-extraction without explicit approval
- Do NOT write to `requiresReExtraction` or `unrecoverable` records via this endpoint
- Do NOT modify `raw_data` through this endpoint — it only updates DB header columns
- Do NOT use fabricated/mocked data for pilot evidence
- Do NOT proceed to Stage 2+ without documented Stage 1 evidence
