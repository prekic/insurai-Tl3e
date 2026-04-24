import { describe, it, expect } from 'vitest'
import { evaluatePolicy } from '../evaluator'
import type { AnalyzedPolicy } from '@/types/policy'

describe('IMM scenario coverage detection (Voluntary Liability)', () => {
  const basePolicy: AnalyzedPolicy = {
    id: 'imm-test',
    policyNumber: 'IMM-001',
    provider: 'Test Insurance',
    type: 'kasko',
    status: 'active',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    premium: 1000,
    coverage: 1000000,
    deductible: 0,
    coverages: [],
    exclusions: [],
    aiInsights: [],
  } as unknown as AnalyzedPolicy

  function findIMMCard(policy: AnalyzedPolicy) {
    const result = evaluatePolicy(policy)
    return result.scenarioCards?.find((c) => c.id === 'imm-scenario')
  }

  it('detects IMM via Turkish nameTr "İhtiyari Mali Mesuliyet" (was failing before fix)', () => {
    const card = findIMMCard({
      ...basePolicy,
      coverages: [
        {
          name: 'Excess Liability',
          nameTr: 'İhtiyari Mali Mesuliyet',
          limit: 400000,
          deductible: 0,
          included: true,
        },
      ],
    })
    expect(card).toBeDefined()
    // Should NOT contain the "lacks" message — coverage exists
    expect(card?.description).not.toMatch(/lacks Voluntary Liability/i)
    // Should contain the limit-aware "caps liability at" message
    expect(card?.description).toMatch(/caps liability|400/i)
  })

  it('detects IMM via English name "Voluntary Liability Coverage"', () => {
    const card = findIMMCard({
      ...basePolicy,
      coverages: [
        // @ts-expect-error - mismatch due to schema update
        {
          name: 'Voluntary Liability Coverage',
          limit: 500000,
          deductible: 0,
          included: true,
        },
      ],
    })
    expect(card).toBeDefined()
    expect(card?.description).not.toMatch(/lacks Voluntary Liability/i)
  })

  it('detects IMM via English name "Excess Liability"', () => {
    const card = findIMMCard({
      ...basePolicy,
      coverages: [
        // @ts-expect-error - mismatch due to schema update
        {
          name: 'Excess Liability',
          limit: 250000,
          deductible: 0,
          included: true,
        },
      ],
    })
    expect(card).toBeDefined()
    expect(card?.description).not.toMatch(/lacks Voluntary Liability/i)
  })

  it('still emits the "lacks" warning when policy genuinely has no IMM', () => {
    const card = findIMMCard({
      ...basePolicy,
      coverages: [
        {
          name: 'Collision',
          nameTr: 'Çarpma/Çarpışma',
          limit: 500000,
          deductible: 0,
          included: true,
        },
      ],
    })
    expect(card).toBeDefined()
    expect(card?.description).toMatch(/lacks Voluntary Liability/i)
    expect(card?.financialStatus).toBe('risk')
  })

  // ─────────────────────────────────────────────────────────────────────
  // v4 PR-3: IMM Sınırsız carve-out caveat
  // ─────────────────────────────────────────────────────────────────────

  it('surfaces the 2.5M TL airport/port/fuel-depot carve-out on unlimited IMM', () => {
    const card = findIMMCard({
      ...basePolicy,
      coverages: [
        // @ts-expect-error - mismatch due to schema update
        {
          name: 'Artan Mali Sorumluluk',
          nameTr: 'Artan Mali Sorumluluk',
          limit: 0,
          deductible: 0,
          included: true,
          isUnlimited: true,
          clause: 'Artan Mali Sorumluluk Sınırsız Teminatı Klozu',
          quote:
            'havalimanı, liman, akaryakıt deposu, rafineri ve benzeri yerlerde olay başı 2.500.000 TL üst sınırı uygulanır',
        },
      ],
    })
    expect(card).toBeDefined()
    expect(card?.insurerPays).toBe('Unlimited')
    expect(card?.financialStatus).toBe('covered')
    // Caveat must be present in both locales
    expect(card?.caveat).toMatch(/2,500,000|airports|fuel depots/i)
    expect(card?.caveatTR).toMatch(/2\.500\.000|havaliman|akaryak/i)
  })

  it('prefers an explicit carveOuts entry over the clause/quote heuristic', () => {
    const card = findIMMCard({
      ...basePolicy,
      coverages: [
        // @ts-expect-error - mismatch due to schema update
        {
          name: 'Artan Mali Sorumluluk',
          nameTr: 'Artan Mali Sorumluluk',
          limit: 0,
          deductible: 0,
          included: true,
          isUnlimited: true,
          carveOuts: ['Havalimanı ve liman alanlarında olay başı 1.000.000 TL'],
        },
      ],
    })
    expect(card?.caveat).toContain('Havalimanı ve liman alanlarında olay başı 1.000.000 TL')
  })

  it('omits the caveat when unlimited IMM has no carve-out signal', () => {
    const card = findIMMCard({
      ...basePolicy,
      coverages: [
        // @ts-expect-error - mismatch due to schema update
        {
          name: 'Excess Liability',
          nameTr: 'İhtiyari Mali Mesuliyet',
          limit: 0,
          deductible: 0,
          included: true,
          isUnlimited: true,
        },
      ],
    })
    expect(card?.insurerPays).toBe('Unlimited')
    expect(card?.caveat).toBeUndefined()
    expect(card?.caveatTR).toBeUndefined()
  })
})
