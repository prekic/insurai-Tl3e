// Translation Service
// Loads translations from DB API with preloaded fallback for EN/TR.
// Three-tier loading: preloaded → localStorage cache → API fetch → fallback

import type { TranslationDictionary } from './translations'
import { COMMON_LOCALES } from './translations'
import { SKELETON_TRANSLATIONS } from './translations-skeleton'
import {
  getCachedTranslations,
  setCachedTranslations,
  getCachedVersion,
  setCachedVersion,
} from './translation-cache'
import env from '../env'

// Translation status for UI feedback
export type TranslationStatus = 'idle' | 'loading' | 'translating' | 'complete' | 'error'

export interface TranslationProgress {
  status: TranslationStatus
  progress: number // 0-100
  message: string
}

// Locale info returned by the API
export interface APILocale {
  code: string
  name: string
  nativeName: string
  flag: string
  isRtl: boolean
  isActive: boolean
  isDefault: boolean
  displayOrder: number
}

// In-memory cache for API-loaded locales (refreshed on each call)
let apiLocalesCache: { locales: APILocale[]; version: string; timestamp: number } | null = null
const API_LOCALE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// =============================================================================
// API COMMUNICATION
// =============================================================================

function getApiBaseUrl(): string {
  return env.proxyUrl || ''
}

/**
 * Fetch available locales and translation version from the API.
 */
export async function fetchAvailableLocales(): Promise<{ locales: APILocale[]; version: string }> {
  // Use cache if fresh
  if (apiLocalesCache && Date.now() - apiLocalesCache.timestamp < API_LOCALE_CACHE_TTL) {
    return { locales: apiLocalesCache.locales, version: apiLocalesCache.version }
  }

  try {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/translations/locales`)

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const data = await response.json()
    if (data.success && data.locales) {
      apiLocalesCache = {
        locales: data.locales,
        version: data.translationVersion || '0',
        timestamp: Date.now(),
      }
      return { locales: data.locales, version: data.translationVersion || '0' }
    }
  } catch {
    // API unavailable - return empty, fall back to preloaded
  }

  return { locales: [], version: '0' }
}

/**
 * Fetch translations for a locale from the API.
 */
async function fetchTranslationsFromAPI(locale: string): Promise<{
  translations: TranslationDictionary | null
  version: string
}> {
  try {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/translations/${locale}`)

    if (!response.ok) {
      return { translations: null, version: '0' }
    }

    const data = await response.json()
    if (data.success && data.translations) {
      return {
        translations: data.translations as TranslationDictionary,
        version: data.version || '0',
      }
    }
  } catch {
    // API unavailable
  }

  return { translations: null, version: '0' }
}

// =============================================================================
// PRELOADED TRANSLATIONS — LAZY LOADED PER LOCALE
// =============================================================================

/**
 * Dynamically import preloaded translations for a locale.
 * Each locale is a separate chunk so only the needed locale is fetched.
 */
async function getPreloadedTranslations(locale: string): Promise<TranslationDictionary | null> {
  try {
    if (locale === 'en') {
      const { EN_TRANSLATIONS } = await import('./translations-en')
      return EN_TRANSLATIONS
    }
    if (locale === 'tr') {
      const { TR_TRANSLATIONS } = await import('./translations-tr')
      return TR_TRANSLATIONS
    }
  } catch {
    // Dynamic import failed
  }
  return null
}

// =============================================================================
// MAIN TRANSLATION FUNCTION
// =============================================================================

/**
 * Get translations for a locale.
 *
 * Loading strategy (in order):
 * 1. Preloaded translations (EN/TR) — lazy-loaded per locale chunk
 * 2. localStorage cache — fast, check version freshness
 * 3. API fetch — network call to /api/translations/:locale
 * 4. Fallback to EN_TRANSLATIONS — always available
 *
 * For preloaded locales (EN/TR), still checks API for updates
 * in the background so admin edits propagate.
 */
export async function getTranslations(
  locale: string,
  onProgress?: (progress: TranslationProgress) => void
): Promise<TranslationDictionary> {
  const normalizedLocale = locale.toLowerCase().split('-')[0]

  onProgress?.({
    status: 'loading',
    progress: 0,
    message: 'Loading translations...',
  })

  // 1. Check preloaded translations (lazy-loaded chunk per locale)
  const preloaded = await getPreloadedTranslations(normalizedLocale)

  // 2. Check localStorage cache
  const cached = getCachedTranslations(normalizedLocale)
  const cachedVersion = getCachedVersion(normalizedLocale)

  // 3. Try API fetch — check if we need to refresh
  try {
    const { version: currentVersion } = await fetchAvailableLocales()

    // If cache version matches API version, use cache
    if (cached && cachedVersion === currentVersion) {
      onProgress?.({
        status: 'complete',
        progress: 100,
        message: 'Translations loaded from cache',
      })
      const safeBase = preloaded
        ? mergeTranslations(SKELETON_TRANSLATIONS, preloaded)
        : SKELETON_TRANSLATIONS
      return mergeTranslations(safeBase, cached)
    }

    // Cache is stale or missing — fetch from API
    onProgress?.({
      status: 'loading',
      progress: 50,
      message: 'Fetching latest translations...',
    })

    const { translations: apiTranslations, version: apiVersion } =
      await fetchTranslationsFromAPI(normalizedLocale)

    if (apiTranslations) {
      // Merge with preloaded to ensure no missing keys
      const safeBase = preloaded
        ? mergeTranslations(SKELETON_TRANSLATIONS, preloaded)
        : SKELETON_TRANSLATIONS
      const merged = mergeTranslations(safeBase, apiTranslations)

      // Update cache
      setCachedTranslations(normalizedLocale, merged)
      setCachedVersion(normalizedLocale, apiVersion)

      onProgress?.({
        status: 'complete',
        progress: 100,
        message: 'Translations loaded',
      })
      return merged
    }
  } catch {
    // API fetch failed — use cached or preloaded
  }

  // 4. Fallback chain: cache → preloaded → EN
  if (cached) {
    onProgress?.({
      status: 'complete',
      progress: 100,
      message: 'Translations loaded from cache',
    })
    const safeBase = preloaded
      ? mergeTranslations(SKELETON_TRANSLATIONS, preloaded)
      : SKELETON_TRANSLATIONS
    return mergeTranslations(safeBase, cached)
  }

  if (preloaded) {
    onProgress?.({
      status: 'complete',
      progress: 100,
      message: 'Translations loaded',
    })
    return preloaded
  }

  onProgress?.({
    status: 'error',
    progress: 0,
    message: 'Translation not available. Using English.',
  })

  // Final fallback: dynamically import EN_TRANSLATIONS as last resort.
  // This keeps EN out of the main bundle while still providing useful strings
  // when everything else fails (unknown locale, no cache, API down).
  try {
    const { EN_TRANSLATIONS } = await import('./translations-en')
    return EN_TRANSLATIONS
  } catch {
    return SKELETON_TRANSLATIONS
  }
}

/**
 * Merge preloaded translations with API translations.
 * API values override preloaded for any key that exists in both.
 * Preloaded keys fill gaps where API has no entry.
 */
function mergeTranslations(
  base: TranslationDictionary,
  override: TranslationDictionary
): TranslationDictionary {
  // TranslationDictionary is a nominal type with named sections (`policy`,
  // `global`, etc.). The merge operation treats it as a generic
  // string-keyed record — a structural-type boundary, not a shape assertion.
  // The unknown-middleman is required because TS refuses the named→Record
  // conversion directly; both sides *are* structurally compatible at runtime.
  const result: Record<string, Record<string, string>> = {}
  // eslint-disable-next-line no-restricted-syntax
  const baseRec = base as unknown as Record<string, Record<string, string>>
  // eslint-disable-next-line no-restricted-syntax
  const overrideRec = override as unknown as Record<string, Record<string, string>>

  // Start with all base sections
  for (const section of Object.keys(baseRec)) {
    const baseSection = baseRec[section]
    const overrideSection = overrideRec?.[section]

    if (overrideSection) {
      result[section] = { ...baseSection, ...overrideSection }
    } else {
      result[section] = { ...baseSection }
    }
  }

  // Add any new sections from override that don't exist in base
  for (const section of Object.keys(overrideRec)) {
    if (!(section in result)) {
      result[section] = { ...overrideRec[section] }
    }
  }

  // eslint-disable-next-line no-restricted-syntax
  return result as unknown as TranslationDictionary
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Get display name for a locale
export function getLocaleName(locale: string): string {
  const normalized = locale.toLowerCase().split('-')[0]
  const common = COMMON_LOCALES[normalized as keyof typeof COMMON_LOCALES]
  if (common) {
    return common.nativeName
  }

  // Check API locales cache
  if (apiLocalesCache) {
    const apiLocale = apiLocalesCache.locales.find((l) => l.code === normalized)
    if (apiLocale) return apiLocale.nativeName
  }

  return locale.toUpperCase()
}

// Check if a locale uses RTL (right-to-left) direction
export function isRTLLocale(locale: string): boolean {
  const normalized = locale.toLowerCase().split('-')[0]

  // Check API locales cache first
  if (apiLocalesCache) {
    const apiLocale = apiLocalesCache.locales.find((l) => l.code === normalized)
    if (apiLocale) return apiLocale.isRtl
  }

  // Fallback to known RTL locales
  const rtlLocales = ['ar', 'he', 'fa', 'ur']
  return rtlLocales.includes(normalized)
}

// Get locale info
export function getLocaleInfo(locale: string) {
  const normalized = locale.toLowerCase().split('-')[0]
  const common = COMMON_LOCALES[normalized as keyof typeof COMMON_LOCALES]

  // Check API locales cache
  const apiLocale = apiLocalesCache?.locales.find((l) => l.code === normalized)

  return {
    code: normalized,
    name: apiLocale?.name || common?.name || locale,
    nativeName: apiLocale?.nativeName || common?.nativeName || locale,
    flag: apiLocale?.flag || common?.flag || '🌐',
    rtl: apiLocale?.isRtl || isRTLLocale(normalized),
    isPreloaded: normalized === 'en' || normalized === 'tr',
    isCached: !!getCachedTranslations(normalized),
  }
}

// Translate a single dynamic string (for runtime content)
export async function translateString(
  text: string,
  targetLocale: string,
  sourceLocale: string = 'en'
): Promise<string> {
  if (targetLocale === sourceLocale) return text

  // For now, return the text as-is. Dynamic string translation
  // can be implemented via a dedicated API endpoint in the future.
  return text
}

/**
 * Invalidate the locales cache so next call refetches from API.
 */
export function invalidateLocalesCache(): void {
  apiLocalesCache = null
}
