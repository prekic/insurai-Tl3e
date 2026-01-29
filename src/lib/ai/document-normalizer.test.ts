/**
 * Tests for Document Normalizer - Clean-Room Document Conversion
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  DocumentNormalizer,
  normalizeDocument,
  getCleanCopy,
  getRedactedCopy,
} from './document-normalizer'

describe('DocumentNormalizer', () => {
  let normalizer: DocumentNormalizer

  beforeEach(() => {
    normalizer = new DocumentNormalizer()
  })

  describe('Clean Copy Creation', () => {
    it('should preserve policy numbers exactly', () => {
      const input = 'POLİÇE NO: POL-2024/12345A'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('POL-2024/12345A')
    })

    it('should preserve clause numbering exactly', () => {
      const input = 'A.4.11 Bu madde kapsamında... B.3.3.2.2 Diğer şartlar...'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('A.4.11')
      expect(result.cleanCopy).toContain('B.3.3.2.2')
    })

    it('should preserve dates exactly', () => {
      const input = 'Başlangıç: 15.01.2026 Bitiş: 15.01.2027'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('15.01.2026')
      expect(result.cleanCopy).toContain('15.01.2027')
    })

    it('should preserve currency amounts exactly', () => {
      const input = 'Teminat: ₺1.500.000,00 TL Muafiyet: 5.000 TL'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('1.500.000')
      expect(result.cleanCopy).toContain('5.000')
    })

    it('should preserve percentages exactly', () => {
      const input = 'Muafiyet oranı: %20 Hasar payı: 15%'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('%20')
      expect(result.cleanCopy).toContain('15%')
    })

    it('should fix spaced Turkish characters', () => {
      const input = 'B İ R L E Ş İ K S İ G O R T A'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('BİRLEŞİK')
      expect(result.cleanCopy).toContain('SİGORTA')
    })

    it('should fix spaced Turkish words in lowercase', () => {
      const input = 'poli ç e sigorta l ı teminat l ar'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('poliçe')
      expect(result.cleanCopy).toContain('sigortalı')
      expect(result.cleanCopy).toContain('teminatlar')
    })

    it('should repair hyphenation at line breaks', () => {
      const input = 'sigor-\nta poliçe-\nsi'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('sigorta')
      expect(result.cleanCopy).toContain('poliçesi')
    })

    it('should normalize bullet points', () => {
      const input = '• First item\n* Second item\n● Third item'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('- First item')
      expect(result.cleanCopy).toContain('- Second item')
      expect(result.cleanCopy).toContain('- Third item')
    })

    it('should remove garbage/binary data', () => {
      const input = 'Valid text\n<<<<<>>>>>[[[[]]]]{{{{}}}}|\\\nMore valid text'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('Valid text')
      expect(result.cleanCopy).toContain('More valid text')
      expect(result.cleanCopy).not.toContain('<<<<<>>>>>')
    })

    it('should remove control characters', () => {
      const input = 'Valid\x00text\x1Fhere'
      const result = normalizer.process(input)

      expect(result.cleanCopy).not.toContain('\x00')
      expect(result.cleanCopy).not.toContain('\x1F')
    })

    it('should normalize multiple spaces to single', () => {
      const input = 'Multiple    spaces    here'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toBe('Multiple spaces here')
    })
  })

  describe('Redacted Copy Creation', () => {
    it('should redact email addresses', () => {
      const input = 'Email: test@example.com Contact: info@company.com.tr'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:EMAIL_1]')
      expect(result.redactedCopy).toContain('[REDACTED:EMAIL_2]')
      expect(result.redactedCopy).not.toContain('test@example.com')
      expect(result.redactedCopy).not.toContain('info@company.com.tr')
    })

    it('should redact phone numbers', () => {
      const input = 'Tel: 0212 555 66 77 Mobil: +90 532 123 45 67'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:PHONE_')
      expect(result.redactedCopy).not.toContain('0212 555 66 77')
      expect(result.redactedCopy).not.toContain('532 123 45 67')
    })

    it('should redact IBAN numbers', () => {
      const input = 'IBAN: TR33 0006 1005 1978 6457 8413 26'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:IBAN_1]')
      expect(result.redactedCopy).not.toContain('TR33')
    })

    it('should redact TC Kimlik numbers', () => {
      // Valid TC Kimlik with correct checksum
      const input = 'TC Kimlik No: 10000000146'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:TAX_ID_1]')
      expect(result.redactedCopy).not.toContain('10000000146')
    })

    it('should redact license plates', () => {
      const input = 'Plaka: 34 ABC 123 Araç: 06 B 4567'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:PLATE_')
      expect(result.redactedCopy).not.toContain('34 ABC 123')
      expect(result.redactedCopy).not.toContain('06 B 4567')
    })

    it('should redact VIN numbers', () => {
      const input = 'VIN: WVWZZZ3CZWE123456'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:VIN_1]')
      expect(result.redactedCopy).not.toContain('WVWZZZ3CZWE123456')
    })

    it('should redact engine numbers', () => {
      const input = 'Motor No: ABC123456789'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:ENGINE_NO_1]')
      expect(result.redactedCopy).not.toContain('ABC123456789')
    })

    it('should redact serial numbers', () => {
      const input = 'Seri No: XYZ-987654321'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:SERIAL_NO_1]')
      expect(result.redactedCopy).not.toContain('XYZ-987654321')
    })

    it('should redact insured names from context', () => {
      const input = 'Sigortalı: Ahmet Yılmaz\nAdres: İstanbul'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:INSURED_1]')
      expect(result.redactedCopy).not.toContain('Ahmet Yılmaz')
    })

    it('should redact addresses from context', () => {
      // Address must be followed by a newline or keyword for the pattern to match
      const input = 'Adres: Atatürk Caddesi No:123 Kadıköy İstanbul 34000\nTel: 0212'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('[REDACTED:ADDRESS_1]')
      expect(result.redactedCopy).not.toContain('Atatürk Caddesi')
    })

    it('should use consistent tokens for same values', () => {
      const input = 'Email: test@example.com\nConfirm email: test@example.com'
      const result = normalizer.process(input)

      // Same email should get same token
      const tokens = result.redactedCopy.match(/\[REDACTED:EMAIL_\d+\]/g) || []
      expect(tokens.length).toBe(2)
      expect(tokens[0]).toBe(tokens[1])
    })

    it('should NOT redact insurer names', () => {
      const input = 'Sigortacı: Anadolu Sigorta A.Ş.'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('Anadolu Sigorta')
      expect(result.redactedCopy).toContain('Anadolu Sigorta')
    })

    it('should NOT redact coverage amounts', () => {
      const input = 'Teminat Limiti: 1.000.000 TL'
      const result = normalizer.process(input)

      expect(result.redactedCopy).toContain('1.000.000')
    })
  })

  describe('PII Vault', () => {
    it('should record all redacted PII in vault', () => {
      const input = 'Email: test@example.com Tel: 0212 555 66 77'
      const result = normalizer.process(input)

      expect(result.piiVault.length).toBeGreaterThanOrEqual(2)

      const emailEntry = result.piiVault.find(e => e.category === 'EMAIL')
      expect(emailEntry).toBeDefined()
      expect(emailEntry?.originalValue).toBe('test@example.com')

      const phoneEntry = result.piiVault.find(e => e.category === 'PHONE')
      expect(phoneEntry).toBeDefined()
    })

    it('should include context snippet for each entry', () => {
      const input = 'İletişim: Email: test@example.com adresine yazın'
      const result = normalizer.process(input)

      const emailEntry = result.piiVault.find(e => e.category === 'EMAIL')
      expect(emailEntry?.contextSnippet).toBeTruthy()
      expect(emailEntry?.contextSnippet.length).toBeLessThanOrEqual(60)
    })

    it('should count occurrences correctly', () => {
      const input = 'Email: test@example.com\nEmail tekrar: test@example.com'
      const result = normalizer.process(input)

      const emailEntries = result.piiVault.filter(e => e.category === 'EMAIL')
      expect(emailEntries.length).toBe(1)
      expect(emailEntries[0].occurrences).toBe(2)
    })
  })

  describe('Metadata', () => {
    it('should detect document title from content', () => {
      const input = 'KASKO SİGORTA POLİÇESİ\nPoliçe No: 12345'
      const result = normalizer.process(input)

      expect(result.metadata.documentTitle).toContain('KASKO')
    })

    it('should use provided title if given', () => {
      const input = 'Some content'
      const result = normalizer.process(input, { title: 'Test Document' })

      expect(result.metadata.documentTitle).toBe('Test Document')
    })

    it('should detect Turkish language', () => {
      const input = 'Bu bir Türkçe sigorta poliçesi metnidir. Teminatlar ve şartlar aşağıdadır.'
      const result = normalizer.process(input)

      expect(result.metadata.language).toContain('Turkish')
    })

    it('should include conversion date', () => {
      const result = normalizer.process('Test')

      expect(result.metadata.conversionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should count pages', () => {
      const input = 'Page 1\f\nPage 2\f\nPage 3'
      const result = normalizer.process(input)

      expect(result.metadata.pageCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Validation Report', () => {
    it('should pass validation for clean documents', () => {
      const input = 'Sigorta Poliçesi\nPoliçe No: 12345\nTeminat: 100.000 TL'
      const result = normalizer.process(input)

      expect(result.validationReport.completeness.noTruncation).toBe(true)
      expect(result.validationReport.issues.length).toBe(0)
    })

    it('should detect truncated documents', () => {
      const input = 'Document starts here...'
      const result = normalizer.process(input)

      expect(result.validationReport.completeness.noTruncation).toBe(false)
    })

    it('should verify identifier integrity', () => {
      const input = 'Poliçe No: POL-12345\nMadde A.4.11: Şartlar\nTutar: 100.000 TL\nTarih: 15.01.2026'
      const result = normalizer.process(input)

      expect(result.validationReport.identifierIntegrity.policyNumberUnchanged).toBe(true)
      expect(result.validationReport.identifierIntegrity.clauseReferencesUnchanged).toBe(true)
      expect(result.validationReport.identifierIntegrity.amountsUnchanged).toBe(true)
      expect(result.validationReport.identifierIntegrity.datesUnchanged).toBe(true)
    })

    it('should verify redaction correctness', () => {
      const input = 'Email: test@example.com Tel: 0212 555 66 77'
      const result = normalizer.process(input)

      expect(result.validationReport.redactionCorrectness.standardTokensOnly).toBe(true)
      expect(result.validationReport.redactionCorrectness.tokenConsistency).toBe(true)
    })
  })

  describe('Determinism', () => {
    it('should produce identical output for same input', () => {
      const input = 'Sigorta Poliçesi\nEmail: test@example.com\nPlaka: 34 ABC 123'

      const result1 = normalizer.process(input)
      const normalizer2 = new DocumentNormalizer()
      const result2 = normalizer2.process(input)

      expect(result1.cleanCopy).toBe(result2.cleanCopy)
      expect(result1.redactedCopy).toBe(result2.redactedCopy)
      expect(result1.piiVault.length).toBe(result2.piiVault.length)
    })
  })

  describe('Convenience Functions', () => {
    it('normalizeDocument should return all outputs', () => {
      const result = normalizeDocument('Test content with email@test.com')

      expect(result.cleanCopy).toBeTruthy()
      expect(result.redactedCopy).toBeTruthy()
      expect(result.piiVault).toBeDefined()
      expect(result.metadata).toBeDefined()
      expect(result.validationReport).toBeDefined()
    })

    it('getCleanCopy should return only clean copy', () => {
      const result = getCleanCopy('B İ R L E Ş İ K')

      expect(typeof result).toBe('string')
      expect(result).toContain('BİRLEŞİK')
    })

    it('getRedactedCopy should return only redacted copy', () => {
      const result = getRedactedCopy('Email: test@example.com')

      expect(typeof result).toBe('string')
      expect(result).toContain('[REDACTED:EMAIL_1]')
      expect(result).not.toContain('test@example.com')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = normalizer.process('')

      expect(result.cleanCopy).toBe('')
      expect(result.redactedCopy).toBe('')
      expect(result.piiVault.length).toBe(0)
    })

    it('should handle very long documents', () => {
      const longText = 'A'.repeat(100000)
      const result = normalizer.process(longText)

      expect(result.cleanCopy.length).toBeLessThanOrEqual(longText.length)
    })

    it('should handle mixed Turkish and English', () => {
      const input = 'Insurance Policy - Sigorta Poliçesi\nCoverage: Teminat 100.000 TL'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('Insurance Policy')
      expect(result.cleanCopy).toContain('Sigorta Poliçesi')
      expect(result.metadata.language).toContain('Turkish')
    })

    it('should handle special Unicode characters', () => {
      const input = 'İş Yeri Adresi: Atatürk Cd. №15 Şişli/İstanbul'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('İstanbul')
      expect(result.cleanCopy).toContain('Şişli')
    })

    it('should not modify markdown tables', () => {
      const input = '| Teminat | Limit |\n|---------|-------|\n| Yangın | 100.000 |'
      const result = normalizer.process(input)

      expect(result.cleanCopy).toContain('| Teminat | Limit |')
      expect(result.cleanCopy).toContain('|---------|-------|')
    })
  })
})

describe('TC Kimlik Validation', () => {
  it('should validate correct TC Kimlik numbers', () => {
    // 10000000146 is algorithmically valid:
    // sumOdd = 1+0+0+0+1 = 2, sumEven = 0+0+0+0 = 0
    // check1 = (2*7 - 0) % 10 = 4 (digit 9 is 4) ✓
    // sumFirst10 = 1+0+0+0+0+0+0+0+1+4 = 6 (digit 10 is 6) ✓
    const input = 'TC Kimlik: 10000000146'
    const result = normalizeDocument(input)

    // Verify PII vault contains the TC Kimlik
    const taxIdEntry = result.piiVault.find(e => e.category === 'TAX_ID')
    expect(taxIdEntry).toBeDefined()
    expect(taxIdEntry?.originalValue).toBe('10000000146')
  })

  it('should not redact invalid TC Kimlik numbers', () => {
    // Invalid checksum
    const input = 'Number: 12345678900'
    const result = normalizeDocument(input)

    // Should not be redacted as TAX_ID since checksum is invalid
    const taxIds = result.piiVault.filter(e => e.category === 'TAX_ID')
    expect(taxIds.length).toBe(0)
  })

  it('should not redact numbers starting with 0', () => {
    const input = 'Code: 01234567890'
    const result = normalizeDocument(input)

    const taxIds = result.piiVault.filter(e => e.category === 'TAX_ID')
    expect(taxIds.length).toBe(0)
  })
})
