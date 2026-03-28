/**
 * B1 — Benchmark Honesty Regression Tests
 *
 * Validates that the evaluator caps premium scores when benchmarks lack
 * verified provenance, includes a disclaimer, and uses "estimate" language
 * instead of "average" in details text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Policy } from '@/types/policy'

// Mock benchmark service (same pattern as evaluator-branches.test.ts)
vi.mock('../benchmark-service', () => ({
  getPremiumBenchmarkWithFallback: vi.fn(),
  isValueBasedBenchmark: vi.fn(),
  evaluateValueBasedPremium: vi.fn(),
}))

// Mock data imports
vi.mock('@/data', () => ({
  getBranchStatistics: vi.fn(() => ({
    premiumIncome: 100000000,
    claimsPaid: 60000000,
    policyCount: 50000,
    averagePremium: 3000,
    lossRatio: 0.6,
  })),
  getCurrentTrafficLimits: vi.fn(() => ({
    limits: [
      { vehicleType: 'automobile', coverageType: 'bodily_injury_per_person', perPerson: 2700000 },
    ],
  })),
  getCurrentDaskLimits: vi.fn(() => ({
    limits: [{ coverageType: 'max_coverage', maxLimit: 640000 }],
  })),
  MARKET_DATA_2024: {
    averagePremiums: {
      kasko: 8000,
      zmss: 3000,
      home: 2000,
      health: 5000,
      life: 1500,
      dask: 800,
      business: 4000,
      nakliyat: 6000,
    },
  },
  DASK_PREMIUM_RATES_2026: {
    maxCoverage: 640000,
  },
}))

import { evaluatePolicy } from '../evaluator'
import {
  getPremiumBenchmarkWithFallback,
  isValueBasedBenchmark,
  evaluateValueBasedPremium,
} from '../benchmark-service'

const mockGetBenchmark = vi.mocked(getPremiumBenchmarkWithFallback)
const mockIsValueBased = vi.mocked(isValueBasedBenchmark)
const mockEvalValueBased = vi.mocked(evaluateValueBasedPremium)

// Current date for benchmark freshness — prevents stale downgrade in context-factor tests
const CURRENT_DATA_DATE = new Date().toISOString().split('T')[0]

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'bench-test-1',
    policyNumber: 'POL-BENCH-001',
    provider: 'Test Sigorta',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 5000,
    deductible: 0,
    startDate: '2025-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    uploadDate: '2025-01-01',
    coverages: [],
    exclusions: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBenchmark.mockReturnValue(undefined)
  mockIsValueBased.mockReturnValue(false)
})

// =============================================================================
// B1: BENCHMARK HONESTY — SCORE CAPPING & DISCLAIMER
// =============================================================================

describe('B1 — Benchmark Honesty', () => {
  describe('BENCHMARK_SCORE_CAP (75) enforcement', () => {
    it('caps premium score at 75 when direct benchmark has no verified provenance', () => {
      // Provide a direct-comparison benchmark where premium is well below avg
      mockGetBenchmark.mockReturnValue({
        insuranceType: 'kasko',
        minPremium: 3000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY' as const,
        year: 2026,
        source: 'Indicative estimate',
        dataDate: CURRENT_DATA_DATE,
      })

      // Premium far below avg would normally score 90+
      const result = evaluatePolicy(makePolicy({ premium: 3500, coverage: 500000 }))

      // Premium score must be capped at 75 (BENCHMARK_SCORE_CAP)
      expect(result.scoreBreakdown.premium.score).toBeLessThanOrEqual(75)
    })

    it('caps premium score at 75 even when premium equals avgPremium', () => {
      mockGetBenchmark.mockReturnValue({
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY' as const,
        year: 2026,
        source: 'Indicative estimate',
        dataDate: CURRENT_DATA_DATE,
      })

      // Premium at avg would normally score ~90
      const result = evaluatePolicy(makePolicy({ premium: 10000, coverage: 500000 }))

      expect(result.scoreBreakdown.premium.score).toBeLessThanOrEqual(75)
    })

    it('caps value-based benchmark score at 75', () => {
      mockGetBenchmark.mockReturnValue({
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY' as const,
        year: 2026,
        source: 'Indicative estimate',
        comparisonMethod: 'value_based' as const,
        valueMinRate: 0.015,
        valueAvgRate: 0.03,
        valueMaxRate: 0.06,
        dataDate: CURRENT_DATA_DATE,
      })
      mockIsValueBased.mockReturnValue(true)
      mockEvalValueBased.mockReturnValue({
        score: 95, // Would be 95 without cap
        details: 'Premium rate of 2.0% is below market estimate of 3.0%',
        detailsTR: 'Prim oranı %2.0, piyasa tahmini %3.0 altında',
        position: 'competitive' as const,
        rate: 0.02,
      })

      const result = evaluatePolicy(makePolicy({ premium: 10000, coverage: 500000 }))

      // Even though value-based returned 95, it must be capped at 75
      expect(result.scoreBreakdown.premium.score).toBeLessThanOrEqual(75)
    })
  })

  describe('benchmarkDisclaimer field', () => {
    it('always includes benchmarkDisclaimer string on the evaluation result', () => {
      const result = evaluatePolicy(makePolicy())

      expect(result.benchmarkDisclaimer).toBeDefined()
      expect(typeof result.benchmarkDisclaimer).toBe('string')
      expect(result.benchmarkDisclaimer!.length).toBeGreaterThan(0)
    })

    it('includes benchmarkDisclaimerTr in Turkish', () => {
      const result = evaluatePolicy(makePolicy())

      expect(result.benchmarkDisclaimerTr).toBeDefined()
      expect(typeof result.benchmarkDisclaimerTr).toBe('string')
      expect(result.benchmarkDisclaimerTr!.length).toBeGreaterThan(0)
    })

    it('disclaimer mentions estimates or indicative nature', () => {
      // Provide current-date benchmark so disclaimer uses standard (not stale) wording
      mockGetBenchmark.mockReturnValue({
        insuranceType: 'kasko',
        minPremium: 3000,
        avgPremium: 8000,
        maxPremium: 15000,
        currency: 'TRY' as const,
        year: 2026,
        source: 'TSB',
        dataDate: CURRENT_DATA_DATE,
      })

      const result = evaluatePolicy(makePolicy())

      // The English disclaimer should mention "estimate" to signal indicative data
      expect(result.benchmarkDisclaimer!.toLowerCase()).toMatch(/estimate/)
    })
  })

  describe('premium details text uses "estimate" language', () => {
    it('details text says "estimate" not "average" when benchmark is present', () => {
      mockGetBenchmark.mockReturnValue({
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY' as const,
        year: 2026,
        source: 'Indicative',
        dataDate: CURRENT_DATA_DATE,
      })

      const result = evaluatePolicy(makePolicy({ premium: 8000, coverage: 500000 }))

      // Details should use "estimate" rather than asserting market "average"
      expect(result.scoreBreakdown.premium.details.toLowerCase()).toContain('estimate')
    })

    it('Turkish details text says "tahmini" (estimate)', () => {
      mockGetBenchmark.mockReturnValue({
        insuranceType: 'kasko',
        minPremium: 5000,
        avgPremium: 10000,
        maxPremium: 20000,
        currency: 'TRY' as const,
        year: 2026,
        source: 'Indicative',
        dataDate: CURRENT_DATA_DATE,
      })

      const result = evaluatePolicy(makePolicy({ premium: 8000, coverage: 500000 }))

      expect(result.scoreBreakdown.premium.detailsTR.toLowerCase()).toContain('tahmin')
    })
  })

  describe('premium below avgPremium still caps at 75', () => {
    it('premium significantly below avgPremium does not exceed 75', () => {
      mockGetBenchmark.mockReturnValue({
        insuranceType: 'kasko',
        minPremium: 3000,
        avgPremium: 15000,
        maxPremium: 30000,
        currency: 'TRY' as const,
        year: 2026,
        source: 'Indicative estimate',
        dataDate: CURRENT_DATA_DATE,
      })

      // Premium at 4000 is well below avg of 15000 — uncapped would be ~93
      const result = evaluatePolicy(makePolicy({ premium: 4000, coverage: 500000 }))

      expect(result.scoreBreakdown.premium.score).toBeLessThanOrEqual(75)
      expect(result.scoreBreakdown.premium.score).toBeGreaterThan(0)
    })
  })
})
