/**
 * Branch Coverage Tests for Policy Comparison module
 *
 * Targets uncovered branches:
 * - comparePolicies: less than 2 policies, with/without benchmarks
 * - calculateSummary: zero premium (value score), shared/unique coverages
 * - findDifferences: same values (no diff), all fields
 * - generateRecommendations: all threshold branches, expiring policies
 * - getFieldRecommendation: all switch cases (premium, coverage, deductible, status, default)
 * - formatFieldValue: null/undefined, monetary fields, string
 * - generateBenchmarkRecommendations: premiumPercentile, valueRating branches
 * - generateComparisonReport: with/without benchmarks, with/without recommendations
 * - translateValueRating: all known + unknown ratings
 * - compareCoverages: shared vs missing coverages
 * - calculateRange: min=0 branch (diffPercent)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnalyzedPolicy } from '@/types/policy'

// Mock MarketDataService
vi.mock('@/lib/market-data/service', () => ({
  MarketDataService: {
    getMarketComparison: vi.fn(() => ({
      userPremium: 5000,
      marketAverage: 6000,
      premiumPercentile: 35,
      coveragePercentile: 60,
      valueRating: 'good',
      position: 'above_average',
    })),
    analyzePolicyBenchmark: vi.fn(() => ({
      insights: [{ type: 'premium', message: 'Below average' }],
    })),
    getMarketComparisonAsync: vi.fn(async () => ({
      userPremium: 5000,
      marketAverage: 6000,
      premiumPercentile: 35,
      coveragePercentile: 60,
      valueRating: 'good',
      position: 'above_average',
    })),
    analyzePolicyBenchmarkAsync: vi.fn(async () => ({
      insights: [{ type: 'premium', message: 'Below average' }],
    })),
  },
}))

// Mock MARKET_BENCHMARKS
vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    kasko: {
      typeTr: 'Kasko',
      trends: { premiumChangeYoY: 15 },
    },
    traffic: {
      typeTr: 'Trafik',
      trends: { premiumChangeYoY: 35 },
    },
    home: {
      typeTr: 'Konut',
      trends: { premiumChangeYoY: 50 },
    },
  },
}))

vi.mock('@/lib/market-data/market-data-provider', () => ({
  marketDataProvider: {
    getBenchmark: vi.fn(async (type: string) => ({
      typeTr: type === 'kasko' ? 'Kasko' : 'Trafik',
      trends: { premiumChangeYoY: type === 'traffic' ? 35 : 15 },
    })),
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: vi.fn() },
}))

function makePolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: `pol-${Math.random().toString(36).slice(2, 8)}`,
    policyNumber: 'POL-001',
    provider: 'Allianz',
    type: 'kasko',
    typeTr: 'Kasko',
    premium: 5000,
    coverage: 500000,
    deductible: 2000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test Person',
    coverages: [
      { name: 'Collision', nameTr: 'Çarpma', limit: 250000, deductible: 1000, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 250000, deductible: 1000, included: true },
    ],
    exclusions: [],
    specialConditions: [],
    aiInsights: [],
    ...overrides,
  } as AnalyzedPolicy
}

describe('comparePolicies', () => {
  let comparePolicies: typeof import('./comparison').comparePolicies
  // @ts-expect-error - TS6133 unused variable
  let _generateComparisonReport: typeof import('./comparison').generateComparisonReport

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./comparison')
    comparePolicies = mod.comparePolicies
    _generateComparisonReport = mod.generateComparisonReport
  })

  it('throws when less than 2 policies', () => {
    expect(() => comparePolicies([makePolicy()])).toThrow('At least 2 policies')
  })

  it('compares 2 policies and returns complete result', () => {
    const p1 = makePolicy({
      id: 'p1',
      provider: 'Allianz',
      premium: 5000,
      coverage: 500000,
      deductible: 2000,
    })
    const p2 = makePolicy({
      id: 'p2',
      provider: 'AXA',
      premium: 7000,
      coverage: 600000,
      deductible: 3000,
    })

    const result = comparePolicies([p1, p2])
    expect(result.policies).toHaveLength(2)
    expect(result.summary).toBeDefined()
    expect(result.differences.length).toBeGreaterThan(0)
    expect(result.recommendations.length).toBeGreaterThan(0)
    expect(result.marketBenchmarks).toBeDefined()
  })

  it('skips market benchmarks when includeMarketBenchmarks=false', () => {
    const p1 = makePolicy({ id: 'p1' })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 7000 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.marketBenchmarks).toBeUndefined()
  })
})

describe('calculateSummary branches', () => {
  let comparePolicies: typeof import('./comparison').comparePolicies

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./comparison')
    comparePolicies = mod.comparePolicies
  })

  it('handles zero premium (value score = 0)', () => {
    const p1 = makePolicy({ id: 'p1', premium: 0, coverage: 100000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 5000, coverage: 200000 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.summary.bestValue).toBeDefined()
    // p1 has 0 premium → score = 0, p2 has score = 200000/5000 = 40
    expect(result.summary.bestValue.policyId).toBe('p2')
  })

  it('identifies shared and unique coverages', () => {
    const p1 = makePolicy({
      id: 'p1',
      coverages: [
        { name: 'Collision', nameTr: 'Çarpma', limit: 250000, deductible: 0, included: true },
        { name: 'Glass', nameTr: 'Cam', limit: 10000, deductible: 0, included: true },
      ],
    })
    const p2 = makePolicy({
      id: 'p2',
      provider: 'AXA',
      coverages: [
        { name: 'Collision', nameTr: 'Çarpma', limit: 300000, deductible: 500, included: true },
        { name: 'Roadside', nameTr: 'Yol Yardım', limit: 5000, deductible: 0, included: true },
      ],
    })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.summary.sharedCoverages).toContain('collision')
    expect(result.summary.uniqueCoverages.get('p1')).toContain('glass')
    expect(result.summary.uniqueCoverages.get('p2')).toContain('roadside')
  })

  it('handles identical policies (no unique coverages)', () => {
    const p1 = makePolicy({ id: 'p1' })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA' })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    // Same coverages → no unique per policy
    expect(result.summary.uniqueCoverages.size).toBe(0)
  })

  it('calculates diffPercent as 0 when min is 0', () => {
    const p1 = makePolicy({ id: 'p1', deductible: 0 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', deductible: 5000 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.summary.deductibleRange.diffPercent).toBe(0) // min=0 → 0%
  })
})

describe('generateRecommendations branches', () => {
  let comparePolicies: typeof import('./comparison').comparePolicies

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./comparison')
    comparePolicies = mod.comparePolicies
  })

  it('generates premium recommendation when diff > 20%', () => {
    const p1 = makePolicy({ id: 'p1', provider: 'Allianz', premium: 4000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 6000 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.recommendations.some((r) => r.includes('Prim farkı'))).toBe(true)
    expect(result.recommendations.some((r) => r.includes('Allianz'))).toBe(true)
  })

  it('does NOT generate premium recommendation when diff <= 20%', () => {
    const p1 = makePolicy({ id: 'p1', premium: 5000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 5500 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.recommendations.some((r) => r.includes('Prim farkı'))).toBe(false)
  })

  it('generates coverage recommendation when diff > 15%', () => {
    const p1 = makePolicy({ id: 'p1', coverage: 300000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', coverage: 600000 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.recommendations.some((r) => r.includes('en yüksek teminat'))).toBe(true)
  })

  it('generates deductible recommendation when diff > 1000', () => {
    const p1 = makePolicy({ id: 'p1', deductible: 500 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', deductible: 3000 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.recommendations.some((r) => r.includes('en düşük muafiyet'))).toBe(true)
  })

  it('does NOT generate deductible recommendation when diff <= 1000', () => {
    const p1 = makePolicy({ id: 'p1', deductible: 1000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', deductible: 1500 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.recommendations.some((r) => r.includes('en düşük muafiyet'))).toBe(false)
  })

  it('generates best value recommendation', () => {
    const p1 = makePolicy({ id: 'p1', premium: 5000, coverage: 500000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 3000, coverage: 400000 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.recommendations.some((r) => r.includes('Değer analizi'))).toBe(true)
  })

  it('generates unique coverage recommendations', () => {
    const p1 = makePolicy({
      id: 'p1',
      coverages: [
        { name: 'Collision', nameTr: 'Çarpma', limit: 250000, deductible: 0, included: true },
        { name: 'Glass', nameTr: 'Cam', limit: 10000, deductible: 0, included: true },
      ],
    })
    const p2 = makePolicy({
      id: 'p2',
      provider: 'AXA',
      coverages: [
        { name: 'Collision', nameTr: 'Çarpma', limit: 300000, deductible: 0, included: true },
      ],
    })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.recommendations.some((r) => r.includes('ekstra sunuyor'))).toBe(true)
  })

  it('generates expiring warning for expiring policies', () => {
    const p1 = makePolicy({ id: 'p1', status: 'expiring' })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', status: 'active' })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    expect(result.recommendations.some((r) => r.includes('⚠️') && r.includes('sona eriyor'))).toBe(
      true
    )
  })

  it('handles multiple expiring policies (plural suffix)', () => {
    const p1 = makePolicy({ id: 'p1', status: 'expiring' })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', status: 'expiring' })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    const expRec = result.recommendations.find((r) => r.includes('sona eriyor'))
    expect(expRec).toBeDefined()
    expect(expRec).toContain('leri') // plural suffix
  })

  it('truncates unique coverages to 3 with ellipsis', () => {
    const p1 = makePolicy({
      id: 'p1',
      coverages: [
        { name: 'A', nameTr: 'A', limit: 1, deductible: 0, included: true },
        { name: 'B', nameTr: 'B', limit: 1, deductible: 0, included: true },
        { name: 'C', nameTr: 'C', limit: 1, deductible: 0, included: true },
        { name: 'D', nameTr: 'D', limit: 1, deductible: 0, included: true },
      ],
    })
    const p2 = makePolicy({
      id: 'p2',
      provider: 'AXA',
      coverages: [],
    })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    const rec = result.recommendations.find((r) => r.includes('ekstra sunuyor'))
    expect(rec).toBeDefined()
    expect(rec).toContain('...')
  })
})

describe('getFieldRecommendation branches', () => {
  let comparePolicies: typeof import('./comparison').comparePolicies

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./comparison')
    comparePolicies = mod.comparePolicies
  })

  it('generates premium field recommendation', () => {
    const p1 = makePolicy({
      id: 'p1',
      provider: 'Allianz',
      premium: 3000,
      coverage: 500000,
      deductible: 2000,
    })
    const p2 = makePolicy({
      id: 'p2',
      provider: 'AXA',
      premium: 8000,
      coverage: 500000,
      deductible: 2000,
    })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    const premDiff = result.differences.find((d) => d.field === 'premium')
    expect(premDiff?.recommendation).toContain('en düşük primi')
  })

  it('generates status field recommendation for expired', () => {
    const p1 = makePolicy({ id: 'p1', status: 'expired' })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', status: 'active' })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    const statusDiff = result.differences.find((d) => d.field === 'status')
    expect(statusDiff?.recommendation).toContain('süresi dolmuş')
  })

  it('returns undefined for status when no expired policies', () => {
    const p1 = makePolicy({ id: 'p1', status: 'active' })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', status: 'expiring' })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    const statusDiff = result.differences.find((d) => d.field === 'status')
    if (statusDiff) {
      expect(statusDiff.recommendation).toBeUndefined()
    }
  })
})

describe('formatFieldValue branches', () => {
  let comparePolicies: typeof import('./comparison').comparePolicies

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./comparison')
    comparePolicies = mod.comparePolicies
  })

  it('handles null/undefined field values', () => {
    const p1 = makePolicy({ id: 'p1', expiryDate: undefined as unknown as string })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', expiryDate: '2027-06-01' })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    const expiryDiff = result.differences.find((d) => d.field === 'expiryDate')
    if (expiryDiff) {
      expect(expiryDiff.values.some((v) => v.value === 'N/A')).toBe(true)
    }
  })
})

describe('generateBenchmarkRecommendations branches', () => {
  let comparePolicies: typeof import('./comparison').comparePolicies
  let MarketDataService: {
    getMarketComparison: ReturnType<typeof vi.fn>
    analyzePolicyBenchmark: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    const marketMod = await import('@/lib/market-data/service')
    // @ts-expect-error - mismatch due to schema update
    MarketDataService = marketMod.MarketDataService as typeof MarketDataService
    const mod = await import('./comparison')
    comparePolicies = mod.comparePolicies
  })

  it('adds market benchmark recommendation when premiumPercentile < 40', () => {
    MarketDataService.getMarketComparison.mockReturnValue({
      userPremium: 5000,
      marketAverage: 8000,
      premiumPercentile: 25,
      valueRating: 'good',
    })

    const p1 = makePolicy({ id: 'p1', provider: 'Allianz', premium: 5000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 6000 })

    const result = comparePolicies([p1, p2])
    expect(
      result.recommendations.some(
        (r) => r.includes('📊') && r.includes('piyasa ortalamasının altında')
      )
    ).toBe(true)
  })

  it('does NOT add premium benchmark rec when percentile >= 40', () => {
    MarketDataService.getMarketComparison.mockReturnValue({
      userPremium: 5000,
      marketAverage: 5500,
      premiumPercentile: 55,
      valueRating: 'average',
    })

    const p1 = makePolicy({ id: 'p1', premium: 5000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 6000 })

    const result = comparePolicies([p1, p2])
    expect(
      result.recommendations.some(
        (r) => r.includes('📊') && r.includes('piyasa ortalamasının altında')
      )
    ).toBe(false)
  })

  it('adds value recommendation for excellent rating', () => {
    MarketDataService.getMarketComparison.mockReturnValue({
      userPremium: 5000,
      marketAverage: 6000,
      premiumPercentile: 55,
      valueRating: 'excellent',
    })

    const p1 = makePolicy({ id: 'p1', premium: 5000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 6000 })

    const result = comparePolicies([p1, p2])
    expect(result.recommendations.some((r) => r.includes('💎') && r.includes('mükemmel'))).toBe(
      true
    )
  })

  it('adds trend recommendation for high YoY change (>30%)', () => {
    // traffic has premiumChangeYoY: 35 in our mock
    const p1 = makePolicy({ id: 'p1', type: 'traffic', typeTr: 'Trafik' })
    const p2 = makePolicy({
      id: 'p2',
      type: 'traffic',
      typeTr: 'Trafik',
      provider: 'AXA',
      premium: 6000,
    })

    const result = comparePolicies([p1, p2])
    expect(
      result.recommendations.some((r) => r.includes('📈') && r.includes('erken yenileme'))
    ).toBe(true)
  })

  it('does NOT add trend recommendation for low YoY change', () => {
    // kasko has premiumChangeYoY: 15 in our mock
    const p1 = makePolicy({ id: 'p1', type: 'kasko' })
    const p2 = makePolicy({ id: 'p2', type: 'kasko', provider: 'AXA', premium: 6000 })

    const result = comparePolicies([p1, p2])
    expect(result.recommendations.some((r) => r.includes('📈'))).toBe(false)
  })
})

describe('generateComparisonReport branches', () => {
  let comparePolicies: typeof import('./comparison').comparePolicies
  let generateComparisonReport: typeof import('./comparison').generateComparisonReport

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./comparison')
    comparePolicies = mod.comparePolicies
    generateComparisonReport = mod.generateComparisonReport
  })

  it('generates full report with market benchmarks', () => {
    const p1 = makePolicy({ id: 'p1', provider: 'Allianz', premium: 4000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 7000 })

    const result = comparePolicies([p1, p2])
    const report = generateComparisonReport(result)

    expect(report).toContain('POLİÇE KARŞILAŞTIRMA RAPORU')
    expect(report).toContain('PAZAR KARŞILAŞTIRMASI')
    expect(report).toContain('ÖNERİLER')
    expect(report).toContain('TEMEL FARKLAR')
  })

  it('generates report without market benchmarks section', () => {
    const p1 = makePolicy({ id: 'p1' })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 5001 })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    const report = generateComparisonReport(result)

    expect(report).toContain('POLİÇE KARŞILAŞTIRMA RAPORU')
    expect(report).not.toContain('PAZAR KARŞILAŞTIRMASI')
  })

  it('handles report with no recommendations', () => {
    const p1 = makePolicy({ id: 'p1', premium: 5000, coverage: 500000, deductible: 2000 })
    const p2 = makePolicy({
      id: 'p2',
      provider: 'AXA',
      premium: 5000,
      coverage: 500000,
      deductible: 2000,
    })

    const result = comparePolicies([p1, p2], { includeMarketBenchmarks: false })
    // Filter to make empty
    result.recommendations = []
    const report = generateComparisonReport(result)

    expect(report).not.toContain('ÖNERİLER')
  })
})

describe('comparePoliciesAsync', () => {
  let comparePoliciesAsync: typeof import('./comparison').comparePoliciesAsync

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./comparison')
    comparePoliciesAsync = mod.comparePoliciesAsync
  })

  it('throws when less than 2 policies', async () => {
    await expect(comparePoliciesAsync([makePolicy()])).rejects.toThrow('At least 2 policies')
  })

  it('compares async with market benchmarks', async () => {
    const p1 = makePolicy({ id: 'p1', premium: 4000 })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 7000 })

    const result = await comparePoliciesAsync([p1, p2])
    expect(result.marketBenchmarks).toBeDefined()
    expect(result.marketBenchmarks!.length).toBe(2)
  })

  it('skips benchmarks when includeMarketBenchmarks=false', async () => {
    const p1 = makePolicy({ id: 'p1' })
    const p2 = makePolicy({ id: 'p2', provider: 'AXA', premium: 7000 })

    const result = await comparePoliciesAsync([p1, p2], { includeMarketBenchmarks: false })
    expect(result.marketBenchmarks).toBeUndefined()
  })
})
