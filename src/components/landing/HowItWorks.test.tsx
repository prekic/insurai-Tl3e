/**
 * HowItWorks Component Tests
 *
 * Tests for the how it works section
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorks } from './HowItWorks'

describe('HowItWorks', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      render(<HowItWorks />)

      expect(screen.getByText(/Three steps to/)).toBeInTheDocument()
    })

    it('should have section id for navigation', () => {
      const { container } = render(<HowItWorks />)

      const section = container.querySelector('#how-it-works')
      expect(section).toBeInTheDocument()
    })

    it('should display Simple Process badge', () => {
      render(<HowItWorks />)

      expect(screen.getByText('Simple Process')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      render(<HowItWorks />)

      expect(screen.getByText(/No jargon, no manuals/)).toBeInTheDocument()
    })
  })

  describe('Step Cards', () => {
    it('should render Upload policies step', () => {
      render(<HowItWorks />)

      expect(screen.getByText('Upload policies')).toBeInTheDocument()
      expect(screen.getByText(/Drop your insurance documents/)).toBeInTheDocument()
    })

    it('should render AI analyzes coverage step', () => {
      render(<HowItWorks />)

      expect(screen.getByText('AI analyzes coverage')).toBeInTheDocument()
      expect(screen.getByText(/Our AI extracts limits, deductibles/)).toBeInTheDocument()
    })

    it('should render Compare & track step', () => {
      render(<HowItWorks />)

      expect(screen.getByText('Compare & track')).toBeInTheDocument()
      expect(screen.getByText(/Compare policies side-by-side/)).toBeInTheDocument()
    })

    it('should render all 3 step cards', () => {
      const { container } = render(<HowItWorks />)

      const cards = container.querySelectorAll('.bg-white.rounded-2xl')
      expect(cards.length).toBe(3)
    })
  })

  describe('Step Numbers', () => {
    it('should display step 1', () => {
      render(<HowItWorks />)

      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('should display step 2', () => {
      render(<HowItWorks />)

      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('should display step 3', () => {
      render(<HowItWorks />)

      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should have gradient background', () => {
      const { container } = render(<HowItWorks />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-gradient-to-b')
    })

    it('should use grid layout for cards', () => {
      const { container } = render(<HowItWorks />)

      const grid = container.querySelector('.grid.md\\:grid-cols-3')
      expect(grid).toBeInTheDocument()
    })
  })
})
