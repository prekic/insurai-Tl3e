/**
 * Actuarial Engine — Public API
 *
 * This module re-exports the public surface of the 4-layer
 * actuarial evaluation engine. Import from here rather than
 * reaching into individual layer files.
 *
 * @example
 * ```ts
 * import {
 *   runFullEvaluation,
 *   evaluateAndRankPolicies,
 *   type ActuarialPolicyInput,
 *   type PolicyEvaluationResult,
 * } from '@/lib/actuarial-engine'
 * ```
 */

// ── Engine orchestrator ──────────────────────────────────────────────────────
export { runFullEvaluation, evaluateAndRankPolicies } from './engine'

// ── Adapter (AnalyzedPolicy → ActuarialPolicyInput) ──────────────────────────
export { mapAnalyzedToActuarialInput } from './adapter'

// ── Event Bus (evaluation pub/sub) ───────────────────────────────────────────
export { emitEvaluation, subscribeEvaluation, getListenerCount } from './actuarial-events'

// ── Core types ───────────────────────────────────────────────────────────────
export type {
  UUID,
  ActuarialPolicyType,
  Severity,
  CriterionDirection,
  Money,
  EvidencePointer,
  FieldWithEvidence,
  DeductibleSpec,
  CoverageLimitSpec,
  CanonicalCoverage,
  PartsStandard,
  RepairNetworkRule,
  RayicMethod,
  IndemnityMechanics,
  SemanticExclusionImpact,
  BlockingReason,
  ComplianceWarning,
  ComplianceResult,
  ProductMismatch,
  DistributionType,
  LossDistributionParams,
  RiskScenario,
  MonteCarloConfig,
  ScenarioResult,
  EOOPResult,
  TOPSISCriterion,
  TOPSISResult,
  SensitivityResult,
  SensitivityFlipPoint,
  EvidenceValidation,
  EvidenceCoverageReport,
  LayerTimings,
  PolicyEvaluationResult,
  ActuarialPolicyInput,
  ActuarialEvaluationOptions,
  ZASPeril,
  ZASRule,
} from './types'

// ── Layer A: Semantic exclusion analysis + Evidence tracking ─────────────────
export {
  analyzeExclusions,
  filterExclusionsByRelevance,
  countSevereExclusions,
} from './layer-a/semantic-exclusions'
export {
  validateEvidence,
  generateEvidenceCoverageReport,
  quickReviewCheck,
} from './layer-a/evidence-tracker'

// ── Layer B: Compliance gates ────────────────────────────────────────────────
export { executeComplianceGate } from './layer-b/compliance-gate'
export {
  getSEDDKLimitsForDate,
  checkTrafficLimits,
  extractTrafficLimitsFromCoverages,
  type SEDDKTrafficLimits,
  type TrafficPolicyLimits,
} from './layer-b/seddk-rules'
export {
  getDASKLimitsForDate,
  getZASRules,
  checkDASKCompliance,
  checkZASCompliance,
  type DASKLimits,
} from './layer-b/dask-rules'
export {
  validateProductName,
  isBasicKasko,
  getBasicKaskoExemptCoverages,
} from './layer-b/product-rules'

// ── Layer C: Monte Carlo EOOP engine ─────────────────────────────────────────
export { createSeededRNG, bernoulli, shuffle } from './layer-c/rng'
export {
  sampleLoss,
  sampleLognormal,
  samplePareto,
  sampleUniformLoss,
  expectedLoss,
  lognormalMean,
  paretoMean,
} from './layer-c/loss-model'
export {
  KASKO_SCENARIOS,
  TRAFFIC_SCENARIOS,
  DASK_SCENARIOS,
  ZAS_SCENARIOS,
  getScenariosForPolicyType,
  getAllScenarios,
  getScenarioByCode,
  overrideScenarioParams,
} from './layer-c/scenario-library'
export { calculateEOOP, computeContractQualityFactor } from './layer-c/monte-carlo'

// ── Layer D: TOPSIS ranking + sensitivity ────────────────────────────────────
export {
  rankPolicies,
  validateCriteria,
  DEFAULT_TOPSIS_CRITERIA,
  type TOPSISPolicyInput,
} from './layer-d/topsis'
export {
  analyzeSensitivity,
  generateXAISummary,
  generateSensitivitySummary,
} from './layer-d/sensitivity'

// ── Configuration defaults ───────────────────────────────────────────────────
export {
  DEFAULT_MONTE_CARLO_CONFIG,
  TEST_MONTE_CARLO_CONFIG,
  DEFAULT_TOPSIS_WEIGHTS,
  CONTRACT_QUALITY_WEIGHTS,
  CONTRACT_QUALITY_SCORES,
  KASKO_COVERAGE_WEIGHTS,
  computeContractQualityScore,
  computeCoverageBreadthScore,
  computeDeductibleExposure,
  computeComplianceScore,
} from './config/defaults'
