/**
 * LanguageToggle Component Tests
 *
 * Tests for the language toggle button
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageToggle } from './LanguageToggle'

describe('LanguageToggle', () => {
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
    it('should switch to EN when EN is clicked', () => {
      render(<LanguageToggle />)

      const enButton = screen.getByText('EN')
      fireEvent.click(enButton)

      expect(enButton).toHaveClass('bg-white')
      expect(enButton).toHaveClass('text-blue-600')
    })

    it('should switch back to TR when TR is clicked', () => {
      render(<LanguageToggle />)

      const enButton = screen.getByText('EN')
      const trButton = screen.getByText('TR')

      fireEvent.click(enButton)
      fireEvent.click(trButton)

      expect(trButton).toHaveClass('bg-white')
      expect(trButton).toHaveClass('text-blue-600')
    })

    it('should unselect TR when EN is selected', () => {
      render(<LanguageToggle />)

      const enButton = screen.getByText('EN')
      const trButton = screen.getByText('TR')

      fireEvent.click(enButton)

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
