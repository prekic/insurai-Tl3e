/**
 * MyAccount Component Tests
 *
 * Tests for user account profile display and editing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

describe('MyAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Profile Display', () => {
    it('should render the account page header', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('My Account')).toBeInTheDocument()
    })

    it('should display user name', () => {
      renderWithRouter(<MyAccount />)

      const userNames = screen.getAllByText('John Doe')
      expect(userNames.length).toBeGreaterThan(0)
    })

    it('should display company name', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('ABC Insurance Broker')).toBeInTheDocument()
    })

    it('should display email address', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('john@example.com')).toBeInTheDocument()
    })

    it('should display phone number', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('+90 532 123 4567')).toBeInTheDocument()
    })

    it('should display location', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('Istanbul, Turkey')).toBeInTheDocument()
    })

    it('should display user initials in avatar', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('JD')).toBeInTheDocument()
    })

    it('should display Pro Plan badge', () => {
      renderWithRouter(<MyAccount />)

      const proPlanElements = screen.getAllByText('Pro Plan')
      expect(proPlanElements.length).toBeGreaterThan(0)
    })

    it('should display member since date', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText(/Member since/)).toBeInTheDocument()
      expect(screen.getByText(/January 2024/)).toBeInTheDocument()
    })
  })

  describe('Usage Statistics', () => {
    it('should display Usage Statistics section', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('Usage Statistics')).toBeInTheDocument()
    })

    it('should display policies analyzed count', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('24')).toBeInTheDocument()
      expect(screen.getByText('Policies Analyzed')).toBeInTheDocument()
    })

    it('should display comparisons count', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('Comparisons')).toBeInTheDocument()
    })

    it('should display saved reports count', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('Saved Reports')).toBeInTheDocument()
    })
  })

  describe('Edit Mode', () => {
    it('should show Edit Profile button by default', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('Edit Profile')).toBeInTheDocument()
    })

    it('should toggle to Save button when editing', () => {
      renderWithRouter(<MyAccount />)

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    it('should show input fields when in edit mode', () => {
      renderWithRouter(<MyAccount />)

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      // Should now have input fields
      const inputs = screen.getAllByRole('textbox')
      expect(inputs.length).toBeGreaterThan(0)
    })

    it('should allow editing name', () => {
      renderWithRouter(<MyAccount />)

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const nameInput = screen.getByDisplayValue('John Doe')
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })

      expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument()
    })

    it('should allow editing email', () => {
      renderWithRouter(<MyAccount />)

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const emailInput = screen.getByDisplayValue('john@example.com')
      fireEvent.change(emailInput, { target: { value: 'jane@example.com' } })

      expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument()
    })

    it('should allow editing phone', () => {
      renderWithRouter(<MyAccount />)

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const phoneInput = screen.getByDisplayValue('+90 532 123 4567')
      fireEvent.change(phoneInput, { target: { value: '+90 555 555 5555' } })

      expect(screen.getByDisplayValue('+90 555 555 5555')).toBeInTheDocument()
    })

    it('should allow editing location', () => {
      renderWithRouter(<MyAccount />)

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const locationInput = screen.getByDisplayValue('Istanbul, Turkey')
      fireEvent.change(locationInput, { target: { value: 'Ankara, Turkey' } })

      expect(screen.getByDisplayValue('Ankara, Turkey')).toBeInTheDocument()
    })

    it('should return to view mode when Save is clicked', () => {
      renderWithRouter(<MyAccount />)

      const editButton = screen.getByText('Edit Profile')
      fireEvent.click(editButton)

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(screen.getByText('Edit Profile')).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('should navigate back when back button is clicked', () => {
      renderWithRouter(<MyAccount />)

      // Get all buttons and find the first one (which is the back button)
      const buttons = screen.getAllByRole('button')
      const backButton = buttons[0] // First button is the back button
      fireEvent.click(backButton)

      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })

  describe('Subscription', () => {
    it('should display subscription card', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('Unlimited policy analysis and comparisons')).toBeInTheDocument()
    })

    it('should display Manage Subscription button', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('Manage Subscription')).toBeInTheDocument()
    })
  })

  describe('Profile Information Section', () => {
    it('should display Profile Information header', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('Profile Information')).toBeInTheDocument()
    })

    it('should display field labels', () => {
      renderWithRouter(<MyAccount />)

      expect(screen.getByText('Full Name')).toBeInTheDocument()
      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('Phone')).toBeInTheDocument()
      expect(screen.getByText('Location')).toBeInTheDocument()
    })
  })
})
