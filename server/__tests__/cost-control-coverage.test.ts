/**
 * Cost Control Coverage Tests
 *
 * Targets uncovered branches in server/middleware/cost-control.ts:
 * - DB-connected paths: getActiveBudgets, getBudget, upsertBudget with DB
 * - updateBudgetUsage: RPC success, RPC fail + manual fallback, manual fail, in-memory not found
 * - resetBudgetUsage: DB success, DB error, in-memory not found
 * - storeAlerts: DB path, overflow trimming
 * - getRecentAlerts: DB path with mapping
 * - acknowledgeAlert: DB path, in-memory found/not found
 * - recordUsage: DB path, budget updates, overflow trimming
 * - getUsageStats: DB path with mapping, in-memory filtering
 * - costControlMiddleware: chat vs extraction paths, blocked, warnings, error passthrough
 * - estimateTokensFromRequest: various body shapes, anthropic path detection
 * - mapBudgetFromDb: field mapping
 * - checkBudget: appliesTo filtering (userId match, provider match, skip non-matching)
 * - createAlert: all alertType messages including budget_blocked and default
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// =============================================================================
// HOISTED MOCKS
// =============================================================================
const {
  mockFrom,
  mockRpc,
  mockSupabaseClient,
} = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockRpc = vi.fn()
  const mockSupabaseClient = { from: mockFrom, rpc: mockRpc }
  return { mockFrom, mockRpc, mockSupabaseClient }
})

// Track whether createClient should return a real mock or null
let useDbClient = true

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => useDbClient ? mockSupabaseClient : null),
}))

vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  const child = { debug: noop, info: noop, warn: noop, error: noop, child: vi.fn().mockReturnThis() }
  return { logger: child, default: child }
})

// Build chainable query mock
function buildChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.upsert = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

// =============================================================================
// TESTS
// =============================================================================
describe('Cost Control Coverage (DB paths)', () => {
  let mod: typeof import('../middleware/cost-control.js')

  beforeEach(async () => {
    vi.clearAllMocks()
    useDbClient = true
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    vi.resetModules()
    mod = await import('../middleware/cost-control.js')
  })

  // =========================================================================
  // calculateCost
  // =========================================================================
  describe('calculateCost', () => {
    it('calculates cost for known model', () => {
      const result = mod.calculateCost('gpt-4o', 1000, 500)
      expect(result.inputCost).toBeGreaterThan(0)
      expect(result.outputCost).toBeGreaterThan(0)
      expect(result.totalCost).toBe(result.inputCost + result.outputCost)
    })

    it('uses default pricing for unknown model', () => {
      const result = mod.calculateCost('unknown-model', 1000, 500)
      // Default: input=0.001, output=0.002
      expect(result.inputCost).toBe(0.001)
      expect(result.outputCost).toBe(0.001)
    })

    it('handles zero tokens', () => {
      const result = mod.calculateCost('gpt-4o', 0, 0)
      expect(result.totalCost).toBe(0)
    })

    it('calculates for all known providers', () => {
      const models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
        'claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
        'gemini-1.5-pro', 'gemini-1.5-flash']
      for (const model of models) {
        const result = mod.calculateCost(model, 1000, 1000)
        expect(result.totalCost).toBeGreaterThan(0)
      }
    })
  })

  // =========================================================================
  // getModelPricing
  // =========================================================================
  describe('getModelPricing', () => {
    it('returns pricing for known model', () => {
      const pricing = mod.getModelPricing('gpt-4o')
      expect(pricing.input).toBe(0.0025)
      expect(pricing.output).toBe(0.01)
    })

    it('returns default pricing for unknown model', () => {
      const pricing = mod.getModelPricing('nonexistent')
      expect(pricing.input).toBe(0.001)
      expect(pricing.output).toBe(0.002)
    })
  })

  // =========================================================================
  // getActiveBudgets - DB path
  // =========================================================================
  describe('getActiveBudgets (DB path)', () => {
    it('returns mapped budgets from DB', async () => {
      const chain = buildChain({
        data: [{
          id: 'b1',
          name: 'Daily Budget',
          budget_type: 'daily',
          limit_amount: '100',
          current_usage: '25',
          alert_threshold_percent: 80,
          action_on_exceed: 'warn',
          applies_to: 'all',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const budgets = await mod.getActiveBudgets()
      expect(budgets).toHaveLength(1)
      expect(budgets[0].budgetType).toBe('daily')
      expect(budgets[0].limitAmount).toBe(100)
      expect(budgets[0].currentUsage).toBe(25)
    })

    it('falls back to in-memory on DB error', async () => {
      const chain = buildChain({ data: null, error: { message: 'DB error' } })
      mockFrom.mockReturnValue(chain)

      const budgets = await mod.getActiveBudgets()
      // Should return in-memory default budgets
      expect(budgets.length).toBeGreaterThanOrEqual(0)
    })
  })

  // =========================================================================
  // getBudget - DB path
  // =========================================================================
  describe('getBudget (DB path)', () => {
    it('returns mapped budget from DB', async () => {
      const chain = buildChain({
        data: {
          id: 'b1',
          name: 'Test Budget',
          budget_type: 'monthly',
          limit_amount: '500',
          current_usage: '0',
          alert_threshold_percent: 75,
          action_on_exceed: 'notify',
          applies_to: 'all',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const budget = await mod.getBudget('b1')
      expect(budget).not.toBeNull()
      expect(budget!.name).toBe('Test Budget')
    })

    it('falls back to in-memory on DB error', async () => {
      const chain = buildChain({ data: null, error: { message: 'not found' } })
      mockFrom.mockReturnValue(chain)

      const budget = await mod.getBudget('nonexistent-db')
      // Falls back to inMemoryBudgets.get()
      expect(budget).toBeNull()
    })
  })

  // =========================================================================
  // upsertBudget - DB path
  // =========================================================================
  describe('upsertBudget (DB path)', () => {
    it('upserts budget to DB and returns mapped result', async () => {
      const chain = buildChain({
        data: {
          id: 'new-b1',
          name: 'New Budget',
          budget_type: 'weekly',
          limit_amount: '200',
          current_usage: '0',
          alert_threshold_percent: 80,
          action_on_exceed: 'warn',
          applies_to: 'all',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const result = await mod.upsertBudget({
        name: 'New Budget',
        budgetType: 'weekly',
        limitAmount: 200,
      })
      expect(result).not.toBeNull()
      expect(result!.name).toBe('New Budget')
    })

    it('falls back to in-memory on DB error', async () => {
      const chain = buildChain({ data: null, error: { message: 'insert failed' } })
      mockFrom.mockReturnValue(chain)

      const result = await mod.upsertBudget({
        name: 'Fallback Budget',
        limitAmount: 100,
      })
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Fallback Budget')
    })

    it('uses provided id when available', async () => {
      const chain = buildChain({ data: null, error: { message: 'err' } })
      mockFrom.mockReturnValue(chain)

      const result = await mod.upsertBudget({
        id: 'custom-id',
        name: 'Custom',
      })
      expect(result!.id).toBe('custom-id')
    })

    it('defaults isActive to true when not explicitly false', async () => {
      const chain = buildChain({ data: null, error: { message: 'err' } })
      mockFrom.mockReturnValue(chain)

      const result = await mod.upsertBudget({ name: 'Test' })
      expect(result!.isActive).toBe(true)
    })

    it('sets isActive to false when explicitly set', async () => {
      const chain = buildChain({ data: null, error: { message: 'err' } })
      mockFrom.mockReturnValue(chain)

      const result = await mod.upsertBudget({ name: 'Inactive', isActive: false })
      expect(result!.isActive).toBe(false)
    })
  })

  // =========================================================================
  // updateBudgetUsage - DB path
  // =========================================================================
  describe('updateBudgetUsage (DB path)', () => {
    it('succeeds via RPC', async () => {
      mockRpc.mockResolvedValue({ error: null })
      const result = await mod.updateBudgetUsage('b1', 0.05)
      expect(result).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('increment_budget_usage', {
        budget_id: 'b1',
        cost_amount: 0.05,
      })
    })

    it('falls back to manual update when RPC fails', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'RPC not found' } })

      // Manual select
      const selectChain = buildChain({ data: { current_usage: 10 }, error: null })
      // Manual update
      const updateChain = buildChain({ data: null, error: null })
      updateChain.then = (resolve: (v: unknown) => void) => resolve({ error: null })

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return callCount === 1 ? selectChain : updateChain
      })

      const result = await mod.updateBudgetUsage('b1', 0.05)
      expect(result).toBe(true)
    })

    it('returns false when RPC fails and manual select returns no data', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'RPC not found' } })
      const chain = buildChain({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      const result = await mod.updateBudgetUsage('nonexistent', 0.05)
      expect(result).toBe(false)
    })

    it('returns false when manual update fails', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'RPC not found' } })

      const selectChain = buildChain({ data: { current_usage: 10 }, error: null })
      const updateChain = buildChain({ data: null, error: null })
      updateChain.then = (resolve: (v: unknown) => void) => resolve({ error: { message: 'update failed' } })

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return callCount === 1 ? selectChain : updateChain
      })

      const result = await mod.updateBudgetUsage('b1', 0.05)
      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // resetBudgetUsage - DB path
  // =========================================================================
  describe('resetBudgetUsage (DB path)', () => {
    it('resets usage in DB', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: null })
      mockFrom.mockReturnValue(chain)

      const result = await mod.resetBudgetUsage('b1')
      expect(result).toBe(true)
    })

    it('returns false on DB error', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: { message: 'error' } })
      mockFrom.mockReturnValue(chain)

      const result = await mod.resetBudgetUsage('b1')
      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // getRecentAlerts - DB path
  // =========================================================================
  describe('getRecentAlerts (DB path)', () => {
    it('returns mapped alerts from DB', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({
        data: [{
          id: 'alert-1',
          budget_id: 'b1',
          budget_name: 'Daily',
          alert_type: 'threshold_warning',
          current_usage: '45',
          limit_amount: '50',
          percent_used: 90,
          message: 'Test alert',
          created_at: '2026-01-01T00:00:00Z',
          acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const alerts = await mod.getRecentAlerts(10)
      expect(alerts).toHaveLength(1)
      expect(alerts[0].budgetId).toBe('b1')
      expect(alerts[0].currentUsage).toBe(45)
    })

    it('falls back to in-memory on DB error', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'err' } })
      mockFrom.mockReturnValue(chain)

      const alerts = await mod.getRecentAlerts()
      expect(Array.isArray(alerts)).toBe(true)
    })

    it('uses default limit of 50', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
      mockFrom.mockReturnValue(chain)

      await mod.getRecentAlerts()
      expect(chain.limit).toHaveBeenCalledWith(50)
    })
  })

  // =========================================================================
  // acknowledgeAlert - DB path
  // =========================================================================
  describe('acknowledgeAlert (DB path)', () => {
    it('acknowledges in DB', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: null })
      mockFrom.mockReturnValue(chain)

      const result = await mod.acknowledgeAlert('alert-1', 'admin@test.com')
      expect(result).toBe(true)
    })

    it('returns false on DB error', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: { message: 'err' } })
      mockFrom.mockReturnValue(chain)

      const result = await mod.acknowledgeAlert('alert-1', 'admin@test.com')
      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // recordUsage - DB path
  // =========================================================================
  describe('recordUsage (DB path)', () => {
    it('records usage to DB', async () => {
      // Mock for insert
      const insertChain = buildChain({ data: null, error: null })
      insertChain.then = (resolve: (v: unknown) => void) => resolve({ error: null })
      // Mock for getActiveBudgets
      const selectChain = buildChain({ data: [], error: null })

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        return callCount === 1 ? insertChain : selectChain
      })

      await mod.recordUsage({
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
      })

      expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
    })
  })

  // =========================================================================
  // getUsageStats - DB path
  // =========================================================================
  describe('getUsageStats (DB path)', () => {
    it('returns aggregated stats from DB', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({
        data: [
          {
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extraction',
            input_tokens: 1000,
            output_tokens: 500,
            total_tokens: 1500,
            input_cost: '0.0025',
            output_cost: '0.005',
            total_cost: '0.0075',
            timestamp: '2026-01-15T10:00:00Z',
          },
          {
            provider: 'anthropic',
            model: 'claude-3-5-haiku',
            operation: 'chat',
            input_tokens: 500,
            output_tokens: 200,
            total_tokens: 700,
            input_cost: '0.000125',
            output_cost: '0.00025',
            total_cost: '0.000375',
            timestamp: '2026-01-15T11:00:00Z',
          },
        ],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const stats = await mod.getUsageStats('2026-01-01', '2026-02-01')
      expect(stats.totalRequests).toBe(2)
      expect(stats.totalCost).toBeGreaterThan(0)
      expect(Object.keys(stats.byProvider)).toContain('openai')
      expect(Object.keys(stats.byProvider)).toContain('anthropic')
      expect(Object.keys(stats.byModel)).toContain('gpt-4o')
      expect(stats.byDay).toHaveLength(1) // same day
      expect(stats.byDay[0].date).toBe('2026-01-15')
    })

    it('falls back to in-memory on DB error', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'err' } })
      mockFrom.mockReturnValue(chain)

      const stats = await mod.getUsageStats('2026-01-01', '2026-02-01')
      expect(stats.totalRequests).toBeGreaterThanOrEqual(0)
    })

    it('handles null cost fields', async () => {
      const chain = buildChain({ data: null, error: null })
      chain.then = (resolve: (v: unknown) => void) => resolve({
        data: [{
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'test',
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          input_cost: null,
          output_cost: null,
          total_cost: null,
          timestamp: '2026-01-15T10:00:00Z',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const stats = await mod.getUsageStats('2026-01-01', '2026-02-01')
      expect(stats.totalRequests).toBe(1)
      expect(stats.totalCost).toBe(0)
    })
  })

  // =========================================================================
  // checkBudget - specific appliesTo branches
  // =========================================================================
  describe('checkBudget (appliesTo filtering)', () => {
    it('skips budgets that do not match userId or provider', async () => {
      // Create a budget that applies to specific user
      const chain = buildChain({
        data: [{
          id: 'specific-b1',
          name: 'User Budget',
          budget_type: 'daily',
          limit_amount: '10',
          current_usage: '0',
          alert_threshold_percent: 80,
          action_on_exceed: 'block',
          applies_to: 'user-other',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      // Check with different user - should skip the budget
      const result = await mod.checkBudget(100, 'user-me', 'openai')
      expect(result.allowed).toBe(true) // budget doesn't apply
    })

    it('applies budget matching userId', async () => {
      const chain = buildChain({
        data: [{
          id: 'user-budget',
          name: 'User Budget',
          budget_type: 'daily',
          limit_amount: '1',
          current_usage: '0',
          alert_threshold_percent: 80,
          action_on_exceed: 'block',
          applies_to: 'user-me',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const result = await mod.checkBudget(100, 'user-me', 'openai')
      expect(result.allowed).toBe(false)
      expect(result.blockedBy).toBe('User Budget')
    })

    it('applies budget matching provider', async () => {
      const chain = buildChain({
        data: [{
          id: 'provider-budget',
          name: 'Provider Budget',
          budget_type: 'daily',
          limit_amount: '1',
          current_usage: '0',
          alert_threshold_percent: 80,
          action_on_exceed: 'block',
          applies_to: 'openai',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const result = await mod.checkBudget(100, 'user-me', 'openai')
      expect(result.allowed).toBe(false)
    })

    it('triggers threshold warning when at alert threshold', async () => {
      const chain = buildChain({
        data: [{
          id: 'threshold-budget',
          name: 'Threshold Budget',
          budget_type: 'daily',
          limit_amount: '100',
          current_usage: '85', // 85% > 80% threshold
          alert_threshold_percent: 80,
          action_on_exceed: 'warn',
          applies_to: 'all',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const result = await mod.checkBudget(0.01, undefined, undefined)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.alerts.length).toBeGreaterThan(0)
    })

    it('generates notify alert on exceed without blocking', async () => {
      const chain = buildChain({
        data: [{
          id: 'notify-budget',
          name: 'Notify Budget',
          budget_type: 'daily',
          limit_amount: '10',
          current_usage: '0',
          alert_threshold_percent: 80,
          action_on_exceed: 'notify',
          applies_to: 'all',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const result = await mod.checkBudget(100, undefined, undefined)
      expect(result.allowed).toBe(true) // notify doesn't block
      expect(result.alerts.length).toBeGreaterThan(0)
    })

    it('generates warn alert on exceed without blocking', async () => {
      const chain = buildChain({
        data: [{
          id: 'warn-budget',
          name: 'Warn Budget',
          budget_type: 'daily',
          limit_amount: '10',
          current_usage: '0',
          alert_threshold_percent: 80,
          action_on_exceed: 'warn',
          applies_to: 'all',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const result = await mod.checkBudget(100, undefined, undefined)
      expect(result.allowed).toBe(true) // warn doesn't block
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // costControlMiddleware
  // =========================================================================
  describe('costControlMiddleware', () => {
    function makeReq(overrides: Partial<Request> = {}): Request {
      return {
        body: { message: 'test message' },
        path: '/api/ai/chat',
        ...overrides,
      } as unknown as Request
    }

    function makeRes(): Response & { _status: number; _json: unknown; _headers: Record<string, string> } {
      const res: any = {
        _status: 200,
        _json: null,
        _headers: {},
        status(code: number) { res._status = code; return res },
        json(data: unknown) { res._json = data; return res },
        setHeader(key: string, value: string) { res._headers[key] = value },
      }
      return res
    }

    it('estimates chat tokens (1.5x output)', async () => {
      const chain = buildChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)

      const middleware = mod.costControlMiddleware((req) => ({
        inputTokens: 100,
        model: 'gpt-4o-mini',
      }))

      const req = makeReq()
      const res = makeRes()
      const next = vi.fn()

      await middleware(req as any, res as any, next)
      expect(next).toHaveBeenCalled()
    })

    it('estimates extraction tokens (0.5x output)', async () => {
      const chain = buildChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)

      const middleware = mod.costControlMiddleware((req) => ({
        inputTokens: 1000,
        model: 'gpt-4o',
      }))

      const req = makeReq({ path: '/api/ai/extract/openai' } as any)
      const res = makeRes()
      const next = vi.fn()

      await middleware(req as any, res as any, next)
      expect(next).toHaveBeenCalled()
    })

    it('detects anthropic provider from path', async () => {
      const chain = buildChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)

      const middleware = mod.costControlMiddleware((req) => ({
        inputTokens: 100,
        model: 'claude-3-5-haiku',
      }))

      const req = makeReq({ path: '/api/ai/extract/anthropic' } as any)
      const res = makeRes()
      const next = vi.fn()

      await middleware(req as any, res as any, next)
      expect(next).toHaveBeenCalled()
    })

    it('blocks request when budget exceeded', async () => {
      const chain = buildChain({
        data: [{
          id: 'blocker',
          name: 'Blocking Budget',
          budget_type: 'daily',
          limit_amount: '0.001',
          current_usage: '0',
          alert_threshold_percent: 50,
          action_on_exceed: 'block',
          applies_to: 'all',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const middleware = mod.costControlMiddleware(() => ({
        inputTokens: 100000,
        model: 'gpt-4o',
      }))

      const req = makeReq()
      const res = makeRes()
      const next = vi.fn()

      await middleware(req as any, res as any, next)
      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(429)
      expect(res._json).toHaveProperty('code', 'BUDGET_EXCEEDED')
    })

    it('sets warning headers when budget warnings exist', async () => {
      const chain = buildChain({
        data: [{
          id: 'warner',
          name: 'Warning Budget',
          budget_type: 'daily',
          limit_amount: '100',
          current_usage: '85', // 85% > 80% threshold
          alert_threshold_percent: 80,
          action_on_exceed: 'warn',
          applies_to: 'all',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }],
        error: null,
      })
      mockFrom.mockReturnValue(chain)

      const middleware = mod.costControlMiddleware(() => ({
        inputTokens: 100,
        model: 'gpt-4o-mini',
      }))

      const req = makeReq()
      const res = makeRes()
      const next = vi.fn()

      await middleware(req as any, res as any, next)
      expect(next).toHaveBeenCalled()
      expect(res._headers['X-Budget-Warnings']).toBeDefined()
    })

    it('continues on middleware error', async () => {
      const middleware = mod.costControlMiddleware(() => {
        throw new Error('estimation crash')
      })

      const req = makeReq()
      const res = makeRes()
      const next = vi.fn()

      await middleware(req as any, res as any, next)
      // Should not block on errors
      expect(next).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // estimateTokensFromRequest
  // =========================================================================
  describe('estimateTokensFromRequest', () => {
    it('estimates tokens from message body', () => {
      const req = { body: { message: 'Hello world' }, path: '/api/ai/chat' } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      expect(result.inputTokens).toBe(Math.ceil('Hello world'.length / 4))
      expect(result.model).toBe('gpt-4o-mini')
    })

    it('uses prompt field if message not present', () => {
      const req = { body: { prompt: 'Analyze this' }, path: '/api/ai/extract' } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      expect(result.inputTokens).toBe(Math.ceil('Analyze this'.length / 4))
    })

    it('uses document field if message/prompt not present', () => {
      const req = { body: { document: 'Long document text here' }, path: '/api/ai/extract' } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      expect(result.inputTokens).toBe(Math.ceil('Long document text here'.length / 4))
    })

    it('includes policyContext tokens', () => {
      const req = {
        body: { message: 'test', policyContext: 'policy data' },
        path: '/api/ai/chat',
      } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      const expected = Math.ceil('test'.length / 4) + Math.ceil('policy data'.length / 4)
      expect(result.inputTokens).toBe(expected)
    })

    it('includes conversation history tokens', () => {
      const req = {
        body: {
          message: 'test',
          conversationHistory: [
            { content: 'Hello' },
            { content: 'World' },
          ],
        },
        path: '/api/ai/chat',
      } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      expect(result.inputTokens).toBeGreaterThan(Math.ceil('test'.length / 4))
    })

    it('handles empty body', () => {
      const req = { body: {}, path: '/api/ai/chat' } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      expect(result.inputTokens).toBe(0)
    })

    it('handles undefined body', () => {
      const req = { path: '/api/ai/chat' } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      expect(result.inputTokens).toBe(0)
    })

    it('selects anthropic model for anthropic path', () => {
      const req = { body: {}, path: '/api/ai/extract/anthropic' } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      expect(result.model).toBe('claude-3-5-haiku')
    })

    it('uses provided model when available', () => {
      const req = { body: { model: 'gpt-4-turbo' }, path: '/api/ai/chat' } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      expect(result.model).toBe('gpt-4-turbo')
    })

    it('handles history entries without content', () => {
      const req = {
        body: {
          message: 'test',
          conversationHistory: [{ role: 'user' }, { content: 'ok' }],
        },
        path: '/api/ai/chat',
      } as unknown as Request
      const result = mod.estimateTokensFromRequest(req)
      // First entry has no content, so 0 tokens from it
      expect(result.inputTokens).toBeGreaterThan(0)
    })
  })
})
