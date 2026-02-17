/**
 * Admin Monitoring Routes Tests
 *
 * Tests for system metrics, health checks, dashboard summary,
 * endpoint stats, trends, activity, alert rules, and alert management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockLogWarn,
  mockLogError,
  mockLogInfo,
  mockLogDebug,
  // Monitoring mocks
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
  // Admin auth mocks
  mockLogAdminAction,
} = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  // Monitoring
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
  // Admin auth
  mockLogAdminAction: vi.fn().mockResolvedValue(undefined),
}))

// Mock logger
vi.mock('../lib/logger.js', () => {
  const child = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: { ...child, child: vi.fn(() => child) },
    logger: { ...child, child: vi.fn(() => child) },
  }
})

// Mock the shared module that monitoring.ts imports from
vi.mock('../routes/admin/shared.js', () => {
  const loggerChild = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    authenticateAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
    requireSuperAdmin: () => [(_req: unknown, _res: unknown, next: () => void) => next()],
    requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    logAdminAction: mockLogAdminAction,
    getSupabaseWithError: vi.fn().mockReturnValue({ client: null, error: null }),
    qstr: (val: string | string[] | undefined) => {
      if (Array.isArray(val)) return val[0] ?? ''
      return val ?? ''
    },
    logger: {
      ...loggerChild,
      child: vi.fn(() => loggerChild),
    },
    authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    monitoring: {
      getSystemMetrics: mockGetSystemMetrics,
      runHealthChecks: mockRunHealthChecks,
      getDashboardSummary: mockGetDashboardSummary,
      getEndpointStats: mockGetEndpointStats,
      getTrends: mockGetTrends,
      getRecentActivity: mockGetRecentActivity,
      getAlertRules: mockGetAlertRules,
      getAlertRule: mockGetAlertRule,
      createAlertRule: mockCreateAlertRule,
      updateAlertRule: mockUpdateAlertRule,
      deleteAlertRule: mockDeleteAlertRule,
      getActiveAlerts: mockGetActiveAlerts,
      getAlertHistory: mockGetAlertHistory,
      acknowledgeAlert: mockAcknowledgeAlert,
      resolveAlert: mockResolveAlert,
    },
  }
})

// ---------------------------------------------------------------------------
// App Setup
// ---------------------------------------------------------------------------

import monitoringRouter from '../routes/admin/monitoring.js'

function createApp() {
  const app = express()
  app.use(express.json())
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
  app.use('/', monitoringRouter)
  return app
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_METRICS = {
  timestamp: '2026-01-01T00:00:00Z',
  cpu: { usage: 0.45, loadAverage: [0.5, 0.6, 0.7] },
  memory: { used: 512, total: 1024, percentage: 50 },
  requests: { total: 1000, perMinute: 10, perHour: 600 },
  errors: { total: 5, perMinute: 0.1, rate: 0.5 },
  latency: { p50: 50, p95: 200, p99: 500, avg: 75 },
  uptime: 86400,
}

const MOCK_HEALTH = {
  overall: 'healthy' as const,
  timestamp: '2026-01-01T00:00:00Z',
  components: [
    { name: 'database', status: 'healthy' as const, lastCheck: '2026-01-01T00:00:00Z' },
  ],
  uptime: 86400,
}

const MOCK_ALERT_RULE = {
  id: 'rule-001',
  name: 'High Error Rate',
  description: 'Alert when error rate exceeds 5%',
  metric: 'error_rate',
  condition: 'gt' as const,
  threshold: 5,
  severity: 'warning' as const,
  enabled: true,
  cooldownMinutes: 5,
  notificationChannels: ['dashboard'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const MOCK_ALERT = {
  id: 'alert-001',
  ruleId: 'rule-001',
  ruleName: 'High Error Rate',
  metric: 'error_rate',
  value: 7.5,
  threshold: 5,
  severity: 'warning' as const,
  message: 'Error rate is 7.5%, threshold is 5%',
  timestamp: '2026-01-01T00:00:00Z',
  acknowledged: false,
  resolved: false,
}

// ============================================================================
// TESTS
// ============================================================================

describe('Admin Monitoring Routes', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  // ==========================================================================
  // METRICS & HEALTH
  // ==========================================================================

  describe('GET /monitoring/metrics', () => {
    it('returns system metrics', async () => {
      mockGetSystemMetrics.mockReturnValue(MOCK_METRICS)

      const res = await request(app).get('/monitoring/metrics')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.cpu).toBeDefined()
      expect(res.body.data.memory).toBeDefined()
      expect(res.body.data.requests).toBeDefined()
    })

    it('returns 500 when metrics collection throws', async () => {
      mockGetSystemMetrics.mockImplementation(() => { throw new Error('Metrics error') })

      const res = await request(app).get('/monitoring/metrics')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Failed to get metrics')
    })
  })

  describe('GET /monitoring/health', () => {
    it('returns health check results', async () => {
      mockRunHealthChecks.mockResolvedValue(MOCK_HEALTH)

      const res = await request(app).get('/monitoring/health')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.overall).toBe('healthy')
      expect(res.body.data.components).toHaveLength(1)
    })

    it('returns 500 when health checks throw', async () => {
      mockRunHealthChecks.mockRejectedValue(new Error('Health check failed'))

      const res = await request(app).get('/monitoring/health')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /monitoring/dashboard', () => {
    it('returns dashboard summary', async () => {
      const mockSummary = {
        metrics: MOCK_METRICS,
        health: MOCK_HEALTH,
        activeAlerts: [],
        recentActivity: [],
        topEndpoints: [],
        trends: { period: '1h', requests: [], errors: [], latency: [], aiUsage: [] },
      }
      mockGetDashboardSummary.mockResolvedValue(mockSummary)

      const res = await request(app).get('/monitoring/dashboard')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.metrics).toBeDefined()
      expect(res.body.data.health).toBeDefined()
    })

    it('returns 500 when dashboard summary fails', async () => {
      mockGetDashboardSummary.mockRejectedValue(new Error('Summary error'))

      const res = await request(app).get('/monitoring/dashboard')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /monitoring/endpoints', () => {
    it('returns endpoint statistics', async () => {
      const mockStats = [
        { endpoint: '/api/ai/chat', method: 'POST', totalRequests: 100, successCount: 95, errorCount: 5, avgResponseTime: 150, p95ResponseTime: 400, errorRate: 5 },
      ]
      mockGetEndpointStats.mockReturnValue(mockStats)

      const res = await request(app).get('/monitoring/endpoints')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
    })

    it('returns 500 when endpoint stats throws', async () => {
      mockGetEndpointStats.mockImplementation(() => { throw new Error('Stats error') })

      const res = await request(app).get('/monitoring/endpoints')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /monitoring/trends', () => {
    it('returns trends with default parameters', async () => {
      const mockTrends = { period: '60m', requests: [], errors: [], latency: [], aiUsage: [] }
      mockGetTrends.mockReturnValue(mockTrends)

      const res = await request(app).get('/monitoring/trends')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockGetTrends).toHaveBeenCalledWith(60, 5)
    })

    it('passes custom period and interval', async () => {
      mockGetTrends.mockReturnValue({ period: '120m', requests: [], errors: [], latency: [], aiUsage: [] })

      await request(app).get('/monitoring/trends').query({ period: '120', interval: '10' })

      expect(mockGetTrends).toHaveBeenCalledWith(120, 10)
    })

    it('defaults to 60/5 for invalid values', async () => {
      mockGetTrends.mockReturnValue({ period: '60m', requests: [], errors: [], latency: [], aiUsage: [] })

      await request(app).get('/monitoring/trends').query({ period: 'abc', interval: 'xyz' })

      expect(mockGetTrends).toHaveBeenCalledWith(60, 5)
    })

    it('returns 500 when trends throws', async () => {
      mockGetTrends.mockImplementation(() => { throw new Error('Trends error') })

      const res = await request(app).get('/monitoring/trends')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /monitoring/activity', () => {
    it('returns recent activity with default limit', async () => {
      mockGetRecentActivity.mockReturnValue([])

      const res = await request(app).get('/monitoring/activity')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockGetRecentActivity).toHaveBeenCalledWith(50)
    })

    it('passes custom limit', async () => {
      mockGetRecentActivity.mockReturnValue([])

      await request(app).get('/monitoring/activity').query({ limit: '20' })

      expect(mockGetRecentActivity).toHaveBeenCalledWith(20)
    })

    it('returns 500 on error', async () => {
      mockGetRecentActivity.mockImplementation(() => { throw new Error('Activity error') })

      const res = await request(app).get('/monitoring/activity')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  // ==========================================================================
  // ALERT RULES
  // ==========================================================================

  describe('GET /monitoring/alert-rules', () => {
    it('returns all alert rules', async () => {
      mockGetAlertRules.mockReturnValue([MOCK_ALERT_RULE])

      const res = await request(app).get('/monitoring/alert-rules')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
    })

    it('returns 500 on error', async () => {
      mockGetAlertRules.mockImplementation(() => { throw new Error('Rules error') })

      const res = await request(app).get('/monitoring/alert-rules')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('GET /monitoring/alert-rules/:id', () => {
    it('returns a specific alert rule', async () => {
      mockGetAlertRule.mockReturnValue(MOCK_ALERT_RULE)

      const res = await request(app).get('/monitoring/alert-rules/rule-001')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('rule-001')
    })

    it('returns 404 when rule not found', async () => {
      mockGetAlertRule.mockReturnValue(undefined)

      const res = await request(app).get('/monitoring/alert-rules/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Alert rule not found')
    })

    it('returns 500 on error', async () => {
      mockGetAlertRule.mockImplementation(() => { throw new Error('Rule error') })

      const res = await request(app).get('/monitoring/alert-rules/rule-001')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('POST /monitoring/alert-rules', () => {
    it('creates an alert rule', async () => {
      mockCreateAlertRule.mockReturnValue(MOCK_ALERT_RULE)

      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({
          name: 'High Error Rate',
          metric: 'error_rate',
          condition: 'gt',
          threshold: 5,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('rule-001')
    })

    it('passes optional fields with defaults', async () => {
      mockCreateAlertRule.mockReturnValue(MOCK_ALERT_RULE)

      await request(app)
        .post('/monitoring/alert-rules')
        .send({
          name: 'Test Rule',
          metric: 'cpu_usage',
          condition: 'gt',
          threshold: 90,
        })

      expect(mockCreateAlertRule).toHaveBeenCalledWith({
        name: 'Test Rule',
        description: '',
        metric: 'cpu_usage',
        condition: 'gt',
        threshold: 90,
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 5,
        notificationChannels: ['dashboard'],
      })
    })

    it('passes custom optional fields', async () => {
      mockCreateAlertRule.mockReturnValue(MOCK_ALERT_RULE)

      await request(app)
        .post('/monitoring/alert-rules')
        .send({
          name: 'Custom Rule',
          description: 'A custom rule',
          metric: 'cpu_usage',
          condition: 'gte',
          threshold: 80,
          severity: 'critical',
          enabled: false,
          cooldownMinutes: 15,
          notificationChannels: ['dashboard', 'email'],
        })

      expect(mockCreateAlertRule).toHaveBeenCalledWith({
        name: 'Custom Rule',
        description: 'A custom rule',
        metric: 'cpu_usage',
        condition: 'gte',
        threshold: 80,
        severity: 'critical',
        enabled: false,
        cooldownMinutes: 15,
        notificationChannels: ['dashboard', 'email'],
      })
    })

    it('returns 400 when required fields missing', async () => {
      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({ name: 'Missing Fields' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('required')
    })

    it('returns 400 when threshold is missing', async () => {
      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({ name: 'No Threshold', metric: 'cpu', condition: 'gt' })

      expect(res.status).toBe(400)
    })

    it('logs admin action', async () => {
      mockCreateAlertRule.mockReturnValue(MOCK_ALERT_RULE)

      await request(app)
        .post('/monitoring/alert-rules')
        .send({
          name: 'High Error Rate',
          metric: 'error_rate',
          condition: 'gt',
          threshold: 5,
        })

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'create',
        'alert_rule',
        'rule-001',
        undefined,
        expect.objectContaining({ name: 'High Error Rate' })
      )
    })

    it('returns 500 on error', async () => {
      mockCreateAlertRule.mockImplementation(() => { throw new Error('Create error') })

      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({
          name: 'Failing Rule',
          metric: 'error_rate',
          condition: 'gt',
          threshold: 5,
        })

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('PUT /monitoring/alert-rules/:id', () => {
    it('updates an alert rule', async () => {
      const updatedRule = { ...MOCK_ALERT_RULE, threshold: 10 }
      mockUpdateAlertRule.mockReturnValue(updatedRule)

      const res = await request(app)
        .put('/monitoring/alert-rules/rule-001')
        .send({ threshold: 10 })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.threshold).toBe(10)
    })

    it('returns 404 when rule not found', async () => {
      mockUpdateAlertRule.mockReturnValue(null)

      const res = await request(app)
        .put('/monitoring/alert-rules/nonexistent')
        .send({ threshold: 10 })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('logs admin action on success', async () => {
      mockUpdateAlertRule.mockReturnValue(MOCK_ALERT_RULE)

      await request(app)
        .put('/monitoring/alert-rules/rule-001')
        .send({ threshold: 10 })

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'update',
        'alert_rule',
        'rule-001',
        undefined,
        { threshold: 10 }
      )
    })

    it('returns 500 on error', async () => {
      mockUpdateAlertRule.mockImplementation(() => { throw new Error('Update error') })

      const res = await request(app)
        .put('/monitoring/alert-rules/rule-001')
        .send({ threshold: 10 })

      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /monitoring/alert-rules/:id', () => {
    it('deletes an alert rule', async () => {
      mockDeleteAlertRule.mockReturnValue(true)

      const res = await request(app).delete('/monitoring/alert-rules/rule-001')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Alert rule deleted')
    })

    it('returns 404 when rule not found', async () => {
      mockDeleteAlertRule.mockReturnValue(false)

      const res = await request(app).delete('/monitoring/alert-rules/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('logs admin action', async () => {
      mockDeleteAlertRule.mockReturnValue(true)

      await request(app).delete('/monitoring/alert-rules/rule-001')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'delete',
        'alert_rule',
        'rule-001'
      )
    })

    it('returns 500 on error', async () => {
      mockDeleteAlertRule.mockImplementation(() => { throw new Error('Delete error') })

      const res = await request(app).delete('/monitoring/alert-rules/rule-001')

      expect(res.status).toBe(500)
    })
  })

  // ==========================================================================
  // ALERTS
  // ==========================================================================

  describe('GET /monitoring/alerts', () => {
    it('returns active alerts', async () => {
      mockGetActiveAlerts.mockReturnValue([MOCK_ALERT])

      const res = await request(app).get('/monitoring/alerts')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
    })

    it('returns empty array when no active alerts', async () => {
      mockGetActiveAlerts.mockReturnValue([])

      const res = await request(app).get('/monitoring/alerts')

      expect(res.body.data).toHaveLength(0)
    })

    it('returns 500 on error', async () => {
      mockGetActiveAlerts.mockImplementation(() => { throw new Error('Alerts error') })

      const res = await request(app).get('/monitoring/alerts')

      expect(res.status).toBe(500)
    })
  })

  describe('GET /monitoring/alerts/history', () => {
    it('returns alert history with default limit', async () => {
      mockGetAlertHistory.mockReturnValue([MOCK_ALERT])

      const res = await request(app).get('/monitoring/alerts/history')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockGetAlertHistory).toHaveBeenCalledWith(100)
    })

    it('passes custom limit', async () => {
      mockGetAlertHistory.mockReturnValue([])

      await request(app).get('/monitoring/alerts/history').query({ limit: '25' })

      expect(mockGetAlertHistory).toHaveBeenCalledWith(25)
    })

    it('returns 500 on error', async () => {
      mockGetAlertHistory.mockImplementation(() => { throw new Error('History error') })

      const res = await request(app).get('/monitoring/alerts/history')

      expect(res.status).toBe(500)
    })
  })

  describe('POST /monitoring/alerts/:id/acknowledge', () => {
    it('acknowledges an alert', async () => {
      const acknowledgedAlert = { ...MOCK_ALERT, acknowledged: true, acknowledgedBy: 'admin@test.com' }
      mockAcknowledgeAlert.mockReturnValue(acknowledgedAlert)

      const res = await request(app).post('/monitoring/alerts/alert-001/acknowledge')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.acknowledged).toBe(true)
    })

    it('passes admin email to acknowledgeAlert', async () => {
      mockAcknowledgeAlert.mockReturnValue({ ...MOCK_ALERT, acknowledged: true })

      await request(app).post('/monitoring/alerts/alert-001/acknowledge')

      expect(mockAcknowledgeAlert).toHaveBeenCalledWith('alert-001', 'admin@test.com')
    })

    it('returns 404 when alert not found', async () => {
      mockAcknowledgeAlert.mockReturnValue(null)

      const res = await request(app).post('/monitoring/alerts/nonexistent/acknowledge')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('logs admin action', async () => {
      mockAcknowledgeAlert.mockReturnValue({ ...MOCK_ALERT, acknowledged: true })

      await request(app).post('/monitoring/alerts/alert-001/acknowledge')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'acknowledge',
        'monitoring_alert',
        'alert-001'
      )
    })

    it('returns 500 on error', async () => {
      mockAcknowledgeAlert.mockImplementation(() => { throw new Error('Ack error') })

      const res = await request(app).post('/monitoring/alerts/alert-001/acknowledge')

      expect(res.status).toBe(500)
    })
  })

  describe('POST /monitoring/alerts/:id/resolve', () => {
    it('resolves an alert', async () => {
      const resolvedAlert = { ...MOCK_ALERT, resolved: true }
      mockResolveAlert.mockReturnValue(resolvedAlert)

      const res = await request(app).post('/monitoring/alerts/alert-001/resolve')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.resolved).toBe(true)
    })

    it('returns 404 when alert not found', async () => {
      mockResolveAlert.mockReturnValue(null)

      const res = await request(app).post('/monitoring/alerts/nonexistent/resolve')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('logs admin action', async () => {
      mockResolveAlert.mockReturnValue({ ...MOCK_ALERT, resolved: true })

      await request(app).post('/monitoring/alerts/alert-001/resolve')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'resolve',
        'monitoring_alert',
        'alert-001'
      )
    })

    it('returns 500 on error', async () => {
      mockResolveAlert.mockImplementation(() => { throw new Error('Resolve error') })

      const res = await request(app).post('/monitoring/alerts/alert-001/resolve')

      expect(res.status).toBe(500)
    })
  })
})
