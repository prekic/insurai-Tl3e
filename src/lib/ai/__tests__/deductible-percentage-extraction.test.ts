/**
 * B2 — Deductible Percentage Extraction Regression Tests
 *
 * Validates the regex-based percentage extraction logic used by
 * classifyExclusions() in policy-extractor.ts. Since classifyExclusions
 * is module-private, we test the regex patterns directly and validate
 * end-to-end behavior through the public convertToAnalyzedPolicy path
 * where feasible.
 *
 * The regex patterns under test:
 *   /(\d{1,3})\s*%/   — matches "35%" or "35 %"
 *   /%\s*(\d{1,3})/   — matches "%35" or "% 35"
 *
 * The logic: extract percentage, ignore 0 and >100, keep the max found.
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// REGEX PATTERNS (identical to classifyExclusions internals)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a percentage value from an exclusion text, mirroring the
 * logic inside classifyExclusions() in policy-extractor.ts.
 * Returns 0 if no valid percentage found.
 */
function extractDeductiblePercent(text: string): number {
  const pctMatch = text.match(/(\d{1,3})\s*%/) || text.match(/%\s*(\d{1,3})/)
  if (pctMatch) {
    const pct = parseInt(pctMatch[1], 10)
    if (pct > 0 && pct <= 100) {
      return pct
    }
  }
  return 0
}

/**
 * Classifies an array of exclusion texts into true exclusions vs
 * conditional deductibles, mirroring the conditional patterns in
 * classifyExclusions(). Returns the max deductible percent found.
 */
function classifyAndExtractMaxPercent(exclusions: string[]): number {
  const conditionalPatterns = [
    /muafiyet/i,
    /tenzil/i,
    /%\s*\d+/i,
    /\d+\s*%/i,
    /anlaşmalı olmayan.*servis/i,
    /anlaşmasız.*servis/i,
    /onarım.*muafiyet/i,
    /pert.*muafiyet/i,
    /pert.*tenzil/i,
    // Sprint 1 PR-S1.2 — kept in sync with production policy-converter.ts
    /rent[\s-]*a[\s-]*car|taksi|dolmu[şs]|kurye|kargo|kiral[ıi]k\s*ara[çc]|ikame\s*ara[çc]|kullan[ıi]m\s*[şs]ekli|ticari\s*kullan[ıi]m/i,
  ]

  let maxDeductiblePercent = 0

  for (const text of exclusions) {
    const isConditional = conditionalPatterns.some((p) => p.test(text))
    if (isConditional) {
      const pct = extractDeductiblePercent(text)
      if (pct > maxDeductiblePercent) {
        maxDeductiblePercent = pct
      }
    }
  }

  return maxDeductiblePercent
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('B2 — Deductible Percentage Extraction', () => {
  describe('extractDeductiblePercent — single text patterns', () => {
    it('extracts 35 from "35% tenzili muafiyet"', () => {
      expect(extractDeductiblePercent('35% tenzili muafiyet')).toBe(35)
    })

    it('extracts 50 from "%50 muafiyet uygulanır"', () => {
      expect(extractDeductiblePercent('%50 muafiyet uygulanır')).toBe(50)
    })

    it('extracts 10 from "10 % onarım muafiyeti"', () => {
      expect(extractDeductiblePercent('10 % onarım muafiyeti')).toBe(10)
    })

    it('extracts 100 from "% 100 muafiyet" (edge: max valid)', () => {
      expect(extractDeductiblePercent('% 100 muafiyet')).toBe(100)
    })

    it('returns 0 for percentage of 0 ("0% muafiyet")', () => {
      expect(extractDeductiblePercent('0% muafiyet')).toBe(0)
    })

    it('returns 0 for percentage > 100 ("150% tenzil")', () => {
      expect(extractDeductiblePercent('150% tenzil')).toBe(0)
    })

    it('returns 0 for text without any percentage', () => {
      expect(extractDeductiblePercent('Deprem hasarı hariçtir')).toBe(0)
    })

    it('returns 0 for empty string', () => {
      expect(extractDeductiblePercent('')).toBe(0)
    })

    it('extracts first percentage when multiple present ("20% ve 30% muafiyet")', () => {
      // regex matches left-to-right; first match = 20
      expect(extractDeductiblePercent('20% ve 30% muafiyet')).toBe(20)
    })

    it('handles Turkish percentage with no space ("%25muafiyet")', () => {
      expect(extractDeductiblePercent('%25muafiyet')).toBe(25)
    })
  })

  describe('classifyAndExtractMaxPercent — multi-exclusion max tracking', () => {
    it('returns max percent across multiple conditional deductible texts', () => {
      const exclusions = [
        'Deprem hasarı hariçtir', // true exclusion, no percent
        '20% tenzili muafiyet uygulanır', // conditional, 20%
        '35% pert muafiyeti', // conditional, 35%
        'Savaş ve terör hariçtir', // true exclusion
      ]
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(35)
    })

    it('returns 0 when no exclusion is a conditional deductible', () => {
      const exclusions = [
        'Deprem hasarı hariçtir',
        'Savaş ve terör hariçtir',
        'Grev ve lokavt hariçtir',
      ]
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(0)
    })

    it('returns 0 for empty exclusions array', () => {
      expect(classifyAndExtractMaxPercent([])).toBe(0)
    })

    it('ignores 0% in conditional text ("0% muafiyet")', () => {
      const exclusions = ['0% muafiyet uygulanır']
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(0)
    })

    it('ignores >100% in conditional text ("200% tenzil")', () => {
      const exclusions = ['200% tenzil muafiyeti']
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(0)
    })

    it('classifies "anlaşmalı olmayan servis" as conditional even without percent', () => {
      const exclusions = ['Anlaşmalı olmayan serviste onarım muafiyeti']
      // Matches the conditional pattern but no percentage → max stays 0
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(0)
    })

    it('handles Turkish percentage format "%50" correctly', () => {
      const exclusions = ['%50 muafiyet uygulanır']
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(50)
    })
  })

  // Sprint 1 PR-S1.2 — Round-4 reviewer's Anadolu Kullanım Şekli regression
  describe('B2.S1.2 — Anadolu Kullanım Şekli Klozu (%80 commercial-use)', () => {
    it('extracts 80 from Turkish "%80\'i" suffix format (apostrophe + i)', () => {
      // Verbatim from Anadolu Birleşik Kasko page 12-13
      const text =
        "her hasarın %80'i, sigortalının kendisi tarafından karşılanmak üzere tazminat bedelinden indirilir"
      expect(extractDeductiblePercent(text)).toBe(80)
    })

    it('classifies "Kullanım Şekli Klozu" heading as conditional deductible', () => {
      const exclusions = ['Kullanım Şekli Klozu — her hasarın %80\'i sigortalı tarafından ödenir']
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(80)
    })

    it('classifies "kiralık araç" use-case as conditional', () => {
      const exclusions = [
        'Aracın kiralık araç olarak kullanılması durumunda her hasarın %80\'i muafiyet uygulanır',
      ]
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(80)
    })

    it('classifies "ikame araç" / "test sürüşü" use-case as conditional', () => {
      const exclusions = [
        'Aracın ikame araç ya da test sürüşü aracı olarak kullanımı %80 muafiyet',
      ]
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(80)
    })

    it('classifies "kargo / kurye" courier use as conditional', () => {
      const exclusions = ['Kargo veya kurye taşımacılığı için kullanımda %80 tenzili muafiyet']
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(80)
    })

    it('keeps the higher percentage when both 35% and 80% scenarios are present', () => {
      const exclusions = [
        'Anlaşmalı olmayan serviste onarımda %35 muafiyet',
        'Kullanım Şekli Klozu — kiralık araç olarak kullanımda her hasarın %80\'i muafiyet',
      ]
      expect(classifyAndExtractMaxPercent(exclusions)).toBe(80)
    })
  })
})
