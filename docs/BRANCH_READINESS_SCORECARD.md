# Branch Readiness Scorecard — Post Phase 8B

> **Last updated**: Phase 8B remediation pass
> **Based on**: 27 document-realistic synthetic samples + 23 Phase 7 validation samples

## Readiness Classification

| Branch    | Pipeline Complete | Phrase Clean | Mode Correct | Pilot-Ready (guarded) | Production-Ready |
|-----------|:-----------------:|:------------:|:------------:|:---------------------:|:----------------:|
| kasko     | ✅ | ✅ | ✅ | ✅* | ❌ |
| traffic   | ✅ | ✅ | ✅ | ✅* | ❌ |
| home      | ✅ | ✅ | ✅ | ✅* | ❌ |
| health    | ✅ | ✅ | ✅ | ✅* | ❌ |
| life      | ✅ | ✅ | ✅ | ✅* | ❌ |
| dask      | ✅ | ✅ | ✅ | ✅* | ❌ |
| business  | ✅ | ✅ | ✅ | ✅* | ❌ |
| nakliyat  | ✅ | ✅ | ✅ | ✅* | ❌ |

> **✅***: Pilot-ready with guardrails means: human-review mode is active for all moderate/noisy samples, prohibited phrases are suppressed, and display-safe boundaries are enforced. This was validated against document-realistic synthetic samples only — **no real PDF extraction has been tested end-to-end yet**.

## What "Pilot-Ready with Guardrails" Means
- Display boundaries enforced (no prohibited phrases leak)
- Moderate-confidence samples (0.60–0.75) automatically get `restricted` mode
- Low-confidence samples with multiple warnings escalate to `human_review_required`
- Contradiction detection active on all branches
- All display output passes through suppression/sanitization
- Human review guardrails remain active

## What "Not Production-Ready" Means
- No real PDF documents have been processed end-to-end through the pipeline
- Only 2 KASKO PDFs exist in the codebase; no PDFs for other branches
- Synthetic samples, even document-realistic ones, are NOT the same as real extractions
- No load testing, latency benchmarking, or integration testing has been done
- Feature flags not yet deployed to production infrastructure

## Post-Phase 8B Pilot Validation Results

| Branch   | Samples | Phrase Clean | Mode Safety |  Avg Safety |
|----------|:-------:|:----------:|:-----------:|:-----------:|
| kasko    | 5       | ✅          | 5/5         | 4.6         |
| traffic  | 3       | ✅          | 3/3         | 5.0         |
| home     | 3       | ✅          | 3/3         | 5.0         |
| health   | 4       | ✅          | 4/4         | 5.0         |
| life     | 3       | ✅          | 3/3         | 4.7         |
| dask     | 3       | ✅          | 3/3         | 5.0         |
| business | 3       | ✅          | 3/3         | 5.0         |
| nakliyat | 3       | ✅          | 3/3         | 4.7         |
