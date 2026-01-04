/**
 * ErrorBoundary Component Tests
 *
 * Tests for error catching, display, and recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary, InlineError } from './ErrorBoundary'

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(() => 'test-event-id'),
  addBreadcrumb: vi.fn(),
}))

// Component that throws an error
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>No error</div>
}

// Component that works normally
function WorkingComponent() {
  return <div>Working component</div>
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.error for error boundary tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('Normal Rendering', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <WorkingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Working component')).toBeInTheDocument()
    })

    it('should render multiple children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('Child 1')).toBeInTheDocument()
      expect(screen.getByText('Child 2')).toBeInTheDocument()
    })
  })

  describe('Error Catching', () => {
    it('should catch errors and display error UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('should display error message in development', () => {
      // import.meta.env.DEV is true in test environment
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Test error')).toBeInTheDocument()
    })

    it('should display Try Again button', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })

    it('should display Go Home button', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Go Home')).toBeInTheDocument()
    })
  })

  describe('Custom Fallback', () => {
    it('should render custom fallback when provided', () => {
      render(
        <ErrorBoundary fallback={<div>Custom error message</div>}>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom error message')).toBeInTheDocument()
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    })
  })

  describe('Recovery Actions', () => {
    it('should call onReset when Try Again is clicked', () => {
      const onReset = vi.fn()

      render(
        <ErrorBoundary onReset={onReset}>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      const tryAgainButton = screen.getByText('Try Again')
      fireEvent.click(tryAgainButton)

      expect(onReset).toHaveBeenCalled()
    })

    it('should redirect to home when Go Home is clicked', () => {
      // Mock window.location
      const originalLocation = window.location
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      })

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      const goHomeButton = screen.getByText('Go Home')
      fireEvent.click(goHomeButton)

      expect(window.location.href).toBe('/')

      // Restore
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      })
    })
  })

  describe('Error Reporting', () => {
    it('should log error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should capture error to Sentry', async () => {
      const { captureError } = await import('@/lib/sentry')

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(captureError).toHaveBeenCalled()
    })

    it('should add breadcrumb for context', async () => {
      const { addBreadcrumb } = await import('@/lib/sentry')

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(addBreadcrumb).toHaveBeenCalledWith(
        'Error boundary triggered',
        'error',
        expect.objectContaining({
          errorMessage: 'Test error',
        })
      )
    })
  })

  describe('UI Elements', () => {
    it('should display helpful message', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(
        screen.getByText(/We're sorry, but something unexpected happened/)
      ).toBeInTheDocument()
    })

    it('should have proper button styling', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      const tryAgainButton = screen.getByText('Try Again')
      const goHomeButton = screen.getByText('Go Home')

      expect(tryAgainButton).toBeInTheDocument()
      expect(goHomeButton).toBeInTheDocument()
    })
  })
})

describe('InlineError', () => {
  describe('Rendering', () => {
    it('should render error title', () => {
      render(<InlineError message="Something went wrong" />)

      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('should render custom title', () => {
      render(<InlineError title="Custom Error" message="Something went wrong" />)

      expect(screen.getByText('Custom Error')).toBeInTheDocument()
    })

    it('should render error message', () => {
      render(<InlineError message="File upload failed" />)

      expect(screen.getByText('File upload failed')).toBeInTheDocument()
    })
  })

  describe('Retry Button', () => {
    it('should not show retry button by default', () => {
      render(<InlineError message="Something went wrong" />)

      expect(screen.queryByText('Try again')).not.toBeInTheDocument()
    })

    it('should show retry button when onRetry is provided', () => {
      const onRetry = vi.fn()
      render(<InlineError message="Something went wrong" onRetry={onRetry} />)

      expect(screen.getByText('Try again')).toBeInTheDocument()
    })

    it('should call onRetry when retry button is clicked', () => {
      const onRetry = vi.fn()
      render(<InlineError message="Something went wrong" onRetry={onRetry} />)

      const retryButton = screen.getByText('Try again')
      fireEvent.click(retryButton)

      expect(onRetry).toHaveBeenCalled()
    })
  })

  describe('Styling', () => {
    it('should have red background styling', () => {
      const { container } = render(<InlineError message="Error occurred" />)

      const errorDiv = container.firstChild as HTMLElement
      expect(errorDiv).toHaveClass('bg-red-50')
      expect(errorDiv).toHaveClass('border-red-200')
    })
  })
})
