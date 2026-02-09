/**
 * CompareSection Component Tests
 *
 * Tests for the CTA compare section
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CompareSection } from './CompareSection'

// Mock auth context — CompareSection now uses useAuth for dynamic routing
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

describe('CompareSection', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      renderWithRouter(<CompareSection />)

      expect(screen.getByText('Ready to understand your policies?')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      renderWithRouter(<CompareSection />)

      expect(screen.getByText(/Upload your first policy/)).toBeInTheDocument()
    })
  })

  describe('CTA Button', () => {
    it('should have Analyze Your Policy Free button', () => {
      renderWithRouter(<CompareSection />)

      expect(screen.getByText('Analyze Your Policy Free')).toBeInTheDocument()
    })

    it('should link to try page for anonymous users', () => {
      renderWithRouter(<CompareSection />)

      const link = screen.getByText('Analyze Your Policy Free').closest('a')
      expect(link).toHaveAttribute('href', '/try')
    })

    it('should display free no signup message', () => {
      renderWithRouter(<CompareSection />)

      expect(screen.getByText('Free, no signup required')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should have blue gradient background', () => {
      const { container } = renderWithRouter(<CompareSection />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-gradient-to-br')
      expect(section).toHaveClass('from-blue-600')
      expect(section).toHaveClass('to-indigo-700')
    })

    it('should center content', () => {
      const { container } = renderWithRouter(<CompareSection />)

      const div = container.querySelector('.text-center')
      expect(div).toBeInTheDocument()
    })
  })
})
