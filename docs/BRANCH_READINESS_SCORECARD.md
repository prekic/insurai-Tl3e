# Branch Readiness Scorecard

## Assessment Date: 2026-03-15
## Validation Basis: 23 realistic synthetic samples (NOT real policy PDFs)

> [!CAUTION]
> No branch has been validated against real policy document extraction. All classifications below are based on pipeline validation with synthetic samples that simulate messy extraction output. True production-readiness requires real-document extraction validation.

## Readiness Classification

| Branch | Clean | Noisy | Contradictory | Edge | Pipeline OK | Display OK | Prohibited Phrase OK | Human Review OK | Classification |
|--------|:-----:|:-----:|:------------:|:----:|:-----------:|:----------:|:-------------------:|:--------------:|---------------|
| KASKO | ✅ | ✅ | — | — | ✅ | ✅ | ✅ | ✅ | **Pilot-only** |
| Traffic | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-only** |
| Home | ✅ | ✅ | ⚠️ DEF-006 | — | ✅ | ✅ | ✅ | ⚠️ | **Pipeline-complete, not rollout-ready** |
| Health | ✅ | ✅ | ⚠️ DEF-009 | — | ✅ | ✅ | ✅ | ⚠️ | **Pipeline-complete, not rollout-ready** |
| Life | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-only** |
| DASK | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | **Pilot-only** |
| Business | ✅ | ✅ | ⚠️ DEF-010 | — | ✅ | ✅ | ✅ | ⚠️ | **Pipeline-complete, not rollout-ready** |
| Nakliyat | ✅ | ✅ | ⚠️ DEF-008 | — | ✅ | ✅ | ✅ | ⚠️ | **Pipeline-complete, not rollout-ready** |

## Classification Definitions

| Classification | Meaning |
|---------------|---------|
| **Production-ready** | Real-document validated, all defects resolved, safe for live users |
| **Production-ready with guardrails** | Real-document validated, minor defects only, safe with feature flags |
| **Pilot-only** | Pipeline validated on synthetic data, no open critical defects, safe for internal testing |
| **Pipeline-complete, not rollout-ready** | Pipeline works but open defects in contradiction detection or human-review thresholds |
| **Not ready** | Pipeline incomplete or critical failures |

## Open Defects by Branch

| Branch | Open Defects | Critical | Medium | Low |
|--------|:----------:|:--------:|:------:|:---:|
| KASKO | 0 | 0 | 0 | 0 |
| Traffic | 0 | 0 | 0 | 0 |
| Home | 1 (DEF-006) | 0 | 1 | 0 |
| Health | 1 (DEF-009) | 0 | 1 | 0 |
| Life | 0 | 0 | 0 | 0 |
| DASK | 0 | 0 | 0 | 0 |
| Business | 1 (DEF-010) | 0 | 1 | 0 |
| Nakliyat | 1 (DEF-008) | 0 | 1 | 0 |
| Cross-cutting | 1 (DEF-007) | 0 | 0 | 1 |

## Honest Limitations

1. **No branch is production-ready.** No real policy PDFs have been extracted and validated.
2. **Pilot-only branches** (KASKO, traffic, life, DASK) have no open defects on synthetic data, but extracting real documents might expose extraction-level issues not covered here.
3. **Contradiction detection gap** (DEF-006/008/009/010) affects home, health, business, nakliyat. The validator does not scan for logically contradictory special conditions, allowing `full` display mode when `restricted` would be safer.
4. **Source quote availability** depends on LLM extraction quality and cannot be pipeline-guaranteed.
