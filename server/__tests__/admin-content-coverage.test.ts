/**
 * Admin Content Route Coverage Tests
 *
 * Targets uncovered branches in server/routes/admin/content.ts:
 * - Processing logs: list with filters, stats, get by ID/policyID, cleanup
 * - Notifications: unacknowledged, paginated list, acknowledge single/all
 * - Benchmarks: list with filters, get by ID, create/update/delete, insurance types, bulk update
 * - Error handling: supabase unavailable, query errors, not found, validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================
const {
  mockListProcessingLogs,
  mockGetProcessingStats,
  mockGetProcessingLog,
  mockGetProcessingLogByPolicyId,
  mockDeleteOldLogs,
  mockGetUnacknowledgedNotifications,
  mockGetNotifications,
  mockAcknowledgeNotification,
  mockLogAdminAction,
  mockGetSupabaseWithError,
  mockAuthenticateAdmin,
  mockFrom,
  mockQueryResult: _mockQueryResult,
} = vi.hoisted(() => ({
  mockListProcessingLogs: vi.fn(),
  mockGetProcessingStats: vi.fn(),
  mockGetProcessingLog: vi.fn(),
  mockGetProcessingLogByPolicyId: vi.fn(),
  mockDeleteOldLogs: vi.fn(),
  mockGetUnacknowledgedNotifications: vi.fn(),
  mockGetNotifications: vi.fn(),
  mockAcknowledgeNotification: vi.fn(),
  mockLogAdminAction: vi.fn(),
  mockGetSupabaseWithError: vi.fn(),
  mockAuthenticateAdmin: vi.fn(),
  mockFrom: vi.fn(),
  mockQueryResult: { data: null, error: null },
}))

// Mock logger
vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  const child = { debug: noop, info: noop, warn: noop, error: noop, child: vi.fn().mockReturnThis() }
  return { logger: child, default: child }
})

// Mock processing log service
vi.mock('../services/processing-log-service.js', () => ({
  listProcessingLogs: (...args: unknown[]) => mockListProcessingLogs(...args),
  getProcessingStats: (...args: unknown[]) => mockGetProcessingStats(...args),
  getProcessingLog: (...args: unknown[]) => mockGetProcessingLog(...args),
  getProcessingLogByPolicyId: (...args: unknown[]) => mockGetProcessingLogByPolicyId(...args),
  deleteOldLogs: (...args: unknown[]) => mockDeleteOldLogs(...args),
}))

// Mock admin notification service
vi.mock('../services/admin-notification-service.js', () => ({
  getUnacknowledgedNotifications: (...args: unknown[]) => mockGetUnacknowledgedNotifications(...args),
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  acknowledgeNotification: (...args: unknown[]) => mockAcknowledgeNotification(...args),
}))

// Build chainable Supabase query mock
function buildQueryChain(finalResult: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)
  return chain
}

// Mock shared module
vi.mock('../routes/admin/shared.js', () => {
  const noop = vi.fn()
  const child = { debug: noop, info: noop, warn: noop, error: noop, child: vi.fn().mockReturnThis() }

  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next()

  const requireSuperAdmin = (...args: unknown[]) => {
    if (args.length >= 3 && typeof args[2] === 'function') {
      ;(args[2] as () => void)()
      return
    }
    return [passthrough]
  }

  return {
    authenticateAdmin: (...args: unknown[]) => mockAuthenticateAdmin(...args),
    requireSuperAdmin,
    logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
    getSupabaseWithError: (...args: unknown[]) => mockGetSupabaseWithError(...args),
    qstr: (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? ''),
    logger: child,
  }
})

// =============================================================================
// HELPERS
// =============================================================================
const ADMIN_USER = {
  id: 'admin-001',
  email: 'admin@test.com',
  role: 'super_admin',
  permissions: [],
}

function setupDefaultMocks() {
  mockAuthenticateAdmin.mockImplementation((_req: any, _res: any, next: () => void) => {
    _req.adminUser = { ...ADMIN_USER }
    _req.adminSession = { id: 'sess-001', tokenHash: 'hash' }
    next()
  })
  mockLogAdminAction.mockResolvedValue(undefined)
  mockListProcessingLogs.mockResolvedValue({ logs: [], total: 0 })
  mockGetProcessingStats.mockResolvedValue({ total: 100 })
  mockGetProcessingLog.mockResolvedValue(null)
  mockGetProcessingLogByPolicyId.mockResolvedValue(null)
  mockDeleteOldLogs.mockResolvedValue(5)
  mockGetUnacknowledgedNotifications.mockResolvedValue([])
  mockGetNotifications.mockResolvedValue({ notifications: [], total: 0 })
  mockAcknowledgeNotification.mockResolvedValue(true)
}

function setupSupabaseMock(data: unknown, error: unknown = null) {
  const chain = buildQueryChain({ data, error })
  mockFrom.mockReturnValue(chain)
  mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })
  return chain
}

async function createApp() {
  const mod = await import('../routes/admin/content.js')
  const app = express()
  app.use(express.json())
  app.use('/api/admin', mod.default)
  return app
}

// =============================================================================
// TESTS
// =============================================================================
describe('Admin Content Routes', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    setupDefaultMocks()
    app = await createApp()
  })

  // =========================================================================
  // PROCESSING LOGS
  // =========================================================================
  describe('GET /processing-logs', () => {
    it('returns paginated processing logs', async () => {
      mockListProcessingLogs.mockResolvedValue({
        logs: [{ id: 'log-1', status: 'completed' }],
        total: 1,
      })
      const res = await request(app).get('/api/admin/processing-logs')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.total).toBe(1)
      expect(res.body.limit).toBe(50)
      expect(res.body.offset).toBe(0)
    })

    it('passes filters to service', async () => {
      await request(app).get('/api/admin/processing-logs?status=completed&ocr_used=true&ai_provider=openai&from_date=2026-01-01&to_date=2026-02-01&search=test&limit=10&offset=5')
      expect(mockListProcessingLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          ocr_used: true,
          ai_provider: 'openai',
          from_date: '2026-01-01',
          to_date: '2026-02-01',
          search: 'test',
          limit: 10,
          offset: 5,
        })
      )
    })

    it('handles ocr_used=false filter', async () => {
      await request(app).get('/api/admin/processing-logs?ocr_used=false')
      expect(mockListProcessingLogs).toHaveBeenCalledWith(
        expect.objectContaining({ ocr_used: false })
      )
    })

    it('handles ocr_used=undefined (neither true nor false)', async () => {
      await request(app).get('/api/admin/processing-logs?ocr_used=maybe')
      expect(mockListProcessingLogs).toHaveBeenCalledWith(
        expect.objectContaining({ ocr_used: undefined })
      )
    })

    it('uses default limit and offset for invalid values', async () => {
      await request(app).get('/api/admin/processing-logs?limit=abc&offset=xyz')
      expect(mockListProcessingLogs).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, offset: 0 })
      )
    })

    it('returns 500 on service error', async () => {
      mockListProcessingLogs.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/processing-logs')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to list processing logs')
    })
  })

  describe('GET /processing-logs/stats', () => {
    it('returns processing stats with default days', async () => {
      mockGetProcessingStats.mockResolvedValue({ total: 100, completed: 90 })
      const res = await request(app).get('/api/admin/processing-logs/stats')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockGetProcessingStats).toHaveBeenCalledWith(30)
    })

    it('accepts custom days parameter', async () => {
      await request(app).get('/api/admin/processing-logs/stats?days=7')
      expect(mockGetProcessingStats).toHaveBeenCalledWith(7)
    })

    it('uses default for invalid days', async () => {
      await request(app).get('/api/admin/processing-logs/stats?days=abc')
      expect(mockGetProcessingStats).toHaveBeenCalledWith(30)
    })

    it('returns 500 on service error', async () => {
      mockGetProcessingStats.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/processing-logs/stats')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to get processing stats')
    })
  })

  describe('GET /processing-logs/:documentId', () => {
    it('returns a specific processing log', async () => {
      mockGetProcessingLog.mockResolvedValue({ id: 'doc-001', status: 'completed' })
      const res = await request(app).get('/api/admin/processing-logs/doc-001')
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('doc-001')
    })

    it('returns 404 when not found', async () => {
      mockGetProcessingLog.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/processing-logs/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Processing log not found')
    })

    it('returns 500 on error', async () => {
      mockGetProcessingLog.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/processing-logs/doc-001')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /processing-logs/by-policy/:policyId', () => {
    it('returns log by policy ID', async () => {
      mockGetProcessingLogByPolicyId.mockResolvedValue({ id: 'log-001', policyId: 'pol-001' })
      const res = await request(app).get('/api/admin/processing-logs/by-policy/pol-001')
      expect(res.status).toBe(200)
      expect(res.body.data.policyId).toBe('pol-001')
    })

    it('returns 404 when not found', async () => {
      mockGetProcessingLogByPolicyId.mockResolvedValue(null)
      const res = await request(app).get('/api/admin/processing-logs/by-policy/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Processing log not found for this policy')
    })

    it('returns 500 on error', async () => {
      mockGetProcessingLogByPolicyId.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/processing-logs/by-policy/pol-001')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /processing-logs/cleanup', () => {
    it('deletes old logs with default days', async () => {
      mockDeleteOldLogs.mockResolvedValue(10)
      const res = await request(app).post('/api/admin/processing-logs/cleanup').send({})
      expect(res.status).toBe(200)
      expect(res.body.deletedCount).toBe(10)
      expect(res.body.message).toContain('90 days')
      expect(mockDeleteOldLogs).toHaveBeenCalledWith(90)
    })

    it('accepts custom daysOld parameter', async () => {
      await request(app).post('/api/admin/processing-logs/cleanup').send({ daysOld: '30' })
      expect(mockDeleteOldLogs).toHaveBeenCalledWith(30)
    })

    it('logs the cleanup action', async () => {
      await request(app).post('/api/admin/processing-logs/cleanup').send({})
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'cleanup', 'processing_logs', undefined, undefined,
        expect.objectContaining({ daysOld: 90 })
      )
    })

    it('returns 500 on error', async () => {
      mockDeleteOldLogs.mockRejectedValue(new Error('DB error'))
      const res = await request(app).post('/api/admin/processing-logs/cleanup').send({})
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // NOTIFICATIONS
  // =========================================================================
  describe('GET /notifications/unacknowledged', () => {
    it('returns unacknowledged notifications', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([
        { id: 'n1', message: 'Test' },
        { id: 'n2', message: 'Test2' },
      ])
      const res = await request(app).get('/api/admin/notifications/unacknowledged')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.count).toBe(2)
    })

    it('returns 500 on error', async () => {
      mockGetUnacknowledgedNotifications.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/notifications/unacknowledged')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /notifications', () => {
    it('returns paginated notifications', async () => {
      mockGetNotifications.mockResolvedValue({ notifications: [{ id: 'n1' }], total: 1 })
      const res = await request(app).get('/api/admin/notifications')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.total).toBe(1)
      expect(res.body.limit).toBe(50)
      expect(res.body.offset).toBe(0)
    })

    it('passes custom limit, offset, and category', async () => {
      await request(app).get('/api/admin/notifications?limit=10&offset=5&category=billing')
      expect(mockGetNotifications).toHaveBeenCalledWith({ limit: 10, offset: 5, category: 'billing' })
    })

    it('uses defaults for invalid limit/offset', async () => {
      await request(app).get('/api/admin/notifications?limit=abc&offset=xyz')
      expect(mockGetNotifications).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0 }))
    })

    it('returns 500 on error', async () => {
      mockGetNotifications.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/notifications')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /notifications/:id/acknowledge', () => {
    it('acknowledges a notification', async () => {
      const res = await request(app).post('/api/admin/notifications/n1/acknowledge')
      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Notification acknowledged')
      expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1', 'admin@test.com')
    })

    it('returns 404 when notification not found', async () => {
      mockAcknowledgeNotification.mockResolvedValue(false)
      const res = await request(app).post('/api/admin/notifications/n999/acknowledge')
      expect(res.status).toBe(404)
    })

    it('uses unknown when no adminUser email', async () => {
      mockAuthenticateAdmin.mockImplementation((req: any, _res: any, next: () => void) => {
        req.adminUser = { id: 'admin-001' } // no email
        req.adminSession = { id: 'sess-001' }
        next()
      })
      await request(app).post('/api/admin/notifications/n1/acknowledge')
      expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1', 'unknown')
    })

    it('logs the acknowledge action', async () => {
      await request(app).post('/api/admin/notifications/n1/acknowledge')
      expect(mockLogAdminAction).toHaveBeenCalledWith(expect.anything(), 'acknowledge', 'notification', 'n1')
    })

    it('returns 500 on error', async () => {
      mockAcknowledgeNotification.mockRejectedValue(new Error('DB error'))
      const res = await request(app).post('/api/admin/notifications/n1/acknowledge')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /notifications/acknowledge-all', () => {
    it('acknowledges all notifications', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([
        { id: 'n1', message: 'Test1' },
        { id: 'n2', message: 'Test2' },
      ])
      mockAcknowledgeNotification.mockResolvedValue(true)
      const res = await request(app).post('/api/admin/notifications/acknowledge-all')
      expect(res.status).toBe(200)
      expect(res.body.acknowledgedCount).toBe(2)
    })

    it('skips notifications without id', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([
        { id: 'n1', message: 'Test1' },
        { message: 'No ID' }, // no id field
      ])
      mockAcknowledgeNotification.mockResolvedValue(true)
      const res = await request(app).post('/api/admin/notifications/acknowledge-all')
      expect(res.body.acknowledgedCount).toBe(1)
      expect(mockAcknowledgeNotification).toHaveBeenCalledTimes(1)
    })

    it('counts only successful acknowledgments', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([
        { id: 'n1' },
        { id: 'n2' },
      ])
      mockAcknowledgeNotification.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      const res = await request(app).post('/api/admin/notifications/acknowledge-all')
      expect(res.body.acknowledgedCount).toBe(1)
    })

    it('logs the acknowledge_all action', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([{ id: 'n1' }])
      mockAcknowledgeNotification.mockResolvedValue(true)
      await request(app).post('/api/admin/notifications/acknowledge-all')
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'acknowledge_all', 'notifications', undefined, undefined,
        expect.objectContaining({ count: 1 })
      )
    })

    it('returns 500 on error', async () => {
      mockGetUnacknowledgedNotifications.mockRejectedValue(new Error('DB error'))
      const res = await request(app).post('/api/admin/notifications/acknowledge-all')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // PREMIUM BENCHMARKS
  // =========================================================================
  describe('GET /benchmarks', () => {
    it('returns all benchmarks', async () => {
      const _chain = setupSupabaseMock([{ id: 'b1', insurance_type: 'kasko' }])
      const res = await request(app).get('/api/admin/benchmarks')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('filters by insurance_type', async () => {
      const chain = setupSupabaseMock([])
      await request(app).get('/api/admin/benchmarks?insurance_type=kasko')
      expect(chain.eq).toHaveBeenCalledWith('insurance_type', 'kasko')
    })

    it('filters by is_active', async () => {
      const chain = setupSupabaseMock([])
      await request(app).get('/api/admin/benchmarks?is_active=true')
      expect(chain.eq).toHaveBeenCalledWith('is_active', true)
    })

    it('returns 503 when supabase unavailable', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'Not configured' })
      const res = await request(app).get('/api/admin/benchmarks')
      expect(res.status).toBe(503)
    })

    it('returns 500 on query error', async () => {
      setupSupabaseMock(null, { message: 'Query failed' })
      const res = await request(app).get('/api/admin/benchmarks')
      expect(res.status).toBe(500)
    })

    it('returns 500 on exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw new Error('Crash') })
      const res = await request(app).get('/api/admin/benchmarks')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /benchmarks/:id', () => {
    it('returns a specific benchmark', async () => {
      setupSupabaseMock({ id: 'b1', insurance_type: 'kasko' })
      const res = await request(app).get('/api/admin/benchmarks/b1')
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('b1')
    })

    it('returns 404 when not found', async () => {
      setupSupabaseMock(null, null)
      const res = await request(app).get('/api/admin/benchmarks/nonexistent')
      expect(res.status).toBe(404)
    })

    it('returns 404 on query error', async () => {
      setupSupabaseMock(null, { message: 'not found' })
      const res = await request(app).get('/api/admin/benchmarks/b1')
      expect(res.status).toBe(404)
    })

    it('returns 503 when supabase unavailable', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'Not configured' })
      const res = await request(app).get('/api/admin/benchmarks/b1')
      expect(res.status).toBe(503)
    })

    it('returns 500 on exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw new Error('Crash') })
      const res = await request(app).get('/api/admin/benchmarks/b1')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /benchmarks', () => {
    const validBenchmark = {
      insurance_type: 'kasko',
      insurance_type_tr: 'Kasko',
      min_premium: '1000',
      avg_premium: '2000',
      max_premium: '5000',
    }

    it('creates a benchmark with required fields', async () => {
      setupSupabaseMock({ id: 'new-b1', ...validBenchmark })
      const res = await request(app).post('/api/admin/benchmarks').send(validBenchmark)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('creates benchmark with all optional fields', async () => {
      const fullBenchmark = {
        ...validBenchmark,
        sub_type: 'full_kasko',
        sub_type_tr: 'Tam Kasko',
        comparison_method: 'value_based',
        value_min_rate: '0.01',
        value_avg_rate: '0.02',
        value_max_rate: '0.05',
        currency: 'USD',
        year: 2025,
        source: 'TSB',
        source_tr: 'TSB Raporu',
        notes: 'Test note',
        notes_tr: 'Test not',
      }
      setupSupabaseMock({ id: 'new-b1', ...fullBenchmark })
      const res = await request(app).post('/api/admin/benchmarks').send(fullBenchmark)
      expect(res.status).toBe(200)
    })

    it('returns 400 when required fields missing', async () => {
      const res = await request(app).post('/api/admin/benchmarks').send({ insurance_type: 'kasko' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('required')
    })

    it('returns 400 when min_premium missing', async () => {
      const res = await request(app).post('/api/admin/benchmarks').send({
        insurance_type: 'kasko',
        insurance_type_tr: 'Kasko',
        avg_premium: '2000',
        max_premium: '5000',
      })
      expect(res.status).toBe(400)
    })

    it('returns 503 when supabase unavailable', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'Not configured' })
      const res = await request(app).post('/api/admin/benchmarks').send(validBenchmark)
      expect(res.status).toBe(503)
    })

    it('returns 500 on insert error', async () => {
      setupSupabaseMock(null, { message: 'Insert failed' })
      const res = await request(app).post('/api/admin/benchmarks').send(validBenchmark)
      expect(res.status).toBe(500)
    })

    it('logs the create action', async () => {
      setupSupabaseMock({ id: 'new-b1', ...validBenchmark })
      await request(app).post('/api/admin/benchmarks').send(validBenchmark)
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'create', 'premium_benchmark', 'new-b1', undefined,
        expect.objectContaining({ insurance_type: 'kasko' })
      )
    })

    it('returns 500 on exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw new Error('Crash') })
      const res = await request(app).post('/api/admin/benchmarks').send(validBenchmark)
      expect(res.status).toBe(500)
    })
  })

  describe('PUT /benchmarks/:id', () => {
    it('updates a benchmark', async () => {
      // First call returns existing, second call returns updated
      const chain = buildQueryChain({ data: { id: 'b1', insurance_type: 'kasko' }, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      const res = await request(app).put('/api/admin/benchmarks/b1').send({ min_premium: '1500' })
      expect(res.status).toBe(200)
    })

    it('updates numeric fields (parsed as float)', async () => {
      const chain = buildQueryChain({ data: { id: 'b1' }, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      await request(app).put('/api/admin/benchmarks/b1').send({
        min_premium: '1500.50',
        avg_premium: '2500',
        max_premium: '5000',
        value_min_rate: '0.01',
        value_avg_rate: null,
        value_max_rate: '0.05',
        year: '2026',
      })

      expect(chain.update).toHaveBeenCalled()
    })

    it('updates non-numeric fields (direct assignment)', async () => {
      const chain = buildQueryChain({ data: { id: 'b1' }, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      await request(app).put('/api/admin/benchmarks/b1').send({
        insurance_type: 'health',
        insurance_type_tr: 'Saglik',
        notes: 'Updated notes',
        is_active: false,
      })
      expect(chain.update).toHaveBeenCalled()
    })

    it('returns 404 when benchmark not found', async () => {
      const chain = buildQueryChain({ data: null, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      const res = await request(app).put('/api/admin/benchmarks/nonexistent').send({ min_premium: '1500' })
      expect(res.status).toBe(404)
    })

    it('returns 503 when supabase unavailable', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'Not configured' })
      const res = await request(app).put('/api/admin/benchmarks/b1').send({ min_premium: '1500' })
      expect(res.status).toBe(503)
    })

    it('logs the update action', async () => {
      const chain = buildQueryChain({ data: { id: 'b1', insurance_type: 'kasko' }, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      await request(app).put('/api/admin/benchmarks/b1').send({ notes: 'Updated' })
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'update', 'premium_benchmark', 'b1', expect.anything(), expect.anything()
      )
    })

    it('returns 500 on update error', async () => {
      // First call (select existing) succeeds
      const selectChain = buildQueryChain({ data: { id: 'b1' }, error: null })
      // Second call (update) fails
      const updateChain = buildQueryChain({ data: null, error: { message: 'Update failed' } })

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return callCount === 1 ? selectChain : updateChain
      })
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      const res = await request(app).put('/api/admin/benchmarks/b1').send({ min_premium: '1500' })
      expect(res.status).toBe(500)
    })

    it('returns 500 on exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw new Error('Crash') })
      const res = await request(app).put('/api/admin/benchmarks/b1').send({ min_premium: '1500' })
      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /benchmarks/:id', () => {
    it('soft-deletes a benchmark', async () => {
      const chain = buildQueryChain({ data: null, error: null })
      // For delete, the chain doesn't call .single(), so make it resolve directly
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      const res = await request(app).delete('/api/admin/benchmarks/b1')
      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Benchmark deactivated')
    })

    it('returns 503 when supabase unavailable', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'Not configured' })
      const res = await request(app).delete('/api/admin/benchmarks/b1')
      expect(res.status).toBe(503)
    })

    it('returns 500 on delete error', async () => {
      const chain = buildQueryChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'Delete failed' } })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      const res = await request(app).delete('/api/admin/benchmarks/b1')
      expect(res.status).toBe(500)
    })

    it('logs the delete action', async () => {
      const chain = buildQueryChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      await request(app).delete('/api/admin/benchmarks/b1')
      expect(mockLogAdminAction).toHaveBeenCalledWith(expect.anything(), 'delete', 'premium_benchmark', 'b1')
    })
  })

  // NOTE: GET /benchmarks/insurance-types and PUT /benchmarks/bulk-update routes
  // are defined AFTER /benchmarks/:id in content.ts, making them unreachable
  // because Express matches 'insurance-types' and 'bulk-update' as :id parameters.
  // These routes are dead code due to Express route ordering.
  describe('GET /benchmarks/insurance-types (shadowed by :id)', () => {
    it('is intercepted by /benchmarks/:id route', async () => {
      // 'insurance-types' matches :id param, so hits the single-benchmark endpoint
      setupSupabaseMock(null, null)
      const res = await request(app).get('/api/admin/benchmarks/insurance-types')
      // Returns 404 because it goes to the :id handler which finds no benchmark with id='insurance-types'
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /benchmarks/bulk-update (shadowed by :id)', () => {
    it('is intercepted by PUT /benchmarks/:id route', async () => {
      // 'bulk-update' matches :id param, so hits the single-update endpoint
      const chain = buildQueryChain({ data: null, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })
      const res = await request(app).put('/api/admin/benchmarks/bulk-update').send({ year: '2026', multiplier: '1.1' })
      // Returns 404 because :id handler finds no benchmark with id='bulk-update'
      expect(res.status).toBe(404)
    })
  })

  // =========================================================================
  // NON-ERROR THROWN (covers String(error) branches in all catch blocks)
  // =========================================================================
  describe('non-Error thrown in catch blocks (String(error) branch)', () => {
    it('processing-logs list: handles string thrown', async () => {
      mockListProcessingLogs.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/processing-logs')
      expect(res.status).toBe(500)
    })

    it('processing-logs stats: handles string thrown', async () => {
      mockGetProcessingStats.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/processing-logs/stats')
      expect(res.status).toBe(500)
    })

    it('processing-logs get by id: handles string thrown', async () => {
      mockGetProcessingLog.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/processing-logs/doc-001')
      expect(res.status).toBe(500)
    })

    it('processing-logs get by policy: handles string thrown', async () => {
      mockGetProcessingLogByPolicyId.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/processing-logs/by-policy/pol-001')
      expect(res.status).toBe(500)
    })

    it('processing-logs cleanup: handles string thrown', async () => {
      mockDeleteOldLogs.mockRejectedValue('string error')
      const res = await request(app).post('/api/admin/processing-logs/cleanup').send({})
      expect(res.status).toBe(500)
    })

    it('notifications unacknowledged: handles string thrown', async () => {
      mockGetUnacknowledgedNotifications.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/notifications/unacknowledged')
      expect(res.status).toBe(500)
    })

    it('notifications list: handles string thrown', async () => {
      mockGetNotifications.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/notifications')
      expect(res.status).toBe(500)
    })

    it('notifications acknowledge: handles string thrown', async () => {
      mockAcknowledgeNotification.mockRejectedValue('string error')
      const res = await request(app).post('/api/admin/notifications/n1/acknowledge')
      expect(res.status).toBe(500)
    })

    it('notifications acknowledge-all: handles string thrown', async () => {
      mockGetUnacknowledgedNotifications.mockRejectedValue('string error')
      const res = await request(app).post('/api/admin/notifications/acknowledge-all')
      expect(res.status).toBe(500)
    })

    it('benchmarks list: handles non-Error thrown via exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/benchmarks')
      expect(res.status).toBe(500)
    })

    it('benchmarks get by id: handles non-Error thrown via exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/benchmarks/b1')
      expect(res.status).toBe(500)
    })

    it('benchmarks create: handles non-Error thrown via exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw 'string error' })
      const res = await request(app).post('/api/admin/benchmarks').send({
        insurance_type: 'kasko',
        insurance_type_tr: 'Kasko',
        min_premium: '1000',
        avg_premium: '2000',
        max_premium: '5000',
      })
      expect(res.status).toBe(500)
    })

    it('benchmarks update: handles non-Error thrown via exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw 'string error' })
      const res = await request(app).put('/api/admin/benchmarks/b1').send({ min_premium: '1500' })
      expect(res.status).toBe(500)
    })

    it('benchmarks delete: handles non-Error thrown via exception', async () => {
      mockGetSupabaseWithError.mockImplementation(() => { throw 'string error' })
      const res = await request(app).delete('/api/admin/benchmarks/b1')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // SUPABASE ERROR FIELD (covers || fallback in supabaseError messages)
  // =========================================================================
  describe('supabaseError fallback to default message', () => {
    it('benchmarks returns default message when supabaseError is empty', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: '' })
      const res = await request(app).get('/api/admin/benchmarks')
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Database not configured')
    })

    it('benchmarks returns custom supabaseError message', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'Custom DB error' })
      const res = await request(app).get('/api/admin/benchmarks')
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Custom DB error')
    })

    it('benchmarks get returns default message when supabaseError is null', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: null })
      const res = await request(app).get('/api/admin/benchmarks/b1')
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Database not configured')
    })

    it('benchmarks create returns default message when supabaseError is undefined', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: undefined })
      const res = await request(app).post('/api/admin/benchmarks').send({
        insurance_type: 'kasko',
        insurance_type_tr: 'Kasko',
        min_premium: '1000',
        avg_premium: '2000',
        max_premium: '5000',
      })
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Database not configured')
    })

    it('benchmarks update returns custom supabaseError', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'DB unavailable' })
      const res = await request(app).put('/api/admin/benchmarks/b1').send({ min_premium: '1500' })
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('DB unavailable')
    })

    it('benchmarks delete returns default message', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: '' })
      const res = await request(app).delete('/api/admin/benchmarks/b1')
      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Database not configured')
    })
  })

  // =========================================================================
  // BENCHMARK QUERY ERROR PATHS (covers error ternaries in Supabase query callbacks)
  // =========================================================================
  describe('benchmark Supabase query error ternaries', () => {
    it('benchmarks list: query error with non-Error object', async () => {
      const chain = buildQueryChain({ data: null, error: { message: 'Query failed' } })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })
      const res = await request(app).get('/api/admin/benchmarks')
      expect(res.status).toBe(500)
    })

    it('benchmarks create: insert error with non-Error object', async () => {
      const chain = buildQueryChain({ data: null, error: 'plain string error' })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })
      const res = await request(app).post('/api/admin/benchmarks').send({
        insurance_type: 'kasko',
        insurance_type_tr: 'Kasko',
        min_premium: '1000',
        avg_premium: '2000',
        max_premium: '5000',
      })
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // BENCHMARK OPTIONAL FIELDS (covers null coalescing on adminUser?.id)
  // =========================================================================
  describe('benchmark adminUser null coalescing', () => {
    it('benchmarks update: adminUser undefined uses null for updated_by', async () => {
      mockAuthenticateAdmin.mockImplementation((req: any, _res: any, next: () => void) => {
        req.adminUser = undefined
        req.adminSession = { id: 'sess-001' }
        next()
      })
      app = await createApp()

      const chain = buildQueryChain({ data: { id: 'b1', insurance_type: 'kasko' }, error: null })
      mockFrom.mockReturnValue(chain)
      mockGetSupabaseWithError.mockReturnValue({ client: { from: mockFrom }, error: null })

      const res = await request(app).put('/api/admin/benchmarks/b1').send({ min_premium: '1500' })
      expect(res.status).toBe(200)
    })

    it('notifications acknowledge: adminUser with no email uses unknown', async () => {
      mockAuthenticateAdmin.mockImplementation((req: any, _res: any, next: () => void) => {
        req.adminUser = undefined
        req.adminSession = { id: 'sess-001' }
        next()
      })
      app = await createApp()
      await request(app).post('/api/admin/notifications/n1/acknowledge')
      expect(mockAcknowledgeNotification).toHaveBeenCalledWith('n1', 'unknown')
    })
  })
})
