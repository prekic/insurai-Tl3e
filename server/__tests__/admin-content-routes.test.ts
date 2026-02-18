/**
 * Admin Content Routes Tests
 *
 * Comprehensive tests for processing logs, admin notifications,
 * and premium benchmarks management endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockLogWarn,
  mockLogError,
  mockLogInfo,
  mockLogDebug,
  // Processing log service mocks
  mockListProcessingLogs,
  mockGetProcessingStats,
  mockGetProcessingLog,
  mockGetProcessingLogByPolicyId,
  mockDeleteOldLogs,
  // Notification service mocks
  mockGetUnacknowledgedNotifications,
  mockGetNotifications,
  mockAcknowledgeNotification,
  // Supabase mocks
  mockFrom,
  _mockSelect,
  _mockInsert,
  _mockUpdate,
  _mockDelete,
  _mockEq,
  _mockSingle,
  _mockOrder,
  _mockContains,
  _mockRange,
  _mockGte,
  _mockLte,
  _mockIlike,
  // Admin auth mocks
  mockLogAdminAction,
  mockGetSupabaseWithError,
} = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  // Processing log service mocks
  mockListProcessingLogs: vi.fn(),
  mockGetProcessingStats: vi.fn(),
  mockGetProcessingLog: vi.fn(),
  mockGetProcessingLogByPolicyId: vi.fn(),
  mockDeleteOldLogs: vi.fn(),
  // Notification service mocks
  mockGetUnacknowledgedNotifications: vi.fn(),
  mockGetNotifications: vi.fn(),
  mockAcknowledgeNotification: vi.fn(),
  // Supabase mocks
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockEq: vi.fn(),
  mockSingle: vi.fn(),
  mockOrder: vi.fn(),
  mockContains: vi.fn(),
  mockRange: vi.fn(),
  mockGte: vi.fn(),
  mockLte: vi.fn(),
  mockIlike: vi.fn(),
  // Admin auth mocks
  mockLogAdminAction: vi.fn().mockResolvedValue(undefined),
  mockGetSupabaseWithError: vi.fn(),
}))

// Mock the logger
vi.mock('../lib/logger.js', () => {
  const child = {
    debug: mockLogDebug,
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

// Mock processing log service
vi.mock('../services/processing-log-service.js', () => ({
  listProcessingLogs: mockListProcessingLogs,
  getProcessingStats: mockGetProcessingStats,
  getProcessingLog: mockGetProcessingLog,
  getProcessingLogByPolicyId: mockGetProcessingLogByPolicyId,
  deleteOldLogs: mockDeleteOldLogs,
}))

// Mock admin notification service
vi.mock('../services/admin-notification-service.js', () => ({
  getUnacknowledgedNotifications: mockGetUnacknowledgedNotifications,
  getNotifications: mockGetNotifications,
  acknowledgeNotification: mockAcknowledgeNotification,
}))

// Build chainable Supabase query mock
function buildQueryChain(finalResult: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {}

  const _self = () => chain

  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.contains = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.ilike = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  // For queries that don't call .single() at the end, make the chain itself thenable
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)

  return chain
}

// Mock the shared module that content.ts imports from
vi.mock('../routes/admin/shared.js', () => {
  const loggerChild = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next()
  // requireSuperAdmin is used two ways in content.ts:
  //   1. `...requireSuperAdmin()` — called, returns array of middleware
  //   2. `authenticateAdmin, requireSuperAdmin` — passed directly as middleware
  // We make it handle both: if called with 3+ args (req,res,next), act as middleware.
  // If called with 0 args (or no next fn), return array.
  const requireSuperAdmin = (...args: unknown[]) => {
    if (args.length >= 3 && typeof args[2] === 'function') {
      ;(args[2] as () => void)()
      return
    }
    return [passthrough]
  }
  return {
    authenticateAdmin: passthrough,
    requireSuperAdmin,
    requireRole: () => passthrough,
    logAdminAction: mockLogAdminAction,
    getSupabaseWithError: mockGetSupabaseWithError,
    qstr: (val: string | string[] | undefined) => {
      if (Array.isArray(val)) return val[0] ?? ''
      return val ?? ''
    },
    logger: {
      ...loggerChild,
      child: vi.fn(() => loggerChild),
    },
    authLimiter: passthrough,
  }
})

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

// ---------------------------------------------------------------------------
// Import Express app setup for supertest (or direct handler testing)
// ---------------------------------------------------------------------------

import express from 'express'
import contentRouter from '../routes/admin/content.js'

function createApp() {
  const app = express()
  app.use(express.json())
  // Simulate adding adminUser to request (middleware passthrough)
  app.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
    req.adminUser = {
      id: 'admin-test-001',
      email: 'admin@test.com',
      role: 'super_admin',
      status: 'active',
      permissions: [],
    }
    next()
  })
  app.use('/', contentRouter)
  return app
}

import request from 'supertest'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_PROCESSING_LOG = {
  id: 'log-001',
  document_id: 'doc-001',
  policy_id: 'pol-001',
  user_id: 'user-001',
  filename: 'policy.pdf',
  file_size: 1024,
  mime_type: 'application/pdf',
  page_count: 5,
  stages: [],
  status: 'completed',
  started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:01:00Z',
  total_duration_ms: 60000,
  ocr_used: false,
  ai_provider: 'openai',
  extraction_confidence: 0.95,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:01:00Z',
}

const MOCK_NOTIFICATION = {
  id: 'notif-001',
  type: 'error' as const,
  category: 'billing' as const,
  title: 'Billing Issue',
  message: 'Payment failed',
  acknowledged: false,
  created_at: '2026-01-01T00:00:00Z',
}

const MOCK_BENCHMARK = {
  id: 'bench-001',
  insurance_type: 'kasko',
  insurance_type_tr: 'Kasko',
  sub_type: null,
  sub_type_tr: null,
  min_premium: 1000,
  avg_premium: 3000,
  max_premium: 8000,
  comparison_method: 'direct_premium',
  value_min_rate: null,
  value_avg_rate: null,
  value_max_rate: null,
  currency: 'TRY',
  year: 2026,
  source: 'SEDDK',
  source_tr: 'SEDDK',
  notes: null,
  notes_tr: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// ============================================================================
// TESTS
// ============================================================================

describe('Admin Content Routes', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  // ==========================================================================
  // PROCESSING LOGS
  // ==========================================================================
  describe('GET /processing-logs', () => {
    it('returns processing logs with default pagination', async () => {
      mockListProcessingLogs.mockResolvedValue({
        logs: [MOCK_PROCESSING_LOG],
        total: 1,
      })

      const res = await request(app).get('/processing-logs')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.total).toBe(1)
      expect(res.body.limit).toBe(50)
      expect(res.body.offset).toBe(0)
    })

    it('passes query filters to the service', async () => {
      mockListProcessingLogs.mockResolvedValue({ logs: [], total: 0 })

      await request(app)
        .get('/processing-logs')
        .query({
          status: 'completed',
          ocr_used: 'true',
          ai_provider: 'openai',
          from_date: '2026-01-01',
          to_date: '2026-01-31',
          search: 'policy',
          limit: '10',
          offset: '5',
        })

      expect(mockListProcessingLogs).toHaveBeenCalledWith({
        status: 'completed',
        ocr_used: true,
        ai_provider: 'openai',
        from_date: '2026-01-01',
        to_date: '2026-01-31',
        search: 'policy',
        limit: 10,
        offset: 5,
      })
    })

    it('parses ocr_used=false correctly', async () => {
      mockListProcessingLogs.mockResolvedValue({ logs: [], total: 0 })

      await request(app)
        .get('/processing-logs')
        .query({ ocr_used: 'false' })

      expect(mockListProcessingLogs).toHaveBeenCalledWith(
        expect.objectContaining({ ocr_used: false })
      )
    })

    it('handles ocr_used with non-boolean string as undefined', async () => {
      mockListProcessingLogs.mockResolvedValue({ logs: [], total: 0 })

      await request(app)
        .get('/processing-logs')
        .query({ ocr_used: 'maybe' })

      expect(mockListProcessingLogs).toHaveBeenCalledWith(
        expect.objectContaining({ ocr_used: undefined })
      )
    })

    it('returns 500 when service throws', async () => {
      mockListProcessingLogs.mockRejectedValue(new Error('DB timeout'))

      const res = await request(app).get('/processing-logs')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Failed to list processing logs')
    })
  })

  describe('GET /processing-logs/stats', () => {
    it('returns processing stats with default days', async () => {
      const mockStats = {
        total: 100,
        completed: 90,
        failed: 5,
        processing: 5,
        avg_duration_ms: 5000,
        ocr_usage_rate: 30,
        ai_provider_breakdown: { openai: 60, anthropic: 40 },
      }
      mockGetProcessingStats.mockResolvedValue(mockStats)

      const res = await request(app).get('/processing-logs/stats')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual(mockStats)
      expect(mockGetProcessingStats).toHaveBeenCalledWith(30)
    })

    it('passes custom days parameter', async () => {
      mockGetProcessingStats.mockResolvedValue({
        total: 0, completed: 0, failed: 0, processing: 0,
        avg_duration_ms: 0, ocr_usage_rate: 0, ai_provider_breakdown: {},
      })

      await request(app).get('/processing-logs/stats').query({ days: '7' })

      expect(mockGetProcessingStats).toHaveBeenCalledWith(7)
    })

    it('defaults days to 30 for invalid input', async () => {
      mockGetProcessingStats.mockResolvedValue({
        total: 0, completed: 0, failed: 0, processing: 0,
        avg_duration_ms: 0, ocr_usage_rate: 0, ai_provider_breakdown: {},
      })

      await request(app).get('/processing-logs/stats').query({ days: 'abc' })

      expect(mockGetProcessingStats).toHaveBeenCalledWith(30)
    })

    it('returns 500 when service throws', async () => {
      mockGetProcessingStats.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/processing-logs/stats')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /processing-logs/:documentId', () => {
    it('returns a specific processing log', async () => {
      mockGetProcessingLog.mockResolvedValue(MOCK_PROCESSING_LOG)

      const res = await request(app).get('/processing-logs/doc-001')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.document_id).toBe('doc-001')
    })

    it('returns 404 when log not found', async () => {
      mockGetProcessingLog.mockResolvedValue(null)

      const res = await request(app).get('/processing-logs/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Processing log not found')
    })

    it('returns 500 when service throws', async () => {
      mockGetProcessingLog.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/processing-logs/doc-001')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /processing-logs/by-policy/:policyId', () => {
    it('returns processing log for a policy', async () => {
      mockGetProcessingLogByPolicyId.mockResolvedValue(MOCK_PROCESSING_LOG)

      const res = await request(app).get('/processing-logs/by-policy/pol-001')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.policy_id).toBe('pol-001')
    })

    it('returns 404 when no log found for policy', async () => {
      mockGetProcessingLogByPolicyId.mockResolvedValue(null)

      const res = await request(app).get('/processing-logs/by-policy/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Processing log not found for this policy')
    })

    it('returns 500 when service throws', async () => {
      mockGetProcessingLogByPolicyId.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/processing-logs/by-policy/pol-001')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /processing-logs/cleanup', () => {
    it('cleans up old logs with default daysOld', async () => {
      mockDeleteOldLogs.mockResolvedValue(15)

      // Must send JSON body (even empty) because Express 5 sets req.body=undefined
      // without a Content-Type: application/json header, causing the handler to throw
      const res = await request(app)
        .post('/processing-logs/cleanup')
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.deletedCount).toBe(15)
      expect(res.body.message).toContain('15')
      expect(res.body.message).toContain('90 days')
      expect(mockDeleteOldLogs).toHaveBeenCalledWith(90)
    })

    it('uses custom daysOld parameter', async () => {
      mockDeleteOldLogs.mockResolvedValue(5)

      const res = await request(app)
        .post('/processing-logs/cleanup')
        .send({ daysOld: '30' })

      expect(mockDeleteOldLogs).toHaveBeenCalledWith(30)
      expect(res.body.deletedCount).toBe(5)
    })

    it('logs the admin action', async () => {
      mockDeleteOldLogs.mockResolvedValue(10)

      await request(app).post('/processing-logs/cleanup').send({})

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'cleanup',
        'processing_logs',
        undefined,
        undefined,
        expect.objectContaining({ daysOld: 90, deletedCount: 10 })
      )
    })

    it('returns 500 when service throws', async () => {
      mockDeleteOldLogs.mockRejectedValue(new Error('DB error'))

      const res = await request(app).post('/processing-logs/cleanup').send({})

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  // ==========================================================================
  // ADMIN NOTIFICATIONS
  // ==========================================================================
  describe('GET /notifications/unacknowledged', () => {
    it('returns unacknowledged notifications', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([MOCK_NOTIFICATION])

      const res = await request(app).get('/notifications/unacknowledged')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.count).toBe(1)
    })

    it('returns empty array when no unacknowledged notifications', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([])

      const res = await request(app).get('/notifications/unacknowledged')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(0)
      expect(res.body.count).toBe(0)
    })

    it('returns 500 when service throws', async () => {
      mockGetUnacknowledgedNotifications.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/notifications/unacknowledged')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /notifications', () => {
    it('returns notifications with default pagination', async () => {
      mockGetNotifications.mockResolvedValue({
        notifications: [MOCK_NOTIFICATION],
        total: 1,
      })

      const res = await request(app).get('/notifications')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.total).toBe(1)
      expect(res.body.limit).toBe(50)
      expect(res.body.offset).toBe(0)
    })

    it('passes pagination and category filter', async () => {
      mockGetNotifications.mockResolvedValue({ notifications: [], total: 0 })

      await request(app)
        .get('/notifications')
        .query({ limit: '10', offset: '5', category: 'billing' })

      expect(mockGetNotifications).toHaveBeenCalledWith({
        limit: 10,
        offset: 5,
        category: 'billing',
      })
    })

    it('returns 500 when service throws', async () => {
      mockGetNotifications.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/notifications')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /notifications/:id/acknowledge', () => {
    it('acknowledges a notification', async () => {
      mockAcknowledgeNotification.mockResolvedValue(true)

      const res = await request(app).post('/notifications/notif-001/acknowledge')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Notification acknowledged')
      expect(mockAcknowledgeNotification).toHaveBeenCalledWith('notif-001', 'admin@test.com')
    })

    it('returns 404 when notification not found', async () => {
      mockAcknowledgeNotification.mockResolvedValue(false)

      const res = await request(app).post('/notifications/nonexistent/acknowledge')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Notification not found')
    })

    it('logs the admin action on success', async () => {
      mockAcknowledgeNotification.mockResolvedValue(true)

      await request(app).post('/notifications/notif-001/acknowledge')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'acknowledge',
        'notification',
        'notif-001'
      )
    })

    it('does not log admin action when notification not found', async () => {
      mockAcknowledgeNotification.mockResolvedValue(false)

      await request(app).post('/notifications/nonexistent/acknowledge')

      expect(mockLogAdminAction).not.toHaveBeenCalled()
    })

    it('returns 500 when service throws', async () => {
      mockAcknowledgeNotification.mockRejectedValue(new Error('DB error'))

      const res = await request(app).post('/notifications/notif-001/acknowledge')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /notifications/acknowledge-all', () => {
    it('acknowledges all notifications', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([
        { ...MOCK_NOTIFICATION, id: 'notif-001' },
        { ...MOCK_NOTIFICATION, id: 'notif-002' },
        { ...MOCK_NOTIFICATION, id: 'notif-003' },
      ])
      mockAcknowledgeNotification.mockResolvedValue(true)

      const res = await request(app).post('/notifications/acknowledge-all')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.acknowledgedCount).toBe(3)
      expect(res.body.message).toContain('3')
    })

    it('handles partial success (some fail to acknowledge)', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([
        { ...MOCK_NOTIFICATION, id: 'notif-001' },
        { ...MOCK_NOTIFICATION, id: 'notif-002' },
      ])
      mockAcknowledgeNotification
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      const res = await request(app).post('/notifications/acknowledge-all')

      expect(res.status).toBe(200)
      expect(res.body.acknowledgedCount).toBe(1)
    })

    it('skips notifications without id', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([
        { ...MOCK_NOTIFICATION, id: undefined },
        { ...MOCK_NOTIFICATION, id: 'notif-002' },
      ])
      mockAcknowledgeNotification.mockResolvedValue(true)

      const res = await request(app).post('/notifications/acknowledge-all')

      expect(res.body.acknowledgedCount).toBe(1)
      expect(mockAcknowledgeNotification).toHaveBeenCalledTimes(1)
    })

    it('logs the admin action', async () => {
      mockGetUnacknowledgedNotifications.mockResolvedValue([
        { ...MOCK_NOTIFICATION, id: 'notif-001' },
      ])
      mockAcknowledgeNotification.mockResolvedValue(true)

      await request(app).post('/notifications/acknowledge-all')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'acknowledge_all',
        'notifications',
        undefined,
        undefined,
        expect.objectContaining({ count: 1 })
      )
    })

    it('returns 500 when fetching notifications throws', async () => {
      mockGetUnacknowledgedNotifications.mockRejectedValue(new Error('DB error'))

      const res = await request(app).post('/notifications/acknowledge-all')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  // ==========================================================================
  // PREMIUM BENCHMARKS
  // ==========================================================================
  describe('GET /benchmarks', () => {
    it('returns all benchmarks', async () => {
      const queryChain = buildQueryChain({ data: [MOCK_BENCHMARK], error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app).get('/benchmarks')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
    })

    it('filters by insurance_type', async () => {
      const queryChain = buildQueryChain({ data: [MOCK_BENCHMARK], error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app).get('/benchmarks').query({ insurance_type: 'kasko' })

      expect(queryChain.eq).toHaveBeenCalledWith('insurance_type', 'kasko')
    })

    it('filters by is_active', async () => {
      const queryChain = buildQueryChain({ data: [], error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app).get('/benchmarks').query({ is_active: 'true' })

      expect(queryChain.eq).toHaveBeenCalledWith('is_active', true)
    })

    it('returns 503 when Supabase not configured', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'DB not configured' })

      const res = await request(app).get('/benchmarks')

      expect(res.status).toBe(503)
      expect(res.body.success).toBe(false)
    })

    it('returns 500 when query errors', async () => {
      const queryChain = buildQueryChain({ data: null, error: new Error('Query failed') })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      // The query chain returns error in the resolved value, no .single()
      // We need to adjust: the GET /benchmarks doesn't use .single(), it awaits the query directly
      // The chain is thenable via .then
      const res = await request(app).get('/benchmarks')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /benchmarks/:id', () => {
    it('returns a specific benchmark', async () => {
      const queryChain = buildQueryChain({ data: MOCK_BENCHMARK, error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app).get('/benchmarks/bench-001')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('bench-001')
    })

    it('returns 404 when benchmark not found', async () => {
      const queryChain = buildQueryChain({ data: null, error: { code: 'PGRST116' } })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app).get('/benchmarks/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('returns 503 when Supabase not configured', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'DB not configured' })

      const res = await request(app).get('/benchmarks/bench-001')

      expect(res.status).toBe(503)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /benchmarks', () => {
    it('creates a new benchmark', async () => {
      const createdBenchmark = { ...MOCK_BENCHMARK, id: 'bench-new' }
      const queryChain = buildQueryChain({ data: createdBenchmark, error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app)
        .post('/benchmarks')
        .send({
          insurance_type: 'kasko',
          insurance_type_tr: 'Kasko',
          min_premium: '1000',
          avg_premium: '3000',
          max_premium: '8000',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 400 when required fields missing', async () => {
      const res = await request(app)
        .post('/benchmarks')
        .send({ insurance_type: 'kasko' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('required')
    })

    it('returns 400 when min_premium is missing', async () => {
      const res = await request(app)
        .post('/benchmarks')
        .send({
          insurance_type: 'kasko',
          insurance_type_tr: 'Kasko',
          avg_premium: '3000',
          max_premium: '8000',
        })

      expect(res.status).toBe(400)
    })

    it('returns 503 when Supabase not configured', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'DB not configured' })

      const res = await request(app)
        .post('/benchmarks')
        .send({
          insurance_type: 'kasko',
          insurance_type_tr: 'Kasko',
          min_premium: '1000',
          avg_premium: '3000',
          max_premium: '8000',
        })

      expect(res.status).toBe(503)
    })

    it('logs the admin action on success', async () => {
      const createdBenchmark = { ...MOCK_BENCHMARK, id: 'bench-new' }
      const queryChain = buildQueryChain({ data: createdBenchmark, error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app)
        .post('/benchmarks')
        .send({
          insurance_type: 'kasko',
          insurance_type_tr: 'Kasko',
          min_premium: '1000',
          avg_premium: '3000',
          max_premium: '8000',
        })

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'create',
        'premium_benchmark',
        'bench-new',
        undefined,
        expect.objectContaining({ insurance_type: 'kasko' })
      )
    })
  })

  describe('PUT /benchmarks/:id', () => {
    it('updates a benchmark', async () => {
      // First call returns existing, second call returns updated
      const selectChain = buildQueryChain({ data: MOCK_BENCHMARK, error: null })
      const updateChain = buildQueryChain({ data: { ...MOCK_BENCHMARK, avg_premium: 4000 }, error: null })

      let callCount = 0
      const mockClient = {
        from: vi.fn(() => {
          callCount++
          // First call: select existing, second call: update
          return callCount <= 1 ? selectChain : updateChain
        }),
      }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app)
        .put('/benchmarks/bench-001')
        .send({ avg_premium: '4000' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 404 when benchmark not found for update', async () => {
      const selectChain = buildQueryChain({ data: null, error: null })
      const mockClient = { from: vi.fn().mockReturnValue(selectChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app)
        .put('/benchmarks/nonexistent')
        .send({ avg_premium: '4000' })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('returns 503 when Supabase not configured', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'DB not configured' })

      const res = await request(app)
        .put('/benchmarks/bench-001')
        .send({ avg_premium: '4000' })

      expect(res.status).toBe(503)
    })
  })

  describe('DELETE /benchmarks/:id', () => {
    it('soft deletes a benchmark', async () => {
      const queryChain = buildQueryChain({ data: null, error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app).delete('/benchmarks/bench-001')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Benchmark deactivated')
    })

    it('logs the admin action on success', async () => {
      const queryChain = buildQueryChain({ data: null, error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app).delete('/benchmarks/bench-001')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'delete',
        'premium_benchmark',
        'bench-001'
      )
    })

    it('returns 503 when Supabase not configured', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'DB not configured' })

      const res = await request(app).delete('/benchmarks/bench-001')

      expect(res.status).toBe(503)
    })

    it('returns 500 when update fails', async () => {
      const _queryChain = buildQueryChain({ data: null, error: new Error('Update failed') })
      // Make the non-.single() path return error
      const chain: Record<string, unknown> = {}
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: new Error('Update failed') })
      const mockClient = { from: vi.fn().mockReturnValue(chain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app).delete('/benchmarks/bench-001')

      expect(res.status).toBe(500)
    })
  })

  // NOTE: GET /benchmarks/insurance-types and PUT /benchmarks/bulk-update are defined
  // AFTER /benchmarks/:id in the source code, so the :id catch-all shadows them.
  // This is a known Express route ordering issue (see Known Issue #97).
  // These tests verify the actual behavior: the :id handler is matched.

  describe('GET /benchmarks/insurance-types (shadowed by :id)', () => {
    it('matches /benchmarks/:id handler with id=insurance-types', async () => {
      // The :id handler is matched, not the insurance-types handler
      const queryChain = buildQueryChain({ data: null, error: { code: 'PGRST116' } })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app).get('/benchmarks/insurance-types')

      // Returns 404 because no benchmark with id "insurance-types" exists
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /benchmarks/bulk-update (shadowed by :id)', () => {
    it('matches /benchmarks/:id handler with id=bulk-update', async () => {
      // The :id update handler is matched, not the bulk-update handler
      const selectChain = buildQueryChain({ data: null, error: null })
      const mockClient = { from: vi.fn().mockReturnValue(selectChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app)
        .put('/benchmarks/bulk-update')
        .send({ year: '2027', multiplier: '1.1' })

      // Returns 404 because no benchmark with id "bulk-update" exists
      expect(res.status).toBe(404)
    })
  })
})
