/**
 * Tests for Deterministic OCR Pre-Clean Module
 */
import { describe, it, expect } from 'vitest'
import {
  preCleanOcrText,
  checkPreCleanQuality,
  cleanUnicodeJunk,
  removeControlChars,
  dropNoiseLines,
  removeInlineBarcodeArtifacts,
  iterativeDespace,
  normalizeLabels,
  normalizeSbmFields,
  normalizePageMarkers,
  collapseWhitespace,
  reflowSectionHeaders,
  isNoiseLine,
} from './deterministic-preclean'

// ============================================================================
// A. UNICODE / CONTROL CHARACTER CLEANUP
// ============================================================================

describe('cleanUnicodeJunk', () => {
  it('should convert CRLF to LF', () => {
    const result = cleanUnicodeJunk('line1\r\nline2\r\nline3')
    expect(result.text).toBe('line1\nline2\nline3')
    expect(result.removed).toBe(2) // 2 CRLF sequences
  })

  it('should convert CR to LF', () => {
    const result = cleanUnicodeJunk('line1\rline2\rline3')
    expect(result.text).toBe('line1\nline2\nline3')
    expect(result.removed).toBe(2)
  })

  it('should remove BOM', () => {
    const result = cleanUnicodeJunk('\uFEFFHello World')
    expect(result.text).toBe('Hello World')
    expect(result.removed).toBe(1)
  })

  it('should remove zero-width characters', () => {
    const result = cleanUnicodeJunk('Hello\u200BWorld\u200F')
    expect(result.text).toBe('HelloWorld')
    expect(result.removed).toBe(2)
  })

  it('should handle clean text', () => {
    const result = cleanUnicodeJunk('Clean text without issues')
    expect(result.text).toBe('Clean text without issues')
    expect(result.removed).toBe(0)
  })
})

describe('removeControlChars', () => {
  it('should remove null bytes', () => {
    const result = removeControlChars('Hello\x00World')
    expect(result.text).toBe('HelloWorld')
    expect(result.removed).toBe(1)
  })

  it('should remove escape and other control chars', () => {
    const result = removeControlChars('Hello\x1B[31mWorld\x7F')
    expect(result.text).toBe('Hello[31mWorld')
    expect(result.removed).toBe(2)
  })

  it('should preserve newlines and tabs', () => {
    const result = removeControlChars('Line1\nLine2\tColumn')
    expect(result.text).toBe('Line1\nLine2\tColumn')
    expect(result.removed).toBe(0)
  })

  it('should handle mixed control characters', () => {
    const result = removeControlChars('\x00\x01\x02Hello\x03\x04World\x05')
    expect(result.text).toBe('HelloWorld')
    expect(result.removed).toBe(6)
  })
})

// ============================================================================
// B. LINE-LEVEL BARCODE/QR PAYLOAD REMOVAL
// ============================================================================

describe('isNoiseLine', () => {
  it('should detect B^^^B barcode sentinel', () => {
    const result = isNoiseLine('B^^^B some garbage data here')
    expect(result.isNoise).toBe(true)
    expect(result.reason).toBe('barcode_sentinel')
  })

  it('should detect a!!! pattern', () => {
    const result = isNoiseLine('a!!!!a some noise')
    expect(result.isNoise).toBe(true)
    expect(result.reason).toBe('barcode_sentinel')
  })

  it('should detect complex a!!!a pattern', () => {
    const result = isNoiseLine('a!!!!!a!AAAaA!AA!!!aaAA!aAaAA!!')
    expect(result.isNoise).toBe(true)
    expect(result.reason).toBe('barcode_sentinel')
  })

  it('should detect low alphanumeric ratio with punctuation runs', () => {
    const result = isNoiseLine('!!!!!!^^^###$$$%%%****@@@!!!')
    expect(result.isNoise).toBe(true)
    expect(result.reason).toBe('low_alnum_ratio')
  })

  it('should detect special character clusters', () => {
    const result = isNoiseLine('This has <>[]{}<>|\\^$ and more')
    expect(result.isNoise).toBe(true)
    expect(result.reason).toBe('special_cluster')
  })

  it('should detect bracket garbage patterns', () => {
    const result = isNoiseLine('Some text <with|$^garbage> in brackets')
    expect(result.isNoise).toBe(true)
    expect(result.reason).toBe('bracket_garbage')
  })

  it('should detect repetitive characters', () => {
    const result = isNoiseLine('This has aaaaaaaaaaa repeated chars')
    expect(result.isNoise).toBe(true)
    expect(result.reason).toBe('repetitive_chars')
  })

  it('should detect mostly symbols line', () => {
    const result = isNoiseLine('!@#$%^&*()[]{}|<>~`')
    expect(result.isNoise).toBe(true)
    expect(result.reason).toBe('mostly_symbols')
  })

  it('should NOT flag normal Turkish text', () => {
    const result = isNoiseLine('BİRLEŞİK KASKO SİGORTA POLİÇESİ')
    expect(result.isNoise).toBe(false)
  })

  it('should NOT flag empty lines', () => {
    const result = isNoiseLine('')
    expect(result.isNoise).toBe(false)
  })

  it('should NOT flag whitespace-only lines', () => {
    const result = isNoiseLine('   ')
    expect(result.isNoise).toBe(false)
  })

  it('should NOT flag short lines with some symbols', () => {
    const result = isNoiseLine('No: 123/456')
    expect(result.isNoise).toBe(false)
  })
})

describe('dropNoiseLines', () => {
  it('should remove barcode lines', () => {
    const input = `Line 1
B^^^B garbage data
Line 2
a!!!!a more garbage
Line 3`

    const result = dropNoiseLines(input)
    // Noise lines are removed, not replaced with empty lines
    expect(result.text).toBe('Line 1\nLine 2\nLine 3')
    expect(result.linesRemoved).toBe(2)
    expect(result.reasons.barcode_sentinel).toBe(2)
  })

  it('should keep all valid lines', () => {
    const input = `SİGORTA POLİÇESİ
Poliçe No: 123456
Sigortalı: Ahmet Yılmaz`

    const result = dropNoiseLines(input)
    expect(result.text).toBe(input)
    expect(result.linesRemoved).toBe(0)
  })

  it('should handle empty input', () => {
    const result = dropNoiseLines('')
    expect(result.text).toBe('')
    expect(result.linesRemoved).toBe(0)
  })
})

describe('removeInlineBarcodeArtifacts', () => {
  it('should remove B^^^B pattern', () => {
    const result = removeInlineBarcodeArtifacts('Some B^^^Bgarbage text')
    expect(result.text).toBe('Some  text')
    expect(result.removed).toBeGreaterThan(0)
  })

  it('should remove a!!! variants', () => {
    const result = removeInlineBarcodeArtifacts('Text a!!!a more text')
    expect(result.text).not.toContain('a!!!')
  })

  it('should remove complex a!!! patterns', () => {
    const result = removeInlineBarcodeArtifacts('Text a!!!!!a!AAAaA!AA!!!aaAA!aAaAA!! more')
    expect(result.text).not.toContain('a!!!!!')
    expect(result.text).not.toContain('aAaAA')
  })

  it('should remove <:...> patterns', () => {
    const result = removeInlineBarcodeArtifacts('Text <:8@+2ZSM> more text')
    expect(result.text).toBe('Text  more text')
  })

  it('should remove ^^ sequences', () => {
    const result = removeInlineBarcodeArtifacts('Text ^^^garbage more')
    expect(result.text).not.toContain('^^^')
  })

  it('should handle multiple artifacts', () => {
    const result = removeInlineBarcodeArtifacts('B^^^B a!!!a <:test> ^^^more')
    expect(result.text.trim()).toBe('')
    expect(result.removed).toBeGreaterThan(0)
  })
})

// ============================================================================
// C. TURKISH DE-SPACING
// ============================================================================

describe('iterativeDespace', () => {
  it('should fix fully spaced uppercase words', () => {
    const result = iterativeDespace('B İ R L E Ş İ K', 6)
    expect(result.text).toBe('BİRLEŞİK')
    expect(result.totalCount).toBeGreaterThan(0)
  })

  it('should fix S İ G O R T A', () => {
    const result = iterativeDespace('S İ G O R T A', 6)
    expect(result.text).toBe('SİGORTA')
  })

  it('should fix P O L İ Ç E', () => {
    const result = iterativeDespace('P O L İ Ç E', 6)
    expect(result.text).toBe('POLİÇE')
  })

  it('should fix K A S K O', () => {
    const result = iterativeDespace('K A S K O', 6)
    expect(result.text).toBe('KASKO')
  })

  it('should fix mixed case spacing like M ü ş t e r i', () => {
    const result = iterativeDespace('M ü ş t e r i', 6)
    expect(result.text).toBe('Müşteri')
  })

  it('should fix partial spacing like Şİ RKET', () => {
    const result = iterativeDespace('Şİ RKET', 6)
    expect(result.text).toBe('ŞİRKET')
  })

  it('should fix T Ü R K İ Y E', () => {
    const result = iterativeDespace('T Ü R K İ Y E', 6)
    expect(result.text).toBe('TÜRKİYE')
  })

  it('should handle complex document excerpt', () => {
    const input = 'B İ RLE Şİ K KASKO S İ GORTA POL İÇ ES İ'
    const result = iterativeDespace(input, 6)
    expect(result.text).toContain('BİRLEŞİK')
    expect(result.text).toContain('KASKO')
    expect(result.text).toContain('SİGORTA')
    expect(result.text).toContain('POLİÇE')
  })

  it('should handle S Ö ZLE Ş ME TARAFLARI', () => {
    const result = iterativeDespace('S Ö ZLE Ş ME TARAFLARI', 6)
    expect(result.text).toContain('SÖZLEŞME')
    expect(result.text).toContain('TARAFLARI')
  })

  it('should not modify already correct text significantly', () => {
    const input = 'BİRLEŞİK KASKO SİGORTA POLİÇESİ'
    const result = iterativeDespace(input, 6)
    // Output should match input (idempotent)
    expect(result.text).toBe(input)
  })

  it('should iterate multiple passes until stable', () => {
    const input = 'S İ G O R T A   P O L İ Ç E S İ'
    const result = iterativeDespace(input, 10)
    expect(result.text).toContain('SİGORTA')
    expect(result.text).toContain('POLİÇE')
    expect(result.passes).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// D. LABEL NORMALIZATION
// ============================================================================

describe('normalizeLabels', () => {
  it('should fix poliçeNo → Poliçe No', () => {
    const result = normalizeLabels('poliçeNo: 12345')
    expect(result.text).toBe('Poliçe No: 12345')
  })

  it('should fix AdıSoyadı → Adı Soyadı', () => {
    const result = normalizeLabels('AdıSoyadı: Ahmet Yılmaz')
    expect(result.text).toBe('Adı Soyadı: Ahmet Yılmaz')
  })

  it('should fix HUSUSİOTOMOBİL → HUSUSİ OTOMOBİL', () => {
    const result = normalizeLabels('Kullanım: HUSUSİOTOMOBİL')
    expect(result.text).toBe('Kullanım: HUSUSİ OTOMOBİL')
  })

  it('should fix BİLGİLERİPlaka', () => {
    const result = normalizeLabels('ARAÇ BİLGİLERİPlaka')
    expect(result.text).toBe('ARAÇ BİLGİLERİ Plaka')
  })

  it('should handle multiple label fixes', () => {
    const input = 'poliçeNo: 123\nAdıSoyadı: Test\nKullanımŞekli: Hususi'
    const result = normalizeLabels(input)
    expect(result.text).toContain('Poliçe No')
    expect(result.text).toContain('Adı Soyadı')
    expect(result.text).toContain('Kullanım Şekli')
    expect(result.count).toBeGreaterThanOrEqual(3) // May match multiple patterns
  })
})

describe('normalizeSbmFields', () => {
  it('should normalize SBM BIM Ref No', () => {
    const result = normalizeSbmFields('SBM   BIM  Ref  No: 12345')
    expect(result.text).toBe('SBM BIM Ref No: 12345')
  })

  it('should fix SBMPoliçeNo', () => {
    const result = normalizeSbmFields('SBMPoliçeNo: 67890')
    expect(result.text).toBe('SBM Poliçe No: 67890')
  })
})

// ============================================================================
// E. PAGE MARKER NORMALIZATION
// ============================================================================

describe('normalizePageMarkers', () => {
  it('should normalize Sayfa : X/Y to Sayfa: X/Y', () => {
    const result = normalizePageMarkers('Sayfa : 1/3')
    expect(result.text).toBe('Sayfa: 1/3')
    expect(result.count).toBe(1)
  })

  it('should handle spaces around slash', () => {
    const result = normalizePageMarkers('Sayfa : 2 / 5')
    expect(result.text).toBe('Sayfa: 2/5')
  })

  it('should handle multiple page markers', () => {
    const result = normalizePageMarkers('Page 1\nSayfa : 1/3\nContent\nSayfa : 2/3')
    expect(result.count).toBe(2)
    expect(result.text).toContain('Sayfa: 1/3')
    expect(result.text).toContain('Sayfa: 2/3')
  })
})

// ============================================================================
// F. NUMERIC AND FORMATTING NORMALIZATION
// ============================================================================

describe('collapseWhitespace', () => {
  it('should collapse multiple spaces', () => {
    const result = collapseWhitespace('Hello    World')
    expect(result).toBe('Hello World')
  })

  it('should collapse multiple newlines to max 2', () => {
    const result = collapseWhitespace('Line1\n\n\n\n\nLine2')
    expect(result).toBe('Line1\n\nLine2')
  })

  it('should remove trailing whitespace before newlines', () => {
    const result = collapseWhitespace('Line1   \nLine2')
    expect(result).toBe('Line1\nLine2')
  })

  it('should trim leading and trailing whitespace', () => {
    const result = collapseWhitespace('  Hello World  ')
    expect(result).toBe('Hello World')
  })

  it('should collapse tabs', () => {
    const result = collapseWhitespace('Hello\t\t\tWorld')
    expect(result).toBe('Hello World')
  })
})

// ============================================================================
// G. SECTION HEADER REFLOW
// ============================================================================

describe('reflowSectionHeaders', () => {
  it('should ensure section headers start on fresh block', () => {
    const input = 'Some text SÖZLEŞME TARAFLARI more text'
    const result = reflowSectionHeaders(input)
    expect(result).toContain('\n\nSÖZLEŞME TARAFLARI\n')
  })

  it('should handle TEMİNATLAR header', () => {
    const input = 'Content TEMİNATLAR more content'
    const result = reflowSectionHeaders(input)
    expect(result).toContain('\n\nTEMİNATLAR\n')
  })

  it('should handle PRİM BİLGİLERİ header', () => {
    const input = 'Previous content PRİM BİLGİLERİ next content'
    const result = reflowSectionHeaders(input)
    expect(result).toContain('\n\nPRİM BİLGİLERİ\n')
  })

  it('should handle headers with spacing issues', () => {
    const input = 'Content  SÖZLEŞME   TARAFLARI  more'
    const result = reflowSectionHeaders(input)
    expect(result).toContain('\n\nSÖZLEŞME TARAFLARI\n')
  })
})

// ============================================================================
// MAIN FUNCTION
// ============================================================================

describe('preCleanOcrText', () => {
  it('should process full document sample', () => {
    const input = `B İ RLE Şİ K KASKO S İ GORTA POL İÇ ES İ
B^^^B a!!!!a garbage line
S Ö ZLE Ş ME TARAFLARI
Sayfa : 1/3
poliçeNo: 12345`

    const result = preCleanOcrText(input)

    // Check that Turkish words are de-spaced
    expect(result.text).toContain('BİRLEŞİK')
    expect(result.text).toContain('KASKO')
    expect(result.text).toContain('SİGORTA')
    expect(result.text).toContain('POLİÇE')
    expect(result.text).toContain('SÖZLEŞME')

    // Check that barcode garbage is removed
    expect(result.text).not.toContain('B^^^B')
    expect(result.text).not.toContain('a!!!!')

    // Check that page marker is normalized
    expect(result.text).toContain('Sayfa: 1/3')

    // Check that label is normalized
    expect(result.text).toContain('Poliçe No')

    // Check stats
    expect(result.stats.originalLength).toBeGreaterThan(0)
    expect(result.stats.finalLength).toBeLessThan(result.stats.originalLength)
    expect(result.stats.noiseLinesRemoved).toBeGreaterThanOrEqual(1)
    expect(result.stats.turkishWordsDespaced).toBeGreaterThan(0)
  })

  it('should handle real-world document excerpt', () => {
    const input = `B İ RLE Şİ K KASKO S İ GORTA POL İÇ ES İ
S Ö ZLE Ş ME TARAFLARI
S İ GORTA Şİ RKET İ: T Ü RK PREMER S İ GORTA A.Ş.
Adres: Sahrayıcedit Mah. Yeni Sabri Yoluç sok. No: 25 /1A Kat 2 SİTESİSit`

    const result = preCleanOcrText(input)

    expect(result.text).toContain('BİRLEŞİK KASKO SİGORTA')
    expect(result.text).toContain('SÖZLEŞME TARAFLARI')
    expect(result.text).toContain('SİGORTA')
    expect(result.text).toContain('ŞİRKET')
    expect(result.text).toContain('TÜRK')
    expect(result.text).toContain('SİGORTA A.Ş.')
    expect(result.text).toContain('No: 25/1A')
    expect(result.text).toContain('SİTESİ Sit')
  })

  it('should handle document with control characters', () => {
    const input = 'Hello\x00World\x1BTest\x7FEnd'
    const result = preCleanOcrText(input)
    expect(result.text).toBe('HelloWorldTestEnd')
    expect(result.stats.controlCharsRemoved).toBe(3)
  })

  it('should handle empty input', () => {
    const result = preCleanOcrText('')
    expect(result.text).toBe('')
    expect(result.stats.originalLength).toBe(0)
    expect(result.stats.finalLength).toBe(0)
  })

  it('should handle already clean text', () => {
    const input = 'BİRLEŞİK KASKO SİGORTA POLİÇESİ'
    const result = preCleanOcrText(input)
    expect(result.text).toBe(input)
  })

  it('should respect maxDespacingPasses config', () => {
    const input = 'S İ G O R T A'
    const result = preCleanOcrText(input, { maxDespacingPasses: 1 })
    // Should still fix in one pass since common words are handled
    expect(result.text).toBe('SİGORTA')
  })

  it('should include stats about all transformations', () => {
    const input = `B İ R L E Ş İ K
B^^^B noise
Sayfa : 1/2
poliçeNo: test`

    const result = preCleanOcrText(input)

    expect(result.stats).toHaveProperty('originalLength')
    expect(result.stats).toHaveProperty('finalLength')
    expect(result.stats).toHaveProperty('noiseLinesRemoved')
    expect(result.stats).toHaveProperty('turkishWordsDespaced')
    expect(result.stats).toHaveProperty('barcodeArtifactsRemoved')
    expect(result.stats).toHaveProperty('controlCharsRemoved')
    expect(result.stats).toHaveProperty('labelsNormalized')
    expect(result.stats).toHaveProperty('pageMarkersNormalized')
    expect(result.stats).toHaveProperty('totalPasses')
  })
})

// ============================================================================
// QUALITY CHECK
// ============================================================================

describe('checkPreCleanQuality', () => {
  it('should pass for clean text', () => {
    const result = checkPreCleanQuality('BİRLEŞİK KASKO SİGORTA POLİÇESİ')
    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('should fail for text with B^^^B', () => {
    const result = checkPreCleanQuality('Some B^^^B remaining text')
    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Contains B^^^B barcode artifact')
  })

  it('should fail for text with a!!! pattern', () => {
    const result = checkPreCleanQuality('Some a!!!! remaining text')
    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Contains a!!! barcode artifact')
  })

  it('should warn about spaced Turkish words', () => {
    const result = checkPreCleanQuality('S İ G O R T A')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('spaced Turkish word')
  })

  it('should warn about low alphanumeric ratio lines', () => {
    const result = checkPreCleanQuality('Normal line\n!!!!!####$$$$$%%%^^^^&&&&*****\nAnother line')
    expect(result.warnings.some((w) => w.includes('low alphanumeric ratio'))).toBe(true)
  })

  it('should handle empty text', () => {
    const result = checkPreCleanQuality('')
    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})

// ============================================================================
// EDGE CASES AND INTEGRATION
// ============================================================================

describe('edge cases', () => {
  it('should handle Turkish special characters correctly', () => {
    // Note: İstanbul gets uppercased by fixCommonTurkishWords pattern
    // Using words that won't match any de-spacing patterns
    const input = 'Üsküdar Çankaya Ğümüş Öğle Şehir'
    const result = preCleanOcrText(input)
    // Should preserve these as they're already correct
    expect(result.text).toContain('Üsküdar')
    expect(result.text).toContain('Çankaya')
    expect(result.text).toContain('Şehir')
  })

  it('should handle mixed Turkish and English text', () => {
    const input = 'Policy Number: 123\nPoliçe No: 456'
    const result = preCleanOcrText(input)
    expect(result.text).toContain('Policy Number: 123')
    expect(result.text).toContain('Poliçe No: 456')
  })

  it('should handle numbers and dates', () => {
    const input = 'Tarih: 01.01.2026\nTutar: 15.000,00 TL'
    const result = preCleanOcrText(input)
    expect(result.text).toContain('01.01.2026')
    expect(result.text).toContain('15.000,00 TL')
  })

  it('should not break valid URLs or emails', () => {
    const input = 'Email: test@example.com\nWeb: www.sigorta.com.tr'
    const result = preCleanOcrText(input)
    expect(result.text).toContain('test@example.com')
    expect(result.text).toContain('www.sigorta.com.tr')
  })

  it('should handle IBAN and TC Kimlik numbers', () => {
    const input = 'IBAN: TR12 0000 0000 0000 0000 0000 00\nTC Kimlik: 12345678901'
    const result = preCleanOcrText(input)
    expect(result.text).toContain('TR12')
    expect(result.text).toContain('12345678901')
  })

  it('should handle license plate format', () => {
    const input = 'Plaka: 34 ABC 123'
    const result = preCleanOcrText(input)
    expect(result.text).toContain('34 ABC 123')
  })

  it('should handle consecutive garbage patterns', () => {
    const input = 'B^^^B a!!!a <:garbage> ^^^more B^^^B'
    const result = preCleanOcrText(input)
    expect(result.text).not.toContain('B^^^B')
    expect(result.text).not.toContain('a!!!')
    expect(result.text).not.toContain('<:garbage>')
  })
})

// ============================================================================
// REAL-WORLD SAMPLES
// ============================================================================

describe('real-world samples', () => {
  it('should clean the user provided sample excerpt', () => {
    // This is from the actual user sample that showed remaining artifacts
    const input = `B İ RLE Şİ K KASKO S İ GORTA POL İÇ ES İ
B^^^B a!!!a garbage data
S Ö ZLE Ş ME TARAFLARI
S İ GORTA Şİ RKET İ
T Ü RK PREMER S İ GORTA A.Ş.`

    const result = preCleanOcrText(input)

    // Must not contain barcode artifacts
    expect(result.text).not.toContain('B^^^B')
    expect(result.text).not.toContain('a!!!')

    // Must have proper Turkish words
    expect(result.text).toContain('BİRLEŞİK')
    expect(result.text).toContain('KASKO')
    expect(result.text).toContain('SİGORTA')
    expect(result.text).toContain('SÖZLEŞME')
    expect(result.text).toContain('TÜRK')

    // Quality check should pass
    const qualityResult = checkPreCleanQuality(result.text)
    expect(qualityResult.passed).toBe(true)
  })

  it('should handle extended garbage line', () => {
    const input = `Normal text
a!!!!!a!AAAaA!AA!!!aaAA!aAaAA!!
More normal text`

    const result = preCleanOcrText(input)
    expect(result.text).not.toContain('a!!!!!')
    expect(result.text).not.toContain('AAAaA')
    expect(result.text).toContain('Normal text')
    expect(result.text).toContain('More normal text')
  })
})

// ============================================================================
// despaceLeadingSplits coverage (via iterativeDespace)
// ============================================================================

describe('iterativeDespace - leading split patterns', () => {
  it('should join uppercase letter + lowercase continuation ("M üşteri" → "Müşteri")', () => {
    // despaceLeadingSplits pattern: single UPPERCASE letter + space + 2+ lowercase
    const result = iterativeDespace('M üşteri bilgisi', 3)
    expect(result.text).toContain('Müşteri')
    expect(result.totalCount).toBeGreaterThan(0)
  })

  it('should join "D üzenleme" → "Düzenleme"', () => {
    const result = iterativeDespace('D üzenleme tarihi', 3)
    expect(result.text).toContain('Düzenleme')
  })

  it('should join "Ş asi" into single word', () => {
    const result = iterativeDespace('Ş asi numarası', 3)
    // Other passes may lowercase the Ş; just verify the space is removed
    expect(result.text.toLowerCase()).toContain('şasi')
  })
})
