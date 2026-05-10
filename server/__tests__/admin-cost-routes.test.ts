/**
 * Admin Cost Routes Tests
 *
 * Tests for budget management, cost alerts, usage statistics,
 * cost summary, and model pricing endpoints.
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
  // Cost control mocks
  mockGetActiveBudgets,
  mockGetBudget,
  mockUpsertBudget,
  mockResetBudgetUsage,
  mockGetRecentAlerts,
  mockAcknowledgeAlert,
  mockGetUsageStats,
  mockGetModelPricing,
  // Admin auth
  mockLogAdminAction,
} = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  // Cost control
  mockGetActiveBudgets: vi.fn(),
  mockGetBudget: vi.fn(),
  mockUpsertBudget: vi.fn(),
  mockResetBudgetUsage: vi.fn(),
  mockGetRecentAlerts: vi.fn(),
  mockAcknowledgeAlert: vi.fn(),
  mockGetUsageStats: vi.fn(),
  mockGetModelPricing: vi.fn(),
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

// Mock the shared module that cost.ts imports from
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
    costControl: {
      getActiveBudgets: mockGetActiveBudgets,
      getBudget: mockGetBudget,
      upsertBudget: mockUpsertBudget,
      resetBudgetUsage: mockResetBudgetUsage,
      getRecentAlerts: mockGetRecentAlerts,
      acknowledgeAlert: mockAcknowledgeAlert,
      getUsageStats: mockGetUsageStats,
      getModelPricing: mockGetModelPricing,
    },
  }
})

// ---------------------------------------------------------------------------
// App Setup
// ---------------------------------------------------------------------------

import costRouter from '../routes/admin/cost.js'

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
  app.use('/', costRouter)
  return app
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_BUDGET = {
  id: 'daily-total',
  name: 'Daily Total Budget',
  budgetType: 'daily' as const,
  limitAmount: 50.0,
  currentUsage: 15.5,
  alertThresholdPercent: 80,
  actionOnExceed: 'warn' as const,
  appliesTo: 'all',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const MOCK_ALERT = {
  id: 'alert-001',
  budgetId: 'daily-total',
  budgetName: 'Daily Total Budget',
  alertType: 'threshold_warning' as const,
  currentUsage: 42.0,
  limitAmount: 50.0,
  percentUsed: 84,
  message: 'Budget is at 84%',
  createdAt: '2026-01-01T00:00:00Z',
  acknowledged: false,
}

const MOCK_USAGE_STATS = {
  totalCost: 25.5,
  totalRequests: 150,
  byProvider: {
    openai: { cost: 15.0, requests: 100 },
    anthropic: { cost: 10.5, requests: 50 },
  },
}

// ============================================================================
// TESTS
// ============================================================================

describe('Admin Cost Routes', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  // ==========================================================================
  // BUDGETS
  // ==========================================================================

  describe('GET /budgets', () => {
    it('returns active budgets', async () => {
      mockGetActiveBudgets.mockResolvedValue([MOCK_BUDGET])

      const res = await request(app).get('/budgets')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].name).toBe('Daily Total Budget')
    })

    it('logs the view action', async () => {
      mockGetActiveBudgets.mockResolvedValue([])

      await request(app).get('/budgets')

      expect(mockLogAdminAction).toHaveBeenCalledWith(expect.anything(), 'view', 'budgets')
    })

    it('returns 500 when service throws', async () => {
      mockGetActiveBudgets.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/budgets')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Failed to list budgets')
    })
  })

  describe('GET /budgets/:id', () => {
    it('returns a specific budget', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)

      const res = await request(app).get('/budgets/daily-total')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('daily-total')
    })

    it('returns 404 when budget not found', async () => {
      mockGetBudget.mockResolvedValue(null)

      const res = await request(app).get('/budgets/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Budget not found')
    })

    it('returns 500 on error', async () => {
      mockGetBudget.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/budgets/daily-total')

      expect(res.status).toBe(500)
    })
  })

  describe('POST /budgets', () => {
    it('creates a new budget', async () => {
      const newBudget = { ...MOCK_BUDGET, id: 'budget-new' }
      mockUpsertBudget.mockResolvedValue(newBudget)

      const res = await request(app).post('/budgets').send({
        name: 'Daily Total Budget',
        budgetType: 'daily',
        limitAmount: '50',
      })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockUpsertBudget).toHaveBeenCalledWith({
        name: 'Daily Total Budget',
        budgetType: 'daily',
        limitAmount: 50,
        alertThresholdPercent: 80,
        actionOnExceed: 'warn',
        appliesTo: 'all',
        isActive: true,
      })
    })

    it('passes custom optional fields', async () => {
      mockUpsertBudget.mockResolvedValue(MOCK_BUDGET)

      await request(app).post('/budgets').send({
        name: 'Custom Budget',
        budgetType: 'monthly',
        limitAmount: '500',
        alertThresholdPercent: 90,
        actionOnExceed: 'block',
        appliesTo: 'openai',
      })

      expect(mockUpsertBudget).toHaveBeenCalledWith({
        name: 'Custom Budget',
        budgetType: 'monthly',
        limitAmount: 500,
        alertThresholdPercent: 90,
        actionOnExceed: 'block',
        appliesTo: 'openai',
        isActive: true,
      })
    })

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/budgets')
        .send({ budgetType: 'daily', limitAmount: '50' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('required')
    })

    it('returns 400 when budgetType is missing', async () => {
      const res = await request(app).post('/budgets').send({ name: 'Budget', limitAmount: '50' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when limitAmount is missing', async () => {
      const res = await request(app).post('/budgets').send({ name: 'Budget', budgetType: 'daily' })

      expect(res.status).toBe(400)
    })

    it('logs the admin action on success', async () => {
      const newBudget = { ...MOCK_BUDGET, id: 'budget-new' }
      mockUpsertBudget.mockResolvedValue(newBudget)

      await request(app).post('/budgets').send({
        name: 'New Budget',
        budgetType: 'daily',
        limitAmount: '100',
      })

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'create',
        'budget',
        'budget-new',
        undefined,
        expect.objectContaining({ name: 'New Budget', limitAmount: '100' })
      )
    })

    it('returns 500 on error', async () => {
      mockUpsertBudget.mockRejectedValue(new Error('Insert error'))

      const res = await request(app).post('/budgets').send({
        name: 'Budget',
        budgetType: 'daily',
        limitAmount: '50',
      })

      expect(res.status).toBe(500)
    })
  })

  describe('PUT /budgets/:id', () => {
    it('updates a budget', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)
      const updatedBudget = { ...MOCK_BUDGET, limitAmount: 100 }
      mockUpsertBudget.mockResolvedValue(updatedBudget)

      const res = await request(app).put('/budgets/daily-total').send({ limitAmount: 100 })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('merges existing budget with updates', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)
      mockUpsertBudget.mockResolvedValue(MOCK_BUDGET)

      await request(app).put('/budgets/daily-total').send({ limitAmount: 100 })

      expect(mockUpsertBudget).toHaveBeenCalledWith(
        expect.objectContaining({
          ...MOCK_BUDGET,
          limitAmount: 100,
          id: 'daily-total',
        })
      )
    })

    it('returns 404 when budget not found', async () => {
      mockGetBudget.mockResolvedValue(null)

      const res = await request(app).put('/budgets/nonexistent').send({ limitAmount: 100 })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('logs admin action on success', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)
      mockUpsertBudget.mockResolvedValue(MOCK_BUDGET)

      await request(app).put('/budgets/daily-total').send({ limitAmount: 100 })

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'update',
        'budget',
        'daily-total',
        MOCK_BUDGET,
        { limitAmount: 100 }
      )
    })

    it('returns 500 on error', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)
      mockUpsertBudget.mockRejectedValue(new Error('Update error'))

      const res = await request(app).put('/budgets/daily-total').send({ limitAmount: 100 })

      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /budgets/:id', () => {
    it('deactivates a budget', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)
      mockUpsertBudget.mockResolvedValue({ ...MOCK_BUDGET, isActive: false })

      const res = await request(app).delete('/budgets/daily-total')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Budget deactivated')
    })

    it('calls upsertBudget with isActive=false', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)
      mockUpsertBudget.mockResolvedValue({ ...MOCK_BUDGET, isActive: false })

      await request(app).delete('/budgets/daily-total')

      expect(mockUpsertBudget).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
    })

    it('returns 404 when budget not found', async () => {
      mockGetBudget.mockResolvedValue(null)

      const res = await request(app).delete('/budgets/nonexistent')

      expect(res.status).toBe(404)
    })

    it('logs admin action', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)
      mockUpsertBudget.mockResolvedValue({ ...MOCK_BUDGET, isActive: false })

      await request(app).delete('/budgets/daily-total')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'delete',
        'budget',
        'daily-total'
      )
    })

    it('returns 500 on error', async () => {
      mockGetBudget.mockResolvedValue(MOCK_BUDGET)
      mockUpsertBudget.mockRejectedValue(new Error('Deactivate error'))

      const res = await request(app).delete('/budgets/daily-total')

      expect(res.status).toBe(500)
    })
  })

  describe('POST /budgets/:id/reset', () => {
    it('resets budget usage', async () => {
      mockResetBudgetUsage.mockResolvedValue(true)

      const res = await request(app).post('/budgets/daily-total/reset')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Budget usage reset')
    })

    it('returns 404 when budget not found', async () => {
      mockResetBudgetUsage.mockResolvedValue(false)

      const res = await request(app).post('/budgets/nonexistent/reset')

      expect(res.status).toBe(404)
    })

    it('logs admin action', async () => {
      mockResetBudgetUsage.mockResolvedValue(true)

      await request(app).post('/budgets/daily-total/reset')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'reset',
        'budget',
        'daily-total'
      )
    })

    it('returns 500 on error', async () => {
      mockResetBudgetUsage.mockRejectedValue(new Error('Reset error'))

      const res = await request(app).post('/budgets/daily-total/reset')

      expect(res.status).toBe(500)
    })
  })

  // ==========================================================================
  // COST ALERTS
  // ==========================================================================

  describe('GET /cost/alerts', () => {
    it('returns recent cost alerts with default limit', async () => {
      mockGetRecentAlerts.mockResolvedValue([MOCK_ALERT])

      const res = await request(app).get('/cost/alerts')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
      expect(mockGetRecentAlerts).toHaveBeenCalledWith(50)
    })

    it('passes custom limit', async () => {
      mockGetRecentAlerts.mockResolvedValue([])

      await request(app).get('/cost/alerts').query({ limit: '10' })

      expect(mockGetRecentAlerts).toHaveBeenCalledWith(10)
    })

    it('returns 500 on error', async () => {
      mockGetRecentAlerts.mockRejectedValue(new Error('Alerts error'))

      const res = await request(app).get('/cost/alerts')

      expect(res.status).toBe(500)
    })
  })

  describe('POST /cost/alerts/:id/acknowledge', () => {
    it('acknowledges a cost alert', async () => {
      mockAcknowledgeAlert.mockResolvedValue(true)

      const res = await request(app).post('/cost/alerts/alert-001/acknowledge')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Alert acknowledged')
    })

    it('passes admin email', async () => {
      mockAcknowledgeAlert.mockResolvedValue(true)

      await request(app).post('/cost/alerts/alert-001/acknowledge')

      expect(mockAcknowledgeAlert).toHaveBeenCalledWith('alert-001', 'admin@test.com')
    })

    it('returns 404 when alert not found', async () => {
      mockAcknowledgeAlert.mockResolvedValue(false)

      const res = await request(app).post('/cost/alerts/nonexistent/acknowledge')

      expect(res.status).toBe(404)
    })

    it('logs admin action on success', async () => {
      mockAcknowledgeAlert.mockResolvedValue(true)

      await request(app).post('/cost/alerts/alert-001/acknowledge')

      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        'acknowledge',
        'cost_alert',
        'alert-001'
      )
    })

    it('returns 500 on error', async () => {
      mockAcknowledgeAlert.mockRejectedValue(new Error('Ack error'))

      const res = await request(app).post('/cost/alerts/alert-001/acknowledge')

      expect(res.status).toBe(500)
    })
  })

  // ==========================================================================
  // USAGE STATISTICS
  // ==========================================================================

  describe('GET /cost/usage', () => {
    it('returns usage stats with default date range', async () => {
      mockGetUsageStats.mockResolvedValue(MOCK_USAGE_STATS)

      const res = await request(app).get('/cost/usage')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.totalCost).toBe(25.5)
    })

    it('passes custom date range', async () => {
      mockGetUsageStats.mockResolvedValue(MOCK_USAGE_STATS)

      await request(app)
        .get('/cost/usage')
        .query({ startDate: '2026-01-01', endDate: '2026-01-31' })

      expect(mockGetUsageStats).toHaveBeenCalledWith('2026-01-01', '2026-01-31')
    })

    it('returns 500 on error', async () => {
      mockGetUsageStats.mockRejectedValue(new Error('Stats error'))

      const res = await request(app).get('/cost/usage')

      expect(res.status).toBe(500)
    })
  })

  describe('GET /cost/summary', () => {
    it('returns cost summary dashboard data', async () => {
      mockGetActiveBudgets.mockResolvedValue([MOCK_BUDGET])
      mockGetUsageStats.mockResolvedValue(MOCK_USAGE_STATS)
      mockGetRecentAlerts.mockResolvedValue([MOCK_ALERT])

      const res = await request(app).get('/cost/summary')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.today).toBeDefined()
      expect(res.body.data.thisMonth).toBeDefined()
      expect(res.body.data.budgets).toBeDefined()
      expect(res.body.data.alerts).toBeDefined()
    })

    it('calculates budget status correctly - healthy', async () => {
      const healthyBudget = {
        ...MOCK_BUDGET,
        currentUsage: 10,
        limitAmount: 50,
        alertThresholdPercent: 80,
      }
      mockGetActiveBudgets.mockResolvedValue([healthyBudget])
      mockGetUsageStats.mockResolvedValue(MOCK_USAGE_STATS)
      mockGetRecentAlerts.mockResolvedValue([])

      const res = await request(app).get('/cost/summary')

      expect(res.body.data.budgets[0].status).toBe('healthy')
      expect(res.body.data.budgets[0].percentUsed).toBe(20)
    })

    it('calculates budget status correctly - warning', async () => {
      const warningBudget = {
        ...MOCK_BUDGET,
        currentUsage: 42,
        limitAmount: 50,
        alertThresholdPercent: 80,
      }
      mockGetActiveBudgets.mockResolvedValue([warningBudget])
      mockGetUsageStats.mockResolvedValue(MOCK_USAGE_STATS)
      mockGetRecentAlerts.mockResolvedValue([])

      const res = await request(app).get('/cost/summary')

      expect(res.body.data.budgets[0].status).toBe('warning')
    })

    it('calculates budget status correctly - critical', async () => {
      const criticalBudget = { ...MOCK_BUDGET, currentUsage: 55, limitAmount: 50 }
      mockGetActiveBudgets.mockResolvedValue([criticalBudget])
      mockGetUsageStats.mockResolvedValue(MOCK_USAGE_STATS)
      mockGetRecentAlerts.mockResolvedValue([])

      const res = await request(app).get('/cost/summary')

      expect(res.body.data.budgets[0].status).toBe('critical')
      expect(res.body.data.budgets[0].percentUsed).toBeCloseTo(110, 5)
    })

    it('counts unacknowledged alerts', async () => {
      const alerts = [
        { ...MOCK_ALERT, id: '1', acknowledged: false },
        { ...MOCK_ALERT, id: '2', acknowledged: true },
        { ...MOCK_ALERT, id: '3', acknowledged: false },
      ]
      mockGetActiveBudgets.mockResolvedValue([])
      mockGetUsageStats.mockResolvedValue(MOCK_USAGE_STATS)
      mockGetRecentAlerts.mockResolvedValue(alerts)

      const res = await request(app).get('/cost/summary')

      expect(res.body.data.alerts.total).toBe(3)
      expect(res.body.data.alerts.unacknowledged).toBe(2)
    })

    it('returns 500 on error', async () => {
      mockGetActiveBudgets.mockRejectedValue(new Error('Summary error'))

      const res = await request(app).get('/cost/summary')

      expect(res.status).toBe(500)
    })
  })

  describe('GET /cost/pricing', () => {
    it('returns pricing for all known models', async () => {
      mockGetModelPricing.mockReturnValue({ input: 0.0025, output: 0.01 })

      const res = await request(app).get('/cost/pricing')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.length).toBeGreaterThan(0)
      // Should include OpenAI, Anthropic, and Google models
      const modelNames = res.body.data.map((d: { model: string }) => d.model)
      expect(modelNames).toContain('gpt-4o')
      expect(modelNames).toContain('claude-3-5-sonnet')
      expect(modelNames).toContain('gemini-1.5-pro')
    })

    it('calls getModelPricing for each model', async () => {
      mockGetModelPricing.mockReturnValue({ input: 0.001, output: 0.002 })

      await request(app).get('/cost/pricing')

      // 16 models listed in the route (4 current + 12 legacy)
      expect(mockGetModelPricing).toHaveBeenCalledTimes(16)
    })

    it('includes pricing information for each model', async () => {
      mockGetModelPricing.mockReturnValue({ input: 0.003, output: 0.015 })

      const res = await request(app).get('/cost/pricing')

      res.body.data.forEach((entry: { model: string; pricing: unknown }) => {
        expect(entry.model).toBeDefined()
        expect(entry.pricing).toBeDefined()
      })
    })
  })
})
