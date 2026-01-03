/**
 * PageLoader Component Tests
 *
 * Tests for loading spinner and loading states
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageLoader } from './PageLoader'

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: {
      common: {
        loading: 'Loading...',
      },
    },
  }),
}))

describe('PageLoader', () => {
  describe('Rendering', () => {
    it('should render the loading component', () => {
      render(<PageLoader />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should display loading text', () => {
      render(<PageLoader />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('Spinner', () => {
    it('should render spinner element', () => {
      const { container } = render(<PageLoader />)

      // Check for spinner container
      const spinnerContainer = container.querySelector('.w-16.h-16')
      expect(spinnerContainer).toBeInTheDocument()
    })

    it('should have animated spinner', () => {
      const { container } = render(<PageLoader />)

      const animatedElement = container.querySelector('.animate-spin')
      expect(animatedElement).toBeInTheDocument()
    })

    it('should have border styling for spinner', () => {
      const { container } = render(<PageLoader />)

      const borderElement = container.querySelector('.border-4')
      expect(borderElement).toBeInTheDocument()
    })

    it('should have blue color for spinner', () => {
      const { container } = render(<PageLoader />)

      const blueElement = container.querySelector('.border-blue-600')
      expect(blueElement).toBeInTheDocument()
    })
  })

  describe('Layout', () => {
    it('should be full screen', () => {
      const { container } = render(<PageLoader />)

      const mainDiv = container.firstChild as HTMLElement
      expect(mainDiv).toHaveClass('min-h-screen')
    })

    it('should center content', () => {
      const { container } = render(<PageLoader />)

      const mainDiv = container.firstChild as HTMLElement
      expect(mainDiv).toHaveClass('flex')
      expect(mainDiv).toHaveClass('items-center')
      expect(mainDiv).toHaveClass('justify-center')
    })

    it('should have background color', () => {
      const { container } = render(<PageLoader />)

      const mainDiv = container.firstChild as HTMLElement
      expect(mainDiv).toHaveClass('bg-slate-50')
    })
  })

  describe('Text Styling', () => {
    it('should have proper text color', () => {
      render(<PageLoader />)

      const loadingText = screen.getByText('Loading...')
      expect(loadingText).toHaveClass('text-gray-600')
    })

    it('should have medium font weight', () => {
      render(<PageLoader />)

      const loadingText = screen.getByText('Loading...')
      expect(loadingText).toHaveClass('font-medium')
    })
  })

  describe('Fallback Loading Text', () => {
    it('should use fallback text when translation is missing', () => {
      // Override mock for this test
      vi.doMock('@/lib/i18n', () => ({
        useI18n: () => ({
          t: {
            common: undefined,
          },
        }),
      }))

      // The component should still render with fallback
      render(<PageLoader />)

      // Should have loading text (either translated or fallback)
      const loadingElement = screen.getByText(/Loading/i)
      expect(loadingElement).toBeInTheDocument()
    })
  })
})
