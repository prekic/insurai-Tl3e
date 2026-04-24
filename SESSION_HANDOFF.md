# Session Handoff — April 24, 2026 (v4 Extraction-Depth Pass — 3 PRs)

> **Session type**: Feature + fix. v3 QA surfaced 10 extraction-quality issues on the Anadolu VW Tiguan policy. This session shipped three sequenced PRs that (1) kill the user-hostile placeholder text, (2) preserve the "Sınırsız" signal on IMM, (3) gate confident letter grades when extraction is incomplete, (4) centralize vehicle-field aliases across insurer formats, (5) ship a deterministic Ek Sözleşme parser, (6) enumerate named conditional deductibles, and (7) surface the 2.5M TL IMM carve-out as a caveat badge.

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1: Open the PR and merge

- **Branch**: `claude/load-project-context-bNYCu` → `main` (3 commits ahead)
- **Suggested PR title** (Conventional Commits, release-please compatible):
  ```
  feat(extraction): v4 extraction-depth pass — alias table, completeness gate, Ek Sözleşme bullets, deductible enumeration, IMM carve-out
  ```
- **Commits**:
  - `3005328` fix(extraction): canonical field-alias table, kill placeholder, gate incomplete extractions
  - `0308b8f` fix(extraction): tighten PDF golden assertions + fix Modeli partial-match + prose-match guard
  - `fa3e298` feat(extraction): Ek Sözleşme bullets + named deductibles + IMM carve-out caveat
- **Action**: Review diff, open PR via the GitHub UI or `gh pr create`, merge after approval.

### Priority 2: Allianz inverted-label make extraction (known latent bug)

- **Symptom**: Allianz Peugeot PDFs use `: PEUGEOT (114)\tMarka Plaka No : ...` format — the make VALUE is BEFORE the `Marka` LABEL on the same line.
- **Current behavior**: `extractVehicleInfoFromText` returns `make: undefined`. The Peugeot golden fixture routes this via `extractorLenientFor: ['make']` so the test still passes via a text-contains fallback.
- **Fix path**: Extend `matchLabeledField()` in `shared/field-aliases.ts` with a bidirectional scan — when a label is found but no value follows, scan BACKWARDS on the same line for a capitalized token.
- **File**: `shared/field-aliases.ts:matchLabeledField`
- **Test**: Remove `extractorLenientFor: ['make']` from the Peugeot fixture in `src/lib/ai/__tests__/qa-pdf-golden.test.ts` to re-enable the strict assertion.

### Priority 3: Fix the pre-existing `pdf-parser.test.ts` length threshold assertion

- **File**: `src/lib/ai/pdf-parser.test.ts`
- **Issue**: Length threshold assertion mismatch — unrelated to v4 work but still open from the previous session.
- **Impact**: Does not block production but blocks a clean next PR.

### Priority 4: Phase E production monitoring

- Grade thresholds calibrated at A ≥ 89, B ≥ 85, C ≥ 39, D ≥ 2 from a 64-policy real-data sample.
- Monitor for drift as new policy batches enter. Recalibration needs n ≥ 50 per Non-Negotiable Rule #11.
- Thresholds live in `app_settings[evaluation/grade_*_threshold]` with 5-minute TTL cache.

### Priority 5: Watch for Ek Sözleşme / IMM caveat edge cases in live policies

- **Ek Sözleşme**: The deterministic parser only runs when LLM returned `< 3` supplementary coverages AND policy is kasko/traffic. If the parser starts injecting bad rows on production documents, either tighten the bullet regex in `extractEkSozlesmeBullets` or add the specific noisy glyph to a blocklist.
- **IMM carve-out**: `detectImmCarveOut` uses a location-keyword + 2.5M-TL amount pattern. Other per-scenario caps (different amounts, different locations) won't be caught. Add new entries to `IMM_CARVEOUT_LOCATION_HINTS` + the amount regex in `evaluator.ts` as they appear.

## Current State

**Branch**: `claude/load-project-context-bNYCu` (3 commits ahead of `main`)
**Working tree**: Clean before this handoff commit; doc updates land here.
**Database**: 70 policies from 10 unique providers (unchanged this session)
**Grade thresholds**: Calibrated from 64-policy sample (unchanged this session)
**Tests**: 771 tests across 22 touched/adjacent suites pass. Full repo count ~17,486+ (adding 22 new tests this session: 9 vehicle, 10 display-mode, 14 pr3-extraction-depth, 3 IMM carve-out, minus some rewritten pre-existing tests).

### Commits landed this session

```
fa3e298 feat(extraction): Ek Sözleşme bullets + named deductibles + IMM carve-out caveat
0308b8f fix(extraction): tighten PDF golden assertions + fix Modeli partial-match + prose-match guard
3005328 fix(extraction): canonical field-alias table, kill placeholder, gate incomplete extractions
```

## What This Session Produced

### PR-1 — Foundation (commit `3005328`)

Covers v3 QA priorities **#2** (Model Year label drift across insurers), **#3** (placeholder text rendered as coverage content), **#7** (confident letter grade on broken extractions).

- **New file**: `shared/field-aliases.ts` with `VEHICLE_FIELD_ALIASES` (6 canonical fields × multiple label variants) and `matchLabeledField(text, field)` helper. Handles Model Yılı / Model Bilgisi / İmal Yılı / Üretim Yılı / Model Year / Araç Yılı / bare `MODEL: <year>`.
- **Killed the `"Coverage subject to sublimits..."` placeholder**: Removed the `unlimited → sublimits` regex from `display-interpreter.ts:applySafeWording`, removed `"unlimited"` and `"sınırsız"` from `PROHIBITED_PHRASES`, and bypassed `applySafeWording()` on structural limit values in `PolicyCoverageSection.tsx` and `policy-reviewer-summary.ts`. The Sınırsız/Unlimited signal now reaches the UI intact.
- **Completeness gate**: `evaluateSimpleDisplayMode()` extended with vehicle + policyType + coverage-placeholder triggers (`MISSING_VEHICLE_MAKE`, `MISSING_VEHICLE_MODEL`, `MISSING_VEHICLE_YEAR`, `COVERAGE_PLACEHOLDER_DETECTED`). `evaluatePolicy()` now sets `isProvisional = true` and populates new `extractionIncomplete` + `extractionGateTriggers` fields on `PolicyEvaluation`. `PolicyScoreSection.tsx` renders `t.policy.extractionIncomplete` banner/badge when the flag fires.
- **i18n**: Added `policy.extractionIncomplete` + `policy.extractionIncompleteDesc` to EN/TR/skeleton dictionaries.
- **Tests**: 9 new `turkish-utils-vehicle` tests, 8 new `evaluate-simple-display-mode` tests, plus updates to 7 pre-existing test suites that had pinned the old hedge-string behavior.

### PR-2 — Tightened golden assertions (commit `0308b8f`)

Covers v3 QA priority **#1** (vehicle info blank / label leak).

- **`hasKvSeparator()` guard in `matchLabeledField`**: A bare alias word in prose (e.g. the word "model" inside the sentence `"marka, model, model yılı ve kullanım amacı"`) no longer beats the real labeled occurrence. Labels must be followed by `:`, tab, or 2+ spaces to qualify.
- **Turkish possessive handling**: The `model` alias now accepts optional trailing `[iİ]` so "Modeli" is consumed as one label, not "Model" + "i" leaked into the value. Same `tip[iİ]?` for "Tipi".
- **`STOP_LABELS` list**: 11 auxiliary Turkish vehicle-section labels (Kullanım Şekli, Tür, Tescil Tarihi, Yer Adedi, Trafiğe Çıkış, Ruhsat, Müşteri Numarası, SBM Tramer, Acente) act as value-capture boundaries — not extracted as fields, just used to terminate captures.
- **All 5 PDF golden fixtures pinned strict**: Anadolu Tiguan (full strict), Renault Clio (full strict), Anadolu VW Golf (full strict), Allianz Peugeot (strict on all fields except `make` via `extractorLenientFor`), Ray IVECO OCR text (lenient for OCR-corrupted fields).
- **New `PdfFixture` fields**: `expectedModelContains`, `expectedEngineNo`, `expectedChassisNo`, `extractorLenientFor`.
- 46 tests pass in `qa-pdf-golden.test.ts` (up from 33).

### PR-3 — Extraction depth (commit `fa3e298`)

Covers v3 QA priorities **#4** (Ek Sözleşme coverage under-reporting), **#5** (deductibles aggregated to "1 conditional"), **#6** (IMM Sınırsız carve-out hidden).

- **`extractEkSozlesmeBullets()` in `policy-converter.ts`**: Deterministic parser for Turkish kasko add-on sections. 4 header variants (`Ek Sözleşme Maddeleri`, `Ek Teminat Listesi`, `ek sözleşmeyle teminat kapsamına dâhil`, `Genel Şartlar'a göre ek sözleşme`), 5 bullet glyphs including the Anadolu `l` (lowercase L in place of a filled-circle glyph). Runs only when LLM returned `< 3` `category: 'supplementary'` coverages AND policy is kasko/traffic. Dedupes against existing coverage names.
- **Named deductible enumeration in `classifyExclusions()`**: 7-entry `NAMED_DEDUCTIBLE_SCENARIOS` table (`Anlaşmalı olmayan servis`, `Pert araç muafiyeti`, `Beyan dışı LPG / CNG donanımı`, `Rent-a-car / ticari kullanım`, `İlk cam hasarı muafiyeti`, `Sürücü yaşı`, `Ehliyet süresi`). Each emits `"<Label>: %<N>"`. Each scenario fires at most once per policy. Unrecognized matches fall back to the softener. Function exported for unit testing.
- **IMM Sınırsız carve-out caveat**: New `ScenarioCard.caveat` + `caveatTR` bilingual fields on `src/lib/policy-evaluation/types.ts`. Matching `carveOuts?: string[] | null` field on `Coverage` and `ExtractedCoverage`. `detectImmCarveOut()` in `evaluator.ts` inspects `carveOuts`, `clause`, `quote`, `description` for the 2.5M TL airport/port/fuel-depot pattern. `PolicyScenariosSection.tsx` renders the caveat as a bilingual amber `role="note"` block.
- **Schema**: `carveOuts` added to coverage items in `shared/extraction-schema.ts` with `required[]` updated per gotcha #47. LLM prompts (`prompts.ts`, `kasko-parser-prompts.ts`) instruct the model to populate `carveOuts`, expand Ek Sözleşme bullets as individual supplementary coverages, and name deductible scenarios concretely.
- **Test count assertions aligned**: Top-level `required[]` 23→30 (stale assertion corrected), coverage props 13→14.
- **Tests**: 14 new in `pr3-extraction-depth.test.ts` + 3 new in `imm-scenario-detection.test.ts`.

## Environment / Configuration

No environment variable changes this session. Variables remain as documented in `CLAUDE.md > Environment Variables`:

| Variable | Status | Notes |
|----------|--------|-------|
| `PILOT_REVIEWER_USER_ID` | `5c887095-61bd-488b-933f-f41786a3d527` | Set in `.env` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Set | Unchanged |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_CLOUD_API_KEY` | Set | Unchanged |
| `ADMIN_JWT_SECRET` | Set | Unchanged |
| `VAPID_*` | Set | Unchanged |
| Grade thresholds | A:89, B:85, C:39, D:2 | In `app_settings[evaluation/grade_*_threshold]`, 5-min TTL cache |

No new migrations were applied. No new packages were added. No `package.json` changes.

## New Patterns / Gotchas Introduced (cross-ref to CLAUDE.md)

| # | Topic | CLAUDE.md gotcha |
|---|-------|------------------|
| 1 | Canonical vehicle field-alias table (`shared/field-aliases.ts`) | #89 |
| 2 | `unlimited`/`sınırsız` removed from PROHIBITED_PHRASES; don't wrap structural labels in `applySafeWording()` | #90 |
| 3 | `evaluateSimpleDisplayMode` new vehicle + placeholder triggers; wired into `isProvisional` | #91 |
| 4 | `extractEkSozlesmeBullets()` deterministic fallback + gating | #92 |
| 5 | Named deductible enumeration in `classifyExclusions()` | #93 |
| 6 | IMM Sınırsız carve-out caveat pattern | #94 |
| 7 | `carveOuts` coverage schema field — `required[]` count is 14 | #95 |
| 8 | Pre-commit hook auto-formats staged files (reminder) | #96 |

## Discovered Quirks / Known Limitations

1. **Allianz inverted `: VALUE\tLabel` format** — tracked via `extractorLenientFor: ['make']` in the Peugeot fixture. Fix path described in Priority 2 above.
2. **Ray Sigorta OCR corruption** — the `.txt` fixture for the scanned Ray IVECO PDF has corrupted labels (e.g. `MARKASI/TİPİ` → `SVTİPİ`). `hasKvSeparator` correctly filters these out now (no more bogus make value), and production routes such scanned PDFs through GCP Document AI OCR via the `requiresOcr: true` companion fixture.
3. **Test count drift** — Before this session, `shared/__tests__/extraction-schema.test.ts` had an assertion of 23 top-level required fields (actual: 29 at that time) and 9 coverage props (actual: 13). Both corrected to current reality (30 / 14). If you add more schema fields, update ALL count assertions — see gotcha #47 + #95.
4. **Post-commit file reformatting** — `.husky/pre-commit` runs lint-staged which auto-applies `eslint --fix` + `prettier --write` on every committed `.ts/.tsx` file. The editor/linter notes these as "intentional changes" after each commit. Treat as informational.

## Architecture Check

**No architectural shift this session.**
- No new technology added. `shared/field-aliases.ts` follows the existing `shared/extraction-schema.ts` + `shared/strict-mode-validator.ts` precedent for cross-client/server utilities.
- No deployment strategy changes.
- No new migrations or schema tables.
- No new package dependencies.
- No ADR required.

## Non-Negotiable Rules (Carry Forward)

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
13. When adding a value-label alias to `VEHICLE_FIELD_ALIASES`, remember that `matchLabeledField()` requires a KV separator (`:`, tab, 2+ spaces) after the label — bare prose matches are skipped intentionally (gotcha #89).
14. NEVER wrap structural translation keys (`t.global.unlimited`, `t.policy.noUpperLimit`) in `applySafeWording()` — it destroys the signal. Narrative insights (free-text promotional language) still go through the sanitizer on a separate path.
