/**
 * Insurer Adapter Types
 *
 * Defines the interface for insurer-specific adapters that normalize
 * extraction output. Each insurer (Anadolu, Allianz, AXA, etc.) has
 * unique formatting quirks, terminology, and product structures.
 *
 * Adapters are pure functions — no side effects, no async, no I/O.
 * They transform RawExtraction into a normalized form that the
 * generic validate stage can process uniformly.
 */

import type { RawExtraction, RawCoverageItem } from './raw-extraction.js'
import type { CanonicalCoverageConcept } from './canonical-concepts.js'

// ─── Insurer Identity ────────────────────────────────────────────────────────

/**
 * Known insurer codes. Used for adapter selection and logging.
 * New insurers are added here as adapters are implemented.
 */
export type InsurerCode =
  | 'ANADOLU'
  | 'ALLIANZ'
  | 'AXA'
  | 'AKSIGORTA'
  | 'HDI'
  | 'MAPFRE'
  | 'SOMPO'
  | 'ZURICH'
  | 'GROUPAMA'
  | 'TURK_NIPPON'
  | 'UNKNOWN'

// ─── Adapter Interface ──────────────────────────────────────────────────────

/**
 * The contract every insurer adapter must implement.
 *
 * Adapters are pure, stateless, and synchronous. They handle:
 * 1. Provider name normalization (casing, abbreviation)
 * 2. Coverage label → concept overrides (insurer-specific terminology)
 * 3. Product bundling logic (e.g., Anadolu's "Birleşik Kasko")
 * 4. Known deductible scenario mappings
 */
export interface InsurerAdapter {
  /** Adapter identifier */
  readonly code: InsurerCode

  /** Human-readable insurer name (canonical form) */
  readonly displayName: string

  /**
   * Patterns to match the provider field from LLM output.
   * Used by the adapter selector to pick the right adapter.
   * Multiple patterns handle casing variants, abbreviations, etc.
   */
  readonly providerPatterns: RegExp[]

  /**
   * Insurer-specific coverage label → concept overrides.
   * These take precedence over the generic COVERAGE_MATCHERS.
   * Use when an insurer uses terminology that would be ambiguous
   * in the generic matcher (e.g., "CASU" means glass network for Allianz).
   */
  overrideCoverageConcept?(raw: RawCoverageItem): CanonicalCoverageConcept | null

  /**
   * Normalize the provider name to canonical form.
   * Handles casing, abbreviation, and Unicode normalization.
   * E.g., "ANADOLU ANONİM TÜRK SİGORTA ŞİRKETİ" → "Anadolu Sigorta"
   */
  normalizeProviderName(rawProvider: string): string

  /**
   * Post-process the raw extraction with insurer-specific logic.
   * Called after generic normalization. Can:
   * - Split bundled coverages into individual items
   * - Merge duplicate items that the LLM separated
   * - Add implicit coverages that the insurer always includes
   *
   * Returns a new RawExtraction (immutable — does not mutate input).
   */
  postProcess?(raw: RawExtraction): RawExtraction
}

// ─── Adapter Registry ────────────────────────────────────────────────────────

/**
 * Registry of all insurer adapters.
 * The adapter selector iterates this to find the right adapter
 * based on the provider field in the raw extraction.
 */
export type AdapterRegistry = ReadonlyArray<InsurerAdapter>

// ─── Pipeline Stage Types ────────────────────────────────────────────────────

/**
 * Result of adapter selection.
 */
export interface AdapterSelectionResult {
  adapter: InsurerAdapter
  confidence: number // 0-1, how confident we are in the match
  matchedPattern: string // which pattern matched, for logging
}
