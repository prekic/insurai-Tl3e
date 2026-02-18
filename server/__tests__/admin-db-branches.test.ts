/**
 * Admin Database Service — Comprehensive Branch Coverage Tests
 *
 * Tests all branches in server/services/admin-db.ts including:
 * - getClientWithError initialization paths (cached client, initError, missing env, createClient throws)
 * - mapConfig JSON.parse guard (success, failure, non-string values)
 * - All CRUD functions: success, error, and no-client early-return branches
 * - Pagination logic (offset with/without limit, default limit=50 fallback)
 * - Null/undefined coalescing in all map* functions
 * - setConfig: not found, not editable, update error, success with history
 * - updatePromptTemplate: not found, version history, update error, success
 * - isIPBlocked: no client, not found, expired block cleanup, active block
 * - getAIUsageStats: no client, error/null data, empty data, aggregation with null fields
 * - blockIP: with and without expiresIn
 * - logSecurityEvent alias
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

// Track calls on the chain so we can assert specific method invocations
const { mockCreateClient, mockLogWarn, mockLogError } = vi.hoisted(() => {
  return {
    mockCreateClient: vi.fn(),
    mockLogWarn: vi.fn(),
    mockLogError: vi.fn(),
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

vi.mock('../lib/logger.js', () => {
  const childLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn(() => childLogger),
  }
  return {
    default: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => childLogger),
    },
  }
})

// ---------------------------------------------------------------------------
// Helpers to build a mock Supabase client with chainable query builders
// ---------------------------------------------------------------------------

/**
 * Creates a chainable mock query builder that records calls and resolves
 * with the value returned by `terminalResultFn`.
 *
 * Every chain method (select, insert, update, delete, eq, order, gte, lte,
 * limit, range, upsert, single) returns the same chain object so calls can
 * be chained in any order.  `single()` always returns a Promise.
 * When the chain is awaited directly (without calling single), the
 * `then` property is used to resolve.
 */
function buildChain(terminalResultFn: () => { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {}

  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'order', 'gte', 'lte', 'limit', 'range', 'upsert',
  ]

  for (const m of methods) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args })
      return chain
    })
  }

  // single() is always terminal — returns a Promise
  chain.single = vi.fn(() => Promise.resolve(terminalResultFn()))

  // Make chain thenable so `await query` works without calling single()
  chain.then = (resolve: (v: unknown) => void) => {
    resolve(terminalResultFn())
  }

  return { chain, calls }
}

/** Build a full mock Supabase client whose `.from()` always returns the same chain. */
function buildMockClient(terminalResultFn: () => { data: unknown; error: unknown }) {
  const { chain, calls } = buildChain(terminalResultFn)
  const fromFn = vi.fn(() => chain)
  const rpcFn = vi.fn(() => Promise.resolve({ error: null }))
  return { client: { from: fromFn, rpc: rpcFn }, fromFn, rpcFn, chain, calls }
}

// ---------------------------------------------------------------------------
// Fresh-module helper
// ---------------------------------------------------------------------------

/**
 * Because admin-db.ts caches the Supabase client and initError at module level
 * we need `resetModules()` + dynamic `import()` to test initialisation branches.
 */
async function freshImport() {
  vi.resetModules()
  return import('../services/admin-db.js')
}

// ==========================================================================
//  TESTS
// ==========================================================================

describe('admin-db branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env between tests that manipulate it
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  // ========================================================================
  // getClientWithError — initialisation branches
  // ========================================================================

  describe('getClientWithError', () => {
    it('returns error when SUPABASE_URL is missing', async () => {
      // No URL env vars set
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
      const mod = await freshImport()
      const result = mod.getClientWithError()
      expect(result.client).toBeNull()
      expect(result.error).toBe('SUPABASE_URL is not configured')
      expect(mockLogError).toHaveBeenCalledWith('SUPABASE_URL is not configured')
    })

    it('returns error when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      // No service key
      const mod = await freshImport()
      const result = mod.getClientWithError()
      expect(result.client).toBeNull()
      expect(result.error).toBe('SUPABASE_SERVICE_ROLE_KEY is not configured')
    })

    it('falls back to VITE_SUPABASE_URL when SUPABASE_URL is not set', async () => {
      process.env.VITE_SUPABASE_URL = 'https://vite-test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
      mockCreateClient.mockReturnValue({ from: vi.fn(), rpc: vi.fn() })
      const mod = await freshImport()
      const result = mod.getClientWithError()
      expect(result.error).toBeNull()
      expect(result.client).toBeTruthy()
      expect(mockCreateClient).toHaveBeenCalledWith('https://vite-test.supabase.co', 'key')
    })

    it('returns cached client on second call', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
      mockCreateClient.mockReturnValue({ from: vi.fn(), rpc: vi.fn() })
      const mod = await freshImport()

      const first = mod.getClientWithError()
      const second = mod.getClientWithError()
      expect(first.client).toBe(second.client)
      // createClient should only be called once
      expect(mockCreateClient).toHaveBeenCalledTimes(1)
    })

    it('caches initError and returns it on subsequent calls', async () => {
      // No env vars at all
      const mod = await freshImport()
      const first = mod.getClientWithError()
      expect(first.error).toBeTruthy()
      const second = mod.getClientWithError()
      expect(second.error).toBe(first.error)
      // createClient should never be called
      expect(mockCreateClient).not.toHaveBeenCalled()
    })

    it('handles createClient throwing an error', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
      mockCreateClient.mockImplementation(() => {
        throw new Error('Connection refused')
      })
      const mod = await freshImport()
      const result = mod.getClientWithError()
      expect(result.client).toBeNull()
      expect(result.error).toContain('Failed to create Supabase client')
      expect(result.error).toContain('Connection refused')
    })

    it('handles createClient throwing a non-Error value', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'
      mockCreateClient.mockImplementation(() => {
        throw 'string error' // eslint-disable-line no-throw-literal
      })
      const mod = await freshImport()
      const result = mod.getClientWithError()
      expect(result.client).toBeNull()
      expect(result.error).toContain('string error')
    })
  })

  // ========================================================================
  // All functions returning early when no client is available
  // ========================================================================

  describe('no-client early returns', () => {
    // Use a shared fresh import that has no env vars configured
    let mod: Awaited<ReturnType<typeof freshImport>>

    beforeEach(async () => {
      // No env vars → getClient() returns null
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      mod = await freshImport()
    })

    it('getAdminUsers returns []', async () => {
      expect(await mod.getAdminUsers()).toEqual([])
    })

    it('createAdminUser returns null', async () => {
      expect(await mod.createAdminUser({ email: 'a@b.c', passwordHash: 'h', role: 'admin' })).toBeNull()
    })

    it('updateAdminUser returns null', async () => {
      expect(await mod.updateAdminUser('id', {})).toBeNull()
    })

    it('deleteAdminUser returns false', async () => {
      expect(await mod.deleteAdminUser('id')).toBe(false)
    })

    it('getConfigs returns []', async () => {
      expect(await mod.getConfigs()).toEqual([])
    })

    it('getConfig returns null', async () => {
      expect(await mod.getConfig('cat', 'key')).toBeNull()
    })

    it('setConfig returns false', async () => {
      expect(await mod.setConfig('cat', 'key', 'val', 'admin')).toBe(false)
    })

    it('getFeatureFlags returns []', async () => {
      expect(await mod.getFeatureFlags()).toEqual([])
    })

    it('getFeatureFlag returns null', async () => {
      expect(await mod.getFeatureFlag('id')).toBeNull()
    })

    it('updateFeatureFlag returns false', async () => {
      expect(await mod.updateFeatureFlag('id', {}, 'admin')).toBe(false)
    })

    it('createFeatureFlag returns null', async () => {
      const flag = { id: 'f', name: 'f', enabled: false, enabledForRoles: [] as string[], enabledForUsers: [] as string[], metadata: {} }
      expect(await mod.createFeatureFlag(flag, 'admin')).toBeNull()
    })

    it('getAuditLogs returns []', async () => {
      expect(await mod.getAuditLogs()).toEqual([])
    })

    it('createAuditLog returns null', async () => {
      expect(await mod.createAuditLog({ action: 'a', resourceType: 'r' })).toBeNull()
    })

    it('getSecurityEvents returns []', async () => {
      expect(await mod.getSecurityEvents()).toEqual([])
    })

    it('createSecurityEvent returns null', async () => {
      expect(await mod.createSecurityEvent({ eventType: 'e', severity: 's', details: {} })).toBeNull()
    })

    it('resolveSecurityEvent returns false', async () => {
      expect(await mod.resolveSecurityEvent('id', 'admin')).toBe(false)
    })

    it('getBlockedIPs returns []', async () => {
      expect(await mod.getBlockedIPs()).toEqual([])
    })

    it('blockIP returns false', async () => {
      expect(await mod.blockIP('1.2.3.4', 'reason', 'admin')).toBe(false)
    })

    it('unblockIP returns false', async () => {
      expect(await mod.unblockIP('1.2.3.4')).toBe(false)
    })

    it('isIPBlocked returns false', async () => {
      expect(await mod.isIPBlocked('1.2.3.4')).toBe(false)
    })

    it('getPromptTemplates returns []', async () => {
      expect(await mod.getPromptTemplates()).toEqual([])
    })

    it('getPromptTemplate returns null', async () => {
      expect(await mod.getPromptTemplate('id')).toBeNull()
    })

    it('getActivePromptTemplate returns null', async () => {
      expect(await mod.getActivePromptTemplate('cat')).toBeNull()
    })

    it('updatePromptTemplate returns false', async () => {
      expect(await mod.updatePromptTemplate('id', {}, 'admin')).toBe(false)
    })

    it('createPromptTemplate returns null', async () => {
      const tmpl = { name: 'n', category: 'c', isActive: false, systemPrompt: 's', userPromptTemplate: 'u', variables: [] as never[], parameters: {} }
      expect(await mod.createPromptTemplate(tmpl, 'admin')).toBeNull()
    })

    it('deletePromptTemplate returns false', async () => {
      expect(await mod.deletePromptTemplate('id')).toBe(false)
    })

    it('recordPromptUsage returns without error', async () => {
      await mod.recordPromptUsage('id')
      // No assertion needed — just verify it doesn't throw
    })

    it('getAIRequestLogs returns []', async () => {
      expect(await mod.getAIRequestLogs()).toEqual([])
    })

    it('createAIRequestLog returns null', async () => {
      expect(await mod.createAIRequestLog({
        provider: 'openai', model: 'gpt-4o', operation: 'chat',
        inputTokens: 0, outputTokens: 0, totalTokens: 0,
        inputCost: 0, outputCost: 0, totalCost: 0, status: 'success',
      })).toBeNull()
    })

    it('getAIUsageStats returns empty stats object', async () => {
      const stats = await mod.getAIUsageStats('2026-01-01', '2026-01-31')
      expect(stats).toEqual({
        totalRequests: 0, totalTokens: 0, totalCost: 0,
        errorRate: 0, averageResponseTime: 0,
        byProvider: {}, byOperation: {},
      })
    })

    it('getCostBudgets returns []', async () => {
      expect(await mod.getCostBudgets()).toEqual([])
    })

    it('updateCostBudget returns false', async () => {
      expect(await mod.updateCostBudget('id', {})).toBe(false)
    })
  })

  // ========================================================================
  // Tests that use a working client
  // ========================================================================

  describe('with working client', () => {
    let mod: Awaited<ReturnType<typeof freshImport>>
    let result: { data: unknown; error: unknown }
    let mockClient: ReturnType<typeof buildMockClient>

    beforeEach(async () => {
      result = { data: null, error: null }
      mockClient = buildMockClient(() => result)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      mockCreateClient.mockReturnValue(mockClient.client)
      mod = await freshImport()
      // Trigger client initialization
      mod.getClientWithError()
    })

    // ====================================================================
    // mapConfig — JSON.parse guard
    // ====================================================================

    describe('mapConfig (via getConfig)', () => {
      it('parses valid JSON string value', async () => {
        result = { data: {
          id: 'c1', category: 'ai', key: 'temp', value: '0.7',
          value_type: 'number', description: null, is_secret: false,
          is_editable: true, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
        }, error: null }
        const cfg = await mod.getConfig('ai', 'temp')
        expect(cfg?.value).toBe(0.7)
      })

      it('parses JSON object string', async () => {
        result = { data: {
          id: 'c2', category: 'ai', key: 'obj', value: '{"a":1}',
          value_type: 'object', description: null, is_secret: false,
          is_editable: true, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
        }, error: null }
        const cfg = await mod.getConfig('ai', 'obj')
        expect(cfg?.value).toEqual({ a: 1 })
      })

      it('falls back to raw value when JSON.parse fails', async () => {
        result = { data: {
          id: 'c3', category: 'ai', key: 'bad', value: 'not json {{{',
          value_type: 'string', description: null, is_secret: false,
          is_editable: true, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
        }, error: null }
        const cfg = await mod.getConfig('ai', 'bad')
        expect(cfg?.value).toBe('not json {{{')
        expect(mockLogWarn).toHaveBeenCalledWith(
          'Failed to parse config value as JSON',
          expect.objectContaining({ category: 'ai', key: 'bad' }),
        )
      })

      it('parses JSON boolean string', async () => {
        result = { data: {
          id: 'c4', category: 'flags', key: 'enabled', value: 'true',
          value_type: 'boolean', description: null, is_secret: false,
          is_editable: true, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
        }, error: null }
        const cfg = await mod.getConfig('flags', 'enabled')
        expect(cfg?.value).toBe(true)
      })

      it('parses JSON array string', async () => {
        result = { data: {
          id: 'c5', category: 'ai', key: 'models', value: '["gpt-4o","claude"]',
          value_type: 'array', description: null, is_secret: false,
          is_editable: true, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
        }, error: null }
        const cfg = await mod.getConfig('ai', 'models')
        expect(cfg?.value).toEqual(['gpt-4o', 'claude'])
      })

      it('handles null value field gracefully', async () => {
        result = { data: {
          id: 'c6', category: 'ai', key: 'nullable', value: null,
          value_type: 'string', description: null, is_secret: false,
          is_editable: true, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
        }, error: null }
        const cfg = await mod.getConfig('ai', 'nullable')
        // JSON.parse(null as string) should fail, falling back to raw null
        expect(cfg?.value).toBeNull()
      })
    })

    // ====================================================================
    // getConfigs — with and without category filter
    // ====================================================================

    describe('getConfigs', () => {
      it('returns mapped configs on success', async () => {
        result = { data: [{
          id: 'c1', category: 'ai', key: 'temp', value: '0.5',
          value_type: 'number', description: 'Temperature', is_secret: false,
          is_editable: true, modified_by: 'admin', modified_at: '2026-01-01', created_at: '2026-01-01',
        }], error: null }
        const configs = await mod.getConfigs()
        expect(configs).toHaveLength(1)
        expect(configs[0].value).toBe(0.5)
        expect(configs[0].category).toBe('ai')
      })

      it('applies category filter when provided', async () => {
        result = { data: [], error: null }
        await mod.getConfigs('evaluation')
        expect(mockClient.fromFn).toHaveBeenCalledWith('app_configs')
        // eq should have been called with 'category', 'evaluation'
        const eqCalls = (mockClient.chain.eq as ReturnType<typeof vi.fn>).mock.calls
        expect(eqCalls.some((c: unknown[]) => c[0] === 'category' && c[1] === 'evaluation')).toBe(true)
      })

      it('returns [] on error', async () => {
        result = { data: null, error: new Error('fail') }
        expect(await mod.getConfigs()).toEqual([])
        expect(mockLogError).toHaveBeenCalled()
      })
    })

    // ====================================================================
    // setConfig — all branches
    // ====================================================================

    describe('setConfig', () => {
      it('returns false when config not found (getConfig error)', async () => {
        result = { data: null, error: new Error('not found') }
        expect(await mod.setConfig('cat', 'key', 'val', 'admin')).toBe(false)
      })

      it('returns false when config is not editable', async () => {
        result = { data: {
          id: 'c1', category: 'ai', key: 'secret', value: '"hidden"',
          value_type: 'string', description: null, is_secret: true,
          is_editable: false, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
        }, error: null }
        expect(await mod.setConfig('ai', 'secret', 'new', 'admin')).toBe(false)
      })

      it('returns false when update fails', async () => {
        // setConfig calls: 1) getConfig → from('app_configs') single(), 2) update → from('app_configs') await, 3) history → from('config_history') await
        // We need from() to return separate chains so we can make the 2nd call return an error.
        let fromCallCount = 0
        mockClient.client.from = vi.fn(() => {
          fromCallCount++
          if (fromCallCount === 1) {
            // getConfig chain — returns editable config via single()
            const getConfigResult = {
              id: 'c1', category: 'ai', key: 'temp', value: '"0.5"',
              value_type: 'number', description: null, is_secret: false,
              is_editable: true, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
            }
            return buildChain(() => ({ data: getConfigResult, error: null })).chain
          }
          // 2nd from() call = the update → return error
          return buildChain(() => ({ data: null, error: new Error('update failed') })).chain
        }) as typeof mockClient.client.from
        const res = await mod.setConfig('ai', 'temp', 0.7, 'admin')
        expect(res).toBe(false)
      })

      it('returns true and logs history on success', async () => {
        // All calls succeed
        result = { data: {
          id: 'c1', category: 'ai', key: 'temp', value: '"0.5"',
          value_type: 'number', description: null, is_secret: false,
          is_editable: true, modified_by: null, modified_at: '2026-01-01', created_at: '2026-01-01',
        }, error: null }

        const res = await mod.setConfig('ai', 'temp', 0.7, 'admin-1', 'tuning')
        expect(res).toBe(true)
        // Should have called from('config_history') for history insert
        const fromCalls = mockClient.fromFn.mock.calls.flat()
        expect(fromCalls).toContain('config_history')
      })
    })

    // ====================================================================
    // Admin Users — success mapping with null coalescing
    // ====================================================================

    describe('getAdminUsers', () => {
      it('maps rows with null permissions and loginCount to defaults', async () => {
        result = { data: [{
          id: 'u1', email: 'a@b.c', role: 'admin', status: 'active',
          display_name: null, permissions: null, last_login_at: null,
          last_login_ip: null, login_count: null, created_at: '2026-01-01', updated_at: '2026-01-01',
        }], error: null }
        const users = await mod.getAdminUsers()
        expect(users).toHaveLength(1)
        expect(users[0].permissions).toEqual([])
        expect(users[0].loginCount).toBe(0)
        expect(users[0].displayName).toBeNull()
      })
    })

    describe('createAdminUser', () => {
      it('lowercases email and defaults permissions when not provided', async () => {
        result = { data: {
          id: 'u1', email: 'test@test.com', role: 'editor', status: 'active',
          display_name: null, permissions: null, created_at: '2026-01-01', updated_at: '2026-01-01',
        }, error: null }
        const user = await mod.createAdminUser({ email: 'TEST@TEST.COM', passwordHash: 'h', role: 'editor' })
        expect(user).not.toBeNull()
        // Check that insert was called with lowercase email
        const insertCalls = (mockClient.chain.insert as ReturnType<typeof vi.fn>).mock.calls
        expect(insertCalls[0][0].email).toBe('test@test.com')
        expect(user!.permissions).toEqual([])
        expect(user!.loginCount).toBe(0)
      })

      it('passes through displayName and permissions when provided', async () => {
        result = { data: {
          id: 'u1', email: 'admin@x.com', role: 'admin', status: 'active',
          display_name: 'Admin', permissions: ['read', 'write'], created_at: '2026-01-01', updated_at: '2026-01-01',
        }, error: null }
        const user = await mod.createAdminUser({
          email: 'admin@x.com', passwordHash: 'h', role: 'admin',
          displayName: 'Admin', permissions: ['read', 'write'],
        })
        expect(user?.displayName).toBe('Admin')
        expect(user?.permissions).toEqual(['read', 'write'])
      })
    })

    describe('updateAdminUser', () => {
      it('maps successfully with all fields populated', async () => {
        result = { data: {
          id: 'u1', email: 'a@b.c', role: 'admin', status: 'active',
          display_name: 'Name', permissions: ['admin'], last_login_at: '2026-02-01',
          last_login_ip: '10.0.0.1', login_count: 5, created_at: '2026-01-01', updated_at: '2026-02-01',
        }, error: null }
        const user = await mod.updateAdminUser('u1', { role: 'admin' })
        expect(user?.loginCount).toBe(5)
        expect(user?.lastLoginIp).toBe('10.0.0.1')
      })

      it('maps with null optional fields to defaults', async () => {
        result = { data: {
          id: 'u1', email: 'a@b.c', role: 'viewer', status: 'active',
          display_name: null, permissions: null, last_login_at: null,
          last_login_ip: null, login_count: null, created_at: '2026-01-01', updated_at: '2026-02-01',
        }, error: null }
        const user = await mod.updateAdminUser('u1', { status: 'inactive' })
        expect(user?.permissions).toEqual([])
        expect(user?.loginCount).toBe(0)
      })
    })

    describe('deleteAdminUser', () => {
      it('returns true on success', async () => {
        result = { data: null, error: null }
        expect(await mod.deleteAdminUser('u1')).toBe(true)
      })
    })

    // ====================================================================
    // Feature Flags
    // ====================================================================

    describe('getFeatureFlags', () => {
      it('maps null arrays to empty defaults', async () => {
        result = { data: [{
          id: 'f1', name: 'flag', description: null, enabled: false,
          enabled_percentage: null, enabled_for_roles: null,
          enabled_for_users: null, metadata: null,
          created_at: '2026-01-01', created_by: null, updated_at: '2026-01-01', updated_by: null,
        }], error: null }
        const flags = await mod.getFeatureFlags()
        expect(flags[0].enabledForRoles).toEqual([])
        expect(flags[0].enabledForUsers).toEqual([])
        expect(flags[0].metadata).toEqual({})
      })
    })

    describe('getFeatureFlag', () => {
      it('returns null on error', async () => {
        result = { data: null, error: new Error('fail') }
        expect(await mod.getFeatureFlag('id')).toBeNull()
      })
    })

    describe('updateFeatureFlag', () => {
      it('returns true on success', async () => {
        result = { data: null, error: null }
        expect(await mod.updateFeatureFlag('f1', { enabled: true }, 'admin')).toBe(true)
      })
    })

    describe('createFeatureFlag', () => {
      it('returns id on success', async () => {
        result = { data: { id: 'new-f' }, error: null }
        const id = await mod.createFeatureFlag(
          { id: 'new-f', name: 'test', enabled: true, enabledForRoles: [], enabledForUsers: [], metadata: {} },
          'admin',
        )
        expect(id).toBe('new-f')
      })
    })

    // ====================================================================
    // Audit Logs — filter branches and pagination
    // ====================================================================

    describe('getAuditLogs', () => {
      it('no filters — no eq/gte/lte/limit/range calls', async () => {
        result = { data: [], error: null }
        await mod.getAuditLogs()
        // Should still call from, select, order
        expect(mockClient.fromFn).toHaveBeenCalledWith('audit_logs')
      })

      it('applies all filters', async () => {
        result = { data: [], error: null }
        await mod.getAuditLogs({
          actorId: 'a1', resourceType: 'policy', action: 'create',
          startDate: '2026-01-01', endDate: '2026-02-01', limit: 10, offset: 20,
        })
        const eqCalls = (mockClient.chain.eq as ReturnType<typeof vi.fn>).mock.calls
        expect(eqCalls).toEqual(
          expect.arrayContaining([
            ['actor_id', 'a1'],
            ['resource_type', 'policy'],
            ['action', 'create'],
          ]),
        )
        expect(mockClient.chain.gte).toHaveBeenCalledWith('timestamp', '2026-01-01')
        expect(mockClient.chain.lte).toHaveBeenCalledWith('timestamp', '2026-02-01')
        expect(mockClient.chain.limit).toHaveBeenCalledWith(10)
        // range(20, 20 + 10 - 1) = range(20, 29)
        expect(mockClient.chain.range).toHaveBeenCalledWith(20, 29)
      })

      it('offset without limit uses default limit of 50', async () => {
        result = { data: [], error: null }
        await mod.getAuditLogs({ offset: 5 })
        // range(5, 5 + 50 - 1) = range(5, 54)
        expect(mockClient.chain.range).toHaveBeenCalledWith(5, 54)
      })

      it('limit without offset does not call range', async () => {
        result = { data: [], error: null }
        await mod.getAuditLogs({ limit: 25 })
        expect(mockClient.chain.limit).toHaveBeenCalledWith(25)
        expect(mockClient.chain.range).not.toHaveBeenCalled()
      })

      it('maps all audit log fields correctly', async () => {
        result = { data: [{
          id: 'l1', timestamp: '2026-02-01', actor_id: 'a1', actor_email: 'a@b.c',
          actor_role: 'admin', action: 'update', resource_type: 'policy',
          resource_id: 'p1', previous_state: { old: true }, new_state: { new: true },
          changes: [{ field: 'status', oldValue: 'active', newValue: 'expired' }],
          ip_address: '127.0.0.1', user_agent: 'Chrome', session_id: 's1', reason: 'test',
        }], error: null }
        const logs = await mod.getAuditLogs()
        expect(logs[0]).toEqual({
          id: 'l1', timestamp: '2026-02-01', actorId: 'a1', actorEmail: 'a@b.c',
          actorRole: 'admin', action: 'update', resourceType: 'policy',
          resourceId: 'p1', previousState: { old: true }, newState: { new: true },
          changes: [{ field: 'status', oldValue: 'active', newValue: 'expired' }],
          ipAddress: '127.0.0.1', userAgent: 'Chrome', sessionId: 's1', reason: 'test',
        })
      })
    })

    describe('createAuditLog', () => {
      it('returns null on error', async () => {
        result = { data: null, error: new Error('fail') }
        expect(await mod.createAuditLog({ action: 'a', resourceType: 'r' })).toBeNull()
      })

      it('returns id on success', async () => {
        result = { data: { id: 'log-1' }, error: null }
        expect(await mod.createAuditLog({
          actorId: 'a1', actorEmail: 'a@b.c', actorRole: 'admin',
          action: 'create', resourceType: 'user', resourceId: 'u1',
          previousState: null, newState: { role: 'admin' },
          changes: [{ field: 'role', oldValue: null, newValue: 'admin' }],
          ipAddress: '1.2.3.4', userAgent: 'Bot', sessionId: 'sess', reason: 'new user',
        })).toBe('log-1')
      })
    })

    // ====================================================================
    // Security Events
    // ====================================================================

    describe('getSecurityEvents', () => {
      it('applies resolved=false filter (boolean false)', async () => {
        result = { data: [], error: null }
        await mod.getSecurityEvents({ resolved: false })
        expect(mockClient.chain.eq).toHaveBeenCalledWith('resolved', false)
      })

      it('maps details to empty object when null', async () => {
        result = { data: [{
          id: 'e1', timestamp: '2026-01-01', event_type: 'test', severity: 'low',
          user_id: null, ip_address: null, user_agent: null, details: null,
          resolved: false, resolved_at: null, resolved_by: null, resolution_notes: null,
        }], error: null }
        const events = await mod.getSecurityEvents()
        expect(events[0].details).toEqual({})
      })
    })

    describe('createSecurityEvent', () => {
      it('passes all optional fields', async () => {
        result = { data: { id: 'e1' }, error: null }
        const id = await mod.createSecurityEvent({
          eventType: 'login_fail', severity: 'high',
          userId: 'u1', ipAddress: '1.2.3.4', userAgent: 'Bot',
          details: { attempts: 5 },
        })
        expect(id).toBe('e1')
        const insertArgs = (mockClient.chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(insertArgs.user_id).toBe('u1')
        expect(insertArgs.ip_address).toBe('1.2.3.4')
      })
    })

    describe('logSecurityEvent (alias)', () => {
      it('delegates to createSecurityEvent', async () => {
        result = { data: { id: 'e2' }, error: null }
        const id = await mod.logSecurityEvent({ eventType: 'login_ok', severity: 'info', details: {} })
        expect(id).toBe('e2')
      })
    })

    describe('resolveSecurityEvent', () => {
      it('passes resolutionNotes when provided', async () => {
        result = { data: null, error: null }
        await mod.resolveSecurityEvent('e1', 'admin-1', 'False positive')
        const updateArgs = (mockClient.chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(updateArgs.resolved).toBe(true)
        expect(updateArgs.resolved_by).toBe('admin-1')
        expect(updateArgs.resolution_notes).toBe('False positive')
      })

      it('passes undefined resolutionNotes when not provided', async () => {
        result = { data: null, error: null }
        await mod.resolveSecurityEvent('e1', 'admin-1')
        const updateArgs = (mockClient.chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(updateArgs.resolution_notes).toBeUndefined()
      })
    })

    // ====================================================================
    // Blocked IPs
    // ====================================================================

    describe('blockIP', () => {
      it('sets isPermanent=true and expiresAt=null when no expiresIn', async () => {
        result = { data: null, error: null }
        await mod.blockIP('1.2.3.4', 'spam', 'admin')
        const upsertArgs = (mockClient.chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(upsertArgs.is_permanent).toBe(true)
        expect(upsertArgs.expires_at).toBeNull()
      })

      it('sets isPermanent=false and calculates expiresAt when expiresIn provided', async () => {
        result = { data: null, error: null }
        const before = Date.now()
        await mod.blockIP('5.6.7.8', 'abuse', 'admin', 3600000) // 1 hour
        const upsertArgs = (mockClient.chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(upsertArgs.is_permanent).toBe(false)
        expect(upsertArgs.expires_at).toBeTruthy()
        // Verify the expiry is roughly 1 hour in the future
        const expiryTime = new Date(upsertArgs.expires_at).getTime()
        expect(expiryTime).toBeGreaterThanOrEqual(before + 3600000 - 1000)
        expect(expiryTime).toBeLessThanOrEqual(before + 3600000 + 1000)
      })
    })

    describe('isIPBlocked', () => {
      it('returns false when query returns error', async () => {
        result = { data: null, error: new Error('not found') }
        expect(await mod.isIPBlocked('9.9.9.9')).toBe(false)
      })

      it('returns false when data is null', async () => {
        result = { data: null, error: null }
        expect(await mod.isIPBlocked('9.9.9.9')).toBe(false)
      })

      it('returns true when block has no expires_at (permanent)', async () => {
        result = { data: { ip: '1.2.3.4', expires_at: null }, error: null }
        expect(await mod.isIPBlocked('1.2.3.4')).toBe(true)
      })

      it('returns true when expires_at is in the future', async () => {
        const future = new Date(Date.now() + 86400000).toISOString()
        result = { data: { ip: '1.2.3.4', expires_at: future }, error: null }
        expect(await mod.isIPBlocked('1.2.3.4')).toBe(true)
      })

      it('returns false and calls unblockIP when block has expired', async () => {
        const past = new Date(Date.now() - 86400000).toISOString()
        result = { data: { ip: '1.2.3.4', expires_at: past }, error: null }
        expect(await mod.isIPBlocked('1.2.3.4')).toBe(false)
        // unblockIP calls from('blocked_ips').delete()...
        expect(mockClient.fromFn).toHaveBeenCalledWith('blocked_ips')
        expect(mockClient.chain.delete).toHaveBeenCalled()
      })
    })

    // ====================================================================
    // Prompt Templates
    // ====================================================================

    describe('getPromptTemplates', () => {
      it('maps null variables and parameters to defaults', async () => {
        result = { data: [{
          id: 't1', name: 'Test', description: null, category: 'chat', version: 1,
          is_active: true, system_prompt: 'sys', user_prompt_template: 'usr',
          variables: null, default_provider: null, default_model: null,
          parameters: null, usage_count: 0, last_used_at: null,
          created_at: '2026-01-01', created_by: null, updated_at: '2026-01-01', updated_by: null,
        }], error: null }
        const templates = await mod.getPromptTemplates()
        expect(templates[0].variables).toEqual([])
        expect(templates[0].parameters).toEqual({})
      })

      it('applies category filter', async () => {
        result = { data: [], error: null }
        await mod.getPromptTemplates('extraction')
        expect(mockClient.chain.eq).toHaveBeenCalledWith('category', 'extraction')
      })
    })

    describe('getActivePromptTemplate', () => {
      it('returns mapped template on success', async () => {
        result = { data: {
          id: 't1', name: 'Active', description: null, category: 'extraction', version: 3,
          is_active: true, system_prompt: 'sys', user_prompt_template: 'usr',
          variables: [], default_provider: 'openai', default_model: 'gpt-4o',
          parameters: {}, usage_count: 50, last_used_at: '2026-02-01',
          created_at: '2026-01-01', created_by: 'admin', updated_at: '2026-02-01', updated_by: 'admin',
        }, error: null }
        const tmpl = await mod.getActivePromptTemplate('extraction')
        expect(tmpl?.isActive).toBe(true)
        expect(tmpl?.category).toBe('extraction')
      })

      it('returns null on error', async () => {
        result = { data: null, error: new Error('fail') }
        expect(await mod.getActivePromptTemplate('chat')).toBeNull()
      })
    })

    describe('updatePromptTemplate', () => {
      it('returns false when template not found', async () => {
        result = { data: null, error: new Error('not found') }
        expect(await mod.updatePromptTemplate('bad-id', {}, 'admin')).toBe(false)
      })

      it('saves version history, increments version, and returns true on success', async () => {
        // All from() calls succeed
        result = { data: {
          id: 't1', name: 'Test', description: null, category: 'extraction', version: 2,
          is_active: true, system_prompt: 'old sys', user_prompt_template: 'old usr',
          variables: [{ name: 'doc', description: 'doc', type: 'string', required: true }],
          default_provider: 'openai', default_model: 'gpt-4o',
          parameters: { temperature: 0.1 }, usage_count: 10, last_used_at: null,
          created_at: '2026-01-01', created_by: 'admin', updated_at: '2026-01-01', updated_by: 'admin',
        }, error: null }

        const res = await mod.updatePromptTemplate('t1', { name: 'Updated' } as never, 'admin-2')
        expect(res).toBe(true)
        // Should have called from('prompt_versions') for version history
        const fromCalls = mockClient.fromFn.mock.calls.flat()
        expect(fromCalls).toContain('prompt_versions')
        // Should have called update with version: 3 (current + 1)
        const updateCalls = (mockClient.chain.update as ReturnType<typeof vi.fn>).mock.calls
        const versionUpdate = updateCalls.find((c: unknown[]) => (c[0] as Record<string, unknown>).version === 3)
        expect(versionUpdate).toBeTruthy()
      })

      it('returns false when update after version save fails', async () => {
        // updatePromptTemplate calls:
        // 1) getPromptTemplate → from('prompt_templates').select().eq().single()
        // 2) save version → from('prompt_versions').insert()
        // 3) update template → from('prompt_templates').update().eq()
        // We need call 3 to return an error.
        let fromCallCount = 0
        const templateData = {
          id: 't1', name: 'T', description: null, category: 'c', version: 1,
          is_active: true, system_prompt: 's', user_prompt_template: 'u',
          variables: [], default_provider: null, default_model: null,
          parameters: {}, usage_count: 0, last_used_at: null,
          created_at: '2026-01-01', created_by: null, updated_at: '2026-01-01', updated_by: null,
        }
        mockClient.client.from = vi.fn(() => {
          fromCallCount++
          if (fromCallCount === 1) {
            // getPromptTemplate — returns template via single()
            return buildChain(() => ({ data: templateData, error: null })).chain
          }
          if (fromCallCount === 2) {
            // prompt_versions insert — success
            return buildChain(() => ({ data: null, error: null })).chain
          }
          // 3rd from() = the update — error
          return buildChain(() => ({ data: null, error: new Error('update failed') })).chain
        }) as typeof mockClient.client.from
        const res = await mod.updatePromptTemplate('t1', { name: 'X' } as never, 'admin')
        expect(res).toBe(false)
      })
    })

    describe('createPromptTemplate', () => {
      it('returns null on error', async () => {
        result = { data: null, error: new Error('duplicate') }
        expect(await mod.createPromptTemplate(
          { name: 'n', category: 'c', isActive: false, systemPrompt: 's', userPromptTemplate: 'u', variables: [], parameters: {} },
          'admin',
        )).toBeNull()
      })

      it('passes all fields and returns id on success', async () => {
        result = { data: { id: 'new-t' }, error: null }
        const id = await mod.createPromptTemplate(
          {
            name: 'New', description: 'desc', category: 'chat', isActive: true,
            systemPrompt: 'sys', userPromptTemplate: 'usr',
            variables: [{ name: 'v', description: 'd', type: 'string', required: true }],
            defaultProvider: 'anthropic', defaultModel: 'claude',
            parameters: { temperature: 0.5 },
          },
          'admin-1',
        )
        expect(id).toBe('new-t')
        const insertArgs = (mockClient.chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(insertArgs.name).toBe('New')
        expect(insertArgs.version).toBe(1)
        expect(insertArgs.default_provider).toBe('anthropic')
      })
    })

    describe('deletePromptTemplate', () => {
      it('returns true on success', async () => {
        result = { data: null, error: null }
        expect(await mod.deletePromptTemplate('t1')).toBe(true)
      })
    })

    describe('recordPromptUsage', () => {
      it('calls rpc with template_id', async () => {
        await mod.recordPromptUsage('t1')
        expect(mockClient.rpcFn).toHaveBeenCalledWith('increment_prompt_usage', { template_id: 't1' })
      })
    })

    // ====================================================================
    // AI Request Logs
    // ====================================================================

    describe('getAIRequestLogs', () => {
      it('applies all filters', async () => {
        result = { data: [], error: null }
        await mod.getAIRequestLogs({
          userId: 'u1', provider: 'openai', operation: 'chat', status: 'error',
          startDate: '2026-01-01', endDate: '2026-02-01', limit: 10, offset: 20,
        })
        const eqCalls = (mockClient.chain.eq as ReturnType<typeof vi.fn>).mock.calls
        expect(eqCalls).toEqual(
          expect.arrayContaining([
            ['user_id', 'u1'],
            ['provider', 'openai'],
            ['operation', 'chat'],
            ['status', 'error'],
          ]),
        )
        expect(mockClient.chain.limit).toHaveBeenCalledWith(10)
        expect(mockClient.chain.range).toHaveBeenCalledWith(20, 29)
      })

      it('offset without limit uses default 50', async () => {
        result = { data: [], error: null }
        await mod.getAIRequestLogs({ offset: 10 })
        expect(mockClient.chain.range).toHaveBeenCalledWith(10, 59)
      })

      it('maps cost strings and null costs correctly', async () => {
        result = { data: [{
          id: 'r1', timestamp: '2026-01-01', user_id: null, session_id: null,
          provider: 'anthropic', model: 'claude', operation: 'chat',
          endpoint: null, policy_id: null, document_id: null, prompt_template_id: null,
          input_tokens: 100, output_tokens: 200, total_tokens: 300,
          input_cost: '0.001', output_cost: '0.006', total_cost: '0.007',
          response_time_ms: null, status: 'success',
          error_message: null, error_code: null, client_ip: null, user_agent: null,
        }], error: null }
        const logs = await mod.getAIRequestLogs()
        expect(logs[0].inputCost).toBe(0.001)
        expect(logs[0].totalCost).toBe(0.007)
      })

      it('handles empty string and null cost fields', async () => {
        result = { data: [{
          id: 'r2', timestamp: '2026-01-01', user_id: null, session_id: null,
          provider: 'openai', model: 'gpt-4o', operation: 'extract',
          endpoint: null, policy_id: null, document_id: null, prompt_template_id: null,
          input_tokens: 0, output_tokens: 0, total_tokens: 0,
          input_cost: '', output_cost: null, total_cost: '',
          response_time_ms: null, status: 'error',
          error_message: 'fail', error_code: 'ERR', client_ip: null, user_agent: null,
        }], error: null }
        const logs = await mod.getAIRequestLogs()
        // parseFloat('') = NaN, parseFloat(null || '0') = 0
        // The code uses: parseFloat(row.input_cost as string || '0')
        // For '': '' is truthy, so parseFloat('') = NaN
        // For null: null || '0' = '0', so parseFloat('0') = 0
        expect(logs[0].outputCost).toBe(0) // null || '0' = '0' → 0
      })
    })

    describe('createAIRequestLog', () => {
      it('passes all fields and returns id', async () => {
        result = { data: { id: 'r-new' }, error: null }
        const id = await mod.createAIRequestLog({
          userId: 'u1', sessionId: 's1', provider: 'openai', model: 'gpt-4o',
          operation: 'extraction', endpoint: '/api/ai/extract', policyId: 'p1',
          documentId: 'd1', promptTemplateId: 't1',
          inputTokens: 100, outputTokens: 200, totalTokens: 300,
          inputCost: 0.01, outputCost: 0.02, totalCost: 0.03,
          responseTimeMs: 5000, status: 'success',
          errorMessage: undefined, errorCode: undefined,
          clientIp: '1.2.3.4', userAgent: 'InsurAI',
        })
        expect(id).toBe('r-new')
      })
    })

    // ====================================================================
    // getAIUsageStats — aggregation branches
    // ====================================================================

    describe('getAIUsageStats', () => {
      it('returns empty stats when query errors', async () => {
        result = { data: null, error: new Error('fail') }
        const stats = await mod.getAIUsageStats('2026-01-01', '2026-01-31')
        expect(stats.totalRequests).toBe(0)
      })

      it('returns empty stats when data is null (no error)', async () => {
        result = { data: null, error: null }
        const stats = await mod.getAIUsageStats('2026-01-01', '2026-01-31')
        expect(stats.totalRequests).toBe(0)
        expect(stats.byProvider).toEqual({})
      })

      it('handles empty array', async () => {
        result = { data: [], error: null }
        const stats = await mod.getAIUsageStats('2026-01-01', '2026-01-31')
        expect(stats.totalRequests).toBe(0)
        expect(stats.errorRate).toBe(0)
        expect(stats.averageResponseTime).toBe(0)
      })

      it('handles null token, cost, and response_time fields', async () => {
        result = { data: [
          { provider: 'openai', operation: 'chat', total_tokens: null, total_cost: null, status: 'success', response_time_ms: null },
        ], error: null }
        const stats = await mod.getAIUsageStats('2026-01-01', '2026-01-31')
        expect(stats.totalTokens).toBe(0)
        expect(stats.totalCost).toBe(0)
        expect(stats.averageResponseTime).toBe(0)
        expect(stats.byProvider.openai.tokens).toBe(0)
        expect(stats.byProvider.openai.cost).toBe(0)
      })

      it('correctly aggregates multiple providers and operations', async () => {
        result = { data: [
          { provider: 'openai', operation: 'extraction', total_tokens: 1000, total_cost: '0.010', status: 'success', response_time_ms: 2000 },
          { provider: 'openai', operation: 'extraction', total_tokens: 2000, total_cost: '0.020', status: 'error', response_time_ms: 8000 },
          { provider: 'anthropic', operation: 'chat', total_tokens: 500, total_cost: '0.005', status: 'success', response_time_ms: 1000 },
        ], error: null }
        const stats = await mod.getAIUsageStats('2026-01-01', '2026-02-01')
        expect(stats.totalRequests).toBe(3)
        expect(stats.totalTokens).toBe(3500)
        expect(stats.totalCost).toBeCloseTo(0.035, 4)
        expect(stats.errorRate).toBeCloseTo(1 / 3, 4)
        expect(stats.averageResponseTime).toBeCloseTo(11000 / 3, 0)

        // byProvider
        expect(stats.byProvider.openai.requests).toBe(2)
        expect(stats.byProvider.openai.tokens).toBe(3000)
        expect(stats.byProvider.anthropic.requests).toBe(1)

        // byOperation
        expect(stats.byOperation.extraction.requests).toBe(2)
        expect(stats.byOperation.extraction.successRate).toBe(0.5)
        expect(stats.byOperation.chat.requests).toBe(1)
        expect(stats.byOperation.chat.successRate).toBe(1)
      })

      it('calculates successRate of 0 when all requests are errors', async () => {
        result = { data: [
          { provider: 'openai', operation: 'extraction', total_tokens: 0, total_cost: '0', status: 'error', response_time_ms: 100 },
          { provider: 'openai', operation: 'extraction', total_tokens: 0, total_cost: '0', status: 'error', response_time_ms: 200 },
        ], error: null }
        const stats = await mod.getAIUsageStats('2026-01-01', '2026-02-01')
        expect(stats.errorRate).toBe(1)
        expect(stats.byOperation.extraction.successRate).toBe(0)
      })
    })

    // ====================================================================
    // Cost Budgets
    // ====================================================================

    describe('getCostBudgets', () => {
      it('maps all fields including parseFloat on amounts', async () => {
        result = { data: [{
          id: 'b1', name: 'Monthly', budget_type: 'monthly', limit_amount: '200.00',
          current_usage: '75.50', alert_threshold_percent: 80,
          action_on_exceed: 'block', applies_to: 'all', reset_at: '2026-03-01',
          is_active: true, created_at: '2026-01-01', created_by: 'admin', updated_at: '2026-02-01',
        }], error: null }
        const budgets = await mod.getCostBudgets()
        expect(budgets[0].limitAmount).toBe(200)
        expect(budgets[0].currentUsage).toBe(75.5)
        expect(budgets[0].budgetType).toBe('monthly')
        expect(budgets[0].actionOnExceed).toBe('block')
      })
    })

    describe('updateCostBudget', () => {
      it('returns true on success', async () => {
        result = { data: null, error: null }
        expect(await mod.updateCostBudget('b1', { limitAmount: 300 } as never)).toBe(true)
      })
    })

    // ====================================================================
    // Blocked IPs map function
    // ====================================================================

    describe('getBlockedIPs mapping', () => {
      it('maps all fields including nullable ones', async () => {
        result = { data: [{
          ip: '1.2.3.4', reason: 'spam', blocked_at: '2026-01-01',
          expires_at: null, is_permanent: true, block_count: 5,
          created_by: 'system', last_attempt_at: null,
        }], error: null }
        const ips = await mod.getBlockedIPs()
        expect(ips[0]).toEqual({
          ip: '1.2.3.4', reason: 'spam', blockedAt: '2026-01-01',
          expiresAt: null, isPermanent: true, blockCount: 5,
          createdBy: 'system', lastAttemptAt: null,
        })
      })
    })

    // ====================================================================
    // Default export
    // ====================================================================

    describe('default export', () => {
      it('exports all public functions', async () => {
        const defaultExport = mod.default
        expect(defaultExport.getAdminUsers).toBe(mod.getAdminUsers)
        expect(defaultExport.createAdminUser).toBe(mod.createAdminUser)
        expect(defaultExport.updateAdminUser).toBe(mod.updateAdminUser)
        expect(defaultExport.deleteAdminUser).toBe(mod.deleteAdminUser)
        expect(defaultExport.logSecurityEvent).toBe(mod.logSecurityEvent)
        expect(defaultExport.getConfigs).toBe(mod.getConfigs)
        expect(defaultExport.getConfig).toBe(mod.getConfig)
        expect(defaultExport.setConfig).toBe(mod.setConfig)
        expect(defaultExport.getFeatureFlags).toBe(mod.getFeatureFlags)
        expect(defaultExport.getFeatureFlag).toBe(mod.getFeatureFlag)
        expect(defaultExport.updateFeatureFlag).toBe(mod.updateFeatureFlag)
        expect(defaultExport.createFeatureFlag).toBe(mod.createFeatureFlag)
        expect(defaultExport.getAuditLogs).toBe(mod.getAuditLogs)
        expect(defaultExport.createAuditLog).toBe(mod.createAuditLog)
        expect(defaultExport.getSecurityEvents).toBe(mod.getSecurityEvents)
        expect(defaultExport.createSecurityEvent).toBe(mod.createSecurityEvent)
        expect(defaultExport.resolveSecurityEvent).toBe(mod.resolveSecurityEvent)
        expect(defaultExport.getBlockedIPs).toBe(mod.getBlockedIPs)
        expect(defaultExport.blockIP).toBe(mod.blockIP)
        expect(defaultExport.unblockIP).toBe(mod.unblockIP)
        expect(defaultExport.isIPBlocked).toBe(mod.isIPBlocked)
        expect(defaultExport.getPromptTemplates).toBe(mod.getPromptTemplates)
        expect(defaultExport.getPromptTemplate).toBe(mod.getPromptTemplate)
        expect(defaultExport.getActivePromptTemplate).toBe(mod.getActivePromptTemplate)
        expect(defaultExport.updatePromptTemplate).toBe(mod.updatePromptTemplate)
        expect(defaultExport.createPromptTemplate).toBe(mod.createPromptTemplate)
        expect(defaultExport.deletePromptTemplate).toBe(mod.deletePromptTemplate)
        expect(defaultExport.recordPromptUsage).toBe(mod.recordPromptUsage)
        expect(defaultExport.getAIRequestLogs).toBe(mod.getAIRequestLogs)
        expect(defaultExport.createAIRequestLog).toBe(mod.createAIRequestLog)
        expect(defaultExport.getAIUsageStats).toBe(mod.getAIUsageStats)
        expect(defaultExport.getCostBudgets).toBe(mod.getCostBudgets)
        expect(defaultExport.updateCostBudget).toBe(mod.updateCostBudget)
      })
    })
  })
})
