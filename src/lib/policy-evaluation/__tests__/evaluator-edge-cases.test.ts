/**
 * Edge-case tests for formatTRY and evaluatePolicy crash resistance.
 *
 * These tests cover production crash scenarios that were identified during
 * the Phase E pilot ingestion:
 * - Undefined/null coverage limits (IMM scenario card crash)
 * - Zero premium policies
 * - Market-value policies with coverage = 0
 * - Policies with 33+ coverages (high-coverage edge)
 * - Missing vehicleInfo on kasko policies
 */

import { describe, it, expect, vi } from 'vitest'
import { evaluatePolicy } from '../evaluator'
import type { Policy } from '@/types/policy'

// Mock benchmark service to return trusted data for deterministic testing
vi.mock('../benchmark-service', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as any),
    getPremiumBenchmarkWithFallback: vi.fn().mockImplementation((...args) => {
      const result = (actual as any).getPremiumBenchmarkWithFallback(...args)
      return { ...result, benchmarkStatus: 'trusted', source: 'database' }
    }),
  }
})

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createBasePolicy(overrides: Partial<Policy> = {}): Policy {
  const now = new Date()
  const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const expiryDate = new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000)

  return {
    id: 'edge-case-policy',
    policyNumber: 'EDGE-001',
    provider: 'Test Insurance',
    logo: '/test-logo.png',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 15000,
    monthlyPremium: 1250,
    deductible: 5000,
    startDate: startDate.toISOString(),
    expiryDate: expiryDate.toISOString(),
    status: 'active',
    uploadDate: now.toISOString(),
    fileName: 'test-policy.pdf',
    documentType: 'policy',
    insuranceLine: 'Auto',
    coverages: [
      { name: 'Collision', nameTr: 'Çarpışma', limit: 200000, deductible: 2000, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 200000, deductible: 1000, included: true },
      { name: 'Fire', nameTr: 'Yangın', limit: 200000, deductible: 500, included: true },
    ],
    exclusions: ['Racing'],
    specialConditions: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Evaluator Edge Cases — Crash Resistance', () => {
  // =========================================================================
  // formatTRY safety (the root cause of the 32630901/3 crash)
  // =========================================================================
  describe('formatTRY null-safety via evaluatePolicy', () => {
    it('should not crash when coverage limits are undefined', () => {
      const policy = createBasePolicy({
        coverages: [
          {
            name: 'IMM',
            nameTr: 'İhtiyari Mali Mesuliyet',
            limit: undefined as unknown as number,
            deductible: 0,
            included: true,
          },
          {
            name: 'Collision',
            nameTr: 'Çarpışma',
            limit: undefined as unknown as number,
            deductible: 0,
            included: true,
          },
        ],
      })

      expect(() => evaluatePolicy(policy)).not.toThrow()
      const result = evaluatePolicy(policy)
      expect(result.overallScore).toBeGreaterThanOrEqual(0)
    })

    it('should not crash when coverage limits are null', () => {
      const policy = createBasePolicy({
        coverages: [
          {
            name: 'IMM',
            nameTr: 'İhtiyari Mali Mesuliyet',
            limit: null as unknown as number,
            deductible: 0,
            included: true,
          },
        ],
      })

      expect(() => evaluatePolicy(policy)).not.toThrow()
    })

    it('should not crash when deductible is undefined', () => {
      const policy = createBasePolicy({
        deductible: undefined as unknown as number,
      })

      expect(() => evaluatePolicy(policy)).not.toThrow()
    })

    it('should not crash when premium is undefined', () => {
      const policy = createBasePolicy({
        premium: undefined as unknown as number,
        monthlyPremium: undefined as unknown as number,
      })

      expect(() => evaluatePolicy(policy)).not.toThrow()
    })
  })

  // =========================================================================
  // Zero premium (backfill scenario — premiumMissing flag)
  // =========================================================================
  describe('zero premium policies', () => {
    it('should handle premium = 0 without crash', () => {
      const policy = createBasePolicy({ premium: 0, monthlyPremium: 0 })

      expect(() => evaluatePolicy(policy)).not.toThrow()
      const result = evaluatePolicy(policy)
      expect(result.overallScore).toBeGreaterThanOrEqual(0)
      expect(result.overallScore).toBeLessThanOrEqual(100)
    })

    it('should produce valid score breakdown for zero-premium policy', () => {
      const policy = createBasePolicy({ premium: 0, monthlyPremium: 0 })
      const result = evaluatePolicy(policy)

      expect(result.scoreBreakdown.premium).toBeDefined()
      // Premium score can be -1 (sentinel: insufficient data) or >= 0
      expect(result.scoreBreakdown.premium.score).toBeGreaterThanOrEqual(-1)
      expect(result.scoreBreakdown.premium.details).toBeTruthy()
      expect(result.scoreBreakdown.premium.detailsTR).toBeTruthy()
    })
  })

  // =========================================================================
  // Market-value kasko (coverage = 0 is valid for these)
  // =========================================================================
  describe('market-value kasko policies (coverage = 0)', () => {
    it('should handle coverage = 0 with isMarketValue coverages', () => {
      const policy = createBasePolicy({
        coverage: 0,
        coverages: [
          {
            name: 'Collision',
            nameTr: 'Çarpışma',
            limit: 0,
            deductible: 0,
            included: true,
            isMarketValue: true,
          },
          {
            name: 'Theft',
            nameTr: 'Hırsızlık',
            limit: 0,
            deductible: 0,
            included: true,
            isMarketValue: true,
          },
        ],
      })

      expect(() => evaluatePolicy(policy)).not.toThrow()
      const result = evaluatePolicy(policy)
      // Market-value policies should not be penalized for zero coverage
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(50)
    })

    it('should format coverage details correctly when coverage is 0', () => {
      const policy = createBasePolicy({ coverage: 0 })
      const result = evaluatePolicy(policy)

      // Details should not contain "NaN" or "undefined"
      expect(result.scoreBreakdown.coverage.details).not.toContain('NaN')
      expect(result.scoreBreakdown.coverage.details).not.toContain('undefined')
      expect(result.scoreBreakdown.coverage.detailsTR).not.toContain('NaN')
      expect(result.scoreBreakdown.coverage.detailsTR).not.toContain('undefined')
    })
  })

  // =========================================================================
  // High coverage count (33+ coverages — stress test)
  // =========================================================================
  describe('high coverage count policies', () => {
    it('should handle 33+ coverages without performance degradation', () => {
      const manyCoverages = Array.from({ length: 33 }, (_, i) => ({
        name: `Coverage ${i + 1}`,
        nameTr: `Teminat ${i + 1}`,
        limit: 50000 + i * 10000,
        deductible: i < 5 ? 1000 : 0,
        included: true,
      }))

      const policy = createBasePolicy({
        coverage: 2000000,
        coverages: manyCoverages,
      })

      const start = Date.now()
      const result = evaluatePolicy(policy)
      const elapsed = Date.now() - start

      expect(result.overallScore).toBeGreaterThanOrEqual(0)
      // Should complete in under 500ms even with 33 coverages
      expect(elapsed).toBeLessThan(500)
    })

    it('should give high coverage score for many included coverages', () => {
      const manyCoverages = Array.from({ length: 15 }, (_, i) => ({
        name: `Coverage ${i + 1}`,
        nameTr: `Teminat ${i + 1}`,
        limit: 100000,
        deductible: 0,
        included: true,
      }))

      const policy = createBasePolicy({
        coverage: 1500000,
        coverages: manyCoverages,
      })

      const result = evaluatePolicy(policy)
      expect(result.scoreBreakdown.coverage.score).toBeGreaterThanOrEqual(70)
    })
  })

  // =========================================================================
  // Missing provider (UNKNOWN provider from incomplete extraction)
  // =========================================================================
  describe('unknown provider policies', () => {
    it('should handle UNKNOWN provider without crash', () => {
      const policy = createBasePolicy({ provider: 'UNKNOWN' })

      expect(() => evaluatePolicy(policy)).not.toThrow()
      const result = evaluatePolicy(policy)
      expect(result.overallScore).toBeGreaterThanOrEqual(0)
    })
  })

  // =========================================================================
  // Scenario card generation with edge data
  // =========================================================================
  describe('scenario card generation safety', () => {
    it('should generate scenario cards without crash for zero-deductible policy', () => {
      const policy = createBasePolicy({ deductible: 0 })
      const result = evaluatePolicy(policy)

      // Scenario cards should be generated
      expect(result.scenarioCards).toBeDefined()
      expect(Array.isArray(result.scenarioCards)).toBe(true)
    })

    it('should not produce NaN or undefined in any scenario card text', () => {
      const policy = createBasePolicy({
        deductible: 0,
        premium: 0,
        coverage: 0,
      })
      const result = evaluatePolicy(policy)

      if (result.scenarioCards) {
        for (const card of result.scenarioCards) {
          expect(card.description).not.toContain('NaN')
          expect(card.description).not.toContain('undefined')
          if (card.descriptionTR) {
            expect(card.descriptionTR).not.toContain('NaN')
            expect(card.descriptionTR).not.toContain('undefined')
          }
          if (card.riskAmount) {
            expect(card.riskAmount).not.toContain('NaN')
            expect(card.riskAmount).not.toContain('undefined')
          }
          if (card.userPays) {
            expect(card.userPays).not.toContain('NaN')
            expect(card.userPays).not.toContain('undefined')
          }
        }
      }
    })

    it('should generate valid scenario cards for market-value policy', () => {
      const policy = createBasePolicy({
        coverage: 0,
        coverages: [
          {
            name: 'Collision',
            nameTr: 'Çarpışma',
            limit: 0,
            deductible: 0,
            included: true,
            isMarketValue: true,
          },
          {
            name: 'IMM',
            nameTr: 'İhtiyari Mali Mesuliyet',
            limit: 500000,
            deductible: 0,
            included: true,
          },
        ],
      })

      const result = evaluatePolicy(policy)
      expect(result.scenarioCards).toBeDefined()
      // IMM coverage with a known limit should produce a scenario card
      if (result.scenarioCards && result.scenarioCards.length > 0) {
        const immCard = result.scenarioCards.find((c) => c.id?.includes('imm'))
        // If IMM card exists, verify its content is valid
        if (immCard) {
          expect(immCard.description).toBeTruthy()
          expect(immCard.description).not.toContain('undefined')
        }
      }
    })
  })

  // =========================================================================
  // Recommendation text safety
  // =========================================================================
  describe('recommendation text safety', () => {
    it('should produce clean recommendation text for policy with all zeros', () => {
      const policy = createBasePolicy({
        premium: 0,
        coverage: 0,
        deductible: 0,
        monthlyPremium: 0,
        coverages: [],
      })

      const result = evaluatePolicy(policy)
      for (const rec of result.recommendations) {
        expect(rec.title).not.toContain('NaN')
        expect(rec.title).not.toContain('undefined')
        expect(rec.description).not.toContain('NaN')
        expect(rec.description).not.toContain('undefined')
        if (rec.titleTR) {
          expect(rec.titleTR).not.toContain('NaN')
          expect(rec.titleTR).not.toContain('undefined')
        }
        if (rec.descriptionTR) {
          expect(rec.descriptionTR).not.toContain('NaN')
          expect(rec.descriptionTR).not.toContain('undefined')
        }
      }
    })
  })

  // =========================================================================
  // Details string safety (the toLocaleString migration target)
  // =========================================================================
  describe('details string formatting safety', () => {
    it('should format all breakdown details without NaN/undefined', () => {
      const policies = [
        createBasePolicy({ premium: 0, coverage: 0, deductible: 0 }),
        createBasePolicy({ premium: NaN as number, coverage: 500000, deductible: 5000 }),
        createBasePolicy({
          premium: 15000,
          coverage: 0,
          coverages: [
            {
              name: 'C',
              nameTr: 'C',
              limit: 0,
              deductible: 0,
              included: true,
              isMarketValue: true,
            },
          ],
        }),
      ]

      for (const policy of policies) {
        const result = evaluatePolicy(policy)
        for (const [, breakdown] of Object.entries(result.scoreBreakdown)) {
          const b = breakdown as { details: string; detailsTR: string }
          expect(b.details).not.toContain('NaN')
          expect(b.details).not.toContain('undefined')
          expect(b.detailsTR).not.toContain('NaN')
          expect(b.detailsTR).not.toContain('undefined')
        }
      }
    })
  })
})
