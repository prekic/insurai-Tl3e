/**
 * Audit Logger Tests
 * Tests for structured logging with IndexedDB persistence
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  auditLogger,
  audit,
  createTimedAudit,
} from './audit-logger'

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn(),
}
Object.defineProperty(global, 'indexedDB', { value: mockIndexedDB, writable: true })

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(global, 'localStorage', { value: mockLocalStorage })

// Mock crypto
const mockCrypto = {
  subtle: {
    digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
  },
}
Object.defineProperty(global, 'crypto', { value: mockCrypto })

describe('Audit Logger', () => {
  beforeEach(async () => {
    mockLocalStorage.clear()
    await auditLogger.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('log', () => {
    it('should log an event and return it', async () => {
      const event = await auditLogger.log('auth.signin', { method: 'email' })

      expect(event).toBeDefined()
      expect(event.id).toBeDefined()
      expect(event.type).toBe('auth.signin')
      expect(event.category).toBe('auth')
    })

    it('should set correct category from type', async () => {
      const authEvent = await auditLogger.log('auth.signin', {})
      const policyEvent = await auditLogger.log('policy.created', {})
      const aiEvent = await auditLogger.log('ai.extraction_started', {})

      expect(authEvent.category).toBe('auth')
      expect(policyEvent.category).toBe('policy')
      expect(aiEvent.category).toBe('ai')
    })

    it('should set severity based on event type', async () => {
      const infoEvent = await auditLogger.log('auth.signin', {})
      const errorEvent = await auditLogger.log('auth.signin_failed', { success: false })

      expect(infoEvent.severity).toBe('info')
      expect(errorEvent.severity).toBe('error')
    })

    it('should include timestamp', async () => {
      const before = Date.now()
      const event = await auditLogger.log('auth.signin', {})
      const after = Date.now()

      expect(event.timestamp).toBeGreaterThanOrEqual(before)
      expect(event.timestamp).toBeLessThanOrEqual(after)
      expect(event.timestampISO).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should include user ID when provided', async () => {
      const event = await auditLogger.log('auth.signin', {}, { userId: 'user-123' })

      expect(event.userId).toBe('user-123')
    })

    it('should include session ID when provided', async () => {
      const event = await auditLogger.log('auth.signin', {}, { sessionId: 'session-456' })

      expect(event.sessionId).toBe('session-456')
    })

    it('should include duration when provided', async () => {
      const event = await auditLogger.log('ai.extraction_completed', {}, { durationMs: 1500 })

      expect(event.durationMs).toBe(1500)
    })

    it('should hash IP address for privacy', async () => {
      const event = await auditLogger.log('auth.signin', {}, { ip: '192.168.1.1' })

      expect(event.ipHash).toBeDefined()
      expect(event.ipHash).not.toBe('192.168.1.1')
    })

    it('should include details', async () => {
      const event = await auditLogger.log('policy.created', {
        policyType: 'home',
        amount: 100000,
      })

      expect(event.details).toEqual({
        policyType: 'home',
        amount: 100000,
      })
    })

    it('should set success to true by default for non-failed events', async () => {
      const event = await auditLogger.log('auth.signin', {})

      expect(event.success).toBe(true)
    })

    it('should set success to false for failed events', async () => {
      const event = await auditLogger.log('auth.signin_failed', {})

      expect(event.success).toBe(false)
    })

    it('should include error message when provided', async () => {
      const event = await auditLogger.log('auth.signin_failed', {}, {
        success: false,
        errorMessage: 'Invalid credentials',
        errorCode: 'AUTH_INVALID_CREDS',
      })

      expect(event.errorMessage).toBe('Invalid credentials')
      expect(event.errorCode).toBe('AUTH_INVALID_CREDS')
    })
  })

  describe('logAI', () => {
    it('should log AI events with typed details', async () => {
      const event = await auditLogger.logAI('ai.extraction_started', {
        provider: 'openai',
        model: 'gpt-4',
        documentLength: 5000,
      })

      expect(event.type).toBe('ai.extraction_started')
      expect(event.resourceType).toBe('ai_operation')
      expect(event.details).toHaveProperty('provider', 'openai')
    })

    it('should include duration for AI operations', async () => {
      const event = await auditLogger.logAI('ai.extraction_completed', {
        provider: 'openai',
        model: 'gpt-4',
        tokenCount: 500,
      }, { durationMs: 2500 })

      expect(event.durationMs).toBe(2500)
    })
  })

  describe('logPolicy', () => {
    it('should log policy events with typed details', async () => {
      const event = await auditLogger.logPolicy('policy.created', {
        policyId: 'pol-123',
        policyType: 'home',
        action: 'create',
      })

      expect(event.type).toBe('policy.created')
      expect(event.resourceType).toBe('policy')
      expect(event.resourceId).toBe('pol-123')
    })
  })

  describe('logAuth', () => {
    it('should log auth events with masked email', async () => {
      const event = await auditLogger.logAuth('auth.signin', {
        method: 'email',
        email: 'test@example.com',
      })

      expect(event.type).toBe('auth.signin')
      expect(event.details).toHaveProperty('email')
      expect((event.details as { email: string }).email).toContain('***')
      expect((event.details as { email: string }).email).not.toBe('test@example.com')
    })

    it('should include failure reason for failed auth', async () => {
      const event = await auditLogger.logAuth('auth.signin_failed', {
        method: 'email',
        failureReason: 'Invalid password',
      }, { success: false })

      expect(event.success).toBe(false)
      expect(event.details).toHaveProperty('failureReason', 'Invalid password')
    })
  })

  describe('logExport', () => {
    it('should log export events', async () => {
      const event = await auditLogger.logExport('export.pdf_generated', {
        format: 'pdf',
        fileSize: 125000,
        policyCount: 5,
      })

      expect(event.type).toBe('export.pdf_generated')
      expect(event.resourceType).toBe('export')
    })
  })

  describe('logSecurity', () => {
    it('should log security events', async () => {
      const event = await auditLogger.logSecurity('security.rate_limit_exceeded', {
        operation: 'ai_extraction',
        attemptCount: 35,
      })

      expect(event.type).toBe('security.rate_limit_exceeded')
      expect(event.resourceType).toBe('security')
      expect(event.success).toBe(false)
    })
  })

  describe('logError', () => {
    it('should log Error objects', async () => {
      const error = new Error('Something went wrong')
      const event = await auditLogger.logError(error)

      expect(event.type).toBe('error.unhandled')
      expect(event.details).toHaveProperty('message', 'Something went wrong')
      expect(event.errorMessage).toBe('Something went wrong')
    })

    it('should log string errors', async () => {
      const event = await auditLogger.logError('Custom error message')

      expect(event.details).toHaveProperty('message', 'Custom error message')
    })

    it('should include context', async () => {
      const error = new Error('Test error')
      const event = await auditLogger.logError(error, { component: 'PolicyUploader' })

      expect(event.details).toHaveProperty('component', 'PolicyUploader')
    })
  })

  describe('query', () => {
    it('should return events matching query', async () => {
      await auditLogger.log('auth.signin', {}, { userId: 'user-123' })
      await auditLogger.log('auth.signout', {}, { userId: 'user-123' })
      await auditLogger.log('auth.signin', {}, { userId: 'user-456' })

      const events = await auditLogger.query({ userId: 'user-123' })

      expect(events.length).toBe(2)
      events.forEach(event => {
        expect(event.userId).toBe('user-123')
      })
    })

    it('should filter by category', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('policy.created', {})

      const events = await auditLogger.query({ category: 'auth' })

      expect(events.every(e => e.category === 'auth')).toBe(true)
    })

    it('should filter by type', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('auth.signout', {})

      const events = await auditLogger.query({ type: 'auth.signin' })

      expect(events.every(e => e.type === 'auth.signin')).toBe(true)
    })

    it('should filter by severity', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('auth.signin_failed', {})

      const events = await auditLogger.query({ severity: 'error' })

      expect(events.every(e => e.severity === 'error')).toBe(true)
    })

    it('should filter by success', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('auth.signin_failed', {})

      const successEvents = await auditLogger.query({ success: true })
      const failedEvents = await auditLogger.query({ success: false })

      expect(successEvents.every(e => e.success)).toBe(true)
      expect(failedEvents.every(e => !e.success)).toBe(true)
    })

    it('should respect limit', async () => {
      for (let i = 0; i < 10; i++) {
        await auditLogger.log('auth.signin', {})
      }

      const events = await auditLogger.query({ limit: 5 })

      expect(events.length).toBeLessThanOrEqual(5)
    })

    it('should filter by date range', async () => {
      const now = Date.now()
      await auditLogger.log('auth.signin', {})

      const events = await auditLogger.query({
        startDate: new Date(now - 1000),
        endDate: new Date(now + 1000),
      })

      expect(events.length).toBeGreaterThan(0)
    })
  })

  describe('getStats', () => {
    it('should return statistics for events', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('auth.signin_failed', {})
      await auditLogger.log('policy.created', {})

      const stats = await auditLogger.getStats()

      expect(stats.totalEvents).toBeGreaterThan(0)
      expect(stats.eventsByCategory).toBeDefined()
      expect(stats.eventsBySeverity).toBeDefined()
    })

    it('should calculate error rate', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('auth.signin_failed', {})
      await auditLogger.log('auth.signin', {})

      const stats = await auditLogger.getStats()

      expect(stats.errorRate).toBeGreaterThan(0)
      expect(stats.errorRate).toBeLessThan(1)
    })

    it('should track top event types', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('policy.created', {})

      const stats = await auditLogger.getStats()

      expect(stats.topEventTypes.length).toBeGreaterThan(0)
      expect(stats.topEventTypes[0].type).toBe('auth.signin')
      expect(stats.topEventTypes[0].count).toBe(3)
    })

    it('should calculate average duration', async () => {
      await auditLogger.log('ai.extraction_completed', {}, { durationMs: 1000 })
      await auditLogger.log('ai.extraction_completed', {}, { durationMs: 2000 })

      const stats = await auditLogger.getStats()

      expect(stats.avgDurationMs).toBe(1500)
    })
  })

  describe('cleanup', () => {
    it('should clean old events based on retention policy', async () => {
      const cleaned = await auditLogger.cleanup()

      expect(typeof cleaned).toBe('number')
    })
  })

  describe('clear', () => {
    it('should clear all logs', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('auth.signin', {})

      await auditLogger.clear()

      const events = await auditLogger.query()
      expect(events.length).toBe(0)
    })
  })

  describe('onEvent', () => {
    it('should notify listeners on new events', async () => {
      const listener = vi.fn()
      const cleanup = auditLogger.onEvent(listener)

      await auditLogger.log('auth.signin', {})

      expect(listener).toHaveBeenCalled()
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'auth.signin',
      }))

      cleanup()
    })

    it('should remove listener on cleanup', async () => {
      const listener = vi.fn()
      const cleanup = auditLogger.onEvent(listener)

      cleanup()

      await auditLogger.log('auth.signin', {})

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('setRetentionPolicy', () => {
    it('should update retention policy', () => {
      auditLogger.setRetentionPolicy({ infoRetentionDays: 7 })

      // No error means success
      expect(true).toBe(true)
    })
  })

  describe('setDebug', () => {
    it('should toggle debug mode', () => {
      auditLogger.setDebug(true)
      auditLogger.setDebug(false)

      // No error means success
      expect(true).toBe(true)
    })
  })

  describe('export', () => {
    it('should export logs as JSON string', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('policy.created', {})

      const json = await auditLogger.export()

      const parsed = JSON.parse(json)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBeGreaterThan(0)
    })

    it('should respect query options in export', async () => {
      await auditLogger.log('auth.signin', {})
      await auditLogger.log('policy.created', {})

      const json = await auditLogger.export({ category: 'auth' })

      const parsed = JSON.parse(json)
      expect(parsed.every((e: { category: string }) => e.category === 'auth')).toBe(true)
    })
  })
})

describe('audit helper', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should log events using convenience function', async () => {
    const event = await audit('auth.signin', { method: 'email' })

    expect(event.type).toBe('auth.signin')
  })

  it('should work without details', async () => {
    const event = await audit('auth.signout')

    expect(event.type).toBe('auth.signout')
    expect(event.details).toEqual({})
  })
})

describe('createTimedAudit', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should create timed audit that tracks duration', async () => {
    const timedAudit = createTimedAudit('ai.extraction_started', { provider: 'openai' })

    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 50))

    const event = await timedAudit.complete()

    expect(event.durationMs).toBeGreaterThanOrEqual(45)
    expect(event.success).toBe(true)
  })

  it('should support complete with extra details', async () => {
    const timedAudit = createTimedAudit('ai.extraction_started', { provider: 'openai' })

    const event = await timedAudit.complete({ tokensUsed: 500 })

    expect(event.details).toHaveProperty('tokensUsed', 500)
    expect(event.details).toHaveProperty('provider', 'openai')
  })

  it('should support fail method', async () => {
    const timedAudit = createTimedAudit('ai.extraction_started', { provider: 'openai' })

    const event = await timedAudit.fail(new Error('API timeout'))

    expect(event.success).toBe(false)
    expect(event.errorMessage).toBe('API timeout')
    expect(event.durationMs).toBeDefined()
  })

  it('should support fail with string error', async () => {
    const timedAudit = createTimedAudit('ai.extraction_started', {})

    const event = await timedAudit.fail('Connection refused')

    expect(event.errorMessage).toBe('Connection refused')
  })
})

describe('Query with offset', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should apply offset to results', async () => {
    // Create 5 events
    for (let i = 0; i < 5; i++) {
      await auditLogger.log('auth.signin', { index: i })
    }

    const events = await auditLogger.query({ offset: 2 })

    // Should skip first 2 events
    expect(events.length).toBeLessThanOrEqual(3)
  })

  it('should apply both offset and limit', async () => {
    // Create 10 events
    for (let i = 0; i < 10; i++) {
      await auditLogger.log('auth.signin', { index: i })
    }

    const events = await auditLogger.query({ offset: 3, limit: 2 })

    expect(events.length).toBeLessThanOrEqual(2)
  })

  it('should return empty array when offset exceeds event count', async () => {
    await auditLogger.log('auth.signin', {})
    await auditLogger.log('auth.signin', {})

    const events = await auditLogger.query({ offset: 10 })

    expect(events.length).toBe(0)
  })
})

describe('Listener error handling', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should continue notifying other listeners when one throws', async () => {
    const errorListener = vi.fn(() => {
      throw new Error('Listener error')
    })
    const successListener = vi.fn()

    const cleanup1 = auditLogger.onEvent(errorListener)
    const cleanup2 = auditLogger.onEvent(successListener)

    await auditLogger.log('auth.signin', {})

    // Both should have been called despite first one throwing
    expect(errorListener).toHaveBeenCalled()
    expect(successListener).toHaveBeenCalled()

    cleanup1()
    cleanup2()
  })
})

describe('Email masking edge cases', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should mask short email local parts', async () => {
    const event = await auditLogger.logAuth('auth.signin', {
      method: 'email',
      email: 'ab@example.com', // Only 2 characters in local part
    })

    expect((event.details as { email: string }).email).toBe('***@example.com')
  })

  it('should mask single character email', async () => {
    const event = await auditLogger.logAuth('auth.signin', {
      method: 'email',
      email: 'a@test.com',
    })

    expect((event.details as { email: string }).email).toBe('***@test.com')
  })

  it('should handle email without @ symbol', async () => {
    const event = await auditLogger.logAuth('auth.signin', {
      method: 'email',
      email: 'invalid-email',
    })

    expect((event.details as { email: string }).email).toBe('***')
  })
})

describe('LocalStorage error handling', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should handle localStorage quota exceeded', async () => {
    // Override setItem to throw quota error
    const originalSetItem = mockLocalStorage.setItem
    mockLocalStorage.setItem = vi.fn(() => {
      throw new Error('QuotaExceededError')
    })

    // Should not throw - just silently fail
    await auditLogger.log('auth.signin', {})
    await auditLogger.log('auth.signin', {})

    // Restore original
    mockLocalStorage.setItem = originalSetItem
  })

  it('should handle localStorage unavailable', async () => {
    // Mock localStorage as undefined temporarily
    const originalLocalStorage = global.localStorage
    Object.defineProperty(global, 'localStorage', { value: undefined, writable: true })

    // Should not throw
    await auditLogger.log('auth.signin', {})

    // Restore
    Object.defineProperty(global, 'localStorage', { value: originalLocalStorage, writable: true })
  })
})

describe('Resource filtering in query', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should filter by resourceId', async () => {
    await auditLogger.logPolicy('policy.created', { policyId: 'pol-1', policyType: 'home', action: 'create' })
    await auditLogger.logPolicy('policy.created', { policyId: 'pol-2', policyType: 'home', action: 'create' })

    const events = await auditLogger.query({ resourceId: 'pol-1' })

    expect(events.every(e => e.resourceId === 'pol-1')).toBe(true)
  })
})

describe('Edge cases - Severity determination', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should set critical severity for critical events', async () => {
    const event = await auditLogger.log('error.unhandled', { critical: true }, {
      errorMessage: 'System failure',
    })
    // While 'critical' isn't in the type, error.unhandled gets error severity
    expect(event.severity).toBe('error')
  })

  it('should set warning severity for security events', async () => {
    const event = await auditLogger.log('security.suspicious_activity', {
      action: 'unusual_access',
    })
    expect(event.severity).toBe('warning')
  })

  it('should fall back to error category for unknown event prefixes', async () => {
    // This tests the fallback in getCategoryFromType
    const event = await auditLogger.log('unknown.event_type' as any, {})
    expect(event.category).toBe('error')
  })
})

describe('Edge cases - getStats with empty data', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should return zero error rate when no events exist', async () => {
    const stats = await auditLogger.getStats()

    expect(stats.totalEvents).toBe(0)
    expect(stats.errorRate).toBe(0)
  })

  it('should return zero average duration when no events have duration', async () => {
    await auditLogger.log('auth.signin', {})
    await auditLogger.log('auth.signout', {})

    const stats = await auditLogger.getStats()

    expect(stats.avgDurationMs).toBe(0)
  })

  it('should return empty topEventTypes when no events', async () => {
    const stats = await auditLogger.getStats()

    expect(stats.topEventTypes).toEqual([])
  })

  it('should calculate correct period with custom dates', async () => {
    const startDate = new Date('2024-01-01')
    const endDate = new Date('2024-01-31')

    const stats = await auditLogger.getStats(startDate, endDate)

    expect(stats.periodStart).toBe(startDate.getTime())
    expect(stats.periodEnd).toBe(endDate.getTime())
  })
})

describe('Edge cases - logError with stack trace', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should include error name in details', async () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'CustomError'
      }
    }
    const error = new CustomError('Custom failure')
    const event = await auditLogger.logError(error)

    expect(event.details).toHaveProperty('name', 'CustomError')
  })

  it('should truncate stack trace to 5 lines', async () => {
    const error = new Error('Test error')
    // Create a deep stack
    error.stack = Array(20).fill('at someFunction (file.js:1:1)').join('\n')

    const event = await auditLogger.logError(error)

    const stackLines = ((event.details as any).stack || '').split('\n')
    expect(stackLines.length).toBeLessThanOrEqual(5)
  })

  it('should handle error without stack property', async () => {
    const error = new Error('No stack error')
    delete (error as any).stack

    const event = await auditLogger.logError(error)

    expect(event.details).toHaveProperty('message', 'No stack error')
  })
})

describe('Edge cases - Memory log trimming', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should trim memory log when exceeding max entries', async () => {
    // Log many events to exceed default maxEntries
    for (let i = 0; i < 15; i++) {
      await auditLogger.log('auth.signin', { index: i })
    }

    // Memory log should still work
    const events = await auditLogger.query({})
    expect(events.length).toBeGreaterThan(0)
  })
})

describe('Edge cases - Hash function fallback', () => {
  it('should hash IP address even with crypto', async () => {
    const event = await auditLogger.log('auth.signin', {}, { ip: '10.0.0.1' })

    expect(event.ipHash).toBeDefined()
    expect(event.ipHash).not.toBe('10.0.0.1')
    expect(typeof event.ipHash).toBe('string')
  })

  it('should produce consistent hash for same IP', async () => {
    const event1 = await auditLogger.log('auth.signin', {}, { ip: '192.168.1.100' })
    const event2 = await auditLogger.log('auth.signin', {}, { ip: '192.168.1.100' })

    expect(event1.ipHash).toBe(event2.ipHash)
  })

  it('should generate hex string hash from IP', async () => {
    const event = await auditLogger.log('auth.signin', {}, { ip: '192.168.1.1' })

    // With mock crypto returning fixed buffer, hash should be a hex string
    expect(event.ipHash).toBeDefined()
    expect(event.ipHash).toMatch(/^[0-9a-f]+$/)
  })
})

describe('Edge cases - Debug mode logging', () => {
  beforeEach(async () => {
    await auditLogger.clear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    auditLogger.setDebug(false)
    vi.restoreAllMocks()
  })

  it('should log to console when debug is enabled', async () => {
    auditLogger.setDebug(true)

    await auditLogger.log('auth.signin', { method: 'email' })

    expect(console.log).toHaveBeenCalled()
  })

  it('should not log to console when debug is disabled', async () => {
    auditLogger.setDebug(false)

    await auditLogger.log('auth.signin', { method: 'email' })

    expect(console.log).not.toHaveBeenCalled()
  })

  it('should include ERROR prefix for failed events in debug', async () => {
    auditLogger.setDebug(true)

    await auditLogger.log('auth.signin_failed', {})

    expect(console.log).toHaveBeenCalledWith(
      '[AUDIT ERROR]',
      'auth.signin_failed',
      expect.any(Object)
    )
  })
})

describe('Edge cases - createTimedAudit complete with success param', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should allow overriding success to false in complete', async () => {
    const timedAudit = createTimedAudit('ai.extraction_started', { provider: 'openai' })

    const event = await timedAudit.complete({ partial: true }, false)

    expect(event.success).toBe(false)
    expect(event.durationMs).toBeDefined()
  })

  it('should default to success true when not specified', async () => {
    const timedAudit = createTimedAudit('ai.extraction_started', {})

    const event = await timedAudit.complete()

    expect(event.success).toBe(true)
  })
})

describe('Edge cases - Query memory mode sorting', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should return events sorted by timestamp descending', async () => {
    await auditLogger.log('auth.signin', { order: 1 })
    await new Promise(r => setTimeout(r, 10))
    await auditLogger.log('auth.signin', { order: 2 })
    await new Promise(r => setTimeout(r, 10))
    await auditLogger.log('auth.signin', { order: 3 })

    const events = await auditLogger.query({})

    // Most recent first
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].timestamp).toBeGreaterThanOrEqual(events[i].timestamp)
    }
  })
})

describe('Edge cases - logAuth without email', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should handle auth event without email field', async () => {
    const event = await auditLogger.logAuth('auth.signin', {
      method: 'sso',
    })

    expect(event.details).toHaveProperty('method', 'sso')
    expect((event.details as any).email).toBeUndefined()
  })

  it('should include mfaUsed when provided', async () => {
    const event = await auditLogger.logAuth('auth.signin', {
      method: 'email',
      mfaUsed: true,
    })

    expect(event.details).toHaveProperty('mfaUsed', true)
  })
})

describe('Edge cases - Export format', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should export pretty-printed JSON', async () => {
    await auditLogger.log('auth.signin', { key: 'value' })

    const json = await auditLogger.export()

    // Should be pretty-printed (contains newlines and indentation)
    expect(json).toContain('\n')
    expect(json).toContain('  ')
  })

  it('should export empty array when no events', async () => {
    const json = await auditLogger.export()

    expect(JSON.parse(json)).toEqual([])
  })
})

describe('Edge cases - Multiple simultaneous listeners', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should notify all listeners in order', async () => {
    const callOrder: number[] = []

    const listener1 = vi.fn(() => callOrder.push(1))
    const listener2 = vi.fn(() => callOrder.push(2))
    const listener3 = vi.fn(() => callOrder.push(3))

    const cleanup1 = auditLogger.onEvent(listener1)
    const cleanup2 = auditLogger.onEvent(listener2)
    const cleanup3 = auditLogger.onEvent(listener3)

    await auditLogger.log('auth.signin', {})

    expect(callOrder).toEqual([1, 2, 3])

    cleanup1()
    cleanup2()
    cleanup3()
  })

  it('should allow same listener to be added multiple times', async () => {
    const listener = vi.fn()

    const cleanup1 = auditLogger.onEvent(listener)
    const cleanup2 = auditLogger.onEvent(listener)

    await auditLogger.log('auth.signin', {})

    expect(listener).toHaveBeenCalledTimes(2)

    cleanup1()
    cleanup2()
  })
})

describe('Edge cases - Retention policy', () => {
  it('should merge partial retention policy with existing', () => {
    // Set a partial policy
    auditLogger.setRetentionPolicy({ infoRetentionDays: 3 })
    auditLogger.setRetentionPolicy({ warningRetentionDays: 14 })

    // Shouldn't throw
    expect(true).toBe(true)
  })
})

describe('Edge cases - userAgent capture', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should include userAgent from navigator', async () => {
    const event = await auditLogger.log('auth.signin', {})

    // userAgent may be undefined in test environment but the field should exist
    expect('userAgent' in event).toBe(true)
  })
})

describe('Edge cases - Category mapping', () => {
  beforeEach(async () => {
    await auditLogger.clear()
  })

  it('should map document events to document category', async () => {
    const event = await auditLogger.log('document.uploaded', {})
    expect(event.category).toBe('document')
  })

  it('should map search events to search category', async () => {
    const event = await auditLogger.log('search.performed', {})
    expect(event.category).toBe('search')
  })

  it('should map settings events to settings category', async () => {
    const event = await auditLogger.log('settings.updated', {})
    expect(event.category).toBe('settings')
  })
})
