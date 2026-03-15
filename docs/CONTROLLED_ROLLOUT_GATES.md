# Controlled Rollout Gates

## Branch-by-Branch Feature Flags

| Branch | Feature Flag | Default | Rollout Audience | Monitoring Metrics | Rollback Trigger | Human-Review Fallback | Sample Size Before Expansion |
|--------|-------------|---------|-----------------|-------------------|-----------------|---------------------|------------------------------|
| KASKO | `ff_kasko_analysis` | **ON** | All users (existing) | Error rate, display mode dist, suppressed phrase count | Error rate > 5% or any prohibited phrase leak | Restrict to human_review_required | Already live (reference) |
| Traffic | `ff_traffic_analysis` | OFF | Internal only | Pipeline completion rate, display mode dist | Any crash or prohibited phrase leak | Disable flag | 50 real policies |
| Life | `ff_life_analysis` | OFF | Internal only | Pipeline completion, beneficiary detection rate | Beneficiary miss > 20% | Disable flag | 30 real policies |
| DASK | `ff_dask_analysis` | OFF | Internal only | Pipeline completion, statutory cap detection | Cap detection fail > 10% | Disable flag | 30 real policies |
| Home | `ff_home_analysis` | OFF | Internal only | Pipeline completion, contradiction detection (after DEF-006 fix) | Contradiction leak > 5% | Disable flag | 50 real policies |
| Health | `ff_health_analysis` | OFF | Internal only | Pipeline completion, copay/network detection, contradiction rate | Copay miss > 15% or contradiction leak | Disable flag | 50 real policies |
| Business | `ff_business_analysis` | OFF | Internal only | Pipeline completion, BI detection, warranty detection | BI miss > 10% or warranty contradiction | Disable flag | 30 real policies |
| Nakliyat | `ff_nakliyat_analysis` | OFF | Internal only | Pipeline completion, ICC detection, W2W detection | ICC miss > 15% or ICC conflict undetected | Disable flag | 20 real policies |

## Recommended Rollout Order

1. **KASKO** — already live, reference branch
2. **Traffic** — simplest (statutory, well-defined limits), no open defects
3. **DASK** — simple structure, statutory, no open defects
4. **Life** — straightforward death benefit structure, no open defects
5. **Home** — after DEF-006 fix (contradiction detection)
6. **Health** — after DEF-009 fix (copay/waiting contradiction detection)
7. **Business** — after DEF-010 fix (BI/warranty contradiction detection)
8. **Nakliyat** — after DEF-008 fix (ICC conflict detection), most complex branch

## Pre-Rollout Checklist (per branch)

- [ ] Feature flag created in codebase
- [ ] Real policy PDFs acquired (minimum sample size per table above)
- [ ] Real document extraction validated
- [ ] Defect log reviewed and critical/medium issues resolved
- [ ] Display mode distribution reviewed (no unexpected `full` on poor extractions)
- [ ] Prohibited phrase suppression verified on real documents
- [ ] Internal team QA sign-off
- [ ] Monitoring dashboard configured
- [ ] Rollback procedure tested

## Expansion Criteria

A branch moves from internal-only to wider rollout when:
1. Minimum real-document sample size reached
2. Zero critical defects remaining
3. Medium defects either resolved or have documented workarounds
4. Display mode distribution acceptable (< 5% incorrect modes)
5. Prohibited phrase suppression at 100%
6. Internal team QA approval
