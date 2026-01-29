/**
 * AI Response Cache
 * Content-addressed caching for AI extraction and OCR results
 *
 * Provides ~60% cost reduction by caching identical document extractions
 */

import { CacheStorage, isIndexedDBAvailable } from './storage'
import { hashContent, hashFile, generateCacheKey, estimateSize } from './hash'
import type { CacheConfig, CacheStats, CacheType } from './types'
import { DEFAULT_CACHE_CONFIGS, ESTIMATED_COSTS } from './types'
import type { ExtractedPolicyData } from '../extraction-schema'
import type { OCRResult } from '../ocr'

/**
 * AI Cache Manager
 * Singleton that manages all AI response caches
 */
class AICacheManager {
  private extractionCache: CacheStorage<ExtractedPolicyData> | null = null
  private ocrCache: CacheStorage<OCRResult> | null = null
  private consensusCache: CacheStorage<ExtractedPolicyData> | null = null
  private enabled: boolean = true
  private initialized: boolean = false
  private debug: boolean = false

  /**
   * Enable debug logging
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled
  }

  /**
   * Initialize the cache manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    if (!isIndexedDBAvailable()) {
      // Silently disable in test environments
      this.enabled = false
      return
    }

    try {
      this.extractionCache = new CacheStorage<ExtractedPolicyData>(
        'extraction',
        DEFAULT_CACHE_CONFIGS.extraction
      )
      this.ocrCache = new CacheStorage<OCRResult>(
        'ocr',
        DEFAULT_CACHE_CONFIGS.ocr
      )
      this.consensusCache = new CacheStorage<ExtractedPolicyData>(
        'consensus',
        DEFAULT_CACHE_CONFIGS.consensus
      )

      // Prune expired entries on startup
      await Promise.all([
        this.extractionCache.pruneExpired(),
        this.ocrCache.pruneExpired(),
        this.consensusCache.pruneExpired(),
      ])

      this.initialized = true
    } catch (error) {
      if (this.debug) console.warn('[AICache] Initialization failed:', error)
      this.enabled = false
    }
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.initialized
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Get cached extraction result
   *
   * @param documentText - The document text being extracted
   * @param provider - The AI provider (openai, anthropic)
   * @param options - Additional options for cache key generation
   * @param options.promptVersion - Version of the prompt template (e.g., 'kasko-extract-v3.0')
   * @param options.pipelineVersion - Version of the processing pipeline (e.g., '1.0.0')
   */
  async getExtraction(
    documentText: string,
    provider: string,
    options?: {
      promptVersion?: string
      pipelineVersion?: string
    }
  ): Promise<ExtractedPolicyData | null> {
    if (!this.isEnabled() || !this.extractionCache) return null

    try {
      // Include versions in cache key for proper invalidation
      const versionSuffix = [
        options?.promptVersion || 'v1',
        options?.pipelineVersion || 'p1',
      ].join('_')

      const key = await generateCacheKey('extraction', provider, versionSuffix, documentText)
      const entry = await this.extractionCache.get(key)

      if (entry) {
        if (this.debug) {
          console.warn(`[AICache] Hit for extraction (${provider}, ${versionSuffix})`)
        }
        return entry.data
      }

      await this.extractionCache.recordMiss()
      return null
    } catch {
      return null
    }
  }

  /**
   * Cache an extraction result
   *
   * @param documentText - The document text being extracted
   * @param provider - The AI provider (openai, anthropic)
   * @param data - The extracted policy data
   * @param options - Additional options for cache key generation
   * @param options.promptVersion - Version of the prompt template
   * @param options.pipelineVersion - Version of the processing pipeline
   */
  async setExtraction(
    documentText: string,
    provider: string,
    data: ExtractedPolicyData,
    options?: {
      promptVersion?: string
      pipelineVersion?: string
    }
  ): Promise<void> {
    if (!this.isEnabled() || !this.extractionCache) return

    try {
      // Include versions in cache key for proper invalidation
      const versionSuffix = [
        options?.promptVersion || 'v1',
        options?.pipelineVersion || 'p1',
      ].join('_')

      const key = await generateCacheKey('extraction', provider, versionSuffix, documentText)
      await this.extractionCache.set(key, data, {
        provider,
        promptVersion: options?.promptVersion,
        pipelineVersion: options?.pipelineVersion,
        documentLength: documentText.length,
        confidence: data.confidence.overall,
      })

      if (this.debug) {
        console.warn(`[AICache] Stored extraction (${provider}, ${versionSuffix})`)
      }
    } catch {
      // Cache write failures are non-critical
    }
  }

  /**
   * Get cached OCR result
   */
  async getOCR(file: File): Promise<OCRResult | null> {
    if (!this.isEnabled() || !this.ocrCache) return null

    try {
      const fileHash = await hashFile(file)
      const key = `ocr_${fileHash.slice(0, 16)}`
      const entry = await this.ocrCache.get(key)

      if (entry) {
        return entry.data
      }

      await this.ocrCache.recordMiss()
      return null
    } catch {
      return null
    }
  }

  /**
   * Cache an OCR result
   */
  async setOCR(file: File, data: OCRResult): Promise<void> {
    if (!this.isEnabled() || !this.ocrCache) return

    try {
      const fileHash = await hashFile(file)
      const key = `ocr_${fileHash.slice(0, 16)}`
      await this.ocrCache.set(key, data, {
        fileName: file.name,
        fileSize: file.size,
        pageCount: data.pageCount,
      })
    } catch {
      // Cache write failures are non-critical
    }
  }

  /**
   * Get cached consensus result
   *
   * @param documentText - The document text being extracted
   * @param providers - The AI providers used for consensus
   * @param options - Additional options for cache key generation
   */
  async getConsensus(
    documentText: string,
    providers: string[],
    options?: {
      promptVersion?: string
      pipelineVersion?: string
    }
  ): Promise<ExtractedPolicyData | null> {
    if (!this.isEnabled() || !this.consensusCache) return null

    try {
      const providerKey = providers.sort().join(',')
      const versionSuffix = [
        options?.promptVersion || 'v1',
        options?.pipelineVersion || 'p1',
      ].join('_')

      const key = await generateCacheKey('consensus', providerKey, versionSuffix, documentText)
      const entry = await this.consensusCache.get(key)

      if (entry) {
        if (this.debug) {
          console.warn(`[AICache] Hit for consensus (${providerKey}, ${versionSuffix})`)
        }
        return entry.data
      }

      await this.consensusCache.recordMiss()
      return null
    } catch {
      return null
    }
  }

  /**
   * Cache a consensus result
   *
   * @param documentText - The document text being extracted
   * @param providers - The AI providers used for consensus
   * @param data - The extracted policy data
   * @param options - Additional options for cache key generation
   */
  async setConsensus(
    documentText: string,
    providers: string[],
    data: ExtractedPolicyData,
    options?: {
      promptVersion?: string
      pipelineVersion?: string
    }
  ): Promise<void> {
    if (!this.isEnabled() || !this.consensusCache) return

    try {
      const providerKey = providers.sort().join(',')
      const versionSuffix = [
        options?.promptVersion || 'v1',
        options?.pipelineVersion || 'p1',
      ].join('_')

      const key = await generateCacheKey('consensus', providerKey, versionSuffix, documentText)
      await this.consensusCache.set(key, data, {
        providers,
        promptVersion: options?.promptVersion,
        pipelineVersion: options?.pipelineVersion,
        confidence: data.confidence.overall,
      })

      if (this.debug) {
        console.warn(`[AICache] Stored consensus (${providerKey}, ${versionSuffix})`)
      }
    } catch {
      // Cache write failures are non-critical
    }
  }

  /**
   * Get combined cache statistics
   */
  async getStats(): Promise<{
    extraction: CacheStats
    ocr: CacheStats
    consensus: CacheStats
    total: CacheStats
  }> {
    const emptyStats: CacheStats = {
      hits: 0,
      misses: 0,
      size: 0,
      entryCount: 0,
      hitRate: 0,
      estimatedSavings: 0,
      oldestEntry: null,
      newestEntry: null,
    }

    const [extraction, ocr, consensus] = await Promise.all([
      this.extractionCache?.getStats() ?? emptyStats,
      this.ocrCache?.getStats() ?? emptyStats,
      this.consensusCache?.getStats() ?? emptyStats,
    ])

    const total: CacheStats = {
      hits: extraction.hits + ocr.hits + consensus.hits,
      misses: extraction.misses + ocr.misses + consensus.misses,
      size: extraction.size + ocr.size + consensus.size,
      entryCount: extraction.entryCount + ocr.entryCount + consensus.entryCount,
      hitRate: 0,
      estimatedSavings: 0,
      oldestEntry: null,
      newestEntry: null,
    }

    // Calculate overall hit rate
    total.hitRate = total.hits + total.misses > 0
      ? total.hits / (total.hits + total.misses)
      : 0

    // Calculate estimated savings
    total.estimatedSavings =
      extraction.hits * ESTIMATED_COSTS['openai-gpt4o'] +
      ocr.hits * ESTIMATED_COSTS['google-ocr'] +
      consensus.hits * ESTIMATED_COSTS['consensus']

    // Find oldest/newest entries
    const allDates = [
      extraction.oldestEntry,
      ocr.oldestEntry,
      consensus.oldestEntry,
    ].filter((d): d is number => d !== null)

    total.oldestEntry = allDates.length > 0 ? Math.min(...allDates) : null
    total.newestEntry = allDates.length > 0 ? Math.max(...allDates) : null

    return { extraction, ocr, consensus, total }
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    await Promise.all([
      this.extractionCache?.clear(),
      this.ocrCache?.clear(),
      this.consensusCache?.clear(),
    ])
  }

  /**
   * Clear a specific cache type
   */
  async clear(type: CacheType): Promise<void> {
    switch (type) {
      case 'extraction':
        await this.extractionCache?.clear()
        break
      case 'ocr':
        await this.ocrCache?.clear()
        break
      case 'consensus':
        await this.consensusCache?.clear()
        break
    }
  }

  /**
   * Prune expired entries from all caches
   */
  async pruneExpired(): Promise<{ extraction: number; ocr: number; consensus: number }> {
    const [extraction, ocr, consensus] = await Promise.all([
      this.extractionCache?.pruneExpired() ?? 0,
      this.ocrCache?.pruneExpired() ?? 0,
      this.consensusCache?.pruneExpired() ?? 0,
    ])

    return { extraction, ocr, consensus }
  }
}

// Export singleton instance
export const aiCache = new AICacheManager()

// Re-export types and utilities
export type { CacheConfig, CacheStats, CacheType }
export { hashContent, hashFile, generateCacheKey, estimateSize }
export { ESTIMATED_COSTS, DEFAULT_CACHE_CONFIGS }
