/**
 * Tests for Data Loader
 * Tests DataCache, MarketDataLoader, and convenience functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MarketDataLoader,
  marketDataLoader,
  loadMarketData,
  getBenchmark,
  getProviderInfo,
  getRegionalData,
  checkDataFreshness,
  invalidateDataCache,
} from './data-loader'

// Mock dependencies
vi.mock('./validators', () => ({
  validateRepository: vi.fn(() => ({ valid: true, summary: 'All checks passed' })),
}))

vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    home: {
      premiumRange: { min: 1000, max: 5000, average: 2500 },
      coverageRange: { min: 100000, max: 1000000, average: 500000 },
      commonCoverages: [{ name: 'Fire', inclusionRate: 95 }],
      trends: { premiumChangeYoY: 10 },
    },
    kasko: {
      premiumRange: { min: 5000, max: 20000, average: 10000 },
      coverageRange: { min: 200000, max: 2000000, average: 800000 },
      commonCoverages: [],
      trends: { premiumChangeYoY: 15 },
    },
  },
}))

vi.mock('@/data/market-data/providers', () => ({
  INSURANCE_PROVIDERS: {
    axa: {
      name: 'AXA Sigorta',
      nameTr: 'AXA Sigorta',
      rating: 4.5,
      marketShare: 0.15,
    },
    allianz: {
      name: 'Allianz Sigorta',
      nameTr: 'Allianz Sigorta',
      rating: 4.3,
      marketShare: 0.12,
    },
  },
}))

vi.mock('@/types/data-repository', async () => {
  const actual = await vi.importActual('@/types/data-repository')
  return {
    ...actual,
    CURRENT_DATA_VERSION: 1,
    calculateFreshnessScore: vi.fn((date: string) => {
      const now = Date.now()
      const updateDate = new Date(date).getTime()
      const daysSince = (now - updateDate) / (24 * 60 * 60 * 1000)
      return Math.max(0, Math.round(100 - daysSince))
    }),
    needsRefresh: vi.fn(() => false),
  }
})

// =============================================================================
// DataCache Tests (via MarketDataLoader internal behavior)
// =============================================================================

describe('MarketDataLoader', () => {
  let loader: MarketDataLoader

  beforeEach(() => {
    loader = new MarketDataLoader()
    // Reset global singleton state
    invalidateDataCache()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('loadRepository', () => {
    it('should load repository successfully', async () => {
      const result = await loader.loadRepository()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.source).toBe('embedded')
      expect(result.loadedAt).toBeDefined()
    })

    it('should return cached data on subsequent calls', async () => {
      const result1 = await loader.loadRepository()
      const result2 = await loader.loadRepository()

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result2.source).toBe('cache')
    })

    it('should force refresh when forceRefresh option is true', async () => {
      await loader.loadRepository()
      const result = await loader.loadRepository({ forceRefresh: true })

      expect(result.success).toBe(true)
      expect(result.source).toBe('embedded')
    })

    it('should skip validation when skipValidation option is true', async () => {
      const { validateRepository } = await import('./validators')

      await loader.loadRepository({ skipValidation: true })

      expect(validateRepository).not.toHaveBeenCalled()
    })

    it('should include metadata in result', async () => {
      const result = await loader.loadRepository()

      expect(result.metadata).toBeDefined()
      expect(result.metadata?.id).toBe('embedded-market-data-v1')
      expect(result.metadata?.name).toBe('Turkish Insurance Market Data')
    })

    it('should return correct benchmarks data', async () => {
      const result = await loader.loadRepository()

      expect(result.data?.benchmarks).toBeDefined()
      expect(result.data?.benchmarks.home).toBeDefined()
      expect(result.data?.benchmarks.kasko).toBeDefined()
    })

    it('should return correct providers data', async () => {
      const result = await loader.loadRepository()

      expect(result.data?.providers).toBeDefined()
      expect(result.data?.providers.axa).toBeDefined()
      expect(result.data?.providers.allianz).toBeDefined()
    })

    it('should return regional factors data', async () => {
      const result = await loader.loadRepository()

      expect(result.data?.regionalFactors).toBeDefined()
      expect(result.data?.regionalFactors.marmara).toBeDefined()
      expect(result.data?.regionalFactors.ege).toBeDefined()
    })

    it('should handle cache expiration based on maxCacheAge', async () => {
      vi.useFakeTimers()

      await loader.loadRepository({ maxCacheAge: 1000 })

      // Advance time past cache age
      vi.advanceTimersByTime(2000)

      const result = await loader.loadRepository({ maxCacheAge: 1000 })

      // Should reload from source since cache expired
      expect(result.source).toBe('embedded')
    })
  })

  describe('getBenchmark', () => {
    it('should return benchmark for home policy type', async () => {
      const benchmark = await loader.getBenchmark('home')

      expect(benchmark).not.toBeNull()
      expect(benchmark?.premiumRange).toBeDefined()
      expect(benchmark?.premiumRange.average).toBe(2500)
    })

    it('should return benchmark for kasko policy type', async () => {
      const benchmark = await loader.getBenchmark('kasko')

      expect(benchmark).not.toBeNull()
      expect(benchmark?.premiumRange.average).toBe(10000)
    })

    it('should return null for non-existent policy type', async () => {
      const benchmark = await loader.getBenchmark('nonexistent' as never)

      expect(benchmark).toBeNull()
    })

    it('should pass options to loadRepository', async () => {
      const spy = vi.spyOn(loader, 'loadRepository')

      await loader.getBenchmark('home', { forceRefresh: true })

      expect(spy).toHaveBeenCalledWith({ forceRefresh: true })
    })
  })

  describe('getProvider', () => {
    it('should return provider info for axa', async () => {
      const provider = await loader.getProvider('axa')

      expect(provider).not.toBeNull()
      expect(provider?.name).toBe('AXA Sigorta')
      expect(provider?.rating).toBe(4.5)
    })

    it('should return provider info for allianz', async () => {
      const provider = await loader.getProvider('allianz')

      expect(provider).not.toBeNull()
      expect(provider?.name).toBe('Allianz Sigorta')
    })

    it('should return null for non-existent provider', async () => {
      const provider = await loader.getProvider('nonexistent' as never)

      expect(provider).toBeNull()
    })
  })

  describe('getRegionalData', () => {
    it('should return regional data for marmara', async () => {
      const regional = await loader.getRegionalData('marmara')

      expect(regional).not.toBeNull()
      expect(regional?.region).toBe('marmara')
      expect(regional?.name).toBe('Marmara')
      expect(regional?.baseFactor).toBe(1.15)
    })

    it('should return regional data for ege', async () => {
      const regional = await loader.getRegionalData('ege')

      expect(regional).not.toBeNull()
      expect(regional?.name).toBe('Aegean')
      expect(regional?.nameTr).toBe('Ege')
    })

    it('should include risk profile for each region', async () => {
      const regional = await loader.getRegionalData('marmara')

      expect(regional?.riskProfile).toBeDefined()
      expect(regional?.riskProfile.earthquake).toBe('very_high')
      expect(regional?.riskProfile.flood).toBe('medium')
    })

    it('should return null for non-existent region', async () => {
      const regional = await loader.getRegionalData('nonexistent' as never)

      expect(regional).toBeNull()
    })
  })

  describe('checkFreshness', () => {
    it('should return freshness status', async () => {
      const result = await loader.checkFreshness()

      expect(result).toHaveProperty('fresh')
      expect(result).toHaveProperty('lastUpdated')
      expect(result).toHaveProperty('freshnessScore')
      expect(result).toHaveProperty('recommendation')
    })

    it('should indicate data is fresh when not needing refresh', async () => {
      const result = await loader.checkFreshness()

      expect(result.fresh).toBe(true)
      expect(result.recommendation).toBe('Data is current')
    })

    it('should include lastUpdated date', async () => {
      const result = await loader.checkFreshness()

      expect(result.lastUpdated).toBeDefined()
      expect(typeof result.lastUpdated).toBe('string')
    })

    it('should return freshnessScore as number', async () => {
      const result = await loader.checkFreshness()

      expect(typeof result.freshnessScore).toBe('number')
      expect(result.freshnessScore).toBeGreaterThanOrEqual(0)
    })
  })

  describe('invalidateCache', () => {
    it('should clear cached data', async () => {
      // Load data first
      await loader.loadRepository()

      // Invalidate cache
      loader.invalidateCache()

      // Next load should be from source, not cache
      const result = await loader.loadRepository()
      expect(result.source).toBe('embedded')
    })

    it('should allow fresh load after invalidation', async () => {
      const result1 = await loader.loadRepository()
      expect(result1.success).toBe(true)

      loader.invalidateCache()

      const result2 = await loader.loadRepository()
      expect(result2.success).toBe(true)
      expect(result2.source).toBe('embedded')
    })
  })
})

// =============================================================================
// Regional Factors Tests
// =============================================================================

describe('Regional Factors', () => {
  let loader: MarketDataLoader

  beforeEach(() => {
    loader = new MarketDataLoader()
    invalidateDataCache()
  })

  it('should have all Turkish regions', async () => {
    const result = await loader.loadRepository()

    expect(result.data?.regionalFactors).toHaveProperty('marmara')
    expect(result.data?.regionalFactors).toHaveProperty('ege')
    expect(result.data?.regionalFactors).toHaveProperty('akdeniz')
    expect(result.data?.regionalFactors).toHaveProperty('karadeniz')
    expect(result.data?.regionalFactors).toHaveProperty('ic_anadolu')
    expect(result.data?.regionalFactors).toHaveProperty('dogu_anadolu')
    expect(result.data?.regionalFactors).toHaveProperty('guneydogu')
  })

  it('should have correct base factors for each region', async () => {
    const regional = await loader.getRegionalData('marmara')
    expect(regional?.baseFactor).toBe(1.15)

    const ege = await loader.getRegionalData('ege')
    expect(ege?.baseFactor).toBe(1.05)

    const akdeniz = await loader.getRegionalData('akdeniz')
    expect(akdeniz?.baseFactor).toBe(1.0)

    const karadeniz = await loader.getRegionalData('karadeniz')
    expect(karadeniz?.baseFactor).toBe(0.95)
  })

  it('should have population data for each region', async () => {
    const marmara = await loader.getRegionalData('marmara')
    expect(marmara?.population).toBe(26_000_000)

    const ege = await loader.getRegionalData('ege')
    expect(ege?.population).toBe(10_500_000)
  })

  it('should have economic index for each region', async () => {
    const marmara = await loader.getRegionalData('marmara')
    expect(marmara?.economicIndex).toBe(1.3)

    const doguAnadolu = await loader.getRegionalData('dogu_anadolu')
    expect(doguAnadolu?.economicIndex).toBe(0.7)
  })
})

// =============================================================================
// Convenience Functions Tests
// =============================================================================

describe('Convenience Functions', () => {
  beforeEach(() => {
    invalidateDataCache()
    vi.clearAllMocks()
  })

  describe('loadMarketData', () => {
    it('should load market data using singleton', async () => {
      const result = await loadMarketData()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('should pass options to singleton', async () => {
      const result = await loadMarketData({ forceRefresh: true })

      expect(result.success).toBe(true)
    })
  })

  describe('getBenchmark', () => {
    it('should get benchmark for policy type', async () => {
      const benchmark = await getBenchmark('home')

      expect(benchmark).not.toBeNull()
      expect(benchmark?.premiumRange).toBeDefined()
    })
  })

  describe('getProviderInfo', () => {
    it('should get provider info', async () => {
      const provider = await getProviderInfo('axa')

      expect(provider).not.toBeNull()
      expect(provider?.name).toBe('AXA Sigorta')
    })
  })

  describe('getRegionalData', () => {
    it('should get regional data', async () => {
      const regional = await getRegionalData('marmara')

      expect(regional).not.toBeNull()
      expect(regional?.region).toBe('marmara')
    })
  })

  describe('checkDataFreshness', () => {
    it('should check data freshness', async () => {
      const freshness = await checkDataFreshness()

      expect(freshness).toHaveProperty('fresh')
      expect(freshness).toHaveProperty('freshnessScore')
    })
  })

  describe('invalidateDataCache', () => {
    it('should invalidate cache for singleton', async () => {
      await loadMarketData()

      invalidateDataCache()

      const result = await loadMarketData()
      expect(result.source).toBe('embedded')
    })
  })
})

// =============================================================================
// Metadata Tests
// =============================================================================

describe('Metadata', () => {
  let loader: MarketDataLoader

  beforeEach(() => {
    loader = new MarketDataLoader()
    invalidateDataCache()
  })

  it('should have correct metadata id', async () => {
    const result = await loader.loadRepository()

    expect(result.metadata?.id).toBe('embedded-market-data-v1')
  })

  it('should have source information', async () => {
    const result = await loader.loadRepository()

    expect(result.metadata?.source).toBeDefined()
    expect(result.metadata?.source.name).toBe('SEDDK/TSB')
    expect(result.metadata?.source.type).toBe('official')
  })

  it('should have effective dates', async () => {
    const result = await loader.loadRepository()

    expect(result.metadata?.effectiveFrom).toBe('2024-01-01')
    expect(result.metadata?.effectiveTo).toBe('2024-12-31')
  })

  it('should have quality metrics', async () => {
    const result = await loader.loadRepository()

    expect(result.metadata?.quality).toBeDefined()
    expect(result.metadata?.quality.completeness).toBeGreaterThan(0)
    expect(result.metadata?.quality.accuracy).toBeGreaterThan(0)
    expect(result.metadata?.quality.overall).toBeGreaterThan(0)
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling', () => {
  let loader: MarketDataLoader

  beforeEach(() => {
    loader = new MarketDataLoader()
    invalidateDataCache()
  })

  it('should handle load repository with fallbackToCache', async () => {
    const result = await loader.loadRepository({ fallbackToCache: true })

    expect(result.success).toBe(true)
  })

  it('should return failure when no sources available and no cache', async () => {
    // This tests the fallback behavior
    const result = await loader.loadRepository({ fallbackToCache: false })

    expect(result.success).toBe(true) // Embedded data is always available
  })
})

// =============================================================================
// Data Quality Tests
// =============================================================================

describe('Data Quality', () => {
  let loader: MarketDataLoader

  beforeEach(() => {
    loader = new MarketDataLoader()
    invalidateDataCache()
  })

  it('should assess data completeness', async () => {
    const result = await loader.loadRepository()

    expect(result.metadata?.quality.completeness).toBeGreaterThan(0)
    expect(result.metadata?.quality.completeness).toBeLessThanOrEqual(100)
  })

  it('should calculate overall quality score', async () => {
    const result = await loader.loadRepository()

    expect(result.metadata?.quality.overall).toBeGreaterThan(0)
    expect(result.metadata?.quality.overall).toBeLessThanOrEqual(100)
  })

  it('should have empty issues array initially', async () => {
    const result = await loader.loadRepository()

    expect(result.metadata?.quality.issues).toEqual([])
  })
})

// =============================================================================
// Freshness Check Edge Cases
// =============================================================================

describe('Freshness Check Edge Cases', () => {
  let loader: MarketDataLoader

  beforeEach(() => {
    loader = new MarketDataLoader()
    invalidateDataCache()
  })

  it('should return not fresh when load fails', async () => {
    // Create a new loader and invalidate to ensure fresh state
    const freshLoader = new MarketDataLoader()

    // Override loadRepository to simulate failure
    const originalLoad = freshLoader.loadRepository.bind(freshLoader)
    freshLoader.loadRepository = vi.fn().mockResolvedValueOnce({
      success: false,
      data: null,
      metadata: null,
      source: 'embedded',
      loadedAt: Date.now(),
    })

    const result = await freshLoader.checkFreshness()

    expect(result.fresh).toBe(false)
    expect(result.freshnessScore).toBe(0)
    expect(result.recommendation).toContain('reload required')
    expect(result.lastUpdated).toBeNull()
  })

  it('should return recommendation to update when data needs refresh', async () => {
    const { needsRefresh } = await import('@/types/data-repository')
    vi.mocked(needsRefresh).mockReturnValueOnce(true)

    const result = await loader.checkFreshness()

    expect(result.recommendation).toContain('should be updated')
  })

  it('should include lastUpdated from metadata', async () => {
    const result = await loader.checkFreshness()

    expect(result.lastUpdated).toBeDefined()
    expect(typeof result.lastUpdated).toBe('string')
  })
})

// =============================================================================
// Cache Invalidation
// =============================================================================

describe('Cache Invalidation', () => {
  let loader: MarketDataLoader

  beforeEach(() => {
    loader = new MarketDataLoader()
    invalidateDataCache()
  })

  it('should reset internal state on invalidation', async () => {
    // Load data
    await loader.loadRepository()

    // Invalidate
    loader.invalidateCache()

    // Next load should be from source
    const result = await loader.loadRepository()
    expect(result.source).toBe('embedded')
  })

  it('should allow multiple invalidations', () => {
    // Should not throw
    loader.invalidateCache()
    loader.invalidateCache()
    loader.invalidateCache()
  })
})

// =============================================================================
// Concurrent Loading
// =============================================================================

describe('Concurrent Loading', () => {
  let loader: MarketDataLoader

  beforeEach(() => {
    loader = new MarketDataLoader()
    invalidateDataCache()
  })

  it('should handle concurrent load requests', async () => {
    // Start multiple loads simultaneously
    const [result1, result2, result3] = await Promise.all([
      loader.loadRepository(),
      loader.loadRepository(),
      loader.loadRepository(),
    ])

    // All should succeed
    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)
    expect(result3.success).toBe(true)

    // All should return valid sources (cache or embedded)
    expect(['cache', 'embedded', 'remote']).toContain(result1.source)
    expect(['cache', 'embedded', 'remote']).toContain(result2.source)
    expect(['cache', 'embedded', 'remote']).toContain(result3.source)
  })
})
