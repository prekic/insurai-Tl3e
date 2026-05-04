import { describe, expect, it } from 'vitest'
import {
  canonicalizeCoverage,
  UnmatchedCoverageLabelError,
} from '../../../../src/lib/policy-pipeline/stage2-validate/canonicalize-coverage'

describe('canonicalizeCoverage', () => {
  it('canonicalizes top priority matchers', () => {
    expect(canonicalizeCoverage('HUKUKSAL KORUMA')).toBe('LEGAL_PROTECTION')
    expect(canonicalizeCoverage('Hukuksal Koruma - Avans')).toBe('LEGAL_PROTECTION_ADVANCE')
    expect(canonicalizeCoverage('Koltuk Ferdi Kaza - Ölüm')).toBe('SEAT_PERSONAL_ACCIDENT_DEATH')
    expect(canonicalizeCoverage('Personal Accident - Death')).toBe('PERSONAL_ACCIDENT_DEATH')
  })

  it('canonicalizes generic exact/contains matchers', () => {
    expect(canonicalizeCoverage('Excess Liability')).toBe('EXCESS_LIABILITY')
    expect(canonicalizeCoverage('Artan Mali Sorumluluk')).toBe('EXCESS_LIABILITY')
    expect(canonicalizeCoverage('Excess Liability - Moral damages')).toBe('MORAL_DAMAGES_LIABILITY')

    expect(canonicalizeCoverage('KİŞİSEL EŞYA')).toBe('PERSONAL_BELONGINGS')
    expect(canonicalizeCoverage('Personal Belongings')).toBe('PERSONAL_BELONGINGS')
  })

  it('canonicalizes tricky collisions', () => {
    expect(canonicalizeCoverage('Grev L.H.H. ve Terör')).toBe('STRIKE_LOCKOUT_TERROR')
    expect(canonicalizeCoverage('Deprem, Heyelan, Fırtına, Dolu, Yıldırım')).toBe(
      'NATURAL_DISASTERS'
    )
    expect(canonicalizeCoverage('Anahtarın Ele Geçirilmesiyle Çalınma')).toBe(
      'KEY_ACQUISITION_THEFT'
    )
  })

  it('throws in strict mode if no match', () => {
    expect(() => canonicalizeCoverage('Completely Made Up Label', true)).toThrow(
      UnmatchedCoverageLabelError
    )
  })

  it('returns UNKNOWN if not in strict mode', () => {
    expect(canonicalizeCoverage('Completely Made Up Label')).toBe('UNKNOWN')
    expect(canonicalizeCoverage(null)).toBe('UNKNOWN')
  })
})
