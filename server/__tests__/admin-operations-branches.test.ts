/**
 * Admin Operations, Content, and Monitoring Route Branch Coverage Tests
 *
 * Targets uncovered branches in:
 * - server/routes/admin/operations.ts (40.85% branches)
 * - server/routes/admin/content.ts (57.29% branches)
 * - server/routes/admin/monitoring.ts (6.01% branches)
 *
 * Focuses on conditional branches, error handling, edge cases, and
 * filter/query parameter permutations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS — everything inside vi.hoisted() to avoid TDZ errors
// =============================================================================

const {
  mockLogWarn,
  mockLogError,
  mockLogInfo,
  mockLogDebug,
  mockListProcessingLogs,
  mockGetProcessingStats,
  mockGetProcessingLog,
  mockGetProcessingLogByPolicyId,
  mockDeleteOldLogs,
  mockGetUnacknowledgedNotifications,
  mockGetNotifications,
  mockAcknowledgeNotification,
  _mockLogAdminAction,
  mockGetSupabaseWithError,
  _mockGetSystemMetrics,
  _mockRunHealthChecks,
  _mockGetDashboardSummary,
  _mockGetEndpointStats,
  mockGetTrends,
  mockGetRecentActivity,
  _mockGetAlertRules,
  _mockGetAlertRule,
  mockCreateAlertRule,
  _mockUpdateAlertRule,
  _mockDeleteAlertRule,
  _mockGetActiveAlerts,
  mockGetAlertHistory,
  mockAcknowledgeAlert,
  _mockResolveAlert,
  sharedState,
} = vi.hoisted(() => {
  const mockLogWarn = vi.fn()
  const mockLogError = vi.fn()
  const mockLogInfo = vi.fn()
  const mockLogDebug = vi.fn()
  const mockListProcessingLogs = vi.fn()
  const mockGetProcessingStats = vi.fn()
  const mockGetProcessingLog = vi.fn()
  const mockGetProcessingLogByPolicyId = vi.fn()
  const mockDeleteOldLogs = vi.fn()
  const mockGetUnacknowledgedNotifications = vi.fn()
  const mockGetNotifications = vi.fn()
  const mockAcknowledgeNotification = vi.fn()
  const _mockLogAdminAction = vi.fn().mockResolvedValue(undefined)
  const mockGetSupabaseWithError = vi.fn()
  const _mockGetSystemMetrics = vi.fn()
  const _mockRunHealthChecks = vi.fn()
  const _mockGetDashboardSummary = vi.fn()
  const _mockGetEndpointStats = vi.fn()
  const mockGetTrends = vi.fn()
  const mockGetRecentActivity = vi.fn()
  const _mockGetAlertRules = vi.fn()
  const _mockGetAlertRule = vi.fn()
  const mockCreateAlertRule = vi.fn()
  const _mockUpdateAlertRule = vi.fn()
  const _mockDeleteAlertRule = vi.fn()
  const _mockGetActiveAlerts = vi.fn()
  const mockGetAlertHistory = vi.fn()
  const mockAcknowledgeAlert = vi.fn()
  const _mockResolveAlert = vi.fn()

  const loggerChild = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }

  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next()

  const sharedState = {
    authenticateAdmin: passthrough,
    requireSuperAdmin: (...args: unknown[]) => {
      if (args.length >= 3 && typeof args[2] === 'function') {
        ;(args[2] as () => void)()
        return
      }
      return [passthrough]
    },
    requireRole: () => passthrough,
    logAdminAction: _mockLogAdminAction,
    getSupabaseWithError: mockGetSupabaseWithError,
    qstr: (val: string | string[] | undefined) => {
      if (Array.isArray(val)) return val[0] ?? ''
      return val ?? ''
    },
    getClientIp: () => '127.0.0.1',
    logger: {
      ...loggerChild,
      child: vi.fn(() => loggerChild),
    },
    authLimiter: passthrough,
    aiRequests: [] as unknown[],
    policyOperations: [] as unknown[],
    securityLogs: [] as unknown[],
    auditLogs: [] as unknown[],
    blockedIPs: new Map<string, { reason: string; blockedAt: string; expiresAt?: string }>(),
    requestCounters: { aiRequestId: 0, policyOpId: 0, securityLogId: 0, auditLogId: 0 },
    MAX_ENTRIES: 10,
    serverStartTime: Date.now() - 60000,
    monitoring: {
      getSystemMetrics: _mockGetSystemMetrics,
      runHealthChecks: _mockRunHealthChecks,
      getDashboardSummary: _mockGetDashboardSummary,
      getEndpointStats: _mockGetEndpointStats,
      getTrends: mockGetTrends,
      getRecentActivity: mockGetRecentActivity,
      getAlertRules: _mockGetAlertRules,
      getAlertRule: _mockGetAlertRule,
      createAlertRule: mockCreateAlertRule,
      updateAlertRule: _mockUpdateAlertRule,
      deleteAlertRule: _mockDeleteAlertRule,
      getActiveAlerts: _mockGetActiveAlerts,
      getAlertHistory: mockGetAlertHistory,
      acknowledgeAlert: mockAcknowledgeAlert,
      resolveAlert: _mockResolveAlert,
    },
  }

  return {
    mockLogWarn,
    mockLogError,
    mockLogInfo,
    mockLogDebug,
    mockListProcessingLogs,
    mockGetProcessingStats,
    mockGetProcessingLog,
    mockGetProcessingLogByPolicyId,
    mockDeleteOldLogs,
    mockGetUnacknowledgedNotifications,
    mockGetNotifications,
    mockAcknowledgeNotification,
    _mockLogAdminAction,
    mockGetSupabaseWithError,
    _mockGetSystemMetrics,
    _mockRunHealthChecks,
    _mockGetDashboardSummary,
    _mockGetEndpointStats,
    mockGetTrends,
    mockGetRecentActivity,
    _mockGetAlertRules,
    _mockGetAlertRule,
    mockCreateAlertRule,
    _mockUpdateAlertRule,
    _mockDeleteAlertRule,
    _mockGetActiveAlerts,
    mockGetAlertHistory,
    mockAcknowledgeAlert,
    _mockResolveAlert,
    sharedState,
  }
})

// =============================================================================
// MODULE MOCKS
// =============================================================================

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

vi.mock('../services/processing-log-service.js', () => ({
  listProcessingLogs: mockListProcessingLogs,
  getProcessingStats: mockGetProcessingStats,
  getProcessingLog: mockGetProcessingLog,
  getProcessingLogByPolicyId: mockGetProcessingLogByPolicyId,
  deleteOldLogs: mockDeleteOldLogs,
}))

vi.mock('../services/admin-notification-service.js', () => ({
  getUnacknowledgedNotifications: mockGetUnacknowledgedNotifications,
  getNotifications: mockGetNotifications,
  acknowledgeNotification: mockAcknowledgeNotification,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

vi.mock('../routes/admin/shared.js', () => sharedState)

// =============================================================================
// IMPORTS — must be after vi.mock declarations
// =============================================================================

import operationsRouter from '../routes/admin/operations.js'
import contentRouter from '../routes/admin/content.js'
import monitoringRouter from '../routes/admin/monitoring.js'

// =============================================================================
// HELPERS
// =============================================================================

function createOperationsApp() {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
    req.adminUser = {
      id: 'admin-001',
      email: 'admin@test.com',
      role: 'super_admin',
      status: 'active',
      permissions: [],
    }
    next()
  })
  app.use('/', operationsRouter)
  return app
}

function createContentApp() {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
    req.adminUser = {
      id: 'admin-001',
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

function createMonitoringApp() {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
    req.adminUser = {
      id: 'admin-001',
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

function buildQueryChain(finalResult: { data: unknown; error: unknown }) {
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

const originalEnv = { ...process.env }

// =============================================================================
// OPERATIONS ROUTE BRANCH TESTS
// =============================================================================

describe('Operations Route Branch Coverage', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset shared in-memory arrays
    sharedState.aiRequests.length = 0
    sharedState.policyOperations.length = 0
    sharedState.securityLogs.length = 0
    sharedState.auditLogs.length = 0
    sharedState.blockedIPs.clear()
    sharedState.requestCounters.aiRequestId = 0
    sharedState.requestCounters.policyOpId = 0
    sharedState.requestCounters.securityLogId = 0
    sharedState.requestCounters.auditLogId = 0
    app = createOperationsApp()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // --------------------------------------------------------------------------
  // GET /health — environment variable branches
  // --------------------------------------------------------------------------
  describe('GET /health', () => {
    it('returns healthy status for all API components when keys configured', async () => {
      process.env.OPENAI_API_KEY = 'test-key'
      process.env.ANTHROPIC_API_KEY = 'test-key'
      process.env.GOOGLE_CLOUD_API_KEY = 'test-key'

      const res = await request(app).get('/health')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.status).toBe('healthy')

      const components = res.body.data.components
      expect(components[1].status).toBe('healthy')
      expect(components[1].details).toBe('API key configured')
      expect(components[2].status).toBe('healthy')
      expect(components[3].status).toBe('healthy')
    })

    it('returns degraded for components without API keys', async () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.GOOGLE_CLOUD_API_KEY

      const res = await request(app).get('/health')

      expect(res.status).toBe(200)
      const components = res.body.data.components
      expect(components[1].status).toBe('degraded')
      expect(components[1].details).toBe('API key not configured')
      expect(components[2].status).toBe('degraded')
      expect(components[3].status).toBe('degraded')
    })

    it('returns mixed status when some keys configured', async () => {
      process.env.OPENAI_API_KEY = 'test-key'
      delete process.env.ANTHROPIC_API_KEY
      process.env.GOOGLE_CLOUD_API_KEY = 'test-key'

      const res = await request(app).get('/health')

      const components = res.body.data.components
      expect(components[1].status).toBe('healthy')
      expect(components[2].status).toBe('degraded')
      expect(components[3].status).toBe('healthy')
    })

    it('returns version from npm_package_version or default', async () => {
      delete process.env.npm_package_version

      const res = await request(app).get('/health')

      expect(res.body.data.version).toBe('1.0.0')
    })

    it('includes uptime, environment, and lastChecked', async () => {
      const res = await request(app).get('/health')

      expect(res.body.data.uptime).toBeGreaterThanOrEqual(0)
      expect(res.body.data.environment).toBeDefined()
      expect(res.body.data.lastChecked).toBeDefined()
    })
  })

  // --------------------------------------------------------------------------
  // GET /metrics
  // --------------------------------------------------------------------------
  describe('GET /metrics', () => {
    it('returns system metrics successfully', async () => {
      const res = await request(app).get('/metrics')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.cpu).toBeDefined()
      expect(res.body.data.memory).toBeDefined()
      expect(res.body.data.process).toBeDefined()
    })

    it('counts recent AI requests in network.requestsPerMinute', async () => {
      sharedState.aiRequests.push(
        { timestamp: new Date().toISOString(), provider: 'openai' } as never,
        { timestamp: new Date(Date.now() - 120000).toISOString(), provider: 'openai' } as never
      )

      const res = await request(app).get('/metrics')

      // Only the request within last 60s should count
      expect(res.body.data.network.requestsPerMinute).toBe(1)
    })
  })

  // --------------------------------------------------------------------------
  // GET /ai/requests — all filter branches
  // --------------------------------------------------------------------------
  describe('GET /ai/requests', () => {
    beforeEach(() => {
      sharedState.aiRequests.push(
        {
          id: 'ai-1', timestamp: '2026-01-15T10:00:00Z', provider: 'openai',
          operation: 'extraction', status: 'success', userId: 'user-1',
          tokens: { input: 100, output: 50, total: 150 },
          cost: { input: 0.01, output: 0.02, total: 0.03 },
          responseTime: 500, model: 'gpt-4o', endpoint: '/extract', prompt: 'test',
        } as never,
        {
          id: 'ai-2', timestamp: '2026-01-16T10:00:00Z', provider: 'anthropic',
          operation: 'chat', status: 'error', userId: 'user-2',
          tokens: { input: 200, output: 100, total: 300 },
          cost: { input: 0.02, output: 0.04, total: 0.06 },
          responseTime: 1000, model: 'claude', endpoint: '/chat', prompt: 'test',
        } as never,
        {
          id: 'ai-3', timestamp: '2026-01-17T10:00:00Z', provider: 'openai',
          operation: 'extraction', status: 'success', userId: 'user-1',
          tokens: { input: 300, output: 150, total: 450 },
          cost: { input: 0.03, output: 0.06, total: 0.09 },
          responseTime: 700, model: 'gpt-4o', endpoint: '/extract', prompt: 'test',
        } as never
      )
    })

    it('returns all requests without filters', async () => {
      const res = await request(app).get('/ai/requests')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(3)
      expect(res.body.total).toBe(3)
    })

    it('filters by provider', async () => {
      const res = await request(app).get('/ai/requests').query({ provider: 'openai' })

      expect(res.body.data).toHaveLength(2)
      expect(res.body.data.every((r: { provider: string }) => r.provider === 'openai')).toBe(true)
    })

    it('filters by operation', async () => {
      const res = await request(app).get('/ai/requests').query({ operation: 'chat' })

      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].operation).toBe('chat')
    })

    it('filters by status', async () => {
      const res = await request(app).get('/ai/requests').query({ status: 'error' })

      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].status).toBe('error')
    })

    it('filters by userId', async () => {
      const res = await request(app).get('/ai/requests').query({ userId: 'user-2' })

      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].userId).toBe('user-2')
    })

    it('filters by startDate', async () => {
      const res = await request(app).get('/ai/requests').query({ startDate: '2026-01-16T00:00:00Z' })

      expect(res.body.data).toHaveLength(2)
    })

    it('filters by endDate', async () => {
      const res = await request(app).get('/ai/requests').query({ endDate: '2026-01-15T23:59:59Z' })

      expect(res.body.data).toHaveLength(1)
    })

    it('filters by startDate and endDate together', async () => {
      const res = await request(app).get('/ai/requests').query({
        startDate: '2026-01-16T00:00:00Z',
        endDate: '2026-01-16T23:59:59Z',
      })

      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].id).toBe('ai-2')
    })

    it('respects limit parameter', async () => {
      const res = await request(app).get('/ai/requests').query({ limit: '2' })

      expect(res.body.data).toHaveLength(2)
    })

    it('sorts results by timestamp descending', async () => {
      const res = await request(app).get('/ai/requests')

      expect(res.body.data[0].id).toBe('ai-3')
      expect(res.body.data[2].id).toBe('ai-1')
    })

    it('combines multiple filters', async () => {
      const res = await request(app).get('/ai/requests').query({
        provider: 'openai',
        operation: 'extraction',
        status: 'success',
        userId: 'user-1',
      })

      expect(res.body.data).toHaveLength(2)
    })
  })

  // --------------------------------------------------------------------------
  // GET /ai/requests/:id — found and not found
  // --------------------------------------------------------------------------
  describe('GET /ai/requests/:id', () => {
    it('returns a specific AI request', async () => {
      sharedState.aiRequests.push({
        id: 'ai-find-me', timestamp: '2026-01-15T10:00:00Z',
        provider: 'openai', operation: 'extraction', status: 'success',
      } as never)

      const res = await request(app).get('/ai/requests/ai-find-me')

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('ai-find-me')
    })

    it('returns 404 when request not found', async () => {
      const res = await request(app).get('/ai/requests/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Request not found')
    })
  })

  // --------------------------------------------------------------------------
  // GET /ai/stats — aggregation and zero-division guards
  // --------------------------------------------------------------------------
  describe('GET /ai/stats', () => {
    it('returns empty stats when no requests', async () => {
      const res = await request(app).get('/ai/stats')

      expect(res.status).toBe(200)
      expect(res.body.data.totalRequests).toBe(0)
      expect(res.body.data.errorRate).toBe(0)
      expect(res.body.data.averageResponseTime).toBe(0)
    })

    it('aggregates stats by provider with error counting', async () => {
      sharedState.aiRequests.push(
        {
          id: 'ai-1', timestamp: '2026-01-15T10:00:00Z', provider: 'openai',
          operation: 'extraction', status: 'success',
          tokens: { input: 100, output: 50, total: 150 },
          cost: { input: 0.01, output: 0.02, total: 0.03 },
          responseTime: 500,
        } as never,
        {
          id: 'ai-2', timestamp: '2026-01-15T11:00:00Z', provider: 'openai',
          operation: 'extraction', status: 'error',
          tokens: { input: 200, output: 0, total: 200 },
          cost: { input: 0.02, output: 0, total: 0.02 },
          responseTime: 100,
        } as never,
        {
          id: 'ai-3', timestamp: '2026-01-15T12:00:00Z', provider: 'anthropic',
          operation: 'chat', status: 'success',
          tokens: { input: 50, output: 25, total: 75 },
          cost: { input: 0.005, output: 0.01, total: 0.015 },
          responseTime: 300,
        } as never
      )

      const res = await request(app).get('/ai/stats')

      expect(res.body.data.totalRequests).toBe(3)
      expect(res.body.data.totalTokens).toBe(425)
      expect(res.body.data.errorRate).toBeCloseTo(1 / 3)
      expect(res.body.data.averageResponseTime).toBeCloseTo(300)

      // By provider
      const openaiStats = res.body.data.byProvider.openai
      expect(openaiStats.requests).toBe(2)
      expect(openaiStats.errorCount).toBe(1)
      expect(openaiStats.errorRate).toBe(0.5)
      expect(openaiStats.tokens.input).toBe(300)
      expect(openaiStats.tokens.output).toBe(50)
      expect(openaiStats.tokens.total).toBe(350)

      const anthropicStats = res.body.data.byProvider.anthropic
      expect(anthropicStats.requests).toBe(1)
      expect(anthropicStats.errorCount).toBe(0)

      // By operation — response only exposes requests, successRate, averageResponseTime, averageTokens, totalCost
      const extractionStats = res.body.data.byOperation.extraction
      expect(extractionStats.requests).toBe(2)
      expect(extractionStats.successRate).toBe(0.5)
      expect(extractionStats.averageResponseTime).toBe(300) // (500+100)/2

      const chatStats = res.body.data.byOperation.chat
      expect(chatStats.requests).toBe(1)
      expect(chatStats.successRate).toBe(1)
    })

    it('filters stats by startDate', async () => {
      sharedState.aiRequests.push(
        {
          id: 'ai-1', timestamp: '2026-01-10T10:00:00Z', provider: 'openai',
          operation: 'extraction', status: 'success',
          tokens: { input: 100, output: 50, total: 150 },
          cost: { input: 0.01, output: 0.02, total: 0.03 },
          responseTime: 500,
        } as never,
        {
          id: 'ai-2', timestamp: '2026-01-20T10:00:00Z', provider: 'anthropic',
          operation: 'chat', status: 'success',
          tokens: { input: 50, output: 25, total: 75 },
          cost: { input: 0.005, output: 0.01, total: 0.015 },
          responseTime: 300,
        } as never
      )

      const res = await request(app).get('/ai/stats').query({ startDate: '2026-01-15T00:00:00Z' })

      expect(res.body.data.totalRequests).toBe(1)
    })

    it('filters stats by endDate', async () => {
      sharedState.aiRequests.push(
        {
          id: 'ai-1', timestamp: '2026-01-10T10:00:00Z', provider: 'openai',
          operation: 'extraction', status: 'success',
          tokens: { input: 100, output: 50, total: 150 },
          cost: { input: 0.01, output: 0.02, total: 0.03 },
          responseTime: 500,
        } as never,
        {
          id: 'ai-2', timestamp: '2026-01-20T10:00:00Z', provider: 'anthropic',
          operation: 'chat', status: 'success',
          tokens: { input: 50, output: 25, total: 75 },
          cost: { input: 0.005, output: 0.01, total: 0.015 },
          responseTime: 300,
        } as never
      )

      const res = await request(app).get('/ai/stats').query({ endDate: '2026-01-15T00:00:00Z' })

      expect(res.body.data.totalRequests).toBe(1)
    })
  })

  // --------------------------------------------------------------------------
  // GET /policies/operations — all filter branches
  // --------------------------------------------------------------------------
  describe('GET /policies/operations', () => {
    beforeEach(() => {
      sharedState.policyOperations.push(
        {
          id: 'op-1', timestamp: '2026-01-15T10:00:00Z', type: 'extraction',
          userId: 'user-1', status: 'success', duration: 5000,
          extractionInfo: { provider: 'openai', model: 'gpt-4o', confidence: 0.95, ocrUsed: false },
        } as never,
        {
          id: 'op-2', timestamp: '2026-01-16T10:00:00Z', type: 'upload',
          userId: 'user-2', status: 'failed',
        } as never,
        {
          id: 'op-3', timestamp: '2026-01-17T10:00:00Z', type: 'extraction',
          userId: 'user-1', status: 'success', duration: 8000,
          extractionInfo: { provider: 'anthropic', model: 'claude', confidence: 0.9, ocrUsed: true },
        } as never
      )
    })

    it('returns all operations without filters', async () => {
      const res = await request(app).get('/policies/operations')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(3)
    })

    it('filters by type', async () => {
      const res = await request(app).get('/policies/operations').query({ type: 'upload' })

      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].type).toBe('upload')
    })

    it('filters by userId', async () => {
      const res = await request(app).get('/policies/operations').query({ userId: 'user-1' })

      expect(res.body.data).toHaveLength(2)
    })

    it('filters by status', async () => {
      const res = await request(app).get('/policies/operations').query({ status: 'failed' })

      expect(res.body.data).toHaveLength(1)
    })

    it('filters by startDate', async () => {
      const res = await request(app).get('/policies/operations').query({ startDate: '2026-01-16T00:00:00Z' })

      expect(res.body.data).toHaveLength(2)
    })

    it('filters by endDate', async () => {
      const res = await request(app).get('/policies/operations').query({ endDate: '2026-01-16T00:00:00Z' })

      expect(res.body.data).toHaveLength(1)
    })

    it('respects limit parameter', async () => {
      const res = await request(app).get('/policies/operations').query({ limit: '1' })

      expect(res.body.data).toHaveLength(1)
    })
  })

  // --------------------------------------------------------------------------
  // GET /policies/stats — aggregation branches
  // --------------------------------------------------------------------------
  describe('GET /policies/stats', () => {
    it('returns empty stats when no operations', async () => {
      const res = await request(app).get('/policies/stats')

      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(0)
      expect(res.body.data.averageExtractionTime).toBe(0)
      expect(res.body.data.extractionSuccessRate).toBe(0)
      expect(res.body.data.ocrUsageRate).toBe(0)
    })

    it('aggregates policy stats correctly', async () => {
      sharedState.policyOperations.push(
        {
          id: 'op-1', timestamp: '2026-01-15T10:00:00Z', type: 'extraction',
          userId: 'user-1', status: 'success', duration: 5000,
          extractionInfo: { provider: 'openai', model: 'gpt-4o', confidence: 0.95, ocrUsed: true },
        } as never,
        {
          id: 'op-2', timestamp: '2026-01-16T10:00:00Z', type: 'extraction',
          userId: 'user-2', status: 'success', duration: 3000,
          extractionInfo: { provider: 'anthropic', model: 'claude', confidence: 0.9, ocrUsed: false },
        } as never,
        {
          id: 'op-3', timestamp: '2026-01-17T10:00:00Z', type: 'upload',
          userId: 'user-1', status: 'failed',
        } as never
      )

      const res = await request(app).get('/policies/stats')

      expect(res.body.data.total).toBe(3)
      expect(res.body.data.byType.extraction).toBe(2)
      expect(res.body.data.byType.upload).toBe(1)
      expect(res.body.data.byStatus.success).toBe(2)
      expect(res.body.data.byStatus.failed).toBe(1)
      expect(res.body.data.averageExtractionTime).toBe(4000)
      expect(res.body.data.extractionSuccessRate).toBeCloseTo(2 / 3)
      expect(res.body.data.ocrUsageRate).toBeCloseTo(1 / 3)
    })

    it('handles operations without duration (non-extraction)', async () => {
      sharedState.policyOperations.push(
        {
          id: 'op-1', timestamp: '2026-01-15T10:00:00Z', type: 'extraction',
          userId: 'user-1', status: 'success',
          // no duration field — should not contribute to average
        } as never
      )

      const res = await request(app).get('/policies/stats')

      expect(res.body.data.averageExtractionTime).toBe(0)
    })

    it('filters policy stats by startDate and endDate', async () => {
      sharedState.policyOperations.push(
        {
          id: 'op-1', timestamp: '2026-01-10T10:00:00Z', type: 'extraction',
          userId: 'user-1', status: 'success', duration: 5000,
        } as never,
        {
          id: 'op-2', timestamp: '2026-01-20T10:00:00Z', type: 'extraction',
          userId: 'user-2', status: 'success', duration: 3000,
        } as never
      )

      const res = await request(app).get('/policies/stats').query({
        startDate: '2026-01-15T00:00:00Z',
        endDate: '2026-01-25T00:00:00Z',
      })

      expect(res.body.data.total).toBe(1)
    })
  })

  // --------------------------------------------------------------------------
  // GET /security/logs — all filter branches including resolved
  // --------------------------------------------------------------------------
  describe('GET /security/logs', () => {
    beforeEach(() => {
      sharedState.securityLogs.push(
        {
          id: 'sec-1', timestamp: '2026-01-15T10:00:00Z', eventType: 'login_failure',
          severity: 'high', ipAddress: '1.2.3.4', details: {}, resolved: false,
        } as never,
        {
          id: 'sec-2', timestamp: '2026-01-16T10:00:00Z', eventType: 'rate_limit',
          severity: 'medium', ipAddress: '5.6.7.8', details: {}, resolved: true,
        } as never,
        {
          id: 'sec-3', timestamp: '2026-01-17T10:00:00Z', eventType: 'login_failure',
          severity: 'high', ipAddress: '9.10.11.12', details: {}, resolved: false,
        } as never
      )
    })

    it('returns all security logs without filters', async () => {
      const res = await request(app).get('/security/logs')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(3)
    })

    it('filters by eventType', async () => {
      const res = await request(app).get('/security/logs').query({ eventType: 'rate_limit' })

      expect(res.body.data).toHaveLength(1)
    })

    it('filters by severity', async () => {
      const res = await request(app).get('/security/logs').query({ severity: 'high' })

      expect(res.body.data).toHaveLength(2)
    })

    it('filters by resolved=true', async () => {
      const res = await request(app).get('/security/logs').query({ resolved: 'true' })

      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].resolved).toBe(true)
    })

    it('filters by resolved=false', async () => {
      const res = await request(app).get('/security/logs').query({ resolved: 'false' })

      expect(res.body.data).toHaveLength(2)
      expect(res.body.data.every((l: { resolved: boolean }) => l.resolved === false)).toBe(true)
    })

    it('filters by startDate and endDate', async () => {
      const res = await request(app).get('/security/logs').query({
        startDate: '2026-01-16T00:00:00Z',
        endDate: '2026-01-16T23:59:59Z',
      })

      expect(res.body.data).toHaveLength(1)
    })

    it('respects limit parameter', async () => {
      const res = await request(app).get('/security/logs').query({ limit: '1' })

      expect(res.body.data).toHaveLength(1)
    })
  })

  // --------------------------------------------------------------------------
  // POST /security/logs/:id/resolve
  // --------------------------------------------------------------------------
  describe('POST /security/logs/:id/resolve', () => {
    it('resolves a security log', async () => {
      sharedState.securityLogs.push({
        id: 'sec-resolve', timestamp: '2026-01-15T10:00:00Z', eventType: 'login_failure',
        severity: 'high', ipAddress: '1.2.3.4', details: {}, resolved: false,
      } as never)

      const res = await request(app).post('/security/logs/sec-resolve/resolve')

      expect(res.status).toBe(200)
      expect(res.body.data.resolved).toBe(true)
    })

    it('returns 404 when log not found', async () => {
      const res = await request(app).post('/security/logs/nonexistent/resolve')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Log not found')
    })
  })

  // --------------------------------------------------------------------------
  // POST /security/block-ip — validation and expiresIn branch
  // --------------------------------------------------------------------------
  describe('POST /security/block-ip', () => {
    it('blocks an IP with reason', async () => {
      const res = await request(app)
        .post('/security/block-ip')
        .send({ ip: '1.2.3.4', reason: 'Suspicious activity' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('IP 1.2.3.4 blocked')
      expect(sharedState.blockedIPs.has('1.2.3.4')).toBe(true)
      expect(sharedState.blockedIPs.get('1.2.3.4')!.expiresAt).toBeUndefined()
    })

    it('blocks an IP with expiresIn', async () => {
      const res = await request(app)
        .post('/security/block-ip')
        .send({ ip: '5.6.7.8', reason: 'Rate limiting', expiresIn: 3600000 })

      expect(res.status).toBe(200)
      expect(sharedState.blockedIPs.get('5.6.7.8')!.expiresAt).toBeDefined()
    })

    it('returns 400 when ip is missing', async () => {
      const res = await request(app)
        .post('/security/block-ip')
        .send({ reason: 'No IP provided' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('IP and reason are required')
    })

    it('returns 400 when reason is missing', async () => {
      const res = await request(app)
        .post('/security/block-ip')
        .send({ ip: '1.2.3.4' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('IP and reason are required')
    })
  })

  // --------------------------------------------------------------------------
  // DELETE /security/block-ip/:ip
  // --------------------------------------------------------------------------
  describe('DELETE /security/block-ip/:ip', () => {
    it('unblocks a blocked IP', async () => {
      sharedState.blockedIPs.set('1.2.3.4', { reason: 'test', blockedAt: new Date().toISOString() })

      const res = await request(app).delete('/security/block-ip/1.2.3.4')

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('IP 1.2.3.4 unblocked')
      expect(sharedState.blockedIPs.has('1.2.3.4')).toBe(false)
    })

    it('returns 404 when IP not in blocklist', async () => {
      const res = await request(app).delete('/security/block-ip/9.9.9.9')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('IP not found in blocklist')
    })
  })

  // --------------------------------------------------------------------------
  // GET /security/rate-limits
  // --------------------------------------------------------------------------
  describe('GET /security/rate-limits', () => {
    it('returns rate limit info with blocked IPs', async () => {
      sharedState.blockedIPs.set('1.2.3.4', { reason: 'abuse', blockedAt: '2026-01-15T10:00:00Z' })

      const res = await request(app).get('/security/rate-limits')

      expect(res.status).toBe(200)
      expect(res.body.data.endpoints).toHaveLength(4)
      expect(res.body.data.blockedIPs).toHaveLength(1)
      expect(res.body.data.blockedIPs[0].ip).toBe('1.2.3.4')
    })
  })

  // --------------------------------------------------------------------------
  // GET /audit/logs — all filter branches
  // --------------------------------------------------------------------------
  describe('GET /audit/logs', () => {
    beforeEach(() => {
      sharedState.auditLogs.push(
        {
          id: 'audit-1', timestamp: '2026-01-15T10:00:00Z', actorId: 'admin-1',
          actorEmail: 'admin@test.com', action: 'create', resourceType: 'policy',
          resourceId: 'pol-1', ipAddress: '127.0.0.1',
        } as never,
        {
          id: 'audit-2', timestamp: '2026-01-16T10:00:00Z', actorId: 'admin-2',
          actorEmail: 'other@test.com', action: 'update', resourceType: 'config',
          resourceId: 'cfg-1', ipAddress: '127.0.0.1',
        } as never,
        {
          id: 'audit-3', timestamp: '2026-01-17T10:00:00Z', actorId: 'admin-1',
          actorEmail: 'admin@test.com', action: 'delete', resourceType: 'policy',
          resourceId: 'pol-2', ipAddress: '127.0.0.1',
        } as never
      )
    })

    it('returns all audit logs without filters', async () => {
      const res = await request(app).get('/audit/logs')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(3)
    })

    it('filters by actorId', async () => {
      const res = await request(app).get('/audit/logs').query({ actorId: 'admin-1' })

      expect(res.body.data).toHaveLength(2)
    })

    it('filters by action', async () => {
      const res = await request(app).get('/audit/logs').query({ action: 'update' })

      expect(res.body.data).toHaveLength(1)
    })

    it('filters by resourceType', async () => {
      const res = await request(app).get('/audit/logs').query({ resourceType: 'policy' })

      expect(res.body.data).toHaveLength(2)
    })

    it('filters by resourceId', async () => {
      const res = await request(app).get('/audit/logs').query({ resourceId: 'pol-1' })

      expect(res.body.data).toHaveLength(1)
    })

    it('filters by startDate and endDate', async () => {
      const res = await request(app).get('/audit/logs').query({
        startDate: '2026-01-16T00:00:00Z',
        endDate: '2026-01-16T23:59:59Z',
      })

      expect(res.body.data).toHaveLength(1)
    })

    it('respects limit parameter', async () => {
      const res = await request(app).get('/audit/logs').query({ limit: '2' })

      expect(res.body.data).toHaveLength(2)
    })
  })

  // --------------------------------------------------------------------------
  // GET /config — category filter branch
  // --------------------------------------------------------------------------
  describe('GET /config', () => {
    it('returns all configs without category filter', async () => {
      const res = await request(app).get('/config')

      expect(res.status).toBe(200)
      expect(res.body.data.length).toBeGreaterThan(0)
    })

    it('filters configs by category', async () => {
      const res = await request(app).get('/config').query({ category: 'ai' })

      expect(res.body.data.every((c: { category: string }) => c.category === 'ai')).toBe(true)
    })

    it('returns empty for unknown category', async () => {
      const res = await request(app).get('/config').query({ category: 'nonexistent' })

      expect(res.body.data).toHaveLength(0)
    })
  })

  // --------------------------------------------------------------------------
  // PUT /config/:id — not found and audit log
  // --------------------------------------------------------------------------
  describe('PUT /config/:id', () => {
    it('updates a config value and logs audit', async () => {
      const res = await request(app)
        .put('/config/ai.temperature')
        .send({ value: 0.5 })

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('ai.temperature')
      expect(res.body.data.value).toBe(0.5)
    })

    it('returns 404 for unknown config key', async () => {
      const res = await request(app)
        .put('/config/nonexistent.key')
        .send({ value: 'test' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Config not found')
    })

    it('pushes audit log entry with admin user info', async () => {
      const auditCountBefore = sharedState.auditLogs.length

      await request(app)
        .put('/config/features.enable_chat')
        .send({ value: false })

      expect(sharedState.auditLogs.length).toBe(auditCountBefore + 1)
      const latestAudit = sharedState.auditLogs[sharedState.auditLogs.length - 1] as { actorId: string; action: string; resourceType: string }
      expect(latestAudit.actorId).toBe('admin-001')
      expect(latestAudit.action).toBe('update')
      expect(latestAudit.resourceType).toBe('config')
    })
  })

  // --------------------------------------------------------------------------
  // GET /feature-flags
  // --------------------------------------------------------------------------
  describe('GET /feature-flags', () => {
    it('returns all feature flags', async () => {
      const res = await request(app).get('/feature-flags')

      expect(res.status).toBe(200)
      expect(res.body.data.length).toBeGreaterThan(0)
      expect(res.body.data[0]).toHaveProperty('id')
      expect(res.body.data[0]).toHaveProperty('name')
      expect(res.body.data[0]).toHaveProperty('enabled')
    })
  })

  // --------------------------------------------------------------------------
  // PUT /feature-flags/:id — action determination branches
  // --------------------------------------------------------------------------
  describe('PUT /feature-flags/:id', () => {
    it('returns 404 for unknown feature flag', async () => {
      const res = await request(app)
        .put('/feature-flags/nonexistent')
        .send({ enabled: true })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Feature flag not found')
    })

    it('sets action to "enable" when enabled=true', async () => {
      const _auditCountBefore = sharedState.auditLogs.length

      await request(app)
        .put('/feature-flags/dark_mode')
        .send({ enabled: true })

      const latestAudit = sharedState.auditLogs[sharedState.auditLogs.length - 1] as { action: string }
      expect(latestAudit.action).toBe('enable')
    })

    it('sets action to "disable" when enabled=false', async () => {
      await request(app)
        .put('/feature-flags/pii_redaction')
        .send({ enabled: false })

      const latestAudit = sharedState.auditLogs[sharedState.auditLogs.length - 1] as { action: string }
      expect(latestAudit.action).toBe('disable')
    })

    it('sets action to "update" when enabled is not provided', async () => {
      await request(app)
        .put('/feature-flags/dark_mode')
        .send({ description: 'Updated description' })

      const latestAudit = sharedState.auditLogs[sharedState.auditLogs.length - 1] as { action: string }
      expect(latestAudit.action).toBe('update')
    })

    it('updates the feature flag data', async () => {
      const res = await request(app)
        .put('/feature-flags/dark_mode')
        .send({ enabled: true, enabledPercentage: 50 })

      expect(res.status).toBe(200)
      expect(res.body.data.enabled).toBe(true)
      expect(res.body.data.enabledPercentage).toBe(50)
    })
  })

  // --------------------------------------------------------------------------
  // GET /export — data export
  // --------------------------------------------------------------------------
  describe('GET /export', () => {
    it('exports last 1000 entries of each data type', async () => {
      sharedState.aiRequests.push({ id: 'ai-export' } as never)
      sharedState.policyOperations.push({ id: 'op-export' } as never)
      sharedState.securityLogs.push({ id: 'sec-export' } as never)
      sharedState.auditLogs.push({ id: 'audit-export' } as never)

      const res = await request(app).get('/export')

      expect(res.status).toBe(200)
      expect(res.body.data.aiRequests).toHaveLength(1)
      expect(res.body.data.policyOperations).toHaveLength(1)
      expect(res.body.data.securityLogs).toHaveLength(1)
      expect(res.body.data.auditLogs).toHaveLength(1)
      expect(res.body.data.exportedAt).toBeDefined()
      expect(res.body.data.exportedBy).toBe('admin@test.com')
    })
  })

  // --------------------------------------------------------------------------
  // POST /log/ai-request — validation and MAX_ENTRIES trim
  // --------------------------------------------------------------------------
  describe('POST /log/ai-request', () => {
    it('ingests a valid AI request log', async () => {
      const res = await request(app)
        .post('/log/ai-request')
        .send({ provider: 'openai', operation: 'extraction', status: 'success' })

      expect(res.status).toBe(200)
      expect(res.body.id).toBeDefined()
      expect(sharedState.aiRequests.length).toBe(1)
    })

    it('returns 400 when provider is missing', async () => {
      const res = await request(app)
        .post('/log/ai-request')
        .send({ operation: 'extraction' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Missing required fields')
    })

    it('returns 400 when operation is missing', async () => {
      const res = await request(app)
        .post('/log/ai-request')
        .send({ provider: 'openai' })

      expect(res.status).toBe(400)
    })

    it('trims array when exceeding MAX_ENTRIES', async () => {
      // MAX_ENTRIES is set to 10 in our mock
      for (let i = 0; i < 10; i++) {
        sharedState.aiRequests.push({ id: `old-${i}` } as never)
      }
      expect(sharedState.aiRequests.length).toBe(10)

      await request(app)
        .post('/log/ai-request')
        .send({ provider: 'openai', operation: 'extraction' })

      // Should have shifted the oldest entry
      expect(sharedState.aiRequests.length).toBe(10)
    })
  })

  // --------------------------------------------------------------------------
  // POST /log/policy-operation — validation and MAX_ENTRIES trim
  // --------------------------------------------------------------------------
  describe('POST /log/policy-operation', () => {
    it('ingests a valid policy operation log', async () => {
      const res = await request(app)
        .post('/log/policy-operation')
        .send({ type: 'extraction', userId: 'user-1' })

      expect(res.status).toBe(200)
      expect(res.body.id).toBeDefined()
    })

    it('returns 400 when type is missing', async () => {
      const res = await request(app)
        .post('/log/policy-operation')
        .send({ userId: 'user-1' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when userId is missing', async () => {
      const res = await request(app)
        .post('/log/policy-operation')
        .send({ type: 'extraction' })

      expect(res.status).toBe(400)
    })

    it('trims array when exceeding MAX_ENTRIES', async () => {
      for (let i = 0; i < 10; i++) {
        sharedState.policyOperations.push({ id: `old-${i}` } as never)
      }

      await request(app)
        .post('/log/policy-operation')
        .send({ type: 'extraction', userId: 'user-1' })

      expect(sharedState.policyOperations.length).toBe(10)
    })
  })

  // --------------------------------------------------------------------------
  // POST /log/security — validation and MAX_ENTRIES trim
  // --------------------------------------------------------------------------
  describe('POST /log/security', () => {
    it('ingests a valid security log', async () => {
      const res = await request(app)
        .post('/log/security')
        .send({ eventType: 'login_failure', severity: 'high' })

      expect(res.status).toBe(200)
      expect(res.body.id).toBeDefined()
    })

    it('returns 400 when eventType is missing', async () => {
      const res = await request(app)
        .post('/log/security')
        .send({ severity: 'high' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when severity is missing', async () => {
      const res = await request(app)
        .post('/log/security')
        .send({ eventType: 'login_failure' })

      expect(res.status).toBe(400)
    })

    it('trims array when exceeding MAX_ENTRIES', async () => {
      for (let i = 0; i < 10; i++) {
        sharedState.securityLogs.push({ id: `old-${i}` } as never)
      }

      await request(app)
        .post('/log/security')
        .send({ eventType: 'login_failure', severity: 'high' })

      expect(sharedState.securityLogs.length).toBe(10)
    })
  })
})

// =============================================================================
// CONTENT ROUTE BRANCH TESTS — Benchmark-specific branches
// =============================================================================

describe('Content Route Branch Coverage — Benchmarks', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createContentApp()
  })

  // --------------------------------------------------------------------------
  // POST /benchmarks — optional field fallbacks and insert error
  // --------------------------------------------------------------------------
  describe('POST /benchmarks — optional field fallbacks', () => {
    it('applies default fallbacks for optional fields', async () => {
      const createdData = { id: 'bench-new' }
      const queryChain = buildQueryChain({ data: createdData, error: null })
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
          // No sub_type, no currency, no year, no source, etc.
        })

      const insertCall = (queryChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(insertCall.sub_type).toBeNull()
      expect(insertCall.sub_type_tr).toBeNull()
      expect(insertCall.comparison_method).toBe('direct_premium')
      expect(insertCall.currency).toBe('TRY')
      expect(insertCall.year).toBe(new Date().getFullYear())
      expect(insertCall.source).toBeNull()
      expect(insertCall.source_tr).toBeNull()
      expect(insertCall.notes).toBeNull()
      expect(insertCall.notes_tr).toBeNull()
    })

    it('passes provided optional fields', async () => {
      const createdData = { id: 'bench-new' }
      const queryChain = buildQueryChain({ data: createdData, error: null })
      const mockClient = { from: vi.fn().mockReturnValue(queryChain) }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app)
        .post('/benchmarks')
        .send({
          insurance_type: 'health',
          insurance_type_tr: 'Sağlık',
          min_premium: '2000',
          avg_premium: '5000',
          max_premium: '12000',
          sub_type: 'tamamlayici',
          sub_type_tr: 'Tamamlayıcı',
          comparison_method: 'value_based',
          value_min_rate: '0.01',
          value_avg_rate: '0.03',
          value_max_rate: '0.05',
          currency: 'USD',
          year: 2027,
          source: 'TSB',
          source_tr: 'TSB',
          notes: 'Test notes',
          notes_tr: 'Test notları',
        })

      const insertCall = (queryChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(insertCall.sub_type).toBe('tamamlayici')
      expect(insertCall.comparison_method).toBe('value_based')
      expect(insertCall.value_min_rate).toBe(0.01)
      expect(insertCall.value_avg_rate).toBe(0.03)
      expect(insertCall.value_max_rate).toBe(0.05)
      expect(insertCall.currency).toBe('USD')
      expect(insertCall.year).toBe(2027)
      expect(insertCall.source).toBe('TSB')
      expect(insertCall.notes).toBe('Test notes')
    })

    it('returns 500 when insert fails', async () => {
      const queryChain = buildQueryChain({ data: null, error: new Error('Insert failed') })
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

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to create benchmark')
    })

    it('handles exception thrown during insert', async () => {
      mockGetSupabaseWithError.mockReturnValue({
        client: { from: vi.fn(() => { throw new Error('Unexpected error') }) },
        error: null,
      })

      const res = await request(app)
        .post('/benchmarks')
        .send({
          insurance_type: 'kasko',
          insurance_type_tr: 'Kasko',
          min_premium: '1000',
          avg_premium: '3000',
          max_premium: '8000',
        })

      expect(res.status).toBe(500)
    })
  })

  // --------------------------------------------------------------------------
  // PUT /benchmarks/:id — field type parsing branches
  // --------------------------------------------------------------------------
  describe('PUT /benchmarks/:id — field parsing branches', () => {
    it('parses numeric fields correctly', async () => {
      const selectChain = buildQueryChain({ data: { id: 'bench-1' }, error: null })
      const updateChain = buildQueryChain({ data: { id: 'bench-1', min_premium: 2000 }, error: null })

      let callCount = 0
      const mockClient = {
        from: vi.fn(() => {
          callCount++
          return callCount <= 1 ? selectChain : updateChain
        }),
      }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app)
        .put('/benchmarks/bench-1')
        .send({
          min_premium: '2000',
          avg_premium: '5000',
          max_premium: '10000',
          value_min_rate: '0.01',
          value_avg_rate: null,
          value_max_rate: '0.05',
        })

      const updateCall = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(updateCall.min_premium).toBe(2000)
      expect(updateCall.avg_premium).toBe(5000)
      expect(updateCall.max_premium).toBe(10000)
      expect(updateCall.value_min_rate).toBe(0.01)
      expect(updateCall.value_avg_rate).toBeNull()
      expect(updateCall.value_max_rate).toBe(0.05)
    })

    it('parses year as integer', async () => {
      const selectChain = buildQueryChain({ data: { id: 'bench-1' }, error: null })
      const updateChain = buildQueryChain({ data: { id: 'bench-1', year: 2027 }, error: null })

      let callCount = 0
      const mockClient = {
        from: vi.fn(() => {
          callCount++
          return callCount <= 1 ? selectChain : updateChain
        }),
      }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app)
        .put('/benchmarks/bench-1')
        .send({ year: '2027' })

      const updateCall = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(updateCall.year).toBe(2027)
    })

    it('passes non-numeric fields as-is', async () => {
      const selectChain = buildQueryChain({ data: { id: 'bench-1' }, error: null })
      const updateChain = buildQueryChain({ data: { id: 'bench-1' }, error: null })

      let callCount = 0
      const mockClient = {
        from: vi.fn(() => {
          callCount++
          return callCount <= 1 ? selectChain : updateChain
        }),
      }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app)
        .put('/benchmarks/bench-1')
        .send({
          insurance_type: 'traffic',
          insurance_type_tr: 'Trafik',
          is_active: false,
          notes: 'Updated notes',
        })

      const updateCall = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(updateCall.insurance_type).toBe('traffic')
      expect(updateCall.insurance_type_tr).toBe('Trafik')
      expect(updateCall.is_active).toBe(false)
      expect(updateCall.notes).toBe('Updated notes')
    })

    it('returns 500 when update query fails', async () => {
      const selectChain = buildQueryChain({ data: { id: 'bench-1' }, error: null })
      const updateChain = buildQueryChain({ data: null, error: new Error('Update failed') })

      let callCount = 0
      const mockClient = {
        from: vi.fn(() => {
          callCount++
          return callCount <= 1 ? selectChain : updateChain
        }),
      }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      const res = await request(app)
        .put('/benchmarks/bench-1')
        .send({ avg_premium: '6000' })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to update benchmark')
    })

    it('ignores fields not in allowedFields', async () => {
      const selectChain = buildQueryChain({ data: { id: 'bench-1' }, error: null })
      const updateChain = buildQueryChain({ data: { id: 'bench-1' }, error: null })

      let callCount = 0
      const mockClient = {
        from: vi.fn(() => {
          callCount++
          return callCount <= 1 ? selectChain : updateChain
        }),
      }
      mockGetSupabaseWithError.mockReturnValue({ client: mockClient, error: null })

      await request(app)
        .put('/benchmarks/bench-1')
        .send({ random_field: 'should be ignored', insurance_type: 'kasko' })

      const updateCall = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(updateCall.random_field).toBeUndefined()
      expect(updateCall.insurance_type).toBe('kasko')
    })
  })

  // --------------------------------------------------------------------------
  // GET /benchmarks — query error branch
  // --------------------------------------------------------------------------
  describe('GET /benchmarks — exception handler', () => {
    it('catches exception and returns 500', async () => {
      mockGetSupabaseWithError.mockReturnValue({
        client: { from: vi.fn(() => { throw new Error('Unexpected') }) },
        error: null,
      })

      const res = await request(app).get('/benchmarks')

      expect(res.status).toBe(500)
    })

    it('returns 503 with supabase error message', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: 'Custom DB error' })

      const res = await request(app).get('/benchmarks')

      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Custom DB error')
    })

    it('returns default message when supabase error is null', async () => {
      mockGetSupabaseWithError.mockReturnValue({ client: null, error: null })

      const res = await request(app).get('/benchmarks')

      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Database not configured')
    })
  })

  // --------------------------------------------------------------------------
  // GET /benchmarks/:id — exception handler
  // --------------------------------------------------------------------------
  describe('GET /benchmarks/:id — exception handler', () => {
    it('catches exception and returns 500', async () => {
      mockGetSupabaseWithError.mockReturnValue({
        client: { from: vi.fn(() => { throw new Error('Unexpected') }) },
        error: null,
      })

      const res = await request(app).get('/benchmarks/bench-1')

      expect(res.status).toBe(500)
    })
  })

  // --------------------------------------------------------------------------
  // DELETE /benchmarks/:id — exception handler
  // --------------------------------------------------------------------------
  describe('DELETE /benchmarks/:id — exception handler', () => {
    it('catches exception and returns 500', async () => {
      mockGetSupabaseWithError.mockReturnValue({
        client: { from: vi.fn(() => { throw new Error('Unexpected') }) },
        error: null,
      })

      const res = await request(app).delete('/benchmarks/bench-1')

      expect(res.status).toBe(500)
    })
  })

  // --------------------------------------------------------------------------
  // PUT /benchmarks/:id — exception handler
  // --------------------------------------------------------------------------
  describe('PUT /benchmarks/:id — exception handler', () => {
    it('catches exception and returns 500', async () => {
      mockGetSupabaseWithError.mockReturnValue({
        client: { from: vi.fn(() => { throw new Error('Unexpected') }) },
        error: null,
      })

      const res = await request(app)
        .put('/benchmarks/bench-1')
        .send({ avg_premium: '6000' })

      expect(res.status).toBe(500)
    })
  })

  // --------------------------------------------------------------------------
  // Notification acknowledge — adminUser fallback for email
  // --------------------------------------------------------------------------
  describe('POST /notifications/:id/acknowledge — adminUser edge cases', () => {
    it('uses "unknown" when adminUser has no email', async () => {
      const appNoEmail = express()
      appNoEmail.use(express.json())
      appNoEmail.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
        req.adminUser = { id: 'admin-001', role: 'admin', status: 'active' }
        next()
      })
      appNoEmail.use('/', contentRouter)

      mockAcknowledgeNotification.mockResolvedValue(true)

      await request(appNoEmail).post('/notifications/notif-001/acknowledge')

      expect(mockAcknowledgeNotification).toHaveBeenCalledWith('notif-001', 'unknown')
    })
  })

  // --------------------------------------------------------------------------
  // POST /notifications/acknowledge-all — adminUser email fallback
  // --------------------------------------------------------------------------
  describe('POST /notifications/acknowledge-all — adminUser edge cases', () => {
    it('uses "unknown" when adminUser has no email', async () => {
      const appNoEmail = express()
      appNoEmail.use(express.json())
      appNoEmail.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
        req.adminUser = { id: 'admin-001', role: 'admin', status: 'active' }
        next()
      })
      appNoEmail.use('/', contentRouter)

      mockGetUnacknowledgedNotifications.mockResolvedValue([{ id: 'notif-001' }])
      mockAcknowledgeNotification.mockResolvedValue(true)

      await request(appNoEmail).post('/notifications/acknowledge-all')

      expect(mockAcknowledgeNotification).toHaveBeenCalledWith('notif-001', 'unknown')
    })
  })
})

// =============================================================================
// MONITORING ROUTE BRANCH TESTS — Additional branch coverage
// =============================================================================

describe('Monitoring Route Branch Coverage — Additional', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createMonitoringApp()
  })

  // --------------------------------------------------------------------------
  // POST /monitoring/alert-rules — enabled=false branch
  // --------------------------------------------------------------------------
  describe('POST /monitoring/alert-rules — enabled=false branch', () => {
    it('sets enabled=false when explicitly passed', async () => {
      mockCreateAlertRule.mockReturnValue({
        id: 'rule-new',
        name: 'Disabled Rule',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 10,
        severity: 'warning',
        enabled: false,
      })

      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({
          name: 'Disabled Rule',
          metric: 'error_rate',
          condition: 'gt',
          threshold: 10,
          enabled: false,
        })

      expect(res.status).toBe(200)
      expect(mockCreateAlertRule).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      )
    })
  })

  // --------------------------------------------------------------------------
  // POST /monitoring/alert-rules — missing individual required fields
  // --------------------------------------------------------------------------
  describe('POST /monitoring/alert-rules — missing individual fields', () => {
    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({ metric: 'error_rate', condition: 'gt', threshold: 5 })

      expect(res.status).toBe(400)
    })

    it('returns 400 when metric is missing', async () => {
      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({ name: 'Test', condition: 'gt', threshold: 5 })

      expect(res.status).toBe(400)
    })

    it('returns 400 when condition is missing', async () => {
      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({ name: 'Test', metric: 'cpu', threshold: 5 })

      expect(res.status).toBe(400)
    })

    it('accepts threshold=0 as valid', async () => {
      mockCreateAlertRule.mockReturnValue({
        id: 'rule-zero',
        name: 'Zero Threshold',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 0,
      })

      const res = await request(app)
        .post('/monitoring/alert-rules')
        .send({
          name: 'Zero Threshold',
          metric: 'error_rate',
          condition: 'gt',
          threshold: 0,
        })

      expect(res.status).toBe(200)
    })
  })

  // --------------------------------------------------------------------------
  // GET /monitoring/trends — NaN handling via parseInt
  // --------------------------------------------------------------------------
  describe('GET /monitoring/trends — edge cases', () => {
    it('handles zero period and interval values', async () => {
      mockGetTrends.mockReturnValue({ period: '0m', requests: [] })

      const res = await request(app)
        .get('/monitoring/trends')
        .query({ period: '0', interval: '0' })

      // parseInt('0') is 0, which is falsy, so || defaults apply
      expect(mockGetTrends).toHaveBeenCalledWith(60, 5)
      expect(res.status).toBe(200)
    })
  })

  // --------------------------------------------------------------------------
  // GET /monitoring/activity — edge cases
  // --------------------------------------------------------------------------
  describe('GET /monitoring/activity — edge cases', () => {
    it('handles zero limit', async () => {
      mockGetRecentActivity.mockReturnValue([])

      const res = await request(app)
        .get('/monitoring/activity')
        .query({ limit: '0' })

      // parseInt('0') is 0 which is falsy, so || 50 applies
      expect(mockGetTrends).not.toHaveBeenCalled()
      expect(mockGetRecentActivity).toHaveBeenCalledWith(50)
      expect(res.status).toBe(200)
    })
  })

  // --------------------------------------------------------------------------
  // GET /monitoring/alerts/history — edge cases
  // --------------------------------------------------------------------------
  describe('GET /monitoring/alerts/history — edge cases', () => {
    it('handles zero limit defaulting to 100', async () => {
      mockGetAlertHistory.mockReturnValue([])

      await request(app).get('/monitoring/alerts/history').query({ limit: '0' })

      expect(mockGetAlertHistory).toHaveBeenCalledWith(100)
    })
  })

  // --------------------------------------------------------------------------
  // POST /monitoring/alerts/:id/acknowledge — adminUser fallback
  // --------------------------------------------------------------------------
  describe('POST /monitoring/alerts/:id/acknowledge — adminUser edge', () => {
    it('uses "unknown" when adminUser has no email', async () => {
      const appNoEmail = express()
      appNoEmail.use(express.json())
      appNoEmail.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
        req.adminUser = { id: 'admin-001', role: 'admin', status: 'active' }
        next()
      })
      appNoEmail.use('/', monitoringRouter)

      const ackAlert = { id: 'alert-001', acknowledged: true }
      mockAcknowledgeAlert.mockReturnValue(ackAlert)

      await request(appNoEmail).post('/monitoring/alerts/alert-001/acknowledge')

      expect(mockAcknowledgeAlert).toHaveBeenCalledWith('alert-001', 'unknown')
    })
  })
})
