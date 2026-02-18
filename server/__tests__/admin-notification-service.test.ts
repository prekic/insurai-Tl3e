/**
 * Admin Notification Service Tests
 *
 * Comprehensive tests for notification CRUD, acknowledgement,
 * and convenience helper functions.
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
  mockFrom,
} = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  mockFrom: vi.fn(),
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

// Helper to build chainable Supabase query mock
function setupChain(finalResult: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {}

  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
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

// Environment setup
const savedUrl = process.env.SUPABASE_URL
const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// ============================================================================
// TESTS
// ============================================================================

describe('admin-notification-service', () => {
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

  async function importService() {
    vi.resetModules()
    return import('../services/admin-notification-service.js')
  }

  // --------------------------------------------------------------------------
  // createNotification
  // --------------------------------------------------------------------------
  describe('createNotification', () => {
    it('creates a notification and returns it', async () => {
      const mockData = {
        id: 'notif-001',
        type: 'error',
        category: 'billing',
        title: 'Billing Issue',
        message: 'Payment failed',
        acknowledged: false,
        created_at: '2026-01-01T00:00:00Z',
      }
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const result = await service.createNotification({
        type: 'error',
        category: 'billing',
        title: 'Billing Issue',
        message: 'Payment failed',
      })

      expect(result).toBeDefined()
      expect(result!.id).toBe('notif-001')
      expect(result!.acknowledged).toBe(false)
    })

    it('returns null when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const service = await importService()
      const result = await service.createNotification({
        type: 'error',
        category: 'billing',
        title: 'Test',
        message: 'Test message',
      })

      expect(result).toBeNull()
      // Should log the notification as fallback
      expect(mockLogError).toHaveBeenCalled()
    })

    it('returns null when insert fails', async () => {
      setupChain({ data: null, error: { code: '23505', message: 'Insert error' } })

      const service = await importService()
      const result = await service.createNotification({
        type: 'warning',
        category: 'system',
        title: 'System Alert',
        message: 'Low disk space',
      })

      expect(result).toBeNull()
    })

    it('includes provider and details when provided', async () => {
      const chain = setupChain({ data: { id: 'notif-002' }, error: null })

      const service = await importService()
      await service.createNotification({
        type: 'error',
        category: 'api_error',
        title: 'API Error',
        message: 'Timeout',
        provider: 'openai',
        details: { endpoint: '/api/ai/extract', statusCode: 504 },
      })

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          provider: 'openai',
          details: { endpoint: '/api/ai/extract', statusCode: 504 },
          acknowledged: false,
        }),
      ])
    })
  })

  // --------------------------------------------------------------------------
  // getUnacknowledgedNotifications
  // --------------------------------------------------------------------------
  describe('getUnacknowledgedNotifications', () => {
    it('returns unacknowledged notifications', async () => {
      const mockData = [
        { id: 'notif-001', acknowledged: false },
        { id: 'notif-002', acknowledged: false },
      ]
      setupChain({ data: mockData, error: null })

      const service = await importService()
      const result = await service.getUnacknowledgedNotifications()

      expect(result).toHaveLength(2)
    })

    it('returns empty array when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const result = await service.getUnacknowledgedNotifications()

      expect(result).toEqual([])
    })

    it('returns empty array on error', async () => {
      setupChain({ data: null, error: { message: 'Query error' } })

      const service = await importService()
      const result = await service.getUnacknowledgedNotifications()

      expect(result).toEqual([])
    })
  })

  // --------------------------------------------------------------------------
  // getNotifications
  // --------------------------------------------------------------------------
  describe('getNotifications', () => {
    it('returns notifications with default pagination', async () => {
      const mockData = [{ id: 'notif-001' }]
      setupChain({ data: mockData, error: null, count: 1 })

      const service = await importService()
      const result = await service.getNotifications()

      expect(result.notifications).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('filters by category', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const service = await importService()
      await service.getNotifications({ category: 'billing' })

      expect(chain.eq).toHaveBeenCalledWith('category', 'billing')
    })

    it('applies pagination', async () => {
      const chain = setupChain({ data: [], error: null, count: 0 })

      const service = await importService()
      await service.getNotifications({ limit: 10, offset: 20 })

      expect(chain.range).toHaveBeenCalledWith(20, 29)
    })

    it('returns empty when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const result = await service.getNotifications()

      expect(result.notifications).toEqual([])
      expect(result.total).toBe(0)
    })

    it('returns empty on error', async () => {
      setupChain({ data: null, error: { message: 'Error' } })

      const service = await importService()
      const result = await service.getNotifications()

      expect(result.notifications).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  // --------------------------------------------------------------------------
  // acknowledgeNotification
  // --------------------------------------------------------------------------
  describe('acknowledgeNotification', () => {
    it('acknowledges a notification', async () => {
      const chain = setupChain({ data: null, error: null })

      const service = await importService()
      const result = await service.acknowledgeNotification('notif-001', 'admin@test.com')

      expect(result).toBe(true)
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          acknowledged: true,
          acknowledged_by: 'admin@test.com',
        })
      )
    })

    it('returns false when Supabase not configured', async () => {
      delete process.env.SUPABASE_URL

      const service = await importService()
      const result = await service.acknowledgeNotification('notif-001')

      expect(result).toBe(false)
    })

    it('returns false when update fails', async () => {
      setupChain({ data: null, error: { message: 'Update failed' } })

      // Need to ensure the chain's then path returns the error
      const chain: Record<string, unknown> = {}
      chain.update = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'Update failed' } })
      mockFrom.mockReturnValue(chain)

      const service = await importService()
      const result = await service.acknowledgeNotification('notif-001')

      expect(result).toBe(false)
    })

    it('works without acknowledgedBy parameter', async () => {
      const chain = setupChain({ data: null, error: null })
      // Make non-single path resolve without error
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })

      const service = await importService()
      const result = await service.acknowledgeNotification('notif-001')

      expect(result).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // Helper Functions
  // --------------------------------------------------------------------------
  describe('notifyBillingIssue', () => {
    it('creates a billing notification', async () => {
      const chain = setupChain({ data: { id: 'notif-billing' }, error: null })

      const service = await importService()
      await service.notifyBillingIssue('anthropic', 'Payment method declined')

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'error',
          category: 'billing',
          title: 'ANTHROPIC Billing Issue',
          message: 'Payment method declined',
          provider: 'anthropic',
        }),
      ])
    })

    it('includes details when provided', async () => {
      const chain = setupChain({ data: { id: 'notif-billing' }, error: null })

      const service = await importService()
      await service.notifyBillingIssue('openai', 'Quota exceeded', { usage: 100 })

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          details: { usage: 100 },
        }),
      ])
    })
  })

  describe('notifyAPIError', () => {
    it('creates an API error notification', async () => {
      const chain = setupChain({ data: { id: 'notif-api' }, error: null })

      const service = await importService()
      await service.notifyAPIError('openai', 'timeout', 'Request timed out after 60s')

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'error',
          category: 'api_error',
          title: 'OPENAI API Error: timeout',
          message: 'Request timed out after 60s',
          provider: 'openai',
        }),
      ])
    })
  })

  describe('notifyRateLimit', () => {
    it('creates a rate limit notification', async () => {
      const chain = setupChain({ data: { id: 'notif-rl' }, error: null })

      const service = await importService()
      await service.notifyRateLimit('anthropic')

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'warning',
          category: 'rate_limit',
          title: 'ANTHROPIC Rate Limit Exceeded',
          message: expect.stringContaining('anthropic'),
          provider: 'anthropic',
        }),
      ])
    })

    it('includes details when provided', async () => {
      const chain = setupChain({ data: { id: 'notif-rl' }, error: null })

      const service = await importService()
      await service.notifyRateLimit('openai', { retryAfter: 30 })

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          details: { retryAfter: 30 },
        }),
      ])
    })
  })

  describe('notifyPerformanceAlert', () => {
    it('creates a warning performance notification', async () => {
      const chain = setupChain({ data: { id: 'notif-perf' }, error: null })

      const service = await importService()
      await service.notifyPerformanceAlert(
        'high_latency',
        'warning',
        'Average latency exceeded 500ms'
      )

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'warning',
          category: 'performance',
          title: 'Config Performance Warning: high_latency',
          message: 'Average latency exceeded 500ms',
        }),
      ])
    })

    it('creates a critical performance notification', async () => {
      const chain = setupChain({ data: { id: 'notif-perf-crit' }, error: null })

      const service = await importService()
      await service.notifyPerformanceAlert(
        'error_rate',
        'critical',
        'Error rate exceeded 10%'
      )

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'error',
          category: 'performance',
          title: 'Config Performance Critical: error_rate',
        }),
      ])
    })

    it('includes details when provided', async () => {
      const chain = setupChain({ data: { id: 'notif-perf' }, error: null })

      const service = await importService()
      await service.notifyPerformanceAlert(
        'cache_miss',
        'warning',
        'Cache hit rate dropped',
        { currentRate: 30, threshold: 50 }
      )

      expect(chain.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          details: { currentRate: 30, threshold: 50 },
        }),
      ])
    })
  })
})
