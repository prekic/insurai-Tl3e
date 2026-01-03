/**
 * Analytics Tracker Tests
 *
 * Tests for usage metrics collection and tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock localStorage
const localStorageMock: Record<string, string> = {}
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock[key]
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageMock).forEach(key => delete localStorageMock[key])
  }),
}

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
})

// Mock sessionStorage
const sessionStorageMock: Record<string, string> = {}
const mockSessionStorage = {
  getItem: vi.fn((key: string) => sessionStorageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageMock[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete sessionStorageMock[key]
  }),
  clear: vi.fn(() => {
    Object.keys(sessionStorageMock).forEach(key => delete sessionStorageMock[key])
  }),
}

Object.defineProperty(global, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
})

// Mock IndexedDB as undefined (use localStorage fallback)
Object.defineProperty(global, 'indexedDB', {
  value: undefined,
  writable: true,
  configurable: true,
})

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    doNotTrack: null,
    languages: ['en-US'],
    language: 'en-US',
  },
  writable: true,
  configurable: true,
})

// Mock document
Object.defineProperty(global, 'document', {
  value: {
    referrer: 'https://google.com',
  },
  writable: true,
  configurable: true,
})

// Mock performance
Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn(() => Date.now()),
  },
  writable: true,
})

describe('Analytics Tracker', () => {
  // Use dynamic imports to get fresh module instance for each test
  let analytics: typeof import('./tracker').analytics
  let initializeAnalytics: typeof import('./tracker').initializeAnalytics
  let trackPageView: typeof import('./tracker').trackPageView
  let trackFeature: typeof import('./tracker').trackFeature
  let trackAction: typeof import('./tracker').trackAction
  let trackError: typeof import('./tracker').trackError
  let startTiming: typeof import('./tracker').startTiming

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    Object.keys(localStorageMock).forEach(key => delete localStorageMock[key])
    Object.keys(sessionStorageMock).forEach(key => delete sessionStorageMock[key])

    // Reset navigator
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        doNotTrack: null,
        languages: ['en-US'],
        language: 'en-US',
      },
      writable: true,
      configurable: true,
    })

    // Dynamic import for fresh instance
    const module = await import('./tracker')
    analytics = module.analytics
    initializeAnalytics = module.initializeAnalytics
    trackPageView = module.trackPageView
    trackFeature = module.trackFeature
    trackAction = module.trackAction
    trackError = module.trackError
    startTiming = module.startTiming
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (analytics) {
      analytics.destroy()
    }
  })

  describe('initializeAnalytics', () => {
    it('should initialize the tracker', async () => {
      await initializeAnalytics({ enabled: true })

      // Should have created a session
      expect(mockSessionStorage.setItem).toHaveBeenCalled()
    })

    it('should respect Do Not Track setting', async () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: '1',
        configurable: true,
      })

      await initializeAnalytics({ respectDoNotTrack: true })

      // Tracker should be disabled
      trackPageView('/test')
      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith(
        'insurai_analytics',
        expect.any(String)
      )
    })

    it('should use custom config', async () => {
      await initializeAnalytics({
        enabled: true,
        debug: true,
        sampleRate: 0.5,
      })

      // Should be initialized with custom config
      expect(analytics).toBeDefined()
    })
  })

  describe('trackPageView', () => {
    it('should track page views', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackPageView('/dashboard', 'Dashboard')

      const session = analytics.getSessionInfo()
      expect(session.pageViews).toBe(1)
    })

    it('should track multiple page views', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackPageView('/dashboard', 'Dashboard')
      trackPageView('/settings', 'Settings')
      trackPageView('/upload', 'Upload')

      const session = analytics.getSessionInfo()
      expect(session.pageViews).toBe(3)
    })

    it('should exclude paths in excludePaths config', async () => {
      await initializeAnalytics({
        enabled: true,
        excludePaths: ['/admin', '/debug'],
        flushInterval: 0,
      })

      trackPageView('/admin/users')
      trackPageView('/debug/logs')

      const session = analytics.getSessionInfo()
      expect(session.pageViews).toBe(0)
    })
  })

  describe('trackFeature', () => {
    it('should track feature usage', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackFeature('policy_upload', 'click')

      const session = analytics.getSessionInfo()
      expect(session.events).toBeGreaterThan(0)
    })

    it('should track feature with options', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackFeature('ai_extraction', 'complete', {
        success: true,
        duration: 1500,
        metadata: { provider: 'openai' },
      })

      const session = analytics.getSessionInfo()
      expect(session.events).toBeGreaterThan(0)
    })
  })

  describe('trackAction', () => {
    it('should track user actions', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackAction('click', 'upload_button')

      const session = analytics.getSessionInfo()
      expect(session.events).toBeGreaterThan(0)
    })

    it('should track action with metadata', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackAction('submit', 'login_form', { method: 'email' })

      const session = analytics.getSessionInfo()
      expect(session.events).toBeGreaterThan(0)
    })
  })

  describe('trackError', () => {
    it('should track errors', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackError(new Error('Test error'))

      const session = analytics.getSessionInfo()
      expect(session.events).toBeGreaterThan(0)
    })

    it('should track string errors', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackError('Something went wrong')

      const session = analytics.getSessionInfo()
      expect(session.events).toBeGreaterThan(0)
    })

    it('should track errors with context', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackError(new Error('API failed'), { endpoint: '/api/users' })

      const session = analytics.getSessionInfo()
      expect(session.events).toBeGreaterThan(0)
    })
  })

  describe('startTiming', () => {
    it('should return a timing function', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      const endTiming = startTiming('test_operation')

      expect(typeof endTiming).toBe('function')
    })

    it('should track timing when called', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      vi.mocked(performance.now)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(100)

      const endTiming = startTiming('test_operation')
      endTiming()

      const session = analytics.getSessionInfo()
      expect(session.events).toBeGreaterThan(0)
    })
  })

  describe('getSessionInfo', () => {
    it('should return session information', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      const session = analytics.getSessionInfo()

      expect(session).toHaveProperty('id')
      expect(session).toHaveProperty('startedAt')
      expect(session).toHaveProperty('pageViews')
      expect(session).toHaveProperty('events')
      expect(session).toHaveProperty('device')
    })

    it('should include device info', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      const session = analytics.getSessionInfo()

      expect(session.device).toHaveProperty('type')
      expect(session.device).toHaveProperty('browser')
      expect(session.device).toHaveProperty('os')
    })
  })

  describe('setUserId', () => {
    it('should set user ID for tracking', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      analytics.setUserId('user-123')

      const session = analytics.getSessionInfo()
      expect(session.userId).toBe('user-123')
    })

    it('should clear user ID when set to undefined', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      analytics.setUserId('user-123')
      analytics.setUserId(undefined)

      const session = analytics.getSessionInfo()
      expect(session.userId).toBeUndefined()
    })
  })

  describe('getStats', () => {
    it('should return usage statistics', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackPageView('/home')
      trackFeature('dashboard', 'view')

      await analytics.flush()
      const stats = await analytics.getStats()

      expect(stats).toHaveProperty('totalSessions')
      expect(stats).toHaveProperty('totalPageViews')
      expect(stats).toHaveProperty('totalEvents')
      expect(stats).toHaveProperty('topPages')
      expect(stats).toHaveProperty('topFeatures')
    })

    it('should filter by date range', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      const now = Date.now()
      const yesterday = new Date(now - 24 * 60 * 60 * 1000)

      const stats = await analytics.getStats(yesterday, new Date())

      expect(stats.period.start).toBe(yesterday.getTime())
      expect(stats.period.end).toBe(now)
    })
  })

  describe('clearData', () => {
    it('should clear all analytics data', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackPageView('/home')
      trackFeature('test', 'view')

      await analytics.clearData()

      const session = analytics.getSessionInfo()
      expect(session.pageViews).toBe(0)
      expect(session.events).toBe(0)
    })

    it('should clear localStorage data', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      localStorageMock['insurai_analytics'] = '[{"id":"1"}]'

      await analytics.clearData()

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('insurai_analytics')
    })
  })

  describe('flush', () => {
    it('should save events to localStorage', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      trackPageView('/home')

      await analytics.flush()

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'insurai_analytics',
        expect.any(String)
      )
    })

    it('should not flush empty buffer', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0, sampleRate: 0 })

      // Initial call count
      const initialCount = mockLocalStorage.setItem.mock.calls.filter(
        call => call[0] === 'insurai_analytics'
      ).length

      await analytics.flush()

      const afterCount = mockLocalStorage.setItem.mock.calls.filter(
        call => call[0] === 'insurai_analytics'
      ).length

      expect(afterCount).toBe(initialCount)
    })
  })

  describe('destroy', () => {
    it('should clean up resources', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 1000 })

      analytics.destroy()

      // Should not throw when destroyed
      expect(() => analytics.destroy()).not.toThrow()
    })
  })

  describe('Sample Rate', () => {
    it('should respect sample rate for events', async () => {
      await initializeAnalytics({
        enabled: true,
        sampleRate: 0, // 0% sampling
        flushInterval: 0,
      })

      // With 0% sample rate, events are not recorded to buffer
      // But pageViews counter is still incremented (it tracks method calls)
      trackPageView('/home')
      trackFeature('test', 'view')

      await analytics.flush()

      // The flush should not add anything to localStorage with 0% sample rate
      // because no events pass the sample check
      const analyticsData = localStorageMock['insurai_analytics']
      if (analyticsData) {
        const events = JSON.parse(analyticsData)
        // Events array should be empty (no sampled events)
        expect(events.length).toBe(0)
      }
    })
  })

  describe('Device Detection', () => {
    it('should detect desktop browser', async () => {
      await initializeAnalytics({ enabled: true, flushInterval: 0 })

      const session = analytics.getSessionInfo()

      expect(session.device.type).toBe('desktop')
      expect(session.device.browser).toBe('Chrome')
      expect(session.device.os).toBe('Windows')
    })

    it('should detect mobile browser', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        configurable: true,
      })

      // Need fresh import after changing userAgent
      vi.resetModules()
      const freshModule = await import('./tracker')
      await freshModule.initializeAnalytics({ enabled: true })

      const session = freshModule.analytics.getSessionInfo()

      expect(session.device.type).toBe('mobile')
      freshModule.analytics.destroy()
    })
  })
})
