/**
 * Validated Extraction Types
 *
 * These types represent the output of Stage 2 (validate/normalize).
 * All free-text fields have been canonicalized. Coverage items reference
 * CanonicalCoverageConcept, and display labels are deterministic lookups.
 *
 * The critical design point: ValidatedCoverageItem.labelDisplayTR/EN is
 * looked up from concept, NOT extracted from the LLM. Once the concept is
 * identified, the user-facing label is deterministic. This eliminates
 * "Comprehensive Coverage" vs "Market Value Coverage" oscillation by
 * construction — both canonicalize to MAIN_KASKO_COVERAGE, both render
 * as the same string.
 */

import type { CanonicalCoverageConcept } from './canonical-concepts.js'

// ─── Coverage Limit ──────────────────────────────────────────────────────────

export type CoverageLimit =
  | { type: 'amount'; value: number; currency: string }
  | { type: 'market_value' }
  | { type: 'rayic' }
  | { type: 'unlimited' }
  | { type: 'included' }
  | { type: 'subject_to_clause'; description: string }

// ─── Validated Coverage ──────────────────────────────────────────────────────

export interface ValidatedCoverageItem {
  /** Canonical concept identifier — the paraphrasing-invariant key */
  concept: CanonicalCoverageConcept
  /** Deterministic Turkish label, looked up from concept */
  labelDisplayTR: string
  /** Deterministic English label, looked up from concept */
  labelDisplayEN: string
  /** Parsed, typed coverage limit */
  limit: CoverageLimit
  /** Source evidence quote if available */
  evidence?: string
  /** Source page in the PDF */
  sourcePage?: number
  /** Preserved for debugging — the LLM's actual phrasing */
  originalLabelRaw: string
}

// ─── Validated Deductible ────────────────────────────────────────────────────

export interface ValidatedConditionalDeductible {
  /** Canonical scenario ID from NAMED_DEDUCTIBLE_SCENARIOS */
  scenarioId: string
  /** Display label in Turkish */
  labelTR: string
  /** Display label in English */
  labelEN: string
  /** Percentage if applicable */
  percent?: number
  /** Original LLM text, preserved for debugging */
  originalDescriptionRaw: string
}

// ─── Validated Exclusion ─────────────────────────────────────────────────────

export interface ValidatedExclusion {
  /** Normalized exclusion text in Turkish */
  textTR: string
  /** Normalized exclusion text in English */
  textEN: string
  /** Whether this is a "true" exclusion vs a misclassified conditional deductible */
  isTrueExclusion: boolean
}

// ─── Validated Special Condition ─────────────────────────────────────────────

export interface ValidatedSpecialCondition {
  /** Normalized condition text */
  text: string
  /** Importance level for UI rendering */
  importance: 'high' | 'medium' | 'low'
}

// ─── Validated Financials ────────────────────────────────────────────────────

export interface ValidatedPremium {
  /** Parsed numeric premium value */
  value: number
  /** Currency code */
  currency: string
  /** Original raw string for audit trail */
  originalRaw: string
}

// ─── Validated Vehicle ───────────────────────────────────────────────────────

export interface ValidatedVehicle {
  make: string
  model: string
  year: number | null
  plate: string | null
  vin: string | null
  engineNo: string | null
}

// ─── Validated Dates ─────────────────────────────────────────────────────────

export interface ValidatedDateRange {
  startDate: string | null // ISO 8601 format
  endDate: string | null // ISO 8601 format
}

// ─── Top-Level Validated Extraction ──────────────────────────────────────────

/**
 * The complete validated extraction.
 * All fields are normalized and canonicalized.
 * Ready for Stage 3 (rendering) or direct consumption by the UI.
 */
export interface ValidatedExtraction {
  // ── Policy identity ──────────────────────────────────────────────
  policyNumber: string | null
  provider: string // canonicalized insurer name
  insuredName: string | null
  insuredEntityType: 'individual' | 'corporate' | null

  // ── Dates ────────────────────────────────────────────────────────
  dates: ValidatedDateRange

  // ── Vehicle ──────────────────────────────────────────────────────
  vehicle: ValidatedVehicle

  // ── Financials ───────────────────────────────────────────────────
  premium: ValidatedPremium | null

  // ── Coverages ────────────────────────────────────────────────────
  coverages: ValidatedCoverageItem[]

  // ── Risk modifiers ───────────────────────────────────────────────
  conditionalDeductibles: ValidatedConditionalDeductible[]
  exclusions: ValidatedExclusion[]
  specialConditions: ValidatedSpecialCondition[]

  // ── Validation metadata ──────────────────────────────────────────
  /** Concepts that canonicalized to UNKNOWN — these need new matchers */
  unknownConcepts: Array<{ originalLabel: string; suggestedConcept?: string }>
  /** Magnitude validation warnings */
  magnitudeWarnings: Array<{ field: string; value: number; expectedRange: [number, number] }>
  /** Overall confidence in the extraction quality */
  validationScore: number
}
