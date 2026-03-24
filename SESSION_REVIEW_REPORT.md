# Final Pre-Pilot Code Review Report — March 24, 2026

## 1. Executive Summary

**Completed:**
- Full code review of all 6 pilot-related files (backfill.ts, CLI script, analysis tool, runbook, handoff, admin index)
- Found and fixed 1 bug: wrong audit table name in runbook (`settings_audit_log` → `audit_logs`)
- Verified operator execution package is complete and accurate
- Verified analysis tool handles all expected scenarios
- Confirmed live pilot readiness
- Confirmed staged rollout plan and gating criteria
- Updated SESSION_HANDOFF.md with review findings
- All changes committed and pushed to branch

**Remains blocked on:**
- PR #299 merge + Railway deployment
- Admin credentials for live execution
- Real pilot data (no fabrication permitted)

**Ready for live limited pilot:** YES
**Ready for broader rollout:** NO — blocked until pilot evidence is clean

---

## 2. Files Reviewed / Changed

| File | Action | Why | Risk |
|------|--------|-----|------|
| `server/routes/admin/backfill.ts` | Reviewed | Full code review — auth, logic, queries, verification | None found |
| `scripts/backfill_legacy_policies.ts` | Reviewed | Verified column fix from prior session holds | None found |
| `scripts/analyze-pilot-results.ts` | Reviewed | Safety checks, output parsing, recommendation logic | None found |
| `docs/BACKFILL_PILOT_RUNBOOK.md` | **Changed** | Fixed wrong audit table name | Low |
| `SESSION_HANDOFF.md` | **Changed** | Added review findings section | Low |
| `server/routes/admin/index.ts` | Reviewed | Confirmed backfill router registered | None found |
| `server/routes/admin/shared.ts` | Reviewed | Confirmed all imports used by backfill exist | None found |
| `server/middleware/admin-auth.ts` | Reviewed | Verified `logAdminAction` → `audit_logs` table, `requireSuperAdmin()` factory | None found |

---

## 3. Final Code Review Findings

### Blockers found: 1 (fixed)

**Wrong audit table name in runbook.** The rollback section SQL query referenced `settings_audit_log` but `logAdminAction()` writes to `audit_logs`. An operator following the runbook for rollback investigation would get zero results. **Fixed.**

### Fixes made: 1

- `docs/BACKFILL_PILOT_RUNBOOK.md` line 170: `settings_audit_log` → `audit_logs`

### Residual risks: None

**Verified safe:**
- All 3 routes have `authenticateAdmin` + `requireSuperAdmin()` middleware
- GET handler contains zero `.update()` calls — structurally impossible to write
- POST handler requires `body.confirm === true` — returns 400 without it
- POST only processes `recoverableFromRawData` bucket records
- Update object only includes `insured_person`, `start_date`, `expiry_date` — no other columns
- Post-write verification re-reads `raw_data` and confirms array counts unchanged
- `POLICY_SELECT` has no phantom columns (`insured`, `end_date`)
- Recovery chain in `extractRecoverableHeaders()` matches documented precedence rules
- `countLegacyArrays()` correctly handles the `{ raw_data }` shape from verification re-read
- Date format warnings fire for non-YYYY-MM-DD patterns
- Max limit cap (200) prevents runaway queries
- `parseLimit` and `parseOffset` handle NaN/negative/missing inputs safely
- `logAdminAction` calls pass correct parameters (action + resourceType as strings, summary as newState)

---

## 4. Operator Execution Package

### Exact production commands

All in `docs/BACKFILL_PILOT_RUNBOOK.md` — verified accurate against code:

**Step 1 — Login:**
```bash
TOKEN=$(curl -s -X POST \
  https://insurai-production.up.railway.app/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "Token: ${TOKEN:0:20}..."
```

**Step 2 — Dry-run:**
```bash
curl -s \
  "https://insurai-production.up.railway.app/api/admin/backfill/pilot?limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool | tee pilot_dry_run.json
```

**Step 3 — Review dry-run, then execute write:**
```bash
curl -s -X POST \
  "https://insurai-production.up.railway.app/api/admin/backfill/pilot" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true, "limit": 10}' \
  | python3 -m json.tool | tee pilot_write.json
```

**Step 4 — Post-write verification:**
```bash
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

**Step 5 — Analyze results:**
```bash
npx tsx scripts/analyze-pilot-results.ts pilot_write.json
```

### Runbook status: Complete and verified

### Operator checklist

- [ ] Only `insured_person`, `start_date`, `expiry_date` columns were modified
- [ ] Legacy arrays (`coverages`, `exclusions`, `insights`) counts unchanged for every record
- [ ] No record received a current-day date as a fallback
- [ ] No record received `insured_person = "-"` or empty string
- [ ] No `requiresReExtraction` or `unrecoverable` records were written to
- [ ] Post-write verification confirms `all_arrays_stable: true`
- [ ] Proposed values came from `raw_data` / `extracted_data`, not from AI re-extraction
- [ ] At least 1 record was successfully hydrated (pilot produced evidence)

---

## 5. Analysis Tool Status

**What it handles:**
- Dry-run JSON (from GET endpoint)
- Write JSON (from POST endpoint)
- Both `raw.data` wrapper and direct data shape
- Cohort summaries with bucket counts
- Per-record detail with deltas and verification results
- 4 automated safety checks: wrong-bucket writes, array instability, fake dates, bad insured
- Binary recommendation: READY / NOT READY

**No improvements needed.** The tool is complete for its purpose.

**Usage after pilot:**
```bash
npx tsx scripts/analyze-pilot-results.ts pilot_dry_run.json  # inspect before write
npx tsx scripts/analyze-pilot-results.ts pilot_write.json    # verify after write
```

---

## 6. Broader Rollout Plan

### Stages

| Stage | Scope | Gate |
|-------|-------|------|
| 1 | 10 records | Manual QA of every record. All acceptance criteria pass. |
| 2 | 50 records | Zero array corruption. Analysis tool reports READY. Spot-check 5 via verify. |
| 3 | 200 records | Automated verification. Sampling QA on 10 records. |
| 4 | Full population | Stage 3 approved. Paginate with offset. |

### Gating criteria between stages

- Zero `CRITICAL: Legacy arrays changed` errors at all stages
- `all_arrays_stable === true` at all stages
- No date-format warnings (or all reviewed and accepted)
- Manual QA signs off representative examples
- No auth/audit issues in Railway logs

### Rollback guidance

- `pilot_write.json` contains `current` values for every record — use as rollback source
- SQL: `UPDATE policies SET insured_person=X, start_date=Y, expiry_date=Z WHERE id='UUID'`
- Find affected records: `SELECT * FROM audit_logs WHERE action LIKE 'backfill_pilot_%' ORDER BY created_at DESC`
- Endpoint is idempotent — re-running on already-updated records produces `skipped_no_changes`

---

## 7. Validation Performed

| Command | Outcome |
|---------|---------|
| `npx tsc -p server/tsconfig.json --noEmit` | Clean (0 errors) |
| `npx eslint server/routes/admin/backfill.ts scripts/backfill_legacy_policies.ts scripts/analyze-pilot-results.ts` | Clean (0 errors, 0 warnings) |
| `git push` | Success (`0205738`) |

**Intentionally not run:**
- Full test suite — not justified. Only change was a docs fix in 1 markdown file and a handoff update. No production code was modified in this session.

---

## 8. Documentation / Handoff Updates

| Document | Action |
|----------|--------|
| `docs/BACKFILL_PILOT_RUNBOOK.md` | Fixed audit table name (`settings_audit_log` → `audit_logs`) |
| `SESSION_HANDOFF.md` | Added section 8 (code review findings), updated commit list |

### What next operator should do

1. Merge PR #299
2. Wait for Railway deployment
3. Follow `docs/BACKFILL_PILOT_RUNBOOK.md` exactly: Login → dry-run → inspect → write → verify
4. Save JSON outputs as `pilot_dry_run.json`, `pilot_write.json`, `pilot_verify.json`
5. Run `npx tsx scripts/analyze-pilot-results.ts pilot_write.json` for automated report
6. Fill out pilot report template (in runbook section 8) with real data
7. If pilot passes all safety checks → proceed to Stage 2 (50 records)
8. If any `CRITICAL` errors → stop and investigate before continuing

---

## 9. Final Recommendation

**Ready for live limited pilot:** YES

After PR #299 merge and Railway deployment, the system is production-safe with: confirm gate preventing accidental writes, super_admin authentication, audit logging to `audit_logs` table, post-write verification with legacy array stability check, idempotent re-run safety, operator runbook with exact commands, and analysis tooling for automated safety checks.

**Ready for broader rollout:** NO

Blocked until Stage 1 pilot evidence is produced from real data and passes all acceptance criteria. Specifically need: at least 1 successful record hydration, `all_arrays_stable: true` confirmed on real data, filled pilot report template with real before/after examples, and analysis tool reporting "READY for broader rollout".
