import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// MOCKS
// ============================================================================

// Mock env module (default export with proxyUrl)
vi.mock('../env', () => ({
  default: {
    proxyUrl: 'http://localhost:4001',
    hasProxy: true,
    isDev: true,
    isProd: false,
  },
}))

// Mock translation-cache module with accessible references
const mockGetCachedTranslations = vi.fn()
const mockSetCachedTranslations = vi.fn()
const mockGetCachedVersion = vi.fn()
const mockSetCachedVersion = vi.fn()

vi.mock('./translation-cache', () => ({
  getCachedTranslations: (...args: unknown[]) => mockGetCachedTranslations(...args),
  setCachedTranslations: (...args: unknown[]) => mockSetCachedTranslations(...args),
  getCachedVersion: (...args: unknown[]) => mockGetCachedVersion(...args),
  setCachedVersion: (...args: unknown[]) => mockSetCachedVersion(...args),
}))

// Mock translations module with minimal TranslationDictionary stubs
const _MOCK_EN_TRANSLATIONS = {
  nav: { home: 'Home', dashboard: 'Dashboard' },
  common: { save: 'Save', cancel: 'Cancel' },
} as unknown as import('./translations').TranslationDictionary

const MOCK_TR_TRANSLATIONS = {
  nav: { home: 'Ana Sayfa', dashboard: 'Panel' },
  common: { save: 'Kaydet', cancel: 'İptal' },
} as unknown as import('./translations').TranslationDictionary

vi.mock('./translations', () => ({
  EN_TRANSLATIONS: {
    nav: { home: 'Home', dashboard: 'Dashboard' },
    common: { save: 'Save', cancel: 'Cancel' },
  },
  TR_TRANSLATIONS: {
    nav: { home: 'Ana Sayfa', dashboard: 'Panel' },
    common: { save: 'Kaydet', cancel: 'İptal' },
  },
  PRELOADED_TRANSLATIONS: {
    en: {
      nav: { home: 'Home', dashboard: 'Dashboard' },
      common: { save: 'Save', cancel: 'Cancel' },
    },
    tr: {
      nav: { home: 'Ana Sayfa', dashboard: 'Panel' },
      common: { save: 'Kaydet', cancel: 'İptal' },
    },
  },
  COMMON_LOCALES: {
    en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
    tr: { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    fr: { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    es: { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    ar: { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
    ja: { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    zh: { name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    ko: { name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    pt: { name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
    it: { name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
    ru: { name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    nl: { name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
    pl: { name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
    hi: { name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ============================================================================
// IMPORTS (after mocks are defined)
// ============================================================================

import {
  getTranslations,
  fetchAvailableLocales,
  getLocaleName,
  isRTLLocale,
  getLocaleInfo,
  translateString,
  invalidateLocalesCache,
  type TranslationProgress,
  type APILocale,
} from './translation-service'

// ============================================================================
// HELPERS
// ============================================================================

function createMockAPILocale(overrides: Partial<APILocale> = {}): APILocale {
  return {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    flag: '🇹🇷',
    isRtl: false,
    isActive: true,
    isDefault: false,
    displayOrder: 1,
    ...overrides,
  }
}

function createLocalesResponse(locales: APILocale[], version = '5') {
  return {
    ok: true,
    json: async () => ({
      success: true,
      locales,
      translationVersion: version,
    }),
  }
}

function createTranslationsResponse(
  translations: Record<string, unknown>,
  version = '5'
) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      translations,
      version,
    }),
  }
}

function createFailedResponse(status = 500) {
  return {
    ok: false,
    status,
    json: async () => ({ success: false }),
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('translation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCachedTranslations.mockReturnValue(null)
    mockGetCachedVersion.mockReturnValue(null)
    invalidateLocalesCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // fetchAvailableLocales
  // ==========================================================================

  describe('fetchAvailableLocales', () => {
    it('should fetch locales from the API and return them', async () => {
      const mockLocales = [
        createMockAPILocale({ code: 'tr' }),
        createMockAPILocale({ code: 'en', name: 'English', nativeName: 'English' }),
      ]
      mockFetch.mockResolvedValueOnce(createLocalesResponse(mockLocales, '7'))

      const result = await fetchAvailableLocales()

      expect(result.locales).toHaveLength(2)
      expect(result.locales[0].code).toBe('tr')
      expect(result.locales[1].code).toBe('en')
      expect(result.version).toBe('7')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/translations/locales'
      )
    })

    it('should use in-memory cache on second call within TTL', async () => {
      const mockLocales = [createMockAPILocale({ code: 'tr' })]
      mockFetch.mockResolvedValueOnce(createLocalesResponse(mockLocales, '3'))

      // First call: fetches from API
      const result1 = await fetchAvailableLocales()
      expect(result1.version).toBe('3')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call: should use cache, no additional fetch
      const result2 = await fetchAvailableLocales()
      expect(result2.version).toBe('3')
      expect(result2.locales).toHaveLength(1)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should refetch after invalidateLocalesCache() is called', async () => {
      const mockLocales = [createMockAPILocale({ code: 'tr' })]
      mockFetch.mockResolvedValueOnce(createLocalesResponse(mockLocales, '3'))

      await fetchAvailableLocales()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Invalidate the cache
      invalidateLocalesCache()

      // Should fetch again
      const updatedLocales = [
        createMockAPILocale({ code: 'tr' }),
        createMockAPILocale({ code: 'en', name: 'English', nativeName: 'English' }),
      ]
      mockFetch.mockResolvedValueOnce(createLocalesResponse(updatedLocales, '4'))

      const result2 = await fetchAvailableLocales()
      expect(result2.version).toBe('4')
      expect(result2.locales).toHaveLength(2)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should return empty locales and version 0 on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await fetchAvailableLocales()

      expect(result.locales).toEqual([])
      expect(result.version).toBe('0')
    })

    it('should return empty locales on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce(createFailedResponse(500))

      const result = await fetchAvailableLocales()

      expect(result.locales).toEqual([])
      expect(result.version).toBe('0')
    })

    it('should return empty locales when API returns success: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      })

      const result = await fetchAvailableLocales()

      expect(result.locales).toEqual([])
      expect(result.version).toBe('0')
    })

    it('should default translationVersion to "0" when field is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          locales: [createMockAPILocale()],
          // No translationVersion field
        }),
      })

      const result = await fetchAvailableLocales()

      expect(result.version).toBe('0')
      expect(result.locales).toHaveLength(1)
    })

    it('should handle json() throwing an error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })

      const result = await fetchAvailableLocales()

      expect(result.locales).toEqual([])
      expect(result.version).toBe('0')
    })
  })

  // ==========================================================================
  // invalidateLocalesCache
  // ==========================================================================

  describe('invalidateLocalesCache', () => {
    it('should force refetch on next call', async () => {
      // Populate cache
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([createMockAPILocale()], '5')
      )
      await fetchAvailableLocales()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Invalidate
      invalidateLocalesCache()

      // Next call should fetch again
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([createMockAPILocale()], '6')
      )
      const result = await fetchAvailableLocales()
      expect(result.version).toBe('6')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should be safe to call multiple times', () => {
      expect(() => {
        invalidateLocalesCache()
        invalidateLocalesCache()
        invalidateLocalesCache()
      }).not.toThrow()
    })
  })

  // ==========================================================================
  // getTranslations
  // ==========================================================================

  describe('getTranslations', () => {
    // -----------------------------------------------------------------------
    // Tier 1: localStorage cache with matching API version
    // -----------------------------------------------------------------------
    describe('Tier 1: cached translations with matching version', () => {
      it('should return cached translations when cached version matches API version', async () => {
        const cachedData = {
          nav: { home: 'Cached Home' },
          common: { save: 'Cached Save' },
        } as unknown as import('./translations').TranslationDictionary

        mockGetCachedTranslations.mockReturnValue(cachedData)
        mockGetCachedVersion.mockReturnValue('5')

        // API returns same version
        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )

        const result = await getTranslations('tr')

        expect(result).toEqual(cachedData)
        // Should only call locales endpoint (version check), not translations endpoint
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:4001/api/translations/locales'
        )
      })

      it('should invoke progress callbacks: loading -> complete for cache hit', async () => {
        mockGetCachedTranslations.mockReturnValue(MOCK_TR_TRANSLATIONS)
        mockGetCachedVersion.mockReturnValue('5')
        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )

        const progressUpdates: TranslationProgress[] = []
        const onProgress = (p: TranslationProgress) =>
          progressUpdates.push({ ...p })

        await getTranslations('tr', onProgress)

        expect(progressUpdates.length).toBeGreaterThanOrEqual(2)
        expect(progressUpdates[0]).toEqual({
          status: 'loading',
          progress: 0,
          message: 'Loading translations...',
        })
        expect(progressUpdates[progressUpdates.length - 1]).toEqual({
          status: 'complete',
          progress: 100,
          message: 'Translations loaded from cache',
        })
      })

      it('should not update localStorage cache when cache hit occurs', async () => {
        mockGetCachedTranslations.mockReturnValue(MOCK_TR_TRANSLATIONS)
        mockGetCachedVersion.mockReturnValue('5')
        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )

        await getTranslations('tr')

        expect(mockSetCachedTranslations).not.toHaveBeenCalled()
        expect(mockSetCachedVersion).not.toHaveBeenCalled()
      })
    })

    // -----------------------------------------------------------------------
    // Tier 2: API fetch when cache is stale or missing
    // -----------------------------------------------------------------------
    describe('Tier 2: API fetch when cache is stale', () => {
      it('should fetch from API when cached version differs from API version', async () => {
        mockGetCachedTranslations.mockReturnValue(MOCK_TR_TRANSLATIONS)
        mockGetCachedVersion.mockReturnValue('3') // Stale

        const apiTranslations = {
          nav: { home: 'API Ana Sayfa', dashboard: 'API Panel' },
          common: { save: 'API Kaydet', cancel: 'API İptal' },
        }

        // First fetch: locales with version 5 (differs from cached 3)
        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        // Second fetch: translations
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(apiTranslations, '5')
        )

        const result = await getTranslations('tr')

        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          'http://localhost:4001/api/translations/tr'
        )
        expect(
          (result as Record<string, Record<string, string>>).nav.home
        ).toBe('API Ana Sayfa')
      })

      it('should fetch from API when no cache exists', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        const apiTranslations = {
          nav: { home: 'Fresh Home', dashboard: 'Fresh Dashboard' },
          common: { save: 'Fresh Save', cancel: 'Fresh Cancel' },
        }

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(apiTranslations, '5')
        )

        const result = await getTranslations('en')
        const rec = result as Record<string, Record<string, string>>

        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect(rec.nav.home).toBe('Fresh Home')
        expect(rec.common.save).toBe('Fresh Save')
      })

      it('should update localStorage cache after successful API fetch', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        const apiTranslations = {
          nav: { home: 'New Home' },
          common: { save: 'New Save' },
        }

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '10')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(apiTranslations, '10')
        )

        await getTranslations('tr')

        expect(mockSetCachedTranslations).toHaveBeenCalledWith(
          'tr',
          expect.any(Object)
        )
        expect(mockSetCachedVersion).toHaveBeenCalledWith('tr', '10')
      })

      it('should invoke progress with loading(0), loading(50), complete(100) for API fetch', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(
            { nav: { home: 'X' }, common: { save: 'Y' } },
            '5'
          )
        )

        const progressUpdates: TranslationProgress[] = []
        await getTranslations('en', (p) =>
          progressUpdates.push({ ...p })
        )

        expect(
          progressUpdates.some(
            (p) => p.status === 'loading' && p.progress === 0
          )
        ).toBe(true)
        expect(
          progressUpdates.some(
            (p) => p.status === 'loading' && p.progress === 50
          )
        ).toBe(true)
        expect(
          progressUpdates.some(
            (p) => p.status === 'complete' && p.progress === 100
          )
        ).toBe(true)
      })

      it('should invoke progress at 50% with message about fetching latest', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse({ nav: { home: 'X' } }, '5')
        )

        const progressUpdates: TranslationProgress[] = []
        await getTranslations('tr', (p) =>
          progressUpdates.push({ ...p })
        )

        const fetchingUpdate = progressUpdates.find(
          (p) => p.progress === 50
        )
        expect(fetchingUpdate).toBeDefined()
        expect(fetchingUpdate!.message).toBe(
          'Fetching latest translations...'
        )
      })
    })

    // -----------------------------------------------------------------------
    // Tier 3: Merge with preloaded translations
    // -----------------------------------------------------------------------
    describe('Tier 3: merging API with preloaded', () => {
      it('should merge API translations over preloaded for known locale', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        // API overrides only nav.home; preloaded also has common section
        const apiTranslations = {
          nav: { home: 'DB Ana Sayfa' },
        }

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(apiTranslations, '5')
        )

        const result = await getTranslations('tr')
        const rec = result as Record<string, Record<string, string>>

        // API value overrides preloaded
        expect(rec.nav.home).toBe('DB Ana Sayfa')
        // Preloaded nav.dashboard preserved (not in API response)
        expect(rec.nav.dashboard).toBe('Panel')
        // Preloaded common section preserved entirely
        expect(rec.common.save).toBe('Kaydet')
        expect(rec.common.cancel).toBe('İptal')
      })

      it('should include new API sections not present in preloaded', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        const apiTranslations = {
          nav: { home: 'Override' },
          brand_new_section: { key1: 'value1', key2: 'value2' },
        }

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(apiTranslations, '5')
        )

        const result = await getTranslations('en')
        const rec = result as Record<string, Record<string, string>>

        expect(rec.brand_new_section).toEqual({
          key1: 'value1',
          key2: 'value2',
        })
        // Original preloaded keys still present
        expect(rec.common.save).toBe('Save')
      })

      it('should not merge with preloaded for non-preloaded locale', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        const apiTranslations = {
          nav: { home: 'Startseite', dashboard: 'Armaturenbrett' },
        }

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse(
            [createMockAPILocale({ code: 'de' })],
            '5'
          )
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(apiTranslations, '5')
        )

        const result = await getTranslations('de')
        const rec = result as Record<string, Record<string, string>>

        // API values present
        expect(rec.nav.home).toBe('Startseite')
        // common section should not exist (de has no preloaded)
        expect(rec.common).toBeUndefined()
      })

      it('should cache the merged result, not just the API result', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        const apiTranslations = {
          nav: { home: 'DB Home' },
        }

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(apiTranslations, '5')
        )

        await getTranslations('tr')

        // The cached value should be the merged result (has common from preloaded)
        const cachedValue = mockSetCachedTranslations.mock.calls[0][1]
        const cached = cachedValue as Record<string, Record<string, string>>
        expect(cached.nav.home).toBe('DB Home')
        expect(cached.common.save).toBe('Kaydet') // From preloaded TR
      })
    })

    // -----------------------------------------------------------------------
    // Tier 4: Fallback chain (cache -> preloaded -> EN)
    // -----------------------------------------------------------------------
    describe('Tier 4: fallback chain', () => {
      it('should fall back to cached translations when API fetch fails', async () => {
        const cachedData = {
          nav: { home: 'Cached' },
          common: { save: 'Cached Save' },
        } as unknown as import('./translations').TranslationDictionary

        mockGetCachedTranslations.mockReturnValue(cachedData)
        mockGetCachedVersion.mockReturnValue('2')

        // API error (locales endpoint)
        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const result = await getTranslations('tr')

        expect(result).toEqual(cachedData)
      })

      it('should fall back to preloaded translations when API fails and no cache', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const result = await getTranslations('tr')
        const rec = result as Record<string, Record<string, string>>

        expect(rec.nav.home).toBe('Ana Sayfa')
        expect(rec.common.save).toBe('Kaydet')
      })

      it('should fall back to EN_TRANSLATIONS for unknown locale with no cache and no API', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const result = await getTranslations('xx')
        const rec = result as Record<string, Record<string, string>>

        // Final fallback is EN_TRANSLATIONS
        expect(rec.nav.home).toBe('Home')
        expect(rec.common.save).toBe('Save')
      })

      it('should report error progress when falling back to EN', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const progressUpdates: TranslationProgress[] = []
        await getTranslations('xx', (p) =>
          progressUpdates.push({ ...p })
        )

        const lastUpdate = progressUpdates[progressUpdates.length - 1]
        expect(lastUpdate.status).toBe('error')
        expect(lastUpdate.progress).toBe(0)
        expect(lastUpdate.message).toContain('English')
      })

      it('should report complete progress when falling back to preloaded', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const progressUpdates: TranslationProgress[] = []
        await getTranslations('tr', (p) =>
          progressUpdates.push({ ...p })
        )

        const lastUpdate = progressUpdates[progressUpdates.length - 1]
        expect(lastUpdate.status).toBe('complete')
        expect(lastUpdate.progress).toBe(100)
      })

      it('should report complete progress when falling back to cache', async () => {
        const cachedData = {
          nav: { home: 'Cached' },
        } as unknown as import('./translations').TranslationDictionary
        mockGetCachedTranslations.mockReturnValue(cachedData)
        mockGetCachedVersion.mockReturnValue('2')

        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const progressUpdates: TranslationProgress[] = []
        await getTranslations('tr', (p) =>
          progressUpdates.push({ ...p })
        )

        const lastUpdate = progressUpdates[progressUpdates.length - 1]
        expect(lastUpdate.status).toBe('complete')
        expect(lastUpdate.progress).toBe(100)
        expect(lastUpdate.message).toBe('Translations loaded from cache')
      })

      it('should fall back to cache when API returns null translations', async () => {
        const cachedData = {
          nav: { home: 'CachedVal' },
        } as unknown as import('./translations').TranslationDictionary

        mockGetCachedTranslations.mockReturnValue(cachedData)
        mockGetCachedVersion.mockReturnValue('2')

        // Locales returns newer version
        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        // Translation API returns success: false (no translations)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: false }),
        })

        const result = await getTranslations('tr')

        expect(result).toEqual(cachedData)
      })

      it('should fall back to preloaded when API returns null translations and no cache', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: false }),
        })

        const result = await getTranslations('tr')
        const rec = result as Record<string, Record<string, string>>

        expect(rec.nav.home).toBe('Ana Sayfa')
      })

      it('should fall back to EN when translations endpoint returns non-ok and no cache or preloaded', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        // Locales works
        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale({ code: 'de' })], '5')
        )
        // Translations fails with 404
        mockFetch.mockResolvedValueOnce(createFailedResponse(404))

        const result = await getTranslations('de')
        const rec = result as Record<string, Record<string, string>>

        // de has no preloaded, no cache, API failed => EN fallback
        expect(rec.nav.home).toBe('Home')
      })

      it('should fall back to preloaded when translations fetch throws', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockRejectedValueOnce(new Error('Fetch failed'))

        const result = await getTranslations('en')
        const rec = result as Record<string, Record<string, string>>

        expect(rec.nav.home).toBe('Home')
      })
    })

    // -----------------------------------------------------------------------
    // Locale normalization
    // -----------------------------------------------------------------------
    describe('locale normalization', () => {
      it('should normalize locale to lowercase', async () => {
        mockFetch.mockRejectedValueOnce(new Error('No network'))

        const result = await getTranslations('TR')
        const rec = result as Record<string, Record<string, string>>

        expect(rec.nav.home).toBe('Ana Sayfa')
      })

      it('should strip region subtag en-US -> en', async () => {
        mockFetch.mockRejectedValueOnce(new Error('No network'))

        const result = await getTranslations('en-US')
        const rec = result as Record<string, Record<string, string>>

        expect(rec.nav.home).toBe('Home')
      })

      it('should strip region subtag tr-TR -> tr', async () => {
        mockFetch.mockRejectedValueOnce(new Error('No network'))

        const result = await getTranslations('tr-TR')
        const rec = result as Record<string, Record<string, string>>

        expect(rec.nav.home).toBe('Ana Sayfa')
      })

      it('should pass normalized locale to cache functions', async () => {
        mockFetch.mockRejectedValueOnce(new Error('No network'))

        await getTranslations('TR-TR')

        expect(mockGetCachedTranslations).toHaveBeenCalledWith('tr')
        expect(mockGetCachedVersion).toHaveBeenCalledWith('tr')
      })

      it('should pass normalized locale to API endpoint', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse({ nav: { home: 'X' } }, '5')
        )

        await getTranslations('EN-US')

        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          'http://localhost:4001/api/translations/en'
        )
      })
    })

    // -----------------------------------------------------------------------
    // Progress callback
    // -----------------------------------------------------------------------
    describe('progress callback', () => {
      it('should not throw when onProgress is undefined', async () => {
        mockFetch.mockRejectedValueOnce(new Error('No network'))

        await expect(getTranslations('en')).resolves.toBeDefined()
      })

      it('should always start with loading/0 status', async () => {
        mockFetch.mockRejectedValueOnce(new Error('No network'))

        const progressUpdates: TranslationProgress[] = []
        await getTranslations('en', (p) =>
          progressUpdates.push({ ...p })
        )

        expect(progressUpdates[0]).toEqual({
          status: 'loading',
          progress: 0,
          message: 'Loading translations...',
        })
      })

      it('should call progress multiple times during successful API flow', async () => {
        mockGetCachedTranslations.mockReturnValue(null)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse({ nav: { home: 'X' } }, '5')
        )

        const progressUpdates: TranslationProgress[] = []
        await getTranslations('tr', (p) =>
          progressUpdates.push({ ...p })
        )

        // At minimum: loading(0%) -> loading(50%) -> complete(100%)
        expect(progressUpdates.length).toBeGreaterThanOrEqual(3)
      })
    })

    // -----------------------------------------------------------------------
    // Cache version matching edge cases
    // -----------------------------------------------------------------------
    describe('cache version matching', () => {
      it('should treat null cached version as stale (forces API fetch)', async () => {
        mockGetCachedTranslations.mockReturnValue(MOCK_TR_TRANSLATIONS)
        mockGetCachedVersion.mockReturnValue(null)

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '5')
        )
        const apiTranslations = { nav: { home: 'API value' } }
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(apiTranslations, '5')
        )

        const result = await getTranslations('tr')
        const rec = result as Record<string, Record<string, string>>

        // null !== '5', so it should fetch from API
        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect(rec.nav.home).toBe('API value')
      })

      it('should treat version "0" as valid for comparison', async () => {
        mockGetCachedTranslations.mockReturnValue(MOCK_TR_TRANSLATIONS)
        mockGetCachedVersion.mockReturnValue('0')

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '0')
        )

        const result = await getTranslations('tr')

        // '0' === '0', should use cache
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(result).toEqual(MOCK_TR_TRANSLATIONS)
      })

      it('should detect version change from 0 to 1 as stale', async () => {
        mockGetCachedTranslations.mockReturnValue(MOCK_TR_TRANSLATIONS)
        mockGetCachedVersion.mockReturnValue('0')

        mockFetch.mockResolvedValueOnce(
          createLocalesResponse([createMockAPILocale()], '1')
        )
        mockFetch.mockResolvedValueOnce(
          createTranslationsResponse(
            { nav: { home: 'Updated' } },
            '1'
          )
        )

        const result = await getTranslations('tr')
        const rec = result as Record<string, Record<string, string>>

        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect(rec.nav.home).toBe('Updated')
      })
    })
  })

  // ==========================================================================
  // getLocaleName
  // ==========================================================================

  describe('getLocaleName', () => {
    it('should return "Türkçe" for tr', () => {
      expect(getLocaleName('tr')).toBe('Türkçe')
    })

    it('should return "English" for en', () => {
      expect(getLocaleName('en')).toBe('English')
    })

    it('should return "Deutsch" for de', () => {
      expect(getLocaleName('de')).toBe('Deutsch')
    })

    it('should return "Français" for fr', () => {
      expect(getLocaleName('fr')).toBe('Français')
    })

    it('should return native name for ar', () => {
      expect(getLocaleName('ar')).toBe('العربية')
    })

    it('should return native name for ja', () => {
      expect(getLocaleName('ja')).toBe('日本語')
    })

    it('should return uppercased locale for unknown code', () => {
      expect(getLocaleName('xx')).toBe('XX')
    })

    it('should return uppercased longer unknown code', () => {
      expect(getLocaleName('unknown')).toBe('UNKNOWN')
    })

    it('should normalize to lowercase before lookup', () => {
      expect(getLocaleName('TR')).toBe('Türkçe')
      expect(getLocaleName('EN')).toBe('English')
    })

    it('should strip region subtag', () => {
      expect(getLocaleName('tr-TR')).toBe('Türkçe')
      expect(getLocaleName('en-US')).toBe('English')
      expect(getLocaleName('de-AT')).toBe('Deutsch')
    })

    it('should use API locales cache for unknown locale when populated', async () => {
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([
          createMockAPILocale({
            code: 'sv',
            name: 'Swedish',
            nativeName: 'Svenska',
          }),
        ])
      )
      await fetchAvailableLocales()

      // sv is not in COMMON_LOCALES but is in API cache
      expect(getLocaleName('sv')).toBe('Svenska')
    })

    it('should prefer COMMON_LOCALES over API cache for known locales', async () => {
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([
          createMockAPILocale({
            code: 'tr',
            nativeName: 'API Türkçe Override',
          }),
        ])
      )
      await fetchAvailableLocales()

      // COMMON_LOCALES takes precedence
      expect(getLocaleName('tr')).toBe('Türkçe')
    })

    it('should return uppercase for locale not in COMMON_LOCALES or API cache', () => {
      // No API cache populated
      expect(getLocaleName('sv')).toBe('SV')
    })
  })

  // ==========================================================================
  // isRTLLocale
  // ==========================================================================

  describe('isRTLLocale', () => {
    it('should return true for Arabic (ar)', () => {
      expect(isRTLLocale('ar')).toBe(true)
    })

    it('should return true for Hebrew (he)', () => {
      expect(isRTLLocale('he')).toBe(true)
    })

    it('should return true for Farsi (fa)', () => {
      expect(isRTLLocale('fa')).toBe(true)
    })

    it('should return true for Urdu (ur)', () => {
      expect(isRTLLocale('ur')).toBe(true)
    })

    it('should return false for English (en)', () => {
      expect(isRTLLocale('en')).toBe(false)
    })

    it('should return false for Turkish (tr)', () => {
      expect(isRTLLocale('tr')).toBe(false)
    })

    it('should return false for German (de)', () => {
      expect(isRTLLocale('de')).toBe(false)
    })

    it('should return false for Japanese (ja)', () => {
      expect(isRTLLocale('ja')).toBe(false)
    })

    it('should return false for Chinese (zh)', () => {
      expect(isRTLLocale('zh')).toBe(false)
    })

    it('should normalize locale to lowercase before checking', () => {
      expect(isRTLLocale('AR')).toBe(true)
      expect(isRTLLocale('He')).toBe(true)
      expect(isRTLLocale('FA')).toBe(true)
    })

    it('should strip region subtag before checking', () => {
      expect(isRTLLocale('ar-SA')).toBe(true)
      expect(isRTLLocale('ar-EG')).toBe(true)
      expect(isRTLLocale('en-US')).toBe(false)
    })

    it('should use API cache for RTL detection when available', async () => {
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([
          createMockAPILocale({
            code: 'ku',
            name: 'Kurdish',
            nativeName: 'Kurdî',
            isRtl: true,
          }),
        ])
      )
      await fetchAvailableLocales()

      // ku is not in hardcoded RTL list but API says it is RTL
      expect(isRTLLocale('ku')).toBe(true)
    })

    it('should prefer API cache over hardcoded RTL list', async () => {
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([
          createMockAPILocale({
            code: 'ar',
            isRtl: false, // Hypothetical override
          }),
        ])
      )
      await fetchAvailableLocales()

      // API says ar is LTR (overrides hardcoded)
      expect(isRTLLocale('ar')).toBe(false)
    })

    it('should fall back to hardcoded list when API cache is empty', () => {
      // No API cache (already cleared in beforeEach)
      expect(isRTLLocale('ar')).toBe(true)
      expect(isRTLLocale('en')).toBe(false)
    })
  })

  // ==========================================================================
  // getLocaleInfo
  // ==========================================================================

  describe('getLocaleInfo', () => {
    it('should return complete info for Turkish', () => {
      const info = getLocaleInfo('tr')

      expect(info).toEqual(
        expect.objectContaining({
          code: 'tr',
          name: 'Turkish',
          nativeName: 'Türkçe',
          flag: '🇹🇷',
          rtl: false,
          isPreloaded: true,
        })
      )
    })

    it('should return complete info for English', () => {
      const info = getLocaleInfo('en')

      expect(info.code).toBe('en')
      expect(info.name).toBe('English')
      expect(info.nativeName).toBe('English')
      expect(info.flag).toBe('🇬🇧')
      expect(info.rtl).toBe(false)
      expect(info.isPreloaded).toBe(true)
    })

    it('should return RTL true for Arabic', () => {
      const info = getLocaleInfo('ar')

      expect(info.rtl).toBe(true)
      expect(info.nativeName).toBe('العربية')
      expect(info.flag).toBe('🇸🇦')
    })

    it('should return fallback values for unknown locale', () => {
      const info = getLocaleInfo('xx')

      expect(info.code).toBe('xx')
      expect(info.name).toBe('xx')
      expect(info.nativeName).toBe('xx')
      expect(info.flag).toBe('🌐')
      expect(info.rtl).toBe(false)
      expect(info.isPreloaded).toBe(false)
    })

    it('should normalize locale code', () => {
      const info = getLocaleInfo('TR-TR')

      expect(info.code).toBe('tr')
      expect(info.name).toBe('Turkish')
    })

    it('should report isCached: false when no cache', () => {
      mockGetCachedTranslations.mockReturnValue(null)
      const info = getLocaleInfo('tr')
      expect(info.isCached).toBe(false)
    })

    it('should report isCached: true when cache exists', () => {
      mockGetCachedTranslations.mockReturnValue(MOCK_TR_TRANSLATIONS)
      const info = getLocaleInfo('tr')
      expect(info.isCached).toBe(true)
    })

    it('should prefer API locale data over COMMON_LOCALES for non-common locales', async () => {
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([
          createMockAPILocale({
            code: 'sv',
            name: 'Swedish',
            nativeName: 'Svenska',
            flag: '🇸🇪',
            isRtl: false,
          }),
        ])
      )
      await fetchAvailableLocales()

      const info = getLocaleInfo('sv')

      expect(info.code).toBe('sv')
      expect(info.name).toBe('Swedish')
      expect(info.nativeName).toBe('Svenska')
      expect(info.flag).toBe('🇸🇪')
      expect(info.rtl).toBe(false)
      expect(info.isPreloaded).toBe(false)
    })

    it('should use API values for name/nativeName/flag when API locale is available', async () => {
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([
          createMockAPILocale({
            code: 'tr',
            name: 'API Turkish',
            nativeName: 'API Türkçe',
            flag: '🏳️',
          }),
        ])
      )
      await fetchAvailableLocales()

      const info = getLocaleInfo('tr')

      // API takes precedence for name, nativeName, flag
      expect(info.name).toBe('API Turkish')
      expect(info.nativeName).toBe('API Türkçe')
      expect(info.flag).toBe('🏳️')
    })

    it('should report isPreloaded correctly for non-preloaded locale', () => {
      const info = getLocaleInfo('de')

      expect(info.isPreloaded).toBe(false)
    })
  })

  // ==========================================================================
  // translateString
  // ==========================================================================

  describe('translateString', () => {
    it('should return text as-is when source and target locale are the same', async () => {
      const result = await translateString('Hello', 'en', 'en')
      expect(result).toBe('Hello')
    })

    it('should return text as-is when target differs from source (stub)', async () => {
      const result = await translateString('Hello', 'tr', 'en')
      expect(result).toBe('Hello')
    })

    it('should return text as-is for non-English source locale', async () => {
      const result = await translateString('Merhaba', 'en', 'tr')
      expect(result).toBe('Merhaba')
    })

    it('should use "en" as default source locale', async () => {
      const result = await translateString('Hello', 'tr')
      expect(result).toBe('Hello')
    })

    it('should handle empty string', async () => {
      const result = await translateString('', 'tr', 'en')
      expect(result).toBe('')
    })

    it('should handle special characters and Turkish currency', async () => {
      const text = 'Teminat: ₺50.000 (Muafiyet: %10)'
      const result = await translateString(text, 'en', 'tr')
      expect(result).toBe(text)
    })

    it('should handle multi-line text', async () => {
      const text = 'Line 1\nLine 2\nLine 3'
      const result = await translateString(text, 'de', 'en')
      expect(result).toBe(text)
    })

    it('should return same text when both locales are "tr"', async () => {
      const result = await translateString('Merhaba', 'tr', 'tr')
      expect(result).toBe('Merhaba')
    })
  })

  // ==========================================================================
  // Edge cases and integration
  // ==========================================================================

  describe('Edge cases', () => {
    it('should handle concurrent getTranslations calls gracefully', async () => {
      mockGetCachedTranslations.mockReturnValue(null)
      mockGetCachedVersion.mockReturnValue(null)

      // Both calls will hit API
      mockFetch.mockResolvedValue(
        createLocalesResponse([createMockAPILocale()], '5')
      )

      const [result1, result2] = await Promise.all([
        getTranslations('tr'),
        getTranslations('en'),
      ])

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })

    it('should handle json() throwing an error in getTranslations', async () => {
      mockGetCachedTranslations.mockReturnValue(null)
      mockGetCachedVersion.mockReturnValue(null)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })

      const result = await getTranslations('en')
      const rec = result as Record<string, Record<string, string>>

      // Falls back to preloaded EN
      expect(rec.nav.home).toBe('Home')
    })

    it('should handle getTranslations for locale with no preloaded, no API, no cache', async () => {
      mockGetCachedTranslations.mockReturnValue(null)
      mockGetCachedVersion.mockReturnValue(null)

      mockFetch.mockRejectedValueOnce(new Error('No API'))

      const result = await getTranslations('zh')
      const rec = result as Record<string, Record<string, string>>

      // Final fallback: EN_TRANSLATIONS
      expect(rec.nav.home).toBe('Home')
    })

    it('should handle locales endpoint returning empty then translations also failing', async () => {
      mockGetCachedTranslations.mockReturnValue(null)
      mockGetCachedVersion.mockReturnValue(null)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          locales: [],
          // version defaults to '0'
        }),
      })
      mockFetch.mockResolvedValueOnce(createFailedResponse(404))

      const result = await getTranslations('de')
      const rec = result as Record<string, Record<string, string>>

      // de has no preloaded, no cache => EN fallback
      expect(rec.nav.home).toBe('Home')
    })
  })

  // ==========================================================================
  // API base URL behavior
  // ==========================================================================

  describe('API base URL', () => {
    it('should prepend proxyUrl to API paths', async () => {
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([createMockAPILocale()], '5')
      )

      await fetchAvailableLocales()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/translations/locales'
      )
    })

    it('should work with empty proxyUrl (relative paths)', async () => {
      const envModule = await import('../env')
      const originalProxyUrl = envModule.default.proxyUrl
      envModule.default.proxyUrl = null as unknown as string

      invalidateLocalesCache()
      mockFetch.mockResolvedValueOnce(
        createLocalesResponse([createMockAPILocale()], '5')
      )

      await fetchAvailableLocales()

      // getApiBaseUrl() returns '' when proxyUrl is null
      expect(mockFetch).toHaveBeenCalledWith('/api/translations/locales')

      // Restore
      envModule.default.proxyUrl = originalProxyUrl
    })
  })

  // ==========================================================================
  // TranslationProgress type validation
  // ==========================================================================

  describe('TranslationProgress types', () => {
    it('should have valid status values in TranslationStatus union', () => {
      // Compile-time check: these are all valid TranslationStatus values
      const validStatuses: Array<
        'idle' | 'loading' | 'translating' | 'complete' | 'error'
      > = ['idle', 'loading', 'translating', 'complete', 'error']

      validStatuses.forEach((status) => {
        expect(typeof status).toBe('string')
      })
    })

    it('should produce TranslationProgress objects with required fields', async () => {
      mockFetch.mockRejectedValueOnce(new Error('No network'))

      const progressUpdates: TranslationProgress[] = []
      await getTranslations('en', (p) =>
        progressUpdates.push({ ...p })
      )

      for (const update of progressUpdates) {
        expect(update).toHaveProperty('status')
        expect(update).toHaveProperty('progress')
        expect(update).toHaveProperty('message')
        expect(typeof update.status).toBe('string')
        expect(typeof update.progress).toBe('number')
        expect(typeof update.message).toBe('string')
      }
    })
  })
})
