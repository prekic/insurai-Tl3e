# Phase 5 — Display Interpreter Boundary Contract

## Precise Architecture Rule

> **The display interpreter is the sole source for interpreted consumer-facing wording
> and summary conclusions. Raw structural data may still be shown in clearly
> non-interpretive inspection views.**

## What MUST Come From `DisplaySafePolicySummary`

Any text shown to the end user that:
- **Summarizes** coverage scope (e.g. "Market value protection", "Coverage subject to conditions")
- **Interprets** limits (e.g. what "unlimited" means, what "0 deductible" means)
- **Classifies** coverage quality (e.g. "good", "strong", "weak", "fully covered")
- **Compares** to benchmarks (e.g. "above market average", "competitive premium")
- **Warns** or **advises** (e.g. "possible gap", "consider upgrading", "claim reduction risk")
- **Labels** confidence states (e.g. "confirmed from policy", "unclear — needs review")
- **Describes** exclusion impact (e.g. "critical exclusion", "standard clause")
- Uses any **prohibited phrase**: "unlimited", "no deductible", "fully covered",
  "tam kapsamlı", "guaranteed", "full protection", "total coverage", "muafiyetsiz",
  "sınırsız", "tamamen kapsar", "free towing", "fully compliant",
  "your vehicle's full value will be paid", "aracınızın tam değeri ödenir"

## What MAY Still Come From Raw `AnalyzedPolicy`

Any text shown to the end user that is **transparent structural/raw inspection**:
- Policy number, dates, insured name
- Numeric premium amount (via `formatConverted`)
- Raw coverage row names (as extracted from the document)
- Raw clause/condition text (exact wording from the insurance document)
- Raw exclusion text (exact wording)
- Numeric score values (e.g. evaluation score `85/100`)
- Coverage boolean state: included/not included (factual, not interpretive)
- Evidence quotes (verbatim from source document)
- Policy type, status badges
- File metadata

## Component-Specific Boundary Rules

### PolicyCard.tsx — Structural/Numeric Only

PolicyCard renders **exclusively** structural and numeric data:
- `policy.provider` — company name (structural)
- `policy.policyNumber` — document number (structural)
- `policy.logo` — emoji icon (structural)
- `policy.type` / `policy.typeTr` — enum label from `POLICY_TYPES` (structural)
- `policy.status` → `getStatusLabel()` — enum-derived label (structural)
- `policy.coverage` → `formatConverted()` — numeric amount (numeric)
- `policy.premium` → `formatConverted()` — numeric amount (numeric)
- `policy.expiryDate` → `formatDate()` — date (structural)
- `evaluation.grade` — letter grade A–F (numeric/enum)
- `evaluation.overallScore` — numeric 0–100 (numeric)
- `evaluation.scoreBreakdown` — numeric breakdown (numeric)

PolicyCard does **NOT** access: `policy.aiInsights`, `policy.marketComparison`,
`policy.coverages[].isUnlimited`, `policy.exclusions`, or any interpreted wording.
It does **NOT** import `useDisplaySafeSummary`, `applySafeWording`, or any display interpreter module.

**No display interpreter needed. No change required.**

### ComparePolicies.tsx — Structural Comparison Output

ComparePolicies uses the evaluation engine (`comparator.ts`) for all displayed content:
- **Metrics**: numeric values via `formatConverted()` (premiums, coverage, ratios)
- **Coverage matrix**: boolean included/not-included + numeric limits via `formatConverted()`
- **Score bars**: numeric percentage widths
- **Rankings**: numeric rank positions (e.g. "#1 (85)")
- **Tradeoff advantage text**: factual dimensional labels ("Lower premium", "Higher coverage")
- **Recommendation text**: score-cited structural conclusions ("X has highest overall score 85/100")

**Why this is NOT policy-content interpretation:**
Tradeoff/recommendation text is derived from measurable numeric dimensions
(premium amount, coverage amount, value ratio, overall score) and always cites
the score. It does not interpret what a policy covers, what its limits mean,
or whether the coverage is adequate. It compares policies against each other
on numeric axes.

ComparePolicies does **NOT** access: `policy.aiInsights`, `policy.marketComparison`,
or any interpreted wording about individual policy content.

**No display interpreter needed. No change required.**

### PolicyDetailView.tsx — Mixed (Both Interpreter + Raw Inspection)

**Interpreter-guarded sections** (all pass through `applySafeWording`):
- `formatCoverageLimit()` — all output
- `getCoverageInfoText()` — `t.policy.paidByMarketValue`, `t.policy.noUpperLimit`
- Sub-limit `t.global.unlimited`
- AI insights display text (mobile + desktop)
- Text export (coverages unlimited + AI insights)

**Transparent raw inspection sections** (correctly raw):
- Coverage names (extracted from document)
- Exclusion text (verbatim from document)
- Evidence quotes (verbatim)
- Numeric premium, dates, policy number

### AIInsightsPanel.tsx — Fully Interpreter-Driven

All consumer-facing output comes from `DisplaySafePolicySummary`:
- `keyCoverageCards`, `conditionalRestrictionCards`, `missingOrUnclearCards`
- `benchmarkCards` (with `app_benchmark` statement type)

### SharedResult.tsx — Fully Interpreter-Driven

All consumer-facing output comes from `DisplaySafePolicySummary`:
- `keyCoverageCards`, `missingOrUnclearCards`, `claimReductionRiskCards`
- `protectionBasisCard`

## Boundary Examples

| Display Text | Source | Compliant? |
|---|---|---|
| `₺150,000` (coverage limit) | Raw `formatConverted` | ✅ Yes — numeric |
| `Unlimited` | Must use `applySafeWording` | ❌ if raw |
| `Market Value` as a limit label | Must use `applySafeWording` | ❌ if raw |
| `Ferdi Kaza` (coverage name) | Raw coverage name | ✅ Yes — structural |
| `Good coverage` | Must come from interpreter | ❌ if invented |
| `Alkollü araç kullanımı` (exclusion text) | Raw clause text | ✅ Yes — verbatim |
| `Critical exclusion` (severity label) | Interpretation layer | Acceptable if from `analyzeExclusionsComprehensive` |
| `Score: 85/100` | Raw score | ✅ Yes — numeric |
| `✓ All main coverages included` | Must come from interpreter | ❌ if raw `aiInsights` |
| `Included` / `Dahil` (coverage state) | Boolean state | ⚠️ Acceptable — factual |
| `Lower premium` (ComparePolicies tradeoff) | Score-derived comparison | ✅ Yes — structural |
| `X has highest overall score (85/100)` | Score-cited recommendation | ✅ Yes — structural |
