/**
 * Config Proxy Routes Tests (Plan B from runbook 08)
 *
 * Tests for `GET /api/config/:category` and `GET /api/config/:category/:key`.
 * Pattern mirrors `email-routes.test.ts` — supertest + express, mocking the
 * underlying service and the rate-limit middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// =============================================================================
// MOCKS
// =============================================================================

const mockGetPublicCategorySettings = vi.fn()

vi.mock('../services/config-service.js', () => ({
  getPublicCategorySettings: (...args: unknown[]) => mockGetPublicCategorySettings(...args),
}))

vi.mock('../middleware/rate-limit.js', () => ({
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../lib/logger.js', () => {
  const noop = () => {}
  const childLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => childLogger,
  }
  return { logger: childLogger, default: childLogger }
})

// =============================================================================
// SETUP
// =============================================================================

describe('Config Proxy Routes', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    const { default: configRoutes } = await import('../routes/config.js')
    app = express()
    app.use('/api/config', configRoutes)
  })

  // ===========================================================================
  // GET /api/config/:category
  // ===========================================================================

  describe('GET /api/config/:category', () => {
    it('returns the seeded data for a valid category', async () => {
      mockGetPublicCategorySettings.mockResolvedValue({
        min_confidence: 0.7,
        max_tokens: 8192,
      })

      const res = await request(app).get('/api/config/ai')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        success: true,
        category: 'ai',
        data: { min_confidence: 0.7, max_tokens: 8192 },
      })
      expect(mockGetPublicCategorySettings).toHaveBeenCalledWith('ai')
    })

    it('returns 400 for unknown category (allowlist enforcement)', async () => {
      const res = await request(app).get('/api/config/bogus')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ success: false, error: 'Invalid category' })
      // Service must NOT be called for an invalid category — this is what
      // prevents the route from being a generic Supabase proxy.
      expect(mockGetPublicCategorySettings).not.toHaveBeenCalled()
    })

    it('returns 500 on service throwing', async () => {
      mockGetPublicCategorySettings.mockRejectedValue(new Error('boom'))

      const res = await request(app).get('/api/config/ai')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({
        success: false,
        error: 'Failed to fetch config',
      })
    })

    it('returns success with empty data when category exists but DB is empty', async () => {
      // The service returns {} when the row count is zero. The route should
      // still 200 with success:true so the client treats it as "no admin
      // overrides → use code defaults" instead of "fetch failed → retry".
      mockGetPublicCategorySettings.mockResolvedValue({})

      const res = await request(app).get('/api/config/email')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        success: true,
        category: 'email',
        data: {},
      })
    })

    it('accepts every allowlisted category', async () => {
      mockGetPublicCategorySettings.mockResolvedValue({})
      const allowlist = [
        'ai',
        'evaluation',
        'rate_limits',
        'ocr',
        'fuzzy_matching',
        'gap_analysis',
        'ui',
        'email',
        'monitoring',
        'retention',
        'fx',
        'server',
        'webhooks',
        'cost',
      ]
      for (const cat of allowlist) {
        const res = await request(app).get(`/api/config/${cat}`)
        expect(res.status, `category=${cat}`).toBe(200)
      }
    })
  })

  // ===========================================================================
  // GET /api/config/:category/:key
  // ===========================================================================

  describe('GET /api/config/:category/:key', () => {
    it('returns the value for an existing key', async () => {
      mockGetPublicCategorySettings.mockResolvedValue({ min_confidence: 0.7 })

      const res = await request(app).get('/api/config/ai/min_confidence')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        success: true,
        category: 'ai',
        key: 'min_confidence',
        value: 0.7,
      })
    })

    it('returns null for a missing key (not a 404)', async () => {
      // Missing key is normal — not every TS-default has a DB row seeded.
      // The client treats null as "no admin override → use code default."
      mockGetPublicCategorySettings.mockResolvedValue({})

      const res = await request(app).get('/api/config/ai/missing_key')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        success: true,
        category: 'ai',
        key: 'missing_key',
        value: null,
      })
    })

    it('returns 400 for unknown category', async () => {
      const res = await request(app).get('/api/config/bogus/some_key')
      expect(res.status).toBe(400)
      expect(mockGetPublicCategorySettings).not.toHaveBeenCalled()
    })

    it('returns 400 for too-long key (DoS guard)', async () => {
      const longKey = 'x'.repeat(101)
      const res = await request(app).get(`/api/config/ai/${longKey}`)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ success: false, error: 'Invalid key' })
    })

    it('returns 500 on service throwing', async () => {
      mockGetPublicCategorySettings.mockRejectedValue(new Error('db down'))

      const res = await request(app).get('/api/config/ai/min_confidence')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({
        success: false,
        error: 'Failed to fetch config',
      })
    })

    it('returns explicit null for keys whose value is the literal null', async () => {
      // Edge case: a key WAS seeded but its value is `null`. The route's
      // check is `key in data ? data[key] : null` so it should return `null`
      // (same as missing) — caller doesn't distinguish.
      mockGetPublicCategorySettings.mockResolvedValue({ some_key: null })

      const res = await request(app).get('/api/config/ai/some_key')

      expect(res.status).toBe(200)
      expect(res.body.value).toBeNull()
    })
  })
})
