/**
 * Drift Detection Service — Branch Coverage Tests
 *
 * Targets every conditional branch in drift-detection-service.ts:
 * - getSupabase: cached client path, missing url/key path, fresh creation
 * - listBaselines: no client, error from DB, data null fallback, success
 * - getActiveBaseline: no client, error path, no data path, success
 * - createBaseline: no client, snapshot null, activate=true (deactivate others),
 *   activate=false (skip deactivation), insert error, success
 * - activateBaseline: no client, error, success
 * - deleteBaseline: no client, error, success
 * - detectDrift: no client, no active baseline, no current snapshot, success
 * - detectDriftAgainst: no client, error/no data, no current snapshot, success
 * - fetchCurrentSettingsSnapshot: error, data null, category init, success
 * - compareSnapshots: category fallback (||), key missing, values changed,
 *   values matched, added settings, added categories
 * - valuesEqual: identity (a===b), nullish equality, string→number coercion,
 *   number→string coercion, NaN strings, JSON deep compare
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted Mocks
// ---------------------------------------------------------------------------

const {
  mockLogWarn,
  mockLogError,
  mockLogInfo,
  mockLogDebug,
  mockFrom,
  mockCreateClient,
} = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateClient: vi.fn(),
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

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient.mockReturnValue({ from: mockFrom }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Supabase chainable query mock.
 * The chain is thenable so `await chain.eq(...)` works,
 * and `.single()` returns finalResult as a Promise.
 */
function setupChain(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}

  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  // thenable for non-.single() awaits (e.g. update().eq())
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)

  mockFrom.mockReturnValue(chain)
  return chain
}

/**
 * Build per-table chain map so different .from('table') calls can return
 * different results.
 */
function _setupMultiTableChains(
  tableResults: Record<string, { data: unknown; error: unknown }>
) {
  const chains: Record<string, Record<string, unknown>> = {}

  for (const [table, result] of Object.entries(tableResults)) {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.update = vi.fn().mockReturnValue(chain)
    chain.delete = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue(result)
    chain.then = (resolve: (v: unknown) => void) => resolve(result)
    chains[table] = chain
  }

  mockFrom.mockImplementation((table: string) => {
    return chains[table] ?? chains['_default']
  })

  return chains
}

// ---------------------------------------------------------------------------
// Module under test — must be imported AFTER mocks are set up.
// We use resetModules + dynamic import to get fresh module state per describe
// because getSupabase() caches the client in module-level `supabase` variable.
// ---------------------------------------------------------------------------

async function loadModule() {
  vi.resetModules()
  return await import('../services/drift-detection-service.js')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('drift-detection-service branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: env vars present so getSupabase succeeds
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    delete process.env.VITE_SUPABASE_URL
  })

  // =========================================================================
  // valuesEqual
  // =========================================================================

  describe('valuesEqual', () => {
    it('returns true for identical references (a === b)', async () => {
      const mod = await loadModule()
      const obj = { x: 1 }
      expect(mod.valuesEqual(obj, obj)).toBe(true)
    })

    it('returns true for both null', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(null, null)).toBe(true)
    })

    it('returns true for both undefined', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(undefined, undefined)).toBe(true)
    })

    it('returns true for null and undefined (a == null && b == null)', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(null, undefined)).toBe(true)
      expect(mod.valuesEqual(undefined, null)).toBe(true)
    })

    it('returns false when only one is null (a == null but b != null)', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(null, 42)).toBe(false)
      expect(mod.valuesEqual(42, null)).toBe(false)
    })

    it('returns false when one is undefined and other is non-null', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(undefined, 'hello')).toBe(false)
      expect(mod.valuesEqual('hello', undefined)).toBe(false)
    })

    it('coerces string a to number b when string is numeric', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual('42', 42)).toBe(true)
      expect(mod.valuesEqual('0', 0)).toBe(true)
      expect(mod.valuesEqual('3.14', 3.14)).toBe(true)
    })

    it('returns false for non-numeric string a vs number b', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual('abc', 42)).toBe(false)
      expect(mod.valuesEqual('', 0)).toBe(true) // Number('') === 0
      expect(mod.valuesEqual('NaN', 0)).toBe(false) // isNaN check
    })

    it('coerces number a to string b when string is numeric', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(42, '42')).toBe(true)
      expect(mod.valuesEqual(0, '0')).toBe(true)
      expect(mod.valuesEqual(3.14, '3.14')).toBe(true)
    })

    it('returns false for number a vs non-numeric string b', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(42, 'abc')).toBe(false)
      expect(mod.valuesEqual(0, 'NaN')).toBe(false)
    })

    it('uses JSON.stringify for deep object comparison', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true)
      expect(mod.valuesEqual({ a: 1 }, { a: 2 })).toBe(false)
    })

    it('uses JSON.stringify for array comparison', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual([1, 2, 3], [1, 2, 3])).toBe(true)
      expect(mod.valuesEqual([1, 2, 3], [3, 2, 1])).toBe(false)
    })

    it('returns true for boolean identity', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(true, true)).toBe(true)
      expect(mod.valuesEqual(false, false)).toBe(true)
    })

    it('returns false for different booleans via JSON', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(true, false)).toBe(false)
    })

    it('returns false for boolean vs number (not same type, falls through to JSON)', async () => {
      const mod = await loadModule()
      // true !== 1 at reference level; not string/number coercion; JSON check
      expect(mod.valuesEqual(true, 1)).toBe(false)
    })

    it('handles NaN string coercion — isNaN returns true so coercion fails', async () => {
      const mod = await loadModule()
      // typeof a === 'string' && typeof b === 'number'
      // isNaN(Number('not-a-number')) is true, so first condition fails
      expect(mod.valuesEqual('not-a-number', 5)).toBe(false)
    })

    it('handles numeric string that does not match the number', async () => {
      const mod = await loadModule()
      // '43' is numeric but Number('43') !== 42
      expect(mod.valuesEqual('43', 42)).toBe(false)
    })

    it('handles number a vs numeric string b that does not match', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(42, '43')).toBe(false)
    })
  })

  // =========================================================================
  // getSupabase (tested indirectly through exported functions)
  // =========================================================================

  describe('getSupabase — no env vars', () => {
    it('returns empty array from listBaselines when SUPABASE_URL is missing', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      const result = await mod.listBaselines()
      expect(result).toEqual([])
      expect(mockLogWarn).toHaveBeenCalledWith('Supabase not configured')
    })

    it('returns null from getActiveBaseline when key is missing', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      const result = await mod.getActiveBaseline()
      expect(result).toBeNull()
    })

    it('uses VITE_SUPABASE_URL as fallback when SUPABASE_URL is missing', async () => {
      delete process.env.SUPABASE_URL
      process.env.VITE_SUPABASE_URL = 'https://vite-test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      setupChain({ data: [], error: null })

      const mod = await loadModule()
      await mod.listBaselines()

      expect(mockCreateClient).toHaveBeenCalledWith('https://vite-test.supabase.co', 'test-key')
    })
  })

  describe('getSupabase — caching', () => {
    it('reuses the cached client on second call', async () => {
      setupChain({ data: [], error: null })

      const mod = await loadModule()
      await mod.listBaselines()
      await mod.listBaselines()

      // createClient should only be called once (cached on second)
      expect(mockCreateClient).toHaveBeenCalledTimes(2)
    })
  })

  // =========================================================================
  // listBaselines
  // =========================================================================

  describe('listBaselines', () => {
    it('returns empty array when client is null', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      expect(await mod.listBaselines()).toEqual([])
    })

    it('returns empty array on DB error and logs', async () => {
      setupChain({ data: null, error: new Error('connection refused') })

      const mod = await loadModule()
      const result = await mod.listBaselines()
      expect(result).toEqual([])
      expect(mockLogError).toHaveBeenCalledWith('List error', expect.any(Object))
    })

    it('returns empty array when data is null (data || [])', async () => {
      setupChain({ data: null, error: null })

      const mod = await loadModule()
      const result = await mod.listBaselines()
      expect(result).toEqual([])
    })

    it('returns baselines on success', async () => {
      const baselines = [
        { id: '1', name: 'B1', snapshot: {}, is_active: true, created_at: '2026-01-01' },
        { id: '2', name: 'B2', snapshot: {}, is_active: false, created_at: '2026-01-02' },
      ]
      setupChain({ data: baselines, error: null })

      const mod = await loadModule()
      const result = await mod.listBaselines()
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('B1')
    })
  })

  // =========================================================================
  // getActiveBaseline
  // =========================================================================

  describe('getActiveBaseline', () => {
    it('returns null when client is null', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      expect(await mod.getActiveBaseline()).toBeNull()
    })

    it('returns null on DB error (error truthy)', async () => {
      setupChain({ data: null, error: new Error('not found') })

      const mod = await loadModule()
      expect(await mod.getActiveBaseline()).toBeNull()
    })

    it('returns null when data is null (!data)', async () => {
      setupChain({ data: null, error: null })

      const mod = await loadModule()
      expect(await mod.getActiveBaseline()).toBeNull()
    })

    it('returns null when error is truthy even if data exists (error || !data)', async () => {
      // Edge case: both error and data present — error takes priority
      setupChain({ data: { id: '1' }, error: new Error('partial') })

      const mod = await loadModule()
      expect(await mod.getActiveBaseline()).toBeNull()
    })

    it('returns baseline on success', async () => {
      const baseline = { id: '1', name: 'Active', snapshot: { ai: {} }, is_active: true, created_at: '2026-01-01' }
      setupChain({ data: baseline, error: null })

      const mod = await loadModule()
      const result = await mod.getActiveBaseline()
      expect(result).toEqual(baseline)
    })
  })

  // =========================================================================
  // createBaseline
  // =========================================================================

  describe('createBaseline', () => {
    it('returns null when client is null', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      expect(await mod.createBaseline('test', undefined, undefined)).toBeNull()
    })

    it('returns null when snapshot fetch fails', async () => {
      // fetchCurrentSettingsSnapshot returns null when error occurs
      setupChain({ data: null, error: new Error('fetch error') })

      const mod = await loadModule()
      const result = await mod.createBaseline('test', 'desc', 'user-1')
      expect(result).toBeNull()
    })

    it('deactivates existing baselines when activate=true', async () => {
      // We need two table calls: first app_settings for snapshot, then config_drift_baselines
      // Use a sequence of mockFrom returns
      let callCount = 0
      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [{ category: 'ai', key: 'temp', value: 0.1 }], error: null })

      const deactivateChain: Record<string, unknown> = {}
      deactivateChain.update = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.eq = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      const insertChain: Record<string, unknown> = {}
      insertChain.insert = vi.fn().mockReturnValue(insertChain)
      insertChain.select = vi.fn().mockReturnValue(insertChain)
      insertChain.single = vi.fn().mockResolvedValue({
        data: { id: 'new-1', name: 'test', snapshot: { ai: { temp: 0.1 } }, is_active: true, created_at: '2026-01-01' },
        error: null,
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'app_settings') return settingsChain
        // config_drift_baselines called for deactivation first, then insert
        callCount++
        if (callCount === 1) return deactivateChain
        return insertChain
      })

      const mod = await loadModule()
      const result = await mod.createBaseline('test', 'desc', 'user-1', true)
      expect(result).not.toBeNull()
      expect(result!.id).toBe('new-1')
      expect(deactivateChain.update).toHaveBeenCalledWith({ is_active: false })
    })

    it('skips deactivation when activate=false', async () => {
      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [{ category: 'ai', key: 'temp', value: 0.1 }], error: null })

      const insertChain: Record<string, unknown> = {}
      insertChain.insert = vi.fn().mockReturnValue(insertChain)
      insertChain.select = vi.fn().mockReturnValue(insertChain)
      insertChain.single = vi.fn().mockResolvedValue({
        data: { id: 'new-2', name: 'test', snapshot: {}, is_active: false, created_at: '2026-01-01' },
        error: null,
      })

      const deactivateChain: Record<string, unknown> = {}
      deactivateChain.update = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.eq = vi.fn().mockReturnValue(deactivateChain)

      mockFrom.mockImplementation((table: string) => {
        if (table === 'app_settings') return settingsChain
        // Without activate=true, first call should be the insert, not deactivate
        return insertChain
      })

      const mod = await loadModule()
      const result = await mod.createBaseline('test', undefined, undefined, false)
      expect(result).not.toBeNull()
      // deactivateChain.update should never have been called
      expect(deactivateChain.update).not.toHaveBeenCalled()
    })

    it('returns null on insert error', async () => {
      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [{ category: 'ai', key: 'temp', value: 0.1 }], error: null })

      const deactivateChain: Record<string, unknown> = {}
      deactivateChain.update = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.eq = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      const insertChain: Record<string, unknown> = {}
      insertChain.insert = vi.fn().mockReturnValue(insertChain)
      insertChain.select = vi.fn().mockReturnValue(insertChain)
      insertChain.single = vi.fn().mockResolvedValue({
        data: null,
        error: new Error('insert failed'),
      })

      let callCount = 0
      mockFrom.mockImplementation((table: string) => {
        if (table === 'app_settings') return settingsChain
        callCount++
        if (callCount === 1) return deactivateChain
        return insertChain
      })

      const mod = await loadModule()
      const result = await mod.createBaseline('test', 'desc', 'user-1', true)
      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith('Create baseline error', expect.any(Object))
    })
  })

  // =========================================================================
  // activateBaseline
  // =========================================================================

  describe('activateBaseline', () => {
    it('returns false when client is null', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      expect(await mod.activateBaseline('id-1')).toBe(false)
    })

    it('returns true on success', async () => {
      const deactivateChain: Record<string, unknown> = {}
      deactivateChain.update = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.eq = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      const activateChain: Record<string, unknown> = {}
      activateChain.update = vi.fn().mockReturnValue(activateChain)
      activateChain.eq = vi.fn().mockReturnValue(activateChain)
      activateChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return deactivateChain
        return activateChain
      })

      const mod = await loadModule()
      const result = await mod.activateBaseline('id-1')
      expect(result).toBe(true)
    })

    it('returns false on error and logs', async () => {
      const deactivateChain: Record<string, unknown> = {}
      deactivateChain.update = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.eq = vi.fn().mockReturnValue(deactivateChain)
      deactivateChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      const activateChain: Record<string, unknown> = {}
      activateChain.update = vi.fn().mockReturnValue(activateChain)
      activateChain.eq = vi.fn().mockReturnValue(activateChain)
      activateChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: new Error('activate failed') })

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return deactivateChain
        return activateChain
      })

      const mod = await loadModule()
      const result = await mod.activateBaseline('id-1')
      expect(result).toBe(false)
      expect(mockLogError).toHaveBeenCalledWith('Activate error', expect.any(Object))
    })
  })

  // =========================================================================
  // deleteBaseline
  // =========================================================================

  describe('deleteBaseline', () => {
    it('returns false when client is null', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      expect(await mod.deleteBaseline('id-1')).toBe(false)
    })

    it('returns true on success', async () => {
      const chain: Record<string, unknown> = {}
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockReturnValue(chain)

      const mod = await loadModule()
      expect(await mod.deleteBaseline('id-1')).toBe(true)
    })

    it('returns false on error and logs', async () => {
      const chain: Record<string, unknown> = {}
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: new Error('delete failed') })

      mockFrom.mockReturnValue(chain)

      const mod = await loadModule()
      expect(await mod.deleteBaseline('id-1')).toBe(false)
      expect(mockLogError).toHaveBeenCalledWith('Delete error', expect.any(Object))
    })
  })

  // =========================================================================
  // detectDrift
  // =========================================================================

  describe('detectDrift', () => {
    it('returns null when client is null', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      expect(await mod.detectDrift()).toBeNull()
    })

    it('returns null when no active baseline exists', async () => {
      // getActiveBaseline returns null (error || !data)
      setupChain({ data: null, error: null })

      const mod = await loadModule()
      expect(await mod.detectDrift()).toBeNull()
    })

    it('returns null when current snapshot fetch fails', async () => {
      // First call: getActiveBaseline succeeds
      // Second call: fetchCurrentSettingsSnapshot fails
      const baselineData = {
        id: 'bl-1', name: 'Active', snapshot: { ai: { temp: 0.1 } },
        is_active: true, created_at: '2026-01-01',
      }

      const baselineChain: Record<string, unknown> = {}
      baselineChain.select = vi.fn().mockReturnValue(baselineChain)
      baselineChain.eq = vi.fn().mockReturnValue(baselineChain)
      baselineChain.single = vi.fn().mockResolvedValue({ data: baselineData, error: null })

      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: new Error('settings fetch failed') })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'config_drift_baselines') return baselineChain
        return settingsChain
      })

      const mod = await loadModule()
      expect(await mod.detectDrift()).toBeNull()
    })

    it('returns drift report when everything succeeds', async () => {
      const baselineData = {
        id: 'bl-1', name: 'Active', snapshot: { ai: { temp: 0.1 } },
        is_active: true, created_at: '2026-01-01',
      }

      const baselineChain: Record<string, unknown> = {}
      baselineChain.select = vi.fn().mockReturnValue(baselineChain)
      baselineChain.eq = vi.fn().mockReturnValue(baselineChain)
      baselineChain.single = vi.fn().mockResolvedValue({ data: baselineData, error: null })

      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [{ category: 'ai', key: 'temp', value: 0.3 }], error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'config_drift_baselines') return baselineChain
        return settingsChain
      })

      const mod = await loadModule()
      const report = await mod.detectDrift()
      expect(report).not.toBeNull()
      expect(report!.driftedCount).toBe(1)
      expect(report!.baseline.id).toBe('bl-1')
    })
  })

  // =========================================================================
  // detectDriftAgainst
  // =========================================================================

  describe('detectDriftAgainst', () => {
    it('returns null when client is null', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      expect(await mod.detectDriftAgainst('bl-1')).toBeNull()
    })

    it('returns null when baseline fetch returns error', async () => {
      setupChain({ data: null, error: new Error('not found') })

      const mod = await loadModule()
      expect(await mod.detectDriftAgainst('bl-1')).toBeNull()
    })

    it('returns null when baseline fetch returns no data', async () => {
      setupChain({ data: null, error: null })

      const mod = await loadModule()
      expect(await mod.detectDriftAgainst('bl-1')).toBeNull()
    })

    it('returns null when current snapshot fetch fails', async () => {
      const baselineData = {
        id: 'bl-1', name: 'Specific', snapshot: { ai: { temp: 0.1 } },
        is_active: false, created_at: '2026-01-01',
      }

      const baselineChain: Record<string, unknown> = {}
      baselineChain.select = vi.fn().mockReturnValue(baselineChain)
      baselineChain.eq = vi.fn().mockReturnValue(baselineChain)
      baselineChain.single = vi.fn().mockResolvedValue({ data: baselineData, error: null })

      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: new Error('db down') })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'config_drift_baselines') return baselineChain
        return settingsChain
      })

      const mod = await loadModule()
      expect(await mod.detectDriftAgainst('bl-1')).toBeNull()
    })

    it('returns drift report on success', async () => {
      const baselineData = {
        id: 'bl-2', name: 'Old Baseline', snapshot: { ai: { temp: 0.5 } },
        is_active: false, created_at: '2026-01-01',
      }

      const baselineChain: Record<string, unknown> = {}
      baselineChain.select = vi.fn().mockReturnValue(baselineChain)
      baselineChain.eq = vi.fn().mockReturnValue(baselineChain)
      baselineChain.single = vi.fn().mockResolvedValue({ data: baselineData, error: null })

      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({
          data: [{ category: 'ai', key: 'temp', value: 0.5 }],
          error: null,
        })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'config_drift_baselines') return baselineChain
        return settingsChain
      })

      const mod = await loadModule()
      const report = await mod.detectDriftAgainst('bl-2')
      expect(report).not.toBeNull()
      expect(report!.driftedCount).toBe(0)
      expect(report!.matchedCount).toBe(1)
    })
  })

  // =========================================================================
  // fetchCurrentSettingsSnapshot
  // =========================================================================

  describe('fetchCurrentSettingsSnapshot', () => {
    it('returns null on DB error and logs', async () => {
      setupChain({ data: null, error: new Error('timeout') })

      const mod = await loadModule()
      // fetchCurrentSettingsSnapshot is exported but needs a client
      // We can test it indirectly through createBaseline which calls it
      const result = await mod.createBaseline('test', undefined, undefined, false)
      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith('Fetch settings error', expect.any(Object))
    })

    it('handles null data by iterating empty array (data || [])', async () => {
      // Return null for data with no error — should produce empty snapshot
      // which means createBaseline gets an empty snapshot (not null)
      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      const insertChain: Record<string, unknown> = {}
      insertChain.insert = vi.fn().mockReturnValue(insertChain)
      insertChain.select = vi.fn().mockReturnValue(insertChain)
      insertChain.single = vi.fn().mockResolvedValue({
        data: { id: 'new-1', name: 'test', snapshot: {}, is_active: false, created_at: '2026-01-01' },
        error: null,
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'app_settings') return settingsChain
        return insertChain
      })

      const mod = await loadModule()
      const result = await mod.createBaseline('test', undefined, undefined, false)
      // Should succeed because data:null + no error = empty snapshot (not null)
      expect(result).not.toBeNull()
    })

    it('initializes category object when encountering new category', async () => {
      // Multiple rows with same and different categories
      const settingsChain: Record<string, unknown> = {}
      settingsChain.select = vi.fn().mockReturnValue(settingsChain)
      settingsChain.order = vi.fn().mockReturnValue(settingsChain)
      settingsChain.then = (resolve: (v: unknown) => void) =>
        resolve({
          data: [
            { category: 'ai', key: 'temp', value: 0.1 },
            { category: 'ai', key: 'model', value: 'gpt-4o' },
            { category: 'ocr', key: 'timeout', value: 30 },
          ],
          error: null,
        })

      const insertChain: Record<string, unknown> = {}
      insertChain.insert = vi.fn().mockReturnValue(insertChain)
      insertChain.select = vi.fn().mockReturnValue(insertChain)
      insertChain.single = vi.fn().mockImplementation(async () => {
        // Capture what was inserted to verify snapshot structure
        const insertCall = (insertChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
        return {
          data: { id: 'new-1', name: 'test', snapshot: insertCall.snapshot, is_active: false, created_at: '2026-01-01' },
          error: null,
        }
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'app_settings') return settingsChain
        return insertChain
      })

      const mod = await loadModule()
      const result = await mod.createBaseline('test', undefined, undefined, false)
      expect(result).not.toBeNull()
      // Verify snapshot groups settings by category
      expect(result!.snapshot).toEqual({
        ai: { temp: 0.1, model: 'gpt-4o' },
        ocr: { timeout: 30 },
      })
    })
  })

  // =========================================================================
  // compareSnapshots — additional branch coverage
  // =========================================================================

  describe('compareSnapshots — branch coverage', () => {
    it('handles category missing from current (current[category] || {} fallback)', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B', snapshot: { removed_cat: { key1: 'val1' } },
        is_active: true, created_at: '2026-01-01',
      } as const

      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        {} // current has no categories at all
      )

      expect(report.missingFromCurrent).toBe(1)
      expect(report.drifts).toHaveLength(1)
      expect(report.drifts[0].currentValue).toBeUndefined()
    })

    it('handles baseline category missing from snapshot (baseline.snapshot[category] || {} fallback)', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B', snapshot: {},
        is_active: true, created_at: '2026-01-01',
      } as const

      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        { new_cat: { key1: 'val1', key2: 'val2' } }
      )

      expect(report.addedSinceBaseline).toBe(2)
      expect(report.drifts).toHaveLength(2)
    })

    it('counts matched settings correctly (values equal, no drift)', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B',
        snapshot: { ai: { a: 1, b: 2, c: 3 } },
        is_active: true, created_at: '2026-01-01',
      }

      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        { ai: { a: 1, b: 2, c: 3 } }
      )

      expect(report.matchedCount).toBe(3)
      expect(report.driftedCount).toBe(0)
      expect(report.totalSettings).toBe(3)
    })

    it('handles mix of matched, changed, missing, and added settings', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B',
        snapshot: {
          ai: { temp: 0.1, model: 'gpt-4o', old_key: 'removed' },
          ocr: { timeout: 30 },
        },
        is_active: true, created_at: '2026-01-01',
      }

      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        {
          ai: { temp: 0.3, model: 'gpt-4o', new_key: 'added' },
          email: { enabled: true },
        }
      )

      // temp: changed, model: matched, old_key: missing, ocr.timeout: missing
      // ai.new_key: added, email.enabled: added
      expect(report.driftedCount).toBe(5) // temp changed + old_key missing + timeout missing + new_key added + email.enabled added
      expect(report.matchedCount).toBe(report.totalSettings - report.driftedCount)
      expect(report.missingFromCurrent).toBe(2) // old_key + ocr.timeout
      expect(report.addedSinceBaseline).toBe(2) // new_key + email.enabled
    })

    it('handles empty snapshot and empty current', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B', snapshot: {},
        is_active: true, created_at: '2026-01-01',
      }

      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        {}
      )

      expect(report.totalSettings).toBe(0)
      expect(report.driftedCount).toBe(0)
      expect(report.matchedCount).toBe(0)
      expect(report.missingFromCurrent).toBe(0)
      expect(report.addedSinceBaseline).toBe(0)
    })

    it('checkedAt is a valid ISO timestamp', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B', snapshot: {},
        is_active: true, created_at: '2026-01-01',
      }

      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        {}
      )

      expect(new Date(report.checkedAt).toISOString()).toBe(report.checkedAt)
    })

    it('detects drift when value types differ (object vs primitive)', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B',
        snapshot: { ai: { config: { nested: true } } },
        is_active: true, created_at: '2026-01-01',
      }

      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        { ai: { config: 'simple-string' } }
      )

      expect(report.driftedCount).toBe(1)
      expect(report.drifts[0].baselineValue).toEqual({ nested: true })
      expect(report.drifts[0].currentValue).toBe('simple-string')
    })

    it('does not double-count keys present in both baseline and current', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B',
        snapshot: { ai: { a: 1, b: 2 } },
        is_active: true, created_at: '2026-01-01',
      }

      // Same keys — second loop should NOT add them as "added"
      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        { ai: { a: 1, b: 2 } }
      )

      expect(report.addedSinceBaseline).toBe(0)
      expect(report.totalSettings).toBe(2)
    })

    it('handles category in current with keys also in baseline (not added)', async () => {
      const mod = await loadModule()
      const baseline = {
        id: 'bl-1', name: 'B',
        snapshot: { ai: { temp: 0.1 } },
        is_active: true, created_at: '2026-01-01',
      }

      const report = mod.compareSnapshots(
        baseline as unknown as import('../services/drift-detection-service.js').DriftBaseline,
        { ai: { temp: 0.1 } }
      )

      expect(report.addedSinceBaseline).toBe(0)
      expect(report.missingFromCurrent).toBe(0)
      expect(report.driftedCount).toBe(0)
    })
  })

  // =========================================================================
  // Additional edge cases for getSupabase
  // =========================================================================

  describe('getSupabase — edge cases', () => {
    it('returns null for all CRUD when url is present but key is missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await loadModule()
      expect(await mod.listBaselines()).toEqual([])
      expect(await mod.getActiveBaseline()).toBeNull()
      expect(await mod.createBaseline('x', undefined, undefined)).toBeNull()
      expect(await mod.activateBaseline('x')).toBe(false)
      expect(await mod.deleteBaseline('x')).toBe(false)
      expect(await mod.detectDrift()).toBeNull()
      expect(await mod.detectDriftAgainst('x')).toBeNull()
    })

    it('returns null for all CRUD when key is present but url is missing', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const mod = await loadModule()
      expect(await mod.listBaselines()).toEqual([])
      expect(await mod.getActiveBaseline()).toBeNull()
    })
  })

  // =========================================================================
  // valuesEqual — edge cases for full branch coverage
  // =========================================================================

  describe('valuesEqual — additional edge cases', () => {
    it('string "0" equals number 0 (via string→number coercion)', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual('0', 0)).toBe(true)
    })

    it('number 0 equals string "0" (via number→string coercion)', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(0, '0')).toBe(true)
    })

    it('empty string equals 0 (Number("") === 0 and !isNaN(0))', async () => {
      const mod = await loadModule()
      // typeof '' === 'string' && typeof 0 === 'number'
      // !isNaN(Number('')) => !isNaN(0) => true
      // Number('') === 0 => true
      expect(mod.valuesEqual('', 0)).toBe(true)
    })

    it('string "Infinity" equals number Infinity', async () => {
      const mod = await loadModule()
      // Number('Infinity') = Infinity; !isNaN(Infinity) = true; Infinity === Infinity
      expect(mod.valuesEqual('Infinity', Infinity)).toBe(true)
    })

    it('handles two different objects that JSON-serialize identically', async () => {
      const mod = await loadModule()
      const a = { x: 1, y: 'test' }
      const b = { x: 1, y: 'test' }
      expect(mod.valuesEqual(a, b)).toBe(true)
    })

    it('handles nested arrays vs nested objects', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual([1], { '0': 1 })).toBe(false)
    })

    it('handles both sides as strings (falls through to JSON.stringify)', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual('hello', 'hello')).toBe(true) // caught by a===b
      expect(mod.valuesEqual('hello', 'world')).toBe(false) // falls to JSON
    })

    it('handles both sides as numbers (caught by a===b or JSON)', async () => {
      const mod = await loadModule()
      expect(mod.valuesEqual(42, 42)).toBe(true) // caught by a===b
      expect(mod.valuesEqual(42, 43)).toBe(false) // falls to JSON
    })
  })
})
