// i18n React Context and Provider

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import type { TranslationDictionary } from './translations'
import { COMMON_LOCALES } from './translations'
import { SKELETON_TRANSLATIONS } from './translations-skeleton'
import { getBestLocale, setStoredLocale, clearCachedTranslations } from './translation-cache'
import {
  getTranslations,
  getLocaleInfo,
  isRTLLocale,
  fetchAvailableLocales,
  invalidateLocalesCache,
  type TranslationProgress,
  type APILocale,
} from './translation-service'

// Locale info for UI display
export interface LocaleOption {
  code: string
  name: string
  nativeName: string
  flag: string
  isRtl?: boolean
  isActive: boolean
}

// Context value interface
interface I18nContextValue {
  // Current locale
  locale: string

  // Change locale
  setLocale: (locale: string) => Promise<void>

  // Current translations
  t: TranslationDictionary

  // Translation function for nested keys (e.g., t('nav.home'))
  translate: (key: string, fallback?: string) => string

  // Is currently loading translations
  isLoading: boolean

  // Translation progress
  progress: TranslationProgress

  // Locale info
  localeInfo: ReturnType<typeof getLocaleInfo>

  // Is RTL language
  isRTL: boolean

  // Available common locales (legacy — use dynamicLocales for DB-driven locales)
  availableLocales: typeof COMMON_LOCALES

  // DB-driven available locales (loaded from API)
  dynamicLocales: LocaleOption[]

  // Force-refresh translations from API (clears cache)
  refreshTranslations: () => Promise<void>
}

// Create context with default values
const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: async () => {},
  t: SKELETON_TRANSLATIONS,
  translate: () => '',
  isLoading: false,
  progress: { status: 'idle', progress: 100, message: '' },
  localeInfo: getLocaleInfo('en'),
  isRTL: false,
  availableLocales: COMMON_LOCALES,
  dynamicLocales: [],
  refreshTranslations: async () => {},
})

// Provider component
interface I18nProviderProps {
  children: ReactNode
  defaultLocale?: string
}

export function I18nProvider({ children, defaultLocale = 'en' }: I18nProviderProps) {
  // Determine initial locale from stored preference or browser
  const [locale, setLocaleState] = useState(() => getBestLocale(defaultLocale))
  const [translations, setTranslations] = useState<TranslationDictionary>(SKELETON_TRANSLATIONS)
  const [isLoading, setIsLoading] = useState(true)
  const [dynamicLocales, setDynamicLocales] = useState<LocaleOption[]>([])
  const [progress, setProgress] = useState<TranslationProgress>({
    status: 'idle',
    progress: 0,
    message: '',
  })

  // Load available locales from API
  const loadAvailableLocales = useCallback(async () => {
    try {
      const { locales: apiLocales } = await fetchAvailableLocales()
      if (apiLocales.length > 0) {
        setDynamicLocales(
          apiLocales.map((l: APILocale) => ({
            code: l.code,
            name: l.name,
            nativeName: l.nativeName,
            flag: l.flag,
            isRtl: l.isRtl,
            isActive: l.code === locale,
          }))
        )
      } else {
        // Fall back to hardcoded COMMON_LOCALES for EN/TR
        setDynamicLocales([
          { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isActive: locale === 'en' },
          { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', isActive: locale === 'tr' },
        ])
      }
    } catch {
      // API unavailable — use hardcoded fallback
      setDynamicLocales([
        { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isActive: locale === 'en' },
        { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', isActive: locale === 'tr' },
      ])
    }
  }, [locale])

  // Load translations for current locale
  const loadTranslations = useCallback(async (targetLocale: string) => {
    setIsLoading(true)

    try {
      const t = await getTranslations(targetLocale, setProgress)
      setTranslations(t)
    } catch (error) {
      console.error('Failed to load translations:', error)
      setTranslations(SKELETON_TRANSLATIONS)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Change locale
  const setLocale = useCallback(
    async (newLocale: string) => {
      const normalized = newLocale.toLowerCase().split('-')[0]

      if (normalized === locale) return

      setLocaleState(normalized)
      setStoredLocale(normalized)
      await loadTranslations(normalized)

      // Update document direction for RTL languages
      document.documentElement.dir = isRTLLocale(normalized) ? 'rtl' : 'ltr'
      document.documentElement.lang = normalized
    },
    [locale, loadTranslations]
  )

  // Force-refresh: clear cache and reload from API
  const refreshTranslations = useCallback(async () => {
    clearCachedTranslations(locale)
    invalidateLocalesCache()
    await loadTranslations(locale)
    await loadAvailableLocales()
  }, [locale, loadTranslations, loadAvailableLocales])

  // Nested key translation function
  const translate = useCallback(
    (key: string, fallback?: string): string => {
      const keys = key.split('.')
      let value: unknown = translations

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = (value as Record<string, unknown>)[k]
        } else {
          return fallback || key
        }
      }

      return typeof value === 'string' ? value : fallback || key
    },
    [translations]
  )

  // Load initial translations and available locales
  useEffect(() => {
    loadTranslations(locale)
    loadAvailableLocales()

    // Set initial document attributes
    document.documentElement.dir = isRTLLocale(locale) ? 'rtl' : 'ltr'
    document.documentElement.lang = locale
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const contextValue: I18nContextValue = {
    locale,
    setLocale,
    t: translations,
    translate,
    isLoading,
    progress,
    localeInfo: getLocaleInfo(locale),
    isRTL: isRTLLocale(locale),
    availableLocales: COMMON_LOCALES,
    dynamicLocales,
    refreshTranslations,
  }

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
}

// Hook to use i18n
export function useI18n() {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }

  return context
}

// Hook for just translations (simpler API)
export function useTranslation() {
  const { t, translate, locale, isLoading } = useI18n()
  return { t, translate, locale, isLoading }
}

// Language selector locale shape
interface LanguageSelectorLocale {
  code: string
  name?: string
  nativeName: string
  flag: string
  isActive: boolean
  isRtl?: boolean
}

// Language selector component props helper
export function useLanguageSelector() {
  const { locale, setLocale, availableLocales, dynamicLocales, isLoading, progress } = useI18n()

  // Prefer dynamic locales from API, fall back to hardcoded COMMON_LOCALES
  const locales: LanguageSelectorLocale[] = dynamicLocales.length > 0
    ? dynamicLocales.map(l => ({ ...l, isActive: l.code === locale }))
    : Object.entries(availableLocales).map(([code, info]) => ({
        code,
        ...info,
        isActive: code === locale,
      }))

  return {
    currentLocale: locale,
    locales,
    setLocale,
    isLoading,
    progress,
  }
}
