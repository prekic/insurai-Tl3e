# KASKO Pilot — Phase 8L Evaluation Report

**Date**: March 27, 2026
**Evaluator**: Automated assessment based on live `kasko_pilot_qa_records` data
**Branch**: `claude/load-project-context-nqrry`
**Scope**: Evaluate pilot readiness for graduation from internal pilot to wider guarded pilot

---

## Executive Summary

The KASKO internal pilot has accumulated **22 QA records** from live production extractions. All records originate from a single document (`eriş ambalaj 34 rz 9511 kasko pol.pdf`, Anadolu Sigorta, 16 pages). **All blocking safety thresholds pass.** However, **document diversity is insufficient** for full graduation — all 22 records are from the same PDF, which limits confidence in cross-provider/cross-format robustness.

**Verdict: CONDITIONAL PASS — extend pilot with diverse documents before full graduation.**

---

## 1. Minimum Requirements

| Requirement | Threshold | Actual | Status |
|-------------|-----------|--------|--------|
| Documents reviewed | ≥ 20 | 22 | **PASS** |
| Pilot duration | ≥ 2 weeks | Mar 19 → Mar 27 (8 days) | **FAIL** (needs 6 more days) |
| Active pause triggers | 0 | 0 | **PASS** |

**Note**: The 2-week duration requirement is calendar-based. The pilot was first active on Mar 19. It needs to continue until at least Apr 2 before graduation.

---

## 2. Accuracy Metrics (Pilot-Eligible Docs Only)

All 22 records are classified as `pilot_eligible_clean`.

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Critical field accuracy rate | ≥ 80% | **~100%** (policyNumber: 1.0, provider: 1.0, dates: 1.0, premium: 1.0) | **PASS** |
| Eligible-doc acceptance rate | ≥ 60% | **Indeterminate** — `reviewer_outcome` is `pending_review` for all 22 records (no human reviewer has formally accepted/rejected) | **BLOCKED** |
| Eligible-doc major correction rate | ≤ 30% | **0%** (`major_correction = false` for all 22) | **PASS** |
| Ineligible-doc rejection rate | ≥ 90% | **N/A** — no ineligible docs submitted yet | **UNTESTED** |

### Issue: No Formal Reviewer Verdicts
All 22 records have `reviewer_outcome: 'pending_review'`. The pilot gate marks extractions as requiring human review and shows the DRAFT banner, but **no reviewer has formally accepted or corrected any record**. The acceptance rate metric cannot be evaluated without reviewer verdicts.

**Action Required**: At least 12 of the 22 records (60%) need a reviewer to mark them as `accepted` or `corrected_minor` to satisfy the blocking acceptance rate threshold.

---

## 3. Extraction Quality (Pilot-Eligible Docs Only)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Avg coverages per eligible doc | ≥ 2 | **9.0** | **PASS** |
| Zero-coverage extraction rate | ≤ 20% | **0%** (0 of 22) | **PASS** |
| Conditional deductible capture | ≥ 40% | **0%** (`has_conditional_deductible = false` for all) | Non-blocking |
| Special condition capture | ≥ 50% | **Indeterminate** from QA records | Non-blocking |

### Quality Strengths
- Consistent 9 coverages extracted across all runs
- Confidence score stable at 0.9625
- Zero extraction failures

### Quality Observations
- `has_conditional_deductible = false` across all records, yet the UI shows "Conditional / requires review" for deductible. This suggests the QA record field isn't being populated even when conditional deductibles are detected. Related to the `display_mode: 'unknown'` issue.
- `has_rayic_deger = false` in QA records, but the UI shows "Vehicle Market Value" coverage. Same population gap.

---

## 4. Display Safety (All Docs)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Prohibited phrase leak count | 0 | **0** (`phrase_clean = true` for all 22) | **PASS** |
| Rollback triggers fired | 0 | **0** | **PASS** |
| Quote-link adequacy (≥1 source quote) | ≥ 70% | **Indeterminate** (`source_quote_count = 0` for all) | Non-blocking |
| Mode distribution — `full` | ≤ 80% | **N/A** (`display_mode = 'unknown'` for all) | Non-blocking |
| Mode distribution — `restricted`/`human_review` | ≥ 10% | **N/A** | Non-blocking |

### Issue: `display_mode` Not Populated
All 22 records have `display_mode: 'unknown'`. The `review-thresholds.ts` logic computes display modes but the result is not being threaded into the QA record persistence path. This means the mode distribution safety metrics cannot be evaluated.

### Issue: `source_quote_count` Always Zero
The evidence linking pipeline generates source quotes in the UI (visible as "View Source Quote" buttons), but the count isn't being captured in the QA record.

---

## 5. Rollback Trigger Status

| Trigger | Threshold | Actual | Status |
|---------|-----------|--------|--------|
| Zero-coverage rate | > 20% | **0%** (0/22) | **CLEAR** |
| Prohibited phrase leak | Any occurrence | **0** | **CLEAR** |
| Major correction rate | > 50% | **0%** (0/22) | **CLEAR** |
| Consecutive deductible misses | ≥ 3 | **0** | **CLEAR** |

**All rollback triggers clear.** The pilot has never been in a pause-worthy state.

---

## 6. Reviewer Feedback

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Average review time | ≤ 15 min | **0 min** (no formal reviews completed) | **UNTESTED** |
| Common correction category | Not a critical field | **N/A** | **UNTESTED** |

---

## 7. Diversity Assessment

| Dimension | Coverage | Assessment |
|-----------|----------|------------|
| Unique documents | 1 of recommended 20 | **INSUFFICIENT** |
| Unique providers | 1 (Anadolu Sigorta) | **INSUFFICIENT** |
| Document types | Standard commercial kasko only | **INSUFFICIENT** |
| Page range tested | 16 pages (1 document) | Narrow |
| OCR challenge level | Clean digital PDF (Document AI) | No noisy/scanned docs tested |

The Batch 2 Plan (`docs/KASKO_PILOT_BATCH_2_PLAN.md`) specifies a target mix of:
- 5x standard passenger (clean/moderate)
- 3x commercial heavy vehicles
- 2x high-value/specialty
- 3x noisy/edge cases
- 2x multi-vehicle fleet

**Current state covers only 1 of these 5 categories.**

---

## 8. QA Record Field Population Gaps

Several QA record fields are not being populated despite the UI showing the corresponding data:

| Field | QA Value | UI Shows | Gap |
|-------|----------|----------|-----|
| `display_mode` | `'unknown'` | DRAFT banner visible | Not wired |
| `has_rayic_deger` | `false` | "Vehicle Market Value" | Not wired |
| `has_conditional_deductible` | `false` | "Conditional / requires review" | Not wired |
| `source_quote_count` | `0` | Multiple "View Source Quote" links | Not wired |
| `reviewer_outcome` | `'pending_review'` | No review UI exists | Missing feature |
| `review_time_minutes` | `0` | N/A | Missing feature |

These gaps don't affect extraction safety but they reduce the fidelity of pilot metrics reporting.

---

## 9. Graduation Scorecard

### Blocking Criteria

| # | Criterion | Target | Result | Verdict |
|---|-----------|--------|--------|---------|
| 1 | Documents reviewed ≥ 20 | ≥ 20 | 22 | **PASS** |
| 2 | Pilot duration ≥ 2 weeks | ≥ 14 days | 8 days | **FAIL** |
| 3 | Active pause triggers = 0 | 0 | 0 | **PASS** |
| 4 | Critical field accuracy ≥ 80% | ≥ 80% | ~100% | **PASS** |
| 5 | Acceptance rate ≥ 60% | ≥ 60% | Untested (no reviews) | **BLOCKED** |
| 6 | Major correction rate ≤ 30% | ≤ 30% | 0% | **PASS** |
| 7 | Ineligible rejection ≥ 90% | ≥ 90% | Untested (no ineligible docs) | **UNTESTED** |
| 8 | Avg coverages ≥ 2 | ≥ 2 | 9.0 | **PASS** |
| 9 | Zero-coverage rate ≤ 20% | ≤ 20% | 0% | **PASS** |
| 10 | Phrase leaks = 0 | 0 | 0 | **PASS** |
| 11 | Rollback triggers = 0 | 0 | 0 | **PASS** |

**Result: 8 PASS, 1 FAIL (duration), 2 BLOCKED/UNTESTED**

---

## 10. Recommendations

### Immediate Actions (before graduation)

1. **Continue pilot for 6 more days** — to satisfy the 2-week minimum duration (until Apr 2, 2026)
2. **Upload diverse KASKO PDFs** — target at least 5 unique documents from different providers (Allianz, AXA, Mapfre, etc.) to validate cross-format extraction
3. **Complete reviewer verdicts** — formally accept/reject at least 12 records to satisfy the 60% acceptance rate threshold. This requires either:
   - Adding a reviewer verdict UI (button on policy detail page to mark accepted/corrected/rejected), OR
   - Manually updating `reviewer_outcome` via SQL for the existing records

### Code Fixes (non-blocking, improve metrics fidelity)

4. **Wire `display_mode`** into QA record persistence — read from `review-thresholds.ts` evaluation result
5. **Wire `has_rayic_deger`** — check `isMarketValue` flag on primary coverage during QA record creation
6. **Wire `has_conditional_deductible`** — check `conditionalDeductibles` array presence
7. **Wire `source_quote_count`** — count evidence entries with non-empty quotes
8. **Fix processing log PATCH 404** — investigate route/table ID mismatch

### Post-Graduation (wider guarded pilot)

9. **Expand to 10–20 users** once all blocking criteria pass
10. **Include noisy/scanned PDFs** to test OCR pipeline under degraded conditions
11. **Monitor rollback triggers weekly** via admin endpoint

---

## 11. Conclusion

The KASKO pilot demonstrates **excellent extraction safety and quality** on the tested document. The AI pipeline consistently produces high-confidence (0.9625) extractions with 9 coverages, zero prohibited phrase leaks, and zero rollback trigger violations across 22 runs.

**However, graduation is blocked by:**
1. Duration shortfall (8/14 days)
2. No formal reviewer verdicts recorded
3. Single-document coverage (no diversity validation)

**Recommendation: EXTEND pilot with diverse documents. Target graduation date: April 5, 2026** (allows time for diverse uploads + 2-week duration + reviewer verdicts).
