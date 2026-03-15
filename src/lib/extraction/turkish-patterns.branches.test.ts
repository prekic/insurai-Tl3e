/**
 * Branch Coverage Tests for Turkish Patterns module
 *
 * Targets uncovered branches in src/lib/extraction/turkish-patterns.ts
 */

import { describe, it, expect } from 'vitest'
import {
  validateTCKimlik,
  validateVIN,
  validateTurkishPlate,
  validateTurkishIBAN,
  normalizeTurkishDate,
  normalizeCurrency,
  normalizePhoneNumber,
  extractWithPatterns,
  validateAndEnhanceExtraction,
} from './turkish-patterns'

// ==================================================================
// validateTCKimlik branches
// ==================================================================
describe('validateTCKimlik', () => {
  it('returns false for non-11-digit input', () => {
    expect(validateTCKimlik('123')).toBe(false)
    expect(validateTCKimlik('1234567890')).toBe(false)
    expect(validateTCKimlik('123456789012')).toBe(false)
  })

  it('returns false when starts with 0', () => {
    expect(validateTCKimlik('01234567890')).toBe(false)
  })

  it('returns false for non-numeric', () => {
    expect(validateTCKimlik('1234567890a')).toBe(false)
  })

  it('returns false for invalid checksum', () => {
    expect(validateTCKimlik('12345678900')).toBe(false)
  })

  it('returns true for valid TC Kimlik', () => {
    // 10000000146 is a known valid TC Kimlik
    expect(validateTCKimlik('10000000146')).toBe(true)
  })
})

// ==================================================================
// validateVIN branches
// ==================================================================
describe('validateVIN', () => {
  it('returns false for wrong length', () => {
    expect(validateVIN('1234567890')).toBe(false)
    expect(validateVIN('123456789012345678')).toBe(false)
  })

  it('returns false for invalid characters I, O, Q', () => {
    expect(validateVIN('WVWZZZ1KZXW123I56')).toBe(false)
    expect(validateVIN('WVWZZZ1KZXW123O56')).toBe(false)
    expect(validateVIN('WVWZZZ1KZXW123Q56')).toBe(false)
  })

  it('returns false for lowercase', () => {
    expect(validateVIN('wvwzzz1kzxw123456')).toBe(false)
  })

  it('returns true for valid VIN', () => {
    expect(validateVIN('WVWZZZ1KZXW123456')).toBe(true)
  })
})

// ==================================================================
// validateTurkishPlate branches
// ==================================================================
describe('validateTurkishPlate', () => {
  it('returns false for invalid format', () => {
    expect(validateTurkishPlate('ABC123')).toBe(false)
    expect(validateTurkishPlate('00A1234')).toBe(false)
  })

  it('returns false for city code out of range', () => {
    expect(validateTurkishPlate('82 ABC 1234')).toBe(false)
    expect(validateTurkishPlate('00 A 1')).toBe(false)
  })

  it('returns true for valid plates', () => {
    expect(validateTurkishPlate('34 ABC 1234')).toBe(true)
    expect(validateTurkishPlate('06A123')).toBe(true)
    expect(validateTurkishPlate('01AB1')).toBe(true)
  })
})

// ==================================================================
// validateTurkishIBAN branches
// ==================================================================
describe('validateTurkishIBAN', () => {
  it('returns false for non-TR prefix', () => {
    expect(validateTurkishIBAN('DE123456789012345678901234')).toBe(false)
  })

  it('returns false for wrong length', () => {
    expect(validateTurkishIBAN('TR12345')).toBe(false)
  })

  it('returns false for invalid checksum', () => {
    expect(validateTurkishIBAN('TR000000000000000000000000')).toBe(false)
  })

  it('returns true for valid IBAN', () => {
    // TR330006100519786457841326 is a known valid Turkish IBAN
    expect(validateTurkishIBAN('TR33 0006 1005 1978 6457 8413 26')).toBe(true)
  })
})

// ==================================================================
// normalizeTurkishDate branches
// ==================================================================
describe('normalizeTurkishDate', () => {
  it('returns original when not 3 parts', () => {
    expect(normalizeTurkishDate('invalid')).toBe('invalid')
  })

  it('normalizes DD.MM.YYYY', () => {
    expect(normalizeTurkishDate('15.01.2026')).toBe('2026-01-15')
  })

  it('normalizes DD/MM/YYYY', () => {
    expect(normalizeTurkishDate('15/01/2026')).toBe('2026-01-15')
  })

  it('normalizes DD-MM-YYYY', () => {
    expect(normalizeTurkishDate('15-01-2026')).toBe('2026-01-15')
  })

  it('handles 2-digit year > 50 as 19xx', () => {
    expect(normalizeTurkishDate('15.01.95')).toBe('1995-01-15')
  })

  it('handles 2-digit year <= 50 as 20xx', () => {
    expect(normalizeTurkishDate('15.01.26')).toBe('2026-01-15')
    expect(normalizeTurkishDate('15.01.50')).toBe('2050-01-15')
  })

  it('pads single-digit day and month', () => {
    expect(normalizeTurkishDate('5.1.2026')).toBe('2026-01-05')
  })
})

// ==================================================================
// normalizeCurrency branches
// ==================================================================
describe('normalizeCurrency', () => {
  it('handles Turkish format with comma decimal', () => {
    expect(normalizeCurrency('1.234.567,89')).toBe(1234567.89)
  })

  it('handles currency symbols', () => {
    expect(normalizeCurrency('₺15.000')).toBe(15000)
    expect(normalizeCurrency('15.000 TL')).toBe(15000)
    expect(normalizeCurrency('15.000 TRY')).toBe(15000)
  })

  it('handles dot-as-thousands when last part is 3 digits', () => {
    expect(normalizeCurrency('15.000')).toBe(15000)
    expect(normalizeCurrency('1.234.567')).toBe(1234567)
  })

  it('handles dot-as-decimal when last part is not 3 digits', () => {
    expect(normalizeCurrency('15.50')).toBe(15.5)
  })

  it('returns 0 for empty/invalid', () => {
    expect(normalizeCurrency('')).toBe(0)
    expect(normalizeCurrency('abc')).toBe(0)
  })

  it('handles plain numbers', () => {
    expect(normalizeCurrency('15000')).toBe(15000)
  })
})

// ==================================================================
// normalizePhoneNumber branches
// ==================================================================
describe('normalizePhoneNumber', () => {
  it('handles country code 90', () => {
    expect(normalizePhoneNumber('905321234567')).toBe('0532 123 45 67')
  })

  it('handles 9-prefix 10-digit', () => {
    expect(normalizePhoneNumber('9532123456')).toBe('0953 212 34 56')
  })

  it('handles 10-digit without leading 0', () => {
    expect(normalizePhoneNumber('5321234567')).toBe('0532 123 45 67')
  })

  it('handles already formatted', () => {
    expect(normalizePhoneNumber('0532 123 45 67')).toBe('0532 123 45 67')
  })

  it('returns digits for non-standard length', () => {
    expect(normalizePhoneNumber('12345')).toBe('12345')
  })
})

// ==================================================================
// extractWithPatterns branches
// ==================================================================
describe('extractWithPatterns', () => {
  it('extracts policy number', () => {
    const result = extractWithPatterns('Poliçe No: ABC-12345')
    expect(result.policyNumber).toBeDefined()
    expect(result.policyNumber!.value).toBe('ABC-12345')
    expect(result.policyNumber!.isValid).toBe(true)
  })

  it('marks short policy number as invalid', () => {
    const result = extractWithPatterns('Poliçe No: AB')
    expect(result.policyNumber).toBeDefined()
    expect(result.policyNumber!.isValid).toBe(false)
  })

  it('extracts TC Kimlik', () => {
    const result = extractWithPatterns('T.C. Kimlik No: 10000000146')
    expect(result.tcKimlik).toBeDefined()
    expect(result.tcKimlik!.isValid).toBe(true)
    expect(result.tcKimlik!.confidence).toBe(0.98)
  })

  it('extracts invalid TC Kimlik with lower confidence', () => {
    const result = extractWithPatterns('TC Kimlik No: 12345678901')
    expect(result.tcKimlik).toBeDefined()
    expect(result.tcKimlik!.confidence).toBe(0.5)
  })

  it('extracts start date', () => {
    const result = extractWithPatterns('Başlangıç Tarihi: 15.01.2026')
    expect(result.startDate).toBeDefined()
    expect(result.startDate!.value).toBe('2026-01-15')
    expect(result.startDate!.isValid).toBe(true)
  })

  it('extracts end date', () => {
    const result = extractWithPatterns('Bitiş Tarihi: 15.01.2027')
    expect(result.endDate).toBeDefined()
    expect(result.endDate!.value).toBe('2027-01-15')
  })

  it('extracts premium', () => {
    const result = extractWithPatterns('Toplam Prim: ₺15.000,50')
    expect(result.premium).toBeDefined()
    expect(result.premium!.value).toBe(15000.5)
    expect(result.premium!.isValid).toBe(true)
  })

  it('extracts coverage', () => {
    const result = extractWithPatterns('Teminat Tutarı: 500.000 TL')
    expect(result.coverage).toBeDefined()
    expect(result.coverage!.value).toBe(500000)
  })

  it('extracts vehicle plate', () => {
    const result = extractWithPatterns('Plaka No: 34 ABC 1234')
    expect(result.vehiclePlate).toBeDefined()
    expect(result.vehiclePlate!.isValid).toBe(true)
  })

  it('extracts VIN', () => {
    const result = extractWithPatterns('Şasi No: WVWZZZ1KZXW123456')
    expect(result.vin).toBeDefined()
    expect(result.vin!.isValid).toBe(true)
  })

  it('extracts vehicle year', () => {
    const result = extractWithPatterns('Model Yılı: 2024')
    expect(result.vehicleYear).toBeDefined()
    expect(result.vehicleYear!.value).toBe(2024)
    expect(result.vehicleYear!.isValid).toBe(true)
  })

  it('marks future vehicle year as invalid', () => {
    const result = extractWithPatterns('Model Yılı: 2045')
    expect(result.vehicleYear).toBeDefined()
    expect(result.vehicleYear!.isValid).toBe(false)
  })

  it('extracts insured name', () => {
    const result = extractWithPatterns('Sigortali: AHMET YILMAZ T.C.')
    expect(result.insuredName).toBeDefined()
    expect(result.insuredName!.isValid).toBe(true)
  })

  it('returns empty for no matches', () => {
    const result = extractWithPatterns('random text without insurance data')
    expect(result.policyNumber).toBeUndefined()
    expect(result.tcKimlik).toBeUndefined()
  })
})

// ==================================================================
// validateAndEnhanceExtraction branches
// ==================================================================
describe('validateAndEnhanceExtraction', () => {
  it('validates valid TC Kimlik from AI', () => {
    const result = validateAndEnhanceExtraction({ tcKimlik: '10000000146' }, '')
    expect(result.errors).toHaveLength(0)
  })

  it('corrects invalid TC Kimlik from pattern', () => {
    const text = 'T.C. Kimlik No: 10000000146'
    const result = validateAndEnhanceExtraction({ tcKimlik: '00000000000' }, text)
    expect(result.warnings.some((w) => w.includes('TC Kimlik / VKN corrected'))).toBe(true)
    expect(result.enhancements.tcKimlik).toBe('10000000146')
  })

  it('errors on invalid TC Kimlik without pattern match', () => {
    const result = validateAndEnhanceExtraction({ tcKimlik: '00000000000' }, 'no tc kimlik here')
    expect(result.errors.some((e) => e.includes('Invalid TC Kimlik'))).toBe(true)
  })

  it('fills missing TC Kimlik from pattern', () => {
    const text = 'T.C. Kimlik No: 10000000146'
    const result = validateAndEnhanceExtraction({}, text)
    expect(result.enhancements.tcKimlik).toBe('10000000146')
  })

  it('validates valid VIN from AI', () => {
    const result = validateAndEnhanceExtraction({ vin: 'WVWZZZ1KZXW123456' }, '')
    expect(result.warnings.filter((w) => w.includes('VIN'))).toHaveLength(0)
  })

  it('corrects invalid VIN from pattern', () => {
    const text = 'Şasi No: WVWZZZ1KZXW123456'
    const result = validateAndEnhanceExtraction({ vin: 'invalid' }, text)
    expect(result.warnings.some((w) => w.includes('VIN corrected'))).toBe(true)
  })

  it('warns on invalid VIN without pattern match', () => {
    const result = validateAndEnhanceExtraction({ vin: 'invalid' }, 'no vin here')
    expect(result.warnings.some((w) => w.includes('VIN may be invalid'))).toBe(true)
  })

  it('fills missing VIN from pattern', () => {
    const text = 'Şasi No: WVWZZZ1KZXW123456'
    const result = validateAndEnhanceExtraction({}, text)
    expect(result.enhancements.vin).toBe('WVWZZZ1KZXW123456')
  })

  it('validates plate and corrects from pattern', () => {
    const text = 'Plaka No: 34 ABC 1234'
    const result = validateAndEnhanceExtraction({ vehiclePlate: 'invalid' }, text)
    expect(result.warnings.some((w) => w.includes('Plate corrected'))).toBe(true)
  })

  it('warns on invalid plate without pattern match', () => {
    const result = validateAndEnhanceExtraction({ vehiclePlate: 'XXXXX' }, '')
    expect(result.warnings.some((w) => w.includes('plate may be invalid'))).toBe(true)
  })

  it('fills missing plate from pattern', () => {
    const text = 'Plaka No: 34 ABC 1234'
    const result = validateAndEnhanceExtraction({}, text)
    expect(result.enhancements.vehiclePlate).toBeDefined()
  })

  it('errors when start date >= end date', () => {
    const result = validateAndEnhanceExtraction(
      { startDate: '2027-01-01', endDate: '2026-01-01' },
      ''
    )
    expect(result.errors.some((e) => e.includes('Start date must be before'))).toBe(true)
  })

  it('fills missing dates from patterns', () => {
    const text = 'Başlangıç Tarihi: 15.01.2026\nBitiş Tarihi: 15.01.2027'
    const result = validateAndEnhanceExtraction({}, text)
    expect(result.enhancements.startDate).toBeDefined()
    expect(result.enhancements.endDate).toBeDefined()
  })

  it('fills missing premium from pattern', () => {
    const text = 'Toplam Prim: 15.000 TL'
    const result = validateAndEnhanceExtraction({}, text)
    expect(result.enhancements.premium).toBe(15000)
  })

  it('normalizes string premium from AI', () => {
    const result = validateAndEnhanceExtraction({ premium: '15.000,50' }, '')
    // String premium is normalized - no error expected
    expect(result.errors).toHaveLength(0)
  })

  it('returns isValid true when no errors', () => {
    const result = validateAndEnhanceExtraction({}, '')
    expect(result.isValid).toBe(true)
  })
})
