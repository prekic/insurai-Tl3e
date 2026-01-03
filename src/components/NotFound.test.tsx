/**
 * NotFound Component Tests
 *
 * Tests for 404 page rendering and navigation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { NotFound } from './NotFound'

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {
      nav: {
        home: 'Home',
        dashboard: 'Dashboard',
      },
      upload: {
        title: 'Upload',
      },
      help: {
        title: 'Help',
      },
    },
  }),
}))

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

describe('NotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('404 Display', () => {
    it('should display 404 text', () => {
      renderWithRouter(<NotFound />)

      expect(screen.getByText('404')).toBeInTheDocument()
    })

    it('should display Page Not Found heading', () => {
      renderWithRouter(<NotFound />)

      expect(screen.getByText('Page Not Found')).toBeInTheDocument()
    })

    it('should display helpful message', () => {
      renderWithRouter(<NotFound />)

      expect(
        screen.getByText(/The page you're looking for doesn't exist or has been moved/)
      ).toBeInTheDocument()
    })
  })

  describe('Navigation Actions', () => {
    it('should render Go Back button', () => {
      renderWithRouter(<NotFound />)

      expect(screen.getByText('Go Back')).toBeInTheDocument()
    })

    it('should navigate back when Go Back is clicked', () => {
      renderWithRouter(<NotFound />)

      const goBackButton = screen.getByText('Go Back')
      fireEvent.click(goBackButton)

      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })

    it('should render Home link', () => {
      renderWithRouter(<NotFound />)

      expect(screen.getByText('Home')).toBeInTheDocument()
    })

    it('should link to home page', () => {
      renderWithRouter(<NotFound />)

      const homeLink = screen.getByText('Home').closest('a')
      expect(homeLink).toHaveAttribute('href', '/')
    })
  })

  describe('Helpful Links', () => {
    it('should display helpful links section', () => {
      renderWithRouter(<NotFound />)

      expect(screen.getByText('Or try one of these pages:')).toBeInTheDocument()
    })

    it('should render Dashboard link', () => {
      renderWithRouter(<NotFound />)

      const dashboardLink = screen.getByText('Dashboard').closest('a')
      expect(dashboardLink).toHaveAttribute('href', '/dashboard')
    })

    it('should render Upload link', () => {
      renderWithRouter(<NotFound />)

      const uploadLink = screen.getByText('Upload').closest('a')
      expect(uploadLink).toHaveAttribute('href', '/upload')
    })

    it('should render Help link', () => {
      renderWithRouter(<NotFound />)

      const helpLink = screen.getByText('Help').closest('a')
      expect(helpLink).toHaveAttribute('href', '/help')
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      renderWithRouter(<NotFound />)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page Not Found')
    })

    it('should have accessible buttons', () => {
      renderWithRouter(<NotFound />)

      const goBackButton = screen.getByText('Go Back')
      expect(goBackButton.closest('button')).toBeInTheDocument()
    })

    it('should have accessible links', () => {
      renderWithRouter(<NotFound />)

      const links = screen.getAllByRole('link')
      expect(links.length).toBeGreaterThan(0)
    })
  })

  describe('Styling', () => {
    it('should center content on page', () => {
      const { container } = renderWithRouter(<NotFound />)

      const mainDiv = container.firstChild as HTMLElement
      expect(mainDiv).toHaveClass('min-h-screen')
      expect(mainDiv).toHaveClass('flex')
      expect(mainDiv).toHaveClass('items-center')
      expect(mainDiv).toHaveClass('justify-center')
    })
  })
})
