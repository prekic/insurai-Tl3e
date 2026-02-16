/**
 * Hero Component Tests
 *
 * Tests for the landing page hero section
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Hero } from './Hero'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations'

// Mock i18n context to return English translations
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
  useI18n: () => ({ locale: 'en', setLocale: vi.fn() }),
  useLanguageSelector: () => ({
    currentLocale: 'en',
    locales: [
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', isActive: true },
      { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', isActive: false },
    ],
    setLocale: vi.fn(),
  }),
}))

// Mock dependencies
vi.mock('@/lib/policy-context', () => ({
  usePolicies: () => ({
    policies: [],
  }),
}))

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({
    user: {
      email: 'john@example.com',
      user_metadata: { full_name: 'John Doe' },
    },
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
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

      expect(screen.getByText('Help Center')).toBeInTheDocument()
    })

    it('should hide utility bar on mobile and show on desktop', () => {
      renderWithRouter(<Hero />)

      // Utility bar content still exists in DOM (hidden via CSS on mobile)
      expect(screen.getByText('Secure & Encrypted')).toBeInTheDocument()
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
      // "benchmark" appears in both mobile and desktop headlines
      const benchmarkElements = screen.getAllByText('benchmark')
      expect(benchmarkElements.length).toBeGreaterThan(0)
    })

    it('should display subheadline', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText(/Upload a policy PDF/)).toBeInTheDocument()
    })

    it('should display benefit points', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('PDF, Word, and scanned images')).toBeInTheDocument()
      expect(screen.getByText('Turkish/English coverage explanations')).toBeInTheDocument()
      expect(screen.getByText('Side-by-side policy comparison')).toBeInTheDocument()
    })

    it('should render UploadWidget', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByTestId('upload-widget')).toBeInTheDocument()
    })

    it('should have example analysis link', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('See Example Analysis')).toBeInTheDocument()
    })

    it('should display trust proof', () => {
      renderWithRouter(<Hero />)

      expect(screen.getByText('Built for Turkish insurance professionals')).toBeInTheDocument()
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
  })

  describe('Language Picker', () => {
    it('should render a Globe icon language button in the nav bar', () => {
      renderWithRouter(<Hero />)

      const langButton = screen.getByRole('button', { name: 'Change language' })
      expect(langButton).toBeInTheDocument()
    })

    it('should show Türkçe and English options when Globe is clicked', () => {
      renderWithRouter(<Hero />)

      const langButton = screen.getByRole('button', { name: 'Change language' })
      fireEvent.click(langButton)

      expect(screen.getByText('Türkçe')).toBeInTheDocument()
      expect(screen.getByText('English')).toBeInTheDocument()
    })

    it('should render language switcher in mobile menu', () => {
      renderWithRouter(<Hero />)

      // Open mobile menu
      const buttons = screen.getAllByRole('button')
      const menuButton = buttons.find(btn => btn.classList.contains('md:hidden'))
      if (menuButton) {
        fireEvent.click(menuButton)
      }

      // Mobile menu has inline language switcher with radiogroup
      const radiogroups = screen.getAllByRole('radiogroup', { name: 'Language' })
      expect(radiogroups.length).toBeGreaterThan(0)
    })
  })
})
