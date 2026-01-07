/**
 * MyAccount Component Tests
 *
 * Tests for user account profile display and editing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { MyAccount } from './MyAccount'

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock useAuth hook
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-id',
      email: 'john@example.com',
      user_metadata: {
        full_name: 'John Doe',
      },
    },
    isLoading: false,
    isConfigured: false, // Use local storage mode for tests
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

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

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
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('My Account')).toBeInTheDocument()
      })
    })

    it('should display user name after loading', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        const userNames = screen.getAllByText('John Doe')
        expect(userNames.length).toBeGreaterThan(0)
      })
    })

    it('should display company name after loading', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('ABC Insurance Broker')).toBeInTheDocument()
      })
    })

    it('should display email address after loading', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('john@example.com')).toBeInTheDocument()
      })
    })

    it('should display phone number after loading', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('+90 532 123 4567')).toBeInTheDocument()
      })
    })

    it('should display location after loading', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Istanbul, Turkey')).toBeInTheDocument()
      })
    })

    it('should display user initials in avatar', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('JD')).toBeInTheDocument()
      })
    })

    it('should display storage mode badge', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        // Component shows "Local Only" when not using Supabase
        expect(screen.getByText('Local Only')).toBeInTheDocument()
      })
    })
  })

  describe('Usage Statistics', () => {
    it('should display Usage Statistics section', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Usage Statistics')).toBeInTheDocument()
      })
    })

    it('should display policies analyzed label', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Policies Analyzed')).toBeInTheDocument()
      })
    })

    it('should display comparisons label', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Comparisons')).toBeInTheDocument()
      })
    })

    it('should display saved reports label', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Saved Reports')).toBeInTheDocument()
      })
    })
  })

  describe('Edit Mode', () => {
    it('should show Edit Profile button by default', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })
    })

    it('should toggle to Save button when editing', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    it('should show input fields when in edit mode', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      // Should now have input fields
      const inputs = screen.getAllByRole('textbox')
      expect(inputs.length).toBeGreaterThan(0)
    })

    it('should allow editing name', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const nameInput = screen.getByDisplayValue('John Doe')
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })

      expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument()
    })

    it('should allow editing email', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const emailInput = screen.getByDisplayValue('john@example.com')
      fireEvent.change(emailInput, { target: { value: 'jane@example.com' } })

      expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument()
    })

    it('should allow editing phone', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const phoneInput = screen.getByDisplayValue('+90 532 123 4567')
      fireEvent.change(phoneInput, { target: { value: '+90 555 555 5555' } })

      expect(screen.getByDisplayValue('+90 555 555 5555')).toBeInTheDocument()
    })

    it('should allow editing location', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const locationInput = screen.getByDisplayValue('Istanbul, Turkey')
      fireEvent.change(locationInput, { target: { value: 'Ankara, Turkey' } })

      expect(screen.getByDisplayValue('Ankara, Turkey')).toBeInTheDocument()
    })

    it('should return to view mode when Save is clicked', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument()
      })
    })
  })

  describe('Navigation', () => {
    it('should navigate back when back button is clicked', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('My Account')).toBeInTheDocument()
      })

      // Get button by aria-label
      const backButton = screen.getByLabelText('Go back')
      fireEvent.click(backButton)

      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })

  describe('Storage Info', () => {
    it('should display storage info card', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        // Component shows local storage info when not using Supabase
        expect(screen.getByText('Local Storage')).toBeInTheDocument()
      })
    })

    it('should display sign in prompt for local storage mode', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Sign in to sync your data across devices')).toBeInTheDocument()
      })
    })
  })

  describe('Profile Information Section', () => {
    it('should display Profile Information header', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Profile Information')).toBeInTheDocument()
      })
    })

    it('should display field labels', async () => {
      renderWithRouter(<MyAccount />)

      await waitFor(() => {
        expect(screen.getByText('Full Name')).toBeInTheDocument()
        expect(screen.getByText('Email')).toBeInTheDocument()
        expect(screen.getByText('Phone')).toBeInTheDocument()
        expect(screen.getByText('Location')).toBeInTheDocument()
      })
    })
  })
})
