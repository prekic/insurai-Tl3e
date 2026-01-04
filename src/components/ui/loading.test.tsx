/**
 * Loading Components Tests
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Spinner,
  PageLoading,
  CardSkeleton,
  PolicyCardSkeleton,
  StatsSkeleton,
  TableSkeleton,
  AIProcessingLoader,
  InlineLoader,
  ButtonLoader,
} from './loading'

describe('Spinner', () => {
  it('should render with default size', () => {
    render(<Spinner />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toBeInTheDocument()
  })

  it('should render with small size', () => {
    render(<Spinner size="sm" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('w-4', 'h-4')
  })

  it('should render with medium size', () => {
    render(<Spinner size="md" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('w-6', 'h-6')
  })

  it('should render with large size', () => {
    render(<Spinner size="lg" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('w-8', 'h-8')
  })

  it('should render with xl size', () => {
    render(<Spinner size="xl" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('w-12', 'h-12')
  })

  it('should accept custom className', () => {
    render(<Spinner className="custom-class" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('custom-class')
  })
})

describe('PageLoading', () => {
  it('should render with default message', () => {
    render(<PageLoading />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should render with custom message', () => {
    render(<PageLoading message="Please wait" />)
    expect(screen.getByText('Please wait')).toBeInTheDocument()
  })
})

describe('CardSkeleton', () => {
  it('should render with default rows', () => {
    const { container } = render(<CardSkeleton />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('should render with custom rows', () => {
    const { container } = render(<CardSkeleton rows={5} />)
    expect(container.firstChild).toBeInTheDocument()
  })
})

describe('PolicyCardSkeleton', () => {
  it('should render skeleton', () => {
    const { container } = render(<PolicyCardSkeleton />)
    expect(container.firstChild).toBeInTheDocument()
  })
})

describe('StatsSkeleton', () => {
  it('should render 4 stat skeletons', () => {
    const { container } = render(<StatsSkeleton />)
    expect(container.firstChild).toBeInTheDocument()
  })
})

describe('TableSkeleton', () => {
  it('should render with default rows and cols', () => {
    const { container } = render(<TableSkeleton />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('should render with custom rows and cols', () => {
    const { container } = render(<TableSkeleton rows={3} cols={6} />)
    expect(container.firstChild).toBeInTheDocument()
  })
})

describe('AIProcessingLoader', () => {
  it('should render with default stage (analyzing)', () => {
    render(<AIProcessingLoader />)
    expect(screen.getByText('AI is analyzing your document...')).toBeInTheDocument()
  })

  it('should render uploading stage', () => {
    render(<AIProcessingLoader stage="uploading" />)
    expect(screen.getByText('Uploading document...')).toBeInTheDocument()
  })

  it('should render analyzing stage', () => {
    render(<AIProcessingLoader stage="analyzing" />)
    expect(screen.getByText('AI is analyzing your document...')).toBeInTheDocument()
  })

  it('should render extracting stage', () => {
    render(<AIProcessingLoader stage="extracting" />)
    expect(screen.getByText('Extracting policy data...')).toBeInTheDocument()
  })
})

describe('InlineLoader', () => {
  it('should render with default text', () => {
    render(<InlineLoader />)
    expect(screen.getByText('Loading')).toBeInTheDocument()
  })

  it('should render with custom text', () => {
    render(<InlineLoader text="Processing" />)
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })
})

describe('ButtonLoader', () => {
  it('should render loader icon', () => {
    const { container } = render(<ButtonLoader />)
    expect(container.firstChild).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
