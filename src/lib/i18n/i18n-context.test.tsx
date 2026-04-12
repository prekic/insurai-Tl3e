/**
 * Tests for i18n Context Provider
 * Tests the React context, hooks, and locale management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { TranslationDictionary } from './translations'

// =============================================================================
// Mock Setup - Use vi.hoisted for all mock data and functions
// =============================================================================

// Define all mock data and functions using vi.hoisted
const {
  mockEnTranslations,
  mockTrTranslations,
  mockCommonLocales,
  mockGetBestLocale,
  mockSetStoredLocale,
  mockGetTranslations,
  mockGetLocaleInfo,
  mockIsRTLLocale,
} = vi.hoisted(() => {
  // Mock translations
  const mockEnTranslations: TranslationDictionary = {
    // @ts-expect-error - mismatch due to schema update
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
      // @ts-expect-error - mismatch due to schema update
      search: 'Search',
      filter: 'Filter',
      sort: 'Sort',
      more: 'More',
      less: 'Less',
      actions: 'Actions',
    },
    // @ts-expect-error - mismatch due to schema update
    landing: {
      heroTitle: 'AI-Powered Insurance Analysis',
      heroSubtitle: 'for Turkish Market Professionals',
      heroDescription: 'Upload your policies',
      uploadCta: 'Upload your policy',
      viewDemo: 'View Demo',
      trustedBy: 'Trusted by',
      howItWorks: 'How it works',
      howItWorksSubtitle: 'Get started',
      step1Title: 'Upload policies',
      step1Description: 'Upload documents',
      step2Title: 'AI analyzes coverage',
      step2Description: 'AI analyzes',
      step3Title: 'Compare & track',
      step3Description: 'Get insights',
      benefits: 'Benefits',
      benefitsSubtitle: 'For professionals',
      faq: 'FAQ',
      faqSubtitle: 'Questions',
    },
    // @ts-expect-error - mismatch due to schema update
    policy: {
      policies: 'Policies',
      policy: 'Policy',
      policyNumber: 'Policy Number',
      provider: 'Provider',
      type: 'Type',
      coverage: 'Coverage',
      premium: 'Premium',
      deductible: 'Deductible',
      startDate: 'Start Date',
      expiryDate: 'Expiry Date',
      status: 'Status',
      active: 'Active',
      expiring: 'Expiring',
      expired: 'Expired',
      pending: 'Pending',
      uploadDate: 'Upload Date',
      totalPolicies: 'Total Policies',
      totalCoverage: 'Total Coverage',
      expiringSoon: 'Expiring Soon',
      noPoliciesFound: 'No policies found',
      uploadFirst: 'Upload first',
      adjustFilters: 'Adjust filters',
    },
    // @ts-expect-error - mismatch due to schema update
    upload: {
      title: 'Upload',
      subtitle: 'Upload documents',
      dropHere: 'Drop here',
      orClickBrowse: 'or click',
      supportedFormats: 'Formats',
      maxSize: 'Max size',
      uploading: 'Uploading',
      analyzing: 'Analyzing',
      complete: 'Complete',
      failed: 'Failed',
      retryUpload: 'Retry',
      removeFile: 'Remove',
      useSamples: 'Use samples',
      useSamplesDescription: 'Try samples',
      uploadPolicy: 'Upload Policy',
    },
    // @ts-expect-error - mismatch due to schema update
    chat: {
      title: 'Chat',
      policiesLoaded: 'loaded',
      askAboutPolicies: 'Ask about policies',
      send: 'Send',
      sending: 'Sending',
      connectionError: 'Connection error',
      retryMessage: 'Retry',
      welcomeMessage: 'Welcome',
    },
    // @ts-expect-error - mismatch due to schema update
    settings: {
      title: 'Settings',
      appearance: 'Appearance',
      theme: 'Theme',
      light: 'Light',
      dark: 'Dark',
      system: 'System',
      notifications: 'Notifications',
      emailNotifications: 'Email',
      pushNotifications: 'Push',
      renewalReminders: 'Reminders',
      marketUpdates: 'Updates',
      language: 'Language',
      selectLanguage: 'Select language',
      security: 'Security',
      changePassword: 'Change password',
      twoFactor: 'Two-factor',
      adminPanel: 'Admin',
      adminDescription: 'Admin panel',
    },
    // @ts-expect-error - mismatch due to schema update
    account: {
      title: 'Account',
      personalInfo: 'Personal Info',
      fullName: 'Full Name',
      email: 'Email',
      phone: 'Phone',
      company: 'Company',
      role: 'Role',
      memberSince: 'Member since',
      editProfile: 'Edit Profile',
    },
    // @ts-expect-error - mismatch due to schema update
    help: {
      title: 'Help',
      searchHelp: 'Search help',
      gettingStarted: 'Getting Started',
      faq: 'FAQ',
      contactSupport: 'Contact Support',
      documentation: 'Documentation',
      chatWithUs: 'Chat with us',
    },
    errors: {
      fileTooLarge: 'File too large',
      fileTypeNotSupported: 'File type not supported',
      uploadFailed: 'Upload failed',
      processingFailed: 'Processing failed',
      networkError: 'Network error',
      serverError: 'Server error',
      timeout: 'Timeout',
      analysisFailedTitle: 'Analysis failed',
      analysisFailedDescription: 'Could not analyze',
      unknownError: 'Unknown error',
      policyNotFound: 'Policy not found',
      deleteFailed: 'Delete failed',
    },
    success: {
      policyDeleted: 'Policy deleted',
      policyRestored: 'Policy restored',
      uploadComplete: 'Upload complete',
      settingsSaved: 'Settings saved',
      profileUpdated: 'Profile updated',
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Manage policies',
      totalPolicies: 'Total',
      active: 'Active',
      totalCoverage: 'Coverage',
      expiringSoon: 'Expiring',
      expired: 'Expired',
      searchPolicies: 'Search',
      filterByStatus: 'Filter',
      noPoliciesFound: 'No policies',
      adjustFilters: 'Adjust filters',
      uploadFirstPolicy: 'Upload first',
      showingPolicies: 'Showing',
    },
    a11y: {
      skipToContent: 'Skip to content',
      nowViewing: 'Now viewing',
      menuExpanded: 'Menu expanded',
      menuCollapsed: 'Menu collapsed',
      selected: 'Selected',
      notSelected: 'Not selected',
      policyStats: 'Policy stats',
    },
    // @ts-expect-error - mismatch due to schema update
    auth: {
      signIn: 'Sign In',
      signUp: 'Sign Up',
      signOut: 'Sign Out',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      fullName: 'Full Name',
      forgotPassword: 'Forgot password?',
      resetPassword: 'Reset Password',
      noAccount: 'No account?',
      hasAccount: 'Has account?',
      createAccount: 'Create Account',
      orContinueWith: 'Or continue with',
      google: 'Google',
      github: 'GitHub',
      passwordMismatch: 'Passwords do not match',
      invalidEmail: 'Invalid email',
      passwordTooShort: 'Password too short',
      signInError: 'Sign in error',
      signUpError: 'Sign up error',
      signUpSuccess: 'Sign up success',
      checkEmail: 'Check email',
      welcomeBack: 'Welcome back',
      createYourAccount: 'Create your account',
    },
  }

  const mockTrTranslations: TranslationDictionary = {
    ...mockEnTranslations,
    nav: {
      ...mockEnTranslations.nav,
      home: 'Ana Sayfa',
      dashboard: 'Panel',
      settings: 'Ayarlar',
    },
    common: {
      ...mockEnTranslations.common,
      loading: 'Yükleniyor...',
      error: 'Hata',
    },
  }

  const mockCommonLocales = {
    en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
    tr: { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    ar: { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
    de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  }

  // Mock functions
  const mockGetBestLocale = vi.fn()
  const mockSetStoredLocale = vi.fn()
  const mockGetTranslations = vi.fn()
  const mockGetLocaleInfo = vi.fn()
  const mockIsRTLLocale = vi.fn()

  return {
    mockEnTranslations,
    mockTrTranslations,
    mockCommonLocales,
    mockGetBestLocale,
    mockSetStoredLocale,
    mockGetTranslations,
    mockGetLocaleInfo,
    mockIsRTLLocale,
  }
})

// Mock translations module
vi.mock('./translations', () => ({
  EN_TRANSLATIONS: mockEnTranslations,
  COMMON_LOCALES: mockCommonLocales,
}))

// Mock translation-cache
vi.mock('./translation-cache', () => ({
  getBestLocale: mockGetBestLocale,
  setStoredLocale: mockSetStoredLocale,
}))

// Mock translation-service
vi.mock('./translation-service', () => ({
  getTranslations: mockGetTranslations,
  getLocaleInfo: mockGetLocaleInfo,
  isRTLLocale: mockIsRTLLocale,
}))

// Import after mocking
import { I18nProvider, useI18n, useTranslation, useLanguageSelector } from './i18n-context'

// =============================================================================
// Test Setup
// =============================================================================

describe('i18n Context', () => {
  // Store original document properties
  let originalDir: string
  let originalLang: string

  beforeEach(() => {
    vi.clearAllMocks()

    // Store original document properties
    originalDir = document.documentElement.dir
    originalLang = document.documentElement.lang

    // Default mock implementations
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
  })

  afterEach(() => {
    // Restore original document properties
    document.documentElement.dir = originalDir
    document.documentElement.lang = originalLang
  })

  // =============================================================================
  // I18nProvider Tests
  // =============================================================================

  describe('I18nProvider', () => {
    it('should render children', async () => {
      render(
        <I18nProvider>
          <div data-testid="child">Child content</div>
        </I18nProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('child')).toBeInTheDocument()
      })
    })

    it('should use default locale from getBestLocale', async () => {
      mockGetBestLocale.mockReturnValue('tr')
      mockGetTranslations.mockResolvedValue(mockTrTranslations)
      mockGetLocaleInfo.mockReturnValue({
        code: 'tr',
        name: 'Turkish',
        nativeName: 'Türkçe',
        flag: '🇹🇷',
        rtl: false,
        isPreloaded: true,
        isCached: false,
      })

      const TestComponent = () => {
        const { locale } = useI18n()
        return <div data-testid="locale">{locale}</div>
      }

      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('locale')).toHaveTextContent('tr')
      })
    })

    it('should use provided defaultLocale when getBestLocale is called', async () => {
      render(
        <I18nProvider defaultLocale="de">
          <div>Content</div>
        </I18nProvider>
      )

      await waitFor(() => {
        expect(mockGetBestLocale).toHaveBeenCalledWith('de')
      })
    })

    it('should load translations on mount', async () => {
      render(
        <I18nProvider>
          <div>Content</div>
        </I18nProvider>
      )

      await waitFor(() => {
        expect(mockGetTranslations).toHaveBeenCalled()
      })
    })

    it('should set document direction for LTR languages', async () => {
      mockIsRTLLocale.mockReturnValue(false)

      render(
        <I18nProvider>
          <div>Content</div>
        </I18nProvider>
      )

      await waitFor(() => {
        expect(document.documentElement.dir).toBe('ltr')
        expect(document.documentElement.lang).toBe('en')
      })
    })

    it('should set document direction for RTL languages', async () => {
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

    it('should handle translation loading error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockGetTranslations.mockRejectedValue(new Error('Translation failed'))

      const TestComponent = () => {
        const { t } = useI18n()
        return <div data-testid="loading">{t.common.loading}</div>
      }

      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      )

      await waitFor(() => {
        // Falls back to SKELETON_TRANSLATIONS (empty strings) on error
        // because the context default is SKELETON, not EN_TRANSLATIONS
        expect(screen.getByTestId('loading')).toHaveTextContent('')
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // =============================================================================
  // useI18n Hook Tests
  // =============================================================================

  describe('useI18n', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    )

    it('should provide locale', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.locale).toBe('en')
      })
    })

    it('should provide translations object', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.t).toBeDefined()
        expect(result.current.t.nav.home).toBe('Home')
      })
    })

    it('should provide translate function for nested keys', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('nav.home')).toBe('Home')
        expect(result.current.translate('common.loading')).toBe('Loading...')
      })
    })

    it('should return key when translation not found', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('nonexistent.key')).toBe('nonexistent.key')
      })
    })

    it('should return fallback when translation not found', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('nonexistent.key', 'Fallback')).toBe('Fallback')
      })
    })

    it('should handle deeply nested keys', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('nav.home')).toBe('Home')
      })
    })

    it('should provide isLoading state', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      // Initially loading
      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('should provide progress state', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.progress).toBeDefined()
        expect(result.current.progress).toHaveProperty('status')
        expect(result.current.progress).toHaveProperty('progress')
        expect(result.current.progress).toHaveProperty('message')
      })
    })

    it('should provide localeInfo', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.localeInfo).toBeDefined()
        expect(result.current.localeInfo.code).toBe('en')
      })
    })

    it('should provide isRTL', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isRTL).toBe(false)
      })
    })

    it('should provide availableLocales', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.availableLocales).toBeDefined()
        expect(result.current.availableLocales.en).toBeDefined()
        expect(result.current.availableLocales.tr).toBeDefined()
      })
    })

    it('should provide setLocale function', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(typeof result.current.setLocale).toBe('function')
      })
    })
  })

  // =============================================================================
  // setLocale Tests
  // =============================================================================

  describe('setLocale', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    )

    it('should change locale', async () => {
      mockGetTranslations.mockImplementation((locale) => {
        if (locale === 'tr') return Promise.resolve(mockTrTranslations)
        return Promise.resolve(mockEnTranslations)
      })

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.locale).toBe('en')
      })

      await act(async () => {
        await result.current.setLocale('tr')
      })

      await waitFor(() => {
        expect(result.current.locale).toBe('tr')
      })
    })

    it('should store locale preference', async () => {
      mockGetTranslations.mockResolvedValue(mockTrTranslations)

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.setLocale('tr')
      })

      expect(mockSetStoredLocale).toHaveBeenCalledWith('tr')
    })

    it('should load new translations', async () => {
      mockGetTranslations
        .mockResolvedValueOnce(mockEnTranslations)
        .mockResolvedValueOnce(mockTrTranslations)

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.t.nav.home).toBe('Home')
      })

      await act(async () => {
        await result.current.setLocale('tr')
      })

      await waitFor(() => {
        expect(result.current.t.nav.home).toBe('Ana Sayfa')
      })
    })

    it('should normalize locale codes', async () => {
      mockGetTranslations.mockResolvedValue(mockTrTranslations)

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.setLocale('TR-TR')
      })

      expect(result.current.locale).toBe('tr')
    })

    it('should not reload if same locale', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const callCount = mockGetTranslations.mock.calls.length

      await act(async () => {
        await result.current.setLocale('en')
      })

      // Should not call getTranslations again
      expect(mockGetTranslations.mock.calls.length).toBe(callCount)
    })

    it('should update document direction for RTL', async () => {
      mockIsRTLLocale.mockImplementation((locale) => locale === 'ar')
      mockGetTranslations.mockResolvedValue(mockEnTranslations)

      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.setLocale('ar')
      })

      expect(document.documentElement.dir).toBe('rtl')
      expect(document.documentElement.lang).toBe('ar')
    })
  })

  // =============================================================================
  // translate Function Tests
  // =============================================================================

  describe('translate function', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    )

    it('should translate single level keys', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // nav is a category, not a string
      expect(result.current.translate('nav')).toBe('nav')
    })

    it('should translate two level keys', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('nav.home')).toBe('Home')
        expect(result.current.translate('common.save')).toBe('Save')
      })
    })

    it('should return key for non-existent first level', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('invalid.path')).toBe('invalid.path')
      })
    })

    it('should return key for non-existent second level', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('nav.invalid')).toBe('nav.invalid')
      })
    })

    it('should return fallback for missing keys', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('missing.key', 'Default')).toBe('Default')
      })
    })

    it('should handle empty key', async () => {
      const { result } = renderHook(() => useI18n(), { wrapper })

      await waitFor(() => {
        expect(result.current.translate('')).toBe('')
      })
    })
  })

  // =============================================================================
  // useTranslation Hook Tests
  // =============================================================================

  describe('useTranslation', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    )

    it('should provide t object', async () => {
      const { result } = renderHook(() => useTranslation(), { wrapper })

      await waitFor(() => {
        expect(result.current.t).toBeDefined()
        expect(result.current.t.nav.home).toBe('Home')
      })
    })

    it('should provide translate function', async () => {
      const { result } = renderHook(() => useTranslation(), { wrapper })

      await waitFor(() => {
        expect(typeof result.current.translate).toBe('function')
        expect(result.current.translate('nav.home')).toBe('Home')
      })
    })

    it('should provide locale', async () => {
      const { result } = renderHook(() => useTranslation(), { wrapper })

      await waitFor(() => {
        expect(result.current.locale).toBe('en')
      })
    })

    it('should provide isLoading', async () => {
      const { result } = renderHook(() => useTranslation(), { wrapper })

      await waitFor(() => {
        expect(typeof result.current.isLoading).toBe('boolean')
      })
    })
  })

  // =============================================================================
  // useLanguageSelector Hook Tests
  // =============================================================================

  describe('useLanguageSelector', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    )

    it('should provide currentLocale', async () => {
      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        expect(result.current.currentLocale).toBe('en')
      })
    })

    it('should provide locales array with isActive flag', async () => {
      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        expect(Array.isArray(result.current.locales)).toBe(true)
        expect(result.current.locales.length).toBeGreaterThan(0)

        const enLocale = result.current.locales.find((l) => l.code === 'en')
        expect(enLocale).toBeDefined()
        expect(enLocale?.isActive).toBe(true)

        const trLocale = result.current.locales.find((l) => l.code === 'tr')
        expect(trLocale).toBeDefined()
        expect(trLocale?.isActive).toBe(false)
      })
    })

    it('should include locale info in each locale', async () => {
      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        const enLocale = result.current.locales.find((l) => l.code === 'en')
        expect(enLocale).toBeDefined()
        expect(enLocale?.name).toBe('English')
        expect(enLocale?.nativeName).toBe('English')
        expect(enLocale?.flag).toBe('🇬🇧')
      })
    })

    it('should provide setLocale function', async () => {
      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        expect(typeof result.current.setLocale).toBe('function')
      })
    })

    it('should provide isLoading', async () => {
      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        expect(typeof result.current.isLoading).toBe('boolean')
      })
    })

    it('should provide progress', async () => {
      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        expect(result.current.progress).toBeDefined()
        expect(result.current.progress).toHaveProperty('status')
      })
    })

    it('should update active locale after setLocale', async () => {
      mockGetTranslations.mockImplementation((locale) => {
        if (locale === 'tr') return Promise.resolve(mockTrTranslations)
        return Promise.resolve(mockEnTranslations)
      })

      const { result } = renderHook(() => useLanguageSelector(), { wrapper })

      await waitFor(() => {
        expect(result.current.currentLocale).toBe('en')
      })

      await act(async () => {
        await result.current.setLocale('tr')
      })

      await waitFor(() => {
        expect(result.current.currentLocale).toBe('tr')

        const trLocale = result.current.locales.find((l) => l.code === 'tr')
        expect(trLocale?.isActive).toBe(true)

        const enLocale = result.current.locales.find((l) => l.code === 'en')
        expect(enLocale?.isActive).toBe(false)
      })
    })
  })

  // =============================================================================
  // Default Context Tests (when used outside provider)
  // =============================================================================

  describe('Default Context', () => {
    it('should return default values when used outside provider', () => {
      // The context has default values, so it doesn't throw when used outside provider
      // This tests the default context behavior
      const { result } = renderHook(() => useI18n())

      // Default values from the context
      expect(result.current.locale).toBe('en')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isRTL).toBe(false)
      expect(typeof result.current.translate).toBe('function')
      expect(typeof result.current.setLocale).toBe('function')
    })

    it('should have default translate function that returns empty string', () => {
      const { result } = renderHook(() => useI18n())

      // Default translate function returns empty string
      expect(result.current.translate('any.key')).toBe('')
    })
  })

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe('Integration', () => {
    it('should work in a complete workflow', async () => {
      mockGetTranslations.mockImplementation(async (locale, onProgress) => {
        onProgress?.({ status: 'loading', progress: 0, message: 'Loading...' })
        await new Promise((r) => setTimeout(r, 10))
        onProgress?.({ status: 'complete', progress: 100, message: 'Done' })
        return locale === 'tr' ? mockTrTranslations : mockEnTranslations
      })

      const TestComponent = () => {
        const { locale, t, setLocale, isLoading } = useI18n()
        return (
          <div>
            <span data-testid="locale">{locale}</span>
            <span data-testid="translation">{t.nav.home}</span>
            <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
            <button onClick={() => setLocale('tr')}>Switch to TR</button>
          </div>
        )
      }

      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      )

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      expect(screen.getByTestId('locale')).toHaveTextContent('en')
      expect(screen.getByTestId('translation')).toHaveTextContent('Home')

      // Switch locale
      await act(async () => {
        screen.getByRole('button').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('locale')).toHaveTextContent('tr')
        expect(screen.getByTestId('translation')).toHaveTextContent('Ana Sayfa')
      })
    })

    it('should handle rapid locale switches', async () => {
      mockGetTranslations.mockImplementation(async (locale) => {
        await new Promise((r) => setTimeout(r, 50))
        return locale === 'tr' ? mockTrTranslations : mockEnTranslations
      })

      const { result } = renderHook(() => useI18n(), {
        wrapper: ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>,
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Rapid switches
      await act(async () => {
        result.current.setLocale('tr')
        result.current.setLocale('en')
        await result.current.setLocale('tr')
      })

      // Should settle on the last locale
      await waitFor(() => {
        expect(result.current.locale).toBe('tr')
      })
    })
  })
})
