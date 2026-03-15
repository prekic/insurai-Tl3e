# Branch Parity Matrix — KASKO Reference

## Scoring Key
- ✅ Full parity with KASKO reference
- ⚠️ Partial — exists but needs hardening
- ❌ Missing — needs implementation
- N/A — not applicable to this branch

## Parity Table

| Dimension | KASKO | Traffic | Home | Health | Life | DASK | Business | Nakliyat |
|---|---|---|---|---|---|---|---|---|
| Universal schema mapping | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Extraction prompt quality | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Evidence map quality | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Ambiguity handling | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ClauseGraph support | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Condition/carve-out support | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Validator coverage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Branch-specific scoring | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Branch-specific insights | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Display-safe summary gen | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Wording governance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Source quote support | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Restricted/human-review | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Golden tests | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Why ⚠️ Not ❌ for Some Items

- **Extraction prompts**: Detailed prompts exist for all branches, but they have not been validated against real documents nor do they have runtime branch-specific extraction logic.
- **Evidence/clauseGraph/source quotes**: The universal pipeline processes these for all branches equally — they work but aren't tuned for branch-specific clause structures.
- **Display-safe summary**: The interpreter is branch-agnostic — it generates cards for any branch, but doesn't produce branch-specific card categories (e.g., "building vs contents" for home).
- **Wording governance / restricted modes**: Fully universal — same prohibited phrases and threshold logic apply to all branches equally.

## Implementation Order Recommendation

| Priority | Branch | Reason |
|---|---|---|
| 1 | **Traffic** | Simplest structure, statutory minimums, clear rules |
| 2 | **DASK** | Statutory product, narrow scope, well-defined rules |
| 3 | **Home** | Common branch, moderate complexity, underinsurance risk |
| 4 | **Health** | Complex but well-structured, waiting periods and copay logic |
| 5 | **Business** | High complexity, BI/liability separation critical |
| 6 | **Life** | Moderate complexity, rider conditionality |
| 7 | **Nakliyat** | Highest complexity, ICC basis, route/packaging dependencies |
