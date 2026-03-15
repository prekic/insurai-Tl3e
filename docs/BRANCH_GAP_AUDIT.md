# Branch Gap Audit — Per-Branch Analysis

## Traffic

### Missing Fields
- No statutory minimum validation (SEDDK 2024 minimums not enforced)
- No vehicle class / passenger count validator checks

### Missing Condition Handling
- Does not distinguish statutory floor from enhanced protection
- No geography/territory restriction handling

### Missing Validator Rules
- No `bodilyInjuryPerPerson >= 1,200,000` check
- No `propertyDamageLimit >= 300,000` check
- No vehicle class validation

### Missing Display Mappings
- No statutory-vs-actual card separation
- No liability-focused card structure

### Dangerous Defaults
- Statutory minimums could be presented as "good coverage" without context

### Benchmark Relevance
- Premium benchmark relevant; deductible benchmark N/A (traffic has no deductibles)

---

## Home

### Missing Fields
- No building/contents value separation validation
- No underinsurance / average clause detection

### Missing Condition Handling
- No alarm/security/vacancy/occupancy condition surfacing
- No location/construction dependency validation
- No mixed valuation basis detection

### Missing Validator Rules
- No `buildingValue > 0 || contentsValue > 0` check
- No underinsurance ratio flag
- No construction type vs coverage compatibility

### Missing Display Mappings
- No building vs contents vs conditions card separation
- No underinsurance warning card

### Dangerous Defaults
- Could create fake total where building + contents are on different bases
- Could miss average clause implications

### Benchmark Relevance
- Premium benchmark relevant; property value benchmarks need local data

---

## Health

### Missing Fields
- No network type validation
- No waiting period enforcement
- No copay/deductible/OOP logic validation

### Missing Condition Handling
- No pre-authorization / referral condition surfacing
- No inpatient vs outpatient scope separation
- No maternity/dental/vision/mental health distinction

### Missing Validator Rules
- No `networkType` presence check
- No waiting period reasonableness check
- No copay structure validation

### Missing Display Mappings
- No network dependency card
- No waiting period card
- No copay/OOP explanation card

### Dangerous Defaults
- Could flatten health scope into "covered" without network/copay context
- Could miss critical waiting periods

### Benchmark Relevance
- Premium relevant but highly variable by age/group; deductible/copay benchmarks possible

---

## Life

### Missing Fields
- No beneficiary validation
- No rider conditionality checks
- No surrender/paid-up/loan value validation

### Missing Condition Handling
- No suicide/contestability/waiting-period exclusion handling
- No distinction between guaranteed fact and value illustration

### Missing Validator Rules
- No `primaryBeneficiary` presence check
- No `sumAssured > 0` validation
- No rider dependency validation

### Missing Display Mappings
- No benefit structure card (death benefit + riders)
- No beneficiary uncertainty card
- No waiting period / contestability card

### Dangerous Defaults
- Could present illustrated values as guaranteed
- Could miss beneficiary uncertainty

### Benchmark Relevance
- Premium benchmark relevant; death benefit benchmarks need actuarial data

---

## DASK

### Missing Fields
- No statutory cap validation (DASK has legal coverage maximums)
- No building class validation (A vs B)

### Missing Condition Handling
- No statutory scope limitation surfacing
- Could imply broader property cover if not present

### Missing Validator Rules
- No `coverageLimit <= statutory_max` check
- No `buildingClass in ['A', 'B']` validation
- No earthquake zone validation

### Missing Display Mappings
- No statutory earthquake-only scope card
- No building class / area / cap explanation card

### Dangerous Defaults
- Could present DASK as comprehensive property cover (it's earthquake-only)
- Could miss statutory cap implications

### Benchmark Relevance
- Premium benchmark relevant (statutory rates); scope benchmarks N/A (statutory product)

---

## Business

### Missing Fields
- No BI waiting period / indemnity period validation
- No stock/machinery/fixtures separation

### Missing Condition Handling
- No alarm/protection/warranty condition surfacing
- No underinsurance / first-loss / average condition detection
- No service-type vs indemnity separation

### Missing Validator Rules
- No `businessInterruptionPeriod` reasonableness check
- No `stockValue` vs `equipmentValue` separation validation
- No warranty condition enforcement

### Missing Display Mappings
- No BI/liability/property separation cards
- No warranty condition card
- No underinsurance / first-loss card

### Dangerous Defaults
- Could total BI + property + liability into single misleading amount
- Could miss warranty conditions that void coverage

### Benchmark Relevance
- Premium benchmark relevant but highly variable by industry; BI benchmarks need sector data

---

## Nakliyat

### Missing Fields
- No ICC basis validation (A/B/C)
- No warehouse-to-warehouse condition enforcement
- No Incoterms dependency validation

### Missing Condition Handling
- No packaging exclusion / route restriction surfacing
- No storage condition handling
- No mode/conveyance dependency

### Missing Validator Rules
- No ICC clause type validation
- No `warehouseToWarehouse` presence check
- No origin/destination validation
- No packaging type validation

### Missing Display Mappings
- No ICC basis explanation card
- No route/packaging/storage condition card
- No Incoterms dependency card

### Dangerous Defaults
- Could present ICC(C) as "all risks" when it's minimum coverage
- Could miss packaging exclusions that void coverage

### Benchmark Relevance
- Premium benchmark relevant but highly variable; cargo value benchmarks need market data
