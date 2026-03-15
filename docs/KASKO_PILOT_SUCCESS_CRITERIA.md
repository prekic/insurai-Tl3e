# KASKO Pilot — Success Criteria for Graduation

> These criteria must ALL be met before KASKO can graduate from internal pilot to wider guarded pilot.

## Minimum Requirements

| Requirement | Threshold |
|-------------|-----------|
| Documents reviewed | ≥ 20 |
| Pilot duration | ≥ 2 weeks |
| Active pause triggers | 0 |

## Accuracy Metrics (Pilot-Eligible Docs Only)
> Evaluated only on documents classified as `pilot_eligible_clean` or `pilot_eligible_moderate`.

| Metric | Target | Blocking? |
|--------|--------|:---------:|
| Critical field accuracy rate | ≥ 80% | Yes |
| Eligible-doc acceptance rate (accepted + minor correction) | ≥ 60% | Yes |
| Eligible-doc major correction rate | ≤ 30% | Yes |
| Ineligible-doc rejection rate (noisy docs rejected) | ≥ 90% | Yes |


## Extraction Quality (Pilot-Eligible Docs Only)
> Evaluated only on eligible docs.

| Metric | Target | Blocking? |
|--------|--------|:---------:|
| Avg coverages extracted per real eligible doc | ≥ 2 | Yes |
| Conditional deductible capture rate | ≥ 40% (on docs that have them) | No |
| Special condition capture rate | ≥ 50% (on docs that have them) | No |
| Zero-coverage extraction rate | ≤ 20% | Yes |

## Display Safety (All Docs)
> Evaluated on ALL incoming documents (eligible and ineligible).

| Metric | Target | Blocking? |
|--------|--------|:---------:|
| Overall prohibited phrase leak count | 0 | Yes |
| Rollback triggers fired | 0 | Yes |
| Quote-link adequacy (docs with ≥1 source quote) | ≥ 70% | No |
| Mode distribution — `full` | ≤ 80% | No |
| Mode distribution — `restricted` or `human_review_required` | ≥ 10% | No |

## Reviewer Feedback

| Metric | Target | Blocking? |
|--------|--------|:---------:|
| Average review time | ≤ 15 minutes | No |
| Reviewer trust rating (if tracked) | ≥ 3/5 | No |
| Most common correction category | Not a critical field | No |

## Graduation Outcomes

| Result | Next Step |
|--------|-----------|
| All blocking targets met | Graduate to wider guarded pilot (10–20 users, still guarded) |
| Some non-blocking targets missed | Graduate with noted weaknesses, plan improvements |
| Any blocking target missed | Extend pilot, fix defects, re-evaluate |
| Multiple blocking targets missed | Pause pilot, return to extraction hardening |
