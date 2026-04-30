# ADR-022 — Post-deploy Smoke + Audit Infrastructure

**Status**: Accepted
**Date**: 2026-04-30
**Supersedes**: none
**Related**: ADR-020 (Backend QA Gate for Extraction Quality), ADR-019 (Shared Extraction Schema)

## Context

Throughout March-April 2026 the project shipped extraction-pipeline changes via single-PR-per-fix loops. Each merge required the reviewer to manually upload PDFs into the live UI and run SQL queries in Supabase to validate the fix landed. Three failure modes recurred:

1. **Opaque production errors.** Supabase failures inside background services were logged as `error: String(err)` → literal `"[object Object]"`, hiding the real `code/message/details/hint`. Six different services accumulated this anti-pattern. Production noise floor was so high that real bugs (schema drift, missing columns, CHECK violations) hid for days.

2. **Schema drift between TypeScript types and SQL tables.** `DocumentProcessingLog` accumulated 9 columns (`extraction_mode`, `extraction_route`, `request_id`, `fallback_used`, `fallback_chain`, `error_stack`, `error_type`, `error_code`, `error_context`) that were never added to the underlying `document_processing_logs` table. Every UPDATE silently failed. Same pattern bit `admin_notifications.category` CHECK constraint missing the `'performance'` value.

3. **Prompt fixes landing in the wrong code path.** A vehicle-mandate prompt rule (PR #399) was added to `src/lib/ai/kasko-parser-prompts.ts` (the Phase-2 comprehensive parser) but the live `/api/ai/extract/anthropic` endpoint reads its prompt from the `prompt_templates` DB table — a completely separate code path. The fix never reached production. Confirmed only via the smoke catching `vehicle.make` empty.

The reviewer's April 27 deep-review surfaced 15 P0/P1/P2 bugs that all reduced to one root cause: **production extraction quality was opaque**. Without continuous verification, regressions hid behind generic alerts.

## Decision

Introduce a **three-tier post-deploy verification infrastructure** plus a **cross-cutting structured-logging helper** so every Supabase failure surfaces its real cause.

### Tier 1 — Smoke (CI-gated)

`scripts/smoke-kasko.ts` runs on every push to `main` via `.github/workflows/smoke-kasko.yml`. ~3 minutes against 4 fixture PDFs. Pass rate ≥ 80% required to exit 0. Workflow uses three triggers (`workflow_dispatch`, `repository_dispatch:railway-deploy-success`, `push` to main with 150s sleep). Auto-comments on the most-recent merged PR with the failure tail when smoke fails on push trigger.

Architectural notes:
- **SSE-aware client.** Posts to `/api/ai/extract` with `Accept: text/event-stream` and parses the final SSE `data:` event. The `/api/ai/extract/anthropic` per-provider endpoint has no SSE keepalive and trips Railway's 30s edge timeout on real-PDF-sized payloads.
- **Chunked OCR via pdf-lib.** Mirrors `src/lib/ai/pdf-splitter.ts:DOCUMENT_AI_PAGE_LIMIT = 10`. Multi-page fleet PDFs split into ≤10-page chunks; OCR text concatenated with `\n\n[PAGE BREAK]\n\n` separator.
- **Cross-insurer leak guard.** Each fixture declares `forbiddenPhrases[]` of insurer-specific terms that MUST NOT appear in the extracted output (e.g. an Anadolu policy must never produce "CASU"). Catches the regression class fixed in PR #407.
- **Single 5xx retry** with 2s backoff. 4xx fail-fast.

### Tier 2 — Vehicle-only audit (ad-hoc)

`scripts/audit-all-policies.ts`. ~14 PDFs, ~25 minutes. Scans the broader `policies/` corpus for vehicle extraction quality (make/model/year/plate). Same chunked-OCR + SSE-extract architecture as Tier 1. Used after pipeline-wide changes to verify nothing regressed beyond the 4 fixture PDFs.

### Tier 3 — Full Sprint 2 surface (ad-hoc)

`scripts/audit-end-to-end.ts`. ~13 PDFs, ~30 minutes. Adds bundle detection, conditional-deductible severity bucketing, supplementary coverage count, exclusion count, per-coverage carve-outs, and Ask-Insurer template-match counts to the per-fixture report. Replicates matcher logic from `analyzeExclusionsComprehensive()` and `bucketConditionalDeductibleSeverity()` **inline** to avoid Vite-import crashes (gotcha #45). When production matcher logic changes, the inline copies must be updated in lockstep.

### Cross-cutting — `pgErr()` helper

`server/lib/pg-err.ts` exports `pgErr(err)` returning `{ pgCode, pgMessage, pgDetails, pgHint }`. All new server code that logs Supabase errors uses this helper. Existing pre-helper inlines (`admin-notification-service.ts` PR #384, `processing-log-service.ts` PR #393) carry site-specific extras (`diagnosticHint`) and were intentionally left in place.

## Consequences

### Wins
- **Catches regressions in 3 minutes.** First production verification cycle after every merge to main, no manual SQL.
- **Exposes real `pgCode`.** Production `[object Object]` cascades replaced with structured fields. Within 48 hours of shipping the helper, three latent bugs (PGRST204 missing column, PGRST205 missing table, 23514 CHECK violation) surfaced and were fixed.
- **Cross-insurer state-leak prevention.** Forbidden-phrase guard catches the entire regression class of one insurer's terminology bleeding onto another's output (the bug PR #407 fixed).
- **Reusable for diagnostics.** Same scripts run as ad-hoc broader-corpus checks after Sprint pushes.

### Trade-offs
- **CI cost.** Each smoke run consumes real Anthropic + Document AI tokens (~$0.30/run × 4 fixtures × N pushes/day). Acceptable at current scale; revisit if push frequency increases 10×.
- **Manual SQL apply.** Migrations 048-052 each require manual paste into Supabase SQL Editor — Railway does not auto-deploy SQL. The migration files use idempotent guarded UPDATEs (sentinel-string check via `WHERE NOT LIKE '%MARKER%'`) so re-runs are safe. Workflow fix is a follow-up.
- **Threshold tuning.** When new fixtures are added, the 80% pass-rate threshold may need bumping to avoid false positives on transient AI provider hiccups.
- **Inline matcher duplication.** `audit-end-to-end.ts` carries inline copies of `TEMPLATE_KEYWORDS` and `bucketSeverity()`. When production changes, the script must be updated. Trade-off vs. accepting Vite-import crashes from importing the production modules.

## Implementation references

| File | Role |
|---|---|
| `scripts/smoke-kasko.ts` | Tier 1 — CI-gated smoke |
| `scripts/audit-all-policies.ts` | Tier 2 — vehicle-only ad-hoc audit |
| `scripts/audit-end-to-end.ts` | Tier 3 — full Sprint 2 surface ad-hoc audit |
| `server/lib/pg-err.ts` | Cross-cutting `pgErr()` helper |
| `.github/workflows/smoke-kasko.yml` | CI workflow |
| `tests/fixtures/kasko/{fixtures.json,README.md,.gitignore}` | Tier 1 fixture manifest |
| `tests/fixtures/kasko/*.pdf` | 4 committed real-policy fixtures (Allianz Peugeot, Anadolu × 3) |

## Verification

April 30, 2026 baseline (post Sprint 0+1+2):

- **Tier 1 smoke**: 4/4 vehicle pass; 0 cross-insurer leaks
- **Tier 3 audit**: 13/13 extraction success; 10/13 bundles detected (3 correct false negatives); 7/13 with ≥1 Ask-Insurer template pre-filled; 3/13 with carve-outs surfaced
- **Logging plumbing**: production cascades replaced; first 48 hours surfaced PGRST204 / PGRST205 / 23514 root causes that prior `[object Object]` was hiding
- **Migration discipline**: 5 Supabase migrations (046, 047, 048, 049, 050, 051, 052) all applied via idempotent guarded UPDATEs; verified via `system_prompt LIKE '%MARKER%'` audit query
