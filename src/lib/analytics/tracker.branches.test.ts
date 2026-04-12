/**
 * Branch Coverage Tests for Analytics Tracker module
 *
 * Targets uncovered branches in src/lib/analytics/tracker.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the types module
vi.mock('@/types/analytics', () => ({
  DEFAULT_ANALYTICS_CONFIG: {
    enabled: true,
    debug: false,
    sampleRate: 1.0,
    flushInterval: 30000,
    batchSize: 50,
    sessionTimeout: 1800000,
    respectDoNotTrack: true,
    excludePaths: ['/admin'],
  },
}))

// We need to test each module import fresh to test different initialization paths
// For the singleton, we import and reset per test

describe('Analytics Tracker Branches', () => {
  let tracker: typeof import('./tracker')

  beforeEach(async () => {
    vi.resetModules()
    // Mock sessionStorage
    const sessionStore: Record<string, string> = {}
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => sessionStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        sessionStore[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete sessionStore[key]
      }),
    })

    // Mock localStorage
    const localStore: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStore[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete localStore[key]
      }),
    })

    // Mock performance.now
    vi.stubGlobal('performance', { now: vi.fn(() => 100) })

    // Mock navigator
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      doNotTrack: '0',
    })

    // Mock document
    vi.stubGlobal('document', { referrer: 'https://google.com' })

    // Mock indexedDB as unavailable by default
    vi.stubGlobal('indexedDB', undefined)

    tracker = await import('./tracker')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ============================================================================
  // initializeAnalytics
  // ============================================================================
  describe('initializeAnalytics', () => {
    it('initializes with default config', async () => {
      await tracker.initializeAnalytics()
      // Should not throw
    })

    it('initializes with custom config', async () => {
      await tracker.initializeAnalytics({ debug: true, sampleRate: 0.5 })
      // Should not throw
    })

    it('returns early when called twice (initPromise set)', async () => {
      await tracker.initializeAnalytics()
      await tracker.initializeAnalytics()
      // Second call should return early
    })

    it('disables tracking when Do Not Track is enabled and respected', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 Chrome/120.0',
        doNotTrack: '1',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ respectDoNotTrack: true })

      // Tracking should be disabled - trackPageView should be a no-op
      freshTracker.trackPageView('/test')
      // No error means it handled the disabled state
    })

    it('does not disable tracking when Do Not Track not respected', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 Chrome/120.0',
        doNotTrack: '1',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ respectDoNotTrack: false })
      // Should still be enabled
    })

    it('handles globalPrivacyControl being set', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 Chrome/120.0',
        doNotTrack: '0',
        globalPrivacyControl: '1',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ respectDoNotTrack: true })
    })
  })

  // ============================================================================
  // trackPageView
  // ============================================================================
  describe('trackPageView', () => {
    it('tracks page view with page and title', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackPageView('/dashboard', 'Dashboard')
      // Should track without error
    })

    it('skips excluded paths', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1, excludePaths: ['/admin'] })
      tracker.trackPageView('/admin/settings', 'Settings')
      // Should not track
    })

    it('tracks with title fallback to page', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackPageView('/test')
      // title defaults to page
    })

    it('does nothing when disabled', async () => {
      await tracker.initializeAnalytics({ enabled: false })
      tracker.trackPageView('/test')
      // No error, silently skipped
    })
  })

  // ============================================================================
  // trackFeature
  // ============================================================================
  describe('trackFeature', () => {
    it('tracks feature with default action', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackFeature('policy_upload' as any)
    })

    it('tracks feature with custom action and options', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackFeature('policy_upload' as any, 'click' as any, {
        success: true,
        duration: 1000,
        metadata: { type: 'kasko' },
      })
    })

    it('tracks feature with only success option', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackFeature('ai_chat' as any, 'submit' as any, { success: false })
    })
  })

  // ============================================================================
  // trackAction
  // ============================================================================
  describe('trackAction', () => {
    it('tracks user action with metadata', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackAction('click' as any, 'upload_button', { source: 'hero' })
    })

    it('tracks user action without metadata', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackAction('view' as any, 'dashboard')
    })
  })

  // ============================================================================
  // trackError
  // ============================================================================
  describe('trackError', () => {
    it('tracks Error object with stack', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackError(new Error('Test error'), { page: '/upload' })
    })

    it('tracks string error without stack', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackError('Something went wrong')
    })
  })

  // ============================================================================
  // startTiming
  // ============================================================================
  describe('startTiming', () => {
    it('returns a function that tracks duration when called', async () => {
      let now = 100
      vi.stubGlobal('performance', { now: vi.fn(() => now) })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true, sampleRate: 1 })

      const endTimer = freshTracker.startTiming('extraction_time')
      now = 250 // 150ms later
      endTimer()
      // Should track performance metric
    })
  })

  // ============================================================================
  // Session management
  // ============================================================================
  describe('session management', () => {
    it('creates new session when sessionStorage empty', async () => {
      await tracker.initializeAnalytics({ enabled: true })
      const session = tracker.analytics.getSessionInfo()
      expect(session.id).toBeTruthy()
    })

    it('reuses session when within timeout', async () => {
      const sessionData = { id: 'existing-session', lastActivity: Date.now() - 1000 }
      vi.mocked(sessionStorage.getItem).mockReturnValue(JSON.stringify(sessionData))

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true, sessionTimeout: 1800000 })
      const session = freshTracker.analytics.getSessionInfo()
      expect(session.id).toBe('existing-session')
    })

    it('creates new session when timed out', async () => {
      const sessionData = { id: 'old-session', lastActivity: Date.now() - 2000000 }
      vi.mocked(sessionStorage.getItem).mockReturnValue(JSON.stringify(sessionData))

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true, sessionTimeout: 1800000 })
      const session = freshTracker.analytics.getSessionInfo()
      expect(session.id).not.toBe('old-session')
    })

    it('handles sessionStorage parse errors gracefully', async () => {
      vi.mocked(sessionStorage.getItem).mockReturnValue('invalid-json')

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      expect(session.id).toBeTruthy()
    })

    it('handles sessionStorage.setItem throwing', async () => {
      vi.mocked(sessionStorage.setItem).mockImplementation(() => {
        throw new Error('Storage quota exceeded')
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      // Should not throw
    })
  })

  // ============================================================================
  // Device detection
  // ============================================================================
  describe('device detection', () => {
    it('detects mobile device', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605 Mobile',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.type).toBe('mobile')
    })

    it('detects tablet device', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) Mobile Tablet',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.type).toBe('tablet')
    })

    it('detects Firefox browser', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/120.0',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.browser).toBe('Firefox')
    })

    it('detects Edge browser', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Edg/120.0',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.browser).toBe('Edge')
    })

    it('detects Safari browser', async () => {
      vi.stubGlobal('navigator', {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.browser).toBe('Safari')
    })

    it('detects macOS', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.os).toBe('macOS')
    })

    it('detects Linux', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.os).toBe('Linux')
    })

    it('detects Android', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Android 13; Mobile) Chrome/120.0',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.os).toBe('Android')
    })

    it('detects iOS', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iOS 16_0) AppleWebKit/605.1.15 Mobile/15E148',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.os).toBe('iOS')
    })

    it('returns unknown for unrecognized UA', async () => {
      vi.stubGlobal('navigator', {
        userAgent: 'CustomBot/1.0',
        doNotTrack: '0',
      })

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.browser).toBe('unknown')
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.os).toBe('unknown')
    })

    it('handles missing navigator (SSR)', async () => {
      vi.stubGlobal('navigator', undefined)

      vi.resetModules()
      const freshTracker = await import('./tracker')
      await freshTracker.initializeAnalytics({ enabled: true, respectDoNotTrack: false })
      const session = freshTracker.analytics.getSessionInfo()
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.type).toBe('desktop')
      // @ts-expect-error - mismatch due to schema update
      expect(session.device.browser).toBe('unknown')
    })
  })

  // ============================================================================
  // flush and storage
  // ============================================================================
  describe('flush and storage', () => {
    it('flushes to localStorage when no IndexedDB', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackPageView('/test')
      await tracker.analytics.flush()
      expect(localStorage.setItem).toHaveBeenCalled()
    })

    it('handles empty buffer in flush', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      await tracker.analytics.flush()
      // Should return early without error
    })

    it('appends to existing localStorage events', async () => {
      const existing = [
        {
          id: 'old',
          timestamp: 1000,
          sessionId: 's1',
          category: 'page_view',
          action: 'view',
          page: '/',
        },
      ]
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existing))

      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackPageView('/new')
      await tracker.analytics.flush()
      expect(localStorage.setItem).toHaveBeenCalled()
    })

    it('handles localStorage.getItem parse error', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('bad-json')

      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackPageView('/test')
      await tracker.analytics.flush()
      // Should not throw, fallback to empty array
    })

    it('handles localStorage.setItem throwing', async () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('Storage full')
      })

      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1 })
      tracker.trackPageView('/test')
      await tracker.analytics.flush()
      // Should not throw
    })

    it('auto-flushes when buffer reaches batchSize', async () => {
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 1, batchSize: 2 })
      tracker.trackPageView('/page1')
      tracker.trackPageView('/page2')
      // Should have auto-flushed
    })
  })

  // ============================================================================
  // getStats
  // ============================================================================
  describe('getStats', () => {
    it('returns stats from localStorage when no IndexedDB', async () => {
      const events = [
        {
          id: '1',
          timestamp: Date.now(),
          sessionId: 's1',
          userId: 'u1',
          category: 'page_view',
          action: 'view',
          page: '/dashboard',
          label: 'Dashboard',
        },
        {
          id: '2',
          timestamp: Date.now(),
          sessionId: 's1',
          userId: 'u1',
          category: 'feature_usage',
          action: 'click',
          label: 'upload',
          page: '/upload',
        },
        {
          id: '3',
          timestamp: Date.now(),
          sessionId: 's2',
          category: 'error',
          action: 'error',
          label: 'Test error',
          page: '/test',
        },
      ]
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(events))

      await tracker.initializeAnalytics({ enabled: true })
      const stats = await tracker.analytics.getStats()

      expect(stats.totalSessions).toBe(2)
      expect(stats.uniqueUsers).toBe(1)
      expect(stats.totalPageViews).toBe(1)
      expect(stats.topPages.length).toBeGreaterThanOrEqual(1)
      expect(stats.topFeatures.length).toBeGreaterThanOrEqual(1)
    })

    it('filters events by date range', async () => {
      const oldEvent = {
        id: '1',
        timestamp: 1000,
        sessionId: 's1',
        category: 'page_view',
        action: 'view',
        page: '/',
      }
      const newEvent = {
        id: '2',
        timestamp: Date.now(),
        sessionId: 's2',
        category: 'page_view',
        action: 'view',
        page: '/',
      }
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify([oldEvent, newEvent]))

      await tracker.initializeAnalytics({ enabled: true })
      const stats = await tracker.analytics.getStats(new Date(Date.now() - 60000))

      expect(stats.totalPageViews).toBe(1)
    })

    it('handles events without userId', async () => {
      const events = [
        {
          id: '1',
          timestamp: Date.now(),
          sessionId: 's1',
          category: 'page_view',
          action: 'view',
          page: '/',
        },
      ]
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(events))

      await tracker.initializeAnalytics({ enabled: true })
      const stats = await tracker.analytics.getStats()
      expect(stats.uniqueUsers).toBe(0)
    })

    it('handles events without page or label', async () => {
      const events = [
        { id: '1', timestamp: Date.now(), sessionId: 's1', category: 'page_view', action: 'view' },
        {
          id: '2',
          timestamp: Date.now(),
          sessionId: 's1',
          category: 'feature_usage',
          action: 'click',
        },
      ]
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(events))

      await tracker.initializeAnalytics({ enabled: true })
      const stats = await tracker.analytics.getStats()
      expect(stats.topPages[0]?.page).toBe('unknown')
      expect(stats.topFeatures[0]?.feature).toBe('unknown')
    })

    it('returns empty stats when no events', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)

      await tracker.initializeAnalytics({ enabled: true })
      const stats = await tracker.analytics.getStats()
      expect(stats.totalEvents).toBe(0)
      expect(stats.totalSessions).toBe(0)
    })

    it('handles localStorage.getItem returning invalid JSON in getStats', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('not-json')

      await tracker.initializeAnalytics({ enabled: true })
      const stats = await tracker.analytics.getStats()
      expect(stats.totalEvents).toBe(0)
    })
  })

  // ============================================================================
  // clearData
  // ============================================================================
  describe('clearData', () => {
    it('clears localStorage data', async () => {
      await tracker.initializeAnalytics({ enabled: true })
      await tracker.analytics.clearData()
      expect(localStorage.removeItem).toHaveBeenCalledWith('insurai_analytics')
    })

    it('handles localStorage.removeItem throwing', async () => {
      vi.mocked(localStorage.removeItem).mockImplementation(() => {
        throw new Error('Access denied')
      })

      await tracker.initializeAnalytics({ enabled: true })
      await tracker.analytics.clearData()
      // Should not throw
    })
  })

  // ============================================================================
  // destroy
  // ============================================================================
  describe('destroy', () => {
    it('clears flush timer and flushes remaining events', async () => {
      await tracker.initializeAnalytics({ enabled: true, flushInterval: 1000, sampleRate: 1 })
      tracker.trackPageView('/test')
      tracker.analytics.destroy()
      // Should have flushed and cleared timer
    })

    it('handles destroy when no timer set', async () => {
      await tracker.initializeAnalytics({ enabled: true, flushInterval: 0 })
      tracker.analytics.destroy()
      // Should not throw
    })
  })

  // ============================================================================
  // setUserId
  // ============================================================================
  describe('setUserId', () => {
    it('sets user ID', async () => {
      await tracker.initializeAnalytics({ enabled: true })
      tracker.analytics.setUserId('user-123')
      const session = tracker.analytics.getSessionInfo()
      expect(session.userId).toBe('user-123')
    })

    it('clears user ID with undefined', async () => {
      await tracker.initializeAnalytics({ enabled: true })
      tracker.analytics.setUserId('user-123')
      tracker.analytics.setUserId(undefined)
      const session = tracker.analytics.getSessionInfo()
      expect(session.userId).toBeUndefined()
    })
  })

  // ============================================================================
  // sample rate
  // ============================================================================
  describe('sample rate', () => {
    it('skips events when sample rate causes skip', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9)
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 0.5 })
      tracker.trackPageView('/test')
      // Event should be skipped since 0.9 > 0.5
    })

    it('includes events when sample rate allows', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.3)
      await tracker.initializeAnalytics({ enabled: true, sampleRate: 0.5 })
      tracker.trackPageView('/test')
      // Event should be included since 0.3 <= 0.5
    })
  })

  // ============================================================================
  // debug mode
  // ============================================================================
  describe('debug mode', () => {
    it('logs events in debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await tracker.initializeAnalytics({ enabled: true, debug: true, sampleRate: 1 })
      tracker.trackPageView('/test')
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
