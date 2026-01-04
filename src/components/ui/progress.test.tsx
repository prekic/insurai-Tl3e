/**
 * Progress Component Tests
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Progress } from './progress'

describe('Progress', () => {
  it('should render a progress bar', () => {
    render(<Progress value={50} data-testid="progress" />)
    const progressBar = screen.getByTestId('progress')
    expect(progressBar).toBeInTheDocument()
  })

  it('should render with 0 value', () => {
    render(<Progress value={0} data-testid="progress" />)
    const progressBar = screen.getByTestId('progress')
    expect(progressBar).toBeInTheDocument()
  })

  it('should render with 100 value', () => {
    render(<Progress value={100} data-testid="progress" />)
    const progressBar = screen.getByTestId('progress')
    expect(progressBar).toBeInTheDocument()
  })

  it('should render without value (undefined)', () => {
    render(<Progress data-testid="progress" />)
    const progressBar = screen.getByTestId('progress')
    expect(progressBar).toBeInTheDocument()
  })

  it('should accept custom className', () => {
    render(<Progress value={50} className="custom-class" data-testid="progress" />)
    const progressBar = screen.getByTestId('progress')
    expect(progressBar).toHaveClass('custom-class')
  })
})
