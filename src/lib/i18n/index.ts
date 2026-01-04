// i18n - Internationalization System
// Export all i18n functionality from a single entry point

// Context and hooks
export { I18nProvider, useI18n, useTranslation, useLanguageSelector } from './i18n-context'

// Types and translations
export type { TranslationDictionary, SupportedLocale, CommonLocale } from './translations'
export { COMMON_LOCALES, EN_TRANSLATIONS, TR_TRANSLATIONS, PRELOADED_TRANSLATIONS } from './translations'

// Translation service
export {
  getTranslations,
  getLocaleName,
  isRTLLocale,
  getLocaleInfo,
  translateString,
  type TranslationStatus,
  type TranslationProgress,
} from './translation-service'

// Cache utilities
export {
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
