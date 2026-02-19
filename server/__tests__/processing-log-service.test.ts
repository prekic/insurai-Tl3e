/**
 * Processing Log Service Tests
 *
 * Comprehensive tests for document processing log CRUD operations,
 * statistics computation, and Supabase client initialization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockLogWarn,
  mockLogError,
  mockLogInfo,
  mockLogDebug,
  _mockSingle,
  _mockSelect,
  _mockInsert,
  _mockUpdate,
  _mockDelete,
  _mockEq,
  _mockOrder,
  _mockRange,
  _mockGte,
  _mockLte,
  _mockIlike,
  _mockLt,
  mockFrom,
} = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockDelete = vi.fn()
  const mockEq = vi.fn()
  const mockOrder = vi.fn()
  const mockRange = vi.fn()
  const mockGte = vi.fn()
  const mockLte = vi.fn()
  const mockIlike = vi.fn()
  const mockLt = vi.fn()
  const mockFrom = vi.fn()

  return {
    mockLogWarn: vi.fn(),
    mockLogError: vi.fn(),
    mockLogInfo: vi.fn(),
    mockLogDebug: vi.fn(),
    mockSingle,
    mockSelect,
    mockInsert,
    mockUpdate,
    mockDelete,
    mockEq,
    mockOrder,
    mockRange,
    mockGte,
    mockLte,
    mockIlike,
    mockLt,
    mockFrom,
  }
})

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

// Helper to build a chainable Supabase query mock
function setupChain(finalResult: { data: unknown; error: unknown; count?: number }) {
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
  // For queries without .single(), resolve from any terminal point
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)

  mockFrom.mockReturnValue(chain)
  return chain
}

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

// Set env vars before import
const savedUrl = process.env.SUPABASE_URL
const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// ============================================================================
// TESTS
// ============================================================================

describe('processing-log-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  afterEach(() => {
    if (savedUrl) process.env.SUPABASE_URL = savedUrl
    else delete process.env.SUPABASE_URL
    if (savedKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  // We need to import fresh each time because the module caches the supabase client
  async function importService() {
    vi.resetModules()
    return import('../services/processing-log-service.js')
  }

  // --------------------------------------------------------------------------
  // createProcessingLog
  // --------------------------------------------------------------------------
  describe('createProcessingLog', () => {
    it('creates a processing log entry', async () => {
      const mockData = {
        id: 'log-001',
        document_id: 'doc-001',
        filename: 'policy.pdf',
        status: 'processing',
        started_at: '2026-01-01T00:00:00Z',
        ocr_used: false,
        stages: [],
      }
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const result = await service.createProcessingLog({
        document_id: 'doc-001',
        filename: 'policy.pdf',
        status: 'processing',
        started_at: '2026-01-01T00:00:00Z',
        ocr_used: false,
        stages: [],
      })

      expect(result.data).toBeDefined()
      expect(result.data!.id).toBe('log-001')
      expect(result.error).toBeNull()
    })

    it('returns error when insert fails', async () => {
      setupChain({ data: null, error: { code: '23505', message: 'Duplicate key' } })

      const service = await importService()
      const result = await service.createProcessingLog({
        document_id: 'doc-001',
        filename: 'policy.pdf',
        status: 'processing',
        started_at: '2026-01-01T00:00:00Z',
        ocr_used: false,
        stages: [],
      })

      expect(result.data).toBeNull()
      expect(result.error).toContain('23505')
    })

    it('returns error when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const service = await importService()
      const result = await service.createProcessingLog({
        document_id: 'doc-001',
        filename: 'policy.pdf',
        status: 'processing',
        started_at: '2026-01-01T00:00:00Z',
        ocr_used: false,
        stages: [],
      })

      expect(result.data).toBeNull()
      expect(result.error).toBe('Supabase client not configured')
    })
  })

  // --------------------------------------------------------------------------
  // updateProcessingLog
  // --------------------------------------------------------------------------
  describe('updateProcessingLog', () => {
    it('updates a processing log', async () => {
      const mockData = {
        id: 'log-001',
        document_id: 'doc-001',
        status: 'completed',
      }
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const result = await service.updateProcessingLog('doc-001', { status: 'completed' })

      expect(result).toBeDefined()
      expect(result!.status).toBe('completed')
    })

    it('returns null when update fails', async () => {
      setupChain({ data: null, error: { code: 'PGRST116', message: 'Not found' } })

      const service = await importService()
      const result = await service.updateProcessingLog('doc-001', { status: 'completed' })

      expect(result).toBeNull()
    })

    it('returns null when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const result = await service.updateProcessingLog('doc-001', { status: 'completed' })

      expect(result).toBeNull()
    })
  })

  // --------------------------------------------------------------------------
  // addProcessingStage
  // --------------------------------------------------------------------------
  describe('addProcessingStage', () => {
    it('adds a stage to existing log', async () => {
      // First call returns current stages, second call does the update
      const chain: Record<string, unknown> = {}
      let callCount = 0
      chain.select = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ data: { stages: [{ stage: 'pdf_extraction', status: 'completed' }] }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      })
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      const service = await importService()
      const result = await service.addProcessingStage('doc-001', {
        stage: 'ai_extraction',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
      })

      expect(result).toBe(true)
    })

    it('returns false when fetch fails', async () => {
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Fetch error' } })
      mockFrom.mockReturnValue(chain)

      const service = await importService()
      const result = await service.addProcessingStage('doc-001', {
        stage: 'ai_extraction',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
      })

      expect(result).toBe(false)
    })

    it('returns false when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const result = await service.addProcessingStage('doc-001', {
        stage: 'ai_extraction',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
      })

      expect(result).toBe(false)
    })

    it('initializes stages to empty array when current stages is null', async () => {
      const chain: Record<string, unknown> = {}
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
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
      mockFrom.mockReturnValue(chain)

      const service = await importService()
      const result = await service.addProcessingStage('doc-001', {
        stage: 'pdf_extraction',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
      })

      expect(result).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // getProcessingLog
  // --------------------------------------------------------------------------
  describe('getProcessingLog', () => {
    it('returns a processing log by document ID', async () => {
      const mockData = { id: 'log-001', document_id: 'doc-001' }
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const result = await service.getProcessingLog('doc-001')

      expect(result).toBeDefined()
      expect(result!.document_id).toBe('doc-001')
    })

    it('returns null when not found', async () => {
      setupChain({ data: null, error: { code: 'PGRST116' } })

      const service = await importService()
      const result = await service.getProcessingLog('nonexistent')

      expect(result).toBeNull()
    })

    it('returns null when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const result = await service.getProcessingLog('doc-001')

      expect(result).toBeNull()
    })
  })

  // --------------------------------------------------------------------------
  // getProcessingLogByPolicyId
  // --------------------------------------------------------------------------
  describe('getProcessingLogByPolicyId', () => {
    it('returns a processing log by policy ID', async () => {
      const mockData = { id: 'log-001', policy_id: 'pol-001' }
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const result = await service.getProcessingLogByPolicyId('pol-001')

      expect(result).toBeDefined()
      expect(result!.policy_id).toBe('pol-001')
    })

    it('returns null for PGRST116 (no rows)', async () => {
      setupChain({ data: null, error: { code: 'PGRST116', message: 'No rows' } })

      const service = await importService()
      const result = await service.getProcessingLogByPolicyId('nonexistent')

      // Should return data (null) without logging error for PGRST116
      expect(result).toBeNull()
    })

    it('returns null on other errors', async () => {
      setupChain({ data: null, error: { code: '42P01', message: 'Table not found' } })

      const service = await importService()
      const result = await service.getProcessingLogByPolicyId('pol-001')

      expect(result).toBeNull()
    })

    it('returns null when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const result = await service.getProcessingLogByPolicyId('pol-001')

      expect(result).toBeNull()
    })
  })

  // --------------------------------------------------------------------------
  // listProcessingLogs
  // --------------------------------------------------------------------------
  describe('listProcessingLogs', () => {
    it('returns logs with default pagination', async () => {
      const mockLogs = [{ id: 'log-001' }, { id: 'log-002' }]
      const _chain = setupChain({ data: mockLogs, error: null, count: 2 })

      const service = await importService()
      const result = await service.listProcessingLogs()

      expect(result.logs).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('applies status filter', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const service = await importService()
      await service.listProcessingLogs({ status: 'completed' })

      expect(chain.eq).toHaveBeenCalledWith('status', 'completed')
    })

    it('applies ocr_used filter', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const service = await importService()
      await service.listProcessingLogs({ ocr_used: true })

      expect(chain.eq).toHaveBeenCalledWith('ocr_used', true)
    })

    it('applies ai_provider filter', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const service = await importService()
      await service.listProcessingLogs({ ai_provider: 'openai' })

      expect(chain.eq).toHaveBeenCalledWith('ai_provider', 'openai')
    })

    it('applies date range filters', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const service = await importService()
      await service.listProcessingLogs({
        from_date: '2026-01-01',
        to_date: '2026-01-31',
      })

      expect(chain.gte).toHaveBeenCalledWith('started_at', '2026-01-01')
      expect(chain.lte).toHaveBeenCalledWith('started_at', '2026-01-31')
    })

    it('applies search filter with ilike', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const service = await importService()
      await service.listProcessingLogs({ search: 'policy' })

      expect(chain.ilike).toHaveBeenCalledWith('filename', '%policy%')
    })

    it('returns empty when query errors', async () => {
      setupChain({ data: null, error: { message: 'Query error' }, count: 0 })

      const service = await importService()
      const result = await service.listProcessingLogs()

      expect(result.logs).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('returns empty when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const result = await service.listProcessingLogs()

      expect(result.logs).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  // --------------------------------------------------------------------------
  // getProcessingStats
  // --------------------------------------------------------------------------
  describe('getProcessingStats', () => {
    it('computes stats from log data', async () => {
      const mockData = [
        { status: 'completed', total_duration_ms: 5000, ocr_used: true, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 3000, ocr_used: false, ai_provider: 'openai' },
        { status: 'failed', total_duration_ms: 1000, ocr_used: false, ai_provider: 'anthropic' },
        { status: 'processing', total_duration_ms: null, ocr_used: true, ai_provider: 'openai' },
      ]
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const stats = await service.getProcessingStats(30)

      expect(stats.total).toBe(4)
      expect(stats.completed).toBe(2)
      expect(stats.failed).toBe(1)
      expect(stats.processing).toBe(1)
      expect(stats.ocr_usage_rate).toBe(50) // 2/4 * 100
      expect(stats.ai_provider_breakdown.openai).toBe(3)
      expect(stats.ai_provider_breakdown.anthropic).toBe(1)
    })

    it('calculates average duration excluding nulls', async () => {
      const mockData = [
        { status: 'completed', total_duration_ms: 6000, ocr_used: false, ai_provider: 'openai' },
        { status: 'completed', total_duration_ms: 4000, ocr_used: false, ai_provider: 'openai' },
        { status: 'processing', total_duration_ms: null, ocr_used: false, ai_provider: null },
      ]
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const stats = await service.getProcessingStats(30)

      expect(stats.avg_duration_ms).toBe(5000) // (6000 + 4000) / 2
    })

    it('returns zero stats when no data', async () => {
      setupChain({ data: [], error: null })

      const service = await importService()
      const stats = await service.getProcessingStats(7)

      expect(stats.total).toBe(0)
      expect(stats.avg_duration_ms).toBe(0)
      expect(stats.ocr_usage_rate).toBe(0)
    })

    it('returns zero stats on error', async () => {
      setupChain({ data: null, error: { message: 'Query error' } })

      const service = await importService()
      const stats = await service.getProcessingStats(30)

      expect(stats.total).toBe(0)
    })

    it('returns zero stats when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const stats = await service.getProcessingStats(30)

      expect(stats.total).toBe(0)
    })

    it('skips providers that are null', async () => {
      const mockData = [
        { status: 'completed', total_duration_ms: 5000, ocr_used: false, ai_provider: null },
        { status: 'completed', total_duration_ms: 3000, ocr_used: false, ai_provider: 'openai' },
      ]
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const stats = await service.getProcessingStats(30)

      expect(Object.keys(stats.ai_provider_breakdown)).toHaveLength(1)
      expect(stats.ai_provider_breakdown.openai).toBe(1)
    })
  })

  // --------------------------------------------------------------------------
  // deleteOldLogs
  // --------------------------------------------------------------------------
  describe('deleteOldLogs', () => {
    it('deletes logs older than specified days', async () => {
      const deletedData = [{ id: 'log-1' }, { id: 'log-2' }, { id: 'log-3' }]
      const chain = setupChain({ data: deletedData, error: null })

      const service = await importService()
      const count = await service.deleteOldLogs(90)

      expect(count).toBe(3)
      expect(chain.lt).toHaveBeenCalled()
    })

    it('returns 0 when no logs to delete', async () => {
      setupChain({ data: [], error: null })

      const service = await importService()
      const count = await service.deleteOldLogs(90)

      expect(count).toBe(0)
    })

    it('returns 0 on error', async () => {
      setupChain({ data: null, error: { message: 'Delete error' } })

      const service = await importService()
      const count = await service.deleteOldLogs(90)

      expect(count).toBe(0)
    })

    it('returns 0 when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const count = await service.deleteOldLogs(90)

      expect(count).toBe(0)
    })

    it('uses default 90 days when not specified', async () => {
      setupChain({ data: [], error: null })

      const service = await importService()
      await service.deleteOldLogs()

      // The lt call should use a date approximately 90 days ago
      expect(mockFrom).toHaveBeenCalledWith('document_processing_logs')
    })
  })
})
