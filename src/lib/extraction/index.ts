/**
 * Turkish Insurance Document Extraction Module
 *
 * Exports validation, normalization, and pattern extraction utilities
 * for Turkish insurance documents.
 */

export {
  // Validators
  validateTCKimlik,
  validateVIN,
  validateTurkishPlate,
  validateTurkishIBAN,

  // Normalizers
  normalizeTurkishDate,
  normalizeCurrency,
  normalizePhoneNumber,

  // Pattern Extraction
  extractWithPatterns,

  // Validation & Enhancement
  validateAndEnhanceExtraction,
  mergeExtractionResults,

  // Types
  type ExtractedField,
  type PatternExtractionResult,
  type ValidationResult,
} from './turkish-patterns'
