# KASKO Pilot — Success Criteria for Graduation

> These criteria must ALL be met before KASKO can graduate from internal pilot to wider guarded pilot.

## Minimum Requirements

| Requirement | Threshold |
|-------------|-----------|
| Documents reviewed | ≥ 20 |
| Pilot duration | ≥ 2 weeks |
| Active pause triggers | 0 |

## Accuracy Metrics

| Metric | Target | Blocking? |
|--------|--------|:---------:|
| Critical field accuracy rate | ≥ 80% | Yes |
| Overall acceptance rate (accepted + minor correction) | ≥ 60% | Yes |
| Major correction rate | ≤ 30% | Yes |
| Rejection rate | ≤ 10% | Yes |

## Extraction Quality

| Metric | Target | Blocking? |
|--------|--------|:---------:|
| Avg coverages extracted per real doc | ≥ 2 | Yes |
| Conditional deductible capture rate | ≥ 40% (on docs that have them) | No |
| Special condition capture rate | ≥ 50% (on docs that have them) | No |
| Zero-coverage extraction rate | ≤ 20% | Yes |

## Display Safety

| Metric | Target | Blocking? |
|--------|--------|:---------:|
| Prohibited phrase leak count | 0 | Yes |
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
