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
import { EN_TRANSLATIONS, COMMON_LOCALES, type CommonLocale } from './translations'
import { getBestLocale, setStoredLocale } from './translation-cache'
import {
  getTranslations,
  getLocaleInfo,
  isRTLLocale,
  type TranslationProgress,
} from './translation-service'

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

  // Available common locales
  availableLocales: typeof COMMON_LOCALES
}

// Create context with default values
const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: async () => {},
  t: EN_TRANSLATIONS,
  translate: () => '',
  isLoading: false,
  progress: { status: 'idle', progress: 100, message: '' },
  localeInfo: getLocaleInfo('en'),
  isRTL: false,
  availableLocales: COMMON_LOCALES,
})

// Provider component
interface I18nProviderProps {
  children: ReactNode
  defaultLocale?: string
}

export function I18nProvider({ children, defaultLocale = 'en' }: I18nProviderProps) {
  // Determine initial locale from stored preference or browser
  const [locale, setLocaleState] = useState(() => getBestLocale(defaultLocale))
  const [translations, setTranslations] = useState<TranslationDictionary>(EN_TRANSLATIONS)
  const [isLoading, setIsLoading] = useState(true)
  const [progress, setProgress] = useState<TranslationProgress>({
    status: 'idle',
    progress: 0,
    message: '',
  })

  // Load translations for current locale
  const loadTranslations = useCallback(async (targetLocale: string) => {
    setIsLoading(true)

    try {
      const t = await getTranslations(targetLocale, setProgress)
      setTranslations(t)
    } catch (error) {
      console.error('Failed to load translations:', error)
      setTranslations(EN_TRANSLATIONS)
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

  // Load initial translations
  useEffect(() => {
    loadTranslations(locale)

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

// Language selector component props helper
export function useLanguageSelector() {
  const { locale, setLocale, availableLocales, isLoading, progress } = useI18n()

  const locales = Object.entries(availableLocales).map(([code, info]) => ({
    code: code as CommonLocale,
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
