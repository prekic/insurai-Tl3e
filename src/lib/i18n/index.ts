// i18n - Internationalization System
// Export all i18n functionality from a single entry point

// Context and hooks
export { I18nProvider, useI18n, useTranslation, useLanguageSelector, type LocaleOption } from './i18n-context'

// Types and translations
export type { TranslationDictionary, SupportedLocale, CommonLocale } from './translations'
export { COMMON_LOCALES } from './translations'
export { EN_TRANSLATIONS } from './translations-en'
export { TR_TRANSLATIONS } from './translations-tr'

// Translation service
export {
  getTranslations,
  getLocaleName,
  isRTLLocale,
  getLocaleInfo,
  translateString,
  fetchAvailableLocales,
  invalidateLocalesCache,
  type TranslationStatus,
  type TranslationProgress,
  type APILocale,
} from './translation-service'

// Cache utilities
export {
  getCachedTranslations,
  setCachedTranslations,
  clearCachedTranslations,
  clearAllCachedTranslations,
  getCachedLocales,
  getCachedVersion,
  setCachedVersion,
  getStoredLocale,
  setStoredLocale,
  detectBrowserLocale,
  getBestLocale,
} from './translation-cache'
