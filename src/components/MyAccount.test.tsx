/**
 * MyAccount Component Tests
 *
 * Tests for user account profile display and editing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'
import { MyAccount } from './MyAccount'

// Mock sonner toast
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: EN_TRANSLATIONS, locale: 'en' }),
}))

// Create stable mock references via vi.hoisted to avoid useEffect infinite loops.
// The component's useEffect depends on [useSupabase, user]. If `user` is a new
// object each render (as with inline literals in vi.mock), useEffect re-runs,
// calling setProfile(JSON.parse(...)) which creates a new object, triggering
// another re-render — an infinite loop that hangs the Vitest worker.
const { mockUser, mockNavigate } = vi.hoisted(() => ({
  mockUser: {
    id: 'test-user-id',
    email: 'john@example.com',
    user_metadata: { full_name: 'John Doe' },
  },
  mockNavigate: vi.fn(),
}))

// Mock react-router-dom without vi.importActual to keep it simple and synchronous
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock useAuth with stable user reference
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    isConfigured: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

// Mock supabase functions
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  fetchUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  fetchUserStats: vi.fn(),
}))

const t = EN_TRANSLATIONS

describe('MyAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set up localStorage with test data (component uses localStorage when not using Supabase)
    const testProfile = {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+90 532 123 4567',
      location: 'Istanbul, Turkey',
      company: 'ABC Insurance Broker',
    }
    localStorage.setItem('insurai_user_profile', JSON.stringify(testProfile))
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Profile Display', () => {
    it('should render the account page header', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.title)).toBeInTheDocument()
      })
    })

    it('should display user name after loading', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        const userNames = screen.getAllByText('John Doe')
        expect(userNames.length).toBeGreaterThan(0)
      })
    })

    it('should display company name after loading', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        // Company appears in both profile card and details section
        const companyElements = screen.getAllByText('ABC Insurance Broker')
        expect(companyElements.length).toBeGreaterThan(0)
      })
    })

    it('should display email address after loading', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('john@example.com')).toBeInTheDocument()
      })
    })

    it('should display phone number after loading', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('+90 532 123 4567')).toBeInTheDocument()
      })
    })

    it('should display location after loading', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Istanbul, Turkey')).toBeInTheDocument()
      })
    })

    it('should display user initials in avatar', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('JD')).toBeInTheDocument()
      })
    })

    it('should display storage mode badge', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.localOnly)).toBeInTheDocument()
      })
    })
  })

  describe('Usage Statistics', () => {
    it('should display Usage Statistics section', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.usageStatistics)).toBeInTheDocument()
      })
    })

    it('should display policies analyzed label', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.policiesAnalyzed)).toBeInTheDocument()
      })
    })

    it('should display comparisons label', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.comparisons)).toBeInTheDocument()
      })
    })

    it('should display saved reports label', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.savedReports)).toBeInTheDocument()
      })
    })
  })

  describe('Edit Mode', () => {
    it('should show Edit Profile button by default', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })
    })

    it('should toggle to Save button when editing', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })

      const editButton = screen.getByText(t.account.editProfile)
      fireEvent.click(editButton)

      expect(screen.getByText(t.common.save)).toBeInTheDocument()
    })

    it('should show input fields when in edit mode', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })

      const editButton = screen.getByText(t.account.editProfile)
      fireEvent.click(editButton)

      const inputs = screen.getAllByRole('textbox')
      expect(inputs.length).toBeGreaterThan(0)
    })

    it('should allow editing name', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })

      const editButton = screen.getByText(t.account.editProfile)
      fireEvent.click(editButton)

      const nameInput = screen.getByDisplayValue('John Doe')
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })

      expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument()
    })

    it('should allow editing email', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })

      const editButton = screen.getByText(t.account.editProfile)
      fireEvent.click(editButton)

      const emailInput = screen.getByDisplayValue('john@example.com')
      fireEvent.change(emailInput, { target: { value: 'jane@example.com' } })

      expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument()
    })

    it('should allow editing phone', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })

      const editButton = screen.getByText(t.account.editProfile)
      fireEvent.click(editButton)

      const phoneInput = screen.getByDisplayValue('+90 532 123 4567')
      fireEvent.change(phoneInput, { target: { value: '+90 555 555 5555' } })

      expect(screen.getByDisplayValue('+90 555 555 5555')).toBeInTheDocument()
    })

    it('should allow editing location', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })

      const editButton = screen.getByText(t.account.editProfile)
      fireEvent.click(editButton)

      const locationInput = screen.getByDisplayValue('Istanbul, Turkey')
      fireEvent.change(locationInput, { target: { value: 'Ankara, Turkey' } })

      expect(screen.getByDisplayValue('Ankara, Turkey')).toBeInTheDocument()
    })

    it('should return to view mode when Save is clicked', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })

      const editButton = screen.getByText(t.account.editProfile)
      fireEvent.click(editButton)

      const saveButton = screen.getByText(t.common.save)
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText(t.account.editProfile)).toBeInTheDocument()
      })
    })
  })

  describe('Storage Info', () => {
    it('should display storage info card', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.localStorage)).toBeInTheDocument()
      })
    })

    it('should display sign in prompt for local storage mode', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.signInToSync)).toBeInTheDocument()
      })
    })
  })

  describe('Profile Information Section', () => {
    it('should display Profile Information header', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.personalInfo)).toBeInTheDocument()
      })
    })

    it('should display field labels', async () => {
      render(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText(t.account.fullName)).toBeInTheDocument()
        expect(screen.getByText(t.account.email)).toBeInTheDocument()
        expect(screen.getByText(t.account.phone)).toBeInTheDocument()
        expect(screen.getByText(t.account.location)).toBeInTheDocument()
      })
    })
  })
})
