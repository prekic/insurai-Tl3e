/**
 * Admin Monitoring Route Coverage Tests
 *
 * Targets uncovered branches in server/routes/admin/monitoring.ts:
 * - All success and error paths for each endpoint
 * - Query parameter parsing (period, interval, limit)
 * - Alert CRUD: create/update/delete with validation
 * - Alert acknowledge/resolve with not-found checks
 * - Error instance vs non-Error instance in catch blocks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================
const {
  mockGetSystemMetrics,
  mockRunHealthChecks,
  mockGetDashboardSummary,
  mockGetEndpointStats,
  mockGetTrends,
  mockGetRecentActivity,
  mockGetAlertRules,
  mockGetAlertRule,
  mockCreateAlertRule,
  mockUpdateAlertRule,
  mockDeleteAlertRule,
  mockGetActiveAlerts,
  mockGetAlertHistory,
  mockAcknowledgeAlert,
  mockResolveAlert,
  mockAuthenticateAdmin,
  mockLogAdminAction,
} = vi.hoisted(() => ({
  mockGetSystemMetrics: vi.fn(),
  mockRunHealthChecks: vi.fn(),
  mockGetDashboardSummary: vi.fn(),
  mockGetEndpointStats: vi.fn(),
  mockGetTrends: vi.fn(),
  mockGetRecentActivity: vi.fn(),
  mockGetAlertRules: vi.fn(),
  mockGetAlertRule: vi.fn(),
  mockCreateAlertRule: vi.fn(),
  mockUpdateAlertRule: vi.fn(),
  mockDeleteAlertRule: vi.fn(),
  mockGetActiveAlerts: vi.fn(),
  mockGetAlertHistory: vi.fn(),
  mockAcknowledgeAlert: vi.fn(),
  mockResolveAlert: vi.fn(),
  mockAuthenticateAdmin: vi.fn(),
  mockLogAdminAction: vi.fn(),
}))

vi.mock('../routes/admin/shared.js', () => ({
  authenticateAdmin: (...args: unknown[]) => mockAuthenticateAdmin(...args),
  requireSuperAdmin: () => [
    (req: any, _res: any, next: () => void) => {
      mockAuthenticateAdmin(req, _res, next)
    },
  ],
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
  monitoring: {
    getSystemMetrics: (...args: unknown[]) => mockGetSystemMetrics(...args),
    runHealthChecks: (...args: unknown[]) => mockRunHealthChecks(...args),
    getDashboardSummary: (...args: unknown[]) => mockGetDashboardSummary(...args),
    getEndpointStats: (...args: unknown[]) => mockGetEndpointStats(...args),
    getTrends: (...args: unknown[]) => mockGetTrends(...args),
    getRecentActivity: (...args: unknown[]) => mockGetRecentActivity(...args),
    getAlertRules: (...args: unknown[]) => mockGetAlertRules(...args),
    getAlertRule: (...args: unknown[]) => mockGetAlertRule(...args),
    createAlertRule: (...args: unknown[]) => mockCreateAlertRule(...args),
    updateAlertRule: (...args: unknown[]) => mockUpdateAlertRule(...args),
    deleteAlertRule: (...args: unknown[]) => mockDeleteAlertRule(...args),
    getActiveAlerts: (...args: unknown[]) => mockGetActiveAlerts(...args),
    getAlertHistory: (...args: unknown[]) => mockGetAlertHistory(...args),
    acknowledgeAlert: (...args: unknown[]) => mockAcknowledgeAlert(...args),
    resolveAlert: (...args: unknown[]) => mockResolveAlert(...args),
  },
  qstr: (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? ''),
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  return {
    logger: { child: () => ({ debug: noop, info: noop, warn: noop, error: noop }) },
    default: { child: () => ({ debug: noop, info: noop, warn: noop, error: noop }) },
  }
})

// =============================================================================
// HELPERS
// =============================================================================
function setupDefaultMocks() {
  mockAuthenticateAdmin.mockImplementation((req: any, _res: any, next: () => void) => {
    req.adminUser = { id: 'admin-001', email: 'admin@test.com', role: 'super_admin', permissions: [] }
    req.adminSession = { id: 'sess-001', tokenHash: 'hash' }
    next()
  })
  mockGetSystemMetrics.mockReturnValue({ cpu: 0.5, memory: 0.7 })
  mockRunHealthChecks.mockResolvedValue({ status: 'healthy' })
  mockGetDashboardSummary.mockResolvedValue({ users: 10, requests: 100 })
  mockGetEndpointStats.mockReturnValue([{ path: '/api/health', count: 50 }])
  mockGetTrends.mockReturnValue({ data: [] })
  mockGetRecentActivity.mockReturnValue([])
  mockGetAlertRules.mockReturnValue([])
  mockGetAlertRule.mockReturnValue(null)
  mockCreateAlertRule.mockReturnValue({ id: 'rule-001', name: 'Test Rule' })
  mockUpdateAlertRule.mockReturnValue(null)
  mockDeleteAlertRule.mockReturnValue(false)
  mockGetActiveAlerts.mockReturnValue([])
  mockGetAlertHistory.mockReturnValue([])
  mockAcknowledgeAlert.mockReturnValue(null)
  mockResolveAlert.mockReturnValue(null)
  mockLogAdminAction.mockResolvedValue(undefined)
}

async function createApp() {
  const mod = await import('../routes/admin/monitoring.js')
  const app = express()
  app.use(express.json())
  app.use('/api/admin', mod.default)
  return app
}

// =============================================================================
// TESTS
// =============================================================================
describe('Admin Monitoring Routes', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    setupDefaultMocks()
    app = await createApp()
  })

  // =========================================================================
  // GET /monitoring/metrics
  // =========================================================================
  describe('GET /monitoring/metrics', () => {
    it('returns system metrics', async () => {
      const res = await request(app).get('/api/admin/monitoring/metrics')
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ cpu: 0.5, memory: 0.7 })
    })

    it('returns 500 on error', async () => {
      mockGetSystemMetrics.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).get('/api/admin/monitoring/metrics')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to get metrics')
    })

    it('handles non-Error thrown', async () => {
      mockGetSystemMetrics.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/monitoring/metrics')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // GET /monitoring/health
  // =========================================================================
  describe('GET /monitoring/health', () => {
    it('returns health checks', async () => {
      const res = await request(app).get('/api/admin/monitoring/health')
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('healthy')
    })

    it('returns 500 on error', async () => {
      mockRunHealthChecks.mockRejectedValue(new Error('Check failed'))
      const res = await request(app).get('/api/admin/monitoring/health')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // GET /monitoring/dashboard
  // =========================================================================
  describe('GET /monitoring/dashboard', () => {
    it('returns dashboard summary', async () => {
      const res = await request(app).get('/api/admin/monitoring/dashboard')
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ users: 10, requests: 100 })
    })

    it('returns 500 on error', async () => {
      mockGetDashboardSummary.mockRejectedValue(new Error('Failed'))
      const res = await request(app).get('/api/admin/monitoring/dashboard')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // GET /monitoring/endpoints
  // =========================================================================
  describe('GET /monitoring/endpoints', () => {
    it('returns endpoint stats', async () => {
      const res = await request(app).get('/api/admin/monitoring/endpoints')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
    })

    it('returns 500 on error', async () => {
      mockGetEndpointStats.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).get('/api/admin/monitoring/endpoints')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // GET /monitoring/trends
  // =========================================================================
  describe('GET /monitoring/trends', () => {
    it('returns trends with default params', async () => {
      const res = await request(app).get('/api/admin/monitoring/trends')
      expect(res.status).toBe(200)
      expect(mockGetTrends).toHaveBeenCalledWith(60, 5)
    })

    it('parses custom period and interval', async () => {
      const res = await request(app).get('/api/admin/monitoring/trends?period=120&interval=10')
      expect(res.status).toBe(200)
      expect(mockGetTrends).toHaveBeenCalledWith(120, 10)
    })

    it('falls back to defaults for invalid params', async () => {
      const res = await request(app).get('/api/admin/monitoring/trends?period=abc&interval=xyz')
      expect(res.status).toBe(200)
      expect(mockGetTrends).toHaveBeenCalledWith(60, 5) // NaN || 60 and NaN || 5
    })

    it('returns 500 on error', async () => {
      mockGetTrends.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).get('/api/admin/monitoring/trends')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // GET /monitoring/activity
  // =========================================================================
  describe('GET /monitoring/activity', () => {
    it('returns activity with default limit', async () => {
      const res = await request(app).get('/api/admin/monitoring/activity')
      expect(res.status).toBe(200)
      expect(mockGetRecentActivity).toHaveBeenCalledWith(50)
    })

    it('parses custom limit', async () => {
      const res = await request(app).get('/api/admin/monitoring/activity?limit=10')
      expect(res.status).toBe(200)
      expect(mockGetRecentActivity).toHaveBeenCalledWith(10)
    })

    it('returns 500 on error', async () => {
      mockGetRecentActivity.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).get('/api/admin/monitoring/activity')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // ALERT RULES CRUD
  // =========================================================================
  describe('GET /monitoring/alert-rules', () => {
    it('returns alert rules', async () => {
      mockGetAlertRules.mockReturnValue([{ id: 'r1', name: 'Rule 1' }])
      const res = await request(app).get('/api/admin/monitoring/alert-rules')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
    })

    it('returns 500 on error', async () => {
      mockGetAlertRules.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).get('/api/admin/monitoring/alert-rules')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /monitoring/alert-rules/:id', () => {
    it('returns 404 when rule not found', async () => {
      mockGetAlertRule.mockReturnValue(null)
      const res = await request(app).get('/api/admin/monitoring/alert-rules/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Alert rule not found')
    })

    it('returns rule when found', async () => {
      mockGetAlertRule.mockReturnValue({ id: 'r1', name: 'Rule 1' })
      const res = await request(app).get('/api/admin/monitoring/alert-rules/r1')
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('Rule 1')
    })

    it('returns 500 on error', async () => {
      mockGetAlertRule.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).get('/api/admin/monitoring/alert-rules/r1')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /monitoring/alert-rules', () => {
    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({ metric: 'cpu', condition: 'gt', threshold: 90 })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('name')
    })

    it('returns 400 when metric is missing', async () => {
      const res = await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({ name: 'Test', condition: 'gt', threshold: 90 })
      expect(res.status).toBe(400)
    })

    it('returns 400 when condition is missing', async () => {
      const res = await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({ name: 'Test', metric: 'cpu', threshold: 90 })
      expect(res.status).toBe(400)
    })

    it('returns 400 when threshold is undefined', async () => {
      const res = await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({ name: 'Test', metric: 'cpu', condition: 'gt' })
      expect(res.status).toBe(400)
    })

    it('creates rule with defaults for optional fields', async () => {
      const res = await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({ name: 'Test', metric: 'cpu', condition: 'gt', threshold: 90 })
      expect(res.status).toBe(200)
      expect(mockCreateAlertRule).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test',
        description: '',
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 5,
        notificationChannels: ['dashboard'],
      }))
    })

    it('creates rule with custom optional fields', async () => {
      const res = await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({
          name: 'Test',
          metric: 'cpu',
          condition: 'gt',
          threshold: 90,
          description: 'CPU high',
          severity: 'critical',
          enabled: false,
          cooldownMinutes: 15,
          notificationChannels: ['email', 'slack'],
        })
      expect(res.status).toBe(200)
      expect(mockCreateAlertRule).toHaveBeenCalledWith(expect.objectContaining({
        description: 'CPU high',
        severity: 'critical',
        enabled: false,
        cooldownMinutes: 15,
        notificationChannels: ['email', 'slack'],
      }))
    })

    it('logs create action', async () => {
      await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({ name: 'Test', metric: 'cpu', condition: 'gt', threshold: 90 })
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'create', 'alert_rule', 'rule-001', undefined,
        expect.objectContaining({ name: 'Test', metric: 'cpu' })
      )
    })

    it('returns 500 on error', async () => {
      mockCreateAlertRule.mockImplementation(() => { throw new Error('Create failed') })
      const res = await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({ name: 'Test', metric: 'cpu', condition: 'gt', threshold: 90 })
      expect(res.status).toBe(500)
    })
  })

  describe('PUT /monitoring/alert-rules/:id', () => {
    it('returns 404 when rule not found', async () => {
      mockUpdateAlertRule.mockReturnValue(null)
      const res = await request(app)
        .put('/api/admin/monitoring/alert-rules/nonexistent')
        .send({ name: 'Updated' })
      expect(res.status).toBe(404)
    })

    it('updates rule successfully', async () => {
      mockUpdateAlertRule.mockReturnValue({ id: 'r1', name: 'Updated' })
      const res = await request(app)
        .put('/api/admin/monitoring/alert-rules/r1')
        .send({ name: 'Updated' })
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('Updated')
    })

    it('logs update action', async () => {
      mockUpdateAlertRule.mockReturnValue({ id: 'r1', name: 'Updated' })
      await request(app)
        .put('/api/admin/monitoring/alert-rules/r1')
        .send({ name: 'Updated' })
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'update', 'alert_rule', 'r1', undefined,
        expect.objectContaining({ name: 'Updated' })
      )
    })

    it('returns 500 on error', async () => {
      mockUpdateAlertRule.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app)
        .put('/api/admin/monitoring/alert-rules/r1')
        .send({ name: 'Updated' })
      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /monitoring/alert-rules/:id', () => {
    it('returns 404 when rule not found', async () => {
      mockDeleteAlertRule.mockReturnValue(false)
      const res = await request(app).delete('/api/admin/monitoring/alert-rules/nonexistent')
      expect(res.status).toBe(404)
    })

    it('deletes rule successfully', async () => {
      mockDeleteAlertRule.mockReturnValue(true)
      const res = await request(app).delete('/api/admin/monitoring/alert-rules/r1')
      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Alert rule deleted')
    })

    it('logs delete action', async () => {
      mockDeleteAlertRule.mockReturnValue(true)
      await request(app).delete('/api/admin/monitoring/alert-rules/r1')
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'delete', 'alert_rule', 'r1'
      )
    })

    it('returns 500 on error', async () => {
      mockDeleteAlertRule.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).delete('/api/admin/monitoring/alert-rules/r1')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // ALERTS
  // =========================================================================
  describe('GET /monitoring/alerts', () => {
    it('returns active alerts', async () => {
      mockGetActiveAlerts.mockReturnValue([{ id: 'a1', status: 'active' }])
      const res = await request(app).get('/api/admin/monitoring/alerts')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
    })

    it('returns 500 on error', async () => {
      mockGetActiveAlerts.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).get('/api/admin/monitoring/alerts')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /monitoring/alerts/history', () => {
    it('returns alert history with default limit', async () => {
      const res = await request(app).get('/api/admin/monitoring/alerts/history')
      expect(res.status).toBe(200)
      expect(mockGetAlertHistory).toHaveBeenCalledWith(100)
    })

    it('parses custom limit', async () => {
      const res = await request(app).get('/api/admin/monitoring/alerts/history?limit=25')
      expect(res.status).toBe(200)
      expect(mockGetAlertHistory).toHaveBeenCalledWith(25)
    })

    it('returns 500 on error', async () => {
      mockGetAlertHistory.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).get('/api/admin/monitoring/alerts/history')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /monitoring/alerts/:id/acknowledge', () => {
    it('returns 404 when alert not found', async () => {
      mockAcknowledgeAlert.mockReturnValue(null)
      const res = await request(app).post('/api/admin/monitoring/alerts/nonexistent/acknowledge')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Alert not found')
    })

    it('acknowledges alert successfully', async () => {
      mockAcknowledgeAlert.mockReturnValue({ id: 'a1', status: 'acknowledged' })
      const res = await request(app).post('/api/admin/monitoring/alerts/a1/acknowledge')
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('acknowledged')
    })

    it('passes admin email to acknowledgeAlert', async () => {
      mockAcknowledgeAlert.mockReturnValue({ id: 'a1' })
      await request(app).post('/api/admin/monitoring/alerts/a1/acknowledge')
      expect(mockAcknowledgeAlert).toHaveBeenCalledWith('a1', 'admin@test.com')
    })

    it('uses "unknown" when no adminUser email', async () => {
      mockAuthenticateAdmin.mockImplementation((req: any, _res: any, next: () => void) => {
        req.adminUser = undefined
        next()
      })
      app = await createApp()
      mockAcknowledgeAlert.mockReturnValue({ id: 'a1' })
      await request(app).post('/api/admin/monitoring/alerts/a1/acknowledge')
      expect(mockAcknowledgeAlert).toHaveBeenCalledWith('a1', 'unknown')
    })

    it('logs acknowledge action', async () => {
      mockAcknowledgeAlert.mockReturnValue({ id: 'a1' })
      await request(app).post('/api/admin/monitoring/alerts/a1/acknowledge')
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'acknowledge', 'monitoring_alert', 'a1'
      )
    })

    it('returns 500 on error', async () => {
      mockAcknowledgeAlert.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).post('/api/admin/monitoring/alerts/a1/acknowledge')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /monitoring/alerts/:id/resolve', () => {
    it('returns 404 when alert not found', async () => {
      mockResolveAlert.mockReturnValue(null)
      const res = await request(app).post('/api/admin/monitoring/alerts/nonexistent/resolve')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Alert not found')
    })

    it('resolves alert successfully', async () => {
      mockResolveAlert.mockReturnValue({ id: 'a1', status: 'resolved' })
      const res = await request(app).post('/api/admin/monitoring/alerts/a1/resolve')
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('resolved')
    })

    it('logs resolve action', async () => {
      mockResolveAlert.mockReturnValue({ id: 'a1' })
      await request(app).post('/api/admin/monitoring/alerts/a1/resolve')
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'resolve', 'monitoring_alert', 'a1'
      )
    })

    it('returns 500 on error', async () => {
      mockResolveAlert.mockImplementation(() => { throw new Error('Failed') })
      const res = await request(app).post('/api/admin/monitoring/alerts/a1/resolve')
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // NON-ERROR THROWN (covers String(error) branches in all catch blocks)
  // =========================================================================
  describe('non-Error thrown in catch blocks (String(error) branch)', () => {
    it('health: handles string thrown', async () => {
      mockRunHealthChecks.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/monitoring/health')
      expect(res.status).toBe(500)
    })

    it('dashboard: handles string thrown', async () => {
      mockGetDashboardSummary.mockRejectedValue('string error')
      const res = await request(app).get('/api/admin/monitoring/dashboard')
      expect(res.status).toBe(500)
    })

    it('endpoints: handles string thrown', async () => {
      mockGetEndpointStats.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/monitoring/endpoints')
      expect(res.status).toBe(500)
    })

    it('trends: handles string thrown', async () => {
      mockGetTrends.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/monitoring/trends')
      expect(res.status).toBe(500)
    })

    it('activity: handles string thrown', async () => {
      mockGetRecentActivity.mockImplementation(() => { throw 42 })
      const res = await request(app).get('/api/admin/monitoring/activity')
      expect(res.status).toBe(500)
    })

    it('alert-rules list: handles string thrown', async () => {
      mockGetAlertRules.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/monitoring/alert-rules')
      expect(res.status).toBe(500)
    })

    it('alert-rules get: handles string thrown', async () => {
      mockGetAlertRule.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/monitoring/alert-rules/r1')
      expect(res.status).toBe(500)
    })

    it('alert-rules create: handles string thrown', async () => {
      mockCreateAlertRule.mockImplementation(() => { throw 'string error' })
      const res = await request(app)
        .post('/api/admin/monitoring/alert-rules')
        .send({ name: 'Test', metric: 'cpu', condition: 'gt', threshold: 90 })
      expect(res.status).toBe(500)
    })

    it('alert-rules update: handles string thrown', async () => {
      mockUpdateAlertRule.mockImplementation(() => { throw 'string error' })
      const res = await request(app)
        .put('/api/admin/monitoring/alert-rules/r1')
        .send({ name: 'Updated' })
      expect(res.status).toBe(500)
    })

    it('alert-rules delete: handles string thrown', async () => {
      mockDeleteAlertRule.mockImplementation(() => { throw 'string error' })
      const res = await request(app).delete('/api/admin/monitoring/alert-rules/r1')
      expect(res.status).toBe(500)
    })

    it('alerts list: handles string thrown', async () => {
      mockGetActiveAlerts.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/monitoring/alerts')
      expect(res.status).toBe(500)
    })

    it('alerts history: handles string thrown', async () => {
      mockGetAlertHistory.mockImplementation(() => { throw 'string error' })
      const res = await request(app).get('/api/admin/monitoring/alerts/history')
      expect(res.status).toBe(500)
    })

    it('alerts acknowledge: handles string thrown', async () => {
      mockAcknowledgeAlert.mockImplementation(() => { throw 'string error' })
      const res = await request(app).post('/api/admin/monitoring/alerts/a1/acknowledge')
      expect(res.status).toBe(500)
    })

    it('alerts resolve: handles string thrown', async () => {
      mockResolveAlert.mockImplementation(() => { throw 'string error' })
      const res = await request(app).post('/api/admin/monitoring/alerts/a1/resolve')
      expect(res.status).toBe(500)
    })
  })
})
