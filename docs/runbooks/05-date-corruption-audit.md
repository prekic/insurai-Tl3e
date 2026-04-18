# Runbook: V8 DD.MM.YYYY Date Corruption Audit

Diagnostic-only runbook for finding and (optionally) repairing policy rows whose dates were corrupted by the V8 `new Date('DD.MM.YYYY')` parser bug (CLAUDE.md gotcha #52).

## Context

Before commit `ed487ef` (Apr 12, 2026), five production call sites used `new Date(rawTurkishDate)` as the primary date parser. Node's V8 silently mis-parses Turkish `DD.MM.YYYY` as `MM.DD.YYYY` when the day is ≤ 12 — so `01.12.2024` (Dec 1) became `2024-01-12` (Jan 12). Node only rejects (NaN) when the day ≥ 13, so the bug produced a silently corrupted subset of rows rather than obvious errors.

The **production code is fixed**. All new extractions use `parseTurkishDate()` from `turkish-utils.ts`. But existing rows that were written before the fix may still carry swapped month/day values.

This runbook walks through:

1. Finding affected rows
2. Deciding whether each row is actually corrupted
3. Repairing or re-extracting corrupted rows

---

## 1. Prerequisites

| Variable | Required | Purpose |
|----------|:-:|---------|
| Supabase Studio SQL access | ✅ | Run the audit queries |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (for programmatic repair) | ✅ | Run repair script via `npx tsx` |
| Access to the original PDF files | ⚠ optional | Needed only for re-extraction; not needed for the audit |

---

## 2. Audit Query — Find Candidates

Run in Supabase Studio SQL Editor. Returns rows where `raw_data.startDate` looks like a Turkish `DD.MM.YYYY` format — these are the only rows that could have been affected by the old code path.

```sql
SELECT
  id,
  policy_number,
  provider,
  type,
  start_date,
  expiry_date,
  raw_data->>'startDate' AS raw_start_date,
  raw_data->>'endDate' AS raw_end_date,
  created_at
FROM policies
WHERE
  type = 'kasko'
  AND (
    raw_data->>'startDate' ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
    OR raw_data->>'endDate' ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
  )
ORDER BY created_at DESC;
```

> **Scope note**: filter on `type = 'kasko'` because the bug was limited to the kasko extraction pipeline. Remove the filter if you want to cast a wider net.

---

## 3. Identify Actually-Corrupted Rows

The query above returns candidates — not confirmed corruptions. A row is actually corrupted when **both** of these are true:

1. The raw Turkish date has day ≤ 12 (so V8 would have silently swapped it)
2. The parsed DB date (`start_date`, `expiry_date`) disagrees with what the raw string actually says

Paste the result rows into this check — it flags suspected corruptions:

```sql
WITH candidates AS (
  SELECT
    id,
    start_date,
    raw_data->>'startDate' AS raw_start
  FROM policies
  WHERE type = 'kasko'
    AND raw_data->>'startDate' ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
),
parsed AS (
  SELECT
    id,
    start_date AS db_start_date,
    raw_start,
    -- Turkish convention: DD.MM.YYYY → construct what it SHOULD be
    (split_part(raw_start, '.', 3) || '-'
      || lpad(split_part(raw_start, '.', 2), 2, '0') || '-'
      || lpad(split_part(raw_start, '.', 1), 2, '0'))::date AS tr_interpreted,
    -- V8 mis-interpretation: treats DD.MM.YYYY as MM.DD.YYYY
    (split_part(raw_start, '.', 3) || '-'
      || lpad(split_part(raw_start, '.', 1), 2, '0') || '-'
      || lpad(split_part(raw_start, '.', 2), 2, '0'))::date AS v8_interpreted
  FROM candidates
)
SELECT
  id,
  raw_start,
  db_start_date,
  tr_interpreted AS should_be,
  v8_interpreted AS would_be_if_buggy,
  CASE
    WHEN db_start_date = tr_interpreted THEN 'OK'
    WHEN db_start_date = v8_interpreted THEN 'CORRUPTED'
    ELSE 'OTHER (manual review)'
  END AS status
FROM parsed
WHERE db_start_date = v8_interpreted
  AND db_start_date != tr_interpreted
ORDER BY status, id;
```

Note: if day > 12, `db_start_date = v8_interpreted = tr_interpreted` (both interpretations yield the same date, so no swap could have happened). The `WHERE db_start_date = v8_interpreted AND db_start_date != tr_interpreted` clause narrows to rows where V8 definitely took the wrong branch.

---

## 4. Repair Options

Pick **one** based on severity:

### 4.1 Option A — Spot-Repair a Few Rows (UI)

For 1–10 confirmed corruptions. Edit each row via Supabase Studio or admin UI (Policies tab → Edit). Correct `start_date` and `expiry_date` columns to match what the raw text actually said. Leave `raw_data.startDate` / `raw_data.endDate` as-is (they're the source of truth).

### 4.2 Option B — Bulk SQL Repair

For > 10 corrupted rows. **Dry-run this first** to verify the count matches Section 3.

```sql
-- DRY RUN: show what would change
WITH corrupted AS (
  SELECT id,
    (split_part(raw_data->>'startDate', '.', 3) || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 2), 2, '0') || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 1), 2, '0'))::date AS correct_start,
    (split_part(raw_data->>'endDate', '.', 3) || '-'
      || lpad(split_part(raw_data->>'endDate', '.', 2), 2, '0') || '-'
      || lpad(split_part(raw_data->>'endDate', '.', 1), 2, '0'))::date AS correct_end
  FROM policies
  WHERE type = 'kasko'
    AND raw_data->>'startDate' ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
    AND start_date = (split_part(raw_data->>'startDate', '.', 3) || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 1), 2, '0') || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 2), 2, '0'))::date
    AND start_date != (split_part(raw_data->>'startDate', '.', 3) || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 2), 2, '0') || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 1), 2, '0'))::date
)
SELECT COUNT(*) AS rows_to_fix FROM corrupted;
```

If the count looks right, run the update inside a transaction:

```sql
BEGIN;

UPDATE policies p
SET
  start_date = c.correct_start,
  expiry_date = c.correct_end
FROM (
  SELECT id,
    (split_part(raw_data->>'startDate', '.', 3) || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 2), 2, '0') || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 1), 2, '0'))::date AS correct_start,
    (split_part(raw_data->>'endDate', '.', 3) || '-'
      || lpad(split_part(raw_data->>'endDate', '.', 2), 2, '0') || '-'
      || lpad(split_part(raw_data->>'endDate', '.', 1), 2, '0'))::date AS correct_end
  FROM policies
  WHERE type = 'kasko'
    AND raw_data->>'startDate' ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
    AND start_date = (split_part(raw_data->>'startDate', '.', 3) || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 1), 2, '0') || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 2), 2, '0'))::date
    AND start_date != (split_part(raw_data->>'startDate', '.', 3) || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 2), 2, '0') || '-'
      || lpad(split_part(raw_data->>'startDate', '.', 1), 2, '0'))::date
) c
WHERE p.id = c.id
RETURNING p.id, p.start_date, p.expiry_date;

-- Sanity-check the RETURNING row count before committing:
-- COMMIT;
-- or
-- ROLLBACK;
```

### 4.3 Option C — Re-Extract (Highest Fidelity)

If the original PDF is still available in `policy_documents`, re-run the extraction via `scripts/pilot-batch-ingest.ts --persist-policies` (or equivalent). The current code uses `parseTurkishDate()` so re-extracted rows will be correct. This is the safest option but slowest.

---

## 5. Verification

After repair, re-run Section 2's audit query. Expected output: **zero rows** in the `CORRUPTED` status column.

Spot-check 3–5 repaired rows:

```sql
SELECT
  id,
  raw_data->>'startDate' AS raw_start,
  start_date,
  raw_data->>'endDate' AS raw_end,
  expiry_date
FROM policies
WHERE id IN ('uuid-1', 'uuid-2', 'uuid-3');
```

For each, confirm that `start_date` matches the day/month order shown in `raw_start` (first field → day, second field → month).

---

## 6. Downstream Impact — What to Re-Process

Corrupted dates affect:

- **Expiry status logic**: `status = 'expired' / 'expiring' / 'active'` is computed from `expiry_date`. After repair, re-run the status update (the client recomputes on fetch).
- **Policy evaluation**: `evaluatePolicy()` uses `expiryDate` for the "Historical Policy" vs "Renew Expired Policy" recommendation. A row previously flagged historical may now be active.
- **Benchmark confidence**: `dataDate` on benchmark mocks/fixtures may need re-asserting in tests, but this doesn't affect prod rows.

After a bulk repair, consider running `scripts/backfill-evaluation-scores.ts` to recompute `raw_data.evaluation.overallScore` for affected rows so grade thresholds see accurate scores.

---

## Appendix — When the Bug Cannot Have Happened

Rows where **day > 12** (e.g. `15.03.2024`) could not have been corrupted — V8 would have returned NaN and the old code would have fallen back to returning the raw string (visible as a non-date value). These rows do not need auditing.

Rows created **after commit `ed487ef`** also cannot be corrupted. The audit query filters by `type = 'kasko'` but does not filter by date — consider adding `AND created_at < '2026-04-12'::date` if you want to narrow scope.

---

## Related Files

- `src/lib/ai/turkish-utils.ts` — `parseTurkishDate()` canonical parser
- `src/lib/ai/policy-extractor.ts` — production call sites (now all fixed)
- `scripts/pilot-batch-ingest.ts` — re-extraction entry point
- `scripts/backfill-evaluation-scores.ts` — rescores after date repair
- CLAUDE.md gotcha #52 — original bug writeup
