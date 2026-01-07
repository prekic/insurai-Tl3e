import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { useLazySection, LazySection, LazySectionPlaceholder } from './useLazySection'

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn()
const mockObserve = vi.fn()
const mockDisconnect = vi.fn()
const mockUnobserve = vi.fn()

// Test component that attaches the ref to an element
function TestHookComponent({ options = {} }: { options?: Parameters<typeof useLazySection>[0] }) {
  const { ref, isInView } = useLazySection(options)
  return (
    <div ref={ref} data-testid="target">
      {isInView ? 'visible' : 'hidden'}
    </div>
  )
}

describe('useLazySection', () => {
  beforeEach(() => {
    mockObserve.mockClear()
    mockDisconnect.mockClear()
    mockUnobserve.mockClear()

    mockIntersectionObserver.mockImplementation((_callback) => ({
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: mockUnobserve,
    }))

    vi.stubGlobal('IntersectionObserver', mockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return ref and isInView state', () => {
    const { result } = renderHook(() => useLazySection())

    expect(result.current.ref).toBeDefined()
    expect(result.current.isInView).toBe(false)
  })

  it('should start with isInView as false', () => {
    render(<TestHookComponent />)

    expect(screen.getByTestId('target')).toHaveTextContent('hidden')
  })

  it('should use default rootMargin when not specified', () => {
    render(<TestHookComponent />)

    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ rootMargin: '100px' })
    )
  })

  it('should use custom rootMargin when specified', () => {
    render(<TestHookComponent options={{ rootMargin: '200px' }} />)

    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ rootMargin: '200px' })
    )
  })

  it('should use custom threshold when specified', () => {
    render(<TestHookComponent options={{ threshold: 0.5 }} />)

    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ threshold: 0.5 })
    )
  })

  it('should observe the element', () => {
    render(<TestHookComponent />)

    expect(mockObserve).toHaveBeenCalled()
  })

  it('should disconnect observer on unmount', () => {
    const { unmount } = render(<TestHookComponent />)

    unmount()

    expect(mockDisconnect).toHaveBeenCalled()
  })
})

// Note: Testing without IntersectionObserver is difficult in JSDOM
// as it provides a polyfill. The hook handles this case by showing
// content immediately when IntersectionObserver is undefined.

describe('LazySectionPlaceholder', () => {
  it('should render with default height', () => {
    render(<LazySectionPlaceholder />)

    const placeholder = document.querySelector('.bg-gray-100')
    expect(placeholder).toBeInTheDocument()
    expect(placeholder).toHaveStyle({ minHeight: '400px' })
  })

  it('should render with custom height', () => {
    render(<LazySectionPlaceholder height="600px" />)

    const placeholder = document.querySelector('.bg-gray-100')
    expect(placeholder).toHaveStyle({ minHeight: '600px' })
  })

  it('should have animate-pulse class', () => {
    render(<LazySectionPlaceholder />)

    const placeholder = document.querySelector('.animate-pulse')
    expect(placeholder).toBeInTheDocument()
  })
})

describe('LazySection', () => {
  beforeEach(() => {
    mockObserve.mockClear()
    mockDisconnect.mockClear()

    mockIntersectionObserver.mockImplementation((_callback) => ({
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: mockUnobserve,
    }))

    vi.stubGlobal('IntersectionObserver', mockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should render placeholder when not in view', () => {
    render(
      <LazySection>
        <div data-testid="content">Content</div>
      </LazySection>
    )

    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
    expect(document.querySelector('.bg-gray-100')).toBeInTheDocument()
  })

  it('should use custom height for placeholder', () => {
    render(
      <LazySection height="500px">
        <div>Content</div>
      </LazySection>
    )

    const placeholder = document.querySelector('.bg-gray-100')
    expect(placeholder).toHaveStyle({ minHeight: '500px' })
  })

  it('should use custom rootMargin', () => {
    render(
      <LazySection rootMargin="300px">
        <div>Content</div>
      </LazySection>
    )

    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ rootMargin: '300px' })
    )
  })
})

describe('LazySection when in view', () => {
  beforeEach(() => {
    let observerCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null

    mockIntersectionObserver.mockImplementation((callback) => {
      observerCallback = callback
      return {
        observe: () => {
          // Immediately trigger as intersecting
          if (observerCallback) {
            observerCallback([{ isIntersecting: true }])
          }
        },
        disconnect: mockDisconnect,
        unobserve: mockUnobserve,
      }
    })

    vi.stubGlobal('IntersectionObserver', mockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should render children when in view', () => {
    render(
      <LazySection>
        <div data-testid="content">Content</div>
      </LazySection>
    )

    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(document.querySelector('.bg-gray-100')).not.toBeInTheDocument()
  })

  it('should disconnect observer after becoming visible', () => {
    render(
      <LazySection>
        <div>Content</div>
      </LazySection>
    )

    expect(mockDisconnect).toHaveBeenCalled()
  })
})
