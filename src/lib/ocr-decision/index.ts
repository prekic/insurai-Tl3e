/**
 * OCR Decision Engine
 *
 * Configuration-driven OCR decision system with multi-language
 * and multi-policy-type support.
 */

// Types
export type {
  LocaleConfig,
  UniversalConfig,
  PolicyTypeConfig,
  OCRSettings,
  FieldPattern,
  ConfigurationLoadResult,
  LanguageDetectionResult,
  PolicyTypeClassificationResult,
  DensityAnalysis,
  TextQualityAnalysis,
  FieldExtractionAnalysis,
  FieldExtractionResult,
  ConfidenceScore,
  OCRAction,
  OCRDecision,
} from './types'

// Configuration Manager
export {
  ConfigurationManager,
  getConfigurationManager,
} from './configuration-manager'

// Language Detector
export { LanguageDetector } from './language-detector'

// Policy Type Classifier
export { PolicyTypeClassifier } from './policy-classifier'

// Text Quality Analyzer
export { TextQualityAnalyzer } from './text-quality-analyzer'

// Field Extractor
export { FieldExtractor } from './field-extractor'

// OCR Decision Engine (main entry point)
export {
  OCRDecisionEngine,
  getOCRDecisionEngine,
} from './ocr-decision-engine'
