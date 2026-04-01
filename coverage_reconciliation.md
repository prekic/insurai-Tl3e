# Coverage Truth Reconciliation: Specimen 1680600025

## Root Cause Analysis of Discrepancies
The discrepancy between the re-extracted payload and the final output arises from two different extraction architectures acting on the same 60,000-character document:
1. **Legacy Pipeline (`raw_data.coverages`)**: Used a multi-stage, table-aware parser that accurately preserved row-column alignments but used an older JSON schema that completely omitted `insuredPerson` and specific date boundaries.
2. **Re-extraction Script (`raw_data.coverage`)**: Used a single-shot `gpt-4o-mini` generic prompt which successfully extracted the missing identity headers by grasping context, but hallucinated table mappings when flattened over 60K characters (a classic LLM table-shifting failure).

| Field / Coverage | Legacy `raw_data` | Re-extracted Payload | Final ReviewerSummary | Authoritative Source | Reason |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hukuksal Koruma** | 80,000 | 4,000 | 80,000 | Legacy | Re-extraction misaligned the table rows and lost the 80k limit |
| **Anadolu Hizmet** | 0 (Dahil) | 80,000 | Dahil | Legacy | Re-extraction erroneously shifted the 80k limit from Hukuksal Koruma down to Roadside Assistance |
| **Kişisel Eşya (Theft)** | Kişisel Eşya (5,000) | Theft / Hırsızlık (5,000) | Kişisel Eşya | Legacy | Re-extraction misclassified "Personal Belongings" simply as "Theft" |
| **Insured Person** | *Missing* | ERİŞ AMBALAJ... | ERİŞ AMBALAJ... | Re-extraction | Legacy schema did not request this field |
| **Period / Dates** | *Missing* | 28.12.2025 - 2026 | 28.12.2025 - 2026 | Re-extraction | Legacy schema loosely handled dates |
| **Exclusions** | 4 items | 0 items | 4 items | Legacy | Re-extraction prompt skipped exclusions |
| **Insights** | 8 items | 0 items | 8 items | Legacy | Re-extraction prompt skipped insights |

## Decision & Rule
**Rule: Legacy Tabular Data Remains Authoritative; Re-Extraction Hydrates Headers Only.**
Because the older multi-stage pipeline was structurally superior for tables (`coverages`) and domain rules (`exclusions`, `insights`), **legacy data remains authoritative for all arrays**.
The single-shot re-extraction `gpt-*` payload is strictly utilized to backfill **identity and header missingness** (`insuredPerson`, `startDate`, `expiryDate`).

## Fix Resolution
1. **Persistence Update**: The hallucinated `coverage` object from the re-extraction script has been ignored by the reviewer mapping, but to prevent ongoing confusion, `coverage` from the re-extraction is dropped from being the source of truth entirely.
2. **Reviewer-summary Fix**: Currently, `generate_real_specimen_proof.ts` is organically defaulting to `data.raw_data.coverages` anyway due to the "OR" statement, meaning our final output is *already internally consistent* with the legacy rule. We will formalize this mapping behavior.
