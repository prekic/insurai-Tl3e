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
      expect(normalizeCurrency('15000,50')).toBe('15000.50')
    })

    it('should handle combined thousand and decimal', () => {
      expect(normalizeCurrency('15.000,50')).toBe('15000.50')
    })

    it('should remove currency symbols', () => {
      expect(normalizeCurrency('₺15.000')).toBe('15000')
      expect(normalizeCurrency('15.000 TL')).toBe('15000')
    })
  })

  describe('isValidDate', () => {
    it('should validate correct dates', () => {
      expect(isValidDate('2024-01-15')).toBe(true)
      expect(isValidDate('2024-12-31')).toBe(true)
    })

    it('should reject invalid dates', () => {
      expect(isValidDate('invalid')).toBe(false)
      expect(isValidDate('2024-13-01')).toBe(false)
    })
  })
})

describe('FieldExtractor', () => {
  let extractor: FieldExtractor

  beforeEach(() => {
    extractor = new FieldExtractor()
  })

  describe('Policy Number Extraction', () => {
    it('should extract policy number', async () => {
      const text = 'Poliçe No: ABC-2024-123456'
      const result = await extractor.extract('doc-001', text, 'tr-TR', null)

      const policyField = result.fields.find(f => f.id === 'policy_number')
      expect(policyField).toBeDefined()
      expect(policyField?.value).toBe('ABC-2024-123456')
    })

    it('should handle various policy number formats', async () => {
      const texts = [
        'Poliçe Numarası: 12345678',
        'POLICE NO: POL/2024/001',
        'Poliçe no : TR-ABC-123',
      ]

      for (const text of texts) {
        const result = await extractor.extract('doc', text, 'tr-TR', null)
        const policyField = result.fields.find(f => f.id === 'policy_number')
        expect(policyField).toBeDefined()
      }
    })
  })

  describe('TC Kimlik Extraction', () => {
    it('should extract valid TC Kimlik', async () => {
      const text = 'T.C. Kimlik No: 10000000146'
      const result = await extractor.extract('doc-002', text, 'tr-TR', null)

      const tcField = result.fields.find(f => f.id === 'tc_kimlik')
      expect(tcField).toBeDefined()
      expect(tcField?.value).toBe('10000000146')
      expect(tcField?.confidence).toBeGreaterThan(0.9)
    })

    it('should extract TC Kimlik with various formats', async () => {
      const texts = [
        'TC Kimlik No: 10000000146',
        'T.C. Numarası: 10000000146',
        'TC: 10000000146',
      ]

      for (const text of texts) {
        const result = await extractor.extract('doc', text, 'tr-TR', null)
        const tcField = result.fields.find(f => f.id === 'tc_kimlik')
        expect(tcField?.value).toBe('10000000146')
      }
    })

    it('should have lower confidence for invalid TC Kimlik', async () => {
      const text = 'T.C. Kimlik No: 12345678901' // Invalid checksum
      const result = await extractor.extract('doc-003', text, 'tr-TR', null)

      const tcField = result.fields.find(f => f.id === 'tc_kimlik')
      // Should still extract but with lower confidence
      if (tcField) {
        expect(tcField.confidence).toBeLessThan(0.9)
      }
    })
  })

  describe('Date Extraction', () => {
    it('should extract start date', async () => {
      const text = 'Başlangıç Tarihi: 15.01.2024'
      const result = await extractor.extract('doc-004', text, 'tr-TR', null)

      const dateField = result.fields.find(f => f.id === 'start_date')
      expect(dateField).toBeDefined()
      expect(dateField?.value).toBe('2024-01-15')
    })

    it('should extract end date', async () => {
      const text = 'Bitiş Tarihi: 15.01.2025'
      const result = await extractor.extract('doc-005', text, 'tr-TR', null)

      const dateField = result.fields.find(f => f.id === 'end_date')
      expect(dateField).toBeDefined()
      expect(dateField?.value).toBe('2025-01-15')
    })

    it('should handle various date formats', async () => {
      const texts = [
        { text: 'Poliçe Başlangıç: 15/01/2024', expected: '2024-01-15' },
        { text: 'Yürürlük Tarihi: 01-05-2024', expected: '2024-05-01' },
      ]

      for (const { text, expected } of texts) {
        const result = await extractor.extract('doc', text, 'tr-TR', null)
        const dateField = result.fields.find(f => f.id === 'start_date')
        expect(dateField?.value).toBe(expected)
      }
    })
  })

  describe('Premium Extraction', () => {
    it('should extract premium amount', async () => {
      const text = 'Toplam Prim: 15.000,50 TL'
      const result = await extractor.extract('doc-006', text, 'tr-TR', null)

      const premiumField = result.fields.find(f => f.id === 'premium')
      expect(premiumField).toBeDefined()
      expect(premiumField?.value).toBe('15000.50')
    })

    it('should handle various premium formats', async () => {
      const texts = [
        { text: 'Net Prim: 12500 TL', expected: '12500' },
        { text: 'Brüt Prim: ₺25.000', expected: '25000' },
        { text: 'Prim: 8.750,00', expected: '8750.00' },
      ]

      for (const { text, expected } of texts) {
        const result = await extractor.extract('doc', text, 'tr-TR', null)
        const premiumField = result.fields.find(f => f.id === 'premium')
        expect(premiumField?.value).toBe(expected)
      }
    })

    it('should handle currency symbol before number', async () => {
      const text = 'Net Prim: ₺12.500'
      const result = await extractor.extract('doc', text, 'tr-TR', null)

      const premiumField = result.fields.find(f => f.id === 'premium')
      expect(premiumField).toBeDefined()
      expect(premiumField?.value).toBe('12500')
    })
  })

  describe('Vehicle Plate Extraction', () => {
    it('should extract vehicle plate', async () => {
      const text = 'Plaka No: 34 ABC 1234'
      const result = await extractor.extract('doc-007', text, 'tr-TR', null)

      const plateField = result.fields.find(f => f.id === 'vehicle_plate')
      expect(plateField).toBeDefined()
      expect(plateField?.value).toBe('34 ABC 1234')
    })

    it('should handle various plate formats', async () => {
      const texts = [
        'Plaka: 06 A 123',
        'Plaka: 35 ABC 99',
        'Plaka No: 01 AB 1',
      ]

      for (const text of texts) {
        const result = await extractor.extract('doc', text, 'tr-TR', null)
        const plateField = result.fields.find(f => f.id === 'vehicle_plate')
        expect(plateField).toBeDefined()
      }
    })
  })

  describe('VIN Extraction', () => {
    it('should extract valid VIN', async () => {
      const text = 'Şasi No: WVWZZZ3CZWE123456'
      const result = await extractor.extract('doc-008', text, 'tr-TR', null)

      const vinField = result.fields.find(f => f.id === 'vin')
      expect(vinField).toBeDefined()
      expect(vinField?.value).toBe('WVWZZZ3CZWE123456')
    })

    it('should convert VIN to uppercase', async () => {
      const text = 'VIN: wvwzzz3czwe123456'
      const result = await extractor.extract('doc-009', text, 'tr-TR', null)

      const vinField = result.fields.find(f => f.id === 'vin')
      expect(vinField?.value).toBe('WVWZZZ3CZWE123456')
    })
  })

  describe('Cross-field Validation', () => {
    it('should detect date range error', async () => {
      const text = `
        Başlangıç Tarihi: 15.01.2025
        Bitiş Tarihi: 15.01.2024
      `
      const result = await extractor.extract('doc-010', text, 'tr-TR', null)

      expect(result.validationErrors).toContain('Start date must be before end date')
    })

    it('should not have errors for valid date range', async () => {
      const text = `
        Başlangıç Tarihi: 15.01.2024
        Bitiş Tarihi: 15.01.2025
      `
      const result = await extractor.extract('doc-011', text, 'tr-TR', null)

      expect(result.validationErrors).not.toContain('Start date must be before end date')
    })
  })

  describe('Policy Type Specific Extraction', () => {
    it('should extract motor kasko fields', async () => {
      const text = `
        Poliçe No: KSK-2024-001
        Marka: Toyota
        Model: Corolla
        Model Yılı: 2022
        Araç Değeri: 500.000 TL
      `
      const result = await extractor.extract('doc-012', text, 'tr-TR', 'motor_kasko')

      expect(result.fields.find(f => f.id === 'policy_number')).toBeDefined()
      expect(result.fields.find(f => f.id === 'vehicle_brand')?.value).toBe('Toyota')
      expect(result.fields.find(f => f.id === 'vehicle_year')?.value).toBe('2022')
    })

    it('should extract property fields', async () => {
      const text = `
        Poliçe No: YNG-2024-001
        Riziko Adresi: İstanbul, Kadıköy
        Yapı Tarzı: Betonarme
        Brüt Alan: 150 m²
      `
      const result = await extractor.extract('doc-013', text, 'tr-TR', 'property_fire')

      expect(result.fields.find(f => f.id === 'policy_number')).toBeDefined()
      expect(result.fields.find(f => f.id === 'building_type')?.value).toBe('Betonarme')
      expect(result.fields.find(f => f.id === 'floor_area')?.value).toBe('150')
    })
  })

  describe('Overall Confidence', () => {
    it('should calculate overall confidence', async () => {
      const text = `
        Poliçe No: ABC-123456
        T.C. Kimlik No: 10000000146
        Başlangıç Tarihi: 15.01.2024
      `
      const result = await extractor.extract('doc-014', text, 'tr-TR', null)

      expect(result.overallConfidence).toBeGreaterThan(0)
      expect(result.overallConfidence).toBeLessThanOrEqual(1)
    })

    it('should return 0 confidence for empty result', async () => {
      const text = 'No extractable content here'
      const result = await extractor.extract('doc-015', text, 'tr-TR', null)

      expect(result.overallConfidence).toBe(0)
    })
  })

  describe('Extraction Targets', () => {
    it('should return targets for default policy type', () => {
      const targets = extractor.getTargets(null)

      expect(targets.length).toBeGreaterThan(0)
      expect(targets.find(t => t.fieldId === 'policy_number')).toBeDefined()
      expect(targets.find(t => t.fieldId === 'policy_number')?.required).toBe(true)
    })

    it('should return additional targets for motor kasko', () => {
      const defaultTargets = extractor.getTargets(null)
      const kaskoTargets = extractor.getTargets('motor_kasko')

      expect(kaskoTargets.length).toBeGreaterThan(defaultTargets.length)
      expect(kaskoTargets.find(t => t.fieldId === 'vehicle_brand')).toBeDefined()
    })
  })
})

describe('Turkish Patterns', () => {
  it('should have all required patterns', () => {
    const requiredPatterns = ['policy_number', 'tc_kimlik', 'start_date', 'end_date', 'premium']

    for (const id of requiredPatterns) {
      const pattern = turkishPatterns.find(p => p.id === id)
      expect(pattern).toBeDefined()
    }
  })

  it('should have valid confidence values', () => {
    for (const pattern of turkishPatterns) {
      if (pattern.confidence !== undefined) {
        expect(pattern.confidence).toBeGreaterThan(0)
        expect(pattern.confidence).toBeLessThanOrEqual(1)
      }
    }
  })
})
