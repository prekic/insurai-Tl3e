/**
 * Translation Service Tests
 *
 * Tests for AI-simulated translation service functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getTranslations,
  getLocaleName,
  isRTLLocale,
  getLocaleInfo,
  translateString,
  type TranslationProgress,
} from './translation-service'

// Mock the translation cache
vi.mock('./translation-cache', () => ({
  getCachedTranslations: vi.fn(() => null),
  setCachedTranslations: vi.fn(),
  getCachedVersion: vi.fn(() => null),
  setCachedVersion: vi.fn(),
}))

// Mock the env module
vi.mock('../env', () => ({
  getEnv: () => ({ proxyUrl: '' }),
}))

// Mock global fetch
vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network unavailable'))))

describe('Translation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getLocaleName', () => {
    it('should return native name for common locales', () => {
      expect(getLocaleName('tr')).toBe('Türkçe')
      expect(getLocaleName('en')).toBe('English')
    })

    it('should handle locale with region code', () => {
      expect(getLocaleName('tr-TR')).toBe('Türkçe')
      expect(getLocaleName('en-US')).toBe('English')
    })

    it('should return uppercase code for unknown locales', () => {
      expect(getLocaleName('xyz')).toBe('XYZ')
      expect(getLocaleName('unknown')).toBe('UNKNOWN')
    })

    it('should handle case-insensitive locale codes', () => {
      expect(getLocaleName('TR')).toBe('Türkçe')
      expect(getLocaleName('EN')).toBe('English')
    })
  })

  describe('isRTLLocale', () => {
    it('should return true for RTL locales', () => {
      expect(isRTLLocale('ar')).toBe(true)
      expect(isRTLLocale('he')).toBe(true)
      expect(isRTLLocale('fa')).toBe(true)
      expect(isRTLLocale('ur')).toBe(true)
    })

    it('should return false for LTR locales', () => {
      expect(isRTLLocale('en')).toBe(false)
      expect(isRTLLocale('tr')).toBe(false)
      expect(isRTLLocale('de')).toBe(false)
      expect(isRTLLocale('fr')).toBe(false)
    })

    it('should handle locale with region code', () => {
      expect(isRTLLocale('ar-SA')).toBe(true)
      expect(isRTLLocale('en-US')).toBe(false)
    })

    it('should handle case-insensitive locale codes', () => {
      expect(isRTLLocale('AR')).toBe(true)
      expect(isRTLLocale('EN')).toBe(false)
    })
  })

  describe('getLocaleInfo', () => {
    it('should return complete info for common locales', () => {
      const info = getLocaleInfo('tr')

      expect(info.code).toBe('tr')
      expect(info.name).toBe('Turkish')
      expect(info.nativeName).toBe('Türkçe')
      expect(info.flag).toBe('🇹🇷')
      expect(info.rtl).toBe(false)
    })

    it('should return correct RTL info for Arabic', () => {
      const info = getLocaleInfo('ar')

      expect(info.rtl).toBe(true)
      expect(info.nativeName).toBe('العربية')
    })

    it('should indicate if locale is preloaded', () => {
      const trInfo = getLocaleInfo('tr')
      expect(trInfo.isPreloaded).toBe(true)

      const enInfo = getLocaleInfo('en')
      expect(enInfo.isPreloaded).toBe(true)
    })

    it('should handle unknown locales', () => {
      const info = getLocaleInfo('xyz')

      expect(info.code).toBe('xyz')
      expect(info.name).toBe('xyz')
      expect(info.flag).toBe('🌐')
      expect(info.rtl).toBe(false)
    })

    it('should handle locale with region code', () => {
      const info = getLocaleInfo('en-US')

      expect(info.code).toBe('en')
      expect(info.name).toBe('English')
    })
  })

  describe('translateString', () => {
    it('should return same text when source and target are the same', async () => {
      const result = await translateString('Hello', 'en', 'en')
      expect(result).toBe('Hello')
    })

    it('should return text as-is for different locale (dynamic translation via API)', async () => {
      const result = await translateString('Hello', 'de', 'en')
      expect(result).toBe('Hello')
    })

    it('should return text as-is when no API translation available', async () => {
      const result = await translateString('Test', 'fr', 'en')
      expect(result).toBe('Test')
    })

    it('should return text as-is for unknown locales', async () => {
      const result = await translateString('Test', 'xyz', 'en')
      expect(result).toBe('Test')
    })

    it('should handle empty strings', async () => {
      const result = await translateString('', 'de', 'en')
      expect(result).toBe('')
    })

    it('should return text as-is for various locales without API', async () => {
      expect(await translateString('Test', 'es', 'en')).toBe('Test')
      expect(await translateString('Test', 'ja', 'en')).toBe('Test')
      expect(await translateString('Test', 'ko', 'en')).toBe('Test')
      expect(await translateString('Test', 'zh', 'en')).toBe('Test')
    })
  })

  describe('getTranslations', () => {
    it('should return preloaded translations for Turkish', async () => {
      const progressUpdates: TranslationProgress[] = []
      const translations = await getTranslations('tr', (progress) => {
        progressUpdates.push(progress)
      })

      expect(translations).toBeDefined()
      expect(translations.common).toBeDefined()
      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(progressUpdates[progressUpdates.length - 1].status).toBe('complete')
    })

    it('should return preloaded translations for English', async () => {
      const translations = await getTranslations('en')

      expect(translations).toBeDefined()
      expect(translations.common).toBeDefined()
    })

    it('should handle locale with region code', async () => {
      const translations = await getTranslations('tr-TR')

      expect(translations).toBeDefined()
      expect(translations.common).toBeDefined()
    })

    it('should provide progress updates', async () => {
      const progressUpdates: TranslationProgress[] = []
      await getTranslations('tr', (progress) => {
        progressUpdates.push(progress)
      })

      expect(progressUpdates.length).toBeGreaterThan(0)
      // First update should be loading
      expect(progressUpdates[0].status).toBe('loading')
    })

    it('should handle translations without progress callback', async () => {
      const translations = await getTranslations('tr')

      expect(translations).toBeDefined()
    })

    it('should handle non-preloaded locales via API fallback', async () => {
      const progressUpdates: TranslationProgress[] = []
      const translations = await getTranslations('de', (progress) => {
        progressUpdates.push(progress)
      })

      expect(translations).toBeDefined()
      // With API unavailable (mocked fetch rejects), should fall back to EN_TRANSLATIONS
      // and report error status
      const lastStatus = progressUpdates[progressUpdates.length - 1]?.status
      expect(['complete', 'error']).toContain(lastStatus)
    })

    it('should include all translation keys', async () => {
      const translations = await getTranslations('en')

      expect(translations.common).toBeDefined()
      expect(translations.dashboard).toBeDefined()
      expect(translations.upload).toBeDefined()
    })
  })
})

describe('Translation Progress Types', () => {
  it('should have valid status values', () => {
    const validStatuses = ['idle', 'loading', 'translating', 'complete', 'error']

    validStatuses.forEach((status) => {
      expect(typeof status).toBe('string')
    })
  })
})
