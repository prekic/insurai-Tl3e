# Runbook: KASKO Pilot Batch Ingestion

This runbook covers the end-to-end process for bulk-ingesting KASKO PDFs through `scripts/pilot-batch-ingest.ts` and running the downstream evaluation backfill. Use this when CLAUDE.md "Next Session Instructions" items #4 → #5 are unblocked.

## Context

`scripts/pilot-batch-ingest.ts` is the canonical entry point for moving real KASKO PDFs from `upload/real-kasko-pdf/` (or any directory you point it at) into:

1. `kasko_pilot_qa_records` — pilot QA metrics table (always, when not in `--dry-run`)
2. `policies` — main policies table (only when `--persist-policies` flag is set, since commit `e1174df` / Apr 11, 2026)

The script is **sandbox-friendly**: it uses the Undici proxy bootstrap (`scripts/_proxy-bootstrap.mjs`) for egress and reads service account credentials from either a base64 env var (`GCP_SERVICE_ACCOUNT_BASE64`) or a local file. It will never crash on missing credentials — preflight validation fails fast with a clear multi-line error instead.

---

## 1. Prerequisites

### 1.1 Environment variables

Create `/home/user/insurai/.env` (in `.gitignore`, never committed). Required keys depend on mode:

| Variable | `--dry-run` | full mode | `--persist-policies` |
|----------|:-:|:-:|:-:|
| `OPENAI_API_KEY` | — | ✅ | ✅ |
| `ANTHROPIC_API_KEY` | — | ✅ (fallback) | ✅ (fallback) |
| `SUPABASE_URL` | — | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ✅ | ✅ |
| `GCP_SERVICE_ACCOUNT_BASE64` | — | optional† | optional† |
| `PILOT_REVIEWER_USER_ID` | — | — | ✅‡ |

† Required only if any PDF in the batch is scanned/image-only (pdfjs returns <50 chars). Without it, scanned PDFs are marked `text_extraction_failed` and skipped.

‡ Alternatively, pass `--reviewer-id=<uuid>` on the CLI. Must be a valid UUID that exists in `auth.users` (enforced by the `policies.user_id` FK).

**Security reminder**: all keys should be rotated after use per CLAUDE.md "Next Session Instructions" #1 (Apr 8 leak).

### 1.2 Finding a reviewer UUID

The `policies.user_id` column has `REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL`. Three options:

**Option A — Supabase Studio** (fastest, GUI):
1. Open Supabase Studio → Authentication → Users
2. Copy the UUID of any existing user (e.g. the admin user)

**Option B — SQL via Studio**:
```sql
SELECT id, email, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;
```

**Option C — CLI after `.env` is populated**:
```bash
npx tsx -e "
  import 'dotenv/config'
  import { createClient } from '@supabase/supabase-js'
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const r = await s.auth.admin.listUsers({ page: 1, perPage: 5 })
  console.log(r.data.users.map(u => ({ id: u.id, email: u.email })))
"
```

Set the chosen UUID in `.env` as `PILOT_REVIEWER_USER_ID=<uuid>`.

### 1.3 PDF directory

Drop PDFs into `upload/real-kasko-pdf/` (or any path — `upload/` is in `.gitignore`). The script accepts any directory path as the positional argument. Duplicate uploads are auto-skipped via the `(policy_number + provider + user_id)` idempotency guard.

---

## 2. Verification (credential-free smoke test)

Always run this first, even when credentials are set. It proves the script loads, text extraction works, and the OCR fallback path is wired:

```bash
npx tsx scripts/pilot-batch-ingest.ts ./upload/real-kasko-pdf --dry-run
```

**Expected output for the 10 pilot PDFs** (as of Apr 11, 2026):
- 8 files report `OK: <N> chars, <M> pages` via pdfjs
- 2 files (`4.4. Kasko.pdf`, `KRK_35 VD 458 Kasko Police_32630901_3.pdf`) report `pdfjs failed` and trigger Document AI OCR fallback. Without GCP creds, you'll see `OCR also failed: No GCP credentials found` and `FAIL: pdfjs: ...; ocr: ...` — this is the expected clean-fail behavior. With GCP creds, OCR should recover them.
- Summary: `Text extracted: 8/10` (or 10/10 with GCP), `Admission breakdown: not_attempted: 10`
- Exit code: 0

If this fails, stop and diagnose before proceeding.

---

## 3. Full Pilot Ingestion

```bash
# Quick — QA records only (no `policies` writes)
npx tsx scripts/pilot-batch-ingest.ts ./upload/real-kasko-pdf

# Full — QA records + policies table (required for downstream backfill)
npx tsx scripts/pilot-batch-ingest.ts ./upload/real-kasko-pdf --persist-policies
```

The `--persist-policies` path runs a startup preflight that fails fast if env or reviewer UUID is missing — no LLM tokens wasted on broken runs. If preflight passes, the script runs the full pipeline:

1. PDF text extraction (pdfjs + OCR fallback)
2. LLM extraction (OpenAI gpt-4o-mini primary, Anthropic Haiku fallback)
3. Pilot admission gate + QA record creation
4. Downstream analysis pipeline (display mode, prohibited phrase check)
5. Persist QA record → `kasko_pilot_qa_records`
6. Persist policy → `policies` (only if `--persist-policies`)

**Expected duration**: 3-5 minutes for 10 PDFs.
**Expected cost**: ~$0.20-0.50 total (~$0.02 per OpenAI extraction + ~$0.03 per Document AI page for scanned PDFs).
**Expected result**: 8-10 new rows in `policies` (10 if OCR recovers both scanned PDFs).

**Flag reference**:
- `--dry-run` — text extraction only, no LLM, no DB writes
- `--provider=openai|anthropic` — force one provider, skip auto-fallback
- `--output=<path>` — override `/tmp/pilot-batch-results.json` output
- `--persist-policies` — enable the `policies` table writer (Phase A+ feature)
- `--reviewer-id=<uuid>` — override `PILOT_REVIEWER_USER_ID` env var

---

## 4. Verification After Full Run

### 4.1 Check `policies` rows

```sql
SELECT id, policy_number, provider, type,
       raw_data->>'extractionModel' as model,
       raw_data->>'_batchIngestedAt' as ingested_at,
       jsonb_array_length(raw_data->'coverages') as cov_count
FROM policies
WHERE raw_data->>'_batchIngested' = 'true'
ORDER BY created_at DESC
LIMIT 20;
```

Expected: 8-10 rows with `model = 'gpt-4o-mini'`, non-empty `ingested_at`, `cov_count > 0`.

### 4.2 Check `kasko_pilot_qa_records` rows

```sql
SELECT filename, extraction_model, admission_status, display_mode,
       confidence_score, coverage_count_extracted, phrase_clean
FROM kasko_pilot_qa_records
WHERE reviewer_user_id = 'batch-script'
ORDER BY review_date DESC
LIMIT 20;
```

Expected: 8-10 rows, phrase_clean = true, admission_status mostly 'admitted' or 'moderate', confidence_score in [0, 1].

### 4.3 Review `/tmp/pilot-batch-results.json`

```bash
cat /tmp/pilot-batch-results.json | jq '.summary'
```

Summary should show:
- `totalFiles: 10`
- `textSuccess: 10` (if OCR recovered both scanned PDFs) or 8 (without GCP creds)
- `llmSuccess: 8` or `10`
- `phraseLeaks: 0`
- `admissionBreakdown` — no `not_attempted` (that's only set on failed text extraction)

---

## 5. Downstream — Evaluation Backfill

After ingest, generate evaluation scores for the new policies:

```bash
npx tsx scripts/backfill-evaluation-scores.ts --apply --limit=200
```

**Known gotcha** (CLAUDE.md #45): this will print a `VITE_SUPABASE_URL` stack trace during the evaluator's benchmark refresh. It's **non-fatal** — the service catches it and falls back to static JSON benchmarks. Ignore it.

The backfill updates `raw_data.evaluation.overallScore` on every row matched by the query (100 default, 200 with `--limit=200`). Use `--type=kasko` or `--policy-id=<uuid>` to scope further.

Verify:
```sql
SELECT id, policy_number, raw_data->'evaluation'->>'overallScore' as score,
       raw_data->'evaluation'->>'grade' as grade
FROM policies
WHERE raw_data->'evaluation' IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

Expected: scores in [0, 100], grades in [A, B, C, D, F].

---

## 6. Grade Threshold Calibration (Blocked Until 50+ Scored)

```bash
npx tsx scripts/calibrate-grade-thresholds.ts
```

**This is blocked** until `policies` has at least 50 rows with `raw_data.evaluation.overallScore` populated. A single 10-PDF batch doesn't meet this threshold. Defer until multiple batches have been ingested OR drop a 50+ PDF batch in one run.

---

## 7. Troubleshooting

### 7.1 Preflight fails with "requires the following to be set"

You ran `--persist-policies` without a full `.env`. Check:
```bash
env | grep -E "^(SUPABASE|OPENAI|ANTHROPIC|GCP|PILOT_REVIEWER)"
```

Or test the `.env` file by itself:
```bash
npx tsx -e "import 'dotenv/config'; console.log({supa: !!process.env.SUPABASE_URL, key: !!process.env.SUPABASE_SERVICE_ROLE_KEY, openai: !!process.env.OPENAI_API_KEY, reviewer: !!process.env.PILOT_REVIEWER_USER_ID})"
```

Fix the missing keys in `.env` and retry.

### 7.2 Preflight fails with "Invalid --reviewer-id"

UUID didn't match the regex. Check you copied it without trailing whitespace/braces. Valid shape: `12345678-1234-1234-1234-123456789abc`.

### 7.3 Insert fails with "insert or update on table 'policies' violates foreign key constraint"

The reviewer UUID doesn't exist in `auth.users`. Re-query the user list (see §1.2) and use a real UUID. The script's regex preflight catches format issues but can't verify FK existence without a live query.

### 7.4 `--dry-run` fails on files that used to work

Check `upload/real-kasko-pdf/` file permissions and disk integrity. `pdfjs-dist` sometimes throws on encrypted or truncated PDFs — the error message will explain.

### 7.5 OCR fallback fails with "GCP_SERVICE_ACCOUNT_BASE64 decode/parse failed"

The base64 env var is malformed. Re-encode the JSON key file:
```bash
base64 -w 0 gcp-service-account.json > /tmp/gcp-b64.txt
# then paste the contents as GCP_SERVICE_ACCOUNT_BASE64 in .env
```

### 7.6 `LLM extraction failed: API error 429`

Rate limit hit. Wait 60s and retry. The script has no built-in retry — it just surfaces the error in `entry.error` for that one PDF and moves on to the next. Failed PDFs can be re-run safely thanks to the idempotency guard.

### 7.7 "duplicate skipped" logs for every PDF

You already ran the batch — the idempotency guard is working. This is expected on re-runs. To force re-insert, delete the existing rows first:
```sql
DELETE FROM policies WHERE raw_data->>'_batchIngested' = 'true' AND raw_data->>'sourceFilename' = '<filename>';
```

---

## 8. Related Files

- `scripts/pilot-batch-ingest.ts` — the script itself
- `scripts/_proxy-bootstrap.mjs` — sandbox egress proxy (auto-applied via `NODE_OPTIONS`)
- `scripts/backfill-evaluation-scores.ts` — evaluation score backfill (Phase C step 3)
- `scripts/calibrate-grade-thresholds.ts` — grade threshold calibration (Phase D, blocked on 50+)
- `scripts/test-document-ai.ts` — reference implementation for Document AI REST calls
- `src/lib/ai/pdf-splitter.ts:43` — `splitPdf()` used for >10-page PDFs
- `src/lib/analysis/kasko-pilot-gate.ts` — `evaluatePilotAdmission()`, `createPilotQARecord()`
- `src/lib/analysis/batch-ingest-helpers.ts` — `discoverPDFs()`, `summarizeBatch()`, `checkProhibitedPhrases()`
- `shared/extraction-schema.ts` — canonical extraction schema (single source of truth since Apr 9)
- `supabase/migrations/040_kasko_pilot_flag_and_segment.sql` — `kasko_pilot_qa_records` table definition

## 9. History

- **Apr 11, 2026** — Phase A (`e1174df`): Document AI OCR fallback + `policies` table writer + preflight validation added to `pilot-batch-ingest.ts`. Unblocks CLAUDE.md tasks #4 → #5 → #6 chain. This runbook created as follow-up.
- **Apr 8, 2026** — First real-PDF batch runs exposed 5 extraction-quality findings (commits `3ca1662`, `aaab134`, `0b99332`, `510947d`, `183fa12`, `28827fd`). All addressed.
- **Apr 7, 2026** — Sandbox undici proxy bootstrap added (`fc6dd05`) for egress in Claude Code sandboxes.
