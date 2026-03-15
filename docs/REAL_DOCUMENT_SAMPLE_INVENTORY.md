# Real-Document Sample Inventory

## Inventory Date: 2026-03-15

> [!WARNING]
> Real policy PDF availability is limited. Only KASKO has actual PDFs in the repository. Other branches use document-realistic synthetic samples inspired by actual Turkish policy document formats found in `sample-documents.ts`.

## Source Classification

| Source | Type | Branches | Location |
|--------|------|----------|----------|
| `sample-kasko-policy.pdf` | Real PDF (121 KB) | KASKO | `test-data/` |
| `eriş ambalaj 34 rz 9511 kasko pol .pdf` | Real PDF (562 KB) | KASKO | `test-data/` |
| `test-policy.pdf` | Real PDF (e2e fixture) | Unknown | `e2e/fixtures/` |
| `TURKISH_KASKO_CLEAN_DIGITAL` | Document text fixture | KASKO | `sample-documents.ts` |
| `TURKISH_TRAFFIC_ZMSS` | Document text fixture | Traffic | `sample-documents.ts` |
| `TURKISH_HEALTH_POLICY` | Document text fixture | Health | `sample-documents.ts` |
| `POOR_QUALITY_DOCUMENT` | Document text fixture | Unknown | `sample-documents.ts` |
| `realistic-samples.ts` (Phase 7) | Synthetic ExtractedPolicyData | All 8 branches | `__tests__/` |

## Per-Branch Sample Inventory

### KASKO (5 samples)
| Sample ID | Source | Quality | Page Count | Redaction | Notes |
|-----------|--------|---------|------------|-----------|-------|
| RD-KAS-001 | `sample-kasko-policy.pdf` | Clean digital | Full | N/A | Real PDF — 121KB |
| RD-KAS-002 | `eriş ambalaj...pdf` | Clean digital | Full | N/A | Real PDF — 562KB, commercial vehicle |
| RD-KAS-003 | `TURKISH_KASKO_CLEAN_DIGITAL` | Clean digital text | Full | Synthetic names | Realistic fixture with full Turkish text |
| RD-KAS-004 | Document-realistic synthetic | Noisy OCR | Partial | Synthetic | Simulates OCR artifacts on real format |
| RD-KAS-005 | Document-realistic synthetic | Moderate | Full | Synthetic | Simulates moderate-quality scan |

### Traffic (3 samples)
| Sample ID | Source | Quality | Page Count | Redaction | Notes |
|-----------|--------|---------|------------|-----------|-------|
| RD-TRF-001 | `TURKISH_TRAFFIC_ZMSS` | Clean digital text | Full | Synthetic names | Realistic fixture with statutory limits |
| RD-TRF-002 | Document-realistic synthetic | Noisy | Partial | Synthetic | OCR artifacts, partial limits |
| RD-TRF-003 | Document-realistic synthetic | Moderate | Full | Synthetic | Standard ZMSS format |

### Home (3 samples)
| Sample ID | Source | Quality | Page Count | Redaction | Notes |
|-----------|--------|---------|------------|-----------|-------|
| RD-HOM-001 | Document-realistic synthetic | Clean | Full | Synthetic | Building + contents split |
| RD-HOM-002 | Document-realistic synthetic | Noisy | Partial | Synthetic | Missing building class |
| RD-HOM-003 | Document-realistic synthetic | Moderate | Full | Synthetic | Average clause ambiguity |

### Health (4 samples)
| Sample ID | Source | Quality | Page Count | Redaction | Notes |
|-----------|--------|---------|------------|-----------|-------|
| RD-SAG-001 | `TURKISH_HEALTH_POLICY` | Clean digital text | Full | Synthetic names | Realistic fixture |
| RD-SAG-002 | Document-realistic synthetic | Clean | Full | Synthetic | Inpatient/outpatient split |
| RD-SAG-003 | Document-realistic synthetic | Noisy | Partial | Synthetic | Missing network info |
| RD-SAG-004 | Document-realistic synthetic | Moderate | Full | Synthetic | Pre-existing condition exclusion |

### Life (3 samples)
| Sample ID | Source | Quality | Page Count | Redaction | Notes |
|-----------|--------|---------|------------|-----------|-------|
| RD-HAY-001 | Document-realistic synthetic | Clean | Full | Synthetic | Death benefit + rider |
| RD-HAY-002 | Document-realistic synthetic | Noisy | Partial | Synthetic | Missing beneficiary |
| RD-HAY-003 | Document-realistic synthetic | Moderate | Full | Synthetic | Contestability edge case |

### DASK (3 samples)
| Sample ID | Source | Quality | Page Count | Redaction | Notes |
|-----------|--------|---------|------------|-----------|-------|
| RD-DSK-001 | Document-realistic synthetic | Clean | Full | Synthetic | Standard DASK format |
| RD-DSK-002 | Document-realistic synthetic | Noisy | Partial | Synthetic | Missing building class |
| RD-DSK-003 | Document-realistic synthetic | Moderate | Full | Synthetic | At statutory cap |

### Business (3 samples)
| Sample ID | Source | Quality | Page Count | Redaction | Notes |
|-----------|--------|---------|------------|-----------|-------|
| RD-BIZ-001 | Document-realistic synthetic | Clean | Full | Synthetic | Property + BI + liability |
| RD-BIZ-002 | Document-realistic synthetic | Noisy | Partial | Synthetic | Missing BI period |
| RD-BIZ-003 | Document-realistic synthetic | Moderate | Full | Synthetic | Warranty conditions |

### Nakliyat (3 samples)
| Sample ID | Source | Quality | Page Count | Redaction | Notes |
|-----------|--------|---------|------------|-----------|-------|
| RD-NAK-001 | Document-realistic synthetic | Clean | Full | Synthetic | ICC(A) + W2W |
| RD-NAK-002 | Document-realistic synthetic | Noisy | Partial | Synthetic | Missing ICC |
| RD-NAK-003 | Document-realistic synthetic | Moderate | Full | Synthetic | Route-specific conditions |

## Summary

| Branch | Total | Real PDF | Text Fixture | Doc-Realistic Synthetic | Confidence Level |
|--------|:-----:|:--------:|:------------:|:----------------------:|:---------------:|
| KASKO | 5 | 2 | 1 | 2 | **High** |
| Traffic | 3 | 0 | 1 | 2 | **Moderate** |
| Home | 3 | 0 | 0 | 3 | **Limited** |
| Health | 4 | 0 | 1 | 3 | **Moderate** |
| Life | 3 | 0 | 0 | 3 | **Limited** |
| DASK | 3 | 0 | 0 | 3 | **Limited** |
| Business | 3 | 0 | 0 | 3 | **Limited** |
| Nakliyat | 3 | 0 | 0 | 3 | **Limited** |
| **Total** | **27** | **2** | **3** | **22** | — |
