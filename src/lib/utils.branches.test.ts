import { describe, it, expect } from 'vitest'
import {
  formatCurrencyCompact,
  validateCurrencyRegion,
  CURRENCY_SYMBOLS,
} from '@/lib/utils'

// ---------------------------------------------------------------------------
// formatCurrencyCompact
// ---------------------------------------------------------------------------
describe('formatCurrencyCompact', () => {
  // ---- Billions (>= 1_000_000_000) ----
  describe('billions (amount >= 1_000_000_000)', () => {
    it('rounds when value >= 10 (e.g. 15B)', () => {
      // 15_000_000_000 / 1e9 = 15 -> Math.round(15) = 15
      expect(formatCurrencyCompact(15_000_000_000, 'TRY')).toBe('₺15B')
    })

    it('rounds value >= 10 with fractional part (e.g. 12.7B rounds to 13)', () => {
      expect(formatCurrencyCompact(12_700_000_000, 'USD')).toBe('$13B')
    })

    it('uses toFixed(1) when value < 10 (e.g. 5.2B)', () => {
      // 5_200_000_000 / 1e9 = 5.2 -> '5.2'
      expect(formatCurrencyCompact(5_200_000_000, 'EUR')).toBe('€5.2B')
    })

    it('strips trailing .0 via replace when value < 10 is whole (e.g. 3.0B -> 3B)', () => {
      // 3_000_000_000 / 1e9 = 3.0 -> toFixed(1) = '3.0' -> replace -> '3'
      expect(formatCurrencyCompact(3_000_000_000, 'TRY')).toBe('₺3B')
    })

    it('does not strip .0 if it is not trailing (e.g. 1.0xxB edge: 1.0 -> 1)', () => {
      // Exact 1 billion
      expect(formatCurrencyCompact(1_000_000_000, 'GBP')).toBe('£1B')
    })

    it('handles fractional billions that do not end in .0 (e.g. 2.5B)', () => {
      expect(formatCurrencyCompact(2_500_000_000, 'TRY')).toBe('₺2.5B')
    })
  })

  // ---- Millions (>= 1_000_000) ----
  describe('millions (amount >= 1_000_000)', () => {
    it('rounds when value >= 10 (e.g. 50M)', () => {
      expect(formatCurrencyCompact(50_000_000, 'TRY')).toBe('₺50M')
    })

    it('rounds value >= 10 with fractional part (e.g. 25.8M rounds to 26)', () => {
      expect(formatCurrencyCompact(25_800_000, 'TRY')).toBe('₺26M')
    })

    it('uses toFixed(1) when value < 10 (e.g. 5.7M)', () => {
      expect(formatCurrencyCompact(5_700_000, 'USD')).toBe('$5.7M')
    })

    it('strips trailing .0 for whole millions (e.g. 8.0M -> 8M)', () => {
      expect(formatCurrencyCompact(8_000_000, 'EUR')).toBe('€8M')
    })

    it('does not strip non-.0 decimal (e.g. 1.3M)', () => {
      expect(formatCurrencyCompact(1_300_000, 'TRY')).toBe('₺1.3M')
    })

    it('handles exactly 1 million', () => {
      expect(formatCurrencyCompact(1_000_000, 'TRY')).toBe('₺1M')
    })

    it('handles 999 million (still in millions range, value >= 10)', () => {
      expect(formatCurrencyCompact(999_000_000, 'TRY')).toBe('₺999M')
    })
  })

  // ---- Thousands (>= 1_000) ----
  describe('thousands (amount >= 1_000)', () => {
    it('rounds when value >= 10 (e.g. 150K)', () => {
      expect(formatCurrencyCompact(150_000, 'TRY')).toBe('₺150K')
    })

    it('rounds value >= 10 with fractional part (e.g. 45.6K rounds to 46)', () => {
      expect(formatCurrencyCompact(45_600, 'GBP')).toBe('£46K')
    })

    it('uses toFixed(1) when value < 10 (e.g. 5.5K)', () => {
      expect(formatCurrencyCompact(5_500, 'USD')).toBe('$5.5K')
    })

    it('strips trailing .0 for whole thousands (e.g. 7.0K -> 7K)', () => {
      expect(formatCurrencyCompact(7_000, 'TRY')).toBe('₺7K')
    })

    it('handles exactly 1 thousand', () => {
      expect(formatCurrencyCompact(1_000, 'TRY')).toBe('₺1K')
    })

    it('handles 999 thousand (value >= 10, rounds)', () => {
      expect(formatCurrencyCompact(999_000, 'EUR')).toBe('€999K')
    })

    it('does not strip .0 when decimal is non-zero (e.g. 2.4K)', () => {
      expect(formatCurrencyCompact(2_400, 'TRY')).toBe('₺2.4K')
    })
  })

  // ---- Below 1,000 ----
  describe('below 1,000', () => {
    it('returns symbol + rounded amount for small values', () => {
      expect(formatCurrencyCompact(500, 'TRY')).toBe('₺500')
    })

    it('rounds fractional small amounts', () => {
      expect(formatCurrencyCompact(99.7, 'USD')).toBe('$100')
    })

    it('handles zero', () => {
      expect(formatCurrencyCompact(0, 'TRY')).toBe('₺0')
    })

    it('handles amounts just under 1000', () => {
      expect(formatCurrencyCompact(999, 'EUR')).toBe('€999')
    })

    it('handles single digit amounts', () => {
      expect(formatCurrencyCompact(1, 'GBP')).toBe('£1')
    })
  })

  // ---- Unknown currency fallback ----
  describe('unknown currency symbol fallback', () => {
    it('uses currency code + space when currency is not in CURRENCY_SYMBOLS', () => {
      // 'XYZ' is not in the CURRENCY_SYMBOLS map
      expect(formatCurrencyCompact(5_000, 'XYZ')).toBe('XYZ 5K')
    })

    it('uses currency code + space for unknown currency in millions range', () => {
      expect(formatCurrencyCompact(2_500_000, 'ABC')).toBe('ABC 2.5M')
    })

    it('uses currency code + space for unknown currency below 1000', () => {
      expect(formatCurrencyCompact(42, 'FAKE')).toBe('FAKE 42')
    })

    it('uses currency code + space for unknown currency in billions range', () => {
      expect(formatCurrencyCompact(7_000_000_000, 'QQQ')).toBe('QQQ 7B')
    })
  })

  // ---- Default currency parameter ----
  describe('default currency', () => {
    it('defaults to TRY when no currency provided', () => {
      expect(formatCurrencyCompact(10_000)).toBe('₺10K')
    })
  })

  // ---- Known currencies from CURRENCY_SYMBOLS ----
  describe('known currency symbols', () => {
    it('uses correct symbol for CHF (has trailing space in map)', () => {
      expect(formatCurrencyCompact(50_000, 'CHF')).toBe('CHF 50K')
    })

    it('uses correct symbol for AUD', () => {
      expect(formatCurrencyCompact(1_200_000, 'AUD')).toBe('A$1.2M')
    })

    it('uses correct symbol for BRL', () => {
      expect(formatCurrencyCompact(300, 'BRL')).toBe('R$300')
    })
  })
})

// ---------------------------------------------------------------------------
// validateCurrencyRegion
// ---------------------------------------------------------------------------
describe('validateCurrencyRegion', () => {
  // ---- Null/empty address ----
  describe('null or empty address', () => {
    it('returns valid for null address', () => {
      expect(validateCurrencyRegion('TRY', null)).toEqual({ valid: true })
    })

    it('returns valid for undefined address', () => {
      expect(validateCurrencyRegion('USD', undefined)).toEqual({ valid: true })
    })

    it('returns valid for empty string address', () => {
      expect(validateCurrencyRegion('EUR', '')).toEqual({ valid: true })
    })
  })

  // ---- Null/empty currency ----
  describe('null or empty currency', () => {
    it('returns valid for empty string currency', () => {
      expect(validateCurrencyRegion('', 'Istanbul, Turkey')).toEqual({ valid: true })
    })
  })

  // ---- Turkish addresses ----
  describe('Turkish addresses', () => {
    it('returns valid with no warning for TRY', () => {
      const result = validateCurrencyRegion('TRY', 'Kadikoy, Istanbul, Turkiye')
      expect(result).toEqual({ valid: true })
      expect(result.warning).toBeUndefined()
    })

    it('returns valid with no warning for TRY with different Turkish city', () => {
      const result = validateCurrencyRegion('TRY', 'Cankaya, Ankara')
      expect(result).toEqual({ valid: true })
      expect(result.warning).toBeUndefined()
    })

    it('returns valid with warning for USD (acceptable foreign currency)', () => {
      const result = validateCurrencyRegion('USD', 'Istanbul, Turkey')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Foreign currency (USD) used for Turkish address. Verify this is intentional.')
    })

    it('returns valid with warning for EUR (acceptable foreign currency)', () => {
      const result = validateCurrencyRegion('EUR', 'Izmir, Turkey')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Foreign currency (EUR) used for Turkish address. Verify this is intentional.')
    })

    it('returns valid with warning for GBP (acceptable foreign currency)', () => {
      const result = validateCurrencyRegion('GBP', 'Antalya, Turkey')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Foreign currency (GBP) used for Turkish address. Verify this is intentional.')
    })

    it('returns invalid with warning for unacceptable currency like JPY', () => {
      const result = validateCurrencyRegion('JPY', 'Bursa, Turkey')
      expect(result.valid).toBe(false)
      expect(result.warning).toBe('Unusual currency JPY detected for Turkish address. Expected TRY, USD, or EUR.')
    })

    it('returns invalid with warning for unacceptable currency like CHF', () => {
      const result = validateCurrencyRegion('CHF', 'Adana, Turkey')
      expect(result.valid).toBe(false)
      expect(result.warning).toBe('Unusual currency CHF detected for Turkish address. Expected TRY, USD, or EUR.')
    })

    it('returns invalid for INR at Turkish address', () => {
      const result = validateCurrencyRegion('INR', 'Konya, Turkiye')
      expect(result.valid).toBe(false)
      expect(result.warning).toContain('Unusual currency INR')
    })

    it('matches Turkish indicators case-insensitively', () => {
      const result = validateCurrencyRegion('TRY', 'ISTANBUL TURKEY')
      expect(result).toEqual({ valid: true })
    })

    it('detects less common Turkish cities (e.g. Erzurum)', () => {
      const result = validateCurrencyRegion('TRY', 'Erzurum Merkez')
      expect(result).toEqual({ valid: true })
    })

    it('detects Turkish address with eskisehir variant', () => {
      const result = validateCurrencyRegion('JPY', 'eskişehir, turkey')
      expect(result.valid).toBe(false)
    })
  })

  // ---- US addresses ----
  describe('US addresses', () => {
    it('returns valid with no warning for USD', () => {
      const result = validateCurrencyRegion('USD', 'New York, USA')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid with warning for non-USD currency', () => {
      const result = validateCurrencyRegion('EUR', 'California, United States')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Non-USD currency (EUR) for US address. Verify this is intentional.')
    })

    it('returns valid with warning for TRY at US address', () => {
      const result = validateCurrencyRegion('TRY', 'Texas, USA')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Non-USD currency (TRY) for US address. Verify this is intentional.')
    })

    it('returns valid with warning for GBP at US address', () => {
      const result = validateCurrencyRegion('GBP', 'Florida, America')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Non-USD currency (GBP) for US address. Verify this is intentional.')
    })

    it('matches US indicators case-insensitively', () => {
      const result = validateCurrencyRegion('USD', 'NEW YORK, UNITED STATES')
      expect(result).toEqual({ valid: true })
    })
  })

  // ---- UK addresses ----
  describe('UK addresses', () => {
    it('returns valid with no warning for GBP', () => {
      const result = validateCurrencyRegion('GBP', 'London, United Kingdom')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid with no warning for EUR at UK address (acceptable)', () => {
      const result = validateCurrencyRegion('EUR', 'Manchester, England')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid with no warning for USD at UK address (acceptable)', () => {
      const result = validateCurrencyRegion('USD', 'Edinburgh, Scotland')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid with warning for unusual currency like TRY', () => {
      const result = validateCurrencyRegion('TRY', 'Birmingham, UK')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Unusual currency (TRY) for UK address. Expected GBP, EUR, or USD.')
    })

    it('returns valid with warning for unusual currency like JPY', () => {
      const result = validateCurrencyRegion('JPY', 'Cardiff, Wales')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Unusual currency (JPY) for UK address. Expected GBP, EUR, or USD.')
    })

    it('returns valid with warning for CHF at UK address', () => {
      const result = validateCurrencyRegion('CHF', 'London, UK')
      expect(result.valid).toBe(true)
      expect(result.warning).toContain('Unusual currency (CHF)')
    })
  })

  // ---- Eurozone addresses ----
  describe('Eurozone addresses', () => {
    it('returns valid with no warning for EUR', () => {
      const result = validateCurrencyRegion('EUR', 'Berlin, Germany')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid with no warning for USD at Eurozone address (acceptable)', () => {
      const result = validateCurrencyRegion('USD', 'Paris, France')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid with no warning for EUR at other Eurozone countries', () => {
      expect(validateCurrencyRegion('EUR', 'Rome, Italy')).toEqual({ valid: true })
      expect(validateCurrencyRegion('EUR', 'Madrid, Spain')).toEqual({ valid: true })
      expect(validateCurrencyRegion('EUR', 'Amsterdam, Netherlands')).toEqual({ valid: true })
      expect(validateCurrencyRegion('EUR', 'Brussels, Belgium')).toEqual({ valid: true })
      expect(validateCurrencyRegion('EUR', 'Vienna, Austria')).toEqual({ valid: true })
      expect(validateCurrencyRegion('EUR', 'Dublin, Ireland')).toEqual({ valid: true })
      expect(validateCurrencyRegion('EUR', 'Lisbon, Portugal')).toEqual({ valid: true })
      expect(validateCurrencyRegion('EUR', 'Athens, Greece')).toEqual({ valid: true })
      expect(validateCurrencyRegion('EUR', 'Helsinki, Finland')).toEqual({ valid: true })
    })

    it('returns valid with warning for unusual currency like GBP', () => {
      const result = validateCurrencyRegion('GBP', 'Berlin, Germany')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Unusual currency (GBP) for Eurozone address. Expected EUR or USD.')
    })

    it('returns valid with warning for unusual currency like TRY', () => {
      const result = validateCurrencyRegion('TRY', 'Madrid, Spain')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Unusual currency (TRY) for Eurozone address. Expected EUR or USD.')
    })

    it('returns valid with warning for JPY at Eurozone address', () => {
      const result = validateCurrencyRegion('JPY', 'Amsterdam, Netherlands')
      expect(result.valid).toBe(true)
      expect(result.warning).toContain('Unusual currency (JPY)')
    })

    it('returns valid with warning for CHF at Eurozone address', () => {
      const result = validateCurrencyRegion('CHF', 'Paris, France')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe('Unusual currency (CHF) for Eurozone address. Expected EUR or USD.')
    })
  })

  // ---- Unknown region addresses ----
  describe('unknown region addresses', () => {
    it('returns valid with no warning for any currency at unknown region', () => {
      const result = validateCurrencyRegion('JPY', 'Tokyo, Japan')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid for TRY at non-matched region', () => {
      const result = validateCurrencyRegion('TRY', 'Seoul, South Korea')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid for exotic currency at unknown region', () => {
      const result = validateCurrencyRegion('BRL', 'Sao Paulo, Brazil')
      expect(result).toEqual({ valid: true })
    })

    it('returns valid for address with no region match', () => {
      const result = validateCurrencyRegion('AUD', 'Sydney, Australia')
      expect(result).toEqual({ valid: true })
    })
  })

  // ---- Priority / overlap tests ----
  describe('region detection priority', () => {
    it('Turkish detection takes priority if Turkish indicator present alongside others', () => {
      // "America" is US indicator but "Turkey" is Turkish indicator; Turkish checked first
      const result = validateCurrencyRegion('JPY', 'Turkey near America')
      // Turkish check happens first, JPY is not acceptable -> invalid
      expect(result.valid).toBe(false)
      expect(result.warning).toContain('Unusual currency JPY detected for Turkish address')
    })
  })
})

// ---------------------------------------------------------------------------
// CURRENCY_SYMBOLS export sanity check
// ---------------------------------------------------------------------------
describe('CURRENCY_SYMBOLS', () => {
  it('contains TRY with lira symbol', () => {
    expect(CURRENCY_SYMBOLS.TRY).toBe('₺')
  })

  it('contains USD with dollar symbol', () => {
    expect(CURRENCY_SYMBOLS.USD).toBe('$')
  })

  it('contains EUR with euro symbol', () => {
    expect(CURRENCY_SYMBOLS.EUR).toBe('€')
  })

  it('contains GBP with pound symbol', () => {
    expect(CURRENCY_SYMBOLS.GBP).toBe('£')
  })

  it('does not contain fictitious currency codes', () => {
    expect(CURRENCY_SYMBOLS['XYZ']).toBeUndefined()
    expect(CURRENCY_SYMBOLS['ABC']).toBeUndefined()
  })
})
