# ADR-020: Backend QA Gate for Extraction-Quality Fixes

## Status
Accepted

## Context

On April 24, 2026 the same human reviewer flagged — for the fourth consecutive review cycle — that vehicle make/model/year fields were still missing on the Anadolu VW Tiguan policy. Each prior cycle had shipped a fix that "addressed" the problem, but the regression kept recurring in slightly different forms:

- v2: wrong value rendered (`Model: "No"`)
- v3: placeholder text rendered as coverage content
- v4: rows hidden entirely (looked intentional)

Underneath the specific bugs, the reviewer identified a meta-pattern: fixes were landing at the UI layer without being validated against the ~70 real policies already in the production database. The team could claim "fix complete" because the targeted unit test turned green, even while the systemic pattern the reviewer was watching (confidence % contradicting banners, letter grades displayed next to incomplete-extraction warnings, etc.) persisted on most other policies.

Three forces converged:

1. **No end-to-end validation against production data**. `qa-pdf-golden.test.ts` exercises 5 committed fixture PDFs at the regex layer; it does not call the evaluator or the display-mode gate, and it does not iterate the DB.
2. **No cross-cutting consistency check**. The evaluator computes `isProvisional`, `extractionIncomplete`, and raw `aiConfidence` independently. The UI reads each from different entry points. Nothing asserts that the values are internally coherent — e.g. "if the gate fires, raw confidence must not be rendered as 98%".
3. **Manual regression is slow and skippable**. Running the production app against 70 policies to eyeball each one is a 1+ hour manual loop that an agent under time pressure reliably skips.

The existing tooling could not catch these coherence bugs because each component was tested in isolation.

## Decision

We introduce a **backend QA gate** as a first-class engineering artefact — a class of Node-runnable scripts that iterate the production DB, drive the production evaluator + display logic, and assert cross-cutting consistency rules. The first instance is `scripts/qa-extraction-quality.ts` (runnable as `npm run qa:extraction`), checking three families:

| Check | Assertion |
|---|---|
| `VEHICLE_COMPLETENESS` | For kasko: `make`, `model`, `year` all present and not label-leak values (`No`, `Hayır`, `-`). |
| `CONFIDENCE_GATE_SYNC` | When `extractionIncomplete` fires, raw `aiConfidence` must be ≤ `INCOMPLETE_CONFIDENCE_CAP` (0.65) OR the displayed-confidence cap must be wired. |
| `GRADE_GATE_SYNC` | When the gate fires, `isProvisional` MUST be true — the downstream signal chain UI conditionals rely on. |

The script writes `reports/qa-extraction-quality-<timestamp>.{csv,md}` (gitignored — contains policy IDs + provider/policy-number pairs, local audit artefacts only) and exits non-zero when any check has ≥1 critical failure. This makes it composable as a CLI gate (`npm run qa:extraction && git commit ...`).

Operational rule codified as CLAUDE.md gotcha #102 and non-negotiable rule #15: before claiming any extraction-or-display fix as complete, run the gate and confirm the relevant check's pass rate moved.

### Scope boundaries

- **Read-only** against the DB. The script never writes to `policies`, `kasko_pilot_qa_records`, or any other table. Safe to run repeatedly.
- **Zero API cost**. Evaluates what's already stored in `raw_data`; does not call AI providers.
- **Complements, does not replace**, `qa-pdf-golden.test.ts`. The golden test validates the regex layer on committed PDF fixtures (which run in CI). The QA gate validates the full evaluator+display pipeline on real production data (which does not run in CI — Supabase service-role credentials are not CI-available).
- **Manual gate, not CI-enforced**. This choice is documented in the runbook and was confirmed with the operator during the planning phase. Adding it to CI would force Supabase service-role credentials into the CI environment; keeping it manual preserves the operator-as-gatekeeper model for one release cycle, to be revisited once signal quality is known.

### Alternatives Considered

1. **Add another unit-test fixture in `qa-pdf-golden.test.ts`**. Rejected — scaling to 70+ fixtures and running them in CI would inflate test runtime past the 10-minute budget (see `.cursorrules`). Also wouldn't cover the cross-cutting coherence checks (confidence sync, grade sync) because those require the full evaluator.
2. **Server-side runtime validation that blocks storing a policy with inconsistent state**. Rejected for this iteration — too aggressive; would generate Sentry noise on every edge-case extraction and would couple the database write path to display-mode logic. A future iteration may adopt this for specific rules once the QA gate identifies which rules are stable.
3. **CI-enforced gate with a throwaway Supabase-local instance**. Deferred — requires a Supabase fixture dataset and a local-docker setup that we don't currently maintain. Revisit once the manual gate proves it's surfacing useful failures.
4. **Wire the gate into the server's admin dashboard as a button**. Deferred — useful for non-engineer visibility, but adds scope. The CLI form is enough to enforce the engineering discipline now; the UI surface can follow.

## Consequences

**Positive**:
- Fixes claimed "complete" are provable against production data, not just fixtures. Failure modes that survive unit-test green now surface in the gate report.
- `INCOMPLETE_CONFIDENCE_CAP = 0.65` is exported from `evaluator.ts` and mirrored in the QA script — a drift between the two is itself a class of bug the gate would catch.
- New pattern established: when a cross-cutting consistency rule emerges (e.g. "draft policies must not render X"), adding a new check to the QA gate is now a well-understood move rather than an ad-hoc one-off.

**Negative / accepted**:
- Additional engineering discipline required. The next agent can still skip running the gate; the rule is convention, not enforced by the toolchain. We accept this cost in exchange for keeping CI free of Supabase credentials.
- Drift risk between `INCOMPLETE_CONFIDENCE_CAP` in `evaluator.ts` and `scripts/qa-extraction-quality.ts`. Mitigated by the comment on both constants pointing at each other and by the gate's `CONFIDENCE_GATE_SYNC` check (which would itself fail noisily if the cap moves in only one place).
- `reports/` directory is gitignored — audit history is local to the operator's machine. Acceptable for now; if we need historical drift tracking we can add a small uploader that pushes reports to a privileged Supabase table.

## Related

- Runbook: `docs/runbooks/07-qa-extraction-quality.md`
- Gotcha #102 (QA gate rule), #100 (displayedAiConfidence cap), #101 (isUnverified suppression) in `CLAUDE.md`
- Implementation: `scripts/qa-extraction-quality.ts`, `src/lib/policy-evaluation/evaluator.ts`
- Commit: `76b3abb` (initial ship), `83583ea` (path fix)
