/**
 * Claude Provider - Coverage Tests
 *
 * Targets uncovered branches in claude.ts:
 * - getCurrentUserId (localStorage vs sessionStorage vs fallback)
 * - Proxy path (isProxyConfigured = true, missing fields defaults)
 * - Proxy error paths (proxyResult.success = false)
 * - Direct API: client = null
 * - Direct API: no usage in response
 * - JSON parse: no JSON found at all
 * - Cost tracking on error with non-Error value
 * - Cached result with null confidence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// =============================================================================
// Mock Setup
// =============================================================================

const {
  mockConsume,
  mockLogAI,
  mockTimedComplete,
  mockTimedFail,
  mockCreateTimedAudit,
  mockInitialize,
  mockGetExtraction,
  mockSetExtraction,
  mockRecordUsage,
  mockIsProxyConfigured,
  mockExtractViaProxy,
  mockGetAnthropicClient,
  mockMessagesCreate,
  mockEstimateTokens,
} = vi.hoisted(() => {
  const mockMessagesCreate = vi.fn()
  const mockTimedComplete = vi.fn()
  const mockTimedFail = vi.fn()

  return {
    mockConsume: vi.fn(),
    mockLogAI: vi.fn().mockResolvedValue(undefined),
    mockTimedComplete: mockTimedComplete,
    mockTimedFail: mockTimedFail,
    mockCreateTimedAudit: vi.fn().mockReturnValue({
      complete: mockTimedComplete,
      fail: mockTimedFail,
    }),
    mockInitialize: vi.fn().mockResolvedValue(undefined),
    mockGetExtraction: vi.fn().mockResolvedValue(null),
    mockSetExtraction: vi.fn().mockResolvedValue(undefined),
    mockRecordUsage: vi.fn().mockResolvedValue(undefined),
    mockIsProxyConfigured: vi.fn().mockReturnValue(false),
    mockExtractViaProxy: vi.fn(),
    mockGetAnthropicClient: vi.fn(),
    mockMessagesCreate: mockMessagesCreate,
    mockEstimateTokens: vi.fn().mockReturnValue(100),
  }
})

vi.mock('../config', () => ({
  getAnthropicClient: (...args: unknown[]) => mockGetAnthropicClient(...args),
  AI_CONFIG: {
    anthropic: { extractionModel: 'claude-3-sonnet-test' },
    maxTokens: 4000,
    temperature: 0.1,
  },
  isProxyConfigured: () => mockIsProxyConfigured(),
  extractViaProxy: (...args: unknown[]) => mockExtractViaProxy(...args),
}))

vi.mock('../extraction-schema', () => ({
  EXTRACTION_SYSTEM_PROMPT: 'Test system prompt',
}))

vi.mock('../cache', () => ({
  aiCache: {
    initialize: () => mockInitialize(),
    getExtraction: (...args: unknown[]) => mockGetExtraction(...args),
    setExtraction: (...args: unknown[]) => mockSetExtraction(...args),
  },
}))

vi.mock('../cost-tracking', () => ({
  costTracker: {
    initialize: () => mockInitialize(),
    recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
  },
  estimateTokens: (...args: unknown[]) => mockEstimateTokens(...args),
}))

vi.mock('@/lib/security', () => ({
  rateLimiter: { consume: (...args: unknown[]) => mockConsume(...args) },
  auditLogger: { logAI: (...args: unknown[]) => mockLogAI(...args) },
  createTimedAudit: (...args: unknown[]) => mockCreateTimedAudit(...args),
}))

import { extractWithClaude } from './claude'

describe('claude coverage', () => {
  let originalLocalStorage: Storage
  let originalSessionStorage: Storage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  }
  const sessionStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockConsume.mockReturnValue({ allowed: true })
    mockGetExtraction.mockResolvedValue(null)
    mockIsProxyConfigured.mockReturnValue(false)

    // Default direct API response
    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ policyNumber: 'P-1', confidence: { overall: 0.9 } }),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    mockGetAnthropicClient.mockResolvedValue({
      messages: { create: mockMessagesCreate },
    })

    originalLocalStorage = globalThis.localStorage
    originalSessionStorage = globalThis.sessionStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true,
      configurable: true,
    })
    localStorageMock.getItem.mockReturnValue(null)
    sessionStorageMock.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: originalSessionStorage,
      writable: true,
      configurable: true,
    })
  })

  describe('getCurrentUserId', () => {
    it('uses localStorage user ID when available', async () => {
      localStorageMock.getItem.mockImplementation((key: string) =>
        key === 'insurai_user_id' ? 'user-from-ls' : null
      )

      await extractWithClaude('doc text')

      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', 'user-from-ls')
    })

    it('uses anonymous + sessionStorage session_id when no user ID', async () => {
      localStorageMock.getItem.mockReturnValue(null)
      sessionStorageMock.getItem.mockImplementation((key: string) =>
        key === 'session_id' ? 'sess-123' : null
      )

      await extractWithClaude('doc text')

      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', 'anonymous_sess-123')
    })

    it('uses anonymous_unknown when no session_id', async () => {
      localStorageMock.getItem.mockReturnValue(null)
      sessionStorageMock.getItem.mockReturnValue(null)

      await extractWithClaude('doc text')

      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', 'anonymous_unknown')
    })
  })

  describe('proxy path', () => {
    it('uses proxy when configured', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: {
          policyNumber: 'PROXY-1',
          confidence: { overall: 0.85 },
          coverages: [{ name: 'c1' }],
          specialConditions: ['sc1'],
          exclusions: ['ex1'],
          amendmentInfo: { isAmendment: false },
        },
        requestId: 'req-1',
        route: '/api/ai/extract',
        provider: 'anthropic',
      })

      const result = await extractWithClaude('doc text')
      expect(result.policyNumber).toBe('PROXY-1')
      expect(result._proxyMeta?.requestId).toBe('req-1')
      expect(mockExtractViaProxy).toHaveBeenCalled()
    })

    it('throws when proxy returns success=false', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: false,
        error: 'Proxy down',
      })

      await expect(extractWithClaude('doc text')).rejects.toThrow('Proxy down')
    })

    it('throws default message when proxy fails without error message', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: false,
      })

      await expect(extractWithClaude('doc text')).rejects.toThrow(
        'Claude extraction via proxy failed'
      )
    })

    it('adds default confidence when proxy result has none', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: { policyNumber: 'P-2' },
      })

      const result = await extractWithClaude('doc text')
      expect(result.confidence).toBeDefined()
      expect(result.confidence!.overall).toBe(0.7)
    })

    it('adds default coverages when proxy result has none', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: { policyNumber: 'P-3' },
      })

      const result = await extractWithClaude('doc text')
      expect(result.coverages).toEqual([])
    })

    it('adds default specialConditions when proxy result has none', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: { policyNumber: 'P-4' },
      })

      const result = await extractWithClaude('doc text')
      expect(result.specialConditions).toEqual([])
    })

    it('adds default exclusions when proxy result has none', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: { policyNumber: 'P-5' },
      })

      const result = await extractWithClaude('doc text')
      expect(result.exclusions).toEqual([])
    })

    it('adds default amendmentInfo when proxy result has none', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: { policyNumber: 'P-6' },
      })

      const result = await extractWithClaude('doc text')
      expect(result.amendmentInfo).toBeDefined()
      expect(result.amendmentInfo!.isAmendment).toBe(false)
    })

    it('attaches fallback metadata from proxy', async () => {
      mockIsProxyConfigured.mockReturnValue(true)
      mockExtractViaProxy.mockResolvedValue({
        success: true,
        data: { policyNumber: 'P-7', confidence: { overall: 0.8 } },
        requestId: 'r-1',
        route: '/api/ai/extract',
        provider: 'openai',
        fallback: true,
        fallbackReason: 'Anthropic rate limited',
        fallbackChain: ['anthropic', 'openai'],
      })

      const result = await extractWithClaude('doc text')
      expect(result._proxyMeta?.fallback).toBe(true)
      expect(result._proxyMeta?.fallbackReason).toBe('Anthropic rate limited')
      expect(result._proxyMeta?.fallbackChain).toEqual(['anthropic', 'openai'])
    })
  })

  describe('direct API path', () => {
    it('throws when client is null', async () => {
      mockGetAnthropicClient.mockResolvedValue(null)

      await expect(extractWithClaude('doc text')).rejects.toThrow('Anthropic client not available')
    })

    it('throws when no text block in response', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'image', source: {} }],
        usage: { input_tokens: 100, output_tokens: 0 },
      })

      await expect(extractWithClaude('doc text')).rejects.toThrow(
        'No text response from Claude model'
      )
    })

    it('handles JSON in markdown code block', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```json\n{"policyNumber": "MD-1", "confidence": {"overall": 0.8}}\n```',
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const result = await extractWithClaude('doc text')
      expect(result.policyNumber).toBe('MD-1')
    })

    it('handles JSON in markdown code block without json hint', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '```\n{"policyNumber": "MD-2", "confidence": {"overall": 0.8}}\n```',
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const result = await extractWithClaude('doc text')
      expect(result.policyNumber).toBe('MD-2')
    })

    it('extracts JSON from surrounding text', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Here is the data: {"policyNumber": "EXT-1", "confidence": {"overall": 0.7}} Done.',
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const result = await extractWithClaude('doc text')
      expect(result.policyNumber).toBe('EXT-1')
    })

    it('throws when no JSON found at all', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'I cannot extract any policy data from this document.' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      await expect(extractWithClaude('doc text')).rejects.toThrow(
        'Failed to parse Claude response as JSON'
      )
    })

    it('uses estimated tokens when response has no usage', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ policyNumber: 'P-8', confidence: { overall: 0.9 } }),
          },
        ],
        // No usage field
      })
      mockEstimateTokens.mockReturnValue(200)

      await extractWithClaude('doc text')

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          outputTokens: 200,
        })
      )
    })

    it('uses actual tokens from response usage', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ policyNumber: 'P-9', confidence: { overall: 0.9 } }),
          },
        ],
        usage: { input_tokens: 300, output_tokens: 150 },
      })

      await extractWithClaude('doc text')

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 300,
          outputTokens: 150,
        })
      )
    })
  })

  describe('document truncation', () => {
    it('truncates documents over 100000 chars', async () => {
      const longDoc = 'x'.repeat(105000)
      await extractWithClaude(longDoc)

      // The cache key should be the truncated version
      expect(mockGetExtraction).toHaveBeenCalledWith(
        expect.stringContaining('[Document truncated...]'),
        'anthropic',
        { promptVersion: 'v2-evidence' }
      )
    })

    it('does not truncate documents under 100000 chars', async () => {
      const shortDoc = 'short document'
      await extractWithClaude(shortDoc)

      expect(mockGetExtraction).toHaveBeenCalledWith(shortDoc, 'anthropic', {
        promptVersion: 'v2-evidence',
      })
    })
  })

  describe('caching', () => {
    it('returns cached result and tracks cost with cacheHit true', async () => {
      const cached = { policyNumber: 'CACHED-1', confidence: { overall: 0.85 } }
      mockGetExtraction.mockResolvedValue(cached)

      const result = await extractWithClaude('doc')
      expect(result).toEqual(cached)
      expect(mockRecordUsage).toHaveBeenCalledWith(expect.objectContaining({ cacheHit: true }))
    })

    it('uses 0.7 when cached confidence.overall is null', async () => {
      const cached = { policyNumber: 'CACHED-2', confidence: null }
      mockGetExtraction.mockResolvedValue(cached)

      await extractWithClaude('doc')
      expect(mockLogAI).toHaveBeenCalledWith(
        'ai.extraction_cached',
        expect.objectContaining({ confidence: 0.7 }),
        expect.any(Object)
      )
    })
  })

  describe('error handling', () => {
    it('tracks failed request cost with error message', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('API error'))

      try {
        await extractWithClaude('doc')
      } catch {
        /* expected */
      }

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorMessage: 'API error',
        })
      )
    })

    it('handles non-Error thrown values', async () => {
      mockMessagesCreate.mockRejectedValue('string error')

      try {
        await extractWithClaude('doc')
      } catch {
        /* expected */
      }

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorMessage: 'string error',
        })
      )
    })

    it('calls timedAudit.fail on error', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('fail'))

      try {
        await extractWithClaude('doc')
      } catch {
        /* expected */
      }

      expect(mockTimedFail).toHaveBeenCalled()
    })

    it('calls timedAudit.complete on success', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await extractWithClaude('doc text')
      expect(mockTimedComplete).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('rate limiting audit', () => {
    it('logs audit when rate limited', async () => {
      mockConsume.mockReturnValue({ allowed: false })

      try {
        await extractWithClaude('doc')
      } catch {
        /* expected */
      }

      expect(mockLogAI).toHaveBeenCalledWith(
        'ai.extraction_failed',
        expect.objectContaining({ provider: 'anthropic' }),
        expect.objectContaining({ success: false, errorMessage: 'Rate limit exceeded' })
      )
    })
  })
})
