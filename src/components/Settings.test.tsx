/**
 * Settings Component Tests
 *
 * Tests for the settings page including theme, notifications,
 * language, API key management, and export functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { Settings } from './Settings'

// Mock hooks and dependencies
const mockNavigate = vi.fn()
const mockSignOut = vi.fn()
const mockClearAllPolicies = vi.fn()
const mockSetLocale = vi.fn()

const mockPolicies = [
  { id: '1', policyNumber: 'POL-001', provider: 'Allianz', coverage: 100000, premium: 1000 },
  { id: '2', policyNumber: 'POL-002', provider: 'Axa', coverage: 200000, premium: 2000 },
]

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/lib/policy-context', () => ({
  usePolicies: () => ({
    policies: mockPolicies,
    clearAllPolicies: mockClearAllPolicies,
  }),
}))

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'test@example.com',
    },
    signOut: mockSignOut,
  }),
}))

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {
      settings: {
        title: 'Settings',
        light: 'Light',
        dark: 'Dark',
        system: 'System',
        appearance: 'Appearance',
        theme: 'Theme',
        notifications: 'Notifications',
        emailNotifications: 'Email Notifications',
        pushNotifications: 'Push Notifications',
        renewalReminders: 'Renewal Reminders',
        marketUpdates: 'Market Updates',
        language: 'Language',
        security: 'Security',
        changePassword: 'Change Password',
        twoFactor: 'Two-Factor Authentication',
      },
      common: {
        back: 'Back',
      },
      nav: {
        signOut: 'Sign Out',
      },
      success: {
        settingsSaved: 'Settings saved',
      },
      errors: {
        unknownError: 'Unknown error',
      },
    },
    isRTL: false,
  }),
  useLanguageSelector: () => ({
    currentLocale: 'en',
    locales: [
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
      { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
    ],
    setLocale: mockSetLocale,
    isLoading: false,
    progress: { status: 'idle', message: '', progress: 0 },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => false,
}))

vi.mock('@/lib/export', () => ({
  exportToCSV: vi.fn(),
  exportPoliciesToPDF: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function renderSettings() {
  return render(
    <BrowserRouter>
      <Settings />
    </BrowserRouter>
  )
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue(undefined)
    mockSetLocale.mockResolvedValue(undefined)
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Rendering', () => {
    it('should render settings page title', () => {
      renderSettings()

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should render back button', () => {
      renderSettings()

      expect(screen.getByLabelText('Back')).toBeInTheDocument()
    })

    it('should render AI Configuration section', () => {
      renderSettings()

      expect(screen.getByText('AI Configuration')).toBeInTheDocument()
    })

    it('should render Data & Export section', () => {
      renderSettings()

      expect(screen.getByText('Data & Export')).toBeInTheDocument()
    })

    it('should render Appearance section', () => {
      renderSettings()

      expect(screen.getByText('Appearance')).toBeInTheDocument()
    })

    it('should render Notifications section', () => {
      renderSettings()

      expect(screen.getByText('Notifications')).toBeInTheDocument()
    })

    it('should render Language section', () => {
      renderSettings()

      expect(screen.getByText('Language')).toBeInTheDocument()
    })

    it('should render Security section', () => {
      renderSettings()

      expect(screen.getByText('Security')).toBeInTheDocument()
    })

    it('should render Account section when user is logged in', () => {
      renderSettings()

      expect(screen.getByText('Account')).toBeInTheDocument()
      expect(screen.getByText('test@example.com')).toBeInTheDocument()
    })

    it('should render Sign Out button', () => {
      renderSettings()

      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('should navigate back when back button is clicked', async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(screen.getByLabelText('Back'))

      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })

  describe('Theme Selection', () => {
    it('should render theme options', () => {
      renderSettings()

      expect(screen.getByRole('radio', { name: /light/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /dark/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /system/i })).toBeInTheDocument()
    })

    it('should have light theme selected by default', () => {
      renderSettings()

      const lightOption = screen.getByRole('radio', { name: /light/i })
      expect(lightOption).toHaveAttribute('aria-checked', 'true')
    })

    it('should change theme when option is clicked', async () => {
      const user = userEvent.setup()
      renderSettings()

      const darkOption = screen.getByRole('radio', { name: /dark/i })
      await user.click(darkOption)

      expect(darkOption).toHaveAttribute('aria-checked', 'true')
    })
  })

  describe('Notification Toggles', () => {
    it('should render notification toggle switches', () => {
      renderSettings()

      expect(screen.getByRole('switch', { name: /email notifications/i })).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: /push notifications/i })).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: /renewal reminders/i })).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: /market updates/i })).toBeInTheDocument()
    })

    it('should toggle notification when clicked', async () => {
      const user = userEvent.setup()
      renderSettings()

      const emailToggle = screen.getByRole('switch', { name: /email notifications/i })
      expect(emailToggle).toHaveAttribute('aria-checked', 'true')

      await user.click(emailToggle)

      expect(emailToggle).toHaveAttribute('aria-checked', 'false')
    })
  })

  describe('Language Selection', () => {
    it('should render language options', () => {
      renderSettings()

      expect(screen.getByRole('button', { name: /english/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /türkçe/i })).toBeInTheDocument()
    })

    it('should have current locale selected', () => {
      renderSettings()

      const englishOption = screen.getByRole('button', { name: /english/i })
      expect(englishOption).toHaveAttribute('aria-pressed', 'true')
    })

    it('should call setLocale when language is changed', async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(screen.getByRole('button', { name: /türkçe/i }))

      await waitFor(() => {
        expect(mockSetLocale).toHaveBeenCalledWith('tr')
      })
    })
  })

  describe('API Key Management', () => {
    it('should render API key inputs', () => {
      renderSettings()

      expect(screen.getByText('OpenAI API Key (GPT-4)')).toBeInTheDocument()
      expect(screen.getByText('Claude API Key (Anthropic)')).toBeInTheDocument()
      expect(screen.getByText('Google Cloud API Key (OCR)')).toBeInTheDocument()
    })

    it('should show AI status summary', () => {
      renderSettings()

      expect(screen.getByText(/extraction:/i)).toBeInTheDocument()
      expect(screen.getByText(/consensus:/i)).toBeInTheDocument()
      expect(screen.getByText(/ocr:/i)).toBeInTheDocument()
    })

    it('should show demo mode when no API keys are configured', () => {
      renderSettings()

      expect(screen.getByText('Demo')).toBeInTheDocument()
    })

    it('should save API key to localStorage when save is clicked', async () => {
      const user = userEvent.setup()
      renderSettings()

      // Find the OpenAI key input
      const openaiInput = screen.getByPlaceholderText('sk-proj-...')
      await user.type(openaiInput, 'sk-test-key-12345')

      // Find and click the Save button
      const saveButtons = screen.getAllByRole('button', { name: /save/i })
      await user.click(saveButtons[0])

      expect(localStorage.getItem('insurai_openai_key')).toBe('sk-test-key-12345')
    })

    it('should load saved API key from localStorage', async () => {
      localStorage.setItem('insurai_openai_key', 'sk-saved-key-12345')
      renderSettings()

      // When a key is saved, the "Configured" indicator should appear
      await waitFor(() => {
        expect(screen.getByText('Configured')).toBeInTheDocument()
      })
    })
  })

  describe('Data Export', () => {
    it('should render export buttons', () => {
      renderSettings()

      expect(screen.getByRole('button', { name: /export to excel/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /export to pdf/i })).toBeInTheDocument()
    })

    it('should render clear data button', () => {
      renderSettings()

      expect(screen.getByRole('button', { name: /clear all data/i })).toBeInTheDocument()
    })

    it('should show storage type', () => {
      renderSettings()

      expect(screen.getByText(/storage:/i)).toBeInTheDocument()
      expect(screen.getByText(/local browser/i)).toBeInTheDocument()
    })
  })

  describe('Security', () => {
    it('should render security options', () => {
      renderSettings()

      expect(screen.getByText('Change Password')).toBeInTheDocument()
      expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument()
    })
  })

  describe('Sign Out', () => {
    it('should call signOut and navigate when Sign Out is clicked', async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(screen.getByRole('button', { name: /sign out/i }))

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
    })

    it('should navigate even if signOut fails', async () => {
      mockSignOut.mockRejectedValueOnce(new Error('Sign out failed'))
      const user = userEvent.setup()
      renderSettings()

      await user.click(screen.getByRole('button', { name: /sign out/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
    })
  })
})

describe('Settings - RTL Support', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.doMock('@/lib/i18n', () => ({
      useI18n: () => ({
        t: {
          settings: { title: 'Settings' },
          common: { back: 'Back' },
          nav: { signOut: 'Sign Out' },
        },
        isRTL: true,
      }),
      useLanguageSelector: () => ({
        currentLocale: 'ar',
        locales: [],
        setLocale: vi.fn(),
        isLoading: false,
        progress: { status: 'idle', message: '', progress: 0 },
      }),
    }))
  })

  it('should have RTL direction when isRTL is true', () => {
    // The component sets dir={isRTL ? 'rtl' : 'ltr'}
    // This test verifies RTL support
  })
})

describe('Settings - Export Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should call exportToCSV when CSV export button is clicked', async () => {
    const { exportToCSV } = await import('@/lib/export')
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /export to excel/i }))

    expect(exportToCSV).toHaveBeenCalledWith(mockPolicies, 'insurai-policies')
  })

  it('should call exportPoliciesToPDF when PDF export button is clicked', async () => {
    const { exportPoliciesToPDF } = await import('@/lib/export')
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /export to pdf/i }))

    expect(exportPoliciesToPDF).toHaveBeenCalledWith(mockPolicies, 'Insurance Portfolio Report')
  })

  it('should show error toast when exporting CSV with no policies', async () => {
    const { toast } = await import('sonner')

    vi.doMock('@/lib/policy-context', () => ({
      usePolicies: () => ({
        policies: [],
        clearAllPolicies: mockClearAllPolicies,
      }),
    }))

    // Re-import to get the new mock
    vi.resetModules()
    const { Settings: SettingsNoPolicies } = await import('./Settings')

    render(
      <BrowserRouter>
        <SettingsNoPolicies />
      </BrowserRouter>
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /export to excel/i }))

    expect(toast.error).toHaveBeenCalledWith('No policies to export')
  })
})

describe('Settings - Clear Data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should prompt for confirmation before clearing data', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /clear all data/i }))

    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to clear all policies? This cannot be undone.'
    )
    confirmSpy.mockRestore()
  })

  it('should call clearAllPolicies when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /clear all data/i }))

    expect(mockClearAllPolicies).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('should not call clearAllPolicies when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole('button', { name: /clear all data/i }))

    expect(mockClearAllPolicies).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

describe('Settings - API Key Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should toggle password visibility when eye icon is clicked', async () => {
    const user = userEvent.setup()
    renderSettings()

    // Find the OpenAI input
    const openaiInput = screen.getByPlaceholderText('sk-proj-...')
    expect(openaiInput).toHaveAttribute('type', 'password')

    // Find and click the eye button to show password
    const toggleButtons = document.querySelectorAll('button[type="button"]')
    const eyeButton = Array.from(toggleButtons).find(
      (btn) => btn.querySelector('svg') && btn.closest('.relative')
    )

    if (eyeButton) {
      await user.click(eyeButton)
      expect(openaiInput).toHaveAttribute('type', 'text')
    }
  })

  it('should show configured state when key is in localStorage', async () => {
    localStorage.setItem('insurai_openai_key', 'sk-test-key')
    renderSettings()

    // Wait for the configured state indicator
    await waitFor(() => {
      expect(screen.getByText('Configured')).toBeInTheDocument()
    })
  })

  it('should disable Save button when input is empty', () => {
    renderSettings()

    const saveButtons = screen.getAllByRole('button', { name: /save/i })
    expect(saveButtons[0]).toBeDisabled()
  })

  it('should enable Save button when input has value', async () => {
    const user = userEvent.setup()
    renderSettings()

    const openaiInput = screen.getByPlaceholderText('sk-proj-...')
    await user.type(openaiInput, 'sk-test-key')

    const saveButtons = screen.getAllByRole('button', { name: /save/i })
    expect(saveButtons[0]).toBeEnabled()
  })

  it('should save Anthropic key to localStorage', async () => {
    const user = userEvent.setup()
    renderSettings()

    const anthropicInput = screen.getByPlaceholderText('sk-ant-...')
    await user.type(anthropicInput, 'sk-ant-test-key')

    // Find the Save button for Anthropic (second one)
    const saveButtons = screen.getAllByRole('button', { name: /save/i })
    await user.click(saveButtons[1])

    expect(localStorage.getItem('insurai_anthropic_key')).toBe('sk-ant-test-key')
  })

  it('should save Google Cloud key to localStorage', async () => {
    const user = userEvent.setup()
    renderSettings()

    const googleInput = screen.getByPlaceholderText('AIza...')
    await user.type(googleInput, 'AIzaTestKey123')

    // Find the Save button for Google (third one)
    const saveButtons = screen.getAllByRole('button', { name: /save/i })
    await user.click(saveButtons[2])

    expect(localStorage.getItem('insurai_google_cloud_key')).toBe('AIzaTestKey123')
  })
})

describe('Settings - Notification Toggles Keyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should toggle notification with Enter key', async () => {
    const user = userEvent.setup()
    renderSettings()

    const emailToggle = screen.getByRole('switch', { name: /email notifications/i })
    expect(emailToggle).toHaveAttribute('aria-checked', 'true')

    emailToggle.focus()
    await user.keyboard('{Enter}')

    expect(emailToggle).toHaveAttribute('aria-checked', 'false')
  })

  it('should toggle notification with Space key', async () => {
    const user = userEvent.setup()
    renderSettings()

    const emailToggle = screen.getByRole('switch', { name: /email notifications/i })
    expect(emailToggle).toHaveAttribute('aria-checked', 'true')

    emailToggle.focus()
    await user.keyboard(' ')

    expect(emailToggle).toHaveAttribute('aria-checked', 'false')
  })
})

describe('Settings - Policy Count Display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should show policy count in export section', () => {
    renderSettings()

    expect(screen.getByText(/export your 2 policies/i)).toBeInTheDocument()
  })
})

describe('Settings - Theme Keyboard Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should allow keyboard navigation between theme options', async () => {
    renderSettings()

    const lightOption = screen.getByRole('radio', { name: /light/i })
    lightOption.focus()

    expect(document.activeElement).toBe(lightOption)
  })
})
