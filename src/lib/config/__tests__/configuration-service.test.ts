/**
 * ConfigurationService Unit Tests
 *
 * Comprehensive branch coverage for:
 * - Singleton pattern (getInstance / resetInstance)
 * - Cache hit / miss / TTL expiry / enableCache: false
 * - All typed config getters with DB overrides
 * - Database error fallback paths
 * - Feature flag logic (enabled, disabled, expired, rollout %, bucketing)
 * - Regional factors (specific type, fallback to 'all', cache, error)
 * - Insurance providers (data mapping, cache, error)
 * - Market benchmarks (data mapping, cache, year default, error)
 * - User preferences (get success, get null, set success, set failure)
 * - User-aware getters (getUIConfigForUser, getEmailConfigForUser, getForUser)
 * - Cache invalidation (specific category, all)
 * - Convenience functions
 * - Performance monitoring integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────
// We use vi.hoisted so mock variables are available inside vi.mock factories.
const { mockFrom, mockSelect, mockSingle, mockMaybeSingle, mockOrder, mockEq, mockUpsert } =
  vi.hoisted(() => {
    const mockSingle = vi.fn()
    const mockMaybeSingle = vi.fn()
    const mockOrder = vi.fn()
    const mockUpsert = vi.fn()

    // `eq` needs to be chainable: .eq().eq().eq().eq().single() or .eq().order()
    const mockEq: ReturnType<typeof vi.fn> = vi.fn()
    const mockSelect = vi.fn()
    const mockFrom = vi.fn()

    return { mockFrom, mockSelect, mockSingle, mockMaybeSingle, mockOrder, mockEq, mockUpsert }
  })

// Mock Supabase — we control every chained call
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: mockFrom,
  },
}))

// Mock performance monitor so it doesn't interfere
vi.mock('../config-performance-monitor', () => ({
  configPerformanceMonitor: {
    record: vi.fn(),
    setCacheTtl: vi.fn(),
    getSnapshot: vi.fn(() => ({ totalFetches: 0, cacheHitRate: 0 })),
  },
}))

// Mock user-overridable module — keep the real logic
vi.mock('../user-overridable', async () => {
  const actual = await vi.importActual('../user-overridable')
  return actual
})

import { ConfigurationService } from '../configuration-service'
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_EVALUATION_CONFIG,
  DEFAULT_RATE_LIMITS_CONFIG,
  DEFAULT_OCR_CONFIG,
  DEFAULT_FUZZY_MATCHING_CONFIG,
  DEFAULT_GAP_ANALYSIS_CONFIG,
  DEFAULT_UI_CONFIG,
  DEFAULT_EMAIL_CONFIG,
} from '../types'
import { configPerformanceMonitor } from '../config-performance-monitor'

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Set up the Supabase mock chain for a query that ends with .single()
 * e.g. supabase.from('table').select('*').eq('a','b').eq('c','d').single()
 */
function setupSingleQuery(result: { data: unknown; error: unknown }) {
  mockSingle.mockResolvedValueOnce(result)
  mockEq.mockReturnValue({
    eq: mockEq,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
    order: mockOrder,
  })
  mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
  mockFrom.mockReturnValue({
    select: mockSelect,
    upsert: mockUpsert,
  })
}

/**
 * Set up the Supabase mock chain for a query that ends with .maybeSingle()
 * e.g. supabase.from('user_preferences').select('*').eq('user_id','x').maybeSingle()
 */
function setupMaybeSingleQuery(result: { data: unknown; error: unknown }) {
  mockMaybeSingle.mockResolvedValueOnce(result)
  mockEq.mockReturnValue({
    eq: mockEq,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
    order: mockOrder,
  })
  mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
  mockFrom.mockReturnValue({
    select: mockSelect,
    upsert: mockUpsert,
  })
}

/**
 * Set up the Supabase mock chain for a query that ends with .order()
 * e.g. supabase.from('table').select('*').eq('category','ai').order('display_order',{ascending:true})
 */
function setupOrderQuery(result: { data: unknown; error: unknown }) {
  mockOrder.mockResolvedValueOnce(result)
  mockEq.mockReturnValue({
    eq: mockEq,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
    order: mockOrder,
  })
  mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
  mockFrom.mockReturnValue({
    select: mockSelect,
    upsert: mockUpsert,
  })
}

/**
 * Set up mock for getCategory calls — returns array of {key, value} rows
 */
function setupCategoryQuery(rows: Array<{ key: string; value: unknown }>) {
  setupOrderQuery({ data: rows, error: null })
}

/**
 * Set up mock that throws an exception. Uses mockImplementation (not Once)
 * because get() and getCategory() now retry up to 3 times via withRetry()
 * to absorb Cloudflare-edge 503s on the Supabase preflight (runbook 08).
 * The semantic is "this query always throws"; the retries don't affect
 * whether the final outcome is the recorded error.
 */
function setupThrowingQuery() {
  mockFrom.mockImplementation(() => {
    throw new Error('Connection refused')
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ConfigurationService', () => {
  let service: ConfigurationService

  beforeEach(() => {
    ConfigurationService.resetInstance()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // SINGLETON PATTERN
  // =========================================================================

  describe('getInstance', () => {
    it('should return the same instance on repeated calls', () => {
      const a = ConfigurationService.getInstance()
      const b = ConfigurationService.getInstance()
      expect(a).toBe(b)
    })

    it('should create instance with default options when none provided', () => {
      const instance = ConfigurationService.getInstance()
      expect(instance).toBeDefined()
    })

    it('should accept custom cacheTtlMs and enableCache options', () => {
      const instance = ConfigurationService.getInstance({
        cacheTtlMs: 10000,
        enableCache: false,
      })
      expect(instance).toBeDefined()
    })

    it('should ignore options on subsequent calls (singleton)', () => {
      const a = ConfigurationService.getInstance({ cacheTtlMs: 1000 })
      const b = ConfigurationService.getInstance({ cacheTtlMs: 99999 })
      expect(a).toBe(b)
    })
  })

  describe('resetInstance', () => {
    it('should create a new instance after reset', () => {
      const a = ConfigurationService.getInstance()
      ConfigurationService.resetInstance()
      const b = ConfigurationService.getInstance()
      // They are different instances (reset cleared the singleton)
      expect(a).not.toBe(b)
    })
  })

  // =========================================================================
  // get() — SINGLE SETTING
  // =========================================================================

  describe('get()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return the DB value when setting exists', async () => {
      setupSingleQuery({ data: { value: 'gpt-5' }, error: null })
      const result = await service.get('ai', 'openai_extraction_model', 'gpt-4o')
      expect(result).toBe('gpt-5')
    })

    it('should return defaultValue when DB returns null data', async () => {
      setupSingleQuery({ data: null, error: null })
      const result = await service.get('ai', 'missing_key', 42)
      expect(result).toBe(42)
    })

    it('should return defaultValue when DB returns an error', async () => {
      setupSingleQuery({ data: null, error: { message: 'not found' } })
      const result = await service.get('ai', 'missing', 'fallback')
      expect(result).toBe('fallback')
    })

    it('should return defaultValue when DB throws an exception', async () => {
      setupThrowingQuery()
      const result = await service.get('ai', 'key', 'safe')
      expect(result).toBe('safe')
    })

    it('should record error event on exception', async () => {
      setupThrowingQuery()
      await service.get('ai', 'key', 'safe')
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheHit: false,
          success: false,
          errorMessage: 'Connection refused',
        })
      )
    })

    it('should record success event for cache miss returning default', async () => {
      // PGRST116 = "Results contain 0 rows" — a real PostgREST not-found,
      // not a transport error. Distinguishing the two became necessary
      // when withRetry started inspecting result.error.code (Apr 27 2026).
      setupSingleQuery({ data: null, error: { message: 'not found', code: 'PGRST116' } })
      await service.get('ai', 'key', 'val')
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'ai',
          method: 'get',
          cacheHit: false,
          success: true,
        })
      )
    })

    it('should record success event when DB value found', async () => {
      setupSingleQuery({ data: { value: 99 }, error: null })
      await service.get('ai', 'max_tokens', 4096)
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'ai',
          method: 'get',
          cacheHit: false,
          success: true,
        })
      )
    })

    it('should handle non-Error exceptions in error message', async () => {
      // Always-throw because get() retries up to 3× via withRetry().
      mockFrom.mockImplementation(() => {
        throw 'string error'
      })
      const result = await service.get('ai', 'key', 'default')
      expect(result).toBe('default')
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: 'unknown error',
        })
      )
    })
  })

  // =========================================================================
  // get() — CACHE BEHAVIOR
  // =========================================================================

  describe('get() with cache enabled', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 60000 })
    })

    it('should return cached value on second call (cache hit)', async () => {
      setupSingleQuery({ data: { value: 'cached-model' }, error: null })
      const first = await service.get('ai', 'model', 'default')
      expect(first).toBe('cached-model')

      // Second call should NOT hit DB
      const second = await service.get('ai', 'model', 'default')
      expect(second).toBe('cached-model')
      // mockFrom should only have been called once (for the first call)
      expect(mockFrom).toHaveBeenCalledTimes(1)
    })

    it('should record cache hit on second call', async () => {
      setupSingleQuery({ data: { value: 100 }, error: null })
      await service.get('ai', 'tokens', 0)
      vi.mocked(configPerformanceMonitor.record).mockClear()

      await service.get('ai', 'tokens', 0)
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({ cacheHit: true, success: true })
      )
    })

    it('should refetch after cache TTL expires', async () => {
      // Use a very short TTL
      ConfigurationService.resetInstance()
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 1 })

      setupSingleQuery({ data: { value: 'first' }, error: null })
      const first = await service.get('ai', 'x', 'def')
      expect(first).toBe('first')

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 10))

      setupSingleQuery({ data: { value: 'second' }, error: null })
      const second = await service.get('ai', 'x', 'def')
      expect(second).toBe('second')
    })

    it('should not cache when enableCache is false', async () => {
      ConfigurationService.resetInstance()
      service = ConfigurationService.getInstance({ enableCache: false })

      setupSingleQuery({ data: { value: 'a' }, error: null })
      await service.get('ai', 'k', 'd')

      setupSingleQuery({ data: { value: 'b' }, error: null })
      const result = await service.get('ai', 'k', 'd')
      expect(result).toBe('b')
      // Called twice because no caching
      expect(mockFrom).toHaveBeenCalledTimes(2)
    })

    it('should not store in cache when enableCache is false', async () => {
      ConfigurationService.resetInstance()
      service = ConfigurationService.getInstance({ enableCache: false })

      setupSingleQuery({ data: { value: 'val' }, error: null })
      await service.get('ai', 'k', 'd')

      // Even calling again, it should hit DB
      setupSingleQuery({ data: { value: 'val2' }, error: null })
      const result = await service.get('ai', 'k', 'd')
      expect(result).toBe('val2')
    })
  })

  // =========================================================================
  // getCategory()
  // =========================================================================

  describe('getCategory()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return key-value object from DB rows', async () => {
      setupCategoryQuery([
        { key: 'temperature', value: 0.5 },
        { key: 'max_tokens', value: 8192 },
      ])
      const result = await service.getCategory('ai')
      expect(result).toEqual({ temperature: 0.5, max_tokens: 8192 })
    })

    it('should return empty object when DB returns null data', async () => {
      setupOrderQuery({ data: null, error: null })
      const result = await service.getCategory('ai')
      expect(result).toEqual({})
    })

    it('should return empty object when DB returns error', async () => {
      setupOrderQuery({ data: null, error: { message: 'timeout' } })
      const result = await service.getCategory('evaluation')
      expect(result).toEqual({})
    })

    it('should return empty object when DB throws', async () => {
      setupThrowingQuery()
      const result = await service.getCategory('ai')
      expect(result).toEqual({})
    })

    it('should record error event when DB throws', async () => {
      setupThrowingQuery()
      await service.getCategory('ai')
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'getCategory',
          cacheHit: false,
          success: false,
        })
      )
    })

    it('should record success on cache miss returning empty', async () => {
      // Real PostgREST "no rows" error (has `code`), not a transport error.
      // Without the code, withRetry would interpret this as transport-level
      // and retry up to 3× (Apr 27 2026 fix).
      setupOrderQuery({ data: null, error: { message: 'not found', code: 'PGRST116' } })
      await service.getCategory('ai')
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'getCategory',
          cacheHit: false,
          success: true,
        })
      )
    })

    it('should handle non-Error exception in getCategory', async () => {
      // Always-throw because getCategory() retries up to 3× via withRetry().
      mockFrom.mockImplementation(() => {
        throw 42
      })
      const result = await service.getCategory('ai')
      expect(result).toEqual({})
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({ errorMessage: 'unknown error' })
      )
    })
  })

  describe('getCategory() with cache', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 60000 })
    })

    it('should cache category results and return on second call', async () => {
      setupCategoryQuery([{ key: 'k1', value: 'v1' }])
      const first = await service.getCategory('ai')
      expect(first).toEqual({ k1: 'v1' })

      const second = await service.getCategory('ai')
      expect(second).toEqual({ k1: 'v1' })
      expect(mockFrom).toHaveBeenCalledTimes(1)
    })

    it('should record cache hit on repeated getCategory call', async () => {
      setupCategoryQuery([{ key: 'a', value: 1 }])
      await service.getCategory('evaluation')
      vi.mocked(configPerformanceMonitor.record).mockClear()

      await service.getCategory('evaluation')
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'getCategory',
          cacheHit: true,
        })
      )
    })
  })

  // =========================================================================
  // TYPED CONFIG GETTERS WITH DB OVERRIDES
  // =========================================================================

  describe('getAIConfig()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return defaults when DB is empty', async () => {
      setupCategoryQuery([])
      const config = await service.getAIConfig()
      expect(config).toEqual(DEFAULT_AI_CONFIG)
    })

    it('should override specific keys from DB', async () => {
      setupCategoryQuery([
        { key: 'temperature', value: 0.5 },
        { key: 'max_tokens', value: 8192 },
        { key: 'preferred_provider', value: 'openai' },
      ])
      const config = await service.getAIConfig()
      expect(config.temperature).toBe(0.5)
      expect(config.maxTokens).toBe(8192)
      expect(config.preferredProvider).toBe('openai')
      // Other fields remain default
      expect(config.openaiExtractionModel).toBe(DEFAULT_AI_CONFIG.openaiExtractionModel)
      expect(config.enableFallback).toBe(DEFAULT_AI_CONFIG.enableFallback)
    })

    it('should ignore unknown DB keys not in AI_KEY_MAP', async () => {
      setupCategoryQuery([{ key: 'unknown_key_xyz', value: 'should_be_ignored' }])
      const config = await service.getAIConfig()
      expect(config).toEqual(DEFAULT_AI_CONFIG)
      // @ts-expect-error - mismatch due to schema update
      expect((config as Record<string, unknown>)['unknown_key_xyz']).toBeUndefined()
    })
  })

  describe('getEvaluationConfig()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return defaults when DB is empty', async () => {
      setupCategoryQuery([])
      const config = await service.getEvaluationConfig()
      expect(config).toEqual(DEFAULT_EVALUATION_CONFIG)
    })

    it('should override evaluation weights from DB', async () => {
      setupCategoryQuery([
        { key: 'weight_premium', value: 25 },
        { key: 'weight_coverage', value: 25 },
        { key: 'grade_a_threshold', value: 95 },
        { key: 'strict_compliance', value: false },
      ])
      const config = await service.getEvaluationConfig()
      expect(config.weightPremium).toBe(25)
      expect(config.weightCoverage).toBe(25)
      expect(config.gradeAThreshold).toBe(95)
      expect(config.strictCompliance).toBe(false)
      // Others remain default
      expect(config.weightDeductible).toBe(DEFAULT_EVALUATION_CONFIG.weightDeductible)
    })
  })

  describe('getRateLimitsConfig()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return defaults when DB is empty', async () => {
      setupCategoryQuery([])
      const config = await service.getRateLimitsConfig()
      expect(config).toEqual(DEFAULT_RATE_LIMITS_CONFIG)
    })

    it('should override rate limit values from DB', async () => {
      setupCategoryQuery([
        { key: 'general_max_requests', value: 200 },
        { key: 'chat_max_requests', value: 120 },
      ])
      const config = await service.getRateLimitsConfig()
      expect(config.generalMaxRequests).toBe(200)
      expect(config.chatMaxRequests).toBe(120)
      expect(config.aiExtractionMaxRequests).toBe(
        DEFAULT_RATE_LIMITS_CONFIG.aiExtractionMaxRequests
      )
    })
  })

  describe('getOCRConfig()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return defaults when DB is empty', async () => {
      setupCategoryQuery([])
      const config = await service.getOCRConfig()
      expect(config).toEqual(DEFAULT_OCR_CONFIG)
    })

    it('should override OCR thresholds from DB', async () => {
      setupCategoryQuery([
        { key: 'skip_ocr_threshold', value: 0.9 },
        { key: 'timeout_seconds', value: 60 },
      ])
      const config = await service.getOCRConfig()
      expect(config.skipOcrThreshold).toBe(0.9)
      expect(config.timeoutSeconds).toBe(60)
      expect(config.charsPerPageThreshold).toBe(DEFAULT_OCR_CONFIG.charsPerPageThreshold)
    })
  })

  describe('getFuzzyMatchingConfig()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return defaults when DB is empty', async () => {
      setupCategoryQuery([])
      const config = await service.getFuzzyMatchingConfig()
      expect(config).toEqual(DEFAULT_FUZZY_MATCHING_CONFIG)
    })

    it('should override fuzzy thresholds from DB', async () => {
      setupCategoryQuery([{ key: 'default_threshold', value: 0.9 }])
      const config = await service.getFuzzyMatchingConfig()
      expect(config.defaultThreshold).toBe(0.9)
      expect(config.policyNumberThreshold).toBe(DEFAULT_FUZZY_MATCHING_CONFIG.policyNumberThreshold)
    })
  })

  describe('getGapAnalysisConfig()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return defaults when DB is empty', async () => {
      setupCategoryQuery([])
      const config = await service.getGapAnalysisConfig()
      expect(config).toEqual(DEFAULT_GAP_ANALYSIS_CONFIG)
    })

    it('should override gap analysis values from DB', async () => {
      setupCategoryQuery([
        { key: 'max_gap_score', value: 200 },
        { key: 'penalty_critical_missing', value: 20 },
      ])
      const config = await service.getGapAnalysisConfig()
      expect(config.maxGapScore).toBe(200)
      expect(config.penaltyCriticalMissing).toBe(20)
      expect(config.missingCoverageThreshold).toBe(
        DEFAULT_GAP_ANALYSIS_CONFIG.missingCoverageThreshold
      )
    })
  })

  describe('getUIConfig()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return defaults when DB is empty', async () => {
      setupCategoryQuery([])
      const config = await service.getUIConfig()
      expect(config).toEqual(DEFAULT_UI_CONFIG)
    })

    it('should override UI values from DB', async () => {
      setupCategoryQuery([
        { key: 'default_items_per_page', value: 25 },
        { key: 'max_file_size_mb', value: 20 },
      ])
      const config = await service.getUIConfig()
      expect(config.defaultItemsPerPage).toBe(25)
      expect(config.maxFileSizeMb).toBe(20)
    })
  })

  describe('getEmailConfig()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return defaults when DB is empty', async () => {
      setupCategoryQuery([])
      const config = await service.getEmailConfig()
      expect(config).toEqual(DEFAULT_EMAIL_CONFIG)
    })

    it('should override email values from DB', async () => {
      setupCategoryQuery([
        { key: 'urgency_threshold_days', value: 14 },
        { key: 'default_digest_enabled', value: true },
      ])
      const config = await service.getEmailConfig()
      expect(config.urgencyThresholdDays).toBe(14)
      expect(config.defaultDigestEnabled).toBe(true)
      expect(config.reminderDays).toEqual(DEFAULT_EMAIL_CONFIG.reminderDays)
    })
  })

  // =========================================================================
  // CACHE INVALIDATION
  // =========================================================================

  describe('invalidateCache()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 60000 })
    })

    it('should clear all cache when called without argument', async () => {
      // Populate cache
      setupCategoryQuery([{ key: 'k', value: 'v' }])
      await service.getCategory('ai')
      setupCategoryQuery([{ key: 'k2', value: 'v2' }])
      await service.getCategory('evaluation')

      // Invalidate all
      service.invalidateCache()

      // Both should refetch from DB
      setupCategoryQuery([{ key: 'k3', value: 'v3' }])
      const result = await service.getCategory('ai')
      expect(result).toEqual({ k3: 'v3' })
    })

    it('should clear only the specified category cache', async () => {
      // Populate both caches
      setupCategoryQuery([{ key: 'a', value: 1 }])
      await service.getCategory('ai')
      setupCategoryQuery([{ key: 'b', value: 2 }])
      await service.getCategory('evaluation')
      vi.clearAllMocks()

      // Invalidate only 'ai'
      service.invalidateCache('ai')

      // 'ai' should refetch
      setupCategoryQuery([{ key: 'a2', value: 10 }])
      const aiResult = await service.getCategory('ai')
      expect(aiResult).toEqual({ a2: 10 })
      expect(mockFrom).toHaveBeenCalledTimes(1)

      // 'evaluation' should still be cached
      vi.clearAllMocks()
      const evalResult = await service.getCategory('evaluation')
      expect(evalResult).toEqual({ b: 2 })
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('should also clear individual key caches for that category', async () => {
      // Populate a single-key cache entry
      setupSingleQuery({ data: { value: 'cached' }, error: null })
      await service.get('ai', 'temperature', 0.1)
      vi.clearAllMocks()

      // Should be cached
      const cachedResult = await service.get('ai', 'temperature', 0.1)
      expect(cachedResult).toBe('cached')
      expect(mockFrom).not.toHaveBeenCalled()

      // Invalidate 'ai' category
      service.invalidateCache('ai')

      // Should refetch
      setupSingleQuery({ data: { value: 'new' }, error: null })
      const freshResult = await service.get('ai', 'temperature', 0.1)
      expect(freshResult).toBe('new')
    })
  })

  // =========================================================================
  // FEATURE FLAGS
  // =========================================================================

  describe('isFeatureEnabled()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return false when flag does not exist (data null)', async () => {
      setupSingleQuery({ data: null, error: { code: 'PGRST116' } })
      const result = await service.isFeatureEnabled('nonexistent')
      expect(result).toBe(false)
    })

    it('should return false when flag is disabled', async () => {
      setupSingleQuery({
        data: {
          key: 'my_flag',
          enabled: false,
          rolloutPercentage: 100,
          expiresAt: null,
        },
        error: null,
      })
      const result = await service.isFeatureEnabled('my_flag')
      expect(result).toBe(false)
    })

    it('should return false when flag is expired', async () => {
      const pastDate = new Date('2020-01-01').toISOString()
      setupSingleQuery({
        data: {
          key: 'expired_flag',
          enabled: true,
          rolloutPercentage: 100,
          expiresAt: pastDate,
        },
        error: null,
      })
      const result = await service.isFeatureEnabled('expired_flag')
      expect(result).toBe(false)
    })

    it('should return true when flag is enabled, 100% rollout, no expiry', async () => {
      setupSingleQuery({
        data: {
          key: 'active_flag',
          enabled: true,
          rolloutPercentage: 100,
          expiresAt: null,
        },
        error: null,
      })
      const result = await service.isFeatureEnabled('active_flag')
      expect(result).toBe(true)
    })

    it('should return true when flag is enabled with future expiry', async () => {
      const futureDate = new Date('2030-12-31').toISOString()
      setupSingleQuery({
        data: {
          key: 'future_flag',
          enabled: true,
          rolloutPercentage: 100,
          expiresAt: futureDate,
        },
        error: null,
      })
      const result = await service.isFeatureEnabled('future_flag')
      expect(result).toBe(true)
    })

    it('should use userId hash for consistent rollout bucketing', async () => {
      // 50% rollout with a specific userId — result should be deterministic
      setupSingleQuery({
        data: {
          key: 'partial_flag',
          enabled: true,
          rolloutPercentage: 50,
          expiresAt: null,
        },
        error: null,
      })
      const result1 = await service.isFeatureEnabled('partial_flag', 'user-abc')

      setupSingleQuery({
        data: {
          key: 'partial_flag',
          enabled: true,
          rolloutPercentage: 50,
          expiresAt: null,
        },
        error: null,
      })
      const result2 = await service.isFeatureEnabled('partial_flag', 'user-abc')

      // Same user should get same result (deterministic)
      expect(result1).toBe(result2)
    })

    it('should return false when rollout % is 0', async () => {
      setupSingleQuery({
        data: {
          key: 'zero_rollout',
          enabled: true,
          rolloutPercentage: 0,
          expiresAt: null,
        },
        error: null,
      })
      const result = await service.isFeatureEnabled('zero_rollout', 'user-123')
      expect(result).toBe(false)
    })

    it('should return true when rollout is 100% with userId', async () => {
      setupSingleQuery({
        data: {
          key: 'full_rollout',
          enabled: true,
          rolloutPercentage: 100,
          expiresAt: null,
        },
        error: null,
      })
      const result = await service.isFeatureEnabled('full_rollout', 'user-123')
      expect(result).toBe(true)
    })

    it('should use random bucketing when no userId provided (rollout < 100)', async () => {
      // With random, we can't predict — but should not throw
      setupSingleQuery({
        data: {
          key: 'random_flag',
          enabled: true,
          rolloutPercentage: 50,
          expiresAt: null,
        },
        error: null,
      })
      const result = await service.isFeatureEnabled('random_flag')
      expect(typeof result).toBe('boolean')
    })

    it('should return false when DB throws exception', async () => {
      setupThrowingQuery()
      const result = await service.isFeatureEnabled('crash_flag')
      expect(result).toBe(false)
    })

    it('should record error event on exception', async () => {
      setupThrowingQuery()
      await service.isFeatureEnabled('crash_flag')
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'feature_flags',
          method: 'isFeatureEnabled',
          success: false,
        })
      )
    })

    it('should record performance for all outcome branches', async () => {
      // Expired flag
      setupSingleQuery({
        data: {
          key: 'exp',
          enabled: true,
          rolloutPercentage: 100,
          expiresAt: '2020-01-01T00:00:00Z',
        },
        error: null,
      })
      await service.isFeatureEnabled('exp')
      expect(configPerformanceMonitor.record).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, cacheHit: false })
      )
    })

    it('should include anonymous in cache key when no userId', async () => {
      // Verify the cache key pattern works by testing cache hit behavior
      ConfigurationService.resetInstance()
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 60000 })

      setupSingleQuery({
        data: {
          key: 'flag_a',
          enabled: true,
          rolloutPercentage: 100,
          expiresAt: null,
        },
        error: null,
      })
      await service.isFeatureEnabled('flag_a')
      vi.clearAllMocks()

      // Second call — should be cached (no DB call)
      const result = await service.isFeatureEnabled('flag_a')
      expect(result).toBe(true)
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('should cache enabled flag result', async () => {
      ConfigurationService.resetInstance()
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 60000 })

      setupSingleQuery({
        data: {
          key: 'cached_flag',
          enabled: true,
          rolloutPercentage: 100,
          expiresAt: null,
        },
        error: null,
      })
      const first = await service.isFeatureEnabled('cached_flag', 'user1')
      expect(first).toBe(true)

      vi.clearAllMocks()
      const second = await service.isFeatureEnabled('cached_flag', 'user1')
      expect(second).toBe(true)
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  describe('getFeatureFlags()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return empty array when no flags exist', async () => {
      mockOrder.mockResolvedValueOnce({ data: [], error: null })
      mockSelect.mockReturnValueOnce({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValueOnce({ select: mockSelect })
      const flags = await service.getFeatureFlags()
      expect(flags).toEqual([])
    })

    it('should return flags array from DB', async () => {
      const flagData = [
        { key: 'flag1', enabled: true, rolloutPercentage: 100 },
        { key: 'flag2', enabled: false, rolloutPercentage: 0 },
      ]
      mockOrder.mockResolvedValueOnce({ data: flagData, error: null })
      mockSelect.mockReturnValueOnce({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValueOnce({ select: mockSelect })
      const flags = await service.getFeatureFlags()
      expect(flags).toEqual(flagData)
    })

    it('should return empty array on DB error', async () => {
      mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'db error' } })
      mockSelect.mockReturnValueOnce({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValueOnce({ select: mockSelect })
      const flags = await service.getFeatureFlags()
      expect(flags).toEqual([])
    })

    it('should return empty array on exception', async () => {
      setupThrowingQuery()
      const flags = await service.getFeatureFlags()
      expect(flags).toEqual([])
    })
  })

  // =========================================================================
  // REGIONAL FACTORS
  // =========================================================================

  describe('getRegionalFactor()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return factor when specific policyType found', async () => {
      setupSingleQuery({ data: { risk_factor: 1.15 }, error: null })
      const factor = await service.getRegionalFactor('marmara', 'kasko', 2026)
      expect(factor).toBe(1.15)
    })

    it('should fall back to "all" policyType when specific not found', async () => {
      // First call (specific policyType) returns error
      mockSingle
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        // Second call (fallback to 'all') returns data
        .mockResolvedValueOnce({ data: { risk_factor: 1.05 }, error: null })

      mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect })

      const factor = await service.getRegionalFactor('ege', 'traffic', 2026)
      expect(factor).toBe(1.05)
    })

    it('should return 1.0 when neither specific nor "all" found', async () => {
      mockSingle
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })

      mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect })

      const factor = await service.getRegionalFactor('unknown_region')
      expect(factor).toBe(1.0)
    })

    it('should return 1.0 on exception', async () => {
      setupThrowingQuery()
      const factor = await service.getRegionalFactor('marmara')
      expect(factor).toBe(1.0)
    })

    it('should use current year as default', async () => {
      setupSingleQuery({ data: { risk_factor: 1.1 }, error: null })
      await service.getRegionalFactor('marmara')
      // The eq calls should include current year
      expect(mockEq).toHaveBeenCalled()
    })

    it('should use default policyType "all" when not specified', async () => {
      setupSingleQuery({ data: { risk_factor: 0.95 }, error: null })
      const factor = await service.getRegionalFactor('ic_anadolu')
      expect(factor).toBe(0.95)
    })

    it('should cache regional factor results', async () => {
      ConfigurationService.resetInstance()
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 60000 })

      setupSingleQuery({ data: { risk_factor: 1.2 }, error: null })
      const first = await service.getRegionalFactor('marmara', 'all', 2026)
      expect(first).toBe(1.2)

      vi.clearAllMocks()
      const second = await service.getRegionalFactor('marmara', 'all', 2026)
      expect(second).toBe(1.2)
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  describe('getRegionalFactors()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return mapped regional factors from DB', async () => {
      const dbRows = [
        {
          id: '1',
          region_code: 'marmara',
          region_name: 'Marmara',
          region_name_tr: 'Marmara',
          policy_type: 'all',
          risk_factor: 1.15,
          year: 2026,
          source: 'SEDDK',
          notes: null,
          is_active: true,
        },
      ]
      // getRegionalFactors with year: from().select().eq().order().eq() — await on final eq
      // The chain is: select().eq('is_active', true).order('region_code').eq('year', 2026)
      // When year is provided, .eq() is called on the order() result, and the final query is awaited
      const yearEq = vi.fn().mockResolvedValueOnce({ data: dbRows, error: null })
      mockOrder.mockReturnValueOnce({ eq: yearEq })
      mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect })

      const factors = await service.getRegionalFactors(2026)
      expect(factors).toHaveLength(1)
      expect(factors[0]).toEqual({
        id: '1',
        regionCode: 'marmara',
        regionName: 'Marmara',
        regionNameTr: 'Marmara',
        policyType: 'all',
        riskFactor: 1.15,
        year: 2026,
        source: 'SEDDK',
        notes: null,
        isActive: true,
      })
    })

    it('should return empty array when no factors found', async () => {
      // No year — query is: from().select().eq().order() — await on order()
      mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
      mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect })

      const factors = await service.getRegionalFactors()
      expect(factors).toEqual([])
    })

    it('should filter by year when provided', async () => {
      // With year: from().select().eq().order().eq() — await on final eq
      const yearEq = vi.fn().mockResolvedValueOnce({ data: [], error: null })
      mockOrder.mockReturnValueOnce({ eq: yearEq })
      mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect })

      await service.getRegionalFactors(2025)
      expect(yearEq).toHaveBeenCalledWith('year', 2025)
    })

    it('should not filter by year when not provided', async () => {
      // No year — query is: from().select().eq().order() — await on order()
      mockOrder.mockResolvedValueOnce({ data: [], error: null })
      mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect })

      const factors = await service.getRegionalFactors()
      expect(factors).toEqual([])
    })

    it('should return empty array on exception', async () => {
      setupThrowingQuery()
      const factors = await service.getRegionalFactors()
      expect(factors).toEqual([])
    })
  })

  // =========================================================================
  // INSURANCE PROVIDERS
  // =========================================================================

  describe('getInsuranceProviders()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return mapped providers from DB', async () => {
      const dbRows = [
        {
          id: 'p1',
          code: 'allianz',
          name: 'Allianz',
          name_tr: 'Allianz Sigorta',
          market_share: 12.8,
          customer_rating: 4.2,
          established_year: 1923,
          headquarters: 'Istanbul',
          website: 'https://allianz.com.tr',
          logo_url: '/logos/allianz.png',
          specialties: ['kasko', 'health'],
          is_active: true,
        },
      ]
      setupOrderQuery({ data: dbRows, error: null })

      const providers = await service.getInsuranceProviders()
      expect(providers).toHaveLength(1)
      expect(providers[0]).toEqual({
        id: 'p1',
        code: 'allianz',
        name: 'Allianz',
        nameTr: 'Allianz Sigorta',
        marketShare: 12.8,
        customerRating: 4.2,
        establishedYear: 1923,
        headquarters: 'Istanbul',
        website: 'https://allianz.com.tr',
        logoUrl: '/logos/allianz.png',
        specialties: ['kasko', 'health'],
        isActive: true,
      })
    })

    it('should default specialties to empty array when null', async () => {
      setupOrderQuery({
        data: [
          {
            id: 'p2',
            code: 'test',
            name: 'Test',
            name_tr: null,
            market_share: null,
            customer_rating: null,
            established_year: null,
            headquarters: null,
            website: null,
            logo_url: null,
            specialties: null,
            is_active: true,
          },
        ],
        error: null,
      })
      const providers = await service.getInsuranceProviders()
      expect(providers[0].specialties).toEqual([])
    })

    it('should return empty array on DB error', async () => {
      setupOrderQuery({ data: null, error: { message: 'db error' } })
      const providers = await service.getInsuranceProviders()
      expect(providers).toEqual([])
    })

    it('should return empty array on exception', async () => {
      setupThrowingQuery()
      const providers = await service.getInsuranceProviders()
      expect(providers).toEqual([])
    })

    it('should cache providers on second call', async () => {
      ConfigurationService.resetInstance()
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 60000 })

      setupOrderQuery({
        data: [
          {
            id: 'p1',
            code: 'a',
            name: 'A',
            name_tr: 'A',
            market_share: 10,
            customer_rating: 4,
            established_year: 2000,
            headquarters: 'X',
            website: 'y',
            logo_url: 'z',
            specialties: [],
            is_active: true,
          },
        ],
        error: null,
      })
      await service.getInsuranceProviders()
      vi.clearAllMocks()

      const cached = await service.getInsuranceProviders()
      expect(cached).toHaveLength(1)
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // MARKET BENCHMARKS
  // =========================================================================

  describe('getMarketBenchmarks()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return mapped benchmarks from DB', async () => {
      const dbRows = [
        {
          id: 'b1',
          policy_type: 'kasko',
          coverage_type: 'collision',
          coverage_name_tr: 'Carpma',
          region_code: 'marmara',
          year: 2026,
          min_limit: 100000,
          typical_limit: 500000,
          max_limit: 2000000,
          min_deductible: 0,
          typical_deductible: 5000,
          max_deductible: 20000,
          inclusion_rate: 100,
          importance: 'critical',
          source: 'SEDDK',
          notes: null,
          is_active: true,
        },
      ]
      setupOrderQuery({ data: dbRows, error: null })

      const benchmarks = await service.getMarketBenchmarks('kasko', 2026)
      expect(benchmarks).toHaveLength(1)
      expect(benchmarks[0]).toEqual({
        id: 'b1',
        policyType: 'kasko',
        coverageType: 'collision',
        coverageNameTr: 'Carpma',
        regionCode: 'marmara',
        year: 2026,
        minLimit: 100000,
        typicalLimit: 500000,
        maxLimit: 2000000,
        minDeductible: 0,
        typicalDeductible: 5000,
        maxDeductible: 20000,
        inclusionRate: 100,
        importance: 'critical',
        source: 'SEDDK',
        notes: null,
        isActive: true,
      })
    })

    it('should use current year when year not provided', async () => {
      setupOrderQuery({ data: [], error: null })
      const benchmarks = await service.getMarketBenchmarks('traffic')
      expect(benchmarks).toEqual([])
      // Should have been called with current year
      expect(mockEq).toHaveBeenCalled()
    })

    it('should return empty array on DB error', async () => {
      setupOrderQuery({ data: null, error: { message: 'error' } })
      const benchmarks = await service.getMarketBenchmarks('kasko')
      expect(benchmarks).toEqual([])
    })

    it('should return empty array on exception', async () => {
      setupThrowingQuery()
      const benchmarks = await service.getMarketBenchmarks('health')
      expect(benchmarks).toEqual([])
    })

    it('should cache benchmarks on second call', async () => {
      ConfigurationService.resetInstance()
      service = ConfigurationService.getInstance({ enableCache: true, cacheTtlMs: 60000 })

      setupOrderQuery({
        data: [
          {
            id: 'b1',
            policy_type: 'kasko',
            coverage_type: 'collision',
            coverage_name_tr: 'C',
            region_code: 'all',
            year: 2026,
            min_limit: 0,
            typical_limit: 500000,
            max_limit: 1000000,
            min_deductible: 0,
            typical_deductible: 0,
            max_deductible: 0,
            inclusion_rate: 100,
            importance: 'critical',
            source: 's',
            notes: null,
            is_active: true,
          },
        ],
        error: null,
      })
      await service.getMarketBenchmarks('kasko', 2026)
      vi.clearAllMocks()

      const cached = await service.getMarketBenchmarks('kasko', 2026)
      expect(cached).toHaveLength(1)
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // USER PREFERENCES
  // =========================================================================

  describe('getUserPreferences()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return preferences when found', async () => {
      const prefs = { default_items_per_page: 25, max_ai_insights_preview: 5 }
      setupMaybeSingleQuery({ data: { preferences: prefs }, error: null })
      const result = await service.getUserPreferences('user-1', 'ui')
      expect(result).toEqual(prefs)
    })

    it('should return null when not found', async () => {
      setupMaybeSingleQuery({ data: null, error: { code: 'PGRST116' } })
      const result = await service.getUserPreferences('user-1', 'ui')
      expect(result).toBeNull()
    })

    it('should return null on exception', async () => {
      setupThrowingQuery()
      const result = await service.getUserPreferences('user-1', 'ui')
      expect(result).toBeNull()
    })
  })

  describe('setUserPreferences()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return true when upsert succeeds', async () => {
      mockUpsert.mockResolvedValueOnce({ error: null })
      mockFrom.mockReturnValueOnce({
        select: mockSelect,
        upsert: mockUpsert,
      })
      const result = await service.setUserPreferences('user-1', 'ui', { theme: 'dark' })
      expect(result).toBe(true)
    })

    it('should return false when upsert returns error', async () => {
      mockUpsert.mockResolvedValueOnce({ error: { message: 'conflict' } })
      mockFrom.mockReturnValueOnce({
        select: mockSelect,
        upsert: mockUpsert,
      })
      const result = await service.setUserPreferences('user-1', 'ui', { theme: 'dark' })
      expect(result).toBe(false)
    })

    it('should return false on exception', async () => {
      setupThrowingQuery()
      const result = await service.setUserPreferences('user-1', 'ui', {})
      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // USER-AWARE CONFIG GETTERS
  // =========================================================================

  describe('getUIConfigForUser()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should merge user preferences over admin config', async () => {
      // getUIConfig returns default (DB empty)
      setupCategoryQuery([])
      // getUserPreferences returns user overrides
      setupMaybeSingleQuery({
        data: { preferences: { default_items_per_page: 25 } },
        error: null,
      })

      const config = await service.getUIConfigForUser('user-1')
      expect(config.defaultItemsPerPage).toBe(25) // user override
      expect(config.toastSuccessDurationMs).toBe(DEFAULT_UI_CONFIG.toastSuccessDurationMs)
    })

    it('should return admin config when user has no preferences', async () => {
      setupCategoryQuery([{ key: 'max_file_size_mb', value: 20 }])
      setupMaybeSingleQuery({ data: null, error: null })

      const config = await service.getUIConfigForUser('user-1')
      expect(config.maxFileSizeMb).toBe(20)
      expect(config.defaultItemsPerPage).toBe(DEFAULT_UI_CONFIG.defaultItemsPerPage)
    })
  })

  describe('getEmailConfigForUser()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should merge email user preferences over admin config', async () => {
      setupCategoryQuery([])
      setupMaybeSingleQuery({
        data: { preferences: { default_digest_enabled: true } },
        error: null,
      })

      const config = await service.getEmailConfigForUser('user-2')
      expect(config.defaultDigestEnabled).toBe(true) // user override
      expect(config.reminderDays).toEqual(DEFAULT_EMAIL_CONFIG.reminderDays) // unchanged
    })

    it('should return admin config when user has null prefs', async () => {
      setupCategoryQuery([{ key: 'urgency_threshold_days', value: 14 }])
      setupMaybeSingleQuery({ data: null, error: null })

      const config = await service.getEmailConfigForUser('user-2')
      expect(config.urgencyThresholdDays).toBe(14)
    })
  })

  describe('getForUser()', () => {
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('should return admin value for non-overridable category', async () => {
      setupSingleQuery({ data: { value: 0.5 }, error: null })
      const result = await service.getForUser('ai', 'temperature', 0.1, 'user-1')
      expect(result).toBe(0.5)
    })

    it('should return admin value when no userId provided', async () => {
      setupSingleQuery({ data: { value: 100 }, error: null })
      const result = await service.getForUser('ui', 'max_items_per_page', 50)
      expect(result).toBe(100)
    })

    it('should return user preference for overridable category when set', async () => {
      // getUserPreferences returns user prefs
      setupMaybeSingleQuery({
        data: { preferences: { default_items_per_page: 30 } },
        error: null,
      })
      const result = await service.getForUser('ui', 'default_items_per_page', 10, 'user-1')
      expect(result).toBe(30)
    })

    it('should fall back to admin setting when user has no pref for the key', async () => {
      // getUserPreferences returns prefs without our key
      setupMaybeSingleQuery({
        data: { preferences: { some_other_key: 'val' } },
        error: null,
      })
      // Fall back to admin get
      setupSingleQuery({ data: { value: 25 }, error: null })
      const result = await service.getForUser('ui', 'default_items_per_page', 10, 'user-1')
      expect(result).toBe(25)
    })

    it('should fall back to admin setting when getUserPreferences returns null', async () => {
      // getUserPreferences returns null
      setupMaybeSingleQuery({ data: null, error: null })
      // Admin setting
      setupSingleQuery({ data: { value: 5000 }, error: null })
      const result = await service.getForUser('email', 'urgency_threshold_days', 7, 'user-1')
      expect(result).toBe(5000)
    })

    it('should handle non-overridable categories with userId — delegates to get()', async () => {
      setupSingleQuery({ data: { value: 0.2 }, error: null })
      const result = await service.getForUser('ocr', 'skip_ocr_threshold', 0.85, 'user-1')
      expect(result).toBe(0.2)
    })
  })

  // =========================================================================
  // PERFORMANCE MONITORING
  // =========================================================================

  describe('getPerformanceSnapshot()', () => {
    it('should delegate to configPerformanceMonitor.getSnapshot()', () => {
      service = ConfigurationService.getInstance({ enableCache: false })
      const snapshot = service.getPerformanceSnapshot()
      expect(configPerformanceMonitor.getSnapshot).toHaveBeenCalled()
      expect(snapshot).toEqual({ totalFetches: 0, cacheHitRate: 0 })
    })
  })

  // =========================================================================
  // CONVENIENCE FUNCTIONS
  // =========================================================================

  describe('Convenience functions', () => {
    // These test the module-level exported functions that delegate to configService singleton

    beforeEach(() => {
      ConfigurationService.resetInstance()
    })

    it('getAIConfig() should return default config', async () => {
      setupCategoryQuery([])
      // Import the convenience function dynamically to use fresh singleton
      const { getAIConfig } = await import('../configuration-service')
      const config = await getAIConfig()
      expect(config.openaiExtractionModel).toBe(DEFAULT_AI_CONFIG.openaiExtractionModel)
    })

    it('getEvaluationConfig() should return default config', async () => {
      setupCategoryQuery([])
      const { getEvaluationConfig } = await import('../configuration-service')
      const config = await getEvaluationConfig()
      expect(config.weightPremium).toBe(DEFAULT_EVALUATION_CONFIG.weightPremium)
    })

    it('getOCRConfig() should return default config', async () => {
      setupCategoryQuery([])
      const { getOCRConfig } = await import('../configuration-service')
      const config = await getOCRConfig()
      expect(config.charsPerPageThreshold).toBe(DEFAULT_OCR_CONFIG.charsPerPageThreshold)
    })

    it('getFuzzyMatchingConfig() should return default config', async () => {
      setupCategoryQuery([])
      const { getFuzzyMatchingConfig } = await import('../configuration-service')
      const config = await getFuzzyMatchingConfig()
      expect(config.defaultThreshold).toBe(DEFAULT_FUZZY_MATCHING_CONFIG.defaultThreshold)
    })

    it('isFeatureEnabled() should return false for missing flag', async () => {
      setupSingleQuery({ data: null, error: { code: 'PGRST116' } })
      const { isFeatureEnabled } = await import('../configuration-service')
      const result = await isFeatureEnabled('nonexistent')
      expect(result).toBe(false)
    })

    it('getRegionalFactor() should return 1.0 for unknown region', async () => {
      mockSingle
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      mockEq.mockReturnValue({ eq: mockEq, single: mockSingle, order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect })

      const { getRegionalFactor } = await import('../configuration-service')
      const factor = await getRegionalFactor('nowhere')
      expect(factor).toBe(1.0)
    })

    it('getUIConfigForUser() should merge user prefs', async () => {
      setupCategoryQuery([])
      setupMaybeSingleQuery({
        data: { preferences: { default_items_per_page: 50 } },
        error: null,
      })
      const { getUIConfigForUser } = await import('../configuration-service')
      const config = await getUIConfigForUser('user-1')
      expect(config.defaultItemsPerPage).toBe(50)
    })

    it('getEmailConfigForUser() should merge user prefs', async () => {
      setupCategoryQuery([])
      setupMaybeSingleQuery({
        data: { preferences: { default_marketing_enabled: false } },
        error: null,
      })
      const { getEmailConfigForUser } = await import('../configuration-service')
      const config = await getEmailConfigForUser('user-1')
      expect(config.defaultMarketingEnabled).toBe(false)
    })
  })

  // ========================================================================
  // RETRY BEHAVIOR — Cloudflare-edge 503 mitigation per runbook 08
  // ========================================================================
  describe('Cloudflare 503 retry on Supabase preflight failure', () => {
    // Use real timers — the 200/500 ms backoff is fast enough not to slow
    // tests meaningfully, and fake timers tangle with the Promise chain
    // inside withRetry() (microtask deadlock).
    beforeEach(() => {
      service = ConfigurationService.getInstance({ enableCache: false })
    })

    it('get() retries the fetch when the first call throws and recovers on retry', async () => {
      // First call: thrown TypeError (simulates browser blocking due to 503
      // preflight with no ACAO header). Second call: success.
      let callCount = 0
      mockSingle.mockImplementation(() => {
        callCount += 1
        if (callCount === 1) {
          return Promise.reject(new TypeError('Failed to fetch'))
        }
        return Promise.resolve({ data: { value: 0.5 }, error: null })
      })
      mockEq.mockReturnValue({
        eq: mockEq,
        single: mockSingle,
        maybeSingle: mockMaybeSingle,
        order: mockOrder,
      })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect, upsert: mockUpsert })

      const result = await service.get('ai', 'min_confidence', 0.7)

      expect(callCount).toBe(2)
      expect(result).toBe(0.5)
    })

    it('get() falls back to default after 3 consecutive thrown failures', async () => {
      let callCount = 0
      mockSingle.mockImplementation(() => {
        callCount += 1
        return Promise.reject(new TypeError('Failed to fetch'))
      })
      mockEq.mockReturnValue({
        eq: mockEq,
        single: mockSingle,
        maybeSingle: mockMaybeSingle,
        order: mockOrder,
      })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect, upsert: mockUpsert })

      const result = await service.get('ai', 'min_confidence', 0.42)

      expect(callCount).toBe(3) // exactly 3 attempts (initial + 2 retries)
      expect(result).toBe(0.42) // falls back to provided default
    })

    it('get() retries when SDK returns a transport error (no error.code)', async () => {
      // The Supabase SDK catches fetch() rejections and returns them as a
      // result with `error.message` set but NO `error.code`. This is the
      // production failure mode for CORS-blocked Cloudflare 503 preflights.
      let callCount = 0
      mockSingle.mockImplementation(() => {
        callCount += 1
        if (callCount === 1) {
          return Promise.resolve({
            data: null,
            error: { message: 'TypeError: Failed to fetch' }, // no `code`
          })
        }
        return Promise.resolve({ data: { value: 0.55 }, error: null })
      })
      mockEq.mockReturnValue({
        eq: mockEq,
        single: mockSingle,
        maybeSingle: mockMaybeSingle,
        order: mockOrder,
      })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect, upsert: mockUpsert })

      const result = await service.get('ai', 'min_confidence', 0.7)

      expect(callCount).toBe(2) // first attempt was a transport error → retry → success
      expect(result).toBe(0.55)
    })

    it('get() does NOT retry when SDK returns a clean error (e.g. RLS)', async () => {
      // SDK error responses (e.g. 401 RLS) are not transient — they shouldn't
      // benefit from retry and we don't want to delay the fallback.
      let callCount = 0
      mockSingle.mockImplementation(() => {
        callCount += 1
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST301', message: 'JWT expired' },
        })
      })
      mockEq.mockReturnValue({
        eq: mockEq,
        single: mockSingle,
        maybeSingle: mockMaybeSingle,
        order: mockOrder,
      })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect, upsert: mockUpsert })

      const result = await service.get('ai', 'min_confidence', 0.99)

      expect(callCount).toBe(1) // only one attempt, no retry
      expect(result).toBe(0.99) // falls back to provided default
    })

    it('getCategory() retries the order() query when it throws', async () => {
      let callCount = 0
      mockOrder.mockImplementation(() => {
        callCount += 1
        if (callCount === 1) {
          return Promise.reject(new TypeError('Failed to fetch'))
        }
        return Promise.resolve({
          data: [{ key: 'min_confidence', value: 0.6 }],
          error: null,
        })
      })
      mockEq.mockReturnValue({
        eq: mockEq,
        single: mockSingle,
        maybeSingle: mockMaybeSingle,
        order: mockOrder,
      })
      mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder })
      mockFrom.mockReturnValue({ select: mockSelect, upsert: mockUpsert })

      const result = await service.getCategory('ai')

      expect(callCount).toBe(2)
      expect(result).toEqual({ min_confidence: 0.6 })
    })
  })
})

// =========================================================================
// DEFAULT CONFIG VALUE VERIFICATION
// =========================================================================

describe('Default Configuration Values', () => {
  describe('DEFAULT_AI_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_AI_CONFIG).toHaveProperty('openaiExtractionModel')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('anthropicExtractionModel')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('maxTokens')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('temperature')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('enableFallback')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('preferredProvider')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('consensusFields')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('confidenceWeightPolicyNumber')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('confidenceWeightCoverages')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('warningConfidence')
    })

    it('should have confidence weights that sum to 1.0', () => {
      const sum =
        DEFAULT_AI_CONFIG.confidenceWeightPolicyNumber +
        DEFAULT_AI_CONFIG.confidenceWeightProvider +
        DEFAULT_AI_CONFIG.confidenceWeightDates +
        DEFAULT_AI_CONFIG.confidenceWeightPremium +
        DEFAULT_AI_CONFIG.confidenceWeightCoverages
      expect(sum).toBeCloseTo(1.0)
    })
  })

  describe('DEFAULT_EVALUATION_CONFIG', () => {
    it('should have all required weight fields', () => {
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightPremium')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightCoverage')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightDeductible')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightCompliance')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightValue')
    })

    it('should have all required threshold fields', () => {
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('gradeAThreshold')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('gradeBThreshold')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('gradeCThreshold')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('gradeDThreshold')
    })

    it('should have weights that sum to 100', () => {
      const total =
        DEFAULT_EVALUATION_CONFIG.weightPremium +
        DEFAULT_EVALUATION_CONFIG.weightCoverage +
        DEFAULT_EVALUATION_CONFIG.weightDeductible +
        DEFAULT_EVALUATION_CONFIG.weightCompliance +
        DEFAULT_EVALUATION_CONFIG.weightValue
      expect(total).toBe(100)
    })

    it('should have grade thresholds in descending order', () => {
      expect(DEFAULT_EVALUATION_CONFIG.gradeAThreshold).toBeGreaterThan(
        DEFAULT_EVALUATION_CONFIG.gradeBThreshold
      )
      expect(DEFAULT_EVALUATION_CONFIG.gradeBThreshold).toBeGreaterThan(
        DEFAULT_EVALUATION_CONFIG.gradeCThreshold
      )
      expect(DEFAULT_EVALUATION_CONFIG.gradeCThreshold).toBeGreaterThan(
        DEFAULT_EVALUATION_CONFIG.gradeDThreshold
      )
    })
  })

  describe('DEFAULT_RATE_LIMITS_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_RATE_LIMITS_CONFIG).toHaveProperty('generalWindowMs')
      expect(DEFAULT_RATE_LIMITS_CONFIG).toHaveProperty('generalMaxRequests')
      expect(DEFAULT_RATE_LIMITS_CONFIG).toHaveProperty('aiExtractionWindowMs')
      expect(DEFAULT_RATE_LIMITS_CONFIG).toHaveProperty('chatWindowMs')
      expect(DEFAULT_RATE_LIMITS_CONFIG).toHaveProperty('authWindowMs')
      expect(DEFAULT_RATE_LIMITS_CONFIG).toHaveProperty('authMaxAttempts')
    })

    it('should have positive window values', () => {
      expect(DEFAULT_RATE_LIMITS_CONFIG.generalWindowMs).toBeGreaterThan(0)
      expect(DEFAULT_RATE_LIMITS_CONFIG.aiExtractionWindowMs).toBeGreaterThan(0)
      expect(DEFAULT_RATE_LIMITS_CONFIG.healthWindowMs).toBeGreaterThan(0)
    })
  })

  describe('DEFAULT_OCR_CONFIG', () => {
    it('should have all required density fields', () => {
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('charsPerPageThreshold')
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('minPagesForAverage')
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('pageVarianceThreshold')
    })

    it('should have all required threshold fields', () => {
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('skipOcrThreshold')
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('selectiveOcrThreshold')
    })

    it('should have skipOcrThreshold > selectiveOcrThreshold', () => {
      expect(DEFAULT_OCR_CONFIG.skipOcrThreshold).toBeGreaterThan(
        DEFAULT_OCR_CONFIG.selectiveOcrThreshold
      )
    })

    it('should have confidence weights that sum to 1', () => {
      const total =
        DEFAULT_OCR_CONFIG.weightCharDensity +
        DEFAULT_OCR_CONFIG.weightTextQuality +
        DEFAULT_OCR_CONFIG.weightPageVariance +
        DEFAULT_OCR_CONFIG.weightEncodingCheck +
        DEFAULT_OCR_CONFIG.weightFieldExtraction
      expect(total).toBe(1)
    })
  })

  describe('DEFAULT_FUZZY_MATCHING_CONFIG', () => {
    it('should have all required threshold fields', () => {
      expect(DEFAULT_FUZZY_MATCHING_CONFIG).toHaveProperty('defaultThreshold')
      expect(DEFAULT_FUZZY_MATCHING_CONFIG).toHaveProperty('policyNumberThreshold')
      expect(DEFAULT_FUZZY_MATCHING_CONFIG).toHaveProperty('numericTolerancePercent')
    })

    it('should have thresholds between 0 and 1', () => {
      expect(DEFAULT_FUZZY_MATCHING_CONFIG.defaultThreshold).toBeGreaterThan(0)
      expect(DEFAULT_FUZZY_MATCHING_CONFIG.defaultThreshold).toBeLessThanOrEqual(1)
      expect(DEFAULT_FUZZY_MATCHING_CONFIG.numericTolerancePercent).toBeGreaterThan(0)
      expect(DEFAULT_FUZZY_MATCHING_CONFIG.numericTolerancePercent).toBeLessThanOrEqual(1)
    })
  })

  describe('DEFAULT_GAP_ANALYSIS_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_GAP_ANALYSIS_CONFIG).toHaveProperty('missingCoverageThreshold')
      expect(DEFAULT_GAP_ANALYSIS_CONFIG).toHaveProperty('criticalImportanceThreshold')
      expect(DEFAULT_GAP_ANALYSIS_CONFIG).toHaveProperty('penaltyCriticalMissing')
      expect(DEFAULT_GAP_ANALYSIS_CONFIG).toHaveProperty('maxGapScore')
    })

    it('should have critical > recommended importance thresholds', () => {
      expect(DEFAULT_GAP_ANALYSIS_CONFIG.criticalImportanceThreshold).toBeGreaterThan(
        DEFAULT_GAP_ANALYSIS_CONFIG.recommendedImportanceThreshold
      )
    })
  })

  describe('DEFAULT_UI_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_UI_CONFIG).toHaveProperty('toastSuccessDurationMs')
      expect(DEFAULT_UI_CONFIG).toHaveProperty('defaultItemsPerPage')
      expect(DEFAULT_UI_CONFIG).toHaveProperty('maxFileSizeMb')
      expect(DEFAULT_UI_CONFIG).toHaveProperty('allowedFileExtensions')
    })

    it('should include PDF in allowed extensions', () => {
      expect(DEFAULT_UI_CONFIG.allowedFileExtensions).toContain('.pdf')
    })
  })

  describe('DEFAULT_EMAIL_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_EMAIL_CONFIG).toHaveProperty('reminderDays')
      expect(DEFAULT_EMAIL_CONFIG).toHaveProperty('urgencyThresholdDays')
      expect(DEFAULT_EMAIL_CONFIG).toHaveProperty('defaultMarketingEnabled')
    })

    it('should have reminder days in descending order', () => {
      const days = DEFAULT_EMAIL_CONFIG.reminderDays
      for (let i = 0; i < days.length - 1; i++) {
        expect(days[i]).toBeGreaterThan(days[i + 1])
      }
    })
  })
})
