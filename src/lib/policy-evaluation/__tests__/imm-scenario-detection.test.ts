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
})
