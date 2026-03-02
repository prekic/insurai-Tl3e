# 017: Actuarial Engine Observability and Caching

## Status
Accepted

## Date
2026-03-01

## Context
The Actuarial Engine processes intensive computations across its 4 layers (A: Semantic Classification, B: Rules Gates, C: Stochastic Simulation, D: Pricing). During real-world testing and historical log profiling, two key bottlenecks were identified:
1. **Redundant Layer A Processing:** The `analyzeExclusions` function repeatedly parses identical raw exclusion strings via LLM or Regex pattern matchers for the same documents during re-evaluations. This was consuming unnecessary CPU cycles and potentially inflating API costs.
2. **Monitoring Instability:** While granular layer execution timings (`layer_a_ms`, `layer_c_ms`, etc.) were persisting to the `actuarial_evaluation_runs` table, the platform lacked an automated fallback to alert administrators if real-world policy intakes started failing systematically (e.g., if external LLM providers degraded or evaluation logic bugs slipped through).

## Decision
1. **Layer A SHA-256 Memoization Cache**: We implemented an in-memory `Map` (LRU/FIFO strategy, max 10,000 entries) inside `src/lib/actuarial-engine/layer-a/semantic-exclusions.ts`. All exclusion texts are hashed using `crypto.createHash('sha256')`. If a match is found in the cache, the parsing is completely bypassed and `O(1)` access time returns the cloned `SemanticExclusionImpact` results mapped to the current text evidence.
2. **Actionable Alarm Hook**: We extended `server/services/notification-service.ts` with `checkActuarialHealth()`, a function that queries the last 24 hours of evaluation runs. If the failure rate crosses a 5% threshold (with a >10 run minimum context), it natively fires push notifications to all administrators via the existing WebPush integration.
3. **Debounced Alert Polling**: Since the backend currently lacks a standalone cron runner, the `checkActuarialHealth()` poll was gracefully appended into the `/api/admin/monitoring/health` pulse route. To prevent database query thrashing and admin notification spam due to LoadBalancer pings, two local memory singletons were added:
   - `ACTUARIAL_CHECK_COOLDOWN_MS`: 5 minutes bounds on executing the Supabase query.
   - `ACTUARIAL_ALERT_COOLDOWN_MS`: 1-hour bounds on firing the push notification payload.
4. **Automated E2E Testing**: Add Playwright snapshot assertions targeting the new API aggregation logic bounds (`< 5000ms` total execution tests). 

## Consequences
### Positive
- Massive reduction in redundant operations when policies are re-evaluated or when standard exclusions (e.g., "Savaş/terör istisnası") traverse the system.
- Pro-active Admin awareness: API/Evaluation pipeline degradation notifies the team instantly.
- Memory safe: Map limits and debounces protect standard Node processes without relying on heavy external tech like Redis.

### Negative
- Cache exists in local server process memory: In a multi-instance stateless horizontal scaling setting, caches will be localized per pod resulting in slight repetition until all pod caches saturate. The impact is negligible.

## Alternatives Considered
- Deploying a full Redis instance for the Memoization cache. Rejected due to infrastructure complexity overkill compared to the simplified LRU Map approach.
