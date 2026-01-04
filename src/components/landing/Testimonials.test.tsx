/**
 * Testimonials Component Tests
 *
 * Tests for the testimonials section
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Testimonials } from './Testimonials'

describe('Testimonials', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      render(<Testimonials />)

      expect(screen.getByText(/Trusted by/)).toBeInTheDocument()
    })

    it('should display "thousands" highlighted', () => {
      render(<Testimonials />)

      expect(screen.getByText('thousands')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      render(<Testimonials />)

      expect(screen.getByText('See what our users have to say about InsurAI.')).toBeInTheDocument()
    })
  })

  describe('Testimonial Cards', () => {
    it('should render Ahmet Yilmaz testimonial', () => {
      render(<Testimonials />)

      expect(screen.getByText('Ahmet Yilmaz')).toBeInTheDocument()
      expect(screen.getByText('Insurance Broker, Yilmaz Sigorta')).toBeInTheDocument()
      expect(screen.getByText(/InsurAI has transformed how I analyze policies/)).toBeInTheDocument()
    })

    it('should render Elif Demir testimonial', () => {
      render(<Testimonials />)

      expect(screen.getByText('Elif Demir')).toBeInTheDocument()
      expect(screen.getByText('Risk Manager, Koc Holding')).toBeInTheDocument()
      expect(screen.getByText(/The AI-powered analysis catches details/)).toBeInTheDocument()
    })

    it('should render Mehmet Ozturk testimonial', () => {
      render(<Testimonials />)

      expect(screen.getByText('Mehmet Ozturk')).toBeInTheDocument()
      expect(screen.getByText('Individual User')).toBeInTheDocument()
      expect(screen.getByText(/Finally, I can understand my insurance policies/)).toBeInTheDocument()
    })

    it('should render all 3 testimonial cards', () => {
      const { container } = render(<Testimonials />)

      const cards = container.querySelectorAll('.rounded-2xl.shadow-lg')
      expect(cards.length).toBe(3)
    })
  })

  describe('Star Ratings', () => {
    it('should render 5-star ratings for all testimonials', () => {
      const { container } = render(<Testimonials />)

      // Each testimonial has 5 stars, so 15 total
      const stars = container.querySelectorAll('.lucide-star')
      expect(stars.length).toBe(15)
    })

    it('should have filled yellow stars', () => {
      const { container } = render(<Testimonials />)

      const stars = container.querySelectorAll('.text-yellow-400.fill-yellow-400')
      expect(stars.length).toBe(15)
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
