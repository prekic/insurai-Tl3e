/**
 * OCR Decision Engine Types
 *
 * Type definitions for the configuration-driven OCR decision system.
 */

// ============ LOCALE CONFIGURATION TYPES ============

export interface LocaleConfig {
  locale_code: string
  locale_name: string
  language_detection: {
    sample_terms: string[]
    min_matches_for_detection: number
    character_sets: string[]
    special_characters: string[]
  }
  encoding_validation: {
    expected_characters: string
    garbage_patterns: string[]
  }
  insurance_terminology: {
    core_terms: string[]
    document_structure_terms: string[]
    common_values: string[]
  }
  date_formats: string[]
  date_patterns: string[]
  currency: {
    code: string
    symbol: string
    patterns: string[]
    decimal_separator: string
    thousands_separator: string
  }
  number_formats: {
    decimal_separator: string
    thousands_separator: string
    patterns: string[]
  }
  identifiers?: Record<string, {
    name: string
    pattern: string
    description: string
  }>
}

export interface UniversalConfig {
  locale_code: '_universal'
  locale_name: string
  description: string
  universal_patterns: {
    numbers: string[]
    dates: string[]
    percentages: string[]
    emails: string[]
    phone_numbers: string[]
    urls: string[]
    policy_numbers?: string[]
    date_ranges?: string[]
  }
  currency_symbols: string[]
  common_abbreviations: string[]
  insurance_indicators?: {
    document_type_hints: string[]
    coverage_indicators: string[]
    premium_indicators: string[]
  }
}

// ============ POLICY TYPE CONFIGURATION TYPES ============

export interface FieldPattern {
  required?: boolean
  criticality?: 'high' | 'medium' | 'low'
  patterns?: Record<string, string[]>  // Optional when inherit_from is used
  validation?: {
    min_length?: number
    max_length?: number
    pattern?: string
    type?: 'currency' | 'date' | 'date_range' | 'identifier'
    min_value?: number
  }
  sub_fields?: Record<string, Omit<FieldPattern, 'sub_fields'>>
  inherit_from?: string  // Reference to parent config field (e.g., "_motor_base.shared_fields.vehicle_plate")
}

export interface PolicyTypeConfig {
  policy_type_id: string
  policy_type_name: string
  description: string
  category: string
  parent_config?: string
  version: string
  is_base_config?: boolean

  classification?: {
    detection_terms: Record<string, string[]>
    confidence_threshold: number
    exclude_if_contains?: Record<string, string[]>
    is_fallback?: boolean
  }

  required_fields?: Record<string, FieldPattern>
  optional_fields?: Record<string, FieldPattern>

  coverage_sections?: Record<string, {
    detection_terms: Record<string, string[]>
  }>

  implicit_coverages?: Record<string, string[]>

  shared_fields?: Record<string, FieldPattern>

  document_structure?: {
    expected_sections?: string[]
    min_pages?: number
    typical_page_range?: [number, number] | number[]
  }

  quality_thresholds?: {
    min_required_fields_rate: number
    min_quality_score: number
    ocr_trigger_confidence: number
  }

  regulatory_info?: Record<string, {
    regulator: string
    law?: string
    mandatory?: boolean
  }>
}

// ============ OCR SETTINGS TYPES ============

export interface OCRSettings {
  version: string
  last_updated: string

  density_analysis: {
    chars_per_page_threshold: number
    min_pages_for_average_calculation: number
    enable_page_level_analysis: boolean
    page_variance_threshold: number
    min_chars_for_valid_page: number
  }

  confidence_calculation: {
    weights: {
      char_density: number
      text_quality: number
      page_variance: number
      encoding_check: number
      field_extraction: number
    }
    thresholds: {
      skip_ocr: number
      selective_ocr: number
      full_ocr: number
    }
  }

  ocr_providers: {
    primary: string
    fallback: string
    available: Record<string, {
      enabled: boolean
      languages: string[]
      confidence_threshold: number
      max_pages?: number
      form_parsing?: boolean
      table_parsing?: boolean
    }>
  }

  language_detection: {
    enabled: boolean
    min_confidence: number
    fallback_locale: string
    supported_locales: string[]
    multi_language_support: boolean
    sample_size?: number
  }

  policy_type_detection: {
    enabled: boolean
    min_confidence: number
    fallback_type: string
    use_ml_classifier: boolean
  }

  performance: {
    max_pages_for_quick_analysis: number
    timeout_seconds: number
    parallel_page_processing: boolean
    cache_extracted_text: boolean
    max_text_length?: number
  }

  feedback_logging: {
    enabled: boolean
    log_level: 'minimal' | 'standard' | 'detailed'
    track_extraction_failures: boolean
    improvement_threshold: number
  }

  quality_checks?: {
    min_word_length_average: number
    max_garbage_char_ratio: number
    min_alphanumeric_ratio: number
    check_encoding_issues: boolean
  }
}

// ============ ANALYSIS RESULT TYPES ============

export interface LanguageDetectionResult {
  locale_code: string
  confidence: number
  method: 'term_matching' | 'character_detection' | 'fallback'
  all_scores: Record<string, {
    term_score: number
    char_score: number
    combined: number
    term_matches: number
    char_matches: number
  }>
  runner_up?: {
    locale: string
    confidence: number
  }
}

export interface PolicyTypeClassificationResult {
  policy_type_id: string
  policy_type_name: string
  category: string
  confidence: number
  matched_terms: string[]
  all_scores: Record<string, {
    score: number
    excluded: boolean
    matches: string[]
    threshold?: number
  }>
}

export interface DensityAnalysis {
  total_pages: number
  total_characters: number
  average_chars_per_page: number
  threshold_used: number
  page_details: Array<{
    page: number
    chars: number
    needs_ocr: boolean
  }>
  pages_below_threshold: number[]
  min_chars_page: { page: number; chars: number }
  max_chars_page: { page: number; chars: number }
  variance?: number
}

export interface TextQualityAnalysis {
  quality_score: number
  terms_found: number
  terms_checked: number
  found_terms_sample: string[]
  encoding_issues: boolean
  encoding_issues_found?: string[]
  locale_used: string
  min_quality_threshold: number
  recommendation: 'proceed' | 'consider_ocr' | 'require_ocr'
}

export interface FieldExtractionResult {
  found: boolean
  value: string | null
  required: boolean
  patterns_tried: number
  matched_pattern?: string
}

export interface FieldExtractionAnalysis {
  fields_checked: number
  fields_found: number
  required_fields_found: number
  required_fields_total: number
  extraction_rate: number
  min_rate_threshold: number
  field_results: Record<string, FieldExtractionResult>
  recommendation: 'proceed' | 'consider_ocr' | 'require_ocr'
}

export interface ConfidenceScore {
  overall: number
  component_scores: {
    char_density: number
    text_quality: number
    page_variance: number
    encoding_check: number
    field_extraction: number
  }
  weights_used: {
    char_density: number
    text_quality: number
    page_variance: number
    encoding_check: number
    field_extraction: number
  }
}

export type OCRAction = 'skip_ocr' | 'selective_ocr' | 'full_ocr'

export interface OCRDecision {
  action: OCRAction
  confidence: number
  mode: 'page_level_analysis' | 'document_level_analysis'
  pages_to_ocr: number[]

  document_classification: {
    detected_language: LanguageDetectionResult
    detected_policy_type: PolicyTypeClassificationResult
  }

  configurations_used: {
    locale_config: string
    policy_config: string
    ocr_settings_version: string
  }

  analysis: {
    density: DensityAnalysis
    text_quality: TextQualityAnalysis
    field_extraction: FieldExtractionAnalysis
    confidence_breakdown: ConfidenceScore
  }

  reasoning: string[]
  timestamp: string
  duration_ms: number
}

// ============ HELPER TYPES ============

export interface ConfigurationLoadResult {
  success: boolean
  locales: Record<string, LocaleConfig | UniversalConfig>
  policy_types: Record<string, PolicyTypeConfig>
  ocr_settings: OCRSettings
  errors?: string[]
}
