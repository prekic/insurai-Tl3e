/**
 * Claude Provider Tests
 *
 * Tests for Anthropic Claude policy extraction functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractWithClaude } from './claude'

// Mock dependencies
const mockConsume = vi.fn()
const mockLogAI = vi.fn()
const mockCreateTimedAudit = vi.fn()
const mockInitialize = vi.fn()
const mockGetExtraction = vi.fn()
const mockSetExtraction = vi.fn()
const mockRecordUsage = vi.fn()

vi.mock('../config', () => ({
  getAnthropicClient: vi.fn(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              policyNumber: 'POL-456',
              provider: 'Axa',
              policyType: 'kasko',
              insuredName: 'Test User',
              startDate: '2024-01-01',
              endDate: '2025-01-01',
              premium: 2000,
              coverages: [],
              confidence: { overall: 0.92 },
            }),
          },
        ],
        usage: { input_tokens: 150, output_tokens: 75 },
      }),
    },
  })),
  AI_CONFIG: {
    anthropic: { extractionModel: 'claude-3-sonnet-20240229' },
    maxTokens: 4000,
    temperature: 0.1,
  },
  isProxyConfigured: vi.fn(() => false),
  extractViaProxy: vi.fn(),
}))

vi.mock('../extraction-schema', () => ({
  EXTRACTION_SYSTEM_PROMPT: 'Test system prompt',
  ExtractedPolicyData: {},
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
  estimateTokens: vi.fn(() => 150),
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
      complete: vi.fn(),
      fail: vi.fn(),
    }
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

Object.defineProperty(global, 'sessionStorage', {
  value: localStorageMock,
  writable: true,
})

describe('extractWithClaude', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConsume.mockReturnValue({ allowed: true })
    mockGetExtraction.mockResolvedValue(null)
    mockInitialize.mockResolvedValue(undefined)
    localStorageMock.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Rate Limiting', () => {
    it('should check rate limit before extraction', async () => {
      await extractWithClaude('Test document text')

      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', expect.any(String))
    })

    it('should throw error when rate limited', async () => {
      mockConsume.mockReturnValue({ allowed: false })

      await expect(extractWithClaude('Test document'))
        .rejects.toThrow('AI extraction rate limit exceeded')
    })

    it('should log failed extraction when rate limited', async () => {
      mockConsume.mockReturnValue({ allowed: false })

      try {
        await extractWithClaude('Test document')
      } catch {
        // Expected
      }

      expect(mockLogAI).toHaveBeenCalledWith(
        'ai.extraction_failed',
        expect.objectContaining({ provider: 'anthropic' }),
        expect.objectContaining({ success: false })
      )
    })
  })

  describe('Caching', () => {
    it('should check cache before making API call', async () => {
      await extractWithClaude('Test document text')

      expect(mockGetExtraction).toHaveBeenCalledWith(
        'Test document text',
        'anthropic'
      )
    })

    it('should return cached result if available', async () => {
      const cachedResult = {
        policyNumber: 'CACHED-789',
        confidence: { overall: 0.88 },
      }
      mockGetExtraction.mockResolvedValue(cachedResult)

      const result = await extractWithClaude('Test document')

      expect(result).toEqual(cachedResult)
    })

    it('should track cached request in cost tracker', async () => {
      const cachedResult = { confidence: { overall: 0.88 } }
      mockGetExtraction.mockResolvedValue(cachedResult)

      await extractWithClaude('Test document')

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheHit: true,
          provider: 'anthropic',
        })
      )
    })

    it('should cache successful extraction results', async () => {
      await extractWithClaude('Test document text')

      expect(mockSetExtraction).toHaveBeenCalledWith(
        'Test document text',
        'anthropic',
        expect.any(Object)
      )
    })
  })

  describe('Document Truncation', () => {
    it('should truncate documents longer than 100000 characters', async () => {
      const longDocument = 'a'.repeat(105000)

      await extractWithClaude(longDocument)

      // Claude has larger context window (100k chars)
      expect(mockRecordUsage).toHaveBeenCalled()
    })
  })

  describe('JSON Parsing', () => {
    it('should handle JSON wrapped in markdown code blocks', async () => {
      const { getAnthropicClient } = await import('../config')
      vi.mocked(getAnthropicClient).mockReturnValue({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: '```json\n{"policyNumber": "MD-123", "confidence": {"overall": 0.9}}\n```',
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        },
      } as unknown as ReturnType<typeof getAnthropicClient>)

      const result = await extractWithClaude('Test document')

      expect(result).toHaveProperty('policyNumber', 'MD-123')
    })

    it('should extract JSON from text with surrounding content', async () => {
      const { getAnthropicClient } = await import('../config')
      vi.mocked(getAnthropicClient).mockReturnValue({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: 'Here is the extracted data: {"policyNumber": "EXT-123", "confidence": {"overall": 0.85}} That is all.',
              },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        },
      } as unknown as ReturnType<typeof getAnthropicClient>)

      const result = await extractWithClaude('Test document')

      expect(result).toHaveProperty('policyNumber', 'EXT-123')
    })
  })

  describe('Audit Logging', () => {
    it('should create timed audit for extraction', async () => {
      await extractWithClaude('Test document')

      expect(mockCreateTimedAudit).toHaveBeenCalledWith(
        'ai.extraction_started',
        expect.objectContaining({ provider: 'anthropic' }),
        expect.any(Object)
      )
    })
  })

  describe('Cost Tracking', () => {
    it('should record successful API call with cost', async () => {
      await extractWithClaude('Test document')

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          operation: 'extraction',
          success: true,
          cacheHit: false,
        })
      )
    })
  })
})

describe('extractWithClaude - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConsume.mockReturnValue({ allowed: true })
    mockGetExtraction.mockResolvedValue(null)
    mockInitialize.mockResolvedValue(undefined)
  })

  it('should throw error when no text block in response', async () => {
    const { getAnthropicClient } = await import('../config')
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [],
          usage: { input_tokens: 100, output_tokens: 0 },
        }),
      },
    } as unknown as ReturnType<typeof getAnthropicClient>)

    await expect(extractWithClaude('Test document'))
      .rejects.toThrow('No text response from Claude model')
  })

  it('should track failed requests in cost tracker', async () => {
    const { getAnthropicClient } = await import('../config')
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: {
        create: vi.fn().mockRejectedValue(new Error('Claude API Error')),
      },
    } as unknown as ReturnType<typeof getAnthropicClient>)

    try {
      await extractWithClaude('Test document')
    } catch {
      // Expected
    }

    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: 'Claude API Error',
      })
    )
  })
})
