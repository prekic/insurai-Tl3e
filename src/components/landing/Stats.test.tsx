/**
 * Stats Component Tests
 *
 * Tests for the capabilities section (formerly statistics counters)
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stats } from './Stats'

describe('Stats', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      const { container } = render(<Stats />)

      const section = container.querySelector('section')
      expect(section).toBeInTheDocument()
    })
  })

  describe('Capabilities', () => {
    it('should display policy types supported', () => {
      render(<Stats />)

      expect(screen.getByText('Policy Types Supported')).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
    })

    it('should display languages', () => {
      render(<Stats />)

      expect(screen.getByText('Languages')).toBeInTheDocument()
      expect(screen.getByText('TR / EN')).toBeInTheDocument()
    })

    it('should display coverage checks', () => {
      render(<Stats />)

      expect(screen.getByText('Coverage Checks')).toBeInTheDocument()
      expect(screen.getByText('15+')).toBeInTheDocument()
    })

    it('should display analysis time', () => {
      render(<Stats />)

      expect(screen.getByText('Analysis Time')).toBeInTheDocument()
      expect(screen.getByText('<60s')).toBeInTheDocument()
    })

    it('should render all 4 capability items', () => {
      const { container } = render(<Stats />)

      const items = container.querySelectorAll('.text-center')
      expect(items.length).toBe(4)
    })
  })

  describe('Styling', () => {
    it('should have gradient background', () => {
      const { container } = render(<Stats />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-gradient-to-b')
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
