/**
 * CompareSection Component Tests
 *
 * Tests for the CTA compare section
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CompareSection } from './CompareSection'

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
    it('should have Get Started Free button', () => {
      renderWithRouter(<CompareSection />)

      expect(screen.getByText('Get Started Free')).toBeInTheDocument()
    })

    it('should link to upload page', () => {
      renderWithRouter(<CompareSection />)

      const link = screen.getByText('Get Started Free').closest('a')
      expect(link).toHaveAttribute('href', '/upload')
    })

    it('should display no credit card message', () => {
      renderWithRouter(<CompareSection />)

      expect(screen.getByText('No credit card required')).toBeInTheDocument()
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
