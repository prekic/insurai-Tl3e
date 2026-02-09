/**
 * Testimonials Component Tests
 *
 * Tests for the use cases section (formerly testimonials)
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Testimonials } from './Testimonials'

describe('Testimonials', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      render(<Testimonials />)

      expect(screen.getByText(/What you can/)).toBeInTheDocument()
    })

    it('should display highlighted text', () => {
      render(<Testimonials />)

      expect(screen.getByText('do with InsurAI')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      render(<Testimonials />)

      expect(screen.getByText('Real use cases for insurance professionals and policyholders.')).toBeInTheDocument()
    })
  })

  describe('Use Case Cards', () => {
    it('should render Insurance Brokers use case', () => {
      render(<Testimonials />)

      expect(screen.getByText('Insurance Brokers')).toBeInTheDocument()
      expect(screen.getByText(/Upload client policies, get instant coverage gap reports/)).toBeInTheDocument()
    })

    it('should render Corporate Risk Managers use case', () => {
      render(<Testimonials />)

      expect(screen.getByText('Corporate Risk Managers')).toBeInTheDocument()
      expect(screen.getByText(/Analyze complex commercial policies against market benchmarks/)).toBeInTheDocument()
    })

    it('should render Individual Policyholders use case', () => {
      render(<Testimonials />)

      expect(screen.getByText('Individual Policyholders')).toBeInTheDocument()
      expect(screen.getByText(/Upload your kasko or health policy/)).toBeInTheDocument()
    })

    it('should render all 3 use case cards', () => {
      const { container } = render(<Testimonials />)

      const cards = container.querySelectorAll('.rounded-2xl.shadow-lg')
      expect(cards.length).toBe(3)
    })
  })

  describe('Styling', () => {
    it('should have white background', () => {
      const { container } = render(<Testimonials />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-white')
    })

    it('should use grid layout', () => {
      const { container } = render(<Testimonials />)

      const grid = container.querySelector('.grid.md\\:grid-cols-3')
      expect(grid).toBeInTheDocument()
    })
  })
})
