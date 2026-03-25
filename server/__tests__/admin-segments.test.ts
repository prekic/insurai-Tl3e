import { describe, it, expect, vi, beforeEach } from 'vitest'
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
})
