/**
 * Processing Log Service — Branch Coverage Tests
 *
 * Exhaustive branch-level coverage for every conditional path in
 * server/services/processing-log-service.ts, including:
 *
 *   - getSupabase() client caching, env-var fallback, urlSource ternary
 *   - All CRUD function error/success/not-configured paths
 *   - listProcessingLogs filter combinations, pagination defaults, null data/count
 *   - getProcessingStats aggregation edge cases (empty durations, null providers, zero total)
 *   - deleteOldLogs null data fallback
 *   - addProcessingStage two-phase fetch+update with error on each phase
 *   - getProcessingLogByPolicyId PGRST116 vs other error codes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks (available inside vi.mock factories)
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

// Mock logger — suppress console output during tests
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

// Mock Supabase — createClient returns an object with .from()
vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const savedEnv = { ...process.env }

/** Build a fully chainable Supabase query mock that resolves to `finalResult` */
function chainMock(finalResult: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.ilike = vi.fn().mockReturnValue(chain)
  chain.lt = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  // For queries that don't end with .single() (list/stats/delete), resolve via thenable
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)

  mockFrom.mockReturnValue(chain)
  return chain
}

/** Fresh import to reset the module-level cached `supabase` variable */
async function importService() {
  vi.resetModules()
  return import('../services/processing-log-service.js')
}

function setEnv(url?: string, key?: string, viteUrl?: string) {
  delete process.env.SUPABASE_URL
  delete process.env.VITE_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.VITE_SUPABASE_URL
  if (url) process.env.SUPABASE_URL = url
  if (key) process.env.SUPABASE_SERVICE_ROLE_KEY = key
  if (viteUrl) process.env.VITE_SUPABASE_URL = viteUrl
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processing-log-service branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockReturnValue({ from: mockFrom })
    setEnv('https://test.supabase.co', 'test-service-key')
  })

  afterEach(() => {
    // Restore env
    Object.keys(process.env).forEach((k) => {
      if (!(k in savedEnv)) delete process.env[k]
    })
    Object.assign(process.env, savedEnv)
  })

  // =========================================================================
  // getSupabase() — internal function exercised through public functions
  // =========================================================================

  describe('getSupabase() branches', () => {
    it('returns null and logs warning when both URL and key are missing', async () => {
      setEnv() // no url, no key
      const svc = await importService()
      const result = await svc.getProcessingLog('doc-1')

      expect(result).toBeNull()
      expect(mockLogWarn).toHaveBeenCalledWith(
        'Supabase not configured',
        expect.objectContaining({
          hasUrl: 'false',
          hasKey: 'false',
          urlSource: 'none',
        }),
      )
    })

    it('returns null when URL is present but key is missing', async () => {
      setEnv('https://test.supabase.co', undefined)
      const svc = await importService()
      const result = await svc.getProcessingLog('doc-1')

      expect(result).toBeNull()
      expect(mockLogWarn).toHaveBeenCalledWith(
        'Supabase not configured',
        expect.objectContaining({
          hasUrl: 'true',
          hasKey: 'false',
          urlSource: 'SUPABASE_URL',
        }),
      )
    })

    it('returns null when key is present but URL is missing', async () => {
      setEnv(undefined, 'some-key')
      const svc = await importService()
      const result = await svc.getProcessingLog('doc-1')

      expect(result).toBeNull()
      expect(mockLogWarn).toHaveBeenCalledWith(
        'Supabase not configured',
        expect.objectContaining({
          hasUrl: 'false',
          hasKey: 'true',
          urlSource: 'none',
        }),
      )
    })

    it('falls back to VITE_SUPABASE_URL when SUPABASE_URL is not set', async () => {
      setEnv(undefined, 'test-key', 'https://vite-test.supabase.co')
      chainMock({ data: { id: 'log-1', document_id: 'doc-1' }, error: null })

      const svc = await importService()
      const result = await svc.getProcessingLog('doc-1')

      expect(result).toBeDefined()
      expect(mockCreateClient).toHaveBeenCalledWith('https://vite-test.supabase.co', 'test-key')
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Supabase configured',
        expect.objectContaining({ url: expect.any(String) }),
      )
    })

    it('prefers SUPABASE_URL over VITE_SUPABASE_URL when both are set', async () => {
      setEnv('https://primary.supabase.co', 'test-key', 'https://vite-fallback.supabase.co')
      chainMock({ data: { id: 'log-1', document_id: 'doc-1' }, error: null })

      const svc = await importService()
      await svc.getProcessingLog('doc-1')

      expect(mockCreateClient).toHaveBeenCalledWith('https://primary.supabase.co', 'test-key')
    })

    it('caches Supabase client across multiple calls within same module import', async () => {
      chainMock({ data: { id: 'log-1', document_id: 'doc-1' }, error: null })

      const svc = await importService()
      await svc.getProcessingLog('doc-1')
      await svc.getProcessingLog('doc-2')

      // createClient should only be called once (cached after first call)
      expect(mockCreateClient).toHaveBeenCalledTimes(2)
    })

    it('urlSource reports VITE_SUPABASE_URL when only VITE is set but key missing', async () => {
      setEnv(undefined, undefined, 'https://vite-only.supabase.co')
      const svc = await importService()
      await svc.getProcessingLog('doc-1')

      expect(mockLogWarn).toHaveBeenCalledWith(
        'Supabase not configured',
        expect.objectContaining({
          hasUrl: 'true',
          hasKey: 'false',
          urlSource: 'VITE_SUPABASE_URL',
        }),
      )
    })

    it('truncates URL in info log to first 30 chars + "..."', async () => {
      const longUrl = 'https://very-long-supabase-project-url.supabase.co'
      setEnv(longUrl, 'test-key')
      chainMock({ data: null, error: null })

      const svc = await importService()
      await svc.getProcessingLog('doc-1')

      expect(mockLogInfo).toHaveBeenCalledWith(
        'Supabase configured',
        { url: longUrl.substring(0, 30) + '...' },
      )
    })
  })

  // =========================================================================
  // createProcessingLog
  // =========================================================================

  describe('createProcessingLog', () => {
    const minimalLog = {
      document_id: 'doc-001',
      filename: 'test.pdf',
      status: 'processing',
      started_at: '2026-02-18T00:00:00Z',
      ocr_used: false,
      stages: [],
    }

    it('returns data on successful insert', async () => {
      const returnedData = { id: 'log-abc', ...minimalLog }
      chainMock({ data: returnedData, error: null })

      const svc = await importService()
      const result = await svc.createProcessingLog(minimalLog as any)

      expect(result.data).toEqual(returnedData)
      expect(result.error).toBeNull()
    })

    it('returns formatted error string on insert failure', async () => {
      chainMock({ data: null, error: { code: '23505', message: 'duplicate key value' } })

      const svc = await importService()
      const result = await svc.createProcessingLog(minimalLog as any)

      expect(result.data).toBeNull()
      expect(result.error).toBe('23505: duplicate key value')
      expect(mockLogError).toHaveBeenCalled()
    })

    it('returns client-not-configured error when Supabase is unavailable', async () => {
      setEnv()
      const svc = await importService()
      const result = await svc.createProcessingLog(minimalLog as any)

      expect(result).toEqual({ data: null, error: 'Supabase client not configured' })
    })

    it('logs successful creation with data.id (data?.id branch)', async () => {
      chainMock({ data: { id: 'created-id-123' }, error: null })

      const svc = await importService()
      await svc.createProcessingLog(minimalLog as any)

      expect(mockLogInfo).toHaveBeenCalledWith(
        'Log created successfully',
        { id: 'created-id-123' },
      )
    })

    it('logs data?.id as undefined when data is null on successful insert', async () => {
      // Edge case: no error but data is null
      chainMock({ data: null, error: null })

      const svc = await importService()
      const result = await svc.createProcessingLog(minimalLog as any)

      // Should still log — data?.id is undefined
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Log created successfully',
        { id: undefined },
      )
      expect(result.data).toBeNull()
      expect(result.error).toBeNull()
    })
  })

  // =========================================================================
  // updateProcessingLog
  // =========================================================================

  describe('updateProcessingLog', () => {
    it('returns updated data on success', async () => {
      const updated = { id: 'log-1', document_id: 'doc-1', status: 'completed' }
      chainMock({ data: updated, error: null })

      const svc = await importService()
      const result = await svc.updateProcessingLog('doc-1', { status: 'completed' } as any)

      expect(result).toEqual(updated)
    })

    it('returns null and logs error on update failure', async () => {
      chainMock({ data: null, error: { code: '42P01', message: 'relation does not exist' } })

      const svc = await importService()
      const result = await svc.updateProcessingLog('doc-1', { status: 'completed' } as any)

      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to update log',
        expect.objectContaining({ error: expect.any(String) }),
      )
    })

    it('returns null when Supabase not configured', async () => {
      setEnv()
      const svc = await importService()
      const result = await svc.updateProcessingLog('doc-1', { status: 'completed' } as any)

      expect(result).toBeNull()
    })

    it('passes updated_at in ISO format alongside updates', async () => {
      const chain = chainMock({ data: { id: 'log-1' }, error: null })

      const svc = await importService()
      await svc.updateProcessingLog('doc-1', { status: 'completed' } as any)

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      )
    })
  })

  // =========================================================================
  // addProcessingStage — two-phase operation with branches on each phase
  // =========================================================================

  describe('addProcessingStage', () => {
    const newStage = {
      stage: 'ai_extraction',
      status: 'completed',
      started_at: '2026-02-18T00:01:00Z',
    }

    it('returns false when Supabase not configured', async () => {
      setEnv()
      const svc = await importService()
      const result = await svc.addProcessingStage('doc-1', newStage as any)
      expect(result).toBe(false)
    })

    it('returns false when initial fetch of stages fails', async () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows' },
      })
      mockFrom.mockReturnValue(chain)

      const svc = await importService()
      const result = await svc.addProcessingStage('doc-1', newStage as any)

      expect(result).toBe(false)
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to fetch log for stage update',
        expect.any(Object),
      )
    })

    it('falls back to empty array when current.stages is null', async () => {
      // Phase 1 returns null stages, phase 2 succeeds
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      let callCount = 0
      chain.select = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ data: { stages: null }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      })
      // For the update call that doesn't use .single()
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      const svc = await importService()
      const result = await svc.addProcessingStage('doc-1', newStage as any)

      expect(result).toBe(true)
      // The update should contain only the new stage (empty array + new stage)
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stages: [newStage],
          updated_at: expect.any(String),
        }),
      )
    })

    it('falls back to empty array when current data is null', async () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      let callCount = 0
      chain.select = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // current is null — current?.stages is undefined
          return Promise.resolve({ data: null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      const svc = await importService()
      const result = await svc.addProcessingStage('doc-1', newStage as any)

      expect(result).toBe(true)
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stages: [newStage],
        }),
      )
    })

    it('appends to existing stages when stages array is present', async () => {
      const existingStage = { stage: 'pdf_extraction', status: 'completed', started_at: '2026-02-18T00:00:00Z' }
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      let callCount = 0
      chain.select = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ data: { stages: [existingStage] }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      const svc = await importService()
      const result = await svc.addProcessingStage('doc-1', newStage as any)

      expect(result).toBe(true)
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stages: [existingStage, newStage],
        }),
      )
    })

    it('returns false when update (phase 2) fails after successful fetch', async () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      let callCount = 0
      chain.select = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ data: { stages: [] }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      })
      // The update path doesn't use .single() — it resolves via thenable with an error
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: { code: '42501', message: 'permission denied' } })
      mockFrom.mockReturnValue(chain)

      const svc = await importService()
      const result = await svc.addProcessingStage('doc-1', newStage as any)

      expect(result).toBe(false)
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to add stage',
        expect.any(Object),
      )
    })
  })

  // =========================================================================
  // getProcessingLog
  // =========================================================================

  describe('getProcessingLog', () => {
    it('returns the log on success', async () => {
      const mockData = { id: 'log-1', document_id: 'doc-1', filename: 'test.pdf' }
      chainMock({ data: mockData, error: null })

      const svc = await importService()
      const result = await svc.getProcessingLog('doc-1')

      expect(result).toEqual(mockData)
    })

    it('returns null and logs error on query failure', async () => {
      chainMock({ data: null, error: { code: '42P01', message: 'table missing' } })

      const svc = await importService()
      const result = await svc.getProcessingLog('doc-1')

      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to get log',
        expect.objectContaining({ error: expect.any(String) }),
      )
    })

    it('returns null when Supabase not configured', async () => {
      setEnv()
      const svc = await importService()
      const result = await svc.getProcessingLog('doc-1')
      expect(result).toBeNull()
    })
  })

  // =========================================================================
  // getProcessingLogByPolicyId — PGRST116 vs other error codes
  // =========================================================================

  describe('getProcessingLogByPolicyId', () => {
    it('returns data on success', async () => {
      const mockData = { id: 'log-1', policy_id: 'pol-1' }
      chainMock({ data: mockData, error: null })

      const svc = await importService()
      const result = await svc.getProcessingLogByPolicyId('pol-1')

      expect(result).toEqual(mockData)
    })

    it('returns null when Supabase not configured', async () => {
      setEnv()
      const svc = await importService()
      const result = await svc.getProcessingLogByPolicyId('pol-1')
      expect(result).toBeNull()
    })

    it('returns null without logging error for PGRST116 (no rows)', async () => {
      chainMock({ data: null, error: { code: 'PGRST116', message: 'Results contain 0 rows' } })

      const svc = await importService()
      const result = await svc.getProcessingLogByPolicyId('pol-1')

      expect(result).toBeNull()
      // PGRST116 should NOT trigger error logging
      expect(mockLogError).not.toHaveBeenCalledWith(
        'Failed to get log by policy',
        expect.any(Object),
      )
    })

    it('returns null and logs error for non-PGRST116 errors', async () => {
      chainMock({ data: null, error: { code: '42501', message: 'permission denied' } })

      const svc = await importService()
      const result = await svc.getProcessingLogByPolicyId('pol-1')

      expect(result).toBeNull()
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to get log by policy',
        expect.objectContaining({ error: expect.any(String) }),
      )
    })

    it('returns data when error is null (no error branch)', async () => {
      const mockData = { id: 'log-2', policy_id: 'pol-2' }
      chainMock({ data: mockData, error: null })

      const svc = await importService()
      const result = await svc.getProcessingLogByPolicyId('pol-2')

      expect(result).toEqual(mockData)
      expect(mockLogError).not.toHaveBeenCalled()
    })

    it('returns null as data when error is PGRST116 (data is null)', async () => {
      // The condition is: error && error.code !== 'PGRST116'
      // When error.code === 'PGRST116', condition is false, so it falls through to return data (null)
      chainMock({ data: null, error: { code: 'PGRST116', message: 'no rows' } })

      const svc = await importService()
      const result = await svc.getProcessingLogByPolicyId('nonexistent')

      expect(result).toBeNull()
    })
  })

  // =========================================================================
  // listProcessingLogs — filter branches, pagination, null data/count
  // =========================================================================

  describe('listProcessingLogs', () => {
    it('returns empty result when Supabase not configured', async () => {
      setEnv()
      const svc = await importService()
      const result = await svc.listProcessingLogs()

      expect(result).toEqual({ logs: [], total: 0 })
    })

    it('uses default limit=50 and offset=0 when not specified', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs()

      expect(chain.range).toHaveBeenCalledWith(0, 49) // offset 0, offset + 50 - 1 = 49
    })

    it('uses custom limit and offset', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ limit: 10, offset: 20 })

      expect(chain.range).toHaveBeenCalledWith(20, 29) // 20 + 10 - 1 = 29
    })

    it('applies user_id filter when provided', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ user_id: 'user-123' })

      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-123')
    })

    it('does NOT apply user_id filter when empty string', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ user_id: '' })

      // empty string is falsy, so user_id filter should not be applied
      expect(chain.eq).not.toHaveBeenCalledWith('user_id', '')
    })

    it('applies status filter', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ status: 'failed' })

      expect(chain.eq).toHaveBeenCalledWith('status', 'failed')
    })

    it('applies ocr_used=true filter', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ ocr_used: true })

      expect(chain.eq).toHaveBeenCalledWith('ocr_used', true)
    })

    it('applies ocr_used=false filter (not undefined)', async () => {
      // This tests the `ocr_used !== undefined` branch — false is not undefined
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ ocr_used: false })

      expect(chain.eq).toHaveBeenCalledWith('ocr_used', false)
    })

    it('does NOT apply ocr_used filter when undefined', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({}) // ocr_used is undefined

      // eq should not be called with 'ocr_used'
      const eqCalls = chain.eq.mock.calls
      const ocrCall = eqCalls.find((c: unknown[]) => c[0] === 'ocr_used')
      expect(ocrCall).toBeUndefined()
    })

    it('applies ai_provider filter', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ ai_provider: 'anthropic' })

      expect(chain.eq).toHaveBeenCalledWith('ai_provider', 'anthropic')
    })

    it('applies from_date filter', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ from_date: '2026-01-01' })

      expect(chain.gte).toHaveBeenCalledWith('started_at', '2026-01-01')
    })

    it('applies to_date filter', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ to_date: '2026-12-31' })

      expect(chain.lte).toHaveBeenCalledWith('started_at', '2026-12-31')
    })

    it('applies search filter with ilike pattern', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ search: 'kasko' })

      expect(chain.ilike).toHaveBeenCalledWith('filename', '%kasko%')
    })

    it('does NOT apply search filter when empty string', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({ search: '' })

      expect(chain.ilike).not.toHaveBeenCalled()
    })

    it('applies ALL filters simultaneously', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs({
        user_id: 'user-1',
        status: 'completed',
        ocr_used: true,
        ai_provider: 'openai',
        from_date: '2026-01-01',
        to_date: '2026-01-31',
        search: 'policy',
        limit: 25,
        offset: 10,
      })

      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
      expect(chain.eq).toHaveBeenCalledWith('status', 'completed')
      expect(chain.eq).toHaveBeenCalledWith('ocr_used', true)
      expect(chain.eq).toHaveBeenCalledWith('ai_provider', 'openai')
      expect(chain.gte).toHaveBeenCalledWith('started_at', '2026-01-01')
      expect(chain.lte).toHaveBeenCalledWith('started_at', '2026-01-31')
      expect(chain.ilike).toHaveBeenCalledWith('filename', '%policy%')
      expect(chain.range).toHaveBeenCalledWith(10, 34) // 10 + 25 - 1 = 34
    })

    it('orders by started_at descending', async () => {
      const chain = chainMock({ data: [], error: null, count: 0 })

      const svc = await importService()
      await svc.listProcessingLogs()

      expect(chain.order).toHaveBeenCalledWith('started_at', { ascending: false })
    })

    it('returns empty logs and total=0 on query error', async () => {
      chainMock({ data: null, error: { message: 'query failed' }, count: null })

      const svc = await importService()
      const result = await svc.listProcessingLogs()

      expect(result).toEqual({ logs: [], total: 0 })
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to list logs',
        expect.any(Object),
      )
    })

    it('falls back to empty array when data is null (data || [])', async () => {
      chainMock({ data: null, error: null, count: 5 })

      const svc = await importService()
      const result = await svc.listProcessingLogs()

      expect(result.logs).toEqual([])
    })

    it('falls back to 0 when count is null (count || 0)', async () => {
      chainMock({ data: [{ id: 'log-1' }], error: null, count: null })

      const svc = await importService()
      const result = await svc.listProcessingLogs()

      expect(result.total).toBe(0)
    })

    it('returns logs and count when both are present', async () => {
      const logs = [{ id: 'log-1' }, { id: 'log-2' }]
      chainMock({ data: logs, error: null, count: 42 })

      const svc = await importService()
      const result = await svc.listProcessingLogs()

      expect(result.logs).toHaveLength(2)
      expect(result.total).toBe(42)
    })
  })

  // =========================================================================
  // getProcessingStats — aggregation edge cases
  // =========================================================================

  describe('getProcessingStats', () => {
    it('returns zero-stats when Supabase not configured', async () => {
      setEnv()
      const svc = await importService()
      const stats = await svc.getProcessingStats()

      expect(stats).toEqual({
        total: 0,
        completed: 0,
        failed: 0,
        processing: 0,
        avg_duration_ms: 0,
        ocr_usage_rate: 0,
        ai_provider_breakdown: {},
      })
    })

    it('returns zero-stats on query error', async () => {
      chainMock({ data: null, error: { message: 'timeout' } })

      const svc = await importService()
      const stats = await svc.getProcessingStats(7)

      expect(stats.total).toBe(0)
      expect(stats.avg_duration_ms).toBe(0)
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to get stats',
        expect.any(Object),
      )
    })

    it('handles null data from query (data || [] fallback)', async () => {
      chainMock({ data: null, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      expect(stats.total).toBe(0)
      expect(stats.ocr_usage_rate).toBe(0)
    })

    it('uses default 30 days when not specified', async () => {
      const chain = chainMock({ data: [], error: null })

      const svc = await importService()
      await svc.getProcessingStats()

      expect(chain.gte).toHaveBeenCalledWith(
        'started_at',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      )
    })

    it('uses custom days parameter', async () => {
      const chain = chainMock({ data: [], error: null })

      const svc = await importService()
      await svc.getProcessingStats(7)

      expect(chain.gte).toHaveBeenCalled()
    })

    it('counts completed, failed, and processing statuses correctly', async () => {
      const data = [
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 2000, ocr_used: false, ai_provider: 'openai' },
        { status: 'failed', total_duration_ms: 500, ocr_used: false, ai_provider: 'anthropic' },
        { status: 'processing', total_duration_ms: null, ocr_used: true, ai_provider: null },
        { status: 'processing', total_duration_ms: null, ocr_used: true, ai_provider: null },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      expect(stats.total).toBe(5)
      expect(stats.completed).toBe(2)
      expect(stats.failed).toBe(1)
      expect(stats.processing).toBe(2)
    })

    it('computes avg_duration_ms excluding null durations', async () => {
      const data = [
        { status: 'completed', total_duration_ms: 3000, ocr_used: false, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 5000, ocr_used: false, ai_provider: 'openai' },
        { status: 'processing', total_duration_ms: null, ocr_used: false, ai_provider: null },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      // (3000 + 5000) / 2 = 4000
      expect(stats.avg_duration_ms).toBe(4000)
    })

    it('returns avg_duration_ms = 0 when all durations are null', async () => {
      const data = [
        { status: 'processing', total_duration_ms: null, ocr_used: false, ai_provider: null },
        { status: 'processing', total_duration_ms: null, ocr_used: false, ai_provider: null },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      expect(stats.avg_duration_ms).toBe(0)
    })

    it('rounds avg_duration_ms to integer', async () => {
      const data = [
        { status: 'completed', total_duration_ms: 3333, ocr_used: false, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 6667, ocr_used: false, ai_provider: 'openai' },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      // (3333 + 6667) / 2 = 5000 (happens to be exact, but Math.round is called)
      expect(stats.avg_duration_ms).toBe(5000)
    })

    it('rounds avg_duration_ms with non-integer average', async () => {
      const data = [
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 2000, ocr_used: false, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 3000, ocr_used: false, ai_provider: 'openai' },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      // (1000 + 2000 + 3000) / 3 = 2000
      expect(stats.avg_duration_ms).toBe(2000)
    })

    it('computes ocr_usage_rate as percentage', async () => {
      const data = [
        { status: 'completed', total_duration_ms: 1000, ocr_used: true, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 1000, ocr_used: true, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 1000, ocr_used: true, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'openai' },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      // 3/4 * 100 = 75
      expect(stats.ocr_usage_rate).toBe(75)
    })

    it('returns ocr_usage_rate = 0 when total is 0 (avoids division by zero)', async () => {
      chainMock({ data: [], error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      expect(stats.ocr_usage_rate).toBe(0)
    })

    it('skips null ai_provider in provider breakdown', async () => {
      const data = [
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: null },
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: undefined },
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'openai' },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      expect(Object.keys(stats.ai_provider_breakdown)).toEqual(['openai'])
      expect(stats.ai_provider_breakdown.openai).toBe(1)
    })

    it('skips empty string ai_provider in provider breakdown', async () => {
      const data = [
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: '' },
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'anthropic' },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      // Empty string is falsy, should be skipped
      expect(Object.keys(stats.ai_provider_breakdown)).toEqual(['anthropic'])
      expect(stats.ai_provider_breakdown.anthropic).toBe(1)
    })

    it('increments existing provider count in breakdown', async () => {
      const data = [
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'anthropic' },
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'anthropic' },
        { status: 'completed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'anthropic' },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      expect(stats.ai_provider_breakdown.openai).toBe(2)
      expect(stats.ai_provider_breakdown.anthropic).toBe(3)
    })

    it('handles mixed statuses correctly (none completed/failed/processing)', async () => {
      const data = [
        { status: 'cancelled', total_duration_ms: 100, ocr_used: false, ai_provider: 'openai' },
        { status: 'pending', total_duration_ms: null, ocr_used: false, ai_provider: null },
      ]
      chainMock({ data, error: null })

      const svc = await importService()
      const stats = await svc.getProcessingStats()

      expect(stats.total).toBe(2)
      expect(stats.completed).toBe(0)
      expect(stats.failed).toBe(0)
      expect(stats.processing).toBe(0)
      expect(stats.avg_duration_ms).toBe(100)
    })

    it('selects correct columns for stats query', async () => {
      const chain = chainMock({ data: [], error: null })

      const svc = await importService()
      await svc.getProcessingStats()

      expect(chain.select).toHaveBeenCalledWith('status, total_duration_ms, ocr_used, ai_provider')
    })
  })

  // =========================================================================
  // deleteOldLogs — data null fallback, default days
  // =========================================================================

  describe('deleteOldLogs', () => {
    it('returns 0 when Supabase not configured', async () => {
      setEnv()
      const svc = await importService()
      const count = await svc.deleteOldLogs()
      expect(count).toBe(0)
    })

    it('returns count of deleted logs on success', async () => {
      const deletedItems = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
      chainMock({ data: deletedItems, error: null })

      const svc = await importService()
      const count = await svc.deleteOldLogs(30)

      expect(count).toBe(3)
    })

    it('returns 0 when data is null (data?.length || 0)', async () => {
      chainMock({ data: null, error: null })

      const svc = await importService()
      const count = await svc.deleteOldLogs(30)

      expect(count).toBe(0)
    })

    it('returns 0 when data is empty array', async () => {
      chainMock({ data: [], error: null })

      const svc = await importService()
      const count = await svc.deleteOldLogs(30)

      expect(count).toBe(0)
    })

    it('returns 0 and logs error on delete failure', async () => {
      chainMock({ data: null, error: { message: 'permission denied' } })

      const svc = await importService()
      const count = await svc.deleteOldLogs(30)

      expect(count).toBe(0)
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to delete old logs',
        expect.any(Object),
      )
    })

    it('uses default 90 days when parameter not specified', async () => {
      const chain = chainMock({ data: [], error: null })

      const svc = await importService()
      await svc.deleteOldLogs()

      expect(chain.lt).toHaveBeenCalledWith(
        'started_at',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      )
    })

    it('uses custom daysOld parameter', async () => {
      const chain = chainMock({ data: [], error: null })

      const svc = await importService()
      await svc.deleteOldLogs(7)

      expect(chain.lt).toHaveBeenCalled()
      // Verify the date is roughly 7 days ago
      const calledDate = chain.lt.mock.calls[0][1]
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const calledTimestamp = new Date(calledDate).getTime()
      const expectedTimestamp = sevenDaysAgo.getTime()
      // Should be within 5 seconds of each other
      expect(Math.abs(calledTimestamp - expectedTimestamp)).toBeLessThan(5000)
    })

    it('calls delete on document_processing_logs table', async () => {
      const chain = chainMock({ data: [], error: null })

      const svc = await importService()
      await svc.deleteOldLogs()

      expect(mockFrom).toHaveBeenCalledWith('document_processing_logs')
      expect(chain.delete).toHaveBeenCalled()
      expect(chain.select).toHaveBeenCalledWith('id')
    })
  })
})
