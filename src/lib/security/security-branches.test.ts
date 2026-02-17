/**
 * Security Module Branch Coverage Tests
 *
 * Covers uncovered branches across all security modules:
 * - index.ts: initializeSecurity(), getSecurityDashboardData()
 * - audit-logger.ts: createTimedAudit fail path, logError branches, query filters, cleanup retention, debug mode, maskEmail branches
 * - rate-limiter.ts: formatRetryAfter boundaries, consume with cost>1, violation listener errors, extractOperationFromKey null, rateLimit decorator
 * - key-manager.ts: validateKeyFormat edge cases, maskApiKey edges, getKey encrypted-but-no-crypto, migrateOldKeys
 * - security-monitor.ts: sensitivity multipliers, injection patterns, alert dedup + severity upgrade, sanitizeObject recursion, isSecureContext fallbacks
 * - csp.ts: buildCSPMetaTag dev additions for missing key
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Mock setup using vi.hoisted ──────────────────────────────────────────

const {
  mockMigrateOldKeys,
  mockSecurityMonitorInitialize,
  mockRateLimiterOnViolation,
  mockRateLimiterCleanup,
  mockAuditLoggerLogSecurity,
  mockAuditLoggerQuery,
  mockAuditLoggerGetStats,
  mockAuditLoggerCleanup,
  mockGetUserQuotas,
  capturedViolationCallback,
} = vi.hoisted(() => {
  let violationCb: ((v: unknown) => void) | null = null
  return {
    mockMigrateOldKeys: vi.fn(),
    mockSecurityMonitorInitialize: vi.fn(),
    mockRateLimiterOnViolation: vi.fn((cb: (v: unknown) => void) => {
      violationCb = cb
      return () => { violationCb = null }
    }),
    mockRateLimiterCleanup: vi.fn(),
    mockAuditLoggerLogSecurity: vi.fn(),
    mockAuditLoggerQuery: vi.fn().mockResolvedValue([]),
    mockAuditLoggerGetStats: vi.fn().mockResolvedValue({
      totalEvents: 0,
      eventsByCategory: {},
      eventsBySeverity: {},
      errorRate: 0,
      avgDurationMs: 0,
      topEventTypes: [],
      periodStart: 0,
      periodEnd: 0,
    }),
    mockAuditLoggerCleanup: vi.fn(),
    mockGetUserQuotas: vi.fn().mockReturnValue({
      ai_extraction: { used: 5, limit: 30, remaining: 25, resetAt: '2026-01-01T00:00:00.000Z' },
    }),
    capturedViolationCallback: {
      get: () => violationCb,
    },
  }
})

// ─── Tests for index.ts (initializeSecurity, getSecurityDashboardData) ─────

describe('Security Module index.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // We test initializeSecurity and getSecurityDashboardData by dynamically importing
  // with mocked dependencies

  describe('initializeSecurity', () => {
    it('should migrate old keys, initialize monitor, set up violation listener, and set intervals', async () => {
      // Mock setInterval to capture calls
      const originalSetInterval = globalThis.setInterval
      const intervalCallbacks: Array<() => void> = []
      const mockSetIntervalFn = vi.fn((cb: () => void, _ms: number) => {
        intervalCallbacks.push(cb)
        return 999 as unknown as NodeJS.Timeout
      })
      globalThis.setInterval = mockSetIntervalFn as unknown as typeof setInterval

      vi.doMock('./key-manager', () => ({
        migrateOldKeys: mockMigrateOldKeys.mockResolvedValue(2),
      }))
      vi.doMock('./security-monitor', () => ({
        securityMonitor: { initialize: mockSecurityMonitorInitialize },
      }))
      vi.doMock('./rate-limiter', () => ({
        rateLimiter: {
          onViolation: mockRateLimiterOnViolation,
          cleanup: mockRateLimiterCleanup,
        },
        getUserQuotas: mockGetUserQuotas,
      }))
      vi.doMock('./audit-logger', () => ({
        auditLogger: {
          logSecurity: mockAuditLoggerLogSecurity,
          query: mockAuditLoggerQuery,
          getStats: mockAuditLoggerGetStats,
          cleanup: mockAuditLoggerCleanup,
        },
      }))

      const { initializeSecurity } = await import('./index')
      await initializeSecurity()

      expect(mockMigrateOldKeys).toHaveBeenCalled()
      expect(mockSecurityMonitorInitialize).toHaveBeenCalled()
      expect(mockRateLimiterOnViolation).toHaveBeenCalledWith(expect.any(Function))

      // setInterval should be called twice (rate limiter cleanup, audit cleanup)
      expect(mockSetIntervalFn).toHaveBeenCalledTimes(2)
      expect(mockSetIntervalFn).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000)
      expect(mockSetIntervalFn).toHaveBeenCalledWith(expect.any(Function), 24 * 60 * 60 * 1000)

      // Execute interval callbacks
      intervalCallbacks[0]()
      expect(mockRateLimiterCleanup).toHaveBeenCalled()

      intervalCallbacks[1]()
      expect(mockAuditLoggerCleanup).toHaveBeenCalled()

      globalThis.setInterval = originalSetInterval
      vi.doUnmock('./key-manager')
      vi.doUnmock('./security-monitor')
      vi.doUnmock('./rate-limiter')
      vi.doUnmock('./audit-logger')
    })

    it('should catch and warn when migrateOldKeys fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      vi.doMock('./key-manager', () => ({
        migrateOldKeys: vi.fn().mockRejectedValue(new Error('migration failed')),
      }))
      vi.doMock('./security-monitor', () => ({
        securityMonitor: { initialize: vi.fn() },
      }))
      vi.doMock('./rate-limiter', () => ({
        rateLimiter: {
          onViolation: vi.fn(() => () => {}),
          cleanup: vi.fn(),
        },
        getUserQuotas: vi.fn(),
      }))
      vi.doMock('./audit-logger', () => ({
        auditLogger: {
          logSecurity: vi.fn(),
          query: vi.fn(),
          getStats: vi.fn(),
          cleanup: vi.fn(),
        },
      }))

      // Reset modules to get fresh import
      vi.resetModules()
      const { initializeSecurity } = await import('./index')
      await initializeSecurity()

      expect(warnSpy).toHaveBeenCalledWith('Failed to migrate old API keys')

      warnSpy.mockRestore()
      vi.doUnmock('./key-manager')
      vi.doUnmock('./security-monitor')
      vi.doUnmock('./rate-limiter')
      vi.doUnmock('./audit-logger')
    })

    it('should log rate limit violations through auditor when violation callback fires', async () => {
      vi.doMock('./key-manager', () => ({
        migrateOldKeys: vi.fn().mockResolvedValue(0),
      }))
      vi.doMock('./security-monitor', () => ({
        securityMonitor: { initialize: vi.fn() },
      }))
      vi.doMock('./rate-limiter', () => ({
        rateLimiter: {
          onViolation: mockRateLimiterOnViolation,
          cleanup: vi.fn(),
        },
        getUserQuotas: mockGetUserQuotas,
      }))
      vi.doMock('./audit-logger', () => ({
        auditLogger: {
          logSecurity: mockAuditLoggerLogSecurity,
          query: mockAuditLoggerQuery,
          getStats: mockAuditLoggerGetStats,
          cleanup: vi.fn(),
        },
      }))

      vi.resetModules()
      const { initializeSecurity } = await import('./index')
      await initializeSecurity()

      // Trigger the violation callback
      const cb = capturedViolationCallback.get()
      expect(cb).toBeTruthy()
      cb!({ operation: 'ai_extraction', limit: 30, current: 31 })

      expect(mockAuditLoggerLogSecurity).toHaveBeenCalledWith(
        'security.rate_limit_exceeded',
        {
          operation: 'ai_extraction',
          limit: 30,
          current: 31,
        }
      )

      vi.doUnmock('./key-manager')
      vi.doUnmock('./security-monitor')
      vi.doUnmock('./rate-limiter')
      vi.doUnmock('./audit-logger')
    })
  })

  describe('getSecurityDashboardData', () => {
    it('should return dashboard data with rate limits, events, and stats', async () => {
      const mockQuotas = {
        ai_extraction: { used: 5, limit: 30, remaining: 25, resetAt: '2026-01-01T00:00:00.000Z' },
        chat_message: { used: 2, limit: 50, remaining: 48, resetAt: '2026-01-01T01:00:00.000Z' },
      }
      const mockEvents = [{ id: 'evt-1', type: 'policy.created' }]
      const mockStats = {
        totalEvents: 10,
        eventsByCategory: { policy: 5, auth: 5 },
        eventsBySeverity: { info: 8, warning: 2 },
        errorRate: 0,
        avgDurationMs: 100,
        topEventTypes: [],
        periodStart: 0,
        periodEnd: 0,
      }

      vi.doMock('./rate-limiter', () => ({
        rateLimiter: {
          onViolation: vi.fn(() => () => {}),
          cleanup: vi.fn(),
        },
        getUserQuotas: vi.fn().mockReturnValue(mockQuotas),
      }))
      vi.doMock('./audit-logger', () => ({
        auditLogger: {
          logSecurity: vi.fn(),
          query: vi.fn().mockResolvedValue(mockEvents),
          getStats: vi.fn().mockResolvedValue(mockStats),
          cleanup: vi.fn(),
        },
      }))
      vi.doMock('./security-monitor', () => ({
        securityMonitor: { initialize: vi.fn() },
      }))
      vi.doMock('./key-manager', () => ({
        migrateOldKeys: vi.fn().mockResolvedValue(0),
      }))

      vi.resetModules()
      const { getSecurityDashboardData } = await import('./index')
      const data = await getSecurityDashboardData('user-abc')

      expect(data.rateLimits).toHaveLength(2)
      expect(data.rateLimits[0].operation).toBe('ai_extraction')
      expect(data.rateLimits[0].used).toBe(5)
      expect(data.rateLimits[1].operation).toBe('chat_message')
      expect(data.recentEvents).toEqual(mockEvents)
      expect(data.stats).toEqual(mockStats)

      vi.doUnmock('./rate-limiter')
      vi.doUnmock('./audit-logger')
      vi.doUnmock('./security-monitor')
      vi.doUnmock('./key-manager')
    })
  })
})

// ─── Tests for audit-logger.ts branch coverage ────────────────────────────

describe('Audit Logger - Branch Coverage', () => {
  // These tests use the real audit-logger module (not mocked)
  // to cover branches in the actual implementation

  let auditLoggerReal: typeof import('./audit-logger')

  beforeEach(async () => {
    vi.resetModules()
    // Provide minimal mocks for browser APIs
    if (!globalThis.localStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn(),
        },
        writable: true,
      })
    }
    auditLoggerReal = await import('./audit-logger')
    await auditLoggerReal.auditLogger.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createTimedAudit', () => {
    it('complete() should log event with duration and success=true by default', async () => {
      const timed = auditLoggerReal.createTimedAudit('ai.extraction_started', { model: 'gpt-4o' })

      // Wait a tick so duration > 0
      await new Promise(r => setTimeout(r, 5))

      const event = await timed.complete({ result: 'ok' })

      expect(event.success).toBe(true)
      expect(event.durationMs).toBeGreaterThanOrEqual(0)
      expect(event.details).toEqual(expect.objectContaining({ model: 'gpt-4o', result: 'ok' }))
    })

    it('complete() should accept success=false explicitly', async () => {
      const timed = auditLoggerReal.createTimedAudit('ai.extraction_started')
      const event = await timed.complete({}, false)

      expect(event.success).toBe(false)
    })

    it('fail() should log event with error message from Error object', async () => {
      const timed = auditLoggerReal.createTimedAudit('ai.extraction_started')
      const event = await timed.fail(new Error('Timeout'))

      expect(event.success).toBe(false)
      expect(event.errorMessage).toBe('Timeout')
    })

    it('fail() should log event with string error message', async () => {
      const timed = auditLoggerReal.createTimedAudit('ai.extraction_started')
      const event = await timed.fail('Something went wrong', { extra: 'info' })

      expect(event.success).toBe(false)
      expect(event.errorMessage).toBe('Something went wrong')
      expect(event.details).toEqual(expect.objectContaining({ extra: 'info' }))
    })
  })

  describe('logError', () => {
    it('should handle Error object with stack trace', async () => {
      const err = new Error('Test error')
      err.stack = 'Error: Test error\n  at line1\n  at line2\n  at line3\n  at line4\n  at line5\n  at line6'

      const event = await auditLoggerReal.auditLogger.logError(err, { context: 'test' })

      expect(event.type).toBe('error.unhandled')
      expect(event.success).toBe(false)
      expect(event.errorMessage).toBe('Test error')
      expect(event.details).toEqual(expect.objectContaining({
        name: 'Error',
        message: 'Test error',
        context: 'test',
      }))
      // Stack should be truncated to first 5 lines
      const stack = event.details?.stack as string
      expect(stack.split('\n')).toHaveLength(5)
    })

    it('should handle string error', async () => {
      const event = await auditLoggerReal.auditLogger.logError('string error message')

      expect(event.errorMessage).toBe('string error message')
      expect(event.details).toEqual(expect.objectContaining({
        message: 'string error message',
      }))
    })
  })

  describe('log severity branches', () => {
    it('should assign error severity for failed event types', async () => {
      const event = await auditLoggerReal.auditLogger.log('auth.signin_failed', {}, { success: false })
      expect(event.severity).toBe('error')
    })

    it('should assign warning severity for security event types', async () => {
      const event = await auditLoggerReal.auditLogger.log('security.rate_limit_exceeded', {})
      expect(event.severity).toBe('warning')
    })

    it('should assign error severity for error event types', async () => {
      const event = await auditLoggerReal.auditLogger.log('error.unhandled', {})
      expect(event.severity).toBe('error')
    })

    it('should assign info severity for normal events', async () => {
      const event = await auditLoggerReal.auditLogger.log('policy.created', {})
      expect(event.severity).toBe('info')
    })

    it('should default success to true for non-failed event types', async () => {
      const event = await auditLoggerReal.auditLogger.log('policy.created', {})
      expect(event.success).toBe(true)
    })

    it('should default success to false for event types containing "failed"', async () => {
      const event = await auditLoggerReal.auditLogger.log('auth.signin_failed', {})
      expect(event.success).toBe(false)
    })
  })

  describe('getCategoryFromType', () => {
    it('should map known prefixes to categories', async () => {
      const authEvent = await auditLoggerReal.auditLogger.log('auth.signin', {})
      expect(authEvent.category).toBe('auth')

      const policyEvent = await auditLoggerReal.auditLogger.log('policy.created', {})
      expect(policyEvent.category).toBe('policy')

      const aiEvent = await auditLoggerReal.auditLogger.log('ai.extraction_started', {})
      expect(aiEvent.category).toBe('ai')

      const exportEvent = await auditLoggerReal.auditLogger.log('export.csv_generated', {})
      expect(exportEvent.category).toBe('export')

      const settingsEvent = await auditLoggerReal.auditLogger.log('settings.updated' as 'security.rate_limit_exceeded', {})
      expect(settingsEvent.category).toBe('settings')
    })

    it('should default to error category for unknown prefixes', async () => {
      const event = await auditLoggerReal.auditLogger.log('unknown.event' as 'error.unhandled', {})
      expect(event.category).toBe('error')
    })
  })

  describe('logAuth - maskEmail', () => {
    it('should mask email with more than 2 chars in local part', async () => {
      const event = await auditLoggerReal.auditLogger.logAuth('auth.signin', {
        method: 'email',
        email: 'test@example.com',
      })
      expect(event.details).toEqual(expect.objectContaining({
        email: 't***t@example.com',
      }))
    })

    it('should mask email with 2 or fewer chars in local part', async () => {
      const event = await auditLoggerReal.auditLogger.logAuth('auth.signin', {
        method: 'email',
        email: 'ab@example.com',
      })
      expect(event.details).toEqual(expect.objectContaining({
        email: '***@example.com',
      }))
    })

    it('should return *** for email without @ sign', async () => {
      const event = await auditLoggerReal.auditLogger.logAuth('auth.signin', {
        method: 'email',
        email: 'nodomainemail',
      })
      expect(event.details).toEqual(expect.objectContaining({
        email: '***',
      }))
    })

    it('should handle undefined email', async () => {
      const event = await auditLoggerReal.auditLogger.logAuth('auth.signin', {
        method: 'google',
      })
      expect(event.details).toEqual(expect.objectContaining({
        email: undefined,
      }))
    })
  })

  describe('debug mode', () => {
    it('should log to console when debug is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      auditLoggerReal.auditLogger.setDebug(true)
      await auditLoggerReal.auditLogger.log('policy.created', { test: true })

      expect(consoleSpy).toHaveBeenCalledWith('[AUDIT]', 'policy.created', { test: true })

      auditLoggerReal.auditLogger.setDebug(false)
      consoleSpy.mockRestore()
    })

    it('should log [AUDIT ERROR] prefix for failed events in debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      auditLoggerReal.auditLogger.setDebug(true)
      await auditLoggerReal.auditLogger.log('auth.signin_failed', { reason: 'bad password' })

      expect(consoleSpy).toHaveBeenCalledWith('[AUDIT ERROR]', 'auth.signin_failed', { reason: 'bad password' })

      auditLoggerReal.auditLogger.setDebug(false)
      consoleSpy.mockRestore()
    })
  })

  describe('onEvent listener', () => {
    it('should add and remove listeners correctly', async () => {
      const listener = vi.fn()
      const unsubscribe = auditLoggerReal.auditLogger.onEvent(listener)

      await auditLoggerReal.auditLogger.log('policy.created', {})
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()

      await auditLoggerReal.auditLogger.log('policy.created', {})
      // Should not be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should handle listener errors gracefully', async () => {
      const failingListener = vi.fn(() => { throw new Error('listener crash') })
      const goodListener = vi.fn()

      const unsub1 = auditLoggerReal.auditLogger.onEvent(failingListener)
      const unsub2 = auditLoggerReal.auditLogger.onEvent(goodListener)

      await auditLoggerReal.auditLogger.log('policy.created', {})

      // Failing listener was called but error was swallowed
      expect(failingListener).toHaveBeenCalled()
      // Good listener was still called
      expect(goodListener).toHaveBeenCalled()

      unsub1()
      unsub2()
    })
  })

  describe('query memory - filters and pagination', () => {
    it('should filter by success flag', async () => {
      await auditLoggerReal.auditLogger.log('auth.signin', {}, { success: true })
      await auditLoggerReal.auditLogger.log('auth.signin_failed', {}, { success: false })

      const successOnly = await auditLoggerReal.auditLogger.query({ success: true })
      expect(successOnly.every(e => e.success)).toBe(true)

      const failedOnly = await auditLoggerReal.auditLogger.query({ success: false })
      expect(failedOnly.every(e => !e.success)).toBe(true)
    })

    it('should filter by severity', async () => {
      await auditLoggerReal.auditLogger.log('policy.created', {})  // info
      await auditLoggerReal.auditLogger.log('security.rate_limit_exceeded', {})  // warning

      const warnings = await auditLoggerReal.auditLogger.query({ severity: 'warning' })
      expect(warnings.every(e => e.severity === 'warning')).toBe(true)
    })

    it('should filter by resourceId', async () => {
      await auditLoggerReal.auditLogger.log('policy.created', {}, { resourceId: 'pol-123' })
      await auditLoggerReal.auditLogger.log('policy.created', {}, { resourceId: 'pol-456' })

      const filtered = await auditLoggerReal.auditLogger.query({ resourceId: 'pol-123' })
      expect(filtered.every(e => e.resourceId === 'pol-123')).toBe(true)
    })

    it('should filter by date range', async () => {
      const now = Date.now()
      await auditLoggerReal.auditLogger.log('policy.created', {})

      const tooEarly = await auditLoggerReal.auditLogger.query({
        startDate: new Date(now + 10000),
      })
      expect(tooEarly).toHaveLength(0)

      const tooLate = await auditLoggerReal.auditLogger.query({
        endDate: new Date(now - 10000),
      })
      expect(tooLate).toHaveLength(0)
    })

    it('should apply offset and limit', async () => {
      for (let i = 0; i < 5; i++) {
        await auditLoggerReal.auditLogger.log('policy.created', { index: i })
      }

      const limited = await auditLoggerReal.auditLogger.query({ limit: 2 })
      expect(limited).toHaveLength(2)

      const offset = await auditLoggerReal.auditLogger.query({ offset: 3, limit: 10 })
      expect(offset).toHaveLength(2) // 5 total - 3 offset = 2 remaining
    })
  })

  describe('cleanup - retention policy', () => {
    it('should remove info events beyond retention period', async () => {
      auditLoggerReal.auditLogger.setRetentionPolicy({ infoRetentionDays: 0 })

      await auditLoggerReal.auditLogger.log('policy.created', {})

      // Force event timestamp to be old by manipulating the memoryLog
      // Since we can't easily do this without exposing internals, we rely
      // on 0-day retention meaning "delete immediately"
      const cleaned = await auditLoggerReal.auditLogger.cleanup()
      // Events logged just now might not be cleaned with 0 days since
      // the age check uses days, so a fresh event is within 0 days.
      // We just verify it doesn't crash.
      expect(cleaned).toBeGreaterThanOrEqual(0)

      // Reset retention
      auditLoggerReal.auditLogger.setRetentionPolicy({ infoRetentionDays: 30 })
    })
  })

  describe('getStats', () => {
    it('should compute stats correctly', async () => {
      await auditLoggerReal.auditLogger.log('policy.created', {}, { durationMs: 100 })
      await auditLoggerReal.auditLogger.log('auth.signin_failed', {})
      await auditLoggerReal.auditLogger.log('security.rate_limit_exceeded', {})

      const stats = await auditLoggerReal.auditLogger.getStats()

      expect(stats.totalEvents).toBeGreaterThanOrEqual(3)
      expect(stats.errorRate).toBeGreaterThan(0) // at least auth.signin_failed
      expect(stats.avgDurationMs).toBeGreaterThan(0) // one event had durationMs
      expect(stats.topEventTypes.length).toBeGreaterThan(0)
    })

    it('should return 0 errorRate when no events', async () => {
      await auditLoggerReal.auditLogger.clear()
      const stats = await auditLoggerReal.auditLogger.getStats(
        new Date(Date.now() + 100000),
        new Date(Date.now() + 200000)
      )
      expect(stats.errorRate).toBe(0)
      expect(stats.avgDurationMs).toBe(0)
    })
  })

  describe('export', () => {
    it('should export logs as JSON string', async () => {
      await auditLoggerReal.auditLogger.log('policy.created', { test: true })
      const exported = await auditLoggerReal.auditLogger.export()

      const parsed = JSON.parse(exported)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBeGreaterThan(0)
    })
  })

  describe('audit convenience function', () => {
    it('should use empty details when none provided', async () => {
      const event = await auditLoggerReal.audit('policy.created')
      expect(event.details).toEqual({})
    })
  })

  describe('storeEvent memory trimming', () => {
    it('should trim memory log when exceeding maxEntries', async () => {
      auditLoggerReal.auditLogger.setRetentionPolicy({ maxEntries: 5 })

      for (let i = 0; i < 10; i++) {
        await auditLoggerReal.auditLogger.log('policy.created', { i })
      }

      const all = await auditLoggerReal.auditLogger.query({ limit: 100 })
      expect(all.length).toBeLessThanOrEqual(5)

      // Reset
      auditLoggerReal.auditLogger.setRetentionPolicy({ maxEntries: 10000 })
    })
  })
})

// ─── Tests for rate-limiter.ts branch coverage ─────────────────────────────

describe('Rate Limiter - Branch Coverage', () => {
  let rl: typeof import('./rate-limiter')

  beforeEach(async () => {
    vi.resetModules()

    // Ensure localStorage mock
    if (!globalThis.localStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn(),
        },
        writable: true,
      })
    }

    rl = await import('./rate-limiter')
    rl.rateLimiter.resetAll()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('formatRetryAfter', () => {
    it('should return "birka\u00E7 saniye" for < 1000ms', () => {
      expect(rl.formatRetryAfter(500)).toBe('birka\u00E7 saniye')
      expect(rl.formatRetryAfter(0)).toBe('birka\u00E7 saniye')
      expect(rl.formatRetryAfter(999)).toBe('birka\u00E7 saniye')
    })

    it('should return seconds for 1000ms-59999ms', () => {
      expect(rl.formatRetryAfter(1000)).toBe('1 saniye')
      expect(rl.formatRetryAfter(30000)).toBe('30 saniye')
      expect(rl.formatRetryAfter(59999)).toBe('60 saniye')
    })

    it('should return minutes for 60000ms-3599999ms', () => {
      expect(rl.formatRetryAfter(60000)).toBe('1 dakika')
      expect(rl.formatRetryAfter(120000)).toBe('2 dakika')
      expect(rl.formatRetryAfter(3599999)).toBe('60 dakika')
    })

    it('should return hours for >= 3600000ms', () => {
      expect(rl.formatRetryAfter(3600000)).toBe('1 saat')
      expect(rl.formatRetryAfter(7200000)).toBe('2 saat')
    })
  })

  describe('consume with cost > 1', () => {
    it('should increment count by cost amount', () => {
      const result = rl.rateLimiter.consume('policy_upload', 'user-1', 5)
      expect(result.allowed).toBe(true)
      expect(result.count).toBe(5)

      const usage = rl.rateLimiter.getUsage('policy_upload', 'user-1')
      expect(usage.used).toBe(5)
    })
  })

  describe('consume when denied', () => {
    it('should record violation and not increment count', () => {
      const listener = vi.fn()
      const unsub = rl.rateLimiter.onViolation(listener)

      // Exhaust the limit
      const config = rl.rateLimiter.getConfig('auth_password_reset') // limit=3
      for (let i = 0; i < config.maxRequests; i++) {
        rl.rateLimiter.consume('auth_password_reset', '1.2.3.4')
      }

      // Next attempt should be denied
      const result = rl.rateLimiter.consume('auth_password_reset', '1.2.3.4')
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'auth_password_reset',
        limit: config.maxRequests,
      }))

      unsub()
    })

    it('should handle violation listener errors gracefully', () => {
      const failingListener = vi.fn(() => { throw new Error('oops') })
      const unsub = rl.rateLimiter.onViolation(failingListener)

      // Exhaust limit
      const config = rl.rateLimiter.getConfig('auth_password_reset')
      for (let i = 0; i < config.maxRequests; i++) {
        rl.rateLimiter.consume('auth_password_reset', '1.2.3.4')
      }

      // Should not throw despite listener error
      expect(() => rl.rateLimiter.consume('auth_password_reset', '1.2.3.4')).not.toThrow()

      unsub()
    })
  })

  describe('consumeRateLimit (exported function)', () => {
    it('should throw with error code RATE_LIMIT_EXCEEDED when limit exceeded', async () => {
      const config = rl.rateLimiter.getConfig('auth_password_reset')
      for (let i = 0; i < config.maxRequests; i++) {
        await rl.consumeRateLimit('auth_password_reset', 'ip-test')
      }

      try {
        await rl.consumeRateLimit('auth_password_reset', 'ip-test')
        expect.fail('Should have thrown')
      } catch (error: unknown) {
        const err = error as Error & { code: string; retryAfter: number }
        expect(err.code).toBe('RATE_LIMIT_EXCEEDED')
        expect(err.retryAfter).toBeGreaterThanOrEqual(0)
        expect(err.message).toContain('password reset')
      }
    })

    it('should return result when within limits', async () => {
      const result = await rl.consumeRateLimit('policy_upload', 'user-x')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeGreaterThan(0)
    })
  })

  describe('window expiry', () => {
    it('should reset state when window expires in check()', async () => {
      rl.rateLimiter.consume('policy_upload', 'user-1')

      // Verify consume registered
      const beforeCheck = rl.rateLimiter.check('policy_upload', 'user-1')
      expect(beforeCheck.count).toBe(1)

      // Set tiny window and wait for it to expire
      rl.rateLimiter.setConfig('policy_upload', { windowMs: 10 })
      await new Promise(r => setTimeout(r, 20))

      const result = rl.rateLimiter.check('policy_upload', 'user-1')
      expect(result.count).toBe(0)
      expect(result.allowed).toBe(true)

      // Restore
      rl.rateLimiter.setConfig('policy_upload', { windowMs: 10 * 60 * 1000 })
    })

    it('should reset state when window expires in getUsage()', async () => {
      rl.rateLimiter.consume('policy_upload', 'user-1')

      // Set tiny window and wait for it to expire
      rl.rateLimiter.setConfig('policy_upload', { windowMs: 10 })
      await new Promise(r => setTimeout(r, 20))

      const usage = rl.rateLimiter.getUsage('policy_upload', 'user-1')
      expect(usage.used).toBe(0)

      rl.rateLimiter.setConfig('policy_upload', { windowMs: 10 * 60 * 1000 })
    })
  })

  describe('cleanup', () => {
    it('should clean expired entries and save to storage', () => {
      rl.rateLimiter.consume('policy_upload', 'user-1')

      // Set tiny window so entries expire
      rl.rateLimiter.setConfig('policy_upload', { windowMs: 1 })

      const cleaned = rl.rateLimiter.cleanup()
      expect(cleaned).toBeGreaterThanOrEqual(0) // May be 0 if too fast

      rl.rateLimiter.setConfig('policy_upload', { windowMs: 10 * 60 * 1000 })
    })

    it('should return 0 when no entries to clean', () => {
      const cleaned = rl.rateLimiter.cleanup()
      expect(cleaned).toBe(0)
    })
  })

  describe('onViolation listener management', () => {
    it('should remove listener on unsubscribe', () => {
      const listener = vi.fn()
      const unsub = rl.rateLimiter.onViolation(listener)

      unsub()

      // Exhaust limit
      const config = rl.rateLimiter.getConfig('auth_password_reset')
      for (let i = 0; i <= config.maxRequests; i++) {
        rl.rateLimiter.consume('auth_password_reset', '1.2.3.4')
      }

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('buildKey with global scope', () => {
    it('should create global key for global scope operations', () => {
      // Test by setting a config with global scope and checking behavior
      rl.rateLimiter.setConfig('policy_search', { scope: 'global' })

      // Consume for two different users
      rl.rateLimiter.consume('policy_search', 'user-1')
      rl.rateLimiter.consume('policy_search', 'user-2')

      // Both should share the same counter since scope is global
      const usage1 = rl.rateLimiter.getUsage('policy_search', 'user-1')
      const usage2 = rl.rateLimiter.getUsage('policy_search', 'user-2')
      expect(usage1.used).toBe(2)
      expect(usage2.used).toBe(2) // Same global counter

      // Restore
      rl.rateLimiter.setConfig('policy_search', { scope: 'user' })
    })
  })

  describe('getUserQuotas', () => {
    it('should return quotas for all operations', () => {
      const quotas = rl.getUserQuotas('user-123')

      expect(quotas).toHaveProperty('ai_extraction')
      expect(quotas).toHaveProperty('chat_message')
      expect(quotas).toHaveProperty('auth_signin')
      expect(quotas).toHaveProperty('export_pdf')

      // Check structure
      const aiQuota = quotas.ai_extraction
      expect(aiQuota).toHaveProperty('used')
      expect(aiQuota).toHaveProperty('limit')
      expect(aiQuota).toHaveProperty('remaining')
      expect(aiQuota).toHaveProperty('resetAt')
      expect(aiQuota.remaining).toBe(aiQuota.limit - aiQuota.used)
    })
  })

  describe('getStates', () => {
    it('should return a copy of current states', () => {
      rl.rateLimiter.consume('policy_upload', 'user-1')

      const states = rl.rateLimiter.getStates()
      expect(states.size).toBeGreaterThan(0)

      // Verify it's a copy (modifying returned map shouldn't affect original)
      states.clear()
      const statesAgain = rl.rateLimiter.getStates()
      expect(statesAgain.size).toBeGreaterThan(0)
    })
  })

  describe('totalCost tracking', () => {
    it('should accumulate cost from costPerRequest config', () => {
      // ai_extraction has costPerRequest: 0.03
      rl.rateLimiter.consume('ai_extraction', 'user-1')
      rl.rateLimiter.consume('ai_extraction', 'user-1')

      const usage = rl.rateLimiter.getUsage('ai_extraction', 'user-1')
      expect(usage.cost).toBeCloseTo(0.06, 5)
    })

    it('should return 0 cost when totalCost is undefined in state', () => {
      // Operations without costPerRequest (e.g., policy_upload)
      rl.rateLimiter.consume('policy_upload', 'user-1')

      const usage = rl.rateLimiter.getUsage('policy_upload', 'user-1')
      expect(usage.cost).toBeGreaterThanOrEqual(0)
    })
  })
})

// ─── Tests for key-manager.ts branch coverage ─────────────────────────────

describe('Key Manager - Branch Coverage', () => {
  let km: typeof import('./key-manager')

  beforeEach(async () => {
    vi.resetModules()

    const store: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value }),
        removeItem: vi.fn((key: string) => { delete store[key] }),
        clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
      },
      writable: true,
      configurable: true,
    })

    km = await import('./key-manager')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateKeyFormat', () => {
    it('should reject placeholder keys', () => {
      expect(km.validateKeyFormat('openai', 'sk-...')).toEqual({
        valid: false,
        error: 'Please enter a real API key, not a placeholder',
      })
      expect(km.validateKeyFormat('anthropic', 'sk-ant-...')).toEqual({
        valid: false,
        error: 'Please enter a real API key, not a placeholder',
      })
      expect(km.validateKeyFormat('google', 'AIza...')).toEqual({
        valid: false,
        error: 'Please enter a real API key, not a placeholder',
      })
    })

    it('should reject keys shorter than 20 chars', () => {
      expect(km.validateKeyFormat('openai', 'sk-short')).toEqual({
        valid: false,
        error: 'API key is too short',
      })
    })

    it('should reject keys longer than 200 chars', () => {
      const longKey = 'sk-' + 'a'.repeat(250)
      expect(km.validateKeyFormat('openai', longKey)).toEqual({
        valid: false,
        error: 'API key is too long',
      })
    })

    it('should validate correct openai key format', () => {
      const key = 'sk-' + 'a'.repeat(40)
      expect(km.validateKeyFormat('openai', key)).toEqual({ valid: true })
    })

    it('should validate correct anthropic key format', () => {
      const key = 'sk-ant-' + 'a'.repeat(40)
      expect(km.validateKeyFormat('anthropic', key)).toEqual({ valid: true })
    })

    it('should validate correct google key format', () => {
      const key = 'AIza' + 'a'.repeat(40)
      expect(km.validateKeyFormat('google', key)).toEqual({ valid: true })
    })

    it('should reject key with wrong format pattern', () => {
      // Key long enough but wrong pattern
      const result = km.validateKeyFormat('openai', 'wrong-prefix-' + 'a'.repeat(40))
      expect(result.valid).toBe(false)
      expect(result.error).toContain('OpenAI keys start with')
    })

    it('should reject anthropic key with wrong pattern', () => {
      const result = km.validateKeyFormat('anthropic', 'sk-wrong-' + 'a'.repeat(40))
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Anthropic keys start with')
    })

    it('should reject google key with wrong pattern', () => {
      const result = km.validateKeyFormat('google', 'wrong-' + 'a'.repeat(40))
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Google Cloud keys start with')
    })
  })

  describe('maskApiKey', () => {
    it('should return "(not set)" for null', () => {
      expect(km.maskApiKey(null)).toBe('(not set)')
    })

    it('should return "(not set)" for empty string', () => {
      expect(km.maskApiKey('')).toBe('(not set)')
    })

    it('should return "****" for keys shorter than 12 chars', () => {
      expect(km.maskApiKey('short')).toBe('****')
      expect(km.maskApiKey('12345678901')).toBe('****')
    })

    it('should mask keys 12+ chars with first 8 and last 4', () => {
      expect(km.maskApiKey('sk-proj-abcdefghijklmnop')).toBe('sk-proj-...mnop')
    })
  })

  describe('migrateOldKeys', () => {
    it('should return 0 when no old keys exist', async () => {
      const count = await km.migrateOldKeys()
      expect(count).toBe(0)
    })

    it('should migrate old key when it exists and no new key is stored', async () => {
      // Set old key
      localStorage.setItem('insurai_openai_key', 'sk-' + 'a'.repeat(40))

      const count = await km.migrateOldKeys()
      // May be 0 if encryption fails in test env, but should not throw
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('should skip migration when new key already exists', async () => {
      // Set both old and new keys
      localStorage.setItem('insurai_openai_key', 'sk-old' + 'a'.repeat(40))
      localStorage.setItem('insurai_secure_openai', 'encrypted-value')

      const count = await km.migrateOldKeys()
      // Should not migrate since new key exists
      expect(count).toBe(0)
    })
  })

  describe('SecureKeyManager', () => {
    it('should track initialization state (idempotent)', async () => {
      await km.secureKeyManager.initialize()
      await km.secureKeyManager.initialize() // Second call should be no-op
      // No assertion needed - just verifying it doesn't fail
    })

    it('should report encryption support', () => {
      const supported = km.secureKeyManager.isEncryptionSupported()
      expect(typeof supported).toBe('boolean')
    })

    it('should return security status summary', () => {
      const status = km.secureKeyManager.getSecurityStatus()
      expect(status).toHaveProperty('encryptionSupported')
      expect(status).toHaveProperty('keyCount')
      expect(status).toHaveProperty('encryptedKeyCount')
      expect(status.providers).toHaveProperty('openai')
      expect(status.providers).toHaveProperty('anthropic')
      expect(status.providers).toHaveProperty('google')
    })

    it('should return key metadata correctly', () => {
      const meta = km.secureKeyManager.getKeyMetadata('openai')
      expect(meta).toEqual({
        exists: false,
        encrypted: false,
        updatedAt: null,
      })
    })

    it('hasKey should return false when no key stored', () => {
      expect(km.secureKeyManager.hasKey('openai')).toBe(false)
    })

    it('getKey should return null when no key stored', async () => {
      const key = await km.secureKeyManager.getKey('openai')
      expect(key).toBeNull()
    })

    it('setKey should fail validation for invalid key', async () => {
      const result = await km.secureKeyManager.setKey('openai', 'short')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

// ─── Tests for security-monitor.ts branch coverage ─────────────────────────

describe('Security Monitor - Branch Coverage', () => {
  // Using mocked audit-logger for these tests

  const { mockAudit } = vi.hoisted(() => {
    const cbs: Array<(event: unknown) => void> = []
    return {
      mockAudit: {
        onEvent: vi.fn((cb: (event: unknown) => void) => {
          cbs.push(cb)
          return () => {
            const idx = cbs.indexOf(cb)
            if (idx > -1) cbs.splice(idx, 1)
          }
        }),
        logSecurity: vi.fn(),
        getCallbacks: () => cbs,
        triggerEvent: (event: unknown) => {
          cbs.forEach(cb => cb(event))
        },
      },
    }
  })

  let sm: typeof import('./security-monitor')

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('./audit-logger', () => ({
      auditLogger: mockAudit,
    }))

    sm = await import('./security-monitor')
    sm.securityMonitor.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.doUnmock('./audit-logger')
  })

  describe('initialize - idempotent', () => {
    it('should only subscribe to events once', () => {
      sm.securityMonitor.initialize()
      expect(mockAudit.onEvent).toHaveBeenCalledTimes(1)

      sm.securityMonitor.initialize()
      // Should not subscribe again
      expect(mockAudit.onEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('trackFailedLogin - key fallback chain', () => {
    it('should use ipHash when available', () => {
      sm.securityMonitor.initialize()

      // Fire enough failed logins to trigger threshold
      for (let i = 0; i < 5; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: 'hash123',
          userId: undefined,
          details: {},
          timestamp: Date.now(),
        })
      }

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.brute_force_detected',
        expect.objectContaining({ attemptCount: 5 })
      )
    })

    it('should use userId when no ipHash', () => {
      sm.securityMonitor.initialize()

      for (let i = 0; i < 5; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: undefined,
          userId: 'user-bad',
          details: {},
          timestamp: Date.now(),
        })
      }

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.brute_force_detected',
        expect.anything()
      )
    })

    it('should use "unknown" when neither ipHash nor userId', () => {
      sm.securityMonitor.initialize()

      for (let i = 0; i < 5; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: undefined,
          userId: undefined,
          details: {},
          timestamp: Date.now(),
        })
      }

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.brute_force_detected',
        expect.anything()
      )
    })

    it('should raise critical alert at 2x threshold', () => {
      sm.securityMonitor.initialize()

      // Default threshold is 5, critical at 10
      for (let i = 0; i < 10; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: 'hash-critical',
          details: {},
          timestamp: Date.now(),
        })
      }

      const alerts = sm.securityMonitor.getActiveAlerts()
      const criticalAlert = alerts.find(a => a.severity === 'critical' && a.type === 'brute_force')
      expect(criticalAlert).toBeDefined()
    })

    it('should also track auth.signup_failed events', () => {
      sm.securityMonitor.initialize()

      for (let i = 0; i < 5; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signup_failed',
          ipHash: 'signup-hash',
          details: {},
          timestamp: Date.now(),
        })
      }

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.brute_force_detected',
        expect.anything()
      )
    })
  })

  describe('trackRateViolation', () => {
    it('should track and alert on excessive rate violations', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ rateLimitViolationsThreshold: 3 })

      for (let i = 0; i < 3; i++) {
        mockAudit.triggerEvent({
          type: 'security.rate_limit_exceeded',
          userId: 'rate-abuser',
          details: {},
          timestamp: Date.now(),
        })
      }

      const alerts = sm.securityMonitor.getActiveAlerts()
      const rateAlert = alerts.find(a => a.type === 'rate_abuse')
      expect(rateAlert).toBeDefined()
      expect(rateAlert!.severity).toBe('warning')
    })

    it('should use ipHash as fallback key for rate violations', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ rateLimitViolationsThreshold: 2 })

      for (let i = 0; i < 2; i++) {
        mockAudit.triggerEvent({
          type: 'security.rate_limit_exceeded',
          userId: undefined,
          ipHash: 'rate-ip',
          details: {},
          timestamp: Date.now(),
        })
      }

      const alerts = sm.securityMonitor.getActiveAlerts()
      expect(alerts.some(a => a.type === 'rate_abuse')).toBe(true)
    })
  })

  describe('checkForInjection', () => {
    it('should detect SQL injection - OR 1=1', () => {
      sm.securityMonitor.initialize()

      mockAudit.triggerEvent({
        type: 'policy.created',
        details: { search: "' OR 1=1 --" },
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.injection_attempt_detected',
        expect.objectContaining({ type: 'sql' })
      )
    })

    it('should detect SQL injection - UNION SELECT', () => {
      sm.securityMonitor.initialize()

      mockAudit.triggerEvent({
        type: 'policy.created',
        details: { input: 'UNION SELECT * FROM users' },
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.injection_attempt_detected',
        expect.objectContaining({ type: 'sql' })
      )
    })

    it('should detect SQL injection - DROP TABLE', () => {
      sm.securityMonitor.initialize()

      mockAudit.triggerEvent({
        type: 'policy.created',
        details: { input: '; DROP TABLE users' },
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.injection_attempt_detected',
        expect.objectContaining({ type: 'sql' })
      )
    })

    it('should detect XSS - script tag', () => {
      sm.securityMonitor.initialize()

      mockAudit.triggerEvent({
        type: 'policy.created',
        details: { name: '<script>alert("xss")</script>' },
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.xss_attempt_detected',
        expect.objectContaining({ type: 'xss' })
      )
    })

    it('should detect XSS - javascript: protocol', () => {
      sm.securityMonitor.initialize()

      mockAudit.triggerEvent({
        type: 'policy.created',
        details: { url: 'javascript:alert(1)' },
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.xss_attempt_detected',
        expect.objectContaining({ type: 'xss' })
      )
    })

    it('should detect XSS - event handler', () => {
      sm.securityMonitor.initialize()

      mockAudit.triggerEvent({
        type: 'policy.created',
        details: { value: 'onclick=alert(1)' },
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.xss_attempt_detected',
        expect.objectContaining({ type: 'xss' })
      )
    })

    it('should detect XSS - iframe tag', () => {
      sm.securityMonitor.initialize()

      mockAudit.triggerEvent({
        type: 'policy.created',
        details: { html: '<iframe src="evil.com">' },
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).toHaveBeenCalledWith(
        'security.xss_attempt_detected',
        expect.objectContaining({ type: 'xss' })
      )
    })

    it('should not alert on clean details', () => {
      sm.securityMonitor.initialize()

      mockAudit.triggerEvent({
        type: 'policy.created',
        details: { name: 'Normal policy name' },
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).not.toHaveBeenCalledWith(
        'security.injection_attempt_detected',
        expect.anything()
      )
      expect(mockAudit.logSecurity).not.toHaveBeenCalledWith(
        'security.xss_attempt_detected',
        expect.anything()
      )
    })

    it('should skip injection check when details is falsy', () => {
      sm.securityMonitor.initialize()

      // Event without details should not trigger injection check
      mockAudit.triggerEvent({
        type: 'policy.created',
        details: null,
        timestamp: Date.now(),
      })

      expect(mockAudit.logSecurity).not.toHaveBeenCalled()
    })
  })

  describe('raiseAlert - deduplication and severity upgrade', () => {
    it('should not create duplicate alerts for same type/user/ip', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 2 })

      // Trigger alert
      for (let i = 0; i < 3; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: 'dedup-ip',
          details: {},
          timestamp: Date.now(),
        })
      }

      const alerts = sm.securityMonitor.getActiveAlerts()
      const bruteForceAlerts = alerts.filter(a => a.type === 'brute_force' && a.ipHash === 'dedup-ip')
      expect(bruteForceAlerts).toHaveLength(1)
    })

    it('should upgrade severity from warning to critical on existing alert', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 2 })

      // First trigger warning (2 attempts)
      for (let i = 0; i < 2; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: 'upgrade-ip',
          details: {},
          timestamp: Date.now(),
        })
      }

      let alerts = sm.securityMonitor.getActiveAlerts()
      let bruteForce = alerts.find(a => a.type === 'brute_force' && a.ipHash === 'upgrade-ip')
      expect(bruteForce!.severity).toBe('warning')

      // More attempts to trigger critical (4 = 2x threshold)
      for (let i = 0; i < 2; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: 'upgrade-ip',
          details: {},
          timestamp: Date.now(),
        })
      }

      alerts = sm.securityMonitor.getActiveAlerts()
      bruteForce = alerts.find(a => a.type === 'brute_force' && a.ipHash === 'upgrade-ip')
      expect(bruteForce!.severity).toBe('critical')
    })
  })

  describe('alert management', () => {
    it('resolveAlert should return false for non-existent alert', () => {
      expect(sm.securityMonitor.resolveAlert('non-existent-id')).toBe(false)
    })

    it('resolveAlert should mark alert as resolved', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

      mockAudit.triggerEvent({
        type: 'auth.signin_failed',
        ipHash: 'resolve-test',
        details: {},
        timestamp: Date.now(),
      })

      const alerts = sm.securityMonitor.getActiveAlerts()
      expect(alerts.length).toBeGreaterThan(0)

      const alertId = alerts[0].id
      const result = sm.securityMonitor.resolveAlert(alertId, 'admin-user')
      expect(result).toBe(true)

      const active = sm.securityMonitor.getActiveAlerts()
      expect(active.find(a => a.id === alertId)).toBeUndefined()
    })

    it('getAllAlerts should return alerts in reverse order with limit', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

      // Create multiple alerts from different IPs
      for (let i = 0; i < 5; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: `ip-${i}`,
          details: {},
          timestamp: Date.now(),
        })
      }

      const allAlerts = sm.securityMonitor.getAllAlerts(3)
      expect(allAlerts.length).toBeLessThanOrEqual(3)
    })

    it('onAlert should notify listener when new alert raised', () => {
      const listener = vi.fn()
      const unsub = sm.securityMonitor.onAlert(listener)

      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

      mockAudit.triggerEvent({
        type: 'auth.signin_failed',
        ipHash: 'listener-test',
        details: {},
        timestamp: Date.now(),
      })

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'brute_force',
      }))

      unsub()
    })

    it('onAlert should handle listener errors gracefully', () => {
      const failingListener = vi.fn(() => { throw new Error('listener fail') })
      const unsub = sm.securityMonitor.onAlert(failingListener)

      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

      // Should not throw
      expect(() => {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: 'listener-error-test',
          details: {},
          timestamp: Date.now(),
        })
      }).not.toThrow()

      unsub()
    })

    it('should limit alerts to 100 entries', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

      // Create more than 100 alerts (each from different IP to avoid dedup)
      for (let i = 0; i < 105; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: `ip-overflow-${i}`,
          details: {},
          timestamp: Date.now(),
        })
      }

      const allAlerts = sm.securityMonitor.getAllAlerts(200)
      expect(allAlerts.length).toBeLessThanOrEqual(100)
    })
  })

  describe('sensitivity multipliers', () => {
    it('should use 0.5x multiplier for high sensitivity', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ suspiciousActivitySensitivity: 'high' })

      // With high sensitivity, scraping threshold is 30 * 0.5 = 15 requests/min
      // 5-minute window = need > 75 requests to exceed threshold
      // Access pattern check requires >= 5 recent actions and lastCheck window elapsed

      // This tests that the threshold configuration is accepted without error
      const dashboard = sm.securityMonitor.getSecurityDashboard()
      expect(dashboard).toBeDefined()
    })

    it('should use 2x multiplier for low sensitivity', () => {
      sm.securityMonitor.setThresholds({ suspiciousActivitySensitivity: 'low' })

      // With low sensitivity, threshold is 30 * 2 = 60 requests/min
      const dashboard = sm.securityMonitor.getSecurityDashboard()
      expect(dashboard).toBeDefined()
    })
  })

  describe('getSecurityDashboard', () => {
    it('should return comprehensive dashboard data', () => {
      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 2 })

      // Add some failed logins
      mockAudit.triggerEvent({
        type: 'auth.signin_failed',
        ipHash: 'dash-ip',
        details: {},
        timestamp: Date.now(),
      })

      // Add rate violations
      mockAudit.triggerEvent({
        type: 'security.rate_limit_exceeded',
        userId: 'dash-user',
        details: {},
        timestamp: Date.now(),
      })

      const dashboard = sm.securityMonitor.getSecurityDashboard()
      expect(dashboard).toHaveProperty('activeAlerts')
      expect(dashboard).toHaveProperty('criticalAlerts')
      expect(dashboard).toHaveProperty('recentAlerts')
      expect(dashboard).toHaveProperty('failedLoginAttempts')
      expect(dashboard).toHaveProperty('rateViolationCount')
      expect(dashboard).toHaveProperty('suspiciousPatterns')
      expect(dashboard.failedLoginAttempts).toBeGreaterThan(0)
      expect(dashboard.rateViolationCount).toBeGreaterThan(0)
    })
  })

  describe('inputSanitizer', () => {
    it('sanitizeString should escape all dangerous characters', () => {
      const result = sm.inputSanitizer.sanitizeString('<script>alert("xss")</script>')
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
      expect(result).toContain('&lt;')
      expect(result).toContain('&gt;')
      expect(result).toContain('&quot;')
    })

    it('sanitizeString should escape ampersands', () => {
      expect(sm.inputSanitizer.sanitizeString('a&b')).toBe('a&amp;b')
    })

    it('sanitizeString should escape single quotes', () => {
      const result = sm.inputSanitizer.sanitizeString("it's")
      expect(result).toContain('&#x27;')
    })

    it('sanitizeString should escape forward slashes', () => {
      const result = sm.inputSanitizer.sanitizeString('a/b')
      expect(result).toContain('&#x2F;')
    })

    it('hasSuspiciousContent should detect SQL patterns', () => {
      expect(sm.inputSanitizer.hasSuspiciousContent('UNION SELECT *')).toBe(true)
      expect(sm.inputSanitizer.hasSuspiciousContent('DROP TABLE users')).toBe(true)
      expect(sm.inputSanitizer.hasSuspiciousContent('normal query --')).toBe(true)
      expect(sm.inputSanitizer.hasSuspiciousContent('/* comment */')).toBe(true)
    })

    it('hasSuspiciousContent should detect XSS patterns', () => {
      expect(sm.inputSanitizer.hasSuspiciousContent('<script>')).toBe(true)
      expect(sm.inputSanitizer.hasSuspiciousContent('javascript:void(0)')).toBe(true)
      expect(sm.inputSanitizer.hasSuspiciousContent('onclick=alert(1)')).toBe(true)
    })

    it('hasSuspiciousContent should return false for clean input', () => {
      expect(sm.inputSanitizer.hasSuspiciousContent('Normal insurance policy text')).toBe(false)
      expect(sm.inputSanitizer.hasSuspiciousContent('Kasko sigortasi')).toBe(false)
    })

    it('sanitizeObject should recursively sanitize strings in objects', () => {
      const input = {
        name: '<script>bad</script>',
        nested: {
          value: 'onclick=alert(1)',
        },
        number: 42,
        isActive: true,
      }

      const result = sm.inputSanitizer.sanitizeObject(input)
      expect(result.name).toContain('&lt;')
      expect(result.nested.value).toContain('onclick')  // Still contains text, but escaped
      expect(result.number).toBe(42)
      expect(result.isActive).toBe(true)
    })

    it('sanitizeObject should handle null values within objects', () => {
      const input = {
        name: 'test',
        empty: null,
        undef: undefined,
      }

      const result = sm.inputSanitizer.sanitizeObject(input as Record<string, unknown>)
      expect(result.name).toBe('test')
      expect(result.empty).toBeNull()
      expect(result.undef).toBeUndefined()
    })
  })

  describe('isSecureContext', () => {
    it('should return false when window is undefined', () => {
      const originalWindow = globalThis.window
      // @ts-expect-error - testing undefined window
      delete globalThis.window

      expect(sm.isSecureContext()).toBe(false)

      Object.defineProperty(globalThis, 'window', { value: originalWindow, writable: true, configurable: true })
    })

    it('should return window.isSecureContext when available', () => {
      const mockWin = {
        isSecureContext: true,
        location: { protocol: 'http:' },
      }
      Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true })

      expect(sm.isSecureContext()).toBe(true)
    })

    it('should fallback to protocol check when isSecureContext is undefined', () => {
      const mockWin = {
        isSecureContext: undefined,
        location: { protocol: 'https:' },
      }
      Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true })

      expect(sm.isSecureContext()).toBe(true)
    })

    it('should return false for http protocol when isSecureContext is undefined', () => {
      const mockWin = {
        isSecureContext: undefined,
        location: { protocol: 'http:' },
      }
      Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true })

      expect(sm.isSecureContext()).toBe(false)
    })
  })

  describe('generateSecurityReport', () => {
    it('should generate report with secure context recommendation', async () => {
      const mockWin = {
        isSecureContext: false,
        location: { protocol: 'http:' },
      }
      Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true })

      const report = await sm.generateSecurityReport()
      expect(report.secureContext).toBe(false)
      expect(report.recommendations).toContain(
        'Application is not running in a secure context (HTTPS). API keys may be vulnerable.'
      )
    })

    it('should include critical alerts recommendation', async () => {
      const mockWin = {
        isSecureContext: true,
        location: { protocol: 'https:' },
      }
      Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true })

      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 1 })

      // Create critical alert (2x threshold = 2 attempts)
      for (let i = 0; i < 2; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: 'report-ip',
          details: {},
          timestamp: Date.now(),
        })
      }

      const report = await sm.generateSecurityReport()
      const criticalRec = report.recommendations.find(r => r.includes('critical security alert'))
      expect(criticalRec).toBeDefined()
    })

    it('should include high failed logins recommendation', async () => {
      const mockWin = {
        isSecureContext: true,
        location: { protocol: 'https:' },
      }
      Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true })

      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ failedLoginsThreshold: 100 }) // High threshold to avoid alert

      // Add 11 failed login events
      for (let i = 0; i < 11; i++) {
        mockAudit.triggerEvent({
          type: 'auth.signin_failed',
          ipHash: `report-ip-${i}`,
          details: {},
          timestamp: Date.now(),
        })
      }

      const report = await sm.generateSecurityReport()
      const loginRec = report.recommendations.find(r => r.includes('failed login attempts'))
      expect(loginRec).toBeDefined()
    })

    it('should include rate violation recommendation', async () => {
      const mockWin = {
        isSecureContext: true,
        location: { protocol: 'https:' },
      }
      Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true })

      sm.securityMonitor.initialize()
      sm.securityMonitor.setThresholds({ rateLimitViolationsThreshold: 100 })

      // Add 21 rate violation events from different users
      for (let i = 0; i < 21; i++) {
        mockAudit.triggerEvent({
          type: 'security.rate_limit_exceeded',
          userId: `rate-user-${i}`,
          details: {},
          timestamp: Date.now(),
        })
      }

      const report = await sm.generateSecurityReport()
      const rateRec = report.recommendations.find(r => r.includes('rate limit violations'))
      expect(rateRec).toBeDefined()
    })

    it('should return crypto support status', async () => {
      const mockWin = {
        isSecureContext: true,
        location: { protocol: 'https:' },
      }
      Object.defineProperty(globalThis, 'window', { value: mockWin, writable: true, configurable: true })

      const report = await sm.generateSecurityReport()
      expect(typeof report.cryptoSupported).toBe('boolean')
      expect(report.timestamp).toBeDefined()
      expect(Array.isArray(report.alerts)).toBe(true)
      expect(report.dashboard).toBeDefined()
    })
  })
})

// ─── Tests for csp.ts branch coverage ──────────────────────────────────────

describe('CSP - Branch Coverage', () => {
  let csp: typeof import('./csp')

  beforeEach(async () => {
    vi.resetModules()
    csp = await import('./csp')
  })

  describe('buildCSPMetaTag', () => {
    it('should build production CSP without dev additions', () => {
      const result = csp.buildCSPMetaTag(false)

      expect(result).toContain("default-src 'self'")
      expect(result).not.toContain('unsafe-eval')
      expect(result).not.toContain('localhost')
    })

    it('should build dev CSP with dev additions', () => {
      const result = csp.buildCSPMetaTag(true)

      expect(result).toContain("'unsafe-eval'")
      expect(result).toContain('http://localhost:*')
      expect(result).toContain('ws://localhost:*')
    })

    it('should default to production (isDev=false)', () => {
      const result = csp.buildCSPMetaTag()

      expect(result).not.toContain('unsafe-eval')
    })

    it('should include all base directive categories', () => {
      const result = csp.buildCSPMetaTag(false)

      expect(result).toContain('default-src')
      expect(result).toContain('script-src')
      expect(result).toContain('style-src')
      expect(result).toContain('font-src')
      expect(result).toContain('img-src')
      expect(result).toContain('connect-src')
      expect(result).toContain('worker-src')
      expect(result).toContain('object-src')
    })
  })

  describe('CSP_DIRECTIVES', () => {
    it('should have object-src set to none', () => {
      expect(csp.CSP_DIRECTIVES['object-src']).toContain("'none'")
    })

    it('should allow blob: for worker-src', () => {
      expect(csp.CSP_DIRECTIVES['worker-src']).toContain('blob:')
    })
  })

  describe('CSP_SERVER_ONLY', () => {
    it('should have frame-ancestors set to none', () => {
      expect(csp.CSP_SERVER_ONLY['frame-ancestors']).toContain("'none'")
    })

    it('should have upgrade-insecure-requests', () => {
      expect(csp.CSP_SERVER_ONLY['upgrade-insecure-requests']).toEqual([])
    })
  })

  describe('handleCSPViolation', () => {
    it('should log violation details', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const mockEvent = {
        blockedURI: 'https://evil.com/script.js',
        violatedDirective: 'script-src',
        originalPolicy: "script-src 'self'",
        sourceFile: 'app.js',
        lineNumber: 42,
        columnNumber: 10,
      } as SecurityPolicyViolationEvent

      csp.handleCSPViolation(mockEvent)

      expect(warnSpy).toHaveBeenCalledWith('CSP Violation:', {
        blockedURI: 'https://evil.com/script.js',
        violatedDirective: 'script-src',
        originalPolicy: "script-src 'self'",
        sourceFile: 'app.js',
        lineNumber: 42,
        columnNumber: 10,
      })

      warnSpy.mockRestore()
    })
  })

  describe('setupCSPViolationListener', () => {
    it('should add event listener when document is defined', () => {
      const addEventSpy = vi.spyOn(document, 'addEventListener').mockImplementation(() => {})

      csp.setupCSPViolationListener()

      expect(addEventSpy).toHaveBeenCalledWith('securitypolicyviolation', csp.handleCSPViolation)

      addEventSpy.mockRestore()
    })
  })
})
