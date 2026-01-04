// Translation Cache - localStorage for now, can be extended to database

import type { TranslationDictionary } from './translations'

const CACHE_KEY_PREFIX = 'insurai_i18n_'
const CACHE_VERSION = 1

interface CacheEntry {
  version: number
  timestamp: number
  translations: TranslationDictionary
}

// Get cached translations for a locale
export function getCachedTranslations(locale: string): TranslationDictionary | null {
  try {
    const key = `${CACHE_KEY_PREFIX}${locale}`
    const cached = localStorage.getItem(key)

    if (!cached) return null

    const entry: CacheEntry = JSON.parse(cached)

    // Check version compatibility
    if (entry.version !== CACHE_VERSION) {
      localStorage.removeItem(key)
      return null
    }

    return entry.translations
  } catch (error) {
    console.error(`Error reading translation cache for ${locale}:`, error)
    return null
  }
}

// Save translations to cache
export function setCachedTranslations(locale: string, translations: TranslationDictionary): void {
  try {
    const key = `${CACHE_KEY_PREFIX}${locale}`
    const entry: CacheEntry = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      translations,
    }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch (error) {
    console.error(`Error caching translations for ${locale}:`, error)
  }
}

// Clear cached translations for a locale
export function clearCachedTranslations(locale: string): void {
  try {
    const key = `${CACHE_KEY_PREFIX}${locale}`
    localStorage.removeItem(key)
  } catch (error) {
    console.error(`Error clearing translation cache for ${locale}:`, error)
  }
}

// Clear all cached translations
export function clearAllCachedTranslations(): void {
  try {
    const keys = Object.keys(localStorage)
    keys.forEach((key) => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key)
      }
    })
  } catch (error) {
    console.error('Error clearing all translation caches:', error)
  }
}

// Get all cached locales
export function getCachedLocales(): string[] {
  try {
    const locales: string[] = []
    const keys = Object.keys(localStorage)
    keys.forEach((key) => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        locales.push(key.replace(CACHE_KEY_PREFIX, ''))
      }
    })
    return locales
  } catch (error) {
    console.error('Error getting cached locales:', error)
    return []
  }
}

// Get user's preferred locale from storage
export function getStoredLocale(): string | null {
  try {
    return localStorage.getItem('insurai_locale')
  } catch {
    return null
  }
}

// Store user's preferred locale
export function setStoredLocale(locale: string): void {
  try {
    localStorage.setItem('insurai_locale', locale)
  } catch (error) {
    console.error('Error storing locale:', error)
  }
}

// Detect browser locale
export function detectBrowserLocale(): string {
  // Check navigator.languages first (returns array of preferred languages)
  if (navigator.languages && navigator.languages.length > 0) {
    // Get the primary language code (e.g., 'en' from 'en-US')
    const primaryLang = navigator.languages[0].split('-')[0]
    return primaryLang
  }

  // Fallback to navigator.language
  if (navigator.language) {
    return navigator.language.split('-')[0]
  }

  // Default to English
  return 'en'
}

// Get the best matching locale (stored > browser > default)
export function getBestLocale(defaultLocale: string = 'en'): string {
  const stored = getStoredLocale()
  if (stored) return stored

  const browser = detectBrowserLocale()
  return browser || defaultLocale
}
