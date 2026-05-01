# ADR-023 — Self-Audit Layer Architecture (Detectors → Render Contracts → LLM Judge → Trend Tracking)

**Status**: Accepted
**Date**: 2026-05-01
**Supersedes**: none
**Related**: ADR-020 (Backend QA Gate for Extraction Quality), ADR-022 (Post-deploy Smoke + Audit Infrastructure)

## Context

ADR-022 introduced a 3-tier post-deploy verification infrastructure (smoke + 14-PDF vehicle audit + 13-PDF Sprint 2 e2e). It successfully caught regressions in the *vehicle / coverage / bundle / pre-fill* surface — the structural extraction fields. But the reviewer's late-April deep-review surfaced 8 quality issues that none of the existing detectors caught:

1. Pert Araç triple-dedup (3 paraphrased rows pointing at the same scenario)
2. Missing 80% Kullanım Şekli scenario in `conditionalDeductibles`
3. 11 EK SÖZLEŞME bullets in raw text vs 1 supplementary surfaced
4. "Unlimited" headline without 2.5M industrial-site qualifier
5. Empty Exclusions panel rendering "3" but no body
6. Missing Ask-Insurer panel
7. Carve-out display contract violation (`isUnlimited && carveOuts.length > 0` with no UI caveat)
8. Inconsistent run-to-run extraction (10 insights one run → 3 the next on identical input)

Each issue was reproducible from the structured output + raw text. None of the existing 3 audit tiers (smoke, vehicle-only audit, Sprint 2 e2e) had a detector for any of them. The pattern: **the existing tiers verify *structural* correctness; we had no layer verifying *semantic* / *contractual* / *behavioral* correctness across runs.**

Without continuous semantic verification, three failure modes recurred:
1. **Paraphrase regressions** — Anthropic's run-to-run variation re-bucketed identical content into different fields, breaking downstream consumers that relied on field-stable counts
2. **Display-data contract drift** — UI rendered counts that didn't match data shape (Exclusions "3" with empty body)
3. **Slow-burn signal loss** — insight counts dropped from 10 → 3 across releases; no alert because both shapes passed schema validation

## Decision

Introduce a **4-phase self-audit layer** that augments the 3 existing tiers with semantic, contractual, behavioral, and trend-stability checks.

### Phase 1 — Deterministic detectors (`src/lib/audit/quality-detectors.ts`)

4 pure functions that take an `AnalyzedPolicy` + raw text and emit `{ severity: 'critical' | 'warn' | 'pass', detail }`:
- `checkFinancialRisksDedup()` — runs trigram Jaccard at 0.65 threshold over bucketed evaluation issues
- `checkEkSozlesmeBulletParity()` — extracts bullets from raw text, compares to supplementary coverage count
- `checkNamedScenarioCoverage()` — iterates `NAMED_DEDUCTIBLE_SCENARIOS`; critical when missing scenario has %≥80
- `checkCarveOutDisplayContract()` — flags unlimited coverages with carve-outs but no UI caveat

Critical-severity findings push to `extractionGateTriggers[]` and set `extractionIncomplete = true` (flowing into the existing `displayedAiConfidence` cap at 0.65). Warn-level findings populate a non-blocking `qualityFindings[]` array — visible in admin reports, never gates the UI.

### Phase 2 — Render-contract Playwright tests (`e2e/render-contract.spec.ts`)

Browser-level DOM contracts that catch the silent-render-failure class. Each test mocks Supabase via the existing localStorage-injection pattern and asserts:
- Data N items → DOM N rendered rows (exclusions, ask-insurer, supplementary)
- Tolerance allowed for legitimate dedup (≥9 rendered for 11 input EK SÖZLEŞME items)
- Caveat presence on `isUnlimited && carveOuts.length > 0`

Wired into the existing staging.yml + production.yml E2E jobs. No new workflow file.

### Phase 3 — LLM-as-judge layer (`server/services/audit-judge-service.ts`)

Per-policy fire-and-forget Anthropic Sonnet 4.6 critique of an extracted policy. Run **once per typology** `(insuranceLine × country × yearBucket × insurer)` SHA-256 hash, cached in `audit_judgements`. Subsequent identical-typology uploads skip the LLM call.

Architectural notes:
- **Typology cache key**: `SHA-256(insuranceLine|country|yearBucket|insurer-normalized)`. `yearBucket = floor(year / 2) * 2` — 2-year buckets balance freshness vs cost (~400 unique typologies for 8 active insurers × 2 branches × 5 buckets × 5 countries).
- **Trigger paths**: (a) server-side fire-and-forget at end of `convertToAnalyzedPolicy()` in `policy-extractor.ts` next to `persistPilotQARecord()`, with `process.env.NODE_ENV !== 'test'` guard (gotcha #1); (b) ad-hoc CLI via `npm run audit:judge` against curated golden corpus.
- **Daily-budget circuit breaker**: `judge_max_runs_per_day` (default 50) in `app_settings` category `'audit'`, enforced via `COUNT(*)` over the last 24 hours.
- **Quote-verification post-check** (hallucination guard): each finding includes a `quote` field; the service asserts the quote appears as a substring of `rawText` (case-insensitive after Turkish-fold per gotcha #62). Findings whose quote is hallucinated get downgraded to `severity = 'warn'` with `quote_verified: false`.
- **Configuration in DB, not code**: prompt loaded via `getRenderedPrompt('Audit Judge - Kasko')` from `prompt_templates`; budget/model/notification settings in `app_settings`; permissive RLS on `audit_judgements` to mirror migration 040's pattern (auth at API layer, not service-role-only).
- **Naming guard**: every identifier uses `auditJudge` / `AUDIT_JUDGE` prefix to avoid collision with the existing `JUDGE_*` constants in `server/lib/self-healing.ts` (different purpose).

Browser-side wrapper at `src/lib/audit/judge-client.ts` — fire-and-forget POST to `/api/ai/audit-judge`, never awaits, returns 202 immediately.

### Phase 4 — Fixture-level trend tracking (`scripts/audit-trend-track.ts`)

Detects regressions like "previous run extracted 10 insights, this run extracted 3" — even when both runs pass schema validation. Operates on a curated golden corpus (`tests/fixtures/golden/`).

For each fixture: OCR + extract → compute 6 trend metrics (coverages, exclusions, conditional_deductibles, ai_insights, supplementary_count, bundle_products) → query last successful snapshot → compare → persist new snapshot. Drops ≥30% trigger warn; ≥60% trigger critical (subject to `MIN_BASELINE_FOR_REGRESSION` floor).

CI workflow at `.github/workflows/audit-judge-trends.yml` is `workflow_dispatch` only initially; `schedule:` cron commented out until 1-2 manual runs confirm calibration. Cost note: trends-only runs are cheap (~$0.001 per fixture for OCR + extract); judge calls are gated separately.

## Consequences

### Wins
- **Catches the 8 reviewer-identified issues that prior tiers missed.** Verified live on May 1: per-policy hook fired 7-8 findings per upload (3 critical) on Anadolu kasko fixtures including Pert Araç deductible missing and Artan Mali Sorumluluk framing inaccuracy.
- **Cost-bounded by design.** Typology cache + daily-budget breaker + quote-verification all minimize cost. Steady-state: ~1 LLM call per unique typology per prompt-version, ~$0.015/call (Sonnet 4.6).
- **Surfaces drift before users see it.** Trend tracking catches signal loss between releases (the 10 → 3 insights case) before anyone notices in production.
- **Permissive-RLS pattern preserved.** `audit_judgements` and `audit_trend_snapshots` follow migration 040's precedent (auth at API layer), maintaining consistency with `kasko_pilot_qa_records`.
- **Schema unification across migrations.** Each phase ships with its migration in the same PR (gotcha #134 rule), no schema drift.

### Costs
- **Production complexity.** Three new database tables (`audit_judgements`, `audit_trend_snapshots`, plus the prompt + 3 settings rows seeded in 054). One new background fire-and-forget pathway in `policy-extractor.ts`. One new CI workflow.
- **3 deferred follow-ups still open** (gotchas #143, #144, #145):
  1. `cost_usd` is null on every persisted row (`calculateCost()` lacks `claude-sonnet-4-6` pricing)
  2. Admin notifications not firing on critical findings (likely string-vs-boolean comparison on `judge_critical_notify_first_only`)
  3. `normaliseInsurer()` doesn't NFKC-normalise or collapse internal whitespace, allowing cache bypass on visually-equivalent insurer strings
- **Calibration debt.** The Phase 4 noise floor required tuning (3 → 5) on the very first calibration cycle. Future tuning may be needed if golden corpus grows or extraction prompts change.

### Trade-offs Considered
- **Why a separate `audit_judgements` table instead of extending `kasko_pilot_qa_records`?** Different concerns: pilot QA is reviewer-outcome focused (per-policy human verdict); audit judge is per-typology automated critique. Coupling them would force every pilot record to carry a typology hash and every audit row to carry a reviewer verdict. The plan keeps the concerns separate.
- **Why fire-and-forget instead of synchronous?** The judge run takes 5-30s. Adding it to the user-facing extraction flow would push the apparent extraction time past the patience threshold. Fire-and-forget lets the result land server-side for the next consumer (UI surface deferred to Phase 3 follow-up; for now consumed only via the admin dashboard).
- **Why typology cache instead of per-policy?** Cost. Without the cache, the judge would run on every upload (~$0.015 × thousands of uploads). With the typology cache, steady-state cost is bounded to ~one call per unique `(line × country × year-bucket × insurer)` tuple per prompt-version — under $10/month at current upload volumes.
- **Why permissive RLS instead of service-role-only?** Mirrors migration 040's precedent. The `kasko_pilot_qa_records` table is also permissive RLS, and the `usePilotGateOptions` hook + browser-side `judge-client.ts` both use the anon key. Tightening RLS would require granting service-role keys to those clients or a separate auth path.

## Verification

1. **Migrations applied.** `SELECT relrowsecurity FROM pg_class WHERE relname IN ('audit_judgements', 'audit_trend_snapshots');` → both `t`. `SELECT name FROM prompt_templates WHERE name = 'Audit Judge - Kasko';` → 1 row. `SELECT key, value FROM app_settings WHERE category = 'audit';` → 3 rows.
2. **Per-policy hook live.** `SELECT COUNT(*) FROM audit_judgements WHERE policy_id IS NOT NULL;` ≥ 1 confirms the fire-and-forget hook fired on a real upload. Confirmed May 1 with 2 rows from production uploads.
3. **Trend baseline established.** `SELECT COUNT(*) FROM audit_trend_snapshots WHERE qa_pass = true;` ≥ 3 confirms first-run baselines for all 3 golden fixtures.
4. **Workflow goes green.** Manual `workflow_dispatch` of `audit-judge-trends.yml` with `run_judge=false` exits 0 if no fixture has a CRIT regression.
5. **Cache hit on re-upload.** Upload the same insurer + year-bucket policy twice; second upload should NOT insert a new `audit_judgements` row (cache hit short-circuits the LLM call).

## References

- Plan: `docs/feed-back-into-extractionincomplete-elegant-emerson.md`
- Phase 1 commit: `ab2bd21`
- Phase 2 commit: `9e4e7a9`
- Phase 3 commit: `a74f8fc`
- Phase 4 commit: `fbbe61f`
- Per-policy hook: `2f144c8`
- Cross-platform fix: `9902f97`
- Template-brace fix: `37791c9`
- Server-build fix: `039b695`
- Workflow secrets fix: `bef0727`
- Exit-code fix: `f4ef4d0`
- Noise-floor calibration: `776b1a4`
- Migrations: `053_audit_judgements_table.sql`, `054_seed_audit_judge_prompt_and_config.sql`, `055_audit_trend_snapshots.sql`
