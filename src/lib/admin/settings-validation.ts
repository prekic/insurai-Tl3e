/**
 * Settings Validation Utilities
 *
 * Client-side validation for admin settings panels.
 * Provides validation rules, error messages, and helpers for each setting type.
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface ValidationRule {
  validate: (value: unknown) => ValidationResult
  description: string
}

// =============================================================================
// GENERIC VALIDATORS
// =============================================================================

export const validators = {
  /**
   * Validate a number is within a range
   */
  numberRange: (min: number, max: number, integer = false): ValidationRule => ({
    validate: (value: unknown): ValidationResult => {
      const num = Number(value)
      if (isNaN(num)) {
        return { valid: false, error: 'Must be a valid number' }
      }
      if (integer && !Number.isInteger(num)) {
        return { valid: false, error: 'Must be a whole number' }
      }
      if (num < min || num > max) {
        return { valid: false, error: `Must be between ${min} and ${max}` }
      }
      return { valid: true }
    },
    description: `Number between ${min} and ${max}${integer ? ' (whole number)' : ''}`,
  }),

  /**
   * Validate a percentage (0-100)
   */
  percentage: (allowDecimals = true): ValidationRule => ({
    validate: (value: unknown): ValidationResult => {
      const num = Number(value)
      if (isNaN(num)) {
        return { valid: false, error: 'Must be a valid number' }
      }
      if (!allowDecimals && !Number.isInteger(num)) {
        return { valid: false, error: 'Must be a whole number' }
      }
      if (num < 0 || num > 100) {
        return { valid: false, error: 'Must be between 0 and 100' }
      }
      return { valid: true }
    },
    description: `Percentage (0-100)${allowDecimals ? '' : ', whole numbers only'}`,
  }),

  /**
   * Validate a ratio (0-1)
   */
  ratio: (): ValidationRule => ({
    validate: (value: unknown): ValidationResult => {
      const num = Number(value)
      if (isNaN(num)) {
        return { valid: false, error: 'Must be a valid number' }
      }
      if (num < 0 || num > 1) {
        return { valid: false, error: 'Must be between 0 and 1' }
      }
      return { valid: true }
    },
    description: 'Ratio between 0 and 1',
  }),

  /**
   * Validate a positive integer
   */
  positiveInteger: (min = 1, max = Number.MAX_SAFE_INTEGER): ValidationRule => ({
    validate: (value: unknown): ValidationResult => {
      const num = Number(value)
      if (isNaN(num) || !Number.isInteger(num)) {
        return { valid: false, error: 'Must be a whole number' }
      }
      if (num < min) {
        return { valid: false, error: `Must be at least ${min}` }
      }
      if (num > max) {
        return { valid: false, error: `Must be at most ${max}` }
      }
      return { valid: true }
    },
    description: `Whole number${min > 1 ? ` (min: ${min})` : ''}`,
  }),

  /**
   * Validate string is not empty
   */
  required: (): ValidationRule => ({
    validate: (value: unknown): ValidationResult => {
      if (value === null || value === undefined || value === '') {
        return { valid: false, error: 'This field is required' }
      }
      return { valid: true }
    },
    description: 'Required field',
  }),

  /**
   * Validate value is one of allowed options
   */
  oneOf: (options: unknown[]): ValidationRule => ({
    validate: (value: unknown): ValidationResult => {
      if (!options.includes(value)) {
        return { valid: false, error: `Must be one of: ${options.join(', ')}` }
      }
      return { valid: true }
    },
    description: `One of: ${options.join(', ')}`,
  }),

  /**
   * Validate milliseconds (time duration)
   */
  milliseconds: (minMs: number, maxMs: number): ValidationRule => ({
    validate: (value: unknown): ValidationResult => {
      const num = Number(value)
      if (isNaN(num) || !Number.isInteger(num)) {
        return { valid: false, error: 'Must be a whole number' }
      }
      if (num < minMs) {
        return { valid: false, error: `Must be at least ${formatDuration(minMs)}` }
      }
      if (num > maxMs) {
        return { valid: false, error: `Must be at most ${formatDuration(maxMs)}` }
      }
      return { valid: true }
    },
    description: `Duration: ${formatDuration(minMs)} to ${formatDuration(maxMs)}`,
  }),
}

// =============================================================================
// SETTING-SPECIFIC VALIDATION RULES
// =============================================================================

export const settingValidationRules: Record<string, ValidationRule> = {
  // AI Settings
  temperature: validators.numberRange(0, 2),
  chat_temperature: validators.numberRange(0, 2),
  max_tokens: validators.positiveInteger(100, 8192),
  min_confidence: validators.ratio(),
  warning_confidence: validators.ratio(),
  extraction_timeout_ms: validators.milliseconds(5000, 300000),
  max_retries: validators.positiveInteger(0, 10),
  retry_delay_ms: validators.milliseconds(100, 30000),
  consensus_agreement_threshold: validators.ratio(),
  preferred_provider: validators.oneOf(['auto', 'openai', 'anthropic']),

  // Confidence Scoring Weights (must sum to 1.0)
  confidence_weight_policy_number: validators.ratio(),
  confidence_weight_provider: validators.ratio(),
  confidence_weight_dates: validators.ratio(),
  confidence_weight_premium: validators.ratio(),
  confidence_weight_coverages: validators.ratio(),

  // Evaluation Settings - Weights
  weight_premium: validators.percentage(false),
  weight_coverage: validators.percentage(false),
  weight_deductible: validators.percentage(false),
  weight_compliance: validators.percentage(false),
  weight_value: validators.percentage(false),

  // Evaluation Settings - Grade Thresholds
  grade_a_threshold: validators.percentage(false),
  grade_b_threshold: validators.percentage(false),
  grade_c_threshold: validators.percentage(false),
  grade_d_threshold: validators.percentage(false),

  // Rate Limits
  general_window_ms: validators.milliseconds(1000, 86400000),
  general_max_requests: validators.positiveInteger(1, 10000),
  ai_extraction_window_ms: validators.milliseconds(1000, 86400000),
  ai_extraction_max_requests: validators.positiveInteger(1, 1000),
  ocr_window_ms: validators.milliseconds(1000, 86400000),
  ocr_max_requests: validators.positiveInteger(1, 1000),
  chat_window_ms: validators.milliseconds(1000, 86400000),
  chat_max_requests: validators.positiveInteger(1, 1000),
  health_window_ms: validators.milliseconds(1000, 86400000),
  health_max_requests: validators.positiveInteger(1, 1000),
  auth_window_ms: validators.milliseconds(1000, 86400000),
  auth_max_attempts: validators.positiveInteger(1, 100),

  // OCR Settings - Thresholds
  chars_per_page_threshold: validators.positiveInteger(10, 10000),
  min_pages_for_average: validators.positiveInteger(1, 20),
  page_variance_threshold: validators.ratio(),
  min_chars_for_valid_page: validators.positiveInteger(1, 1000),
  skip_ocr_threshold: validators.ratio(),
  selective_ocr_threshold: validators.ratio(),

  // OCR Settings - Weights
  weight_char_density: validators.ratio(),
  weight_text_quality: validators.ratio(),
  weight_page_variance: validators.ratio(),
  weight_encoding_check: validators.ratio(),
  weight_field_extraction: validators.ratio(),

  // OCR Settings - Provider Confidence
  google_vision_confidence: validators.ratio(),
  tesseract_confidence: validators.ratio(),
  language_min_confidence: validators.ratio(),
  policy_type_min_confidence: validators.ratio(),

  // OCR Settings - Quality
  min_word_length_average: validators.positiveInteger(1, 10),
  max_garbage_char_ratio: validators.ratio(),
  min_alphanumeric_ratio: validators.ratio(),
  max_pages_quick_analysis: validators.positiveInteger(1, 50),
  timeout_seconds: validators.positiveInteger(1, 300),
  max_text_length: validators.positiveInteger(1000, 10000000),

  // Feature Flags
  rollout_percentage: validators.percentage(false),

  // Phase 1: Extraction Timeouts (ai category)
  request_budget_ms: validators.milliseconds(10000, 600000),
  primary_provider_timeout_ms: validators.milliseconds(5000, 300000),
  fallback_provider_timeout_ms: validators.milliseconds(5000, 300000),
  client_fetch_timeout_ms: validators.milliseconds(10000, 600000),
  trial_extraction_timeout_ms: validators.milliseconds(10000, 600000),

  // Phase 2: FX Settings
  server_cache_ttl_ms: validators.milliseconds(60000, 86400000),
  api_timeout_ms: validators.milliseconds(1000, 60000),
  client_cache_ttl_ms: validators.milliseconds(60000, 86400000),

  // Phase 3: Service Cache TTLs (server category)
  db_query_timeout_ms: validators.milliseconds(1000, 60000),
  config_cache_ttl_ms: validators.milliseconds(10000, 3600000),
  prompt_cache_ttl_ms: validators.milliseconds(10000, 3600000),
  translation_cache_ttl_ms: validators.milliseconds(10000, 3600000),
  rate_limit_config_cache_ttl_ms: validators.milliseconds(5000, 3600000),

  // Phase 4: Webhook Delivery Config
  max_delivery_attempts: validators.positiveInteger(1, 20),
  delivery_timeout_ms: validators.milliseconds(1000, 120000),
  max_response_body_length: validators.positiveInteger(100, 100000),

  // Phase 5: OCR Pipeline
  pdf_load_timeout_ms: validators.milliseconds(5000, 120000),
  max_worker_failures: validators.positiveInteger(1, 10),
  ocr_cleanup_timeout_ms: validators.milliseconds(5000, 120000),

  // Phase 7: UI / Trial
  trial_expiry_ms: validators.milliseconds(3600000, 604800000),

  // Monitoring Buffers
  extraction_buffer_size: validators.positiveInteger(10, 10000),
  max_metrics_buffer_size: validators.positiveInteger(100, 100000),
  max_alert_history: validators.positiveInteger(10, 100000),
  max_response_times: validators.positiveInteger(10, 100000),
  server_perf_max_events: validators.positiveInteger(10, 10000),
  server_perf_max_age_ms: validators.milliseconds(60000, 86400000),
}

// =============================================================================
// COMPOSITE VALIDATORS
// =============================================================================

/**
 * Validate that weights sum to 100
 */
export function validateWeightsSum(weights: Record<string, number>): ValidationResult {
  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0)
  if (sum !== 100) {
    return {
      valid: false,
      error: `Weights must sum to 100% (currently ${sum}%)`,
    }
  }
  return { valid: true }
}

/**
 * Validate that OCR weights sum to 1
 */
export function validateOCRWeightsSum(weights: Record<string, number>): ValidationResult {
  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0)
  const roundedSum = Math.round(sum * 100) / 100
  if (roundedSum !== 1) {
    return {
      valid: false,
      error: `Weights must sum to 1.0 (currently ${roundedSum.toFixed(2)})`,
    }
  }
  return { valid: true }
}

/**
 * Validate that confidence scoring weights sum to 1
 */
export function validateConfidenceWeightsSum(weights: Record<string, number>): ValidationResult {
  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0)
  const roundedSum = Math.round(sum * 100) / 100
  if (roundedSum !== 1) {
    return {
      valid: false,
      error: `Confidence weights must sum to 1.0 (currently ${roundedSum.toFixed(2)})`,
    }
  }
  return { valid: true }
}

/**
 * Validate that grade thresholds are in descending order
 */
export function validateGradeThresholds(thresholds: {
  grade_a_threshold: number
  grade_b_threshold: number
  grade_c_threshold: number
  grade_d_threshold: number
}): ValidationResult {
  const { grade_a_threshold, grade_b_threshold, grade_c_threshold, grade_d_threshold } = thresholds

  if (grade_a_threshold <= grade_b_threshold) {
    return { valid: false, error: 'Grade A threshold must be greater than Grade B' }
  }
  if (grade_b_threshold <= grade_c_threshold) {
    return { valid: false, error: 'Grade B threshold must be greater than Grade C' }
  }
  if (grade_c_threshold <= grade_d_threshold) {
    return { valid: false, error: 'Grade C threshold must be greater than Grade D' }
  }

  return { valid: true }
}

/**
 * Validate OCR confidence thresholds are in correct order
 */
export function validateOCRConfidenceOrder(thresholds: {
  skip_ocr_threshold: number
  selective_ocr_threshold: number
}): ValidationResult {
  if (thresholds.skip_ocr_threshold <= thresholds.selective_ocr_threshold) {
    return {
      valid: false,
      error: 'Skip OCR threshold must be greater than Selective OCR threshold',
    }
  }
  return { valid: true }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate a single setting value
 */
export function validateSetting(key: string, value: unknown): ValidationResult {
  const rule = settingValidationRules[key]
  if (!rule) {
    // No specific validation rule, accept any value
    return { valid: true }
  }
  return rule.validate(value)
}

/**
 * Get the validation description for a setting
 */
export function getValidationDescription(key: string): string | undefined {
  return settingValidationRules[key]?.description
}

/**
 * Format milliseconds as human-readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${ms / 1000}s`
  if (ms < 3600000) return `${ms / 60000}min`
  return `${ms / 3600000}hr`
}

// =============================================================================
// UI HELPERS
// =============================================================================

/**
 * Get validation state class for input styling
 */
export function getValidationClass(result: ValidationResult | null): string {
  if (!result) return ''
  return result.valid
    ? 'border-green-300 focus:ring-green-500'
    : 'border-red-300 focus:ring-red-500'
}

/**
 * Check if save should be disabled based on validation
 */
export function shouldDisableSave(
  validationResult: ValidationResult | null,
  isSaving: boolean,
  hasChanges: boolean
): boolean {
  if (isSaving) return true
  if (!hasChanges) return true
  if (validationResult && !validationResult.valid) return true
  return false
}
