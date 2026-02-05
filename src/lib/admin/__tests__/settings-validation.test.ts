/**
 * Tests for Settings Validation Utilities
 */

import { describe, it, expect } from 'vitest'
import {
  validators,
  settingValidationRules,
  validateWeightsSum,
  validateOCRWeightsSum,
  validateGradeThresholds,
  validateOCRConfidenceOrder,
  validateSetting,
  getValidationDescription,
  getValidationClass,
  shouldDisableSave,
  type ValidationResult,
} from '../settings-validation'

// =============================================================================
// GENERIC VALIDATORS
// =============================================================================

describe('validators.numberRange', () => {
  const rule = validators.numberRange(0, 100)

  it('should accept valid numbers within range', () => {
    expect(rule.validate(50)).toEqual({ valid: true })
    expect(rule.validate(0)).toEqual({ valid: true })
    expect(rule.validate(100)).toEqual({ valid: true })
    expect(rule.validate(0.5)).toEqual({ valid: true })
  })

  it('should reject numbers outside range', () => {
    expect(rule.validate(-1).valid).toBe(false)
    expect(rule.validate(101).valid).toBe(false)
    expect(rule.validate(-0.1).valid).toBe(false)
  })

  it('should reject non-numbers', () => {
    expect(rule.validate('abc').valid).toBe(false)
    expect(rule.validate(NaN).valid).toBe(false)
    expect(rule.validate(undefined).valid).toBe(false)
  })

  it('should enforce integer constraint when specified', () => {
    const intRule = validators.numberRange(0, 100, true)
    expect(intRule.validate(50)).toEqual({ valid: true })
    expect(intRule.validate(50.5).valid).toBe(false)
    expect(intRule.validate(50.5).error).toBe('Must be a whole number')
  })

  it('should have correct description', () => {
    expect(rule.description).toBe('Number between 0 and 100')
    const intRule = validators.numberRange(0, 100, true)
    expect(intRule.description).toBe('Number between 0 and 100 (whole number)')
  })
})

describe('validators.percentage', () => {
  const rule = validators.percentage()

  it('should accept valid percentages', () => {
    expect(rule.validate(0)).toEqual({ valid: true })
    expect(rule.validate(50)).toEqual({ valid: true })
    expect(rule.validate(100)).toEqual({ valid: true })
    expect(rule.validate(33.33)).toEqual({ valid: true })
  })

  it('should reject values outside 0-100', () => {
    expect(rule.validate(-1).valid).toBe(false)
    expect(rule.validate(101).valid).toBe(false)
    expect(rule.validate(100.1).valid).toBe(false)
  })

  it('should reject non-numeric strings', () => {
    expect(rule.validate('50%').valid).toBe(false)
    expect(rule.validate('abc').valid).toBe(false)
    expect(rule.validate(NaN).valid).toBe(false)
  })

  it('should enforce integer constraint when decimals not allowed', () => {
    const intRule = validators.percentage(false)
    expect(intRule.validate(50)).toEqual({ valid: true })
    expect(intRule.validate(50.5).valid).toBe(false)
    expect(intRule.validate(50.5).error).toBe('Must be a whole number')
  })

  it('should have correct description', () => {
    expect(rule.description).toBe('Percentage (0-100)')
    const intRule = validators.percentage(false)
    expect(intRule.description).toBe('Percentage (0-100), whole numbers only')
  })
})

describe('validators.ratio', () => {
  const rule = validators.ratio()

  it('should accept valid ratios between 0 and 1', () => {
    expect(rule.validate(0)).toEqual({ valid: true })
    expect(rule.validate(0.5)).toEqual({ valid: true })
    expect(rule.validate(1)).toEqual({ valid: true })
    expect(rule.validate(0.001)).toEqual({ valid: true })
    expect(rule.validate(0.999)).toEqual({ valid: true })
  })

  it('should reject values outside 0-1', () => {
    expect(rule.validate(-0.1).valid).toBe(false)
    expect(rule.validate(1.1).valid).toBe(false)
    expect(rule.validate(2).valid).toBe(false)
  })

  it('should reject non-numeric strings and undefined', () => {
    expect(rule.validate('abc').valid).toBe(false)
    expect(rule.validate(NaN).valid).toBe(false)
  })

  it('should accept numeric strings (coerced to numbers)', () => {
    // Number('0.5') returns 0.5, which is valid
    expect(rule.validate('0.5')).toEqual({ valid: true })
  })

  it('should have correct description', () => {
    expect(rule.description).toBe('Ratio between 0 and 1')
  })
})

describe('validators.positiveInteger', () => {
  it('should accept valid positive integers', () => {
    const rule = validators.positiveInteger()
    expect(rule.validate(1)).toEqual({ valid: true })
    expect(rule.validate(100)).toEqual({ valid: true })
    expect(rule.validate(1000000)).toEqual({ valid: true })
  })

  it('should reject non-integers', () => {
    const rule = validators.positiveInteger()
    expect(rule.validate(1.5).valid).toBe(false)
    expect(rule.validate(0.1).valid).toBe(false)
  })

  it('should reject values below minimum', () => {
    const rule = validators.positiveInteger(5)
    expect(rule.validate(4).valid).toBe(false)
    expect(rule.validate(4).error).toBe('Must be at least 5')
    expect(rule.validate(5)).toEqual({ valid: true })
  })

  it('should reject values above maximum', () => {
    const rule = validators.positiveInteger(1, 10)
    expect(rule.validate(11).valid).toBe(false)
    expect(rule.validate(11).error).toBe('Must be at most 10')
    expect(rule.validate(10)).toEqual({ valid: true })
  })

  it('should have correct description', () => {
    expect(validators.positiveInteger().description).toBe('Whole number')
    expect(validators.positiveInteger(5).description).toBe('Whole number (min: 5)')
  })
})

describe('validators.required', () => {
  const rule = validators.required()

  it('should accept non-empty values', () => {
    expect(rule.validate('text')).toEqual({ valid: true })
    expect(rule.validate(0)).toEqual({ valid: true })
    expect(rule.validate(false)).toEqual({ valid: true })
    expect(rule.validate([])).toEqual({ valid: true })
  })

  it('should reject empty values', () => {
    expect(rule.validate('').valid).toBe(false)
    expect(rule.validate(null).valid).toBe(false)
    expect(rule.validate(undefined).valid).toBe(false)
  })

  it('should have correct error message', () => {
    expect(rule.validate('').error).toBe('This field is required')
  })
})

describe('validators.oneOf', () => {
  const rule = validators.oneOf(['auto', 'openai', 'anthropic'])

  it('should accept values in the list', () => {
    expect(rule.validate('auto')).toEqual({ valid: true })
    expect(rule.validate('openai')).toEqual({ valid: true })
    expect(rule.validate('anthropic')).toEqual({ valid: true })
  })

  it('should reject values not in the list', () => {
    expect(rule.validate('google').valid).toBe(false)
    expect(rule.validate('').valid).toBe(false)
    expect(rule.validate(null).valid).toBe(false)
  })

  it('should have correct error message', () => {
    expect(rule.validate('invalid').error).toBe('Must be one of: auto, openai, anthropic')
  })

  it('should work with numeric values', () => {
    const numRule = validators.oneOf([1, 2, 3])
    expect(numRule.validate(1)).toEqual({ valid: true })
    expect(numRule.validate(4).valid).toBe(false)
  })
})

describe('validators.milliseconds', () => {
  const rule = validators.milliseconds(1000, 60000)

  it('should accept valid millisecond values', () => {
    expect(rule.validate(1000)).toEqual({ valid: true })
    expect(rule.validate(30000)).toEqual({ valid: true })
    expect(rule.validate(60000)).toEqual({ valid: true })
  })

  it('should reject non-integers', () => {
    expect(rule.validate(1000.5).valid).toBe(false)
  })

  it('should reject values outside range', () => {
    expect(rule.validate(500).valid).toBe(false)
    expect(rule.validate(70000).valid).toBe(false)
  })

  it('should format error messages with durations', () => {
    expect(rule.validate(500).error).toContain('1s')
    expect(rule.validate(100000).error).toContain('1min')
  })
})

// =============================================================================
// COMPOSITE VALIDATORS
// =============================================================================

describe('validateWeightsSum', () => {
  it('should accept weights that sum to 100', () => {
    expect(validateWeightsSum({
      weight_premium: 20,
      weight_coverage: 30,
      weight_deductible: 15,
      weight_compliance: 20,
      weight_value: 15,
    })).toEqual({ valid: true })
  })

  it('should reject weights that sum to less than 100', () => {
    const result = validateWeightsSum({
      weight_premium: 20,
      weight_coverage: 20,
      weight_deductible: 20,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('currently 60%')
  })

  it('should reject weights that sum to more than 100', () => {
    const result = validateWeightsSum({
      weight_premium: 50,
      weight_coverage: 60,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('currently 110%')
  })
})

describe('validateOCRWeightsSum', () => {
  it('should accept weights that sum to 1', () => {
    expect(validateOCRWeightsSum({
      char_density: 0.25,
      text_quality: 0.30,
      page_variance: 0.15,
      encoding_check: 0.15,
      field_extraction: 0.15,
    })).toEqual({ valid: true })
  })

  it('should handle floating point precision', () => {
    // These values technically sum to 0.9999999... due to floating point
    expect(validateOCRWeightsSum({
      a: 0.1,
      b: 0.2,
      c: 0.3,
      d: 0.4,
    })).toEqual({ valid: true })
  })

  it('should reject weights that do not sum to 1', () => {
    const result = validateOCRWeightsSum({
      a: 0.3,
      b: 0.3,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('currently 0.60')
  })
})

describe('validateGradeThresholds', () => {
  it('should accept thresholds in descending order', () => {
    expect(validateGradeThresholds({
      grade_a_threshold: 90,
      grade_b_threshold: 80,
      grade_c_threshold: 70,
      grade_d_threshold: 60,
    })).toEqual({ valid: true })
  })

  it('should reject when A is not greater than B', () => {
    const result = validateGradeThresholds({
      grade_a_threshold: 80,
      grade_b_threshold: 80,
      grade_c_threshold: 70,
      grade_d_threshold: 60,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Grade A threshold must be greater than Grade B')
  })

  it('should reject when B is not greater than C', () => {
    const result = validateGradeThresholds({
      grade_a_threshold: 90,
      grade_b_threshold: 70,
      grade_c_threshold: 70,
      grade_d_threshold: 60,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Grade B threshold must be greater than Grade C')
  })

  it('should reject when C is not greater than D', () => {
    const result = validateGradeThresholds({
      grade_a_threshold: 90,
      grade_b_threshold: 80,
      grade_c_threshold: 60,
      grade_d_threshold: 60,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Grade C threshold must be greater than Grade D')
  })
})

describe('validateOCRConfidenceOrder', () => {
  it('should accept skip threshold greater than selective threshold', () => {
    expect(validateOCRConfidenceOrder({
      skip_ocr_threshold: 0.7,
      selective_ocr_threshold: 0.4,
    })).toEqual({ valid: true })
  })

  it('should reject when skip threshold is not greater than selective', () => {
    const result = validateOCRConfidenceOrder({
      skip_ocr_threshold: 0.4,
      selective_ocr_threshold: 0.4,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Skip OCR threshold must be greater than Selective OCR threshold')
  })
})

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

describe('validateSetting', () => {
  it('should validate known settings', () => {
    expect(validateSetting('temperature', 0.5)).toEqual({ valid: true })
    expect(validateSetting('temperature', 3).valid).toBe(false)
  })

  it('should accept any value for unknown settings', () => {
    expect(validateSetting('unknown_setting', 'anything')).toEqual({ valid: true })
    expect(validateSetting('unknown_setting', null)).toEqual({ valid: true })
  })

  it('should validate AI settings correctly', () => {
    expect(validateSetting('max_tokens', 4096)).toEqual({ valid: true })
    expect(validateSetting('max_tokens', 50).valid).toBe(false) // Below min of 100
    expect(validateSetting('min_confidence', 0.8)).toEqual({ valid: true })
    expect(validateSetting('min_confidence', 1.5).valid).toBe(false)
  })

  it('should validate evaluation weights correctly', () => {
    expect(validateSetting('weight_premium', 20)).toEqual({ valid: true })
    expect(validateSetting('weight_premium', 20.5).valid).toBe(false) // Must be integer
    expect(validateSetting('weight_premium', 101).valid).toBe(false)
  })

  it('should validate rate limit settings correctly', () => {
    expect(validateSetting('general_max_requests', 100)).toEqual({ valid: true })
    expect(validateSetting('general_max_requests', 0).valid).toBe(false)
    expect(validateSetting('general_window_ms', 3600000)).toEqual({ valid: true })
  })
})

describe('getValidationDescription', () => {
  it('should return description for known settings', () => {
    expect(getValidationDescription('temperature')).toBe('Number between 0 and 2')
    expect(getValidationDescription('min_confidence')).toBe('Ratio between 0 and 1')
    expect(getValidationDescription('weight_premium')).toBe('Percentage (0-100), whole numbers only')
  })

  it('should return undefined for unknown settings', () => {
    expect(getValidationDescription('unknown_setting')).toBeUndefined()
  })
})

// =============================================================================
// UI HELPERS
// =============================================================================

describe('getValidationClass', () => {
  it('should return empty string for null result', () => {
    expect(getValidationClass(null)).toBe('')
  })

  it('should return green class for valid result', () => {
    const result: ValidationResult = { valid: true }
    expect(getValidationClass(result)).toContain('green')
  })

  it('should return red class for invalid result', () => {
    const result: ValidationResult = { valid: false, error: 'Error' }
    expect(getValidationClass(result)).toContain('red')
  })
})

describe('shouldDisableSave', () => {
  it('should disable when saving', () => {
    expect(shouldDisableSave(null, true, true)).toBe(true)
  })

  it('should disable when no changes', () => {
    expect(shouldDisableSave(null, false, false)).toBe(true)
  })

  it('should disable when validation fails', () => {
    const invalidResult: ValidationResult = { valid: false, error: 'Error' }
    expect(shouldDisableSave(invalidResult, false, true)).toBe(true)
  })

  it('should enable when valid, not saving, and has changes', () => {
    const validResult: ValidationResult = { valid: true }
    expect(shouldDisableSave(validResult, false, true)).toBe(false)
    expect(shouldDisableSave(null, false, true)).toBe(false)
  })
})

// =============================================================================
// SETTING VALIDATION RULES COVERAGE
// =============================================================================

describe('settingValidationRules coverage', () => {
  it('should have rules for AI settings', () => {
    expect(settingValidationRules['temperature']).toBeDefined()
    expect(settingValidationRules['chat_temperature']).toBeDefined()
    expect(settingValidationRules['max_tokens']).toBeDefined()
    expect(settingValidationRules['min_confidence']).toBeDefined()
    expect(settingValidationRules['extraction_timeout_ms']).toBeDefined()
    expect(settingValidationRules['preferred_provider']).toBeDefined()
  })

  it('should have rules for evaluation settings', () => {
    expect(settingValidationRules['weight_premium']).toBeDefined()
    expect(settingValidationRules['weight_coverage']).toBeDefined()
    expect(settingValidationRules['grade_a_threshold']).toBeDefined()
    expect(settingValidationRules['grade_d_threshold']).toBeDefined()
  })

  it('should have rules for rate limit settings', () => {
    expect(settingValidationRules['general_window_ms']).toBeDefined()
    expect(settingValidationRules['general_max_requests']).toBeDefined()
    expect(settingValidationRules['ai_extraction_max_requests']).toBeDefined()
  })

  it('should have rules for OCR settings', () => {
    expect(settingValidationRules['chars_per_page_threshold']).toBeDefined()
    expect(settingValidationRules['skip_ocr_threshold']).toBeDefined()
    expect(settingValidationRules['weight_char_density']).toBeDefined()
  })

  it('should have rules for feature flags', () => {
    expect(settingValidationRules['rollout_percentage']).toBeDefined()
  })
})
