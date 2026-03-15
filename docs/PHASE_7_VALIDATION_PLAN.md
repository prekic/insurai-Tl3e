# Phase 7 — Validation Plan

## Baseline

| Item | Value |
|------|-------|
| Baseline commit | `9671fd7` (Phase 6B) |
| Branch | `insuraigemini202603151438` |
| Pipeline status | All 7 branches pipeline-complete, none production-ready |
| Real PDFs available | 1 (KASKO only: `test-data/sample-kasko-policy.pdf`) |
| Real non-KASKO PDFs | **0** — no traffic, home, health, life, dask, business, or nakliyat PDFs exist in the repository |

## Validation Strategy

> [!IMPORTANT]
> No real non-KASKO policy PDFs exist in this repository. The validation dataset will use **realistic synthetic `ExtractedPolicyData` samples** that simulate messy/incomplete extraction output — NOT clean handcrafted fixtures. This is explicitly a gap: true production-readiness requires real-document extraction.

### Realistic Synthetic Samples vs. Golden Fixtures

The existing golden fixtures (`branch-golden-datasets.ts`) are clean, well-formed data. Real extraction output is messy:
- Missing fields, null limits, empty coverage names
- Mixed Turkish/English in free-text conditions
- Partial OCR artifacts in text
- Confidence scores below threshold
- Contradictory conditions
- Missing pages / incomplete documents

**Realistic synthetic samples** will include:
1. **Clean extraction** — similar to golden, but with minor gaps (1 sample per branch)
2. **Noisy extraction** — missing fields, low confidence, partial data (1 sample per branch)
3. **Contradictory extraction** — conflicting limits/conditions, OCR artifacts (1 per high-risk branch: home, health, business, nakliyat)
4. **Edge case** — statutory-only traffic, DASK at cap ceiling, life with no beneficiary, etc.

### Validation Scope

For each sample, the validation harness will record:
1. Normalizer effect (tags added, fields classified)
2. Validator outcome (pass/fail, which rules triggered)
3. Analysis bundle (scores, insights, benchmarks)
4. Display interpreter output (cards, top summary, display mode)
5. Prohibited phrase suppression check
6. Human-review threshold check

### Branch Coverage Target

| Branch | Clean | Noisy | Contradictory | Edge | Total |
|--------|:-----:|:-----:|:-------------:|:----:|:-----:|
| KASKO | 1 | 1 | 0 | 0 | 2 |
| Traffic | 1 | 1 | 0 | 1 | 3 |
| Home | 1 | 1 | 1 | 0 | 3 |
| Health | 1 | 1 | 1 | 0 | 3 |
| Life | 1 | 1 | 0 | 1 | 3 |
| DASK | 1 | 1 | 0 | 1 | 3 |
| Business | 1 | 1 | 1 | 0 | 3 |
| Nakliyat | 1 | 1 | 1 | 0 | 3 |
| **Total** | **8** | **8** | **4** | **3** | **23** |

## Deliverables

1. `docs/REAL_DOCUMENT_VALIDATION_MATRIX.md` — sample descriptions + expected values
2. `src/lib/analysis/__tests__/validation-harness.test.ts` — validation runner
3. `src/lib/analysis/__tests__/realistic-samples.ts` — realistic synthetic dataset
4. `docs/REAL_DOCUMENT_DEFECT_LOG.csv` — defect log
5. `docs/BRANCH_READINESS_SCORECARD.md` — per-branch readiness
6. `docs/CONTROLLED_ROLLOUT_GATES.md` — feature flags and rollout plan

## Honest Limitation Statement

This validation phase validates the **downstream pipeline** (normalizer → validator → analysis → display interpreter) on realistic but synthetic extraction output. It does NOT validate:
- LLM extraction prompt accuracy per branch
- Real PDF OCR quality handling
- Real-world field format variation
- Actual production document diversity

**True production-readiness requires real-document extraction validation, which is blocked on real policy PDF availability per branch.**
