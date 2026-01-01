/**
 * Analytics Hooks Tests
 * Tests for tracking and A/B testing hooks
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Create mock functions using vi.hoisted so they're available in vi.mock
const {
  mockInitialize,
  mockDestroy,
  mockGetSessionInfo,
  mockGetStats,
  mockTrackPageView,
  mockTrackFeature,
  mockTrackAction,
  mockTrackError,
  mockStartTiming,
  mockExperimentsInit,
  mockGetVariant,
  mockIsInTreatment,
  mockTrackConversion,
} = vi.hoisted(() => ({
  mockInitialize: vi.fn(),
  mockDestroy: vi.fn(),
  mockGetSessionInfo: vi.fn().mockReturnValue({
    sessionId: 'session-123',
    startTime: Date.now(),
    pageViews: 5,
    features: ['dashboard', 'policies'],
  }),
  mockGetStats: vi.fn().mockResolvedValue({
    totalEvents: 100,
    uniqueUsers: 25,
    topFeatures: ['dashboard', 'upload'],
  }),
  mockTrackPageView: vi.fn(),
  mockTrackFeature: vi.fn(),
  mockTrackAction: vi.fn(),
  mockTrackError: vi.fn(),
  mockStartTiming: vi.fn().mockReturnValue(() => 150),
  mockExperimentsInit: vi.fn(),
  mockGetVariant: vi.fn().mockReturnValue({
    name: 'Treatment',
    weight: 0.5,
    config: { enabled: true },
  }),
  mockIsInTreatment: vi.fn().mockReturnValue(true),
  mockTrackConversion: vi.fn(),
}))

// Mock the analytics tracker
vi.mock('@/lib/analytics/tracker', () => ({
  analytics: {
    initialize: mockInitialize,
    destroy: mockDestroy,
    getSessionInfo: mockGetSessionInfo,
    getStats: mockGetStats,
  },
  trackPageView: mockTrackPageView,
  trackFeature: mockTrackFeature,
  trackAction: mockTrackAction,
  trackError: mockTrackError,
  startTiming: mockStartTiming,
}))

// Mock the experiments module
vi.mock('@/lib/analytics/experiments', () => ({
  experiments: {
    initialize: mockExperimentsInit,
  },
  getVariant: mockGetVariant,
  isInTreatment: mockIsInTreatment,
  trackConversion: mockTrackConversion,
}))

// Import after mocking
import {
  useAnalytics,
  usePageView,
  useSession,
  useUsageStats,
  useFeatureTracking,
  useActionTracking,
  useErrorTracking,
  useExperiment,
  useABTest,
  useFeatureFlag,
  useMultiVariant,
  useTracker,
} from './useAnalytics'

describe('useAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize analytics on mount', () => {
    renderHook(() => useAnalytics())

    expect(mockInitialize).toHaveBeenCalled()
  })

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => useAnalytics())

    unmount()

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('should accept custom config', () => {
    renderHook(() => useAnalytics({ debug: true }))

    expect(mockInitialize).toHaveBeenCalledWith({ debug: true })
  })
})

describe('usePageView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should track page view on mount', () => {
    renderHook(() => usePageView('/dashboard'))

    expect(mockTrackPageView).toHaveBeenCalledWith('/dashboard', undefined)
  })

  it('should track with title', () => {
    renderHook(() => usePageView('/policies', 'Policies'))

    expect(mockTrackPageView).toHaveBeenCalledWith('/policies', 'Policies')
  })

  it('should re-track when page changes', () => {
    const { rerender } = renderHook(
      ({ page }) => usePageView(page),
      { initialProps: { page: '/dashboard' } }
    )

    rerender({ page: '/policies' })

    expect(mockTrackPageView).toHaveBeenCalledTimes(2)
  })
})

describe('useSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return session info', () => {
    const { result } = renderHook(() => useSession())

    expect(result.current).toBeDefined()
    expect(result.current?.sessionId).toBe('session-123')
  })

  it('should update periodically', () => {
    const { result } = renderHook(() => useSession())

    expect(result.current).toBeDefined()

    // Advance timer
    vi.advanceTimersByTime(10000)

    expect(result.current).toBeDefined()
  })
})

describe('useUsageStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should load stats on mount', async () => {
    const { result } = renderHook(() => useUsageStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.stats).toBeDefined()
    expect(result.current.stats?.totalEvents).toBe(100)
  })

  it('should handle errors', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('Failed'))

    const { result } = renderHook(() => useUsageStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeDefined()
  })

  it('should provide refresh function', async () => {
    const { result } = renderHook(() => useUsageStats())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.loading).toBe(false)
  })
})

describe('useFeatureTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should track view on mount', () => {
    renderHook(() => useFeatureTracking('dashboard'))

    expect(mockTrackFeature).toHaveBeenCalledWith('dashboard', 'view', expect.any(Object))
  })

  it('should provide trackUsage function', () => {
    const { result } = renderHook(() => useFeatureTracking('dashboard'))

    act(() => {
      result.current.trackUsage('click')
    })

    expect(mockTrackFeature).toHaveBeenCalledWith('dashboard', 'click', expect.any(Object))
  })

  it('should provide trackSuccess function', () => {
    const { result } = renderHook(() => useFeatureTracking('upload'))

    act(() => {
      result.current.trackSuccess({ fileSize: 1024 })
    })

    expect(mockTrackFeature).toHaveBeenCalledWith('upload', 'submit', expect.objectContaining({
      success: true,
    }))
  })

  it('should provide trackFailure function', () => {
    const { result } = renderHook(() => useFeatureTracking('upload'))

    act(() => {
      result.current.trackFailure(new Error('Upload failed'))
    })

    expect(mockTrackFeature).toHaveBeenCalledWith('upload', 'submit', expect.objectContaining({
      success: false,
    }))
    expect(mockTrackError).toHaveBeenCalled()
  })

  it('should provide startTiming function', () => {
    const { result } = renderHook(() => useFeatureTracking('dashboard'))

    const stopTiming = result.current.startTiming()

    expect(typeof stopTiming).toBe('function')
  })
})

describe('useActionTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide track function', () => {
    const { result } = renderHook(() => useActionTracking())

    act(() => {
      result.current.track('click', 'submit-button')
    })

    expect(mockTrackAction).toHaveBeenCalledWith('click', 'submit-button', undefined)
  })

  it('should provide trackClick function', () => {
    const { result } = renderHook(() => useActionTracking())

    act(() => {
      result.current.trackClick('nav-link', { destination: '/policies' })
    })

    expect(mockTrackAction).toHaveBeenCalledWith('click', 'nav-link', { destination: '/policies' })
  })

  it('should provide trackSubmit function', () => {
    const { result } = renderHook(() => useActionTracking())

    act(() => {
      result.current.trackSubmit('login-form', true)
    })

    expect(mockTrackAction).toHaveBeenCalledWith('submit', 'login-form', { success: true })
  })
})

describe('useErrorTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should track errors', () => {
    const { result } = renderHook(() => useErrorTracking())

    act(() => {
      result.current.track(new Error('Test error'), { component: 'Form' })
    })

    expect(mockTrackError).toHaveBeenCalled()
  })

  it('should track string errors', () => {
    const { result } = renderHook(() => useErrorTracking())

    act(() => {
      result.current.track('Something went wrong')
    })

    expect(mockTrackError).toHaveBeenCalledWith('Something went wrong', undefined)
  })
})

describe('useExperiment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return experiment variant', async () => {
    const { result } = renderHook(() => useExperiment('test-exp'))

    await waitFor(() => {
      expect(result.current.variant).toBeDefined()
    })

    expect(result.current.variant?.name).toBe('Treatment')
  })

  it('should identify treatment variant', async () => {
    const { result } = renderHook(() => useExperiment('test-exp'))

    await waitFor(() => {
      expect(result.current.variant).toBeDefined()
    })

    expect(result.current.isTreatment).toBe(true)
    expect(result.current.isControl).toBe(false)
  })

  it('should provide trackConversion function', async () => {
    const { result } = renderHook(() => useExperiment('test-exp'))

    await waitFor(() => {
      expect(result.current.variant).toBeDefined()
    })

    act(() => {
      result.current.trackConversion('purchase', 100)
    })

    expect(mockTrackConversion).toHaveBeenCalledWith('test-exp', 'purchase', 100)
  })
})

describe('useABTest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return boolean for treatment', async () => {
    const { result } = renderHook(() => useABTest('test-exp'))

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })
})

describe('useFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return feature flag value', async () => {
    const { result } = renderHook(() => useFeatureFlag('new-feature'))

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('should use default value when no variant', async () => {
    mockGetVariant.mockReturnValueOnce(null)

    const { result } = renderHook(() => useFeatureFlag('new-feature', false))

    expect(result.current).toBe(false)
  })
})

describe('useMultiVariant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return variant name', async () => {
    const { result } = renderHook(() =>
      useMultiVariant('test-exp', 'Control')
    )

    await waitFor(() => {
      expect(result.current).toBe('Treatment')
    })
  })

  it('should use default when no variant', async () => {
    mockGetVariant.mockReturnValueOnce(null)

    const { result } = renderHook(() =>
      useMultiVariant('test-exp', 'Default')
    )

    expect(result.current).toBe('Default')
  })
})

describe('useTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide all tracking functions', () => {
    const { result } = renderHook(() => useTracker())

    expect(typeof result.current.trackPageView).toBe('function')
    expect(typeof result.current.trackFeature).toBe('function')
    expect(typeof result.current.trackAction).toBe('function')
    expect(typeof result.current.trackError).toBe('function')
    expect(typeof result.current.startTiming).toBe('function')
  })

  it('should provide experiment functions', () => {
    const { result } = renderHook(() => useTracker())

    expect(typeof result.current.getVariant).toBe('function')
    expect(typeof result.current.isInTreatment).toBe('function')
    expect(typeof result.current.trackConversion).toBe('function')
  })

  it('should provide session info', () => {
    const { result } = renderHook(() => useTracker())

    expect(result.current.session).toBeDefined()
  })
})
