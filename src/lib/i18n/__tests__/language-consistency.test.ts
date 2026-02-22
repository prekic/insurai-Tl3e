/**
 * i18n Language Consistency Tests
 *
 * Ensures all translation keys exist in both EN and TR translations,
 * that TR translations are actual Turkish text (not English copies),
 * and that the translation dictionary structure is complete.
 */

import { describe, it, expect } from 'vitest'
import { type TranslationDictionary } from '../translations'
import { EN_TRANSLATIONS } from '../translations-en'
import { TR_TRANSLATIONS } from '../translations-tr'

/**
 * Recursively collect all leaf keys from a translation object.
 * Returns paths like 'nav.home', 'landing.heroTitle', etc.
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

/**
 * Get the value at a dot-separated path from an object.
 */
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

describe('i18n Language Consistency', () => {
  const enKeys = collectKeys(EN_TRANSLATIONS as unknown as Record<string, unknown>)
  const trKeys = collectKeys(TR_TRANSLATIONS as unknown as Record<string, unknown>)

  describe('Translation key parity', () => {
    it('should have the same number of keys in EN and TR', () => {
      expect(enKeys.length).toBe(trKeys.length)
    })

    it('should have all EN keys present in TR', () => {
      const missingInTR = enKeys.filter(key => !trKeys.includes(key))
      expect(missingInTR).toEqual([])
    })

    it('should have all TR keys present in EN', () => {
      const missingInEN = trKeys.filter(key => !enKeys.includes(key))
      expect(missingInEN).toEqual([])
    })
  })

  describe('Translation values are non-empty', () => {
    it('should have no empty EN values', () => {
      const emptyKeys = enKeys.filter(key => {
        const value = getValueAtPath(EN_TRANSLATIONS as unknown as Record<string, unknown>, key)
        return typeof value === 'string' && value.trim() === ''
      })
      expect(emptyKeys).toEqual([])
    })

    it('should have no empty TR values', () => {
      const emptyKeys = trKeys.filter(key => {
        const value = getValueAtPath(TR_TRANSLATIONS as unknown as Record<string, unknown>, key)
        return typeof value === 'string' && value.trim() === ''
      })
      expect(emptyKeys).toEqual([])
    })
  })

  describe('TR translations are actual Turkish (not English copies)', () => {
    // These are key landing page strings that MUST be different between EN and TR
    const criticalKeys = [
      // CTA section (from screenshot bug)
      'landing.ctaTitle',
      'landing.ctaDescription',
      'landing.analyzeCtaButton',
      'landing.freeNoSignup',
      'landing.freeInstantAnalysis',

      // Hero section
      'landing.heroTitle',
      'landing.heroSubtitle',

      // Navigation
      'nav.dashboard',
      'nav.upload',
      'nav.settings',

      // Policy terms
      'policy.coverage',
      'policy.premium',
      'policy.deductible',

      // WhoItsFor
      'landing.whoTitle',
      'landing.whoBrokersTitle',
      'landing.whoRiskTitle',
      'landing.whoPolicyholdersTitle',

      // PolicyComparisonSection
      'landing.compareSideBySide',
      'landing.compareCoverageLimit',
      'landing.compareIncluded',
      'landing.compareExcluded',

      // Common UI
      'common.loading',
      'common.error',
      'common.save',
      'common.cancel',
    ]

    it.each(criticalKeys)('TR translation for "%s" should differ from EN', (key) => {
      const enValue = getValueAtPath(EN_TRANSLATIONS as unknown as Record<string, unknown>, key) as string
      const trValue = getValueAtPath(TR_TRANSLATIONS as unknown as Record<string, unknown>, key) as string

      expect(enValue).toBeDefined()
      expect(trValue).toBeDefined()
      expect(trValue).not.toBe(enValue)
    })
  })

  describe('Landing page CTA translations (screenshot regression)', () => {
    it('should have Turkish CTA title', () => {
      expect(TR_TRANSLATIONS.landing.ctaTitle).toBe('Poliçelerinizi anlamaya hazır mısınız?')
    })

    it('should have Turkish CTA description', () => {
      expect(TR_TRANSLATIONS.landing.ctaDescription).toContain('poliçenizi yükleyin')
    })

    it('should have Turkish analyze button text', () => {
      expect(TR_TRANSLATIONS.landing.analyzeCtaButton).toBe('Poliçenizi Ücretsiz Analiz Edin')
    })

    it('should have Turkish free no signup text', () => {
      expect(TR_TRANSLATIONS.landing.freeNoSignup).toBe('Ücretsiz, kayıt gerekmez')
    })

    it('should have Turkish free instant analysis text', () => {
      expect(TR_TRANSLATIONS.landing.freeInstantAnalysis).toBe('Ücretsiz anlık analiz')
    })
  })

  describe('All top-level sections exist', () => {
    const expectedSections: (keyof TranslationDictionary)[] = [
      'nav', 'common', 'landing', 'policy', 'upload', 'chat',
      'insights', 'evaluation', 'comparison', 'insurance', 'coverageCategories',
      'tryAnalysis', 'preferences',
    ]

    it.each(expectedSections)('should have "%s" section in EN', (section) => {
      expect(EN_TRANSLATIONS).toHaveProperty(section)
    })

    it.each(expectedSections)('should have "%s" section in TR', (section) => {
      expect(TR_TRANSLATIONS).toHaveProperty(section)
    })
  })

  describe('No hardcoded English in critical TR landing strings', () => {
    const englishIndicators = ['free', 'upload', 'policy', 'analyze', 'coverage', 'ready', 'your']

    it('TR landing.ctaTitle should not contain common English words', () => {
      const value = TR_TRANSLATIONS.landing.ctaTitle.toLowerCase()
      for (const word of englishIndicators) {
        expect(value).not.toContain(word)
      }
    })

    it('TR landing.ctaDescription should not contain common English words', () => {
      const value = TR_TRANSLATIONS.landing.ctaDescription.toLowerCase()
      for (const word of englishIndicators) {
        expect(value).not.toContain(word)
      }
    })

    it('TR landing.analyzeCtaButton should not contain common English words', () => {
      const value = TR_TRANSLATIONS.landing.analyzeCtaButton.toLowerCase()
      for (const word of englishIndicators) {
        expect(value).not.toContain(word)
      }
    })
  })
})
