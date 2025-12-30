/**
 * AI Response Cache Types
 * Content-addressed caching for AI extraction and OCR results
 */

export interface CacheEntry<T> {
  key: string
  data: T
  createdAt: number
  expiresAt: number
  hits: number
  size: number
  provider?: string
  metadata?: Record<string, unknown>
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
  entryCount: number
  hitRate: number
  estimatedSavings: number // Estimated cost savings in API calls
  oldestEntry: number | null
  newestEntry: number | null
}

export interface CacheConfig {
  // Time-to-live in milliseconds
  ttl: number
  // Maximum cache size in bytes
  maxSize: number
  // Maximum number of entries
  maxEntries: number
  // Prefix for storage keys
  prefix: string
  // Enable debug logging
  debug: boolean
}

export type CacheType = 'extraction' | 'ocr' | 'consensus'

/**
 * Default cache configurations by type
 */
export const DEFAULT_CACHE_CONFIGS: Record<CacheType, CacheConfig> = {
  extraction: {
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxSize: 50 * 1024 * 1024, // 50MB
    maxEntries: 500,
    prefix: 'ai_cache_extraction',
    debug: false,
  },
  ocr: {
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days (OCR results don't change)
    maxSize: 100 * 1024 * 1024, // 100MB
    maxEntries: 200,
    prefix: 'ai_cache_ocr',
    debug: false,
  },
  consensus: {
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxSize: 50 * 1024 * 1024, // 50MB
    maxEntries: 300,
    prefix: 'ai_cache_consensus',
    debug: false,
  },
}

/**
 * Estimated costs per API call (for savings calculation)
 */
export const ESTIMATED_COSTS: Record<string, number> = {
  'openai-gpt4o': 0.015, // ~$0.015 per extraction
  'anthropic-claude': 0.018, // ~$0.018 per extraction
  'google-ocr': 0.0015, // ~$0.0015 per page
  'consensus': 0.035, // Combined cost
}
