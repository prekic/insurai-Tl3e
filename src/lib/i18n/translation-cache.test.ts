/**
 * Translation Cache Tests
 *
 * Tests for translation caching and locale detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCachedTranslations,
  setCachedTranslations,
  clearCachedTranslations,
  clearAllCachedTranslations,
  getCachedLocales,
  getStoredLocale,
  setStoredLocale,
  detectBrowserLocale,
  getBestLocale,
} from './translation-cache'
import type { TranslationDictionary } from './translations'

// Mock localStorage using a Proxy to support Object.keys
const localStorageData: Record<string, string> = {}

const mockLocalStorage = new Proxy(localStorageData, {
  get(target, prop: string) {
    if (prop === 'getItem') {
      return vi.fn((key: string) => target[key] ?? null)
    }
    if (prop === 'setItem') {
      return vi.fn((key: string, value: string) => {
        target[key] = value
      })
    }
    if (prop === 'removeItem') {
      return vi.fn((key: string) => {
        delete target[key]
      })
    }
    if (prop === 'clear') {
      return vi.fn(() => {
        Object.keys(target).forEach(key => delete target[key])
      })
    }
    if (prop === 'key') {
      return vi.fn((index: number) => Object.keys(target)[index] ?? null)
    }
    if (prop === 'length') {
      return Object.keys(target).length
    }
    return target[prop]
  },
  ownKeys(target) {
    return Reflect.ownKeys(target)
  },
  getOwnPropertyDescriptor(target, prop) {
    return {
      enumerable: true,
      configurable: true,
      value: target[prop as string],
    }
  },
}) as unknown as Storage

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
})

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    languages: ['en-US', 'tr-TR'],
    language: 'en-US',
  },
  writable: true,
  configurable: true,
})

describe('Translation Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear localStorage data
    Object.keys(localStorageData).forEach(key => delete localStorageData[key])
    // Reset navigator
    Object.defineProperty(global, 'navigator', {
      value: {
        languages: ['en-US', 'tr-TR'],
        language: 'en-US',
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getCachedTranslations', () => {
    it('should return null if no cached translations', () => {
      const result = getCachedTranslations('en')

      expect(result).toBeNull()
    })

    it('should return cached translations if available', () => {
      const translations: TranslationDictionary = {
        common: { loading: 'Loading...' },
      } as TranslationDictionary

      localStorageData['insurai_i18n_en'] = JSON.stringify({
        version: 1,
        timestamp: Date.now(),
        translations,
      })

      const result = getCachedTranslations('en')

      expect(result).toEqual(translations)
    })

    it('should return null if cache version mismatch', () => {
      localStorageData['insurai_i18n_en'] = JSON.stringify({
        version: 999, // Wrong version
        timestamp: Date.now(),
        translations: { common: {} },
      })

      const result = getCachedTranslations('en')

      expect(result).toBeNull()
      // The key should be removed from localStorage
      expect(localStorageData['insurai_i18n_en']).toBeUndefined()
    })

    it('should return null on parse error', () => {
      localStorageData['insurai_i18n_en'] = 'invalid json'

      const result = getCachedTranslations('en')

      expect(result).toBeNull()
    })
  })

  describe('setCachedTranslations', () => {
    it('should store translations in localStorage', () => {
      const translations: TranslationDictionary = {
        common: { loading: 'Yükleniyor...' },
      } as TranslationDictionary

      setCachedTranslations('tr', translations)

      const stored = JSON.parse(localStorageData['insurai_i18n_tr'])
      expect(stored.translations).toEqual(translations)
      expect(stored.version).toBe(1)
      expect(stored.timestamp).toBeDefined()
    })
  })

  describe('clearCachedTranslations', () => {
    it('should remove cached translations for a locale', () => {
      localStorageData['insurai_i18n_en'] = 'cached'

      clearCachedTranslations('en')

      expect(localStorageData['insurai_i18n_en']).toBeUndefined()
    })
  })

  describe('clearAllCachedTranslations', () => {
    it('should remove all translation caches', () => {
      localStorageData['insurai_i18n_en'] = 'cached'
      localStorageData['insurai_i18n_tr'] = 'cached'
      localStorageData['other_key'] = 'keep'

      clearAllCachedTranslations()

      expect(localStorageData['insurai_i18n_en']).toBeUndefined()
      expect(localStorageData['insurai_i18n_tr']).toBeUndefined()
      // Should not remove other keys
      expect(localStorageData['other_key']).toBe('keep')
    })
  })

  describe('getCachedLocales', () => {
    it('should return list of cached locale codes', () => {
      localStorageData['insurai_i18n_en'] = 'cached'
      localStorageData['insurai_i18n_tr'] = 'cached'
      localStorageData['insurai_i18n_de'] = 'cached'

      const result = getCachedLocales()

      expect(result).toContain('en')
      expect(result).toContain('tr')
      expect(result).toContain('de')
    })

    it('should return empty array if no caches', () => {
      const result = getCachedLocales()

      expect(result).toEqual([])
    })
  })

  describe('getStoredLocale', () => {
    it('should return stored locale preference', () => {
      localStorageData['insurai_locale'] = 'tr'

      const result = getStoredLocale()

      expect(result).toBe('tr')
    })

    it('should return null if no stored locale', () => {
      const result = getStoredLocale()

      expect(result).toBeNull()
    })
  })

  describe('setStoredLocale', () => {
    it('should store locale preference', () => {
      setStoredLocale('de')

      expect(localStorageData['insurai_locale']).toBe('de')
    })
  })

  describe('detectBrowserLocale', () => {
    it('should return primary language from navigator.languages', () => {
      Object.defineProperty(navigator, 'languages', {
        value: ['tr-TR', 'en-US'],
        configurable: true,
      })

      const result = detectBrowserLocale()

      expect(result).toBe('tr')
    })

    it('should fall back to navigator.language', () => {
      Object.defineProperty(navigator, 'languages', {
        value: [],
        configurable: true,
      })
      Object.defineProperty(navigator, 'language', {
        value: 'de-DE',
        configurable: true,
      })

      const result = detectBrowserLocale()

      expect(result).toBe('de')
    })

    it('should default to en if no language detected', () => {
      Object.defineProperty(navigator, 'languages', {
        value: [],
        configurable: true,
      })
      Object.defineProperty(navigator, 'language', {
        value: '',
        configurable: true,
      })

      const result = detectBrowserLocale()

      expect(result).toBe('en')
    })
  })

  describe('getBestLocale', () => {
    it('should return stored locale if available', () => {
      localStorageData['insurai_locale'] = 'fr'

      const result = getBestLocale()

      expect(result).toBe('fr')
    })

    it('should return browser locale if no stored preference', () => {
      Object.defineProperty(navigator, 'languages', {
        value: ['de-DE'],
        configurable: true,
      })

      const result = getBestLocale()

      expect(result).toBe('de')
    })

    it('should return default locale as fallback when browser returns en', () => {
      // When browser locale detection returns 'en' (default), it's still used
      Object.defineProperty(navigator, 'languages', {
        value: [],
        configurable: true,
      })
      Object.defineProperty(navigator, 'language', {
        value: '',
        configurable: true,
      })

      // detectBrowserLocale returns 'en' as fallback, so getBestLocale returns 'en'
      const result = getBestLocale('tr')

      expect(result).toBe('en')
    })
  })
})
