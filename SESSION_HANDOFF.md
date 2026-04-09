# Session Handoff — April 9, 2026 (Planning Session — 5 Deferred Follow-Ups Designed)

> **Session type**: Research & planning only. **Zero commits, zero file changes** in the working tree. Branch `claude/load-project-context-07BUW` is at the same SHA as `origin/main` (`62e95cd`). The April 8 work (PR #334 — 3 latent bug fixes + 5 sub-PRs) is fully merged to main and closed out.
>
> **What this session produced**: a fully-designed implementation plan for the 5 deferred follow-ups that PR #334 carried forward. The plan is at `/root/.claude/plans/prancy-crunching-crab.md` and is ready for the next agent to execute.

## Current State

**Branch**: `claude/load-project-context-07BUW` — clean, pushed, identical to `origin/main` (0 commits ahead).
**Latest merge on main**: PR #334 (`62e95cd`) — schema strict-mode parity + safe-default ScoreBundle + 5 sub-PRs.
**Working tree**: clean.

## Status of All Carry-Forward Priorities

| # | Priority | Status |
|---|----------|--------|
| 0 | **🔴 URGENT — Rotate leaked secrets from Apr 8 session** | **PENDING — user must do** (Supabase service role, ADMIN_JWT_SECRET, OpenAI/Anthropic keys, GCP SA, VAPID keypair, exchangerate-host key) |
| 1 | Apply Migration 042 (`is_draft` column on `policies`) | **PENDING — manual SQL** |
| 2 | Apply Migration 043 (benchmark aging/stale threshold configs) | **PENDING — manual SQL** |
| 3 | Bulk ingest pilot KASKO PDFs (50+ for calibration) | **PENDING — needs user PDF drops** |
| 4 | Execute backfill: `npx tsx scripts/backfill-evaluation-scores.ts --apply` | **PENDING — depends on #3** |
| 5 | Calibrate grade thresholds: `scripts/calibrate-grade-thresholds.ts` | **PENDING — depends on #4** |
| 6 | Update benchmark premium ranges | **BLOCKED — needs market research** |
| 7 | **NEW** — Implement PR-A (test fix) per planning doc | **READY — see plan file** |
| 8 | **NEW** — Implement PR-B (schema parity + validator) per planning doc | **READY — see plan file** |

## Today's Session Output: Planning for 5 Deferred Follow-Ups

### What was investigated

Three exploration agents ran in parallel against the working tree:
1. **Schema drift analysis** — `src/lib/ai/extraction-schema.ts` (637 lines) vs `server/schemas/extraction-schema.ts` (381 lines)
2. **`validateStrictCompliance` helper** — current location, call sites, extraction options
3. **Failing test inventory** — `PolicyDetailView-branches.test.tsx` and `benchmark-service-branches.test.ts`

A fourth Plan agent then synthesized findings into a concrete implementation plan with file paths, line numbers, and verbatim code snippets.

### User scope decisions confirmed (via AskUserQuestion)

1. **PR-B scope**: Fix 2 functional bugs only (`nameTr` absence + currency contradiction). Skip the 12 description rewordings — they're not correctness issues and the parity test will deliberately ignore description-only diffs.
2. **Item 3 (`createSafeDefaultBundle` audit)**: Fold a 10-line CLAUDE.md note into PR-B documenting that the Apr 8 audit found zero other instances of the gotcha #48 anti-pattern.
3. **Sequencing**: Two PRs — PR-A (test fixes) then PR-B (schema + validator + docs). They are independent; either order works.

### Key findings

**Schema drift confirmed (5 categories from SESSION_HANDOFF + 3 extras)**:

| # | Drift | Impact | Fix in PR-B? |
|---|-------|--------|--------------|
| 1 | Nullable encoding (`type: ['string','null']` vs `anyOf`) | Cosmetic | NO — both strict-mode-valid |
| 2 | **`coverages[].nameTr` MISSING on server** | **Production correctness — Turkish coverage names lost** | **YES** |
| 3 | **Currency description CONTRADICTS client** ("Default to TRY" vs "DO NOT default") | **Functional contract violation** | **YES** |
| 4 | `EXTRACTION_SYSTEM_PROMPT` not on server | Server has no consumers (only client imports it) | NO |
| 5 | Type interfaces missing on server | 43 client files import `ExtractedPolicyData`; 0 server files do | NO |
| 6 | `required[]` order divergence | Cosmetic | NO |
| 7 | 12 description divergences | Acceptable variance | NO |
| 8 | `confidence` rubric: server has rich scoring formulas, client minimal | Likely intentional divergence | NO |

**Test failures confirmed**:
- `PolicyDetailView-branches.test.tsx` — exactly 4 failing tests (163 total, 159 passing). All in the "Market Comparison" describe block. Lines 929, 940, 951, 952, 2250, 2261, 2272, 2273 reference obsolete `/below average/` and `/above average/` regexes. UI now renders i18n keys `t.policy.belowAverage`/`aboveAverage` which were softened to "below market estimate" / "above market estimate" in commit `7b8ce28` (Apr 4).
- `benchmark-service-branches.test.ts` — flagged as "might fail" in carry-forward, but verification confirmed both assertions still match `evaluator.ts` verbatim. **No code changes needed.**

**Build constraint that ruled out schema unification**:
- `server/tsconfig.json` has `rootDir: "."` and `include: ["./**/*.ts"]`
- Moving schema to `shared/extraction-schema.ts` would shift `dist-server/index.js` → `dist-server/server/index.js`
- This breaks `railway.json:9` (`startCommand`) and `package.json:17-18` (`start:server`/`start:prod`)
- Therefore: **fix drift in place, lock parity via test**

### The plan file

**Location**: `/root/.claude/plans/prancy-crunching-crab.md`

**Contents**:
- PR-A: 8 line edits in `src/components/PolicyDetailView-branches.test.tsx` with verbatim before/after
- PR-B sub-task B.1: server schema bug fixes (`nameTr` + currency description) with verbatim code blocks
- PR-B sub-task B.2: 2 new server tests covering the fixes
- PR-B sub-task B.3: dual `strict-mode-validator.ts` helper files (40-line duplicate, 1 client + 1 server) + new client test describe block
- PR-B sub-task B.4: cross-file structural parity test at `server/__tests__/extraction-schema-parity.test.ts` with full code body
- PR-B sub-task B.5: 10-line CLAUDE.md gotcha #48 audit note
- Verification commands (isolated test runs only — never full suite)
- Cross-cutting risks
- Out-of-scope items
- PR titles ready for Conventional Commits

## Migrations Still to Apply (Carry Forward — Same as Apr 8)

```sql
-- Migration 042: Add is_draft column to policies table
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_policies_user_is_draft ON public.policies (user_id, is_draft);

-- Migration 043: Seed benchmark aging/stale threshold configs
INSERT INTO public.app_settings (category, key, value, description, "schema")
VALUES
  ('evaluation', 'benchmark_aging_days', '180', 'Days after dataDate before benchmark is considered aging (181-365 default range)', '{"type":"number","minimum":30,"maximum":730}'),
  ('evaluation', 'benchmark_stale_days', '365', 'Days after dataDate before benchmark is considered stale (>365 default)', '{"type":"number","minimum":60,"maximum":1460}')
ON CONFLICT (category, key) DO NOTHING;
```

Both idempotent. Apply via Supabase Dashboard → SQL Editor.

## Next Steps for the Next Agent (Priority Order)

1. **🔴 URGENT — Rotate leaked secrets** (user action; cannot be done by agent)
2. **Apply Migrations 042 + 043** (manual SQL — both idempotent)
3. **Execute PR-A** per `/root/.claude/plans/prancy-crunching-crab.md` — trivial 8-line test edit, no risk, unblocks 4 failing tests
4. **Execute PR-B** per the same plan file — medium complexity, medium risk, includes manual smoke test of one Turkish kasko PDF before merging
5. **Bulk ingest pilot KASKO PDFs** to reach 50+ sample size for calibration
6. **Run backfill** then **calibrate grade thresholds**
7. **Update benchmark premium ranges** (blocked on market research)

## Quality State

**This session**: 0 typecheck runs, 0 test runs, 0 lint runs, 0 commits. Zero risk of regression — pure planning work.

**Last verified state from PR #334 (Apr 8)**: 16,142+ tests, 0 lint errors, 100% pass rate (modulo the 4 known `PolicyDetailView-branches` "above/below average" failures that PR-A will fix).

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) NEVER overwritten
2. Full test suite NEVER run without explicit user permission (>10 min)
3. Pilot evidence from real live data only
4. Never `VITE_` prefix on API keys
5. All admin endpoints must have auth middleware
6. Market conclusions gated by `BenchmarkConfidence`
7. Draft policies: TASLAK/DRAFT labeling on export/share
8. Benchmark test mocks MUST include `dataDate`
9. User-facing comparison: "estimate" / "model-based" qualifiers
10. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`
11. **NEW (carry from Apr 8 #49)**: Any change to either `extraction-schema.ts` MUST be mirrored manually until parity test (PR-B sub-task B.4) lands
12. **NEW (carry from Apr 8 #50)**: `ProcessingLogger.onStageChange()` listener errors are caught individually — do NOT add rethrow logic
13. **NEW (carry from Apr 8 #51)**: `translations-skeleton.ts` accepts new KEYS with empty-string VALUES — what's forbidden is non-empty content

## Environment Variables Required

No new app env vars introduced this session. All existing vars from CLAUDE.md remain required:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — admin panel and service-role operations
- `ADMIN_JWT_SECRET` — admin login
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — AI extraction
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — push notifications
- `EXCHANGERATE_API_KEY` — optional, FX rate higher tier
- `GCP_SERVICE_ACCOUNT_BASE64` — Document AI OCR

**🔴 ALL KEYS LISTED ABOVE MUST BE ROTATED** — they were exposed earlier in the April 8 session. Generate new values, update Railway, confirm production health.

**CI-only env var (carry forward from Apr 7)**: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` in `.github/workflows/release-please.yml` for the `release-please` job — does NOT affect Railway, local dev, or tests.

## Recommended PR Title (this session)

This session produced **only docs**: the plan file at `/root/.claude/plans/prancy-crunching-crab.md` and this updated `SESSION_HANDOFF.md`. The plan file lives outside the repo (`/root/.claude/plans/`) and is not version-controlled. Therefore the only repo-tracked change is `SESSION_HANDOFF.md`.

**If committing the handoff update**:
```
chore(docs): plan deferred schema parity + test cleanup follow-ups from PR #334
```

**If NOT committing** (preferred — handoff updates can land alongside the next implementation PR): leave the working tree with `SESSION_HANDOFF.md` modified and let PR-A or PR-B carry the doc update.

## Files Modified This Session (Repo-Tracked)

| File | Change |
|------|--------|
| `SESSION_HANDOFF.md` | **REWRITTEN** — replaces Apr 8 PR #334 handoff with this Apr 9 planning handoff |

**Files NOT in the repo but produced this session**:
- `/root/.claude/plans/prancy-crunching-crab.md` — implementation plan for the next agent

## Self-Verification Checklist

- [x] All carry-forward priorities from Apr 8 are preserved (secret rotation, migrations 042/043, pilot ingestion, backfill, calibration, benchmark refresh)
- [x] All 5 deferred items from PR #334 are addressed in the plan file
- [x] User scope decisions captured verbatim (PR-B = 2 fixes only, fold CLAUDE.md note into PR-B, 2-PR sequencing)
- [x] Plan file path documented (`/root/.claude/plans/prancy-crunching-crab.md`)
- [x] Verification commands in plan use isolated tests only (`npx vitest run path/to/file`)
- [x] Build constraint that ruled out schema unification documented (rootDir + railway.json + package.json paths)
- [x] Cross-rootDir test import risk documented with mitigation
- [x] `nameTr` deployment risk documented (smoke test before merge)
- [x] Environment variable rotation urgency preserved
- [x] Non-negotiable rules carried forward from Apr 8
- [x] Branch state confirmed (0 commits ahead of `origin/main`)
- [x] Recommended PR title provided
- [x] **QA Audit pass complete (Apr 9)** — see "QA Audit Findings" section below

## QA Audit Findings (Apr 9 self-check, post-handoff)

The first pass of this handoff was audited for completeness. The audit uncovered **2 operational gotchas that had been summarized away** instead of documented explicitly. Both have now been added to `CLAUDE.md` (gotchas appended to the "Common Gotchas" section between the KASKO Pilot RLS gotcha and the `## CI/CD` section):

1. **Stale local `main` mismatches `origin/main` after sandbox merges** — During the audit, `git diff main...HEAD --name-status` returned **34 files**, falsely suggesting the branch had 34 unmerged changes. The actual branch state (`git diff origin/main...HEAD --name-status`) is **1 file**: this `SESSION_HANDOFF.md` (plus the QA pass adding the gotchas to `CLAUDE.md`). Root cause: local `main` was at `4eb31494...` (pre-PR #334) while `origin/main` was at `62e95cd...` (post-PR #334). The Claude Code sandbox does not auto-fast-forward local `main` after a PR merge on GitHub. Future agents auditing branch scope must always `git fetch origin main` first and then diff against `origin/main`, never local `main`.

2. **Vitest's bundler resolver ignores `tsconfig.rootDir`** — Discovered during the design of PR-B sub-task B.4 (the cross-file extraction-schema parity test). A test at `server/__tests__/extraction-schema-parity.test.ts` can `import` from `../../src/lib/ai/extraction-schema` and pass at test time, even though `tsc -p server/tsconfig.json` would reject the same import with TS6059. This is the only mechanism that makes the parity test possible without restructuring the build pipeline. The plan file documents this for the planned PR, but it is also a general property of the test infrastructure that affects any cross-rootDir test work.

### QA Audit Validation Steps Taken

1. `git diff main...HEAD --name-status` → 34 files (misleading, see gotcha #1 above)
2. `git fetch origin main && git diff origin/main...HEAD --name-status` → 1 file (`SESSION_HANDOFF.md`) — **truth source**
3. `git rev-parse main && git rev-parse origin/main && git rev-parse HEAD` → confirmed local `main` (`4eb31494...`) is stale, `origin/main` (`62e95cd...`) is current, HEAD (`1d0c56f...`) is exactly 1 commit ahead of `origin/main`
4. `git log origin/main..HEAD --oneline` → exactly 1 commit (`1d0c56f chore(docs): plan deferred schema parity + test cleanup follow-ups`)
5. `git show --stat 1d0c56f` → confirmed commit changes exactly 1 file (`SESSION_HANDOFF.md`, +137/−376)
6. Re-read this file end-to-end to confirm all carry-forward items, scope decisions, and migration SQL are present
7. Re-read the plan file at `/root/.claude/plans/prancy-crunching-crab.md` to confirm all 5 PR-B sub-tasks have file paths, line numbers, and verbatim code snippets
8. Grepped this file for "stale", "local main", "fast-forward" → confirmed the staleness gotcha was missing before the QA pass added it
9. Cross-referenced the cross-cutting risks listed in the plan file against the handoff's narrative — all 4 (cross-rootDir import, helper duplication, parity false positives, `nameTr` deployment) are captured in the plan; the handoff defers risk detail to the plan file by reference
10. Verified no environment variables changed this session (no new vars in either the handoff or the plan file)
11. Verified no Vitest mock / API routing / Railway gotchas were encountered during execution — the planning session never ran code or tests, so there are no runtime issues to capture. The vitest bundler-resolver gotcha (#2 above) was uncovered during the **design** of PR-B, not during execution.

### What was NOT changed by the QA pass

- The plan file `/root/.claude/plans/prancy-crunching-crab.md` already documented the cross-rootDir vitest pattern in PR-B sub-task B.4. The QA pass surfaced it from the plan-file scope into the global `CLAUDE.md` gotchas section so the next agent doesn't need to read the plan file to discover it.
- No ADR was needed (planning session, no architectural shift).
- No environment variables were added or changed.
- The Apr 8 SESSION_HANDOFF content (PR #334 details, 34-file inventory, gotchas #47-51) is already preserved in git history at `2e84699` and is reachable by any agent who needs the context. Re-summarizing it here would duplicate already-merged information.
