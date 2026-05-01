# Session Handoff — May 2, 2026 — Self-Audit Layer Follow-Ups Closed (PRs #425/#426/#427/#428)

> **Session type**: Production cleanup — closed all 5 deferred priorities from the May-1 self-audit-layer ship across 4 sequential PRs. Phase-1 source review showed two of the three handoff-stated root causes were already correct in source; the real bugs were subtler and unobservable from production logs. Plan file: `/root/.claude/plans/considering-that-i-prefere-serene-mist.md`.

---

## 🎯 Immediate Next Steps for the Next Agent

The May-1 follow-up backlog is empty. Next priorities draw from **Sprint 3 polish tail** and **post-merge observation**.

### Priority 1 — Observe the May 2 follow-up PRs in production traffic
PR #427 added Railway-log observability for the audit-judge cost + notification paths. Within the next 24-48h of normal kasko uploads, expect the following in Railway logs / Supabase tables:
- New `audit_judgements` rows have `cost_usd > 0` (test query: `SELECT id, judge_model, cost_usd, created_at FROM audit_judgements WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC`)
- For every persisted row with `critical_count > 0`, exactly one of two things appears in Railway logs: either a `Created notification` info line (firstOnly fired) or a `Critical findings did not trigger notification` info line with `reason: subsequent_of_typology|first_only_disabled|no_db_client|query_error`
- If any `notifyAuditQuality failed` ERROR lines appear, that's a real bug to investigate — the previous warn-level swallow is gone

If observed state matches: gotchas #144 and #145 in `CLAUDE.md` can be removed in a future cleanup pass. If `cost_usd` rows are STILL null after fresh production traffic, run `npx tsx scripts/diagnose-audit-judge-observability.ts` and check Q4 specifically — there may be a DB-cached `app_settings.cost.token_pricing` override missing the `claude-sonnet-4-6` key.

### Priority 2 — Verify the cron's first scheduled run (next Monday 06:00 UTC)
PR #428 enabled `schedule:` in `.github/workflows/audit-judge-trends.yml`. The first Monday-morning auto-trigger should:
- Complete in ~11 min (matching manual run #4 baseline)
- Exit 0 (no CRIT regressions on the calibrated noise floor)
- Run `run_judge=false` automatically (no Anthropic spend) — `inputs.run_judge` is undefined under `schedule:` triggers and the gate at line 63 `if: inputs.run_judge == 'true'` correctly evaluates false
- If it fails, auto-comment on tracking issue #419 with the trend-output excerpt

If the first cron run fails with anything other than a real signal regression, expect noise-floor recalibration may be needed (gotcha #146 is a precedent).

### Priority 3 — Sprint 3 polish tail
Reviewer's outstanding UX items, unchanged from the May-1 handoff:
- #10 premium split detail
- #12 coverage transfer context
- #13 Special Provisions panel
- #14 AS+ servis network callout
- #15 output stability tuning

### Priority 4 — Pre-existing test failure, out of scope this session
`server/__tests__/cost-control.test.ts` "detects anthropic model from path" expects `claude-3-5-haiku` but `estimateTokensFromRequest` returns `claude-haiku-4-5`. Confirmed pre-existing on main before May-2 PRs. Either update the production code's path-mapping table or update the test expectation. ~5-line fix.

---

## What This Session Produced

### PR #425 — `fix(audit): NFKC + whitespace pre-pass in normaliseInsurer()` (P2c, gotcha #143)

Closed cache-bypass when visually-identical insurer strings hashed to different typologies.

**Root cause**: `normaliseInsurer()` collapsed whitespace AFTER suffix-stripping (only the trailing `\s+` collapse on line 87 did anything for internal whitespace), and never NFKC-normalised. Decomposed accents (`'Türkiye'` as `U+0075 + U+0308` vs precomposed `U+00FC`) and compatibility whitespace (NBSP `U+00A0`, ideographic `U+3000`) hashed differently despite rendering identically — doubling LLM cost on visually-equivalent inputs.

**Fix**: pre-pass `.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase().replace(/i̇/g, 'i')` BEFORE suffix-stripping.

**Tests**: 2 new regression cases (precomposed-vs-decomposed `ü`, NBSP/ideographic-vs-ASCII space). Used `od -c` byte-level verification to confirm test literals carried the intended distinct UTF-8 sequences and weren't pre-normalised by the editor — see commit `bbcda86`.

**Risk**: existing `audit_judgements` rows keyed by old hashes won't match new ones; expect a one-time cache miss spike (~$0.05 per re-resolved typology). Acceptable.

Merged as `8d95c50`.

### PR #426 — `test(audit): seed Anadolu Birleşik Kasko golden fixture` (P4)

The reviewer-flagged April 30 case was already in `policies/ANADOLU.PDF` (since PR #380); the corpus README's "future expansion" line predated that PDF being committed. Promoted it to the audit-judge golden corpus.

**Verification probe** (`scripts/probe-anadolu-birlesik.ts`, kept for future fixture-onboarding):
- 5 hits for `"Birleşik"` in the PDF (header + clauses)
- 1 hit for `%80` (commercial-use co-insurance scenario: "aracın taksi/dolmuş ya da korsan taksi olarak tabir edilen taşımacılıkta kullanılması" → 80% of every claim borne by insured)
- Policy dated Oct 2015 → `yearBucket: 2014`

**Important correction to handoff**: the handoff said "%35/%80 scenarios" but only **%80 is in this PDF**. The %80 alone is the high-impact reviewer-flagged scenario; %35 was misremembered or in a different (currently-unidentified) fixture.

Files: `tests/fixtures/kasko/anadolu-birlesik-kasko.pdf` (force-added past `*.pdf` gitignore per existing convention), `tests/fixtures/golden/golden.json` (4th entry, year-bucket 2014 — distinct from existing Anadolu fixtures at 2024 so it gets its own typology hash), `tests/fixtures/golden/README.md` (corpus 3→4).

Merged as `7407882`.

### PR #427 — `fix(audit): cost_usd persistence + admin notification observability` (P2a + P2b, gotchas #144 #145)

Phase-1 source review revealed both stated root causes were already correct in source: `claude-sonnet-4-6` has been in the pricing map since PR #380, and `config-service.ts:851` already handles `val === true || val === 'true'`. The real bugs were observability gaps.

**P2a — Real cause**: Anthropic echoes a versioned variant in `response.model` (e.g. `claude-sonnet-4-6-20251022`) even when the request asked for the bare alias. The audit judge billed against that echoed name, missed the bare-alias pricing entry, and silently routed through the `default` rate.

**P2a fix**:
1. `audit-judge-service.ts:255` — `usedModel = judgeModel` (operator-configured alias, not runtime echo). Cleaner intent-driven fix.
2. `cost-control.ts:198` — `normaliseModelKey()` strips `-\d{6,}$` (6+ digits required to avoid mangling short names like `gpt-4`). Belt-and-suspenders; benefits all Anthropic/OpenAI lookups.

**P2b — Real cause**: `shouldNotifyCritical()` returned a bare boolean. A `false` return conflated "correctly suppressed duplicate" with "Supabase query silently errored" — operators couldn't tell from logs which production state they were in.

**P2b fix**: renamed to `evaluateNotificationDecision()` returning typed `{ notify, reason }` discriminated union (`first_of_typology` / `first_only_disabled` / `subsequent_of_typology` / `no_db_client` / `query_error`). Caller now `log.info()`s the reason on every suppression. `notifyAuditQuality.catch` escalated `log.warn` → `log.error` so the next genuine failure surfaces in Railway logs.

**Diagnostic**: `scripts/diagnose-audit-judge-observability.ts` runs 4 read-only Supabase queries with a decision-tree footer for interpreting the output. Operator-runnable with existing service-role keys.

Merged as `6674bbc`. Manual workflow run #4 (triggered after this PR merged) succeeded in 11m 5s, validating the fixes against the live production stack.

### PR #428 — `ci(audit): enable scheduled audit-judge-trends cron (Mondays 06:00 UTC)` (P3)

Single change: uncommented the `schedule:` block in `.github/workflows/audit-judge-trends.yml`. Manual run #4 confirmed the calibrated noise floor (`MIN_BASELINE_FOR_REGRESSION=5` from May 1) holds across all 4 fixtures including the new `anadolu-birlesik-kasko`.

**Cost gate**: `inputs.run_judge` is undefined under `schedule:` triggers, and the gate at line 63 `if: inputs.run_judge == 'true'` correctly evaluates false. Cron does **trends-only** (cheap OCR + extract on production), zero Anthropic spend. Operators retain `workflow_dispatch` with `run_judge=true` for on-demand judge sweeps.

Also updated `CLAUDE.md` "Next Session Instructions" items #1, #2, #10 + "Last Updated" to reflect the closed follow-ups.

Merged as `f12a7cb`.

---

## Current State

**Branch**: `claude/load-project-context-eMjGW` (the designated context-loading branch). Working tree clean. All 4 session PRs are merged into `main`.

**Production state** (verified via manual workflow run #4 May 2, 11m 5s):
- All 4 golden fixtures extract cleanly through the live production pipeline
- New `anadolu-birlesik-kasko` baseline seeded in `audit_trend_snapshots`
- Calibrated noise floor (`MIN_BASELINE_FOR_REGRESSION=5`) absorbs Anthropic re-bucketing without false CRITs
- Scheduled cron now armed for Monday 06:00 UTC

**Database**: No new migrations this session. All May-1 migrations (053/054/055) remain applied to production.

**Tests** (run isolated per gotcha #5 — never the full suite):
- `npx vitest run src/lib/audit/__tests__/typology.test.ts` — 17/17 pass (15 existing + 2 new regression)
- `npx vitest run server/__tests__/cost-control.test.ts` — 60/60 pass on changed paths (1 unrelated pre-existing failure documented in Priority 4)
- `npx vitest run server/services/__tests__/audit-judge-service.test.ts` — 12/12 pass

**Env vars**: No new env vars added. The new diagnostic script (`scripts/diagnose-audit-judge-observability.ts`) requires the existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

---

## Configuration Requirements

- **No new env vars.**
- **No new migrations.**
- **Sandbox `.env` was absent this session** — the diagnostic script (PR #427) was authored and unit-smoke-tested but NOT run against production. The user can run it locally to verify the fix landed: `npx tsx scripts/diagnose-audit-judge-observability.ts`.

---

## Specific Quirks Encountered

1. **The handoff's stated root causes for P2a and P2b were both wrong.** Phase-1 source review showed both were already correct in source code (pricing entry exists since PR #380 in `cost-control.ts:68`; `config-service.ts:851` correctly handles `val === true || val === 'true'`). The real bugs were dated-suffix lookup miss and opaque suppression — neither directly observable from production logs. **Lesson**: when handoff states "X is the cause", do a Phase-1 source-review verification before believing it, especially for "post-ship deferred follow-ups" where the writer didn't have time to investigate root cause. PR #427's diagnostic script is the deliverable for this — run it BEFORE committing to a fix narrative.

2. **`policies/ANADOLU.PDF` was the reviewer-flagged Anadolu Birleşik Kasko fixture.** Found via `find . -iname "*anadolu*"` after the user pointed out "all policies are in github reachable". The corpus README's "future expansion" line predated PR #380 committing the PDF. **Lesson**: always check the broader repo before declaring a fixture "missing" — `policies/` and `tests/fixtures/kasko/` have different conventions (the latter has a `*.pdf` gitignore + force-add discipline).

3. **`pdf-parse@2.x` constructor signature differs from v1.** Per gotcha #69: `const parser = new PDFParse({ data: new Uint8Array(buf) })` — the data option is wrapped in an object, not passed positionally. The probe script in PR #426 uses this pattern correctly.

4. **`tsx` runs ESM scripts fine but `tsc -p <isolated-tsconfig>` needs `@types/node` + the right `target/module/lib` triple** (gotcha #54 lesson). For scripts, just trust `tsx`'s esbuild-based transpilation and skip type-checking the script itself; rely on root or server tsconfig for the imported modules.

5. **Lint-staged auto-formats during pre-commit** (gotcha #96 + #71). Prettier collapsed my multiline chain in `typology.ts` (commit `bbcda86`) and the linter rejected an unused `e` in catch (commit `9690dae` re-commit). Both were intentional adjustments, not regressions. **Pattern**: if pre-commit fails, fix the linter complaint and `git add` + re-commit — never `--no-verify`.

6. **`mcp__github__create_pull_request` + `mcp__github__merge_pull_request` is the canonical PR ship workflow** (gotcha #22). Sandbox `git push` lands the branch but does NOT trigger Railway's webhook. Always use the merge MCP after PR creation for production deploy. All 4 session PRs followed this pattern.

7. **Stale local `main` recurred this session** (existing CLAUDE.md gotcha). After each PR merge, the next branch creation was preceded by `git fetch origin main && git reset --hard origin/main` — this is the correct hygiene to avoid working off a stale base.

---

## Bugs / Known Issues

1. **Pre-existing**: `cost-control.test.ts` "detects anthropic model from path" expects `claude-3-5-haiku` but production code returns `claude-haiku-4-5`. Failed on main BEFORE the May-2 PRs. Out of scope; documented in Priority 4 above.
2. **(carryover)** `Police-433425980.pdf` partial extraction — 21 pages, vehicle fields all empty despite qualityScore 0.92. Sprint 3 follow-up.
3. **(carryover)** `service.test.ts` `getNonCompliant()` flake — fails on clean main too. Not investigated.
4. **(observability gap, not a bug)** The May-2 PRs improve diagnostics but don't yet cover one edge: if `getTokenPricing()` loads from a DB-cached `app_settings.cost.token_pricing` row that's missing `claude-sonnet-4-6`, the suffix-strip can't help. Q4 of the diagnostic script catches this case.

---

## Non-Negotiable Rules (Carry Forward + 1 New)

(Rules 1-25 unchanged from prior session)

26. **When a handoff states "X is the cause", verify in source before believing it.** The May-1 handoff stated three root causes for the audit-layer follow-ups; two were wrong in ways only Phase-1 source review caught. Default to running an independent investigation (read the actual code, run the diagnostic script if one exists, query the DB read-only) before committing to a fix narrative. The cost of an extra 15-minute review is much lower than the cost of shipping a fix that doesn't fix anything.

---

## Quick Reference

### PR-by-PR map of this session

| PR | Branch | Sub-priority | Merge SHA |
|---|---|---|---|
| #425 | `claude/audit-typology-nfkc-eMjGW` | P2c (NFKC pre-pass) | `8d95c50` |
| #426 | `claude/audit-anadolu-fixture-eMjGW` | P4 (Anadolu Birleşik fixture) | `7407882` |
| #427 | `claude/audit-observability-eMjGW` | P2a + P2b (cost + notification) | `6674bbc` |
| #428 | `claude/audit-cron-uncomment-eMjGW` | P3 (enable schedule cron) | `f12a7cb` |

### Run the audit layer locally

```bash
npm run audit:trends                                      # cheap, no judge calls
npm run audit:judge                                       # ~$0.045 / fixture × 4
npm run qa:extraction                                     # extraction quality gate
npx tsx scripts/diagnose-audit-judge-observability.ts     # post-deploy diagnosis
npx tsx scripts/probe-anadolu-birlesik.ts                 # one-off PDF probe
```

### Trigger the workflow manually

GitHub → Actions → "Audit Judge + Trends (Scheduled + Manual)" → "Run workflow" → leave `run_judge=false` for trends-only.

### Check audit_judgements live (post-PR-#427)

```sql
SELECT id, judge_model, finding_count, critical_count, cost_usd, created_at
FROM audit_judgements
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
-- Expected: cost_usd values should now be > 0 on rows post-deploy
```

### Check trend baselines for the new fixture

```sql
SELECT fixture_id, schema_version, qa_pass, run_at,
       metrics->>'coverages' AS cov,
       metrics->>'exclusions' AS excl,
       metrics->>'conditional_deductibles_count' AS cd_count
FROM audit_trend_snapshots
WHERE fixture_id = 'anadolu-birlesik-kasko'
ORDER BY run_at DESC
LIMIT 5;
```

---

## Files added/modified (this session)

### Source

- `src/lib/audit/typology.ts` — NFKC + whitespace pre-pass in `normaliseInsurer()` (PR #425, commit `bbcda86`)
- `src/lib/audit/__tests__/typology.test.ts` — 2 new regression tests (PR #425)
- `server/middleware/cost-control.ts` — `normaliseModelKey()` helper + suffix-tolerant lookup (PR #427)
- `server/services/audit-judge-service.ts` — `usedModel = judgeModel`; `evaluateNotificationDecision()` typed return; suppression-reason logging; escalated catch (PR #427)
- `server/__tests__/cost-control.test.ts` — 2 new regression tests (versioned name + short-suffix guard) (PR #427)

### Scripts

- `scripts/diagnose-audit-judge-observability.ts` — NEW (PR #427)
- `scripts/probe-anadolu-birlesik.ts` — NEW (PR #426)

### Workflow

- `.github/workflows/audit-judge-trends.yml` — `schedule:` cron uncommented; header comment rewritten (PR #428)

### Fixtures

- `tests/fixtures/kasko/anadolu-birlesik-kasko.pdf` — verbatim copy of `policies/ANADOLU.PDF`, force-added (PR #426)
- `tests/fixtures/golden/golden.json` — new 4th fixture entry (PR #426)
- `tests/fixtures/golden/README.md` — corpus count 3→4, expansion note rewritten (PR #426)

### Docs

- `CLAUDE.md` — Next Session Instructions items #1, #2, #10 rewritten; "Last Updated" bumped (PR #428)
- `SESSION_HANDOFF.md` — full rewrite (this file)
- `/root/.claude/plans/considering-that-i-prefere-serene-mist.md` — plan file authored Phase 4, approved before execution
