/**
 * Tests for Turkish Insurance Document Extraction Patterns
 */

import { describe, it, expect } from 'vitest'
import {
  validateTCKimlik,
  validateVKN,
  validateVIN,
  validateTurkishPlate,
  validateTurkishIBAN,
  normalizeTurkishDate,
  normalizeCurrency,
  normalizePhoneNumber,
  extractWithPatterns,
  validateAndEnhanceExtraction,
} from './turkish-patterns'

describe('TC Kimlik Validation', () => {
  it('should validate correct TC Kimlik: 10000000146', () => {
    expect(validateTCKimlik('10000000146')).toBe(true)
  })

  it('should validate correct TC Kimlik: 17291716060', () => {
    expect(validateTCKimlik('17291716060')).toBe(true)
  })

  it('should reject TC Kimlik starting with 0', () => {
    expect(validateTCKimlik('01234567890')).toBe(false)
  })

  it('should reject TC Kimlik with wrong length', () => {
    expect(validateTCKimlik('123456789')).toBe(false)
    expect(validateTCKimlik('123456789012')).toBe(false)
  })

  it('should reject non-numeric TC Kimlik', () => {
    expect(validateTCKimlik('1234567890A')).toBe(false)
  })
})

describe('VKN Validation', () => {
  it('should validate correct VKN: 3130557669', () => {
    expect(validateVKN('3130557669')).toBe(true)
  })

  it('should reject VKN with wrong length', () => {
    expect(validateVKN('313055766')).toBe(false)
    expect(validateVKN('48100234145')).toBe(false)
  })

  it('should reject invalid VKN', () => {
    expect(validateVKN('1234567891')).toBe(false)
  })

  it('should reject non-numeric VKN', () => {
    expect(validateVKN('123456789A')).toBe(false)
  })
})

describe('VIN Validation', () => {
  it('should validate correct VIN', () => {
    expect(validateVIN('WVWZZZ3CZWE123456')).toBe(true)
  })

  it('should reject VIN with invalid character I', () => {
    expect(validateVIN('WVWZZZ3CZWI123456')).toBe(false)
  })

  it('should reject VIN with invalid character O', () => {
    expect(validateVIN('WVWZZZ3CZWO123456')).toBe(false)
  })

  it('should reject VIN with invalid character Q', () => {
    expect(validateVIN('WVWZZZ3CZWQ123456')).toBe(false)
  })

  it('should reject VIN with wrong length', () => {
    expect(validateVIN('WVWZZZ3CZW')).toBe(false)
  })

  it('should reject lowercase VIN', () => {
    expect(validateVIN('wvwzzz3czwe123456')).toBe(false)
  })
})

describe('Turkish Plate Validation', () => {
  it('should validate correct Istanbul plate', () => {
    expect(validateTurkishPlate('34 ABC 123')).toBe(true)
    expect(validateTurkishPlate('34ABC123')).toBe(true)
  })

  it('should validate Ankara plate', () => {
    expect(validateTurkishPlate('06 A 1234')).toBe(true)
  })

  it('should reject invalid city code', () => {
    expect(validateTurkishPlate('00 ABC 123')).toBe(false)
    expect(validateTurkishPlate('82 ABC 123')).toBe(false)
  })

  it('should reject invalid format', () => {
    expect(validateTurkishPlate('ABC123')).toBe(false)
  })
})

describe('Turkish IBAN Validation', () => {
  it('should validate correct Turkish IBAN', () => {
    // This is a test IBAN
    expect(validateTurkishIBAN('TR330006100519786457841326')).toBe(true)
  })

  it('should reject non-Turkish IBAN', () => {
    expect(validateTurkishIBAN('DE89370400440532013000')).toBe(false)
  })

  it('should reject invalid length', () => {
    expect(validateTurkishIBAN('TR33000610051978645784132')).toBe(false)
  })
})

describe('Turkish Date Normalization', () => {
  it('should normalize DD.MM.YYYY to ISO', () => {
    expect(normalizeTurkishDate('15.01.2024')).toBe('2024-01-15')
  })

  it('should normalize DD/MM/YYYY to ISO', () => {
    expect(normalizeTurkishDate('15/01/2024')).toBe('2024-01-15')
  })

  it('should normalize DD-MM-YYYY to ISO', () => {
    expect(normalizeTurkishDate('15-01-2024')).toBe('2024-01-15')
  })

  it('should handle 2-digit year (post-2000)', () => {
    expect(normalizeTurkishDate('15.01.24')).toBe('2024-01-15')
  })

  it('should handle 2-digit year (pre-2000)', () => {
    expect(normalizeTurkishDate('15.01.95')).toBe('1995-01-15')
  })

  it('should pad single digit day/month', () => {
    expect(normalizeTurkishDate('5.1.2024')).toBe('2024-01-05')
  })
})

describe('Currency Normalization', () => {
  it('should normalize Turkish format with dots', () => {
    expect(normalizeCurrency('15.000')).toBe(15000)
    expect(normalizeCurrency('1.234.567')).toBe(1234567)
  })

  it('should normalize with comma decimal', () => {
    expect(normalizeCurrency('15.000,50')).toBe(15000.5)
  })

  it('should handle currency symbol before number', () => {
    expect(normalizeCurrency('₺15.000')).toBe(15000)
  })

  it('should handle currency symbol after number', () => {
    expect(normalizeCurrency('15.000 TL')).toBe(15000)
    expect(normalizeCurrency('15.000TRY')).toBe(15000)
  })
})

describe('Phone Number Normalization', () => {
  it('should normalize mobile number', () => {
    expect(normalizePhoneNumber('0532 123 45 67')).toBe('0532 123 45 67')
  })

  it('should add leading zero', () => {
    expect(normalizePhoneNumber('532 123 45 67')).toBe('0532 123 45 67')
  })

  it('should handle country code', () => {
    expect(normalizePhoneNumber('+90 532 123 45 67')).toBe('0532 123 45 67')
  })
})

describe('Pattern Extraction', () => {
  it('should extract policy number', () => {
    const text = 'Poliçe No: KAS-2026-12345'
    const result = extractWithPatterns(text)
    expect(result.policyNumber?.value).toBe('KAS-2026-12345')
    expect(result.policyNumber?.isValid).toBe(true)
  })

  it('should extract TC Kimlik', () => {
    const text = 'T.C. Kimlik No: 10000000146'
    const result = extractWithPatterns(text)
    expect(result.tcKimlik?.value).toBe('10000000146')
    expect(result.tcKimlik?.isValid).toBe(true)
  })

  it('should extract VKN as tcKimlik field', () => {
    const text = 'VKN: 3130557669'
    const result = extractWithPatterns(text)
    expect(result.tcKimlik?.value).toBe('3130557669')
    expect(result.tcKimlik?.isValid).toBe(true)
  })

  it('should extract start date', () => {
    const text = 'Başlangıç Tarihi: 15.01.2026'
    const result = extractWithPatterns(text)
    expect(result.startDate?.value).toBe('2026-01-15')
    expect(result.startDate?.isValid).toBe(true)
  })

  it('should extract premium with ₺ symbol', () => {
    const text = 'Toplam Prim: ₺15.000'
    const result = extractWithPatterns(text)
    expect(result.premium?.value).toBe(15000)
    expect(result.premium?.isValid).toBe(true)
  })

  it('should extract vehicle plate', () => {
    const text = 'Plaka: 34 ABC 123'
    const result = extractWithPatterns(text)
    expect(result.vehiclePlate?.value).toBe('34 ABC 123')
    expect(result.vehiclePlate?.isValid).toBe(true)
  })

  it('should extract VIN', () => {
    const text = 'Şasi No: WVWZZZ3CZWE123456'
    const result = extractWithPatterns(text)
    expect(result.vin?.value).toBe('WVWZZZ3CZWE123456')
    expect(result.vin?.isValid).toBe(true)
  })
})

describe('AI Extraction Validation & Enhancement', () => {
  it('should validate correct AI extraction', () => {
    const aiResult = {
      tcKimlik: '10000000146',
      startDate: '2026-01-15',
      endDate: '2027-01-15',
    }
    const result = validateAndEnhanceExtraction(aiResult, '')
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should detect invalid TC Kimlik / VKN', () => {
    const aiResult = {
      tcKimlik: '12345678901',
    }
    const result = validateAndEnhanceExtraction(aiResult, '')
    expect(result.errors).toContain('Invalid TC Kimlik / VKN: 12345678901')
  })

  it('should accept valid VKN', () => {
    const aiResult = {
      tcKimlik: '3130557669',
    }
    const result = validateAndEnhanceExtraction(aiResult, '')
    expect(result.errors).toHaveLength(0)
  })

  it('should detect invalid date range', () => {
    const aiResult = {
      startDate: '2027-01-15',
      endDate: '2026-01-15',
    }
    const result = validateAndEnhanceExtraction(aiResult, '')
    expect(result.errors).toContain('Start date must be before end date')
  })

  it('should enhance with pattern extraction', () => {
    const aiResult = {}
    const text = 'Poliçe No: KAS-2026-12345\nToplam Prim: ₺15.000'
    const result = validateAndEnhanceExtraction(aiResult, text)
    expect(result.enhancements.policyNumber).toBe('KAS-2026-12345')
    expect(result.enhancements.premium).toBe(15000)
  })
})
