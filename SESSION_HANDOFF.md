# Session Handoff — May 4, 2026 — Production Build Fix (TS2835) + Verification Governance

> **Session type**: Focused remediation — fix Railway production build failure (TS2835 NodeNext
> import extension errors), audit for similar issues across the codebase, and close the
> verification gap that masked the failure for three sessions. No feature work. No migrations.
> No schema changes.

---

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1 — Restore production AI temperature (operator manual SQL) ← STILL OPEN

This has carried forward from May 3. **Not touched this session.** Run via Supabase SQL Editor:

```sql
UPDATE public.app_settings
SET value = '0.1', updated_at = NOW()
WHERE category = 'ai' AND key = 'temperature';
```

Cache TTL is 5 min (gotcha #159) — wait 5 min or trigger a Railway redeploy to flush.
Once done, this priority is permanently closed.

### Priority 2 — Merge branch `insurgemini202605041923` → `main`

Branch is clean, build-green, and pushed. Open a PR or merge directly. Railway will pick up
the fix once merged.

**Verification before merge**:
```bash
npm run build:server   # must exit 0
npm run build          # must exit 0
```
Both were confirmed 0 at the end of this session (see Gate 3 + 4 above).

### Priority 3 — f6c1235 deferred review items

Commit `f6c1235` (`chore: commit accumulated Phase 1 working tree`) from three sessions ago
contains unapproved architectural changes that were split and partially reverted but not fully
reviewed. The outstanding items are:

1. **Quality-detector algorithm change** in `scripts/qa-extraction-quality.ts` — the
   substantive-check logic was changed from the approved version; needs a focused PR.
2. **7 scripts keep/delete decision** — scripts committed in `f6c1235` were never individually
   approved; project lead to decide which stay, which are deleted.
3. **`executeExtractionPipeline` regression** — was part of `f6c1235`, reverted in `5dc0584`,
   but the intent of that original change was never formally resolved.

These were deferred from the May 3 session. They are NOT blocking the build fix but are
blocking Phase 1 Wrap sign-off.

### Priority 4 — Credential-dependent baseline captures

Several baseline captures require GCP credentials (Document AI) that were not available last
session. Once credentials are available:
```bash
npm run smoke:kasko   # validates OCR + extraction pipeline end-to-end
```
Then capture baseline fixtures against the Tiguan (`tests/fixtures/kasko/anadolu-volkswagen-tiguan.pdf`).

### Priority 5 — Round 5 reviewer hand-off (when reviewer responds)

Same path as May 3 handoff Priority 2. Infrastructure unchanged. The canonical fixture is
`tests/fixtures/kasko/anadolu-volkswagen-tiguan.pdf`.

---

## 📦 What Shipped This Session (2 commits)

| Hash | Type | Topic |
|---|---|---|
| `5165a0a` | `fix(build)` | Add `.js` extensions to relative imports in `policy-pipeline` (6 files, 11 static + 1 dynamic import type annotation) |
| `1dcf14f` | `docs(verification)` | Codify `npm run build:server` as required pre-commit TypeScript check in `.cursorrules` and `CLAUDE.md` |

**No migrations. No env var changes. No schema changes.**

Branch: `insurgemini202605041923` — branched from `main` after PR #466 merged.

---

## 🔍 Root Cause Analysis — What Was Fixed and Why It Was Missed

### The Build Failure

Railway's production build runs `npm run build:server` (`tsc -p server/tsconfig.json`).
`server/tsconfig.json` uses `moduleResolution: "NodeNext"`, which requires explicit `.js`
extensions on all relative imports. Six files in `src/lib/policy-pipeline/` contained
extensionless imports (e.g. `from './base-adapter'` instead of `from './base-adapter.js'`).
These were introduced in commit `8324ca6` (Stage 2 adapter implementation). Railway rejected
them with six TS2835 errors.

### Why It Was Missed for Three Sessions

Standard pre-commit practice was `npx tsc --noEmit` (aliased as `npm run typecheck`). This
command validates **only the root `tsconfig.json`**, which uses `moduleResolution: "bundler"`.
Bundler resolution does not require `.js` extensions. The root tsconfig also does **not**
follow project references to `server/tsconfig.json`. So the same import paths that failed in
production compiled clean locally. Three consecutive sessions saw green local checks and
assumed build safety.

### The Fix

Verified the scope with a grep audit (11 static imports across 6 files), then fixed
individually. A dynamic `import()` type annotation on `adapter-factory.ts:18` was not caught
by the grep pattern (it doesn't use `from '...'` syntax) and surfaced only after running
`npm run build:server`. Fixed as part of the same commit.

### The Governance Update

`.cursorrules` now mandates `npm run build:server` as a required pre-commit step.
`CLAUDE.md § Pre-commit Checks` section replaced the old single-line `npm run validate`
note with explicit guidance distinguishing `tsc -b` (follows project references) from
`tsc --noEmit` (root only). Two new gotchas (#167 and #168) document the failure mode
and the grep-miss pattern for future agents.

---

## 🚨 Configuration State at Hand-Off

### Migrations applied to production Supabase
- ✅ All prior migrations (058-061) from May 3 remain applied — **no changes this session**

### `app_settings` state
- ⚠️ `ai.temperature` = `0` — STILL TEMPORARY from May 2 Test B. **Restore to `0.1`** (Priority 1).
- ✅ All other keys at standard defaults.

### Branch state
- `insurgemini202605041923` — pushed, build-green, awaiting merge
- `main` — at `3a128ae` (PR #466 merge) — does NOT yet contain the build fix
- Railway is still failing until this branch merges

### Required env vars
No new env vars introduced this session. The build fix is purely import-path corrections;
no runtime behavior changed.

### Workflows
No workflow changes this session. All workflows remain as configured in May 3 session:
- `smoke-kasko.yml` — every push to main matching the path filter (PR #461) + 15-min timeout
- `audit-judge-trends.yml` — Mondays 06:00 UTC
- `audit-observability-daily.yml` — daily 08:00 UTC (sunset candidate per May 3 Priority 4)
- `output-stability.yml` — manual `workflow_dispatch`, 3 runs, default Tiguan fixture

---

## 📚 Documentation Sync (this session)

- **CLAUDE.md** updated:
  - Gotchas #167 + #168 appended (NodeNext vs bundler resolution gap; dynamic import type
    annotation grep-miss)
  - `Pre-commit Checks` section replaced with precise `tsc -b` vs `tsc --noEmit` guidance
  - Commands table: `npm run typecheck` annotated as root-only / insufficient for server build
  - "Last Updated" line refreshed to May 4, 2026
- **.cursorrules** updated:
  - `Required Workflows` gains: "Pre-commit TypeScript Verification — run `npm run build:server`
    before committing any `.ts` change; `npm run typecheck` is root-only"
- **SESSION_HANDOFF.md** (this file) — fully rewritten for May 4 state

**No ADR warranted** — this session corrected import paths and documented an existing
architectural constraint (dual-tsconfig composite build). No new technology, no deployment
strategy change, no architectural shift.

---

## 🔭 Where the Next Agent Picks Up

1. **Merge `insurgemini202605041923`** to unblock Railway (Priority 2).
2. **Restore `ai.temperature` to `0.1`** via Supabase SQL Editor (Priority 1).
3. **f6c1235 review** — the deferred quality-detector and scripts audit (Priority 3).
4. **Credential timing** — if GCP credentials are available, run baseline captures (Priority 4).

The production build is now clean locally. Once merged, Railway will build green.
