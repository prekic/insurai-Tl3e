/**
 * Tests for benchmark freshness governance
 *
 * Verifies that benchmark data age affects confidence level, issue language,
 * and disclaimer text. Stale data downgrades confidence and replaces
 * definitive language with hedged/historical wording.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluatePolicy } from '../evaluator'
import type { Policy } from '@/types/policy'

// Mock benchmark service
vi.mock('../benchmark-service', () => ({
  getPremiumBenchmarkWithFallback: vi.fn(),
  isValueBasedBenchmark: vi.fn(),
  evaluateValueBasedPremium: vi.fn(),
}))

import { getPremiumBenchmarkWithFallback, isValueBasedBenchmark } from '../benchmark-service'

// Mock data imports
vi.mock('@/data', () => ({
  getBranchStatistics: vi.fn().mockReturnValue({
    branchCode: 'kara_araclari',
    branchName: 'Kara Araçları',
    totalPremium: 50000000000,
    totalPolicies: 12000000,
    avgPremium: 5000,
    claimsRatio: 0.72,
    growth: 0.15,
  }),
  getCurrentTrafficLimits: vi.fn().mockReturnValue({ year: 2026, limits: [] }),
  getCurrentDaskLimits: vi.fn().mockReturnValue(undefined),
  MARKET_DATA_2024: {
    averagePremiums: { kasko: 8000, traffic: 3000, home: 2000, health: 5000 },
  },
  DASK_PREMIUM_RATES_2026: [],
}))

const STALE_BENCHMARK = {
  insuranceType: 'kasko',
  minPremium: 3000,
  avgPremium: 8000,
  maxPremium: 15000,
  currency: 'TRY' as const,
  year: 2024,
  source: 'TSB',
  comparisonMethod: 'direct_premium' as const,
  dataDate: '2024-12-01',
}

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'test-1',
    policyNumber: 'POL-001',
    provider: 'Allianz',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 200000,
    premium: 6000,
    deductible: 2000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [
      { name: 'Collision', nameTr: 'Çarpma', limit: 200000, deductible: 2000, included: true },
    ],
    exclusions: [],
    aiInsights: [],
    vehicleInfo: { vehicleClass: 'sedan', year: 2024 },
    location: 'İstanbul',
    ...overrides,
  } as Policy
}

function recentDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().split('T')[0]
}

function mockBenchmarkWithDate(dataDate: string) {
  vi.mocked(getPremiumBenchmarkWithFallback).mockReturnValue({ ...STALE_BENCHMARK, dataDate })
}

describe('Benchmark Freshness Governance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPremiumBenchmarkWithFallback).mockReturnValue(STALE_BENCHMARK)
    vi.mocked(isValueBasedBenchmark).mockReturnValue(false)
  })

  describe('freshness computation', () => {
    it('marks data within 180 days as "current"', () => {
      mockBenchmarkWithDate(recentDate(90))
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('current')
      expect(result.benchmarkConfidence?.dataAgeDays).toBeGreaterThanOrEqual(89)
      expect(result.benchmarkConfidence?.dataAgeDays).toBeLessThanOrEqual(91)
    })

    it('marks data between 181-365 days as "aging"', () => {
      mockBenchmarkWithDate(recentDate(250))
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('aging')
    })

    it('marks data over 365 days as "stale"', () => {
      // Default STALE_BENCHMARK has dataDate: '2024-12-01' (~16 months old)
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('stale')
      expect(result.benchmarkConfidence?.dataAsOf).toBe('2024-12-01')
      expect(result.benchmarkConfidence?.dataAgeDays).toBeGreaterThan(365)
    })

    it('treats missing dataDate as stale', () => {
      vi.mocked(getPremiumBenchmarkWithFallback).mockReturnValue({
        ...STALE_BENCHMARK,
        dataDate: undefined,
      })
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('stale')
    })

    it('treats invalid dataDate as stale', () => {
      vi.mocked(getPremiumBenchmarkWithFallback).mockReturnValue({
        ...STALE_BENCHMARK,
        dataDate: 'not-a-date',
      })
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('stale')
    })

    it('populates dataAsOf from benchmark dataDate', () => {
      const date = recentDate(90)
      mockBenchmarkWithDate(date)
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.dataAsOf).toBe(date)
    })
  })

  describe('confidence downgrade when stale', () => {
    it('downgrades "high" to "low" when stale', () => {
      // 4 context factors (provider, coverage, vehicleInfo, location) → high
      // Stale data → downgraded to low
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('stale')
      expect(result.benchmarkConfidence?.level).toBe('low')
    })

    it('downgrades "low" to "suppressed" when stale', () => {
      // Only 1 context factor (provider) → low → stale downgrades to suppressed
      const result = evaluatePolicy(
        makePolicy({
          coverage: 0,
          vehicleInfo: undefined as never,
          location: '' as never,
        })
      )
      expect(result.benchmarkConfidence?.freshness).toBe('stale')
      expect(result.benchmarkConfidence?.level).toBe('suppressed')
    })

    it('does not downgrade if data is current', () => {
      mockBenchmarkWithDate(recentDate(30))
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('current')
      expect(result.benchmarkConfidence?.level).toBe('high')
    })

    it('does not downgrade if data is aging', () => {
      mockBenchmarkWithDate(recentDate(250))
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('aging')
      expect(result.benchmarkConfidence?.level).toBe('high')
    })
  })

  describe('stale language gating in issues', () => {
    it('uses hedged language when stale and premium is significantly above average', () => {
      const result = evaluatePolicy(makePolicy({ premium: 14000 }))
      const premiumIssues = result.scoreBreakdown.premium.issues
      const hasHistorical = premiumIssues.some((i) => i.includes('historical'))
      expect(hasHistorical).toBe(true)
    })

    it('uses hedged language when stale and premium exceeds maximum', () => {
      const result = evaluatePolicy(makePolicy({ premium: 20000 }))
      const premiumIssues = result.scoreBreakdown.premium.issues
      const hasHistorical = premiumIssues.some(
        (i) => i.includes('historical') && i.includes('updated validation recommended')
      )
      expect(hasHistorical).toBe(true)
    })

    it('uses normal language when data is current', () => {
      mockBenchmarkWithDate(recentDate(30))
      const result = evaluatePolicy(makePolicy({ premium: 14000 }))
      const premiumIssues = result.scoreBreakdown.premium.issues
      const hasHistorical = premiumIssues.some((i) => i.includes('historical'))
      expect(hasHistorical).toBe(false)
    })
  })

  describe('disclaimer text varies by freshness', () => {
    it('includes "historical reference only" when stale', () => {
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkDisclaimer).toContain('historical reference only')
      expect(result.benchmarkDisclaimer).toContain('2024-12-01')
    })

    it('includes data date when aging', () => {
      const agingDate = recentDate(250)
      mockBenchmarkWithDate(agingDate)
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkDisclaimer).toContain(agingDate)
    })

    it('uses standard disclaimer when current', () => {
      mockBenchmarkWithDate(recentDate(30))
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkDisclaimer).toContain('Market averages are estimates')
    })
  })

  describe('boundary cases', () => {
    it('exactly at aging threshold (180 days) is "current"', () => {
      mockBenchmarkWithDate(recentDate(180))
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('current')
    })

    it('exactly at stale threshold (365 days) is "aging"', () => {
      mockBenchmarkWithDate(recentDate(365))
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('aging')
    })

    it('one day past stale threshold is "stale"', () => {
      mockBenchmarkWithDate(recentDate(366))
      const result = evaluatePolicy(makePolicy())
      expect(result.benchmarkConfidence?.freshness).toBe('stale')
    })
  })
})
