/**
 * MyAccount Coverage Tests
 *
 * Comprehensive tests targeting uncovered branches, functions, and statements.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MyAccount } from './MyAccount'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Mock i18n - component uses useI18n (not useTranslation)
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: EN_TRANSLATIONS, locale: 'en', isRTL: false }),
}))

// Auth mock helpers
let mockUser: Record<string, unknown> | null = null
let mockAuthConfigured = true
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    isConfigured: mockAuthConfigured,
  }),
}))

// Supabase mock helpers
let mockIsSupabaseConfigured = true
let mockFetchProfileResult: Record<string, unknown> | null = null
let mockFetchStatsResult = { policiesAnalyzed: 0, comparisons: 0, savedReports: 0 }
let mockUpdateProfileFn = vi.fn()

vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured,
  credentials: null,
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured,
  fetchUserProfile: () => Promise.resolve(mockFetchProfileResult),
  updateUserProfile: (...args: unknown[]) => mockUpdateProfileFn(...args),
  fetchUserStats: () => Promise.resolve(mockFetchStatsResult),
}))

const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))
vi.mock('sonner', () => ({
  toast: mockToast,
}))

function renderMyAccount() {
  return render(
    <MemoryRouter>
      <MyAccount />
    </MemoryRouter>
  )
}

describe('MyAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = null
    mockAuthConfigured = true
    mockIsSupabaseConfigured = true
    mockFetchProfileResult = null
    mockFetchStatsResult = { policiesAnalyzed: 0, comparisons: 0, savedReports: 0 }
    mockUpdateProfileFn = vi.fn().mockResolvedValue(undefined)
    localStorage.clear()
  })

  // --- Loading state ---
  it('shows loading spinner initially', () => {
    mockUser = { id: 'u1', email: 'a@b.com', user_metadata: {}, created_at: '2025-01-01' }
    mockFetchProfileResult = null
    const { container } = renderMyAccount()
    // The loading spinner should be present
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  // --- Guest user (no auth) ---
  describe('guest user (no Supabase)', () => {
    beforeEach(() => {
      mockUser = null
      mockAuthConfigured = false
      mockIsSupabaseConfigured = false
    })

    it('renders account page for guest user', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.title)).toBeInTheDocument()
      })
    })

    it('shows "Local only" badge for guest user', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.localOnly)).toBeInTheDocument()
      })
    })

    it('shows sign-in button for guest user', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.signIn)).toBeInTheDocument()
      })
    })

    it('navigates to sign-in when sign-in button is clicked', async () => {
      renderMyAccount()
      await waitFor(() => {
        const btn = screen.getByText(EN_TRANSLATIONS.account.signIn)
        fireEvent.click(btn)
        expect(mockNavigate).toHaveBeenCalledWith('/auth/sign-in')
      })
    })

    it('loads profile from localStorage for guest', async () => {
      const savedProfile = {
        name: 'Guest User',
        email: 'guest@test.com',
        phone: '555-1234',
        location: 'Istanbul',
        company: 'TestCo',
      }
      localStorage.setItem('insurai_user_profile', JSON.stringify(savedProfile))

      renderMyAccount()
      await waitFor(() => {
        // Name appears in header h2 and in profile details field
        const names = screen.getAllByText('Guest User')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('handles invalid localStorage JSON gracefully', async () => {
      localStorage.setItem('insurai_user_profile', 'invalid-json')
      renderMyAccount()
      await waitFor(() => {
        // Should still render without crashing
        expect(screen.getByText(EN_TRANSLATIONS.account.title)).toBeInTheDocument()
      })
    })

    it('shows localStorage storage info', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.localStorage)).toBeInTheDocument()
      })
    })
  })

  // --- Authenticated user with profile ---
  describe('authenticated user with profile', () => {
    beforeEach(() => {
      mockUser = {
        id: 'u1',
        email: 'john@example.com',
        user_metadata: { full_name: 'John Doe', phone: '555-1234', location: 'Istanbul', company: 'TestCo' },
        created_at: '2025-01-15T00:00:00Z',
      }
      mockFetchProfileResult = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
        location: 'Istanbul',
        company: 'TestCo',
        createdAt: '2025-01-15T00:00:00Z',
      }
      mockFetchStatsResult = { policiesAnalyzed: 5, comparisons: 3, savedReports: 2 }
    })

    it('renders the profile after loading', async () => {
      renderMyAccount()
      await waitFor(() => {
        // Name appears in header h2 and profile details
        const names = screen.getAllByText('John Doe')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('shows Cloud synced badge', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.cloudSynced)).toBeInTheDocument()
      })
    })

    it('displays usage statistics', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
      })
    })

    it('displays member since date', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(/January 2025/)).toBeInTheDocument()
      })
    })

    it('shows cloud storage info', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.cloudStorage)).toBeInTheDocument()
      })
    })

    it('does not show sign-in button', async () => {
      renderMyAccount()
      await waitFor(() => {
        const names = screen.getAllByText('John Doe')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
      expect(screen.queryByText(EN_TRANSLATIONS.account.signIn)).not.toBeInTheDocument()
    })
  })

  // --- Authenticated user without profile in DB ---
  describe('authenticated user without profile in DB', () => {
    beforeEach(() => {
      mockUser = {
        id: 'u2',
        email: 'jane@example.com',
        user_metadata: { full_name: 'Jane Smith' },
        created_at: '2025-06-01T00:00:00Z',
      }
      mockFetchProfileResult = null // No profile in DB
    })

    it('falls back to auth metadata', async () => {
      renderMyAccount()
      await waitFor(() => {
        const names = screen.getAllByText('Jane Smith')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  // --- Editing profile ---
  describe('editing profile', () => {
    beforeEach(() => {
      mockUser = null
      mockAuthConfigured = false
      mockIsSupabaseConfigured = false
    })

    it('enters edit mode when Edit Profile is clicked', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.editProfile)).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.account.editProfile))
      expect(screen.getByText(EN_TRANSLATIONS.common.save)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.common.cancel)).toBeInTheDocument()
    })

    it('shows input fields in edit mode', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.editProfile)).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.account.editProfile))
      const inputs = screen.getAllByRole('textbox')
      expect(inputs.length).toBeGreaterThanOrEqual(4)
    })

    it('cancels editing and restores original profile', async () => {
      localStorage.setItem('insurai_user_profile', JSON.stringify({ name: 'Original', email: '', phone: '', location: '', company: '' }))
      renderMyAccount()
      await waitFor(() => {
        const names = screen.getAllByText('Original')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.account.editProfile))
      // Change name
      const nameInput = screen.getByPlaceholderText(EN_TRANSLATIONS.account.namePlaceholder)
      fireEvent.change(nameInput, { target: { value: 'Changed' } })
      // Cancel
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.common.cancel))
      await waitFor(() => {
        const names = screen.getAllByText('Original')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('saves profile to localStorage for guest user', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.editProfile)).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.account.editProfile))
      const nameInput = screen.getByPlaceholderText(EN_TRANSLATIONS.account.namePlaceholder)
      fireEvent.change(nameInput, { target: { value: 'New Name' } })
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.common.save))
      })
      const saved = JSON.parse(localStorage.getItem('insurai_user_profile') || '{}')
      expect(saved.name).toBe('New Name')
    })
  })

  // --- Saving profile for authenticated user ---
  describe('save profile for authenticated user', () => {
    beforeEach(() => {
      mockUser = {
        id: 'u1',
        email: 'john@example.com',
        user_metadata: {},
        created_at: '2025-01-15T00:00:00Z',
      }
      mockFetchProfileResult = {
        fullName: 'John',
        email: 'john@example.com',
        phone: '',
        location: '',
        company: '',
        createdAt: '2025-01-15T00:00:00Z',
      }
    })

    it('calls updateUserProfile on save', async () => {
      renderMyAccount()
      await waitFor(() => {
        const names = screen.getAllByText('John')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.account.editProfile))
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.common.save))
      })
      expect(mockUpdateProfileFn).toHaveBeenCalledWith('u1', expect.any(Object))
    })

    it('shows success toast on save', async () => {
      renderMyAccount()
      await waitFor(() => {
        const names = screen.getAllByText('John')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.account.editProfile))
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.common.save))
      })
      expect(mockToast.success).toHaveBeenCalledWith(
        EN_TRANSLATIONS.account.profileUpdated,
        expect.objectContaining({ description: EN_TRANSLATIONS.account.profileUpdatedDesc })
      )
    })

    it('shows error toast on save failure', async () => {
      mockUpdateProfileFn = vi.fn().mockRejectedValue(new Error('Network error'))
      renderMyAccount()
      await waitFor(() => {
        const names = screen.getAllByText('John')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.account.editProfile))
      await act(async () => {
        fireEvent.click(screen.getByText(EN_TRANSLATIONS.common.save))
      })
      expect(mockToast.error).toHaveBeenCalled()
    })
  })

  // --- Profile load failure ---
  describe('profile load failure', () => {
    it('shows error toast when profile loading fails', async () => {
      mockUser = { id: 'u1', email: 'a@b.com', user_metadata: {}, created_at: '2025-01-01' }
      // Override fetch to throw
      const supabaseModule = await import('@/lib/supabase')
      vi.spyOn(supabaseModule, 'fetchUserProfile').mockRejectedValueOnce(new Error('DB error'))
      renderMyAccount()
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled()
      })
    })
  })

  // --- getInitials function coverage ---
  describe('avatar initials', () => {
    beforeEach(() => {
      mockUser = null
      mockAuthConfigured = false
      mockIsSupabaseConfigured = false
    })

    it('shows two-letter initials from full name', async () => {
      localStorage.setItem('insurai_user_profile', JSON.stringify({ name: 'John Doe', email: '', phone: '', location: '', company: '' }))
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText('JD')).toBeInTheDocument()
      })
    })

    it('shows first two chars from single-word name', async () => {
      localStorage.setItem('insurai_user_profile', JSON.stringify({ name: 'Alice', email: '', phone: '', location: '', company: '' }))
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText('AL')).toBeInTheDocument()
      })
    })

    it('shows first two chars from email when no name', async () => {
      localStorage.setItem('insurai_user_profile', JSON.stringify({ name: '', email: 'test@example.com', phone: '', location: '', company: '' }))
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText('TE')).toBeInTheDocument()
      })
    })

    it('shows U when neither name nor email', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText('U')).toBeInTheDocument()
      })
    })
  })

  // --- Display fields with dashes when empty ---
  describe('empty field display', () => {
    beforeEach(() => {
      mockUser = null
      mockAuthConfigured = false
      mockIsSupabaseConfigured = false
    })

    it('shows dashes for empty fields in view mode', async () => {
      renderMyAccount()
      await waitFor(() => {
        // All fields show dash when empty (non-editing mode) - em dash character
        const dashes = screen.getAllByText('\u2014')
        expect(dashes.length).toBeGreaterThanOrEqual(4)
      })
    })
  })

  // --- Your Name / Add Company fallbacks ---
  describe('name and company fallbacks', () => {
    beforeEach(() => {
      mockUser = null
      mockAuthConfigured = false
      mockIsSupabaseConfigured = false
    })

    it('shows "Your Name" when name is empty', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.yourName)).toBeInTheDocument()
      })
    })

    it('shows "Add Company" when company is empty', async () => {
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.addCompany)).toBeInTheDocument()
      })
    })
  })

  // --- Edit email disabled for Supabase users ---
  describe('email field behavior', () => {
    it('disables email input for Supabase users', async () => {
      mockUser = { id: 'u1', email: 'john@example.com', user_metadata: {}, created_at: '2025-01-01' }
      mockFetchProfileResult = {
        fullName: 'John',
        email: 'john@example.com',
        phone: '',
        location: '',
        company: '',
        createdAt: '2025-01-01',
      }
      renderMyAccount()
      await waitFor(() => {
        const names = screen.getAllByText('John')
        expect(names.length).toBeGreaterThanOrEqual(1)
      })
      fireEvent.click(screen.getByText(EN_TRANSLATIONS.account.editProfile))
      const emailInput = screen.getByPlaceholderText(EN_TRANSLATIONS.account.emailPlaceholder)
      expect(emailInput).toBeDisabled()
    })
  })

  // --- Sign in to sync text ---
  describe('sign in to sync prompt', () => {
    it('shows sign in to sync message for guest users', async () => {
      mockUser = null
      mockAuthConfigured = false
      mockIsSupabaseConfigured = false
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.signInToSync)).toBeInTheDocument()
      })
    })
  })

  // --- Data synced text for authenticated users ---
  describe('data synced message', () => {
    it('shows data synced message for authenticated users', async () => {
      mockUser = { id: 'u1', email: 'john@example.com', user_metadata: {}, created_at: '2025-01-01' }
      mockFetchProfileResult = {
        fullName: 'John',
        email: 'john@example.com',
        phone: '',
        location: '',
        company: '',
        createdAt: '2025-01-01',
      }
      renderMyAccount()
      await waitFor(() => {
        expect(screen.getByText(EN_TRANSLATIONS.account.dataSynced)).toBeInTheDocument()
      })
    })
  })
})
