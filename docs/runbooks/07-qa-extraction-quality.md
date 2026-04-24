# Runbook 07 — QA Extraction Quality Gate

## Purpose

Validate extraction-quality fixes against every policy in the production DB
**before** claiming them complete. The script emits a CSV + markdown report
and exits non-zero when any check has a critical failure, so it can be used
as a CLI gate (e.g. paired with `git commit`).

This exists because the April 24 human review flagged a recurring pattern:
UI-layer improvements were shipping without being validated end-to-end
against the ~70 policies already in the DB. Claims of "fix complete" were
landing on work that still produced the same symptom in production.

## When to run

Mandatory before committing any change to:

- `src/lib/ai/policy-extractor.ts`
- `src/lib/ai/policy-converter.ts`
- `src/lib/ai/turkish-utils.ts`
- `shared/field-aliases.ts`
- `src/lib/policy-evaluation/evaluator.ts`
- `src/lib/analysis/kasko-pilot-gate.ts`
- `src/components/PolicyDetailView/PolicyScoreSection.tsx`
- `src/components/PolicyDetailView/VehicleInfoCard.tsx`
- Anything that touches `aiConfidence`, `extractionIncomplete`, or the gate display.

Rule of thumb: if the change could affect what the Policy Detail screen
renders for make, model, year, confidence, grade, or the "Incomplete extraction"
banner — run the gate.

## Command

```bash
npm run qa:extraction
# equivalent:
npx tsx scripts/qa-extraction-quality.ts
```

### Options

- `--provider=anadolu`  — ilike filter on provider name, e.g. only Anadolu policies
- `--type=traffic`       — override default `kasko` filter
- `--limit=50`           — cap rows fetched (default 200)

### Required env

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Both live in `.env` locally. On Railway they are in the dashboard. The
script fails fast with a clear error if either is missing.

## Checks

| Check | Meaning | Fails on |
|---|---|---|
| `VEHICLE_COMPLETENESS` | For kasko policies: `make`, `model`, `year` all present and not "label-leak" values (`No`, `Hayır`, `-`). | Any missing field, or a label-leak value. |
| `CONFIDENCE_GATE_SYNC` | When the extraction gate fires (`extractionIncomplete` true), raw `aiConfidence` must be ≤ 0.65 OR the UI-side displayed-confidence cap must be wired. | Gate active AND raw aiConfidence > 0.65. |
| `GRADE_GATE_SYNC` | When the gate fires, `isProvisional` MUST be true so downstream UI conditionals engage. | Broken signal chain (gate active but `isProvisional` false). |

The 0.65 cap is defined in `INCOMPLETE_CONFIDENCE_CAP` in the script and in
`evaluator.ts`. Keep them in sync — if one moves, the other must too.

## Output

```
reports/qa-extraction-quality-<iso-timestamp>.csv   # one row per (policy × check)
reports/qa-extraction-quality-<iso-timestamp>.md    # aggregate summary + top offenders
```

The `reports/` directory is gitignored — these are local audit artefacts
that contain policy IDs and provider/policy-number pairs. Do not commit.

A stdout summary is printed at the end with pass counts and paths to the
written files. Exit code is non-zero when any check has ≥1 critical failure.

## Interpreting results

| Failure | Likely root cause |
|---|---|
| `VEHICLE_COMPLETENESS` critical on several Anadolu/Allianz policies | Extractor is not filling headline vehicle fields. Check the raw text storage, the LLM prompt, and the regex safety-net in `policy-converter.ts → convertToAnalyzedPolicy`. |
| `VEHICLE_COMPLETENESS` critical on one specific policy | Likely insurer format quirk. Reproduce with `qa-pdf-golden.test.ts` fixture and extend `shared/field-aliases.ts` aliases or `STOP_LABELS`. |
| `CONFIDENCE_GATE_SYNC` critical on many policies | Displayed-confidence cap not wired. The UI is rendering the raw confidence alongside the "Incomplete" banner — the exact contradiction the reviewer flagged. Fix in `evaluator.ts` (derive `displayedAiConfidence`) and swap the UI read sites. |
| `GRADE_GATE_SYNC` critical | Signal chain in `evaluator.ts:560-578` is broken. Do not ship any UI change until this is 100%. |

## Example workflow

```bash
# 1. Baseline before any fix
npm run qa:extraction
# note the pass rates

# 2. Make a targeted fix (e.g. backend vehicle safety-net)
# ...edit files...

# 3. Verify the relevant check moved
npm run qa:extraction
# confirm VEHICLE_COMPLETENESS pass rate rose

# 4. Only commit if the gate is green OR if the change is orthogonal
#    (e.g. a docs-only change that doesn't touch extraction).
git add . && git commit -m "..."
```

## Non-goals

- The script is **read-only** against the DB. It never writes to `policies`,
  `kasko_pilot_qa_records`, or any other table. Safe to run repeatedly.
- It does not call AI providers. It evaluates what's already stored in
  `raw_data`, so token cost is zero.
- It does not replace the golden PDF regression test
  (`src/lib/ai/__tests__/qa-pdf-golden.test.ts`) — that tests the regex
  layer on committed fixtures. This gate tests the full evaluator+display
  pipeline on real production data.

## Reference

- **ADR**: `docs/adr/020-backend-qa-gate-for-extraction-quality.md` — the "why", alternatives considered, and the manual-gate decision.
- Trigger list: `src/lib/analysis/kasko-pilot-gate.ts:430` (`evaluateSimpleDisplayMode`)
- Gate computation in evaluator: `src/lib/policy-evaluation/evaluator.ts:534-577`
- DB row → Policy hydration: `scripts/backfill-evaluation-scores.ts:15` (`reconstructPolicySafely`)
