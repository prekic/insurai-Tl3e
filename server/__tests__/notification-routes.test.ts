/**
 * Notification Routes Tests
 *
 * Tests for /api/notifications/* endpoints:
 * - GET /public-key (no auth)
 * - GET /status (requires x-user-id)
 * - POST /subscribe (requires x-user-id, rate limited)
 * - DELETE /unsubscribe (requires x-user-id, rate limited)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// =============================================================================
// MOCKS
// =============================================================================

const mockGetVapidPublicKey = vi.fn()
const mockIsWebPushConfigured = vi.fn()

vi.mock('../services/notification-service.js', () => ({
  getVapidPublicKey: (...args: unknown[]) => mockGetVapidPublicKey(...args),
  isWebPushConfigured: (...args: unknown[]) => mockIsWebPushConfigured(...args),
}))

vi.mock('../middleware/rate-limit.js', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../lib/logger.js', () => {
  const noop = () => {}
  const child = { debug: noop, info: noop, warn: noop, error: noop, child: () => child }
  return { logger: child }
})

// Supabase mock
const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}))

// =============================================================================
// HELPERS
// =============================================================================

const VALID_USER_ID = 'user-123'

const VALID_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlqHgx9',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
}

function buildApp() {
  const app = express()
  app.use(express.json())
  // Re-import fresh each test via dynamic import below
  return app
}

// =============================================================================
// TESTS
// =============================================================================

describe('Notification Routes', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

    const routerModule = await import('../routes/notifications.js')
    app = buildApp()
    app.use('/api/notifications', routerModule.default)
  })

  // ---------------------------------------------------------------------------
  // GET /public-key
  // ---------------------------------------------------------------------------

  describe('GET /public-key', () => {
    it('returns the VAPID public key when configured', async () => {
      mockGetVapidPublicKey.mockReturnValue('BTest-vapid-public-key')

      const res = await request(app).get('/api/notifications/public-key')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.publicKey).toBe('BTest-vapid-public-key')
    })

    it('returns 503 when VAPID is not configured', async () => {
      mockGetVapidPublicKey.mockReturnValue(null)

      const res = await request(app).get('/api/notifications/public-key')

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PUSH_NOT_CONFIGURED')
    })
  })

  // ---------------------------------------------------------------------------
  // GET /status
  // ---------------------------------------------------------------------------

  describe('GET /status', () => {
    it('returns 401 without x-user-id header', async () => {
      const res = await request(app).get('/api/notifications/status')
      expect(res.status).toBe(401)
    })

    it('returns subscribed: false when no subscriptions exist', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            data: [],
            error: null,
            count: 0,
          }),
        }),
      })

      const res = await request(app)
        .get('/api/notifications/status')
        .set('x-user-id', VALID_USER_ID)

      expect(res.status).toBe(200)
      expect(res.body.subscribed).toBe(false)
      expect(res.body.deviceCount).toBe(0)
    })

    it('returns subscribed: true when subscriptions exist', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            data: [{ id: 'sub-1' }],
            error: null,
            count: 2,
          }),
        }),
      })

      const res = await request(app)
        .get('/api/notifications/status')
        .set('x-user-id', VALID_USER_ID)

      expect(res.status).toBe(200)
      expect(res.body.subscribed).toBe(true)
      expect(res.body.deviceCount).toBe(2)
    })

    it('returns 500 on database error', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            data: null,
            error: { message: 'DB error' },
            count: null,
          }),
        }),
      })

      const res = await request(app)
        .get('/api/notifications/status')
        .set('x-user-id', VALID_USER_ID)

      expect(res.status).toBe(500)
    })
  })

  // ---------------------------------------------------------------------------
  // POST /subscribe
  // ---------------------------------------------------------------------------

  describe('POST /subscribe', () => {
    beforeEach(() => {
      mockIsWebPushConfigured.mockReturnValue(true)
    })

    it('returns 401 without x-user-id', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .send(VALID_SUBSCRIPTION)

      expect(res.status).toBe(401)
    })

    it('returns 503 when push is not configured', async () => {
      mockIsWebPushConfigured.mockReturnValue(false)

      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('x-user-id', VALID_USER_ID)
        .send(VALID_SUBSCRIPTION)

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PUSH_NOT_CONFIGURED')
    })

    it('returns 400 with invalid body (missing endpoint)', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('x-user-id', VALID_USER_ID)
        .send({ keys: VALID_SUBSCRIPTION.keys })

      expect(res.status).toBe(400)
    })

    it('returns 400 with invalid endpoint URL', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('x-user-id', VALID_USER_ID)
        .send({ ...VALID_SUBSCRIPTION, endpoint: 'not-a-url' })

      expect(res.status).toBe(400)
    })

    it('returns 400 with missing p256dh key', async () => {
      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('x-user-id', VALID_USER_ID)
        .send({ endpoint: VALID_SUBSCRIPTION.endpoint, keys: { p256dh: '', auth: 'x'.repeat(15) } })

      expect(res.status).toBe(400)
    })

    it('upserts subscription and returns 200 on success', async () => {
      mockFrom.mockReturnValue({
        upsert: () => ({ error: null }),
      })

      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('x-user-id', VALID_USER_ID)
        .send(VALID_SUBSCRIPTION)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 500 when DB upsert fails', async () => {
      mockFrom.mockReturnValue({
        upsert: () => ({ error: { message: 'Constraint error' } }),
      })

      const res = await request(app)
        .post('/api/notifications/subscribe')
        .set('x-user-id', VALID_USER_ID)
        .send(VALID_SUBSCRIPTION)

      expect(res.status).toBe(500)
    })

    it('stores user-agent header', async () => {
      let capturedUpsertArg: unknown = null
      mockFrom.mockReturnValue({
        upsert: (arg: unknown) => {
          capturedUpsertArg = arg
          return { error: null }
        },
      })

      await request(app)
        .post('/api/notifications/subscribe')
        .set('x-user-id', VALID_USER_ID)
        .set('user-agent', 'Mozilla/5.0 TestBrowser')
        .send(VALID_SUBSCRIPTION)

      expect(capturedUpsertArg).toMatchObject({
        user_agent: expect.stringContaining('Mozilla'),
      })
    })
  })

  // ---------------------------------------------------------------------------
  // DELETE /unsubscribe
  // ---------------------------------------------------------------------------

  describe('DELETE /unsubscribe', () => {
    it('returns 401 without x-user-id', async () => {
      const res = await request(app)
        .delete('/api/notifications/unsubscribe')
        .send({ endpoint: VALID_SUBSCRIPTION.endpoint })

      expect(res.status).toBe(401)
    })

    it('returns 400 with missing endpoint', async () => {
      const res = await request(app)
        .delete('/api/notifications/unsubscribe')
        .set('x-user-id', VALID_USER_ID)
        .send({})

      expect(res.status).toBe(400)
    })

    it('returns 400 with invalid endpoint URL', async () => {
      const res = await request(app)
        .delete('/api/notifications/unsubscribe')
        .set('x-user-id', VALID_USER_ID)
        .send({ endpoint: 'not-a-url' })

      expect(res.status).toBe(400)
    })

    it('deletes subscription and returns 200 on success', async () => {
      mockFrom.mockReturnValue({
        delete: () => ({
          eq: () => ({
            eq: () => ({ error: null }),
          }),
        }),
      })

      const res = await request(app)
        .delete('/api/notifications/unsubscribe')
        .set('x-user-id', VALID_USER_ID)
        .send({ endpoint: VALID_SUBSCRIPTION.endpoint })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 500 when DB delete fails', async () => {
      mockFrom.mockReturnValue({
        delete: () => ({
          eq: () => ({
            eq: () => ({ error: { message: 'DB error' } }),
          }),
        }),
      })

      const res = await request(app)
        .delete('/api/notifications/unsubscribe')
        .set('x-user-id', VALID_USER_ID)
        .send({ endpoint: VALID_SUBSCRIPTION.endpoint })

      expect(res.status).toBe(500)
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('handles empty x-user-id header as unauthorized', async () => {
      const res = await request(app)
        .get('/api/notifications/status')
        .set('x-user-id', '')

      expect(res.status).toBe(401)
    })

    it('GET /public-key does not require auth', async () => {
      mockGetVapidPublicKey.mockReturnValue('test-key')
      const res = await request(app).get('/api/notifications/public-key')
      // No x-user-id — still 200
      expect(res.status).toBe(200)
    })
  })
})
