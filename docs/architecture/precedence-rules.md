# Relationship Precedence Rules

This document defines the resolution precedence for conflicting or nested clauses extracted from an insurance policy. The AI Extraction Engine must extract the facts, but the Deterministic Validator relies on these precedence rules to resolve ambiguity and generate Display-Safe output.

## 1. Hierarchy of Precedence (Highest to Lowest)

When multiple clauses govern the exact same coverage line item or scenario, the system will apply overrides in the following strict order:

### P1: Endorsement Overrides (Zeyilname)
**Type:** `endorsement_override`
Endorsements represent subsequent modifications agreed upon after the original policy issuance. Any direct contradiction here unilaterally supersedes the base policy.
**Example:** The base policy covers standard collision, but an endorsement modifies the definition of collision or changes the limit midway through the term.

### P2: Carve-Outs (İstisnalar)
**Type:** `carve_out`
Exclusions and general conditions that directly carve out specific scenarios from a parent coverage. A carve-out always overrides a general inclusion statement.
**Example:** "Earthquakes are fully covered" (P3) is overridden by a specific carve-out: "Except for buildings older than 20 years" (P2).

### P3: Sublimits (Alt Limitler)
**Type:** `sublimit`
Specific limits defined for a sub-scenario override general unlimited or high-limit parent coverages.
**Example:** Glass breaking is under "Vehicle Coverage" (Limit: Rayiç Değer), but Glass specific limit is "10,000 TRY" (Sublimit).

### P4: Conditional Restrictions (Özel Şartlar)
**Type:** `conditional_restriction`
General limitations tied to user action, provider usage, or specific timing.
**Example:** "Only at contracted services" (Anlaşmalı servislerde geçerlidir).

### P5: Deductible Triggers (Muafiyet Süreçleri)
**Type:** `deductible_trigger`
A clause specifying an out-of-pocket required before coverage pays. This modifies the final indemnity value, but it does *not* negate the existence of the coverage.

### P6: Coverage Inclusion (Genel Teminatlar)
**Type:** `coverage_inclusion`
The base inclusion of a risk.

### P7: Service Benefit Linkage (Asistans Hizmetleri)
**Type:** `service_benefit_linkage`
Non-indemnity services linked to a coverage. These do not override limits but are attached as conditional benefits (e.g., Free Towing up to 1500 TRY).

## 2. Resolving Ambiguity

If the Clause Relationship Graph contains two active edges of the same Precedence Level (e.g., two contradictory Sublimits for the same scenario):
1. **Safety Bias:** The Validator MUST adopt the more restrictive interpretation (the lower limit or higher deductible) for final UI display.
2. **Ambiguity Flag:** The extraction row is flagged with `ambiguityState = 'contradictory'`, generating an observability log and a potential human-review trigger.

## 3. Storage and Null Binding

If an extracted relation is highly uncertain (e.g., the AI finds a 20% deductible paragraph but cannot definitively attach it to "Collision" vs. "Theft"):
- The relation MUST be stored in the DB mapping.
- The `targetId` in the `ClauseGraph.edges` object can be mapped to `null` or a generic `ALL_MAIN_COVERAGES` constant.
- The `confidence` score of the evidence object must reflect this uncertainty.
- The Validator will flag this as a critical warning, preventing "No Deductible" from being displayed globally.
