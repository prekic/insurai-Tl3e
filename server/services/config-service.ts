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

// =============================================================================
// TYPES
// =============================================================================

export interface AIConfig {
  openaiExtractionModel: string
  openaiBackupModel: string
  anthropicExtractionModel: string
  anthropicBackupModel: string
  maxTokens: number
  temperature: number
  chatTemperature: number
  minConfidence: number
  extractionTimeoutMs: number
  preferredProvider: 'auto' | 'openai' | 'anthropic'
  enableFallback: boolean
  consensusEnabled: boolean
  consensusAgreementThreshold: number
  consensusFields: string[]
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
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_AI_CONFIG: AIConfig = {
  openaiExtractionModel: 'gpt-4o',
  openaiBackupModel: 'gpt-4o-mini',
  anthropicExtractionModel: 'claude-sonnet-4-20250514',
  anthropicBackupModel: 'claude-3-5-haiku-20241022',
  maxTokens: 4096,
  temperature: 0.1,
  chatTemperature: 0.7,
  minConfidence: 0.7,
  extractionTimeoutMs: 90000,
  preferredProvider: 'auto',
  enableFallback: true,
  consensusEnabled: true,
  consensusAgreementThreshold: 0.8,
  consensusFields: ['policyNumber', 'provider', 'premium', 'startDate', 'endDate'],
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
  extraction_timeout_ms: 'extractionTimeoutMs',
  preferred_provider: 'preferredProvider',
  enable_fallback: 'enableFallback',
  consensus_enabled: 'consensusEnabled',
  consensus_agreement_threshold: 'consensusAgreementThreshold',
  consensus_fields: 'consensusFields',
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
}

// =============================================================================
// CACHE
// =============================================================================

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

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
  if (supabase) return supabase

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

  // Check cache first
  const cached = getFromCache<Record<string, unknown>>(cacheKey)
  if (cached !== null) {
    return cached
  }

  const db = getClient()
  if (!db) {
    return {}
  }

  try {
    const { data, error } = await db
      .from('app_settings')
      .select('key, value')
      .eq('category', category)

    if (error || !data) {
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
    return result
  } catch {
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
      (config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
    }
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
      (config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
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
      (config as Record<string, unknown>)[tsKey] = dbSettings[dbKey]
    }
  }

  // Cache the result
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
    const { data, error } = await db
      .from('feature_flags')
      .select('*')
      .eq('key', flagKey)
      .single()

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
      const bucket = userId
        ? hashString(userId + flagKey) % 100
        : Math.floor(Math.random() * 100)

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
  isFeatureEnabled,
  invalidateCache,
}

export default configService
