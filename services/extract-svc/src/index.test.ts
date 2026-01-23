/**
 * Extract Service Tests
 *
 * Tests field extraction from normalized OCR text:
 * - Pattern matching for Turkish insurance fields
 * - TC Kimlik validation
 * - VIN validation
 * - Date normalization
 * - Currency normalization
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  FieldExtractor,
  validateTCKimlik,
  validateVIN,
  normalizeTurkishDate,
  normalizeCurrency,
  isValidDate,
  turkishPatterns,
} from './index'

describe('Validation Helpers', () => {
  describe('validateTCKimlik', () => {
    it('should validate correct TC Kimlik: 10000000146', () => {
      expect(validateTCKimlik('10000000146')).toBe(true)
    })

    it('should validate correct TC Kimlik: 17291716060', () => {
      expect(validateTCKimlik('17291716060')).toBe(true)
    })

    it('should reject TC Kimlik starting with 0', () => {
      expect(validateTCKimlik('01234567890')).toBe(false)
    })

    it('should reject TC Kimlik with wrong checksum', () => {
      expect(validateTCKimlik('12345678901')).toBe(false)
    })

    it('should reject TC Kimlik with wrong length', () => {
      expect(validateTCKimlik('123456789')).toBe(false)
      expect(validateTCKimlik('123456789012')).toBe(false)
    })

    it('should reject TC Kimlik with non-numeric characters', () => {
      expect(validateTCKimlik('1234567890A')).toBe(false)
    })
  })

  describe('validateVIN', () => {
    it('should validate correct VIN format', () => {
      // VINs with correct format (17 chars, no I/O/Q)
      expect(validateVIN('WVWZZZ3CZWE123456')).toBe(true)
    })

    it('should reject VIN with invalid characters I', () => {
      expect(validateVIN('WVWZZZ3CZWI123456')).toBe(false)
    })

    it('should reject VIN with invalid characters O', () => {
      expect(validateVIN('WVWZZZ3CZWO123456')).toBe(false)
    })

    it('should reject VIN with invalid characters Q', () => {
      expect(validateVIN('WVWZZZ3CZWQ123456')).toBe(false)
    })

    it('should reject VIN with wrong length', () => {
      expect(validateVIN('WVWZZZ3CZW')).toBe(false)
      expect(validateVIN('WVWZZZ3CZWE1234567890')).toBe(false)
    })

    it('should reject VIN with lowercase', () => {
      expect(validateVIN('wvwzzz3czwe123456')).toBe(false)
    })
  })

  describe('normalizeTurkishDate', () => {
    it('should normalize DD.MM.YYYY to YYYY-MM-DD', () => {
      expect(normalizeTurkishDate('15.01.2024')).toBe('2024-01-15')
    })

    it('should normalize DD/MM/YYYY to YYYY-MM-DD', () => {
      expect(normalizeTurkishDate('15/01/2024')).toBe('2024-01-15')
    })

    it('should normalize DD-MM-YYYY to YYYY-MM-DD', () => {
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

  describe('normalizeCurrency', () => {
    it('should remove thousand separators', () => {
      expect(normalizeCurrency('15.000')).toBe('15000')
    })

    it('should convert decimal comma to period', () => {
      expect(normalizeCurrency('15,50')).toBe('15.50')
    })

    it('should handle Turkish format: 15.000,50', () => {
      expect(normalizeCurrency('15.000,50')).toBe('15000.50')
    })

    it('should remove currency symbols', () => {
      expect(normalizeCurrency('₺15.000')).toBe('15000')
      expect(normalizeCurrency('15.000 TL')).toBe('15000')
    })
  })

  describe('isValidDate', () => {
    it('should validate ISO date format', () => {
      expect(isValidDate('2024-01-15')).toBe(true)
    })

    it('should reject invalid dates', () => {
      expect(isValidDate('invalid')).toBe(false)
      expect(isValidDate('')).toBe(false)
    })
  })
})

describe('FieldExtractor', () => {
  let extractor: FieldExtractor

  beforeEach(() => {
    extractor = new FieldExtractor()
  })

  describe('Policy Number Extraction', () => {
    it('should extract policy number', () => {
      const text = 'Poliçe No: ABC-2024-123456'
      const result = extractor.extract('doc-001', text)

      const policyField = result.fields.find(f => f.id === 'policy_number')
      expect(policyField).toBeDefined()
      expect(policyField?.value).toBe('ABC-2024-123456')
    })

    it('should handle various policy number formats', () => {
      const texts = [
        'Poliçe Numarası: 12345678',
        'POLICE NO: POL/2024/001',
        'Poliçe no : TR-ABC-123',
      ]

      for (const text of texts) {
        const result = extractor.extract('doc', text)
        const policyField = result.fields.find(f => f.id === 'policy_number')
        expect(policyField).toBeDefined()
      }
    })
  })

  describe('TC Kimlik Extraction', () => {
    it('should extract valid TC Kimlik', () => {
      const text = 'T.C. Kimlik No: 10000000146'
      const result = extractor.extract('doc-002', text)

      const tcField = result.fields.find(f => f.id === 'tc_kimlik')
      expect(tcField).toBeDefined()
      expect(tcField?.value).toBe('10000000146')
      expect(tcField?.confidence).toBeGreaterThan(0.9)
    })

    it('should extract TC Kimlik with various formats', () => {
      const texts = [
        'TC Kimlik No: 10000000146',
        'T.C. Numarası: 10000000146',
        'TC: 10000000146',
      ]

      for (const text of texts) {
        const result = extractor.extract('doc', text)
        const tcField = result.fields.find(f => f.id === 'tc_kimlik')
        expect(tcField?.value).toBe('10000000146')
      }
    })

    it('should have lower confidence for invalid TC Kimlik', () => {
      const text = 'T.C. Kimlik No: 12345678901' // Invalid checksum
      const result = extractor.extract('doc-003', text)

      const tcField = result.fields.find(f => f.id === 'tc_kimlik')
      // Should still extract but with lower confidence
      if (tcField) {
        expect(tcField.confidence).toBeLessThan(0.9)
      }
    })
  })

  describe('Date Extraction', () => {
    it('should extract start date', () => {
      const text = 'Başlangıç Tarihi: 15.01.2024'
      const result = extractor.extract('doc-004', text)

      const dateField = result.fields.find(f => f.id === 'start_date')
      expect(dateField).toBeDefined()
      expect(dateField?.value).toBe('2024-01-15')
    })

    it('should extract end date', () => {
      const text = 'Bitiş Tarihi: 15.01.2025'
      const result = extractor.extract('doc-005', text)

      const dateField = result.fields.find(f => f.id === 'end_date')
      expect(dateField).toBeDefined()
      expect(dateField?.value).toBe('2025-01-15')
    })

    it('should handle various date formats', () => {
      const texts = [
        { text: 'Poliçe Başlangıç: 15/01/2024', expected: '2024-01-15' },
        { text: 'Yürürlük Tarihi: 01-05-2024', expected: '2024-05-01' },
      ]

      for (const { text, expected } of texts) {
        const result = extractor.extract('doc', text)
        const dateField = result.fields.find(f => f.id === 'start_date')
        expect(dateField?.value).toBe(expected)
      }
    })
  })

  describe('Premium Extraction', () => {
    it('should extract premium amount', () => {
      const text = 'Toplam Prim: 15.000,50 TL'
      const result = extractor.extract('doc-006', text)

      const premiumField = result.fields.find(f => f.id === 'premium')
      expect(premiumField).toBeDefined()
      expect(premiumField?.value).toBe('15000.50')
    })

    it('should handle various premium formats', () => {
      const texts = [
        { text: 'Prim: 5000 TL', expected: '5000' },
        { text: 'Net Prim: ₺12.500', expected: '12500' },
        { text: 'Brüt Prim: 8.750,25', expected: '8750.25' },
      ]

      for (const { text, expected } of texts) {
        const result = extractor.extract('doc', text)
        const premiumField = result.fields.find(f => f.id === 'premium')
        expect(premiumField?.value).toBe(expected)
      }
    })
  })

  describe('Vehicle Plate Extraction', () => {
    it('should extract Turkish vehicle plate', () => {
      const text = 'Plaka No: 34 ABC 1234'
      const result = extractor.extract('doc-007', text)

      const plateField = result.fields.find(f => f.id === 'vehicle_plate')
      expect(plateField).toBeDefined()
      expect(plateField?.value).toBe('34 ABC 1234')
    })

    it('should handle various plate formats', () => {
      const texts = [
        { text: 'Plaka: 06 A 1', format: '06 A 1' },
        { text: 'Plaka: 34 TK 999', format: '34 TK 999' },
        { text: 'Plaka No: 01 ABC 12', format: '01 ABC 12' },
      ]

      for (const { text, format } of texts) {
        const result = extractor.extract('doc', text)
        const plateField = result.fields.find(f => f.id === 'vehicle_plate')
        expect(plateField?.value).toBe(format)
      }
    })
  })

  describe('VIN Extraction', () => {
    it('should extract VIN/chassis number', () => {
      const text = 'Şasi No: WVWZZZ3CZWE123456'
      const result = extractor.extract('doc-008', text)

      const vinField = result.fields.find(f => f.id === 'vin')
      expect(vinField).toBeDefined()
      expect(vinField?.value).toBe('WVWZZZ3CZWE123456')
    })
  })

  describe('Phone Number Extraction', () => {
    it('should extract phone number', () => {
      const text = 'Telefon: 0532 123 45 67'
      const result = extractor.extract('doc-009', text)

      const phoneField = result.fields.find(f => f.id === 'phone')
      expect(phoneField).toBeDefined()
      expect(phoneField?.value).toBe('05321234567')
    })
  })

  describe('Cross-Field Validation', () => {
    it('should detect invalid date range', () => {
      const text = `
        Başlangıç Tarihi: 15.01.2025
        Bitiş Tarihi: 15.01.2024
      `
      const result = extractor.extract('doc-010', text)

      expect(result.validationErrors).toContain('Start date must be before end date')
    })

    it('should not flag valid date range', () => {
      const text = `
        Başlangıç Tarihi: 15.01.2024
        Bitiş Tarihi: 15.01.2025
      `
      const result = extractor.extract('doc-011', text)

      expect(result.validationErrors).not.toContain('Start date must be before end date')
    })
  })

  describe('Real World Document Extraction', () => {
    it('should extract multiple fields from insurance document', () => {
      const document = `
        BİRLEŞİK KASKO SİGORTA POLİÇESİ

        Poliçe No: KSK-2024-123456
        T.C. Kimlik No: 10000000146
        Sigortalı: AHMET YILMAZ

        Başlangıç Tarihi: 01.01.2024
        Bitiş Tarihi: 01.01.2025

        Plaka No: 34 ABC 1234
        Şasi No: WVWZZZ3CZWE123456

        Toplam Prim: 15.000,00 TL

        Telefon: 0532 123 45 67
      `

      const result = extractor.extract('doc-012', document)

      // Should extract multiple fields
      expect(result.fields.length).toBeGreaterThan(5)

      // Check specific fields
      expect(result.fields.find(f => f.id === 'policy_number')?.value).toBe('KSK-2024-123456')
      expect(result.fields.find(f => f.id === 'tc_kimlik')?.value).toBe('10000000146')
      expect(result.fields.find(f => f.id === 'vehicle_plate')?.value).toBe('34 ABC 1234')
      expect(result.fields.find(f => f.id === 'premium')?.value).toBe('15000.00')

      // Overall confidence should be high
      expect(result.overallConfidence).toBeGreaterThan(0.8)

      // No validation errors
      expect(result.validationErrors.length).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const result = extractor.extract('doc-013', '')

      expect(result.fields.length).toBe(0)
      expect(result.overallConfidence).toBe(0)
    })

    it('should handle text with no matching fields', () => {
      const result = extractor.extract('doc-014', 'Random text with no insurance data')

      expect(result.fields.length).toBe(0)
    })

    it('should handle multiple occurrences (first match)', () => {
      const text = `
        Poliçe No: FIRST-123
        Poliçe No: SECOND-456
      `
      const result = extractor.extract('doc-015', text)

      const policyField = result.fields.find(f => f.id === 'policy_number')
      expect(policyField?.value).toBe('FIRST-123')
    })

    it('should track processing time', () => {
      const result = extractor.extract('doc-016', 'Some text')

      expect(result.processingTimeMs).toBeDefined()
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Custom Patterns', () => {
    it('should allow adding custom patterns', () => {
      const customExtractor = new FieldExtractor([])

      customExtractor.addPatterns([{
        id: 'custom_field',
        name: 'Custom Field',
        nameTr: 'Özel Alan',
        pattern: /CUSTOM:\s*(\w+)/i,
        extract: m => m[1],
        confidence: 0.9,
      }])

      const result = customExtractor.extract('doc-017', 'CUSTOM: TestValue')

      const customField = result.fields.find(f => f.id === 'custom_field')
      expect(customField?.value).toBe('TestValue')
    })
  })
})
