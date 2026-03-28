/**
 * Actuarial Engine — Core Type System
 *
 * Provides the canonical type definitions for the 4-layer actuarial
 * evaluation architecture. These types are designed to be broad and
 * extensible, supporting thousands of policy variations across
 * kasko, traffic/ZMMS, DASK, and the emerging ZAS product lines.
 *
 * Architecture:
 *   Layer A — Agentic Ingestion & Semantic Normalization
 *   Layer B — Time-Versioned Compliance Gates
 *   Layer C — Actuarial Valuation Engine (Monte Carlo EOOP)
 *   Layer D — MCDA Ranking (TOPSIS) & XAI
 */

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type UUID = string

/** Policy types supported by the actuarial engine. */
export type ActuarialPolicyType =
  | 'kasko'
  | 'traffic'
  | 'dask'
  | 'zas'
  | 'health'
  | 'life'
  | 'business'

/** Severity levels for issues, gaps, and exclusion impacts. */
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical' | 'blocking'

/** Direction of a TOPSIS criterion: benefit (higher=better) or cost (lower=better). */
export type CriterionDirection = 'benefit' | 'cost'

// ─────────────────────────────────────────────────────────────────────────────
// MONETARY & EVIDENCE TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Monetary amount with currency and optional indexation flag. */
export interface Money {
  currency: 'TRY' | 'USD' | 'EUR'
  amount: number
  /** If true, the amount is indexed to inflation (e.g., TÜFE-linked). */
  isIndexed?: boolean
}

/**
 * Points back to a specific location in the source PDF.
 * Every extracted data point should carry one or more of these
 * for full auditability.
 */
export interface EvidencePointer {
  /** 1-based page number in the source document. */
  page: number
  /** Unique identifier for the text snippet (e.g., hash or sequential ID). */
  snippetId: string
  /** The raw text from which the value was extracted. */
  rawText: string
  /** Confidence of the extraction (0.0–1.0). */
  confidence: number
}

/**
 * Generic wrapper that pairs any extracted value with its
 * provenance evidence and confidence score.
 */
export interface FieldWithEvidence<T> {
  value: T
  evidence?: EvidencePointer[]
  confidence?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE & CONTRACT QUALITY
// ─────────────────────────────────────────────────────────────────────────────

/** Deductible can be absolute, percentage-based, or absent. */
export type DeductibleSpec = Money | { kind: 'pct'; percent: number } | { kind: 'none' }

/** Coverage limit can be a monetary amount or unlimited. */
export type CoverageLimitSpec = Money | { kind: 'unlimited' }

/**
 * Canonical coverage representation using standardised codes.
 * Codes follow the pattern: PERIL_SUBTYPE (e.g., "COLLISION", "EQ_LANDSLIDE", "FLOOD_INUNDATION").
 * This avoids Turkish/English name matching issues.
 */
export interface CanonicalCoverage {
  /** Standardised peril code. */
  code: string
  /** Whether this coverage is included in the policy. */
  included: boolean
  /** Coverage limit with evidence trail. */
  limit?: FieldWithEvidence<CoverageLimitSpec>
  /** Deductible with evidence trail. */
  deductible?: FieldWithEvidence<DeductibleSpec>
}

/** Parts quality standard used for repairs. */
export type PartsStandard = 'original' | 'equivalent' | 'unspecified'

/** Who controls the repair network. */
export type RepairNetworkRule = 'insurer_network' | 'insured_choice' | 'unspecified'

/** How market value (rayiç değer) is determined. */
export type RayicMethod = 'tsb_list' | 'expert_report' | 'unknown' | 'unspecified'

/**
 * Quality-of-indemnity mechanics extracted from the policy contract.
 * These directly affect the insured's financial outcome in a claim.
 */
export interface IndemnityMechanics {
  partsStandard: FieldWithEvidence<PartsStandard>
  repairNetworkRule: FieldWithEvidence<RepairNetworkRule>
  rayicMethod: FieldWithEvidence<RayicMethod>
  /** Whether the rayiç method is concretely defined (not vague). */
  rayicMethodIsConcrete: FieldWithEvidence<boolean>
}

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC EXCLUSIONS (Layer A)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of LLM-based semantic analysis of a policy exclusion clause.
 * Maps exclusion text to affected risk scenarios with severity assessment.
 */
export interface SemanticExclusionImpact {
  /** The original exclusion text from the policy document. */
  exclusionText: string
  /** Risk scenario codes affected by this exclusion (e.g., ["SCN_FLOOD"]). */
  affectedScenarios: string[]
  /** How severely this exclusion impacts the affected scenarios. */
  severity: Severity
  /** Natural-language rationale for the severity classification. */
  rationale: string
  /** Evidence pointers to the source document. REQUIRED — if empty, needsReview = true. */
  evidence: EvidencePointer[]
  /** Whether this exclusion needs human review (e.g., missing evidence). */
  needsReview?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE TYPES (Layer B)
// ─────────────────────────────────────────────────────────────────────────────

/** A reason that blocks a policy from being eligible for evaluation. */
export interface BlockingReason {
  code: string
  severity: 'critical' | 'blocking'
  message: string
  messageTr: string
  /** The specific rule that was violated. */
  rule: string
  /** Evidence for the violation (e.g., policy field that failed). */
  details?: Record<string, unknown>
}

/** A non-blocking compliance warning. */
export interface ComplianceWarning {
  code: string
  severity: Severity
  message: string
  messageTr: string
  rule: string
  details?: Record<string, unknown>
}

/** Result of the Layer B compliance gate. */
export interface ComplianceResult {
  /** If false, the policy CANNOT proceed to actuarial valuation. */
  eligible: boolean
  /** Reasons that block eligibility (empty if eligible). */
  blockingReasons: BlockingReason[]
  /** Non-blocking compliance warnings. */
  warnings: ComplianceWarning[]
  /** The timestamp when the compliance check was performed. */
  checkedAt: string
  /** The ruleset version used for this check. */
  rulesetVersion: string
}

/** Product name mismatch (e.g., "Tam Kasko" but missing required coverages). */
export interface ProductMismatch {
  /** The marketed product name. */
  marketedName: string
  /** Expected coverage codes that should be present. */
  expectedCoverages: string[]
  /** Coverage codes that are actually missing. */
  missingCoverages: string[]
  severity: 'critical' | 'blocking'
  message: string
  messageTr: string
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK SCENARIOS & LOSS MODELS (Layer C)
// ─────────────────────────────────────────────────────────────────────────────

/** Supported probability distribution families for loss modelling. */
export type DistributionType = 'lognormal' | 'pareto' | 'uniform'

/** Parameters for a loss distribution (discriminated union). */
export type LossDistributionParams =
  | { type: 'lognormal'; mu: number; sigma: number }
  | { type: 'pareto'; alpha: number; xMin: number }
  | { type: 'uniform'; min: number; max: number }

/**
 * A risk scenario definition.
 * Each scenario represents a type of insurable event (e.g., collision, theft, flood).
 */
export interface RiskScenario {
  /** Unique scenario code (e.g., "SCN_PARTIAL_COLLISION"). */
  code: string
  /** Human-readable label. */
  label: string
  /** Turkish label. */
  labelTr: string
  /** Annual event frequency ρⱼ (probability of occurrence per year). */
  frequency: number
  /** Parameters for the loss severity distribution. */
  lossDistribution: LossDistributionParams
  /** Which CanonicalCoverage codes respond to this scenario. */
  affectedCoverages: string[]
  /** Optional description of the scenario. */
  description?: string
  /** Optional: category for grouping (e.g., "natural_disaster", "motor", "liability"). */
  category?: string
}

/** Configuration for Monte Carlo simulation. */
export interface MonteCarloConfig {
  /** Number of simulation iterations. Default: 10,000. */
  numSimulations: number
  /** Seed for the PRNG. Use a fixed seed for deterministic tests. */
  seed?: number
  /** Confidence interval width for percentile reporting (e.g., 0.90 for P5–P95). */
  confidenceInterval: number
}

/** Per-scenario result from the EOOP calculation. */
export interface ScenarioResult {
  scenarioCode: string
  /** Expected annual cost contribution from this scenario. */
  expectedCost: number
  /** Average out-of-pocket per occurrence. */
  avgOutOfPocket: number
  /** Number of times this scenario occurred across all simulations. */
  occurrenceCount: number
  /** Whether a semantic exclusion negates coverage for this scenario. */
  excludedBySemantic: boolean
  /** The specific exclusion text that negated coverage, if any. */
  excludingClause?: string
}

/** Full result of the Expected Out-of-Pocket calculation. */
export interface EOOPResult {
  /** The Expected Out-of-Pocket cost (premium + expected uncovered losses). */
  expectedCost: Money
  /** Premium component of EOOP. */
  premium: Money
  /** Expected uncovered loss component. */
  expectedUncoveredLoss: Money
  /** Percentile distribution of total annual costs. */
  percentiles: {
    p5: number
    p25: number
    p50: number
    p75: number
    p95: number
  }
  /** Per-scenario breakdown. */
  scenarioBreakdown: ScenarioResult[]
  /** Monte Carlo config used. */
  config: MonteCarloConfig
  /** Contract quality penalty applied (0.0–1.0, where 1.0 = no penalty). */
  contractQualityFactor: number
  /**
   * EOOP precision indicator.
   * - 'full':       all deductible inputs are absolute/well-modeled
   * - 'partial':    percentage or conditional deductibles detected but not fully modeled —
   *                 EOOP is a base estimate that may understate actual OOP
   * - 'suppressed': deductible structure too complex/unknown to produce meaningful EOOP
   */
  eoopPrecision?: 'full' | 'partial' | 'suppressed'
  /** Human-readable limitations explaining why precision is not 'full'. */
  eoopLimitations?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPSIS RANKING (Layer D)
// ─────────────────────────────────────────────────────────────────────────────

/** A criterion used in the TOPSIS decision matrix. */
export interface TOPSISCriterion {
  /** Criterion identifier. */
  code: string
  /** Human-readable name. */
  label: string
  labelTr: string
  /** Weight (0.0–1.0). All weights must sum to 1.0. */
  weight: number
  /** Whether higher values are better (benefit) or lower (cost). */
  direction: CriterionDirection
}

/** TOPSIS result for a single policy. */
export interface TOPSISResult {
  policyId: string
  /** Relative closeness to ideal solution: Cᵢ = D⁻/(D⁺+D⁻). Range [0, 1]. */
  closeness: number
  /** Rank (1 = best). */
  rank: number
  /** Distance to ideal solution. */
  distanceToIdeal: number
  /** Distance to negative-ideal solution. */
  distanceToNegativeIdeal: number
  /** Normalised scores per criterion. */
  normalizedScores: Record<string, number>
  /** Weighted normalised scores per criterion. */
  weightedScores: Record<string, number>
}

/** Result of TOPSIS sensitivity analysis. */
export interface SensitivityResult {
  /** The base ranking (before perturbation). */
  baseRanking: TOPSISResult[]
  /** Which weight perturbations caused the winner to change. */
  flipPoints: SensitivityFlipPoint[]
  /** Overall stability score (0.0–1.0). Higher = more stable ranking. */
  stabilityScore: number
}

/** A point at which altering a weight flips the TOPSIS winner. */
export interface SensitivityFlipPoint {
  /** Which criterion's weight was changed. */
  criterionCode: string
  /** The original weight. */
  originalWeight: number
  /** The weight at which the flip occurred. */
  flippedWeight: number
  /** The new winner after the flip. */
  newWinner: string
  /** The old winner before the flip. */
  oldWinner: string
}

// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE TRACKING (Layer A)
// ─────────────────────────────────────────────────────────────────────────────

/** Result of evidence validation for a single field. */
export interface EvidenceValidation {
  fieldPath: string
  hasEvidence: boolean
  evidenceCount: number
  avgConfidence: number
  needsReview: boolean
  reason?: string
}

/** Overall evidence coverage report for an evaluation. */
export interface EvidenceCoverageReport {
  /** Total number of fields checked. */
  totalFields: number
  /** Number of fields with at least one evidence pointer. */
  fieldsWithEvidence: number
  /** Percentage of fields with evidence (0–100). */
  coveragePercent: number
  /** Fields that need review (missing evidence or low confidence). */
  fieldsNeedingReview: EvidenceValidation[]
  /** Whether the overall evaluation is flagged as needsReview. */
  overallNeedsReview: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER TIMINGS
// ─────────────────────────────────────────────────────────────────────────────

/** Performance timing breakdown for each evaluation layer. */
export interface LayerTimings {
  /** Layer A: Semantic exclusion analysis + evidence tracking (ms). */
  layerA_ms: number
  /** Layer B: Compliance gate (ms). */
  layerB_ms: number
  /** Layer C: Monte Carlo EOOP simulation (ms). */
  layerC_ms: number
  /** Layer D: TOPSIS ranking (ms). Only present for multi-policy evaluations. */
  layerD_ms?: number
  /** Total wall-clock time for the full evaluation (ms). */
  total_ms: number
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL EVALUATION RESULT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete output of the actuarial evaluation engine.
 * Combines results from all 4 layers into a single auditable result.
 */
export interface PolicyEvaluationResult {
  /** Whether the policy passed the compliance gate (Layer B). */
  eligible: boolean

  /** Blocking reasons from Layer B (if not eligible). */
  blockingReasons: BlockingReason[]

  /** Non-blocking warnings from all layers. */
  warnings: ComplianceWarning[]

  /** Product name mismatches (e.g., Tam Kasko contradiction). */
  productMismatches: ProductMismatch[]

  /** Compliance gate result (Layer B). */
  compliance: ComplianceResult

  /** Semantic exclusion analysis (Layer A). */
  semanticExclusions: SemanticExclusionImpact[]

  /** Indemnity mechanics assessment (Layer A). */
  indemnityMechanics?: IndemnityMechanics

  /** Evidence coverage report (Layer A). */
  evidenceCoverage: EvidenceCoverageReport

  /** Per-scenario scores from Layer C. */
  scenarioScores: Record<string, number>

  /** Expected Out-of-Pocket result (Layer C). */
  expectedOutOfPocket: EOOPResult

  /** Contract quality score (0–100). */
  contractQualityScore: number

  /** True when contract quality score is based on defaults (missing indemnity data). */
  contractQualityIsEstimated?: boolean

  /** EOOP precision level — 'full', 'partial', or 'suppressed'. */
  eoopPrecision?: 'full' | 'partial' | 'suppressed'

  /** Human-readable limitations explaining reduced EOOP precision. */
  eoopLimitations?: string[]

  /** TOPSIS ranking (Layer D) — only present for multi-policy comparisons. */
  ranking?: {
    topsisCloseness: number
    rank: number
    grade: string
  }

  /**
   * Snapshot of all config set versions used for this evaluation.
   * Keyed by config set type (e.g., "ruleset", "scenarios", "weights").
   */
  configSnapshot: Record<string, UUID>

  /** Performance timing breakdown for each layer. */
  layerTimings?: LayerTimings

  /** Whether any part of the evaluation needs human review. */
  needsReview: boolean

  /** ISO 8601 timestamp of when this evaluation was performed. */
  evaluatedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE INPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input for the actuarial engine. Wraps a standard Policy with
 * additional actuarial-specific fields that may be extracted
 * via Layer A or provided directly.
 */
export interface ActuarialPolicyInput {
  /** The policy ID (must match an existing Policy). */
  policyId: string
  /** The actuarial policy type. */
  policyType: ActuarialPolicyType
  /** Marketed product name (e.g., "Tam Kasko", "Dar Kasko"). */
  marketedProductName?: string
  /** Annual premium. */
  premium: Money
  /** Policy effective date. */
  effectiveDate: string
  /** Policy expiry date. */
  expiryDate: string
  /** Canonicalized coverages extracted from the policy. */
  coverages: CanonicalCoverage[]
  /** Raw exclusion texts from the policy. */
  exclusionTexts: string[]
  /** Semantic exclusion analysis results (if pre-computed). */
  semanticExclusions?: SemanticExclusionImpact[]
  /** Indemnity mechanics (if pre-computed). */
  indemnityMechanics?: IndemnityMechanics
  /** The insured asset value (e.g., vehicle market value for kasko). */
  insuredValue?: Money
  /** Raw extraction data for evidence tracking. */
  rawExtractionData?: Record<string, FieldWithEvidence<unknown>>
}

/** Options for running the full actuarial evaluation. */
export interface ActuarialEvaluationOptions {
  /** Override the effective date for compliance checking. */
  effectiveDate?: Date
  /** Monte Carlo configuration. */
  monteCarloConfig?: Partial<MonteCarloConfig>
  /** TOPSIS criteria weights override. */
  topsisWeights?: Record<string, number>
  /** Risk scenario overrides. */
  scenarioOverrides?: RiskScenario[]
  /** Skip Layer A semantic analysis (use pre-computed exclusions). */
  skipSemanticAnalysis?: boolean
  /** Skip Layer D TOPSIS ranking (single-policy evaluation). */
  skipRanking?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// ZAS (ZORUNLU AFET SİGORTASI) EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

/** Perils covered under the emerging ZAS framework. */
export type ZASPeril = 'earthquake' | 'flood' | 'landslide' | 'storm' | 'wildfire'

/** ZAS rule definition (draft — rules not yet finalised by SEDDK). */
export interface ZASRule {
  /** The specific peril this rule applies to. */
  peril: ZASPeril
  /** Whether this rule is currently enforced. */
  enforced: boolean
  /** Required deductible (typically 2%). */
  requiredDeductiblePercent: number
  /** Maximum insurable coverage amount. */
  maxCoverage?: Money
  /** Whether this rule is in draft status (not yet law). */
  draft: boolean
  /** Effective date (if enforced). */
  effectiveDate?: string
}
