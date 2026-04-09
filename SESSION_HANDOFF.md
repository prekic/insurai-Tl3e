# Session Handoff — April 9, 2026 (Schema Unification + Test Fixes)

> **Session type**: Implementation. Unified extraction schema into `shared/`, fixed 6 pre-existing test timeouts, added shared schema validation test.
>
> **What this session produced**: 4 commits on branch `claude/load-project-context-Yjmcl` — docs sync, schema unification (refactor), test fixes/validation, ADR-019. All affected tests pass. Ready for PR review.

## Current State

**Branch**: `claude/load-project-context-Yjmcl` — clean, pushed.
**Working tree**: clean (after this commit).
**Test state**: All modified test files pass in isolation:
- `src/lib/ai/extraction-schema.test.ts` — 69/69 passed
- `server/__tests__/extraction-schema.test.ts` — 16/16 passed (moved from server/schemas/)
- `shared/__tests__/extraction-schema.test.ts` — 12/12 passed (new)
- `server/__tests__/ai-routes-extended.test.ts` — 112/112 passed
- `server/__tests__/ai-extraction-routes-branches.test.ts` — 33/33 passed
- `server/__tests__/ai-chat-ocr-diagnose-logs.test.ts` — 14/14 passed
- `server/__tests__/ai-ocr-coverage.test.ts` — 77/77 passed
- `server/__tests__/routes-branches.test.ts` — 76/76 passed (6 pre-existing timeouts fixed)

## Commits on This Branch

| # | SHA | Message | Scope |
|---|-----|---------|-------|
| 1 | `4831924` | `docs: sync handoff for migration 042+043 production confirmation` | Docs only |
| 2 | `07314d6` | `refactor(schema): unify extraction schema into shared/ single source of truth` | 18 files (2 new, 12 modified, 4 deleted) |
| 3 | `79175d5` | `fix(test): add fetch stub for diagnose tests + shared schema validation` | Test fixes + new test file |
| 4 | *(this commit)* | `docs(adr): document extraction schema unification decision (ADR-019)` | ADR + handoff sync |

## What Was Implemented

### Schema Unification (commit `07314d6`)

Extracted `EXTRACTION_JSON_SCHEMA` and `validateStrictCompliance()` into `shared/` directory — single source of truth importable by both client and server.

| Change | Details |
|--------|---------|
| `shared/extraction-schema.ts` | **NEW** — canonical schema (client format: `type: ['string', 'null']`) |
| `shared/strict-mode-validator.ts` | **NEW** — canonical validator |
| `server/tsconfig.json` | `rootDir: ".."`, include adds `../shared/**/*.ts` |
| `server/index.ts` | `__dirname` paths: `'..'` → `'..', '..'` for dist/ (2 locations) |
| `server/routes/ai.ts` | Import from `../../shared/extraction-schema.js` + __dirname fix |
| `railway.json` | Start: `dist-server/server/index.js` |
| `nixpacks.toml` | Start: `dist-server/server/index.js` |
| `package.json` | `start:server` + `start:prod` updated |
| `src/lib/ai/extraction-schema.ts` | ~350 lines → 3-line re-export from shared |
| `src/lib/ai/strict-mode-validator.ts` | ~50 lines → 2-line re-export from shared |
| `server/schemas/` | **DELETED** (extraction-schema.ts, strict-mode-validator.ts, test) |
| `server/__tests__/extraction-schema-parity.test.ts` | **DELETED** (redundant with single source) |
| 5 server test files | Mock paths: `../schemas/...` → `../../shared/...` |
| `scripts/pilot-batch-ingest.ts` | Import updated |

### Test Fixes (this commit)

- **Fixed 6 pre-existing `/api/ai/diagnose` test timeouts** in `routes-branches.test.ts` — added `vi.stubGlobal('fetch', ...)` to the Diagnostic Error Classification describe block (per CLAUDE.md gotcha about diagnose tests requiring global fetch stub)
- **Added `shared/__tests__/extraction-schema.test.ts`** — 12 tests validating the canonical schema (structure, required fields count, strict-mode compliance, currency description, coverage nameTr, validator edge cases)

## Status of All Carry-Forward Priorities

| # | Priority | Status |
|---|----------|--------|
| 0 | **🔴 URGENT — Rotate leaked secrets from Apr 8 session** | **PENDING — user must do** |
| 1 | Apply Migration 042 | **✅ DONE** — applied to production (Apr 9) |
| 2 | Apply Migration 043 | **✅ DONE** — applied to production (Apr 9) |
| 3 | Bulk ingest pilot KASKO PDFs (50+ for calibration) | **BLOCKED — needs user PDF drops** |
| 4 | Execute evaluation backfill | **BLOCKED — depends on #3 + Supabase credentials** |
| 5 | Calibrate grade thresholds | **BLOCKED — depends on #4** |
| 6 | Update benchmark premium ranges | **BLOCKED — needs TSB/SEDDK 2025 market research** |
| 7 | Schema unification | **✅ DONE** — `shared/extraction-schema.ts` is single source of truth |

## Architecture Change: Server Output Path

**Before**: `dist-server/index.js` (server tsconfig rootDir: `.`)
**After**: `dist-server/server/index.js` (server tsconfig rootDir: `..`)

This affects:
- `railway.json` startCommand
- `nixpacks.toml` start cmd
- `package.json` start:server / start:prod
- All `__dirname`-based paths in server code (now one dir deeper)

When adding new `__dirname` paths in server code, remember that `__dirname` at runtime resolves to `dist-server/server/...` — use `path.join(__dirname, '..', '..', ...)` to reach the project root.

## Next Steps for the Next Agent (Priority Order)

1. **🔴 URGENT — Rotate leaked secrets** (user action; cannot be done by agent)
2. **Bulk ingest pilot KASKO PDFs** — needs user to drop 50+ real PDFs
3. **Run evaluation backfill** — `npx tsx scripts/backfill-evaluation-scores.ts --apply`
4. **Calibrate grade thresholds** — `scripts/calibrate-grade-thresholds.ts`
5. **Update benchmark premium ranges** — blocked on market research

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
11. Extraction schema changes go in `shared/extraction-schema.ts` only — single source of truth, no mirroring needed
12. `ProcessingLogger.onStageChange()` listener errors are caught individually — do NOT add rethrow logic
13. `translations-skeleton.ts` accepts new KEYS with empty-string VALUES — what's forbidden is non-empty content
14. Server `__dirname` paths: `dist-server/server/` is the base — need 2 levels up to reach project root

## Environment Variables Required

No new env vars introduced. All existing vars from CLAUDE.md remain required.

**🔴 ALL KEYS MUST BE ROTATED** — they were exposed earlier in the April 8 session.

## Quality State

**This session**: 8 isolated test runs (all green), 0 full-suite runs, ESLint + Prettier via pre-commit hooks (clean). 6 pre-existing test timeouts fixed.
**Known test state**: 16,155+ tests (+ 12 new shared tests), ~91.67% statements, ~85.91% branches coverage.
