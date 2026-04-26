/**
 * Server-Side Configuration Service
 *
 * Provides access to database-stored configuration settings for AI, OCR, rate limits, etc.
 * Mirrors the frontend ConfigurationService but runs on the server.
 *
 * Features:
 * - In-memory caching with TTL
 * - Automatic fallback to defaults
 * - Type-safe configuration access
 * - Feature flag support with rollout percentages
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { recordServerConfigFetch } from '../routes/settings.js'

// Timeout for database queries — prevents hanging if Supabase is slow/unreachable
// Default 8000 — configurable via app_settings server.db_query_timeout_ms
let DB_QUERY_TIMEOUT_MS = 8_000

// =============================================================================
// TYPES
// =============================================================================

export interface AIConfig {
  openaiExtractionModel: string
  openaiBackupModel: string
  anthropicExtractionModel: string
  anthropicBackupModel: string
  geminiModel: string
  maxTokens: number
  temperature: number
  chatTemperature: number
  minConfidence: number
  warningConfidence: number
  extractionTimeoutMs: number
  preferredProvider: 'auto' | 'openai' | 'anthropic'
  enableFallback: boolean
  consensusEnabled: boolean
  consensusAgreementThreshold: number
  consensusFields: string[]
  confidenceWeightPolicyNumber: number
  confidenceWeightProvider: number
  confidenceWeightDates: number
  confidenceWeightPremium: number
  confidenceWeightCoverages: number
  requestBudgetMs: number
  primaryProviderTimeoutMs: number
  fallbackProviderTimeoutMs: number
  clientFetchTimeoutMs: number
  trialExtractionTimeoutMs: number
}

export interface RateLimitsConfig {
  generalWindowMs: number
  generalMaxRequests: number
  aiExtractionWindowMs: number
  aiExtractionMaxRequests: number
  ocrWindowMs: number
  ocrMaxRequests: number
  chatWindowMs: number
  chatMaxRequests: number
  healthWindowMs: number
  healthMaxRequests: number
  authWindowMs: number
  authMaxAttempts: number
}

export interface OCRConfig {
  charsPerPageThreshold: number
  skipOcrThreshold: number
  selectiveOcrThreshold: number
  weightCharDensity: number
  weightTextQuality: number
  weightPageVariance: number
  weightEncodingCheck: number
  weightFieldExtraction: number
  timeoutSeconds: number
  maxTextLength: number
  pdfLoadTimeoutMs: number
  maxWorkerFailures: number
  ocrCleanupTimeoutMs: number
}

export interface MonitoringConfig {
  errorRateWarningThreshold: number
  errorRateCriticalThreshold: number
  avgLatencyCriticalMs: number
  checkIntervalMs: number
  alertCooldownMinutes: number
  enableEmailAlerts: boolean
  alertEmailAddresses: string
  minProviderRequestsForLatencyAlert: number
  extractionBufferSize: number
  maxMetricsBufferSize: number
  maxAlertHistory: number
  maxResponseTimes: number
  serverPerfMaxEvents: number
  serverPerfMaxAgeMs: number
}

export interface RetentionConfig {
  processingLogRetentionDays: number
  extractionMetricsRetentionDays: number
}

export interface FXConfig {
  serverCacheTtlMs: number
  apiTimeoutMs: number
  supportedCurrencies: string[]
  fallbackRates: Record<string, number>
}

export interface ServerConfig {
  dbQueryTimeoutMs: number
  configCacheTtlMs: number
  promptCacheTtlMs: number
  translationCacheTtlMs: number
  rateLimitConfigCacheTtlMs: number
}

export interface WebhooksConfig {
  maxDeliveryAttempts: number
  deliveryTimeoutMs: number
  maxResponseBodyLength: number
}

export interface CostConfig {
  tokenPricing: Record<string, { input: number; output: number }>
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_AI_CONFIG: AIConfig = {
  openaiExtractionModel: 'gpt-5.4',
  openaiBackupModel: 'gpt-4o-mini',
  anthropicExtractionModel: 'claude-3-5-sonnet-20241022',
  anthropicBackupModel: 'claude-haiku-4-5',
  geminiModel: 'gemini-2.5-flash',
  maxTokens: 8192,
  temperature: 0.1,
  chatTemperature: 0.7,
  minConfidence: 0.4,
  warningConfidence: 0.7,
  extractionTimeoutMs: 90000,
  preferredProvider: 'auto',
  enableFallback: true,
  consensusEnabled: true,
  consensusAgreementThreshold: 0.8,
  consensusFields: ['policyNumber', 'provider', 'premium', 'startDate', 'endDate'],
  confidenceWeightPolicyNumber: 0.2,
  confidenceWeightProvider: 0.15,
  confidenceWeightDates: 0.2,
  confidenceWeightPremium: 0.2,
  confidenceWeightCoverages: 0.25,
  requestBudgetMs: 125000,
  primaryProviderTimeoutMs: 65000,
  fallbackProviderTimeoutMs: 55000,
  clientFetchTimeoutMs: 135000,
  trialExtractionTimeoutMs: 150000,
}

const DEFAULT_FX_CONFIG: FXConfig = {
  serverCacheTtlMs: 21600000,
  apiTimeoutMs: 10000,
  supportedCurrencies: ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'SAR', 'AED', 'JPY', 'CAD', 'AUD'],
  fallbackRates: {
    TRY: 1,
    USD: 33.5,
    EUR: 36.5,
    GBP: 42.5,
    CHF: 38.0,
    SAR: 8.9,
    AED: 9.1,
    JPY: 0.22,
    CAD: 24.5,
    AUD: 21.8,
  },
}

const DEFAULT_SERVER_CONFIG: ServerConfig = {
  dbQueryTimeoutMs: 8000,
  configCacheTtlMs: 300000,
  promptCacheTtlMs: 300000,
  translationCacheTtlMs: 300000,
  rateLimitConfigCacheTtlMs: 60000,
}

const DEFAULT_WEBHOOKS_CONFIG: WebhooksConfig = {
  maxDeliveryAttempts: 3,
  deliveryTimeoutMs: 10000,
  maxResponseBodyLength: 1000,
}

const DEFAULT_COST_CONFIG: CostConfig = {
  tokenPricing: {
    // Current models (April 2026)
    'gpt-5.4': { input: 0.003, output: 0.012 },
    'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
    'claude-haiku-4-5': { input: 0.001, output: 0.005 },
    'gemini-2.5-flash': { input: 0.0003, output: 0.0025 },
    // Legacy models (retained for historical cost tracking)
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku': { input: 0.00025, output: 0.00125 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
    'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
    default: { input: 0.001, output: 0.002 },
  },
}

const DEFAULT_RATE_LIMITS_CONFIG: RateLimitsConfig = {
  generalWindowMs: 60000,
  generalMaxRequests: 100,
  aiExtractionWindowMs: 3600000,
  aiExtractionMaxRequests: 20,
  ocrWindowMs: 3600000,
  ocrMaxRequests: 30,
  chatWindowMs: 3600000,
  chatMaxRequests: 60,
  healthWindowMs: 60000,
  healthMaxRequests: 60,
  authWindowMs: 900000,
  authMaxAttempts: 5,
}

const DEFAULT_OCR_CONFIG: OCRConfig = {
  charsPerPageThreshold: 200,
  skipOcrThreshold: 0.7,
  selectiveOcrThreshold: 0.4,
  weightCharDensity: 0.25,
  weightTextQuality: 0.3,
  weightPageVariance: 0.15,
  weightEncodingCheck: 0.15,
  weightFieldExtraction: 0.15,
  timeoutSeconds: 60,
  maxTextLength: 500000,
  pdfLoadTimeoutMs: 30000,
  maxWorkerFailures: 2,
  ocrCleanupTimeoutMs: 30000,
}

const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  errorRateWarningThreshold: 0.05,
  errorRateCriticalThreshold: 0.2,
  avgLatencyCriticalMs: 12000,
  checkIntervalMs: 300000,
  alertCooldownMinutes: 15,
  enableEmailAlerts: false,
  alertEmailAddresses: '',
  minProviderRequestsForLatencyAlert: 3,
  extractionBufferSize: 200,
  maxMetricsBufferSize: 10000,
  maxAlertHistory: 1000,
  maxResponseTimes: 1000,
  serverPerfMaxEvents: 500,
  serverPerfMaxAgeMs: 3600000,
}

const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  processingLogRetentionDays: 90,
  extractionMetricsRetentionDays: 30,
}

// =============================================================================
// KEY MAPPINGS (database key -> TypeScript property)
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
  confidence_weight_policy_number: 'confidenceWeightPolicyNumber',
  confidence_weight_provider: 'confidenceWeightProvider',
  confidence_weight_dates: 'confidenceWeightDates',
  confidence_weight_premium: 'confidenceWeightPremium',
  confidence_weight_coverages: 'confidenceWeightCoverages',
  request_budget_ms: 'requestBudgetMs',
  primary_provider_timeout_ms: 'primaryProviderTimeoutMs',
  fallback_provider_timeout_ms: 'fallbackProviderTimeoutMs',
  client_fetch_timeout_ms: 'clientFetchTimeoutMs',
  trial_extraction_timeout_ms: 'trialExtractionTimeoutMs',
}

const FX_KEY_MAP: Record<string, keyof FXConfig> = {
  server_cache_ttl_ms: 'serverCacheTtlMs',
  api_timeout_ms: 'apiTimeoutMs',
  supported_currencies: 'supportedCurrencies',
  fallback_rates: 'fallbackRates',
}

const SERVER_KEY_MAP: Record<string, keyof ServerConfig> = {
  db_query_timeout_ms: 'dbQueryTimeoutMs',
  config_cache_ttl_ms: 'configCacheTtlMs',
  prompt_cache_ttl_ms: 'promptCacheTtlMs',
  translation_cache_ttl_ms: 'translationCacheTtlMs',
  rate_limit_config_cache_ttl_ms: 'rateLimitConfigCacheTtlMs',
}

const WEBHOOKS_KEY_MAP: Record<string, keyof WebhooksConfig> = {
  max_delivery_attempts: 'maxDeliveryAttempts',
  delivery_timeout_ms: 'deliveryTimeoutMs',
  max_response_body_length: 'maxResponseBodyLength',
}

const COST_KEY_MAP: Record<string, keyof CostConfig> = {
  token_pricing: 'tokenPricing',
}

const MONITORING_BUFFER_KEY_MAP: Record<string, keyof MonitoringConfig> = {
  extraction_buffer_size: 'extractionBufferSize',
  max_metrics_buffer_size: 'maxMetricsBufferSize',
  max_alert_history: 'maxAlertHistory',
  max_response_times: 'maxResponseTimes',
  server_perf_max_events: 'serverPerfMaxEvents',
  server_perf_max_age_ms: 'serverPerfMaxAgeMs',
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
  skip_ocr_threshold: 'skipOcrThreshold',
  selective_ocr_threshold: 'selectiveOcrThreshold',
  weight_char_density: 'weightCharDensity',
  weight_text_quality: 'weightTextQuality',
  weight_page_variance: 'weightPageVariance',
  weight_encoding_check: 'weightEncodingCheck',
  weight_field_extraction: 'weightFieldExtraction',
  timeout_seconds: 'timeoutSeconds',
  max_text_length: 'maxTextLength',
  pdf_load_timeout_ms: 'pdfLoadTimeoutMs',
  max_worker_failures: 'maxWorkerFailures',
  ocr_cleanup_timeout_ms: 'ocrCleanupTimeoutMs',
}

const MONITORING_KEY_MAP: Record<string, keyof MonitoringConfig> = {
  error_rate_warning_threshold: 'errorRateWarningThreshold',
  error_rate_critical_threshold: 'errorRateCriticalThreshold',
  avg_latency_critical_ms: 'avgLatencyCriticalMs',
  check_interval_ms: 'checkIntervalMs',
  alert_cooldown_minutes: 'alertCooldownMinutes',
  enable_email_alerts: 'enableEmailAlerts',
  alert_email_addresses: 'alertEmailAddresses',
  min_provider_requests_for_latency_alert: 'minProviderRequestsForLatencyAlert',
}

const RETENTION_KEY_MAP: Record<string, keyof RetentionConfig> = {
  processing_log_retention_days: 'processingLogRetentionDays',
  extraction_metrics_retention_days: 'extractionMetricsRetentionDays',
}

// =============================================================================
// CACHE
// =============================================================================

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
// Default 300000 (5 min) — configurable via app_settings server.config_cache_ttl_ms
let CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Self-updating: after first successful getServerConfig(), update local TTLs
let _serverConfigSelfLoaded = false
async function _selfLoadServerConfig(): Promise<void> {
  if (_serverConfigSelfLoaded) return
  _serverConfigSelfLoaded = true
  try {
    // Use a direct DB fetch to avoid circular cache dependency
    const serverCfg = await getCategorySettings('server')
    if (serverCfg['db_query_timeout_ms'] !== undefined) {
      DB_QUERY_TIMEOUT_MS = Number(serverCfg['db_query_timeout_ms'])
    }
    if (serverCfg['config_cache_ttl_ms'] !== undefined) {
      CACHE_TTL_MS = Number(serverCfg['config_cache_ttl_ms'])
    }
  } catch {
    // Keep defaults — DB may not be available yet at startup
  }
}
// Fire-and-forget after a short delay to let Supabase client initialize
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => _selfLoadServerConfig(), 2000)
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}

function setInCache<T>(key: string, value: T): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

// =============================================================================
// DATABASE CLIENT
// =============================================================================

let supabase: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  if (supabase && process.env.NODE_ENV !== 'test') return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return null
  }

  try {
    supabase = createClient(url, serviceKey)
    return supabase
  } catch {
    return null
  }
}

// =============================================================================
// CONFIGURATION GETTERS
// =============================================================================

/**
 * Get all settings for a category from database
 */
async function getCategorySettings(category: string): Promise<Record<string, unknown>> {
  const cacheKey = `category:${category}`
  const start = performance.now()

  // Check cache first
  const cached = getFromCache<Record<string, unknown>>(cacheKey)
  if (cached !== null) {
    recordServerConfigFetch(
      category,
      Math.round((performance.now() - start) * 100) / 100,
      true,
      true
    )
    return cached
  }

  const db = getClient()
  if (!db) {
    recordServerConfigFetch(
      category,
      Math.round((performance.now() - start) * 100) / 100,
      false,
      false
    )
    return {}
  }

  try {
    // Race the DB query against a timeout to prevent indefinite hangs
    const queryPromise = Promise.resolve(
      db.from('app_settings').select('key, value').eq('category', category)
    )

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Config query timed out after ${DB_QUERY_TIMEOUT_MS}ms`)),
        DB_QUERY_TIMEOUT_MS
      )
    )

    const { data, error } = await Promise.race([queryPromise, timeoutPromise])

    if (error || !data) {
      recordServerConfigFetch(
        category,
        Math.round((performance.now() - start) * 100) / 100,
        false,
        false
      )
      return {}
    }

    const result = data.reduce(
      (acc, { key, value }) => {
        acc[key] = value
        return acc
      },
      {} as Record<string, unknown>
    )

    // Cache the result
    setInCache(cacheKey, result)
    recordServerConfigFetch(
      category,
      Math.round((performance.now() - start) * 100) / 100,
      false,
      true
    )
    return result
  } catch {
    recordServerConfigFetch(
      category,
      Math.round((performance.now() - start) * 100) / 100,
      false,
      false
    )
    return {}
  }
}

/**
 * Get AI configuration with database values merged over defaults
 */
export async function getAIConfig(): Promise<AIConfig> {
  const cacheKey = 'config:ai'

  // Check cache first
  const cached = getFromCache<AIConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('ai')
  const config = { ...DEFAULT_AI_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(AI_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
    }
  }

  // Ensure maxTokens is at least 8192 to prevent extraction truncation
  if (config.maxTokens < 8192) {
    config.maxTokens = 8192
  }

  // Cache the result
  setInCache(cacheKey, config)
  return config
}

/**
 * Get rate limits configuration with database values merged over defaults
 */
export async function getRateLimitsConfig(): Promise<RateLimitsConfig> {
  const cacheKey = 'config:rate_limits'

  // Check cache first
  const cached = getFromCache<RateLimitsConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('rate_limits')
  const config = { ...DEFAULT_RATE_LIMITS_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(RATE_LIMITS_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
    }
  }

  // Cache the result
  setInCache(cacheKey, config)
  return config
}

/**
 * Get OCR configuration with database values merged over defaults
 */
export async function getOCRConfig(): Promise<OCRConfig> {
  const cacheKey = 'config:ocr'

  // Check cache first
  const cached = getFromCache<OCRConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('ocr')
  const config = { ...DEFAULT_OCR_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(OCR_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      ;(config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
    }
  }

  // Cache the result
  setInCache(cacheKey, config)
  return config
}

/**
 * Get monitoring configuration with database values merged over defaults
 */
export async function getMonitoringConfig(): Promise<MonitoringConfig> {
  const cacheKey = 'config:monitoring'

  const cached = getFromCache<MonitoringConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('monitoring')
  const config = { ...DEFAULT_MONITORING_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(MONITORING_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      const val = dbSettings[dbKey]
      if (tsKey === 'enableEmailAlerts') {
        ;(config as Record<string, unknown>)[tsKey] = val === 'true' || val === true
      } else if (tsKey === 'alertEmailAddresses') {
        ;(config as Record<string, unknown>)[tsKey] = String(val)
      } else {
        ;(config as Record<string, unknown>)[tsKey] = Number(val)
      }
    }
  }

  // Also merge buffer/limit settings from monitoring category
  for (const [dbKey, tsKey] of Object.entries(MONITORING_BUFFER_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      ;(config as Record<string, unknown>)[tsKey] = Number(dbSettings[dbKey])
    }
  }

  setInCache(cacheKey, config)
  return config
}

/**
 * Get retention configuration with database values merged over defaults
 */
export async function getRetentionConfig(): Promise<RetentionConfig> {
  const cacheKey = 'config:retention'

  const cached = getFromCache<RetentionConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('retention')
  const config = { ...DEFAULT_RETENTION_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(RETENTION_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      ;(config as Record<string, unknown>)[tsKey] = Number(dbSettings[dbKey])
    }
  }

  setInCache(cacheKey, config)
  return config
}

/**
 * Get FX configuration with database values merged over defaults
 */
export async function getFXConfig(): Promise<FXConfig> {
  const cacheKey = 'config:fx'

  const cached = getFromCache<FXConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('fx')
  const config = { ...DEFAULT_FX_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(FX_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      const val = dbSettings[dbKey]
      if (tsKey === 'supportedCurrencies' || tsKey === 'fallbackRates') {
        // JSON fields: parse if string, otherwise use as-is
        if (typeof val === 'string') {
          try {
            ;(config as Record<string, unknown>)[tsKey] = JSON.parse(val)
          } catch {
            // Keep default on invalid JSON
          }
        } else {
          ;(config as Record<string, unknown>)[tsKey] = val
        }
      } else {
        ;(config as Record<string, unknown>)[tsKey] = Number(val)
      }
    }
  }

  setInCache(cacheKey, config)
  return config
}

/**
 * Get server infrastructure configuration with database values merged over defaults
 */
export async function getServerConfig(): Promise<ServerConfig> {
  const cacheKey = 'config:server'

  const cached = getFromCache<ServerConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('server')
  const config = { ...DEFAULT_SERVER_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(SERVER_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      ;(config as Record<string, unknown>)[tsKey] = Number(dbSettings[dbKey])
    }
  }

  setInCache(cacheKey, config)
  return config
}

/**
 * Get webhooks configuration with database values merged over defaults
 */
export async function getWebhooksConfig(): Promise<WebhooksConfig> {
  const cacheKey = 'config:webhooks'

  const cached = getFromCache<WebhooksConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('webhooks')
  const config = { ...DEFAULT_WEBHOOKS_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(WEBHOOKS_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      ;(config as Record<string, unknown>)[tsKey] = Number(dbSettings[dbKey])
    }
  }

  setInCache(cacheKey, config)
  return config
}

/**
 * Get cost tracking configuration with database values merged over defaults
 */
export async function getCostConfig(): Promise<CostConfig> {
  const cacheKey = 'config:cost'

  const cached = getFromCache<CostConfig>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const dbSettings = await getCategorySettings('cost')
  const config = { ...DEFAULT_COST_CONFIG }

  for (const [dbKey, tsKey] of Object.entries(COST_KEY_MAP)) {
    if (dbSettings[dbKey] !== undefined) {
      const val = dbSettings[dbKey]
      if (tsKey === 'tokenPricing') {
        if (typeof val === 'string') {
          try {
            ;(config as Record<string, unknown>)[tsKey] = JSON.parse(val)
          } catch {
            // Keep default on invalid JSON
          }
        } else {
          ;(config as Record<string, unknown>)[tsKey] = val
        }
      }
    }
  }

  setInCache(cacheKey, config)
  return config
}

// =============================================================================
// FEATURE FLAGS
// =============================================================================

interface FeatureFlag {
  key: string
  enabled: boolean
  rolloutPercentage: number
  expiresAt: string | null
}

/**
 * Check if a feature flag is enabled
 * Supports rollout percentages for gradual feature releases
 */
export async function isFeatureEnabled(flagKey: string, userId?: string): Promise<boolean> {
  const cacheKey = `feature:${flagKey}:${userId || 'anon'}`

  // Check cache
  const cached = getFromCache<boolean>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const db = getClient()
  if (!db) {
    return false
  }

  try {
    const { data, error } = await db.from('feature_flags').select('*').eq('key', flagKey).single()

    if (error || !data) {
      return false
    }

    const flag = data as FeatureFlag

    // Check if expired
    if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
      return false
    }

    // Check if globally disabled
    if (!flag.enabled) {
      return false
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      // Use user ID or random for consistent bucketing
      const bucket = userId ? hashString(userId + flagKey) % 100 : Math.floor(Math.random() * 100)

      if (bucket >= flag.rolloutPercentage) {
        return false
      }
    }

    // Cache the result
    setInCache(cacheKey, true)
    return true
  } catch {
    return false
  }
}

/**
 * Simple string hash for consistent bucketing
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/**
 * Invalidate cache for a specific category or all categories
 */
export function invalidateCache(category?: string): void {
  if (category) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${category}:`) || key === `config:${category}`) {
        cache.delete(key)
      }
    }
  } else {
    cache.clear()
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const configService = {
  getAIConfig,
  getRateLimitsConfig,
  getOCRConfig,
  getMonitoringConfig,
  getRetentionConfig,
  getFXConfig,
  getServerConfig,
  getWebhooksConfig,
  getCostConfig,
  isFeatureEnabled,
  invalidateCache,
}

export default configService
