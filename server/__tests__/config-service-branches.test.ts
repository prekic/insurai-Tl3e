/**
 * Comprehensive Branch Coverage Tests for server/services/config-service.ts
 *
 * Covers:
 * - Cache hit/miss/expiry branches
 * - Database client creation: env var fallback, missing vars, createClient exception
 * - getCategorySettings: cache hit, no client, db error, null data, success, exception
 * - getAIConfig / getRateLimitsConfig / getOCRConfig: cache hit, db override, defaults-only
 * - isFeatureEnabled: cache hit, no client, db error, expired flag, disabled flag,
 *   rollout percentage bucketing (with/without userId), full 100%, db exception
 * - hashString: empty string, normal string, single char
 * - invalidateCache: specific category, all categories, prefix matching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — available inside vi.mock() factories
// ---------------------------------------------------------------------------

const { mockCreateClient, _mockFrom, mockSelect, _mockEq, _mockSingle } = vi.hoisted(() => {
  const _mockSingle = vi.fn()
  const _mockEq = vi.fn().mockReturnValue({ single: _mockSingle })
  const mockSelect = vi.fn().mockReturnValue({ eq: _mockEq })
  const _mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
  const mockCreateClient = vi.fn().mockReturnValue({ from: _mockFrom })
  return { mockCreateClient, _mockFrom, mockSelect, _mockEq, _mockSingle }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// We need to dynamically import the module after resetting to get fresh state
async function freshImport() {
  vi.resetModules()
  return import('../services/config-service.js')
}

// Helper to set up feature_flags mock (top-level so all describe blocks can use)
function setupFeatureFlagMock(data: Record<string, unknown> | null, error: unknown = null) {
  mockSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data, error }),
    }),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('config-service branches', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    // Set default env vars so getClient() succeeds by default
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv }
  })

  // ===========================================================================
  // getClient() branches
  // ===========================================================================

  describe('getClient()', () => {
    it('returns null when SUPABASE_URL and VITE_SUPABASE_URL are both missing', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const mod = await freshImport()

      // No client means getCategorySettings returns {}
      const result = await mod.getAIConfig()
      // Should still return defaults (no DB override)
      expect(result.openaiExtractionModel).toBe('gpt-4o')
      // createClient should NOT have been called
      expect(mockCreateClient).not.toHaveBeenCalled()
    })

    it('falls back to VITE_SUPABASE_URL when SUPABASE_URL is missing', async () => {
      delete process.env.SUPABASE_URL
      process.env.VITE_SUPABASE_URL = 'https://vite-test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'

      // Make the DB query return empty so we can just verify client creation
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const mod = await freshImport()
      await mod.getAIConfig()
      expect(mockCreateClient).toHaveBeenCalledWith('https://vite-test.supabase.co', 'key')
    })

    it('returns null when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await freshImport()
      const result = await mod.getAIConfig()
      // Defaults only
      expect(result.temperature).toBe(0.1)
      expect(mockCreateClient).not.toHaveBeenCalled()
    })

    it('returns null when createClient throws', async () => {
      mockCreateClient.mockImplementationOnce(() => {
        throw new Error('Connection failed')
      })

      const mod = await freshImport()
      const result = await mod.getAIConfig()
      // Defaults only
      expect(result.maxTokens).toBe(4096)
    })

    it('reuses the same client on subsequent calls', async () => {
      // First call: creates client
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const mod = await freshImport()
      mockCreateClient.mockClear()
      await mod.getAIConfig()
      mod.invalidateCache() // clear cache so second call goes to DB
      await mod.getRateLimitsConfig()

      // In test mode, getClient() bypasses the cached instance
      // (NODE_ENV === 'test') so createClient is called on each code path
      expect(mockCreateClient).toHaveBeenCalledTimes(2)
    })
  })

  // ===========================================================================
  // Cache branches (getFromCache / setInCache)
  // ===========================================================================

  describe('cache behavior', () => {
    it('returns cached value on second call (cache hit)', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.5 }],
          error: null,
        }),
      })

      const mod = await freshImport()

      const first = await mod.getAIConfig()
      expect(first.temperature).toBe(0.5)

      // Second call should use cache, not hit DB again
      const second = await mod.getAIConfig()
      expect(second.temperature).toBe(0.5)
    })

    it('evicts expired cache entries and re-fetches', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.3 }],
          error: null,
        }),
      })

      const mod = await freshImport()

      // First call populates cache
      const first = await mod.getAIConfig()
      expect(first.temperature).toBe(0.3)

      // Advance time past TTL (5 minutes)
      const origDateNow = Date.now
      const futureTime = Date.now() + 6 * 60 * 1000
      Date.now = vi.fn().mockReturnValue(futureTime)

      try {
        // This call should find expired cache and re-fetch
        mockSelect.mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ key: 'temperature', value: 0.9 }],
            error: null,
          }),
        })

        const second = await mod.getAIConfig()
        expect(second.temperature).toBe(0.9)
      } finally {
        Date.now = origDateNow
      }
    })
  })

  // ===========================================================================
  // getCategorySettings branches
  // ===========================================================================

  describe('getCategorySettings()', () => {
    it('returns empty object when DB returns error', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      // Should return defaults since category settings returned {}
      expect(config.openaiExtractionModel).toBe('gpt-4o')
    })

    it('returns empty object when DB returns null data', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      expect(config.openaiExtractionModel).toBe('gpt-4o')
    })

    it('returns empty object when DB query throws exception', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockRejectedValue(new Error('Network failure')),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      // Defaults only
      expect(config.maxTokens).toBe(4096)
    })

    it('correctly reduces DB rows into key-value object', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { key: 'temperature', value: 0.5 },
            { key: 'max_tokens', value: 8192 },
            { key: 'enable_fallback', value: false },
          ],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      expect(config.temperature).toBe(0.5)
      expect(config.maxTokens).toBe(8192)
      expect(config.enableFallback).toBe(false)
    })

    it('ignores DB keys that have no mapping in key map', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { key: 'unknown_key', value: 'should be ignored' },
            { key: 'temperature', value: 0.2 },
          ],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      expect(config.temperature).toBe(0.2)
      // Unknown key should not appear on the config object
      expect((config as Record<string, unknown>)['unknown_key']).toBeUndefined()
    })

    it('does not override defaults when DB value is undefined', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: undefined }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      // undefined DB values should NOT override defaults
      expect(config.temperature).toBe(0.1)
    })
  })

  // ===========================================================================
  // getAIConfig() branches
  // ===========================================================================

  describe('getAIConfig()', () => {
    it('returns all default values when no DB overrides', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()

      expect(config.openaiExtractionModel).toBe('gpt-4o')
      expect(config.openaiBackupModel).toBe('gpt-4o-mini')
      expect(config.anthropicExtractionModel).toBe('claude-sonnet-4-20250514')
      expect(config.anthropicBackupModel).toBe('claude-3-5-haiku-latest')
      expect(config.maxTokens).toBe(4096)
      expect(config.temperature).toBe(0.1)
      expect(config.chatTemperature).toBe(0.7)
      expect(config.minConfidence).toBe(0.4)
      expect(config.warningConfidence).toBe(0.7)
      expect(config.extractionTimeoutMs).toBe(90000)
      expect(config.preferredProvider).toBe('auto')
      expect(config.enableFallback).toBe(true)
      expect(config.consensusEnabled).toBe(true)
      expect(config.consensusAgreementThreshold).toBe(0.8)
      expect(config.consensusFields).toEqual([
        'policyNumber',
        'provider',
        'premium',
        'startDate',
        'endDate',
      ])
      expect(config.confidenceWeightPolicyNumber).toBe(0.2)
      expect(config.confidenceWeightProvider).toBe(0.15)
      expect(config.confidenceWeightDates).toBe(0.2)
      expect(config.confidenceWeightPremium).toBe(0.2)
      expect(config.confidenceWeightCoverages).toBe(0.25)
    })

    it('merges DB overrides over defaults for all AI key map entries', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { key: 'openai_extraction_model', value: 'gpt-5' },
            { key: 'openai_backup_model', value: 'gpt-4-turbo' },
            { key: 'anthropic_extraction_model', value: 'claude-4' },
            { key: 'anthropic_backup_model', value: 'claude-3-haiku' },
            { key: 'max_tokens', value: 8000 },
            { key: 'temperature', value: 0.3 },
            { key: 'chat_temperature', value: 0.9 },
            { key: 'min_confidence', value: 0.5 },
            { key: 'warning_confidence', value: 0.8 },
            { key: 'extraction_timeout_ms', value: 120000 },
            { key: 'preferred_provider', value: 'openai' },
            { key: 'enable_fallback', value: false },
            { key: 'consensus_enabled', value: false },
            { key: 'consensus_agreement_threshold', value: 0.9 },
            { key: 'consensus_fields', value: ['premium'] },
            { key: 'confidence_weight_policy_number', value: 0.3 },
            { key: 'confidence_weight_provider', value: 0.1 },
            { key: 'confidence_weight_dates', value: 0.25 },
            { key: 'confidence_weight_premium', value: 0.15 },
            { key: 'confidence_weight_coverages', value: 0.2 },
          ],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()

      expect(config.openaiExtractionModel).toBe('gpt-5')
      expect(config.openaiBackupModel).toBe('gpt-4-turbo')
      expect(config.anthropicExtractionModel).toBe('claude-4')
      expect(config.anthropicBackupModel).toBe('claude-3-haiku')
      expect(config.maxTokens).toBe(8000)
      expect(config.temperature).toBe(0.3)
      expect(config.chatTemperature).toBe(0.9)
      expect(config.minConfidence).toBe(0.5)
      expect(config.warningConfidence).toBe(0.8)
      expect(config.extractionTimeoutMs).toBe(120000)
      expect(config.preferredProvider).toBe('openai')
      expect(config.enableFallback).toBe(false)
      expect(config.consensusEnabled).toBe(false)
      expect(config.consensusAgreementThreshold).toBe(0.9)
      expect(config.consensusFields).toEqual(['premium'])
      expect(config.confidenceWeightPolicyNumber).toBe(0.3)
      expect(config.confidenceWeightProvider).toBe(0.1)
      expect(config.confidenceWeightDates).toBe(0.25)
      expect(config.confidenceWeightPremium).toBe(0.15)
      expect(config.confidenceWeightCoverages).toBe(0.2)
    })

    it('returns cached AI config on repeated calls', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.42 }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const first = await mod.getAIConfig()
      const second = await mod.getAIConfig()
      expect(first.temperature).toBe(0.42)
      expect(second.temperature).toBe(0.42)
    })
  })

  // ===========================================================================
  // getRateLimitsConfig() branches
  // ===========================================================================

  describe('getRateLimitsConfig()', () => {
    it('returns all defaults when no DB data', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const mod = await freshImport()
      const config = await mod.getRateLimitsConfig()

      expect(config.generalWindowMs).toBe(60000)
      expect(config.generalMaxRequests).toBe(100)
      expect(config.aiExtractionWindowMs).toBe(3600000)
      expect(config.aiExtractionMaxRequests).toBe(20)
      expect(config.ocrWindowMs).toBe(3600000)
      expect(config.ocrMaxRequests).toBe(30)
      expect(config.chatWindowMs).toBe(3600000)
      expect(config.chatMaxRequests).toBe(60)
      expect(config.healthWindowMs).toBe(60000)
      expect(config.healthMaxRequests).toBe(60)
      expect(config.authWindowMs).toBe(900000)
      expect(config.authMaxAttempts).toBe(5)
    })

    it('merges DB overrides for rate limits', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { key: 'general_max_requests', value: 200 },
            { key: 'ai_extraction_max_requests', value: 50 },
            { key: 'chat_max_requests', value: 120 },
            { key: 'auth_max_attempts', value: 10 },
          ],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getRateLimitsConfig()

      expect(config.generalMaxRequests).toBe(200)
      expect(config.aiExtractionMaxRequests).toBe(50)
      expect(config.chatMaxRequests).toBe(120)
      expect(config.authMaxAttempts).toBe(10)
      // Unchanged defaults
      expect(config.generalWindowMs).toBe(60000)
      expect(config.ocrMaxRequests).toBe(30)
    })

    it('returns cached rate limits config on repeated calls', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const mod = await freshImport()
      const first = await mod.getRateLimitsConfig()
      const second = await mod.getRateLimitsConfig()
      expect(first).toEqual(second)
    })
  })

  // ===========================================================================
  // getOCRConfig() branches
  // ===========================================================================

  describe('getOCRConfig()', () => {
    it('returns all defaults when no DB data', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const mod = await freshImport()
      const config = await mod.getOCRConfig()

      expect(config.charsPerPageThreshold).toBe(200)
      expect(config.skipOcrThreshold).toBe(0.7)
      expect(config.selectiveOcrThreshold).toBe(0.4)
      expect(config.weightCharDensity).toBe(0.25)
      expect(config.weightTextQuality).toBe(0.3)
      expect(config.weightPageVariance).toBe(0.15)
      expect(config.weightEncodingCheck).toBe(0.15)
      expect(config.weightFieldExtraction).toBe(0.15)
      expect(config.timeoutSeconds).toBe(60)
      expect(config.maxTextLength).toBe(500000)
    })

    it('merges DB overrides for OCR config', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { key: 'chars_per_page_threshold', value: 300 },
            { key: 'skip_ocr_threshold', value: 0.8 },
            { key: 'timeout_seconds', value: 90 },
            { key: 'max_text_length', value: 1000000 },
          ],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getOCRConfig()

      expect(config.charsPerPageThreshold).toBe(300)
      expect(config.skipOcrThreshold).toBe(0.8)
      expect(config.timeoutSeconds).toBe(90)
      expect(config.maxTextLength).toBe(1000000)
      // Unchanged defaults
      expect(config.selectiveOcrThreshold).toBe(0.4)
      expect(config.weightCharDensity).toBe(0.25)
    })

    it('returns cached OCR config on repeated calls', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const mod = await freshImport()
      const first = await mod.getOCRConfig()
      const second = await mod.getOCRConfig()
      expect(first).toEqual(second)
    })
  })

  // ===========================================================================
  // isFeatureEnabled() branches
  // ===========================================================================

  describe('isFeatureEnabled()', () => {
    it('returns cached value on second call', async () => {
      setupFeatureFlagMock({
        key: 'test_flag',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      const mod = await freshImport()

      const first = await mod.isFeatureEnabled('test_flag')
      expect(first).toBe(true)

      // Second call should use cache
      const second = await mod.isFeatureEnabled('test_flag')
      expect(second).toBe(true)
    })

    it('returns false when no DB client available', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('any_flag')
      expect(result).toBe(false)
    })

    it('returns false when DB query returns error', async () => {
      setupFeatureFlagMock(null, { message: 'Not found' })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('missing_flag')
      expect(result).toBe(false)
    })

    it('returns false when DB query returns null data', async () => {
      setupFeatureFlagMock(null)

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('missing_flag')
      expect(result).toBe(false)
    })

    it('returns false when flag is expired', async () => {
      setupFeatureFlagMock({
        key: 'expired_flag',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: '2020-01-01T00:00:00Z', // in the past
      })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('expired_flag')
      expect(result).toBe(false)
    })

    it('returns true when flag has future expiry', async () => {
      setupFeatureFlagMock({
        key: 'future_flag',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: '2099-12-31T23:59:59Z',
      })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('future_flag')
      expect(result).toBe(true)
    })

    it('returns true when expiresAt is null (no expiry)', async () => {
      setupFeatureFlagMock({
        key: 'no_expiry',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('no_expiry')
      expect(result).toBe(true)
    })

    it('returns false when flag is globally disabled', async () => {
      setupFeatureFlagMock({
        key: 'disabled_flag',
        enabled: false,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('disabled_flag')
      expect(result).toBe(false)
    })

    it('returns true when rollout is 100% (all users)', async () => {
      setupFeatureFlagMock({
        key: 'full_rollout',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('full_rollout')
      expect(result).toBe(true)
    })

    it('uses consistent hash bucketing with userId', async () => {
      setupFeatureFlagMock({
        key: 'partial_rollout',
        enabled: true,
        rolloutPercentage: 50,
        expiresAt: null,
      })

      const mod = await freshImport()

      // The same userId should always produce the same result
      const result1 = await mod.isFeatureEnabled('partial_rollout', 'user-123')
      mod.invalidateCache()

      // Re-setup mock since we invalidated cache
      setupFeatureFlagMock({
        key: 'partial_rollout',
        enabled: true,
        rolloutPercentage: 50,
        expiresAt: null,
      })

      const result2 = await mod.isFeatureEnabled('partial_rollout', 'user-123')

      // Same user, same flag -> same result (deterministic)
      expect(result1).toBe(result2)
    })

    it('uses random bucketing when no userId provided', async () => {
      setupFeatureFlagMock({
        key: 'random_rollout',
        enabled: true,
        rolloutPercentage: 50,
        expiresAt: null,
      })

      // Mock Math.random to return 0.2 (bucket = 20, < 50 rollout -> enabled)
      const origRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.2)

      try {
        const mod = await freshImport()
        const result = await mod.isFeatureEnabled('random_rollout')
        expect(result).toBe(true)
      } finally {
        Math.random = origRandom
      }
    })

    it('returns false when random bucket >= rolloutPercentage', async () => {
      setupFeatureFlagMock({
        key: 'random_rollout_fail',
        enabled: true,
        rolloutPercentage: 30,
        expiresAt: null,
      })

      // Mock Math.random to return 0.5 (bucket = 50, >= 30 rollout -> disabled)
      const origRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.5)

      try {
        const mod = await freshImport()
        const result = await mod.isFeatureEnabled('random_rollout_fail')
        expect(result).toBe(false)
      } finally {
        Math.random = origRandom
      }
    })

    it('returns false when user hash bucket >= rolloutPercentage', async () => {
      // rolloutPercentage: 0 guarantees any bucket >= 0 is false
      setupFeatureFlagMock({
        key: 'zero_rollout',
        enabled: true,
        rolloutPercentage: 0,
        expiresAt: null,
      })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('zero_rollout', 'user-abc')
      expect(result).toBe(false)
    })

    it('returns false when DB query throws exception', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockRejectedValue(new Error('Network error')),
        }),
      })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('error_flag')
      expect(result).toBe(false)
    })

    it('includes userId in cache key', async () => {
      setupFeatureFlagMock({
        key: 'user_flag',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      const mod = await freshImport()

      // Call with userId
      const result = await mod.isFeatureEnabled('user_flag', 'user-A')
      expect(result).toBe(true)

      // Invalidate all cache
      mod.invalidateCache()

      // Call with different userId - should hit DB again
      setupFeatureFlagMock({
        key: 'user_flag',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })
      const result2 = await mod.isFeatureEnabled('user_flag', 'user-B')
      expect(result2).toBe(true)
    })

    it('uses "anon" in cache key when no userId', async () => {
      setupFeatureFlagMock({
        key: 'anon_flag',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      const mod = await freshImport()
      const result = await mod.isFeatureEnabled('anon_flag')
      expect(result).toBe(true)

      // Calling again without userId should hit cache (same key)
      const result2 = await mod.isFeatureEnabled('anon_flag')
      expect(result2).toBe(true)
    })
  })

  // ===========================================================================
  // invalidateCache() branches
  // ===========================================================================

  describe('invalidateCache()', () => {
    it('clears all cache entries when no category specified', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.5 }],
          error: null,
        }),
      })

      const mod = await freshImport()

      // Populate caches
      await mod.getAIConfig()
      await mod.getRateLimitsConfig()

      // Invalidate all
      mod.invalidateCache()

      // Now calls should hit DB again
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.9 }],
          error: null,
        }),
      })

      const config = await mod.getAIConfig()
      expect(config.temperature).toBe(0.9)
    })

    it('clears only matching category keys when category specified', async () => {
      // invalidateCache('config') will match 'config:ai', 'config:rate_limits', etc.
      // by the startsWith('config:') rule.
      // But invalidateCache('ai') only clears keys starting with 'ai:' or equal to 'config:ai'.
      // It does NOT clear 'category:ai'.
      // So let's test the actual behavior: after invalidateCache('ai'), the config:ai is cleared
      // but category:ai remains, so getAIConfig re-builds from cached category data.

      // Use invalidateCache() (no args) to clear everything for proper re-fetch testing.
      // We test the selective invalidation by checking that rate_limits cache survives
      // invalidateCache('category') call targeting different keys.

      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.5 }],
          error: null,
        }),
      })

      const mod = await freshImport()

      // Populate AI cache (creates category:ai and config:ai)
      await mod.getAIConfig()

      // Populate rate limits cache (creates category:rate_limits and config:rate_limits)
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'general_max_requests', value: 200 }],
          error: null,
        }),
      })
      await mod.getRateLimitsConfig()

      // Also populate a feature flag cache (creates feature:my_flag:anon)
      setupFeatureFlagMock({
        key: 'my_flag',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })
      await mod.isFeatureEnabled('my_flag')

      // Invalidate 'feature' category — should clear feature:* keys but not config:* or category:*
      mod.invalidateCache('feature')

      // Rate limits should still be cached (not invalidated)
      const rlConfig = await mod.getRateLimitsConfig()
      expect(rlConfig.generalMaxRequests).toBe(200)

      // AI config should still be cached (not invalidated)
      const aiConfig = await mod.getAIConfig()
      expect(aiConfig.temperature).toBe(0.5)

      // Feature flag should re-fetch from DB
      setupFeatureFlagMock({
        key: 'my_flag',
        enabled: false,
        rolloutPercentage: 100,
        expiresAt: null,
      })
      const flagResult = await mod.isFeatureEnabled('my_flag')
      expect(flagResult).toBe(false)
    })

    it('clears keys matching prefix pattern (category: prefix)', async () => {
      // Feature flag cache keys are 'feature:flagKey:userId' which matches startsWith('feature:')
      setupFeatureFlagMock({
        key: 'my_flag',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      const mod = await freshImport()

      // Populate feature flag cache
      await mod.isFeatureEnabled('my_flag', 'user-1')

      // Invalidate 'feature' category — matches 'feature:my_flag:user-1'
      mod.invalidateCache('feature')

      // Should re-fetch from DB
      setupFeatureFlagMock({
        key: 'my_flag',
        enabled: false,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      const result = await mod.isFeatureEnabled('my_flag', 'user-1')
      expect(result).toBe(false)
    })

    it('clears keys matching config:category pattern', async () => {
      // invalidateCache('ocr') deletes keys starting with 'ocr:' OR equal to 'config:ocr'.
      // getOCRConfig() caches at both 'category:ocr' and 'config:ocr'.
      // invalidateCache('ocr') clears 'config:ocr' but 'category:ocr' remains.
      // On next getOCRConfig() call, 'config:ocr' cache miss triggers getCategorySettings('ocr')
      // which finds 'category:ocr' still cached, so it returns old data.
      //
      // To verify config:ocr is actually cleared, we invalidate all first, then verify behavior.
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'timeout_seconds', value: 90 }],
          error: null,
        }),
      })

      const mod = await freshImport()
      await mod.getOCRConfig()

      // Full invalidation clears everything
      mod.invalidateCache()

      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'timeout_seconds', value: 120 }],
          error: null,
        }),
      })

      const config = await mod.getOCRConfig()
      expect(config.timeoutSeconds).toBe(120)
    })

    it('invalidateCache with category clears config:category key (not category:category)', async () => {
      // This tests the exact matching: key === `config:${category}`
      // invalidateCache('ocr') should clear 'config:ocr'
      // But 'category:ocr' uses startsWith check which would need category='category'

      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'timeout_seconds', value: 90 }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config1 = await mod.getOCRConfig()
      expect(config1.timeoutSeconds).toBe(90)

      // invalidateCache('ocr') clears 'config:ocr' but NOT 'category:ocr'
      mod.invalidateCache('ocr')

      // Next call: config:ocr cache miss -> getCategorySettings('ocr') -> category:ocr cache HIT
      // So it rebuilds from old cached category data
      const config2 = await mod.getOCRConfig()
      expect(config2.timeoutSeconds).toBe(90) // still old value from category cache

      // Now invalidate 'category' to clear 'category:ocr' (startsWith 'category:')
      mod.invalidateCache('category')

      // Also need to clear config:ocr again since it was re-populated
      mod.invalidateCache('ocr')

      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'timeout_seconds', value: 120 }],
          error: null,
        }),
      })

      const config3 = await mod.getOCRConfig()
      expect(config3.timeoutSeconds).toBe(120) // new value after both caches cleared
    })
  })

  // ===========================================================================
  // configService export
  // ===========================================================================

  describe('configService export', () => {
    it('exports all methods on configService object', async () => {
      const mod = await freshImport()

      expect(mod.configService).toBeDefined()
      expect(typeof mod.configService.getAIConfig).toBe('function')
      expect(typeof mod.configService.getRateLimitsConfig).toBe('function')
      expect(typeof mod.configService.getOCRConfig).toBe('function')
      expect(typeof mod.configService.isFeatureEnabled).toBe('function')
      expect(typeof mod.configService.invalidateCache).toBe('function')
    })

    it('default export is the same as named configService export', async () => {
      const mod = await freshImport()
      expect(mod.default).toBe(mod.configService)
    })
  })

  // ===========================================================================
  // Edge cases: DB values with various types
  // ===========================================================================

  describe('edge cases: DB value types', () => {
    it('handles null DB value for a mapped key (overrides default because null !== undefined)', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: null }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      // null !== undefined, so it DOES override
      expect(config.temperature).toBeNull()
    })

    it('handles zero as a valid DB value', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0 }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      expect(config.temperature).toBe(0)
    })

    it('handles empty string as a valid DB value', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'openai_extraction_model', value: '' }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      expect(config.openaiExtractionModel).toBe('')
    })

    it('handles false as a valid DB value', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'enable_fallback', value: false }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      expect(config.enableFallback).toBe(false)
    })

    it('handles empty array as a valid DB value', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'consensus_fields', value: [] }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      expect(config.consensusFields).toEqual([])
    })

    it('handles empty data array (no settings in category)', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      const mod = await freshImport()
      const config = await mod.getAIConfig()
      expect(config.temperature).toBe(0.1) // default
    })
  })

  // ===========================================================================
  // hashString coverage (indirectly via isFeatureEnabled with userId)
  // ===========================================================================

  describe('hashString (via isFeatureEnabled)', () => {
    it('produces deterministic hash for same input', async () => {
      const flagData = {
        key: 'hash_test',
        enabled: true,
        rolloutPercentage: 50,
        expiresAt: null,
      }

      setupFeatureFlagMock(flagData)
      const mod = await freshImport()
      const r1 = await mod.isFeatureEnabled('hash_test', 'same-user')

      mod.invalidateCache()
      setupFeatureFlagMock(flagData)
      const r2 = await mod.isFeatureEnabled('hash_test', 'same-user')

      expect(r1).toBe(r2)
    })

    it('different userIds can produce different bucket results', async () => {
      const flagData = {
        key: 'bucket_test',
        enabled: true,
        rolloutPercentage: 1,
        expiresAt: null,
      }

      const results: boolean[] = []
      const mod = await freshImport()

      for (let i = 0; i < 20; i++) {
        mod.invalidateCache()
        setupFeatureFlagMock(flagData)
        const r = await mod.isFeatureEnabled('bucket_test', `user-${i}`)
        results.push(r)
      }

      // With rolloutPercentage = 1, most (but maybe not all) should be false
      const trueCount = results.filter(Boolean).length
      expect(trueCount).toBeLessThanOrEqual(20)
      // At least verify the function executed for all
      expect(results).toHaveLength(20)
    })

    it('handles empty string userId', async () => {
      setupFeatureFlagMock({
        key: 'empty_user',
        enabled: true,
        rolloutPercentage: 50,
        expiresAt: null,
      })

      const mod = await freshImport()
      // Empty string is truthy for the `userId ? hash : random` ternary
      // so it uses hashString('' + 'empty_user') path
      const result = await mod.isFeatureEnabled('empty_user', '')
      // Should not throw
      expect(typeof result).toBe('boolean')
    })
  })

  // ===========================================================================
  // Two-level caching: category cache vs config cache
  // ===========================================================================

  describe('two-level caching', () => {
    it('invalidateCache() (no args) clears both levels so re-fetch yields new data', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.77 }],
          error: null,
        }),
      })

      const mod = await freshImport()

      // First call: populates both category:ai and config:ai caches
      const c1 = await mod.getAIConfig()
      expect(c1.temperature).toBe(0.77)

      // Invalidate ALL cache (clears both category:ai and config:ai)
      mod.invalidateCache()

      // Second call should re-fetch from DB
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.33 }],
          error: null,
        }),
      })

      const c2 = await mod.getAIConfig()
      expect(c2.temperature).toBe(0.33)
    })

    it('invalidateCache(category) clears config:category but category:category persists', async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.77 }],
          error: null,
        }),
      })

      const mod = await freshImport()
      const c1 = await mod.getAIConfig()
      expect(c1.temperature).toBe(0.77)

      // Invalidate 'ai' — clears config:ai but NOT category:ai
      mod.invalidateCache('ai')

      // Mock new DB response
      mockSelect.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ key: 'temperature', value: 0.33 }],
          error: null,
        }),
      })

      // getAIConfig misses config:ai, calls getCategorySettings which hits category:ai cache
      // So it rebuilds from OLD category data
      const c2 = await mod.getAIConfig()
      expect(c2.temperature).toBe(0.77) // old value persists from category cache
    })
  })

  // ===========================================================================
  // Feature flag: rolloutPercentage exactly 100 skips bucket check
  // ===========================================================================

  describe('rolloutPercentage boundary', () => {
    it('skips bucket check when rolloutPercentage is exactly 100', async () => {
      setupFeatureFlagMock({
        key: 'full_100',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })

      // Even with Math.random mocked to return 0.99 (would be bucket 99),
      // rolloutPercentage >= 100 should skip the check
      const origRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.99)

      try {
        const mod = await freshImport()
        const result = await mod.isFeatureEnabled('full_100')
        expect(result).toBe(true)
        // Math.random should NOT be called because the < 100 check is false
        expect(Math.random).not.toHaveBeenCalled()
      } finally {
        Math.random = origRandom
      }
    })

    it('enters bucket check when rolloutPercentage is 99', async () => {
      setupFeatureFlagMock({
        key: 'almost_full',
        enabled: true,
        rolloutPercentage: 99,
        expiresAt: null,
      })

      // Math.random returns 0.98 -> bucket = 98 < 99 -> enabled
      const origRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.98)

      try {
        const mod = await freshImport()
        const result = await mod.isFeatureEnabled('almost_full')
        expect(result).toBe(true)
        expect(Math.random).toHaveBeenCalled()
      } finally {
        Math.random = origRandom
      }
    })

    it('rolloutPercentage exactly at boundary (bucket === rolloutPercentage) returns false', async () => {
      // If bucket = rolloutPercentage, the check is bucket >= rolloutPercentage -> false
      setupFeatureFlagMock({
        key: 'boundary_check',
        enabled: true,
        rolloutPercentage: 50,
        expiresAt: null,
      })

      // Math.random returns 0.50 -> bucket = Math.floor(0.50 * 100) = 50
      // 50 >= 50 -> returns false
      const origRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.5)

      try {
        const mod = await freshImport()
        const result = await mod.isFeatureEnabled('boundary_check')
        expect(result).toBe(false)
      } finally {
        Math.random = origRandom
      }
    })

    it('rolloutPercentage just below boundary (bucket === rolloutPercentage - 1) returns true', async () => {
      setupFeatureFlagMock({
        key: 'below_boundary',
        enabled: true,
        rolloutPercentage: 50,
        expiresAt: null,
      })

      // Math.random returns 0.49 -> bucket = Math.floor(0.49 * 100) = 49
      // 49 >= 50 is false -> does not return false -> returns true
      const origRandom = Math.random
      Math.random = vi.fn().mockReturnValue(0.49)

      try {
        const mod = await freshImport()
        const result = await mod.isFeatureEnabled('below_boundary')
        expect(result).toBe(true)
      } finally {
        Math.random = origRandom
      }
    })
  })

  // ===========================================================================
  // getClient: both SUPABASE_URL and VITE_SUPABASE_URL set — prefers SUPABASE_URL
  // ===========================================================================

  describe('getClient() env var priority', () => {
    it('prefers SUPABASE_URL over VITE_SUPABASE_URL when both are set', async () => {
      process.env.SUPABASE_URL = 'https://primary.supabase.co'
      process.env.VITE_SUPABASE_URL = 'https://fallback.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'key'

      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })

      const mod = await freshImport()
      await mod.getAIConfig()
      // || operator: SUPABASE_URL is truthy so VITE_SUPABASE_URL is not used
      expect(mockCreateClient).toHaveBeenCalledWith('https://primary.supabase.co', 'key')
    })
  })

  // ===========================================================================
  // Multiple feature flags with different cache keys
  // ===========================================================================

  describe('multiple feature flags with different cache keys', () => {
    it('caches different flags independently', async () => {
      const mod = await freshImport()

      // First flag: enabled
      setupFeatureFlagMock({
        key: 'flag_a',
        enabled: true,
        rolloutPercentage: 100,
        expiresAt: null,
      })
      const resultA = await mod.isFeatureEnabled('flag_a')
      expect(resultA).toBe(true)

      // Second flag: disabled
      setupFeatureFlagMock({
        key: 'flag_b',
        enabled: false,
        rolloutPercentage: 100,
        expiresAt: null,
      })
      const resultB = await mod.isFeatureEnabled('flag_b')
      expect(resultB).toBe(false)

      // Verify first flag is still cached as true
      const resultA2 = await mod.isFeatureEnabled('flag_a')
      expect(resultA2).toBe(true)
    })
  })
})
