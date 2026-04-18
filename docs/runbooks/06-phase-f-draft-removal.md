# Runbook: Phase F — Draft-Label Removal (SKELETON)

> **Status**: SKELETON — not yet ready for execution. Phase F is the next
> operational phase after Phase E E2 (100% rollout). Thresholds and exact
> procedures will be finalized once Phase E has produced enough data.
>
> This file exists so when the trigger hits, there's a known location for
> the runbook rather than an improvised document.

## Context

Phase E advances KASKO pilot extraction to 100% rollout but **keeps the
"UNVERIFIED AI OUTPUT / TASLAK" label** on every extraction. Every policy is
treated as a draft requiring reviewer acceptance before export/share paths
open up (gotcha #24 `draftExportBlocked()` stays closed).

Phase F lifts that label: trusted pilot extractions flow through the full
reviewer output path (export allowed, share allowed, no DRAFT banner) IF
and only IF specific quality guardrails still hold.

This is a significant trust upgrade — it effectively declares that the AI
pipeline has earned production-grade confidence for the kasko branch.

---

## 1. Entry Criteria — **TBD until Phase E data is in**

Placeholder criteria (final values will be tuned based on what Phase E
actually produces — these are starting points):

| # | Criterion | Rationale | Target (provisional) |
|---|-----------|-----------|---------------------:|
| 1.1 | Phase E E2 (100%) has soaked with zero rollback triggers | No fresh systemic errors | **14 consecutive days** |
| 1.2 | Pilot QA record count since E2 started | Meaningful sample | **≥ 100 records** |
| 1.3 | Reviewer acceptance rate (outcome `accepted` or `corrected_minor`) | Reviewers mostly agree with AI | **≥ 95%** |
| 1.4 | Zero prohibited-phrase leaks | Safety rail holds | **≥ 30 days** |
| 1.5 | Grade-threshold calibration run with `--production` since Phase E E2 | Thresholds reflect production scale | **at least once** |
| 1.6 | No `coverageContradiction` flags on pilot QA records | Extraction self-consistency holds | **< 2% of records** |
| 1.7 | `aiConfidence` floor (post-penalty) on Phase E records | Confidence post-processing is stable | **≥ 0.80 median** |

**Do not proceed until all provisional criteria are met. If any row ends
up relaxed or tightened, document the decision inline.**

---

## 2. Rollout Pattern — **TBD**

Options to decide based on Phase E data:

### Option A — Binary Flip
Single feature flag `kasko_draft_label_removed` (default false). Flip to
true → all Phase E extractions stop showing the DRAFT banner. Simple but
high-blast-radius; if quality regresses, every policy is affected.

### Option B — Segment-Based Gradual
Add a new segment `kasko_full_trust` (like `kasko_pilot_reviewers`). Only
users in this segment see the lifted label. Lower blast radius; requires
operators to maintain a second segment.

### Option C — Per-Policy Trust Score
Lift the label only when per-policy confidence thresholds hold (e.g.
`aiConfidence ≥ 0.85` AND zero resolver warnings AND extraction model
verified against a golden). Leaves low-confidence extractions in DRAFT
even after Phase F.

**Recommendation (subject to Phase E data)**: Option C + Option A fallback.
Individual policies can lift the label when per-policy trust is high, AND
operators can force-flip the global flag if they want an explicit cutover.

---

## 3. Implementation Scope — **TBD**

Concrete code sites that will need changes (based on current flow):

- `src/lib/analysis/kasko-pilot-gate.ts:200-212` — `evaluateKaskoPilotGate()`
  currently always returns `requiresHumanReview: true` + `isDraft: true`
  when the pilot is active. Phase F introduces a decision point that can
  return `isDraft: false` under specific conditions.
- `src/components/PolicyDetailView.tsx:1105-1119` — the UNVERIFIED banner
  (now labeled in FIX-1 this session) gates on `isUnverified`. Phase F
  needs a new derivation path that treats pilot-produced-and-trusted
  differently from pilot-produced-but-pending-review.
- `src/lib/analysis/display-interpreter.ts` — `displaySummary.isDraft`
  consumers (gotcha #24 `draftExportBlocked()`).
- `src/lib/ai/policy-extractor.ts:1916` — the field `isDraft` on
  `AnalyzedPolicy` (populated from `displaySummary?.isDraft`) will gate
  whether export/share paths open. Phase F relaxes this condition.

---

## 4. Advance Procedure — **TBD**

Dry-run first in a staging environment:

1. Confirm all entry criteria — use `SELECT` queries from Appendix A.
2. Make the chosen option's code change on a feature branch.
3. Deploy to staging. Verify DRAFT label lifts for trusted extractions
   and stays on for anything that fails the per-policy trust check.
4. Open PR for production. Require 2 code-owner approvals.
5. Deploy. Monitor `/api/admin/monitoring/pilot-rollback-status` +
   reviewer acceptance rate for 7 days.

---

## 5. Rollback Protocol — **TBD (draft)**

If any rollback trigger fires post-Phase-F, OR reviewer acceptance rate
drops below 90% within 7 days:

1. Revert the Phase F feature flag (or whichever gate was flipped).
2. DRAFT banner returns for all policies immediately (no restart required).
3. Investigate via `SELECT` queries in Appendix A.
4. Do not re-advance until the rollback cause is remediated AND soak
   window is clean again.

---

## 6. Export/Share Expansion — **TBD**

Current behavior (`draftExportBlocked()`): export routes (PDF/CSV/Excel)
and share routes are closed for drafts. Phase F opens these for non-draft
policies.

Consider whether Phase F should also:
- Re-enable comparison across pilot and pre-pilot policies (`ComparePolicies`
  currently shows TASLAK badges on drafts — gotcha #24)
- Lift the benchmark suppression warning for commercial vehicles that
  have accumulated enough real-world data since Phase E
- Enable TSB commercial benchmarks (separate data-ingest task)

---

## Appendix A — Provisional SQL Queries

### A.1 Reviewer acceptance rate since Phase E E2 start
```sql
-- Replace :e2_start_date with the ISO date when rollout hit 100%
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE reviewer_outcome IN ('accepted', 'corrected_minor')) AS accepted,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE reviewer_outcome IN ('accepted', 'corrected_minor'))
    / NULLIF(COUNT(*), 0),
    1
  ) AS acceptance_rate_pct
FROM kasko_pilot_qa_records
WHERE counted_in_pilot_metrics = true
  AND review_date >= :e2_start_date;
```

### A.2 Confidence median since Phase E E2
```sql
SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY confidence_score) AS median_confidence,
  percentile_cont(0.1) WITHIN GROUP (ORDER BY confidence_score) AS p10_confidence
FROM kasko_pilot_qa_records
WHERE counted_in_pilot_metrics = true
  AND review_date >= :e2_start_date;
```

### A.3 Prohibited-phrase leak count
```sql
SELECT
  COUNT(*) FILTER (WHERE NOT phrase_clean) AS leak_count,
  MAX(review_date) FILTER (WHERE NOT phrase_clean) AS last_leak_date
FROM kasko_pilot_qa_records
WHERE counted_in_pilot_metrics = true;
```

---

## Open Questions (to answer with Phase E data)

1. What's the actual reviewer acceptance rate pattern during Phase E?
   (Drives whether 95% is realistic or optimistic.)
2. Does per-policy trust correlate more strongly with `aiConfidence`,
   resolver warning count, or `correctionCategories`?
3. Should Phase F be kasko-only or extend to traffic/dask branches
   at the same time? (Currently only kasko has a pilot infrastructure.)

---

## Related Files

- `docs/runbooks/04-phase-e-production-scaleup.md` — the preceding phase
- `src/lib/analysis/kasko-pilot-gate.ts` — gate logic
- `src/components/PolicyDetailView.tsx:1105-1119` — UNVERIFIED banner
- `src/lib/analysis/display-interpreter.ts` — `isDraft` logic
- `scripts/calibrate-grade-thresholds.ts` — `--production` / `--auto-production`
