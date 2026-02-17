/**
 * Tests for Insurance Display Utilities
 * Covers: getShortCompanyName, getCoverageType, getMainCoverageValue,
 *         getInsuredSubject, getSubjectDisplay
 */

import { describe, it, expect } from 'vitest'
import {
  getShortCompanyName,
  getCoverageType,
  getMainCoverageValue,
  getInsuredSubject,
  getSubjectDisplay,
} from '@/lib/insurance-display'
import type { AnalyzedPolicy, PolicyType, Coverage } from '@/types/policy'

// ---------------------------------------------------------------------------
// Helper: create a minimal AnalyzedPolicy stub with defaults
// ---------------------------------------------------------------------------
function makePolicy(overrides: Partial<AnalyzedPolicy> & { type: PolicyType }): AnalyzedPolicy {
  return {
    id: 'test-id',
    policyNumber: 'POL-001',
    provider: 'Test Provider',
    logo: '',
    typeTr: 'Test',
    coverage: 100000,
    premium: 5000,
    monthlyPremium: 417,
    deductible: 0,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    uploadDate: '2026-01-01',
    fileName: 'test.pdf',
    documentType: 'policy',
    coverages: [],
    exclusions: [],
    specialConditions: [],
    insuranceLine: 'test',
    aiConfidence: 0.9,
    aiInsights: [],
    ...overrides,
  }
}

function makeCoverage(overrides: Partial<Coverage> = {}): Coverage {
  return {
    name: 'Test Coverage',
    nameTr: 'Test Teminat',
    limit: 0,
    deductible: 0,
    included: true,
    ...overrides,
  }
}

// ===========================================================================
// getShortCompanyName
// ===========================================================================
describe('getShortCompanyName', () => {
  // -----------------------------------------------------------------------
  // Exact match (case-insensitive) via COMPANY_SHORT_NAMES lookup
  // -----------------------------------------------------------------------
  describe('exact match via lookup table', () => {
    it('returns short name for Anadolu with Turkish characters', () => {
      expect(getShortCompanyName('ANADOLU ANONİM TÜRK SİGORTA ŞİRKETİ')).toBe('Anadolu Sigorta')
    })

    it('returns short name for Anadolu without Turkish characters', () => {
      expect(getShortCompanyName('ANADOLU ANONIM TÜRK SİGORTA ŞİRKETİ')).toBe('Anadolu Sigorta')
    })

    it('matches case-insensitively', () => {
      expect(getShortCompanyName('aksigorta a.ş.')).toBe('Aksigorta')
    })

    it('matches with leading/trailing whitespace', () => {
      expect(getShortCompanyName('  ALLİANZ SİGORTA A.Ş.  ')).toBe('Allianz')
    })

    it('returns short name for AXA with Turkish chars', () => {
      expect(getShortCompanyName('AXA SİGORTA A.Ş.')).toBe('AXA Sigorta')
    })

    it('returns short name for AXA without Turkish chars', () => {
      expect(getShortCompanyName('AXA SIGORTA A.Ş.')).toBe('AXA Sigorta')
    })

    it('returns short name for Mapfre', () => {
      expect(getShortCompanyName('MAPFRE SİGORTA A.Ş.')).toBe('Mapfre')
    })

    it('returns short name for Sompo Japan', () => {
      expect(getShortCompanyName('SOMPO JAPAN SİGORTA A.Ş.')).toBe('Sompo Japan')
    })

    it('returns short name for plain Sompo', () => {
      expect(getShortCompanyName('SOMPO SİGORTA A.Ş.')).toBe('Sompo')
    })

    it('returns short name for Zurich with Turkish İ', () => {
      expect(getShortCompanyName('ZURİCH SİGORTA A.Ş.')).toBe('Zurich')
    })

    it('returns short name for Zurich without Turkish chars', () => {
      expect(getShortCompanyName('ZURICH SIGORTA A.Ş.')).toBe('Zurich')
    })

    it('returns short name for HDI', () => {
      expect(getShortCompanyName('HDI SİGORTA A.Ş.')).toBe('HDI Sigorta')
    })

    it('returns short name for Groupama', () => {
      expect(getShortCompanyName('GROUPAMA SİGORTA A.Ş.')).toBe('Groupama')
    })

    it('returns short name for Turk Nippon', () => {
      expect(getShortCompanyName('TÜRK NİPPON SİGORTA A.Ş.')).toBe('Türk Nippon')
    })

    it('returns short name for Gunes Sigorta', () => {
      expect(getShortCompanyName('GÜNEŞ SİGORTA A.Ş.')).toBe('Güneş Sigorta')
    })

    it('returns short name for Gunes without Turkish chars', () => {
      expect(getShortCompanyName('GUNES SIGORTA A.Ş.')).toBe('Güneş Sigorta')
    })

    it('returns short name for Eureko', () => {
      expect(getShortCompanyName('EUREKO SİGORTA A.Ş.')).toBe('Eureko')
    })

    it('returns short name for Ergo', () => {
      expect(getShortCompanyName('ERGO SİGORTA A.Ş.')).toBe('Ergo')
    })

    it('returns short name for Halk Sigorta', () => {
      expect(getShortCompanyName('HALK SİGORTA A.Ş.')).toBe('Halk Sigorta')
    })

    it('returns short name for Ray Sigorta', () => {
      expect(getShortCompanyName('RAY SİGORTA A.Ş.')).toBe('Ray Sigorta')
    })

    it('returns short name for Turk Sigorta', () => {
      expect(getShortCompanyName('TÜRK SİGORTA A.Ş.')).toBe('Türk Sigorta')
    })

    it('returns short name for Doga Sigorta', () => {
      expect(getShortCompanyName('DOĞA SİGORTA A.Ş.')).toBe('Doğa Sigorta')
    })

    it('returns short name for Neova', () => {
      expect(getShortCompanyName('NEOVA SİGORTA A.Ş.')).toBe('Neova')
    })

    it('returns short name for Quick Sigorta', () => {
      expect(getShortCompanyName('QUICK SİGORTA A.Ş.')).toBe('Quick Sigorta')
    })

    it('returns short name for Hepiyi', () => {
      expect(getShortCompanyName('HEPIYI SİGORTA A.Ş.')).toBe('Hepiyi')
    })

    it('returns short name for Magdeburger', () => {
      expect(getShortCompanyName('MAGDEBURGER SİGORTA A.Ş.')).toBe('Magdeburger')
    })

    it('returns short name for Ankara Sigorta', () => {
      expect(getShortCompanyName('ANKARA ANONİM TÜRK SİGORTA ŞİRKETİ')).toBe('Ankara Sigorta')
    })

    it('returns short name for BNP Cardif', () => {
      expect(getShortCompanyName('BNP PARIBAS CARDIF SİGORTA A.Ş.')).toBe('BNP Cardif')
    })

    it('returns short name for Cigna', () => {
      expect(getShortCompanyName('CIGNA SAĞLIK HAYAT VE EMEKLİLİK A.Ş.')).toBe('Cigna')
    })

    it('returns short name for Cigna without Turkish chars', () => {
      expect(getShortCompanyName('CIGNA SAGLIK HAYAT VE EMEKLILIK A.Ş.')).toBe('Cigna')
    })
  })

  // -----------------------------------------------------------------------
  // Partial match fallback
  // -----------------------------------------------------------------------
  describe('partial matching', () => {
    it('matches partial "anadolu" in longer string', () => {
      expect(getShortCompanyName('Anadolu Hayat ve Emeklilik Anonim Sirketi')).toBe('Anadolu Sigorta')
    })

    it('matches partial "aksigorta"', () => {
      expect(getShortCompanyName('Aksigorta Genel Mudurlugu')).toBe('Aksigorta')
    })

    it('matches partial "allianz"', () => {
      expect(getShortCompanyName('Allianz Hayat ve Emeklilik')).toBe('Allianz')
    })

    it('matches partial "axa"', () => {
      expect(getShortCompanyName('AXA Hayat ve Emeklilik A.S.')).toBe('AXA Sigorta')
    })

    it('matches partial "mapfre"', () => {
      expect(getShortCompanyName('Mapfre Genel Sigorta')).toBe('Mapfre')
    })

    it('matches partial "sompo"', () => {
      expect(getShortCompanyName('Sompo Japan Insurance Inc')).toBe('Sompo')
    })

    it('matches partial "zurich"', () => {
      expect(getShortCompanyName('Zurich Insurance Group')).toBe('Zurich')
    })

    it('matches partial "zürich" with Turkish u', () => {
      expect(getShortCompanyName('Zürich Sigorta Genel')).toBe('Zurich')
    })

    it('matches partial "hdi"', () => {
      expect(getShortCompanyName('HDI Versicherung AG Turkey')).toBe('HDI Sigorta')
    })

    it('matches partial "groupama"', () => {
      expect(getShortCompanyName('Groupama Genel Sigorta A.S.')).toBe('Groupama')
    })

    it('matches partial "güneş" with Turkish chars', () => {
      expect(getShortCompanyName('Güneş Hayat Sigorta Turkey')).toBe('Güneş Sigorta')
    })

    it('matches partial "gunes" without Turkish chars', () => {
      expect(getShortCompanyName('Gunes Hayat ve Emeklilik A.S.')).toBe('Güneş Sigorta')
    })

    it('matches partial "ergo"', () => {
      expect(getShortCompanyName('Ergo Versicherung Turkey Branch')).toBe('Ergo')
    })

    it('matches partial "halk"', () => {
      expect(getShortCompanyName('Halk Hayat ve Emeklilik A.S.')).toBe('Halk Sigorta')
    })

    it('matches partial "ray"', () => {
      expect(getShortCompanyName('Ray Insurance International')).toBe('Ray Sigorta')
    })

    it('matches partial "quick"', () => {
      expect(getShortCompanyName('Quick Insurance Solutions')).toBe('Quick Sigorta')
    })

    it('matches partial "neova"', () => {
      expect(getShortCompanyName('Neova Insurance Company Ltd')).toBe('Neova')
    })

    it('matches partial "eureko"', () => {
      expect(getShortCompanyName('Eureko Emeklilik ve Hayat')).toBe('Eureko')
    })

    it('matches partial "nippon"', () => {
      expect(getShortCompanyName('Nippon Insurance Holdings Ltd')).toBe('Türk Nippon')
    })

    it('matches partial "cardif"', () => {
      expect(getShortCompanyName('Cardif Insurance Services')).toBe('BNP Cardif')
    })

    it('matches partial "bnp"', () => {
      expect(getShortCompanyName('BNP Sigorta ve Hayat Ltd')).toBe('BNP Cardif')
    })

    it('matches partial "cigna"', () => {
      expect(getShortCompanyName('Cigna Health Insurance Turkey')).toBe('Cigna')
    })
  })

  // -----------------------------------------------------------------------
  // Short names returned as-is (<= 20 chars)
  // -----------------------------------------------------------------------
  describe('short names returned as-is', () => {
    it('returns names <= 20 chars unchanged', () => {
      expect(getShortCompanyName('Some Insurer')).toBe('Some Insurer')
    })

    it('returns exactly 20 char name unchanged', () => {
      const name = '12345678901234567890' // exactly 20 chars
      expect(getShortCompanyName(name)).toBe(name)
    })

    it('returns empty string as-is', () => {
      expect(getShortCompanyName('')).toBe('')
    })
  })

  // -----------------------------------------------------------------------
  // Suffix removal fallback for names > 20 chars
  // -----------------------------------------------------------------------
  describe('suffix removal for long unknown names', () => {
    it('removes A.Ş. suffix', () => {
      expect(getShortCompanyName('SOME UNKNOWN INSURANCE CO A.Ş.')).toBe('SOME UNKNOWN')
    })

    it('removes AŞ suffix without dots', () => {
      expect(getShortCompanyName('SOME UNKNOWN INSURANCE COMPANY AŞ')).toBe('SOME UNKNOWN')
    })

    it('removes ANONİM ŞİRKETİ suffix', () => {
      expect(getShortCompanyName('SPECIAL INSURANCE COMPANY ANONİM ŞİRKETİ')).toBe('SPECIAL INSURANCE')
    })

    it('removes ANONIM ŞİRKETİ suffix (without Turkish i)', () => {
      expect(getShortCompanyName('SPECIAL INSURANCE COMPANY ANONIM ŞİRKETİ')).toBe('SPECIAL INSURANCE')
    })

    it('removes SİGORTA ŞİRKETİ suffix', () => {
      expect(getShortCompanyName('MEGA BRAND CORPORATE SİGORTA ŞİRKETİ')).toBe('MEGA BRAND CORPORATE')
    })

    it('removes SIGORTA ŞİRKETİ suffix (no Turkish i)', () => {
      // After removing "SIGORTA ŞİRKETİ", result is "MEGA BRAND CORPORATE" (20 chars) which is <= 20
      expect(getShortCompanyName('MEGA BRAND CORPORATE SIGORTA ŞİRKETİ')).toBe('MEGA BRAND CORPORATE')
    })

    it('removes TÜRK SİGORTA suffix', () => {
      expect(getShortCompanyName('MEGA BRAND CORPORATE TÜRK SİGORTA')).toBe('MEGA BRAND CORPORATE')
    })

    it('removes TURK SIGORTA suffix (no Turkish chars)', () => {
      expect(getShortCompanyName('MEGA BRAND CORPORATE TURK SIGORTA')).toBe('MEGA BRAND CORPORATE')
    })

    it('truncates to first two words if still > 20 chars after suffix removal', () => {
      // After suffix removal, if still > 20, take first 2 words
      const longName = 'VERYLONGINSURANCE COMPANY INTERNATIONAL HOLDINGS LTD OPERATIONS'
      const result = getShortCompanyName(longName)
      expect(result).toBe('VERYLONGINSURANCE COMPANY')
    })

    it('after suffix removal result is <= 20 chars, returns it directly', () => {
      // 'BRAND X CORP' is 12 chars, <= 20
      expect(getShortCompanyName('BRAND X CORP ANONIM ŞİRKETİ')).toBe('BRAND X CORP')
    })
  })
})

// ===========================================================================
// getCoverageType
// ===========================================================================
describe('getCoverageType', () => {
  it('returns "limit" for traffic policies', () => {
    expect(getCoverageType('traffic')).toBe('limit')
  })

  it('returns "sumInsured" for kasko policies', () => {
    expect(getCoverageType('kasko')).toBe('sumInsured')
  })

  it('returns "sumInsured" for home policies', () => {
    expect(getCoverageType('home')).toBe('sumInsured')
  })

  it('returns "sumInsured" for dask policies', () => {
    expect(getCoverageType('dask')).toBe('sumInsured')
  })

  it('returns "sumInsured" for business policies', () => {
    expect(getCoverageType('business')).toBe('sumInsured')
  })

  it('returns "benefit" for health policies', () => {
    expect(getCoverageType('health')).toBe('benefit')
  })

  it('returns "benefit" for life policies', () => {
    expect(getCoverageType('life')).toBe('benefit')
  })

  it('returns "benefit" for nakliyat policies (fallthrough)', () => {
    expect(getCoverageType('nakliyat')).toBe('benefit')
  })
})

// ===========================================================================
// getMainCoverageValue
// ===========================================================================
describe('getMainCoverageValue', () => {
  describe('traffic (limit-based) policies', () => {
    it('returns highest bodily injury limit from relevant coverages (Turkish names)', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ nameTr: 'Kaza başı ölüm', limit: 2700000, included: true }),
          makeCoverage({ nameTr: 'Kaza başı sakatlık', limit: 13500000, included: true }),
          makeCoverage({ nameTr: 'Maddi hasar', limit: 600000, included: true }),
        ],
      })
      expect(getMainCoverageValue(policy)).toBe(13500000)
    })

    it('matches "ölüm" in coverage nameTr', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ nameTr: 'Ölüm teminatı', limit: 5000000, included: true }),
          makeCoverage({ nameTr: 'Maddi', limit: 600000, included: true }),
        ],
      })
      expect(getMainCoverageValue(policy)).toBe(5000000)
    })

    it('matches "kaza başı" in coverage nameTr', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ nameTr: 'Kaza başı limit', limit: 8000000, included: true }),
        ],
      })
      expect(getMainCoverageValue(policy)).toBe(8000000)
    })

    it('matches English "death" in coverage name', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ name: 'Death per accident', limit: 2700000, included: true }),
          makeCoverage({ name: 'Property damage', limit: 600000, included: true }),
        ],
      })
      expect(getMainCoverageValue(policy)).toBe(2700000)
    })

    it('matches English "bodily" in coverage name', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ name: 'Bodily injury', limit: 5000000, included: true }),
        ],
      })
      expect(getMainCoverageValue(policy)).toBe(5000000)
    })

    it('matches English "per accident" in coverage name', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ name: 'Limit per accident', limit: 10000000, included: true }),
        ],
      })
      expect(getMainCoverageValue(policy)).toBe(10000000)
    })

    it('skips non-included coverages when searching for relevant ones', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ nameTr: 'Ölüm teminatı', limit: 9000000, included: false }),
          makeCoverage({ nameTr: 'Maddi hasar', limit: 600000, included: true }),
        ],
      })
      // The olum coverage is not included, so falls back to highest included limit
      expect(getMainCoverageValue(policy)).toBe(600000)
    })

    it('skips coverages with limit 0 in relevant filter', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ nameTr: 'Ölüm teminatı', limit: 0, included: true }),
          makeCoverage({ nameTr: 'Maddi', limit: 600000, included: true }),
        ],
      })
      // Olum has limit 0, excluded from relevant. Falls back to max included limit.
      expect(getMainCoverageValue(policy)).toBe(600000)
    })

    it('falls back to highest included limit when no relevant bodily injury coverages', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ nameTr: 'Maddi hasar kişi', name: 'Material damage per person', limit: 600000, included: true }),
          makeCoverage({ nameTr: 'Maddi hasar toplam', name: 'Material damage total', limit: 300000, included: true }),
        ],
      })
      // No relevant coverages match (no olum, sakatlik, kaza basi, death, bodily, per accident)
      // Falls back to highest included limit overall
      expect(getMainCoverageValue(policy)).toBe(600000)
    })

    it('falls back to policy.coverage when all included coverages have limit 0', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ nameTr: 'Something', limit: 0, included: true }),
        ],
      })
      // maxLimit is -Infinity from empty filtered array, or 0 via filter
      // Actually: filter keeps included ones, maps to limit, max of [0] = 0
      // 0 > 0 is false, so returns policy.coverage
      expect(getMainCoverageValue(policy)).toBe(300000)
    })

    it('falls back to policy.coverage when no included coverages exist (all excluded)', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [
          makeCoverage({ nameTr: 'Something', limit: 500000, included: false }),
        ],
      })
      // filter(c => c.included) yields empty, Math.max(...[]) = -Infinity
      // -Infinity > 0 is false, so returns policy.coverage
      expect(getMainCoverageValue(policy)).toBe(300000)
    })

    it('returns policy.coverage when coverages array is empty', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverage: 300000,
        coverages: [],
      })
      expect(getMainCoverageValue(policy)).toBe(300000)
    })
  })

  describe('sum insured (kasko, home, dask, business) policies', () => {
    it('returns coverage field for kasko', () => {
      const policy = makePolicy({ type: 'kasko', coverage: 500000 })
      expect(getMainCoverageValue(policy)).toBe(500000)
    })

    it('returns coverage field for home', () => {
      const policy = makePolicy({ type: 'home', coverage: 1200000 })
      expect(getMainCoverageValue(policy)).toBe(1200000)
    })

    it('returns coverage field for dask', () => {
      const policy = makePolicy({ type: 'dask', coverage: 640000 })
      expect(getMainCoverageValue(policy)).toBe(640000)
    })

    it('returns coverage field for business', () => {
      const policy = makePolicy({ type: 'business', coverage: 2000000 })
      expect(getMainCoverageValue(policy)).toBe(2000000)
    })
  })

  describe('benefit-based (health, life) policies', () => {
    it('returns coverage field for health', () => {
      const policy = makePolicy({ type: 'health', coverage: 750000 })
      expect(getMainCoverageValue(policy)).toBe(750000)
    })

    it('returns coverage field for life', () => {
      const policy = makePolicy({ type: 'life', coverage: 1000000 })
      expect(getMainCoverageValue(policy)).toBe(1000000)
    })

    it('returns coverage field for nakliyat', () => {
      const policy = makePolicy({ type: 'nakliyat', coverage: 350000 })
      expect(getMainCoverageValue(policy)).toBe(350000)
    })
  })
})

// ===========================================================================
// getInsuredSubject
// ===========================================================================
describe('getInsuredSubject', () => {
  // -----------------------------------------------------------------------
  // Auto policies (kasko, traffic) - plate number extraction
  // -----------------------------------------------------------------------
  describe('kasko/traffic - plate number from raw_data', () => {
    it('returns plateNumber from raw_data', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as AnalyzedPolicy & { raw_data: Record<string, unknown> }
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { plateNumber: '34 ABC 1234' }
      expect(getInsuredSubject(policy)).toBe('34 ABC 1234')
    })

    it('returns vehiclePlate from raw_data', () => {
      const policy = makePolicy({ type: 'traffic' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { vehiclePlate: '06 XY 789' }
      expect(getInsuredSubject(policy)).toBe('06 XY 789')
    })

    it('returns plaka from raw_data', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { plaka: '35 DEF 456' }
      expect(getInsuredSubject(policy)).toBe('35 DEF 456')
    })

    it('prefers plateNumber over vehiclePlate', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = {
        plateNumber: '34 ABC 1234',
        vehiclePlate: '06 XY 789',
      }
      expect(getInsuredSubject(policy)).toBe('34 ABC 1234')
    })
  })

  describe('kasko/traffic - plate from coverage descriptions', () => {
    it('extracts plate number from coverage description', () => {
      const policy = makePolicy({
        type: 'kasko',
        coverages: [
          makeCoverage({ description: 'Kasko for vehicle 34 ABC 1234 comprehensive' }),
        ],
      })
      expect(getInsuredSubject(policy)).toBe('34 ABC 1234')
    })

    it('normalizes whitespace in extracted plate', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverages: [
          makeCoverage({ description: 'Policy for 06  XY  789 vehicle' }),
        ],
      })
      expect(getInsuredSubject(policy)).toBe('06 XY 789')
    })

    it('returns null when no plate pattern found in coverages', () => {
      const policy = makePolicy({
        type: 'kasko',
        coverages: [
          makeCoverage({ description: 'General coverage without plate info' }),
        ],
      })
      expect(getInsuredSubject(policy)).toBeNull()
    })

    it('handles coverage with undefined description', () => {
      const policy = makePolicy({
        type: 'kasko',
        coverages: [
          makeCoverage({ description: undefined }),
        ],
      })
      expect(getInsuredSubject(policy)).toBeNull()
    })

    it('handles null/undefined coverages array in extractPlateFromCoverages', () => {
      const policy = makePolicy({
        type: 'kasko',
        coverages: undefined as unknown as Coverage[],
      })
      expect(getInsuredSubject(policy)).toBeNull()
    })
  })

  describe('kasko/traffic - plate from special conditions', () => {
    it('extracts plate number from special conditions', () => {
      const policy = makePolicy({
        type: 'traffic',
        specialConditions: [
          'This policy covers vehicle with plate 34 AB 5678',
        ],
      })
      expect(getInsuredSubject(policy)).toBe('34 AB 5678')
    })

    it('normalizes whitespace in plate from conditions', () => {
      const policy = makePolicy({
        type: 'kasko',
        specialConditions: [
          'Plate: 06  ABC  12',
        ],
      })
      expect(getInsuredSubject(policy)).toBe('06 ABC 12')
    })

    it('handles null/undefined special conditions in extractPlateFromConditions', () => {
      const policy = makePolicy({
        type: 'kasko',
        specialConditions: undefined as unknown as string[],
      })
      expect(getInsuredSubject(policy)).toBeNull()
    })
  })

  describe('kasko/traffic - vehicle info fallback from raw_data', () => {
    it('returns vehicleModel from raw_data when no plate found', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { vehicleModel: 'Toyota Corolla 2024' }
      expect(getInsuredSubject(policy)).toBe('Toyota Corolla 2024')
    })

    it('returns vehicleBrand from raw_data when no plate or model found', () => {
      const policy = makePolicy({ type: 'traffic' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { vehicleBrand: 'Honda' }
      expect(getInsuredSubject(policy)).toBe('Honda')
    })

    it('returns aracModel from raw_data (Turkish field name)', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { aracModel: 'BMW 320i' }
      expect(getInsuredSubject(policy)).toBe('BMW 320i')
    })

    it('prefers plate over vehicle info', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = {
        plateNumber: '34 ABC 1234',
        vehicleModel: 'Toyota Corolla',
      }
      expect(getInsuredSubject(policy)).toBe('34 ABC 1234')
    })
  })

  // -----------------------------------------------------------------------
  // Property policies (home, dask, business)
  // -----------------------------------------------------------------------
  describe('home/dask/business - address extraction', () => {
    it('returns policy.location for home policy', () => {
      const policy = makePolicy({
        type: 'home',
        location: 'Kadikoy, Istanbul',
      })
      expect(getInsuredSubject(policy)).toBe('Kadikoy, Istanbul')
    })

    it('returns policy.location for dask policy', () => {
      const policy = makePolicy({
        type: 'dask',
        location: 'Besiktas, Istanbul',
      })
      expect(getInsuredSubject(policy)).toBe('Besiktas, Istanbul')
    })

    it('returns policy.location for business policy', () => {
      const policy = makePolicy({
        type: 'business',
        location: 'Sisli Plaza, Istanbul',
      })
      expect(getInsuredSubject(policy)).toBe('Sisli Plaza, Istanbul')
    })

    it('falls back to propertyAddress from raw_data', () => {
      const policy = makePolicy({ type: 'home' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { propertyAddress: 'Ataturk Mah, Ankara' }
      expect(getInsuredSubject(policy)).toBe('Ataturk Mah, Ankara')
    })

    it('falls back to riskAddress from raw_data', () => {
      const policy = makePolicy({ type: 'dask' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { riskAddress: 'Izmir Konak' }
      expect(getInsuredSubject(policy)).toBe('Izmir Konak')
    })

    it('falls back to riziko_adresi from raw_data (Turkish field)', () => {
      const policy = makePolicy({ type: 'business' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { riziko_adresi: 'Bursa Merkez' }
      expect(getInsuredSubject(policy)).toBe('Bursa Merkez')
    })

    it('prefers policy.location over raw_data addresses', () => {
      const policy = makePolicy({ type: 'home', location: 'Direct Location' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { propertyAddress: 'Raw Data Address' }
      expect(getInsuredSubject(policy)).toBe('Direct Location')
    })

    it('returns null for property type with no location data', () => {
      const policy = makePolicy({ type: 'home' })
      expect(getInsuredSubject(policy)).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // Health/Life policies - insured person
  // -----------------------------------------------------------------------
  describe('health/life - insured person', () => {
    it('returns insuredPerson for health policy', () => {
      const policy = makePolicy({
        type: 'health',
        insuredPerson: 'Ahmet Yilmaz',
      })
      expect(getInsuredSubject(policy)).toBe('Ahmet Yilmaz')
    })

    it('returns insuredPerson for life policy', () => {
      const policy = makePolicy({
        type: 'life',
        insuredPerson: 'Fatma Demir',
      })
      expect(getInsuredSubject(policy)).toBe('Fatma Demir')
    })

    it('returns null for health policy with no insuredPerson', () => {
      const policy = makePolicy({ type: 'health' })
      expect(getInsuredSubject(policy)).toBeNull()
    })

    it('returns null for life policy with undefined insuredPerson', () => {
      const policy = makePolicy({ type: 'life', insuredPerson: undefined })
      expect(getInsuredSubject(policy)).toBeNull()
    })

    it('returns null for health policy with empty string insuredPerson', () => {
      const policy = makePolicy({ type: 'health', insuredPerson: '' })
      // Empty string is falsy, so returns null
      expect(getInsuredSubject(policy)).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // Other / nakliyat - returns null
  // -----------------------------------------------------------------------
  describe('other policy types', () => {
    it('returns null for nakliyat policy', () => {
      const policy = makePolicy({ type: 'nakliyat' })
      expect(getInsuredSubject(policy)).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // No raw_data at all
  // -----------------------------------------------------------------------
  describe('missing raw_data', () => {
    it('handles policy with no raw_data property for kasko', () => {
      const policy = makePolicy({ type: 'kasko' })
      // raw_data defaults to {} via || {} in the function
      expect(getInsuredSubject(policy)).toBeNull()
    })
  })
})

// ===========================================================================
// getSubjectDisplay
// ===========================================================================
describe('getSubjectDisplay', () => {
  // -----------------------------------------------------------------------
  // null return cases
  // -----------------------------------------------------------------------
  describe('null return', () => {
    it('returns null when no subject and no insuredPerson', () => {
      const policy = makePolicy({ type: 'nakliyat' })
      expect(getSubjectDisplay(policy)).toBeNull()
    })

    it('returns null when no subject and no insuredPerson for home without location', () => {
      const policy = makePolicy({ type: 'home' })
      expect(getSubjectDisplay(policy)).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // Fallback to insuredPerson when subject is null
  // -----------------------------------------------------------------------
  describe('fallback to insuredPerson', () => {
    it('falls back to insuredPerson with English locale', () => {
      const policy = makePolicy({ type: 'nakliyat', insuredPerson: 'Mehmet Oz' })
      expect(getSubjectDisplay(policy, 'en')).toEqual({
        label: 'Insured',
        value: 'Mehmet Oz',
      })
    })

    it('falls back to insuredPerson with Turkish locale', () => {
      const policy = makePolicy({ type: 'nakliyat', insuredPerson: 'Mehmet Oz' })
      expect(getSubjectDisplay(policy, 'tr')).toEqual({
        label: 'Sigortalı',
        value: 'Mehmet Oz',
      })
    })
  })

  // -----------------------------------------------------------------------
  // Auto policies (kasko, traffic) - plate vs vehicle labels
  // -----------------------------------------------------------------------
  describe('kasko/traffic display', () => {
    it('returns Plate label for plate number in EN', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { plateNumber: '34 ABC 1234' }
      expect(getSubjectDisplay(policy, 'en')).toEqual({
        label: 'Plate',
        value: '34 ABC 1234',
      })
    })

    it('returns Plaka label for plate number in TR', () => {
      const policy = makePolicy({ type: 'traffic' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { plateNumber: '06 XY 789' }
      expect(getSubjectDisplay(policy, 'tr')).toEqual({
        label: 'Plaka',
        value: '06 XY 789',
      })
    })

    it('returns Vehicle label when subject is not a plate pattern in EN', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { vehicleModel: 'Toyota Corolla' }
      expect(getSubjectDisplay(policy, 'en')).toEqual({
        label: 'Vehicle',
        value: 'Toyota Corolla',
      })
    })

    it('returns Arac label when subject is not a plate pattern in TR', () => {
      const policy = makePolicy({ type: 'traffic' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { vehicleBrand: 'Honda Civic' }
      expect(getSubjectDisplay(policy, 'tr')).toEqual({
        label: 'Araç',
        value: 'Honda Civic',
      })
    })

    it('defaults to EN locale when locale not specified', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { plateNumber: '34 ABC 1234' }
      const result = getSubjectDisplay(policy)
      expect(result?.label).toBe('Plate')
    })
  })

  // -----------------------------------------------------------------------
  // Home / DASK policies
  // -----------------------------------------------------------------------
  describe('home/dask display', () => {
    it('returns Address label in EN', () => {
      const policy = makePolicy({ type: 'home', location: 'Kadikoy, Istanbul' })
      expect(getSubjectDisplay(policy, 'en')).toEqual({
        label: 'Address',
        value: 'Kadikoy, Istanbul',
      })
    })

    it('returns Adres label in TR', () => {
      const policy = makePolicy({ type: 'dask', location: 'Besiktas, Istanbul' })
      expect(getSubjectDisplay(policy, 'tr')).toEqual({
        label: 'Adres',
        value: 'Besiktas, Istanbul',
      })
    })

    it('truncates address values longer than 30 chars', () => {
      const longAddress = 'Ataturk Mahallesi, Cumhuriyet Caddesi, No: 42, Daire: 5, Kadikoy'
      const policy = makePolicy({ type: 'home', location: longAddress })
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.value).toBe(longAddress.substring(0, 30) + '...')
      expect(result?.value).toHaveLength(33) // 30 chars + "..."
    })

    it('does not truncate address values of exactly 30 chars', () => {
      const exactAddress = '123456789012345678901234567890' // exactly 30
      const policy = makePolicy({ type: 'home', location: exactAddress })
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.value).toBe(exactAddress)
    })

    it('does not truncate address values shorter than 30 chars', () => {
      const shortAddress = 'Kadikoy, Istanbul'
      const policy = makePolicy({ type: 'dask', location: shortAddress })
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.value).toBe(shortAddress)
    })
  })

  // -----------------------------------------------------------------------
  // Business policies
  // -----------------------------------------------------------------------
  describe('business display', () => {
    it('returns Business label in EN', () => {
      const policy = makePolicy({ type: 'business', location: 'Sisli Plaza' })
      expect(getSubjectDisplay(policy, 'en')).toEqual({
        label: 'Business',
        value: 'Sisli Plaza',
      })
    })

    it('returns Isyeri label in TR', () => {
      const policy = makePolicy({ type: 'business', location: 'Sisli Plaza' })
      expect(getSubjectDisplay(policy, 'tr')).toEqual({
        label: 'İşyeri',
        value: 'Sisli Plaza',
      })
    })

    it('truncates long business address values', () => {
      const longAddr = 'Levent Mahallesi, Buyukdere Caddesi, Sisli, Istanbul Turkiye'
      const policy = makePolicy({ type: 'business', location: longAddr })
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.value).toBe(longAddr.substring(0, 30) + '...')
    })

    it('does not truncate short business address', () => {
      const shortAddr = 'Sisli Plaza'
      const policy = makePolicy({ type: 'business', location: shortAddr })
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.value).toBe(shortAddr)
    })
  })

  // -----------------------------------------------------------------------
  // Health / Life policies — uses insuredPerson as subject, so "Insured" label
  // -----------------------------------------------------------------------
  describe('health/life display', () => {
    it('returns Insured label in EN for health', () => {
      const policy = makePolicy({ type: 'health', insuredPerson: 'Ahmet Yilmaz' })
      expect(getSubjectDisplay(policy, 'en')).toEqual({
        label: 'Insured',
        value: 'Ahmet Yilmaz',
      })
    })

    it('returns Sigortali label in TR for life', () => {
      const policy = makePolicy({ type: 'life', insuredPerson: 'Fatma Demir' })
      expect(getSubjectDisplay(policy, 'tr')).toEqual({
        label: 'Sigortalı',
        value: 'Fatma Demir',
      })
    })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles plate number with single letter group', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { plateNumber: '34 A 1234' }
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.label).toBe('Plate')
    })

    it('treats non-plate-format string as Vehicle', () => {
      const policy = makePolicy({ type: 'kasko' }) as unknown as { raw_data: Record<string, unknown> } & AnalyzedPolicy
      ;(policy as unknown as { raw_data: Record<string, unknown> }).raw_data = { vehicleModel: 'Renault Megane 2024' }
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.label).toBe('Vehicle')
    })

    it('health with no subject but with insuredPerson falls back', () => {
      // health returns insuredPerson from getInsuredSubject, not null
      // so it goes to the default branch, not the fallback branch
      const policy = makePolicy({ type: 'health', insuredPerson: 'Test Person' })
      const result = getSubjectDisplay(policy, 'en')
      expect(result).toEqual({ label: 'Insured', value: 'Test Person' })
    })

    it('kasko with plate from special conditions', () => {
      const policy = makePolicy({
        type: 'kasko',
        specialConditions: ['Vehicle plate: 34 ABC 1234 is insured.'],
      })
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.label).toBe('Plate')
      expect(result?.value).toBe('34 ABC 1234')
    })

    it('extracts plate from second coverage when first has no match', () => {
      const policy = makePolicy({
        type: 'traffic',
        coverages: [
          makeCoverage({ description: 'General terms and conditions apply' }),
          makeCoverage({ description: 'Covers vehicle 06 AB 123' }),
        ],
      })
      const result = getSubjectDisplay(policy, 'tr')
      expect(result?.label).toBe('Plaka')
      expect(result?.value).toBe('06 AB 123')
    })

    it('extracts plate from second condition when first has no match', () => {
      const policy = makePolicy({
        type: 'kasko',
        specialConditions: [
          'General terms apply',
          'Plate number: 35 XYZ 99',
        ],
      })
      const result = getSubjectDisplay(policy, 'en')
      expect(result?.label).toBe('Plate')
      expect(result?.value).toBe('35 XYZ 99')
    })
  })
})
