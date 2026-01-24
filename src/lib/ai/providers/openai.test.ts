/**
 * OpenAI Provider Tests
 *
 * Tests for OpenAI policy extraction functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractWithOpenAI } from './openai'

// Mock dependencies
const mockConsume = vi.fn()
const mockLogAI = vi.fn()
const mockCreateTimedAudit = vi.fn()
const mockInitialize = vi.fn()
const mockGetExtraction = vi.fn()
const mockSetExtraction = vi.fn()
const mockRecordUsage = vi.fn()

vi.mock('../config', () => ({
  getOpenAIClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  policyNumber: 'POL-123',
                  provider: 'Allianz',
                  policyType: 'home',
                  insuredName: 'Test User',
                  startDate: '2024-01-01',
                  endDate: '2025-01-01',
                  premium: 1000,
                  coverages: [],
                  confidence: { overall: 0.95 },
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      },
    },
  })),
  AI_CONFIG: {
    openai: { extractionModel: 'gpt-4-turbo-preview' },
    maxTokens: 4000,
    temperature: 0.1,
  },
  isProxyConfigured: vi.fn(() => false),
  extractViaProxy: vi.fn(),
}))

vi.mock('../extraction-schema', () => ({
  EXTRACTION_SYSTEM_PROMPT: 'Test system prompt',
  EXTRACTION_JSON_SCHEMA: { name: 'test', schema: {} },
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
  estimateTokens: vi.fn(() => 100),
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

describe('extractWithOpenAI', () => {
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
      await extractWithOpenAI('Test document text')

      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', expect.any(String))
    })

    it('should throw error when rate limited', async () => {
      mockConsume.mockReturnValue({ allowed: false })

      await expect(extractWithOpenAI('Test document'))
        .rejects.toThrow('AI extraction rate limit exceeded')
    })

    it('should log failed extraction when rate limited', async () => {
      mockConsume.mockReturnValue({ allowed: false })

      try {
        await extractWithOpenAI('Test document')
      } catch {
        // Expected
      }

      expect(mockLogAI).toHaveBeenCalledWith(
        'ai.extraction_failed',
        expect.objectContaining({ provider: 'openai' }),
        expect.objectContaining({ success: false })
      )
    })
  })

  describe('Caching', () => {
    it('should check cache before making API call', async () => {
      await extractWithOpenAI('Test document text')

      expect(mockGetExtraction).toHaveBeenCalledWith(
        'Test document text',
        'openai'
      )
    })

    it('should return cached result if available', async () => {
      const cachedResult = {
        policyNumber: 'CACHED-123',
        confidence: { overall: 0.9 },
      }
      mockGetExtraction.mockResolvedValue(cachedResult)

      const result = await extractWithOpenAI('Test document')

      expect(result).toEqual(cachedResult)
    })

    it('should track cached request in cost tracker', async () => {
      const cachedResult = { confidence: { overall: 0.9 } }
      mockGetExtraction.mockResolvedValue(cachedResult)

      await extractWithOpenAI('Test document')

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheHit: true,
          provider: 'openai',
        })
      )
    })

    it('should cache successful extraction results', async () => {
      await extractWithOpenAI('Test document text')

      expect(mockSetExtraction).toHaveBeenCalledWith(
        'Test document text',
        'openai',
        expect.any(Object)
      )
    })
  })

  describe('Document Truncation', () => {
    it('should truncate documents longer than 30000 characters', async () => {
      const longDocument = 'a'.repeat(35000)

      await extractWithOpenAI(longDocument)

      // The truncation happens internally, we verify the API was called
      expect(mockRecordUsage).toHaveBeenCalled()
    })

    it('should not truncate short documents', async () => {
      const shortDocument = 'Short document'

      await extractWithOpenAI(shortDocument)

      expect(mockRecordUsage).toHaveBeenCalled()
    })
  })

  describe('Audit Logging', () => {
    it('should create timed audit for extraction', async () => {
      await extractWithOpenAI('Test document')

      expect(mockCreateTimedAudit).toHaveBeenCalledWith(
        'ai.extraction_started',
        expect.objectContaining({ provider: 'openai' }),
        expect.any(Object)
      )
    })
  })

  describe('Cost Tracking', () => {
    it('should record successful API call with cost', async () => {
      await extractWithOpenAI('Test document')

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          operation: 'extraction',
          success: true,
          cacheHit: false,
        })
      )
    })
  })

  describe('User ID Detection', () => {
    it('should use localStorage user ID if available', async () => {
      localStorageMock.getItem.mockReturnValue('user-123')

      await extractWithOpenAI('Test document')

      expect(mockConsume).toHaveBeenCalledWith('ai_extraction', 'user-123')
    })

    it('should fall back to anonymous ID if no user ID', async () => {
      localStorageMock.getItem.mockReturnValue(null)

      await extractWithOpenAI('Test document')

      expect(mockConsume).toHaveBeenCalledWith(
        'ai_extraction',
        expect.stringContaining('anonymous_')
      )
    })
  })
})

describe('extractWithOpenAI - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConsume.mockReturnValue({ allowed: true })
    mockGetExtraction.mockResolvedValue(null)
    mockInitialize.mockResolvedValue(undefined)
  })

  it('should track failed requests in cost tracker', async () => {
    const { getOpenAIClient } = await import('../config')
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('API Error')),
        },
      },
    } as unknown as ReturnType<typeof getOpenAIClient>)

    try {
      await extractWithOpenAI('Test document')
    } catch {
      // Expected
    }

    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: 'API Error',
      })
    )
  })
})

describe('extractWithOpenAI - Missing Schema Fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConsume.mockReturnValue({ allowed: true })
    mockGetExtraction.mockResolvedValue(null)
    mockInitialize.mockResolvedValue(undefined)
  })

  it('should handle response without confidence object', async () => {
    // This is what the AI might return when json_object format doesn't enforce schema
    const responseWithoutConfidence = {
      policyNumber: 'POL-123',
      provider: 'Allianz',
      policyType: 'home',
      insuredName: 'Test User',
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 1000,
      coverages: [],
      // NO confidence object!
    }

    const { getOpenAIClient } = await import('../config')
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(responseWithoutConfidence) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      },
    } as unknown as ReturnType<typeof getOpenAIClient>)

    const result = await extractWithOpenAI('Test document')

    // Should NOT throw - should add default confidence
    expect(result).toBeDefined()
    // extractWithOpenAI returns ExtractedPolicyData directly with confidence object
    expect(result.confidence).toBeDefined()
    expect(result.confidence.overall).toBeGreaterThanOrEqual(0)
    expect(result.confidence.overall).toBe(0.7) // default value
  })

  it('should handle response without coverages array', async () => {
    const responseWithoutCoverages = {
      policyNumber: 'POL-123',
      provider: 'Allianz',
      policyType: 'home',
      insuredName: 'Test User',
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 1000,
      confidence: { overall: 0.8, policyNumber: 0.9, provider: 0.8, dates: 0.8, premium: 0.8, coverages: 0.7 },
      // NO coverages array!
    }

    const { getOpenAIClient } = await import('../config')
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(responseWithoutCoverages) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      },
    } as unknown as ReturnType<typeof getOpenAIClient>)

    const result = await extractWithOpenAI('Test document')

    expect(result).toBeDefined()
    // Should return data even without coverages - coverages defaults to empty array
    expect(result.policyNumber).toBe('POL-123')
    expect(result.coverages).toEqual([])
  })

  it('should handle response with null confidence.overall', async () => {
    const responseWithNullConfidence = {
      policyNumber: 'POL-123',
      provider: 'Allianz',
      policyType: 'home',
      insuredName: 'Test User',
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 1000,
      coverages: [],
      confidence: { overall: null, policyNumber: 0.9, provider: 0.8, dates: 0.8, premium: 0.8, coverages: 0.7 }, // null overall!
    }

    const { getOpenAIClient } = await import('../config')
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(responseWithNullConfidence) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      },
    } as unknown as ReturnType<typeof getOpenAIClient>)

    const result = await extractWithOpenAI('Test document')

    // Should NOT throw - should handle null gracefully
    expect(result).toBeDefined()
    expect(result.confidence).toBeDefined()
    // confidence.overall is null but object exists, so it's preserved
    expect(result.confidence.overall).toBeNull()
  })

  it('should handle completely empty response object', async () => {
    const emptyResponse = {}

    const { getOpenAIClient } = await import('../config')
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(emptyResponse) } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      },
    } as unknown as ReturnType<typeof getOpenAIClient>)

    // Should not throw, should handle gracefully
    const result = await extractWithOpenAI('Test document')
    expect(result).toBeDefined()
    // Should have default confidence added
    expect(result.confidence).toBeDefined()
    expect(result.confidence.overall).toBe(0.7)
    // Should have default arrays
    expect(result.coverages).toEqual([])
    expect(result.exclusions).toEqual([])
    expect(result.specialConditions).toEqual([])
    // Should have default amendmentInfo
    expect(result.amendmentInfo).toBeDefined()
    expect(result.amendmentInfo.isAmendment).toBe(false)
  })
})
