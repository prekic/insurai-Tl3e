/**
 * i18n Context - Coverage Tests
 *
 * Targets uncovered branches in i18n-context.tsx
 * Focuses on: loadAvailableLocales (API success, empty, error),
 * refreshTranslations, dynamicLocales state, useLanguageSelector paths,
 * translate edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { TranslationDictionary } from './translations'

// =============================================================================
// Mock Setup
// =============================================================================

const {
  mockEnTranslations,
  mockTrTranslations,
  mockCommonLocales,
  mockGetBestLocale,
  mockSetStoredLocale,
  mockClearCachedTranslations,
  mockGetTranslations,
  mockGetLocaleInfo,
  mockIsRTLLocale,
  mockFetchAvailableLocales,
  mockInvalidateLocalesCache,
} = vi.hoisted(() => {
  const mockEnTranslations: TranslationDictionary = {
    nav: {
      home: 'Home',
      dashboard: 'Dashboard',
      compare: 'Compare',
      chat: 'Chat',
      upload: 'Upload',
      settings: 'Settings',
      myAccount: 'My Account',
      helpCenter: 'Help Center',
      signOut: 'Sign Out',
      search: 'Search',
      notifications: 'Notifications',
      userMenu: 'User Menu',
    },
    common: {
      loading: 'Loading...',
      error: 'Error',
      retry: 'Retry',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      view: 'View',
      close: 'Close',
      back: 'Back',
      next: 'Next',
      previous: 'Previous',
      submit: 'Submit',
      confirm: 'Confirm',
      yes: 'Yes',
      no: 'No',
      all: 'All',
      none: 'None',
      search: 'Search',
      filter: 'Filter',
      sort: 'Sort',
      more: 'More',
      less: 'Less',
      actions: 'Actions',
    },
    landing: { heroTitle: 'AI', heroSubtitle: 'sub', heroDescription: 'desc', uploadCta: 'upload', viewDemo: 'demo', trustedBy: 'by', howItWorks: 'how', howItWorksSubtitle: 'sub', step1Title: 's1', step1Description: 's1d', step2Title: 's2', step2Description: 's2d', step3Title: 's3', step3Description: 's3d', benefits: 'benefits', benefitsSubtitle: 'sub', faq: 'faq', faqSubtitle: 'sub' },
    policy: { policies: 'Policies', policy: 'Policy', policyNumber: 'Number', provider: 'Provider', type: 'Type', coverage: 'Coverage', premium: 'Premium', deductible: 'Deductible', startDate: 'Start', expiryDate: 'Expiry', status: 'Status', active: 'Active', expiring: 'Expiring', expired: 'Expired', pending: 'Pending', uploadDate: 'Upload', totalPolicies: 'Total', totalCoverage: 'Coverage', expiringSoon: 'Soon', noPoliciesFound: 'None', uploadFirst: 'Upload', adjustFilters: 'Adjust' },
    upload: { title: 'Upload', subtitle: 'Sub', dropHere: 'Drop', orClickBrowse: 'Click', supportedFormats: 'PDF', maxSize: '10MB', uploading: 'Uploading', analyzing: 'Analyzing', complete: 'Done', failed: 'Failed', retryUpload: 'Retry', removeFile: 'Remove', useSamples: 'Samples', useSamplesDescription: 'Try', uploadPolicy: 'Upload' },
    chat: { title: 'Chat', policiesLoaded: 'loaded', askAboutPolicies: 'Ask', send: 'Send', sending: 'Sending', connectionError: 'Error', retryMessage: 'Retry', welcomeMessage: 'Welcome' },
    settings: { title: 'Settings', appearance: 'App', theme: 'Theme', light: 'Light', dark: 'Dark', system: 'System', notifications: 'Notif', emailNotifications: 'Email', pushNotifications: 'Push', renewalReminders: 'Remind', marketUpdates: 'Updates', language: 'Lang', selectLanguage: 'Select', security: 'Sec', changePassword: 'Change', twoFactor: '2FA', adminPanel: 'Admin', adminDescription: 'Admin' },
    account: { title: 'Account', personalInfo: 'Info', fullName: 'Name', email: 'Email', phone: 'Phone', company: 'Company', role: 'Role', memberSince: 'Since', editProfile: 'Edit' },
    help: { title: 'Help', searchHelp: 'Search', gettingStarted: 'Start', faq: 'FAQ', contactSupport: 'Contact', documentation: 'Docs', chatWithUs: 'Chat' },
    errors: { fileTooLarge: 'Large', fileTypeNotSupported: 'Wrong', uploadFailed: 'Failed', processingFailed: 'Failed', networkError: 'Network', serverError: 'Server', timeout: 'Timeout', analysisFailedTitle: 'Failed', analysisFailedDescription: 'Could not', unknownError: 'Unknown', policyNotFound: 'Not found', deleteFailed: 'Failed' },
    success: { policyDeleted: 'Deleted', policyRestored: 'Restored', uploadComplete: 'Complete', settingsSaved: 'Saved', profileUpdated: 'Updated' },
    dashboard: { title: 'Dashboard', subtitle: 'Manage', totalPolicies: 'Total', active: 'Active', totalCoverage: 'Cov', expiringSoon: 'Soon', expired: 'Expired', searchPolicies: 'Search', filterByStatus: 'Filter', noPoliciesFound: 'None', adjustFilters: 'Adjust', uploadFirstPolicy: 'Upload', showingPolicies: 'Showing' },
    a11y: { skipToContent: 'Skip', nowViewing: 'Now', menuExpanded: 'Expanded', menuCollapsed: 'Collapsed', selected: 'Selected', notSelected: 'Not', policyStats: 'Stats' },
    auth: { signIn: 'Sign In', signUp: 'Sign Up', signOut: 'Out', email: 'Email', password: 'Password', confirmPassword: 'Confirm', fullName: 'Name', forgotPassword: 'Forgot', resetPassword: 'Reset', noAccount: 'No', hasAccount: 'Has', createAccount: 'Create', orContinueWith: 'Or', google: 'Google', github: 'GitHub', passwordMismatch: 'Mismatch', invalidEmail: 'Invalid', passwordTooShort: 'Short', signInError: 'Error', signUpError: 'Error', signUpSuccess: 'Success', checkEmail: 'Check', welcomeBack: 'Welcome', createYourAccount: 'Create' },
  }

  const mockTrTranslations: TranslationDictionary = {
    ...mockEnTranslations,
    nav: { ...mockEnTranslations.nav, home: 'Ana Sayfa', dashboard: 'Panel' },
    common: { ...mockEnTranslations.common, loading: 'Yükleniyor...' },
  }

  const mockCommonLocales = {
    en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
    tr: { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  }

  return {
    mockEnTranslations,
    mockTrTranslations,
    mockCommonLocales,
    mockGetBestLocale: vi.fn(),
    mockSetStoredLocale: vi.fn(),
    mockClearCachedTranslations: vi.fn(),
    mockGetTranslations: vi.fn(),
    mockGetLocaleInfo: vi.fn(),
    mockIsRTLLocale: vi.fn(),
    mockFetchAvailableLocales: vi.fn(),
    mockInvalidateLocalesCache: vi.fn(),
  }
})

vi.mock('./translations', () => ({
  EN_TRANSLATIONS: mockEnTranslations,
  COMMON_LOCALES: mockCommonLocales,
}))

vi.mock('./translation-cache', () => ({
  getBestLocale: mockGetBestLocale,
  setStoredLocale: mockSetStoredLocale,
  clearCachedTranslations: mockClearCachedTranslations,
}))

vi.mock('./translation-service', () => ({
  getTranslations: mockGetTranslations,
  getLocaleInfo: mockGetLocaleInfo,
  isRTLLocale: mockIsRTLLocale,
  fetchAvailableLocales: mockFetchAvailableLocales,
  invalidateLocalesCache: mockInvalidateLocalesCache,
}))

import { I18nProvider, useI18n, useTranslation, useLanguageSelector } from './i18n-context'

describe('i18n-context coverage', () => {
  let originalDir: string
  let originalLang: string

  beforeEach(() => {
    vi.clearAllMocks()
    originalDir = document.documentElement.dir
    originalLang = document.documentElement.lang

    mockGetBestLocale.mockReturnValue('en')
    mockGetTranslations.mockResolvedValue(mockEnTranslations)
    mockGetLocaleInfo.mockReturnValue({
      code: 'en',
      name: 'English',
      nativeName: 'English',
      flag: '🇬🇧',
      rtl: false,
      isPreloaded: true,
      isCached: false,
    })
    mockIsRTLLocale.mockReturnValue(false)
    mockFetchAvailableLocales.mockResolvedValue({ locales: [], version: '0' })
  })

  afterEach(() => {
    document.documentElement.dir = originalDir
    document.documentElement.lang = originalLang
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider>{children}</I18nProvider>
  )

  describe('loadAvailableLocales', () => {
    it('sets dynamicLocales from API when locales returned', async () => {
      mockFetchAvailableLocales.mockResolvedValue({
        locales: [
          { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isRtl: false, isActive: true, isDefault: true, displayOrder: 1 },
          { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', isRtl: false, isActive: true, isDefault: false, displayOrder: 2 },
          { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', isRtl: false, isActive: true, isDefault: false, displayOrder: 3 },
        ],
        version: '1',
      })

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.dynamicLocales.length).toBe(3)
        const deCodes = result.current.dynamicLocales.map(l => l.code)
        expect(deCodes).toContain('de')
      })
    })

    it('falls back to EN/TR when API returns empty locales', async () => {
      mockFetchAvailableLocales.mockResolvedValue({ locales: [], version: '0' })

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.dynamicLocales.length).toBe(2)
        const codes = result.current.dynamicLocales.map(l => l.code)
        expect(codes).toContain('en')
        expect(codes).toContain('tr')
      })
    })

    it('falls back to EN/TR when API throws error', async () => {
      mockFetchAvailableLocales.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.dynamicLocales.length).toBe(2)
      })
    })

    it('marks correct locale as active in dynamic locales', async () => {
      mockFetchAvailableLocales.mockResolvedValue({
        locales: [
          { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isRtl: false, isActive: true, isDefault: true, displayOrder: 1 },
          { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', isRtl: false, isActive: true, isDefault: false, displayOrder: 2 },
        ],
        version: '1',
      })

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        const en = result.current.dynamicLocales.find(l => l.code === 'en')
        const tr = result.current.dynamicLocales.find(l => l.code === 'tr')
        expect(en?.isActive).toBe(true)
        expect(tr?.isActive).toBe(false)
      })
    })
  })

  describe('refreshTranslations', () => {
    it('clears cache and reloads translations and locales', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.refreshTranslations()
      })

      expect(mockClearCachedTranslations).toHaveBeenCalledWith('en')
      expect(mockInvalidateLocalesCache).toHaveBeenCalled()
      // loadTranslations called again
      expect(mockGetTranslations.mock.calls.length).toBeGreaterThanOrEqual(2)
      // loadAvailableLocales called again
      expect(mockFetchAvailableLocales.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('translate edge cases', () => {
    it('returns fallback when value is an object (non-string leaf)', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // 'nav' resolves to an object, not a string
      expect(result.current.translate('nav', 'Fallback')).toBe('Fallback')
    })

    it('returns key when value is non-string and no fallback', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // 'nav' resolves to an object
      expect(result.current.translate('nav')).toBe('nav')
    })

    it('handles single-segment key that maps to a string', async () => {
      // Edge case: if the top-level had a string value
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // No top-level string key exists, so fallback
      expect(result.current.translate('nonexistent')).toBe('nonexistent')
    })

    it('handles three-level deep key that does not exist', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.translate('nav.home.deep', 'Nope')).toBe('Nope')
    })
  })

  describe('useLanguageSelector with dynamic locales', () => {
    it('uses dynamic locales when available', async () => {
      mockFetchAvailableLocales.mockResolvedValue({
        locales: [
          { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isRtl: false, isActive: true, isDefault: true, displayOrder: 1 },
          { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', isRtl: false, isActive: true, isDefault: false, displayOrder: 2 },
        ],
        version: '1',
      })

      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        expect(result.current.locales.length).toBe(2)
        // isActive should be re-computed based on current locale
        const en = result.current.locales.find(l => l.code === 'en')
        expect(en?.isActive).toBe(true)
      })
    })

    it('falls back to COMMON_LOCALES when no dynamic locales', async () => {
      // dynamicLocales is empty (default)
      mockFetchAvailableLocales.mockResolvedValue({ locales: [], version: '0' })

      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        // Note: when dynamicLocales has the EN/TR fallback, length is 2
        expect(result.current.locales.length).toBeGreaterThanOrEqual(2)
        const en = result.current.locales.find(l => l.code === 'en')
        expect(en).toBeDefined()
      })
    })

    it('provides setLocale and progress', async () => {
      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        expect(typeof result.current.setLocale).toBe('function')
        expect(result.current.progress).toBeDefined()
        expect(result.current.isLoading).toBeDefined()
      })
    })
  })

  describe('useTranslation convenience hook', () => {
    it('returns t, translate, locale, isLoading', async () => {
      const { result } = renderHook(() => useTranslation(), { wrapper })

      await waitFor(() => {
        expect(result.current.t).toBeDefined()
        expect(typeof result.current.translate).toBe('function')
        expect(result.current.locale).toBe('en')
        expect(typeof result.current.isLoading).toBe('boolean')
      })
    })
  })

  describe('setLocale normalization', () => {
    it('normalizes locale with region code', async () => {
      mockGetTranslations.mockResolvedValue(mockTrTranslations)

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.setLocale('TR-TR')
      })

      expect(result.current.locale).toBe('tr')
      expect(mockSetStoredLocale).toHaveBeenCalledWith('tr')
    })

    it('skips setLocale when normalized locale matches current', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const callsBefore = mockGetTranslations.mock.calls.length

      await act(async () => {
        await result.current.setLocale('EN-US')
      })

      // Should not call getTranslations again since 'en' === 'en'
      expect(mockGetTranslations.mock.calls.length).toBe(callsBefore)
    })
  })

  describe('RTL document direction', () => {
    it('sets rtl direction for RTL locale', async () => {
      mockGetBestLocale.mockReturnValue('ar')
      mockIsRTLLocale.mockReturnValue(true)
      mockGetLocaleInfo.mockReturnValue({
        code: 'ar',
        name: 'Arabic',
        nativeName: 'العربية',
        flag: '🇸🇦',
        rtl: true,
        isPreloaded: false,
        isCached: false,
      })

      render(
        <I18nProvider>
          <div>Content</div>
        </I18nProvider>
      )

      await waitFor(() => {
        expect(document.documentElement.dir).toBe('rtl')
        expect(document.documentElement.lang).toBe('ar')
      })
    })
  })

  describe('error handling in loadTranslations', () => {
    it('falls back to EN_TRANSLATIONS on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockGetTranslations.mockRejectedValue(new Error('Network fail'))

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.t.nav.home).toBe('Home')
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('dynamic locale with RTL flag', () => {
    it('includes isRtl from API locales', async () => {
      mockFetchAvailableLocales.mockResolvedValue({
        locales: [
          { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', isRtl: true, isActive: true, isDefault: false, displayOrder: 3 },
        ],
        version: '1',
      })

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        const ar = result.current.dynamicLocales.find(l => l.code === 'ar')
        expect(ar?.isRtl).toBe(true)
      })
    })
  })
})
