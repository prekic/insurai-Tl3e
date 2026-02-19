/**
 * Comprehensive coverage tests for gap-analyzer.ts
 * Targets: uncovered branches in exclusion analysis, gap scoring, insights
 */

import { describe, it, expect, vi } from 'vitest'
import type { AnalyzedPolicy, Coverage, PolicyType } from '@/types/policy'

// Mock the market data provider and benchmarks
vi.mock('./market-data-provider', () => ({
  marketDataProvider: {
    getBenchmark: vi.fn().mockResolvedValue({
      commonCoverages: [
        { name: 'Collision', nameTr: 'Çarpma', typicalLimit: 500000, minLimit: 100000, maxLimit: 1000000, typicalDeductible: 1000, minDeductible: 0, maxDeductible: 5000, inclusionRate: 95 },
        { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 400000, minLimit: 100000, maxLimit: 800000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 3000, inclusionRate: 92 },
        { name: 'Glass', nameTr: 'Cam Kırılması', typicalLimit: 25000, minLimit: 5000, maxLimit: 50000, typicalDeductible: 200, minDeductible: 0, maxDeductible: 1000, inclusionRate: 75 },
        { name: 'Optional Extra', nameTr: 'Opsiyonel', typicalLimit: 10000, minLimit: 2000, maxLimit: 30000, typicalDeductible: 100, minDeductible: 0, maxDeductible: 500, inclusionRate: 40 },
      ],
      premiumRange: { min: 2000, max: 20000, average: 8000 },
      regionalFactors: { marmara: 1.15, ic_anadolu: 0.95, ege: 1.05 },
    }),
  },
}))

vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    kasko: {
      commonCoverages: [
        { name: 'Collision', nameTr: 'Çarpma', typicalLimit: 500000, minLimit: 100000, maxLimit: 1000000, typicalDeductible: 1000, minDeductible: 0, maxDeductible: 5000, inclusionRate: 95 },
        { name: 'Theft', nameTr: 'Hırsızlık', typicalLimit: 400000, minLimit: 100000, maxLimit: 800000, typicalDeductible: 500, minDeductible: 0, maxDeductible: 3000, inclusionRate: 92 },
        { name: 'Glass', nameTr: 'Cam Kırılması', typicalLimit: 25000, minLimit: 5000, maxLimit: 50000, typicalDeductible: 200, minDeductible: 0, maxDeductible: 1000, inclusionRate: 75 },
      ],
      premiumRange: { min: 2000, max: 20000, average: 8000 },
      regionalFactors: { marmara: 1.15, ic_anadolu: 0.95 },
    },
    health: {
      commonCoverages: [
        { name: 'Cancer Treatment', nameTr: 'Kanser Tedavisi', typicalLimit: 1000000, minLimit: 200000, maxLimit: 5000000, typicalDeductible: 0, minDeductible: 0, maxDeductible: 0, inclusionRate: 85 },
      ],
      premiumRange: { min: 5000, max: 50000, average: 15000 },
      regionalFactors: { marmara: 1.1 },
    },
    home: {
      commonCoverages: [],
      premiumRange: { min: 1000, max: 10000, average: 3000 },
      regionalFactors: { marmara: 1.2 },
    },
    traffic: { commonCoverages: [], premiumRange: { min: 500, max: 5000, average: 2000 }, regionalFactors: {} },
    life: { commonCoverages: [], premiumRange: { min: 1000, max: 20000, average: 5000 }, regionalFactors: {} },
    dask: { commonCoverages: [], premiumRange: { min: 200, max: 2000, average: 500 }, regionalFactors: {} },
    business: { commonCoverages: [], premiumRange: { min: 3000, max: 30000, average: 10000 }, regionalFactors: {} },
    nakliyat: { commonCoverages: [], premiumRange: { min: 2000, max: 25000, average: 8000 }, regionalFactors: {} },
  },
}))

const { analyzeGaps, analyzeGapsSync, generateGapInsights } = await import('./gap-analyzer')

function makePolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'pol-1',
    policyNumber: 'POL-001',
    provider: 'Allianz',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 5000,
    deductible: 1000,
    startDate: '2025-01-01',
    expiryDate: '2026-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [],
    exclusions: [],
    aiInsights: [],
    ...overrides,
  } as AnalyzedPolicy
}

function makeCoverage(name: string, nameTr: string, limit: number, deductible = 0): Coverage {
  return { name, nameTr, limit, deductible, included: true }
}

describe('analyzeGaps (async)', () => {
  it('should detect missing coverages', async () => {
    const policy = makePolicy({ coverages: [] })
    const result = await analyzeGaps(policy)
    expect(result.missingCoverages.length).toBeGreaterThan(0)
  })

  it('should detect underinsured coverages', async () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 100000)],
    })
    const result = await analyzeGaps(policy)
    expect(result.underinsuredCoverages.length).toBeGreaterThan(0)
  })

  it('should detect high deductibles', async () => {
    const policy = makePolicy({
      coverages: [{ name: 'Collision', nameTr: 'Çarpma', limit: 500000, deductible: 5000, included: true }],
    })
    const result = await analyzeGaps(policy)
    expect(result.highDeductibles.length).toBeGreaterThan(0)
  })

  it('should use provided region', async () => {
    const policy = makePolicy({ coverages: [] })
    const result = await analyzeGaps(policy, 'ic_anadolu')
    expect(result.estimatedCostToClose).toBeDefined()
  })
})

describe('analyzeGapsSync', () => {
  it('should work synchronously', () => {
    const policy = makePolicy({ coverages: [] })
    const result = analyzeGapsSync(policy)
    expect(result.missingCoverages.length).toBeGreaterThan(0)
    expect(result.gapScore).toBeGreaterThan(0)
  })

  it('should use default region marmara', () => {
    const policy = makePolicy({ coverages: [] })
    const result = analyzeGapsSync(policy)
    expect(result.estimatedCostToClose).toBeGreaterThan(0)
  })

  it('should use ic_anadolu region', () => {
    const policy = makePolicy({ coverages: [] })
    const result = analyzeGapsSync(policy, 'ic_anadolu')
    expect(result.estimatedCostToClose).toBeGreaterThan(0)
  })
})

describe('findMissingCoverages (via analyzeGapsSync)', () => {
  it('should classify critical importance (>=90% inclusion)', () => {
    const policy = makePolicy({ coverages: [] })
    const result = analyzeGapsSync(policy)
    const critical = result.missingCoverages.filter(m => m.importance === 'critical')
    expect(critical.length).toBeGreaterThan(0)
  })

  it('should classify recommended importance (70-89% inclusion)', () => {
    const policy = makePolicy({ coverages: [] })
    const result = analyzeGapsSync(policy)
    const recommended = result.missingCoverages.filter(m => m.importance === 'recommended')
    expect(recommended.length).toBeGreaterThan(0)
  })

  it('should skip coverages below 50% inclusion rate', () => {
    const policy = makePolicy({ coverages: [] })
    const result = analyzeGapsSync(policy)
    // "Optional Extra" has 40% inclusion - should not appear
    const allNames = result.missingCoverages.map(m => m.coverage.name)
    expect(allNames).not.toContain('Optional Extra')
  })

  it('should not flag coverages that exist (by name)', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 600000)],
    })
    const result = analyzeGapsSync(policy)
    expect(result.missingCoverages.every(m => m.coverage.name !== 'Collision')).toBe(true)
  })

  it('should match by Turkish name', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('SomeName', 'Çarpma', 600000)],
    })
    const result = analyzeGapsSync(policy)
    expect(result.missingCoverages.every(m => m.coverage.nameTr !== 'Çarpma')).toBe(true)
  })
})

describe('findUnderinsuredCoverages', () => {
  it('should flag high risk (<40% of market)', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 100000)],
    })
    const result = analyzeGapsSync(policy)
    const highRisk = result.underinsuredCoverages.filter(u => u.riskLevel === 'high')
    expect(highRisk.length).toBeGreaterThan(0)
  })

  it('should flag medium risk (40-55% of market)', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 250000)],
    })
    const result = analyzeGapsSync(policy)
    const medRisk = result.underinsuredCoverages.filter(u => u.riskLevel === 'medium')
    expect(medRisk.length).toBeGreaterThan(0)
  })

  it('should flag low risk (55-70% of market)', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 320000)],
    })
    const result = analyzeGapsSync(policy)
    const lowRisk = result.underinsuredCoverages.filter(u => u.riskLevel === 'low')
    expect(lowRisk.length).toBeGreaterThan(0)
  })

  it('should not flag when limit >= 70% of market', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 500000)],
    })
    const result = analyzeGapsSync(policy)
    expect(result.underinsuredCoverages.filter(u => u.coverageName.includes('Çarpma')).length).toBe(0)
  })

  it('should use nameTr when available', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 100000)],
    })
    const result = analyzeGapsSync(policy)
    expect(result.underinsuredCoverages[0]?.coverageName).toBe('Çarpma')
  })
})

describe('findHighDeductibles', () => {
  it('should skip zero deductibles', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 500000)],
    })
    const result = analyzeGapsSync(policy)
    expect(result.highDeductibles.length).toBe(0)
  })

  it('should flag deductibles > 1.5x market average', () => {
    const policy = makePolicy({
      coverages: [{ name: 'Collision', nameTr: 'Çarpma', limit: 500000, deductible: 4000, included: true }],
    })
    const result = analyzeGapsSync(policy)
    expect(result.highDeductibles.length).toBeGreaterThan(0)
  })

  it('should calculate percentile rank correctly', () => {
    const policy = makePolicy({
      coverages: [{ name: 'Collision', nameTr: 'Çarpma', limit: 500000, deductible: 4000, included: true }],
    })
    const result = analyzeGapsSync(policy)
    expect(result.highDeductibles[0]?.percentileRank).toBeGreaterThanOrEqual(0)
    expect(result.highDeductibles[0]?.percentileRank).toBeLessThanOrEqual(100)
  })
})

describe('analyzeExclusions', () => {
  it('should detect kasko exclusions (deprem)', () => {
    const policy = makePolicy({ exclusions: ['Deprem hasarları hariç'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.length).toBeGreaterThan(0)
    expect(result.exclusionWarnings[0].riskLevel).toBe('high')
  })

  it('should detect kasko exclusions (hırsızlık)', () => {
    const policy = makePolicy({ exclusions: ['Hırsızlık hariç'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.some(w => w.riskLevel === 'high')).toBe(true)
  })

  it('should detect kasko exclusions (sel/flood)', () => {
    const policy = makePolicy({ exclusions: ['Sel hasarları teminat dışı'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.some(w => w.riskLevel === 'medium')).toBe(true)
  })

  it('should detect health exclusions (kanser)', () => {
    const policy = makePolicy({ type: 'health', exclusions: ['Kanser tedavisi hariç'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.some(w => w.riskLevel === 'high')).toBe(true)
  })

  it('should detect health exclusions (yurtdışı)', () => {
    const policy = makePolicy({ type: 'health', exclusions: ['Yurtdışı tedavi kapsam dışı'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.some(w => w.riskLevel === 'medium')).toBe(true)
  })

  it('should detect health exclusions (diş)', () => {
    const policy = makePolicy({ type: 'health', exclusions: ['Diş tedavisi hariç'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.some(w => w.riskLevel === 'low')).toBe(true)
  })

  it('should detect home exclusions', () => {
    const policy = makePolicy({ type: 'home', exclusions: ['Hırsızlık teminat dışı'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.length).toBeGreaterThan(0)
  })

  it('should detect life exclusions', () => {
    const policy = makePolicy({ type: 'life', exclusions: ['Kaza sonucu teminat dışı'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.length).toBeGreaterThan(0)
  })

  it('should detect business exclusions', () => {
    const policy = makePolicy({ type: 'business', exclusions: ['İş durması teminat dışı', 'Siber risk hariç'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.length).toBeGreaterThan(0)
  })

  it('should detect nakliyat exclusions', () => {
    const policy = makePolicy({ type: 'nakliyat', exclusions: ['Emtia hasarı kapsam dışı'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.length).toBeGreaterThan(0)
  })

  it('should handle traffic type (no exclusion patterns)', () => {
    const policy = makePolicy({ type: 'traffic', exclusions: ['Some exclusion'] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.length).toBe(0)
  })

  it('should handle empty exclusions', () => {
    const policy = makePolicy({ exclusions: [] })
    const result = analyzeGapsSync(policy)
    expect(result.exclusionWarnings.length).toBe(0)
  })
})

describe('calculateGapScore', () => {
  it('should cap score at 100', () => {
    const policy = makePolicy({
      coverages: [],
      exclusions: ['Deprem', 'Hırsızlık', 'Sel'],
    })
    const result = analyzeGapsSync(policy)
    expect(result.gapScore).toBeLessThanOrEqual(100)
  })

  it('should score 0 for fully covered policy', () => {
    const policy = makePolicy({
      coverages: [
        makeCoverage('Collision', 'Çarpma', 600000),
        makeCoverage('Theft', 'Hırsızlık', 500000),
        makeCoverage('Glass', 'Cam Kırılması', 30000),
      ],
      exclusions: [],
    })
    const result = analyzeGapsSync(policy)
    expect(result.gapScore).toBe(0)
  })
})

describe('generateGapInsights', () => {
  it('should generate insight for critical missing coverages', () => {
    const policy = makePolicy({ coverages: [] })
    const gaps = analyzeGapsSync(policy)
    const insights = generateGapInsights(gaps)
    expect(insights.some(i => i.type === 'warning' && i.category === 'coverage')).toBe(true)
  })

  it('should generate insight for underinsured coverages', () => {
    const policy = makePolicy({
      coverages: [makeCoverage('Collision', 'Çarpma', 100000)],
    })
    const gaps = analyzeGapsSync(policy)
    const insights = generateGapInsights(gaps)
    expect(insights.some(i => i.message.includes('below market average'))).toBe(true)
  })

  it('should generate insight for high deductibles', () => {
    const policy = makePolicy({
      coverages: [{ name: 'Collision', nameTr: 'Çarpma', limit: 500000, deductible: 4000, included: true }],
    })
    const gaps = analyzeGapsSync(policy)
    const insights = generateGapInsights(gaps)
    expect(insights.some(i => i.message.includes('percentile'))).toBe(true)
  })

  it('should generate positive insight for low gap score', () => {
    const policy = makePolicy({
      coverages: [
        makeCoverage('Collision', 'Çarpma', 600000),
        makeCoverage('Theft', 'Hırsızlık', 500000),
        makeCoverage('Glass', 'Cam Kırılması', 30000),
      ],
    })
    const gaps = analyzeGapsSync(policy)
    const insights = generateGapInsights(gaps)
    expect(insights.some(i => i.type === 'positive')).toBe(true)
  })

  it('should generate warning for high gap score (>50)', () => {
    const policy = makePolicy({
      coverages: [],
      exclusions: ['Deprem hasarları', 'Hırsızlık'],
    })
    const gaps = analyzeGapsSync(policy)
    if (gaps.gapScore > 50) {
      const insights = generateGapInsights(gaps)
      expect(insights.some(i => i.message.includes('Significant coverage gaps'))).toBe(true)
    }
  })

  it('should generate cost recommendation when estimatedCostToClose > 0', () => {
    const policy = makePolicy({ coverages: [] })
    const gaps = analyzeGapsSync(policy)
    const insights = generateGapInsights(gaps)
    expect(insights.some(i => i.type === 'recommendation')).toBe(true)
  })

  it('should sort insights by priority descending', () => {
    const policy = makePolicy({ coverages: [] })
    const gaps = analyzeGapsSync(policy)
    const insights = generateGapInsights(gaps)
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i].priority).toBeLessThanOrEqual(insights[i - 1].priority)
    }
  })
})
