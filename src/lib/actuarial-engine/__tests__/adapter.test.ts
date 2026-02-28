/**
 * Adapter Tests
 *
 * Tests for mapAnalyzedToActuarialInput() which bridges the standard
 * AnalyzedPolicy model to the canonical ActuarialPolicyInput.
 */

import { describe, it, expect } from 'vitest'
import { mapAnalyzedToActuarialInput } from '../adapter'
import type { AnalyzedPolicy, Coverage } from '@/types/policy'

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makePolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'pol-001',
    policyNumber: 'KSK-2026-001',
    provider: 'Allianz',
    logo: '',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 250000,
    premium: 12000,
    monthlyPremium: 1000,
    deductible: 2000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'Test User',
    coverages: [
      {
        name: 'Collision',
        nameTr: 'Çarpışma',
        limit: 250000,
        deductible: 2000,
        included: true,
      },
      {
        name: 'Theft',
        nameTr: 'Hırsızlık',
        limit: 250000,
        deductible: 0,
        included: true,
      },
    ],
    exclusions: [{ text: 'Racing excluded', severity: 'critical' }],
    aiConfidence: 0.92,
    aiInsights: ['Good coverage'],
    ...overrides,
  }
}

function makeCoverage(overrides: Partial<Coverage> = {}): Coverage {
  return {
    name: 'Test Coverage',
    nameTr: 'Test Teminat',
    limit: 50000,
    deductible: 1000,
    included: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// mapAnalyzedToActuarialInput — Happy Path
// ---------------------------------------------------------------------------

describe('mapAnalyzedToActuarialInput', () => {
  describe('happy path', () => {
    it('maps a valid kasko policy correctly', () => {
      const policy = makePolicy()
      const result = mapAnalyzedToActuarialInput(policy)

      expect(result.policyId).toBe('pol-001')
      expect(result.policyType).toBe('kasko')
      expect(result.marketedProductName).toBe('Kasko')
      expect(result.premium).toEqual({ amount: 12000, currency: 'TRY' })
      expect(result.effectiveDate).toBe('2026-01-01')
      expect(result.expiryDate).toBe('2027-01-01')
      expect(result.coverages).toHaveLength(2)
      expect(result.exclusionTexts).toEqual(['Racing excluded'])
    })

    it('maps coverage codes from Turkish names', () => {
      const policy = makePolicy({
        coverages: [
          makeCoverage({ name: 'Collision', nameTr: 'Çarpışma' }),
          makeCoverage({ name: 'Theft', nameTr: 'Hırsızlık' }),
          makeCoverage({ name: 'Fire', nameTr: 'Yangın' }),
          makeCoverage({ name: 'Earthquake', nameTr: 'Deprem' }),
          makeCoverage({ name: 'Flood', nameTr: 'Sel' }),
          makeCoverage({ name: 'Glass', nameTr: 'Cam' }),
          makeCoverage({ name: 'Personal Accident', nameTr: 'Ferdi Kaza' }),
          makeCoverage({ name: 'Legal Protection', nameTr: 'Hukuksal Koruma' }),
          makeCoverage({ name: 'Third Party Liability', nameTr: 'İhtiyari Mali Sorumluluk' }),
        ],
      })

      const result = mapAnalyzedToActuarialInput(policy)

      const codes = result.coverages.map((c) => c.code)
      expect(codes).toEqual([
        'COLLISION',
        'THEFT',
        'FIRE',
        'EARTHQUAKE',
        'FLOOD',
        'GLASS',
        'PERSONAL_ACCIDENT',
        'LEGAL_PROTECTION',
        'THIRD_PARTY_LIABILITY',
      ])
    })

    it('maps unknown coverages to uppercase snake case', () => {
      const policy = makePolicy({
        coverages: [makeCoverage({ name: 'Mini Onarım Sigortası', nameTr: '' })],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].code).toBe('MINI_ONARIM_SIGORTASI')
    })

    it('maps unlimited coverage limit correctly', () => {
      const policy = makePolicy({
        coverages: [makeCoverage({ isUnlimited: true, limit: 0 })],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].limit.value).toEqual({ kind: 'unlimited' })
    })

    it('maps coverage with zero deductible as none', () => {
      const policy = makePolicy({
        coverages: [makeCoverage({ deductible: 0 })],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].deductible.value).toEqual({ kind: 'none' })
    })

    it('maps coverage with positive deductible as money', () => {
      const policy = makePolicy({
        coverages: [makeCoverage({ deductible: 5000 })],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].deductible.value).toEqual({ amount: 5000, currency: 'TRY' })
    })
  })

  // ---------------------------------------------------------------------------
  // Policy Type Mapping
  // ---------------------------------------------------------------------------

  describe('policy type mapping', () => {
    it.each([
      ['kasko', 'kasko'],
      ['traffic', 'traffic'],
      ['dask', 'dask'],
      ['zas', 'zas'],
    ] as const)('maps %s to %s', (input, expected) => {
      const policy = makePolicy({ type: input as AnalyzedPolicy['type'] })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.policyType).toBe(expected)
    })

    it('passes through unsupported types like home', () => {
      const policy = makePolicy({ type: 'home' })
      const result = mapAnalyzedToActuarialInput(policy)
      // Falls through to the default case, cast as-is
      expect(result.policyType).toBe('home')
    })

    it('passes through unsupported types like health', () => {
      const policy = makePolicy({ type: 'health' })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.policyType).toBe('health')
    })
  })

  // ---------------------------------------------------------------------------
  // Edge Cases — Null/Missing Coverage Name
  // ---------------------------------------------------------------------------

  describe('coverage name edge cases', () => {
    it('does not crash when coverage.name is undefined', () => {
      const policy = makePolicy({
        coverages: [
          {
            name: undefined as unknown as string,
            nameTr: 'Yangın',
            limit: 100000,
            deductible: 0,
            included: true,
          },
        ],
      })

      // Should not throw
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages).toHaveLength(1)
      // Falls back to nameTr for matching
      expect(result.coverages[0].code).toBe('FIRE')
    })

    it('does not crash when coverage.name is null', () => {
      const policy = makePolicy({
        coverages: [
          {
            name: null as unknown as string,
            nameTr: 'Deprem',
            limit: 50000,
            deductible: 0,
            included: true,
          },
        ],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages).toHaveLength(1)
      expect(result.coverages[0].code).toBe('EARTHQUAKE')
    })

    it('produces UNKNOWN code when both name and nameTr are empty', () => {
      const policy = makePolicy({
        coverages: [{ name: '', nameTr: '', limit: 10000, deductible: 0, included: true }],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].code).toBe('UNKNOWN')
    })

    it('produces UNKNOWN code when both name and nameTr are undefined', () => {
      const policy = makePolicy({
        coverages: [
          {
            name: undefined as unknown as string,
            nameTr: undefined as unknown as string,
            limit: 10000,
            deductible: 0,
            included: true,
          },
        ],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].code).toBe('UNKNOWN')
    })
  })

  // ---------------------------------------------------------------------------
  // Edge Cases — Empty Coverages
  // ---------------------------------------------------------------------------

  describe('empty coverages', () => {
    it('handles empty coverages array', () => {
      const policy = makePolicy({ coverages: [] })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // Edge Cases — Exclusions
  // ---------------------------------------------------------------------------

  describe('exclusions', () => {
    it('maps exclusion text strings correctly', () => {
      const policy = makePolicy({
        exclusions: [
          { text: 'Racing excluded', severity: 'critical' },
          { text: 'War excluded', severity: 'normal' },
        ],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.exclusionTexts).toEqual(['Racing excluded', 'War excluded'])
    })

    it('handles empty exclusions', () => {
      const policy = makePolicy({ exclusions: [] })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.exclusionTexts).toEqual([])
    })

    it('handles undefined exclusions', () => {
      const policy = makePolicy({
        exclusions: undefined as unknown as AnalyzedPolicy['exclusions'],
      })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.exclusionTexts).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // Indemnity Mechanics
  // ---------------------------------------------------------------------------

  describe('indemnity mechanics', () => {
    it('uses default unspecified indemnity when raw_data is absent', () => {
      const policy = makePolicy()
      const result = mapAnalyzedToActuarialInput(policy)

      expect(result.indemnityMechanics.partsStandard.value).toBe('unspecified')
      expect(result.indemnityMechanics.repairNetworkRule.value).toBe('unspecified')
      expect(result.indemnityMechanics.rayicMethod.value).toBe('unknown')
      expect(result.indemnityMechanics.rayicMethodIsConcrete.value).toBe(false)
    })

    it('extracts indemnity from raw_data when present', () => {
      const policy = makePolicy() as unknown as Record<string, unknown>
      policy.raw_data = {
        indemnity: {
          partsStandard: 'oem',
          repairNetworkRule: 'insurer_network',
          rayicMethod: 'schwacke',
          rayicMethodIsConcrete: true,
        },
      }

      const result = mapAnalyzedToActuarialInput(policy as unknown as AnalyzedPolicy)

      expect(result.indemnityMechanics.partsStandard.value).toBe('oem')
      expect(result.indemnityMechanics.repairNetworkRule.value).toBe('insurer_network')
      expect(result.indemnityMechanics.rayicMethod.value).toBe('schwacke')
      expect(result.indemnityMechanics.rayicMethodIsConcrete.value).toBe(true)
    })

    it('falls back to defaults for partially populated indemnity', () => {
      const policy = makePolicy() as unknown as Record<string, unknown>
      policy.raw_data = {
        indemnity: {
          partsStandard: 'equivalent',
          // repairNetworkRule, rayicMethod, rayicMethodIsConcrete are missing
        },
      }

      const result = mapAnalyzedToActuarialInput(policy as unknown as AnalyzedPolicy)

      expect(result.indemnityMechanics.partsStandard.value).toBe('equivalent')
      expect(result.indemnityMechanics.repairNetworkRule.value).toBe('unspecified')
      expect(result.indemnityMechanics.rayicMethod.value).toBe('unspecified')
      expect(result.indemnityMechanics.rayicMethodIsConcrete.value).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Insured Value
  // ---------------------------------------------------------------------------

  describe('insured value', () => {
    it('sets insuredValue from coverage when positive', () => {
      const policy = makePolicy({ coverage: 500000 })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.insuredValue).toEqual({ amount: 500000, currency: 'TRY' })
    })

    it('sets insuredValue to undefined when coverage is 0', () => {
      const policy = makePolicy({ coverage: 0 })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.insuredValue).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Coverage Inclusion
  // ---------------------------------------------------------------------------

  describe('coverage inclusion', () => {
    it('treats undefined included as true', () => {
      const policy = makePolicy({
        coverages: [
          {
            name: 'Fire',
            nameTr: 'Yangın',
            limit: 50000,
            deductible: 0,
            included: undefined as unknown as boolean,
          },
        ],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].included).toBe(true)
    })

    it('treats explicitly false as false', () => {
      const policy = makePolicy({
        coverages: [makeCoverage({ included: false })],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].included).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Natural Disaster Coverage Matching
  // ---------------------------------------------------------------------------

  describe('natural disaster matching', () => {
    it('maps doğal afet to NATURAL_DISASTER', () => {
      const policy = makePolicy({
        coverages: [makeCoverage({ name: 'Doğal Afet Teminatı', nameTr: '' })],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].code).toBe('NATURAL_DISASTER')
    })

    it('maps natural disaster English text', () => {
      const policy = makePolicy({
        coverages: [makeCoverage({ name: 'Natural Disaster Coverage', nameTr: '' })],
      })

      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.coverages[0].code).toBe('NATURAL_DISASTER')
    })
  })

  // ---------------------------------------------------------------------------
  // marketedProductName
  // ---------------------------------------------------------------------------

  describe('marketedProductName', () => {
    it('uses typeTr when available', () => {
      const policy = makePolicy({ typeTr: 'Tam Kasko' })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.marketedProductName).toBe('Tam Kasko')
    })

    it('is undefined when typeTr is empty', () => {
      const policy = makePolicy({ typeTr: '' })
      const result = mapAnalyzedToActuarialInput(policy)
      expect(result.marketedProductName).toBeUndefined()
    })
  })
})
