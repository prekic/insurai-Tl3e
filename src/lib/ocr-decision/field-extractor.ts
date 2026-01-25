/**
 * Field Extractor
 *
 * Tests field extraction to validate whether OCR is needed
 * by attempting to extract required fields from the text.
 */

import type {
  PolicyTypeConfig,
  FieldExtractionAnalysis,
  FieldExtractionResult,
} from './types'
import type { ConfigurationManager } from './configuration-manager'

export class FieldExtractor {
  private configManager: ConfigurationManager

  constructor(configManager: ConfigurationManager) {
    this.configManager = configManager
  }

  /**
   * Test extraction of required fields
   */
  testExtraction(
    text: string,
    policyConfig: PolicyTypeConfig,
    localeCode: string
  ): FieldExtractionAnalysis {
    const requiredFields = policyConfig.required_fields || {}
    const results: Record<string, FieldExtractionResult> = {}
    let requiredFound = 0
    let requiredTotal = 0

    for (const [fieldName, fieldConfig] of Object.entries(requiredFields)) {
      const isRequired = fieldConfig.required !== false
      const patterns = this.configManager.getPatternsForField(
        policyConfig,
        fieldName,
        localeCode
      )

      let found = false
      let matchedValue: string | null = null
      let matchedPattern: string | undefined

      for (const pattern of patterns) {
        try {
          const regex = new RegExp(pattern, 'im')
          const match = regex.exec(text)
          if (match) {
            found = true
            matchedValue = match[1] || match[0]
            matchedPattern = pattern
            break
          }
        } catch {
          // Invalid regex, skip
        }
      }

      results[fieldName] = {
        found,
        value: matchedValue ? matchedValue.substring(0, 100).trim() : null,
        required: isRequired,
        patterns_tried: patterns.length,
        matched_pattern: matchedPattern,
      }

      if (isRequired) {
        requiredTotal++
        if (found) {
          requiredFound++
        }
      }
    }

    const extractionRate = requiredTotal > 0 ? requiredFound / requiredTotal : 0
    const minRate = policyConfig.quality_thresholds?.min_required_fields_rate || 0.75

    // Determine recommendation
    let recommendation: 'proceed' | 'consider_ocr' | 'require_ocr' = 'proceed'

    if (extractionRate < minRate) {
      recommendation = 'consider_ocr'
    }

    if (extractionRate < minRate * 0.5) {
      recommendation = 'require_ocr'
    }

    return {
      fields_checked: Object.keys(requiredFields).length,
      fields_found: Object.values(results).filter(r => r.found).length,
      required_fields_found: requiredFound,
      required_fields_total: requiredTotal,
      extraction_rate: Math.round(extractionRate * 100) / 100,
      min_rate_threshold: minRate,
      field_results: results,
      recommendation,
    }
  }

  /**
   * Extract a single field
   */
  extractField(
    text: string,
    policyConfig: PolicyTypeConfig,
    fieldName: string,
    localeCode: string
  ): FieldExtractionResult {
    const patterns = this.configManager.getPatternsForField(
      policyConfig,
      fieldName,
      localeCode
    )

    const fieldConfig = this.configManager.getFieldConfig(policyConfig, fieldName)
    const isRequired = fieldConfig?.required !== false

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'im')
        const match = regex.exec(text)
        if (match) {
          return {
            found: true,
            value: (match[1] || match[0]).trim().substring(0, 100),
            required: isRequired,
            patterns_tried: patterns.length,
            matched_pattern: pattern,
          }
        }
      } catch {
        // Invalid regex, skip
      }
    }

    return {
      found: false,
      value: null,
      required: isRequired,
      patterns_tried: patterns.length,
    }
  }

  /**
   * Extract all fields (required + optional)
   */
  extractAllFields(
    text: string,
    policyConfig: PolicyTypeConfig,
    localeCode: string
  ): Record<string, FieldExtractionResult> {
    const results: Record<string, FieldExtractionResult> = {}

    // Extract required fields
    if (policyConfig.required_fields) {
      for (const fieldName of Object.keys(policyConfig.required_fields)) {
        results[fieldName] = this.extractField(text, policyConfig, fieldName, localeCode)
      }
    }

    // Extract optional fields
    if (policyConfig.optional_fields) {
      for (const fieldName of Object.keys(policyConfig.optional_fields)) {
        results[fieldName] = this.extractField(text, policyConfig, fieldName, localeCode)
      }
    }

    return results
  }

  /**
   * Get extraction summary with details
   */
  getExtractionSummary(
    text: string,
    policyConfig: PolicyTypeConfig,
    localeCode: string
  ): {
    analysis: FieldExtractionAnalysis
    extracted_values: Record<string, string | null>
    missing_required: string[]
    missing_optional: string[]
    patterns_used: Record<string, string | undefined>
  } {
    const analysis = this.testExtraction(text, policyConfig, localeCode)

    const extractedValues: Record<string, string | null> = {}
    const missingRequired: string[] = []
    const missingOptional: string[] = []
    const patternsUsed: Record<string, string | undefined> = {}

    for (const [fieldName, result] of Object.entries(analysis.field_results)) {
      extractedValues[fieldName] = result.value
      patternsUsed[fieldName] = result.matched_pattern

      if (!result.found) {
        if (result.required) {
          missingRequired.push(fieldName)
        } else {
          missingOptional.push(fieldName)
        }
      }
    }

    // Also check optional fields
    if (policyConfig.optional_fields) {
      for (const fieldName of Object.keys(policyConfig.optional_fields)) {
        if (!(fieldName in analysis.field_results)) {
          const result = this.extractField(text, policyConfig, fieldName, localeCode)
          extractedValues[fieldName] = result.value
          patternsUsed[fieldName] = result.matched_pattern

          if (!result.found) {
            missingOptional.push(fieldName)
          }
        }
      }
    }

    return {
      analysis,
      extracted_values: extractedValues,
      missing_required: missingRequired,
      missing_optional: missingOptional,
      patterns_used: patternsUsed,
    }
  }

  /**
   * Test pattern against text (for debugging)
   */
  testPattern(
    text: string,
    pattern: string
  ): {
    matches: boolean
    value: string | null
    fullMatch: string | null
    groups: string[]
  } {
    try {
      const regex = new RegExp(pattern, 'im')
      const match = regex.exec(text)

      if (match) {
        return {
          matches: true,
          value: match[1] || match[0],
          fullMatch: match[0],
          groups: match.slice(1),
        }
      }
    } catch {
      // Invalid regex
    }

    return {
      matches: false,
      value: null,
      fullMatch: null,
      groups: [],
    }
  }

  /**
   * Find all matches for a pattern in text
   */
  findAllMatches(
    text: string,
    pattern: string
  ): Array<{ match: string; value: string; index: number }> {
    const results: Array<{ match: string; value: string; index: number }> = []

    try {
      const regex = new RegExp(pattern, 'gim')
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        results.push({
          match: match[0],
          value: match[1] || match[0],
          index: match.index,
        })

        // Prevent infinite loop for zero-width matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++
        }
      }
    } catch {
      // Invalid regex
    }

    return results
  }

  /**
   * Get critical fields status
   */
  getCriticalFieldsStatus(
    text: string,
    policyConfig: PolicyTypeConfig,
    localeCode: string
  ): {
    allCriticalFound: boolean
    criticalFieldsFound: string[]
    criticalFieldsMissing: string[]
    status: 'good' | 'warning' | 'critical'
  } {
    const criticalFieldsFound: string[] = []
    const criticalFieldsMissing: string[] = []
    const requiredFields = policyConfig.required_fields || {}

    for (const [fieldName, fieldConfig] of Object.entries(requiredFields)) {
      if (fieldConfig.criticality === 'high') {
        const result = this.extractField(text, policyConfig, fieldName, localeCode)
        if (result.found) {
          criticalFieldsFound.push(fieldName)
        } else {
          criticalFieldsMissing.push(fieldName)
        }
      }
    }

    const total = criticalFieldsFound.length + criticalFieldsMissing.length
    const foundRatio = total > 0 ? criticalFieldsFound.length / total : 1

    let status: 'good' | 'warning' | 'critical' = 'good'
    if (foundRatio < 0.75) status = 'warning'
    if (foundRatio < 0.5) status = 'critical'

    return {
      allCriticalFound: criticalFieldsMissing.length === 0,
      criticalFieldsFound,
      criticalFieldsMissing,
      status,
    }
  }
}
