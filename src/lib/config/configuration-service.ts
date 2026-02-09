/**
 * Configuration Service
 *
 * Provides a three-tier configuration system:
 * 1. System Defaults (hardcoded TypeScript constants)
 * 2. Admin Settings (stored in app_settings table)
 * 3. User Preferences (stored in user_preferences table)
 *
 * Features:
 * - In-memory caching with TTL
 * - Automatic fallback to defaults
 * - Type-safe configuration access
 * - Feature flag support
 */

import { supabase } from '@/lib/supabase/client'
import type {
  ConfigCategory,
  CacheEntry,
  ConfigurationServiceOptions,
  AIConfig,
  EvaluationConfig,
  RateLimitsConfig,
  OCRConfig,
  FuzzyMatchingConfig,
  GapAnalysisConfig,
  UIConfig,
  EmailConfig,
  FeatureFlag,
  RegionalFactor,
  InsuranceProvider,
  MarketBenchmark,
} from './types'

import {
  DEFAULT_AI_CONFIG,
  DEFAULT_EVALUATION_CONFIG,
  DEFAULT_RATE_LIMITS_CONFIG,
  DEFAULT_OCR_CONFIG,
  DEFAULT_FUZZY_MATCHING_CONFIG,
  DEFAULT_GAP_ANALYSIS_CONFIG,
  DEFAULT_UI_CONFIG,
  DEFAULT_EMAIL_CONFIG,
} from './types'

import { configPerformanceMonitor } from './config-performance-monitor'
import { mergeWithUserPreferences, isUserOverridableCategory } from './user-overridable'

// =============================================================================
// CACHE IMPLEMENTATION
// =============================================================================

const cache = new Map<string, CacheEntry>()
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCacheKey(category: string, key?: string): string {
  return key ? `${category}:${key}` : `category:${category}`
}

function getFromCache<T>(cacheKey: string): T | null {
  const entry = cache.get(cacheKey)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey)
    return null
  }
  return entry.value as T
}

function setInCache<T>(cacheKey: string, value: T, ttlMs: number): void {
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}

// =============================================================================
// KEY MAPPING (database key -> TypeScript property)
// =============================================================================

const AI_KEY_MAP: Record<string, keyof AIConfig> = {
  openai_extraction_model: 'openaiExtractionModel',
  openai_backup_model: 'openaiBackupModel',
  anthropic_extraction_model: 'anthropicExtractionModel',
  anthropic_backup_model: 'anthropicBackupModel',
  max_tokens: 'maxTokens',
  temperature: 'temperature',
  chat_temperature: 'chatTemperature',
  min_confidence: 'minConfidence',
  warning_confidence: 'warningConfidence',
  extraction_timeout_ms: 'extractionTimeoutMs',
  preferred_provider: 'preferredProvider',
  enable_fallback: 'enableFallback',
  consensus_enabled: 'consensusEnabled',
  consensus_agreement_threshold: 'consensusAgreementThreshold',
  consensus_fields: 'consensusFields',
}

const EVALUATION_KEY_MAP: Record<string, keyof EvaluationConfig> = {
  weight_premium: 'weightPremium',
  weight_coverage: 'weightCoverage',
  weight_deductible: 'weightDeductible',
  weight_compliance: 'weightCompliance',
  weight_value: 'weightValue',
  grade_a_threshold: 'gradeAThreshold',
  grade_b_threshold: 'gradeBThreshold',
  grade_c_threshold: 'gradeCThreshold',
  grade_d_threshold: 'gradeDThreshold',
  status_excellent_threshold: 'statusExcellentThreshold',
  status_good_threshold: 'statusGoodThreshold',
  status_fair_threshold: 'statusFairThreshold',
  status_poor_threshold: 'statusPoorThreshold',
  strict_compliance: 'strictCompliance',
  include_optional_coverages: 'includeOptionalCoverages',
  use_regional_benchmarks: 'useRegionalBenchmarks',
}

const RATE_LIMITS_KEY_MAP: Record<string, keyof RateLimitsConfig> = {
  general_window_ms: 'generalWindowMs',
  general_max_requests: 'generalMaxRequests',
  ai_extraction_window_ms: 'aiExtractionWindowMs',
  ai_extraction_max_requests: 'aiExtractionMaxRequests',
  ocr_window_ms: 'ocrWindowMs',
  ocr_max_requests: 'ocrMaxRequests',
  chat_window_ms: 'chatWindowMs',
  chat_max_requests: 'chatMaxRequests',
  health_window_ms: 'healthWindowMs',
  health_max_requests: 'healthMaxRequests',
  auth_window_ms: 'authWindowMs',
  auth_max_attempts: 'authMaxAttempts',
}

const OCR_KEY_MAP: Record<string, keyof OCRConfig> = {
  chars_per_page_threshold: 'charsPerPageThreshold',
  min_pages_for_average: 'minPagesForAverage',
  page_variance_threshold: 'pageVarianceThreshold',
  min_chars_for_valid_page: 'minCharsForValidPage',
  skip_ocr_threshold: 'skipOcrThreshold',
  selective_ocr_threshold: 'selectiveOcrThreshold',
  weight_char_density: 'weightCharDensity',
  weight_text_quality: 'weightTextQuality',
  weight_page_variance: 'weightPageVariance',
  weight_encoding_check: 'weightEncodingCheck',
  weight_field_extraction: 'weightFieldExtraction',
  google_vision_confidence: 'googleVisionConfidence',
  document_ai_confidence: 'documentAiConfidence',
  tesseract_confidence: 'tesseractConfidence',
  language_min_confidence: 'languageMinConfidence',
  language_sample_size: 'languageSampleSize',
  policy_type_min_confidence: 'policyTypeMinConfidence',
  min_word_length_average: 'minWordLengthAverage',
  max_garbage_char_ratio: 'maxGarbageCharRatio',
  min_alphanumeric_ratio: 'minAlphanumericRatio',
  max_pages_quick_analysis: 'maxPagesQuickAnalysis',
  timeout_seconds: 'timeoutSeconds',
  max_text_length: 'maxTextLength',
}

const FUZZY_MATCHING_KEY_MAP: Record<string, keyof FuzzyMatchingConfig> = {
  default_threshold: 'defaultThreshold',
  short_string_threshold: 'shortStringThreshold',
  policy_number_threshold: 'policyNumberThreshold',
  provider_name_threshold: 'providerNameThreshold',
  insured_name_threshold: 'insuredNameThreshold',
  coverage_name_threshold: 'coverageNameThreshold',
  array_match_ratio: 'arrayMatchRatio',
  keyword_overlap_ratio: 'keywordOverlapRatio',
  numeric_tolerance_percent: 'numericTolerancePercent',
  seddk_limit_tolerance: 'seddkLimitTolerance',
  coverage_limit_tolerance: 'coverageLimitTolerance',
  deductible_tolerance: 'deductibleTolerance',
}

const GAP_ANALYSIS_KEY_MAP: Record<string, keyof GapAnalysisConfig> = {
  missing_coverage_threshold: 'missingCoverageThreshold',
  critical_importance_threshold: 'criticalImportanceThreshold',
  recommended_importance_threshold: 'recommendedImportanceThreshold',
  underinsured_threshold: 'underinsuredThreshold',
  high_risk_underinsured: 'highRiskUnderinsured',
  medium_risk_underinsured: 'mediumRiskUnderinsured',
  high_deductible_multiplier: 'highDeductibleMultiplier',
  penalty_critical_missing: 'penaltyCriticalMissing',
  penalty_recommended_missing: 'penaltyRecommendedMissing',
  penalty_optional_missing: 'penaltyOptionalMissing',
  penalty_high_risk_underinsured: 'penaltyHighRiskUnderinsured',
  penalty_medium_risk_underinsured: 'penaltyMediumRiskUnderinsured',
  good_alignment_threshold: 'goodAlignmentThreshold',
  significant_gaps_threshold: 'significantGapsThreshold',
  max_gap_score: 'maxGapScore',
}

const UI_KEY_MAP: Record<string, keyof UIConfig> = {
  toast_success_duration_ms: 'toastSuccessDurationMs',
  toast_error_duration_ms: 'toastErrorDurationMs',
  toast_warning_duration_ms: 'toastWarningDurationMs',
  default_items_per_page: 'defaultItemsPerPage',
  max_items_per_page: 'maxItemsPerPage',
  extraction_progress_interval_ms: 'extractionProgressIntervalMs',
  collapsed_preview_items: 'collapsedPreviewItems',
  max_ai_insights_preview: 'maxAiInsightsPreview',
  max_recommendations_preview: 'maxRecommendationsPreview',
  max_file_size_mb: 'maxFileSizeMb',
  allowed_file_extensions: 'allowedFileExtensions',
}

const EMAIL_KEY_MAP: Record<string, keyof EmailConfig> = {
  reminder_days: 'reminderDays',
  urgency_threshold_days: 'urgencyThresholdDays',
  score_good_threshold: 'scoreGoodThreshold',
  score_warning_threshold: 'scoreWarningThreshold',
  default_marketing_enabled: 'defaultMarketingEnabled',
  default_reminders_enabled: 'defaultRemindersEnabled',
  default_digest_enabled: 'defaultDigestEnabled',
}

// =============================================================================
// CONFIGURATION SERVICE CLASS
// =============================================================================

export class ConfigurationService {
  private static instance: ConfigurationService
  private cacheTtlMs: number
  private enableCache: boolean

  private constructor(options: ConfigurationServiceOptions = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.enableCache = options.enableCache ?? true
    configPerformanceMonitor.setCacheTtl(this.cacheTtlMs)
  }

  /**
   * Get singleton instance
   */
  static getInstance(options?: ConfigurationServiceOptions): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService(options)
    }
    return ConfigurationService.instance
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    ConfigurationService.instance = null as unknown as ConfigurationService
    cache.clear()
  }

  // ===========================================================================
  // GENERIC METHODS
  // ===========================================================================

  /**
   * Get a single setting value with fallback to default
   */
  async get<T>(category: ConfigCategory, key: string, defaultValue: T): Promise<T> {
    const cacheKey = getCacheKey(category, key)
    const startTime = performance.now()

    // Check cache first
    if (this.enableCache) {
      const cached = getFromCache<T>(cacheKey)
      if (cached !== null) {
        configPerformanceMonitor.record({
          category,
          method: 'get',
          latencyMs: Math.round((performance.now() - startTime) * 100) / 100,
          cacheHit: true,
          success: true,
        })
        return cached
      }
    }

    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('category', category)
        .eq('key', key)
        .single()

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100

      if (error || !data) {
        configPerformanceMonitor.record({
          category,
          method: 'get',
          latencyMs,
          cacheHit: false,
          success: true, // returning default is not an error
        })
        return defaultValue
      }

      const value = data.value as T

      // Update cache
      if (this.enableCache) {
        setInCache(cacheKey, value, this.cacheTtlMs)
      }

      configPerformanceMonitor.record({
        category,
        method: 'get',
        latencyMs,
        cacheHit: false,
        success: true,
      })

      return value
    } catch (err) {
      configPerformanceMonitor.record({
        category,
        method: 'get',
        latencyMs: Math.round((performance.now() - startTime) * 100) / 100,
        cacheHit: false,
        success: false,
        errorMessage: err instanceof Error ? err.message : 'unknown error',
      })
      return defaultValue
    }
  }

  /**
   * Get all settings for a category
   */
  async getCategory(category: ConfigCategory): Promise<Record<string, unknown>> {
    const cacheKey = getCacheKey(category)
    const startTime = performance.now()

    // Check cache first
    if (this.enableCache) {
      const cached = getFromCache<Record<string, unknown>>(cacheKey)
      if (cached !== null) {
        configPerformanceMonitor.record({
          category,
          method: 'getCategory',
          latencyMs: Math.round((performance.now() - startTime) * 100) / 100,
          cacheHit: true,
          success: true,
        })
        return cached
      }
    }

    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .eq('category', category)
        .order('display_order', { ascending: true })

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100

      if (error || !data) {
        configPerformanceMonitor.record({
          category,
          method: 'getCategory',
          latencyMs,
          cacheHit: false,
          success: true,
        })
        return {}
      }

      const result = data.reduce(
        (acc, { key, value }) => {
          acc[key] = value
          return acc
        },
        {} as Record<string, unknown>
      )

      // Update cache
      if (this.enableCache) {
        setInCache(cacheKey, result, this.cacheTtlMs)
      }

      configPerformanceMonitor.record({
        category,
        method: 'getCategory',
        latencyMs,
        cacheHit: false,
        success: true,
      })

      return result
    } catch (err) {
      configPerformanceMonitor.record({
        category,
        method: 'getCategory',
        latencyMs: Math.round((performance.now() - startTime) * 100) / 100,
        cacheHit: false,
        success: false,
        errorMessage: err instanceof Error ? err.message : 'unknown error',
      })
      return {}
    }
  }

  /**
   * Invalidate cache for a category or all categories
   */
  invalidateCache(category?: ConfigCategory): void {
    if (category) {
      // Invalidate specific category
      for (const key of cache.keys()) {
        if (key.startsWith(`${category}:`) || key === `category:${category}`) {
          cache.delete(key)
        }
      }
    } else {
      // Invalidate all
      cache.clear()
    }
  }

  // ===========================================================================
  // TYPED CONFIGURATION GETTERS
  // ===========================================================================

  /**
   * Get AI configuration with defaults
   */
  async getAIConfig(): Promise<AIConfig> {
    const dbSettings = await this.getCategory('ai')
    const config = { ...DEFAULT_AI_CONFIG }

    for (const [dbKey, tsKey] of Object.entries(AI_KEY_MAP)) {
      if (dbSettings[dbKey] !== undefined) {
        ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
      }
    }

    return config
  }

  /**
   * Get evaluation configuration with defaults
   */
  async getEvaluationConfig(): Promise<EvaluationConfig> {
    const dbSettings = await this.getCategory('evaluation')
    const config = { ...DEFAULT_EVALUATION_CONFIG }

    for (const [dbKey, tsKey] of Object.entries(EVALUATION_KEY_MAP)) {
      if (dbSettings[dbKey] !== undefined) {
        ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
      }
    }

    return config
  }

  /**
   * Get rate limits configuration with defaults
   */
  async getRateLimitsConfig(): Promise<RateLimitsConfig> {
    const dbSettings = await this.getCategory('rate_limits')
    const config = { ...DEFAULT_RATE_LIMITS_CONFIG }

    for (const [dbKey, tsKey] of Object.entries(RATE_LIMITS_KEY_MAP)) {
      if (dbSettings[dbKey] !== undefined) {
        ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
      }
    }

    return config
  }

  /**
   * Get OCR configuration with defaults
   */
  async getOCRConfig(): Promise<OCRConfig> {
    const dbSettings = await this.getCategory('ocr')
    const config = { ...DEFAULT_OCR_CONFIG }

    for (const [dbKey, tsKey] of Object.entries(OCR_KEY_MAP)) {
      if (dbSettings[dbKey] !== undefined) {
        ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
      }
    }

    return config
  }

  /**
   * Get fuzzy matching configuration with defaults
   */
  async getFuzzyMatchingConfig(): Promise<FuzzyMatchingConfig> {
    const dbSettings = await this.getCategory('fuzzy_matching')
    const config = { ...DEFAULT_FUZZY_MATCHING_CONFIG }

    for (const [dbKey, tsKey] of Object.entries(FUZZY_MATCHING_KEY_MAP)) {
      if (dbSettings[dbKey] !== undefined) {
        ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
      }
    }

    return config
  }

  /**
   * Get gap analysis configuration with defaults
   */
  async getGapAnalysisConfig(): Promise<GapAnalysisConfig> {
    const dbSettings = await this.getCategory('gap_analysis')
    const config = { ...DEFAULT_GAP_ANALYSIS_CONFIG }

    for (const [dbKey, tsKey] of Object.entries(GAP_ANALYSIS_KEY_MAP)) {
      if (dbSettings[dbKey] !== undefined) {
        ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
      }
    }

    return config
  }

  /**
   * Get UI configuration with defaults
   */
  async getUIConfig(): Promise<UIConfig> {
    const dbSettings = await this.getCategory('ui')
    const config = { ...DEFAULT_UI_CONFIG }

    for (const [dbKey, tsKey] of Object.entries(UI_KEY_MAP)) {
      if (dbSettings[dbKey] !== undefined) {
        ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
      }
    }

    return config
  }

  /**
   * Get email configuration with defaults
   */
  async getEmailConfig(): Promise<EmailConfig> {
    const dbSettings = await this.getCategory('email')
    const config = { ...DEFAULT_EMAIL_CONFIG }

    for (const [dbKey, tsKey] of Object.entries(EMAIL_KEY_MAP)) {
      if (dbSettings[dbKey] !== undefined) {
        ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
      }
    }

    return config
  }

  // ===========================================================================
  // USER-AWARE CONFIGURATION GETTERS (Tier 3 override)
  // ===========================================================================

  /**
   * Get UI configuration with user preference overrides.
   * Merges: System Defaults → Admin Settings → User Preferences
   */
  async getUIConfigForUser(userId: string): Promise<UIConfig> {
    const adminConfig = await this.getUIConfig()
    const userPrefs = await this.getUserPreferences(userId, 'ui')
    return mergeWithUserPreferences(adminConfig, userPrefs, 'ui', UI_KEY_MAP)
  }

  /**
   * Get email configuration with user preference overrides.
   * Merges: System Defaults → Admin Settings → User Preferences
   */
  async getEmailConfigForUser(userId: string): Promise<EmailConfig> {
    const adminConfig = await this.getEmailConfig()
    const userPrefs = await this.getUserPreferences(userId, 'email')
    return mergeWithUserPreferences(adminConfig, userPrefs, 'email', EMAIL_KEY_MAP)
  }

  /**
   * Get a single setting value with user override support.
   * For overridable categories (ui, email), checks user preferences first.
   */
  async getForUser<T>(
    category: ConfigCategory,
    key: string,
    defaultValue: T,
    userId?: string
  ): Promise<T> {
    // If no user or category not overridable, return admin value
    if (!userId || !isUserOverridableCategory(category)) {
      return this.get(category, key, defaultValue)
    }

    // Check user preferences first
    const userPrefs = await this.getUserPreferences(userId, category)
    if (userPrefs && userPrefs[key] !== undefined) {
      return userPrefs[key] as T
    }

    // Fall back to admin setting
    return this.get(category, key, defaultValue)
  }

  // ===========================================================================
  // FEATURE FLAGS
  // ===========================================================================

  /**
   * Check if a feature flag is enabled
   */
  async isFeatureEnabled(flagKey: string, userId?: string): Promise<boolean> {
    const cacheKey = `feature:${flagKey}:${userId || 'anon'}`
    const startTime = performance.now()

    // Check cache
    if (this.enableCache) {
      const cached = getFromCache<boolean>(cacheKey)
      if (cached !== null) {
        configPerformanceMonitor.record({
          category: 'feature_flags',
          method: 'isFeatureEnabled',
          latencyMs: Math.round((performance.now() - startTime) * 100) / 100,
          cacheHit: true,
          success: true,
        })
        return cached
      }
    }

    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('key', flagKey)
        .single()

      const latencyMs = Math.round((performance.now() - startTime) * 100) / 100

      if (error || !data) {
        configPerformanceMonitor.record({
          category: 'feature_flags',
          method: 'isFeatureEnabled',
          latencyMs,
          cacheHit: false,
          success: true,
        })
        return false
      }

      const flag = data as FeatureFlag

      // Check if expired
      if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
        configPerformanceMonitor.record({
          category: 'feature_flags',
          method: 'isFeatureEnabled',
          latencyMs,
          cacheHit: false,
          success: true,
        })
        return false
      }

      // Check if globally disabled
      if (!flag.enabled) {
        configPerformanceMonitor.record({
          category: 'feature_flags',
          method: 'isFeatureEnabled',
          latencyMs,
          cacheHit: false,
          success: true,
        })
        return false
      }

      // Check rollout percentage
      if (flag.rolloutPercentage < 100) {
        // Use user ID or random for consistent bucketing
        const bucket = userId
          ? this.hashString(userId + flagKey) % 100
          : Math.floor(Math.random() * 100)

        if (bucket >= flag.rolloutPercentage) {
          configPerformanceMonitor.record({
            category: 'feature_flags',
            method: 'isFeatureEnabled',
            latencyMs,
            cacheHit: false,
            success: true,
          })
          return false
        }
      }

      // Cache the result
      if (this.enableCache) {
        setInCache(cacheKey, true, this.cacheTtlMs)
      }

      configPerformanceMonitor.record({
        category: 'feature_flags',
        method: 'isFeatureEnabled',
        latencyMs,
        cacheHit: false,
        success: true,
      })

      return true
    } catch (err) {
      configPerformanceMonitor.record({
        category: 'feature_flags',
        method: 'isFeatureEnabled',
        latencyMs: Math.round((performance.now() - startTime) * 100) / 100,
        cacheHit: false,
        success: false,
        errorMessage: err instanceof Error ? err.message : 'unknown error',
      })
      return false
    }
  }

  /**
   * Get all feature flags
   */
  async getFeatureFlags(): Promise<FeatureFlag[]> {
    try {
      const { data, error } = await supabase.from('feature_flags').select('*').order('key')

      if (error || !data) {
        return []
      }

      return data as FeatureFlag[]
    } catch {
      return []
    }
  }

  // ===========================================================================
  // REGIONAL FACTORS
  // ===========================================================================

  /**
   * Get regional risk factor
   */
  async getRegionalFactor(
    regionCode: string,
    policyType: string = 'all',
    year: number = new Date().getFullYear()
  ): Promise<number> {
    const cacheKey = `regional:${regionCode}:${policyType}:${year}`

    // Check cache
    if (this.enableCache) {
      const cached = getFromCache<number>(cacheKey)
      if (cached !== null) {
        return cached
      }
    }

    try {
      // Try specific policy type first
      let { data, error } = await supabase
        .from('regional_factors')
        .select('risk_factor')
        .eq('region_code', regionCode)
        .eq('policy_type', policyType)
        .eq('year', year)
        .eq('is_active', true)
        .single()

      // Fall back to 'all' policy type
      if (error || !data) {
        const result = await supabase
          .from('regional_factors')
          .select('risk_factor')
          .eq('region_code', regionCode)
          .eq('policy_type', 'all')
          .eq('year', year)
          .eq('is_active', true)
          .single()

        data = result.data
        error = result.error
      }

      if (error || !data) {
        return 1.0 // Default factor
      }

      const factor = data.risk_factor as number

      // Cache the result
      if (this.enableCache) {
        setInCache(cacheKey, factor, this.cacheTtlMs)
      }

      return factor
    } catch {
      return 1.0
    }
  }

  /**
   * Get all regional factors
   */
  async getRegionalFactors(year?: number): Promise<RegionalFactor[]> {
    try {
      let query = supabase
        .from('regional_factors')
        .select('*')
        .eq('is_active', true)
        .order('region_code')

      if (year) {
        query = query.eq('year', year)
      }

      const { data, error } = await query

      if (error || !data) {
        return []
      }

      return data.map((row) => ({
        id: row.id,
        regionCode: row.region_code,
        regionName: row.region_name,
        regionNameTr: row.region_name_tr,
        policyType: row.policy_type,
        riskFactor: row.risk_factor,
        year: row.year,
        source: row.source,
        notes: row.notes,
        isActive: row.is_active,
      }))
    } catch {
      return []
    }
  }

  // ===========================================================================
  // INSURANCE PROVIDERS
  // ===========================================================================

  /**
   * Get all insurance providers
   */
  async getInsuranceProviders(): Promise<InsuranceProvider[]> {
    const cacheKey = 'providers:all'

    // Check cache
    if (this.enableCache) {
      const cached = getFromCache<InsuranceProvider[]>(cacheKey)
      if (cached !== null) {
        return cached
      }
    }

    try {
      const { data, error } = await supabase
        .from('insurance_providers')
        .select('*')
        .eq('is_active', true)
        .order('market_share', { ascending: false })

      if (error || !data) {
        return []
      }

      const providers = data.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        nameTr: row.name_tr,
        marketShare: row.market_share,
        customerRating: row.customer_rating,
        establishedYear: row.established_year,
        headquarters: row.headquarters,
        website: row.website,
        logoUrl: row.logo_url,
        specialties: row.specialties || [],
        isActive: row.is_active,
      }))

      // Cache the result
      if (this.enableCache) {
        setInCache(cacheKey, providers, this.cacheTtlMs)
      }

      return providers
    } catch {
      return []
    }
  }

  // ===========================================================================
  // MARKET BENCHMARKS
  // ===========================================================================

  /**
   * Get market benchmarks for a policy type
   */
  async getMarketBenchmarks(policyType: string, year?: number): Promise<MarketBenchmark[]> {
    const targetYear = year || new Date().getFullYear()
    const cacheKey = `benchmarks:${policyType}:${targetYear}`

    // Check cache
    if (this.enableCache) {
      const cached = getFromCache<MarketBenchmark[]>(cacheKey)
      if (cached !== null) {
        return cached
      }
    }

    try {
      const { data, error } = await supabase
        .from('market_benchmarks')
        .select('*')
        .eq('policy_type', policyType)
        .eq('year', targetYear)
        .eq('is_active', true)
        .order('coverage_type')

      if (error || !data) {
        return []
      }

      const benchmarks = data.map((row) => ({
        id: row.id,
        policyType: row.policy_type,
        coverageType: row.coverage_type,
        coverageNameTr: row.coverage_name_tr,
        regionCode: row.region_code,
        year: row.year,
        minLimit: row.min_limit,
        typicalLimit: row.typical_limit,
        maxLimit: row.max_limit,
        minDeductible: row.min_deductible,
        typicalDeductible: row.typical_deductible,
        maxDeductible: row.max_deductible,
        inclusionRate: row.inclusion_rate,
        importance: row.importance as 'critical' | 'standard' | 'optional',
        source: row.source,
        notes: row.notes,
        isActive: row.is_active,
      }))

      // Cache the result
      if (this.enableCache) {
        setInCache(cacheKey, benchmarks, this.cacheTtlMs)
      }

      return benchmarks
    } catch {
      return []
    }
  }

  // ===========================================================================
  // USER PREFERENCES
  // ===========================================================================

  /**
   * Get user preferences for a category
   */
  async getUserPreferences(
    userId: string,
    category: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .eq('category', category)
        .single()

      if (error || !data) {
        return null
      }

      return data.preferences as Record<string, unknown>
    } catch {
      return null
    }
  }

  /**
   * Set user preferences for a category
   */
  async setUserPreferences(
    userId: string,
    category: string,
    preferences: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: userId,
          category,
          preferences,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,category',
        }
      )

      return !error
    } catch {
      return false
    }
  }

  // ===========================================================================
  // PERFORMANCE MONITORING
  // ===========================================================================

  /**
   * Get a performance snapshot of config fetch metrics
   */
  getPerformanceSnapshot() {
    return configPerformanceMonitor.getSnapshot()
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Simple string hash for consistent bucketing
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const configService = ConfigurationService.getInstance()

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Get AI configuration (convenience function)
 */
export async function getAIConfig(): Promise<AIConfig> {
  return configService.getAIConfig()
}

/**
 * Get evaluation configuration (convenience function)
 */
export async function getEvaluationConfig(): Promise<EvaluationConfig> {
  return configService.getEvaluationConfig()
}

/**
 * Get OCR configuration (convenience function)
 */
export async function getOCRConfig(): Promise<OCRConfig> {
  return configService.getOCRConfig()
}

/**
 * Get fuzzy matching configuration (convenience function)
 */
export async function getFuzzyMatchingConfig(): Promise<FuzzyMatchingConfig> {
  return configService.getFuzzyMatchingConfig()
}

/**
 * Check if a feature is enabled (convenience function)
 */
export async function isFeatureEnabled(flagKey: string, userId?: string): Promise<boolean> {
  return configService.isFeatureEnabled(flagKey, userId)
}

/**
 * Get regional risk factor (convenience function)
 */
export async function getRegionalFactor(
  regionCode: string,
  policyType?: string
): Promise<number> {
  return configService.getRegionalFactor(regionCode, policyType)
}

/**
 * Get UI configuration with user overrides (convenience function)
 */
export async function getUIConfigForUser(userId: string): Promise<UIConfig> {
  return configService.getUIConfigForUser(userId)
}

/**
 * Get email configuration with user overrides (convenience function)
 */
export async function getEmailConfigForUser(userId: string): Promise<EmailConfig> {
  return configService.getEmailConfigForUser(userId)
}
