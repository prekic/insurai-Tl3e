/**
 * Stats Component Tests
 *
 * Tests for the statistics section
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stats } from './Stats'

// Mock NumberCounter
vi.mock('../animations/AnimatedComponents', () => ({
  NumberCounter: ({ value, suffix }: { value: number; suffix?: string }) => (
    <span data-testid="number-counter">{value}{suffix}</span>
  ),
}))

describe('Stats', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      const { container } = render(<Stats />)

      const section = container.querySelector('section')
      expect(section).toBeInTheDocument()
    })
  })

  describe('Statistics', () => {
    it('should display policies analyzed stat', () => {
      render(<Stats />)

      expect(screen.getByText('Policies Analyzed')).toBeInTheDocument()
      expect(screen.getByText('2300+')).toBeInTheDocument()
    })

    it('should display happy users stat', () => {
      render(<Stats />)

      expect(screen.getByText('Happy Users')).toBeInTheDocument()
      expect(screen.getByText('15K+')).toBeInTheDocument()
    })

    it('should display accuracy rate stat', () => {
      render(<Stats />)

      expect(screen.getByText('Accuracy Rate')).toBeInTheDocument()
      expect(screen.getByText('98%')).toBeInTheDocument()
    })

    it('should display AI support stat', () => {
      render(<Stats />)

      expect(screen.getByText('AI Support')).toBeInTheDocument()
      expect(screen.getByText('24/7')).toBeInTheDocument()
    })

    it('should render all 4 stat items', () => {
      render(<Stats />)

      const counters = screen.getAllByTestId('number-counter')
      expect(counters.length).toBe(4)
    })
  })

  describe('Styling', () => {
    it('should have white background', () => {
      const { container } = render(<Stats />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-white')
    })

    it('should have border styling', () => {
      const { container } = render(<Stats />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('border-y')
    })

    it('should use grid layout', () => {
      const { container } = render(<Stats />)

      const grid = container.querySelector('.grid')
      expect(grid).toHaveClass('grid-cols-2')
      expect(grid).toHaveClass('md:grid-cols-4')
    })
  })
})
