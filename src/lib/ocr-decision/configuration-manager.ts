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
function deepMerge<T extends Record<string, unknown>>(parent: T, child: Partial<T>): T {
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
  private loadErrors: string[] = []
  private lastLoadTime: Date = new Date()

  constructor() {
    this.ocrSettings = ocrSettings as OCRSettings
    this.loadAllConfigurations()
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
    // Load base configs first (use unknown first for safe casting)
    const baseConfigs = [
      genericPolicy as unknown as PolicyTypeConfig,
      motorBasePolicy as unknown as PolicyTypeConfig,
    ]

    for (const config of baseConfigs) {
      this.policyTypes.set(config.policy_type_id, config)
    }

    // Load specific policy types with inheritance
    const specificConfigs = [
      kaskoPolicy as unknown as PolicyTypeConfig,
      trafficPolicy as unknown as PolicyTypeConfig,
      firePolicy as unknown as PolicyTypeConfig,
      healthPolicy as unknown as PolicyTypeConfig,
    ]

    for (const config of specificConfigs) {
      let finalConfig = config

      // Apply parent config inheritance
      if (config.parent_config) {
        const parent = this.policyTypes.get(config.parent_config)
        if (parent) {
          finalConfig = deepMerge(
            parent as unknown as Record<string, unknown>,
            config as unknown as Record<string, unknown>
          ) as unknown as PolicyTypeConfig
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
    return Array.from(this.locales.keys()).filter(code => code !== '_universal')
  }

  /**
   * Get all available policy types (excluding base configs)
   */
  getAvailablePolicyTypes(): string[] {
    return Array.from(this.policyTypes.keys()).filter(
      id => !id.startsWith('_') && !this.policyTypes.get(id)?.is_base_config
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
    const fieldConfig = policyConfig.required_fields?.[fieldName] ||
      policyConfig.optional_fields?.[fieldName]

    if (!fieldConfig || !fieldConfig.patterns) return []

    return Object.entries(fieldConfig.patterns).map(([locale, patterns]) => ({
      locale,
      patterns,
    }))
  }

  /**
   * Get field configuration
   */
  getFieldConfig(
    policyConfig: PolicyTypeConfig,
    fieldName: string
  ): FieldPattern | undefined {
    return policyConfig.required_fields?.[fieldName] ||
      policyConfig.optional_fields?.[fieldName]
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
