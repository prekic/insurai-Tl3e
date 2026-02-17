/**
 * Comprehensive tests for src/lib/ai/providers/openai.ts
 *
 * Covers all branches: proxy vs direct API, caching, rate limiting,
 * document truncation, default field injection, error handling,
 * cost tracking, audit logging, and user ID detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────
const {
  mockConsume,
  mockLogAI,
  mockTimedComplete,
  mockTimedFail,
  mockCreateTimedAudit,
  mockCacheInitialize,
  mockCostInitialize,
  mockGetExtraction,
  mockSetExtraction,
  mockRecordUsage,
  mockEstimateTokens,
  mockIsProxyConfigured,
  mockExtractViaProxy,
  mockGetOpenAIClient,
  mockChatCreate,
} = vi.hoisted(() => ({
  mockConsume: vi.fn(),
  mockLogAI: vi.fn(),
  mockTimedComplete: vi.fn().mockResolvedValue(undefined),
  mockTimedFail: vi.fn().mockResolvedValue(undefined),
  mockCreateTimedAudit: vi.fn(),
  mockCacheInitialize: vi.fn().mockResolvedValue(undefined),
  mockCostInitialize: vi.fn().mockResolvedValue(undefined),
  mockGetExtraction: vi.fn(),
  mockSetExtraction: vi.fn().mockResolvedValue(undefined),
  mockRecordUsage: vi.fn().mockResolvedValue(undefined),
  mockEstimateTokens: vi.fn().mockReturnValue(100),
  mockIsProxyConfigured: vi.fn().mockReturnValue(false),
  mockExtractViaProxy: vi.fn(),
  mockGetOpenAIClient: vi.fn(),
  mockChatCreate: vi.fn(),
}))

// ── Module mocks ───────────────────────────────────────────────────
vi.mock('./config', () => ({
  getOpenAIClient: (...args: unknown[]) => mockGetOpenAIClient(...args),
  AI_CONFIG: {
    openai: { extractionModel: 'gpt-4o' },
    maxTokens: 4096,
    temperature: 0.1,
  },
  isProxyConfigured: (...args: unknown[]) => mockIsProxyConfigured(...args),
  extractViaProxy: (...args: unknown[]) => mockExtractViaProxy(...args),
}))

vi.mock('./extraction-schema', () => ({
  EXTRACTION_SYSTEM_PROMPT: 'Test system prompt',
  EXTRACTION_JSON_SCHEMA: { name: 'test_schema', schema: {} },
}))

vi.mock('./cache', () => ({
  aiCache: {
    initialize: (...args: unknown[]) => mockCacheInitialize(...args),
    getExtraction: (...args: unknown[]) => mockGetExtraction(...args),
    setExtraction: (...args: unknown[]) => mockSetExtraction(...args),
  },
}))

vi.mock('./cost-tracking', () => ({
  costTracker: {
    initialize: (...args: unknown[]) => mockCostInitialize(...args),
    recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
  },
  estimateTokens: (...args: unknown[]) => mockEstimateTokens(...args),
}))

vi.mock('@/lib/security', () => ({
  rateLimiter: {
    consume: (...args: unknown[]) => mockConsume(...args),
  },
  auditLogger: {
    logAI: (...args: unknown[]) => mockLogAI(...args),
  },
  createTimedAudit: (...args: unknown[]) => {
    mockCreateTimedAudit(...args)
    return {
      complete: mockTimedComplete,
      fail: mockTimedFail,
    }
  },
}))

// ── Storage mocks ──────────────────────────────────────────────────
// Use a simple object backing store; getItem reads from it.
let localStore: Record<string, string> = {}
let sessionStore: Record<string, string> = {}

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => localStore[key] ?? null,
    setItem: (key: string, value: string) => { localStore[key] = value },
    removeItem: (key: string) => { delete localStore[key] },
    clear: () => { localStore = {} },
  },
  writable: true,
  configurable: true,
})

Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: (key: string) => sessionStore[key] ?? null,
    setItem: (key: string, value: string) => { sessionStore[key] = value },
    removeItem: (key: string) => { delete sessionStore[key] },
    clear: () => { sessionStore = {} },
  },
  writable: true,
  configurable: true,
})

// ── Import after mocks ─────────────────────────────────────────────
import { extractWithOpenAI } from './providers/openai'

// ── Helpers ────────────────────────────────────────────────────────

/** Full valid response mimicking what GPT-4 returns */
function makeFullResponse(overrides: Record<string, unknown> = {}) {
  return {
    policyNumber: 'POL-123',
    provider: 'Allianz',
    policyType: 'kasko',
    insuredName: 'Test User',
    insuredAddress: 'Istanbul',
    startDate: '2025-01-01',
    endDate: '2026-01-01',
    premium: 5000,
    currency: 'TRY',
    paymentFrequency: 'annual',
    coverages: [{ name: 'Collision', limit: 100000, deductible: 1000, description: null }],
    specialConditions: ['No off-road driving'],
    exclusions: ['Intentional damage'],
    amendmentInfo: {
      isAmendment: false,
      amendmentNumber: null,
      amendmentDate: null,
      basePolicyNumber: null,
      amendmentReason: null,
      premiumDifference: null,
    },
    confidence: {
      overall: 0.92,
      policyNumber: 0.95,
      provider: 0.9,
      dates: 0.88,
      premium: 0.91,
      coverages: 0.85,
    },
    ...overrides,
  }
}

/** Setup the direct OpenAI client mock to return a given response */
function setupDirectClient(
  content: string,
  usage?: { prompt_tokens: number; completion_tokens: number } | undefined
) {
  mockChatCreate.mockResolvedValue({
    choices: [{ message: { content } }],
    ...(usage !== undefined ? { usage } : { usage: { prompt_tokens: 200, completion_tokens: 150 } }),
  })
  mockGetOpenAIClient.mockResolvedValue({
    chat: { completions: { create: mockChatCreate } },
  })
}

/** Reset all mocks to standard defaults for a "happy path direct API" test */
function resetDefaults() {
  vi.clearAllMocks()
  // Rate limit: allowed
  mockConsume.mockReturnValue({ allowed: true })
  // Cache: miss
  mockGetExtraction.mockResolvedValue(null)
  // Initialize: success
  mockCacheInitialize.mockResolvedValue(undefined)
  mockCostInitialize.mockResolvedValue(undefined)
  // Set extraction: success
  mockSetExtraction.mockResolvedValue(undefined)
  // Record usage: success
  mockRecordUsage.mockResolvedValue(undefined)
  // Estimate tokens: 100
  mockEstimateTokens.mockReturnValue(100)
  // Proxy: disabled
  mockIsProxyConfigured.mockReturnValue(false)
  // Timed audit helpers
  mockTimedComplete.mockResolvedValue(undefined)
  mockTimedFail.mockResolvedValue(undefined)
  // Default direct client with full response
  setupDirectClient(JSON.stringify(makeFullResponse()))
  // Clear storage
  localStore = {}
  sessionStore = {}
}

// ── Test suites ────────────────────────────────────────────────────

describe('extractWithOpenAI', () => {
  beforeEach(() => {
    resetDefaults()
  })

  // ─── getCurrentUserId branches ─────────────────────────────────

  describe('getCurrentUserId', () => {
    it('should use localStorage user ID when available', async () => {
      localStore['insurai_user_id'] = 'user-abc'
      await extractWithOpenAI('doc text')
      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', 'user-abc')
    })

    it('should fall back to sessionStorage session_id when no localStorage user', async () => {
      sessionStore['session_id'] = 'sess-xyz'
      await extractWithOpenAI('doc text')
      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', 'anonymous_sess-xyz')
    })

    it('should use "unknown" when both localStorage user and sessionStorage are empty', async () => {
      await extractWithOpenAI('doc text')
      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', 'anonymous_unknown')
    })

    it('should prefer localStorage userId over sessionStorage', async () => {
      localStore['insurai_user_id'] = 'user-123'
      sessionStore['session_id'] = 'sess-456'
      await extractWithOpenAI('doc text')
      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', 'user-123')
    })
  })

  // ─── Rate Limiting ─────────────────────────────────────────────

  describe('Rate Limiting', () => {
    it('should allow extraction when rate limit is not exceeded', async () => {
      const result = await extractWithOpenAI('test doc')
      expect(result).toBeDefined()
      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', expect.any(String))
    })

    it('should throw when rate limit is exceeded', async () => {
      mockConsume.mockReturnValue({ allowed: false })
      await expect(extractWithOpenAI('test doc')).rejects.toThrow(
        'AI extraction rate limit exceeded'
      )
    })

    it('should log audit event when rate limited', async () => {
      mockConsume.mockReturnValue({ allowed: false })
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockLogAI).toHaveBeenCalledWith(
        'ai.extraction_failed',
        expect.objectContaining({ provider: 'openai', documentLength: 3 }),
        expect.objectContaining({ success: false, errorMessage: 'Rate limit exceeded' })
      )
    })

    it('should not initialize cache or cost tracker when rate limited', async () => {
      mockConsume.mockReturnValue({ allowed: false })
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockCacheInitialize).not.toHaveBeenCalled()
      expect(mockCostInitialize).not.toHaveBeenCalled()
    })
  })

  // ─── Initialization ────────────────────────────────────────────

  describe('Initialization', () => {
    it('should initialize cache and cost tracker in parallel', async () => {
      await extractWithOpenAI('doc')
      expect(mockCacheInitialize).toHaveBeenCalledTimes(1)
      expect(mockCostInitialize).toHaveBeenCalledTimes(1)
    })

    it('should create a timed audit with provider and document length', async () => {
      await extractWithOpenAI('hello world')
      expect(mockCreateTimedAudit).toHaveBeenCalledWith(
        'ai.extraction_started',
        { provider: 'openai', documentLength: 11 },
        expect.objectContaining({ userId: expect.any(String) })
      )
    })
  })

  // ─── Document Truncation ───────────────────────────────────────

  describe('Document Truncation', () => {
    it('should not truncate documents <= 30000 chars', async () => {
      const doc = 'x'.repeat(30000)
      await extractWithOpenAI(doc)
      // Cache lookup uses the non-truncated doc
      expect(mockGetExtraction).toHaveBeenCalledWith(doc, 'openai')
    })

    it('should truncate documents > 30000 chars and append marker', async () => {
      const doc = 'a'.repeat(35000)
      await extractWithOpenAI(doc)
      const expectedTruncated = 'a'.repeat(30000) + '\n\n[Document truncated...]'
      expect(mockGetExtraction).toHaveBeenCalledWith(expectedTruncated, 'openai')
    })

    it('should use truncated text for estimateTokens', async () => {
      const doc = 'b'.repeat(35000)
      await extractWithOpenAI(doc)
      // estimateTokens is called with system prompt + user message (which uses truncated text)
      const firstCallArg = mockEstimateTokens.mock.calls[0][0] as string
      expect(firstCallArg).toContain('[Document truncated...]')
      expect(firstCallArg.length).toBeLessThan(35000 + 200)
    })
  })

  // ─── Caching ───────────────────────────────────────────────────

  describe('Caching', () => {
    it('should return cached result when cache hit occurs', async () => {
      const cached = makeFullResponse({ policyNumber: 'CACHED-999' })
      mockGetExtraction.mockResolvedValue(cached)
      const result = await extractWithOpenAI('doc')
      expect(result.policyNumber).toBe('CACHED-999')
    })

    it('should record cost with cacheHit=true on cache hit', async () => {
      mockGetExtraction.mockResolvedValue(makeFullResponse())
      await extractWithOpenAI('doc')
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheHit: true,
          outputTokens: 0,
          provider: 'openai',
          operation: 'extraction',
          success: true,
        })
      )
    })

    it('should log audit with cacheHit=true on cache hit', async () => {
      const cached = makeFullResponse()
      mockGetExtraction.mockResolvedValue(cached)
      await extractWithOpenAI('doc')
      expect(mockLogAI).toHaveBeenCalledWith(
        'ai.extraction_cached',
        expect.objectContaining({ cacheHit: true, confidence: 0.92 }),
        expect.objectContaining({ success: true })
      )
    })

    it('should use 0.7 fallback when cached result has no confidence.overall', async () => {
      const cached = makeFullResponse()
      // Remove confidence entirely
      delete (cached as Record<string, unknown>).confidence
      mockGetExtraction.mockResolvedValue(cached)
      await extractWithOpenAI('doc')
      expect(mockLogAI).toHaveBeenCalledWith(
        'ai.extraction_cached',
        expect.objectContaining({ confidence: 0.7 }),
        expect.any(Object)
      )
    })

    it('should not call OpenAI API or proxy on cache hit', async () => {
      mockGetExtraction.mockResolvedValue(makeFullResponse())
      await extractWithOpenAI('doc')
      expect(mockGetOpenAIClient).not.toHaveBeenCalled()
      expect(mockExtractViaProxy).not.toHaveBeenCalled()
    })

    it('should cache successful extraction results', async () => {
      await extractWithOpenAI('doc')
      expect(mockSetExtraction).toHaveBeenCalledWith(
        'doc',
        'openai',
        expect.objectContaining({ policyNumber: 'POL-123' })
      )
    })
  })

  // ─── Direct API Path ──────────────────────────────────────────

  describe('Direct API Path (no proxy)', () => {
    it('should call getOpenAIClient when proxy is not configured', async () => {
      await extractWithOpenAI('doc')
      expect(mockGetOpenAIClient).toHaveBeenCalled()
    })

    it('should call chat.completions.create with correct params', async () => {
      await extractWithOpenAI('my policy doc')
      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          max_tokens: 4096,
          temperature: 0.1,
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system', content: 'Test system prompt' }),
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('my policy doc'),
            }),
          ]),
          response_format: expect.objectContaining({
            type: 'json_schema',
          }),
        })
      )
    })

    it('should parse JSON content from response', async () => {
      const result = await extractWithOpenAI('doc')
      expect(result.policyNumber).toBe('POL-123')
      expect(result.provider).toBe('Allianz')
    })

    it('should throw when getOpenAIClient returns null', async () => {
      mockGetOpenAIClient.mockResolvedValue(null)
      await expect(extractWithOpenAI('doc')).rejects.toThrow('OpenAI client not available')
    })

    it('should throw when response content is null', async () => {
      setupDirectClient(null as unknown as string)
      // The mock returns { choices: [{ message: { content: null } }] }
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      })
      await expect(extractWithOpenAI('doc')).rejects.toThrow('No response from OpenAI model')
    })

    it('should throw when response content is empty string', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      })
      await expect(extractWithOpenAI('doc')).rejects.toThrow('No response from OpenAI model')
    })

    it('should throw when choices array is empty', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [],
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      })
      await expect(extractWithOpenAI('doc')).rejects.toThrow('No response from OpenAI model')
    })

    it('should throw on invalid JSON in response', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'NOT VALID JSON {{{' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      })
      await expect(extractWithOpenAI('doc')).rejects.toThrow()
    })

    it('should use actual token counts from response.usage when available', async () => {
      setupDirectClient(JSON.stringify(makeFullResponse()), {
        prompt_tokens: 500,
        completion_tokens: 300,
      })
      await extractWithOpenAI('doc')
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 500,
          outputTokens: 300,
          cacheHit: false,
          success: true,
        })
      )
    })

    it('should estimate output tokens when response.usage is undefined', async () => {
      const fullResp = makeFullResponse()
      const contentStr = JSON.stringify(fullResp)
      mockChatCreate.mockResolvedValue({
        choices: [{ message: { content: contentStr } }],
        // No usage field at all
      })
      mockGetOpenAIClient.mockResolvedValue({
        chat: { completions: { create: mockChatCreate } },
      })
      mockEstimateTokens.mockReturnValue(42)
      await extractWithOpenAI('doc')
      // estimateTokens is called twice:
      // 1) for input tokens (system_prompt + userMessage)
      // 2) for output tokens (the raw content string)
      const calls = mockEstimateTokens.mock.calls
      expect(calls.length).toBeGreaterThanOrEqual(2)
      expect(calls[1][0]).toBe(contentStr)
    })

    describe('Default field injection (direct path)', () => {
      it('should add default confidence when missing', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).confidence
        setupDirectClient(JSON.stringify(resp))
        const result = await extractWithOpenAI('doc')
        expect(result.confidence).toEqual({
          overall: 0.7,
          policyNumber: 0.7,
          provider: 0.7,
          dates: 0.7,
          premium: 0.7,
          coverages: 0.7,
        })
      })

      it('should add empty coverages array when missing', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).coverages
        setupDirectClient(JSON.stringify(resp))
        const result = await extractWithOpenAI('doc')
        expect(result.coverages).toEqual([])
      })

      it('should add empty coverages array when coverages is not an array', async () => {
        setupDirectClient(JSON.stringify(makeFullResponse({ coverages: 'invalid' })))
        const result = await extractWithOpenAI('doc')
        expect(result.coverages).toEqual([])
      })

      it('should add empty specialConditions when missing', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).specialConditions
        setupDirectClient(JSON.stringify(resp))
        const result = await extractWithOpenAI('doc')
        expect(result.specialConditions).toEqual([])
      })

      it('should add empty specialConditions when not an array', async () => {
        setupDirectClient(JSON.stringify(makeFullResponse({ specialConditions: 'oops' })))
        const result = await extractWithOpenAI('doc')
        expect(result.specialConditions).toEqual([])
      })

      it('should add empty exclusions when missing', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).exclusions
        setupDirectClient(JSON.stringify(resp))
        const result = await extractWithOpenAI('doc')
        expect(result.exclusions).toEqual([])
      })

      it('should add empty exclusions when not an array', async () => {
        setupDirectClient(JSON.stringify(makeFullResponse({ exclusions: 42 })))
        const result = await extractWithOpenAI('doc')
        expect(result.exclusions).toEqual([])
      })

      it('should add default amendmentInfo when missing', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).amendmentInfo
        setupDirectClient(JSON.stringify(resp))
        const result = await extractWithOpenAI('doc')
        expect(result.amendmentInfo).toEqual({
          isAmendment: false,
          amendmentNumber: null,
          amendmentDate: null,
          basePolicyNumber: null,
          amendmentReason: null,
          premiumDifference: null,
        })
      })

      it('should preserve existing fields when they are valid', async () => {
        const result = await extractWithOpenAI('doc')
        expect(result.confidence.overall).toBe(0.92)
        expect(result.coverages).toHaveLength(1)
        expect(result.specialConditions).toEqual(['No off-road driving'])
        expect(result.exclusions).toEqual(['Intentional damage'])
        expect(result.amendmentInfo.isAmendment).toBe(false)
      })

      it('should handle completely empty JSON object', async () => {
        setupDirectClient(JSON.stringify({}))
        const result = await extractWithOpenAI('doc')
        expect(result.confidence).toBeDefined()
        expect(result.confidence.overall).toBe(0.7)
        expect(result.coverages).toEqual([])
        expect(result.specialConditions).toEqual([])
        expect(result.exclusions).toEqual([])
        expect(result.amendmentInfo.isAmendment).toBe(false)
      })
    })
  })

  // ─── Proxy Path ────────────────────────────────────────────────

  describe('Proxy Path', () => {
    beforeEach(() => {
      mockIsProxyConfigured.mockReturnValue(true)
    })

    it('should call extractViaProxy when proxy is configured', async () => {
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: makeFullResponse(),
        provider: 'openai',
        requestId: 'req-1',
      })
      await extractWithOpenAI('doc')
      expect(mockExtractViaProxy).toHaveBeenCalledWith(
        'openai',
        expect.stringContaining('doc'),
        'Test system prompt'
      )
      expect(mockGetOpenAIClient).not.toHaveBeenCalled()
    })

    it('should throw when proxy returns success: false', async () => {
      mockExtractViaProxy.mockResolvedValue({
        success: false,
        error: 'Provider unavailable',
      })
      await expect(extractWithOpenAI('doc')).rejects.toThrow('Provider unavailable')
    })

    it('should throw with default message when proxy fails without error message', async () => {
      mockExtractViaProxy.mockResolvedValue({ success: false })
      await expect(extractWithOpenAI('doc')).rejects.toThrow(
        'OpenAI extraction via proxy failed'
      )
    })

    it('should throw when proxy returns success: true but no data', async () => {
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: null,
      })
      await expect(extractWithOpenAI('doc')).rejects.toThrow(
        'OpenAI extraction via proxy failed'
      )
    })

    it('should throw when proxy returns success: true but data is undefined', async () => {
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        // data is undefined
      })
      await expect(extractWithOpenAI('doc')).rejects.toThrow(
        'OpenAI extraction via proxy failed'
      )
    })

    it('should attach _proxyMeta to result', async () => {
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: makeFullResponse(),
        provider: 'openai',
        fallback: true,
        fallbackReason: 'anthropic_error',
        requestId: 'req-abc',
        route: '/api/ai/extract',
        fallbackChain: [
          { provider: 'anthropic', success: false, error: 'billing' },
          { provider: 'openai', success: true, duration_ms: 2000 },
        ],
      })
      const result = await extractWithOpenAI('doc')
      expect(result._proxyMeta).toEqual({
        requestId: 'req-abc',
        route: '/api/ai/extract',
        provider: 'openai',
        fallback: true,
        fallbackReason: 'anthropic_error',
        fallbackChain: [
          { provider: 'anthropic', success: false, error: 'billing' },
          { provider: 'openai', success: true, duration_ms: 2000 },
        ],
      })
    })

    it('should handle _proxyMeta with undefined optional fields', async () => {
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: makeFullResponse(),
        // No requestId, route, fallback, etc.
      })
      const result = await extractWithOpenAI('doc')
      expect(result._proxyMeta).toEqual({
        requestId: undefined,
        route: undefined,
        provider: undefined,
        fallback: undefined,
        fallbackReason: undefined,
        fallbackChain: undefined,
      })
    })

    it('should estimate output tokens from stringified result on proxy path', async () => {
      const resp = makeFullResponse()
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: resp,
      })
      mockEstimateTokens.mockReturnValue(77)
      await extractWithOpenAI('doc')
      // estimateTokens is called at least twice:
      // 1) for input tokens, 2) for output tokens (JSON.stringify(result))
      const calls = mockEstimateTokens.mock.calls
      expect(calls.length).toBeGreaterThanOrEqual(2)
      // The second call should contain the stringified result
      const secondArg = calls[1][0] as string
      expect(secondArg).toContain('POL-123')
    })

    describe('Default field injection (proxy path)', () => {
      it('should add default confidence when missing from proxy response', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).confidence
        mockExtractViaProxy.mockResolvedValue({ success: true, data: resp })
        const result = await extractWithOpenAI('doc')
        expect(result.confidence).toEqual({
          overall: 0.7,
          policyNumber: 0.7,
          provider: 0.7,
          dates: 0.7,
          premium: 0.7,
          coverages: 0.7,
        })
      })

      it('should add empty coverages when missing from proxy response', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).coverages
        mockExtractViaProxy.mockResolvedValue({ success: true, data: resp })
        const result = await extractWithOpenAI('doc')
        expect(result.coverages).toEqual([])
      })

      it('should add empty coverages when not an array from proxy', async () => {
        mockExtractViaProxy.mockResolvedValue({
          success: true,
          data: makeFullResponse({ coverages: { broken: true } }),
        })
        const result = await extractWithOpenAI('doc')
        expect(result.coverages).toEqual([])
      })

      it('should add empty specialConditions when missing from proxy', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).specialConditions
        mockExtractViaProxy.mockResolvedValue({ success: true, data: resp })
        const result = await extractWithOpenAI('doc')
        expect(result.specialConditions).toEqual([])
      })

      it('should add empty specialConditions when not an array from proxy', async () => {
        mockExtractViaProxy.mockResolvedValue({
          success: true,
          data: makeFullResponse({ specialConditions: 'string' }),
        })
        const result = await extractWithOpenAI('doc')
        expect(result.specialConditions).toEqual([])
      })

      it('should add empty exclusions when missing from proxy', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).exclusions
        mockExtractViaProxy.mockResolvedValue({ success: true, data: resp })
        const result = await extractWithOpenAI('doc')
        expect(result.exclusions).toEqual([])
      })

      it('should add empty exclusions when not an array from proxy', async () => {
        mockExtractViaProxy.mockResolvedValue({
          success: true,
          data: makeFullResponse({ exclusions: 123 }),
        })
        const result = await extractWithOpenAI('doc')
        expect(result.exclusions).toEqual([])
      })

      it('should add default amendmentInfo when missing from proxy', async () => {
        const resp = makeFullResponse()
        delete (resp as Record<string, unknown>).amendmentInfo
        mockExtractViaProxy.mockResolvedValue({ success: true, data: resp })
        const result = await extractWithOpenAI('doc')
        expect(result.amendmentInfo).toEqual({
          isAmendment: false,
          amendmentNumber: null,
          amendmentDate: null,
          basePolicyNumber: null,
          amendmentReason: null,
          premiumDifference: null,
        })
      })

      it('should preserve valid fields from proxy response', async () => {
        mockExtractViaProxy.mockResolvedValue({
          success: true,
          data: makeFullResponse(),
        })
        const result = await extractWithOpenAI('doc')
        expect(result.confidence.overall).toBe(0.92)
        expect(result.coverages).toHaveLength(1)
        expect(result.exclusions).toEqual(['Intentional damage'])
      })
    })
  })

  // ─── Cost Tracking ─────────────────────────────────────────────

  describe('Cost Tracking', () => {
    it('should record successful extraction with cacheHit=false', async () => {
      await extractWithOpenAI('doc')
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'extraction',
          cacheHit: false,
          success: true,
          documentLength: 3,
        })
      )
    })

    it('should include durationMs in successful cost record', async () => {
      await extractWithOpenAI('doc')
      const callArg = mockRecordUsage.mock.calls[0][0] as Record<string, unknown>
      expect(callArg.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should record userId in cost record', async () => {
      localStore['insurai_user_id'] = 'cost-user'
      await extractWithOpenAI('doc')
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'cost-user' })
      )
    })

    it('should record model name from AI_CONFIG', async () => {
      await extractWithOpenAI('doc')
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o' })
      )
    })
  })

  // ─── Audit Logging ─────────────────────────────────────────────

  describe('Audit Logging', () => {
    it('should complete timed audit on success', async () => {
      await extractWithOpenAI('doc')
      expect(mockTimedComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          cacheHit: false,
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number),
        })
      )
    })

    it('should use confidence ?? 0.7 when result has no confidence', async () => {
      const resp = makeFullResponse()
      delete (resp as Record<string, unknown>).confidence
      setupDirectClient(JSON.stringify(resp))
      await extractWithOpenAI('doc')
      expect(mockTimedComplete).toHaveBeenCalledWith(
        expect.objectContaining({ confidence: 0.7 })
      )
    })

    it('should use actual confidence when present', async () => {
      await extractWithOpenAI('doc')
      expect(mockTimedComplete).toHaveBeenCalledWith(
        expect.objectContaining({ confidence: 0.92 })
      )
    })

    it('should complete timed audit on proxy success', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: makeFullResponse({ confidence: { overall: 0.85 } }),
      })
      await extractWithOpenAI('doc')
      expect(mockTimedComplete).toHaveBeenCalledWith(
        expect.objectContaining({ confidence: 0.85 })
      )
    })
  })

  // ─── Error Handling ────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should record failed request in cost tracker with Error message', async () => {
      mockChatCreate.mockRejectedValue(new Error('Network timeout'))
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorMessage: 'Network timeout',
          outputTokens: 0,
          cacheHit: false,
        })
      )
    })

    it('should call timedAudit.fail with the original Error', async () => {
      const error = new Error('API crashed')
      mockChatCreate.mockRejectedValue(error)
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockTimedFail).toHaveBeenCalledWith(error, { provider: 'openai' })
    })

    it('should re-throw the original error', async () => {
      mockChatCreate.mockRejectedValue(new Error('Original error'))
      await expect(extractWithOpenAI('doc')).rejects.toThrow('Original error')
    })

    it('should convert non-Error thrown values to Error for timedAudit.fail', async () => {
      mockChatCreate.mockRejectedValue('string error')
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockTimedFail).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'string error' }),
        { provider: 'openai' }
      )
    })

    it('should stringify non-Error values for errorMessage in cost tracker', async () => {
      mockChatCreate.mockRejectedValue(42)
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ errorMessage: '42' })
      )
    })

    it('should include durationMs in failed cost record', async () => {
      mockChatCreate.mockRejectedValue(new Error('fail'))
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      const callArg = mockRecordUsage.mock.calls[0][0] as Record<string, unknown>
      expect(callArg.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should record failure when proxy path throws', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: false,
        error: 'Proxy down',
      })
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorMessage: 'Proxy down',
        })
      )
    })

    it('should handle extractViaProxy rejecting with an exception', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockRejectedValue(new Error('Fetch failed'))
      await expect(extractWithOpenAI('doc')).rejects.toThrow('Fetch failed')
      expect(mockTimedFail).toHaveBeenCalled()
    })

    it('should not cache result when extraction fails', async () => {
      mockChatCreate.mockRejectedValue(new Error('fail'))
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockSetExtraction).not.toHaveBeenCalled()
    })

    it('should not complete timed audit when extraction fails', async () => {
      mockChatCreate.mockRejectedValue(new Error('fail'))
      try { await extractWithOpenAI('doc') } catch { /* expected */ }
      expect(mockTimedComplete).not.toHaveBeenCalled()
      expect(mockTimedFail).toHaveBeenCalled()
    })
  })

  // ─── Cache storage on success ──────────────────────────────────

  describe('Cache storage on success', () => {
    it('should cache result after successful direct API extraction', async () => {
      await extractWithOpenAI('my doc')
      expect(mockSetExtraction).toHaveBeenCalledWith(
        'my doc',
        'openai',
        expect.objectContaining({ policyNumber: 'POL-123' })
      )
    })

    it('should cache result after successful proxy extraction', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: makeFullResponse({ policyNumber: 'PROXY-1' }),
      })
      await extractWithOpenAI('proxy doc')
      expect(mockSetExtraction).toHaveBeenCalledWith(
        'proxy doc',
        'openai',
        expect.objectContaining({ policyNumber: 'PROXY-1' })
      )
    })
  })

  // ─── User message construction ─────────────────────────────────

  describe('User message construction', () => {
    it('should pass the user message with document text to proxy', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: makeFullResponse(),
      })
      await extractWithOpenAI('My insurance policy text')
      expect(mockExtractViaProxy).toHaveBeenCalledWith(
        'openai',
        expect.stringContaining('My insurance policy text'),
        'Test system prompt'
      )
      // Should include the instruction prefix
      const userMsg = mockExtractViaProxy.mock.calls[0][1] as string
      expect(userMsg).toContain('Please extract the insurance policy information')
    })

    it('should pass truncated text when document exceeds max chars', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: makeFullResponse(),
      })
      const longDoc = 'z'.repeat(35000)
      await extractWithOpenAI(longDoc)
      const userMsg = mockExtractViaProxy.mock.calls[0][1] as string
      expect(userMsg).toContain('[Document truncated...]')
      expect(userMsg).not.toContain('z'.repeat(35000))
    })
  })

  // ─── estimateTokens integration ────────────────────────────────

  describe('Token estimation', () => {
    it('should estimate input tokens from system prompt + user message', async () => {
      await extractWithOpenAI('hello')
      const firstCallArg = mockEstimateTokens.mock.calls[0][0] as string
      expect(firstCallArg).toContain('Test system prompt')
      expect(firstCallArg).toContain('hello')
    })

    it('should pass estimated input tokens to cache-hit cost record', async () => {
      mockEstimateTokens.mockReturnValue(250)
      mockGetExtraction.mockResolvedValue(makeFullResponse())
      await extractWithOpenAI('doc')
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ inputTokens: 250 })
      )
    })
  })

  // ─── Document length tracking in cost records ──────────────────

  describe('Document length tracking', () => {
    it('should use truncated document length in cost record', async () => {
      const longDoc = 'x'.repeat(35000)
      await extractWithOpenAI(longDoc)
      const expectedLen = 30000 + '\n\n[Document truncated...]'.length
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ documentLength: expectedLen })
      )
    })

    it('should use original document length when not truncated', async () => {
      await extractWithOpenAI('short doc')
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({ documentLength: 9 })
      )
    })
  })
})
