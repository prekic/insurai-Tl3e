# Session Report — March 24, 2026

## 1. Executive Summary

**Completed:**
- Full endpoint/script parity analysis — 7 mismatches found and all resolved
- Critical script bug fix: `backfill_legacy_policies.ts` used wrong DB column names (`insured`/`end_date` → `insured_person`/`expiry_date`) — these would have caused silent failures or wrong-column writes on production
- Hardened backfill pilot endpoint with confirm gate, pagination, targeted IDs, per-record deltas, post-write verification, warnings, and a new verify endpoint
- Removed phantom `end_date` column reference from endpoint (column doesn't exist in schema)
- Operator runbook with exact curl commands, go/no-go checklist, acceptance criteria, staged rollout plan, rollback procedures, pilot report template
- Analysis tool (`analyze-pilot-results.ts`) to parse live pilot JSON into structured report with automated safety checks
- All files lint-clean (0 errors, 0 warnings), server type-check passes
- All changes committed and pushed to branch, PR #299 updated

**Remains blocked:**
- PR #299 merge + Railway deployment
- Admin credentials for live execution
- Real pilot data (no fabrication permitted)

**Ready for live limited pilot?** YES — once deployed
**Ready for broader rollout?** NO — blocked until pilot evidence is clean

---

## 2. Files Changed

| File | Why Changed | Risk Level |
|------|-------------|------------|
| `server/routes/admin/backfill.ts` | Hardened endpoint: confirm gate, offset, ids, deltas, verify endpoint, removed phantom `end_date` column, documented canonical precedence rules | Low |
| `server/routes/admin/index.ts` | Register backfill router (prior commit) | Low |
| `scripts/backfill_legacy_policies.ts` | Fix `p.insured`→`p.insured_person`, `p.end_date`→`p.expiry_date`, `update({insured:..., end_date:...})`→`update({insured_person:..., expiry_date:...})` | **Medium** (fixes real bug that would cause silent production failures) |
| `scripts/analyze-pilot-results.ts` | New — pilot output analysis tool with automated safety checks | Low |
| `docs/BACKFILL_PILOT_RUNBOOK.md` | New — complete operator runbook | Low |
| `SESSION_HANDOFF.md` | Updated with session state, DB column reference, next steps | Low |

---

## 3. Endpoint / Script Parity Review

### Mismatches Found (7)

| # | Mismatch | Script (before fix) | Endpoint | Resolution |
|---|----------|---------------------|----------|------------|
| 1 | Insured column name | `p.insured` (WRONG — column doesn't exist) | `p.insured_person` (correct) | Fixed script |
| 2 | Expiry column name | `p.end_date` (WRONG — column doesn't exist) | `p.expiry_date` (correct) | Fixed script |
| 3 | Update column names | `update({ insured: ..., end_date: ... })` (WRONG) | `update({ insured_person: ..., expiry_date: ... })` (correct) | Fixed script |
| 4 | Date presence check | Checked only `p.end_date` | Checks `p.expiry_date` | Both now aligned to `expiry_date` |
| 5 | Phantom `end_date` in SELECT | N/A (uses `select('*')`) | Removed from `POLICY_SELECT` constant | Fixed endpoint |
| 6 | Re-extraction support | Yes (calls OpenAI for `requiresReExtraction` bucket) | No (classifies only, does not call AI) | Intentional — endpoint is safer for pilot. CLI script handles AI re-extraction when needed. |
| 7 | Post-write verification | None | Re-reads row after each update, checks legacy array counts | Endpoint is safer — script does not verify |

### Final Canonical Precedence Rules (documented in both files' header comments)

1. **DB header columns win** if already populated → bucket: `modern`, no action
2. **Missing headers recovered from JSONB** via source chain:
   - `insured`: `raw_data.insured.name` → `raw_data.insuredName` → `extracted_data.insured.name` → `extracted_data.insured` (string) → `extracted_data.metadata.insured`
   - `start_date`: `raw_data.startDate` → `extracted_data.startDate`
   - `expiry_date`: `raw_data.endDate` → `extracted_data.expiryDate` → `raw_data.expiryDate`
3. **If still missing but `raw_data.processedText` exists** → bucket: `requiresReExtraction`. The admin endpoint classifies only; the CLI script handles AI calls.
4. **No processedText, no recoverable headers** → bucket: `unrecoverable`. Shows "Doğrulanamadı" / "Cannot Verify" in reviewer output.
5. **Legacy structured arrays** (`coverages`, `exclusions`, `insights`) in `raw_data` are **NEVER overwritten** by any hydration path.

### DB Column Reference (authoritative, from `supabase/migrations/001_initial_schema.sql`)

| Column | Type |
|--------|------|
| `insured_person` | TEXT NOT NULL |
| `start_date` | DATE NOT NULL |
| `expiry_date` | DATE NOT NULL |

There is **NO** column named `insured` or `end_date` in the policies table.

---

## 4. Endpoint Hardening

### Auth/Safety Review
- `authenticateAdmin` middleware on all 3 routes
- `requireSuperAdmin()` middleware on all 3 routes
- All operations audit-logged via `logAdminAction()`

### Write Safety Gate
- POST returns `400 Bad Request` with hint unless body contains `"confirm": true`
- This prevents accidental writes from curl/tooling mistakes

### Pagination
- `offset` query param for ordered scanning (default 0)
- `limit` query param (default 10, max 200)
- Uses Supabase `.range(offset, offset + limit - 1)` for deterministic pagination

### Targeted Writes
- `ids` body param (string array) for processing specific records only
- When `ids` provided, `offset`/`limit` are ignored
- Useful for retries on specific failed records

### Response Shape Improvements

**Dry-run response** (`GET`): Each record includes `bucket`, `current` (DB state), `proposed` (what would be written), `deltas` (field-by-field before/after with `changed` flag), `legacy_arrays` (counts).

**Write response** (`POST`) adds per-record: `write_action` (`updated`/`skipped_no_changes`/`skipped_wrong_bucket`/`error`), `write_error` (if failed), `verification` (`legacy_arrays_before`, `legacy_arrays_after`, `arrays_stable`).

**Write response** also adds aggregate `write_summary`: `{ attempted, updated, skipped, errors, all_arrays_stable }`.

### Idempotency / Repeatability
- Re-running on already-updated records → `skipped_no_changes` (proposed matches current values)
- Safe to retry any number of times
- No duplicate-write risk

### Dry-Run vs Write Guarantees
- GET handler contains zero `.update()` calls — structurally impossible to write
- POST handler requires `confirm: true` in body — returns 400 without it
- POST only processes `recoverableFromRawData` bucket records
- POST never touches `requiresReExtraction` or `unrecoverable` records

### Verify Endpoint
- `GET /backfill/verify?ids=uuid1,uuid2` — spot-check specific records post-write
- Returns current DB state + legacy array counts + `has_processed_text` flag
- Max 50 IDs per request

---

## 5. Pilot Execution Package

### Exact Commands

```bash
# Step 1: Login
TOKEN=$(curl -s -X POST \
  https://insurai-production.up.railway.app/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "Token: ${TOKEN:0:20}..."

# Step 2: Dry-Run
curl -s \
  "https://insurai-production.up.railway.app/api/admin/backfill/pilot?limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool | tee pilot_dry_run.json

# Step 3: Review dry-run output (see go/no-go checks below)

# Step 4: Execute Write (ONLY after dry-run passes all checks)
curl -s -X POST \
  "https://insurai-production.up.railway.app/api/admin/backfill/pilot" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true, "limit": 10}' \
  | python3 -m json.tool | tee pilot_write.json

# Step 5: Post-Write Verification
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

# Step 6: Analyze Results
npx tsx scripts/analyze-pilot-results.ts pilot_write.json
```

### Go/No-Go Checks Before Write

- No records have `proposed.source` other than `'raw_data'`
- No proposed dates look like today's date (would indicate fake fallback)
- No proposed `insured_person` is `"-"`, `"N/A"`, or empty string
- All proposed dates match `YYYY-MM-DD` format (check `warnings` array)
- `legacy_arrays` counts are reasonable (not all zeros unless expected)
- `errors` array is empty
- Proposed values look like real insurance data (Turkish names, real date ranges)

### Pilot Acceptance Criteria

The limited pilot is successful if ALL of these are true:
- Only `insured_person`, `start_date`, `expiry_date` columns were modified
- Legacy arrays (`coverages`, `exclusions`, `insights`) counts unchanged for every record
- No record received a current-day date as a fallback
- No record received `insured_person = "-"` or empty string
- No `requiresReExtraction` or `unrecoverable` records were written to
- Post-write verification confirms `all_arrays_stable: true`
- Proposed values came from `raw_data` / `extracted_data`, not from AI re-extraction
- At least 1 record was successfully hydrated (pilot produced evidence)

### Pilot Report Template

```
PILOT COHORT SUMMARY
  Total scanned:          ___
  Modern (no action):     ___
  Recoverable:            ___
  Requires re-extraction: ___
  Unrecoverable:          ___
  Actually updated:       ___
  Skipped (no changes):   ___
  Errors:                 ___

BEFORE / AFTER EXAMPLES (2-3 records)

  Record 1: [ID]
    Before: insured_person=___ start_date=___ expiry_date=___
    After:  insured_person=___ start_date=___ expiry_date=___
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

## 6. Post-Pilot Analysis Tools

### Script: `scripts/analyze-pilot-results.ts`

**Usage:**
```bash
npx tsx scripts/analyze-pilot-results.ts pilot_dry_run.json
npx tsx scripts/analyze-pilot-results.ts pilot_write.json
```

**Input:** JSON file saved from the backfill pilot endpoint response (the raw curl output).

**Output:** Structured text report containing:
- Cohort summary (total, per-bucket counts)
- Write summary (attempted, updated, skipped, errors, `all_arrays_stable`)
- Per-record detail: ID, policy number, type, provider, bucket, array counts, write action, deltas
- Per-record verification: `arrays_stable` flag, before/after counts if unstable
- Warnings list
- Errors list
- Automated safety checks:
  - Only header fields hydrated? (no wrong-bucket writes)
  - Any legacy arrays changed? (checks verification results)
  - Any current-day date fallback? (compares proposed dates to today)
  - Any misleading insured rendering? (checks for `"-"`, `""`, `"N/A"`)
- Final recommendation: READY / NOT READY

**No fabricated data:** The script only reads and analyzes real pilot output files. It does not generate sample data.

---

## 7. Broader Rollout Plan

### Staged Approach

| Stage | Scope | Method | Gate to Next |
|-------|-------|--------|--------------|
| **1** | 10 records | `limit=10` | Manual QA of every record. All acceptance criteria pass. |
| **2** | 50 records | `limit=50` | Zero array corruption. Analysis script reports READY. Spot-check 5 records via verify endpoint. |
| **3** | 200 records | `limit=200` | Automated verification passes. Sampling QA on 10 records. Acceptable unrecoverable rate documented. |
| **4** | Full population | Remove limit (paginate with offset) | Stage 3 results approved. Rollback procedure verified on test record. |

### Gating Criteria Between Stages

- Zero `CRITICAL: Legacy arrays changed` errors across all stages
- All `write_summary.all_arrays_stable === true`
- No date-format warnings in `warnings` array (or all reviewed and accepted)
- Acceptable unrecoverable rate documented (expected: these show "Cannot Verify")
- Manual QA signs off representative examples from each bucket
- No auth or audit issues in Railway logs

### Segmentation Options

- `offset` / `limit` for ordered pagination through the full population
- `ids` for targeted subsets (specific providers, policy types, etc.)
- Future enhancement (not implemented): filter by `type`, `provider`, or `bucket` in query params

### Rollback / Recovery Plan

**Identify impacted rows:** Check audit logs for `backfill_pilot_execute` action.

**Revert specific records:** The `pilot_write.json` output contains `current` values for every processed record. Use these as rollback source:
```sql
UPDATE policies SET
  insured_person = 'PREVIOUS_VALUE_FROM_current',
  start_date = 'PREVIOUS_DATE_FROM_current',
  expiry_date = 'PREVIOUS_DATE_FROM_current'
WHERE id = 'POLICY_UUID';
```

**Re-run safely:** Endpoint is idempotent — re-running on already-updated records produces `skipped_no_changes`.

### Recommended Pre-Rollout Backup

Before Stage 3+, consider a targeted DB export:
```sql
COPY (
  SELECT id, policy_number, insured_person, start_date, expiry_date
  FROM policies
  WHERE insured_person IS NULL OR start_date IS NULL OR expiry_date IS NULL
) TO STDOUT WITH CSV HEADER;
```

---

## 8. Edge Cases and Handling Rules

| Edge Case | Handling | Rationale |
|-----------|----------|-----------|
| Insured name found in OCR but ambiguous | Accept if non-empty string; never fabricate | Prefer real data over absence |
| Malformed date (not YYYY-MM-DD) | Add to `warnings` array; still propose. Operator reviews before write. | Supabase may reject bad dates at DB level. Better to surface and let operator decide. |
| Single date present, other missing | Classify as `requiresReExtraction` (both dates needed for `recoverable` bucket) | Partial dates are misleading — better to require both or none |
| Mixed legacy shapes in raw_data / extracted_data | Recovery chain tries all known paths in order; returns null if none match | Deterministic, no guessing |
| processedText present but poor quality | Classified as `requiresReExtraction` but NOT processed by endpoint | Quality assessment deferred to AI re-extraction path (CLI script) |
| Record appears modern but has inconsistent fields | `modern` classification stands — DB columns take precedence | If DB says it has data, trust it. |
| Array counts stable but content semantically drifted | Out of scope — endpoint verifies counts only | Content is never touched; count verification is the safety invariant. |
| Re-running endpoint after successful write | `skipped_no_changes` because proposed == current | Safe idempotency — no duplicate writes |
| `insured_person` is a company name with merged Turkish legal entity tokens | Endpoint writes the value as-is from raw_data. Display normalization happens in rendering layer. | Backfill should not apply display transformations |
| Proposed insured is `"-"` or empty string | Analysis tool flags this in safety checks. Endpoint does not block (defers to operator). | Could be legitimate edge case; operator makes the call |
| Date looks like current day | Analysis tool flags this. Endpoint does not block. | Should never happen since we recover from historical raw_data, but flagged defensively |

---

## 9. Validation Performed

| Command | Result |
|---------|--------|
| `npx tsc -p server/tsconfig.json --noEmit` | Clean (0 errors) |
| `npx tsc --noEmit --strict scripts/analyze-pilot-results.ts` | Clean (0 errors) |
| `npx eslint server/routes/admin/backfill.ts scripts/backfill_legacy_policies.ts scripts/analyze-pilot-results.ts` | Clean (0 errors, 0 warnings) |
| `git push -u origin claude/load-project-context-HpU30` | Success (`c315dfa..c151502`) |
| PR #299 updated via GitHub API | Success (title + body updated) |

**Intentionally NOT run:**
- Full test suite (`npm test`) — not justified. Changes are in new admin routes and CLI scripts with no impact on existing test-covered code. The endpoint uses only Supabase CRUD calls and pure functions; no shared modules were modified. Running 15,800+ tests for a new isolated admin endpoint would take 10+ minutes with no additional safety value.

---

## 10. Documentation / Handoff Updates

| Document | Action |
|----------|--------|
| `SESSION_HANDOFF.md` | Full rewrite — current state, DB column reference, commit list, non-negotiable rules, next steps for operator |
| `docs/BACKFILL_PILOT_RUNBOOK.md` | New — complete operator guide with commands, checklists, rollback, staged rollout |
| PR #299 description | Updated — full scope, safety guarantees, files changed, test plan |
| `server/routes/admin/backfill.ts` header comment | Added canonical precedence rules and DB column reference |
| `scripts/backfill_legacy_policies.ts` header comment | Added canonical precedence rules and DB column reference |

### What Future Operator Should Do Next

1. **Merge PR #299** and wait for Railway deployment
2. **Follow `docs/BACKFILL_PILOT_RUNBOOK.md`** step by step: Login → dry-run → inspect → go/no-go → write → verify
3. **Save all JSON outputs** (`pilot_dry_run.json`, `pilot_write.json`, `pilot_verify.json`)
4. **Run analysis**: `npx tsx scripts/analyze-pilot-results.ts pilot_write.json`
5. **Fill out pilot report template** with real data
6. If pilot passes → proceed to Stage 2 (50 records)
7. If any `CRITICAL` errors → stop and investigate before continuing

### What NOT to Touch

- Legacy arrays (`coverages`, `exclusions`, `insights`) — remain authoritative
- `raw_data` JSONB — endpoint never modifies it
- Translation skeleton file — must remain empty-string only
- Re-extraction path — deferred to CLI script with explicit approval
- Full test suite — do not run without justification

---

## 11. Final Recommendation

### Ready for live limited pilot: **YES**

After PR merge and Railway deployment, the endpoint is production-safe with: confirm gate preventing accidental writes, super_admin authentication, post-write verification, audit logging, idempotent re-run safety, operator runbook with exact commands, analysis tool for automated safety checks.

### Ready for broader rollout: **NO**

Blocked until Stage 1 pilot evidence is produced and verified with real data. Specifically need: at least 1 successful record hydration as evidence, `all_arrays_stable: true` confirmed on real data, filled pilot report template with real before/after examples, analysis tool reporting "READY for broader rollout".
