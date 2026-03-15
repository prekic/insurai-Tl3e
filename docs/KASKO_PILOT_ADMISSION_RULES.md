# KASKO Pilot Document Admission Rules

## Overview
During the KASKO internal pilot, it is critical to separate the core AI extraction performance from document-ingestion failures (e.g., garbled OCR, missing pages, or completely unrelated documents). High rejection rates on fundamentally unusable documents should not artificially depress the pilot's success metrics for valid policies.

Therefore, every document processed in the pilot is classified through the **Admission Gate** BEFORE its performance is counted toward the pilot's graduation criteria.

---

## Admission Status Classifications

Documents are placed into one of four admission statuses:

### 1. `pilot_eligible_clean`
The document is a complete, clear, and unambiguous KASKO policy.
- **Characteristics**: High text density, standard provider name, clearly identifiable policy number, full coverage details present.
- **Metric Inclusion**: **YES**. Fully counts toward all pilot success & accuracy metrics.

### 2. `pilot_eligible_moderate`
The document is a valid KASKO policy but has minor quality issues (e.g., slight OCR noise, missing non-critical pages, or non-standard formatting).
- **Characteristics**: Understandable text, provider identifiable (even if obscure), policy number present, coverages extractable but perhaps poorly formatted.
- **Metric Inclusion**: **YES**. Fully counts toward all pilot success & accuracy metrics.

### 3. `pilot_ineligible_noisy`
The document is severely degraded, garbled by OCR, or entirely unreadable by the machine.
- **Characteristics**: Low text density, character garbage (e.g., "Ìst@nbul %%%"), completely broken formatting preventing any structural understanding.
- **Metric Inclusion**: **NO**. Excluded from pilot quality metrics. (Still tracked for overall pipeline safety metrics to ensure noisy docs fall into `human_review_required` or `restricted`).

### 4. `pilot_ineligible_incomplete`
The document is readable but lacks the fundamental characteristics of a complete KASKO policy, or isn't a KASKO policy at all.
- **Characteristics**: Missing critical pages (e.g., page 1 only), missing provider name entirely (or generic "Sigorta A.Ş."), missing policy number, or contains 0 coverages despite clean text.
- **Metric Inclusion**: **NO**. Excluded from pilot quality metrics. (Still tracked for safety/rejection behavior).

---

## Programmatic Admission Criteria

The Admission Gate utility (`evaluatePilotAdmission`) applies the following logical checks to the raw text and extracted data to determine status:

1. **Length / Density Check**:
   - If raw extracted text is `< 500 characters`, FAIL admission (`pilot_ineligible_noisy` or `incomplete`).
   - If character-to-page density is extremely low, FAIL.

2. **Provider Reliability**:
   - If provider is missing or equal to generic fallbacks (e.g., "Sigorta A.Ş."), FAIL admission (`pilot_ineligible_incomplete`), as it lacks trustable branding.

3. **Core Identifiers**:
   - If `policyNumber` is missing or contains extensive OCR garbage (e.g., `??`), FAIL admission (`pilot_ineligible_incomplete`).

4. **Coverage Sufficiency**:
   - If `coverages.length === 0` and the text is short/partial, FAIL admission (`pilot_ineligible_incomplete`).

5. **Quality Downgrade**:
   - If the document passes the above but has known markers of moderate OCR noise or partial data (but remains viable), downgrade to `pilot_eligible_moderate`.
   - Otherwise, classify as `pilot_eligible_clean`.

---

## Metric Impact

When tracking KASKO Pilot success:
- **Safety Metrics** (phrase leaks, rollback triggers) apply to **ALL** documents, eligible or not.
- **Quality Metrics** (acceptance rate, major correction rate, critical field accuracy) apply **ONLY** to documents labeled `pilot_eligible_clean` or `pilot_eligible_moderate`.

This ensures we measure the AI's actual extraction capability on valid policies, rather than punishing the AI for failing to extract a policy from a blank or garbled page.
