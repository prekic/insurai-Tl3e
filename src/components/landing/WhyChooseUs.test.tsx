/**
 * WhyChooseUs Component Tests
 *
 * Tests for the why choose us section
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhyChooseUs } from './WhyChooseUs'

describe('WhyChooseUs', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      const { container } = render(<WhyChooseUs />)

      const section = container.querySelector('section')
      expect(section).toBeInTheDocument()
    })
  })

  describe('Feature Stats', () => {
    it('should display user rating', () => {
      render(<WhyChooseUs />)

      expect(screen.getByText('4.9/5')).toBeInTheDocument()
      expect(screen.getByText('User Rating')).toBeInTheDocument()
    })

    it('should display active users', () => {
      render(<WhyChooseUs />)

      expect(screen.getByText('15K+')).toBeInTheDocument()
      expect(screen.getByText('Active Users')).toBeInTheDocument()
    })

    it('should display insurance partners', () => {
      render(<WhyChooseUs />)

      expect(screen.getByText('50+')).toBeInTheDocument()
      expect(screen.getByText('Insurance Partners')).toBeInTheDocument()
    })

    it('should render all 3 feature items', () => {
      const { container } = render(<WhyChooseUs />)

      const items = container.querySelectorAll('.text-center.text-white')
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
