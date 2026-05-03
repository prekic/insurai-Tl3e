/**
 * Raw Extraction Types
 *
 * These types represent the verbatim output of the LLM extraction stage.
 * Fields preserve the exact strings the model produced — no normalization,
 * no canonicalization. The validate stage consumes these and produces
 * ValidatedExtraction.
 *
 * Design principle: every field that the LLM generates freely (names,
 * descriptions, evidence quotes) is typed as `string` and preserved as-is.
 * Downstream stages never read these fields for logic — they only use the
 * canonicalized equivalents.
 */

// ─── Coverage ────────────────────────────────────────────────────────────────

export interface RawCoverageItem {
  /** The LLM's coverage label, e.g. "Comprehensive Coverage" or "Market Value Coverage" */
  labelRaw: string
  /** The LLM's limit text, e.g. "Market Value", "TRY 5,000,000", "Included" */
  limitRaw: string
  /** Source quote from the document, when available */
  evidence?: string
  /** Page number in the source PDF */
  sourcePage?: number
}

// ─── Deductibles ─────────────────────────────────────────────────────────────

export interface RawConditionalDeductible {
  /** The LLM's description of the deductible scenario */
  descriptionRaw: string
  /** Percentage value if detected, e.g. "35" from "%35" */
  percentRaw?: string
  /** Source quote */
  evidence?: string
}

// ─── Exclusions ──────────────────────────────────────────────────────────────

export interface RawExclusion {
  /** The LLM's exclusion text in Turkish */
  textRaw: string
  /** English translation if the LLM provided one */
  textEnRaw?: string
}

// ─── Special Conditions ──────────────────────────────────────────────────────

export interface RawSpecialCondition {
  /** The LLM's condition text */
  textRaw: string
}

// ─── Discounts ───────────────────────────────────────────────────────────────

export interface RawDiscount {
  /** Discount label, e.g. "No-claim discount" */
  labelRaw: string
  /** Discount value, e.g. "30%", "50 TL" */
  valueRaw: string
}

// ─── Bundle Products ─────────────────────────────────────────────────────────

export interface RawBundleProduct {
  /** Product name as stated by the LLM */
  nameRaw: string
  /** Product type or description */
  typeRaw?: string
}

// ─── Top-Level Raw Extraction ────────────────────────────────────────────────

/**
 * The complete raw extraction output from the LLM.
 * Every field is the verbatim LLM output.
 * The validate stage normalizes this into ValidatedExtraction.
 */
export interface RawExtraction {
  // ── Policy identity ──────────────────────────────────────────────
  policyNumber?: string
  provider?: string
  insuredName?: string
  insuredEntityType?: string

  // ── Dates ────────────────────────────────────────────────────────
  startDate?: string
  endDate?: string

  // ── Vehicle ──────────────────────────────────────────────────────
  vehicleMake?: string
  vehicleModel?: string
  vehicleYear?: string
  vehiclePlate?: string
  vin?: string
  engineNo?: string

  // ── Financials ───────────────────────────────────────────────────
  premium?: string
  currency?: string

  // ── Coverages ────────────────────────────────────────────────────
  coverages: RawCoverageItem[]

  // ── Risk modifiers ───────────────────────────────────────────────
  conditionalDeductibles: RawConditionalDeductible[]
  exclusions: RawExclusion[]
  specialConditions: RawSpecialCondition[]

  // ── Extras ───────────────────────────────────────────────────────
  discounts: RawDiscount[]
  bundleProducts: RawBundleProduct[]

  // ── Metadata ─────────────────────────────────────────────────────
  /** Evidence / clause graph from the LLM */
  evidence?: Record<string, unknown>
  clauseGraph?: Record<string, unknown>

  // ── Provenance ───────────────────────────────────────────────────
  /** Which address the policy is associated with */
  insuredAddress?: string
  /** Previous insurer if mentioned */
  previousInsurer?: string
}
