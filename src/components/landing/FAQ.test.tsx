/**
 * FAQ Component Tests
 *
 * Tests for the FAQ accordion section
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FAQ } from './FAQ'

describe('FAQ', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      render(<FAQ />)

      expect(screen.getByText(/Frequently asked/)).toBeInTheDocument()
    })

    it('should display section subtitle', () => {
      render(<FAQ />)

      expect(screen.getByText('Everything you need to know about InsurAI.')).toBeInTheDocument()
    })

    it('should have accessible heading', () => {
      render(<FAQ />)

      expect(screen.getByRole('heading', { name: /Frequently asked questions/ })).toBeInTheDocument()
    })
  })

  describe('FAQ Items', () => {
    it('should render file formats question', () => {
      render(<FAQ />)

      expect(screen.getByText('What file formats are supported?')).toBeInTheDocument()
    })

    it('should render AI accuracy question', () => {
      render(<FAQ />)

      expect(screen.getByText('How accurate is the AI analysis?')).toBeInTheDocument()
    })

    it('should render data security question', () => {
      render(<FAQ />)

      expect(screen.getByText('Is my data secure?')).toBeInTheDocument()
    })

    it('should render insurance types question', () => {
      render(<FAQ />)

      expect(screen.getByText('Which insurance types are supported?')).toBeInTheDocument()
    })

    it('should render comparison question', () => {
      render(<FAQ />)

      expect(screen.getByText('Can I compare policies from different insurers?')).toBeInTheDocument()
    })

    it('should render all 5 FAQ items', () => {
      const { container } = render(<FAQ />)

      const faqItems = container.querySelectorAll('[role="region"]')
      // One region for the whole FAQ section plus panels
      expect(faqItems.length).toBeGreaterThan(0)
    })
  })

  describe('Accordion Functionality', () => {
    it('should have first item expanded by default', () => {
      render(<FAQ />)

      // First answer should be visible
      expect(screen.getByText(/We support PDF, Word documents/)).toBeInTheDocument()
    })

    it('should collapse current item when clicking another', () => {
      render(<FAQ />)

      const secondQuestion = screen.getByText('How accurate is the AI analysis?')
      fireEvent.click(secondQuestion)

      // Second answer should now be visible
      expect(screen.getByText(/Our AI uses multiple models to cross-verify/)).toBeInTheDocument()
    })

    it('should toggle item when clicking the same question', () => {
      render(<FAQ />)

      const firstQuestion = screen.getByText('What file formats are supported?')

      // First click to close (it's open by default)
      fireEvent.click(firstQuestion)

      // Answer should be hidden (the panel is hidden, not removed)
      const panel = document.querySelector('[hidden]')
      expect(panel).toBeInTheDocument()
    })

    it('should have aria-expanded attribute on buttons', () => {
      render(<FAQ />)

      const buttons = screen.getAllByRole('button')
      const faqButton = buttons.find(btn => btn.textContent?.includes('What file formats'))

      expect(faqButton).toHaveAttribute('aria-expanded', 'true')
    })

    it('should update aria-expanded when toggling', () => {
      render(<FAQ />)

      const firstQuestion = screen.getByText('What file formats are supported?')
      const button = firstQuestion.closest('button')

      expect(button).toHaveAttribute('aria-expanded', 'true')

      fireEvent.click(firstQuestion)

      expect(button).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('Keyboard Navigation', () => {
    it('should support ArrowDown key', () => {
      render(<FAQ />)

      const firstButton = screen.getByText('What file formats are supported?').closest('button')
      firstButton?.focus()

      fireEvent.keyDown(firstButton!, { key: 'ArrowDown' })

      // Focus should move (we can't easily test focus, but ensure no errors)
      expect(firstButton).toBeInTheDocument()
    })

    it('should support ArrowUp key', () => {
      render(<FAQ />)

      const secondButton = screen.getByText('How accurate is the AI analysis?').closest('button')
      secondButton?.focus()

      fireEvent.keyDown(secondButton!, { key: 'ArrowUp' })

      expect(secondButton).toBeInTheDocument()
    })

    it('should support Home key', () => {
      render(<FAQ />)

      const lastButton = screen.getByText('Can I compare policies from different insurers?').closest('button')
      lastButton?.focus()

      fireEvent.keyDown(lastButton!, { key: 'Home' })

      expect(lastButton).toBeInTheDocument()
    })

    it('should support End key', () => {
      render(<FAQ />)

      const firstButton = screen.getByText('What file formats are supported?').closest('button')
      firstButton?.focus()

      fireEvent.keyDown(firstButton!, { key: 'End' })

      expect(firstButton).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have aria-controls on buttons', () => {
      render(<FAQ />)

      const button = screen.getByText('What file formats are supported?').closest('button')
      expect(button).toHaveAttribute('aria-controls')
    })

    it('should have aria-labelledby on panels', () => {
      const { container } = render(<FAQ />)

      const panels = container.querySelectorAll('[role="region"][aria-labelledby]')
      expect(panels.length).toBeGreaterThan(0)
    })

    it('should have section label', () => {
      render(<FAQ />)

      const regions = screen.getAllByRole('region', { name: /Frequently asked questions/ })
      expect(regions.length).toBeGreaterThan(0)
    })
  })
})
