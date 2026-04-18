import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock shared dependencies
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockOrder = vi.fn()

const mockSupabase = {
  from: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  })),
}

// Mock the shared module that segments.ts imports from
vi.mock('../routes/admin/shared.js', () => ({
  requireSuperAdmin: () => [(_req: unknown, _res: unknown, next: () => void) => next()],
  logAdminAction: vi.fn().mockResolvedValue(undefined),
  getSupabaseWithError: () => ({ client: mockSupabase, error: null }),
  qstr: (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')),
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

import segmentsRouter from '../routes/admin/segments.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/', segmentsRouter)
  return app
}

describe('Admin Segments Routes', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  describe('GET /segments', () => {
    it('requires name query parameter', async () => {
      const res = await request(app).get('/segments')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('"name" is required')
    })

    it('rejects invalid segment names', async () => {
      const res = await request(app).get('/segments?name=evil_injection')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid segment name')
    })

    it('accepts valid segment name', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null })
      mockEq.mockReturnValue({ order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq })

      const res = await request(app).get('/segments?name=kasko_pilot_reviewers')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('GET /segments/user/:userId', () => {
    it('rejects invalid UUID', async () => {
      const res = await request(app).get('/segments/user/not-a-uuid')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('valid UUID')
    })

    it('accepts valid UUID', async () => {
      mockEq.mockResolvedValue({ data: [], error: null })
      mockSelect.mockReturnValue({ eq: mockEq })

      const res = await request(app).get('/segments/user/12345678-1234-1234-1234-123456789abc')
      expect(res.status).toBe(200)
    })
  })

  describe('POST /segments', () => {
    it('requires userId and segmentName', async () => {
      const res = await request(app).post('/segments').send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('required')
    })

    it('rejects invalid UUID in userId', async () => {
      const res = await request(app)
        .post('/segments')
        .send({ userId: 'not-uuid', segmentName: 'kasko_pilot_reviewers' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('valid UUID')
    })

    it('rejects invalid segment name', async () => {
      const res = await request(app)
        .post('/segments')
        .send({ userId: '12345678-1234-1234-1234-123456789abc', segmentName: 'hacker_group' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid segment name')
    })

    it('handles duplicate assignment (409)', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })
      mockSelect.mockReturnValue({ single: mockSingle })
      mockInsert.mockReturnValue({ select: mockSelect })

      const res = await request(app).post('/segments').send({
        userId: '12345678-1234-1234-1234-123456789abc',
        segmentName: 'kasko_pilot_reviewers',
      })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('ALREADY_ASSIGNED')
    })
  })

  describe('DELETE /segments/:userId/:segmentName', () => {
    it('rejects invalid UUID', async () => {
      const res = await request(app).delete('/segments/bad-uuid/kasko_pilot_reviewers')
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('valid UUID')
    })

    it('rejects invalid segment name', async () => {
      const res = await request(app).delete(
        '/segments/12345678-1234-1234-1234-123456789abc/bad_segment'
      )
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Invalid segment name')
    })

    it('succeeds with valid parameters', async () => {
      mockEq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null, count: 1 }) })
      mockDelete.mockReturnValue({ eq: mockEq })

      const res = await request(app).delete(
        '/segments/12345678-1234-1234-1234-123456789abc/kasko_pilot_reviewers'
      )
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe('POST /app-users/resolve-emails (gated)', () => {
    const PRIOR_FLAG = process.env.ENABLE_ADMIN_EMAIL_RESOLVER

    beforeEach(() => {
      // Mock auth.admin.listUsers on the shared mockSupabase client
      ;(mockSupabase as unknown as { auth: unknown }).auth = {
        admin: {
          listUsers: vi.fn(),
        },
      }
    })

    afterEach(() => {
      if (PRIOR_FLAG === undefined) delete process.env.ENABLE_ADMIN_EMAIL_RESOLVER
      else process.env.ENABLE_ADMIN_EMAIL_RESOLVER = PRIOR_FLAG
    })

    it('returns 403 RESOLVER_DISABLED when env flag is unset', async () => {
      delete process.env.ENABLE_ADMIN_EMAIL_RESOLVER
      const res = await request(app)
        .post('/app-users/resolve-emails')
        .send({ emails: ['a@b.com'] })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('RESOLVER_DISABLED')
    })

    it('returns 400 when emails array is missing or empty', async () => {
      process.env.ENABLE_ADMIN_EMAIL_RESOLVER = 'true'
      const r1 = await request(app).post('/app-users/resolve-emails').send({})
      expect(r1.status).toBe(400)
      const r2 = await request(app).post('/app-users/resolve-emails').send({ emails: [] })
      expect(r2.status).toBe(400)
    })

    it('returns 400 when emails array exceeds 50 entries', async () => {
      process.env.ENABLE_ADMIN_EMAIL_RESOLVER = 'true'
      const tooMany = Array.from({ length: 51 }, (_, i) => `user${i}@example.com`)
      const res = await request(app).post('/app-users/resolve-emails').send({ emails: tooMany })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Too many emails')
    })

    it('rejects when no valid email addresses pass the regex', async () => {
      process.env.ENABLE_ADMIN_EMAIL_RESOLVER = 'true'
      const res = await request(app)
        .post('/app-users/resolve-emails')
        .send({ emails: ['not-an-email', 'also not'] })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('No valid email')
    })

    it('resolves matched emails, reports missing, signals cap boundary', async () => {
      process.env.ENABLE_ADMIN_EMAIL_RESOLVER = 'true'
      const userList = Array.from({ length: 1000 }, (_, i) => ({
        id: `uuid-${i}`,
        email: `user${i}@example.com`,
      }))
      ;(
        mockSupabase as unknown as {
          auth: { admin: { listUsers: ReturnType<typeof vi.fn> } }
        }
      ).auth.admin.listUsers.mockResolvedValue({
        data: { users: userList },
        error: null,
      })

      const res = await request(app)
        .post('/app-users/resolve-emails')
        .send({ emails: ['user5@example.com', 'ghost@example.com', 'USER10@example.com'] })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.resolved).toEqual(
        expect.arrayContaining([
          { email: 'user5@example.com', userId: 'uuid-5' },
          { email: 'user10@example.com', userId: 'uuid-10' },
        ])
      )
      expect(res.body.data.missing).toEqual(['ghost@example.com'])
      expect(res.body.data.cappedAtUserListLimit).toBe(true)
    })

    it('reports cappedAtUserListLimit=false when user list fits under cap', async () => {
      process.env.ENABLE_ADMIN_EMAIL_RESOLVER = 'true'
      ;(
        mockSupabase as unknown as {
          auth: { admin: { listUsers: ReturnType<typeof vi.fn> } }
        }
      ).auth.admin.listUsers.mockResolvedValue({
        data: { users: [{ id: 'uuid-a', email: 'a@example.com' }] },
        error: null,
      })
      const res = await request(app)
        .post('/app-users/resolve-emails')
        .send({ emails: ['a@example.com'] })
      expect(res.status).toBe(200)
      expect(res.body.data.cappedAtUserListLimit).toBe(false)
    })
  })
})
