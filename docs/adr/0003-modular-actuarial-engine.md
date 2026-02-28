# Modular Actuarial Engine as Parallel Evaluation System

* Status: Accepted
* Deciders: Erdem (owner), Claude (implementation)
* Date: 2026-02-28

Technical Story: The existing policy evaluation system uses a simple 5-category weighted linear scoring heuristic (0-100 scores, A-F grades). Insurance professionals need actuarial rigor for stochastic loss modeling, regulatory compliance gating, and multi-criteria comparison across policy types.

## Context and Problem Statement

How should we add actuarial-grade policy evaluation (Monte Carlo simulation, TOPSIS ranking, SEDDK/DASK compliance, semantic exclusion analysis) without risking the stability of the existing evaluation system that is live in production?

## Decision Drivers

* Turkish regulatory requirements (SEDDK traffic minimums, DASK 2% deductible) need formal compliance gates
* Insurance professionals expect stochastic Expected Out-Of-Pocket (EOOP) cost, not just linear scores
* Multi-policy comparison needs a mathematically rigorous ranking method (MCDA/TOPSIS)
* The existing `src/lib/policy-evaluation/evaluator.ts` serves 15,750+ tests and production users — must not break
* Evidence traceability (PDF page/snippet pointers) is needed for audit compliance
* New engine must be activatable via feature flag for gradual rollout

## Considered Options

* **Option 1**: Extend the existing `evaluator.ts` with Monte Carlo and TOPSIS
* **Option 2**: New self-contained module at `src/lib/actuarial-engine/` with feature flag
* **Option 3**: External microservice or Supabase Edge Function for actuarial computation

## Decision Outcome

Chosen option: **Option 2 — New self-contained module**, because it eliminates risk to the production system, allows independent testing with deterministic regression suites, and provides a clear activation path via feature flag.

### Positive Consequences

* Zero risk to existing evaluation system — no files in `src/lib/policy-evaluation/` are modified
* Independent versioning: actuarial engine can be iterated without touching production code paths
* Deterministic testing: seeded Mulberry32 PRNG enables bit-exact golden regression tests
* Clear activation path: feature flag `actuarial_engine_enabled` controls rollout
* Own database schema: 5 dedicated tables with evaluation run history and evidence tracking
* Extensible: ZAS (emerging product line) is already stubbed with DASK-like structure

### Negative Consequences

* Two parallel evaluation systems until migration is complete
* Adapter layer needed: `AnalyzedPolicy` → `ActuarialPolicyInput` type mapping required
* Own type system: `CanonicalCoverage` codes differ from existing `Coverage` interface
* Migration 028 adds 5 tables to the database schema
* No UI integration yet — engine results are not displayed to users

## Pros and Cons of the Options

### Option 1: Extend existing evaluator

* Good, because single code path — no duplication
* Good, because no adapter layer needed
* Bad, because risk to 15,750+ tests and production users
* Bad, because evaluator.ts is already complex (1,020 lines) with tightly coupled scoring logic
* Bad, because Monte Carlo simulation fundamentally differs from linear weighted scoring

### Option 2: New self-contained module (chosen)

* Good, because zero risk to production
* Good, because independent regression testing with deterministic seeded PRNG
* Good, because clean type system designed for actuarial use cases (evidence pointers, canonical coverage codes)
* Good, because feature flag controls activation
* Bad, because parallel systems increase maintenance surface until migration
* Bad, because adapter layer adds complexity

### Option 3: External microservice

* Good, because complete isolation from frontend codebase
* Good, because could use Python/R for actuarial computation
* Bad, because adds network latency to every evaluation
* Bad, because deployment complexity (separate service, health monitoring, scaling)
* Bad, because violates monolithic architecture decision (ADR-0001 chose single Railway service)
* Bad, because duplicates data access patterns (needs Supabase access from two services)

## Architecture

```
Layer A — Semantic Analysis
  ├── Exclusion pattern matching (Turkish insurance terms → scenario impact)
  └── Evidence pointer validation (PDF page/snippet tracking)

Layer B — Compliance Gates (hard pass/fail)
  ├── SEDDK 2025/2026 traffic limits
  ├── DASK 2% mandatory deductible
  └── Product name validation ("Tam Kasko" ↔ coverage alignment)

Layer C — Monte Carlo EOOP (10,000 simulations)
  ├── Lognormal/Pareto/Uniform loss distributions
  ├── Per-scenario: Bernoulli event → sample loss → apply deductible/limit/exclusion
  └── Output: expected cost (TRY), P5/P25/P50/P75/P95 percentiles

Layer D — TOPSIS Ranking + XAI
  ├── Multi-criteria: EOOP, premium, coverage breadth, compliance, contract quality
  ├── Normalized weighted matrix → ideal/negative-ideal distances → closeness score
  └── Weight sensitivity analysis → natural-language explanations (EN/TR)
```

## Integration Path (Future Work)

1. Build adapter: `AnalyzedPolicy` → `ActuarialPolicyInput`
2. Apply migration 028 to production Supabase
3. Wire into extraction pipeline (post-extraction hook)
4. Build admin UI for actuarial configuration
5. Display EOOP/TOPSIS in ComparePolicies and PolicyDetailView
6. Gradual rollout via feature flag percentage
7. Eventually deprecate legacy evaluator once parity is confirmed
