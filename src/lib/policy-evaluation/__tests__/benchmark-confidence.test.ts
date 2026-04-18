/**
 * Benchmark Confidence Regression Tests
 *
 * Validates that the benchmark comparison system:
 * 1. Tracks which context factors are present/missing
 * 2. Downgrades confidence when factors are missing
 * 3. Suppresses comparison entirely when data is too weak
 * 4. Never produces a precise "68% above average" from weak data
 * 5. Qualifies low-confidence comparisons in score details
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the benchmark service
vi.mock('../benchmark-service', () => ({
  getPremiumBenchmarkWithFallback: vi.fn(),
  isValueBasedBenchmark: vi.fn().mockReturnValue(false),
  evaluateValueBasedPremium: vi.fn(),
}))

// Mock data imports
vi.mock('@/data', () => ({
  getBranchStatistics: vi.fn().mockReturnValue({}),
  getCurrentTrafficLimits: vi.fn().mockReturnValue({}),
  getCurrentDaskLimits: vi.fn().mockReturnValue({}),
  MARKET_DATA_2024: { averagePremiums: {} },
  DASK_PREMIUM_RATES_2026: {},
}))

import { evaluatePolicy } from '../evaluator'
import { getPremiumBenchmarkWithFallback } from '../benchmark-service'
import type { BenchmarkConfidenceLevel as _BenchmarkConfidenceLevel } from '../types'

const mockGetBenchmark = vi.mocked(getPremiumBenchmarkWithFallback)

const BASE_FIELDS = {
  coverages: [
    { name: 'Comprehensive', nameTr: 'Kasko', limit: 350000, deductible: 0, included: true },
  ],
  exclusions: ['Earthquake'],
  aiInsights: ['Coverage is comprehensive'],
  aiConfidence: 0.9,
}

// Policy with rich context (vehicle class, year, location, provider, coverage)
function makeRichPolicy() {
  return {
    ...BASE_FIELDS,
    id: 'test-rich',
    policyNumber: 'POL-001',
    type: 'kasko' as const,
    typeTr: 'Kasko',
    coverage: 350000,
    premium: 31140,
    deductible: 0,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active' as const,
    insuredPerson: 'Test User',
    provider: 'Anadolu Sigorta',
    location: 'Istanbul, Marmara',
    vehicleInfo: {
      make: 'Ford',
      model: 'Transit Custom',
      year: 2023,
      vehicleClass: 'Binek', // private passenger car — benchmarks apply
      plate: '34 RZ 9511',
    },
  }
}

// Policy with zero context
function makeBarePolicy() {
  return {
    ...BASE_FIELDS,
    coverages: [{ name: 'Kasko', nameTr: 'Kasko', limit: 0, deductible: 0, included: true }],
    id: 'test-bare',
    policyNumber: 'POL-002',
    type: 'kasko' as const,
    typeTr: 'Kasko',
    coverage: 0,
    premium: 31140,
    deductible: 0,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active' as const,
    insuredPerson: 'Test User',
    provider: '',
  }
}

// Policy with partial context (provider + coverage but no vehicle/location)
function makePartialPolicy() {
  return {
    ...BASE_FIELDS,
    id: 'test-partial',
    policyNumber: 'POL-003',
    type: 'kasko' as const,
    typeTr: 'Kasko',
    coverage: 350000,
    premium: 31140,
    deductible: 0,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active' as const,
    insuredPerson: 'Test User',
    provider: 'Anadolu Sigorta',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetBenchmark.mockReturnValue({
    insuranceType: 'kasko',
    minPremium: 8000,
    avgPremium: 18500,
    maxPremium: 45000,
    currency: 'TRY' as const,
    year: 2024,
    source: 'TSB/SEDDK',
    dataDate: new Date().toISOString().split('T')[0], // current date to avoid stale downgrade
  })
})

describe('Benchmark Confidence Assessment', () => {
  describe('context factor detection', () => {
    it('detects all 5 factors on a rich policy', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeRichPolicy())
      expect(result.benchmarkConfidence).toBeDefined()
      expect(result.benchmarkConfidence!.presentCount).toBe(5)
      expect(result.benchmarkConfidence!.totalCount).toBe(5)
      expect(result.benchmarkConfidence!.level).toBe('high')
    })

    it('detects 0 factors on a bare policy (no vehicle, location, provider, coverage)', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeBarePolicy())
      expect(result.benchmarkConfidence).toBeDefined()
      expect(result.benchmarkConfidence!.presentCount).toBe(0)
      expect(result.benchmarkConfidence!.level).toBe('suppressed')
    })

    it('detects 2 factors on partial policy (provider + coverage)', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makePartialPolicy())
      expect(result.benchmarkConfidence).toBeDefined()
      expect(result.benchmarkConfidence!.presentCount).toBe(2)
      expect(result.benchmarkConfidence!.level).toBe('low')
    })

    it('downgrades confidence for commercial vehicle (Bug #13 — KAMYON / Ticari)', () => {
      const rich = makeRichPolicy()
      // Swap to a commercial-truck vehicleClass — benchmarks don't apply.
      rich.vehicleInfo!.vehicleClass = 'KAMYON'
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(rich)
      expect(result.benchmarkConfidence).toBeDefined()
      // presentCount is still 5 (all context factors present), but the niche
      // check downgrades level from 'high' to 'low'.
      expect(result.benchmarkConfidence!.presentCount).toBe(5)
      expect(result.benchmarkConfidence!.level).toBe('low')
    })

    it('suppresses comparison for commercial vehicle with 2 context factors (Bug #13)', () => {
      // 2 factors (vehicleClass + coverage) → level 'low' → niche downgrade → 'suppressed'
      const commercial = {
        ...makePartialPolicy(),
        provider: '', // strip provider so only 2 factors remain (coverage + vehicleClass)
        vehicleInfo: { vehicleClass: 'TIR' },
      } as ReturnType<typeof makeRichPolicy>
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(commercial)
      expect(result.benchmarkConfidence).toBeDefined()
      expect(result.benchmarkConfidence!.presentCount).toBe(2)
      expect(result.benchmarkConfidence!.level).toBe('suppressed')
      expect(result.benchmarkConfidence!.suppressionReason).toMatch(
        /commercial|niche|truck|bus|fleet/i
      )
      expect(result.benchmarkConfidence!.suppressionReasonTr).toMatch(
        /ticar[iı]|kamyon|otob[uü]s|filo/i
      )
    })

    it('includes factor names and presence flags', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeRichPolicy())
      const factors = result.benchmarkConfidence!.factors
      expect(factors.length).toBe(5)
      expect(factors.find((f) => f.factor === 'Vehicle class')?.present).toBe(true)
      expect(factors.find((f) => f.factor === 'Model year')?.present).toBe(true)
      expect(factors.find((f) => f.factor === 'Geography')?.present).toBe(true)
      expect(factors.find((f) => f.factor === 'Insurer')?.present).toBe(true)
      expect(factors.find((f) => f.factor === 'Coverage level')?.present).toBe(true)
    })

    it('marks missing factors correctly', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makePartialPolicy())
      const factors = result.benchmarkConfidence!.factors
      expect(factors.find((f) => f.factor === 'Vehicle class')?.present).toBe(false)
      expect(factors.find((f) => f.factor === 'Model year')?.present).toBe(false)
      expect(factors.find((f) => f.factor === 'Geography')?.present).toBe(false)
    })
  })

  describe('confidence levels', () => {
    it('assigns "high" when 3+ factors present', () => {
      const policy: Record<string, unknown> = {
        ...makePartialPolicy(),
        location: 'Istanbul',
        vehicleInfo: { year: 2023 },
      }
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(policy)
      // provider + coverage + location + year = 4
      expect(result.benchmarkConfidence!.level).toBe('high')
    })

    it('assigns "low" when 1-2 factors present', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makePartialPolicy())
      expect(result.benchmarkConfidence!.level).toBe('low')
    })

    it('assigns "suppressed" when 0 factors present', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeBarePolicy())
      expect(result.benchmarkConfidence!.level).toBe('suppressed')
    })
  })

  describe('premium score gating', () => {
    it('returns neutral 70 when confidence is suppressed', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeBarePolicy())
      expect(result.scoreBreakdown.premium.score).toBe(70)
      expect(result.scoreBreakdown.premium.details).toContain('comparison suppressed')
    })

    it('includes missing factor names in suppressed details', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeBarePolicy())
      expect(result.scoreBreakdown.premium.details).toContain('Vehicle class')
      expect(result.scoreBreakdown.premium.details).toContain('Geography')
    })

    it('adds low-confidence qualifier to details when confidence is low', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makePartialPolicy())
      expect(result.scoreBreakdown.premium.details).toContain('low confidence')
      expect(result.scoreBreakdown.premium.details).toContain('missing')
    })

    it('does not add qualifier when confidence is high', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeRichPolicy())
      expect(result.scoreBreakdown.premium.details).not.toContain('low confidence')
      expect(result.scoreBreakdown.premium.details).not.toContain('suppressed')
    })
  })

  describe('known failure: false "68% above average" prevention', () => {
    it('prevents confident "above average" conclusion from bare policy', () => {
      // This is the exact failure case: premium 31,140 vs average 18,500
      // = 68% above average — but the "average" ignores vehicle class, region, etc.
      const barePolicy = makeBarePolicy()
      barePolicy.premium = 31140
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(barePolicy)

      // With suppressed confidence, the comparison should be suppressed
      expect(result.benchmarkConfidence!.level).toBe('suppressed')
      // Premium score should be neutral, not penalized
      expect(result.scoreBreakdown.premium.score).toBe(70)
      // Details should NOT contain "above average" language
      expect(result.scoreBreakdown.premium.details).not.toContain('above market')
      expect(result.scoreBreakdown.premium.details).not.toContain('above average')
    })

    it('qualifies "above average" with missing factors on partial policy', () => {
      const partialPolicy = makePartialPolicy()
      partialPolicy.premium = 31140

      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(partialPolicy)
      // With low confidence, details should contain the qualification
      expect(result.benchmarkConfidence!.level).toBe('low')
      expect(result.scoreBreakdown.premium.details).toContain('low confidence')
    })

    it('allows comparison on fully-contextualized policy', () => {
      const richPolicy = makeRichPolicy()
      richPolicy.premium = 31140

      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(richPolicy)
      expect(result.benchmarkConfidence!.level).toBe('high')
      // Score should reflect actual comparison (above average but within range)
      // 31140 is between avg (18500) and max (45000), so score is between 60-90
      expect(result.scoreBreakdown.premium.score).toBeLessThan(90)
      expect(result.scoreBreakdown.premium.score).toBeGreaterThan(40)
    })
  })

  describe('Turkish locale support', () => {
    it('includes Turkish factor names', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeRichPolicy())
      const factors = result.benchmarkConfidence!.factors
      expect(factors.find((f) => f.factorTr === 'Araç sınıfı')).toBeTruthy()
      expect(factors.find((f) => f.factorTr === 'Model yılı')).toBeTruthy()
      expect(factors.find((f) => f.factorTr === 'Bölge')).toBeTruthy()
      expect(factors.find((f) => f.factorTr === 'Sigorta şirketi')).toBeTruthy()
      expect(factors.find((f) => f.factorTr === 'Teminat tutarı')).toBeTruthy()
    })

    it('includes Turkish suppression reason', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeBarePolicy())
      expect(result.benchmarkConfidence!.suppressionReasonTr).toContain('eksik')
    })

    it('includes Turkish text in suppressed premium details', () => {
      // @ts-expect-error - mismatch due to schema update
      const result = evaluatePolicy(makeBarePolicy())
      expect(result.scoreBreakdown.premium.detailsTR).toContain('karşılaştırma yapılamıyor')
    })
  })
})
