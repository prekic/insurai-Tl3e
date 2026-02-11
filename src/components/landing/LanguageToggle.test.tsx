/**
 * LanguageToggle Component Tests
 *
 * Tests for the language toggle button connected to i18n context
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageToggle } from './LanguageToggle'

let currentLocale = 'tr'
const mockSetLocale = vi.fn((locale: string) => {
  currentLocale = locale
})

vi.mock('@/lib/i18n/i18n-context', () => ({
  useI18n: () => ({
    locale: currentLocale,
    setLocale: mockSetLocale,
  }),
}))

describe('LanguageToggle', () => {
  beforeEach(() => {
    currentLocale = 'tr'
    mockSetLocale.mockClear()
  })

  describe('Rendering', () => {
    it('should render the toggle', () => {
      render(<LanguageToggle />)

      expect(screen.getByText('TR')).toBeInTheDocument()
      expect(screen.getByText('EN')).toBeInTheDocument()
    })
  })

  describe('Default State', () => {
    it('should have TR selected by default', () => {
      render(<LanguageToggle />)

      const trButton = screen.getByText('TR')
      expect(trButton).toHaveClass('bg-white')
      expect(trButton).toHaveClass('text-blue-600')
    })

    it('should have EN unselected by default', () => {
      render(<LanguageToggle />)

      const enButton = screen.getByText('EN')
      expect(enButton).toHaveClass('text-gray-600')
      expect(enButton).not.toHaveClass('bg-white')
    })
  })

  describe('Toggle Functionality', () => {
    it('should call setLocale with en when EN is clicked', () => {
      render(<LanguageToggle />)

      const enButton = screen.getByText('EN')
      fireEvent.click(enButton)

      expect(mockSetLocale).toHaveBeenCalledWith('en')
    })

    it('should show EN as selected when locale is en', () => {
      currentLocale = 'en'
      render(<LanguageToggle />)

      const enButton = screen.getByText('EN')
      expect(enButton).toHaveClass('bg-white')
      expect(enButton).toHaveClass('text-blue-600')
    })

    it('should call setLocale with tr when TR is clicked', () => {
      currentLocale = 'en'
      render(<LanguageToggle />)

      const trButton = screen.getByText('TR')
      fireEvent.click(trButton)

      expect(mockSetLocale).toHaveBeenCalledWith('tr')
    })

    it('should unselect TR when locale is EN', () => {
      currentLocale = 'en'
      render(<LanguageToggle />)

      const trButton = screen.getByText('TR')
      expect(trButton).not.toHaveClass('bg-white')
      expect(trButton).toHaveClass('text-gray-600')
    })
  })

  describe('Styling', () => {
    it('should have backdrop blur styling', () => {
      const { container } = render(<LanguageToggle />)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveClass('backdrop-blur-sm')
    })

    it('should have rounded border', () => {
      const { container } = render(<LanguageToggle />)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveClass('rounded-xl')
    })
  })
})
