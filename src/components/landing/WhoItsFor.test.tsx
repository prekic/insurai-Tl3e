/**
 * WhoItsFor Component Tests
 *
 * Tests for the target audience section with i18n support
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhoItsFor } from './WhoItsFor'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'
import { TR_TRANSLATIONS } from '@/lib/i18n/translations-tr'

// Mock i18n context - default to English
const mockTranslations = { current: EN_TRANSLATIONS }
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: mockTranslations.current, locale: 'en', isLoading: false }),
  useI18n: () => ({ locale: 'en', setLocale: vi.fn() }),
}))

describe('WhoItsFor', () => {
  beforeEach(() => {
    mockTranslations.current = EN_TRANSLATIONS
  })

  describe('Rendering', () => {
    it('should render the section', () => {
      render(<WhoItsFor />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoTitle)).toBeInTheDocument()
    })

    it('should display highlighted text', () => {
      render(<WhoItsFor />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoHighlight)).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      render(<WhoItsFor />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoDesc)).toBeInTheDocument()
    })
  })

  describe('Audience Cards', () => {
    it('should render Insurance Brokers card', () => {
      render(<WhoItsFor />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoBrokersTitle)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoBrokersDesc)).toBeInTheDocument()
    })

    it('should render Corporate Risk Managers card', () => {
      render(<WhoItsFor />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoRiskTitle)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoRiskDesc)).toBeInTheDocument()
    })

    it('should render Individual Policyholders card', () => {
      render(<WhoItsFor />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoPolicyholdersTitle)).toBeInTheDocument()
      expect(screen.getByText(EN_TRANSLATIONS.landing.whoPolicyholdersDesc)).toBeInTheDocument()
    })

    it('should render all 3 audience cards', () => {
      const { container } = render(<WhoItsFor />)
      const cards = container.querySelectorAll('.bg-white.rounded-2xl.shadow-lg')
      expect(cards.length).toBe(3)
    })
  })

  describe('Turkish translations', () => {
    it('should render Turkish title when locale is TR', () => {
      mockTranslations.current = TR_TRANSLATIONS
      render(<WhoItsFor />)
      expect(screen.getByText(TR_TRANSLATIONS.landing.whoTitle)).toBeInTheDocument()
    })

    it('should render Turkish broker card when locale is TR', () => {
      mockTranslations.current = TR_TRANSLATIONS
      render(<WhoItsFor />)
      expect(screen.getByText(TR_TRANSLATIONS.landing.whoBrokersTitle)).toBeInTheDocument()
      expect(screen.getByText(TR_TRANSLATIONS.landing.whoBrokersDesc)).toBeInTheDocument()
    })

    it('should not contain English text when locale is TR', () => {
      mockTranslations.current = TR_TRANSLATIONS
      render(<WhoItsFor />)
      expect(screen.queryByText('Insurance Brokers')).not.toBeInTheDocument()
      expect(screen.queryByText('Corporate Risk Managers')).not.toBeInTheDocument()
      expect(screen.queryByText('Individual Policyholders')).not.toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should have slate background', () => {
      const { container } = render(<WhoItsFor />)
      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-slate-50')
    })

    it('should use grid layout', () => {
      const { container } = render(<WhoItsFor />)
      const grid = container.querySelector('.grid.md\\:grid-cols-3')
      expect(grid).toBeInTheDocument()
    })
  })
})
