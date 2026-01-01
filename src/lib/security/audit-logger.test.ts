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
        documentId: 'doc-123',
      })

      expect(event.type).toBe('ai.extraction_started')
      expect(event.resourceType).toBe('ai_operation')
      expect(event.details).toHaveProperty('provider', 'openai')
    })

    it('should include duration for AI operations', async () => {
      const event = await auditLogger.logAI('ai.extraction_completed', {
        provider: 'openai',
        model: 'gpt-4',
        tokensUsed: 500,
      }, { durationMs: 2500 })

      expect(event.durationMs).toBe(2500)
    })
  })

  describe('logPolicy', () => {
    it('should log policy events with typed details', async () => {
      const event = await auditLogger.logPolicy('policy.created', {
        policyId: 'pol-123',
        policyType: 'home',
        amount: 250000,
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

    expect(event.durationMs).toBeGreaterThanOrEqual(50)
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
