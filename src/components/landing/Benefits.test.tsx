/**
 * Benefits Component Tests
 *
 * Tests for the benefits section
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Benefits } from './Benefits'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
}))

describe('Benefits', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      render(<Benefits />)

      expect(screen.getByText(/Why choose/)).toBeInTheDocument()
    })

    it('should display InsurAI in title', () => {
      render(<Benefits />)

      expect(screen.getByText('InsurAI')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      render(<Benefits />)

      expect(screen.getByText(/The most powerful insurance analysis platform/)).toBeInTheDocument()
    })
  })

  describe('Benefit Cards', () => {
    it('should render Comprehensive Analysis', () => {
      render(<Benefits />)

      expect(screen.getByText('Comprehensive Analysis')).toBeInTheDocument()
      expect(screen.getByText('AI extracts every detail from your policy documents automatically.')).toBeInTheDocument()
    })

    it('should render Instant Results', () => {
      render(<Benefits />)

      expect(screen.getByText('Instant Results')).toBeInTheDocument()
      expect(screen.getByText('Get detailed coverage breakdowns in seconds, not hours.')).toBeInTheDocument()
    })

    it('should render Multi-Language Support', () => {
      render(<Benefits />)

      expect(screen.getByText('Multi-Language Support')).toBeInTheDocument()
      expect(screen.getByText('Works with Turkish and English policies seamlessly.')).toBeInTheDocument()
    })

    it('should render Renewal Tracking', () => {
      render(<Benefits />)

      expect(screen.getByText('Renewal Tracking')).toBeInTheDocument()
      expect(screen.getByText('Never miss a renewal with automated reminders.')).toBeInTheDocument()
    })

    it('should render Bank-Level Security', () => {
      render(<Benefits />)

      expect(screen.getByText('Bank-Level Security')).toBeInTheDocument()
      expect(screen.getByText('Your documents are encrypted and protected.')).toBeInTheDocument()
    })

    it('should render Market Benchmarks', () => {
      render(<Benefits />)

      expect(screen.getByText('Market Benchmarks')).toBeInTheDocument()
      expect(screen.getByText('Compare your coverage against market standards.')).toBeInTheDocument()
    })

    it('should render all 6 benefit cards', () => {
      const { container } = render(<Benefits />)

      const cards = container.querySelectorAll('.rounded-2xl.border')
      expect(cards.length).toBe(6)
    })
  })

  describe('Styling', () => {
    it('should have white background', () => {
      const { container } = render(<Benefits />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-white')
    })

    it('should have proper padding', () => {
      const { container } = render(<Benefits />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('py-24')
    })
  })
})
