/**
 * Settings Routes — Batch Update Tests
 *
 * Comprehensive tests for PUT /batch in server/routes/settings.ts.
 * Covers all validation branches, Phase 1 (fetch+validate), Phase 2 (apply),
 * webhook firing, audit log insertion, skipped-unchanged logic, and error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockFrom, mockFireWebhooks, mockLogWarn, mockLogError, mockLogInfo } =
  vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockFireWebhooks: vi.fn().mockResolvedValue(undefined),
    mockLogWarn: vi.fn(),
    mockLogError: vi.fn(),
    mockLogInfo: vi.fn(),
  }))

// Mock logger
vi.mock('../lib/logger.js', () => {
  const child = {
    debug: vi.fn(),
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: {
      ...child,
      child: vi.fn(() => child),
    },
    logger: {
      ...child,
      child: vi.fn(() => child),
    },
  }
})

// Mock webhook service
vi.mock('../services/webhook-service.js', () => ({
  fireWebhooks: (...args: unknown[]) => mockFireWebhooks(...args),
}))

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

// ---------------------------------------------------------------------------
// Helper: build a chainable Supabase query mock
// ---------------------------------------------------------------------------

function buildQueryChain(finalResult: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)
  return chain
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

import express from 'express'
import request from 'supertest'
import settingsRouter from '../routes/settings.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
    req.adminUser = { id: 'admin-001' }
    next()
  })
  app.use('/', settingsRouter)
  return app
}

// ---------------------------------------------------------------------------
// Helpers for common mock settings
// ---------------------------------------------------------------------------

function makeSetting(overrides: Partial<{
  id: string
  category: string
  key: string
  value: unknown
  is_readonly: boolean
  min_value: number | null
  max_value: number | null
  allowed_values: unknown[] | null
}> = {}) {
  return {
    id: 'setting-001',
    category: 'ai',
    key: 'temperature',
    value: 0.1,
    is_readonly: false,
    min_value: null,
    max_value: null,
    allowed_values: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PUT /batch — Batch Update Route', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  // -------------------------------------------------------------------------
  // 503 — No Supabase client
  // -------------------------------------------------------------------------

  describe('503 — Supabase not configured', () => {
    it('returns 503 when SUPABASE_URL is missing', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.5 }] })

      expect(res.status).toBe(503)
      expect(res.body).toMatchObject({ success: false, error: 'Database not configured' })
    })

    it('returns 503 when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.5 }] })

      expect(res.status).toBe(503)
      expect(res.body.success).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 400 — Zod validation errors
  // -------------------------------------------------------------------------

  describe('400 — Zod schema validation', () => {
    it('returns 400 for empty updates array (min 1)', async () => {
      const res = await request(app).put('/batch').send({ updates: [] })

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ success: false, error: 'Invalid request body' })
      expect(res.body.details).toBeDefined()
    })

    it('returns 400 for 51 updates (max 50)', async () => {
      const updates = Array.from({ length: 51 }, (_, i) => ({
        category: 'ai',
        key: `key_${i}`,
        value: i,
      }))

      const res = await request(app).put('/batch').send({ updates })

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ success: false, error: 'Invalid request body' })
    })

    it('returns 400 when category is missing in an update', async () => {
      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ key: 'temperature', value: 0.5 }] })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
    })

    it('returns 400 when key is missing in an update', async () => {
      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', value: 0.5 }] })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
    })

    it('returns 400 when updates is not an array', async () => {
      const res = await request(app)
        .put('/batch')
        .send({ updates: 'not-an-array' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
    })

    it('returns 400 when request body is missing', async () => {
      const res = await request(app).put('/batch').send({})

      expect(res.status).toBe(400)
    })

    it('accepts exactly 50 updates (boundary: valid max)', async () => {
      const settings = Array.from({ length: 50 }, (_, i) =>
        makeSetting({ id: `s-${i}`, category: 'ai', key: `key_${i}`, value: i })
      )
      mockFrom.mockReturnValue(buildQueryChain({ data: settings, error: null }))

      const updates = Array.from({ length: 50 }, (_, i) => ({
        category: 'ai',
        key: `key_${i}`,
        value: i + 1, // changed values
      }))

      // Phase 2: each update needs its own chain call
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        // First call is the SELECT (phase 1); subsequent are UPDATEs (phase 2)
        if (callCount === 1) {
          return buildQueryChain({ data: settings, error: null })
        }
        return buildQueryChain({ data: null, error: null })
      })

      const res = await request(app).put('/batch').send({ updates })

      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(50)
    })
  })

  // -------------------------------------------------------------------------
  // 500 — Fetch error (Phase 1)
  // -------------------------------------------------------------------------

  describe('500 — Supabase fetch error in Phase 1', () => {
    it('returns 500 when SELECT fetch fails', async () => {
      mockFrom.mockReturnValue(
        buildQueryChain({ data: null, error: { message: 'DB connection failed' } })
      )

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.5 }] })

      expect(res.status).toBe(500)
      expect(res.body).toMatchObject({ success: false, error: 'Failed to fetch settings' })
    })

    it('logs the fetch error', async () => {
      mockFrom.mockReturnValue(
        buildQueryChain({ data: null, error: { message: 'timeout' } })
      )

      await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.5 }] })

      expect(mockLogError).toHaveBeenCalledWith(
        'Batch fetch error',
        expect.objectContaining({ error: expect.any(String) })
      )
    })
  })

  // -------------------------------------------------------------------------
  // 400 — Validation errors (Phase 1 — setting checks)
  // -------------------------------------------------------------------------

  describe('400 — Setting-level validation errors', () => {
    it('returns 400 with "Setting not found" when key does not exist in DB', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: [], error: null }))

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'nonexistent_key', value: 99 }] })

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({
        success: false,
        error: 'Validation failed for one or more settings',
        validationErrors: [
          { category: 'ai', key: 'nonexistent_key', error: 'Setting not found' },
        ],
        validCount: 0,
      })
    })

    it('returns 400 with "Setting is read-only" for is_readonly settings', async () => {
      const setting = makeSetting({ is_readonly: true })
      mockFrom.mockReturnValue(buildQueryChain({ data: [setting], error: null }))

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.5 }] })

      expect(res.status).toBe(400)
      expect(res.body.validationErrors).toEqual([
        { category: 'ai', key: 'temperature', error: 'Setting is read-only' },
      ])
    })

    it('returns 400 when value is below min_value', async () => {
      const setting = makeSetting({ min_value: 0, max_value: 1 })
      mockFrom.mockReturnValue(buildQueryChain({ data: [setting], error: null }))

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: -0.1 }] })

      expect(res.status).toBe(400)
      expect(res.body.validationErrors[0].error).toBe('Value must be at least 0')
    })

    it('returns 400 when value is above max_value', async () => {
      const setting = makeSetting({ min_value: 0, max_value: 1 })
      mockFrom.mockReturnValue(buildQueryChain({ data: [setting], error: null }))

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 1.5 }] })

      expect(res.status).toBe(400)
      expect(res.body.validationErrors[0].error).toBe('Value must be at most 1')
    })

    it('returns 400 when value is not in allowed_values list', async () => {
      const setting = makeSetting({ allowed_values: ['low', 'medium', 'high'] })
      mockFrom.mockReturnValue(buildQueryChain({ data: [setting], error: null }))

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 'extreme' }] })

      expect(res.status).toBe(400)
      expect(res.body.validationErrors[0].error).toContain('Value must be one of')
      expect(res.body.validationErrors[0].error).toContain('low')
      expect(res.body.validationErrors[0].error).toContain('medium')
      expect(res.body.validationErrors[0].error).toContain('high')
    })

    it('returns all validation errors when multiple settings fail', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', is_readonly: true }),
        makeSetting({ id: 's2', category: 'ai', key: 'max_tokens', min_value: 100, max_value: 8000 }),
      ]
      mockFrom.mockReturnValue(buildQueryChain({ data: settings, error: null }))

      const res = await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.9 },
            { category: 'ai', key: 'nonexistent', value: 1 },
            { category: 'ai', key: 'max_tokens', value: 9999 },
          ],
        })

      expect(res.status).toBe(400)
      expect(res.body.validationErrors).toHaveLength(3)
      expect(res.body.validCount).toBe(0)
      // No changes were applied
      expect(mockFireWebhooks).not.toHaveBeenCalled()
    })

    it('does NOT apply any changes when there are validation errors', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature' }),
        makeSetting({ id: 's2', category: 'ai', key: 'bad_key', is_readonly: true }),
      ]
      mockFrom.mockReturnValue(buildQueryChain({ data: settings, error: null }))

      await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.9 },
            { category: 'ai', key: 'bad_key', value: 'x' },
          ],
        })

      // mockFrom should have been called only once for the SELECT (no UPDATEs)
      expect(mockFrom).toHaveBeenCalledTimes(1)
    })

    it('reports validCount correctly when some pass and some fail', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'ai', key: 'max_tokens', is_readonly: true }),
      ]
      mockFrom.mockReturnValue(buildQueryChain({ data: settings, error: null }))

      const res = await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.9 }, // valid
            { category: 'ai', key: 'max_tokens', value: 2000 }, // readonly → error
          ],
        })

      expect(res.status).toBe(400)
      expect(res.body.validCount).toBe(1)
      expect(res.body.validationErrors).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // Skip unchanged values (no error, no update)
  // -------------------------------------------------------------------------

  describe('Skipped — unchanged values', () => {
    it('skips settings whose value is unchanged (JSON equality)', async () => {
      const setting = makeSetting({ value: 0.1 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.1 }] })

      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(0)
      expect(res.body.data.skipped).toBe(1)
      expect(res.body.data.errors).toBe(0)
      expect(res.body.success).toBe(true)
    })

    it('skips only the unchanged item when mix of changed and unchanged', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'ai', key: 'max_tokens', value: 4096 }),
      ]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? settings : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.1 }, // unchanged → skip
            { category: 'ai', key: 'max_tokens', value: 8192 }, // changed → update
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(1)
      expect(res.body.data.skipped).toBe(1)
    })

    it('compares values using JSON.stringify for deep equality (objects)', async () => {
      const setting = makeSetting({ value: { a: 1, b: 2 } })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: { a: 1, b: 2 } }] })

      expect(res.status).toBe(200)
      expect(res.body.data.skipped).toBe(1)
      expect(res.body.data.updated).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Phase 2 — successful updates
  // -------------------------------------------------------------------------

  describe('Phase 2 — successful updates', () => {
    it('returns 200 with updated count and results on full success', async () => {
      const setting = makeSetting({ value: 0.1 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.9 }] })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.updated).toBe(1)
      expect(res.body.data.skipped).toBe(0)
      expect(res.body.data.errors).toBe(0)
      expect(res.body.data.results).toHaveLength(1)
      expect(res.body.data.results[0]).toMatchObject({
        category: 'ai',
        key: 'temperature',
        previousValue: 0.1,
        newValue: 0.9,
      })
    })

    it('updates multiple settings across multiple categories', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'evaluation', key: 'grade_a', value: 90 }),
      ]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? settings : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.5 },
            { category: 'evaluation', key: 'grade_a', value: 85 },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(2)
      expect(res.body.data.results).toHaveLength(2)
    })

    it('does not include errorDetails key when there are no errors', async () => {
      const setting = makeSetting({ value: 0.1 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.9 }] })

      expect(res.body.data.errorDetails).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Phase 2 — DB update errors
  // -------------------------------------------------------------------------

  describe('Phase 2 — DB update errors', () => {
    it('adds to errors[] when a DB update fails and continues processing others', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'ai', key: 'max_tokens', value: 4096 }),
      ]

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Phase 1 SELECT
          return buildQueryChain({ data: settings, error: null })
        }
        if (callCount === 2) {
          // Phase 2 first UPDATE — fails
          return buildQueryChain({ data: null, error: { message: 'update failed' } })
        }
        // Phase 2 second UPDATE — succeeds
        return buildQueryChain({ data: null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.9 },
            { category: 'ai', key: 'max_tokens', value: 8192 },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.data.errors).toBe(1)
      expect(res.body.data.updated).toBe(1)
      expect(res.body.data.errorDetails).toHaveLength(1)
      expect(res.body.data.errorDetails[0].error).toBe('Database update failed')
    })

    it('includes errorDetails only when there are phase 2 errors', async () => {
      const setting = makeSetting({ value: 0.1 })

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: [setting], error: null })
        return buildQueryChain({ data: null, error: { message: 'boom' } })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.9 }] })

      expect(res.body.data.errorDetails).toBeDefined()
      expect(res.body.data.errorDetails).toHaveLength(1)
    })

    it('catches thrown exceptions in phase 2 and adds to errors[]', async () => {
      const setting = makeSetting({ value: 0.1 })

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: [setting], error: null })
        // Simulate thrown error (not just an error object)
        throw new Error('Unexpected crash')
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.9 }] })

      expect(res.status).toBe(200)
      expect(res.body.data.errors).toBe(1)
      expect(res.body.data.errorDetails[0].error).toBe('Internal error')
    })
  })

  // -------------------------------------------------------------------------
  // Audit log — reason provided vs not
  // -------------------------------------------------------------------------

  describe('Audit log insertion', () => {
    it('inserts into settings_audit_log when reason is provided', async () => {
      const setting = makeSetting({ value: 0.1 })

      const auditChain = buildQueryChain({ data: null, error: null })
      let callCount = 0
      mockFrom.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: [setting], error: null })
        if (table === 'settings_audit_log') return auditChain
        return buildQueryChain({ data: null, error: null })
      })

      await request(app)
        .put('/batch')
        .send({
          updates: [{ category: 'ai', key: 'temperature', value: 0.9 }],
          reason: 'Quarterly review',
        })

      // The audit log insert should have been called
      const auditCallIndex = Array.from({ length: callCount }, (_, i) => i + 1).find(
        (i) => i > 1
      )
      expect(auditCallIndex).toBeDefined()
      // Verify 'settings_audit_log' was used (mockFrom called with it)
      const calls = mockFrom.mock.calls
      const auditCall = calls.find((c) => c[0] === 'settings_audit_log')
      expect(auditCall).toBeDefined()
    })

    it('prepends "[Batch]" to reason in audit log insert', async () => {
      const setting = makeSetting({ value: 0.1 })

      const auditChain = buildQueryChain({ data: null, error: null })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_audit_log') return auditChain
        return buildQueryChain({ data: [setting], error: null })
      })

      await request(app)
        .put('/batch')
        .send({
          updates: [{ category: 'ai', key: 'temperature', value: 0.9 }],
          reason: 'My reason',
        })

      // Find the insert call on the audit chain
      const insertFn = auditChain.insert as ReturnType<typeof vi.fn>
      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: '[Batch] My reason' })
      )
    })

    it('does NOT insert into settings_audit_log when reason is omitted', async () => {
      const setting = makeSetting({ value: 0.1 })

      mockFrom.mockImplementation((table: string) => {
        return buildQueryChain({
          data: table === 'app_settings' ? [setting] : null,
          error: null,
        })
      })

      await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.9 }] })

      const calls = mockFrom.mock.calls
      const auditCall = calls.find((c) => c[0] === 'settings_audit_log')
      expect(auditCall).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Webhook firing
  // -------------------------------------------------------------------------

  describe('Webhook firing', () => {
    it('fires a webhook per category when updates succeed', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'evaluation', key: 'grade_a', value: 90 }),
      ]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? settings : null, error: null })
      })

      await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.5 },
            { category: 'evaluation', key: 'grade_a', value: 85 },
          ],
        })

      // One webhook per unique category
      expect(mockFireWebhooks).toHaveBeenCalledTimes(2)
      expect(mockFireWebhooks).toHaveBeenCalledWith(
        'setting.batch_updated',
        expect.objectContaining({ category: 'ai' })
      )
      expect(mockFireWebhooks).toHaveBeenCalledWith(
        'setting.batch_updated',
        expect.objectContaining({ category: 'evaluation' })
      )
    })

    it('fires one webhook for a single category with multiple keys', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'ai', key: 'max_tokens', value: 4096 }),
      ]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? settings : null, error: null })
      })

      await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.5 },
            { category: 'ai', key: 'max_tokens', value: 8192 },
          ],
        })

      expect(mockFireWebhooks).toHaveBeenCalledTimes(1)
      const [event, payload] = mockFireWebhooks.mock.calls[0] as [string, { changes: unknown[] }]
      expect(event).toBe('setting.batch_updated')
      expect(payload.changes).toHaveLength(2)
    })

    it('includes the reason in the webhook payload when provided', async () => {
      const setting = makeSetting({ value: 0.1 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      await request(app)
        .put('/batch')
        .send({
          updates: [{ category: 'ai', key: 'temperature', value: 0.9 }],
          reason: 'Perf tuning',
        })

      expect(mockFireWebhooks).toHaveBeenCalledWith(
        'setting.batch_updated',
        expect.objectContaining({ reason: 'Perf tuning' })
      )
    })

    it('does NOT fire webhooks when no updates succeed', async () => {
      // All settings unchanged → skipped
      const setting = makeSetting({ value: 0.1 })
      mockFrom.mockReturnValue(buildQueryChain({ data: [setting], error: null }))

      await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.1 }] })

      expect(mockFireWebhooks).not.toHaveBeenCalled()
    })

    it('logs a warning but does not fail when webhook fires throws', async () => {
      const setting = makeSetting({ value: 0.1 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })
      mockFireWebhooks.mockRejectedValueOnce(new Error('webhook down'))

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.9 }] })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // skippedCount calculation
  // -------------------------------------------------------------------------

  describe('skippedCount calculation', () => {
    it('calculates skipped as updates.length - validatedUpdates - validationErrors', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'ai', key: 'max_tokens', value: 4096 }),
        // s3 does not exist → 'Setting not found' error
      ]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? settings : null, error: null })
      })

      // 3 updates: 1 not found → validation error, 1 unchanged → skip, 1 changed → update
      const res = await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.1 },    // unchanged → skipped
            { category: 'ai', key: 'max_tokens', value: 8192 },    // changed → valid (but won't reach phase 2 due to errors)
            { category: 'ai', key: 'nonexistent', value: 1 },      // not found → error
          ],
        })

      // validationErrors = 1 (nonexistent), validatedUpdates = 1 (max_tokens),
      // but because validationErrors > 0 we return 400 before skippedCount matters
      expect(res.status).toBe(400)
      expect(res.body.validationErrors).toHaveLength(1)
      expect(res.body.validCount).toBe(1)
    })

    it('reports skipped = 2 when two items are unchanged and one is updated', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'a', value: 10 }),
        makeSetting({ id: 's2', category: 'ai', key: 'b', value: 20 }),
        makeSetting({ id: 's3', category: 'ai', key: 'c', value: 30 }),
      ]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? settings : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'a', value: 10 }, // unchanged
            { category: 'ai', key: 'b', value: 20 }, // unchanged
            { category: 'ai', key: 'c', value: 99 }, // changed
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(1)
      expect(res.body.data.skipped).toBe(2)
      expect(res.body.data.errors).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Constraint validation edge cases
  // -------------------------------------------------------------------------

  describe('Constraint validation edge cases', () => {
    it('does not apply min_value check when value is not a number', async () => {
      // String value with min_value constraint — constraint only applies to numbers
      const setting = makeSetting({ value: 'old', min_value: 0, allowed_values: null })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 'new-string' }] })

      // min_value check only fires when typeof value === 'number', so this should succeed
      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(1)
    })

    it('does not apply max_value check when value is not a number', async () => {
      const setting = makeSetting({ value: 'old', max_value: 100, allowed_values: null })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 'big-string' }] })

      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(1)
    })

    it('applies min_value constraint: value exactly at min is valid', async () => {
      const setting = makeSetting({ value: 1, min_value: 0 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0 }] })

      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(1)
    })

    it('applies max_value constraint: value exactly at max is valid', async () => {
      const setting = makeSetting({ value: 1, max_value: 100 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 100 }] })

      expect(res.status).toBe(200)
      expect(res.body.data.updated).toBe(1)
    })

    it('reports allowed_values constraint error with all valid options listed', async () => {
      const setting = makeSetting({ allowed_values: ['a', 'b', 'c'] })
      mockFrom.mockReturnValue(buildQueryChain({ data: [setting], error: null }))

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 'd' }] })

      expect(res.body.validationErrors[0].error).toBe('Value must be one of: a, b, c')
    })
  })

  // -------------------------------------------------------------------------
  // Multi-category SELECT fetch (Phase 1 deduplication)
  // -------------------------------------------------------------------------

  describe('Phase 1 — category deduplication in SELECT', () => {
    it('fetches all settings for unique categories with a single query', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'ai', key: 'max_tokens', value: 4096 }),
      ]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? settings : null, error: null })
      })

      await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.5 },
            { category: 'ai', key: 'max_tokens', value: 8192 },
          ],
        })

      // The first mockFrom call (Phase 1 SELECT) should use .in() with unique categories
      const firstChain = mockFrom.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>
      expect(firstChain.in).toHaveBeenCalledWith('category', ['ai'])
    })

    it('passes all unique categories to the .in() clause', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'evaluation', key: 'grade_a', value: 90 }),
        makeSetting({ id: 's3', category: 'ocr', key: 'threshold', value: 0.7 }),
      ]
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? settings : null, error: null })
      })

      await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'temperature', value: 0.5 },
            { category: 'evaluation', key: 'grade_a', value: 85 },
            { category: 'ocr', key: 'threshold', value: 0.8 },
          ],
        })

      const firstChain = mockFrom.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>
      const inArgs = (firstChain.in as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]]
      expect(inArgs[0]).toBe('category')
      expect(inArgs[1].sort()).toEqual(['ai', 'evaluation', 'ocr'].sort())
    })
  })

  // -------------------------------------------------------------------------
  // Full integration: mixed valid + unchanged + errors
  // -------------------------------------------------------------------------

  describe('Full integration — mixed scenario', () => {
    it('handles mixed valid, unchanged, and failed phase 2 updates correctly', async () => {
      const settings = [
        makeSetting({ id: 's1', category: 'ai', key: 'temperature', value: 0.1 }),
        makeSetting({ id: 's2', category: 'ai', key: 'max_tokens', value: 4096 }),
        makeSetting({ id: 's3', category: 'ai', key: 'stable_key', value: 'same' }),
      ]

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: settings, error: null }) // SELECT
        if (callCount === 2) return buildQueryChain({ data: null, error: { message: 'boom' } }) // first UPDATE fails
        return buildQueryChain({ data: null, error: null }) // second UPDATE succeeds
      })

      const res = await request(app)
        .put('/batch')
        .send({
          updates: [
            { category: 'ai', key: 'stable_key', value: 'same' },    // unchanged → skipped
            { category: 'ai', key: 'temperature', value: 0.9 },       // changed → update fails
            { category: 'ai', key: 'max_tokens', value: 8192 },      // changed → update succeeds
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.data.updated).toBe(1)
      expect(res.body.data.skipped).toBe(1)
      expect(res.body.data.errors).toBe(1)
      expect(res.body.data.errorDetails).toHaveLength(1)
    })

    it('returns success true only when errors === 0', async () => {
      const setting = makeSetting({ value: 0.1 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return buildQueryChain({ data: callCount === 1 ? [setting] : null, error: null })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.9 }] })

      expect(res.body.success).toBe(true)
    })

    it('returns success false when there are phase 2 errors', async () => {
      const setting = makeSetting({ value: 0.1 })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: [setting], error: null })
        return buildQueryChain({ data: null, error: { message: 'fail' } })
      })

      const res = await request(app)
        .put('/batch')
        .send({ updates: [{ category: 'ai', key: 'temperature', value: 0.9 }] })

      expect(res.body.success).toBe(false)
    })
  })
})
