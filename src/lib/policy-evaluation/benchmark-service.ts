/**
 * Premium Benchmark Service
 *
 * Fetches premium benchmarks from the database and provides
 * synchronous access via caching. Supports both direct premium
 * comparison and value-based (% of insured value) comparison.
 */

import { supabase } from '@/lib/supabase/client'

// =============================================================================
// TYPES
// =============================================================================

export interface PremiumBenchmark {
  id: string
  insuranceType: string
  insuranceTypeTR: string
  subType: string | null
  subTypeTR: string | null
  minPremium: number
  avgPremium: number
  maxPremium: number
  comparisonMethod: 'direct_premium' | 'value_based'
  valueMinRate: number | null  // For value_based: e.g., 0.015 = 1.5%
  valueAvgRate: number | null
  valueMaxRate: number | null
  currency: string
  year: number
  source: string | null
  sourceTR: string | null
  isActive: boolean
}

// Legacy interface for compatibility with existing evaluator
export interface LegacyPremiumRange {
  insuranceType: string
  vehicleClass?: string
  propertyType?: string
  minPremium: number
  avgPremium: number
  maxPremium: number
  currency: 'TRY'
  year: number
  source: string
  // New fields for value-based comparison
  comparisonMethod?: 'direct_premium' | 'value_based'
  valueMinRate?: number
  valueAvgRate?: number
  valueMaxRate?: number
}

// =============================================================================
// CACHE
// =============================================================================

let benchmarkCache: PremiumBenchmark[] = []
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Check if cache is valid
 */
function isCacheValid(): boolean {
  return benchmarkCache.length > 0 && (Date.now() - cacheTimestamp) < CACHE_TTL_MS
}

/**
 * Refresh benchmarks from database
 */
export async function refreshBenchmarks(): Promise<PremiumBenchmark[]> {
  try {
    const { data, error } = await supabase
      .from('premium_benchmarks')
      .select('*')
      .eq('is_active', true)
      .order('insurance_type', { ascending: true })
      .order('sub_type', { ascending: true })

    if (error) {
      console.error('Failed to fetch premium benchmarks:', error)
      return benchmarkCache // Return stale cache on error
    }

    // Transform database rows to our interface
    benchmarkCache = (data || []).map(row => ({
      id: row.id,
      insuranceType: row.insurance_type,
      insuranceTypeTR: row.insurance_type_tr,
      subType: row.sub_type,
      subTypeTR: row.sub_type_tr,
      minPremium: Number(row.min_premium),
      avgPremium: Number(row.avg_premium),
      maxPremium: Number(row.max_premium),
      comparisonMethod: row.comparison_method,
      valueMinRate: row.value_min_rate ? Number(row.value_min_rate) : null,
      valueAvgRate: row.value_avg_rate ? Number(row.value_avg_rate) : null,
      valueMaxRate: row.value_max_rate ? Number(row.value_max_rate) : null,
      currency: row.currency,
      year: row.year,
      source: row.source,
      sourceTR: row.source_tr,
      isActive: row.is_active,
    }))

    cacheTimestamp = Date.now()
    return benchmarkCache
  } catch (err) {
    console.error('Error refreshing benchmarks:', err)
    return benchmarkCache
  }
}

/**
 * Initialize benchmarks (call on app startup)
 */
export async function initializeBenchmarks(): Promise<void> {
  await refreshBenchmarks()
}

/**
 * Get all cached benchmarks (synchronous)
 */
export function getAllBenchmarks(): PremiumBenchmark[] {
  return benchmarkCache
}

/**
 * Get benchmarks by insurance type (synchronous)
 */
export function getBenchmarksByType(insuranceType: string): PremiumBenchmark[] {
  return benchmarkCache.filter(b => b.insuranceType === insuranceType)
}

// =============================================================================
// MAIN API FUNCTIONS
// =============================================================================

/**
 * Get premium benchmark for a specific insurance type and sub-type
 * Compatible with the legacy getPremiumBenchmark function signature
 *
 * @param insuranceType - e.g., 'kasko', 'zmss', 'dask'
 * @param subType - Optional sub-type (e.g., 'automobile', 'economy', 'apartment')
 */
export function getPremiumBenchmark(
  insuranceType: string,
  subType?: string
): LegacyPremiumRange | undefined {
  // Ensure cache is populated (will use stale data if refresh fails)
  if (!isCacheValid()) {
    // Trigger async refresh but don't wait for it
    refreshBenchmarks().catch(console.error)
  }

  // Find matching benchmark
  const benchmark = benchmarkCache.find(b => {
    if (b.insuranceType !== insuranceType) return false
    if (subType && b.subType && b.subType !== subType) return false
    // If no subType specified, prefer the first match (or general one)
    if (!subType && b.subType) return false
    return true
  })

  // If no exact match found, try to find a general one for the insurance type
  const fallback = !benchmark
    ? benchmarkCache.find(b => b.insuranceType === insuranceType && !b.subType)
    : undefined

  const match = benchmark || fallback

  if (!match) {
    return undefined
  }

  // Convert to legacy format
  return {
    insuranceType: match.insuranceType,
    // Map subType to legacy fields
    vehicleClass: ['zmss', 'kasko'].includes(match.insuranceType) ? match.subType || undefined : undefined,
    propertyType: ['dask', 'home', 'business'].includes(match.insuranceType) ? match.subType || undefined : undefined,
    minPremium: match.minPremium,
    avgPremium: match.avgPremium,
    maxPremium: match.maxPremium,
    currency: 'TRY',
    year: match.year,
    source: match.source || 'TSB Market Data',
    // New fields
    comparisonMethod: match.comparisonMethod,
    valueMinRate: match.valueMinRate || undefined,
    valueAvgRate: match.valueAvgRate || undefined,
    valueMaxRate: match.valueMaxRate || undefined,
  }
}

/**
 * Get all benchmarks for an insurance type (returns all sub-types)
 */
export function getAllBenchmarksForType(insuranceType: string): LegacyPremiumRange[] {
  return benchmarkCache
    .filter(b => b.insuranceType === insuranceType)
    .map(match => ({
      insuranceType: match.insuranceType,
      vehicleClass: ['zmss', 'kasko'].includes(match.insuranceType) ? match.subType || undefined : undefined,
      propertyType: ['dask', 'home', 'business'].includes(match.insuranceType) ? match.subType || undefined : undefined,
      minPremium: match.minPremium,
      avgPremium: match.avgPremium,
      maxPremium: match.maxPremium,
      currency: 'TRY' as const,
      year: match.year,
      source: match.source || 'TSB Market Data',
      comparisonMethod: match.comparisonMethod,
      valueMinRate: match.valueMinRate || undefined,
      valueAvgRate: match.valueAvgRate || undefined,
      valueMaxRate: match.valueMaxRate || undefined,
    }))
}

// =============================================================================
// VALUE-BASED COMPARISON HELPERS
// =============================================================================

/**
 * Evaluate premium using value-based comparison (% of insured value)
 *
 * @param premium - The actual premium paid
 * @param insuredValue - The insured value (e.g., vehicle price)
 * @param benchmark - The benchmark to compare against
 * @returns Evaluation result with score and position
 */
export function evaluateValueBasedPremium(
  premium: number,
  insuredValue: number,
  benchmark: LegacyPremiumRange
): {
  actualRate: number
  score: number
  position: 'excellent' | 'good' | 'average' | 'high' | 'very_high'
  details: string
  detailsTR: string
} {
  if (!benchmark.valueMinRate || !benchmark.valueAvgRate || !benchmark.valueMaxRate) {
    // Fallback to direct comparison if value-based rates not available
    return {
      actualRate: 0,
      score: 70,
      position: 'average',
      details: 'Value-based rates not available for comparison',
      detailsTR: 'Değer bazlı oranlar karşılaştırma için mevcut değil',
    }
  }

  const actualRate = insuredValue > 0 ? premium / insuredValue : 0
  const { valueMinRate, valueAvgRate, valueMaxRate } = benchmark

  let score: number
  let position: 'excellent' | 'good' | 'average' | 'high' | 'very_high'

  if (actualRate <= valueMinRate) {
    // Below minimum - excellent or suspicious
    score = actualRate < valueMinRate * 0.5 ? 60 : 95
    position = actualRate < valueMinRate * 0.5 ? 'average' : 'excellent'
  } else if (actualRate <= valueAvgRate) {
    // Between min and avg - good to excellent
    const ratio = (valueAvgRate - actualRate) / (valueAvgRate - valueMinRate)
    score = 80 + Math.round(ratio * 15)
    position = score >= 90 ? 'excellent' : 'good'
  } else if (actualRate <= valueMaxRate) {
    // Between avg and max - average to high
    const ratio = (actualRate - valueAvgRate) / (valueMaxRate - valueAvgRate)
    score = 80 - Math.round(ratio * 30)
    position = ratio < 0.5 ? 'average' : 'high'
  } else {
    // Above maximum
    score = 40
    position = 'very_high'
  }

  const ratePercent = (actualRate * 100).toFixed(2)
  const avgRatePercent = (valueAvgRate * 100).toFixed(2)

  return {
    actualRate,
    score,
    position,
    details: `Premium rate: ${ratePercent}% of insured value (market avg: ${avgRatePercent}%)`,
    detailsTR: `Prim oranı: sigorta bedelinin %${ratePercent}'i (piyasa ort: %${avgRatePercent})`,
  }
}

/**
 * Check if benchmark uses value-based comparison
 */
export function isValueBasedBenchmark(benchmark: LegacyPremiumRange | undefined): boolean {
  return benchmark?.comparisonMethod === 'value_based' && !!benchmark.valueAvgRate
}

// =============================================================================
// FALLBACK TO HARDCODED DATA
// =============================================================================

// Import hardcoded data as fallback
import { getPremiumBenchmark as getHardcodedBenchmark } from '@/data/coverage-limits'

/**
 * Get benchmark with fallback to hardcoded data
 * Use this during transition period
 */
export function getPremiumBenchmarkWithFallback(
  insuranceType: string,
  subType?: string
): LegacyPremiumRange | undefined {
  // Try database first
  const dbBenchmark = getPremiumBenchmark(insuranceType, subType)

  if (dbBenchmark) {
    return dbBenchmark
  }

  // Fall back to hardcoded data
  const hardcoded = getHardcodedBenchmark(insuranceType, subType, undefined)

  if (hardcoded) {
    return {
      ...hardcoded,
      comparisonMethod: 'direct_premium',
    }
  }

  return undefined
}
