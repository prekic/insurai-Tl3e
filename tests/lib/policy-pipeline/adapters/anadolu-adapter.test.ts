import { describe, it, expect } from 'vitest'
import { AnadoluAdapter } from '../../../../src/lib/policy-pipeline/adapters/anadolu-adapter'

describe('AnadoluAdapter', () => {
  const adapter = new AnadoluAdapter()

  describe('mapServiceNetwork', () => {
    it('should map AS+ to CONTRACTED_GLASS_NETWORK for GLASS_BREAKAGE', () => {
      expect(adapter.mapServiceNetwork('AS+ Yetkili Servis Ağı', 'GLASS_BREAKAGE')).toBe(
        'CONTRACTED_GLASS_NETWORK'
      )
    })

    it('should map YETKİLİ to OEM_GLASS_NETWORK for GLASS_BREAKAGE', () => {
      expect(adapter.mapServiceNetwork('Yetkili Servis Ağı', 'GLASS_BREAKAGE')).toBe(
        'OEM_GLASS_NETWORK'
      )
    })

    it('should map ANADOLU HİZMET to ROADSIDE_ASSISTANCE', () => {
      expect(adapter.mapServiceNetwork('Anadolu Hizmet Paketi', 'UNKNOWN')).toBe(
        'ROADSIDE_ASSISTANCE'
      )
    })

    it('should return undefined for unmatched networks', () => {
      expect(adapter.mapServiceNetwork('Özel Servis', 'GLASS_BREAKAGE')).toBeUndefined()
    })
  })

  describe('getRequiredCoverages', () => {
    it('should return base coverages for standard Kasko', () => {
      const required = adapter.getRequiredCoverages('Genişletilmiş Kasko')
      const concepts = required.map((r) => r.concept)

      expect(concepts).toContain('MAIN_KASKO_COVERAGE')
      expect(concepts).toContain('EXCESS_LIABILITY')
      expect(concepts).toContain('MINI_REPAIR')
      expect(concepts).toContain('LEGAL_PROTECTION') // standard legal protection
      expect(concepts).not.toContain('LEGAL_PROTECTION_ADVANCE')
    })

    it('should return specific coverages for Birleşik Kasko', () => {
      const required = adapter.getRequiredCoverages('Birleşik Kasko')
      const concepts = required.map((r) => r.concept)

      expect(concepts).toContain('MAIN_KASKO_COVERAGE')
      expect(concepts).toContain('EXCESS_LIABILITY')
      expect(concepts).toContain('LEGAL_PROTECTION_ADVANCE') // specific legal protection
      expect(concepts).toContain('LEGAL_PROTECTION_BAIL')
      expect(concepts).not.toContain('LEGAL_PROTECTION')
    })

    it('should enforce limits for determinism', () => {
      const required = adapter.getRequiredCoverages()
      const imm = required.find((r) => r.concept === 'EXCESS_LIABILITY')

      expect(imm?.enforce).toBe(true)
      expect(imm?.defaultLimit).toBe(100000)
    })
  })

  describe('standardizeDeductible', () => {
    it('should return null if no deductible is present', () => {
      expect(adapter.standardizeDeductible({})).toBeNull()
    })

    it('should return existing deductible unmodified for now', () => {
      expect(adapter.standardizeDeductible({ deductible: 'Bedelin %2si' })).toBe('Bedelin %2si')
    })
  })
})
