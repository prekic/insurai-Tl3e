# KASKO Internal Pilot — Go-Live Checklist

> Complete all items below before processing the first 5 pilot documents.

## Pre-Launch

- [ ] Feature flag `kasko_ai_extraction_pilot` created and **enabled** in admin panel
- [ ] User segment `kasko_pilot_reviewers` configured with up to 5 internal QA users
- [ ] Verify reviewer users can log in and access KASKO uploads
- [ ] `.env` has valid `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` for fallback)

## System Verification

- [ ] Upload a test KASKO PDF with a pilot reviewer account
- [ ] Confirm the **"TASLAK / DRAFT — Human Review Required"** banner appears
- [ ] Confirm `pilotReviewStatus: pending_review` is attached to the result
- [ ] Confirm display mode is appropriate (`full`, `restricted`, or `human_review_required`)
- [ ] Confirm no prohibited phrases in output (`sınırsız`, `unlimited`, etc.)
- [ ] Confirm non-reviewer users do NOT see pilot results (flag + segment gating)

## Logging Verification

- [ ] Process one document and verify QA record is appended to `/tmp/kasko-pilot-qa-log.jsonl`
- [ ] Verify QA record contains all required fields from `KASKO_PILOT_QA_SCHEMA.md`

## Monitoring

- [ ] Rollback trigger monitoring enabled via `getRollbackTriggerStatus()`
- [ ] Escalation contact identified (who pauses the pilot if triggers fire)

## Documentation

- [ ] `docs/KASKO_INTERNAL_PILOT_SPEC.md` reviewed by team
- [ ] `docs/KASKO_REVIEW_CHECKLIST.md` printed/available for reviewers
- [ ] `docs/KASKO_PILOT_SUCCESS_CRITERIA.md` shared with stakeholders

## Go / No-Go Decision

- [ ] All items above checked
- [ ] Team lead approves go-live
- [ ] First 5 documents identified and queued

## First 5 Documents — What to Test

| # | Document Type | What to Watch |
|---|--------------|---------------|
| 1 | Standard KASKO | All critical fields correct, banner visible |
| 2 | Long policy (>10 pages) | Special conditions from later pages captured |
| 3 | Policy with conditional deductibles | Age/license/network deductibles in specialConditions |
| 4 | Minimal/simple policy | Zero-coverage triggers restricted mode |
| 5 | Multi-coverage with endorsements | Endorsement clauses survive extraction |
