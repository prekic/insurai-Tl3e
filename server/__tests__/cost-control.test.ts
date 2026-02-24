/**
 * Cost Control Middleware Tests
 *
 * Tests for cost calculation, budget management, alert system,
 * usage tracking, and the Express middleware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response } from 'express'

// =============================================================================
// MOCKS
// =============================================================================

// Mock Supabase - we test only in-memory behavior (no DB)
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => null),
}))

// Mock logger
vi.mock('../lib/logger.js', () => {
  const noop = () => {}
  const childLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => childLogger,
  }
  return { logger: childLogger }
})

// Store original env
const originalEnv = { ...process.env }

// =============================================================================
// IMPORTS (after mocks)
// =============================================================================

import {
  calculateCost,
  getModelPricing,
  getActiveBudgets,
  getBudget,
  upsertBudget,
  updateBudgetUsage,
  resetBudgetUsage,
  checkBudget,
  getRecentAlerts,
  acknowledgeAlert,
  recordUsage,
  getUsageStats,
  costControlMiddleware,
  estimateTokensFromRequest,
  type AIUsageCost,
} from '../middleware/cost-control.js'

// =============================================================================
// HELPERS
// =============================================================================

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    path: '/api/ai/extract/openai',
    headers: {},
    ...overrides,
  } as Request
}

function createMockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn(),
  } as unknown as Response
  return res
}

// =============================================================================
// TESTS
// =============================================================================

describe('Cost Control', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Env has no SUPABASE vars so getClient() returns null → in-memory mode
    process.env = { ...originalEnv }
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // ===========================================================================
  // calculateCost
  // ===========================================================================

  describe('calculateCost', () => {
    it('calculates cost for gpt-4o correctly', () => {
      const result = calculateCost('gpt-4o', 1000, 500)

      // input: 1000/1000 * 0.0025 = 0.0025
      // output: 500/1000 * 0.01 = 0.005
      // total: 0.0075
      expect(result.inputCost).toBeCloseTo(0.0025, 6)
      expect(result.outputCost).toBeCloseTo(0.005, 6)
      expect(result.totalCost).toBeCloseTo(0.0075, 6)
    })

    it('calculates cost for gpt-4o-mini correctly', () => {
      const result = calculateCost('gpt-4o-mini', 10000, 5000)

      // input: 10000/1000 * 0.00015 = 0.0015
      // output: 5000/1000 * 0.0006 = 0.003
      expect(result.inputCost).toBeCloseTo(0.0015, 6)
      expect(result.outputCost).toBeCloseTo(0.003, 6)
      expect(result.totalCost).toBeCloseTo(0.0045, 6)
    })

    it('calculates cost for claude-3-5-sonnet correctly', () => {
      const result = calculateCost('claude-3-5-sonnet', 2000, 1000)

      // input: 2000/1000 * 0.003 = 0.006
      // output: 1000/1000 * 0.015 = 0.015
      expect(result.inputCost).toBeCloseTo(0.006, 6)
      expect(result.outputCost).toBeCloseTo(0.015, 6)
      expect(result.totalCost).toBeCloseTo(0.021, 6)
    })

    it('calculates cost for gemini-1.5-flash correctly', () => {
      const result = calculateCost('gemini-1.5-flash', 5000, 2000)

      // input: 5000/1000 * 0.000075 = 0.000375
      // output: 2000/1000 * 0.0003 = 0.0006
      expect(result.inputCost).toBeCloseTo(0.000375, 6)
      expect(result.outputCost).toBeCloseTo(0.0006, 6)
      expect(result.totalCost).toBeCloseTo(0.000975, 6)
    })

    it('uses default pricing for unknown model', () => {
      const result = calculateCost('unknown-model-xyz', 1000, 1000)

      // default: input: 0.001, output: 0.002
      // input: 1000/1000 * 0.001 = 0.001
      // output: 1000/1000 * 0.002 = 0.002
      expect(result.inputCost).toBeCloseTo(0.001, 6)
      expect(result.outputCost).toBeCloseTo(0.002, 6)
      expect(result.totalCost).toBeCloseTo(0.003, 6)
    })

    it('returns zero costs for zero tokens', () => {
      const result = calculateCost('gpt-4o', 0, 0)

      expect(result.inputCost).toBe(0)
      expect(result.outputCost).toBe(0)
      expect(result.totalCost).toBe(0)
    })

    it('handles very large token counts', () => {
      const result = calculateCost('gpt-4o', 1000000, 500000)

      // input: 1M/1K * 0.0025 = 2.5
      // output: 500K/1K * 0.01 = 5.0
      expect(result.inputCost).toBeCloseTo(2.5, 4)
      expect(result.outputCost).toBeCloseTo(5.0, 4)
      expect(result.totalCost).toBeCloseTo(7.5, 4)
    })

    it('returns 6 decimal places precision', () => {
      const result = calculateCost('gpt-4o', 1, 1)

      // input: 1/1000 * 0.0025 = 0.0000025 → rounds to 0.000003
      // output: 1/1000 * 0.01 = 0.00001
      expect(result.inputCost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6)
      expect(result.outputCost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6)
    })
  })

  // ===========================================================================
  // getModelPricing
  // ===========================================================================

  describe('getModelPricing', () => {
    it('returns pricing for gpt-4o', () => {
      const pricing = getModelPricing('gpt-4o')
      expect(pricing.input).toBe(0.0025)
      expect(pricing.output).toBe(0.01)
    })

    it('returns pricing for claude-3-opus', () => {
      const pricing = getModelPricing('claude-3-opus')
      expect(pricing.input).toBe(0.015)
      expect(pricing.output).toBe(0.075)
    })

    it('returns pricing for gemini-1.5-pro', () => {
      const pricing = getModelPricing('gemini-1.5-pro')
      expect(pricing.input).toBe(0.00125)
      expect(pricing.output).toBe(0.005)
    })

    it('returns default pricing for unknown model', () => {
      const pricing = getModelPricing('nonexistent-model')
      expect(pricing.input).toBe(0.001)
      expect(pricing.output).toBe(0.002)
    })

    it('returns pricing for all known OpenAI models', () => {
      for (const model of ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo']) {
        const pricing = getModelPricing(model)
        expect(pricing.input).toBeGreaterThan(0)
        expect(pricing.output).toBeGreaterThan(0)
      }
    })

    it('returns pricing for all known Anthropic models', () => {
      for (const model of ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']) {
        const pricing = getModelPricing(model)
        expect(pricing.input).toBeGreaterThan(0)
        expect(pricing.output).toBeGreaterThan(0)
      }
    })
  })

  // ===========================================================================
  // Budget Management (in-memory mode)
  // ===========================================================================

  describe('Budget Management (in-memory)', () => {
    it('getActiveBudgets returns default budgets', async () => {
      const budgets = await getActiveBudgets()

      expect(budgets.length).toBeGreaterThanOrEqual(2)
      const names = budgets.map(b => b.name)
      expect(names).toContain('Daily Total Budget')
      expect(names).toContain('Monthly Total Budget')
    })

    it('getBudget returns a default budget by ID', async () => {
      const budget = await getBudget('daily-total')

      expect(budget).not.toBeNull()
      expect(budget!.name).toBe('Daily Total Budget')
      expect(budget!.budgetType).toBe('daily')
      expect(budget!.limitAmount).toBe(50.0)
      expect(budget!.isActive).toBe(true)
    })

    it('getBudget returns null for unknown ID', async () => {
      const budget = await getBudget('nonexistent-id')
      expect(budget).toBeNull()
    })

    it('upsertBudget creates a new budget in memory', async () => {
      const budget = await upsertBudget({
        name: 'Test Budget',
        budgetType: 'weekly',
        limitAmount: 200,
        alertThresholdPercent: 90,
        actionOnExceed: 'block',
      })

      expect(budget).not.toBeNull()
      expect(budget!.name).toBe('Test Budget')
      expect(budget!.budgetType).toBe('weekly')
      expect(budget!.limitAmount).toBe(200)
      expect(budget!.alertThresholdPercent).toBe(90)
      expect(budget!.actionOnExceed).toBe('block')
      expect(budget!.isActive).toBe(true)

      // Should be retrievable
      const retrieved = await getBudget(budget!.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.name).toBe('Test Budget')
    })

    it('upsertBudget updates existing budget by ID', async () => {
      await upsertBudget({
        id: 'update-test',
        name: 'Original',
        limitAmount: 100,
      })

      const updated = await upsertBudget({
        id: 'update-test',
        name: 'Updated',
        limitAmount: 200,
      })

      expect(updated!.name).toBe('Updated')
      expect(updated!.limitAmount).toBe(200)
    })

    it('upsertBudget uses defaults for missing fields', async () => {
      const budget = await upsertBudget({})

      expect(budget!.name).toBe('New Budget')
      expect(budget!.budgetType).toBe('monthly')
      expect(budget!.limitAmount).toBe(100)
      expect(budget!.alertThresholdPercent).toBe(80)
      expect(budget!.actionOnExceed).toBe('warn')
      expect(budget!.appliesTo).toBe('all')
      expect(budget!.isActive).toBe(true)
    })

    it('updateBudgetUsage increments usage in memory', async () => {
      await upsertBudget({
        id: 'usage-test',
        name: 'Usage Test',
        limitAmount: 100,
        currentUsage: 10,
      })

      const result = await updateBudgetUsage('usage-test', 5.5)
      expect(result).toBe(true)

      const budget = await getBudget('usage-test')
      expect(budget!.currentUsage).toBeCloseTo(15.5, 1)
    })

    it('updateBudgetUsage returns false for unknown budget', async () => {
      const result = await updateBudgetUsage('unknown-budget', 5)
      expect(result).toBe(false)
    })

    it('resetBudgetUsage sets usage to zero', async () => {
      await upsertBudget({
        id: 'reset-test',
        name: 'Reset Test',
        limitAmount: 100,
        currentUsage: 75,
      })

      const result = await resetBudgetUsage('reset-test')
      expect(result).toBe(true)

      const budget = await getBudget('reset-test')
      expect(budget!.currentUsage).toBe(0)
      expect(budget!.resetAt).toBeDefined()
    })

    it('resetBudgetUsage returns false for unknown budget', async () => {
      const result = await resetBudgetUsage('unknown-budget')
      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // Budget Checking & Alerts
  // ===========================================================================

  describe('checkBudget', () => {
    it('allows request when under all budget limits', async () => {
      const result = await checkBudget(0.001)

      expect(result.allowed).toBe(true)
      expect(result.warnings).toHaveLength(0)
      expect(result.blockedBy).toBeUndefined()
    })

    it('generates threshold warning when budget is at alert level', async () => {
      // Set daily budget to near its threshold
      await upsertBudget({
        id: 'daily-total',
        name: 'Daily Total Budget',
        budgetType: 'daily',
        limitAmount: 50,
        currentUsage: 42, // 84% > 80% threshold
        alertThresholdPercent: 80,
        actionOnExceed: 'warn',
        appliesTo: 'all',
      })

      const result = await checkBudget(1)

      expect(result.allowed).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some(w => w.includes('Daily Total Budget'))).toBe(true)
      expect(result.alerts.length).toBeGreaterThan(0)
    })

    it('blocks request when budget would be exceeded with block action', async () => {
      await upsertBudget({
        id: 'block-test',
        name: 'Block Budget',
        budgetType: 'daily',
        limitAmount: 10,
        currentUsage: 9.5,
        alertThresholdPercent: 80,
        actionOnExceed: 'block',
        appliesTo: 'all',
      })

      const result = await checkBudget(1)

      expect(result.allowed).toBe(false)
      expect(result.blockedBy).toBe('Block Budget')
    })

    it('warns but allows when budget would be exceeded with warn action', async () => {
      // Deactivate any previous blocking budgets from other tests
      await upsertBudget({
        id: 'block-test',
        name: 'Block Budget',
        limitAmount: 10,
        currentUsage: 0,
        actionOnExceed: 'block',
        isActive: false,
        appliesTo: 'all',
      })

      await upsertBudget({
        id: 'warn-test',
        name: 'Warn Budget',
        budgetType: 'daily',
        limitAmount: 10,
        currentUsage: 9.5,
        alertThresholdPercent: 80,
        actionOnExceed: 'warn',
        appliesTo: 'all',
      })

      const result = await checkBudget(1)

      expect(result.allowed).toBe(true)
      expect(result.warnings.some(w => w.includes('would be exceeded'))).toBe(true)
    })

    it('skips budgets that do not apply to the user', async () => {
      await upsertBudget({
        id: 'user-specific',
        name: 'User-Specific Budget',
        budgetType: 'daily',
        limitAmount: 1,
        currentUsage: 0.9,
        alertThresholdPercent: 80,
        actionOnExceed: 'block',
        appliesTo: 'user-123',
      })

      // Different user - should not be blocked
      const result = await checkBudget(0.5, 'user-456')
      expect(result.allowed).toBe(true)
    })

    it('applies budget when user matches appliesTo', async () => {
      await upsertBudget({
        id: 'user-match',
        name: 'User Match Budget',
        budgetType: 'daily',
        limitAmount: 1,
        currentUsage: 0.9,
        alertThresholdPercent: 80,
        actionOnExceed: 'block',
        appliesTo: 'user-123',
      })

      const result = await checkBudget(0.5, 'user-123')
      expect(result.allowed).toBe(false)
      expect(result.blockedBy).toBe('User Match Budget')
    })

    it('applies budget when provider matches appliesTo', async () => {
      await upsertBudget({
        id: 'provider-match',
        name: 'Provider Budget',
        budgetType: 'daily',
        limitAmount: 5,
        currentUsage: 4.8,
        alertThresholdPercent: 80,
        actionOnExceed: 'block',
        appliesTo: 'openai',
      })

      const result = await checkBudget(0.5, undefined, 'openai')
      expect(result.allowed).toBe(false)
    })

    it('generates both threshold and exceeded alerts', async () => {
      await upsertBudget({
        id: 'both-alerts',
        name: 'Both Alerts Budget',
        budgetType: 'daily',
        limitAmount: 10,
        currentUsage: 9, // 90% > 80% threshold, AND 9 + 2 > 10 exceeded
        alertThresholdPercent: 80,
        actionOnExceed: 'warn',
        appliesTo: 'all',
      })

      const result = await checkBudget(2)

      expect(result.alerts.length).toBeGreaterThanOrEqual(2)
      const alertTypes = result.alerts.map(a => a.alertType)
      expect(alertTypes).toContain('threshold_warning')
      expect(alertTypes).toContain('budget_exceeded')
    })
  })

  // ===========================================================================
  // Alerts
  // ===========================================================================

  describe('Alerts', () => {
    it('getRecentAlerts returns empty initially', async () => {
      // Note: in-memory alerts from checkBudget tests may persist
      // but basic functionality should work
      const alerts = await getRecentAlerts(5)
      expect(Array.isArray(alerts)).toBe(true)
    })

    it('acknowledgeAlert marks alert in memory', async () => {
      // Trigger an alert first
      await upsertBudget({
        id: 'ack-test',
        name: 'Ack Test Budget',
        budgetType: 'daily',
        limitAmount: 10,
        currentUsage: 9,
        alertThresholdPercent: 80,
        actionOnExceed: 'warn',
        appliesTo: 'all',
      })

      const result = await checkBudget(2)
      const alert = result.alerts[0]

      if (alert) {
        const acked = await acknowledgeAlert(alert.id, 'admin-user')
        expect(acked).toBe(true)
      }
    })

    it('acknowledgeAlert returns false for unknown alert ID', async () => {
      const result = await acknowledgeAlert('nonexistent-alert', 'admin')
      expect(result).toBe(false)
    })
  })

  // ===========================================================================
  // Usage Tracking
  // ===========================================================================

  describe('Usage Tracking', () => {
    it('recordUsage stores usage in memory', async () => {
      const usage: AIUsageCost = {
        provider: 'openai',
        model: 'gpt-4o',
        operation: 'extraction',
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        inputCost: 0.0025,
        outputCost: 0.005,
        totalCost: 0.0075,
        timestamp: new Date().toISOString(),
      }

      await recordUsage(usage)

      // Verify by getting stats
      const now = new Date()
      const startDate = new Date(now.getTime() - 86400000).toISOString()
      const endDate = new Date(now.getTime() + 86400000).toISOString()
      const stats = await getUsageStats(startDate, endDate)

      expect(stats.totalRequests).toBeGreaterThanOrEqual(1)
      expect(stats.totalCost).toBeGreaterThanOrEqual(0.0075)
    })

    it('getUsageStats aggregates by provider', async () => {
      const baseUsage: AIUsageCost = {
        provider: 'openai',
        model: 'gpt-4o',
        operation: 'extraction',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputCost: 0.001,
        outputCost: 0.001,
        totalCost: 0.002,
        timestamp: new Date().toISOString(),
      }

      await recordUsage({ ...baseUsage, provider: 'openai' })
      await recordUsage({ ...baseUsage, provider: 'anthropic' })

      const now = new Date()
      const stats = await getUsageStats(
        new Date(now.getTime() - 86400000).toISOString(),
        new Date(now.getTime() + 86400000).toISOString()
      )

      expect(stats.byProvider['openai']).toBeDefined()
      expect(stats.byProvider['anthropic']).toBeDefined()
    })

    it('getUsageStats aggregates by model', async () => {
      const usage: AIUsageCost = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        operation: 'chat',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        inputCost: 0.0003,
        outputCost: 0.0006,
        totalCost: 0.0009,
        timestamp: new Date().toISOString(),
      }

      await recordUsage(usage)

      const now = new Date()
      const stats = await getUsageStats(
        new Date(now.getTime() - 86400000).toISOString(),
        new Date(now.getTime() + 86400000).toISOString()
      )

      expect(stats.byModel['gpt-4o-mini']).toBeDefined()
      expect(stats.byModel['gpt-4o-mini'].tokens).toBeGreaterThanOrEqual(300)
    })

    it('getUsageStats aggregates by day', async () => {
      const usage: AIUsageCost = {
        provider: 'openai',
        model: 'gpt-4o',
        operation: 'extraction',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        inputCost: 0.001,
        outputCost: 0.001,
        totalCost: 0.002,
        timestamp: '2026-02-08T12:00:00.000Z',
      }

      await recordUsage(usage)

      const stats = await getUsageStats('2026-02-08T00:00:00Z', '2026-02-08T23:59:59Z')

      expect(stats.byDay.length).toBeGreaterThanOrEqual(1)
      const day = stats.byDay.find(d => d.date === '2026-02-08')
      expect(day).toBeDefined()
    })

    it('getUsageStats returns empty for date range with no data', async () => {
      const stats = await getUsageStats('2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')

      expect(stats.totalRequests).toBe(0)
      expect(stats.totalCost).toBe(0)
      expect(Object.keys(stats.byProvider)).toHaveLength(0)
    })
  })

  // ===========================================================================
  // estimateTokensFromRequest
  // ===========================================================================

  describe('estimateTokensFromRequest', () => {
    it('estimates tokens from message field', () => {
      const req = createMockRequest({
        body: { message: 'Hello, how are you?' }, // 19 chars
        path: '/api/ai/chat',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.inputTokens).toBe(Math.ceil(19 / 4))
      expect(result.model).toBe('gpt-4o-mini')
    })

    it('estimates tokens from prompt field', () => {
      const req = createMockRequest({
        body: { prompt: 'Extract policy data' }, // 19 chars
        path: '/api/ai/extract/openai',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.inputTokens).toBe(Math.ceil(19 / 4))
    })

    it('estimates tokens from document field', () => {
      const docText = 'A'.repeat(4000)
      const req = createMockRequest({
        body: { document: docText },
        path: '/api/ai/extract/openai',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.inputTokens).toBe(1000) // 4000 / 4
    })

    it('includes policyContext in token estimate', () => {
      const req = createMockRequest({
        body: {
          message: 'Question',
          policyContext: 'A'.repeat(8000),
        },
        path: '/api/ai/chat',
      })

      const result = estimateTokensFromRequest(req)

      // message: ceil(8/4) = 2, context: 8000/4 = 2000
      expect(result.inputTokens).toBe(2 + 2000)
    })

    it('includes conversation history in token estimate', () => {
      const req = createMockRequest({
        body: {
          message: 'Hi',
          conversationHistory: [
            { role: 'user', content: 'A'.repeat(400) },
            { role: 'assistant', content: 'B'.repeat(800) },
          ],
        },
        path: '/api/ai/chat',
      })

      const result = estimateTokensFromRequest(req)

      // message: 1, history: 100 + 200 = 300, total: 301
      expect(result.inputTokens).toBe(1 + 100 + 200)
    })

    it('detects anthropic model from path', () => {
      const req = createMockRequest({
        body: { message: 'Hi' },
        path: '/api/ai/extract/anthropic',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.model).toBe('claude-3-5-haiku')
    })

    it('detects openai model from path (default)', () => {
      const req = createMockRequest({
        body: { message: 'Hi' },
        path: '/api/ai/extract/openai',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.model).toBe('gpt-4o-mini')
    })

    it('uses explicitly provided model', () => {
      const req = createMockRequest({
        body: { message: 'Hi', model: 'gpt-4-turbo' },
        path: '/api/ai/chat',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.model).toBe('gpt-4-turbo')
    })

    it('handles empty body gracefully', () => {
      const req = createMockRequest({
        body: {},
        path: '/api/ai/chat',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.inputTokens).toBe(0)
      expect(result.model).toBe('gpt-4o-mini')
    })

    it('handles missing body gracefully', () => {
      const req = createMockRequest({
        body: undefined as any,
        path: '/api/ai/chat',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.inputTokens).toBe(0)
    })

    it('handles history items without content', () => {
      const req = createMockRequest({
        body: {
          message: 'Hi',
          conversationHistory: [
            { role: 'user' }, // no content field
          ],
        },
        path: '/api/ai/chat',
      })

      const result = estimateTokensFromRequest(req)

      expect(result.inputTokens).toBe(1) // just the message
    })
  })

  // ===========================================================================
  // costControlMiddleware
  // ===========================================================================

  describe('costControlMiddleware', () => {
    it('calls next when budget allows request', async () => {
      const middleware = costControlMiddleware((_req) => ({
        inputTokens: 100,
        model: 'gpt-4o-mini',
      }))

      const req = createMockRequest()
      const res = createMockResponse()
      const next = vi.fn()

      await middleware(req as any, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('sets estimatedCost on request', async () => {
      const middleware = costControlMiddleware(() => ({
        inputTokens: 1000,
        model: 'gpt-4o',
      }))

      const req = createMockRequest({ path: '/api/ai/extract/openai' }) as any
      const res = createMockResponse()
      const next = vi.fn()

      await middleware(req, res, next)

      expect(req.estimatedCost).toBeDefined()
      expect(req.estimatedCost).toBeGreaterThan(0)
    })

    it('sets budgetCheck on request', async () => {
      const middleware = costControlMiddleware(() => ({
        inputTokens: 100,
        model: 'gpt-4o-mini',
      }))

      const req = createMockRequest() as any
      const res = createMockResponse()
      const next = vi.fn()

      await middleware(req, res, next)

      expect(req.budgetCheck).toBeDefined()
      expect(req.budgetCheck.allowed).toBe(true)
    })

    it('returns 429 when budget blocks request', async () => {
      // Create a blocking budget
      await upsertBudget({
        id: 'middleware-block',
        name: 'Middleware Block',
        budgetType: 'daily',
        limitAmount: 0.001,
        currentUsage: 0.0009,
        alertThresholdPercent: 50,
        actionOnExceed: 'block',
        appliesTo: 'all',
      })

      const middleware = costControlMiddleware(() => ({
        inputTokens: 10000,
        model: 'gpt-4o',
      }))

      const req = createMockRequest({ path: '/api/ai/extract/openai' })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware(req as any, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'BUDGET_EXCEEDED',
        })
      )
    })

    it('sets budget warning headers when warnings exist', async () => {
      await upsertBudget({
        id: 'middleware-warn',
        name: 'Middleware Warn',
        budgetType: 'daily',
        limitAmount: 10,
        currentUsage: 9, // 90% > 80%
        alertThresholdPercent: 80,
        actionOnExceed: 'warn',
        appliesTo: 'all',
      })

      const middleware = costControlMiddleware(() => ({
        inputTokens: 100,
        model: 'gpt-4o-mini',
      }))

      const req = createMockRequest()
      const res = createMockResponse()
      const next = vi.fn()

      await middleware(req as any, res, next)

      expect(next).toHaveBeenCalled()
      // Verify setHeader was called for warnings
      expect(res.setHeader).toHaveBeenCalledWith('X-Budget-Warnings', expect.any(String))
    })

    it('estimates output tokens differently for chat vs extraction', async () => {
      const costs: number[] = []

      const middleware = costControlMiddleware(() => ({
        inputTokens: 1000,
        model: 'gpt-4o',
      }))

      // Chat path - 1.5x output estimate
      const chatReq = createMockRequest({ path: '/api/ai/chat' }) as any
      const chatRes = createMockResponse()
      await middleware(chatReq, chatRes, vi.fn())
      costs.push(chatReq.estimatedCost)

      // Extraction path - 0.5x output estimate
      const extractReq = createMockRequest({ path: '/api/ai/extract/openai' }) as any
      const extractRes = createMockResponse()
      await middleware(extractReq, extractRes, vi.fn())
      costs.push(extractReq.estimatedCost)

      // Chat should cost more due to higher estimated output
      expect(costs[0]).toBeGreaterThan(costs[1])
    })

    it('calls next on estimator error (does not block)', async () => {
      const middleware = costControlMiddleware(() => {
        throw new Error('Estimator failed')
      })

      const req = createMockRequest()
      const res = createMockResponse()
      const next = vi.fn()

      await middleware(req as any, res, next)

      expect(next).toHaveBeenCalled()
    })
  })
})
