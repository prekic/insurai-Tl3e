/**
 * WhoItsFor Component Tests
 *
 * Tests for the target audience section
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WhoItsFor } from './WhoItsFor'

describe('WhoItsFor', () => {
  describe('Rendering', () => {
    it('should render the section', () => {
      render(<WhoItsFor />)

      expect(screen.getByText(/Built for/)).toBeInTheDocument()
    })

    it('should display highlighted text', () => {
      render(<WhoItsFor />)

      expect(screen.getByText('insurance professionals')).toBeInTheDocument()
    })

    it('should display subtitle', () => {
      render(<WhoItsFor />)

      expect(screen.getByText(/Whether you're a broker, risk manager, or policyholder/)).toBeInTheDocument()
    })
  })

  describe('Audience Cards', () => {
    it('should render Insurance Brokers card', () => {
      render(<WhoItsFor />)

      expect(screen.getByText('Insurance Brokers')).toBeInTheDocument()
      expect(screen.getByText('Quickly analyze and compare policies for your clients.')).toBeInTheDocument()
    })

    it('should render Corporate Risk Managers card', () => {
      render(<WhoItsFor />)

      expect(screen.getByText('Corporate Risk Managers')).toBeInTheDocument()
      expect(screen.getByText('Manage complex policy portfolios with ease.')).toBeInTheDocument()
    })

    it('should render Individual Policyholders card', () => {
      render(<WhoItsFor />)

      expect(screen.getByText('Individual Policyholders')).toBeInTheDocument()
      expect(screen.getByText('Understand your coverage in plain language.')).toBeInTheDocument()
    })

    it('should render all 3 audience cards', () => {
      const { container } = render(<WhoItsFor />)

      const cards = container.querySelectorAll('.bg-white.rounded-2xl.shadow-lg')
      expect(cards.length).toBe(3)
    })
  })

  describe('Styling', () => {
    it('should have slate background', () => {
      const { container } = render(<WhoItsFor />)

      const section = container.querySelector('section')
      expect(section).toHaveClass('bg-slate-50')
    })

    it('should use grid layout', () => {
      const { container } = render(<WhoItsFor />)

      const grid = container.querySelector('.grid.md\\:grid-cols-3')
      expect(grid).toBeInTheDocument()
    })
  })
})
