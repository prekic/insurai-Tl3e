import { describe, it, expect } from 'vitest'
import {
  applyComprehensivePreprocessing,
  applyBasicOCRCorrections,
  textNeedsProcessing,
  estimateTextQuality,
} from './text-processor'

describe('Text Processor', () => {
  describe('applyComprehensivePreprocessing', () => {
    describe('Turkish character spacing fixes', () => {
      it('should fix spaced Turkish words like "B İ RLE Şİ K"', () => {
        const input = 'B İ RLE Şİ K SİGORTA A.Ş.'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('BİRLEŞİK')
      })

      it('should fix spaced "S İ G O R T A" to "SİGORTA"', () => {
        const input = 'S İ G O R T A POLİÇESİ'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('SİGORTA')
      })

      it('should fix spaced "A N A D O L U" to "ANADOLU"', () => {
        const input = 'A N A D O L U SİGORTA'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('ANADOLU')
      })

      it('should fix spaced "T Ü R K İ Y E" to "TÜRKİYE"', () => {
        const input = 'T Ü R K İ Y E CUMHURİYETİ'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('TÜRKİYE')
      })

      it('should fix spaced "İ S T A N B U L" to "İSTANBUL"', () => {
        const input = 'İ S T A N B U L ŞEHRİ'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('İSTANBUL')
      })

      it('should fix spaced "K A S K O" to "KASKO"', () => {
        const input = 'K A S K O POLİÇESİ'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('KASKO')
      })

      it('should track spaced character fix count', () => {
        const input = 'B İ RLE Şİ K S İ G O R T A'
        const result = applyComprehensivePreprocessing(input)
        expect(result.stats.spacedCharsFixed).toBeGreaterThan(0)
      })
    })

    describe('URL and email cleanup', () => {
      it('should fix spaced URLs like "www. anadolusigorta. com. tr"', () => {
        const input = 'Web: www. anadolusigorta. com. tr'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('www.anadolusigorta.com.tr')
      })

      it('should fix spaced email addresses', () => {
        const input = 'Email: info @ example . com'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('info@example.com')
      })

      it('should fix http:// with spaces', () => {
        const input = 'URL: http : / / example . com'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('http://')
      })

      it('should track URL cleanup count', () => {
        const input = 'www. example. com. tr'
        const result = applyComprehensivePreprocessing(input)
        expect(result.stats.urlsCleaned).toBeGreaterThan(0)
      })
    })

    describe('number and punctuation spacing', () => {
      it('should fix "25 /1A" to "25/1A"', () => {
        const input = 'Poliçe NO: 25 /1A'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('25/1A')
      })

      it('should fix Turkish number format "1. 000. 000" to "1.000.000"', () => {
        const input = 'Tutar: 1. 000. 000 TL'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('1.000.000')
      })

      it('should fix "100 %" to "100%"', () => {
        const input = 'Oran: 100 %'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('100%')
      })

      it('should normalize multiple spaces to single', () => {
        const input = 'Too    many   spaces'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).not.toContain('  ')
      })

      it('should normalize multiple newlines', () => {
        const input = 'Line 1\n\n\n\n\nLine 2'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).not.toMatch(/\n{3,}/)
      })
    })

    describe('garbage data removal', () => {
      it('should remove lines with excessive special characters', () => {
        const input = 'Normal text\nB^^^Bj54<O[...\nMore normal text'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).not.toContain('^^^')
        expect(result.stats.garbageBlocksRemoved).toBeGreaterThan(0)
      })

      it('should remove control characters', () => {
        const input = 'Text with\x00\x01\x02control chars'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).not.toMatch(/[\x00-\x1F]/)
      })

      it('should track lines removed', () => {
        const input = 'Normal\n<<<<<garbage>>>>>\nNormal again'
        const result = applyComprehensivePreprocessing(input)
        expect(result.stats.linesRemoved).toBeGreaterThan(0)
      })

      it('should track characters removed', () => {
        const input = 'Normal\n<<<<<garbage>>>>>\nNormal again'
        const result = applyComprehensivePreprocessing(input)
        expect(result.stats.totalCharactersRemoved).toBeGreaterThan(0)
      })
    })

    describe('OCR corrections', () => {
      it('should fix ISTANBUL to İSTANBUL', () => {
        const input = 'ISTANBUL MERKEZ'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('İSTANBUL')
      })

      it('should fix TURKIYE to TÜRKİYE', () => {
        const input = 'TURKIYE CUMHURİYETİ'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('TÜRKİYE')
      })

      it('should fix SIGORTA to SİGORTA', () => {
        const input = 'SIGORTA ŞİRKETİ'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('SİGORTA')
      })

      it('should fix TL formatting', () => {
        const input = '1000TL amount'
        const result = applyComprehensivePreprocessing(input)
        expect(result.text).toContain('1000 TL')
      })

      it('should track corrections', () => {
        const input = 'ISTANBUL SIGORTA'
        const result = applyComprehensivePreprocessing(input)
        expect(result.corrections.length).toBeGreaterThan(0)
      })
    })

    describe('comprehensive cleanup', () => {
      it('should handle real-world messy text', () => {
        const messyText = `B İ RLE Şİ K S İ G O R T A A.Ş.
www. anadolusigorta. com. tr
Poliçe No: 25 /1A
Tutar: 1. 000. 000 TL
<<<garbage>>>
Normal text continues`

        const result = applyComprehensivePreprocessing(messyText)

        expect(result.text).toContain('BİRLEŞİK')
        expect(result.text).toContain('SİGORTA')
        expect(result.text).toContain('www.anadolusigorta.com.tr')
        expect(result.text).toContain('25/1A')
        expect(result.text).toContain('1.000.000')
        expect(result.text).not.toContain('<<<garbage>>>')
      })
    })
  })

  describe('applyBasicOCRCorrections (legacy compatibility)', () => {
    it('should still work for backwards compatibility', () => {
      const input = 'ISTANBUL SIGORTA'
      const result = applyBasicOCRCorrections(input)
      expect(result.text).toContain('İSTANBUL')
      expect(result.corrections).toBeDefined()
    })
  })

  describe('textNeedsProcessing', () => {
    it('should return true for spaced Turkish characters', () => {
      expect(textNeedsProcessing('B İ RLE Şİ K')).toBe(true)
    })

    it('should return true for spaced URLs', () => {
      expect(textNeedsProcessing('www . example . com')).toBe(true)
    })

    it('should return true for garbage characters', () => {
      expect(textNeedsProcessing('Normal text <<<>>> garbage')).toBe(true)
    })

    it('should return true for missing Turkish characters', () => {
      expect(textNeedsProcessing('ISTANBUL TURKIYE')).toBe(true)
    })

    it('should return true for excessive spacing', () => {
      expect(textNeedsProcessing('Too     much     spacing')).toBe(true)
    })

    it('should return false for clean text', () => {
      // Clean text with no problematic patterns
      // Note: avoid text that starts with O, 0, 1, l, I followed by 3+ letters
      expect(textNeedsProcessing('Bu metin temiz ve düzgün.')).toBe(false)
    })

    it('should return false for properly formatted Turkish', () => {
      // Properly formatted Turkish text with no issues
      // Avoid patterns like "O" + letters, "I" + letters, etc.
      expect(textNeedsProcessing('Sigortalı adı: Mehmet')).toBe(false)
    })
  })

  describe('estimateTextQuality', () => {
    it('should return high score for clean text', () => {
      const score = estimateTextQuality('İSTANBUL TÜRKİYE SİGORTA perfectly clean text')
      expect(score).toBeGreaterThan(80)
    })

    it('should return lower score for text with ASCII Turkish', () => {
      const score = estimateTextQuality('ISTANBUL TURKIYE SIGORTA')
      expect(score).toBeLessThan(100)
    })

    it('should return lower score for spaced characters', () => {
      const score = estimateTextQuality('B İ RLE Şİ K S İ G O R T A A N A D O L U')
      expect(score).toBeLessThanOrEqual(80)
    })

    it('should return lower score for garbage characters', () => {
      const score = estimateTextQuality('Normal text <<<>>> <<>> <<<>>> garbage more garbage')
      expect(score).toBeLessThan(100)
    })

    it('should return score between 0 and 100', () => {
      const score = estimateTextQuality('Any text here')
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })
})
