/**
 * Configuration Manager
 *
 * Manages loading and caching of all configuration files for the OCR decision engine.
 * Supports hot-reloading and fallback configurations.
 */

import type {
  LocaleConfig,
  UniversalConfig,
  PolicyTypeConfig,
  OCRSettings,
  FieldPattern,
  ConfigurationLoadResult,
} from './types'
import type { OCRConfig } from '@/lib/config/types'

// Import configuration files statically (for browser compatibility)
import trLocale from '../../../config/locales/tr.json'
import enLocale from '../../../config/locales/en.json'
import deLocale from '../../../config/locales/de.json'
import universalLocale from '../../../config/locales/_universal.json'

import genericPolicy from '../../../config/policy_types/_generic.json'
import motorBasePolicy from '../../../config/policy_types/motor/_motor_base.json'
import kaskoPolicy from '../../../config/policy_types/motor/kasko.json'
import trafficPolicy from '../../../config/policy_types/motor/traffic.json'
import firePolicy from '../../../config/policy_types/property/fire.json'
import healthPolicy from '../../../config/policy_types/health/health.json'

import ocrSettings from '../../../config/ocr_settings.json'

/**
 * Deep merge two objects, with child values overriding parent values
 */
function deepMerge<T extends object>(parent: T, child: Partial<T>): T {
  const result = { ...parent }

  for (const key of Object.keys(child) as Array<keyof T>) {
    const childValue = child[key]
    const parentValue = result[key]

    if (
      childValue !== undefined &&
      typeof childValue === 'object' &&
      childValue !== null &&
      !Array.isArray(childValue) &&
      typeof parentValue === 'object' &&
      parentValue !== null &&
      !Array.isArray(parentValue)
    ) {
      result[key] = deepMerge(
        parentValue as Record<string, unknown>,
        childValue as Record<string, unknown>
      ) as T[keyof T]
    } else if (childValue !== undefined) {
      result[key] = childValue as T[keyof T]
    }
  }

  return result
}

export class ConfigurationManager {
  private locales: Map<string, LocaleConfig | UniversalConfig> = new Map()
  private policyTypes: Map<string, PolicyTypeConfig> = new Map()
  private ocrSettings: OCRSettings
  private baseOcrSettings: OCRSettings // Keep original JSON settings for merging
  private loadErrors: string[] = []
  private lastLoadTime: Date = new Date()
  private databaseConfigApplied: boolean = false

  constructor() {
    this.baseOcrSettings = ocrSettings as OCRSettings
    this.ocrSettings = this.baseOcrSettings
    this.loadAllConfigurations()
  }

  /**
   * Convert flat database OCRConfig to nested OCRSettings format.
   * Merges database values with the base JSON settings.
   */
  private applyDatabaseConfig(dbConfig: OCRConfig): OCRSettings {
    // Start with a deep copy of the base settings
    const settings: OCRSettings = JSON.parse(JSON.stringify(this.baseOcrSettings))

    // Apply density analysis settings
    if (dbConfig.charsPerPageThreshold !== undefined) {
      settings.density_analysis.chars_per_page_threshold = dbConfig.charsPerPageThreshold
    }
    if (dbConfig.minPagesForAverage !== undefined) {
      settings.density_analysis.min_pages_for_average_calculation = dbConfig.minPagesForAverage
    }
    if (dbConfig.pageVarianceThreshold !== undefined) {
      settings.density_analysis.page_variance_threshold = dbConfig.pageVarianceThreshold
    }
    if (dbConfig.minCharsForValidPage !== undefined) {
      settings.density_analysis.min_chars_for_valid_page = dbConfig.minCharsForValidPage
    }

    // Apply confidence thresholds
    if (dbConfig.skipOcrThreshold !== undefined) {
      settings.confidence_calculation.thresholds.skip_ocr = dbConfig.skipOcrThreshold
    }
    if (dbConfig.selectiveOcrThreshold !== undefined) {
      settings.confidence_calculation.thresholds.selective_ocr = dbConfig.selectiveOcrThreshold
    }

    // Apply confidence weights
    if (dbConfig.weightCharDensity !== undefined) {
      settings.confidence_calculation.weights.char_density = dbConfig.weightCharDensity
    }
    if (dbConfig.weightTextQuality !== undefined) {
      settings.confidence_calculation.weights.text_quality = dbConfig.weightTextQuality
    }
    if (dbConfig.weightPageVariance !== undefined) {
      settings.confidence_calculation.weights.page_variance = dbConfig.weightPageVariance
    }
    if (dbConfig.weightEncodingCheck !== undefined) {
      settings.confidence_calculation.weights.encoding_check = dbConfig.weightEncodingCheck
    }
    if (dbConfig.weightFieldExtraction !== undefined) {
      settings.confidence_calculation.weights.field_extraction = dbConfig.weightFieldExtraction
    }

    // Apply provider confidence thresholds
    if (
      dbConfig.googleVisionConfidence !== undefined &&
      settings.ocr_providers.available.google_vision
    ) {
      settings.ocr_providers.available.google_vision.confidence_threshold =
        dbConfig.googleVisionConfidence
    }
    if (dbConfig.tesseractConfidence !== undefined && settings.ocr_providers.available.tesseract) {
      settings.ocr_providers.available.tesseract.confidence_threshold = dbConfig.tesseractConfidence
    }

    // Apply language detection settings
    if (dbConfig.languageMinConfidence !== undefined) {
      settings.language_detection.min_confidence = dbConfig.languageMinConfidence
    }
    if (dbConfig.languageSampleSize !== undefined) {
      settings.language_detection.sample_size = dbConfig.languageSampleSize
    }

    // Apply policy type detection settings
    if (dbConfig.policyTypeMinConfidence !== undefined) {
      settings.policy_type_detection.min_confidence = dbConfig.policyTypeMinConfidence
    }

    // Apply quality check settings
    if (settings.quality_checks) {
      if (dbConfig.minWordLengthAverage !== undefined) {
        settings.quality_checks.min_word_length_average = dbConfig.minWordLengthAverage
      }
      if (dbConfig.maxGarbageCharRatio !== undefined) {
        settings.quality_checks.max_garbage_char_ratio = dbConfig.maxGarbageCharRatio
      }
      if (dbConfig.minAlphanumericRatio !== undefined) {
        settings.quality_checks.min_alphanumeric_ratio = dbConfig.minAlphanumericRatio
      }
    }

    // Apply performance settings
    if (dbConfig.maxPagesQuickAnalysis !== undefined) {
      settings.performance.max_pages_for_quick_analysis = dbConfig.maxPagesQuickAnalysis
    }
    if (dbConfig.timeoutSeconds !== undefined) {
      settings.performance.timeout_seconds = dbConfig.timeoutSeconds
    }
    if (dbConfig.maxTextLength !== undefined) {
      settings.performance.max_text_length = dbConfig.maxTextLength
    }

    return settings
  }

  /**
   * Update OCR settings from database configuration.
   * Call this to apply admin-configured settings from the database.
   */
  updateFromDatabaseConfig(dbConfig: OCRConfig): void {
    this.ocrSettings = this.applyDatabaseConfig(dbConfig)
    this.databaseConfigApplied = true
    console.warn('[ConfigurationManager] OCR settings updated from database config')
  }

  /**
   * Check if database configuration has been applied
   */
  isDatabaseConfigApplied(): boolean {
    return this.databaseConfigApplied
  }

  /**
   * Reset to base JSON settings (useful for testing or when database is unavailable)
   */
  resetToBaseSettings(): void {
    this.ocrSettings = this.baseOcrSettings
    this.databaseConfigApplied = false
    console.warn('[ConfigurationManager] OCR settings reset to base JSON configuration')
  }

  /**
   * Load all configuration files
   */
  private loadAllConfigurations(): void {
    this.loadErrors = []
    this.loadLocales()
    this.loadPolicyTypes()
    this.lastLoadTime = new Date()
  }

  /**
   * Load all locale configurations
   */
  private loadLocales(): void {
    const localeConfigs: Array<LocaleConfig | UniversalConfig> = [
      trLocale as LocaleConfig,
      enLocale as LocaleConfig,
      deLocale as LocaleConfig,
      universalLocale as UniversalConfig,
    ]

    for (const config of localeConfigs) {
      this.locales.set(config.locale_code, config)
    }
  }

  /**
   * Load all policy type configurations with parent inheritance
   */
  private loadPolicyTypes(): void {
    // JSON imports are typed as their inferred literal shape, which has
    // legitimate structural drift from PolicyTypeConfig (e.g., some JSON
    // blocks use `{ tr, en, description }` where the type declares
    // `Record<string, string[]>`). The canonical fix is runtime schema
    // validation (Zod) — tracked as follow-up work. Until then these six
    // casts are the documented boundary between "raw JSON" and "typed config".
    /* eslint-disable no-restricted-syntax */
    const baseConfigs: PolicyTypeConfig[] = [
      genericPolicy as unknown as PolicyTypeConfig,
      motorBasePolicy as unknown as PolicyTypeConfig,
    ]

    for (const config of baseConfigs) {
      this.policyTypes.set(config.policy_type_id, config)
    }

    // Load specific policy types with inheritance
    const specificConfigs: PolicyTypeConfig[] = [
      kaskoPolicy as unknown as PolicyTypeConfig,
      trafficPolicy as unknown as PolicyTypeConfig,
      firePolicy as unknown as PolicyTypeConfig,
      healthPolicy as unknown as PolicyTypeConfig,
    ]
    /* eslint-enable no-restricted-syntax */

    for (const config of specificConfigs) {
      let finalConfig = config

      // Apply parent config inheritance
      if (config.parent_config) {
        const parent = this.policyTypes.get(config.parent_config)
        if (parent) {
          finalConfig = deepMerge<PolicyTypeConfig>(parent, config)
          // Ensure the child's ID is preserved
          finalConfig.policy_type_id = config.policy_type_id
          finalConfig.policy_type_name = config.policy_type_name
          // Child configs should not inherit is_base_config from parent
          finalConfig.is_base_config = false
        }
      }

      this.policyTypes.set(finalConfig.policy_type_id, finalConfig)
    }
  }

  /**
   * Get locale configuration with fallback to universal
   */
  getLocale(localeCode: string): LocaleConfig | UniversalConfig {
    const locale = this.locales.get(localeCode)
    if (locale) return locale

    // Return universal fallback
    const universal = this.locales.get('_universal')
    if (universal) return universal

    // Return a minimal fallback if nothing else exists
    return {
      locale_code: localeCode,
      locale_name: 'Unknown',
      language_detection: {
        sample_terms: [],
        min_matches_for_detection: 3,
        character_sets: ['latin'],
        special_characters: [],
      },
      encoding_validation: {
        expected_characters: 'a-zA-Z0-9',
        garbage_patterns: [],
      },
      insurance_terminology: {
        core_terms: [],
        document_structure_terms: [],
        common_values: [],
      },
      date_formats: ['DD/MM/YYYY'],
      date_patterns: ['\\d{2}/\\d{2}/\\d{4}'],
      currency: {
        code: 'USD',
        symbol: '$',
        patterns: [],
        decimal_separator: '.',
        thousands_separator: ',',
      },
      number_formats: {
        decimal_separator: '.',
        thousands_separator: ',',
        patterns: [],
      },
    }
  }

  /**
   * Get policy type configuration with fallback to generic
   */
  getPolicyConfig(policyTypeId: string): PolicyTypeConfig {
    const config = this.policyTypes.get(policyTypeId)
    if (config) return config

    // Return generic fallback
    const generic = this.policyTypes.get('_generic')
    if (generic) return generic

    throw new Error(`Policy type configuration not found: ${policyTypeId}`)
  }

  /**
   * Get all available locale codes
   */
  getAvailableLocales(): string[] {
    return Array.from(this.locales.keys()).filter((code) => code !== '_universal')
  }

  /**
   * Get all available policy types (excluding base configs)
   */
  getAvailablePolicyTypes(): string[] {
    return Array.from(this.policyTypes.keys()).filter(
      (id) => !id.startsWith('_') && !this.policyTypes.get(id)?.is_base_config
    )
  }

  /**
   * Get OCR settings
   */
  getOCRSettings(): OCRSettings {
    return this.ocrSettings
  }

  /**
   * Get extraction patterns for a specific field with locale fallback
   */
  getPatternsForField(
    policyConfig: PolicyTypeConfig,
    fieldName: string,
    localeCode: string
  ): string[] {
    // Check required fields first
    let fieldConfig = policyConfig.required_fields?.[fieldName]

    // Then check optional fields
    if (!fieldConfig && policyConfig.optional_fields) {
      fieldConfig = policyConfig.optional_fields[fieldName]
    }

    if (!fieldConfig) return []

    const patterns = fieldConfig.patterns
    if (!patterns) return []

    // Try locale-specific patterns first
    if (patterns[localeCode]?.length) {
      return patterns[localeCode]
    }

    // Fall back to universal patterns
    if (patterns['_universal']?.length) {
      return patterns['_universal']
    }

    // Try English as secondary fallback
    if (patterns['en']?.length) {
      return patterns['en']
    }

    return []
  }

  /**
   * Get all patterns for a field across all locales
   */
  getAllPatternsForField(
    policyConfig: PolicyTypeConfig,
    fieldName: string
  ): { locale: string; patterns: string[] }[] {
    const fieldConfig =
      policyConfig.required_fields?.[fieldName] || policyConfig.optional_fields?.[fieldName]

    if (!fieldConfig || !fieldConfig.patterns) return []

    return Object.entries(fieldConfig.patterns).map(([locale, patterns]) => ({
      locale,
      patterns,
    }))
  }

  /**
   * Get field configuration
   */
  getFieldConfig(policyConfig: PolicyTypeConfig, fieldName: string): FieldPattern | undefined {
    return policyConfig.required_fields?.[fieldName] || policyConfig.optional_fields?.[fieldName]
  }

  /**
   * Get all insurance terminology for a locale
   */
  getInsuranceTerminology(localeCode: string): string[] {
    const locale = this.getLocale(localeCode)

    if ('insurance_terminology' in locale) {
      const terminology = locale.insurance_terminology
      return [
        ...terminology.core_terms,
        ...terminology.document_structure_terms,
        ...terminology.common_values,
      ]
    }

    return []
  }

  /**
   * Get universal insurance indicators
   */
  getUniversalInsuranceIndicators(): {
    document_type_hints: string[]
    coverage_indicators: string[]
    premium_indicators: string[]
  } {
    const universal = this.locales.get('_universal') as UniversalConfig | undefined

    if (universal?.insurance_indicators) {
      return universal.insurance_indicators
    }

    return {
      document_type_hints: ['insurance', 'policy'],
      coverage_indicators: ['coverage', 'cover'],
      premium_indicators: ['premium'],
    }
  }

  /**
   * Get load status
   */
  getLoadStatus(): ConfigurationLoadResult {
    return {
      success: this.loadErrors.length === 0,
      locales: Object.fromEntries(this.locales),
      policy_types: Object.fromEntries(this.policyTypes),
      ocr_settings: this.ocrSettings,
      errors: this.loadErrors.length > 0 ? this.loadErrors : undefined,
    }
  }

  /**
   * Verify all configurations are properly loaded
   * Returns diagnostic information for debugging
   */
  verifyConfigurations(): {
    success: boolean
    issues: string[]
    diagnostics: {
      locales: { code: string; sample_terms_count: number; special_chars_count: number }[]
      policy_types: { id: string; has_classification: boolean; detection_terms_locales: string[] }[]
      ocr_settings: { min_confidence: number; fallback_locale: string }
    }
  } {
    const issues: string[] = []
    const diagnostics = {
      locales: [] as { code: string; sample_terms_count: number; special_chars_count: number }[],
      policy_types: [] as {
        id: string
        has_classification: boolean
        detection_terms_locales: string[]
      }[],
      ocr_settings: {
        min_confidence: this.ocrSettings.language_detection.min_confidence,
        fallback_locale: this.ocrSettings.language_detection.fallback_locale,
      },
    }

    // Check locales
    const availableLocales = this.getAvailableLocales()
    if (!availableLocales.includes('tr')) {
      issues.push('CRITICAL: Turkish locale (tr) not loaded')
    }
    if (!availableLocales.includes('en')) {
      issues.push('CRITICAL: English locale (en) not loaded')
    }

    for (const localeCode of availableLocales) {
      const config = this.getLocale(localeCode) as LocaleConfig
      const sampleTermsCount = config.language_detection?.sample_terms?.length || 0
      const specialCharsCount = config.language_detection?.special_characters?.length || 0

      diagnostics.locales.push({
        code: localeCode,
        sample_terms_count: sampleTermsCount,
        special_chars_count: specialCharsCount,
      })

      if (sampleTermsCount === 0) {
        issues.push(`WARNING: Locale '${localeCode}' has no sample_terms for language detection`)
      }
    }

    // Check policy types
    const availablePolicyTypes = this.getAvailablePolicyTypes()
    if (!availablePolicyTypes.includes('motor_kasko')) {
      issues.push('CRITICAL: Kasko policy type (motor_kasko) not loaded')
    }
    if (!availablePolicyTypes.includes('motor_traffic')) {
      issues.push('WARNING: Traffic policy type (motor_traffic) not loaded')
    }

    for (const policyId of availablePolicyTypes) {
      const config = this.getPolicyConfig(policyId)
      const hasClassification = !!config.classification
      const detectionTermsLocales = hasClassification
        ? Object.keys(config.classification?.detection_terms || {})
        : []

      diagnostics.policy_types.push({
        id: policyId,
        has_classification: hasClassification,
        detection_terms_locales: detectionTermsLocales,
      })

      if (!hasClassification) {
        issues.push(`WARNING: Policy type '${policyId}' has no classification config`)
      } else if (!detectionTermsLocales.includes('tr')) {
        issues.push(`WARNING: Policy type '${policyId}' has no Turkish detection terms`)
      }
    }

    // Log diagnostics
    console.warn('[ConfigurationManager] === CONFIGURATION VERIFICATION ===')
    console.warn(
      `[ConfigurationManager] Locales: ${diagnostics.locales.map((l) => `${l.code}(${l.sample_terms_count} terms)`).join(', ')}`
    )
    console.warn(
      `[ConfigurationManager] Policy types: ${diagnostics.policy_types.map((p) => p.id).join(', ')}`
    )
    console.warn(
      `[ConfigurationManager] Min confidence: ${diagnostics.ocr_settings.min_confidence}`
    )
    console.warn(
      `[ConfigurationManager] Fallback locale: ${diagnostics.ocr_settings.fallback_locale}`
    )
    if (issues.length > 0) {
      console.warn(`[ConfigurationManager] Issues found: ${issues.length}`)
      for (const issue of issues) {
        console.warn(`[ConfigurationManager]   - ${issue}`)
      }
    } else {
      console.warn('[ConfigurationManager] All configurations verified successfully')
    }
    console.warn('[ConfigurationManager] === END VERIFICATION ===')

    return {
      success: issues.filter((i) => i.startsWith('CRITICAL')).length === 0,
      issues,
      diagnostics,
    }
  }

  /**
   * Reload all configurations (for hot-reload support)
   */
  reload(): void {
    this.locales.clear()
    this.policyTypes.clear()
    this.loadAllConfigurations()
  }

  /**
   * Get time since last configuration load
   */
  getLastLoadTime(): Date {
    return this.lastLoadTime
  }
}

// Singleton instance
let configManagerInstance: ConfigurationManager | null = null

/**
 * Get the singleton ConfigurationManager instance
 */
export function getConfigurationManager(): ConfigurationManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigurationManager()
  }
  return configManagerInstance
}
