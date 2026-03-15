# Branch Readiness Scorecard

## Assessment Date: 2026-03-15 (Post Phase 7A Remediation)
## Validation Basis: 23 realistic synthetic samples (NOT real policy PDFs)

> [!CAUTION]
> No branch has been validated against real policy document extraction. All classifications below are based on pipeline validation with synthetic samples that simulate messy extraction output. True production-readiness requires real-document extraction validation.

## Readiness Classification

| Branch | Clean | Noisy | Contradictory | Edge | Pipeline OK | Display OK | Prohibited Phrase OK | Human Review OK | Contradiction OK | Classification |
|--------|:-----:|:-----:|:------------:|:----:|:-----------:|:----------:|:-------------------:|:--------------:|:---------------:|---------------|
| KASKO | ✅ | ✅ | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-ready** |
| Traffic | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-ready** |
| Home | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-ready** |
| Health | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-ready** |
| Life | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-ready** |
| DASK | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-ready** |
| Business | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-ready** |
| Nakliyat | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-ready** |

## Classification Definitions

| Classification | Meaning |
|---------------|---------|
| **Production-ready** | Real-document validated, all defects resolved, safe for live users |
| **Production-ready with guardrails** | Real-document validated, minor defects only, safe with feature flags |
| **Pilot-ready** | Pipeline validated on synthetic data, all known defects resolved, safe for internal pilot testing |
| **Pipeline-complete, not rollout-ready** | Pipeline works but open defects in contradiction detection or human-review thresholds |
| **Not ready** | Pipeline incomplete or critical failures |

## Phase 7A Changes

| Defect | Status | Fix Applied |
|--------|--------|-------------|
| DEF-006 (home) | **Fixed** | `detectConditionContradictions()` → average_clause pattern |
| DEF-008 (nakliyat) | **Fixed** | `detectConditionContradictions()` → icc_conflict pattern |
| DEF-009 (health) | **Fixed** | `detectConditionContradictions()` → copay + waiting_period patterns |
| DEF-010 (business) | **Fixed** | `detectConditionContradictions()` → bi_indemnity_conflict + alarm_warranty patterns |
| DEF-007 (all) | **Acknowledged** | Not a pipeline defect — quote availability depends on LLM extraction |

## Open Defects by Branch

| Branch | Open | Critical | Medium | Low |
|--------|:----:|:--------:|:------:|:---:|
| All branches | 0 | 0 | 0 | 0 |
| Cross-cutting | 1 (DEF-007) | 0 | 0 | 1 |

## Honest Limitations

1. **No branch is production-ready.** No real policy PDFs have been extracted and validated.
2. **Pilot-ready** means all known safety defects are resolved on synthetic data. Real-document extraction may expose extraction-level issues.
3. **Source quote availability** depends on LLM extraction quality and cannot be pipeline-guaranteed.
4. **Contradiction detector** covers 9 known pattern types. Real documents may contain novel contradiction forms not covered.
