# 16. Actuarial Historical Interval Visualization Strategy

Date: 2026-03-01

## Status

Accepted

## Context

The Actuarial Evaluation Engine runs Monte Carlo simulations that generate expected out-of-pocket (EOOP) estimates containing probabilistic precision (specifically, 5th and 95th percentile confidence intervals).

Stakeholders needed a way to visualize the precision and drift of the engine longitudinally, identifying how different iterations or parameter modifications altered the confidence bounds. While the engine produced these percentiles, they were originally embedded deep within a transient `result_data` JSONB payload in `actuarial_evaluation_results`, making longitudinal querying and graphing via the admin dashboard too performance-intensive for high volumes.

## Decision

We will extract the Monte Carlo 5th and 95th percentile confidence intervals into top-level columns (`monte_carlo_lower_bound` and `monte_carlo_upper_bound`) in the `actuarial_evaluation_results` database table.

Additionally, we decided to adopt the `recharts` library on the frontend for rendering this historical intelligence. 

1. **Top-level Database Columns:** We introduced migration `029_actuarial_worker_settings.sql` to track bounds as numeric columns explicitly to optimize filtering and querying.
2. **Persistence Adapter Extraction:** The Node.js logic inside `server/services/actuarial-persistence.ts` natively reaches into the evaluation payload to pluck these variables at persistence time.
3. **Recharts Composed Graphing:** `recharts` was selected to render the `PolicyActuarialHistoryChart` because its declarative, tag-based component architecture integrated the cleanest with our `shadcn/ui` foundation. We combine dual-axis `Area` graphs to represent the confidence bounds layered underneath the primary TOPSIS score `Line` graph.

## Consequences

### Positive
- **Database Query Performance:** Directly querying upper and lower bounds prevents high-latency `->>` JSONB inspection functions.
- **Frontend State Cleanliness:** Time-series arrays required by `recharts` map perfectly 1:1 against the simplified backend historical API without needing heavy transformation libraries.
- **Improved UX Analytics:** It is now visually obvious to administrators precisely when and where an EOOP calculation is too volatile.

### Negative
- **Table Width Size:** Adds two numerical columns globally to `actuarial_evaluation_results`. Since some basic comparisons do not trigger the Monte Carlo path entirely, these fields will frequently be explicitly `NULL`.
- **Recharts Library Dependency:** We add another visualization library to the bundle. However, since the visualization sits primarily in the deeply nested `PolicyDetailView` component, its payload can be code-split efficiently.
