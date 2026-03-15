# KASKO — Model Comparison Plan

## Objective

Compare the current extraction model (`gpt-4o-mini`) against a stronger alternative on the same KASKO documents to determine whether model upgrade would meaningfully improve extraction quality.

## Current Baseline

| Metric | gpt-4o-mini (Phase 8D/8E) |
|--------|---------------------------|
| Coverage count | 1–4 per doc (variable) |
| Conditional deductible capture | Inconsistent (~50%) |
| Special condition capture | Improved with chunking but variable |
| Cost per extraction | ~$0.001–0.003 |
| Latency | 15–45 seconds |

## Candidate Models

| Model | Rationale |
|-------|-----------|
| `gpt-4o` | Higher accuracy, structured output support, 2–3× cost |
| `claude-sonnet-4-20250514` | Strong at document analysis, good Turkish support |

## Document Set

Use the same 3 documents from Phase 8D/8E plus any pilot documents:

| ID | File | Pages | Chars |
|----|------|-------|-------|
| KASKO-PDF-001 | sample-kasko-policy.pdf | 11 | 44,470 |
| KASKO-PDF-002 | eriş ambalaj kasko.pdf | 16 | 62,459 |
| KASKO-PDF-003 | test-policy.pdf | 1 | 118 |
| PILOT-* | Pilot documents (when available) | varies | varies |

## Fields to Compare

For each document × model, compare:

| Field | Comparison |
|-------|-----------|
| coverageCount | Exact count |
| coverageNames | Set overlap |
| conditionalDeductible | Present (y/n) + text quality |
| specialConditionCount | Count |
| policyNumber | Exact match |
| premium | Exact match |
| rayicDeger | Correct (y/n) |
| confidence | Self-reported score |
| latency | End-to-end seconds |
| cost | Estimated token cost |

## Acceptance Criteria for Model Upgrade

Upgrade to a stronger model if:
1. Coverage count improves by ≥30% on average
2. Conditional deductible capture improves to ≥70%
3. Special condition count improves by ≥50%
4. No new prohibited phrase leaks introduced
5. Cost increase is ≤5× per extraction

## When to Trigger

Run the model comparison when:
- Pilot has processed ≥10 documents
- Major correction rate exceeds 30%
- OR conditional deductible capture rate is below 40%

## Execution

Modify `scripts/kasko-real-pdf-extraction.ts` to accept a `--model` flag:
```bash
npx tsx scripts/kasko-real-pdf-extraction.ts --model gpt-4o
npx tsx scripts/kasko-real-pdf-extraction.ts --model claude-sonnet-4-20250514
```

Compare results in `/tmp/kasko-extraction-results-{model}.json`.
