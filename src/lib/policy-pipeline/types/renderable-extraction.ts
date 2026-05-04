/**
 * Renderable Extraction Types
 *
 * Stage 3 output: the final shape consumed by the UI layer.
 * Adds display-specific fields (formatted strings, severity colors,
 * section grouping) on top of ValidatedExtraction.
 *
 * This is a future type — Session 1 defines the shape,
 * Session 2+ implements the Stage 3 renderer.
 */

import type {
  ValidatedCoverageItem,
  ValidatedConditionalDeductible,
  ValidatedExclusion,
  ValidatedSpecialCondition,
} from './validated-extraction.js'

// ─── Renderable Coverage Group ───────────────────────────────────────────────

export type CoverageGroupCategory =
  | 'main'
  | 'liability'
  | 'personal_accident'
  | 'supplementary'
  | 'assistance'
  | 'legal'
  | 'natural_disaster'
  | 'other'

export interface RenderableCoverageGroup {
  /** Category key for UI tab/section rendering */
  category: CoverageGroupCategory
  /** Display label for the group header */
  headerTR: string
  headerEN: string
  /** Items in this group, sorted by importance */
  items: RenderableCoverageItem[]
}

// ─── Renderable Coverage Item ────────────────────────────────────────────────

export interface RenderableCoverageItem extends ValidatedCoverageItem {
  /** Human-readable formatted limit string, e.g. "₺5.000.000" or "Rayiç Değer" */
  formattedLimitTR: string
  formattedLimitEN: string
  /** Icon suggestion for the UI */
  iconHint?: string
}

// ─── Risk Summary ────────────────────────────────────────────────────────────

export type RiskSeverity = 'critical' | 'warning' | 'info' | 'ok'

export interface RenderableRiskItem {
  /** The deductible, exclusion, or condition */
  source: ValidatedConditionalDeductible | ValidatedExclusion | ValidatedSpecialCondition
  /** Human-readable summary */
  summaryTR: string
  summaryEN: string
  /** Visual severity level for UI coloring */
  severity: RiskSeverity
}

// ─── Renderable Score ────────────────────────────────────────────────────────

export interface RenderableScore {
  /** Overall extraction quality 0-100 */
  overall: number
  /** Per-dimension breakdown */
  dimensions: Array<{
    label: string
    score: number
    weight: number
  }>
  /** Color hint for the score badge */
  colorHint: 'green' | 'yellow' | 'red'
}

// ─── Top-Level Renderable Extraction ─────────────────────────────────────────

/**
 * The complete renderable extraction.
 * Ready for direct consumption by React/Vue components.
 */
export interface RenderableExtraction {
  // ── Policy header ────────────────────────────────────────────────
  policyNumber: string | null
  providerName: string
  insuredName: string | null
  insuredEntityType: 'individual' | 'corporate' | null
  dateRange: { start: string | null; end: string | null }

  // ── Vehicle card ─────────────────────────────────────────────────
  vehicle: {
    make: string
    model: string
    year: number | null
    plate: string | null
    vin: string | null
    displayLine: string // e.g. "2021 Volkswagen Golf — 34 ABC 123"
  }

  // ── Premium ──────────────────────────────────────────────────────
  premium: {
    formatted: string // e.g. "₺12.500"
    value: number
    currency: string
  } | null

  // ── Coverage groups ──────────────────────────────────────────────
  coverageGroups: RenderableCoverageGroup[]
  totalCoverageCount: number

  // ── Risk summary ─────────────────────────────────────────────────
  risks: RenderableRiskItem[]
  riskScore: RenderableScore

  // ── Quality indicators ───────────────────────────────────────────
  qualityIndicators: {
    unknownCoverageCount: number
    magnitudeWarningCount: number
    validationScore: number
  }
}
