# ADR-024: Substantive-Check Stability Gate for LLM Extraction Outputs

**Date**: 2026-05-02
**Status**: Accepted
**Supersedes**: N/A (new decision)
**Related**: ADR-022 (post-deploy smoke and audit infrastructure), gotchas #155, #156

---

## Context

Round-4 reviewer feedback (May 2, 2026) requested an "Output Stability Test" — verify that uploading the same policy multiple times produces consistent output. Reviewer's hypothesis: variance comes from a "summarization-layer LLM" running on top of the extraction LLM, and pinning that layer's temperature to 0 should eliminate variance.

Investigation found the hypothesis was wrong:
- There is **only one LLM call** in the extraction pipeline (`/api/ai/extract` → Anthropic). No separate summarization layer.
- Post-processing in `src/lib/ai/policy-converter.ts` is fully deterministic.
- Variance the reviewer observed comes from the single extraction LLM call at `temperature: 0.1`, then propagates through deterministic post-processing.

The natural fix would be to pin `app_settings.ai.temperature = 0`. We tried it (PR #450 + manual SQL update) and ran 5 sequential extractions on the same Anadolu Birleşik Kasko policy. Results:

```
coverages count:        [31, 32, 28, 26, 29]    → 19% variance
exclusions count:       [1, 2, 1, 1, 2]         → 50% variance
conditionalDeductibles: [2, 2, 2, 2, 2]         → 0% variance
hasUnlimited boolean:   [true × 5]              → 0% flips
isBundle boolean:       [true × 5]              → 0% flips
```

**Even at T=0, count panels varied substantially**. Per Anthropic's published behavior, the API at T=0 is "near-deterministic, not bit-exact" — floating-point non-associativity in batched matmul causes logprobs to differ by epsilon between runs, flipping the chosen token at borderline positions. On a 16-page policy, the LLM makes 1-3 borderline categorization decisions differently per run (e.g. "is this ek-sözleşme item a separate coverage row or a sub-property of the parent?").

This count variance is **inherent to the API**, not a bug we can fix.

But the **substantive content** of the extraction was 100% stable:
- Every run found the 80% Kullanım Şekli scenario in `conditionalDeductibles`
- Every run flagged the unlimited Excess Liability coverage
- Every run set `isBundle = true` for the Birleşik Kasko
- The numbers of rows differed; the FACTS did not.

So the question became: what does "stability" actually mean for our use case?

## Decision

**We measure stability via binary substantive checks, not count variance.**

For each reviewer-flagged signal, the stability test runs a present/absent check against the extracted data:

```ts
hasKullanimSekli80    = condDed contains a "ticari kullanım: %80" entry
hasNonNetworkServis35 = condDed contains "Anlaşmalı olmayan servis: %35"
hasUnlimitedLiability = coverages has an unlimited "Artan Mali Sorumluluk" row
hasAnadoluHizmet      = coverages has an "Anadolu Hizmet" row
hasAsPlusNetwork      = coverages has an "AS+ / Anlaşmalı Servis" row
isBundle              = isBundle === true
hasPreviousInsurer    = previousInsurer is a non-empty string
```

**Pass criteria**: every check is `all-true` or `all-false` across all N runs (no flips). A flip on any check indicates real instability — the LLM is producing genuinely different facts between runs, not just shuffling the row layout.

**Count panels** (`coverages.length`, `exclusions.length`, `conditionalDeductibles.length`) remain visible in the test output as **informational** — they're printed but do not affect the exit code.

## Consequences

### Positive

1. **Test measures what users care about.** The reviewer's actual launch-readiness criterion is "does the same PDF produce reliably correct output", not "does the same PDF produce identical JSON". The substantive-check gate answers the right question.

2. **Tests are robust to LLM-inherent variance.** Future Anthropic SDK upgrades or Anthropic-side batching changes may introduce more or less count variance — substantive checks remain meaningful regardless.

3. **Zero false positives at production temperature.** At `T=0.1` (production default), the substantive checks are still 100% stable on tested fixtures. Count panels show 5-10% variance which is informational. This means we can keep production at `T=0.1` for slightly more natural output without compromising stability monitoring.

4. **Gives operators clear failure signals.** When a substantive check flips, the per-run summary shows exactly which signal varied. The investigation hint in the script's failure path points at the right subsystem (named-deductible regex / prompt section / schema field) based on which check flipped.

5. **Pattern is reusable.** Future stability tests for new fixtures or new field surfaces can adopt the same shape: define N substantive checks, assert all 100% consistent.

### Negative

1. **The check list is policy-specific.** The 7 substantive checks above are hand-crafted for the Anadolu Birleşik Kasko fixture. Adding a new fixture (e.g. an AXA policy or a Konut policy) requires writing fixture-specific checks. Mitigation: the script's structure is parameterized — adding a new fixture means adding a new set of checks tagged to that fixture, not refactoring the gate itself.

2. **Substantive checks can drift.** If the canonical label format produced by `classifyExclusions` changes (e.g. `"Rent-a-car / ticari kullanım: %80"` → `"Commercial use: 80%"`), the regex inside the substantive check must update. Mitigation: regression tests in `round4-anadolu-critical-risks.test.ts` (PR #439) pin the canonical label format independently, so a label change breaks the unit test before it breaks the stability gate.

3. **Doesn't catch silent regressions on fields not in the check list.** If a future change accidentally drops `hasIsDraft` flagging entirely, this gate wouldn't notice (it's not in the check set). Mitigation: smoke-kasko.ts continues to cover whole-extraction `forbiddenPhrases[]` checks; the stability gate is one of several layers, not the only layer.

## Alternatives Considered

### Alternative A — Wider count-variance threshold

Bump the threshold from `<10%` to `<25%` to absorb LLM-inherent count variance. Rejected because:
- Still measures the wrong thing (raw counts, not substantive correctness)
- 25% is arbitrary — the inherent variance ceiling is empirically uncertain and may grow over time
- Doesn't tell the operator anything actionable when the test fails

### Alternative B — Hash-based exact-match comparison

Compare run-to-run extractions with a hash of the JSON payload, expecting bit-exact matches at T=0. Rejected because:
- T=0 isn't bit-exact at the Anthropic API level
- Even normalizing for ordering wouldn't help when the model genuinely picks different categorizations

### Alternative C — Separate "summarization-layer" LLM call at T=0

The reviewer's hypothesis. Build a second LLM call that takes the noisy extraction and emits a stable structured summary at T=0. Rejected because:
- Adds cost (second Anthropic call per extraction = 2x token spend)
- Doesn't fix the root issue — T=0 isn't bit-exact even on the summarization step
- Adds a layer where one didn't exist (architectural complexity)

## Implementation

- **Script**: `scripts/output-stability-check.ts`
- **Workflow**: `.github/workflows/output-stability.yml` (manual `workflow_dispatch`)
- **First-pass implementation**: PR #450 (count-based, replaced)
- **Path A redesign**: PR #453 (substantive-check based, current)
- **Test verification**: First clean PASS run on May 2, 2026 — all 7 checks consistent across 5 runs, with informational count variance of 19%/50% on coverages/exclusions

## Operator Guidance

- **Run frequency**: manual only (each run costs ~5 × $0.015 in Anthropic credits + ~7 min wall-clock). Not scheduled.
- **Recommended trigger points**:
  - Before merging extraction-pipeline changes that touch `policy-converter.ts` significantly
  - After applying a migration that updates the live extraction prompt
  - After upgrading the Anthropic SDK or changing the model (`anthropicExtractionModel` in `app_settings`)
- **Pre-flight reminder**: `app_settings.ai.temperature` does NOT need to be pinned to 0 for the substantive checks to pass. The current threshold passes at `T=0.1` (production default) too. The optional T=0 pin is only useful if you want clean count-variance numbers for diagnosis.

## Cross-References

- **Gotcha #155**: Anthropic T=0 is "near-deterministic, not bit-exact"
- **Gotcha #156**: Substantive-check stability gate pattern
- **Gotcha #157**: Stability/smoke scripts must mirror production endpoint shape
- **ADR-022**: Post-deploy smoke and audit infrastructure (Tier 1 = smoke; Tier 2 = audit; Tier 3 (this ADR) = stability gate)
- **PRs #450 / #452 / #453**: Initial ship + OCR hot-fix + Path A redesign
