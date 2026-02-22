/**
 * CompareSection Component Tests
 *
 * Tests for the CTA compare section with i18n support
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CompareSection } from './CompareSection'
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'
import { TR_TRANSLATIONS } from '@/lib/i18n/translations-tr'

// Mock i18n context - default to English
const mockTranslations = { current: EN_TRANSLATIONS }
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: mockTranslations.current, locale: 'en', isLoading: false }),
  useI18n: () => ({ locale: 'en', setLocale: vi.fn() }),
}))

// Mock auth context — CompareSection now uses useAuth for dynamic routing
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

describe('CompareSection', () => {
  beforeEach(() => {
    mockTranslations.current = EN_TRANSLATIONS
  })

  describe('Rendering', () => {
    it('should render the section', () => {
      renderWithRouter(<CompareSection />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.ctaTitle)).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      renderWithRouter(<CompareSection />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.ctaDescription)).toBeInTheDocument()
    })
  })

  describe('CTA Button', () => {
    it('should have Analyze Your Policy Free button', () => {
      renderWithRouter(<CompareSection />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.analyzeCtaButton)).toBeInTheDocument()
    })

    it('should link to try page for anonymous users', () => {
      renderWithRouter(<CompareSection />)
      const link = screen.getByText(EN_TRANSLATIONS.landing.analyzeCtaButton).closest('a')
      expect(link).toHaveAttribute('href', '/try')
    })

    it('should display free no signup message', () => {
      renderWithRouter(<CompareSection />)
      expect(screen.getByText(EN_TRANSLATIONS.landing.freeNoSignup)).toBeInTheDocument()
    })
  })

  describe('Turkish translations', () => {
    it('should render Turkish CTA title when locale is TR', () => {
      mockTranslations.current = TR_TRANSLATIONS
      renderWithRouter(<CompareSection />)
      expect(screen.getByText(TR_TRANSLATIONS.landing.ctaTitle)).toBeInTheDocument()
    })

    it('should render Turkish CTA button when locale is TR', () => {
      mockTranslations.current = TR_TRANSLATIONS
      renderWithRouter(<CompareSection />)
      expect(screen.getByText(TR_TRANSLATIONS.landing.analyzeCtaButton)).toBeInTheDocument()
    })

    it('should render Turkish free no signup text when locale is TR', () => {
      mockTranslations.current = TR_TRANSLATIONS
      renderWithRouter(<CompareSection />)
      expect(screen.getByText(TR_TRANSLATIONS.landing.freeNoSignup)).toBeInTheDocument()
    })

    it('should not contain any English CTA text when locale is TR', () => {
      mockTranslations.current = TR_TRANSLATIONS
      renderWithRouter(<CompareSection />)
      expect(screen.queryByText('Ready to understand your policies?')).not.toBeInTheDocument()
      expect(screen.queryByText('Analyze Your Policy Free')).not.toBeInTheDocument()
      expect(screen.queryByText('Free, no signup required')).not.toBeInTheDocument()
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
