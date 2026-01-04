/**
 * Regional Benchmark Hooks
 * React hooks for location intelligence and regional comparisons
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { PolicyType } from '@/types/policy'
import type { TurkishRegion } from '@/types/market-data'
import type {
  Province,
  RegionalRiskProfile,
  RegionalInsuranceStats,
  RegionalPremiumBenchmark,
  RegionalComparison,
  LocationAnalysis,
  NearbyComparison,
  NationalStatistics,
  RegionalRanking,
} from '@/types/regional-benchmark'
import {
  PROVINCES,
  getProvincesByRegion,
  getRegionalRiskProfile,
  getRegionalInsuranceStats,
  getRegionalPremiumBenchmarks,
  calculateRegionalRiskScore,
  getRankedRegions,
} from '@/lib/regional-benchmark/data'
import {
  compareRegions,
  compareAllRegions,
  analyzeLocation,
  compareNearbyProvinces,
  getNationalStatistics,
  getRegionalRankings,
} from '@/lib/regional-benchmark/comparison'

// =============================================================================
// Region Data Hooks
// =============================================================================

/**
 * Hook for regional risk profile
 */
export function useRegionalRisk(region: TurkishRegion): {
  riskProfile: RegionalRiskProfile
  riskScore: number
  ranking: { rank: number; total: number }
} {
  const riskProfile = useMemo(() => getRegionalRiskProfile(region), [region])
  const riskScore = useMemo(() => calculateRegionalRiskScore(region), [region])

  const ranking = useMemo(() => {
    const ranked = getRankedRegions('risk')
    const regionRank = ranked.find(r => r.region === region)
    return {
      rank: regionRank?.rank ?? 0,
      total: ranked.length,
    }
  }, [region])

  return { riskProfile, riskScore, ranking }
}

/**
 * Hook for regional insurance statistics
 */
export function useRegionalStats(region: TurkishRegion): {
  stats: RegionalInsuranceStats
  marketPosition: {
    premiumRank: number
    penetrationRank: number
    claimsRatioRank: number
  }
} {
  const stats = useMemo(() => getRegionalInsuranceStats(region), [region])

  const marketPosition = useMemo(() => {
    const premiumRanked = getRankedRegions('premium', 'kasko')
    const penetrationRanked = getRankedRegions('penetration')
    const claimsRanked = getRankedRegions('claims')

    return {
      premiumRank: premiumRanked.find(r => r.region === region)?.rank ?? 0,
      penetrationRank: penetrationRanked.find(r => r.region === region)?.rank ?? 0,
      claimsRatioRank: claimsRanked.find(r => r.region === region)?.rank ?? 0,
    }
  }, [region])

  return { stats, marketPosition }
}

/**
 * Hook for regional premium benchmarks
 */
export function useRegionalPremiums(
  region: TurkishRegion,
  policyType: PolicyType
): RegionalPremiumBenchmark {
  return useMemo(
    () => getRegionalPremiumBenchmarks(policyType)[region],
    [region, policyType]
  )
}

/**
 * Hook for all premium benchmarks by policy type
 */
export function useAllRegionalPremiums(
  policyType: PolicyType
): Record<TurkishRegion, RegionalPremiumBenchmark> {
  return useMemo(() => getRegionalPremiumBenchmarks(policyType), [policyType])
}

// =============================================================================
// Comparison Hooks
// =============================================================================

/**
 * Hook for comparing two regions
 */
export function useRegionComparison(
  sourceRegion: TurkishRegion,
  targetRegion: TurkishRegion,
  policyType: PolicyType
): RegionalComparison {
  return useMemo(
    () => compareRegions(sourceRegion, targetRegion, policyType),
    [sourceRegion, targetRegion, policyType]
  )
}

/**
 * Hook for comparing source region against all others
 */
export function useAllRegionComparisons(
  sourceRegion: TurkishRegion,
  policyType: PolicyType
): {
  comparisons: RegionalComparison[]
  cheapestRegion: TurkishRegion | null
  mostExpensiveRegion: TurkishRegion | null
  savingsRange: { min: number; max: number }
} {
  const comparisons = useMemo(
    () => compareAllRegions(sourceRegion, policyType),
    [sourceRegion, policyType]
  )

  const analysis = useMemo(() => {
    if (comparisons.length === 0) {
      return {
        cheapestRegion: null,
        mostExpensiveRegion: null,
        savingsRange: { min: 0, max: 0 },
      }
    }

    const sorted = [...comparisons].sort(
      (a, b) => a.premiumDifference.amount - b.premiumDifference.amount
    )

    return {
      cheapestRegion: sorted[0].targetRegion,
      mostExpensiveRegion: sorted[sorted.length - 1].targetRegion,
      savingsRange: {
        min: sorted[0].premiumDifference.amount,
        max: sorted[sorted.length - 1].premiumDifference.amount,
      },
    }
  }, [comparisons])

  return { comparisons, ...analysis }
}

// =============================================================================
// Location Analysis Hooks
// =============================================================================

/**
 * Hook for analyzing a location/address
 */
export function useLocationAnalysis(address: string | undefined): {
  analysis: LocationAnalysis | null
  loading: boolean
  error: Error | null
  refresh: () => void
} {
  const [analysis, setAnalysis] = useState<LocationAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const analyze = useCallback(() => {
    if (!address) {
      setAnalysis(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const result = analyzeLocation(address)
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Analysis failed'))
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    analyze()
  }, [analyze])

  return { analysis, loading, error, refresh: analyze }
}

/**
 * Hook for nearby province comparison
 */
export function useNearbyComparison(
  province: Province | undefined,
  policyType: PolicyType
): NearbyComparison | null {
  return useMemo(() => {
    if (!province) return null
    return compareNearbyProvinces(province, policyType)
  }, [province, policyType])
}

// =============================================================================
// Province Hooks
// =============================================================================

/**
 * Hook for getting provinces
 */
export function useProvinces(region?: TurkishRegion): Province[] {
  return useMemo(() => {
    if (region) {
      return getProvincesByRegion(region)
    }
    return Object.values(PROVINCES)
  }, [region])
}

/**
 * Hook for searching provinces
 */
export function useProvinceSearch(query: string): Province[] {
  return useMemo(() => {
    if (!query || query.length < 2) return []

    const normalizedQuery = query.toLowerCase()
    return Object.values(PROVINCES).filter(
      p =>
        p.name.toLowerCase().includes(normalizedQuery) ||
        p.nameTr.toLowerCase().includes(normalizedQuery)
    )
  }, [query])
}

// =============================================================================
// National Statistics Hooks
// =============================================================================

/**
 * Hook for national statistics
 */
export function useNationalStatistics(): NationalStatistics {
  return useMemo(() => getNationalStatistics(), [])
}

/**
 * Hook for regional rankings
 */
export function useRegionalRankings(
  policyType: PolicyType,
  metric: 'premium' | 'claims' | 'penetration' | 'risk' | 'value'
): RegionalRanking {
  return useMemo(
    () => getRegionalRankings(policyType, metric),
    [policyType, metric]
  )
}

// =============================================================================
// Combined Hook
// =============================================================================

/**
 * Combined hook for regional benchmark data
 */
export function useRegionalBenchmark(
  region: TurkishRegion,
  policyType: PolicyType
): {
  // Risk
  riskProfile: RegionalRiskProfile
  riskScore: number

  // Stats
  stats: RegionalInsuranceStats
  premiumBenchmark: RegionalPremiumBenchmark

  // Comparisons
  comparedToAll: RegionalComparison[]
  cheapestAlternative: TurkishRegion | null
  potentialSavings: number

  // Rankings
  premiumRank: number
  riskRank: number
  valueRank: number

  // National context
  nationalStats: NationalStatistics
} {
  const { riskProfile, riskScore, ranking: riskRanking } = useRegionalRisk(region)
  const { stats } = useRegionalStats(region)
  const premiumBenchmark = useRegionalPremiums(region, policyType)
  const { comparisons, cheapestRegion, savingsRange } = useAllRegionComparisons(region, policyType)
  const nationalStats = useNationalStatistics()
  const premiumRankings = useRegionalRankings(policyType, 'premium')
  const valueRankings = useRegionalRankings(policyType, 'value')

  const premiumRank = useMemo(
    () => premiumRankings.rankings.find(r => r.region === region)?.rank ?? 0,
    [premiumRankings, region]
  )

  const valueRank = useMemo(
    () => valueRankings.rankings.find(r => r.region === region)?.rank ?? 0,
    [valueRankings, region]
  )

  return {
    riskProfile,
    riskScore,
    stats,
    premiumBenchmark,
    comparedToAll: comparisons,
    cheapestAlternative: cheapestRegion,
    potentialSavings: Math.abs(savingsRange.min),
    premiumRank,
    riskRank: riskRanking.rank,
    valueRank,
    nationalStats,
  }
}
