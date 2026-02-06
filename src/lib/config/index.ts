/**
 * Configuration System
 *
 * Three-tier configuration system for InsurAI:
 * 1. System Defaults (hardcoded TypeScript constants)
 * 2. Admin Settings (stored in app_settings table)
 * 3. User Preferences (stored in user_preferences table)
 *
 * Usage:
 * ```typescript
 * import { configService, getAIConfig, isFeatureEnabled } from '@/lib/config'
 *
 * // Get typed configuration
 * const aiConfig = await getAIConfig()
 * console.log(aiConfig.openaiExtractionModel) // 'gpt-4o'
 *
 * // Check feature flag
 * if (await isFeatureEnabled('new_evaluation_algorithm')) {
 *   // Use new algorithm
 * }
 *
 * // Get specific setting with default
 * const timeout = await configService.get('ai', 'extraction_timeout_ms', 90000)
 * ```
 */

// Service
export {
  ConfigurationService,
  configService,
  getAIConfig,
  getEvaluationConfig,
  getOCRConfig,
  getFuzzyMatchingConfig,
  isFeatureEnabled,
  getRegionalFactor,
} from './configuration-service'

// Performance monitoring
export {
  ConfigPerformanceMonitor,
  configPerformanceMonitor,
} from './config-performance-monitor'

export type {
  ConfigFetchEvent,
  PerformanceSnapshot,
  LatencyStats,
  CacheStats,
  CategoryStats,
  TtlRecommendation,
} from './config-performance-monitor'

// Types
export type {
  ConfigCategory,
  ConfigValueType,
  AppSetting,
  AppSettingInput,
  UserPreference,
  UserPreferenceInput,
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
  AppConfig,
  CacheEntry,
  ConfigurationServiceOptions,
} from './types'

// Default configurations (for reference and fallback)
export {
  DEFAULT_AI_CONFIG,
  DEFAULT_EVALUATION_CONFIG,
  DEFAULT_RATE_LIMITS_CONFIG,
  DEFAULT_OCR_CONFIG,
  DEFAULT_FUZZY_MATCHING_CONFIG,
  DEFAULT_GAP_ANALYSIS_CONFIG,
  DEFAULT_UI_CONFIG,
  DEFAULT_EMAIL_CONFIG,
  DEFAULT_APP_CONFIG,
} from './types'
