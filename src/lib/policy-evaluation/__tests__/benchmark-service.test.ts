/**
 * Benchmark Service Tests
 *
 * Tests for the database-driven premium benchmark service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getPremiumBenchmarkWithFallback,
  isValueBasedBenchmark,
  evaluateValueBasedPremium,
  getAllBenchmarksForType,
  type LegacyPremiumRange,
} from '../benchmark-service'

// Mock Supabase client to avoid database calls in tests
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}))

describe('Benchmark Service', () => {
  describe('getPremiumBenchmarkWithFallback', () => {
    it('should return benchmark for kasko insurance type', () => {
      const benchmark = getPremiumBenchmarkWithFallback('kasko')

      expect(benchmark).toBeDefined()
      expect(benchmark?.insuranceType).toBe('kasko')
      expect(benchmark?.minPremium).toBeGreaterThan(0)
      expect(benchmark?.avgPremium).toBeGreaterThan(benchmark?.minPremium || 0)
      expect(benchmark?.maxPremium).toBeGreaterThan(benchmark?.avgPremium || 0)
    })

    it('should return benchmark for zmss (traffic) insurance type', () => {
      const benchmark = getPremiumBenchmarkWithFallback('zmss')

      expect(benchmark).toBeDefined()
      expect(benchmark?.insuranceType).toBe('zmss')
    })

    it('should return benchmark for dask insurance type', () => {
      const benchmark = getPremiumBenchmarkWithFallback('dask')

      expect(benchmark).toBeDefined()
      expect(benchmark?.insuranceType).toBe('dask')
    })

    it('should return benchmark for health insurance type', () => {
      const benchmark = getPremiumBenchmarkWithFallback('health')

      expect(benchmark).toBeDefined()
      expect(benchmark?.insuranceType).toBe('health')
    })

    it('should return undefined for unknown insurance type', () => {
      const benchmark = getPremiumBenchmarkWithFallback('unknown_type')

      expect(benchmark).toBeUndefined()
    })

    it('should include currency as TRY', () => {
      const benchmark = getPremiumBenchmarkWithFallback('kasko')

      expect(benchmark?.currency).toBe('TRY')
    })

    it('should include source information', () => {
      const benchmark = getPremiumBenchmarkWithFallback('kasko')

      expect(benchmark?.source).toBeDefined()
      expect(typeof benchmark?.source).toBe('string')
    })
  })

  describe('isValueBasedBenchmark', () => {
    it('should return true for benchmark with value_based comparison method', () => {
      const benchmark: LegacyPremiumRange = {
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY',
        year: 2025,
        source: 'Test',
        comparisonMethod: 'value_based',
        valueMinRate: 0.015,
        valueAvgRate: 0.025,
        valueMaxRate: 0.04,
      }

      expect(isValueBasedBenchmark(benchmark)).toBe(true)
    })

    it('should return false for benchmark with direct_premium comparison method', () => {
      const benchmark: LegacyPremiumRange = {
        insuranceType: 'zmss',
        minPremium: 2000,
        avgPremium: 3500,
        maxPremium: 6000,
        currency: 'TRY',
        year: 2025,
        source: 'Test',
        comparisonMethod: 'direct_premium',
      }

      expect(isValueBasedBenchmark(benchmark)).toBe(false)
    })

    it('should return false for undefined benchmark', () => {
      expect(isValueBasedBenchmark(undefined)).toBe(false)
    })

    it('should return false for benchmark without valueAvgRate', () => {
      const benchmark: LegacyPremiumRange = {
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY',
        year: 2025,
        source: 'Test',
        comparisonMethod: 'value_based',
        // Missing valueAvgRate
      }

      expect(isValueBasedBenchmark(benchmark)).toBe(false)
    })
  })

  describe('evaluateValueBasedPremium', () => {
    const benchmark: LegacyPremiumRange = {
      insuranceType: 'kasko',
      minPremium: 5000,
      avgPremium: 10000,
      maxPremium: 20000,
      currency: 'TRY',
      year: 2025,
      source: 'Test',
      comparisonMethod: 'value_based',
      valueMinRate: 0.015,  // 1.5%
      valueAvgRate: 0.025,  // 2.5%
      valueMaxRate: 0.04,   // 4%
    }

    it('should evaluate excellent rate (below min)', () => {
      // Premium: 7000, Value: 500000 = 1.4% rate (below 1.5% min)
      const result = evaluateValueBasedPremium(7000, 500000, benchmark)

      expect(result.actualRate).toBeCloseTo(0.014, 3)
      expect(result.score).toBeGreaterThanOrEqual(90)
      expect(result.position).toBe('excellent')
    })

    it('should evaluate good rate (between min and avg)', () => {
      // Premium: 10000, Value: 500000 = 2% rate (between 1.5% and 2.5%)
      const result = evaluateValueBasedPremium(10000, 500000, benchmark)

      expect(result.actualRate).toBeCloseTo(0.02, 3)
      expect(result.score).toBeGreaterThanOrEqual(80)
      expect(['excellent', 'good']).toContain(result.position)
    })

    it('should evaluate average rate (between avg and max)', () => {
      // Premium: 15000, Value: 500000 = 3% rate (between 2.5% and 4%)
      const result = evaluateValueBasedPremium(15000, 500000, benchmark)

      expect(result.actualRate).toBeCloseTo(0.03, 3)
      expect(result.score).toBeLessThan(80)
      expect(['average', 'high']).toContain(result.position)
    })

    it('should evaluate very_high rate (above max)', () => {
      // Premium: 25000, Value: 500000 = 5% rate (above 4% max)
      const result = evaluateValueBasedPremium(25000, 500000, benchmark)

      expect(result.actualRate).toBeCloseTo(0.05, 3)
      expect(result.score).toBeLessThanOrEqual(40)
      expect(result.position).toBe('very_high')
    })

    it('should handle zero insured value', () => {
      const result = evaluateValueBasedPremium(10000, 0, benchmark)

      expect(result.actualRate).toBe(0)
      // Rate of 0% is suspiciously low (< valueMinRate * 0.5), so score is 60
      expect(result.score).toBe(60)
      expect(result.position).toBe('average')
    })

    it('should return details in both languages', () => {
      const result = evaluateValueBasedPremium(10000, 500000, benchmark)

      expect(result.details).toContain('%')
      expect(result.detailsTR).toContain('%')
    })

    it('should handle benchmark without value rates', () => {
      const directBenchmark: LegacyPremiumRange = {
        insuranceType: 'zmss',
        minPremium: 2000,
        avgPremium: 3500,
        maxPremium: 6000,
        currency: 'TRY',
        year: 2025,
        source: 'Test',
        comparisonMethod: 'direct_premium',
      }

      const result = evaluateValueBasedPremium(3000, 100000, directBenchmark)

      expect(result.score).toBe(70) // Default fallback
      expect(result.position).toBe('average')
    })
  })

  describe('getAllBenchmarksForType', () => {
    it('should return empty array for unknown type (no DB data)', () => {
      const benchmarks = getAllBenchmarksForType('unknown_type')

      // Since cache is empty (no DB), should return empty
      expect(Array.isArray(benchmarks)).toBe(true)
    })
  })

  describe('Integration with evaluator', () => {
    it('should provide benchmark data that evaluator can use', () => {
      const benchmark = getPremiumBenchmarkWithFallback('kasko')

      // Verify all required fields for evaluator are present
      expect(benchmark).toHaveProperty('minPremium')
      expect(benchmark).toHaveProperty('avgPremium')
      expect(benchmark).toHaveProperty('maxPremium')
      expect(typeof benchmark?.minPremium).toBe('number')
      expect(typeof benchmark?.avgPremium).toBe('number')
      expect(typeof benchmark?.maxPremium).toBe('number')
    })

    it('should have valid premium ranges (min < avg < max)', () => {
      const insuranceTypes = ['kasko', 'zmss', 'dask', 'health', 'life', 'home', 'business']

      for (const type of insuranceTypes) {
        const benchmark = getPremiumBenchmarkWithFallback(type)
        if (benchmark) {
          expect(benchmark.minPremium).toBeLessThanOrEqual(benchmark.avgPremium)
          expect(benchmark.avgPremium).toBeLessThanOrEqual(benchmark.maxPremium)
        }
      }
    })
  })
})
