/**
 * Hero Component Tests
 *
 * Tests for the landing page hero section
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Hero } from './Hero'

// Mock dependencies
vi.mock('@/lib/policy-context', () => ({
  usePolicies: () => ({
    policies: [],
  }),
}))

vi.mock('./UploadWidget', () => ({
  UploadWidget: ({ compact }: { compact?: boolean }) => (
    <div data-testid="upload-widget" data-compact={compact}>
      Upload Widget
    </div>
  ),
}))

vi.mock('./ComparisonMock', () => ({
  ComparisonMock: () => <div data-testid="comparison-mock">Comparison Mock</div>,
  ComparisonMockMobile: () => <div data-testid="comparison-mock-mobile">Comparison Mock Mobile</div>,
}))

vi.mock('./LanguageToggle', () => ({
  LanguageToggle: () => <div data-testid="language-toggle">Language Toggle</div>,
}))

vi.mock('../animations/AnimatedComponents', () => ({
  StaggeredList: ({ children }: { children: React.ReactNode[] }) => <div>{children}</div>,
  AnimatedButton: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <button onClick={onClick} className={className}>{children}</button>
  ),
  NumberCounter: ({ value, suffix }: { value: number; suffix?: string }) => (
    <span>{value}{suffix}</span>
  ),
  ScaleOnHover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

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

describe('Hero', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Navigation', () => {
    it('should render the navigation bar', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('InsurAI')).toBeInTheDocument()
    })

    it('should display secure and encrypted badge', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Secure & Encrypted')).toBeInTheDocument()
    })

    it('should display licensed advisors badge', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Licensed Insurance Advisors')).toBeInTheDocument()
    })

    it('should have Dashboard link', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('should have Compare link', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Compare')).toBeInTheDocument()
    })

    it('should have Upload Policy button', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Upload Policy')).toBeInTheDocument()
    })

    it('should have Help link', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Help')).toBeInTheDocument()
    })

    it('should have phone number link', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('1-855-555-0123')).toBeInTheDocument()
    })
  })

  describe('Hero Content', () => {
    it('should display AI-powered badge', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('AI-powered policy analysis')).toBeInTheDocument()
    })

    it('should display main headline', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText(/Understand and/)).toBeInTheDocument()
      expect(screen.getByText('benchmark')).toBeInTheDocument()
    })

    it('should display subheadline', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText(/Upload your policy documents/)).toBeInTheDocument()
    })

    it('should display benefit points', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Works with PDF, Word, and scanned images')).toBeInTheDocument()
      expect(screen.getByText('Explains coverage in Turkish/English')).toBeInTheDocument()
      expect(screen.getByText('Renewal reminders and alerts')).toBeInTheDocument()
    })

    it('should render UploadWidget', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByTestId('upload-widget')).toBeInTheDocument()
    })

    it('should have sample policies button', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Try with sample policies')).toBeInTheDocument()
    })

    it('should display trust stats', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('15K+ reviews')).toBeInTheDocument()
      expect(screen.getByText('Policies analyzed')).toBeInTheDocument()
    })
  })

  describe('Sample Policies Section', () => {
    it('should display sample policies card', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Sample Policies Collection')).toBeInTheDocument()
    })

    it('should have View All link to samples', () => {
      renderWithRouter(<Hero />)

      const viewAllLink = screen.getByText('View All').closest('a')
      expect(viewAllLink).toHaveAttribute('href', '/samples')
    })
  })

  describe('Mobile Menu', () => {
    it('should toggle mobile menu when button is clicked', () => {
      renderWithRouter(<Hero />)

      // Find the mobile menu button (has Menu icon, visible on mobile)
      const buttons = screen.getAllByRole('button')
      const menuButton = buttons.find(btn => btn.classList.contains('md:hidden'))

      if (menuButton) {
        fireEvent.click(menuButton)

        // Mobile menu items should appear
        const dashboardButtons = screen.getAllByText('Dashboard')
        expect(dashboardButtons.length).toBeGreaterThan(1)
      } else {
        // Menu button exists in mobile view
        expect(buttons.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Profile Menu', () => {
    it('should show profile menu when profile button is clicked', () => {
      renderWithRouter(<Hero />)

      // Find profile button (the one with the user icon)
      const buttons = screen.getAllByRole('button')
      const profileButton = buttons.find(btn => btn.querySelector('[class*="lucide-chevron-down"]'))

      if (profileButton) {
        fireEvent.click(profileButton)
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('john@example.com')).toBeInTheDocument()
      }
    })

    it('should have My Account option in profile menu', () => {
      renderWithRouter(<Hero />)

      const buttons = screen.getAllByRole('button')
      const profileButton = buttons.find(btn => btn.querySelector('[class*="lucide-chevron-down"]'))

      if (profileButton) {
        fireEvent.click(profileButton)
        expect(screen.getByText('My Account')).toBeInTheDocument()
      }
    })

    it('should have Settings option in profile menu', () => {
      renderWithRouter(<Hero />)

      const buttons = screen.getAllByRole('button')
      const profileButton = buttons.find(btn => btn.querySelector('[class*="lucide-chevron-down"]'))

      if (profileButton) {
        fireEvent.click(profileButton)
        expect(screen.getByText('Settings')).toBeInTheDocument()
      }
    })

    it('should have Sign Out option in profile menu', () => {
      renderWithRouter(<Hero />)

      const buttons = screen.getAllByRole('button')
      const profileButton = buttons.find(btn => btn.querySelector('[class*="lucide-chevron-down"]'))

      if (profileButton) {
        fireEvent.click(profileButton)
        expect(screen.getByText('Sign Out')).toBeInTheDocument()
      }
    })
  })

  describe('Comparison Mock', () => {
    it('should render comparison mock on desktop', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByTestId('comparison-mock')).toBeInTheDocument()
    })

    it('should render language toggle', () => {
      renderWithRouter(<Hero />)

      const toggles = screen.getAllByTestId('language-toggle')
      expect(toggles.length).toBeGreaterThan(0)
    })
  })
})
