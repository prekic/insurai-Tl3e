import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserPreferencesPanel } from '../UserPreferencesPanel'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations'

// Mock i18n context
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
}))

// Mock useUserPreferences hook
const mockUpdatePreference = vi.fn()
const mockSavePreferences = vi.fn()
const mockResetCategory = vi.fn()
const mockResetPreference = vi.fn()

const defaultHookReturn = {
  preferences: {
    ui: {},
    email: {},
  },
  isLoading: false,
  isSaving: false,
  error: null,
  successMessage: null,
  isAuthenticated: true,
  updatePreference: mockUpdatePreference,
  savePreferences: mockSavePreferences,
  resetCategory: mockResetCategory,
  resetPreference: mockResetPreference,
  isModified: () => false,
  getAdminDefault: (category: string, key: string) => {
    const defaults: Record<string, Record<string, unknown>> = {
      ui: { default_items_per_page: 10, toast_success_duration_ms: 3000 },
      email: { default_marketing_enabled: true },
    }
    return defaults[category]?.[key]
  },
  getFieldMeta: (category: string) => {
    if (category === 'ui') {
      return [
        { key: 'default_items_per_page', label: 'Items per page', labelTr: 'Sayfa basina', description: 'Number of items per page', descriptionTr: 'Sayfa basina oge', type: 'number' as const, min: 5, max: 50 },
        { key: 'toast_success_duration_ms', label: 'Success notification duration', labelTr: 'Basari', description: 'How long success messages shown', descriptionTr: 'Basari suresi', type: 'number' as const, min: 1000, max: 10000 },
      ]
    }
    if (category === 'email') {
      return [
        { key: 'default_marketing_enabled', label: 'Marketing emails', labelTr: 'Pazarlama', description: 'Receive product updates', descriptionTr: 'Urun guncellemeleri', type: 'boolean' as const },
      ]
    }
    return []
  },
  refresh: vi.fn(),
}

let hookReturn = { ...defaultHookReturn }

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => hookReturn,
}))

describe('UserPreferencesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookReturn = { ...defaultHookReturn }
  })

  it('should show sign-in message when not authenticated', () => {
    hookReturn = { ...defaultHookReturn, isAuthenticated: false }
    render(<UserPreferencesPanel />)

    expect(screen.getByText(EN_TRANSLATIONS.preferences.signInRequired)).toBeInTheDocument()
  })

  it('should show loading skeleton when loading', () => {
    hookReturn = { ...defaultHookReturn, isLoading: true }
    render(<UserPreferencesPanel />)

    // Should have animated skeleton elements
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('should render category sections', async () => {
    render(<UserPreferencesPanel />)

    expect(screen.getByText('Display Preferences')).toBeInTheDocument()
    expect(screen.getByText('Email Preferences')).toBeInTheDocument()
  })

  it('should render preference fields for expanded category', async () => {
    render(<UserPreferencesPanel />)

    // UI category is expanded by default
    expect(screen.getByText('Items per page')).toBeInTheDocument()
    expect(screen.getByText('Success notification duration')).toBeInTheDocument()
  })

  it('should expand/collapse categories on click', async () => {
    const user = userEvent.setup()
    render(<UserPreferencesPanel />)

    // Click Email Preferences to expand it
    await user.click(screen.getByText('Email Preferences'))

    // Email field should now be visible
    expect(screen.getByText('Marketing emails')).toBeInTheDocument()
  })

  it('should show Save Preferences button', () => {
    render(<UserPreferencesPanel />)
    expect(screen.getByText(EN_TRANSLATIONS.common.save)).toBeInTheDocument()
  })

  it('should show error message', () => {
    hookReturn = { ...defaultHookReturn, error: 'Failed to save preferences' }
    render(<UserPreferencesPanel />)

    expect(screen.getByText('Failed to save preferences')).toBeInTheDocument()
  })

  it('should show success message', () => {
    hookReturn = { ...defaultHookReturn, successMessage: 'Preferences saved successfully' }
    render(<UserPreferencesPanel />)

    expect(screen.getByText('Preferences saved successfully')).toBeInTheDocument()
  })

  it('should show customized badge when preference is modified', () => {
    hookReturn = {
      ...defaultHookReturn,
      preferences: { ui: { default_items_per_page: 25 }, email: {} },
      isModified: (cat: string, key: string) => cat === 'ui' && key === 'default_items_per_page',
    }

    render(<UserPreferencesPanel />)

    // Should show "1 customized" on the category header
    expect(screen.getByText(`1 ${EN_TRANSLATIONS.preferences.modified}`)).toBeInTheDocument()
    // Should show "modified" badge on the field
    expect(screen.getByText(EN_TRANSLATIONS.preferences.modified)).toBeInTheDocument()
  })

  it('should show default value when preference is modified', () => {
    hookReturn = {
      ...defaultHookReturn,
      preferences: { ui: { default_items_per_page: 25 }, email: {} },
      isModified: (cat: string, key: string) => cat === 'ui' && key === 'default_items_per_page',
    }

    render(<UserPreferencesPanel />)

    expect(screen.getByText(`${EN_TRANSLATIONS.preferences.defaultLabel}: 10`)).toBeInTheDocument()
  })

  it('should render boolean toggle for boolean fields', async () => {
    const user = userEvent.setup()
    render(<UserPreferencesPanel />)

    // Expand email section
    await user.click(screen.getByText('Email Preferences'))

    // Find the switch role
    const toggle = screen.getByRole('switch')
    expect(toggle).toBeInTheDocument()
  })

  it('should show reset button when category has modifications', () => {
    hookReturn = {
      ...defaultHookReturn,
      preferences: { ui: { default_items_per_page: 25 }, email: {} },
      isModified: (cat: string, key: string) => cat === 'ui' && key === 'default_items_per_page',
    }

    render(<UserPreferencesPanel />)

    expect(screen.getByText(EN_TRANSLATIONS.preferences.resetAll)).toBeInTheDocument()
  })

  it('should call savePreferences when save button is clicked', async () => {
    const user = userEvent.setup()
    hookReturn = {
      ...defaultHookReturn,
      preferences: { ui: { default_items_per_page: 25 }, email: {} },
      isModified: () => true,
    }

    render(<UserPreferencesPanel />)

    await user.click(screen.getByText(EN_TRANSLATIONS.common.save))
    expect(mockSavePreferences).toHaveBeenCalled()
  })

  it('should disable save button when saving', () => {
    hookReturn = {
      ...defaultHookReturn,
      isSaving: true,
      preferences: { ui: { default_items_per_page: 25 }, email: {} },
      isModified: () => true,
    }

    render(<UserPreferencesPanel />)

    expect(screen.getByText(EN_TRANSLATIONS.preferences.saving)).toBeInTheDocument()
  })
})
