/**
 * Policy Pipeline Types — Barrel Export
 *
 * Single import point for all pipeline types:
 *   import type { RawExtraction, ValidatedExtraction, ... } from '@/lib/policy-pipeline/types'
 */

// Canonical concepts and display labels
export type { CanonicalCoverageConcept, ConceptDisplayLabels } from './canonical-concepts.js'
export {
  CONCEPT_DISPLAY_LABELS,
  getConceptLabels,
  isCanonicalConcept,
} from './canonical-concepts.js'

// Raw extraction (LLM output)
export type {
  RawCoverageItem,
  RawConditionalDeductible,
  RawExclusion,
  RawSpecialCondition,
  RawDiscount,
  RawBundleProduct,
  RawExtraction,
} from './raw-extraction.js'

// Validated extraction (canonicalized)
export type {
  CoverageLimit,
  ValidatedCoverageItem,
  ValidatedConditionalDeductible,
  ValidatedExclusion,
  ValidatedSpecialCondition,
  ValidatedPremium,
  ValidatedVehicle,
  ValidatedDateRange,
  ValidatedExtraction,
} from './validated-extraction.js'

// Renderable extraction (UI-ready)
export type {
  CoverageGroupCategory,
  RenderableCoverageGroup,
  RenderableCoverageItem,
  RiskSeverity,
  RenderableRiskItem,
  RenderableScore,
  RenderableExtraction,
} from './renderable-extraction.js'

// Adapter types
export type {
  InsurerCode,
  InsurerAdapter,
  AdapterRegistry,
  AdapterSelectionResult,
} from './adapter.js'
