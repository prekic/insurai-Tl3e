# KASKO Pilot Batch 2 Plan (Documents 6-20)

This document explicitly defines the target characteristics, admission status, and risk focus for the remaining 15 documents in the 20-document KASKO internal pilot.

## Required Mix
Based on initial 5-document pilot results, we need this explicit mix to accurately prove readiness:
- **5x Standard Passenger Vehicles** (Clean & Moderate)
- **3x Commercial/Heavy Vehicles** (Çekici, Kamyon)
- **2x High-Value/Specialty** (Luxury, Non-standard coverage)
- **3x Noisy/Edge cases** (testing rejection/admission gate resilience)
- **2x Multi-vehicle fleet policies** (testing complexity scaling)

---

## Targeted Selection

### Doc 6: Standard Passenger (Clean)
* **ID:** `RD-KAS-006`
* **Admission Category:** `pilot_eligible_clean`
* **Source:** Target: Synthetic or anonymized real text (Standard format)
* **Why Selected:** Baseline confirmation that standard extraction remains stable.
* **Risk Focus:** Ensuring basic fields and standard coverages are flawless.
* **Counted in Pilot Metrics:** Yes

### Doc 7: Standard Passenger (Moderate Noise)
* **ID:** `RD-KAS-007`
* **Admission Category:** `pilot_eligible_moderate`
* **Source:** Synthetic (Moderate scanning artifacts)
* **Why Selected:** To verify that minor OCR issues do not derail critical field extraction.
* **Risk Focus:** Address/Name parsing with noise.
* **Counted in Pilot Metrics:** Yes

### Doc 8: Standard Passenger (Missing Non-Critical Page)
* **ID:** `RD-KAS-008`
* **Admission Category:** `pilot_eligible_moderate`
* **Source:** Synthetic (Page 3 missing)
* **Why Selected:** Tests resilience when general conditions are missing but coverages are present.
* **Risk Focus:** Ensuring extraction does not crash on missing text.
* **Counted in Pilot Metrics:** Yes

### Doc 9: Standard Passenger (Long Document)
* **ID:** `RD-KAS-009`
* **Admission Category:** `pilot_eligible_clean`
* **Source:** Synthetic (>15 pages)
* **Why Selected:** Tests context window and hallucination on extreme boilerplate.
* **Risk Focus:** Speed and avoidance of hallucinated coverages from generic text.
* **Counted in Pilot Metrics:** Yes

### Doc 10: Standard Passenger (Foreign Currency)
* **ID:** `RD-KAS-010`
* **Admission Category:** `pilot_eligible_clean`
* **Source:** Synthetic (EUR/USD premium)
* **Why Selected:** Verifies currency normalization logic.
* **Risk Focus:** Premium formatting and currency detection.
* **Counted in Pilot Metrics:** Yes

### Doc 11: Commercial Heavy (Kamyon/Truck)
* **ID:** `RD-KAS-011`
* **Admission Category:** `pilot_eligible_clean`
* **Source:** Synthetic (Similar to RD-KAS-002)
* **Why Selected:** Confirms specialized commercial clauses.
* **Risk Focus:** Catching specific "Ticari" special conditions.
* **Counted in Pilot Metrics:** Yes

### Doc 12: Commercial Heavy (High Deductible)
* **ID:** `RD-KAS-012`
* **Admission Category:** `pilot_eligible_clean`
* **Source:** Synthetic
* **Why Selected:** Commercial vehicles often have complex percentage + minimum deductibles.
* **Risk Focus:** Strict deductible capture (critical pass/fail criteria).
* **Counted in Pilot Metrics:** Yes

### Doc 13: Commercial Heavy (Moderate Noise)
* **ID:** `RD-KAS-013`
* **Admission Category:** `pilot_eligible_moderate`
* **Source:** Synthetic (Faded scan simulation)
* **Why Selected:** Real-world commercial docs are often poorly scanned by fleet managers.
* **Risk Focus:** Extracting complex deductibles through noise.
* **Counted in Pilot Metrics:** Yes

### Doc 14: Luxury/High-Value Vehicle
* **ID:** `RD-KAS-014`
* **Admission Category:** `pilot_eligible_clean`
* **Source:** Synthetic 
* **Why Selected:** Tests maximum limits and specialized coverage (e.g., specific repair shop mandates).
* **Risk Focus:** Special condition accuracy.
* **Counted in Pilot Metrics:** Yes

### Doc 15: Specialty (Electric Vehicle)
* **ID:** `RD-KAS-015`
* **Admission Category:** `pilot_eligible_clean`
* **Source:** Synthetic
* **Why Selected:** Tests new coverage types (e.g., battery coverage, charging cable theft).
* **Risk Focus:** Coverage categorization accuracy for unexpected names.
* **Counted in Pilot Metrics:** Yes

### Doc 16: Extreme Noise / Garbled
* **ID:** `RD-KAS-016`
* **Admission Category:** `pilot_ineligible_noisy`
* **Source:** Synthetic (Random characters inserted, <100 chars legible)
* **Why Selected:** Safety test of the admission gate.
* **Risk Focus:** Ensuring it is rejected entirely and does NOT count against quality metrics.
* **Counted in Pilot Metrics:** No

### Doc 17: Implicit KASKO (Generic Document)
* **ID:** `RD-KAS-017`
* **Admission Category:** `pilot_ineligible_incomplete`
* **Source:** Synthetic (Generic text, lacking Sigorta A.Ş. or specific coverages)
* **Why Selected:** Safety test checking for overly aggressive extraction.
* **Risk Focus:** Preventing hallucination on empty templates.
* **Counted in Pilot Metrics:** No

### Doc 18: Missing First Page (No Provider/Policy Number)
* **ID:** `RD-KAS-018`
* **Admission Category:** `pilot_ineligible_incomplete`
* **Source:** Synthetic (Only coverage pages included)
* **Why Selected:** Validates admission gate rule rejecting missing core identifiers.
* **Risk Focus:** Preventing orphaned extractions.
* **Counted in Pilot Metrics:** No

### Doc 19: Multi-Vehicle Fleet (2 Vehicles)
* **ID:** `RD-KAS-019`
* **Admission Category:** `pilot_eligible_moderate`
* **Source:** Synthetic
* **Why Selected:** The system currently assumes 1 policy = 1 vehicle. This tests how it aggregates or breaks.
* **Risk Focus:** Identification of correct primary limits vs aggregate limits.
* **Counted in Pilot Metrics:** Yes

### Doc 20: Multi-Vehicle Fleet (5+ Vehicles)
* **ID:** `RD-KAS-020`
* **Admission Category:** `pilot_eligible_moderate`
* **Source:** Synthetic
* **Why Selected:** Extreme complexity test.
* **Risk Focus:** Context overload and major correction trigger if limits are mismatched.
* **Counted in Pilot Metrics:** Yes
