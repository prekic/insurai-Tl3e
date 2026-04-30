# Session Handoff — April 30, 2026 — Sprint 0+1+2 Reviewer-Fix Pass + Smoke Automation

> **Session type**: Production reviewer-fix sprint. Shipped 14 PRs and applied 5 Supabase migrations. Closed Sprint 1 (P0 hard-blockers) and Sprint 2 (P1 high-value-accuracy). Introduced a new three-tier post-deploy verification infrastructure (smoke + audits) and cleared the production logging noise floor with structured PostgrestError logging. See `docs/adr/022-post-deploy-smoke-and-audit-infrastructure.md`.

## 🎯 Immediate Next Steps for the Next Agent (priority-ordered)

### Priority 1 — Verify migration 049 attribution rules against the reviewer's exact fixture
The Apr-30 e2e audit showed `cd=0` (zero conditional deductibles) across all 13 corpus PDFs. The reviewer's exact Anadolu Birleşik Kasko fixture (with %35 / %80 named scenarios) is **NOT** in `policies/`. Manually upload it via the live UI on `https://insurai-production.up.railway.app/` and run:

```sql
SELECT raw_data->>'conditionalDeductibles' AS cd
FROM policies WHERE type = 'kasko' ORDER BY created_at DESC LIMIT 1;
```

Expect a non-empty array with strings like `"Anlaşmalı olmayan servis: %35"`. If empty, migration 049's named-scenario rules need re-verification at `prompt_templates.system_prompt LIKE '%COVERAGE LIMIT ATTRIBUTION%'`.

### Priority 2 — Manual UI verification (Anadolu fixture)
Same fixture, look at the result page in production:
- **Bundle badge**: purple "Bundle Policy" pill in the hero header + product-pill block listing the 4 bundled products
- **Itemized financial risks**: one row per conditional deductible (NOT the old generic "requires review" message); critical/high/medium severity badges
- **Pre-filled Ask-Insurer**: green "Addressed in policy" badge on Commercial Use with `Kullanım Şekli: %80` as the verbatim answer
- **Rayiç vs fixed Bedeli**: hero card shows "Rayiç Değer (Market Value at Loss)" + 3-quote emsal methodology gloss instead of generic "Vehicle Market Value"

### Priority 3 — Sprint 3 polish (reviewer's tail; ship before public release)
- #10 premium split detail (Net + BSMV breakdown)
- #12 coverage transfer context (NCD preserved from prior insurer)
- #13 Special Provisions panel (between Coverage and Exclusions)
- #14 AS+ servis network callout (NCD-protection feature)
- #15 output stability tuning (run-to-run variance investigation)

### Priority 4 — Re-run smoke periodically
Two transient `All AI providers failed` events were observed during this session's verification. Production `/api/health` was OK both times. If smoke fails 3+ runs in a row, check Anthropic + OpenAI status pages before assuming a regression.

```bash
SMOKE_BASE_URL=https://insurai-production.up.railway.app npm run smoke:kasko
```

## Files added/modified (this session, by phase)

### Phase 1 — Logging plumbing (PRs #393-#398)
- `server/lib/pg-err.ts` — NEW shared `pgErr(err)` helper returning `{ pgCode, pgMessage, pgDetails, pgHint }`
- `server/services/processing-log-service.ts` — 10 sites updated to use structured logging (PR #393)
- `server/__tests__/processing-log-branches.test.ts` — assertions updated for new shape
- `server/middleware/monitoring.ts` — response-time alert thresholds raised 5s/10s → 60s/90s (PR #396)
- `server/__tests__/monitoring-branches.test.ts` — threshold assertions updated
- `server/services/extraction-metrics-service.ts` — adopted `pgErr()` (PR #397)
- `server/routes/policy.ts` — fixed anonymous-policy insert (mapped to actual schema cols, used `raw_data` not `policy_data`); adopted `pgErr()` (PR #398)
- `server/routes/ai/shared.ts` — adopted `pgErr()`
- `supabase/migrations/046_processing_log_schema_drift_fix.sql` — NEW; adds 9 missing columns (`extraction_mode`, `extraction_route`, `request_id`, `fallback_used`, `fallback_chain`, `error_stack`, `error_type`, `error_code`, `error_context`) — **manually applied to prod**
- `supabase/migrations/047_admin_notifications_performance_category.sql` — NEW; widens CHECK constraint to allow `'performance'` — **manually applied to prod**

### Phase 2 — Smoke + audit infrastructure (PRs #399-#411)
- `scripts/smoke-kasko.ts` — NEW; 4-fixture CI smoke; pdf-lib chunked OCR; SSE-aware client; cross-insurer leak guard via `forbiddenPhrases[]`; 5xx single retry
- `scripts/audit-all-policies.ts` — NEW; 14-PDF vehicle-only audit (~25 min)
- `tests/fixtures/kasko/` — NEW; 4 PDFs (Allianz Peugeot, Anadolu Renault Clio, Anadolu VW Tiguan, Anadolu VW Golf), `fixtures.json`, `README.md`, `.gitignore`
- `.github/workflows/smoke-kasko.yml` — NEW; CI gate, fires on push to main with 150s sleep + workflow_dispatch + repository_dispatch:railway-deploy-success
- `package.json` — new `smoke:kasko` script (tsx already in devDeps)
- `README.md` — new `## Smoke Tests` section

### Phase 3 — Sprint 1 P0 reviewer fixes (PRs #407-#410 + migration 049)
- `src/components/PolicyDetailView/PolicyKeyMetricsAndDiscounts.tsx` — removed hardcoded `"Glass: 20% outside CASU"` cross-contamination string, replaced with `t.policy.deductibleConditional` (PR #407)
- `src/components/PolicyDetailView/PolicyOverviewCard.tsx` — derived `isRayicBedeli` flag and rayiç label/help (PR #408)
- `src/lib/ai/table-parser.ts` — added `'hukuksal koruma'` substring map (PR #409)
- `supabase/migrations/048_inject_vehicle_mandate_into_extraction_prompts.sql` — NEW; appends "MANDATORY VEHICLE FIELDS" to live DB prompts — **manually applied to prod**
- `supabase/migrations/049_coverage_limit_attribution_rules.sql` — NEW; adds service-tier rules + Hukuksal Koruma 4-limit preservation — **manually applied to prod**
- `tests/fixtures/kasko/fixtures.json` — added `forbiddenPhrases[]` per fixture
- `src/lib/i18n/translations-{en,tr,skeleton}.ts` + `translations.ts` — `policy.deductibleConditional`, `policy.rayicBedeliLabel`, `policy.rayicBedeliHelp` (4-file rule, gotcha #98)

### Phase 4 — Sprint 2 P1 high-value-accuracy (PRs #412-#416 + migrations 050/051/052)
- `shared/extraction-schema.ts` — added `isBundle` + `bundleProducts` (top-level required count 32→34)
- `src/lib/ai/extraction-schema.ts` — mirrored on `ExtractedPolicyData`
- `src/types/policy.ts` — added `isBundle?` + `bundleProducts?` on `AnalyzedPolicy`
- `src/lib/ai/policy-converter.ts` — propagated isBundle/bundleProducts; **dropped `< 3` gate** on Ek Sözleşme regex fallback; added `dedupByTrigramJaccard()` (stemmed-word, 4-char prefix, 0.70 threshold)
- `src/lib/ai/extraction/mappers.ts` — derives isBundle from `data.policy.productName`
- `src/components/PolicyDetailView/PolicyOverviewCard.tsx` — purple "Bundle Policy" badge + product-pill block
- `src/components/PolicyDetailView/PolicyOverviewCard.test.tsx` — NEW; 4 regression tests
- `src/lib/policy-evaluation/evaluator.ts` — itemized conditional-deductible Issues (severity bucketed by %); carve-outs surfaced as their own medium-severity Issues; new `bucketConditionalDeductibleSeverity()` + `translateConditionalDeductibleEN()` helpers
- `src/lib/policy-evaluation/__tests__/financial-warnings-itemized.test.ts` — NEW; 6 tests
- `src/lib/policy-evaluation/__tests__/qa-audit-regression.test.ts` — fixture passed strings instead of objects
- `src/lib/knowledge/kasko-knowledge.ts` — explicit `keywords[]` per template; `analyzeExclusionsComprehensive()` accepts `conditionalDeductibles[]` and `coverageCarveOuts[]`; emits `addressedByPolicy[]`
- `src/lib/knowledge/kasko-knowledge.test.ts` — updated assertion for broadened keyword matching
- `src/lib/knowledge/ask-insurer-prefill.test.ts` — NEW; 7 tests
- `src/lib/reviewer/policy-reviewer-summary.ts` — passes conditionalDeductibles + flattened carveOuts into analyzer
- `src/components/PolicyDetailView/PolicyCoverageSection.tsx` — green "Addressed in policy" badge + verbatim answer rendering
- `src/lib/i18n/translations-{en,tr,skeleton}.ts` + `translations.ts` — `policy.bundleBadge`, `policy.bundleHelp`, `policy.addressedByPolicy`
- `shared/__tests__/extraction-schema.test.ts` — count assertion 32→34
- `supabase/migrations/050_bundle_policy_detection_rules.sql` — **manually applied to prod**
- `supabase/migrations/051_kasko_supplementary_coverage_rules.sql` — **manually applied to prod**
- `supabase/migrations/052_kasko_exclusion_extraction_rules.sql` — **manually applied to prod**

### Phase 5 — Diagnostic infrastructure
- `scripts/audit-all-policies.ts` — NEW (PR #411); 14-PDF vehicle-only audit
- `scripts/audit-end-to-end.ts` — NEW (PR #417); 13-PDF full Sprint 2 surface (bundle + cd + supp + excl + carve + addr columns); ~30 min runtime

### Phase 6 — Documentation sync (this PR)
- `CLAUDE.md` — Next Session Instructions block rewritten; gotchas #133-#141 added; Last Updated bumped to April 30, 2026
- `SESSION_HANDOFF.md` — full rewrite (this file)
- `docs/adr/022-post-deploy-smoke-and-audit-infrastructure.md` — NEW

## Current State

**Branch**: `chore/session-handoff-sprint12-and-adr022` (this PR). Working tree clean except docs.
**Database**: 5 manual SQL migrations applied this session (046, 047, 048, 049, 050, 051, 052). Verify via:
```sql
SELECT name,
  system_prompt LIKE '%MANDATORY VEHICLE FIELDS%' AS has_048,
  system_prompt LIKE '%COVERAGE LIMIT ATTRIBUTION%' AS has_049,
  system_prompt LIKE '%BUNDLE POLICY DETECTION%' AS has_050,
  system_prompt LIKE '%SUPPLEMENTARY COVERAGE EXTRACTION%' AS has_051,
  system_prompt LIKE '%EXCLUSION EXTRACTION (kasko / traffic)%' AS has_052
FROM prompt_templates
WHERE name IN ('Kasko Extraction','Traffic Insurance Extraction','Policy Extraction - Master');
```
**Tests**: All Sprint 1 + Sprint 2 test suites green (PolicyDetailView 25/25, evaluator 561/562, kasko-knowledge 297/297, AI extraction 444/444). One pre-existing flake in `service.test.ts` getNonCompliant — unrelated to this session, also fails on clean main.
**Env vars**: **No new env vars added this session.** Smoke uses existing `PRODUCTION_SERVER_URL` only. The `PROD_SUPABASE_SERVICE_KEY` and `SMOKE_AUTH_TOKEN` secrets that were added mid-session for an earlier smoke design are **unused** by the current smoke (PR #404 simplified the contract). Safe to delete or leave.
**Smoke status**: 4/4 vehicle pass with 0 cross-insurer leaks (verified live). Two transient "All AI providers failed" events observed; not Sprint-2-caused.

## Configuration Requirements

- **No new env vars.** All session work used existing keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GCP_SERVICE_ACCOUNT_BASE64`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRODUCTION_SERVER_URL`).
- **GitHub Secrets needed for CI smoke**: only `PRODUCTION_SERVER_URL` (already configured).
- **Supabase**: 5 migrations require manual SQL apply (046, 047, 048, 049, 050, 051, 052) — **all already applied** per the verification queries the user ran during the session.
- **Railway**: no config changes; sandbox `git push` does not trigger Railway, use `mcp__github__merge_pull_request` for deploy webhooks (gotcha #22).

## Bugs / Known Issues

1. **Two transient "All AI providers failed" smoke runs** (Apr 30) — production `/api/health` was OK both times. Anthropic / upstream rate-limit hiccup, not a regression.
2. **`cd=0` across the entire 13-PDF audit corpus** — this corpus genuinely lacks named-percentage scenarios. The reviewer's specific Anadolu Birleşik Kasko fixture is NOT in `policies/`; manual upload required to validate migration 049 firing (Priority 1 above).
3. **Pre-existing `service.test.ts` `getNonCompliant()` flake** — unrelated to this session; fails on clean main too. Not investigated.
4. **Police-433425980.pdf partial extraction** (21 pages) — vehicle fields all empty despite qualityScore 0.92. Likely scanned PDF with poor OCR; left as a follow-up Sprint 3 / Test C item.
5. **Schema drift between live FLAT and comprehensive NESTED extraction shapes** — addressed by gotcha #140 but not unified. Adding any new schema field requires touching BOTH paths.
6. **Live DB extraction prompts vs `kasko-parser-prompts.ts` source-of-truth ambiguity** — gotcha #138 documents the rule (DB is canonical for `/api/ai/extract/anthropic`). New prompt rules MUST land as Supabase migrations.

## What This Session Produced (5 phases)

### Phase 1 — Production logging plumbing (PRs #393-#398 + migrations 046/047)
Production logs were emitting `error: "[object Object]"` for every Supabase failure because services used `error: String(err)` which loses `code/message/details/hint`. Introduced shared `server/lib/pg-err.ts` and migrated 4 sites. Schema drift on `document_processing_logs` (9 missing columns) and `admin_notifications.category` CHECK (missing `'performance'`) were exposed by the new structured logging — fixed via migrations 046/047. Response-time alert thresholds raised from unrealistic 5s/10s to realistic 60s/90s (PR #396).

### Phase 2 — Smoke + audit infrastructure (PRs #399-#411)
Built `scripts/smoke-kasko.ts` as a CI gate. Iterated through 4 design revisions (DB poll → upload-to-save-anonymous → flat-field shape → SSE-keepalive against `/api/ai/extract` → page-chunking via pdf-lib → forbidden-phrase leak guard → 5xx retry). Companion `scripts/audit-all-policies.ts` for ad-hoc 14-PDF vehicle-only checks. CI workflow at `.github/workflows/smoke-kasko.yml` fires on push-to-main with 150s sleep, supports `repository_dispatch:railway-deploy-success` for instant trigger.

### Phase 3 — Sprint 1 P0 hard-blockers (PRs #407-#409, #410 + migration 049)
- #1 hardcoded "Glass: 20% outside CASU" deductible label → replaced with generic i18n key
- #6 rayiç vs fixed Sigorta Bedeli detection → derived flag from `Coverage.isMarketValue`
- #3 Hukuksal Koruma → Roadside Assistance limit mis-attribution → table-parser entry + migration 049 prompt rules (service-tier → null limit; preserve all 4 Hukuksal limits)
- Test A cross-insurer leak guard added to smoke fixtures

### Phase 4 — Sprint 2 P1 high-value-accuracy (PRs #412-#416 + migrations 050/051/052)
- #4 Birleşik Kasko bundle detection — schema fields, UI badge, product-pill block, prompt rule
- #8 missing supplementary coverages — dropped regex-fallback gate, added enumerated Anadolu add-ons to prompt
- #9 exclusion paraphrase dedup — stemmed-word Jaccard pre-pass at 0.70 threshold; tightened extraction scope
- #7 Critical Financial Risks itemized — one Issue per conditional deductible (severity bucketed by %); carveOuts surfaced as separate Issues
- #11B Ask-Your-Insurer pre-fill — explicit `keywords[]`, multi-source matcher (exclusions + conditionalDeductibles + coverageCarveOuts), green "Addressed in policy" badge

### Phase 5 — Documentation sync (this PR)
CLAUDE.md "Next Session Instructions" block rewritten; gotchas #133-#141 added; Last Updated bumped. Fresh SESSION_HANDOFF.md (this file). New ADR-022 documenting the three-tier verification infrastructure.

## Non-Negotiable Rules (Carry Forward + 2 new)

1-19. (unchanged from prior session)

20. **When adding a new field to a TS type that maps to a DB row, write a migration in the same PR.** Schema drift like the `document_processing_logs` 9-column gap is invisible in dev but fatal in production (gotcha #134).

21. **Live DB extraction prompts (`Kasko Extraction`, `Traffic Insurance Extraction`, `Policy Extraction - Master`) are the source of truth for `/api/ai/extract/anthropic`, NOT `src/lib/ai/kasko-parser-prompts.ts`.** Prompt rule changes for the live endpoint MUST land as a Supabase migration that updates `prompt_templates.system_prompt` (gotcha #138).

22. **Smoke test scripts replicate matcher logic inline** (TEMPLATE_KEYWORDS, severity bucketing) to avoid Vite-import crashes (gotcha #45). When the matcher logic in production code changes (`kasko-knowledge.ts:COMMON_EXCLUSIONS_TO_CHECK.keywords`, `evaluator.ts:bucketConditionalDeductibleSeverity`), update the inline copies in `scripts/audit-end-to-end.ts` and `scripts/smoke-kasko.ts` to keep them honest (gotcha #137).
