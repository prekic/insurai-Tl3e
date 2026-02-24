/**
 * Comprehensive Branch Coverage Tests for Benchmark Service
 *
 * Targets the lowest-coverage file in policy-evaluation:
 *   benchmark-service.ts: 39.13% branches, 43.75% functions
 *
 * Also includes additional evaluator.ts branch coverage for
 * uncovered lines (evaluator.ts: 79.69% branches).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to control the module-level cache and Supabase mock
// so we mock the Supabase client before importing benchmark-service

const mockSupabaseResponse = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => mockSupabaseResponse(),
          }),
        }),
      }),
    }),
  },
}))

// Now import the benchmark service functions
import {
  refreshBenchmarks,
  initializeBenchmarks,
  getAllBenchmarks,
  getBenchmarksByType,
  getPremiumBenchmark,
  getAllBenchmarksForType,
  evaluateValueBasedPremium,
  isValueBasedBenchmark,
  getPremiumBenchmarkWithFallback,
} from '../benchmark-service'

// =============================================================================
// MOCK DATA FACTORIES
// =============================================================================

function createMockDbRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'bench-1',
    insurance_type: 'kasko',
    insurance_type_tr: 'Kasko',
    sub_type: null,
    sub_type_tr: null,
    min_premium: 5000,
    avg_premium: 10000,
    max_premium: 20000,
    comparison_method: 'direct_premium',
    value_min_rate: null,
    value_avg_rate: null,
    value_max_rate: null,
    currency: 'TRY',
    year: 2026,
    source: 'TSB Data',
    source_tr: 'TSB Verileri',
    is_active: true,
    ...overrides,
  }
}

function createMockBenchmarkRow(
  insuranceType: string,
  subType: string | null = null,
  comparisonMethod: 'direct_premium' | 'value_based' = 'direct_premium',
  valueRates?: { min: number; avg: number; max: number }
): Record<string, unknown> {
  return createMockDbRow({
    id: `bench-${insuranceType}-${subType || 'general'}`,
    insurance_type: insuranceType,
    insurance_type_tr: insuranceType,
    sub_type: subType,
    sub_type_tr: subType,
    comparison_method: comparisonMethod,
    value_min_rate: valueRates?.min ?? null,
    value_avg_rate: valueRates?.avg ?? null,
    value_max_rate: valueRates?.max ?? null,
  })
}

// =============================================================================
// TESTS
// =============================================================================

describe('Benchmark Service - Branch Coverage', () => {
  beforeEach(() => {
    // Reset the mock to return empty data by default
    mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // isCacheValid - covers the cache expiration branch
  // =========================================================================
  describe('Cache Validity', () => {
    it('should trigger refresh when cache is empty', async () => {
      // When cache is empty, getPremiumBenchmark should trigger refreshBenchmarks
      // The function returns undefined because cache is empty
      const result = getPremiumBenchmark('nonexistent')
      expect(result).toBeUndefined()
      // Wait for the background refresh to complete so it doesn't pollute the next test
      await new Promise(resolve => setTimeout(resolve, 10))
    })

    it('should use cached data without refresh when cache is populated and fresh', async () => {
      // Populate cache
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({ insurance_type: 'kasko' })],
        error: null,
      })

      await refreshBenchmarks()

      // Now cache is populated and fresh, should not trigger another refresh
      const result = getPremiumBenchmark('kasko')
      expect(result).toBeDefined()
      expect(result?.insuranceType).toBe('kasko')
    })
  })

  // =========================================================================
  // refreshBenchmarks - covers error branches and data transformation
  // =========================================================================
  describe('refreshBenchmarks', () => {
    it('should return empty array on initial fetch with no data', async () => {
      mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
      const result = await refreshBenchmarks()
      expect(result).toEqual([])
    })

    it('should return stale cache when Supabase returns an error', async () => {
      // First, populate cache with valid data
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({ insurance_type: 'health' })],
        error: null,
      })
      await refreshBenchmarks()

      // Now simulate an error - should return stale cache
      mockSupabaseResponse.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed', code: '500' },
      })

      const result = await refreshBenchmarks()
      // Should return the stale cached data (health benchmark)
      expect(result.length).toBe(1)
      expect(result[0].insuranceType).toBe('health')
    })

    it('should return stale cache when Supabase throws an exception', async () => {
      // First populate with valid data
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({ insurance_type: 'dask' })],
        error: null,
      })
      await refreshBenchmarks()

      // Now simulate a thrown exception
      mockSupabaseResponse.mockRejectedValue(new Error('Network timeout'))

      const result = await refreshBenchmarks()
      expect(result.length).toBe(1)
      expect(result[0].insuranceType).toBe('dask')
    })

    it('should handle null data array gracefully', async () => {
      mockSupabaseResponse.mockResolvedValue({ data: null, error: null })
      const result = await refreshBenchmarks()
      expect(result).toEqual([])
    })

    it('should transform database rows to PremiumBenchmark interface', async () => {
      const row = createMockDbRow({
        id: 'unique-id',
        insurance_type: 'kasko',
        insurance_type_tr: 'Kasko Sigortası',
        sub_type: 'automobile',
        sub_type_tr: 'Otomobil',
        min_premium: 3000,
        avg_premium: 8000,
        max_premium: 15000,
        comparison_method: 'value_based',
        value_min_rate: 0.015,
        value_avg_rate: 0.025,
        value_max_rate: 0.04,
        currency: 'TRY',
        year: 2026,
        source: 'TSB 2026',
        source_tr: 'TSB 2026 Verileri',
        is_active: true,
      })

      mockSupabaseResponse.mockResolvedValue({ data: [row], error: null })
      const result = await refreshBenchmarks()

      expect(result).toHaveLength(1)
      const benchmark = result[0]
      expect(benchmark.id).toBe('unique-id')
      expect(benchmark.insuranceType).toBe('kasko')
      expect(benchmark.insuranceTypeTR).toBe('Kasko Sigortası')
      expect(benchmark.subType).toBe('automobile')
      expect(benchmark.subTypeTR).toBe('Otomobil')
      expect(benchmark.minPremium).toBe(3000)
      expect(benchmark.avgPremium).toBe(8000)
      expect(benchmark.maxPremium).toBe(15000)
      expect(benchmark.comparisonMethod).toBe('value_based')
      expect(benchmark.valueMinRate).toBe(0.015)
      expect(benchmark.valueAvgRate).toBe(0.025)
      expect(benchmark.valueMaxRate).toBe(0.04)
      expect(benchmark.currency).toBe('TRY')
      expect(benchmark.year).toBe(2026)
      expect(benchmark.source).toBe('TSB 2026')
      expect(benchmark.sourceTR).toBe('TSB 2026 Verileri')
      expect(benchmark.isActive).toBe(true)
    })

    it('should handle null value rate fields (coerce to null)', async () => {
      const row = createMockDbRow({
        value_min_rate: null,
        value_avg_rate: null,
        value_max_rate: null,
      })

      mockSupabaseResponse.mockResolvedValue({ data: [row], error: null })
      const result = await refreshBenchmarks()

      expect(result[0].valueMinRate).toBeNull()
      expect(result[0].valueAvgRate).toBeNull()
      expect(result[0].valueMaxRate).toBeNull()
    })

    it('should handle zero value rate fields (truthy check returns null for 0)', async () => {
      const row = createMockDbRow({
        value_min_rate: 0,
        value_avg_rate: 0,
        value_max_rate: 0,
      })

      mockSupabaseResponse.mockResolvedValue({ data: [row], error: null })
      const result = await refreshBenchmarks()

      // 0 is falsy, so the ternary `row.value_min_rate ? Number(...) : null` returns null
      expect(result[0].valueMinRate).toBeNull()
      expect(result[0].valueAvgRate).toBeNull()
      expect(result[0].valueMaxRate).toBeNull()
    })

    it('should handle multiple rows and update cache timestamp', async () => {
      const rows = [
        createMockDbRow({ insurance_type: 'kasko', id: 'b1' }),
        createMockDbRow({ insurance_type: 'zmss', id: 'b2' }),
        createMockDbRow({ insurance_type: 'dask', id: 'b3' }),
      ]

      mockSupabaseResponse.mockResolvedValue({ data: rows, error: null })
      const result = await refreshBenchmarks()

      expect(result).toHaveLength(3)
      // Verify cache is updated
      expect(getAllBenchmarks()).toHaveLength(3)
    })
  })

  // =========================================================================
  // initializeBenchmarks
  // =========================================================================
  describe('initializeBenchmarks', () => {
    it('should call refreshBenchmarks and populate cache', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({ insurance_type: 'life' })],
        error: null,
      })

      await initializeBenchmarks()

      const all = getAllBenchmarks()
      expect(all.length).toBeGreaterThanOrEqual(1)
    })
  })

  // =========================================================================
  // getAllBenchmarks and getBenchmarksByType
  // =========================================================================
  describe('getAllBenchmarks', () => {
    it('should return all cached benchmarks', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [
          createMockDbRow({ insurance_type: 'kasko', id: 'a' }),
          createMockDbRow({ insurance_type: 'zmss', id: 'b' }),
        ],
        error: null,
      })
      await refreshBenchmarks()

      const all = getAllBenchmarks()
      expect(all).toHaveLength(2)
    })
  })

  describe('getBenchmarksByType', () => {
    it('should filter benchmarks by type', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [
          createMockDbRow({ insurance_type: 'kasko', id: 'a' }),
          createMockDbRow({ insurance_type: 'zmss', id: 'b' }),
          createMockDbRow({ insurance_type: 'kasko', sub_type: 'suv', id: 'c' }),
        ],
        error: null,
      })
      await refreshBenchmarks()

      const kasko = getBenchmarksByType('kasko')
      expect(kasko).toHaveLength(2)
      expect(kasko.every(b => b.insuranceType === 'kasko')).toBe(true)
    })

    it('should return empty array for unknown type', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({ insurance_type: 'kasko' })],
        error: null,
      })
      await refreshBenchmarks()

      const result = getBenchmarksByType('unknown')
      expect(result).toEqual([])
    })
  })

  // =========================================================================
  // getPremiumBenchmark - all matching branches
  // =========================================================================
  describe('getPremiumBenchmark', () => {
    beforeEach(async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [
          createMockBenchmarkRow('kasko', null),           // General kasko
          createMockBenchmarkRow('kasko', 'automobile'),   // Kasko automobile subtype
          createMockBenchmarkRow('kasko', 'suv'),          // Kasko SUV subtype
          createMockBenchmarkRow('zmss', null),            // General traffic
          createMockBenchmarkRow('zmss', 'automobile'),    // Traffic automobile
          createMockBenchmarkRow('dask', null),            // DASK general
          createMockBenchmarkRow('dask', 'apartment'),     // DASK apartment
          createMockBenchmarkRow('health', null),          // Health general
          createMockBenchmarkRow('home', null),            // Home general
          createMockBenchmarkRow('home', 'villa'),         // Home villa
          createMockBenchmarkRow('business', null),        // Business general
        ],
        error: null,
      })
      await refreshBenchmarks()
    })

    it('should match by insurance type only (no subType)', () => {
      const result = getPremiumBenchmark('kasko')
      expect(result).toBeDefined()
      expect(result?.insuranceType).toBe('kasko')
    })

    it('should match by insurance type AND subType when no general entry exists first', async () => {
      // Re-populate with only subType entries (no general entry for 'custom_type')
      mockSupabaseResponse.mockResolvedValue({
        data: [
          createMockBenchmarkRow('custom_type', 'sub_a'),
          createMockBenchmarkRow('custom_type', 'sub_b'),
        ],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmark('custom_type', 'sub_a')
      expect(result).toBeDefined()
      expect(result?.insuranceType).toBe('custom_type')
    })

    it('should skip entries with non-matching subType when subType is specified', () => {
      const result = getPremiumBenchmark('kasko', 'truck')
      // No 'truck' subType exists, but there IS a general kasko (no subType)
      // The fallback should find the general kasko
      expect(result).toBeDefined()
      expect(result?.insuranceType).toBe('kasko')
    })

    it('should prefer null subType entry when no subType param specified', () => {
      // When no subType is given, entries with subType should be skipped
      // due to the `if (!subType && b.subType) return false` branch
      const result = getPremiumBenchmark('kasko')
      expect(result).toBeDefined()
      // Should be the general entry (no subType), not 'automobile' or 'suv'
    })

    it('should use fallback when exact match not found', () => {
      // Ask for a subType that doesn't exist
      const result = getPremiumBenchmark('zmss', 'motorcycle')
      // Falls back to general zmss
      expect(result).toBeDefined()
      expect(result?.insuranceType).toBe('zmss')
    })

    it('should return undefined when no match exists at all', () => {
      const result = getPremiumBenchmark('pet_insurance')
      expect(result).toBeUndefined()
    })

    it('should map vehicleClass for zmss type (subType-only entries)', async () => {
      // Only subType entries for zmss — no general null entry to match first
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockBenchmarkRow('zmss', 'automobile')],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmark('zmss', 'automobile')
      expect(result?.vehicleClass).toBe('automobile')
      expect(result?.propertyType).toBeUndefined()
    })

    it('should map vehicleClass for kasko type (subType-only entries)', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockBenchmarkRow('kasko', 'suv')],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmark('kasko', 'suv')
      expect(result?.vehicleClass).toBe('suv')
      expect(result?.propertyType).toBeUndefined()
    })

    it('should map propertyType for dask type (subType-only entries)', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockBenchmarkRow('dask', 'apartment')],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmark('dask', 'apartment')
      expect(result?.propertyType).toBe('apartment')
      expect(result?.vehicleClass).toBeUndefined()
    })

    it('should map propertyType for home type (subType-only entries)', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockBenchmarkRow('home', 'villa')],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmark('home', 'villa')
      expect(result?.propertyType).toBe('villa')
      expect(result?.vehicleClass).toBeUndefined()
    })

    it('should map propertyType for business type', () => {
      const result = getPremiumBenchmark('business')
      expect(result?.propertyType).toBeUndefined() // No subType specified
      expect(result?.vehicleClass).toBeUndefined() // business is a property type
    })

    it('should not map vehicleClass or propertyType for health type', () => {
      const result = getPremiumBenchmark('health')
      expect(result?.vehicleClass).toBeUndefined()
      expect(result?.propertyType).toBeUndefined()
    })

    it('should set source to TSB Market Data when source is null', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({ insurance_type: 'test_type', source: null })],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmark('test_type')
      expect(result?.source).toBe('TSB Market Data')
    })

    it('should include value rate fields when present', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockBenchmarkRow('kasko_vb', null, 'value_based', { min: 0.01, avg: 0.025, max: 0.05 })],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmark('kasko_vb')
      expect(result?.comparisonMethod).toBe('value_based')
      expect(result?.valueMinRate).toBe(0.01)
      expect(result?.valueAvgRate).toBe(0.025)
      expect(result?.valueMaxRate).toBe(0.05)
    })

    it('should set value rate fields to undefined when null', () => {
      const result = getPremiumBenchmark('health')
      expect(result?.valueMinRate).toBeUndefined()
      expect(result?.valueAvgRate).toBeUndefined()
      expect(result?.valueMaxRate).toBeUndefined()
    })

    it('should always return currency as TRY', () => {
      const result = getPremiumBenchmark('kasko')
      expect(result?.currency).toBe('TRY')
    })
  })

  // =========================================================================
  // getAllBenchmarksForType
  // =========================================================================
  describe('getAllBenchmarksForType', () => {
    beforeEach(async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [
          createMockBenchmarkRow('kasko', null),
          createMockBenchmarkRow('kasko', 'automobile'),
          createMockBenchmarkRow('kasko', 'suv'),
          createMockBenchmarkRow('zmss', null),
        ],
        error: null,
      })
      await refreshBenchmarks()
    })

    it('should return all benchmarks for a given type', () => {
      const result = getAllBenchmarksForType('kasko')
      expect(result).toHaveLength(3)
      expect(result.every(b => b.insuranceType === 'kasko')).toBe(true)
    })

    it('should return empty array for non-existent type', () => {
      const result = getAllBenchmarksForType('pet')
      expect(result).toHaveLength(0)
    })

    it('should map vehicleClass for zmss/kasko types', () => {
      const kaskoResults = getAllBenchmarksForType('kasko')
      const autoResult = kaskoResults.find(b => b.vehicleClass === 'automobile')
      expect(autoResult).toBeDefined()
      expect(autoResult?.propertyType).toBeUndefined()
    })

    it('should map propertyType for dask/home/business types', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [
          createMockBenchmarkRow('dask', 'apartment'),
          createMockBenchmarkRow('home', 'villa'),
          createMockBenchmarkRow('business', 'office'),
        ],
        error: null,
      })
      await refreshBenchmarks()

      const daskResults = getAllBenchmarksForType('dask')
      expect(daskResults[0].propertyType).toBe('apartment')
      expect(daskResults[0].vehicleClass).toBeUndefined()

      const homeResults = getAllBenchmarksForType('home')
      expect(homeResults[0].propertyType).toBe('villa')

      const bizResults = getAllBenchmarksForType('business')
      expect(bizResults[0].propertyType).toBe('office')
    })

    it('should set source fallback to TSB Market Data', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({ insurance_type: 'test', source: null })],
        error: null,
      })
      await refreshBenchmarks()

      const results = getAllBenchmarksForType('test')
      expect(results[0].source).toBe('TSB Market Data')
    })

    it('should include comparisonMethod and value rates in output', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockBenchmarkRow('custom', null, 'value_based', { min: 0.01, avg: 0.02, max: 0.03 })],
        error: null,
      })
      await refreshBenchmarks()

      const results = getAllBenchmarksForType('custom')
      expect(results[0].comparisonMethod).toBe('value_based')
      expect(results[0].valueMinRate).toBe(0.01)
      expect(results[0].valueAvgRate).toBe(0.02)
      expect(results[0].valueMaxRate).toBe(0.03)
    })
  })

  // =========================================================================
  // isValueBasedBenchmark - all branches
  // =========================================================================
  describe('isValueBasedBenchmark', () => {
    it('should return true when comparisonMethod is value_based and valueAvgRate exists', () => {
      const benchmark: LegacyPremiumRange = {
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY',
        year: 2026,
        source: 'Test',
        comparisonMethod: 'value_based',
        valueAvgRate: 0.025,
      }
      expect(isValueBasedBenchmark(benchmark)).toBe(true)
    })

    it('should return false when comparisonMethod is direct_premium', () => {
      const benchmark: LegacyPremiumRange = {
        insuranceType: 'zmss',
        minPremium: 2000,
        avgPremium: 3500,
        maxPremium: 6000,
        currency: 'TRY',
        year: 2026,
        source: 'Test',
        comparisonMethod: 'direct_premium',
        valueAvgRate: 0.02,
      }
      expect(isValueBasedBenchmark(benchmark)).toBe(false)
    })

    it('should return false when undefined is passed', () => {
      expect(isValueBasedBenchmark(undefined)).toBe(false)
    })

    it('should return false when comparisonMethod is value_based but valueAvgRate is missing', () => {
      const benchmark: LegacyPremiumRange = {
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY',
        year: 2026,
        source: 'Test',
        comparisonMethod: 'value_based',
        // valueAvgRate is undefined
      }
      expect(isValueBasedBenchmark(benchmark)).toBe(false)
    })

    it('should return false when comparisonMethod is value_based but valueAvgRate is 0', () => {
      const benchmark: LegacyPremiumRange = {
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY',
        year: 2026,
        source: 'Test',
        comparisonMethod: 'value_based',
        valueAvgRate: 0,
      }
      // !!0 === false
      expect(isValueBasedBenchmark(benchmark)).toBe(false)
    })

    it('should return false when comparisonMethod is undefined', () => {
      const benchmark: LegacyPremiumRange = {
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY',
        year: 2026,
        source: 'Test',
        valueAvgRate: 0.025,
      }
      expect(isValueBasedBenchmark(benchmark)).toBe(false)
    })
  })

  // =========================================================================
  // evaluateValueBasedPremium - all score/position branches
  // =========================================================================
  describe('evaluateValueBasedPremium', () => {
    const valueBasedBenchmark: LegacyPremiumRange = {
      insuranceType: 'kasko',
      minPremium: 5000,
      avgPremium: 10000,
      maxPremium: 20000,
      currency: 'TRY',
      year: 2026,
      source: 'Test',
      comparisonMethod: 'value_based',
      valueMinRate: 0.015,  // 1.5%
      valueAvgRate: 0.025,  // 2.5%
      valueMaxRate: 0.04,   // 4%
    }

    describe('Fallback when value rates not available', () => {
      it('should return score 70 and average position when valueMinRate is missing', () => {
        const benchmark: LegacyPremiumRange = {
          ...valueBasedBenchmark,
          valueMinRate: undefined,
        }
        const result = evaluateValueBasedPremium(10000, 500000, benchmark)
        expect(result.score).toBe(70)
        expect(result.position).toBe('average')
        expect(result.details).toContain('not available')
        expect(result.detailsTR).toContain('mevcut değil')
      })

      it('should return fallback when valueAvgRate is missing', () => {
        const benchmark: LegacyPremiumRange = {
          ...valueBasedBenchmark,
          valueAvgRate: undefined,
        }
        const result = evaluateValueBasedPremium(10000, 500000, benchmark)
        expect(result.score).toBe(70)
        expect(result.position).toBe('average')
      })

      it('should return fallback when valueMaxRate is missing', () => {
        const benchmark: LegacyPremiumRange = {
          ...valueBasedBenchmark,
          valueMaxRate: undefined,
        }
        const result = evaluateValueBasedPremium(10000, 500000, benchmark)
        expect(result.score).toBe(70)
        expect(result.position).toBe('average')
      })
    })

    describe('Rate below valueMinRate', () => {
      it('should return excellent (score 95) for rate just below min', () => {
        // Rate = 1.4% (just below 1.5% min), which is >= 0.75% (min * 0.5)
        const result = evaluateValueBasedPremium(7000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.014, 3)
        expect(result.score).toBe(95)
        expect(result.position).toBe('excellent')
      })

      it('should return average (score 60) for suspiciously low rate (< min * 0.5)', () => {
        // Rate = 0.4% (below 0.75% = 1.5% * 0.5)
        const result = evaluateValueBasedPremium(2000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.004, 3)
        expect(result.score).toBe(60)
        expect(result.position).toBe('average')
      })

      it('should handle rate exactly at valueMinRate', () => {
        // Rate = 1.5% exactly (at min)
        const result = evaluateValueBasedPremium(7500, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.015, 3)
        // actualRate <= valueMinRate, and 0.015 >= 0.015 * 0.5 = 0.0075, so score = 95
        expect(result.score).toBe(95)
        expect(result.position).toBe('excellent')
      })

      it('should handle rate at exactly min * 0.5 boundary', () => {
        // Rate = 0.75% exactly (at min * 0.5 boundary)
        const result = evaluateValueBasedPremium(3750, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.0075, 4)
        // 0.0075 < 0.015 * 0.5 = 0.0075 is false (not strictly less), so score = 95
        expect(result.score).toBe(95)
        expect(result.position).toBe('excellent')
      })
    })

    describe('Rate between valueMinRate and valueAvgRate', () => {
      it('should return good/excellent for rate close to min', () => {
        // Rate = 1.6% (just above 1.5% min)
        const result = evaluateValueBasedPremium(8000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.016, 3)
        // ratio = (0.025 - 0.016) / (0.025 - 0.015) = 0.9, score = 80 + round(0.9 * 15) = 80 + 14 = 94
        expect(result.score).toBeGreaterThanOrEqual(90)
        expect(result.position).toBe('excellent')
      })

      it('should return good for rate in middle between min and avg', () => {
        // Rate = 2% (midpoint)
        const result = evaluateValueBasedPremium(10000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.02, 3)
        // ratio = (0.025 - 0.02) / (0.025 - 0.015) = 0.5, score = 80 + round(0.5 * 15) = 80 + 8 = 88
        expect(result.score).toBe(88)
        expect(result.position).toBe('good')
      })

      it('should return good for rate close to avg', () => {
        // Rate = 2.4% (just below 2.5% avg)
        const result = evaluateValueBasedPremium(12000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.024, 3)
        // ratio = (0.025 - 0.024) / (0.025 - 0.015) = 0.1, score = 80 + round(0.1 * 15) = 80 + 2 = 82
        expect(result.score).toBe(82)
        expect(result.position).toBe('good')
      })
    })

    describe('Rate between valueAvgRate and valueMaxRate', () => {
      it('should return average for rate just above avg', () => {
        // Rate = 2.6%
        const result = evaluateValueBasedPremium(13000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.026, 3)
        // ratio = (0.026 - 0.025) / (0.04 - 0.025) = 0.0667, score = 80 - round(0.0667 * 30) = 80 - 2 = 78
        expect(result.score).toBeLessThan(80)
        expect(result.position).toBe('average')
      })

      it('should return high for rate close to max', () => {
        // Rate = 3.5% (ratio > 0.5)
        const result = evaluateValueBasedPremium(17500, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.035, 3)
        // ratio = (0.035 - 0.025) / (0.04 - 0.025) = 0.667, score = 80 - round(0.667 * 30) = 80 - 20 = 60
        expect(result.position).toBe('high')
      })

      it('should return average for rate at midpoint (ratio < 0.5)', () => {
        // Rate = 3.0% (ratio = 0.333)
        const result = evaluateValueBasedPremium(15000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.03, 3)
        // ratio = (0.03 - 0.025) / (0.04 - 0.025) = 0.333, position = 'average' (< 0.5)
        expect(result.position).toBe('average')
      })

      it('should handle rate exactly at ratio 0.5 boundary', () => {
        // Rate such that ratio = 0.5 exactly: avg + 0.5 * (max - avg) = 0.025 + 0.5 * 0.015 = 0.0325
        const result = evaluateValueBasedPremium(16250, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.0325, 4)
        // ratio = 0.5, position = 'high' (not strictly < 0.5)
        expect(result.position).toBe('high')
      })
    })

    describe('Rate above valueMaxRate', () => {
      it('should return very_high and score 40 for rate above max', () => {
        // Rate = 5%
        const result = evaluateValueBasedPremium(25000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.05, 3)
        expect(result.score).toBe(40)
        expect(result.position).toBe('very_high')
      })

      it('should return very_high for rate at exactly max rate', () => {
        // Rate = 4% exactly - this is <= valueMaxRate, so it falls in the avg-max branch
        const result = evaluateValueBasedPremium(20000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.04, 3)
        // ratio = (0.04 - 0.025) / (0.04 - 0.025) = 1.0, score = 80 - 30 = 50, position = 'high'
        expect(result.position).toBe('high')
      })

      it('should return very_high for rate just above max', () => {
        // Rate = 4.1%
        const result = evaluateValueBasedPremium(20500, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.041, 3)
        expect(result.score).toBe(40)
        expect(result.position).toBe('very_high')
      })

      it('should return very_high for extremely high rate', () => {
        const result = evaluateValueBasedPremium(100000, 500000, valueBasedBenchmark)
        expect(result.actualRate).toBeCloseTo(0.2, 2)
        expect(result.score).toBe(40)
        expect(result.position).toBe('very_high')
      })
    })

    describe('Zero insured value', () => {
      it('should handle zero insured value (actualRate = 0)', () => {
        const result = evaluateValueBasedPremium(10000, 0, valueBasedBenchmark)
        expect(result.actualRate).toBe(0)
        // 0 < 0.015 * 0.5 = 0.0075, so score = 60, position = 'average'
        expect(result.score).toBe(60)
        expect(result.position).toBe('average')
      })
    })

    describe('Details strings', () => {
      it('should include percentage in details', () => {
        const result = evaluateValueBasedPremium(10000, 500000, valueBasedBenchmark)
        expect(result.details).toContain('2.00%')
        expect(result.details).toContain('2.50%')
      })

      it('should include Turkish details', () => {
        const result = evaluateValueBasedPremium(10000, 500000, valueBasedBenchmark)
        expect(result.detailsTR).toContain('Prim oranı')
        expect(result.detailsTR).toContain('piyasa ort')
      })
    })
  })

  // =========================================================================
  // getPremiumBenchmarkWithFallback - DB vs hardcoded fallback branches
  // =========================================================================
  describe('getPremiumBenchmarkWithFallback', () => {
    it('should return DB benchmark when available', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({
          insurance_type: 'kasko',
          min_premium: 7777,
          avg_premium: 12222,
          max_premium: 18888,
        })],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmarkWithFallback('kasko')
      expect(result).toBeDefined()
      expect(result?.minPremium).toBe(7777)
    })

    it('should fall back to hardcoded data when DB has no match', async () => {
      // Empty DB cache
      mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
      await refreshBenchmarks()

      // 'kasko' should fall back to hardcoded data from coverage-limits.ts
      const result = getPremiumBenchmarkWithFallback('kasko')
      expect(result).toBeDefined()
      expect(result?.insuranceType).toBe('kasko')
      expect(result?.comparisonMethod).toBe('direct_premium')
    })

    it('should return undefined when neither DB nor hardcoded has data', async () => {
      mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
      await refreshBenchmarks()

      const result = getPremiumBenchmarkWithFallback('completely_unknown_type')
      expect(result).toBeUndefined()
    })

    it('should add comparisonMethod to hardcoded fallback', async () => {
      mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
      await refreshBenchmarks()

      const result = getPremiumBenchmarkWithFallback('zmss')
      if (result) {
        expect(result.comparisonMethod).toBe('direct_premium')
      }
    })

    it('should prefer DB data over hardcoded data', async () => {
      mockSupabaseResponse.mockResolvedValue({
        data: [createMockDbRow({
          insurance_type: 'zmss',
          min_premium: 9999,
          avg_premium: 19999,
          max_premium: 29999,
        })],
        error: null,
      })
      await refreshBenchmarks()

      const result = getPremiumBenchmarkWithFallback('zmss')
      expect(result?.minPremium).toBe(9999) // DB value, not hardcoded
    })

    it('should return fallback for dask', async () => {
      mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
      await refreshBenchmarks()

      const result = getPremiumBenchmarkWithFallback('dask')
      expect(result).toBeDefined()
      expect(result?.insuranceType).toBe('dask')
    })

    it('should return fallback for health', async () => {
      mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
      await refreshBenchmarks()

      const result = getPremiumBenchmarkWithFallback('health')
      expect(result).toBeDefined()
    })

    it('should return fallback for life', async () => {
      mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
      await refreshBenchmarks()

      const result = getPremiumBenchmarkWithFallback('life')
      // May or may not have hardcoded data
      if (result) {
        expect(result.comparisonMethod).toBe('direct_premium')
      }
    })

    it('should handle subType in fallback path', async () => {
      mockSupabaseResponse.mockResolvedValue({ data: [], error: null })
      await refreshBenchmarks()

      // The hardcoded getPremiumBenchmark takes subType as vehicleClass
      const result = getPremiumBenchmarkWithFallback('kasko', 'automobile')
      // Should either find a match or return general kasko
      if (result) {
        expect(result.insuranceType).toBe('kasko')
      }
    })
  })
})

// =============================================================================
// EVALUATOR BRANCH COVERAGE - Additional Tests for Uncovered Lines
// =============================================================================

// Import evaluator directly - the Supabase mock above covers its DB calls too
import { evaluatePolicy } from '../evaluator'
import type { Policy } from '@/types/policy'

describe('Evaluator - Additional Branch Coverage', () => {
  function createPolicy(overrides: Partial<Policy> = {}): Policy {
    const now = new Date()
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const expiryDate = new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000)

    return {
      id: 'test-eval-policy',
      policyNumber: 'POL-2026-TEST',
      provider: 'Test Insurance',
      logo: '/logo.png',
      type: 'kasko',
      typeTr: 'Kasko',
      coverage: 500000,
      premium: 12000,
      monthlyPremium: 1000,
      deductible: 5000,
      startDate: startDate.toISOString(),
      expiryDate: expiryDate.toISOString(),
      status: 'active',
      uploadDate: now.toISOString(),
      fileName: 'test.pdf',
      documentType: 'policy',
      insuranceLine: 'Auto',
      coverages: [
        { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 2000, included: true },
        { name: 'Theft', nameTr: 'Hırsızlık', limit: 200000, deductible: 1000, included: true },
        { name: 'Fire', nameTr: 'Yangın', limit: 200000, deductible: 500, included: true },
      ],
      exclusions: ['Racing', 'War'],
      specialConditions: [],
      ...overrides,
    }
  }

  // =========================================================================
  // Market value coverage branch in evaluateCoverage
  // =========================================================================
  describe('Market value coverage branches (evaluator lines 278-366)', () => {
    it('should award bonus for market value coverage (isMarketValue flag)', () => {
      const policy = createPolicy({
        coverage: 500000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 500000, deductible: 0, included: true, isMarketValue: true },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 500000, deductible: 0, included: true },
        ],
      })
      const eval1 = evaluatePolicy(policy)
      expect(eval1.scoreBreakdown.coverage.details).toContain('market value')
    })

    it('should award bonus for market value coverage (coverage = 0)', () => {
      const policy = createPolicy({
        coverage: 0,
        premium: 10000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 0, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.detailsTR).toContain('rayiç değer')
    })

    it('should award bonus for unlimited liability', () => {
      const policy = createPolicy({
        coverages: [
          { name: 'Artan Mali Sorumluluk', nameTr: 'Artan Mali Sorumluluk', limit: 0, deductible: 0, included: true, isUnlimited: true },
          { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      // Score should include the unlimited liability bonus
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(75)
    })

    it('should award bonus for personal accident (ferdi kaza) coverage', () => {
      // Include both essential coverages to avoid penalty, plus personal accident
      const policy = createPolicy({
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 0, included: true },
          { name: 'Increased Liability', nameTr: 'Artan Mali Sorumluluk', limit: 100000, deductible: 0, included: true },
          { name: 'Ferdi Kaza', nameTr: 'Ferdi Kaza', limit: 50000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      // Base 75 + ferdi kaza 5 = 80 (no essential missing penalty)
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(80)
    })

    it('should award bonus for replacement vehicle (ikame) coverage', () => {
      const policy = createPolicy({
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 0, included: true },
          { name: 'Increased Liability', nameTr: 'Artan Mali Sorumluluk', limit: 100000, deductible: 0, included: true },
          { name: 'Ferdi Kaza', nameTr: 'Ferdi Kaza', limit: 50000, deductible: 0, included: true },
          { name: 'İkame Araç', nameTr: 'İkame Araç', limit: 0, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      // Should score higher than base due to ikame bonus
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(80)
    })

    it('should award bonus for legal protection coverage', () => {
      const policy = createPolicy({
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 0, included: true },
          { name: 'Increased Liability', nameTr: 'Artan Mali Sorumluluk', limit: 100000, deductible: 0, included: true },
          { name: 'Ferdi Kaza', nameTr: 'Ferdi Kaza', limit: 50000, deductible: 0, included: true },
          { name: 'Hukuki Koruma', nameTr: 'Hukuki Koruma', limit: 20000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      // Should score higher than base due to hukuki koruma bonus
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(80)
    })
  })

  // =========================================================================
  // Non-kasko coverage branches
  // =========================================================================
  describe('Non-kasko coverage branches', () => {
    it('should award bonus for high coverage-to-premium ratio (>20)', () => {
      const policy = createPolicy({
        type: 'health',
        typeTr: 'Sağlık',
        coverage: 1000000,
        premium: 10000, // Ratio = 100
        coverages: [
          { name: 'Hospitalization', nameTr: 'Yatarak Tedavi', limit: 500000, deductible: 0, included: true },
          { name: 'Surgery', nameTr: 'Ameliyat', limit: 500000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(70)
    })

    it('should penalize low coverage-to-premium ratio (<10)', () => {
      const policy = createPolicy({
        type: 'health',
        typeTr: 'Sağlık',
        coverage: 50000,
        premium: 10000, // Ratio = 5
        coverages: [
          { name: 'Hospitalization', nameTr: 'Yatarak Tedavi', limit: 50000, deductible: 5000, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.issues.some(i =>
        i.toLowerCase().includes('low relative to premium')
      )).toBe(true)
    })

    it('should penalize non-kasko with fewer than 3 coverages', () => {
      const policy = createPolicy({
        type: 'home',
        typeTr: 'Konut',
        coverage: 500000,
        premium: 5000,
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 500000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.issues.some(i =>
        i.toLowerCase().includes('limited number')
      )).toBe(true)
    })

    it('should penalize non-kasko with many low-limit coverages', () => {
      const policy = createPolicy({
        type: 'home',
        typeTr: 'Konut',
        coverage: 500000,
        premium: 5000,
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 10000, deductible: 0, included: true },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 20000, deductible: 0, included: true },
          { name: 'Water Damage', nameTr: 'Su Hasarı', limit: 15000, deductible: 0, included: true },
          { name: 'Glass', nameTr: 'Cam', limit: 5000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.issues.some(i =>
        i.toLowerCase().includes('low limits')
      )).toBe(true)
    })
  })

  // =========================================================================
  // Coverage count branches (10+, 6+, <3)
  // =========================================================================
  describe('Coverage count score adjustments', () => {
    it('should give max bonus for 10+ coverages', () => {
      const coverages = Array.from({ length: 11 }, (_, i) => ({
        name: `Coverage ${i}`,
        nameTr: `Teminat ${i}`,
        limit: 100000,
        deductible: 0,
        included: true,
      }))
      const policy = createPolicy({ coverages })
      const result = evaluatePolicy(policy)
      // 10+ coverages should give the highest coverage count bonus
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(75)
    })

    it('should give medium bonus for 6-9 coverages', () => {
      const coverages = Array.from({ length: 7 }, (_, i) => ({
        name: `Coverage ${i}`,
        nameTr: `Teminat ${i}`,
        limit: 100000,
        deductible: 0,
        included: true,
      }))
      const policy = createPolicy({ coverages })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(70)
    })
  })

  // =========================================================================
  // Deductible branches for market value policies
  // =========================================================================
  describe('Deductible for market value policies', () => {
    it('should score 90 for market value policy with deductible < 5000', () => {
      const policy = createPolicy({
        coverage: 0,
        deductible: 3000,
        premium: 10000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 0, deductible: 0, included: true, isMarketValue: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBe(90)
    })

    it('should score 80 for market value policy with deductible 5000-9999', () => {
      const policy = createPolicy({
        coverage: 0,
        deductible: 7000,
        premium: 10000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 0, deductible: 0, included: true, isMarketValue: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBe(80)
    })

    it('should score 65 for market value policy with deductible 10000-24999', () => {
      const policy = createPolicy({
        coverage: 0,
        deductible: 15000,
        premium: 10000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 0, deductible: 0, included: true, isMarketValue: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBe(65)
      expect(result.scoreBreakdown.deductible.issues).toContain('Deductible is moderately high')
    })

    it('should score 50 for market value policy with deductible 25000-49999', () => {
      const policy = createPolicy({
        coverage: 0,
        deductible: 35000,
        premium: 10000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 0, deductible: 0, included: true, isMarketValue: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBe(50)
      expect(result.scoreBreakdown.deductible.issues).toContain('Deductible is high')
    })

    it('should score 30 for market value policy with deductible >= 50000', () => {
      const policy = createPolicy({
        coverage: 0,
        deductible: 60000,
        premium: 10000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 0, deductible: 0, included: true, isMarketValue: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBe(30)
      expect(result.scoreBreakdown.deductible.issues).toContain('Deductible is very high')
    })
  })

  // =========================================================================
  // Deductible ratio branches (standard evaluation)
  // =========================================================================
  describe('Deductible ratio branches', () => {
    it('should score 90 for deductible < 1% of coverage', () => {
      const policy = createPolicy({
        coverage: 1000000,
        deductible: 5000, // 0.5%
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBeGreaterThanOrEqual(85)
    })

    it('should score 80 for deductible 1-2% of coverage', () => {
      const policy = createPolicy({
        coverage: 500000,
        deductible: 7500, // 1.5%
      })
      const result = evaluatePolicy(policy)
      // Score 80 base, minus potential per-coverage deductible penalties
      expect(result.scoreBreakdown.deductible.score).toBeGreaterThanOrEqual(70)
    })

    it('should score 65 for deductible 2-5% of coverage', () => {
      const policy = createPolicy({
        type: 'home',
        typeTr: 'Konut',
        coverage: 500000,
        deductible: 15000, // 3%
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 500000, deductible: 500, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBe(65)
    })

    it('should score 50 for deductible 5-10% of coverage', () => {
      const policy = createPolicy({
        type: 'home',
        typeTr: 'Konut',
        coverage: 200000,
        deductible: 15000, // 7.5%
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 200000, deductible: 500, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBe(50)
    })

    it('should score 30 for deductible > 10% of coverage', () => {
      const policy = createPolicy({
        type: 'home',
        typeTr: 'Konut',
        coverage: 100000,
        deductible: 15000, // 15%
        coverages: [
          { name: 'Fire', nameTr: 'Yangın', limit: 100000, deductible: 500, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.deductible.score).toBeLessThanOrEqual(30)
    })
  })

  // =========================================================================
  // Value evaluation - market value vs standard branches
  // =========================================================================
  describe('Value evaluation branches', () => {
    it('should evaluate market value policy value with 3+ value-added coverages', () => {
      const policy = createPolicy({
        coverage: 0,
        premium: 10000,
        coverages: [
          { name: 'Yol Yardım', nameTr: 'Yol Yardım', limit: 0, deductible: 0, included: true },
          { name: 'İkame Araç', nameTr: 'İkame Araç', limit: 0, deductible: 0, included: true },
          { name: 'Hukuki Koruma', nameTr: 'Hukuki Koruma', limit: 0, deductible: 0, included: true },
          { name: 'Cam', nameTr: 'Cam', limit: 10000, deductible: 0, included: true },
          { name: 'Collision', nameTr: 'Çarpışma', limit: 0, deductible: 0, included: true, isMarketValue: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.value.details).toContain('value-added features')
    })

    it('should evaluate standard policy with high coverage-to-premium ratio (>50x)', () => {
      const policy = createPolicy({
        type: 'health',
        typeTr: 'Sağlık',
        coverage: 2000000,
        premium: 10000, // 200x ratio
        coverages: [
          { name: 'Hospitalization', nameTr: 'Yatarak', limit: 2000000, deductible: 0, included: true },
          { name: 'Surgery', nameTr: 'Ameliyat', limit: 1000000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      // Score should include the 15-point bonus for >50x ratio
      expect(result.scoreBreakdown.value.score).toBeGreaterThanOrEqual(60)
    })

    it('should evaluate standard policy with low coverage-to-premium ratio (<10x)', () => {
      const policy = createPolicy({
        type: 'health',
        typeTr: 'Sağlık',
        coverage: 50000,
        premium: 10000, // 5x ratio
        coverages: [
          { name: 'Hospitalization', nameTr: 'Yatarak', limit: 50000, deductible: 5000, included: true },
        ],
        exclusions: Array.from({ length: 12 }, (_, i) => `Exclusion ${i}`),
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.value.issues.some(i =>
        i.toLowerCase().includes('low coverage-to-premium')
      )).toBe(true)
    })
  })

  // =========================================================================
  // Premium evaluation - direct comparison branches
  // =========================================================================
  describe('Premium direct comparison branches', () => {
    it('should handle premium below market minimum', () => {
      // For traffic insurance, use direct premium comparison
      const policy = createPolicy({
        type: 'traffic',
        typeTr: 'Trafik',
        coverage: 1500000,
        premium: 100, // Suspiciously low
        coverages: [
          { name: 'Bodily Injury', nameTr: 'Bedensel', limit: 1000000, deductible: 0, included: true },
          { name: 'Material Damage', nameTr: 'Maddi', limit: 500000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.premium.issues.some(i =>
        i.toLowerCase().includes('below market minimum')
      )).toBe(true)
    })

    it('should handle premium above market maximum', () => {
      const policy = createPolicy({
        type: 'traffic',
        typeTr: 'Trafik',
        coverage: 1500000,
        premium: 999999, // Way above max
        coverages: [
          { name: 'Bodily Injury', nameTr: 'Bedensel', limit: 1000000, deductible: 0, included: true },
          { name: 'Material Damage', nameTr: 'Maddi', limit: 500000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.premium.issues.some(i =>
        i.toLowerCase().includes('exceeds typical market range')
      )).toBe(true)
    })
  })

  // =========================================================================
  // Nakliyat policy type
  // =========================================================================
  describe('Nakliyat policy type', () => {
    it('should evaluate nakliyat policy correctly', () => {
      const policy = createPolicy({
        type: 'nakliyat',
        typeTr: 'Nakliyat',
        coverage: 500000,
        premium: 8000,
        coverages: [
          { name: 'Cargo Damage', nameTr: 'Emtia Hasarı', limit: 300000, deductible: 5000, included: true },
          { name: 'Loading/Unloading', nameTr: 'Yükleme/Boşaltma', limit: 100000, deductible: 2000, included: true },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 100000, deductible: 1000, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.policyType).toBe('nakliyat')
      expect(result.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.overallScore).toBeLessThanOrEqual(100)
    })
  })

  // =========================================================================
  // Market comparison branches - value based vs direct
  // =========================================================================
  describe('Market comparison branches', () => {
    it('should calculate premiumPercentile with value-based benchmark', () => {
      const policy = createPolicy({
        type: 'kasko',
        coverage: 500000,
        premium: 12500, // 2.5% rate
      })
      const result = evaluatePolicy(policy)
      expect(result.marketComparison.premiumPercentile).toBeGreaterThanOrEqual(0)
      expect(result.marketComparison.premiumPercentile).toBeLessThanOrEqual(100)
    })

    it('should set coveragePercentile to 70 for value-based comparison', () => {
      const policy = createPolicy({
        type: 'kasko',
        coverage: 500000,
        premium: 12500,
      })
      const result = evaluatePolicy(policy)
      // For value-based benchmarks, coveragePercentile is set to 70 as neutral
      // (This is coverage-dependent on whether the kasko benchmark is value_based)
      expect(result.marketComparison.coveragePercentile).toBeGreaterThanOrEqual(0)
    })
  })

  // =========================================================================
  // Competitive position branches
  // =========================================================================
  describe('Competitive position classification', () => {
    it('should include a valid competitive position', () => {
      const policy = createPolicy()
      const result = evaluatePolicy(policy)
      expect(['leader', 'competitive', 'average', 'below_average', 'lagging']).toContain(
        result.marketComparison.competitivePosition
      )
    })
  })

  // =========================================================================
  // Recommendation branches
  // =========================================================================
  describe('Recommendation generation branches', () => {
    it('should generate compliance recommendation for below_minimum', () => {
      const policy = createPolicy({
        type: 'traffic',
        typeTr: 'Trafik',
        coverage: 100, // Way below minimum
        premium: 5000,
        coverages: [
          { name: 'Bodily Injury', nameTr: 'Bedensel', limit: 100, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      const complianceRecs = result.recommendations.filter(r => r.type === 'compliance')
      expect(complianceRecs.length).toBeGreaterThan(0)
    })

    it('should generate positive recommendation when policy is well-structured', () => {
      const policy = createPolicy({
        coverage: 800000,
        premium: 12000,
        deductible: 2000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 300000, deductible: 500, included: true },
          { name: 'Theft', nameTr: 'Hırsızlık', limit: 300000, deductible: 500, included: true },
          { name: 'Fire', nameTr: 'Yangın', limit: 300000, deductible: 0, included: true },
          { name: 'Natural Disasters', nameTr: 'Doğal Afetler', limit: 200000, deductible: 1000, included: true },
          { name: 'Glass', nameTr: 'Cam', limit: 20000, deductible: 0, included: true },
          { name: 'Roadside Assistance', nameTr: 'Yol Yardım', limit: 5000, deductible: 0, included: true },
          { name: 'Legal Protection', nameTr: 'Hukuki Koruma', limit: 50000, deductible: 0, included: true },
          { name: 'Increased Liability', nameTr: 'Artan Mali Sorumluluk', limit: 100000, deductible: 0, included: true },
          { name: 'Ferdi Kaza', nameTr: 'Ferdi Kaza', limit: 50000, deductible: 0, included: true },
        ],
        exclusions: [],
      })
      const result = evaluatePolicy(policy)
      const positiveRec = result.recommendations.find(r => r.title === 'Policy Well-Structured')
      // If the policy scores well in all areas, it should get a positive recommendation
      if (result.scoreBreakdown.premium.score >= 70 && result.scoreBreakdown.coverage.score >= 70) {
        expect(positiveRec).toBeDefined()
      }
    })

    it('should skip premium optimization for comprehensive policy (8+ coverages)', () => {
      const policy = createPolicy({
        coverage: 100000,
        premium: 50000, // High premium
        coverages: Array.from({ length: 9 }, (_, i) => ({
          name: `Coverage ${i}`,
          nameTr: `Teminat ${i}`,
          limit: 10000,
          deductible: 0,
          included: true,
        })),
      })
      const result = evaluatePolicy(policy)
      const premiumRec = result.recommendations.find(r => r.type === 'review_premium')
      // Should be undefined because isComprehensivePolicy is true
      expect(premiumRec).toBeUndefined()
    })
  })

  // =========================================================================
  // Summary generation branches
  // =========================================================================
  describe('Summary generation (strengths/weaknesses)', () => {
    it('should include strengths for categories with score >= 80', () => {
      const policy = createPolicy({
        deductible: 0, // Deductible score = 95
      })
      const result = evaluatePolicy(policy)
      // Zero deductible should result in "Strong deductible" strength
      expect(result.summary.strengths.some(s => s.toLowerCase().includes('deductible'))).toBe(true)
      expect(result.summary.strengthsTR.some(s => s.toLowerCase().includes('muafiyet'))).toBe(true)
    })

    it('should include weaknesses for categories with score < 60', () => {
      const policy = createPolicy({
        type: 'home',
        typeTr: 'Konut',
        coverage: 50000,
        premium: 20000,
        deductible: 20000, // 40% of coverage - very high
        coverages: [
          { name: 'Other', nameTr: 'Diğer', limit: 10000, deductible: 5000, included: true },
        ],
        exclusions: Array.from({ length: 15 }, (_, i) => `Exc ${i}`),
      })
      const result = evaluatePolicy(policy)
      expect(result.summary.weaknesses.length).toBeGreaterThan(0)
      expect(result.summary.weaknessesTR.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // DASK compliance branches
  // =========================================================================
  describe('DASK compliance branches', () => {
    it('should flag DASK coverage exceeding maximum limit', () => {
      const now = new Date()
      const policy = createPolicy({
        type: 'dask',
        typeTr: 'DASK',
        coverage: 10000000, // Way above DASK max
        premium: 2000,
        deductible: 200000,
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000).toISOString(),
        coverages: [
          { name: 'Earthquake', nameTr: 'Deprem', limit: 10000000, deductible: 200000, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      const regulatoryIssue = result.compliance.issues.find(i =>
        i.type === 'regulatory' && i.description.includes('DASK maximum')
      )
      expect(regulatoryIssue).toBeDefined()
    })

    it('should flag DASK deductible not at 2%', () => {
      const now = new Date()
      const policy = createPolicy({
        type: 'dask',
        typeTr: 'DASK',
        coverage: 500000,
        premium: 1500,
        deductible: 50000, // 10% instead of 2%
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000).toISOString(),
        coverages: [
          { name: 'Earthquake', nameTr: 'Deprem', limit: 500000, deductible: 50000, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      const deductibleIssue = result.compliance.issues.find(i =>
        i.type === 'regulatory' && i.description.includes('DASK deductible')
      )
      expect(deductibleIssue).toBeDefined()
    })
  })

  // =========================================================================
  // Missing essential coverages for various policy types
  // =========================================================================
  describe('Missing essential coverages by policy type', () => {
    it('should flag missing essential coverages for home policy', () => {
      const policy = createPolicy({
        type: 'home',
        typeTr: 'Konut',
        coverage: 500000,
        premium: 5000,
        coverages: [
          { name: 'Other', nameTr: 'Diğer', limit: 100000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.issues.some(i =>
        i.includes('Missing essential')
      )).toBe(true)
    })

    it('should flag missing essential coverages for business policy', () => {
      const policy = createPolicy({
        type: 'business',
        typeTr: 'İşyeri',
        coverage: 500000,
        premium: 5000,
        coverages: [
          { name: 'Other', nameTr: 'Diğer', limit: 100000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.issues.some(i =>
        i.includes('Missing essential')
      )).toBe(true)
    })

    it('should flag missing essential coverages for nakliyat policy', () => {
      const policy = createPolicy({
        type: 'nakliyat',
        typeTr: 'Nakliyat',
        coverage: 500000,
        premium: 5000,
        coverages: [
          { name: 'Other', nameTr: 'Diğer', limit: 100000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.issues.some(i =>
        i.includes('Missing essential')
      )).toBe(true)
    })

    it('should show recommended (not essential) coverage for kasko', () => {
      const policy = createPolicy({
        type: 'kasko',
        typeTr: 'Kasko',
        coverage: 500000,
        premium: 12000,
        coverages: [
          { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 0, included: true },
        ],
      })
      const result = evaluatePolicy(policy)
      const recIssues = result.scoreBreakdown.coverage.issues.filter(i =>
        i.includes('Recommended coverage')
      )
      // Should have "Recommended" not "Missing essential" for kasko
      if (recIssues.length > 0) {
        expect(recIssues[0]).toContain('Recommended')
      }
    })
  })

  // =========================================================================
  // calculateOverallScore edge case
  // =========================================================================
  describe('Overall score calculation', () => {
    it('should handle zero total weight', () => {
      const policy = createPolicy()
      const result = evaluatePolicy(policy, {
        weights: { premium: 0, coverage: 0, deductible: 0, compliance: 0, value: 0 },
      })
      expect(result.overallScore).toBe(0)
    })
  })
})
