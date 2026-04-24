# Session Handoff — April 24, 2026 (Evening) — Trust-Damage Fixes + Backend QA Gate

> **Session type**: Fix. The April 24 human review flagged three "still broken" trust-damage bugs: hidden vehicle rows (4th consecutive failure), 98% confidence contradicting the "Incomplete extraction" banner on the same screen, and a half-implemented completeness gate (letter grade still shown next to incomplete banner). Underneath those specifics, the reviewer called out the meta-pattern: improvements were landing at the UI layer without being validated against the 70 policies in the DB before shipping.
>
> This session: (1) shipped a backend QA gate that runs every extraction-quality fix against every kasko policy in the DB before we claim it complete, (2) closed each of the three specific bugs with tests that pin the new behavior.

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1: Run the QA gate against production data, commit report, decide on follow-ups

- **Command**: `npm run qa:extraction` (requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`).
- **Reads**: all kasko policies in `policies` table. Fully read-only against the DB.
- **Outputs**: `reports/qa-extraction-quality-<timestamp>.{csv,md}` (dir is gitignored).
- **Expected baseline on existing 70-policy batch**:
  - `VEHICLE_COMPLETENESS`: expect criticals on the Anadolu Tiguan policy and any other PDFs where the regex pipeline returned undefined. These are surfaced so we can prioritize which insurer formats to extend `shared/field-aliases.ts` for.
  - `CONFIDENCE_GATE_SYNC`: expect all policies to pass now that `displayedAiConfidence` caps at 0.65 when `extractionIncomplete` fires. If any critical appears, the cap isn't wired on the write path the policy came from.
  - `GRADE_GATE_SYNC`: expect 100% pass — the `isProvisional` chain was already intact.
- **Triage**: for every `VEHICLE_COMPLETENESS` critical, capture the policy ID + insurer, look at the raw_data text, and either (a) extend `shared/field-aliases.ts` with a new label alias/STOP_LABEL, or (b) flag the policy as genuinely unreadable (probably OCR casualty — needs GCP Document AI re-run).

### Priority 2: Open a PR for this session's work

- **Branch**: `claude/load-project-context-0P7Rm` — 5 commits ahead of `origin/main` (including this QA-audit delta commit):
  - `76b3abb` fix(extraction): backend QA gate, empty-row vehicle UI, confidence cap, full gate suppression
  - `83583ea` docs(qa): fix stale runbook path reference in qa-extraction-quality header
  - `ea57112` fix(extraction): Allianz inverted-label make + pdf-parser length threshold
  - `6c89c7b` chore(docs): session handoff sync — ADR-020 for QA gate, expand coverage
  - `4d87585` chore(docs): completeness-delta QA audit — stale counts, ADR path, commit cross-refs
- **Suggested PR title** (Conventional Commits + release-please compatible):
  ```
  fix(extraction): backend QA gate + six trust-damage fixes
  ```
- **Summary bullets** (put in PR body, not title):
  - Adds `scripts/qa-extraction-quality.ts` + `npm run qa:extraction` + runbook 07 — backend gate that validates every extraction fix against the 70-policy DB before we claim it complete.
  - `VehicleInfoCard`: renders plate/make/model/model-year unconditionally; missing fields show `t.policy.cannotVerify` as an italic gray placeholder (fixes reviewer complaint #1).
  - `evaluator.ts`: derives `displayedAiConfidence`, capped at 0.65 when `extractionIncomplete` fires. `PolicyScoreSection` read sites swap to `evaluation.displayedAiConfidence ?? policy.aiConfidence` (fixes reviewer complaint #2).
  - Full-gate: ScoreBreakdown, Recommendations, PolicyScenariosSection, MarketComparisonCard (mobile+desktop), ActuarialInsightsCard now fully suppressed (`return null`) when `isUnverified`. Amber incomplete-extraction banner gains `extractionIncompleteDesc` as a sub-message (fixes reviewer complaint #3).
  - Adds `policy.cannotVerify` to EN/TR/skeleton/interface (4-file rule, gotcha #98).
  - `matchLabeledField()` gains `scanBackwardForInvertedValue()` fallback — recovers make from Allianz Peugeot `: PEUGEOT (114)\tMarka Plaka No : ...` format. Strict Peugeot golden assertion re-enabled.
  - `pdf-parser.ts` EMPTY_PDF threshold now measures actual content length, not page-marked string. Fixes 49-char threshold test.
  - Adds ADR-020 documenting the QA gate pattern as a new class of engineering artefact.
  - Test regressions: 4 evaluator cap tests, 2 Scenarios suppression tests, 2 VehicleInfoCard empty-row tests, 3 Allianz inverted-label tests, 1 updated PolicyDetailView-branches test, 1 pdf-parser 49-char test now green. 765 tests across 20 touched/adjacent vitest files (see "Verification Performed in This Session" table) pass.

### Priority 3: Carry-forward items — all resolved this session except monitoring

- **Allianz inverted-label make extraction** ✅ DONE. `scanBackwardForInvertedValue()` added to `matchLabeledField` at `shared/field-aliases.ts`. `extractorLenientFor: ['make']` removed from the Peugeot golden fixture — strict `expectedMakeContains: 'PEUGEOT'` now passes (gotcha #103). 3 regression tests in `turkish-utils-vehicle.test.ts`.
- **`pdf-parser.test.ts` length-threshold assertion** ✅ DONE. Root cause: the 50-char EMPTY_PDF threshold was measuring the page-marked string (`[PAGE 1]\n...`), inflating count by 9 chars per page. Fixed to measure actual content length. All 102 `pdf-parser.test.ts` tests pass (gotcha #104).
- **Grade threshold drift monitoring** — passive. Thresholds calibrated on 64-policy sample (A≥89, B≥85, C≥39, D≥2). Recalibration needs n≥50 per non-negotiable rule #11.
- **Ek Sözleşme / IMM caveat edge cases** — reactive. Tighten `extractEkSozlesmeBullets` regex or extend `IMM_CARVEOUT_LOCATION_HINTS` / amount regex only when live policies surface false positives or missed caps.

## Current State

**Branch**: `claude/load-project-context-0P7Rm`, clean working tree, 5 commits ahead of `origin/main` (this session; see Priority 2 for the full commit list).
**Database**: unchanged (70 policies from 10 providers).
**Grade thresholds**: unchanged.
**Tests**: 765 verified passing across 20 vitest files — 8 directly-invoked (VehicleInfoCard 8, PolicyScenariosSection 10, evaluator 47, PolicyDetailView 44, PolicyDetailView-branches 163, turkish-utils-vehicle 21, qa-pdf-golden 46, pdf-parser 102) + 12 via 3 sweep bundles (evaluator-adjacent 5 files / 115, PolicyCard+pilot-gate+pilot-qa 3 files / 97, reviewer-mode 4 files / 112). Typecheck clean. Lint 0 errors / 25 warnings (cap 47). See "Verification Performed in This Session" table below for per-file breakdown.

## What This Session Produced

### Part A — Backend QA Gate (ships first, gates every subsequent fix)

**New**:
- `scripts/qa-extraction-quality.ts` — ~350 lines. Imports `reconstructPolicySafely` from `backfill-evaluation-scores.ts` and `evaluatePolicy` from the evaluator. Three per-policy checks (vehicle completeness, confidence-gate sync, grade-gate sync). Writes CSV + markdown to `reports/` (gitignored). Exits non-zero when any check has criticals. Read-only against the DB.
- `docs/runbooks/07-qa-extraction-quality.md` — runbook with command reference, when-to-run list, interpretation guide, and non-goals.
- `package.json` — new `"qa:extraction"` script.
- `.gitignore` — `reports/` (local audit artefacts, contain policy IDs).

**Rule added**: gotcha #102 in CLAUDE.md. Before claiming any extraction-or-display fix as complete, run the gate and confirm the relevant check moved.

**ADR**: `docs/adr/020-backend-qa-gate-for-extraction-quality.md` — documents the QA gate pattern as a new class of engineering artefact (new artefact class, mandatory pre-ship convention, why it's manual rather than CI-enforced for this iteration).

### Part B1 — Empty-row Vehicle UI + i18n

**Changed**:
- `src/components/PolicyDetailView/VehicleInfoCard.tsx` — extracted a `renderField(label, value)` helper. Plate / Make / Model / Model Year render unconditionally; when value is missing/empty, render `t.policy.cannotVerify` as italic gray placeholder with `data-testid="vehicle-field-cannot-verify"`. Usage Type and Vehicle Class stay conditional (not headline fields).
- `src/lib/i18n/translations-{en,tr,skeleton}.ts` + `translations.ts` interface — added `policy.cannotVerify` (EN: "Cannot Verify", TR: "Doğrulanamadı") to all four files.

**Test updates**:
- `VehicleInfoCard.test.tsx` — replaced the "hides when undefined" test with two new ones: "renders headline fields as Cannot Verify when missing" and "does not render Cannot Verify for optional fields".
- `PolicyDetailView-branches.test.tsx` — rewrote the "hides model/year/usage/class" test to assert the new pattern.

**Rule added**: gotcha #99. Why empty > hidden.

### Part B2 — Displayed AI Confidence Cap

**Changed**:
- `src/lib/policy-evaluation/types.ts` — new optional `displayedAiConfidence?: number` on `PolicyEvaluation`.
- `src/lib/policy-evaluation/evaluator.ts` — exported `INCOMPLETE_CONFIDENCE_CAP = 0.65`. The return block derives `displayedAiConfidence = extractionIncomplete ? min(raw, 0.65) : raw`. Undefined raw → undefined displayed.
- `src/components/PolicyDetailView/PolicyScoreSection.tsx` — both `MobileInsightsCard` and `DesktopInsightsCard` now accept `evaluation` via props and read `evaluation?.displayedAiConfidence ?? policy.aiConfidence` when rendering the confidence pill (lines 235, 526).
- `src/components/PolicyDetailView.tsx` — passes `evaluation={evaluation}` to both Insight card call-sites.
- `scripts/qa-extraction-quality.ts` — mirrors the cap constant and asserts it in `CONFIDENCE_GATE_SYNC`.

**Test additions**:
- `evaluator.test.ts` — new "Displayed AI Confidence" describe block with 4 regression tests (cap engages, raw passes through, min-of-raw-and-cap behavior, undefined raw → undefined displayed).

**Rule added**: gotcha #100. Two constants, one source of truth.

### Part B3 — Full Gate Suppression of Scoring-Dependent Cards

**Changed**:
- `src/components/PolicyDetailView/PolicyScoreSection.tsx` — mobile ScoreBreakdown was wrapped in `opacity-60` on `isUnverified`; now fully guarded with `{!isUnverified && <ScoreBreakdown/>}`. Same for desktop. Same for Recommendations section. The amber incomplete-extraction banner gains `extractionIncompleteDesc` as a secondary line.
- `src/components/PolicyDetailView/PolicyScenariosSection.tsx` — new `isUnverified?: boolean` prop. Early returns `null` when true.
- `src/components/PolicyDetailView/MarketComparisonCard.tsx` — same prop + early null on both Mobile/Desktop variants.
- `src/components/PolicyDetailView/ActuarialInsightsCard.tsx` — early null when `isUnverified` (prop already existed on the signature).
- `src/components/PolicyDetailView.tsx` — pass `isUnverified` through to Scenarios and both Market Comparison cards.

**Test additions**:
- `PolicyScenariosSection.test.tsx` — 2 new tests: suppressed when isUnverified, rendered when false.

**Rule added**: gotcha #101. Half-gate is the bug; full-suppression is the fix.

### Part C — Carry-over Priority Fixes (commit `ea57112`)

Two items from the previous session's handoff closed in the same session.

**Allianz inverted-label make extraction** (`shared/field-aliases.ts`):
- `matchLabeledField()` gains a backward-scan fallback via `scanBackwardForInvertedValue()` that fires after the forward scan yields nothing.
- Handles the Allianz Peugeot KASKO layout `: PEUGEOT (114)\tMarka Plaka No : 34 GM 6461` where the value precedes the label on the same line.
- Narrow by design: only fires when the pre-label line segment starts with `:`. Any other shape (e.g. `Plaka : 34 ABC 12\tMarka`) returns `undefined` to prevent mis-capture of neighboring labeled fields.
- `extractorLenientFor: ['make']` removed from the Peugeot golden fixture; strict `expectedMakeContains: 'PEUGEOT'` now passes.

**Test additions (Allianz)**:
- `turkish-utils-vehicle.test.ts` — 3 new tests: the inverted layout case, the preceding-label false-positive guard, and a no-double-fire sanity check. 21/21 pass.
- `qa-pdf-golden.test.ts` — 46/46 pass with the strict Peugeot assertion.

**`pdf-parser.test.ts` length threshold** (`src/lib/ai/pdf-parser.ts`):
- Root cause: the 50-char EMPTY_PDF threshold was measuring the page-marked string (`[PAGE 1]\n...`), inflating the count by 9 chars per page. A PDF with 41 actual chars of content passed the threshold because 41 + 9 = 50.
- Fix: track `pageTexts` separately from the page-marked `textContent`. Threshold runs on `pageTexts.reduce((s, t) => s + t.length, 0)`. Page-marked output shape unchanged — downstream consumers (`document-ocr.ts`) still see `[PAGE N]\n...`.
- 102/102 `pdf-parser.test.ts` pass (was 101 + 1 pre-existing fail).

**Rules added**: gotchas #103 (backward-scan) + #104 (pdf-parser threshold).

## Verification Performed in This Session

| Command | Result |
|---|---|
| `npm run typecheck` | Clean (0 errors) |
| `npm run lint` | 0 errors / 25 warnings (cap 47) |
| `npx vitest run src/components/PolicyDetailView/VehicleInfoCard.test.tsx` | 8/8 pass |
| `npx vitest run src/components/PolicyDetailView/PolicyScenariosSection.test.tsx` | 10/10 pass |
| `npx vitest run src/lib/policy-evaluation/__tests__/evaluator.test.ts` | 47/47 pass (+4 new cap tests) |
| `npx vitest run src/components/PolicyDetailView.test.tsx` | 44/44 pass |
| `npx vitest run src/components/PolicyDetailView-branches.test.tsx` | 163/163 pass |
| Evaluator-adjacent sweep (5 files) | 115/115 pass |
| PolicyCard + pilot-gate + pilot-qa sweep (3 files) | 97/97 pass |
| Reviewer-mode sweep (4 files) | 112/112 pass |
| Isolated typecheck of `scripts/qa-extraction-quality.ts` | 0 errors |
| `npx vitest run src/lib/ai/__tests__/turkish-utils-vehicle.test.ts` | 21/21 pass (+3 new inverted-label tests) |
| `npx vitest run src/lib/ai/__tests__/qa-pdf-golden.test.ts` | 46/46 pass (strict Peugeot make assertion now live) |
| `npx vitest run src/lib/ai/pdf-parser.test.ts` | 102/102 pass (49-char EMPTY_PDF test now green) |

**Not run** (per `.cursorrules`): full test suite (`npm run test`) — takes >10 minutes and no evidence was needed beyond the 20 touched/adjacent vitest files (see "Verification Performed in This Session" table).

## Environment / Configuration

No environment variable **additions** this session. No new packages. No migrations. No `package.json` deps — only the new `qa:extraction` npm script entry.

**Existing env vars required by the new QA gate** (all already documented in `CLAUDE.md > Environment Variables`):

| Variable | Required by | Purpose |
|---|---|---|
| `SUPABASE_URL` | `npm run qa:extraction` | Service-role connection to list policies |
| `SUPABASE_SERVICE_ROLE_KEY` | `npm run qa:extraction` | Service-role key (not anon) |

The script fails fast with a clear error if either is missing. No API keys or write credentials are needed — the gate is read-only.

Sandbox note: a fresh `npm ci --prefer-offline` was needed mid-session because `node_modules` was empty. No real Supabase credentials in this sandbox — the QA runner was typechecked in isolation but could not be run live. Human/CI environment can run it directly.

## New Patterns / Gotchas Introduced (cross-ref to CLAUDE.md)

| # | Topic | CLAUDE.md gotcha |
|---|-------|------------------|
| 1 | Empty-row UI pattern for extraction failures | #99 |
| 2 | `displayedAiConfidence` cap + sync between evaluator.ts and qa-extraction-quality.ts | #100 |
| 3 | `isUnverified` full suppression (not dimming) of scoring-dependent cards | #101 |
| 4 | QA extraction quality gate (`npm run qa:extraction`) | #102 |
| 5 | Backward-scan fallback for inverted `: VALUE\tLabel` layouts | #103 |
| 6 | PDF-parser length threshold measures content, not page-markers | #104 |

## Non-Negotiable Rules (Carry Forward — Unchanged)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) NEVER overwritten.
2. Full test suite NEVER run without explicit user permission (>10 min).
3. Pilot evidence from real live data only.
4. All new AI extraction routes MUST follow the `/api/ai/extract/:provider` pattern in `server/routes/ai/`.
5. The use of `as unknown as` is a code smell — prefer explicit typing and safe fallbacks.
6. Market conclusions gated by `BenchmarkConfidence`.
7. Extraction schema changes go in `shared/extraction-schema.ts` ONLY.
8. Turkish regex patterns must handle Turkish İ (U+0130) via `[iİ]`.
9. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`.
10. `isIncluded()` treats `undefined` as included (industry standard).
11. Grade recalibrations require n ≥ 50 sample size.
12. When adding a coverage-item schema property, update THREE places: `properties`, `required[]`, AND the count-assertion tests (see gotcha #47 / #95).
13. When adding a value-label alias to `VEHICLE_FIELD_ALIASES`, remember that `matchLabeledField()` requires a KV separator (`:`, tab, 2+ spaces) after the label (gotcha #89).
14. NEVER wrap structural translation keys (`t.global.unlimited`, `t.policy.noUpperLimit`) in `applySafeWording()` — it destroys the signal. (gotcha #90)
15. **NEW** — Before claiming any extraction-quality fix complete, run `npm run qa:extraction` and confirm the relevant check's pass rate moved. No UI-only fixes without backend validation. (gotcha #102)
