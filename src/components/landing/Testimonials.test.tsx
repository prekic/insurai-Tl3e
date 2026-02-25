/**
 * Testimonials Component Tests
 *
 * Tests for the testimonials section
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Testimonials } from './Testimonials'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
}))

describe('Testimonials Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render the section', () => {
      render(<Testimonials />)

      expect(screen.getByText(/Trusted by/)).toBeInTheDocument()
    })

    it('should display highlighted text', () => {
      render(<Testimonials />)

      expect(screen.getByText('Risk Professionals')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      render(<Testimonials />)

      expect(screen.getByText(/See how enterprise teams use InsurAI/)).toBeInTheDocument()
    })
  })

  describe('Testimonial Cards', () => {
    it('should render Claims Adjuster testimonial', () => {
      render(<Testimonials />)

      expect(screen.getByText('Senior Claims Adjuster, Global Property')).toBeInTheDocument()
      expect(
        screen.getByText(/InsurAI reduced our complex property damage claim review time by 40%/)
      ).toBeInTheDocument()
    })

    it('should render Chief Risk Officer testimonial', () => {
      render(<Testimonials />)

      expect(screen.getByText('Chief Risk Officer, Manufacturing')).toBeInTheDocument()
      expect(
        screen.getByText(/Calculating BI and supply chain impacts used to take weeks/)
      ).toBeInTheDocument()
    })

    it('should render Commercial Lines VP testimonial', () => {
      render(<Testimonials />)

      expect(screen.getByText('VP of Commercial Lines, Regional Brokerage')).toBeInTheDocument()
      expect(
        screen.getByText(
          /The efficiency gained in our risk assessment workflow has been transformative/
        )
      ).toBeInTheDocument()
    })

    it('should render all 3 testimonial cards', () => {
      const { container } = render(<Testimonials />)

      const cards = container.querySelectorAll('.rounded-2xl.shadow-lg')
      expect(cards.length).toBe(3)
    })
  })

  describe('Accessibility & Styling', () => {
    it('should have a labeled section region', () => {
      render(<Testimonials />)

      const region = screen.getByRole('region', { name: /Trusted by Risk Professionals/i })
      expect(region).toBeInTheDocument()
    })

    it('should use grid layout', () => {
      const { container } = render(<Testimonials />)

      const grid = container.querySelector('.grid.md\\:grid-cols-3')
      expect(grid).toBeInTheDocument()
    })
  })
})
