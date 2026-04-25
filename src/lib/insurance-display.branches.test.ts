/**
 * Branch Coverage Tests for insurance-display.ts
 *
 * Targets uncovered branches:
 * - getShortCompanyName: exact match, partial matches (all companies), short name, fallback suffix removal, truncation
 * - getCoverageType: limit, sumInsured, benefit
 * - getMainCoverageValue: traffic with relevant coverages, traffic fallback, traffic no coverages, other types
 * - getInsuredSubject: kasko/traffic plate extraction (rawData, coverages, conditions, vehicle fallback),
 *   home/dask/business address, health/life insuredPerson, null cases
 * - getSubjectDisplay: all policy types, locales, plate vs vehicle detection, truncation, no subject, no insuredPerson
 */

import { describe, it, expect } from 'vitest'
import {
  getShortCompanyName,
  getCoverageType,
  getMainCoverageValue,
  getInsuredSubject,
  getSubjectDisplay,
} from './insurance-display'
import type { AnalyzedPolicy, Coverage as _Coverage } from '@/types/policy'

function makePolicy(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: '1',
    policyNumber: 'P-001',
    provider: 'Test',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 100000,
    premium: 5000,
    deductible: 1000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    insuredPerson: 'AHMET YILMAZ',
    coverages: [],
    exclusions: [],
    specialConditions: [],
    aiInsights: [],
    ...overrides,
  } as AnalyzedPolicy
}

// ==================================================================
// getShortCompanyName
// ==================================================================
describe('getShortCompanyName', () => {
  it('returns exact match from lookup table', () => {
    expect(getShortCompanyName('AKSİGORTA A.Ş.')).toBe('Aksigorta')
    expect(getShortCompanyName('ALLİANZ SİGORTA A.Ş.')).toBe('Allianz')
  })

  it('matches case-insensitively', () => {
    expect(getShortCompanyName('aksigorta a.ş.')).toBe('Aksigorta')
  })

  it('matches partial name: anadolu', () => {
    expect(getShortCompanyName('Anadolu Insurance Co.')).toBe('Anadolu Sigorta')
  })

  it('matches partial name: allianz', () => {
    expect(getShortCompanyName('Allianz Group')).toBe('Allianz')
  })

  it('matches partial name: axa', () => {
    expect(getShortCompanyName('AXA Group Insurance')).toBe('AXA Sigorta')
  })

  it('matches partial name: mapfre', () => {
    expect(getShortCompanyName('Mapfre Insurance')).toBe('Mapfre')
  })

  it('matches partial name: sompo', () => {
    expect(getShortCompanyName('Sompo Holdings')).toBe('Sompo')
  })

  it('matches partial name: zurich/zürich', () => {
    expect(getShortCompanyName('Zurich Insurance Group')).toBe('Zurich')
    expect(getShortCompanyName('Zürich Insurance')).toBe('Zurich')
  })

  it('matches partial name: hdi', () => {
    expect(getShortCompanyName('HDI Global Specialty')).toBe('HDI Sigorta')
  })

  it('matches partial name: groupama', () => {
    expect(getShortCompanyName('Groupama Assurances')).toBe('Groupama')
  })

  it('matches partial name: güneş/gunes', () => {
    expect(getShortCompanyName('Güneş Insurance')).toBe('Güneş Sigorta')
    expect(getShortCompanyName('Gunes Insurance')).toBe('Güneş Sigorta')
  })

  it('matches partial name: ergo', () => {
    expect(getShortCompanyName('Ergo Insurance')).toBe('Ergo')
  })

  it('matches partial name: halk', () => {
    expect(getShortCompanyName('Halk Insurance')).toBe('Halk Sigorta')
  })

  it('matches partial name: ray', () => {
    expect(getShortCompanyName('Ray Sigorta Company')).toBe('Ray Sigorta')
  })

  it('matches partial name: quick', () => {
    expect(getShortCompanyName('Quick Insurance Co.')).toBe('Quick Sigorta')
  })

  it('matches partial name: neova', () => {
    expect(getShortCompanyName('Neova Insurance Co.')).toBe('Neova')
  })

  it('matches partial name: eureko', () => {
    expect(getShortCompanyName('Eureko Insurance Co.')).toBe('Eureko')
  })

  it('matches partial name: nippon', () => {
    expect(getShortCompanyName('Nippon Insurance Co.')).toBe('Türk Nippon')
  })

  it('matches partial name: cardif/bnp', () => {
    expect(getShortCompanyName('BNP Paribas Cardif')).toBe('BNP Cardif')
    expect(getShortCompanyName('Cardif Insurance')).toBe('BNP Cardif')
  })

  it('matches partial name: cigna', () => {
    expect(getShortCompanyName('Cigna Health')).toBe('Cigna')
  })

  it('returns short names as-is (<= 20 chars)', () => {
    expect(getShortCompanyName('Test Insurance')).toBe('Test Insurance')
  })

  it('removes common suffixes for longer names', () => {
    expect(getShortCompanyName('YENI ÖZEL SİGORTA A.Ş.')).toBe('YENI ÖZEL SİGORTA')
  })

  it('truncates to first two words when still too long', () => {
    const longName = 'VERY LONG COMPANY NAME THAT IS TOO LONG TO DISPLAY PROPERLY'
    const result = getShortCompanyName(longName)
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(2)
  })
})

// ==================================================================
// getCoverageType
// ==================================================================
describe('getCoverageType', () => {
  it('returns limit for traffic', () => {
    expect(getCoverageType('traffic')).toBe('limit')
  })

  it('returns sumInsured for kasko, home, dask, business', () => {
    expect(getCoverageType('kasko')).toBe('sumInsured')
    expect(getCoverageType('home')).toBe('sumInsured')
    expect(getCoverageType('dask')).toBe('sumInsured')
    expect(getCoverageType('business')).toBe('sumInsured')
  })

  it('returns benefit for health, life', () => {
    expect(getCoverageType('health')).toBe('benefit')
    expect(getCoverageType('life')).toBe('benefit')
  })
})

// ==================================================================
// getMainCoverageValue
// ==================================================================
describe('getMainCoverageValue', () => {
  it('returns coverage field for non-limit types', () => {
    const policy = makePolicy({ type: 'kasko', coverage: 500000 })
    expect(getMainCoverageValue(policy)).toBe(500000)
  })

  it('returns coverage field for health', () => {
    const policy = makePolicy({ type: 'health', coverage: 200000 })
    expect(getMainCoverageValue(policy)).toBe(200000)
  })

  it('returns highest relevant limit for traffic with bodily injury coverages', () => {
    const policy = makePolicy({
      type: 'traffic',
      coverage: 100000,
      coverages: [
        {
          name: 'Material Damage',
          nameTr: 'Maddi Hasar',
          limit: 300000,
          deductible: 0,
          included: true,
        },
        {
          name: 'Bodily Injury per Accident',
          nameTr: 'Kaza Başı Ölüm/Sakatlık',
          limit: 2700000,
          deductible: 0,
          included: true,
        },
        { name: 'Death', nameTr: 'Ölüm Teminatı', limit: 1500000, deductible: 0, included: true },
      ],
    })
    expect(getMainCoverageValue(policy)).toBe(2700000)
  })

  it('falls back to highest included limit when no relevant coverages match', () => {
    const policy = makePolicy({
      type: 'traffic',
      coverage: 50000,
      coverages: [
        {
          name: 'Legal Aid',
          nameTr: 'Hukuki Yardım',
          limit: 200000,
          deductible: 0,
          included: true,
        },
        { name: 'Towing', nameTr: 'Çekici', limit: 10000, deductible: 0, included: true },
      ],
    })
    expect(getMainCoverageValue(policy)).toBe(200000)
  })

  it('falls back to coverage field when no included coverages have positive limits', () => {
    const policy = makePolicy({
      type: 'traffic',
      coverage: 75000,
      coverages: [{ name: 'Test', nameTr: 'Test', limit: 0, deductible: 0, included: true }],
    })
    expect(getMainCoverageValue(policy)).toBe(75000)
  })

  it('returns coverage field for traffic with empty coverages array', () => {
    const policy = makePolicy({ type: 'traffic', coverage: 60000, coverages: [] })
    expect(getMainCoverageValue(policy)).toBe(60000)
  })

  it('returns coverage field for traffic with no coverages', () => {
    const policy = makePolicy({ type: 'traffic', coverage: 60000, coverages: undefined as any })
    expect(getMainCoverageValue(policy)).toBe(60000)
  })
})

// ==================================================================
// getInsuredSubject
// ==================================================================
describe('getInsuredSubject', () => {
  it('returns plate from vehicleInfo for kasko', () => {
    const policy = makePolicy({ type: 'kasko', vehicleInfo: { plate: '34 ABC 1234' } })
    expect(getInsuredSubject(policy)).toBe('34 ABC 1234')
  })

  it('returns plate from vehicleInfo for traffic', () => {
    const policy = makePolicy({ type: 'traffic', vehicleInfo: { plate: '06 XY 789' } })
    expect(getInsuredSubject(policy)).toBe('06 XY 789')
  })

  it('extracts plate from coverage descriptions', () => {
    const policy = makePolicy({
      type: 'kasko',
      coverages: [
        {
          name: 'Test',
          nameTr: 'Test',
          limit: 0,
          deductible: 0,
          included: true,
          description: 'Plaka: 34 AB 1234 sigorta',
        },
      ],
    })
    expect(getInsuredSubject(policy)).toBe('34 AB 1234')
  })

  it('extracts plate from special conditions', () => {
    const policy = makePolicy({
      type: 'traffic',
      specialConditions: ['Bu poliçe 06 XYZ 78 plaka için geçerlidir'],
    })
    expect(getInsuredSubject(policy)).toBe('06 XYZ 78')
  })

  it('returns vehicle make and model as fallback for kasko', () => {
    const policy = makePolicy({ type: 'kasko', vehicleInfo: { make: 'Toyota', model: 'Corolla' } })
    expect(getInsuredSubject(policy)).toBe('Toyota Corolla')
  })

  it('returns vehicle make as fallback for kasko if no model', () => {
    const policy = makePolicy({ type: 'kasko', vehicleInfo: { make: 'BMW' } })
    expect(getInsuredSubject(policy)).toBe('BMW')
  })

  it('returns vehicle model as fallback for kasko if no make', () => {
    const policy = makePolicy({ type: 'kasko', vehicleInfo: { model: 'Focus' } })
    expect(getInsuredSubject(policy)).toBe('Focus')
  })

  it('returns null for kasko with no subject info', () => {
    const policy = makePolicy({ type: 'kasko' })
    expect(getInsuredSubject(policy)).toBeNull()
  })

  it('returns location for home policy', () => {
    const policy = makePolicy({ type: 'home', location: 'Istanbul, Kadıköy' })
    expect(getInsuredSubject(policy)).toBe('Istanbul, Kadıköy')
  })

  it('returns null for home with no address', () => {
    const policy = makePolicy({ type: 'home', location: undefined as any })
    expect(getInsuredSubject(policy)).toBeNull()
  })

  it('returns insuredPerson for health', () => {
    const policy = makePolicy({ type: 'health', insuredPerson: 'MEHMET' })
    expect(getInsuredSubject(policy)).toBe('MEHMET')
  })

  it('returns null for health with no insuredPerson', () => {
    const policy = makePolicy({ type: 'health', insuredPerson: '' })
    expect(getInsuredSubject(policy)).toBeNull()
  })

  it('returns insuredPerson for life', () => {
    const policy = makePolicy({ type: 'life', insuredPerson: 'ALI' })
    expect(getInsuredSubject(policy)).toBe('ALI')
  })

  it('returns null for unknown policy type', () => {
    const policy = makePolicy({ type: 'nakliyat' as any })
    expect(getInsuredSubject(policy)).toBeNull()
  })

  it('handles null coverages in extractPlateFromCoverages', () => {
    const policy = makePolicy({ type: 'kasko', coverages: null as any })
    expect(getInsuredSubject(policy)).toBeNull()
  })

  it('handles null specialConditions in extractPlateFromConditions', () => {
    const policy = makePolicy({ type: 'traffic', specialConditions: null as any })
    expect(getInsuredSubject(policy)).toBeNull()
  })
})

// ==================================================================
// getSubjectDisplay
// ==================================================================
describe('getSubjectDisplay', () => {
  it('returns null when no subject and no insuredPerson', () => {
    const policy = makePolicy({ type: 'nakliyat' as any, insuredPerson: '' })
    expect(getSubjectDisplay(policy)).toBeNull()
  })

  it('falls back to insuredPerson when no specific subject', () => {
    const policy = makePolicy({ type: 'nakliyat' as any, insuredPerson: 'AHMET' })
    const display = getSubjectDisplay(policy)
    expect(display).toEqual({ label: 'Insured', value: 'AHMET' })
  })

  it('uses Turkish label for insuredPerson fallback', () => {
    const policy = makePolicy({ type: 'nakliyat' as any, insuredPerson: 'AHMET' })
    const display = getSubjectDisplay(policy, 'tr')
    expect(display).toEqual({ label: 'Sigortalı', value: 'AHMET' })
  })

  it('shows plate label for kasko with plate number', () => {
    const policy = makePolicy({ type: 'kasko', vehicleInfo: { plate: '34 ABC 1234' } })
    const display = getSubjectDisplay(policy)
    expect(display?.label).toBe('Plate')
    expect(display?.value).toBe('34 ABC 1234')
  })

  it('shows Plaka label for kasko with plate number in Turkish', () => {
    const policy = makePolicy({ type: 'kasko', vehicleInfo: { plate: '34 ABC 1234' } })
    const display = getSubjectDisplay(policy, 'tr')
    expect(display?.label).toBe('Plaka')
  })

  it('shows Vehicle label for kasko with vehicle model (not plate)', () => {
    const policy = makePolicy({ type: 'kasko', vehicleInfo: { make: 'Toyota', model: 'Corolla' } })
    const display = getSubjectDisplay(policy)
    expect(display?.label).toBe('Vehicle')
    expect(display?.value).toBe('Toyota Corolla')
  })

  it('shows Araç label for kasko with vehicle model in Turkish', () => {
    const policy = makePolicy({ type: 'kasko', vehicleInfo: { make: 'BMW', model: 'X5' } })
    const display = getSubjectDisplay(policy, 'tr')
    expect(display?.label).toBe('Araç')
  })

  it('shows Address label for home policy', () => {
    const policy = makePolicy({ type: 'home', location: 'Istanbul' })
    const display = getSubjectDisplay(policy)
    expect(display?.label).toBe('Address')
  })

  it('shows Adres label for dask in Turkish', () => {
    const policy = makePolicy({ type: 'dask', location: 'Ankara' })
    const display = getSubjectDisplay(policy, 'tr')
    expect(display?.label).toBe('Adres')
  })

  it('truncates long addresses', () => {
    const longAddress = 'A'.repeat(50)
    const policy = makePolicy({ type: 'home', location: longAddress })
    const display = getSubjectDisplay(policy)
    expect(display?.value).toBe(longAddress.substring(0, 30) + '...')
  })

  it('does not truncate short addresses', () => {
    const policy = makePolicy({ type: 'home', location: 'Istanbul' })
    const display = getSubjectDisplay(policy)
    expect(display?.value).toBe('Istanbul')
  })

  it('shows Business/İşyeri label for business', () => {
    const policy = makePolicy({ type: 'business', location: 'Bursa' })
    expect(getSubjectDisplay(policy)?.label).toBe('Business')
    expect(getSubjectDisplay(policy, 'tr')?.label).toBe('İşyeri')
  })

  it('truncates long business addresses', () => {
    const policy = makePolicy({ type: 'business', location: 'B'.repeat(40) })
    expect(getSubjectDisplay(policy)?.value.endsWith('...')).toBe(true)
  })

  it('returns Insured for health/life with insuredPerson as subject', () => {
    const policy = makePolicy({ type: 'health', insuredPerson: 'MEHMET' })
    const display = getSubjectDisplay(policy)
    expect(display?.label).toBe('Insured')
    expect(display?.value).toBe('MEHMET')
  })
})
