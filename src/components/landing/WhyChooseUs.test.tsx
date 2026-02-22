/**
 * WhyChooseUs Component Tests
 *
 * Tests for the differentiators banner section
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhyChooseUs } from './WhyChooseUs'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'

vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }),
}))

describe('WhyChooseUs', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      const { container } = render(<WhyChooseUs />)

      const section = container.querySelector('section')
      expect(section).toBeInTheDocument()
    })
  })

  describe('Differentiators', () => {
    it('should display KVKK Compliant', () => {
      render(<WhyChooseUs />)

      expect(screen.getByText('KVKK Compliant')).toBeInTheDocument()
      expect(screen.getByText('Privacy-first design for Turkish data protection')).toBeInTheDocument()
    })

    it('should display No Signup Required', () => {
      render(<WhyChooseUs />)

      expect(screen.getByText('No Signup Required')).toBeInTheDocument()
      expect(screen.getByText('Try a full policy analysis free, instantly')).toBeInTheDocument()
    })

    it('should display Turkey-Focused', () => {
      render(<WhyChooseUs />)

      expect(screen.getByText('Turkey-Focused')).toBeInTheDocument()
      expect(screen.getByText('Built specifically for Turkish insurance market')).toBeInTheDocument()
    })

    it('should render all 3 differentiator items', () => {
      const { container } = render(<WhyChooseUs />)

      const items = container.querySelectorAll('.text-white')
      expect(items.length).toBe(3)
    })
  })

  describe('Styling', () => {
    it('should have dark gradient background', () => {
      const { container } = render(<WhyChooseUs />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-gradient-to-r')
      expect(section).toHaveClass('from-slate-800')
      expect(section).toHaveClass('to-slate-900')
    })
  })
})
