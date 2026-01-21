/**
 * Pipeline Version Constants
 *
 * These versions are used for cache key generation.
 * Increment when making breaking changes to ensure cache invalidation.
 *
 * Version format: MAJOR.MINOR.PATCH
 * - MAJOR: Breaking changes to output schema
 * - MINOR: New features, compatible changes
 * - PATCH: Bug fixes, optimization
 */

/**
 * Current pipeline version
 * Increment on ANY change to normalization or extraction logic
 */
export const PIPELINE_VERSION = '3.1.0'

/**
 * OCR normalizer version
 * Increment when turkish-ocr-normalizer.ts changes
 */
export const OCR_NORMALIZER_VERSION = '1.0.0'

/**
 * Section normalizer version
 * Increment when section-normalizer.ts changes
 */
export const SECTION_NORMALIZER_VERSION = '1.0.0'

/**
 * Extraction schema version
 * Increment when KaskoExtractionJSON schema changes
 */
export const EXTRACTION_SCHEMA_VERSION = '3.0.0'

/**
 * QA scoring version
 * Increment when qa-scoring.ts changes
 */
export const QA_SCORING_VERSION = '1.0.0'

/**
 * Get composite version string for cache key
 * Combines all relevant versions into a single string
 */
export function getPipelineVersionKey(): string {
  return `p${PIPELINE_VERSION}_o${OCR_NORMALIZER_VERSION}_s${SECTION_NORMALIZER_VERSION}`
}

/**
 * Version history for documentation
 * Add entry when incrementing any version
 */
export const VERSION_HISTORY = [
  {
    date: '2026-01-21',
    version: '3.1.0',
    changes: [
      'Added deterministic Turkish OCR normalizer (normalizeTurkishOcr)',
      'Added structured logging for pipeline stages',
      'Updated cache key generation to include prompt and pipeline versions',
    ],
  },
  {
    date: '2026-01-20',
    version: '3.0.0',
    changes: [
      'Implemented 3-step extraction pipeline (Normalize → Extract → Analyze)',
      'Added evidence-first outputs with trace (quote + location)',
      'Added contradiction detection',
      'Added hard-gated QA scoring',
      'Added data requests generator',
    ],
  },
] as const
