import { describe, it, expect } from 'vitest'
import { formatCurrencyCompact, validateCurrencyRegion, CURRENCY_SYMBOLS } from '@/lib/utils'

// ---------------------------------------------------------------------------
// formatCurrencyCompact
// ---------------------------------------------------------------------------
describe('formatCurrencyCompact', () => {
  it('formats large numbers natively using Intl.NumberFormat', () => {
    const formatted = formatCurrencyCompact(15_000_000_000, 'TRY')
    // Node.js tr-TR locale Intl.NumberFormat generates "15 Mr ₺" (with non-breaking spaces)
    expect(formatted.replace(/\s+/g, ' ')).toMatch(/15 Mr ₺|₺15B|₺15 Mr/)
  })

  it('formats millions natively', () => {
    const formatted = formatCurrencyCompact(25_800_000, 'TRY')
    // 25,8 Mn ₺ or ₺25.8M
    expect(formatted.replace(/\s+/g, ' ')).toMatch(/25,8 Mn ₺|₺25\.8M|₺26 M/)
  })

  it('formats thousands natively', () => {
    const formatted = formatCurrencyCompact(150_000, 'TRY')
    // 150 B ₺ or ₺150K
    expect(formatted.replace(/\s+/g, ' ')).toMatch(/150 B ₺|₺150K|₺150 Bin/)
  })

  it('handles fractional small amounts', () => {
    const formatted = formatCurrencyCompact(99.7, 'USD')
    // 100 $ or $99.7
    expect(formatted.replace(/\s+/g, ' ')).toMatch(/100 \$|\$100|\$99,7/)
  })

  it('passes through locale parameter correctly', () => {
    const formatted = formatCurrencyCompact(5_200_000_000, 'EUR', 'en')
    // en-US locale -> €5.2B
    expect(formatted.replace(/\s+/g, ' ')).toMatch(/€5\.2B/)
  })

  it('handles unknown currencies natively', () => {
    const formatted = formatCurrencyCompact(5_000, 'XYZ', 'en')
    expect(formatted.replace(/\s+/g, ' ')).toMatch(/XYZ 5K/)
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
      expect(result.warning).toBe(
        'Foreign currency (USD) used for Turkish address. Verify this is intentional.'
      )
    })

    it('returns valid with warning for EUR (acceptable foreign currency)', () => {
      const result = validateCurrencyRegion('EUR', 'Izmir, Turkey')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe(
        'Foreign currency (EUR) used for Turkish address. Verify this is intentional.'
      )
    })

    it('returns valid with warning for GBP (acceptable foreign currency)', () => {
      const result = validateCurrencyRegion('GBP', 'Antalya, Turkey')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe(
        'Foreign currency (GBP) used for Turkish address. Verify this is intentional.'
      )
    })

    it('returns invalid with warning for unacceptable currency like JPY', () => {
      const result = validateCurrencyRegion('JPY', 'Bursa, Turkey')
      expect(result.valid).toBe(false)
      expect(result.warning).toBe(
        'Unusual currency JPY detected for Turkish address. Expected TRY, USD, or EUR.'
      )
    })

    it('returns invalid with warning for unacceptable currency like CHF', () => {
      const result = validateCurrencyRegion('CHF', 'Adana, Turkey')
      expect(result.valid).toBe(false)
      expect(result.warning).toBe(
        'Unusual currency CHF detected for Turkish address. Expected TRY, USD, or EUR.'
      )
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
      expect(result.warning).toBe(
        'Non-USD currency (EUR) for US address. Verify this is intentional.'
      )
    })

    it('returns valid with warning for TRY at US address', () => {
      const result = validateCurrencyRegion('TRY', 'Texas, USA')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe(
        'Non-USD currency (TRY) for US address. Verify this is intentional.'
      )
    })

    it('returns valid with warning for GBP at US address', () => {
      const result = validateCurrencyRegion('GBP', 'Florida, America')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe(
        'Non-USD currency (GBP) for US address. Verify this is intentional.'
      )
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
      expect(result.warning).toBe(
        'Unusual currency (TRY) for UK address. Expected GBP, EUR, or USD.'
      )
    })

    it('returns valid with warning for unusual currency like JPY', () => {
      const result = validateCurrencyRegion('JPY', 'Cardiff, Wales')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe(
        'Unusual currency (JPY) for UK address. Expected GBP, EUR, or USD.'
      )
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
      expect(result.warning).toBe(
        'Unusual currency (GBP) for Eurozone address. Expected EUR or USD.'
      )
    })

    it('returns valid with warning for unusual currency like TRY', () => {
      const result = validateCurrencyRegion('TRY', 'Madrid, Spain')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe(
        'Unusual currency (TRY) for Eurozone address. Expected EUR or USD.'
      )
    })

    it('returns valid with warning for JPY at Eurozone address', () => {
      const result = validateCurrencyRegion('JPY', 'Amsterdam, Netherlands')
      expect(result.valid).toBe(true)
      expect(result.warning).toContain('Unusual currency (JPY)')
    })

    it('returns valid with warning for CHF at Eurozone address', () => {
      const result = validateCurrencyRegion('CHF', 'Paris, France')
      expect(result.valid).toBe(true)
      expect(result.warning).toBe(
        'Unusual currency (CHF) for Eurozone address. Expected EUR or USD.'
      )
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
