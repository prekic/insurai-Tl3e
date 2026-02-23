/**
 * Tests for server/middleware/api-metrics.ts
 *
 * Covers:
 * - Endpoint normalization (static routes, UUID replacement, fallback)
 * - Provider detection from path and body
 * - Response lifecycle integration (finish event)
 * - Error recording for 4xx/5xx status codes
 * - Graceful handling of recordRequest failures
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// =============================================================================
// MOCKS — must be before imports
// =============================================================================

const mockRecordRequest = vi.fn()

vi.mock('../middleware/monitoring.js', () => ({
  recordRequest: (...args: unknown[]) => mockRecordRequest(...args),
}))

vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  const childLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => childLogger,
  }
  return { logger: childLogger }
})

// =============================================================================
// Import after mocks
// =============================================================================

import { apiMetrics } from '../middleware/api-metrics.js'

// =============================================================================
// Helpers
// =============================================================================

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    path: '/api/ai/extract/openai',
    originalUrl: '/api/ai/extract/openai',
    headers: {},
    body: {},
    ...overrides,
  } as unknown as Request
}

type FinishHandler = () => void

function createMockRes(statusCode = 200): { res: Response; triggerFinish: () => void } {
  const handlers: FinishHandler[] = []
  const res = {
    statusCode,
    on: vi.fn((event: string, handler: FinishHandler) => {
      if (event === 'finish') handlers.push(handler)
    }),
  } as unknown as Response

  return {
    res,
    triggerFinish: () => handlers.forEach((h) => h()),
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('apiMetrics middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call next() immediately', () => {
    const req = createMockReq()
    const { res } = createMockRes()
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should record a metric on response finish', () => {
    const req = createMockReq()
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest).toHaveBeenCalledTimes(1)
    const metric = mockRecordRequest.mock.calls[0][0]
    expect(metric.endpoint).toBe('/api/ai/extract/openai')
    expect(metric.method).toBe('POST')
    expect(metric.statusCode).toBe(200)
    expect(metric.responseTime).toBeGreaterThanOrEqual(0)
    expect(metric.provider).toBe('openai')
    expect(metric.error).toBeUndefined()
  })

  it('should detect anthropic provider from path', () => {
    const req = createMockReq({
      path: '/api/ai/extract/anthropic',
      originalUrl: '/api/ai/extract/anthropic',
    } as Partial<Request>)
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest.mock.calls[0][0].provider).toBe('anthropic')
  })

  it('should detect google provider from OCR path', () => {
    const req = createMockReq({
      path: '/api/ai/ocr',
      originalUrl: '/api/ai/ocr',
    } as Partial<Request>)
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest.mock.calls[0][0].provider).toBe('google')
  })

  it('should detect provider from body for chat endpoint', () => {
    const req = createMockReq({
      path: '/api/ai/chat',
      originalUrl: '/api/ai/chat',
      body: { provider: 'anthropic' },
    } as Partial<Request>)
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest.mock.calls[0][0].provider).toBe('anthropic')
  })

  it('should return undefined provider for non-AI endpoints', () => {
    const req = createMockReq({
      path: '/api/health',
      originalUrl: '/api/health',
    } as Partial<Request>)
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest.mock.calls[0][0].provider).toBeUndefined()
  })

  it('should record error for 4xx status codes', () => {
    const req = createMockReq({
      path: '/api/ai/extract/openai',
      originalUrl: '/api/ai/extract/openai',
    } as Partial<Request>)
    const { res, triggerFinish } = createMockRes(429)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest.mock.calls[0][0].error).toBe('HTTP 429')
  })

  it('should record error for 5xx status codes', () => {
    const req = createMockReq({
      path: '/api/ai/extract/openai',
      originalUrl: '/api/ai/extract/openai',
    } as Partial<Request>)
    const { res, triggerFinish } = createMockRes(500)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest.mock.calls[0][0].error).toBe('HTTP 500')
  })

  it('should extract user ID from headers', () => {
    const req = createMockReq({
      headers: { 'x-user-id': 'user-123' },
    } as Partial<Request>)
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest.mock.calls[0][0].userId).toBe('user-123')
  })

  it('should strip query parameters from endpoint', () => {
    const req = createMockReq({
      path: '/api/health',
      originalUrl: '/api/health?foo=bar&baz=1',
    } as Partial<Request>)
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    expect(mockRecordRequest.mock.calls[0][0].endpoint).toBe('/api/health')
  })

  describe('endpoint normalization', () => {
    it('should normalize UUID segments in unknown paths', () => {
      const req = createMockReq({
        path: '/api/some/550e8400-e29b-41d4-a716-446655440000/detail',
        originalUrl: '/api/some/550e8400-e29b-41d4-a716-446655440000/detail',
      } as Partial<Request>)
      const { res, triggerFinish } = createMockRes(200)
      const next = vi.fn() as NextFunction

      apiMetrics(req, res, next)
      triggerFinish()

      expect(mockRecordRequest.mock.calls[0][0].endpoint).toBe('/api/some/:id/detail')
    })

    it('should normalize processing-log/:id/stage endpoint', () => {
      const req = createMockReq({
        path: '/api/ai/processing-log/doc-123/stage',
        originalUrl: '/api/ai/processing-log/doc-123/stage',
      } as Partial<Request>)
      const { res, triggerFinish } = createMockRes(200)
      const next = vi.fn() as NextFunction

      apiMetrics(req, res, next)
      triggerFinish()

      expect(mockRecordRequest.mock.calls[0][0].endpoint).toBe('/api/ai/processing-log/:id/stage')
    })

    it('should normalize admin monitoring alert acknowledge endpoint', () => {
      const req = createMockReq({
        path: '/api/admin/monitoring/alerts/alert_123/acknowledge',
        originalUrl: '/api/admin/monitoring/alerts/alert_123/acknowledge',
      } as Partial<Request>)
      const { res, triggerFinish } = createMockRes(200)
      const next = vi.fn() as NextFunction

      apiMetrics(req, res, next)
      triggerFinish()

      expect(mockRecordRequest.mock.calls[0][0].endpoint).toBe('/api/admin/monitoring/alerts/:id/acknowledge')
    })

    it('should normalize admin routes to /api/admin/*', () => {
      const req = createMockReq({
        path: '/api/admin/users/some-id',
        originalUrl: '/api/admin/users/some-id',
      } as Partial<Request>)
      const { res, triggerFinish } = createMockRes(200)
      const next = vi.fn() as NextFunction

      apiMetrics(req, res, next)
      triggerFinish()

      expect(mockRecordRequest.mock.calls[0][0].endpoint).toBe('/api/admin/*')
    })

    it('should normalize notification routes with IDs', () => {
      const req = createMockReq({
        path: '/api/notifications/sub-abc123',
        originalUrl: '/api/notifications/sub-abc123',
      } as Partial<Request>)
      const { res, triggerFinish } = createMockRes(200)
      const next = vi.fn() as NextFunction

      apiMetrics(req, res, next)
      triggerFinish()

      expect(mockRecordRequest.mock.calls[0][0].endpoint).toBe('/api/notifications/:id')
    })
  })

  it('should not throw if recordRequest throws', () => {
    mockRecordRequest.mockImplementationOnce(() => {
      throw new Error('recording failed')
    })

    const req = createMockReq()
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)

    // Should not throw
    expect(() => triggerFinish()).not.toThrow()
  })

  it('should include a valid ISO timestamp', () => {
    const req = createMockReq()
    const { res, triggerFinish } = createMockRes(200)
    const next = vi.fn() as NextFunction

    apiMetrics(req, res, next)
    triggerFinish()

    const timestamp = mockRecordRequest.mock.calls[0][0].timestamp
    expect(new Date(timestamp).toISOString()).toBe(timestamp)
  })
})
