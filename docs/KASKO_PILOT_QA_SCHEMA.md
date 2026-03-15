# KASKO Pilot QA — Structured Logging Schema

## Per-Document QA Record

Each reviewed pilot document produces one QA record with these fields:

```typescript
interface KaskoPilotQARecord {
  // Identification
  documentId: string          // Unique sample ID (e.g., "PILOT-KASKO-001")
  filename: string            // Original PDF filename
  reviewDate: string          // ISO 8601
  reviewerUserId: string      // Internal reviewer ID

  // Extraction Outcome
  extractionSuccess: boolean  // Did LLM extraction produce valid JSON?
  extractionModel: string     // e.g., "gpt-4o-mini"
  textCharCount: number       // Chars extracted from PDF
  pageCount: number           // Pages in PDF
  extractionTimeMs: number    // Time for full extraction pipeline

  // Reviewer Verdict
  reviewerOutcome: 'accepted' | 'corrected_minor' | 'corrected_major' | 'rejected'
  reviewTimeMinutes: number   // How long human review took

  // Admissibility & Pilot Constraints (Phase 8I)
  admissionStatus: 'pilot_eligible_clean' | 'pilot_eligible_moderate' | 'pilot_ineligible_noisy' | 'pilot_ineligible_incomplete'
  admissionReason: string
  countedInPilotMetrics: boolean // True only if pilot_eligible_*


  // Correction Categories (if corrected)
  correctionCategories: Array<
    | 'policy_number'
    | 'provider'
    | 'dates'
    | 'premium'
    | 'coverage_count'
    | 'coverage_detail'
    | 'deductible'
    | 'conditional_deductible'
    | 'special_conditions'
    | 'endorsements'
    | 'exclusions'
    | 'unlimited_handling'
    | 'rayic_deger'
    | 'service_type'
    | 'display_mode'
    | 'prohibited_phrase'
    | 'other'
  >

  // Critical Field Accuracy
  criticalFieldsMissed: string[]  // List of missed critical fields

  // Display Pipeline
  displayMode: 'full' | 'restricted' | 'human_review_required'
  triggersFired: string[]         // e.g., ["ZERO_COVERAGES_EXTRACTED"]
  phraseClean: boolean            // No prohibited phrases in output?
  foundProhibitedPhrases: string[] // If any leaked

  // Extraction Quality Metrics
  coverageCountExtracted: number
  specialConditionCount: number
  hasRayicDeger: boolean
  hasConditionalDeductible: boolean
  sourceQuoteCount: number
  confidenceScore: number         // LLM-reported confidence

  // Rollback Trigger Counters (running totals at time of review)
  runningZeroCoverageRate: number  // % of docs with 0 coverages so far
  runningMajorCorrectionRate: number // % of docs needing major correction
  runningPhrasesLeaked: number     // Total prohibited phrase leaks so far

  // Notes
  reviewerNotes: string
}
```

## Storage

During the internal pilot, QA records should be:
1. **Primary**: Saved as JSON to a pilot-specific Supabase table or local file
2. **Backup**: Appended to `/tmp/kasko-pilot-qa-log.jsonl` (one JSON line per record)

## Aggregation Queries

After the pilot, aggregate these metrics:

| Metric | Query |
|--------|-------|
| Overall acceptance rate | `count(accepted) / total` |
| Major correction rate | `count(corrected_major) / total` |
| Most common correction | `mode(correctionCategories)` |
| Average review time | `avg(reviewTimeMinutes)` |
| Coverage extraction rate | `avg(coverageCountExtracted)` |
| Conditional deductible capture | `count(hasConditionalDeductible=true) / total` |
| Phrase leak count | `sum(runningPhrasesLeaked)` |
| Mode distribution | `groupBy(displayMode)` |
