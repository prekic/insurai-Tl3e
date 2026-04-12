/**
 * Tests for Turkish Text Handling Utilities
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeTurkishChars,
  normalizeCoverageName,
  coverageNamesMatch,
  parseTurkishDate,
  extractDatesFromText,
  parseTurkishCurrency,
  formatTurkishCurrency,
  parseTurkishPlate,
  isValidTCKimlik,
  normalizePolicyNumber,
  extractPremiumFromText,
  detectPolicyTypeFromText,
} from './turkish-utils'

describe('Turkish Character Normalization', () => {
  describe('normalizeTurkishChars', () => {
    it('should normalize Turkish characters to ASCII', () => {
      expect(normalizeTurkishChars('İstanbul')).toBe('Istanbul')
      expect(normalizeTurkishChars('Türkiye')).toBe('Turkiye')
      expect(normalizeTurkishChars('Şişli')).toBe('Sisli')
      expect(normalizeTurkishChars('Öğrenci')).toBe('Ogrenci')
      expect(normalizeTurkishChars('Çağdaş')).toBe('Cagdas')
    })

    it('should handle mixed text', () => {
      expect(normalizeTurkishChars('Güneş Sigorta A.Ş.')).toBe('Gunes Sigorta A.S.')
    })

    it('should handle lowercase ı', () => {
      expect(normalizeTurkishChars('sığorta')).toBe('sigorta')
    })
  })

  describe('normalizeCoverageName', () => {
    it('should normalize coverage names for comparison', () => {
      expect(normalizeCoverageName('Yangın Teminatı')).toBe('yangin teminati')
      expect(normalizeCoverageName('  HIRSIZLIK  ')).toBe('hirsizlik')
      expect(normalizeCoverageName('Deprem & Sel')).toBe('deprem  sel')
    })
  })

  describe('coverageNamesMatch', () => {
    it('should match identical names', () => {
      expect(coverageNamesMatch('Yangın', 'Yangın')).toBe(true)
    })

    it('should match with different cases', () => {
      expect(coverageNamesMatch('YANGIN', 'yangın')).toBe(true)
    })

    it('should match Turkish to English equivalents', () => {
      expect(coverageNamesMatch('Yangın Teminatı', 'Fire Coverage')).toBe(true)
      expect(coverageNamesMatch('Hırsızlık', 'Theft Protection')).toBe(true)
      expect(coverageNamesMatch('Deprem', 'Earthquake')).toBe(true)
    })

    it('should match partial names', () => {
      expect(coverageNamesMatch('Yangın', 'Yangın Teminatı')).toBe(true)
    })

    it('should not match unrelated names', () => {
      expect(coverageNamesMatch('Yangın', 'Sel')).toBe(false)
    })
  })
})

describe('Date Parsing', () => {
  describe('parseTurkishDate', () => {
    it('should parse DD.MM.YYYY format', () => {
      expect(parseTurkishDate('01.06.2024')).toBe('2024-06-01')
      expect(parseTurkishDate('15.12.2023')).toBe('2023-12-15')
      expect(parseTurkishDate('5.3.2024')).toBe('2024-03-05')
    })

    it('should parse DD/MM/YYYY format', () => {
      expect(parseTurkishDate('01/06/2024')).toBe('2024-06-01')
      expect(parseTurkishDate('25/12/2023')).toBe('2023-12-25')
    })

    it('should parse DD-MM-YYYY format', () => {
      expect(parseTurkishDate('01-06-2024')).toBe('2024-06-01')
    })

    it('should return ISO format unchanged', () => {
      expect(parseTurkishDate('2024-06-01')).toBe('2024-06-01')
    })

    it('should return null for invalid dates', () => {
      expect(parseTurkishDate('32.13.2024')).toBe(null)
      expect(parseTurkishDate('invalid')).toBe(null)
      expect(parseTurkishDate('')).toBe(null)
    })

    it('should handle edge cases', () => {
      expect(parseTurkishDate('29.02.2024')).toBe('2024-02-29') // Leap year
      expect(parseTurkishDate('29.02.2023')).toBe(null) // Not a leap year
    })

    it('correctly parses DD.MM.YYYY when day ≤ 12 (V8 Date swap regression, gotcha #52)', () => {
      // These are the exact cases where new Date() silently swaps day/month
      expect(parseTurkishDate('01.12.2024')).toBe('2024-12-01') // Dec 1, not Jan 12
      expect(parseTurkishDate('05.03.2024')).toBe('2024-03-05') // Mar 5, not May 3
      expect(parseTurkishDate('10.11.2025')).toBe('2025-11-10') // Nov 10, not Oct 11
      expect(parseTurkishDate('12.01.2024')).toBe('2024-01-12') // Jan 12
      expect(parseTurkishDate('03.07.2025')).toBe('2025-07-03') // Jul 3, not Mar 7
    })
  })

  describe('extractDatesFromText', () => {
    it('should extract multiple dates from text', () => {
      const text = 'Başlangıç: 01.06.2024, Bitiş: 01.06.2025'
      const dates = extractDatesFromText(text)
      expect(dates).toContain('2024-06-01')
      expect(dates).toContain('2025-06-01')
    })

    it('should return empty array for text without dates', () => {
      expect(extractDatesFromText('No dates here')).toEqual([])
    })
  })
})

describe('Currency Parsing', () => {
  describe('parseTurkishCurrency', () => {
    it('should parse Turkish format (1.234,56)', () => {
      expect(parseTurkishCurrency('1.234,56')).toBe(1234.56)
      expect(parseTurkishCurrency('12.345.678,90')).toBe(12345678.9)
    })

    it('should parse international format (1,234.56)', () => {
      expect(parseTurkishCurrency('1,234.56')).toBe(1234.56)
      expect(parseTurkishCurrency('12,345,678.90')).toBe(12345678.9)
    })

    it('should parse with currency symbols', () => {
      expect(parseTurkishCurrency('₺1.234,56')).toBe(1234.56)
      expect(parseTurkishCurrency('1.234,56 TL')).toBe(1234.56)
      expect(parseTurkishCurrency('TRY 1.234,56')).toBe(1234.56)
    })

    it('should handle simple numbers', () => {
      expect(parseTurkishCurrency('1000')).toBe(1000)
      expect(parseTurkishCurrency('1234,56')).toBe(1234.56)
    })

    it('should return null for invalid input', () => {
      expect(parseTurkishCurrency('')).toBe(null)
      expect(parseTurkishCurrency('abc')).toBe(null)
    })
  })

  describe('formatTurkishCurrency', () => {
    it('should format as Turkish Lira', () => {
      const formatted = formatTurkishCurrency(1234.56)
      expect(formatted).toContain('1.234')
      expect(formatted).toContain('56')
    })
  })
})

describe('Plate Number Parsing', () => {
  describe('parseTurkishPlate', () => {
    it('should parse valid plate numbers', () => {
      const plate = parseTurkishPlate('34 ABC 123')
      expect(plate).not.toBe(null)
      expect(plate?.cityCode).toBe('34')
      expect(plate?.letters).toBe('ABC')
      expect(plate?.numbers).toBe('123')
      expect(plate?.formatted).toBe('34 ABC 123')
    })

    it('should parse plates without spaces', () => {
      const plate = parseTurkishPlate('34ABC123')
      expect(plate?.formatted).toBe('34 ABC 123')
    })

    it('should parse plates with single letter', () => {
      const plate = parseTurkishPlate('06 A 1234')
      expect(plate?.cityCode).toBe('06')
      expect(plate?.letters).toBe('A')
    })

    it('should reject invalid city codes', () => {
      expect(parseTurkishPlate('99 ABC 123')).toBe(null) // Invalid city
      expect(parseTurkishPlate('00 ABC 123')).toBe(null) // Zero
    })

    it('should return null for invalid plates', () => {
      expect(parseTurkishPlate('invalid')).toBe(null)
      expect(parseTurkishPlate('')).toBe(null)
    })
  })
})

describe('TC Kimlik Validation', () => {
  describe('isValidTCKimlik', () => {
    it('should validate correct TC numbers', () => {
      // Note: Using test numbers that pass checksum
      expect(isValidTCKimlik('10000000146')).toBe(true)
    })

    it('should reject invalid TC numbers', () => {
      expect(isValidTCKimlik('12345678901')).toBe(false) // Invalid checksum
      expect(isValidTCKimlik('00000000000')).toBe(false) // Starts with 0
      expect(isValidTCKimlik('1234567890')).toBe(false) // Too short
      expect(isValidTCKimlik('123456789012')).toBe(false) // Too long
      expect(isValidTCKimlik('')).toBe(false)
    })
  })
})

describe('Policy Number Normalization', () => {
  describe('normalizePolicyNumber', () => {
    it('should normalize policy numbers', () => {
      expect(normalizePolicyNumber('abc-123-xyz')).toBe('ABC-123-XYZ')
      expect(normalizePolicyNumber('  ABC 123  ')).toBe('ABC123')
      expect(normalizePolicyNumber('ABC/123/XYZ')).toBe('ABC123XYZ')
    })

    it('should handle empty input', () => {
      expect(normalizePolicyNumber('')).toBe('')
    })
  })
})

describe('Premium Extraction', () => {
  describe('extractPremiumFromText', () => {
    it('should extract premium from Turkish text', () => {
      const text = 'Toplam Prim: ₺12.500,00'
      const result = extractPremiumFromText(text)
      expect(result?.amount).toBe(12500)
      expect(result?.currency).toBe('TRY')
    })

    it('should extract premium with TL suffix', () => {
      const text = 'Net Prim: 8.750,50 TL'
      const result = extractPremiumFromText(text)
      expect(result?.amount).toBe(8750.5)
    })

    it('should return null if no premium found', () => {
      expect(extractPremiumFromText('No premium here')).toBe(null)
    })
  })
})

describe('Policy Type Detection', () => {
  describe('detectPolicyTypeFromText', () => {
    it('should detect Kasko', () => {
      const text = 'Kasko Poliçesi - Araç Sigortası - Plaka: 34 ABC 123'
      expect(detectPolicyTypeFromText(text)).toBe('kasko')
    })

    it('should detect Traffic insurance', () => {
      const text = 'Zorunlu Mali Sorumluluk Trafik Sigortası'
      expect(detectPolicyTypeFromText(text)).toBe('traffic')
    })

    it('should detect Home insurance', () => {
      const text = 'Konut Sigortası Poliçesi - Bina ve Eşya Teminatları'
      expect(detectPolicyTypeFromText(text)).toBe('home')
    })

    it('should detect Health insurance', () => {
      const text = 'Özel Sağlık Sigortası - Hastane Tedavi Teminatı'
      expect(detectPolicyTypeFromText(text)).toBe('health')
    })

    it('should detect Life insurance', () => {
      const text = 'Hayat Sigortası Poliçesi - Vefat Teminatı - Lehdar Bilgileri'
      expect(detectPolicyTypeFromText(text)).toBe('life')
    })

    it('should detect DASK', () => {
      const text = 'DASK - Zorunlu Deprem Sigortası Poliçesi'
      expect(detectPolicyTypeFromText(text)).toBe('dask')
    })

    it('should detect Business insurance', () => {
      const text = 'İşyeri Sigortası - Ticari Paket Poliçe'
      expect(detectPolicyTypeFromText(text)).toBe('business')
    })

    it('should return null for unclear text', () => {
      expect(detectPolicyTypeFromText('random text')).toBe(null)
    })
  })
})
