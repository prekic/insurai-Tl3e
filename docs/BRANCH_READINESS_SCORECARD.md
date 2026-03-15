# Branch Readiness Scorecard — Post Phase 8B

> **Last updated**: Phase 8B remediation pass
> **Based on**: 27 document-realistic synthetic samples + 23 Phase 7 validation samples

## Readiness Classification

| Branch    | Pipeline Complete | Phrase Clean | Mode Correct | Pilot-Ready (guarded) | Production-Ready |
|-----------|:-----------------:|:------------:|:------------:|:---------------------:|:----------------:|
| kasko     | ✅ | ✅ | ✅ | ✅ (real-PDF E2E evidence) | ❌ |
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

## Phase 8C — KASKO Real-Document Validation (Additional Evidence)

| Sample | Source | Description | Mode | Phrases | Coverages | Triggers |
|--------|--------|-------------|------|---------|-----------|----------|
| REAL-DOC-001 | Golden FAIL-001 text | Complex KASKO: conditional deductibles, rayiç değer, sınırsız İMM, cam kırılması network/non-network | full | ✅ | 5 | 0 |
| REAL-DOC-002 | Integration schema | Clean KASKO: 4 coverages, high confidence | full | ✅ | 4 | 0 |
| REAL-DOC-003 | OCR-quality partial | Noisy: 1 coverage, 35% confidence, missing fields | human_review_required | ✅ | 1 | 3 |

### KASKO-Specific QA Checks
- ✅ Rayiç değer (market value) correctly detected and displayed
- ✅ Conditional deductible (25 yaş / %2) preserved in special conditions
- ✅ Sınırsız (unlimited) İMM suppressed from display output
- ✅ Cam kırılması network vs non-network distinction preserved
- ✅ Source quotes available for ≥3 claim-relevant coverages
- ✅ OCR-quality partial correctly escalated to human_review_required

### KASKO Readiness Classification
**Internal-pilot-ready with guardrails** — elevated from synthetic-only evidence based on real-document-derived validation.

## Phase 8D — KASKO Real-PDF Extraction Validation (End-to-End)

| PDF | File | Size | Pages | Chars | LLM | Policy# | Premium | Covs | Rayiç | Mode | Phrases | Quotes |
|-----|------|------|-------|-------|-----|---------|---------|------|-------|------|---------|--------|
| KASKO-PDF-001 | sample-kasko-policy.pdf | 118K | 11 | 44,470 | gpt-4o-mini | 101450719 | 2,599 | 4 | ✅ | full | ✅ | 4 |
| KASKO-PDF-002 | eriş ambalaj 34 rz 9511 kasko pol.pdf | 549K | 16 | 62,459 | gpt-4o-mini | 1680600025 | 31,140 | 4 | ✅ | full | ✅ | 4 |
| KASKO-PDF-003 | test-policy.pdf | 0.7K | 1 | 118 | gpt-4o-mini | KSK-2026-001234 | 15,000 | 0 | ❌ | full | ✅ | 0 |

### Phase 8D Findings
- ✅ PDF text extraction works for both digital and mixed-content PDFs using pdfjs-dist
- ✅ LLM extraction (gpt-4o-mini) successfully extracts policy number, provider, branch, premium, coverages
- ✅ No prohibited phrase leakage in any real-PDF extraction run
- ⚠️ DEF-EX-001: Conditional deductible text present in PDF-001 but not captured by LLM
- ⚠️ DEF-EX-002: Special conditions missed in PDF-002 (truncation from 62K→30K chars)
- ⚠️ DEF-EX-003: Minimal PDF fixture (0 coverages) still gets `full` display mode

### Updated KASKO Readiness
**Internal-pilot-ready with guardrails** — now backed by real E2E PDF→LLM→pipeline evidence. 3 open extraction-stage findings logged (non-blocking for pilot with guardrails).
