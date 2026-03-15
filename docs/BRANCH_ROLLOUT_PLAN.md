# Branch Rollout Plan

## Feature Flag Strategy

Each branch should be gated behind a feature flag to enable gradual rollout:

```
BRANCH_ENABLED_TRAFFIC=false
BRANCH_ENABLED_HOME=false
BRANCH_ENABLED_HEALTH=false
BRANCH_ENABLED_LIFE=false
BRANCH_ENABLED_DASK=false
BRANCH_ENABLED_BUSINESS=false
BRANCH_ENABLED_NAKLIYAT=false
```

When a flag is `false`, the system:
- Still accepts the policy and runs extraction
- Still runs generic validation and analysis
- **Skips branch-specific validator rules, insights, and scoring signals**
- Marks the branch as `restricted` display mode
- Adds a top-summary note: "Branch-specific analysis is not yet enabled for this policy type"

## Enablement Order

| Wave | Branches | Rationale | Target |
|---|---|---|---|
| 1 | Traffic, DASK | Simplest, statutory, lowest risk | Week 1 |
| 2 | Home | Common, moderate complexity | Week 2 |
| 3 | Health, Life | Higher complexity, more conditions | Week 3 |
| 4 | Business, Nakliyat | Highest complexity | Week 4 |

## Backfill Strategy

When a branch flag is enabled:
1. Existing policies of that type remain in their current state
2. Re-analysis can be triggered manually per-policy
3. Batch re-analysis should be done during off-peak hours
4. No automatic re-analysis on flag enable (prevents load spikes)

## Monitoring

### Per-Branch Metrics to Track
- Validator flag count per branch (Warning/Error breakdown)
- Display mode distribution per branch (full/restricted/human_review)
- Insight generation count per branch
- riskAttentionScore distribution per branch
- Prohibited phrase suppression count per branch

### Alerting
- Alert if > 80% of policies in a branch hit `restricted` mode
- Alert if > 20% hit `human_review_required`
- Alert if prohibited phrase suppression rate spikes

## Human Review Fallback

If a branch is enabled but performing poorly:
1. Increase `RESTRICTED_THRESHOLD` for that branch temporarily
2. Route more policies to `human_review_required`
3. Collect human annotations as golden data
4. Iterate validators/insights based on human feedback
5. Lower thresholds once quality stabilizes

## Fail-Safe Rule

> If a branch is not mature enough, mark it as partial, and prefer restricted mode over overconfident summaries.

Any branch where:
- Golden test coverage < 5 scenarios
- Validator catches < 2 branch-specific issues
- Display-safe summary lacks branch-specific cards

...should remain behind its feature flag until these minimums are met.
