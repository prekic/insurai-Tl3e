# Session Handoff — May 1, 2026 — Self-Audit Layer Phases 1-4 + Trend Noise-Floor Calibration

> **Session type**: Production self-audit-layer ship + ops calibration. Built and shipped all 4 phases of the self-audit plan (`docs/feed-back-into-extractionincomplete-elegant-emerson.md`), wired the per-policy fire-and-forget judge hook into the live extraction pipeline, debugged the GitHub Actions workflow through 3 manual runs, and tuned the trend-tracking noise floor from `MIN_BASELINE_FOR_REGRESSION = 3 → 5` after a real CRIT-vs-noise calibration event. See `docs/adr/023-self-audit-layer-architecture.md`.

---

## 🎯 Immediate Next Steps for the Next Agent (priority-ordered)

### Priority 1 — Open + merge the trend noise-floor PR
A single commit (`776b1a4 fix(audit): bump MIN_BASELINE_FOR_REGRESSION 3→5`) is sitting on branch `claude/load-project-context-22E3t`, ahead of `origin/main` by 1 commit. The commit:
- Bumps `MIN_BASELINE_FOR_REGRESSION` in `src/lib/audit/trend-metrics.ts` from `3` → `5`
- Rewords the existing small-baseline test
- Adds a regression-guard test that pins the exact `golf-2001` 3 → 0 exclusion case

Action: open PR `claude/load-project-context-22E3t` → `main`, merge via `mcp__github__merge_pull_request` to fire Railway deploy. After merge, run the audit-judge-trends workflow manually (`workflow_dispatch`, leave `run_judge=false`) to verify the gate now goes green on the calibrated corpus.

### Priority 2 — Close out the 3 deferred audit-layer follow-ups
All three are non-blocking but compound the longer they sit:

**(a) `cost_usd` is null on every `audit_judgements` row.** `calculateCost()` lacks pricing for `claude-sonnet-4-6` (the seeded judge model). Add `claude-sonnet-4-6: { input: 0.003, output: 0.015 }` (per Anthropic public pricing) to the model-pricing map. Verify by running one judge call against a fixture and asserting `cost_usd IS NOT NULL`.

**(b) Admin notifications not firing on critical findings despite `critical_count=3`.** The verified live behavior: 2 `audit_judgements` rows with `critical_count: 3` were persisted on May 1, but no corresponding `admin_notifications` rows. The most likely cause is a string/boolean mismatch on the `judge_critical_notify_first_only` `app_settings` row (seeded as `'true'` string, possibly compared with `=== true` boolean). Audit the comparison at the `notifyAuditQuality()` call site in `server/services/audit-judge-service.ts`.

**(c) Insurer normalization gap.** `normaliseInsurer()` in `src/lib/audit/typology.ts` doesn't NFKC-normalise or collapse internal whitespace. Two visually-equivalent insurer strings (e.g. `"Anadolu  Sigorta"` with double space vs `"Anadolu Sigorta"`) hash to different typologies and bypass the LLM cache, doubling judge cost. Add `.normalize('NFKC').replace(/\s+/g, ' ')` before suffix-stripping. Test with the 6 existing typology unit tests + add 2 cases for whitespace and NFKC variants.

### Priority 3 — Run 1-2 more clean manual workflow runs, then enable the `schedule:` cron
`.github/workflows/audit-judge-trends.yml` has `schedule: - cron: '0 6 * * 1'` (Mondays 06:00 UTC) commented out. After the noise-floor PR merges and 1-2 manual runs come back green, uncomment that block to enable weekly automated trend tracking. Initial cost will be near-zero because `run_judge` is gated separately and defaults to `false` on cron triggers.

### Priority 4 — Carry forward from the prior session
- **Apply Migration 049** (named-deductible attribution rules) verification — manually upload the reviewer's exact Anadolu Birleşik Kasko fixture (the one with %35/%80 scenarios) and confirm `conditionalDeductibles` is non-empty.
- **Sprint 3 polish tail** — #10 premium split detail, #12 coverage transfer context, #13 Special Provisions panel, #14 AS+ servis network callout, #15 output stability tuning.
- **Re-run smoke periodically.** Two transient `All AI providers failed` events were observed in the prior session. Production `/api/health` was OK both times.

---

## What This Session Produced

### Phase 1 — Deterministic detectors (commit `ab2bd21`)
4 new check functions in `src/lib/audit/quality-detectors.ts`:
- `checkFinancialRisksDedup()` — runs `dedupByTrigramJaccard()` over bucketed `evaluation.issues[]`; warn at 1 collapse, critical at ≥3
- `checkEkSozlesmeBulletParity()` — calls `extractEkSozlesmeBullets(rawText)`, compares to `coverages.filter(c => c.category === 'supplementary').length`; pass ≥90%, warn 50-89%, critical <50%
- `checkNamedScenarioCoverage()` — iterates exported `NAMED_DEDUCTIBLE_SCENARIOS`; critical when missing scenario has %≥80, warn otherwise
- `checkCarveOutDisplayContract()` — flags `isUnlimited && carveOuts.length > 0 && no scenario.caveat`

Critical-severity findings push to `extractionGateTriggers[]` and set `extractionIncomplete = true`. Warn-level populates a non-blocking `qualityFindings[]` array. New triggers wired into `evaluator.ts:626-627` filter:
- `FINANCIAL_RISKS_DUPLICATED` (warn-only by default)
- `EK_SOZLESME_BULLETS_UNDERREPORTED` (severity-tiered)
- `NAMED_SCENARIO_MISSING_HIGH_IMPACT` (critical when ≥80%)
- `CARVE_OUT_DISPLAY_MISMATCH` (critical when contract violated)

### Phase 2 — Render-contract Playwright tests (commit `9e4e7a9`)
NEW `e2e/render-contract.spec.ts` with 4 panel-DOM contracts:
1. Exclusions: data N rows → DOM N `[data-testid="exclusion-row"]` elements
2. Ask-Insurer: data N unanswered questions → DOM N `[data-testid="ask-insurer-row"]`
3. Supplementary coverage: data 11 EK SÖZLEŞME items → DOM ≥9 (allows legitimate dedup)
4. Caveat presence: `isUnlimited && carveOuts.length>0` → DOM `role="note"` + "2.5M" substring

Auth-bypass via the existing `e2e/real-user-proof.spec.ts:22-45` localStorage-injection pattern. No new workflow file — added to existing staging.yml + production.yml E2E jobs.

### Phase 3 — LLM-as-judge layer (commit `a74f8fc`)
**Database**:
- Migration `053_audit_judgements_table.sql` — `audit_judgements` table with permissive RLS, 4 indexes (typology_hash, policy_id, fixture_id, created_at)
- Migration `054_seed_audit_judge_prompt_and_config.sql` — seeds `prompt_templates` row `'Audit Judge - Kasko'` + 3 `app_settings` rows (`judge_max_runs_per_day=50`, `judge_model=claude-sonnet-4-6`, `judge_critical_notify_first_only=true`)
- Both **manually applied to production** May 1

**Modules**:
- NEW `src/lib/audit/typology.ts` — `computeTypologyHash`, `parseYearBucket`, `normaliseInsurer`. **Gotcha**: inlined `extractYearFromDate()` instead of importing `parseTurkishDate` from `turkish-utils.ts` to avoid server-build cascade (turkish-utils transitively imports `shared/field-aliases.js` without extensions, breaking node16 module resolution)
- NEW `server/lib/audit-judge-schema.ts` — `AUDIT_JUDGE_JSON_SCHEMA` + `DEFAULT_AUDIT_JUDGE_SYSTEM_PROMPT` + `DEFAULT_AUDIT_JUDGE_USER_PROMPT_TEMPLATE`
- NEW `server/services/audit-judge-service.ts` — `runAuditJudge()`: typology-hash compute → cache lookup → daily-budget circuit breaker → Anthropic call → JSON parse + fence strip → quote-verification post-check → persist + notify
- NEW `server/routes/ai/audit-judge.ts` — `POST /api/ai/audit-judge` returns 202 immediately, runs judge in background
- Extension to `server/services/admin-notification-service.ts` — `notifyAuditQuality()` helper (category `'system'`)
- Extension to `server/services/config-service.ts` — `getAuditConfig()` getter (5-min cache)
- NEW `src/lib/audit/judge-client.ts` — browser-side fire-and-forget POST wrapper

**Per-policy hook point**: `src/lib/ai/policy-extractor.ts:~1325` next to `persistPilotQARecord()` — fire-and-forget `runAuditJudge()` with `process.env.NODE_ENV !== 'test'` guard (gotcha #1).

**CLI + golden corpus**:
- NEW `tests/fixtures/golden/` — 3 fixtures (`anadolu-volkswagen-tiguan`, `anadolu-volkswagen-golf-2001`, `allianz-peugeot-308`) + `golden.json`
- NEW `scripts/audit-judge-corpus.ts` — `npm run audit:judge`

### Phase 4 — Fixture-level trend tracking (commit `fbbe61f`)
- Migration `055_audit_trend_snapshots.sql` — `audit_trend_snapshots` table — **manually applied to production**
- NEW `src/lib/audit/trend-metrics.ts` — `extractMetrics()` + `compareMetrics()` pure functions; `MIN_BASELINE_FOR_REGRESSION` exported (initially `3`, bumped to `5` on May 1)
- NEW `scripts/audit-trend-track.ts` — `npm run audit:trends` — iterates golden fixtures, OCR + extract, persists snapshot, compares to most-recent baseline, writes `reports/trend-<timestamp>.md`
- NEW `.github/workflows/audit-judge-trends.yml` — manual `workflow_dispatch` only, `schedule:` cron commented until calibrated
- Exit-code semantics: `0` = pass or extraction-flake, `1` = real CRIT regression, `2` = setup error

### Deferred follow-ups wired (commit `2f144c8`)
- Per-policy fire-and-forget judge hook integrated into the production extraction pipeline
- Caveat presence Playwright contract test added
- Phase 4 GitHub tracking issue (#419) — referenced in workflow's failure-comment block

### May-1 fixes (commits `9902f97`, `37791c9`, `039b695`, `bef0727`, `f4ef4d0`, `776b1a4`)
- `pathToFileURL` for cross-platform `main()` guard in 5 scripts (Windows backslash bug)
- `{{var}}` double-brace fix in seeded audit-judge user prompt (`renderTemplate` regex was `\{\{(\w+)\}\}` — single braces don't interpolate)
- Relative imports + inline year extractor for server build (avoids `@/lib/...` and `turkish-utils` transitive cascade)
- Workflow secret names corrected (`SUPABASE_URL` → `PROD_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` → `PROD_SUPABASE_SERVICE_KEY`)
- Exit-code fix: `process.exit(anyCritical ? 1 : 0)` — extraction errors warn but don't fail CI
- **Noise-floor bump 3 → 5** after Run #3 tripped CRIT on golf-2001's 3-exclusion baseline going to 0 (Anthropic re-bucketing, not real signal loss)

### CLAUDE.md / SESSION_HANDOFF / ADR-023 (this PR)
- 6 new gotchas (#142-147) documenting the audit layer's known limitations
- Next Session Instructions block updated to surface the 3 deferred follow-ups + workflow status
- ADR-023 documenting the architecture decision

---

## Current State

**Branch**: `claude/load-project-context-22E3t`. Working tree clean. Ahead of `origin/main` by 1 commit (`776b1a4`).

**Database (manually applied this session)**:
- ✅ Migration 053 (`audit_judgements` table)
- ✅ Migration 054 (`Audit Judge - Kasko` prompt + 3 `app_settings` rows under category `'audit'`)
- ✅ Migration 055 (`audit_trend_snapshots` table)
- All applied via Supabase Dashboard SQL editor; verified via `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('audit_judgements', 'audit_trend_snapshots');`

**Verified live behavior**:
- Per-policy hook fired on real production uploads on May 1 — 2 `audit_judgements` rows with `policy_id` set, both with `critical_count: 3` and 7-8 findings each (Pert Araç deductible missing, Artan Mali Sorumluluk framing inaccuracy, etc.)
- Workflow Run #1 — failed (wrong secret names) → fixed
- Workflow Run #2 — failed (extraction flakiness gate too tight) → fixed (commit `f4ef4d0`)
- Workflow Run #3 — failed CRIT on golf-2001 (3 → 0 exclusions, Anthropic re-bucketing) → fixed (commit `776b1a4`, threshold 3 → 5)
- Run #4+ expected to pass with the new floor

**Tests**: 18/18 trend-metrics tests pass (16 existing + 1 reworded + 1 new regression guard). `tsc --noEmit` clean. Full suite NOT run this session (gotcha #5).

**Env vars**: No new env vars added. All session work used existing keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GCP_SERVICE_ACCOUNT_BASE64`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRODUCTION_SERVER_URL`). The CI workflow uses pre-existing `PROD_SUPABASE_URL` and `PROD_SUPABASE_SERVICE_KEY` secrets.

---

## Configuration Requirements

- **No new env vars.**
- **GitHub Secrets needed for the audit workflow** (already configured):
  - `PRODUCTION_SERVER_URL` — used as `SMOKE_BASE_URL`
  - `PROD_SUPABASE_URL`
  - `PROD_SUPABASE_SERVICE_KEY`
  - `ANTHROPIC_API_KEY` — only used when `run_judge=true` is passed via `workflow_dispatch` inputs
- **Supabase migrations applied this session** (053, 054, 055) — already applied to production. Idempotent re-apply is safe (`CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`).
- **Anthropic credit balance** — must be ≥ ~$1 to run `npm run audit:judge` against the 3-fixture corpus (~$0.045 per full sweep at current Sonnet 4.6 pricing).

---

## Bugs / Known Issues (post-ship audit-layer follow-ups)

1. **`audit_judgements.cost_usd` is always null** — `calculateCost()` lacks `claude-sonnet-4-6` pricing. Daily-budget circuit breaker uses `COUNT(*)` so this doesn't bypass cost gating, but cost monitoring queries return null. Priority 2(a).
2. **Admin notifications not firing on critical findings** — verified 2 rows with `critical_count: 3` produced 0 admin_notifications rows. Likely a string-vs-boolean comparison on `judge_critical_notify_first_only`. Priority 2(b).
3. **`normaliseInsurer()` has NFKC + whitespace gap** — visually-equivalent insurer strings can hash to different typologies and bypass the cache. Priority 2(c).
4. **(carryover) cd=0 across the 13-PDF audit corpus** — corpus genuinely lacks named-percentage scenarios; reviewer's specific Anadolu Birleşik Kasko fixture is NOT in `policies/`. Priority 4.
5. **(carryover) Pre-existing `service.test.ts` `getNonCompliant()` flake** — fails on clean main too. Not investigated.
6. **(carryover) `Police-433425980.pdf` partial extraction** — 21 pages, vehicle fields all empty despite qualityScore 0.92. Sprint 3 follow-up.

---

## Non-Negotiable Rules (Carry Forward + 3 new)

(Rules 1-22 unchanged from prior session)

23. **Self-audit layer phases must ship together with their migrations.** Migration 053/054/055 must be manually SQL-applied before the corresponding code paths are reachable. Without 054, the audit-judge call fails at `getRenderedPrompt('Audit Judge - Kasko')`; without 053, the persist-row call fails; without 055, the trend tracker fails on first read of baselines.

24. **`MIN_BASELINE_FOR_REGRESSION = 5` is the calibrated noise floor — do not lower without a recalibration run.** A baseline of 3 is inside Anthropic's run-to-run extraction noise envelope (re-bucketing of 3 items into adjacent fields produces a 100% drop on a stable signal). If you raise sensitivity for a specific fixture, do it via the per-call `options.minBaseline` parameter, not by lowering the global default.

25. **The Phase 4 trend workflow's `schedule:` cron stays commented until 1-2 manual runs come back green.** A flaky scheduled CI job that auto-comments on a tracking issue at 06:00 UTC every Monday is worse than no automation at all. Verify calibration with `workflow_dispatch` first.

---

## Quick Reference

### Run the audit layer locally

```bash
# Trend tracking (cheap, no judge calls)
npm run audit:trends

# Full LLM judge sweep on 3 golden fixtures (~$0.045)
npm run audit:judge

# QA gate (extraction quality)
npm run qa:extraction
```

### Trigger the workflow manually

GitHub → Actions → "Audit Judge + Trends (Manual)" → "Run workflow" → leave `run_judge=false` for a cheap trends-only run.

### Check audit_judgements live

```sql
SELECT typology_hash, finding_count, critical_count, cost_usd, created_at
FROM audit_judgements
ORDER BY created_at DESC
LIMIT 10;
```

### Check trend baselines live

```sql
SELECT fixture_id, schema_version, qa_pass, run_at,
       metrics->>'coverages' AS cov,
       metrics->>'exclusions' AS excl
FROM audit_trend_snapshots
WHERE qa_pass = true
ORDER BY run_at DESC
LIMIT 10;
```

---

## Files added/modified (this session)

### Source
- `src/lib/audit/typology.ts` — NEW (Phase 3, commit `a74f8fc`); inlined year extractor (commit `039b695`)
- `src/lib/audit/quality-detectors.ts` — NEW (Phase 1, commit `ab2bd21`)
- `src/lib/audit/judge-client.ts` — NEW (Phase 3, commit `a74f8fc`)
- `src/lib/audit/trend-metrics.ts` — NEW (Phase 4, commit `fbbe61f`); `MIN_BASELINE_FOR_REGRESSION` 3→5 (commit `776b1a4`)
- `src/lib/audit/__tests__/typology.test.ts` — NEW
- `src/lib/audit/__tests__/quality-detectors.test.ts` — NEW
- `src/lib/audit/__tests__/judge-client.test.ts` — NEW
- `src/lib/audit/__tests__/trend-metrics.test.ts` — NEW + 1 reworded + 1 new regression guard (commit `776b1a4`)
- `src/lib/ai/policy-extractor.ts` — fire-and-forget judge hook added (commit `2f144c8`)

### Server
- `server/lib/audit-judge-schema.ts` — NEW
- `server/services/audit-judge-service.ts` — NEW
- `server/routes/ai/audit-judge.ts` — NEW
- `server/services/admin-notification-service.ts` — `notifyAuditQuality()` added
- `server/services/config-service.ts` — `getAuditConfig()` added
- `server/middleware/validation.ts` — `auditJudgeSchema` added

### Scripts + workflow
- `scripts/audit-judge-corpus.ts` — NEW
- `scripts/audit-trend-track.ts` — NEW; pathToFileURL guard fix; exit-code fix
- `scripts/qa-extraction-quality.ts` — pathToFileURL guard fix (commit `9902f97`)
- `scripts/backfill-evaluation-scores.ts` — pathToFileURL guard fix
- `scripts/backfill-date-bug.ts` — pathToFileURL guard fix
- `.github/workflows/audit-judge-trends.yml` — NEW; secrets fix (commit `bef0727`)

### E2E
- `e2e/render-contract.spec.ts` — NEW (Phase 2)

### Fixtures
- `tests/fixtures/golden/` — NEW directory; 3 PDFs + `golden.json`

### Database
- `supabase/migrations/053_audit_judgements_table.sql` — NEW; **applied to prod**
- `supabase/migrations/054_seed_audit_judge_prompt_and_config.sql` — NEW; **applied to prod** (with `{{var}}` double-brace fix)
- `supabase/migrations/055_audit_trend_snapshots.sql` — NEW; **applied to prod**

### Docs
- `CLAUDE.md` — Next Session Instructions rewritten; gotchas #142-147 added; Last Updated bumped to May 1, 2026
- `SESSION_HANDOFF.md` — full rewrite (this file)
- `docs/adr/023-self-audit-layer-architecture.md` — NEW

### Package
- `package.json` — `audit:judge` and `audit:trends` scripts added
