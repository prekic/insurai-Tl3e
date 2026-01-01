/**
 * Market Data Hooks Tests
 * Tests for market data access hooks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  useMarketData,
  usePolicyBenchmark,
  useRegionalData,
  useProviderInfo,
  useDataFreshness,
  useBenchmarkComparison,
} from './useMarketData'

// Mock the market data service
vi.mock('@/lib/data-repository', () => ({
  marketDataService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({
      totalProviders: 15,
      totalPolicyTypes: 5,
      lastUpdated: '2024-01-15',
    }),
    getBenchmark: vi.fn().mockResolvedValue({
      policyType: 'home',
      premiumRange: { min: 1000, max: 5000, average: 2500 },
      coverageRange: { min: 100000, max: 500000, recommended: 250000 },
    }),
    getPremiumRange: vi.fn().mockResolvedValue({
      min: 1000,
      max: 5000,
      average: 2500,
    }),
    getCoverageRange: vi.fn().mockResolvedValue({
      min: 100000,
      max: 500000,
      recommended: 250000,
    }),
    getProvider: vi.fn().mockResolvedValue({
      id: 'allianz',
      name: 'Allianz Sigorta',
      rating: 4.5,
    }),
    getTopProviders: vi.fn().mockResolvedValue([
      { id: 'allianz', name: 'Allianz Sigorta', rating: 4.5 },
      { id: 'axa', name: 'AXA Sigorta', rating: 4.3 },
    ]),
    getRegion: vi.fn().mockResolvedValue({
      region: 'marmara',
      population: 25000000,
      riskFactor: 1.2,
    }),
    calculateRegionalAdjustment: vi.fn().mockResolvedValue({
      adjustedPremium: 3000,
      factor: 1.2,
      reason: 'High risk zone',
    }),
    compareToBenchmark: vi.fn().mockResolvedValue({
      comparison: 'above',
      percentile: 75,
      difference: 500,
    }),
    refresh: vi.fn().mockResolvedValue(undefined),
    validateData: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    needsRefresh: vi.fn().mockResolvedValue(false),
    getMetadata: vi.fn().mockResolvedValue({
      lastUpdated: '2024-01-15',
      effectiveTo: '2024-12-31',
    }),
  },
}))

// Mock the freshness calculator
vi.mock('@/types/data-repository', () => ({
  calculateFreshnessScore: vi.fn().mockReturnValue(0.9),
}))

describe('useMarketData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useMarketData())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('should load stats on mount', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.stats).toBeDefined()
    expect(result.current.error).toBeNull()
  })

  it('should provide getBenchmark function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const benchmark = await result.current.getBenchmark('home')

    expect(benchmark).toBeDefined()
    expect(benchmark?.policyType).toBe('home')
  })

  it('should provide getPremiumRange function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const range = await result.current.getPremiumRange('home')

    expect(range).toBeDefined()
    expect(range?.min).toBe(1000)
    expect(range?.max).toBe(5000)
  })

  it('should provide getCoverageRange function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const range = await result.current.getCoverageRange('home')

    expect(range).toBeDefined()
    expect(range?.recommended).toBe(250000)
  })

  it('should provide getProvider function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const provider = await result.current.getProvider('allianz')

    expect(provider).toBeDefined()
    expect(provider?.name).toBe('Allianz Sigorta')
  })

  it('should provide getTopProviders function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const providers = await result.current.getTopProviders(5)

    expect(providers.length).toBeGreaterThan(0)
  })

  it('should provide getRegion function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const region = await result.current.getRegion('marmara')

    expect(region).toBeDefined()
    expect(region?.region).toBe('marmara')
  })

  it('should provide calculateRegionalAdjustment function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const adjustment = await result.current.calculateRegionalAdjustment(2500, 'marmara', 'home')

    expect(adjustment).toBeDefined()
    expect(adjustment.factor).toBeGreaterThan(1)
  })

  it('should provide compareToBenchmark function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const comparison = await result.current.compareToBenchmark('home', 'premium', 3000)

    expect(comparison).toBeDefined()
    expect(comparison?.comparison).toBe('above')
  })

  it('should support refresh', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.isLoading).toBe(false)
  })

  it('should provide validate function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const report = await result.current.validate()

    expect(report).toBeDefined()
    expect(report.valid).toBe(true)
  })

  it('should provide needsRefresh function', async () => {
    const { result } = renderHook(() => useMarketData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const needs = await result.current.needsRefresh()

    expect(typeof needs).toBe('boolean')
  })
})

describe('usePolicyBenchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null for null policy type', async () => {
    const { result } = renderHook(() => usePolicyBenchmark(null))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.benchmark).toBeNull()
  })

  it('should load benchmark for policy type', async () => {
    const { result } = renderHook(() => usePolicyBenchmark('home'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.benchmark).toBeDefined()
    expect(result.current.error).toBeNull()
  })

  it('should update when policy type changes', async () => {
    const { result, rerender } = renderHook(
      ({ policyType }) => usePolicyBenchmark(policyType),
      { initialProps: { policyType: 'home' as const } }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    rerender({ policyType: 'kasko' as const })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })
})

describe('useRegionalData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null for null region', async () => {
    const { result } = renderHook(() => useRegionalData(null))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeNull()
  })

  it('should load regional data', async () => {
    const { result } = renderHook(() => useRegionalData('marmara'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.error).toBeNull()
  })
})

describe('useProviderInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null for null provider', async () => {
    const { result } = renderHook(() => useProviderInfo(null))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.info).toBeNull()
  })

  it('should load provider info', async () => {
    const { result } = renderHook(() => useProviderInfo('allianz'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.info).toBeDefined()
    expect(result.current.error).toBeNull()
  })
})

describe('useDataFreshness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should load freshness status', async () => {
    const { result } = renderHook(() => useDataFreshness())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.freshness).toBeDefined()
  })

  it('should include freshness score', async () => {
    const { result } = renderHook(() => useDataFreshness())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    if (result.current.freshness) {
      expect(result.current.freshness.freshnessScore).toBeGreaterThanOrEqual(0)
      expect(result.current.freshness.freshnessScore).toBeLessThanOrEqual(1)
    }
  })
})

describe('useBenchmarkComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null for null policy type', async () => {
    const { result } = renderHook(() =>
      useBenchmarkComparison(null, 'premium', 2500)
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.comparison).toBeNull()
  })

  it('should return null for null value', async () => {
    const { result } = renderHook(() =>
      useBenchmarkComparison('home', 'premium', null)
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.comparison).toBeNull()
  })

  it('should load comparison data', async () => {
    const { result } = renderHook(() =>
      useBenchmarkComparison('home', 'premium', 3000)
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.comparison).toBeDefined()
  })

  it('should update when value changes', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useBenchmarkComparison('home', 'premium', value),
      { initialProps: { value: 2500 } }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    rerender({ value: 3500 })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })
})
