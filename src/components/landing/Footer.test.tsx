/**
 * Footer Component Tests
 *
 * Tests for the landing page footer
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from './Footer'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
}))

describe('Footer', () => {
  describe('Brand Section', () => {
    it('should display InsurAI logo and name', () => {
      render(<Footer />)

      expect(screen.getByText('InsurAI')).toBeInTheDocument()
    })

    it('should display brand description', () => {
      render(<Footer />)

      expect(screen.getByText(/AI-powered insurance policy analysis platform/)).toBeInTheDocument()
    })
  })

  describe('Product Links', () => {
    it('should display Product section', () => {
      render(<Footer />)

      expect(screen.getByText('Product')).toBeInTheDocument()
    })

    it('should have Features link', () => {
      render(<Footer />)

      expect(screen.getByText('Features')).toBeInTheDocument()
    })

    it('should have Pricing link', () => {
      render(<Footer />)

      expect(screen.getByText('Pricing')).toBeInTheDocument()
    })

    it('should have API link', () => {
      render(<Footer />)

      expect(screen.getByText('API')).toBeInTheDocument()
    })

    it('should have Integrations link', () => {
      render(<Footer />)

      expect(screen.getByText('Integrations')).toBeInTheDocument()
    })
  })

  describe('Company Links', () => {
    it('should display Company section', () => {
      render(<Footer />)

      expect(screen.getByText('Company')).toBeInTheDocument()
    })

    it('should have About link', () => {
      render(<Footer />)

      expect(screen.getByText('About')).toBeInTheDocument()
    })

    it('should have Blog link', () => {
      render(<Footer />)

      expect(screen.getByText('Blog')).toBeInTheDocument()
    })

    it('should have Careers link', () => {
      render(<Footer />)

      expect(screen.getByText('Careers')).toBeInTheDocument()
    })

    it('should have Contact link', () => {
      render(<Footer />)

      // Multiple "Contact" texts exist (link + section header)
      const contactElements = screen.getAllByText('Contact')
      expect(contactElements.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Contact Information', () => {
    it('should display Contact section', () => {
      render(<Footer />)

      // There are multiple "Contact" texts - one as section header, one as link
      const contactElements = screen.getAllByText('Contact')
      expect(contactElements.length).toBeGreaterThan(0)
    })

    it('should display email', () => {
      render(<Footer />)

      expect(screen.getByText('info@insurai.com')).toBeInTheDocument()
    })

    it('should display phone number', () => {
      render(<Footer />)

      expect(screen.getByText('+90 212 555 0123')).toBeInTheDocument()
    })

    it('should display location', () => {
      render(<Footer />)

      expect(screen.getByText('Istanbul, Turkey')).toBeInTheDocument()
    })
  })

  describe('Legal Links', () => {
    it('should display copyright', () => {
      render(<Footer />)

      expect(screen.getByText(/© 2025 InsurAI. All rights reserved./)).toBeInTheDocument()
    })

    it('should have Privacy Policy link', () => {
      render(<Footer />)

      expect(screen.getByText('Privacy Policy')).toBeInTheDocument()
    })

    it('should have Terms of Service link', () => {
      render(<Footer />)

      expect(screen.getByText('Terms of Service')).toBeInTheDocument()
    })

    it('should have Cookie Policy link', () => {
      render(<Footer />)

      expect(screen.getByText('Cookie Policy')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should have dark background', () => {
      const { container } = render(<Footer />)

      const footer = container.querySelector('footer')
      expect(footer).toHaveClass('bg-slate-900')
    })

    it('should have white text', () => {
      const { container } = render(<Footer />)

      const footer = container.querySelector('footer')
      expect(footer).toHaveClass('text-white')
    })
  })

  describe('Grid Layout', () => {
    it('should render 4 columns on larger screens', () => {
      const { container } = render(<Footer />)

      const grid = container.querySelector('.grid.md\\:grid-cols-4')
      expect(grid).toBeInTheDocument()
    })
  })
})
