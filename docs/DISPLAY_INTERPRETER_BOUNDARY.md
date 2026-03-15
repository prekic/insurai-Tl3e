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
| `Included` / `Dahil` (coverage state) | Must use `applySafeWording` | ⚠️ Acceptable if factual boolean |
