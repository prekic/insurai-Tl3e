# Session Handoff — April 18, 2026 (Date-Corruption Audit Tooling)

> **Branch**: `claude/load-project-context-RJ0Qd` — 3 commits ahead of `origin/main`, clean working tree, all pushed.
> **No PR opened** (user-gated). Merge-ready.

## 🎯 Immediate Next Steps — Priority Order

| # | Action | Blocker | Link |
|---|--------|---------|------|
| 1 | **Open PR → main** for this branch | User gating decision only | Suggested squash title in the PR Prep section below |
| 2 | **Run DB date-corruption audit locally** (handoff item #3, now unblocked on the code side) | Operator's `.env` + `SUPABASE_SERVICE_ROLE_KEY` — script is safe-default read-only | `docs/runbooks/05-date-corruption-audit.md` §4.4 |
| 3 | **Pilot activation — 3 operator SQL steps** | Manual operator work | `docs/runbooks/04-phase-e-production-scaleup.md` §1–§4 |
| 4 | **Privacy review for email resolver** → set `ENABLE_ADMIN_EMAIL_RESOLVER=true` after review | Operational decision | ADR-0004 |
| 5 | Pilot calibration auto-escalation | Waits on pilot n ≥ 50 | `scripts/calibrate-grade-thresholds.ts --auto-production --apply` — cron-safe |
| 6 | Phase F runbook completion | Waits on Phase E E2 soak data | `docs/runbooks/06-phase-f-draft-removal.md` skeleton |

**Nothing on this list blocks merging the branch.** Items 2–6 are operational follow-ups that happen post-merge or external to code.

---

## What This Session Shipped (3 commits on branch)

```
1ed2284 test(extraction): wire Ray Sigorta scanned PDF fixture into qa-pdf-golden
93c56bd feat(scripts): audit-only mode for V8 DD.MM.YYYY date-corruption script
c73f877 chore(docs): session handoff — gotcha #83 + next-step rewrite
```

`1ed2284` was the Apr 18 pre-session commit that also touched `CLAUDE.md` (2 lines). `93c56bd` is the primary session deliverable. `c73f877` synced the core docs. A 4th commit adds post-audit QA fixes to this handoff + CLAUDE.md.

### Session scope summary

**Goal**: unblock the V8 DD.MM.YYYY date-corruption audit (handoff item #3) without handing any credentials to Claude.

**Outcome**: The repair script at `scripts/backfill-date-bug.ts` was rewritten. Old version wrote UPDATEs on invocation with no dry-run. New version defaults to `--audit-only` (read-only, emits 4-count summary + CSV report). Explicit `--apply` required for writes, with interactive `promptConfirm()` (skippable via `--yes`). Audit and apply modes share a single `classifyRow()` classifier so the report reflects exactly what repair would touch. Runbook 05 gains a new §4.4 "Option D" documenting the workflow.

### Files changed (full branch delta vs origin/main — 6 files)

| File | Commit | Action | Purpose |
|------|--------|--------|---------|
| `scripts/backfill-date-bug.ts` | `93c56bd` | **Rewritten** | CLI parser (`--audit-only` default, `--apply`, `--yes`, `--csv`, `--help`); shared `classifyRow()`; CSV emitter; interactive confirm; applied-log output |
| `scripts/__tests__/backfill-date-bug.test.ts` | `93c56bd` | **New** | 12 unit tests covering CORRUPTED / OK / MANUAL_REVIEW / null-candidate paths (day ≤ 12 swap, day > 12 safe-branch, ISO datetime DB values, empty/null DB, single-digit pad, non-dot separators, non-string inputs) |
| `docs/runbooks/05-date-corruption-audit.md` | `93c56bd` | **Modified** | Added §4.4 Option D — Script-Assisted Audit & Repair |
| `src/lib/ai/__tests__/qa-pdf-golden.test.ts` | `1ed2284` | **Modified** | Added `requiresOcr: true` branch on `PdfFixture`, new `expectedCoverageCounts` field, Ray Sigorta fixture entry; 25 → 27 tests |
| `CLAUDE.md` | `1ed2284` + `c73f877` + post-audit | **Modified** | Next-session instructions, gotcha #83, Last Updated section, commit-count corrections |
| `SESSION_HANDOFF.md` | `c73f877` + post-audit | **Modified** | This document (full rewrite for the new branch) |

### Classifier semantics pinned in code (`classifyRow()`)

- `CORRUPTED` — raw matches `/^\d{1,2}\.\d{1,2}\.\d{4}$/` AND DB date equals V8-swapped interpretation AND does NOT equal Turkish interpretation
- `OK` — DB matches Turkish interpretation
- `MANUAL_REVIEW` — candidate pattern matched but DB matches neither interpretation (or DB is null/empty)
- `null` (not a candidate) — raw is not Turkish `DD.MM.YYYY` pattern

`--apply` only touches `CORRUPTED` rows. `OK` and `MANUAL_REVIEW` are reported but never written.

---

## Configuration Requirements

### No new env vars this session
All existing vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLOUD_API_KEY`, `GCP_SERVICE_ACCOUNT_BASE64`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VAPID_*`, `CRON_SECRET`, `PILOT_REVIEWER_USER_ID`, `ENABLE_ADMIN_EMAIL_RESOLVER`) still required per prior handoffs.

### Operator needs to run the audit
Locally, with `.env` containing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`:

```bash
# Read-only. Prints counts + writes ./date-audit-report-<timestamp>.csv
npx tsx scripts/backfill-date-bug.ts --audit-only

# --- Before --apply: confirm the pilot parser hasn't drifted from production ---
# (runs the 22-test drift canary; must be green or STOP and re-sync the mirror)
npx vitest run scripts/__tests__/simple-date-parser.test.ts

# After reviewing the report, repair CORRUPTED rows only:
npx tsx scripts/backfill-date-bug.ts --apply

# After repair, rescore the affected rows:
npx tsx scripts/backfill-evaluation-scores.ts

# Re-verify: confirmed_corrupted should now be 0
npx tsx scripts/backfill-date-bug.ts --audit-only
```

### No new migrations
No schema changes. This is a one-time data repair path; no `CREATE TABLE` / `ALTER TABLE`.

---

## Test / Build Status

- **Typecheck**: 0 errors (`npx tsc --noEmit`)
- **Lint**: 0 errors across the 2 modified files (`npx eslint scripts/backfill-date-bug.ts scripts/__tests__/backfill-date-bug.test.ts`)
- **Unit tests**: 12/12 pass (`npx vitest run scripts/__tests__/backfill-date-bug.test.ts` — 3.9s)
- **CLI smoke tests**: `--help` exits 0 with usage; `--bogus` exits 1 with error + usage
- **Full test suite NOT run** (>10 min rule)

---

## Known Issues / Carry-Forward

### Not bugs — flagged for awareness
- **Audit scope is kasko-only**: `fetchCandidates()` filters `.eq('type', 'kasko')` because gotcha #52 (the V8 bug) lands when call sites parse extracted Turkish PDFs and those are currently kasko. If any other policy type runs through `new Date('01.12.2024')` in prior code, extend the filter. Current scan of the 5 fixed call sites suggests this is safe.
- **`--apply` is single-threaded sequential UPDATEs**: one HTTP round-trip per row. For an audit showing tens of thousands of `CORRUPTED` rows, this would be slow. If the real count turns out to be that large, add a batch-UPDATE path using `.in('id', batch)`. Current expectation per runbook §5 is tens to low-hundreds of rows.
- **CSV contains `policy_number` and `provider`** — operator may want to review before sharing. Sanitize or trim columns before posting anywhere.
- **🚨 Parser-drift trap — `--apply` uses `_simple-date-parser.ts`, NOT production `turkish-utils.ts`**: The `--apply` write path calls `parseExtractedDate` from `scripts/_simple-date-parser.ts`, which is a manual MIRROR of production's `parseTurkishDate()` in `src/lib/ai/turkish-utils.ts` (gotcha #16 explains why the pilot scripts can't import from `src/lib/` — `import.meta.env` Vite crash). Non-negotiable rule #11 already requires the two stay in sync manually. **Specific consequence for this script**: if production `parseTurkishDate()` is ever changed without updating `_simple-date-parser.ts`, a future operator running `--apply` will write dates produced by the STALE parser, potentially re-introducing corruption the script was meant to remove. Before running `--apply` in prod, diff the two parsers and confirm they're in sync. The unit test suite for `_simple-date-parser.ts` at `scripts/__tests__/simple-date-parser.test.ts` (22 tests) is the drift canary — if its assertions ever mismatch production behavior, the mirror is stale.

### Pre-existing issues flagged this session (not this-session regressions)
None. The audit script is net-new functionality on top of existing runbook SQL.

---

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) NEVER overwritten
2. Full test suite NEVER run without explicit user permission (>10 min)
3. Pilot evidence from real live data only (no simulation)
4. Never `VITE_` prefix on API keys
5. All admin endpoints require auth middleware
6. Market conclusions gated by `BenchmarkConfidence`
7. Draft policies: TASLAK/DRAFT labeling on export/share
8. Benchmark test mocks MUST include `dataDate`
9. User-facing comparison: "estimate" / "model-based" qualifiers
10. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`
11. Extraction schema changes go in `shared/extraction-schema.ts` only
12. `ProcessingLogger.onStageChange()` listener errors are caught individually
13. `translations-skeleton.ts` accepts new KEYS with empty-string VALUES
14. Server `__dirname` paths: `dist-server/server/` is the base
15. Turkish regex patterns must handle Turkish İ via `[iİ]` character class (gotcha #62)
16. Coverage `included` field is end-to-end required (gotcha #65)
17. Historical policy threshold is 2 years (gotcha #66)
18. Pilot gate flag shape is polymorphic `boolean | {enabled, rolloutPercentage}` (gotcha #73)
19. Rollout bucketing via `computeRolloutBucket()` — no algorithm substitution without migration plan (gotcha #74)
20. Privacy-sensitive admin features use env-var opt-in pattern (gotcha #75, ADR-0004)
21. Migration 040 RLS is intentionally open — do NOT tighten without proxying client-side calls (gotcha #76)
22. **NEW (Apr 18)**: Operator repair scripts default to read-only (`--audit-only`); writes require explicit `--apply` flag + interactive confirm. Audit and apply share one classifier. Writes emit `audit-applied-<timestamp>.csv` for rollback reference. (gotcha #83)
23. **NEW (Apr 18)**: `scripts/backfill-date-bug.ts --apply` writes via `_simple-date-parser.ts`, the pilot-script mirror of production's `turkish-utils.ts parseTurkishDate()`. Before any prod `--apply` run, verify the 22-test drift canary (`scripts/__tests__/simple-date-parser.test.ts`) is green against the current production parser. Stale mirror → silent re-corruption. (extends non-negotiable rule #11 for this specific script)

---

## Verification Commands (for the next agent)

```bash
# Branch state
git status                                   # should be clean
git log --oneline -5                         # top 2 = this branch's commits (93c56bd, 1ed2284)
git diff origin/main...HEAD --stat           # shows 3 files changed (this session) + Ray Sigorta fixture

# Tests (isolated — DO NOT run full suite without permission)
npx vitest run scripts/__tests__/backfill-date-bug.test.ts       # 12 pass
npx vitest run src/lib/ai/__tests__/qa-pdf-golden.test.ts        # 27 pass (includes the Ray Sigorta fixture)

# TypeScript
npx tsc --noEmit                             # 0 errors

# Lint
npx eslint scripts/backfill-date-bug.ts scripts/__tests__/backfill-date-bug.test.ts   # 0 errors

# CLI smoke
npx tsx scripts/backfill-date-bug.ts --help                # exits 0, prints usage
npx tsx scripts/backfill-date-bug.ts --bogus > /dev/null; echo $?   # exits 1
```

### GitHub operations
`gh` CLI is NOT available in this sandbox. Use `mcp__github__*` tools.

### Railway deploy
Sandbox `git push` does NOT trigger Railway webhook (gotcha #22). Use `mcp__github__push_files` or merge the PR via `mcp__github__merge_pull_request` to get Railway to redeploy.

---

## Session-Specific Gotchas Worth Surfacing

Already promoted into `CLAUDE.md`:

- **Gotcha #83 (new)**: Read-only-by-default for operator repair scripts. Any script under `scripts/` that mutates prod tables MUST default to audit-only mode. See entry in CLAUDE.md for the full contract.

### Design notes worth keeping close

1. **Why `classifyRow()` is exported**: it's the single source of truth for corruption semantics and it's directly unit-tested. Both audit and apply modes call it, so the CSV report and the repair set are guaranteed to agree.

2. **Why the `--apply` path re-parses via `parseExtractedDate()` instead of using `tr_interpreted_start` from `classifyRow()` directly**: so that the repair writer is the same canonical date parser used by `pilot-batch-ingest.ts` and `backfill-evaluation-scores.ts`. If there's ever a subtle parser nuance, they all pick it up together. `classifyRow()` only needs to compare; `parseExtractedDate()` is what actually produces the write value.

3. **Why the `manual_review` bucket exists**: some rows may carry DB dates that match neither the Turkish nor V8 interpretation — e.g. legacy backfills, manual corrections, or bugs from other code paths we haven't mapped. Flagging them lets the operator eyeball a small set by hand rather than auto-rewriting them with bad data.

4. **Why no ADR for this session**: the audit-only contract is a coding convention, not an architectural shift. It slots under gotcha #83 in CLAUDE.md. ADR-worthy would be something like "move all bulk-data mutations through a gated API endpoint instead of standalone scripts" — that's a future consideration, not this session's scope.
