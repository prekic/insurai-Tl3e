# KASKO Internal Pilot — Operating Specification

> **Status**: KASKO is internal-pilot-ready with mandatory human review. Not production-ready.

## Pilot Identity

| Parameter | Value |
|-----------|-------|
| Feature flag | `kasko_ai_extraction_pilot` |
| Branch | KASKO only |
| Environment | Internal / staging |
| Start date | Upon flag activation |
| Minimum duration | 2 weeks |
| Minimum samples | 20 real KASKO documents |

## Who Can Use the Pilot

- **Allowed**: Internal QA / reviewer team only
- **Max users**: 5
- **User segment**: `kasko_pilot_reviewers` (configured in feature flag `userSegments`)
- **Access**: Must be authenticated and in the allowed segment

## How Documents Enter the Pilot

1. User uploads a KASKO policy PDF through the normal upload flow
2. System detects branch = `kasko` (from extraction)
3. Feature flag `kasko_ai_extraction_pilot` is checked:
   - If **disabled**: extraction proceeds normally (no pilot behavior)
   - If **enabled** and user is in `kasko_pilot_reviewers` segment: pilot flow activates
4. PDF is processed through the full pipeline:
   - PDF → pdfjs-dist text extraction
   - Text → LLM structured extraction (gpt-4o-mini or configured model)
   - Extraction → normalization → validation → analysis → display interpreter
5. Results are tagged as `pilotReviewStatus: 'pending_review'`
6. Results are displayed with a **"Draft — Requires Human Review"** banner

## What Reviewers Must Check

See [KASKO_REVIEW_CHECKLIST.md](KASKO_REVIEW_CHECKLIST.md) for the full per-document checklist.

## Pass/Fail Per Document

| Outcome | Definition |
|---------|-----------|
| **Accepted** | All critical fields correct, no prohibited phrases, display mode appropriate |
| **Corrected (minor)** | 1–2 non-critical fields needed adjustment (e.g., formatting, date order) |
| **Corrected (major)** | Critical field wrong (policy#, premium, coverage missing/wrong, deductible wrong) |
| **Rejected** | Extraction fundamentally unusable, prohibited phrase leak, or wrong branch |

## When the Pilot Must Pause

The pilot **must pause immediately** if any of these occur:

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Zero-coverage extraction rate | >20% of documents | Pause, investigate extraction prompt |
| Prohibited phrase leak | Any occurrence | Pause, investigate display pipeline |
| Major correction rate | >50% of documents | Pause, evaluate extraction quality |
| Critical deductible/condition miss | Repeated (3+ consecutive) | Pause, review prompt + chunking |
| System error | Extraction crash or timeout | Pause, fix before resuming |

## Pilot Completion

The pilot completes when:
1. Minimum 20 documents processed AND
2. Minimum 2 weeks elapsed AND
3. No active pause triggers

At completion, evaluate against [KASKO_PILOT_SUCCESS_CRITERIA.md](KASKO_PILOT_SUCCESS_CRITERIA.md).
