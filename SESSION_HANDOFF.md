# Session Handoff — April 8, 2026 (3 Latent Bug Fixes — Schema Strict Mode + Safe Default)

## Current State

**Working branch `claude/load-project-context-BrcKa` is clean and pushed to origin.** Today's session was an unplanned audit-and-fix sweep triggered by a refactor of the pilot batch ingestion script. Three latent production bugs were uncovered, fixed, verified, and closed as GitHub issues #331, #332, #333. All three were silent in normal production paths but would have triggered under specific conditions (strict-mode JSON schema usage, server extraction with rich evidence/clauseGraph schemas, analysis pipeline error fallback). The pilot calibration goal remains blocked on sample size — only 4 PDFs ingested vs. the 50+ needed for grade threshold calibration.

### Status of All Priorities

| # | Priority | Status |
|---|----------|--------|
| 0 | **🔴 URGENT — Rotate leaked secrets from earlier in session** | **PENDING — user must do** |
| 1 | L-1: Client schema OpenAI strict-mode compliance (#331) | **DONE** — commit `28827fd` |
| 2 | L-2: Server schema parity for evidence + clauseGraph + exclusionsEn (#332) | **DONE** — commit `ec48b0b` |
| 3 | L-3: Complete safe-default AnalysisBundle (#333) | **DONE** — commit `1cf9a96` |
| 4 | Process Real KASKO PDFs (round-4 verification) | **DONE** — 4/4 success, confidence 0.22-0.42 (vs round-3 0.12-0.32) |
| 5 | Apply Migrations 042 + 043 (carry forward from prior session) | **PENDING** — manual SQL |
| 6 | Bulk Ingest Pilot KASKO PDFs (carry forward) | **PENDING** — needs user PDF drops |
| 7 | Execute Backfill Engine (depends on #6) | **PENDING** |
| 8 | Calibrate Grade Thresholds (depends on #7) | **PENDING** |
| 9 | Update Benchmark Premium Ranges | **BLOCKED** — needs market research |
| 10 | Optional follow-up PR: schema unification (deferred from #332) | **DEFERRED** |
| 11 | Optional follow-up PR: strict-mode CI validator (deferred from #331) | **DEFERRED** |

## What Was Done This Session

### 1. L-1 — Client schema OpenAI strict-mode compliance (commit `28827fd`, closes #331)

The client `EXTRACTION_JSON_SCHEMA` declared `strict: true` but multiple property objects had fields in `properties` that were not in their `required[]` arrays. OpenAI's Structured Outputs strict mode rejects this with HTTP 400 when actually exercised — silent until I tried to use it from the round-3 batch script.

**Three violations fixed:**
1. `coverages.items.required[]`: added `limit`, `deductible`, `description`, `category` (4 nullable fields)
2. `clauseGraph.edges.items.required[]`: added `description` (nullable)
3. **Top-level `required[]`** (discovered during the OpenAI-API reproduction step, not in the original audit): added `exclusionsEn` and `conditionalDeductibles` — both intentionally-loose nullable arrays. Top-level required count went from 17 to 19. The `extraction-schema.test.ts:100` count assertion was updated.

**Verified**: 68 client schema tests pass, 0 typecheck errors, manual OpenAI strict-mode reproduction (POST `gpt-4o-mini` with `response_format: { type: 'json_schema' }`) returns HTTP 200 with all 19 top-level fields.

### 2. L-2 — Server schema parity (commit `ec48b0b`, closes #332)

`server/schemas/extraction-schema.ts` was missing `exclusionsEn`, `evidence`, and `clauseGraph` top-level fields entirely. Production HTTP extraction (which routes through the server schema) silently was not requesting verbatim evidence quotes or clause-graph relationships — even though downstream consumers expected them. Pre-existing drift documented in commit `0b99332`.

**Fix**: copied the three missing field definitions verbatim from the client schema, including their nested object shapes (`evidence.insights[]`, `evidence.exclusions[]`, `clauseGraph.edges[]`). All three added to the server's top-level `required[]` (16 → 19 fields). The recursive `validateStrictCompliance()` test at `server/schemas/extraction-schema.test.ts:189-228` validated that every property in every nested object is in its corresponding `required[]`.

**Verified**: 14 server schema tests pass, 0 typecheck errors, manual OpenAI strict-mode reproduction with the server schema returns HTTP 200 with `evidence`/`clauseGraph`/`exclusionsEn` populated as empty arrays (correct for a trivial test input).

### 3. L-3 — Complete safe-default AnalysisBundle (commit `1cf9a96`, closes #333)

`generateAnalysisBundle()` in `src/lib/analysis/engine.ts` returned a partial stub `{ scoreBundle: { overall: 0, components: {} } }` from both error paths (null data guard at line 41-51 and try/catch at line 75-93). Cast through `as unknown as AnalysisBundle` to bypass TypeScript. Any consumer reading `analysis.scoreBundle.scores.extractionQualityScore` (e.g., `evaluateDisplayMode` in `review-thresholds.ts:182`) crashed with `Cannot read properties of undefined (reading 'extractionQualityScore')` when the safe default actually fired.

**Fix (Option B from issue #333)**: introduced `createSafeDefaultBundle(policyId, validation, reason)` helper that returns a fully-shaped `AnalysisBundle` with all 5 score families (`extractionQualityScore`, `policyStructureScore`, `consumerSafetyScore`, `competitivenessScore`, `riskAttentionScore`) as complete `ScoreDetail` objects with `scoreValue: 0`, `suppressed: true`, and `suppressionReason` carrying the cause. Both safe-default returns now use the helper. The `as unknown as` cast is gone — type safety restored end-to-end.

**Verified zero consumers depend on the broken shape**:
- `grep -rn 'scoreBundle.components' src/ server/ scripts/` → 0 hits
- `grep -rn 'scoreBundle.overall\b' src/ server/ scripts/` → 0 hits

**3 new tests added** to `engine.test.ts` covering the previously-untested safe-default path: null data guard, internal pipeline error path (using `vi.doMock` to force `generateScoreBundle` to throw), and verifying the safe default routes correctly through `evaluateDisplayMode` to `human_review_required` instead of crashing. **54 regression tests across affected files all pass** (6 engine + 6 review-thresholds + 42 branch-pipeline).

### 4. Round-4 live integration test

Re-ran `scripts/pilot-batch-ingest.ts` against the same 4 KASKO PDFs from prior rounds:

| File | Round-3 confidence | Round-4 confidence | Display mode (round-4) |
|---|---|---|---|
| ANADOLU.PDF | 0.30 | **0.35** | restricted |
| KASKO POLİÇESİ | 0.32 | **0.42** | restricted (was human_review_required) |
| Allianz | 0.12 | **0.22** | human_review_required |
| eriş ambalaj | 0.32 | **0.42** | restricted (was human_review_required) |

Confidence range moved from `0.12–0.32` (round-3) to `0.22–0.42` (round-4); avg coverages went 5.3 → 5.5; 2 of 4 PDFs upgraded from `human_review_required` to `restricted`. The L-1 and L-2 fixes (richer schemas with `evidence`, `clauseGraph`, `exclusionsEn`, `conditionalDeductibles`) gave the LLM more structured fields to populate, improving extraction quality scores. L-3 had no functional impact on this run since the safe-default path didn't fire — it just removed the latent crash risk.

## All Modified Files (This Session)

| File | Change |
|------|--------|
| `src/lib/ai/extraction-schema.ts` | **UPDATED** — L-1 fix: added 5 fields to nested `required[]` arrays + 2 fields to top-level `required[]` |
| `src/lib/ai/extraction-schema.test.ts` | **UPDATED** — Required count assertion 17 → 19 |
| `server/schemas/extraction-schema.ts` | **UPDATED** — L-2 fix: added `exclusionsEn`, `evidence`, `clauseGraph` (3 top-level fields, nested shapes mirrored from client) |
| `src/lib/analysis/engine.ts` | **UPDATED** — L-3 fix: introduced `createSafeDefaultBundle()` helper, removed `as unknown as` cast |
| `src/lib/analysis/__tests__/engine.test.ts` | **UPDATED** — 3 new tests for safe-default path coverage |
| `CLAUDE.md` | **UPDATED** — Refreshed Next Session Instructions (added secrets rotation + deferred follow-ups), added gotchas #47/#48/#49, updated Last Updated to April 8 |
| `SESSION_HANDOFF.md` | **UPDATED** — This file (rewritten in place for April 8 session) |

## Quality State

- **TypeScript**: 0 errors (`npx tsc --noEmit` verified clean after each commit).
- **ESLint**: not run today; prior session was clean (0 errors, 0 warnings).
- **Tests** (isolated, NOT full suite): **136 affected tests all pass.**
  - 68 client schema tests (`src/lib/ai/extraction-schema.test.ts`)
  - 14 server schema tests (`server/schemas/extraction-schema.test.ts`)
  - 6 engine tests (`src/lib/analysis/__tests__/engine.test.ts` — 3 existing + 3 new for safe-default path)
  - 6 review-thresholds tests (`src/lib/analysis/__tests__/review-thresholds.test.ts`)
  - 42 branch-pipeline tests (`src/lib/analysis/__tests__/branch-pipeline.test.ts`)
- **Live integration**: round-4 batch script run against 4 PDFs returned 4/4 success.

## Migrations to Apply (Copy-Paste into Supabase SQL Editor)

**Carry forward from prior April 4 session — still need manual application. NO new migrations from today.**

### Migration 042 — isDraft Column

```sql
-- Migration 042: Add is_draft column to policies table
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_policies_user_is_draft ON public.policies (user_id, is_draft);
```

### Migration 043 — Benchmark Threshold Configs

```sql
-- Migration 043: Seed benchmark aging/stale threshold configs
INSERT INTO public.app_settings (category, key, value, description, "schema")
VALUES
  ('evaluation', 'benchmark_aging_days', '180', 'Days after dataDate before benchmark is considered aging (181-365 default range)', '{"type":"number","minimum":30,"maximum":730}'),
  ('evaluation', 'benchmark_stale_days', '365', 'Days after dataDate before benchmark is considered stale (>365 default)', '{"type":"number","minimum":60,"maximum":1460}')
ON CONFLICT (category, key) DO NOTHING;
```

## Next Steps (Priority Order)

1. **🔴 URGENT — Rotate leaked secrets** — Supabase service role key, admin JWT, OpenAI/Anthropic keys, GCP service account, VAPID keypair, exchangerate-host key. Done before the next deploy. The user must do this; the agent cannot.
2. **Apply Migrations 042 + 043** *(manual)* — Run SQL above in Supabase Dashboard → SQL Editor. Both idempotent. *(Carry forward)*
3. **Bulk Ingest Pilot KASKO PDFs** — Use the Web UI batch uploader to drop the remaining `upload/real-kasko-pdf/` files. Round-4 verified the batch script works end-to-end on 4 files; need to scale to 50+ for calibration. *(Carry forward — needs user PDF drops)*
4. **Execute Backfill Engine** — Run `npx tsx scripts/backfill-evaluation-scores.ts --apply` to generate the `overallScore` data payload over the newly created policies. *(Depends on #3)*
5. **Calibrate Grade Thresholds** — Once 50+ scored policies exist, execute `scripts/calibrate-grade-thresholds.ts` and port the derived p90/p75/p50 thresholds into the admin Settings UI (Settings → Evaluation). *(Depends on #4)*
6. **Update Benchmark Premium Ranges** *(blocked)* — Premium ranges from Dec 2024. Needs external market research for `MARKET_BENCHMARKS`.
7. **Optional follow-up PR: schema unification** *(deferred from #332)* — Extract client + server `extraction-schema.ts` into a single `shared/extraction-schema.ts` source. Audit findings from this session preserved in scrollback: 5 categories of subtle drift remaining post-fix (different nullable patterns, missing `coverages[].nameTr` on server, contradicting `currency` description, missing `EXTRACTION_SYSTEM_PROMPT`/type exports on server). Build constraint: server `tsconfig.json` has `rootDir: "."` so the unification path requires either expanding `include` to `["./**/*.ts", "../shared/**/*.ts"]` (which shifts `dist-server/index.js` → `dist-server/server/index.js` and requires updating `railway.json` startCommand + `package.json` start scripts) OR using TypeScript project references. 30+ consumers import `ExtractedPolicyData` from `@/lib/ai/extraction-schema` so re-export shims at the old paths preserve compatibility.
8. **Optional follow-up PR: strict-mode CI validator** *(deferred from #331)* — Extract `validateStrictCompliance()` from `server/schemas/extraction-schema.test.ts:189-228` into a reusable utility (e.g., `shared/strict-mode-validator.ts`). Wire it into both schema test files as a deterministic CI gate that catches OpenAI strict-mode violations without needing an OpenAI API call. The current helper validates `required[]` completeness + `additionalProperties: false` recursively — could be enhanced to also check forbidden keywords (no `default`, no `multipleOf`, etc.).

## Non-Critical Issues (Carry Forward)

1. **Duplicate GoTrueClient warning** — during pilot QA persistence. Non-blocking.
2. **Benchmark premium ranges outdated** — `dataDate` updated to 2026-03-28 but actual premium ranges still from Dec 2024 research.
3. **EOOP can't model % deductibles in Monte Carlo** — warning added; full fix needs per-coverage DeductibleSpec mapping in adapter.
4. **Node Shell `VITE_SUPABASE_URL` TypeError**: Running `npx tsx scripts/backfill-evaluation-scores.ts` throws several `TypeError: Cannot read properties of undefined (reading 'VITE_SUPABASE_URL')`. This is expected because node cannot read `import.meta.env`. It catches safely inside `benchmark-service.ts` and falls back to local data gracefully. Do not attempt to fix; evaluation output is accurate.
5. **Minor string assumption test failures**: 2 tests in `benchmark-service-branches.test.ts` might fail due to minor string changes matching the new UI polishing. Update their assertions to match the new softer wording.
6. **Schema drift carry-forward (NEW Apr 8)**: Until the schema unification PR lands (priority #7), any change to either `src/lib/ai/extraction-schema.ts` or `server/schemas/extraction-schema.ts` MUST be mirrored manually to the other. Five subtle differences are documented in CLAUDE.md gotcha #49.

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) are NEVER overwritten
2. Full test suite not run without justification (>10 min)
3. Pilot evidence must be from real live data only
4. Never add `VITE_` prefix to API keys
5. All admin endpoints must have auth middleware
6. Any user-facing market conclusion must be gated by `BenchmarkConfidence`
7. Draft policies must not be exportable/shareable without TASLAK/DRAFT labeling
8. Benchmark test mocks MUST include `dataDate` — omitting it causes stale downgrade
9. User-facing comparison language must use "estimate" / "model-based" qualifiers
10. `auditLogs` array MUST have `MAX_ENTRIES` cap after every `.push()` call

## Environment Variables Required

No new env vars introduced today. All existing vars documented in CLAUDE.md remain required.

Key vars for production:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — admin panel and service-role operations
- `ADMIN_JWT_SECRET` — admin login
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — AI extraction
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — push notifications
- `EXCHANGERATE_API_KEY` — optional, higher rate limits on FX API

**🔴 ALL KEYS LISTED ABOVE MUST BE ROTATED** — they were exposed earlier in the April 8 session. Generate new values, update Railway environment variables, and confirm production health before closing this carry-forward item.
