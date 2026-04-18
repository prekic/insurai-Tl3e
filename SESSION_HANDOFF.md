# Session Handoff — April 18, 2026 (Phase E + Autonomous Follow-ups)

> **Branch**: `claude/load-project-context-d2ylb` — 4 commits ahead of `origin/main`, clean working tree, all pushed.
> **No PR opened** (user held back). Merge-ready: CI should pass on push.

## 🎯 Immediate Next Steps — Priority Order

| # | Action | Blocker | Link |
|---|--------|---------|------|
| 1 | **Open PR → main** for this branch | User gating decision only | Suggested squash title in Step 5 below |
| 2 | **Upload Ray Sigorta PDF fixture** — `KRK_35_VD_458_Kasko_Police_32630901_3.pdf` → `policies/` + add fixture entry to `src/lib/ai/__tests__/qa-pdf-golden.test.ts` (premium 755.21 TL, 17 DAHİL + 10 HARİÇ, IVECO/KAMYON 80-12 1997, plate 35 VD 458) | User has the PDF | Previous handoff carry-forward |
| 3 | **Pilot activation — 3 operator SQL steps** | Manual operator work | `docs/runbooks/04-phase-e-production-scaleup.md` §1–§4 |
| 4 | **DB date-corruption audit + repair** (gotcha #52) | Needs prod DB access | `docs/runbooks/05-date-corruption-audit.md` — diagnostic SQL ready to paste |
| 5 | **Privacy review for email resolver** → set `ENABLE_ADMIN_EMAIL_RESOLVER=true` after review | Operational decision | ADR-0004 documents the rationale |
| 6 | Pilot calibration auto-escalation | Waits on pilot n ≥ 50 | `scripts/calibrate-grade-thresholds.ts --auto-production --apply` — cron-safe, no manual action needed now |
| 7 | Phase F runbook completion | Waits on Phase E E2 soak data | `docs/runbooks/06-phase-f-draft-removal.md` skeleton is in place |

**Nothing on this list is a blocker for merging the branch.** Items 2–7 are operational follow-ups that happen post-merge, or external to code.

---

## What This Session Shipped (4 commits)

```
26e49ee fix(extraction): address 7 deferred QA bugs + calibration guard + console cleanup
2f3f0b7 feat(pilot): Phase E production scale-up — rollout bucketing + Segments admin UI + runbook
33c2c65 fix(ui,docs): unblock 6 pre-existing TrustworthinessUI tests + align [ConfidenceDiag] docs + extend discounts to comprehensive path
b1e6072 feat(admin,docs): autonomous follow-ups — email resolver, calibration auto-prod, RLS comment fix, runbooks 05+06
```

### By track

**Track A — Console cleanup + calibration guard** (`26e49ee`)
- `[ClauseResolver]` warnings gated under `NODE_ENV=test` with `VERBOSE_CLAUSE_RESOLVER=1` opt-in
- `[TryAnalysis ConfidenceDiag]` gated behind `import.meta.env.DEV || localStorage.LOG_LEVEL==='debug'`
- `calibrate-grade-thresholds.ts` gained `--force` + `--production` flags with mutual exclusion; writes audit row `app_settings.evaluation.grade_thresholds_last_calibrated` on every `--apply`

**Track B — Deferred QA bug fixes** (`26e49ee`)
- #9 Discounts schema: `ncdDiscount / groupDiscount / otherDiscountPct / evidence` added to canonical extraction schema (+ client mirror + `AnalyzedPolicy`)
- #13 Niche benchmark suppression: `isCommercialOrNicheVehicle()` downgrades confidence for KAMYON/TIR/Ticari/Filo/OTOBÜS
- #6 Depreciation prompt, #7 parts clause (`derivePartsClauseInsight()`), #10 commercial branching (`detectInsuredEntityType` + `deriveVehicleUsage`), #14 confidence penalty from resolver warnings, #15 locale mixing DEV warning + regression test

**Track C — Phase E production scale-up** (`2f3f0b7`)
- New `src/lib/config/rollout-hash.ts` — shared `computeRolloutBucket(userId, flagKey)` reused by both `ConfigurationService.isFeatureEnabled()` and `evaluateKaskoPilotGate()`
- `usePilotGateOptions` now surfaces `{ enabled, rolloutPercentage }` (was flattened to boolean map)
- `evaluateKaskoPilotGate()` signature extended (back-compat with boolean form), bucket check runs between flag-enabled and segment-membership checks — anonymous users bypass the bucket
- New `src/components/admin/tabs/SegmentsTab.tsx` + backend already existed at `server/routes/admin/segments.ts`
- Product decisions baked into runbook: ladder 25%→100% / 7-day soak / zero-rollback-trigger advance criterion
- Runbook `docs/runbooks/04-phase-e-production-scaleup.md`

**Track D — UI/docs hygiene** (`33c2c65`)
- `PolicyDetailView.tsx` banner gained "Unverified AI output" / "Doğrulanmamış AI çıktısı" prefix, aligning with PolicyCard + toast wording → 6 pre-existing tests unblocked
- `[ConfidenceDiag]` claim in CLAUDE.md audited: commit `fdedfea` never existed here; only 1 site is real (TryAnalysis.tsx). Docs rewritten.
- `discounts` field extended to `comprehensiveToAnalyzedPolicy` via new `deriveDiscountsFromStructured()` helper (parses `noClaimsBonus.discountRate` as fallback)

**Track E — Autonomous follow-ups** (`b1e6072`)
- `TrustworthinessUI.test.tsx:64` mock key fixed (`flags` → `featureFlags`) — closes a latent regression
- Migration 040 RLS comments rewritten to accurately document the intentional-open policy design; CLAUDE.md gotcha #39 updated
- `calibrate-grade-thresholds.ts --auto-production` flag added — cron-safe probe that escalates to production mode only when sample count ≥ 50 AND last audit shows `forced: true`
- New runbook `05-date-corruption-audit.md` (V8 DD.MM.YYYY gotcha #52 diagnostic + repair SQL)
- New runbook `06-phase-f-draft-removal.md` (skeleton for Phase F)
- **New gated endpoint**: `POST /api/admin/app-users/resolve-emails` — resolves emails → UUIDs via `supabase.auth.admin.listUsers`, returns 403 `RESOLVER_DISABLED` unless server env has `ENABLE_ADMIN_EMAIL_RESOLVER=true`
- `SegmentsTab` gained UUID/Email mode toggle with missing-email reporting

---

## Configuration Requirements

### New environment variable (opt-in, privacy-sensitive)
```
# Default: disabled. Set to "true" ONLY after a privacy review.
# When enabled, POST /api/admin/app-users/resolve-emails exposes
# auth.users.email to super-admins via the Segments admin tab.
ENABLE_ADMIN_EMAIL_RESOLVER=true
```
See `docs/adr/0004-env-var-gated-admin-features.md` for the design rationale. `.env.example` has been updated.

### Existing vars — unchanged
All pre-existing vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLOUD_API_KEY`, `GCP_SERVICE_ACCOUNT_BASE64`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VAPID_*`, `CRON_SECRET`, `PILOT_REVIEWER_USER_ID`) still required per prior handoffs.

### Schema — no new migrations
All schema changes this session were either to inline migration comments (040) or to code-only (no `CREATE TABLE` / `ALTER TABLE`). No migration numbers consumed.

---

## Test / Build Status

- **Typecheck**: 0 errors (client `npx tsc --noEmit` + server `npx tsc -p server/tsconfig.json`)
- **Lint**: 0 errors, 0 warnings across all 35+ files touched this session
- **Tests**: 
  - qa-regression-fixes: 38 → 50 (+12 new)
  - kasko-pilot-gate: 22 → 29 (+7 new for Phase E rollout)
  - SegmentsTab: 13 total (+ 5 email-mode)
  - admin-segments server: 12 → 18 (+6 email-resolver)
  - benchmark-confidence: 18 → 20 (+2 for niche vehicle)
  - reviewer-summary: 40 → 44 (+4 for entity/vehicle usage labels)
  - TrustworthinessUI: 7/7 (6 previously failing → now pass)
  - All touched suites: 100% pass rate
- **Full test suite NOT run** (>10 min rule).

---

## Known Issues / Carry-Forward

### Not bugs — flagged for awareness
- **Phase F thresholds are provisional** in runbook 06 — tune after Phase E E2 produces real data
- **Email resolver is feature-complete but disabled** — requires explicit privacy-review opt-in via env var
- **`comprehensiveToAnalyzedPolicy` `discounts` field** relies on `deriveDiscountsFromStructured` parsing `noClaimsBonus.discountRate` — re-extractions under the updated kasko parser prompt (now including `discounts` in JSON template) will populate the field natively

### Pre-existing issues flagged this session (not this-session regressions)
- `[ClauseResolver]` diagnostic logs will still appear in `qa-regression-fixes.test.ts` (VERBOSE_CLAUSE_RESOLVER=1 opt-in) — that's intentional. They verify the unresolved-relationship filter works.
- Commit `fdedfea` referenced in old CLAUDE.md gotcha about `[ConfidenceDiag]` does not exist in this repo — corrected in this session's docs

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
18. **NEW (Apr 18)**: Pilot gate flag shape is polymorphic `boolean | {enabled, rolloutPercentage}` — prefer the object form for new callers (gotcha #73)
19. **NEW (Apr 18)**: Rollout bucketing via `computeRolloutBucket()` — do NOT substitute hash algorithms without a migration plan (gotcha #74)
20. **NEW (Apr 18)**: Privacy-sensitive admin features use env-var opt-in pattern (gotcha #75, ADR-0004)
21. **NEW (Apr 18)**: Migration 040 RLS is intentionally open — do NOT tighten without proxying client-side calls (gotcha #76)

---

## Verification Commands (for the next agent)

```bash
# Branch state
git status                                   # should be clean
git log --oneline -5                         # top 4 should be this session's commits
git diff origin/main...HEAD --stat           # shows ~35 files changed

# Tests (isolated — DO NOT run full suite without permission)
npx vitest run src/lib/ai/__tests__/qa-regression-fixes.test.ts       # 50 pass
npx vitest run src/lib/analysis/__tests__/kasko-pilot-gate.test.ts    # 29 pass
npx vitest run src/components/admin/tabs/SegmentsTab.test.tsx          # 13 pass
npx vitest run server/__tests__/admin-segments.test.ts                 # 18 pass
npx vitest run src/components/__tests__/TrustworthinessUI.test.tsx     # 7 pass
npx vitest run src/lib/policy-evaluation/__tests__/benchmark-confidence.test.ts # 20 pass
npx vitest run src/lib/reviewer/__tests__/policy-reviewer-summary.test.ts       # 44 pass

# TypeScript
npx tsc --noEmit                             # 0 errors
npx tsc -p server/tsconfig.json              # 0 errors
```

### GitHub operations
`gh` CLI is **NOT available** in this sandbox. Use `mcp__github__*` tools — see `docs/runbooks/*.md` for patterns.

### Railway deploy
Sandbox `git push` does NOT trigger Railway webhook (gotcha #22). Use `mcp__github__push_files` or merge PR via `mcp__github__merge_pull_request` to get Railway to redeploy.

---

## Complete File Inventory (from `git diff main...HEAD --name-status`)

42 files changed (6 new, 36 modified) across 5 commits. Listed below verbatim so grep-by-filename resolves every entry.

### New files (A)
| File | Commit | Purpose |
|------|--------|---------|
| `src/lib/config/rollout-hash.ts` | `2f3f0b7` | Shared `computeRolloutBucket()` + `hashString()` |
| `src/components/admin/tabs/SegmentsTab.tsx` | `2f3f0b7` | Admin UI for reviewer segment management |
| `src/components/admin/tabs/SegmentsTab.test.tsx` | `2f3f0b7` / `b1e6072` | RTL tests (13 total incl. email mode) |
| `docs/runbooks/04-phase-e-production-scaleup.md` | `2f3f0b7` | 25% → 100% Phase E runbook |
| `docs/runbooks/05-date-corruption-audit.md` | `b1e6072` | V8 DD.MM.YYYY audit + repair SQL |
| `docs/runbooks/06-phase-f-draft-removal.md` | `b1e6072` | Phase F runbook skeleton |
| `docs/adr/0004-env-var-gated-admin-features.md` | `2eefddb` | Env-var-opt-in pattern ADR |

### Modified files (M) — grouped by subsystem

**Extraction schema + types**
- `shared/extraction-schema.ts` — `discounts` object added; required bumped 19→20
- `shared/__tests__/extraction-schema.test.ts` — count assertion + new discounts test
- `src/lib/ai/extraction-schema.ts` — `ExtractedPolicyData.discounts?`, prompt #12 (discounts), #13 (depreciation), #14 (parts clause)
- `src/lib/ai/extraction-schema.test.ts` — count bump + new discounts test
- `src/lib/ai/kasko-parser-prompts.ts` — `StructuredPolicyData.discounts?` + JSON template entry
- `src/types/policy.ts` — `AnalyzedPolicy.discounts?`
- `src/types/admin.ts` — `AdminSection` union + `'segments'`

**AI extraction pipeline**
- `src/lib/ai/policy-extractor.ts` — all 7 QA fixes; `deriveDiscountsFromStructured`, `derivePartsClauseInsight`, `detectInsuredEntityType` hookups; confidence penalty via resolver stats
- `src/lib/ai/relationship-resolver.ts` — `QUIET_CLAUSE_RESOLVER` gate + new `stats.unresolvedCount` out-param
- `src/lib/ai/turkish-utils.ts` — `isValidVKN()`, `detectInsuredEntityType()`

**Pilot gate + rollout**
- `src/lib/analysis/kasko-pilot-gate.ts` — polymorphic flag shape + bucket check + `inactiveResult()` helper
- `src/lib/analysis/__tests__/kasko-pilot-gate.test.ts` — +7 Phase E distribution/determinism tests (29 total)
- `src/hooks/usePilotGateOptions.ts` — preserves `rolloutPercentage`, new `PilotFeatureFlag` type
- `src/hooks/usePilotGateOptions.test.ts` — mock updated to new shape
- `src/hooks/useDisplaySafeSummary.ts` — option type widened to accept both boolean and object flag shapes
- `src/lib/config/configuration-service.ts` — `isFeatureEnabled()` uses shared `computeRolloutBucket()`; private `hashString()` removed

**Policy evaluator**
- `src/lib/policy-evaluation/evaluator.ts` — `isCommercialOrNicheVehicle()` niche-benchmark downgrade
- `src/lib/policy-evaluation/__tests__/benchmark-confidence.test.ts` — fixture tweak + 2 new commercial-downgrade tests

**Reviewer summary**
- `src/lib/reviewer/policy-reviewer-summary.ts` — `entityType`, `vehicleUsage`, `typeLabel`, `entityLabel` + derive helpers
- `src/lib/reviewer/__tests__/policy-reviewer-summary.test.ts` — +4 commercial-template-branching tests (44 total)

**Admin backend + UI**
- `server/routes/admin/segments.ts` — new `POST /app-users/resolve-emails` endpoint + env gate
- `server/__tests__/admin-segments.test.ts` — +6 resolver tests (18 total)
- `server/routes/admin/monitoring.ts` — D1 pilot monitoring: `calibration` block on rollback-status response
- `src/lib/admin/api.ts` — Phase E segment helpers + `resolveEmailsToUuids` + `EmailResolverDisabledError`
- `src/components/admin/AdminDashboard.tsx` — Segments tab registration (import + TABS + render switch)

**UI hygiene**
- `src/components/PolicyDetailView.tsx` — UNVERIFIED banner prefix copy
- `src/components/TryAnalysis.tsx` — `[ConfidenceDiag]` log gated behind DEV/`localStorage.LOG_LEVEL`
- `src/components/__tests__/TrustworthinessUI.test.tsx` — mock key typo fix (`flags` → `featureFlags`)

**QA regression tests**
- `src/lib/ai/__tests__/qa-regression-fixes.test.ts` — 38 → 50 tests (VERBOSE_CLAUSE_RESOLVER=1 opt-in, +12 covering bugs #6-#15 and discounts derivation)

**Operations / ops tooling**
- `scripts/calibrate-grade-thresholds.ts` — `--force`, `--production`, `--auto-production` flags; `recordCalibrationAudit()`
- `supabase/migrations/040_kasko_pilot_flag_and_segment.sql` — RLS policy names + inline comments corrected (fresh-install only; see nuance below)

**Docs**
- `CLAUDE.md` — Next Session Instructions rewritten; 6 new gotchas #73-#78; env var section; Last Updated Apr 18
- `SESSION_HANDOFF.md` — this file
- `.env.example` — `ENABLE_ADMIN_EMAIL_RESOLVER` documented
- `docs/KNOWN_ISSUES_ARCHIVE.md` — entry #171 (`[ConfidenceDiag]`) corrected to match repo reality

---

## Environment / Config Nuances

### `VERBOSE_CLAUSE_RESOLVER` (test-time only)
Not in `.env.example` because it's a **test runner override**, not a runtime config. `src/lib/ai/relationship-resolver.ts` suppresses its own `[ClauseResolver]` warnings when `NODE_ENV=test` unless the test file opts in via `process.env.VERBOSE_CLAUSE_RESOLVER = '1'` in `beforeAll`. Currently only `qa-regression-fixes.test.ts` opts in (the warnings verify the unresolved-relationship filter). If you notice `[ClauseResolver]` noise in a different test file, it means that test exercises the resolver without opting in — the noise is harmless and suppressible by scoping the opt-in or removing it.

### `localStorage.LOG_LEVEL` (browser only)
Not an env var. Browser-side debug toggle for `[TryAnalysis ConfidenceDiag]` (the only live `[ConfidenceDiag]` site). Set via `localStorage.setItem('LOG_LEVEL','debug')` in the browser devtools to surface the log in production builds. Removing the key returns to silent.

### Migration 040 — file-vs-prod-DB divergence
`supabase/migrations/040_kasko_pilot_flag_and_segment.sql` was edited this session to rename the two RLS policies to `"Open read/write (API layer enforces auth)"` and add inline comments explaining intent. **But the migration already ran in production**, so the prod DB still carries the old policy names (`"Service role manages segments"` and `"Service role manages QA records"`). Fresh installs / local dev recreate with the new names. Do not write a "rename policy" migration unless there's an operational need — the policy bodies are identical either way. The CLAUDE.md update to gotcha #76 reflects this nuance.

---

## Session-Specific Gotchas Worth Surfacing

These got written into code but belong in a quick-reference list:

1. **`vi.hoisted()` must wrap class definitions, not just `vi.fn`** (SegmentsTab.test.tsx). When a test's `vi.mock()` factory needs to return a class (e.g. an Error subclass for `instanceof` checks), the class definition itself must be inside `vi.hoisted(() => { class X extends Error {...}; return { X, ... } })`. A top-level `class MockErr extends Error {}` referenced from `vi.mock()` throws `ReferenceError: Cannot access 'MockErr' before initialization` because `vi.mock()` is hoisted above all top-level statements including class declarations. This is a sharper variant of the general `vi.hoisted()` pattern documented elsewhere in CLAUDE.md.

2. **Email resolver caps at 1000 auth.users**. `server/routes/admin/segments.ts` `POST /app-users/resolve-emails` paginates via `supabase.auth.admin.listUsers({ perPage: 1000, page: 1 })` — a single page. Platforms with more than 1000 users will see emails falsely reported as "missing" when they in fact exist beyond the first 1000. Response includes `cappedAtUserListLimit: true` so the UI can show a notice. **If the pilot scales past 1000 users**, upgrade the endpoint to a server-side SQL function that indexes by email (auth schema queries require the service-role client).

3. **`evaluateKaskoPilotGate()` anonymous-userId bypass**. If `userId` is undefined, the gate skips **both** the rollout-bucket check (can't hash without userId) AND the segment check (anonymous → `userInSegment = true` fallthrough). This is intentional — anonymous TryAnalysis uploads must keep working post-Phase-D without a user account. But it means `rolloutPercentage = 0` does NOT block anonymous users; it only blocks logged-in non-segment users. Document this if/when Phase F locks anonymous paths to the same rollout %.

4. **The Turkish comma decimal parse in `deriveDiscountsFromStructured` rounds aggressively**. `'%40,5' → 40.5 → Math.round(40.5) → 41`. This is correct for percent-integer storage but surprising if an operator expects fractional percent. If future policies show fractional NCDs (unlikely in Turkey), the field should be changed from `number` to `number | string` and storage kept as-written.

5. **`.husky/pre-commit` can silently exit `lint-staged` as no-op** when a commit contains only files already linted via a previous stash. Saw the message `"lint-staged could not find any staged files matching configured tasks"` on the handoff commit — this is normal (the docs files matched no lint-staged config). Don't mistake it for an error.
