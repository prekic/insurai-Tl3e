// AI Translation Service
// In production, this would connect to an AI translation API (OpenAI, Claude, etc.)
// For now, it simulates AI translation with a realistic delay

import type { TranslationDictionary } from './translations'
import { EN_TRANSLATIONS, PRELOADED_TRANSLATIONS, COMMON_LOCALES } from './translations'
import { getCachedTranslations, setCachedTranslations } from './translation-cache'

// Translation status for UI feedback
export type TranslationStatus = 'idle' | 'loading' | 'translating' | 'complete' | 'error'

export interface TranslationProgress {
  status: TranslationStatus
  progress: number // 0-100
  message: string
}

// Deep clone an object
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

// Simulate AI translation of a single string
async function simulateAITranslation(text: string, targetLocale: string): Promise<string> {
  // In production, this would call an AI API
  // For demonstration, we'll add locale-specific prefixes to show it's "translated"

  // Simulate network delay (100-300ms per string)
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100))

  // For common locales, return realistic-looking translations
  // In production, this would be actual AI translation
  const locale = targetLocale.toLowerCase()

  // Simple simulation: for unknown languages, we'll just prefix the text
  // In production, AI would provide real translations
  if (locale === 'en') return text

  // These are just placeholders - real AI would translate properly
  const prefixes: Record<string, string> = {
    de: '[DE] ',
    fr: '[FR] ',
    es: '[ES] ',
    ar: '[AR] ',
    zh: '[ZH] ',
    ja: '[JA] ',
    ko: '[KO] ',
    ru: '[RU] ',
    pt: '[PT] ',
    it: '[IT] ',
    nl: '[NL] ',
    pl: '[PL] ',
    hi: '[HI] ',
  }

  // For demo purposes, prepend locale code for non-preloaded languages
  // In production, this would be actual AI-generated translation
  return `${prefixes[locale] || `[${locale.toUpperCase()}] `}${text}`
}

// Recursively translate all strings in an object
async function translateObject(
  obj: Record<string, unknown>,
  targetLocale: string,
  onProgress?: (progress: number) => void
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  const entries = Object.entries(obj)
  let processed = 0

  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      result[key] = await simulateAITranslation(value, targetLocale)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = await translateObject(
        value as Record<string, unknown>,
        targetLocale,
        onProgress
      )
    } else {
      result[key] = value
    }

    processed++
    if (onProgress) {
      onProgress((processed / entries.length) * 100)
    }
  }

  return result
}

// Main translation function
export async function getTranslations(
  locale: string,
  onProgress?: (progress: TranslationProgress) => void
): Promise<TranslationDictionary> {
  const normalizedLocale = locale.toLowerCase().split('-')[0]

  // Report initial status
  onProgress?.({
    status: 'loading',
    progress: 0,
    message: 'Loading translations...',
  })

  // 1. Check if we have preloaded translations for this locale
  if (PRELOADED_TRANSLATIONS[normalizedLocale]) {
    onProgress?.({
      status: 'complete',
      progress: 100,
      message: 'Translations loaded',
    })
    return PRELOADED_TRANSLATIONS[normalizedLocale]
  }

  // 2. Check if we have cached translations
  const cached = getCachedTranslations(normalizedLocale)
  if (cached) {
    onProgress?.({
      status: 'complete',
      progress: 100,
      message: 'Translations loaded from cache',
    })
    return cached
  }

  // 3. Translate using AI
  onProgress?.({
    status: 'translating',
    progress: 0,
    message: `Translating to ${getLocaleName(normalizedLocale)}...`,
  })

  try {
    // Clone the English translations as our base
    const baseTranslations = deepClone(EN_TRANSLATIONS)

    // Translate all strings
    const translated = (await translateObject(
      baseTranslations as unknown as Record<string, unknown>,
      normalizedLocale,
      (progress) => {
        onProgress?.({
          status: 'translating',
          progress,
          message: `Translating... ${Math.round(progress)}%`,
        })
      }
    )) as unknown as TranslationDictionary

    // Cache the translations for future use
    setCachedTranslations(normalizedLocale, translated)

    onProgress?.({
      status: 'complete',
      progress: 100,
      message: 'Translation complete',
    })

    return translated
  } catch (error) {
    console.error(`Translation error for ${locale}:`, error)

    onProgress?.({
      status: 'error',
      progress: 0,
      message: 'Translation failed. Using English.',
    })

    // Fallback to English
    return EN_TRANSLATIONS
  }
}

// Get display name for a locale
export function getLocaleName(locale: string): string {
  const normalized = locale.toLowerCase().split('-')[0]
  const common = COMMON_LOCALES[normalized as keyof typeof COMMON_LOCALES]
  if (common) {
    return common.nativeName
  }
  return locale.toUpperCase()
}

// Check if a locale uses RTL (right-to-left) direction
export function isRTLLocale(locale: string): boolean {
  const normalized = locale.toLowerCase().split('-')[0]
  const rtlLocales = ['ar', 'he', 'fa', 'ur']
  return rtlLocales.includes(normalized)
}

// Get locale info
export function getLocaleInfo(locale: string) {
  const normalized = locale.toLowerCase().split('-')[0]
  const common = COMMON_LOCALES[normalized as keyof typeof COMMON_LOCALES]

  return {
    code: normalized,
    name: common?.name || locale,
    nativeName: common?.nativeName || locale,
    flag: common?.flag || '🌐',
    rtl: isRTLLocale(normalized),
    isPreloaded: !!PRELOADED_TRANSLATIONS[normalized],
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

  // In production, this would cache individual strings too
  return simulateAITranslation(text, targetLocale)
}
