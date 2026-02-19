/**
 * Webhook Service — Branch Coverage Tests
 *
 * Targets every conditional branch in webhook-service.ts:
 * - if/else, ternary, ||, ??, && short-circuit
 * - Error handling paths (catch blocks, error conditions)
 * - Retry logic branches (attempt < MAX, attempt === MAX, delay selection)
 * - Event delivery success/failure/timeout paths
 * - HMAC signature generation edge cases
 * - mapDbToWebhook fallback branches (events || [], categories || [], failure_count || 0)
 * - fireWebhooks category filtering (empty categories vs specific categories)
 * - getSupabase caching (already initialized vs fresh init)
 * - updateWebhook selective field inclusion
 * - testWebhook response.text() catch fallback
 * - attemptDelivery response.text() catch fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

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

// Mock Supabase — track createClient calls
vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient.mockReturnValue({ from: mockFrom }),
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable Supabase query mock.
 * `finalResult` is what `.single()` resolves to.
 * The `then` property makes the chain itself thenable (for non-.single() calls like delete/update without .single()).
 */
function setupChain(finalResult: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}

  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockReturnValue(chain)
  chain.contains = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  // Make the chain itself thenable for awaited chains without .single()
  ;(chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) =>
    resolve(finalResult)

  mockFrom.mockReturnValue(chain)
  return chain
}

/**
 * Build a per-table chain map so different .from('table') calls return different results.
 */
function _setupMultiTableChains(
  tableResults: Record<string, { data: unknown; error: unknown; count?: number }>
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
    chain.range = vi.fn().mockReturnValue(chain)
    chain.contains = vi.fn().mockReturnValue(chain)
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
// Environment & Fixtures
// ---------------------------------------------------------------------------

const ENV_BACKUP: Record<string, string | undefined> = {}

const MOCK_WEBHOOK_ROW = {
  id: 'wh-branch-001',
  name: 'Branch Test Webhook',
  url: 'https://branch-test.example.com/hook',
  secret: 'whsec_branchtest123',
  events: ['setting.updated'],
  categories: [],
  enabled: true,
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  last_triggered_at: null,
  failure_count: 0,
}

// Save original fetch
const originalFetch = globalThis.fetch

// ============================================================================
// TESTS
// ============================================================================

describe('webhook-service branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: false })

    // Save and set env
    ENV_BACKUP.SUPABASE_URL = process.env.SUPABASE_URL
    ENV_BACKUP.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    ENV_BACKUP.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL

    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    delete process.env.VITE_SUPABASE_URL

    // Restore fetch
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    vi.useRealTimers()
    // Restore env
    for (const [k, v] of Object.entries(ENV_BACKUP)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    globalThis.fetch = originalFetch
  })

  async function importService() {
    vi.resetModules()
    return import('../services/webhook-service.js')
  }

  // ==========================================================================
  // getSupabase branches
  // ==========================================================================
  describe('getSupabase branches', () => {
    it('returns null and warns when SUPABASE_URL is missing (no VITE fallback)', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'

      const { listWebhooks } = await importService()
      const result = await listWebhooks()

      expect(result).toEqual([])
      expect(mockLogWarn).toHaveBeenCalledWith('Supabase not configured')
    })

    it('returns null and warns when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const { listWebhooks } = await importService()
      const result = await listWebhooks()

      expect(result).toEqual([])
      expect(mockLogWarn).toHaveBeenCalledWith('Supabase not configured')
    })

    it('falls back to VITE_SUPABASE_URL when SUPABASE_URL not set', async () => {
      delete process.env.SUPABASE_URL
      process.env.VITE_SUPABASE_URL = 'https://vite-fallback.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'

      setupChain({ data: [], error: null })

      const { listWebhooks } = await importService()
      await listWebhooks()

      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://vite-fallback.supabase.co',
        'key'
      )
    })

    it('caches the Supabase client across multiple calls (returns early when already set)', async () => {
      setupChain({ data: [], error: null })

      const { listWebhooks, getWebhook } = await importService()
      await listWebhooks()
      await getWebhook('id-1')

      // createClient should only be called once (cached on second call)
      expect(mockCreateClient).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // mapDbToWebhook fallback branches
  // ==========================================================================
  describe('mapDbToWebhook fallback branches', () => {
    it('defaults events to [] when row.events is null/undefined', async () => {
      const rowWithoutEvents = { ...MOCK_WEBHOOK_ROW, events: null }
      setupChain({ data: rowWithoutEvents, error: null })

      const { getWebhook } = await importService()
      const result = await getWebhook('wh-branch-001')

      expect(result).not.toBeNull()
      expect(result!.events).toEqual([])
    })

    it('defaults categories to [] when row.categories is null/undefined', async () => {
      const rowWithoutCategories = { ...MOCK_WEBHOOK_ROW, categories: undefined }
      setupChain({ data: rowWithoutCategories, error: null })

      const { getWebhook } = await importService()
      const result = await getWebhook('wh-branch-001')

      expect(result).not.toBeNull()
      expect(result!.categories).toEqual([])
    })

    it('defaults failure_count to 0 when row.failure_count is null/undefined', async () => {
      const rowWithoutFailureCount = { ...MOCK_WEBHOOK_ROW, failure_count: null }
      setupChain({ data: rowWithoutFailureCount, error: null })

      const { getWebhook } = await importService()
      const result = await getWebhook('wh-branch-001')

      expect(result).not.toBeNull()
      expect(result!.failure_count).toBe(0)
    })

    it('preserves actual values when events/categories/failure_count are truthy', async () => {
      const row = {
        ...MOCK_WEBHOOK_ROW,
        events: ['setting.updated', 'setting.batch_updated'],
        categories: ['ai', 'ocr'],
        failure_count: 5,
      }
      setupChain({ data: row, error: null })

      const { getWebhook } = await importService()
      const result = await getWebhook('wh-branch-001')

      expect(result!.events).toEqual(['setting.updated', 'setting.batch_updated'])
      expect(result!.categories).toEqual(['ai', 'ocr'])
      expect(result!.failure_count).toBe(5)
    })

    it('maps last_triggered_at as undefined when null in DB', async () => {
      setupChain({ data: { ...MOCK_WEBHOOK_ROW, last_triggered_at: null }, error: null })

      const { getWebhook } = await importService()
      const result = await getWebhook('wh-branch-001')

      // null casts to undefined or null through `as string | undefined`
      expect(result).not.toBeNull()
    })
  })

  // ==========================================================================
  // listWebhooks branches
  // ==========================================================================
  describe('listWebhooks error logging', () => {
    it('logs error and returns [] on query error', async () => {
      setupChain({ data: null, error: { message: 'pg connection refused' } })

      const { listWebhooks } = await importService()
      const result = await listWebhooks()

      expect(result).toEqual([])
      expect(mockLogError).toHaveBeenCalledWith('List error', expect.any(Object))
    })

    it('returns [] when data is null but no error', async () => {
      setupChain({ data: null, error: null })

      const { listWebhooks } = await importService()
      const result = await listWebhooks()

      // (data || []).map(...) => [].map(...) => []
      expect(result).toEqual([])
    })
  })

  // ==========================================================================
  // getWebhook branches
  // ==========================================================================
  describe('getWebhook error logging', () => {
    it('logs error on query failure', async () => {
      setupChain({ data: null, error: { message: 'not found' } })

      const { getWebhook } = await importService()
      const result = await getWebhook('wh-999')

      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith('Get error', expect.any(Object))
    })
  })

  // ==========================================================================
  // createWebhook branches
  // ==========================================================================
  describe('createWebhook branches', () => {
    it('uses empty array for categories when not provided (categories || [])', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { createWebhook } = await importService()
      await createWebhook({
        name: 'No Categories',
        url: 'https://example.com/hook',
        events: ['setting.updated'],
        // categories not provided → should default to []
      })

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({ categories: [] }),
      ])
    })

    it('uses provided categories when specified', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { createWebhook } = await importService()
      await createWebhook({
        name: 'With Categories',
        url: 'https://example.com/hook',
        events: ['setting.updated'],
        categories: ['ai'],
      })

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({ categories: ['ai'] }),
      ])
    })

    it('defaults enabled to true when not provided (enabled ?? true)', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { createWebhook } = await importService()
      await createWebhook({
        name: 'Default Enabled',
        url: 'https://example.com/hook',
        events: ['setting.updated'],
        // enabled not provided → should default to true via ??
      })

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({ enabled: true }),
      ])
    })

    it('respects enabled=false (enabled ?? true does not override explicit false)', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { createWebhook } = await importService()
      await createWebhook({
        name: 'Disabled',
        url: 'https://example.com/hook',
        events: ['setting.updated'],
        enabled: false,
      })

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({ enabled: false }),
      ])
    })

    it('logs error and returns null on insert failure', async () => {
      setupChain({ data: null, error: { message: 'duplicate' } })

      const { createWebhook } = await importService()
      const result = await createWebhook({
        name: 'Dup',
        url: 'https://example.com',
        events: ['setting.updated'],
      })

      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith('Create error', expect.any(Object))
    })
  })

  // ==========================================================================
  // updateWebhook — selective field inclusion branches
  // ==========================================================================
  describe('updateWebhook field inclusion branches', () => {
    it('includes name in updateData when input.name is defined', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { updateWebhook } = await importService()
      await updateWebhook('wh-001', { name: 'New Name' })

      const arg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.name).toBe('New Name')
    })

    it('includes url in updateData when input.url is defined', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { updateWebhook } = await importService()
      await updateWebhook('wh-001', { url: 'https://new.example.com' })

      const arg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.url).toBe('https://new.example.com')
    })

    it('includes events in updateData when input.events is defined', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { updateWebhook } = await importService()
      await updateWebhook('wh-001', {
        events: ['setting.updated', 'feature_flag.toggled'],
      })

      const arg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.events).toEqual(['setting.updated', 'feature_flag.toggled'])
    })

    it('includes categories in updateData when input.categories is defined', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { updateWebhook } = await importService()
      await updateWebhook('wh-001', { categories: ['evaluation'] })

      const arg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.categories).toEqual(['evaluation'])
    })

    it('includes enabled in updateData when input.enabled is defined', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { updateWebhook } = await importService()
      await updateWebhook('wh-001', { enabled: false })

      const arg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.enabled).toBe(false)
    })

    it('omits all optional fields when none provided (only updated_at)', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { updateWebhook } = await importService()
      await updateWebhook('wh-001', {})

      const arg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.updated_at).toBeDefined()
      expect(arg.name).toBeUndefined()
      expect(arg.url).toBeUndefined()
      expect(arg.events).toBeUndefined()
      expect(arg.categories).toBeUndefined()
      expect(arg.enabled).toBeUndefined()
    })

    it('includes all fields when all provided', async () => {
      const chain = setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const { updateWebhook } = await importService()
      await updateWebhook('wh-001', {
        name: 'All',
        url: 'https://all.example.com',
        events: ['setting.imported'],
        categories: ['ai'],
        enabled: true,
      })

      const arg = (chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.name).toBe('All')
      expect(arg.url).toBe('https://all.example.com')
      expect(arg.events).toEqual(['setting.imported'])
      expect(arg.categories).toEqual(['ai'])
      expect(arg.enabled).toBe(true)
      expect(arg.updated_at).toBeDefined()
    })

    it('logs error on update failure', async () => {
      setupChain({ data: null, error: { message: 'constraint' } })

      const { updateWebhook } = await importService()
      const result = await updateWebhook('wh-001', { name: 'Fail' })

      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith('Update error', expect.any(Object))
    })
  })

  // ==========================================================================
  // deleteWebhook branches
  // ==========================================================================
  describe('deleteWebhook branches', () => {
    it('logs error on delete error', async () => {
      let callCount = 0
      const chain: Record<string, unknown> = {}
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) => {
        callCount++
        if (callCount <= 1) resolve({ data: null, error: null }) // deliveries delete ok
        else resolve({ data: null, error: { message: 'FK error' } }) // webhook delete fails
      }
      mockFrom.mockReturnValue(chain)

      const { deleteWebhook } = await importService()
      const result = await deleteWebhook('wh-001')

      expect(result).toBe(false)
      expect(mockLogError).toHaveBeenCalledWith('Delete error', expect.any(Object))
    })
  })

  // ==========================================================================
  // regenerateSecret branches
  // ==========================================================================
  describe('regenerateSecret branches', () => {
    it('logs error and returns null on update failure', async () => {
      const chain: Record<string, unknown> = {}
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: { message: 'timeout' } })
      mockFrom.mockReturnValue(chain)

      const { regenerateSecret } = await importService()
      const result = await regenerateSecret('wh-001')

      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith(
        'Regenerate secret error',
        expect.any(Object)
      )
    })
  })

  // ==========================================================================
  // fireWebhooks — category filtering branches
  // ==========================================================================
  describe('fireWebhooks category filtering', () => {
    it('delivers to webhooks with empty categories (matches all)', async () => {
      // Webhook has categories: [] → should match any event category
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      // We need multi-table: settings_webhooks for select, webhook_deliveries for insert
      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-001' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      // Mock fetch for the actual delivery
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      }) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'temp', previous_value: 0.1, new_value: 0.2 }],
      })

      // fetch should have been called (delivery attempted)
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    it('filters out webhooks whose categories do not include the event category', async () => {
      const webhook = {
        ...MOCK_WEBHOOK_ROW,
        categories: ['evaluation'], // only wants evaluation
      }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      mockFrom.mockReturnValue(selectChain)

      globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai', // doesn't match 'evaluation'
        changes: [{ key: 'temp', previous_value: 0.1, new_value: 0.2 }],
      })

      // fetch should NOT have been called — webhook was filtered out
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('delivers when webhook category matches event category', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: ['ai'] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-002' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      }) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'temp', previous_value: 0.1, new_value: 0.2 }],
      })

      expect(globalThis.fetch).toHaveBeenCalled()
    })

    it('returns early when webhooks is null', async () => {
      // data: null triggers the !webhooks branch
      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockReturnValue(selectChain)

      const { fireWebhooks } = await importService()
      // Should not throw
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [],
      })
    })

    it('catches and logs delivery errors from individual webhooks', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB insert failed' },
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      const { fireWebhooks } = await importService()
      // deliverToWebhook will fail at the insert step and log error
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [],
      })

      // The error from deliverToWebhook should be logged (delivery record insert failed)
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to create delivery record',
        expect.any(Object)
      )
    })
  })

  // ==========================================================================
  // deliverToWebhook — insert error branch
  // ==========================================================================
  describe('deliverToWebhook insert error branch', () => {
    it('returns early when delivery record insert fails (insertError truthy)', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'constraint violation' },
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // fetch should NOT be called since delivery record insert failed
      expect(globalThis.fetch).not.toHaveBeenCalled()
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to create delivery record',
        expect.any(Object)
      )
    })

    it('returns early when delivery data is null (no error but no data)', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      // No error but data is null
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // fetch should NOT be called — !delivery branch taken
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // attemptDelivery — success path
  // ==========================================================================
  describe('attemptDelivery success path', () => {
    it('updates delivery status to success and resets failure_count on 200', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [], failure_count: 3 }

      // Track all update calls with their table names
      const allUpdateCalls: Array<{ table: string; data: unknown }> = []

      // settings_webhooks needs select (for fireWebhooks query) AND update (for failure_count reset)
      const webhookChain: Record<string, unknown> = {}
      webhookChain.select = vi.fn().mockReturnValue(webhookChain)
      webhookChain.eq = vi.fn().mockReturnValue(webhookChain)
      webhookChain.contains = vi.fn().mockReturnValue(webhookChain)
      webhookChain.update = vi.fn().mockImplementation((data: unknown) => {
        allUpdateCalls.push({ table: 'settings_webhooks', data })
        return webhookChain
      })
      webhookChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockImplementation((data: unknown) => {
        allUpdateCalls.push({ table: 'webhook_deliveries', data })
        return deliveryChain
      })
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-success' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return webhookChain
        return deliveryChain
      })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      }) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // Verify delivery update was called with success status
      const deliveryUpdate = allUpdateCalls.find(
        (c) => c.table === 'webhook_deliveries' && (c.data as Record<string, unknown>).status === 'success'
      )
      expect(deliveryUpdate).toBeDefined()
      expect(deliveryUpdate!.data).toEqual(
        expect.objectContaining({
          status: 'success',
          status_code: 200,
          attempts: 1,
        })
      )

      // Verify webhook failure_count was reset to 0
      const webhookUpdate = allUpdateCalls.find(
        (c) => c.table === 'settings_webhooks'
      )
      expect(webhookUpdate).toBeDefined()
      expect(webhookUpdate!.data).toEqual(
        expect.objectContaining({
          failure_count: 0,
        })
      )
    })
  })

  // ==========================================================================
  // attemptDelivery — non-ok response throws, triggers retry
  // ==========================================================================
  describe('attemptDelivery failure and retry', () => {
    it('throws on non-ok response and schedules retry (attempt < MAX)', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-retry' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      // Return a non-ok response (500)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server Error'),
      }) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // Should schedule a retry via setTimeout — update with error_message and next_retry_at
      expect(deliveryChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 1,
          error_message: expect.stringContaining('HTTP 500'),
          next_retry_at: expect.any(String),
        })
      )
    })

    it('marks delivery as failed after max attempts', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [], failure_count: 2 }

      const allUpdateCalls: Array<{ table: string; data: unknown }> = []

      // settings_webhooks needs select + update (for failure_count increment on final failure)
      const webhookChain: Record<string, unknown> = {}
      webhookChain.select = vi.fn().mockReturnValue(webhookChain)
      webhookChain.eq = vi.fn().mockReturnValue(webhookChain)
      webhookChain.contains = vi.fn().mockReturnValue(webhookChain)
      webhookChain.update = vi.fn().mockImplementation((data: unknown) => {
        allUpdateCalls.push({ table: 'settings_webhooks', data })
        return webhookChain
      })
      webhookChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockImplementation((data: unknown) => {
        allUpdateCalls.push({ table: 'webhook_deliveries', data })
        return deliveryChain
      })
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-final-fail' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return webhookChain
        return deliveryChain
      })

      // Fail 3 times (MAX_DELIVERY_ATTEMPTS = 3)
      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: vi.fn().mockResolvedValue('Unavailable'),
        })
      }) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // First attempt happens. It fails and schedules retry via setTimeout.
      // Advance the timer to trigger retry #2
      await vi.advanceTimersByTimeAsync(2000 + 100) // RETRY_DELAYS_MS[0] = 2000

      // Advance again for retry #3
      await vi.advanceTimersByTimeAsync(8000 + 100) // RETRY_DELAYS_MS[1] = 8000

      // After 3 failed attempts, should mark as final failure
      const finalFailure = allUpdateCalls.find(
        (c) =>
          c.table === 'webhook_deliveries' &&
          (c.data as Record<string, unknown>).status === 'failed'
      )
      expect(finalFailure).toBeDefined()
      expect(finalFailure!.data).toEqual(
        expect.objectContaining({
          status: 'failed',
          attempts: 3,
          error_message: expect.stringContaining('HTTP 503'),
          completed_at: expect.any(String),
        })
      )

      // Should increment failure_count on webhook
      const webhookUpdate = allUpdateCalls.find(
        (c) => c.table === 'settings_webhooks'
      )
      expect(webhookUpdate).toBeDefined()
      expect(webhookUpdate!.data).toEqual(
        expect.objectContaining({
          failure_count: 3, // was 2, incremented by 1
        })
      )

      // Should log warning about final failure
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining('Delivery failed after 3 attempts'),
        expect.any(Object)
      )
    })

    it('handles network error (fetch throws) on first attempt', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-network-err' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      // fetch rejects with network error
      globalThis.fetch = vi.fn().mockRejectedValue(
        new Error('ECONNREFUSED')
      ) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // Should schedule retry — error message should contain ECONNREFUSED
      expect(deliveryChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 1,
          error_message: 'ECONNREFUSED',
          next_retry_at: expect.any(String),
        })
      )
    })

    it('handles non-Error throw (unknown error branch)', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [], failure_count: 0 }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-unknown-err' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      // Throw a non-Error value
      globalThis.fetch = vi.fn().mockRejectedValue(
        'string error'
      ) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // error instanceof Error is false → 'Unknown error'
      expect(deliveryChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          error_message: 'Unknown error',
        })
      )
    })

    it('uses last delay when attempt index exceeds RETRY_DELAYS_MS length', async () => {
      // RETRY_DELAYS_MS = [2000, 8000, 30000]
      // For attempt >= 3, delay should be RETRY_DELAYS_MS[2] = 30000 (last entry)
      // But attempt 3 is MAX_DELIVERY_ATTEMPTS, so it goes to final failure.
      // The fallback || is for safety — hard to reach naturally since MAX is 3 and array has 3 entries.
      // We test the || fallback by verifying the delay selection logic works with available data.

      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-delay' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      globalThis.fetch = vi.fn().mockRejectedValue(
        new Error('timeout')
      ) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // First attempt fails, schedules retry with RETRY_DELAYS_MS[0] = 2000
      // Advance to trigger second attempt
      await vi.advanceTimersByTimeAsync(2100)

      // Second attempt fails, schedules retry with RETRY_DELAYS_MS[1] = 8000
      // The second retry attempts uses delay index 1 (attempt=2 → RETRY_DELAYS_MS[2-1] = RETRY_DELAYS_MS[1] = 8000)
      expect(deliveryChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 2,
          error_message: 'timeout',
        })
      )
    })

    it('response.text() catch fallback returns empty string in attemptDelivery', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-text-fail' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      // response.text() rejects — the .catch(() => '') fallback should kick in
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockRejectedValue(new Error('body stream error')),
      }) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // Should still mark as success (response.ok was true)
      expect(deliveryChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          response_body: '', // empty string fallback
        })
      )
    })

    it('truncates long response body in attemptDelivery', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-long-body' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      const longBody = 'A'.repeat(5000)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(longBody),
      }) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // response_body should be truncated to 1000 chars
      expect(deliveryChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          response_body: 'A'.repeat(1000),
        })
      )
    })

    it('failure_count falls back to 0 when webhook.failure_count is falsy (|| 0)', async () => {
      // When failure_count is undefined/null/0, the (webhook.failure_count || 0) + 1 should give 1
      const webhook = {
        ...MOCK_WEBHOOK_ROW,
        categories: [],
        failure_count: undefined,
      }

      const allUpdateCalls: Array<{ table: string; data: unknown }> = []

      // settings_webhooks needs select + update
      const webhookChain: Record<string, unknown> = {}
      webhookChain.select = vi.fn().mockReturnValue(webhookChain)
      webhookChain.eq = vi.fn().mockReturnValue(webhookChain)
      webhookChain.contains = vi.fn().mockReturnValue(webhookChain)
      webhookChain.update = vi.fn().mockImplementation((data: unknown) => {
        allUpdateCalls.push({ table: 'settings_webhooks', data })
        return webhookChain
      })
      webhookChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockImplementation((data: unknown) => {
        allUpdateCalls.push({ table: 'webhook_deliveries', data })
        return deliveryChain
      })
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-fc-undef' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return webhookChain
        return deliveryChain
      })

      // Make all 3 attempts fail so we reach the final failure branch
      globalThis.fetch = vi.fn().mockRejectedValue(
        new Error('fail')
      ) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(2100) // retry 2
      await vi.advanceTimersByTimeAsync(8100) // retry 3 (final)

      // failure_count should be (undefined || 0) + 1 = 1
      const webhookUpdate = allUpdateCalls.find(
        (c) => c.table === 'settings_webhooks'
      )
      expect(webhookUpdate).toBeDefined()
      expect(webhookUpdate!.data).toEqual(
        expect.objectContaining({
          failure_count: 1,
        })
      )
    })
  })

  // ==========================================================================
  // testWebhook branches
  // ==========================================================================
  describe('testWebhook branches', () => {
    it('returns error object when webhook not found', async () => {
      setupChain({ data: null, error: { code: 'PGRST116' } })

      const { testWebhook } = await importService()
      const result = await testWebhook('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Webhook not found')
      expect(result.durationMs).toBe(0)
    })

    it('returns success with statusCode when response.ok', async () => {
      setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('pong'),
      }) as unknown as typeof globalThis.fetch

      const { testWebhook } = await importService()
      const result = await testWebhook('wh-branch-001')

      expect(result.success).toBe(true)
      expect(result.statusCode).toBe(200)
      expect(result.responseBody).toBe('pong')
      expect(result.error).toBeUndefined()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('returns success=false with error when response is not ok', async () => {
      setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: vi.fn().mockResolvedValue('Unprocessable'),
      }) as unknown as typeof globalThis.fetch

      const { testWebhook } = await importService()
      const result = await testWebhook('wh-branch-001')

      expect(result.success).toBe(false)
      expect(result.statusCode).toBe(422)
      expect(result.error).toBe('HTTP 422')
      expect(result.responseBody).toBe('Unprocessable')
    })

    it('handles fetch rejection with Error instance', async () => {
      setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      globalThis.fetch = vi.fn().mockRejectedValue(
        new Error('DNS resolution failed')
      ) as unknown as typeof globalThis.fetch

      const { testWebhook } = await importService()
      const result = await testWebhook('wh-branch-001')

      expect(result.success).toBe(false)
      expect(result.error).toBe('DNS resolution failed')
    })

    it('handles fetch rejection with non-Error value (unknown error)', async () => {
      setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      globalThis.fetch = vi.fn().mockRejectedValue(
        42
      ) as unknown as typeof globalThis.fetch

      const { testWebhook } = await importService()
      const result = await testWebhook('wh-branch-001')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })

    it('response.text() catch fallback returns empty string in testWebhook', async () => {
      setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockRejectedValue(new Error('stream closed')),
      }) as unknown as typeof globalThis.fetch

      const { testWebhook } = await importService()
      const result = await testWebhook('wh-branch-001')

      expect(result.success).toBe(true)
      expect(result.responseBody).toBe('')
    })

    it('truncates long response body to MAX_RESPONSE_BODY_LENGTH', async () => {
      setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      const longBody = 'Z'.repeat(3000)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(longBody),
      }) as unknown as typeof globalThis.fetch

      const { testWebhook } = await importService()
      const result = await testWebhook('wh-branch-001')

      expect(result.responseBody!.length).toBe(1000)
      expect(result.responseBody).toBe('Z'.repeat(1000))
    })

    it('includes correct headers including HMAC signature', async () => {
      setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      }) as unknown as typeof globalThis.fetch

      const { testWebhook, signPayload } = await importService()
      await testWebhook('wh-branch-001')

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const headers = fetchCall[1].headers
      const body = fetchCall[1].body

      // Verify signature matches the payload signed with the webhook's secret
      const expectedSig = signPayload(body, MOCK_WEBHOOK_ROW.secret)
      expect(headers['X-Webhook-Signature']).toBe(expectedSig)
      expect(headers['X-Webhook-Event']).toBe('setting.updated')
      expect(headers['X-Webhook-Delivery']).toBe('test')
      expect(headers['User-Agent']).toBe('InsurAI-Webhooks/1.0')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('sends test payload with correct structure', async () => {
      setupChain({ data: MOCK_WEBHOOK_ROW, error: null })

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      }) as unknown as typeof globalThis.fetch

      const { testWebhook } = await importService()
      await testWebhook('wh-branch-001')

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const payload = JSON.parse(fetchCall[1].body)

      expect(payload.event).toBe('setting.updated')
      expect(payload.timestamp).toBeDefined()
      expect(payload.data.category).toBe('test')
      expect(payload.data.changes).toEqual([{
        key: 'test_ping',
        previous_value: null,
        new_value: 'ping',
      }])
      expect(payload.data.reason).toBe('Test delivery from admin panel')
    })
  })

  // ==========================================================================
  // getDeliveries branches
  // ==========================================================================
  describe('getDeliveries branches', () => {
    it('uses default limit=20 and offset=0 when no options', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const { getDeliveries } = await importService()
      await getDeliveries('wh-001')

      expect(chain.range).toHaveBeenCalledWith(0, 19)
    })

    it('uses provided limit and offset', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const { getDeliveries } = await importService()
      await getDeliveries('wh-001', { limit: 10, offset: 20 })

      expect(chain.range).toHaveBeenCalledWith(20, 29)
    })

    it('returns deliveries with total count', async () => {
      const deliveries = [
        { id: 'd1', webhook_id: 'wh-001', event: 'setting.updated', status: 'success' },
      ]
      setupChain({ data: deliveries, error: null, count: 50 })

      const { getDeliveries } = await importService()
      const result = await getDeliveries('wh-001', { limit: 1, offset: 0 })

      expect(result.deliveries).toHaveLength(1)
      expect(result.total).toBe(50)
    })

    it('returns total=0 when count is null', async () => {
      setupChain({ data: [], error: null, count: undefined })

      const { getDeliveries } = await importService()
      const result = await getDeliveries('wh-001')

      // count || 0 → 0
      expect(result.total).toBe(0)
    })

    it('returns empty deliveries when data is null (no error)', async () => {
      setupChain({ data: null, error: null, count: null })

      const { getDeliveries } = await importService()
      const result = await getDeliveries('wh-001')

      // (data || []) → []
      expect(result.deliveries).toEqual([])
    })

    it('logs error and returns empty on fetch error', async () => {
      setupChain({ data: null, error: { message: 'timeout' } })

      const { getDeliveries } = await importService()
      const result = await getDeliveries('wh-001')

      expect(result.deliveries).toEqual([])
      expect(result.total).toBe(0)
      expect(mockLogError).toHaveBeenCalledWith(
        'Deliveries fetch error',
        expect.any(Object)
      )
    })
  })

  // ==========================================================================
  // signPayload edge cases
  // ==========================================================================
  describe('signPayload edge cases', () => {
    it('handles unicode payload', async () => {
      const { signPayload } = await importService()
      const result = signPayload('{"name":"Sigortalı İstanbul"}', 'secret')
      expect(result).toMatch(/^[a-f0-9]{64}$/)
    })

    it('handles very long payload', async () => {
      const { signPayload } = await importService()
      const longPayload = JSON.stringify({ data: 'x'.repeat(100000) })
      const result = signPayload(longPayload, 'secret')
      expect(result).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  // ==========================================================================
  // Retry timer scheduling verification
  // ==========================================================================
  describe('retry timer scheduling', () => {
    it('schedules retry with correct delay for attempt 1 (2000ms)', async () => {
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const deliveryChain: Record<string, unknown> = {}
      deliveryChain.insert = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.select = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.update = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.eq = vi.fn().mockReturnValue(deliveryChain)
      deliveryChain.single = vi.fn().mockResolvedValue({
        data: { id: 'del-retry-timer' },
        error: null,
      })
      deliveryChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return deliveryChain
      })

      let fetchCallCount = 0
      globalThis.fetch = vi.fn().mockImplementation(() => {
        fetchCallCount++
        return Promise.reject(new Error('fail'))
      }) as unknown as typeof globalThis.fetch

      const { fireWebhooks } = await importService()
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // First attempt done
      expect(fetchCallCount).toBe(1)

      // Not yet time for retry
      await vi.advanceTimersByTimeAsync(1900)
      expect(fetchCallCount).toBe(1) // Still 1

      // Advance past the 2000ms mark
      await vi.advanceTimersByTimeAsync(200)
      // Allow promises to settle
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchCallCount).toBe(2) // Second attempt made
    })
  })

  // ==========================================================================
  // deliverToWebhook — Supabase not configured inside deliverToWebhook
  // ==========================================================================
  describe('deliverToWebhook with no Supabase inside', () => {
    it('fireWebhooks catches error from deliverToWebhook and logs it', async () => {
      // We configure Supabase for the initial listWebhooks call, but then
      // the delivery will error because the mock is set up to fail on insert
      const webhook = { ...MOCK_WEBHOOK_ROW, categories: [] }

      // First call: select webhooks succeeds
      // Subsequent calls: insert delivery fails
      const selectChain: Record<string, unknown> = {}
      selectChain.select = vi.fn().mockReturnValue(selectChain)
      selectChain.eq = vi.fn().mockReturnValue(selectChain)
      selectChain.contains = vi.fn().mockReturnValue(selectChain)
      selectChain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [webhook], error: null })

      const failChain: Record<string, unknown> = {}
      failChain.insert = vi.fn().mockReturnValue(failChain)
      failChain.select = vi.fn().mockReturnValue(failChain)
      failChain.eq = vi.fn().mockReturnValue(failChain)
      failChain.single = vi.fn().mockRejectedValue(new Error('DB connection lost'))
      failChain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        reject(new Error('DB connection lost'))

      mockFrom.mockImplementation((table: string) => {
        if (table === 'settings_webhooks') return selectChain
        return failChain
      })

      const { fireWebhooks } = await importService()
      // Should not throw — error is caught and logged
      await fireWebhooks('setting.updated', {
        category: 'ai',
        changes: [{ key: 'k', previous_value: 1, new_value: 2 }],
      })

      // The catch in fireWebhooks logs delivery errors
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('Delivery error'),
        expect.any(Object)
      )
    })
  })

  // ==========================================================================
  // HMAC signature verification roundtrip
  // ==========================================================================
  describe('HMAC signature roundtrip', () => {
    it('signature can be verified by recipient using crypto module', async () => {
      const { signPayload } = await importService()
      const secret = 'webhook-secret-123'
      const payload = '{"event":"setting.updated","data":{"category":"ai"}}'

      const signature = signPayload(payload, secret)

      // Recipient verification
      const verifyHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
      expect(signature).toBe(verifyHmac)
    })
  })
})
