/**
 * PDF Extraction Module
 *
 * Provides high-quality PDF text extraction with:
 * - Server-side extraction with better text reconstruction
 * - Quality analysis to detect glyph-splitting issues
 * - Noise stripping for barcode/control char artifacts
 * - Turkish word reconstruction for common insurance terms
 * - Automatic fallback to client-side extraction
 */

// Quality analysis
export {
  analyzeTextQuality,
  isTextQualityAcceptable,
  getTextQualityScore,
  type TextQualityMetrics,
} from './text-quality-analyzer'

// Noise stripping
export {
  stripBarcodeNoise,
  stripControlCharacters,
  fixGlyphSplitTurkish,
  cleanExtractedText,
  type NoiseStrippingResult,
} from './noise-stripper'

// Server-side extraction
export {
  extractWithServer,
  analyzeTextQualityServer,
  extractWithFallback,
  isPdfServerAvailable,
  type ServerExtractionQuality,
  type ServerExtractionCleaning,
  type ServerPDFExtractionResult,
  type ExtractionWithFallbackResult,
} from './server-extraction'
