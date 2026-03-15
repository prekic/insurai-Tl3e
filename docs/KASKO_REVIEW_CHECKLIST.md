# KASKO Extraction — Reviewer Checklist

Use this checklist for every KASKO extraction reviewed during the internal pilot.

## Document Identification

- [ ] **Sample/Document ID** recorded
- [ ] **Filename** matches expected KASKO policy

## Critical Fields

| # | Field | Check | Pass? |
|---|-------|-------|:-----:|
| 1 | Policy number | Matches document header | ☐ |
| 2 | Insurance provider (şirket) | Correct company name | ☐ |
| 3 | Policy start date | Correct (YYYY-MM-DD) | ☐ |
| 4 | Policy end date | Correct (YYYY-MM-DD) | ☐ |
| 5 | Premium (prim) | Correct amount and currency | ☐ |

## Coverage Quality

| # | Field | Check | Pass? |
|---|-------|-------|:-----:|
| 6 | Coverage count | All major coverages captured | ☐ |
| 7 | Rayiç değer handling | `isMarketValue` correct on main coverage | ☐ |
| 8 | Deductible / muafiyet | Fixed deductible amounts correct | ☐ |
| 9 | Conditional deductibles | Age/license/network deductibles captured in specialConditions | ☐ |
| 10 | Unlimited/sınırsız handling | `isUnlimited` correct, no display leakage | ☐ |
| 11 | Service vs indemnity | Anlaşmalı/anlaşmasız distinction captured | ☐ |

## Special Conditions & Endorsements

| # | Field | Check | Pass? |
|---|-------|-------|:-----:|
| 12 | Special conditions (özel şartlar) | All present in extraction | ☐ |
| 13 | Endorsements (zeyilname/kloz) | Late-page clauses captured | ☐ |
| 14 | Exclusions (istisna) | Major exclusions listed | ☐ |

## Display Safety

| # | Field | Check | Pass? |
|---|-------|-------|:-----:|
| 15 | Display mode | Appropriate (`full` / `restricted` / `human_review_required`) | ☐ |
| 16 | Prohibited phrases | NONE of: "unlimited", "sınırsız", "no deductible", "muafiyetsiz", "fully covered", "tam kapsamlı" | ☐ |
| 17 | Source quotes | Evidence quotes present and relevant | ☐ |

## Reviewer Verdict

- [ ] **Accepted** — all fields correct, display safe
- [ ] **Corrected (minor)** — 1–2 non-critical adjustments
- [ ] **Corrected (major)** — critical field wrong
- [ ] **Rejected** — fundamentally unusable

## Notes

```
Reviewer name: _______________
Review date:   _______________
Time to review (min): ________
Corrections made: ____________
___________________________________
___________________________________
```
