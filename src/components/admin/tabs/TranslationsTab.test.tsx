/**
 * TranslationsTab Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TranslationsTab } from './TranslationsTab'

// Mock adminFetch
const mockAdminFetch = vi.fn()
vi.mock('@/lib/admin/api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}))

// Mock UI components that might cause issues
vi.mock('@/components/ui/loading', () => ({
  SettingsSkeleton: () => <div data-testid="loading-skeleton">Loading...</div>,
}))

const MOCK_LOCALES = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    isRtl: false,
    isActive: true,
    isDefault: true,
    displayOrder: 0,
  },
  {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    flag: '🇹🇷',
    isRtl: false,
    isActive: true,
    isDefault: false,
    displayOrder: 1,
  },
]

const MOCK_TRANSLATIONS = {
  common: {
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
  },
  nav: {
    home: 'Home',
    dashboard: 'Dashboard',
  },
}

const MOCK_COVERAGE = {
  totalKeys: 10,
  translatedKeys: 8,
  percentage: 80,
  sections: {
    common: { total: 5, translated: 4, percentage: 80 },
    nav: { total: 5, translated: 4, percentage: 80 },
  },
}

function setupFetchMocks() {
  mockAdminFetch.mockImplementation((url: string) => {
    // More specific patterns first to avoid false matches
    if (url.match(/\/coverage$/)) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, coverage: MOCK_COVERAGE }),
      })
    }
    if (url.includes('/cache/invalidate')) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true }),
      })
    }
    if (url.includes('/ai-translate')) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, message: 'AI translation completed', stats: { total: 5, translated: 5, failed: 0, skipped: 0 } }),
      })
    }
    if (url.match(/\/admin\/[a-z]{2,3}\/[a-z]+\/[a-z]+$/) && !url.includes('/coverage') && !url.includes('/export') && !url.includes('/import')) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true }),
      })
    }
    if (url.match(/\/admin\/[a-z]{2,3}\/export$/)) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, translations: MOCK_TRANSLATIONS }),
      })
    }
    if (url.includes('/admin/locales')) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true }),
      })
    }
    if (url.includes('/api/translations/locales')) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, locales: MOCK_LOCALES }),
      })
    }
    // Generic locale fetch (e.g., /api/translations/en) — must be after all /admin/ checks
    if (url.match(/\/api\/translations\/[a-z]{2,3}$/)) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, translations: MOCK_TRANSLATIONS }),
      })
    }
    return Promise.resolve({
      json: () => Promise.resolve({ success: false, error: 'Unknown endpoint' }),
    })
  })
}

describe('TranslationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFetchMocks()
  })

  it('should render the header', async () => {
    render(<TranslationsTab />)
    expect(screen.getByText('Translation Management')).toBeInTheDocument()
  })

  it('should load and display locales', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('English')).toBeInTheDocument()
      expect(screen.getByText('Türkçe')).toBeInTheDocument()
    })
  })

  it('should show language flags', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('🇬🇧')).toBeInTheDocument()
      expect(screen.getByText('🇹🇷')).toBeInTheDocument()
    })
  })

  it('should show default badge on default locale', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('default')).toBeInTheDocument()
    })
  })

  it('should auto-select default locale and load translations', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      // Should have fetched translations for the default locale
      expect(mockAdminFetch).toHaveBeenCalledWith('/api/translations/en')
    })
  })

  it('should display coverage stats', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
      expect(screen.getByText('8 / 10 keys')).toBeInTheDocument()
    })
  })

  it('should show translation sections', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      // Sections appear as buttons with section name and key count badge
      expect(screen.getByText('3 keys')).toBeInTheDocument()
      expect(screen.getByText('2 keys')).toBeInTheDocument()
    })
  })

  it('should show total key count', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('5 total keys')).toBeInTheDocument()
    })
  })

  it('should expand section to show keys', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      // Wait for sections to render (3 keys = common section)
      expect(screen.getByText('3 keys')).toBeInTheDocument()
    })

    // Click to expand the common section (find button with "3 keys" badge)
    const commonSection = screen.getByText('3 keys').closest('button')
    if (commonSection) {
      fireEvent.click(commonSection)
    }

    await waitFor(() => {
      // Should now see individual keys
      expect(screen.getByText('loading')).toBeInTheDocument()
    })
  })

  it('should filter translations by search query', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search keys, values, or sections...')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search keys, values, or sections...')
    fireEvent.change(searchInput, { target: { value: 'home' } })

    await waitFor(() => {
      // Should show only nav section (has 'home' key)
      expect(screen.getByText('1 matching')).toBeInTheDocument()
    })
  })

  it('should show Add Language button', () => {
    render(<TranslationsTab />)
    expect(screen.getByText('Add Language')).toBeInTheDocument()
  })

  it('should open new locale dialog', async () => {
    render(<TranslationsTab />)

    fireEvent.click(screen.getByText('Add Language'))

    await waitFor(() => {
      expect(screen.getByText('Add New Language')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('e.g., de, fr, es')).toBeInTheDocument()
    })
  })

  it('should have export and import buttons', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Export')).toBeInTheDocument()
      expect(screen.getByText('Import')).toBeInTheDocument()
    })
  })

  it('should have clear cache button', () => {
    render(<TranslationsTab />)
    expect(screen.getByText('Clear Cache')).toBeInTheDocument()
  })

  it('should switch locale on click', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Türkçe')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Türkçe'))

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith('/api/translations/tr')
    })
  })

  it('should handle API error gracefully', async () => {
    mockAdminFetch.mockRejectedValueOnce(new Error('Network error'))

    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('should show expand/collapse all buttons', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Expand All')).toBeInTheDocument()
      expect(screen.getByText('Collapse All')).toBeInTheDocument()
    })
  })

  it('should show empty state when no matching translations', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search keys, values, or sections...')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search keys, values, or sections...')
    fireEvent.change(searchInput, { target: { value: 'zzznonexistent' } })

    await waitFor(() => {
      expect(screen.getByText('No translations match your search')).toBeInTheDocument()
    })
  })

  it('should invalidate cache on button click', async () => {
    render(<TranslationsTab />)

    fireEvent.click(screen.getByText('Clear Cache'))

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith('/api/translations/admin/cache/invalidate', {
        method: 'POST',
      })
    })
  })
})

describe('TranslationsTab - New Locale Form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFetchMocks()
  })

  it('should validate required fields in new locale form', async () => {
    render(<TranslationsTab />)

    fireEvent.click(screen.getByText('Add Language'))

    await waitFor(() => {
      // Create button should be disabled without code and name
      const createBtn = screen.getByText('Create Language')
      expect(createBtn.closest('button')).toBeDisabled()
    })
  })

  it('should enable create button when form is filled', async () => {
    render(<TranslationsTab />)

    fireEvent.click(screen.getByText('Add Language'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g., de, fr, es')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('e.g., de, fr, es'), {
      target: { value: 'de' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g., German, French'), {
      target: { value: 'German' },
    })

    await waitFor(() => {
      const createBtn = screen.getByText('Create Language')
      expect(createBtn.closest('button')).not.toBeDisabled()
    })
  })

  it('should close dialog on cancel', async () => {
    render(<TranslationsTab />)

    fireEvent.click(screen.getByText('Add Language'))

    await waitFor(() => {
      expect(screen.getByText('Add New Language')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Add New Language')).not.toBeInTheDocument()
    })
  })
})

describe('TranslationsTab - Inline Editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFetchMocks()
  })

  it('should start editing on click', async () => {
    render(<TranslationsTab />)

    // Wait for sections to render
    await waitFor(() => {
      expect(screen.getByText('3 keys')).toBeInTheDocument()
    })

    // Expand common section
    const commonSection = screen.getByText('3 keys').closest('button')
    if (commonSection) {
      fireEvent.click(commonSection)
    }

    await waitFor(() => {
      // Key names should be visible
      expect(screen.getByText('save')).toBeInTheDocument()
    })

    // Click on the "Save" value text to edit
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('Save')
      expect(input).toBeInTheDocument()
    })
  })

  it('should save edit on Enter key', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('3 keys')).toBeInTheDocument()
    })

    // Expand common section
    const commonSection = screen.getByText('3 keys').closest('button')
    if (commonSection) {
      fireEvent.click(commonSection)
    }

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    // Click value to start editing
    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      const input = screen.getByDisplayValue('Cancel')
      fireEvent.change(input, { target: { value: 'Cancel modified' } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/translations\/admin\/en\/common\/cancel$/),
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })
})

describe('TranslationsTab - AI Translation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFetchMocks()
  })

  it('should show AI Translate button', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('AI Translate')).toBeInTheDocument()
    })
  })

  it('should disable AI Translate button when English is selected (source language)', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      // Default locale is 'en' which is the source language
      const aiBtn = screen.getByText('AI Translate').closest('button')
      expect(aiBtn).toBeDisabled()
    })
  })

  it('should enable AI Translate button for non-English locales', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Türkçe')).toBeInTheDocument()
    })

    // Switch to Turkish
    fireEvent.click(screen.getByText('Türkçe'))

    await waitFor(() => {
      const aiBtn = screen.getByText('AI Translate').closest('button')
      expect(aiBtn).not.toBeDisabled()
    })
  })

  it('should call AI translate endpoint on click', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Türkçe')).toBeInTheDocument()
    })

    // Switch to Turkish
    fireEvent.click(screen.getByText('Türkçe'))

    await waitFor(() => {
      expect(screen.getByText('AI Translate')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('AI Translate'))

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        '/api/translations/admin/tr/ai-translate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sourceLocale: 'en' }),
        }),
      )
    })
  })

  it('should show translation results after AI translate', async () => {
    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Türkçe')).toBeInTheDocument()
    })

    // Switch to Turkish
    fireEvent.click(screen.getByText('Türkçe'))

    await waitFor(() => {
      const aiBtn = screen.getByText('AI Translate').closest('button')
      expect(aiBtn).not.toBeDisabled()
    })

    fireEvent.click(screen.getByText('AI Translate'))

    await waitFor(() => {
      expect(screen.getByText('5 translated')).toBeInTheDocument()
      expect(screen.getByText('AI Translation Results:')).toBeInTheDocument()
    })
  })

  it('should show Translating... text while AI translating', async () => {
    // Make the AI translate call hang
    mockAdminFetch.mockImplementation((url: string) => {
      if (url.includes('/ai-translate')) {
        return new Promise(() => {}) // Never resolves
      }
      // Fall through to default mocks
      return setupFetchMocks(), mockAdminFetch(url)
    })

    // Re-setup with hanging AI translate
    mockAdminFetch.mockImplementation((url: string) => {
      if (url.includes('/ai-translate')) {
        return new Promise(() => {}) // Never resolves
      }
      if (url.match(/\/coverage$/)) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, coverage: MOCK_COVERAGE }) })
      }
      if (url.includes('/cache/invalidate')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true }) })
      }
      if (url.match(/\/admin\/[a-z]{2,3}\/[a-z]+\/[a-z]+$/) && !url.includes('/coverage') && !url.includes('/export') && !url.includes('/import')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true }) })
      }
      if (url.match(/\/admin\/[a-z]{2,3}\/export$/)) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, translations: MOCK_TRANSLATIONS }) })
      }
      if (url.includes('/admin/locales')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true }) })
      }
      if (url.includes('/api/translations/locales')) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, locales: MOCK_LOCALES }) })
      }
      if (url.match(/\/api\/translations\/[a-z]{2,3}$/)) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, translations: MOCK_TRANSLATIONS }) })
      }
      return Promise.resolve({ json: () => Promise.resolve({ success: false }) })
    })

    render(<TranslationsTab />)

    await waitFor(() => {
      expect(screen.getByText('Türkçe')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Türkçe'))

    await waitFor(() => {
      const aiBtn = screen.getByText('AI Translate').closest('button')
      expect(aiBtn).not.toBeDisabled()
    })

    fireEvent.click(screen.getByText('AI Translate'))

    await waitFor(() => {
      expect(screen.getByText('Translating...')).toBeInTheDocument()
    })
  })
})
