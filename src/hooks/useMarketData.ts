/**
 * React Hook for Market Data
 * Provides easy access to market data in components
 */

import { useState, useEffect, useCallback } from 'react'
import type { PolicyType } from '@/types/policy'
import type {
  PolicyTypeMarketData,
  InsuranceProvider,
  TurkishRegion,
  ProviderInfo,
} from '@/types/market-data'
import type { RegionalData, ValidationReport } from '@/types/data-repository'
import {
  marketDataService,
  type MarketDataStats,
  type BenchmarkComparison,
  type RegionalAdjustment,
} from '@/lib/data-repository'

// =============================================================================
// Main Hook
// =============================================================================

interface UseMarketDataResult {
  // State
  isLoading: boolean
  error: string | null
  stats: MarketDataStats | null

  // Benchmark methods
  getBenchmark: (policyType: PolicyType) => Promise<PolicyTypeMarketData | null>
  getPremiumRange: (policyType: PolicyType) => Promise<{ min: number; max: number; average: number } | null>
  getCoverageRange: (policyType: PolicyType) => Promise<{ min: number; max: number; recommended: number } | null>

  // Provider methods
  getProvider: (provider: InsuranceProvider) => Promise<ProviderInfo | null>
  getTopProviders: (limit?: number) => Promise<ProviderInfo[]>

  // Regional methods
  getRegion: (region: TurkishRegion) => Promise<RegionalData | null>
  calculateRegionalAdjustment: (
    basePremium: number,
    region: TurkishRegion,
    policyType: PolicyType
  ) => Promise<RegionalAdjustment>

  // Comparison methods
  compareToBenchmark: (
    policyType: PolicyType,
    field: 'premium' | 'coverage' | 'deductible',
    currentValue: number
  ) => Promise<BenchmarkComparison | null>

  // Data management
  refresh: () => Promise<void>
  validate: () => Promise<ValidationReport>
  needsRefresh: () => Promise<boolean>
}

export function useMarketData(): UseMarketDataResult {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<MarketDataStats | null>(null)

  // Initialize on mount
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        await marketDataService.initialize()
        if (mounted) {
          const dataStats = await marketDataService.getStats()
          setStats(dataStats)
          setIsLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load market data')
          setIsLoading(false)
        }
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [])

  // Benchmark methods
  const getBenchmark = useCallback(
    (policyType: PolicyType) => marketDataService.getBenchmark(policyType),
    []
  )

  const getPremiumRange = useCallback(
    (policyType: PolicyType) => marketDataService.getPremiumRange(policyType),
    []
  )

  const getCoverageRange = useCallback(
    (policyType: PolicyType) => marketDataService.getCoverageRange(policyType),
    []
  )

  // Provider methods
  const getProvider = useCallback(
    (provider: InsuranceProvider) => marketDataService.getProvider(provider),
    []
  )

  const getTopProviders = useCallback(
    (limit?: number) => marketDataService.getTopProviders(limit),
    []
  )

  // Regional methods
  const getRegion = useCallback(
    (region: TurkishRegion) => marketDataService.getRegion(region),
    []
  )

  const calculateRegionalAdjustment = useCallback(
    (basePremium: number, region: TurkishRegion, policyType: PolicyType) =>
      marketDataService.calculateRegionalAdjustment(basePremium, region, policyType),
    []
  )

  // Comparison
  const compareToBenchmark = useCallback(
    (policyType: PolicyType, field: 'premium' | 'coverage' | 'deductible', currentValue: number) =>
      marketDataService.compareToBenchmark(policyType, field, currentValue),
    []
  )

  // Data management
  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await marketDataService.refresh()
      const dataStats = await marketDataService.getStats()
      setStats(dataStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh market data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const validate = useCallback(() => marketDataService.validateData(), [])

  const needsRefresh = useCallback(() => marketDataService.needsRefresh(), [])

  return {
    isLoading,
    error,
    stats,
    getBenchmark,
    getPremiumRange,
    getCoverageRange,
    getProvider,
    getTopProviders,
    getRegion,
    calculateRegionalAdjustment,
    compareToBenchmark,
    refresh,
    validate,
    needsRefresh,
  }
}

// =============================================================================
// Specialized Hooks
// =============================================================================

/**
 * Hook for a specific policy type benchmark
 */
export function usePolicyBenchmark(policyType: PolicyType | null) {
  const [benchmark, setBenchmark] = useState<PolicyTypeMarketData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!policyType) {
      setBenchmark(null)
      setIsLoading(false)
      return
    }

    let mounted = true
    const currentPolicyType = policyType

    async function load() {
      setIsLoading(true)
      try {
        await marketDataService.initialize()
        const data = await marketDataService.getBenchmark(currentPolicyType)
        if (mounted) {
          setBenchmark(data)
          setIsLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load benchmark')
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [policyType])

  return { benchmark, isLoading, error }
}

/**
 * Hook for regional data
 */
export function useRegionalData(region: TurkishRegion | null) {
  const [data, setData] = useState<RegionalData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!region) {
      setData(null)
      setIsLoading(false)
      return
    }

    let mounted = true
    const currentRegion = region

    async function load() {
      setIsLoading(true)
      try {
        await marketDataService.initialize()
        const regionData = await marketDataService.getRegion(currentRegion)
        if (mounted) {
          setData(regionData)
          setIsLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load regional data')
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [region])

  return { data, isLoading, error }
}

/**
 * Hook for provider information
 */
export function useProviderInfo(provider: InsuranceProvider | null) {
  const [info, setInfo] = useState<ProviderInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!provider) {
      setInfo(null)
      setIsLoading(false)
      return
    }

    let mounted = true
    const currentProvider = provider

    async function load() {
      setIsLoading(true)
      try {
        await marketDataService.initialize()
        const providerInfo = await marketDataService.getProvider(currentProvider)
        if (mounted) {
          setInfo(providerInfo)
          setIsLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load provider info')
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [provider])

  return { info, isLoading, error }
}

/**
 * Hook for data freshness status
 */
export function useDataFreshness() {
  const [freshness, setFreshness] = useState<{
    fresh: boolean
    lastUpdated: string | null
    freshnessScore: number
    recommendation: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        await marketDataService.initialize()
        const metadata = await marketDataService.getMetadata()
        const needsUpdate = await marketDataService.needsRefresh()

        if (mounted && metadata) {
          const { calculateFreshnessScore } = await import('@/types/data-repository')
          const score = calculateFreshnessScore(metadata.lastUpdated, metadata.effectiveTo)

          setFreshness({
            fresh: !needsUpdate,
            lastUpdated: metadata.lastUpdated,
            freshnessScore: score,
            recommendation: needsUpdate
              ? 'Market data should be updated from official sources'
              : 'Data is current',
          })
          setIsLoading(false)
        }
      } catch {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    check()

    return () => {
      mounted = false
    }
  }, [])

  return { freshness, isLoading }
}

/**
 * Hook for comparing policy values to benchmarks
 */
export function useBenchmarkComparison(
  policyType: PolicyType | null,
  field: 'premium' | 'coverage' | 'deductible',
  currentValue: number | null
) {
  const [comparison, setComparison] = useState<BenchmarkComparison | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!policyType || currentValue === null) {
      setComparison(null)
      setIsLoading(false)
      return
    }

    let mounted = true
    const currentPolicyType = policyType
    const currentFieldValue = currentValue

    async function compare() {
      setIsLoading(true)
      try {
        await marketDataService.initialize()
        const result = await marketDataService.compareToBenchmark(currentPolicyType, field, currentFieldValue)
        if (mounted) {
          setComparison(result)
          setIsLoading(false)
        }
      } catch {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    compare()

    return () => {
      mounted = false
    }
  }, [policyType, field, currentValue])

  return { comparison, isLoading }
}
