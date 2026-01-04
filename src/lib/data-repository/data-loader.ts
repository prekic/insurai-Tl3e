/**
 * Data Loader
 * Dynamic data loading with caching and validation
 */

import type { PolicyType } from '@/types/policy'
import type {
  PolicyTypeMarketData,
  InsuranceProvider,
  TurkishRegion,
  ProviderInfo,
} from '@/types/market-data'
import type {
  BenchmarkDataRepository,
  DataLoadOptions,
  DataLoadResult,
  DataSetMetadata,
  RegionalData,
  DataQualityMetrics,
} from '@/types/data-repository'
import { CURRENT_DATA_VERSION, calculateFreshnessScore, needsRefresh } from '@/types/data-repository'
import { validateRepository } from './validators'

// =============================================================================
// Cache Management
// =============================================================================

interface CacheEntry<T> {
  data: T
  loadedAt: number
  metadata: DataSetMetadata
  expiresAt: number
}

class DataCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map()
  private readonly defaultTTL = 24 * 60 * 60 * 1000 // 24 hours

  set<T>(key: string, data: T, metadata: DataSetMetadata, ttl?: number): void {
    const now = Date.now()
    this.cache.set(key, {
      data,
      metadata,
      loadedAt: now,
      expiresAt: now + (ttl ?? this.defaultTTL),
    })
  }

  get<T>(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry
  }

  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }
    return true
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  invalidateAll(): void {
    this.cache.clear()
  }

  getAge(key: string): number | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    return Date.now() - entry.loadedAt
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}

// Global cache instance
const dataCache = new DataCache()

// =============================================================================
// Data Sources
// =============================================================================

type DataSourceType = 'embedded' | 'file' | 'api'

interface DataSourceConfig {
  type: DataSourceType
  priority: number
  enabled: boolean
  endpoint?: string
}

const DATA_SOURCES: DataSourceConfig[] = [
  { type: 'api', priority: 1, enabled: false, endpoint: '/api/market-data' },
  { type: 'file', priority: 2, enabled: true },
  { type: 'embedded', priority: 3, enabled: true },
]

// =============================================================================
// Data Loader Class
// =============================================================================

export class MarketDataLoader {
  private embeddedData: BenchmarkDataRepository | null = null
  private loadPromise: Promise<void> | null = null

  /**
   * Load complete benchmark repository
   */
  async loadRepository(options: DataLoadOptions = {}): Promise<DataLoadResult<BenchmarkDataRepository>> {
    const cacheKey = 'benchmark-repository'
    const {
      forceRefresh = false,
      skipValidation = false,
      maxCacheAge = 24 * 60 * 60 * 1000,
      fallbackToCache = true,
    } = options

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = dataCache.get<BenchmarkDataRepository>(cacheKey)
      if (cached) {
        const age = dataCache.getAge(cacheKey)
        if (age !== null && age < maxCacheAge) {
          return {
            success: true,
            data: cached.data,
            source: 'cache',
            loadedAt: new Date(cached.loadedAt).toISOString(),
            metadata: cached.metadata,
          }
        }
      }
    }

    // Try loading from available sources
    for (const source of DATA_SOURCES.filter(s => s.enabled).sort((a, b) => a.priority - b.priority)) {
      try {
        const result = await this.loadFromSource(source, skipValidation)
        if (result.success && result.data && result.metadata) {
          // Cache the result
          dataCache.set(cacheKey, result.data, result.metadata, maxCacheAge)
          return result
        }
      } catch (error) {
        console.warn(`Failed to load from ${source.type}:`, error)
        continue
      }
    }

    // Fallback to cache if enabled
    if (fallbackToCache) {
      const cached = dataCache.get<BenchmarkDataRepository>(cacheKey)
      if (cached) {
        return {
          success: true,
          data: cached.data,
          source: 'cache',
          loadedAt: new Date(cached.loadedAt).toISOString(),
          metadata: cached.metadata,
          error: 'Using stale cache due to load failure',
        }
      }
    }

    return {
      success: false,
      error: 'Failed to load market data from any source',
      source: 'embedded',
      loadedAt: new Date().toISOString(),
    }
  }

  /**
   * Load from specific source
   */
  private async loadFromSource(
    source: DataSourceConfig,
    skipValidation: boolean
  ): Promise<DataLoadResult<BenchmarkDataRepository>> {
    switch (source.type) {
      case 'api':
        if (!source.endpoint) {
          return {
            success: false,
            error: 'API endpoint not configured',
            source: 'api',
            loadedAt: new Date().toISOString(),
          }
        }
        return this.loadFromAPI(source.endpoint, skipValidation)
      case 'file':
        return this.loadFromFile(skipValidation)
      case 'embedded':
        return this.loadEmbedded(skipValidation)
    }
  }

  /**
   * Load from API endpoint
   */
  private async loadFromAPI(
    endpoint: string,
    skipValidation: boolean
  ): Promise<DataLoadResult<BenchmarkDataRepository>> {
    try {
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }

      const data = await response.json() as BenchmarkDataRepository

      // Validate unless skipped
      if (!skipValidation) {
        const report = validateRepository(data)
        if (!report.valid) {
          return {
            success: false,
            error: `Validation failed: ${report.summary}`,
            source: 'api',
            loadedAt: new Date().toISOString(),
          }
        }
      }

      return {
        success: true,
        data,
        source: 'api',
        loadedAt: new Date().toISOString(),
        metadata: data.metadata,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API load failed',
        source: 'api',
        loadedAt: new Date().toISOString(),
      }
    }
  }

  /**
   * Load from local file (for future file-based data)
   */
  private async loadFromFile(skipValidation: boolean): Promise<DataLoadResult<BenchmarkDataRepository>> {
    // For now, delegate to embedded data
    // In future, this could load from a JSON file in public/ or fetched from server
    return this.loadEmbedded(skipValidation)
  }

  /**
   * Load embedded data (current implementation)
   */
  private async loadEmbedded(skipValidation: boolean): Promise<DataLoadResult<BenchmarkDataRepository>> {
    try {
      // Lazy load embedded data
      if (!this.embeddedData) {
        if (this.loadPromise) {
          await this.loadPromise
        } else {
          this.loadPromise = this.initializeEmbeddedData()
          await this.loadPromise
        }
      }

      if (!this.embeddedData) {
        return {
          success: false,
          error: 'Failed to initialize embedded data',
          source: 'embedded',
          loadedAt: new Date().toISOString(),
        }
      }

      // Validate unless skipped
      if (!skipValidation) {
        const report = validateRepository(this.embeddedData)
        if (!report.valid) {
          console.warn('Embedded data validation issues:', report.summary)
          // Don't fail on embedded data validation - it's our fallback
        }
      }

      return {
        success: true,
        data: this.embeddedData,
        source: 'embedded',
        loadedAt: new Date().toISOString(),
        metadata: this.embeddedData.metadata,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Embedded load failed',
        source: 'embedded',
        loadedAt: new Date().toISOString(),
      }
    }
  }

  /**
   * Initialize embedded data from current modules
   */
  private async initializeEmbeddedData(): Promise<void> {
    // Dynamically import current data modules
    const [benchmarksModule, providersModule] = await Promise.all([
      import('@/data/market-data/benchmarks'),
      import('@/data/market-data/providers'),
    ])

    const benchmarks = benchmarksModule.MARKET_BENCHMARKS
    const providers = providersModule.INSURANCE_PROVIDERS

    // Create repository with metadata
    const metadata = this.createMetadata()
    const qualityMetrics = this.assessDataQuality(benchmarks, providers)

    this.embeddedData = {
      metadata: {
        ...metadata,
        quality: qualityMetrics,
      },
      benchmarks,
      providers,
      regionalFactors: this.createRegionalFactors(),
    }
  }

  /**
   * Create metadata for embedded data
   */
  private createMetadata(): DataSetMetadata {
    return {
      id: 'embedded-market-data-v1',
      name: 'Turkish Insurance Market Data',
      description: 'Comprehensive market benchmark data for Turkish insurance industry',
      version: CURRENT_DATA_VERSION.toString(),
      lastUpdated: '2024-12-01T00:00:00.000Z', // Update this when data changes
      source: {
        name: 'SEDDK/TSB',
        type: 'official',
        reference: 'https://www.tsb.org.tr/',
        confidence: 0.85,
      },
      effectiveFrom: '2024-01-01',
      effectiveTo: '2024-12-31',
      quality: {
        completeness: 85,
        accuracy: 80,
        timeliness: 70,
        overall: 78,
        issues: [],
      },
    }
  }

  /**
   * Create regional factors data
   */
  private createRegionalFactors(): Record<TurkishRegion, RegionalData> {
    return {
      marmara: {
        region: 'marmara',
        name: 'Marmara',
        nameTr: 'Marmara',
        baseFactor: 1.15,
        riskProfile: {
          earthquake: 'very_high',
          flood: 'medium',
          theft: 'high',
          traffic: 'high',
        },
        population: 26_000_000,
        economicIndex: 1.3,
      },
      ege: {
        region: 'ege',
        name: 'Aegean',
        nameTr: 'Ege',
        baseFactor: 1.05,
        riskProfile: {
          earthquake: 'high',
          flood: 'medium',
          theft: 'medium',
          traffic: 'medium',
        },
        population: 10_500_000,
        economicIndex: 1.1,
      },
      akdeniz: {
        region: 'akdeniz',
        name: 'Mediterranean',
        nameTr: 'Akdeniz',
        baseFactor: 1.0,
        riskProfile: {
          earthquake: 'medium',
          flood: 'high',
          theft: 'medium',
          traffic: 'medium',
        },
        population: 11_000_000,
        economicIndex: 1.0,
      },
      karadeniz: {
        region: 'karadeniz',
        name: 'Black Sea',
        nameTr: 'Karadeniz',
        baseFactor: 0.95,
        riskProfile: {
          earthquake: 'medium',
          flood: 'high',
          theft: 'low',
          traffic: 'low',
        },
        population: 7_500_000,
        economicIndex: 0.85,
      },
      ic_anadolu: {
        region: 'ic_anadolu',
        name: 'Central Anatolia',
        nameTr: 'İç Anadolu',
        baseFactor: 0.9,
        riskProfile: {
          earthquake: 'medium',
          flood: 'low',
          theft: 'medium',
          traffic: 'medium',
        },
        population: 13_000_000,
        economicIndex: 0.95,
      },
      dogu_anadolu: {
        region: 'dogu_anadolu',
        name: 'Eastern Anatolia',
        nameTr: 'Doğu Anadolu',
        baseFactor: 0.85,
        riskProfile: {
          earthquake: 'high',
          flood: 'medium',
          theft: 'low',
          traffic: 'low',
        },
        population: 5_500_000,
        economicIndex: 0.7,
      },
      guneydogu: {
        region: 'guneydogu',
        name: 'Southeastern Anatolia',
        nameTr: 'Güneydoğu Anadolu',
        baseFactor: 0.85,
        riskProfile: {
          earthquake: 'high',
          flood: 'low',
          theft: 'low',
          traffic: 'low',
        },
        population: 8_500_000,
        economicIndex: 0.65,
      },
    }
  }

  /**
   * Assess data quality
   */
  private assessDataQuality(
    benchmarks: Record<PolicyType, PolicyTypeMarketData>,
    providers: Record<InsuranceProvider, ProviderInfo>
  ): DataQualityMetrics {
    let completeness = 0
    let totalFields = 0

    // Check benchmark completeness
    for (const marketData of Object.values(benchmarks)) {
      totalFields += 4
      if (marketData.premiumRange) completeness++
      if (marketData.coverageRange) completeness++
      if (marketData.commonCoverages?.length) completeness++
      if (marketData.trends) completeness++
    }

    // Check provider completeness
    for (const provider of Object.values(providers)) {
      totalFields += 4
      if (provider.name) completeness++
      if (provider.nameTr) completeness++
      if (provider.rating !== undefined) completeness++
      if (provider.marketShare !== undefined) completeness++
    }

    const completenessScore = Math.round((completeness / totalFields) * 100)

    return {
      completeness: completenessScore,
      accuracy: 80, // Estimated based on source reliability
      timeliness: calculateFreshnessScore('2024-12-01'),
      overall: Math.round((completenessScore + 80 + calculateFreshnessScore('2024-12-01')) / 3),
      issues: [],
    }
  }

  /**
   * Get specific policy type benchmark
   */
  async getBenchmark(
    policyType: PolicyType,
    options: DataLoadOptions = {}
  ): Promise<PolicyTypeMarketData | null> {
    const result = await this.loadRepository(options)
    if (!result.success || !result.data) return null
    return result.data.benchmarks[policyType] ?? null
  }

  /**
   * Get provider info
   */
  async getProvider(
    provider: InsuranceProvider,
    options: DataLoadOptions = {}
  ): Promise<ProviderInfo | null> {
    const result = await this.loadRepository(options)
    if (!result.success || !result.data) return null
    return result.data.providers[provider] ?? null
  }

  /**
   * Get regional data
   */
  async getRegionalData(
    region: TurkishRegion,
    options: DataLoadOptions = {}
  ): Promise<RegionalData | null> {
    const result = await this.loadRepository(options)
    if (!result.success || !result.data) return null
    return result.data.regionalFactors[region] ?? null
  }

  /**
   * Check if data needs refresh
   */
  async checkFreshness(): Promise<{
    fresh: boolean
    lastUpdated: string | null
    freshnessScore: number
    recommendation: string
  }> {
    const result = await this.loadRepository({ skipValidation: true })

    if (!result.success || !result.metadata) {
      return {
        fresh: false,
        lastUpdated: null,
        freshnessScore: 0,
        recommendation: 'Unable to check data freshness - reload required',
      }
    }

    const freshnessScore = calculateFreshnessScore(
      result.metadata.lastUpdated,
      result.metadata.effectiveTo
    )

    const needsUpdate = needsRefresh(result.metadata)

    return {
      fresh: !needsUpdate,
      lastUpdated: result.metadata.lastUpdated,
      freshnessScore,
      recommendation: needsUpdate
        ? 'Market data should be updated from official sources'
        : 'Data is current',
    }
  }

  /**
   * Invalidate cache and force reload
   */
  invalidateCache(): void {
    dataCache.invalidateAll()
    this.embeddedData = null
    this.loadPromise = null
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const marketDataLoader = new MarketDataLoader()

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Load market data repository
 */
export async function loadMarketData(
  options?: DataLoadOptions
): Promise<DataLoadResult<BenchmarkDataRepository>> {
  return marketDataLoader.loadRepository(options)
}

/**
 * Get benchmark for policy type
 */
export async function getBenchmark(
  policyType: PolicyType,
  options?: DataLoadOptions
): Promise<PolicyTypeMarketData | null> {
  return marketDataLoader.getBenchmark(policyType, options)
}

/**
 * Get provider information
 */
export async function getProviderInfo(
  provider: InsuranceProvider,
  options?: DataLoadOptions
): Promise<ProviderInfo | null> {
  return marketDataLoader.getProvider(provider, options)
}

/**
 * Get regional data
 */
export async function getRegionalData(
  region: TurkishRegion,
  options?: DataLoadOptions
): Promise<RegionalData | null> {
  return marketDataLoader.getRegionalData(region, options)
}

/**
 * Check data freshness
 */
export async function checkDataFreshness(): Promise<{
  fresh: boolean
  lastUpdated: string | null
  freshnessScore: number
  recommendation: string
}> {
  return marketDataLoader.checkFreshness()
}

/**
 * Invalidate all cached data
 */
export function invalidateDataCache(): void {
  marketDataLoader.invalidateCache()
}
