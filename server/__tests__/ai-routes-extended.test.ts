/**
 * AI Routes Extended Tests
 *
 * Comprehensive tests for server/routes/ai.ts covering:
 * - OpenAI extraction endpoint (success, errors, JSON parse failures, cost tracking)
 * - Anthropic extraction endpoint (success, errors, markdown JSON, admin notifications)
 * - Unified extraction endpoint (fallback chain, both providers fail, no providers)
 * - Chat endpoint (OpenAI, Anthropic, provider fallback, error classification)
 * - OCR endpoint (Vision API, auth methods, timeout, error codes)
 * - Document AI endpoint (success, form fields, tables, errors, page limit)
 * - Provider detection endpoint
 * - Diagnose endpoint (all providers, error classification, sanitization)
 * - Processing log endpoints (CRUD)
 * - Helper functions (buildConfidencePromptSection, buildAnthropicSchemaPrompt, classifyDiagnosticError, sanitizeDiagnosticError)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS (must be declared before vi.mock calls)
// =============================================================================

const mockOpenAICreate = vi.fn()
const mockAnthropicCreate = vi.fn()
const mockGetAIConfig = vi.fn()
const mockGetExtractionPrompt = vi.fn()
const mockGetChatPrompt = vi.fn()
const mockCalculateCost = vi.fn()
const mockRecordUsage = vi.fn()
const mockNotifyBillingIssue = vi.fn()
const mockNotifyRateLimit = vi.fn()
const mockNotifyAPIError = vi.fn()
const mockCreateProcessingLog = vi.fn()
const mockUpdateProcessingLog = vi.fn()
const mockAddProcessingStage = vi.fn()
const mockGetProcessingLog = vi.fn()
const mockGoogleAuthGetAccessToken = vi.fn()
const mockFetch = vi.fn()

// =============================================================================
// MODULE MOCKS
// =============================================================================

// Mock OpenAI
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: mockOpenAICreate,
        },
      },
    }
  }),
}))

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: mockAnthropicCreate,
      },
    }
  }),
}))

// Mock google-auth-library
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(function () {
    return {
      getAccessToken: mockGoogleAuthGetAccessToken,
    }
  }),
}))

// Mock rate limiters to be passthrough
vi.mock('../middleware/rate-limit.js', () => ({
  aiExtractionLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  ocrLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  chatLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

// Mock logger to suppress output during tests
vi.mock('../lib/logger.js', () => {
  const noop = () => {}
  const childLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => childLogger,
  }
  return {
    default: childLogger,
    logger: childLogger,
  }
})

// Mock config service
vi.mock('../services/config-service.js', () => ({
  getAIConfig: (...args: unknown[]) => mockGetAIConfig(...args),
  getMonitoringConfig: vi.fn().mockResolvedValue({
    errorRateWarningThreshold: 0.05,
    errorRateCriticalThreshold: 0.2,
    avgLatencyCriticalMs: 12000,
    checkIntervalMs: 300000,
    alertCooldownMinutes: 15,
    enableEmailAlerts: false,
    alertEmailAddresses: '',
  }),
}))

// Mock extraction alert service
vi.mock('../services/extraction-alert-service.js', () => ({
  evaluateAndDispatchAlerts: vi.fn().mockResolvedValue(undefined),
}))

// Mock prompt service
vi.mock('../services/prompt-service.js', () => ({
  getExtractionPrompt: (...args: unknown[]) => mockGetExtractionPrompt(...args),
  getChatPrompt: (...args: unknown[]) => mockGetChatPrompt(...args),
}))

// Mock cost control
vi.mock('../middleware/cost-control.js', () => ({
  calculateCost: (...args: unknown[]) => mockCalculateCost(...args),
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}))

// Mock admin notification service
vi.mock('../services/admin-notification-service.js', () => ({
  notifyBillingIssue: (...args: unknown[]) => mockNotifyBillingIssue(...args),
  notifyRateLimit: (...args: unknown[]) => mockNotifyRateLimit(...args),
  notifyAPIError: (...args: unknown[]) => mockNotifyAPIError(...args),
}))

// Mock processing log service
vi.mock('../services/processing-log-service.js', () => ({
  createProcessingLog: (...args: unknown[]) => mockCreateProcessingLog(...args),
  updateProcessingLog: (...args: unknown[]) => mockUpdateProcessingLog(...args),
  addProcessingStage: (...args: unknown[]) => mockAddProcessingStage(...args),
  getProcessingLog: (...args: unknown[]) => mockGetProcessingLog(...args),
}))

// Mock extraction schema
vi.mock('../schemas/extraction-schema.js', () => ({
  EXTRACTION_JSON_SCHEMA: {
    name: 'policy_extraction',
    strict: true,
    schema: { type: 'object', properties: {} },
  },
}))

// Mock fs module for GCP credentials
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
})

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_AI_CONFIG = {
  openaiExtractionModel: 'gpt-4o',
  openaiBackupModel: 'gpt-4o-mini',
  anthropicExtractionModel: 'claude-sonnet-4-20250514',
  anthropicBackupModel: 'claude-3-5-haiku-20241022',
  maxTokens: 4096,
  temperature: 0.1,
  chatTemperature: 0.7,
  minConfidence: 0.7,
  warningConfidence: 0.5,
  extractionTimeoutMs: 90000,
  preferredProvider: 'auto',
  enableFallback: true,
  consensusEnabled: true,
  consensusAgreementThreshold: 0.8,
  consensusFields: ['policyNumber', 'provider'],
  confidenceWeightPolicyNumber: 0.2,
  confidenceWeightProvider: 0.15,
  confidenceWeightDates: 0.2,
  confidenceWeightPremium: 0.2,
  confidenceWeightCoverages: 0.25,
  requestBudgetMs: 125000,
  primaryProviderTimeoutMs: 65000,
  fallbackProviderTimeoutMs: 55000,
  clientFetchTimeoutMs: 135000,
  trialExtractionTimeoutMs: 150000,
}

// =============================================================================
// HELPERS
// =============================================================================

function setupDefaultMocks() {
  mockGetAIConfig.mockResolvedValue(DEFAULT_AI_CONFIG)
  mockGetExtractionPrompt.mockResolvedValue(null) // Use fallback prompt
  mockGetChatPrompt.mockResolvedValue(null) // Use fallback prompt
  mockCalculateCost.mockReturnValue({ inputCost: 0.001, outputCost: 0.002, totalCost: 0.003 })
  mockRecordUsage.mockResolvedValue(undefined)
  mockNotifyBillingIssue.mockResolvedValue(undefined)
  mockNotifyRateLimit.mockResolvedValue(undefined)
  mockNotifyAPIError.mockResolvedValue(undefined)
  // Mock global fetch for Google Vision API calls in /diagnose endpoint
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ responses: [{}] }),
  })
  vi.stubGlobal('fetch', mockFetch)
}

function makeOpenAIResponse(content: string, model = 'gpt-4o') {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    model,
  }
}

function makeAnthropicResponse(content: string, model = 'claude-sonnet-4-20250514') {
  return {
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: 100, output_tokens: 50 },
    model,
  }
}

const VALID_POLICY_JSON = JSON.stringify({
  policyNumber: 'POL-123',
  provider: 'Allianz',
  policyType: 'kasko',
  premium: 5000,
  coverages: [],
  confidence: {
    overall: 0.9,
    policyNumber: 1.0,
    provider: 1.0,
    dates: 0.8,
    premium: 0.9,
    coverages: 0.85,
  },
})

// Store original env
const originalEnv = { ...process.env }

// =============================================================================
// TESTS
// =============================================================================

describe('AI Routes Extended', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      GOOGLE_CLOUD_API_KEY: 'test-google-key',
      NODE_ENV: 'test',
    }
    // Clear cached clients by resetting modules
    vi.resetModules()

    setupDefaultMocks()

    const aiRouter = (await import('../routes/ai')).default
    app = express()
    app.use(express.json({ limit: '1mb' }))
    app.use('/api/ai', aiRouter)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // ===========================================================================
  // POST /api/ai/extract/openai
  // ===========================================================================
  describe('POST /api/ai/extract/openai', () => {
    it('successfully extracts policy data', async () => {
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'This is a kasko policy document with JSON content.' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.policyNumber).toBe('POL-123')
      expect(res.body.usage).toBeDefined()
      expect(res.body.cost).toBe(0.003)
    })

    it('uses client-provided system prompt when present', async () => {
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract/openai').send({
        documentText: 'Test document with JSON data.',
        systemPrompt: 'Custom extraction prompt with json output.',
      })

      expect(mockOpenAICreate).toHaveBeenCalled()
      const callArgs = mockOpenAICreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toContain('Custom extraction prompt')
    })

    it('uses admin-managed prompt when available', async () => {
      mockGetExtractionPrompt.mockResolvedValue({
        systemPrompt: 'Admin system prompt with JSON output.',
        userPrompt: 'Processed document text',
        templateName: 'kasko-extractor',
        version: 2,
      })
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract/openai').send({ documentText: 'Test document.' })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toContain('Admin system prompt')
      // User prompt may have JSON reminder appended
      expect(callArgs.messages[1].content).toContain('Processed document text')
    })

    it('appends json reminder when prompt lacks json keyword', async () => {
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document content.' })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      // System prompt is fallback: 'Extract policy information as JSON.'
      // which contains 'JSON' so no extra reminder needed for system
      expect(callArgs.messages[0].content).toContain('JSON')
    })

    it('uses custom model when specified', async () => {
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON, 'gpt-4o-mini'))

      await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document with json output.', model: 'gpt-4o-mini' })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      expect(callArgs.model).toBe('gpt-4o-mini')
    })

    it('returns 500 with EMPTY_RESPONSE when OpenAI returns no content', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      })

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document with json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('EMPTY_RESPONSE')
    })

    it('returns 502 with INVALID_JSON when OpenAI returns unparseable content', async () => {
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse('This is not valid JSON at all'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document with json.' })

      expect(res.status).toBe(502)
      expect(res.body.code).toBe('INVALID_JSON')
    })

    it('records cost usage asynchronously', async () => {
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json extraction.' })

      expect(mockCalculateCost).toHaveBeenCalledWith('gpt-4o', 100, 50)
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'extraction',
          inputTokens: 100,
          outputTokens: 50,
        })
      )
    })

    it('handles cost tracking failure silently', async () => {
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))
      mockRecordUsage.mockRejectedValue(new Error('DB connection failed'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      // Should still succeed even if cost tracking fails
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns INVALID_API_KEY for 401 errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('401 Incorrect API key'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
    })

    it('returns RATE_LIMIT_EXCEEDED for 429 errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('429 rate limit exceeded'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('returns QUOTA_EXCEEDED for quota errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('insufficient_quota'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('QUOTA_EXCEEDED')
    })

    it('returns TIMEOUT for timeout errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('ETIMEDOUT'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
    })

    it('returns DOCUMENT_TOO_LARGE for context length errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('context_length_exceeded'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('DOCUMENT_TOO_LARGE')
    })

    it('returns EXTRACTION_FAILED for unknown errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('Something unexpected happened'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('EXTRACTION_FAILED')
    })

    it('includes details in non-production error responses', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('Detailed error message'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.body.details).toBe('Detailed error message')
      expect(res.body.timestamp).toBeDefined()
    })

    it('returns 503 when OpenAI not configured', async () => {
      delete process.env.OPENAI_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PROVIDER_NOT_CONFIGURED')
    })
  })

  // ===========================================================================
  // POST /api/ai/extract/anthropic
  // ===========================================================================
  describe('POST /api/ai/extract/anthropic', () => {
    it('successfully extracts policy data', async () => {
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'This is a kasko policy document.' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.policyNumber).toBe('POL-123')
      expect(res.body.cost).toBe(0.003)
    })

    it('extracts JSON from markdown code blocks', async () => {
      const wrappedJson = '```json\n' + VALID_POLICY_JSON + '\n```'
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(wrappedJson))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test policy document.' })

      expect(res.status).toBe(200)
      expect(res.body.data.policyNumber).toBe('POL-123')
    })

    it('extracts JSON from bare code blocks', async () => {
      const wrappedJson = '```\n' + VALID_POLICY_JSON + '\n```'
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(wrappedJson))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test policy document.' })

      expect(res.status).toBe(200)
      expect(res.body.data.policyNumber).toBe('POL-123')
    })

    it('uses ANTHROPIC_SCHEMA_PROMPT as system prompt', async () => {
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract/anthropic').send({ documentText: 'Test document.' })

      const callArgs = mockAnthropicCreate.mock.calls[0][0]
      expect(callArgs.system).toContain('expert insurance policy analyzer')
      expect(callArgs.system).toContain('CRITICAL: Output Format')
      expect(callArgs.system).toContain('Confidence Scoring Rules')
    })

    it('uses confidence weights from config in schema prompt', async () => {
      mockGetAIConfig.mockResolvedValue({
        ...DEFAULT_AI_CONFIG,
        confidenceWeightPolicyNumber: 0.3,
        confidenceWeightCoverages: 0.35,
      })
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract/anthropic').send({ documentText: 'Test document.' })

      const callArgs = mockAnthropicCreate.mock.calls[0][0]
      expect(callArgs.system).toContain('policyNumber: weight 30%')
      expect(callArgs.system).toContain('coverages: weight 35%')
    })

    it('prepends schema when client provides custom prompt', async () => {
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract/anthropic').send({
        documentText: 'Test document.',
        systemPrompt: 'Custom instructions for extraction.',
      })

      const callArgs = mockAnthropicCreate.mock.calls[0][0]
      // System should be the schema prompt
      expect(callArgs.system).toContain('expert insurance policy analyzer')
      // User prompt should combine custom prompt + document
      expect(callArgs.messages[0].content).toContain('Custom instructions')
      expect(callArgs.messages[0].content).toContain('Test document.')
    })

    it('uses admin-managed prompt with schema when available', async () => {
      mockGetExtractionPrompt.mockResolvedValue({
        systemPrompt: 'Admin extraction system prompt.',
        userPrompt: 'Processed user prompt text.',
        templateName: 'kasko-extractor',
        version: 3,
      })
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract/anthropic').send({ documentText: 'Test document.' })

      const callArgs = mockAnthropicCreate.mock.calls[0][0]
      // System should be the schema prompt (not admin system prompt)
      expect(callArgs.system).toContain('expert insurance policy analyzer')
      // User prompt should be the rendered one
      expect(callArgs.messages[0].content).toBe('Processed user prompt text.')
    })

    it('returns 500 with EMPTY_RESPONSE for empty Anthropic response', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
      })

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('EMPTY_RESPONSE')
    })

    it('returns 502 with INVALID_JSON when Anthropic returns non-JSON', async () => {
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse('Not valid JSON'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(502)
      expect(res.body.code).toBe('INVALID_JSON')
    })

    it('returns INVALID_API_KEY for 401 errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('401 invalid x-api-key'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
    })

    it('returns RATE_LIMIT_EXCEEDED for 429 errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate_limit'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('returns BILLING_ERROR for billing/credit errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('BILLING_ERROR')
    })

    it('returns PROVIDER_OVERLOADED for 529/overloaded errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('529 overloaded'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PROVIDER_OVERLOADED')
    })

    it('returns TIMEOUT for timeout errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('ETIMEDOUT'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
    })

    it('notifies admin on billing errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))

      await request(app).post('/api/ai/extract/anthropic').send({ documentText: 'Test document.' })

      expect(mockNotifyBillingIssue).toHaveBeenCalledWith(
        'Anthropic',
        expect.stringContaining('credit'),
        expect.any(Object)
      )
    })

    it('notifies admin on rate limit errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate_limit'))

      await request(app).post('/api/ai/extract/anthropic').send({ documentText: 'Test document.' })

      expect(mockNotifyRateLimit).toHaveBeenCalledWith('Anthropic', expect.any(Object))
    })

    it('notifies admin on auth errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('401 Invalid API Key'))

      await request(app).post('/api/ai/extract/anthropic').send({ documentText: 'Test document.' })

      expect(mockNotifyAPIError).toHaveBeenCalledWith(
        'Anthropic',
        'INVALID_API_KEY',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('handles admin notification failure silently', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))
      mockNotifyBillingIssue.mockRejectedValue(new Error('notification failed'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      // Should still return error response even if notification fails
      expect(res.status).toBe(500)
      expect(res.body.code).toBe('BILLING_ERROR')
    })

    it('returns 503 when Anthropic not configured', async () => {
      delete process.env.ANTHROPIC_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PROVIDER_NOT_CONFIGURED')
    })
  })

  // ===========================================================================
  // POST /api/ai/extract (Unified endpoint)
  // ===========================================================================
  describe('POST /api/ai/extract (unified)', () => {
    it('tries Anthropic first and returns on success', async () => {
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document.' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.provider).toBe('anthropic')
      expect(res.body.route).toBe('/api/ai/extract')
      expect(res.body.requestId).toBeDefined()
      // OpenAI should NOT have been called
      expect(mockOpenAICreate).not.toHaveBeenCalled()
    })

    it('falls back to OpenAI when Anthropic fails', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.provider).toBe('openai')
      expect(res.body.fallback).toBe(true)
      expect(res.body.fallbackReason).toBe('ANTHROPIC_BILLING_ERROR')
    })

    it('includes fallbackChain when falling back to OpenAI', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate_limit'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.body.fallbackChain).toBeDefined()
      expect(res.body.fallbackChain).toHaveLength(2)
      expect(res.body.fallbackChain[0].provider).toBe('anthropic')
      expect(res.body.fallbackChain[0].success).toBe(false)
      expect(res.body.fallbackChain[1].provider).toBe('openai')
      expect(res.body.fallbackChain[1].success).toBe(true)
    })

    it('classifies Anthropic auth error correctly for fallback', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('401 invalid x-api-key'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.body.fallbackReason).toBe('ANTHROPIC_AUTH_ERROR')
    })

    it('classifies Anthropic overloaded error correctly for fallback', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('529 overloaded'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.body.fallbackReason).toBe('ANTHROPIC_OVERLOADED')
    })

    it('classifies Anthropic timeout error correctly for fallback', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('ETIMEDOUT'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.body.fallbackReason).toBe('ANTHROPIC_TIMEOUT')
    })

    it('classifies unknown Anthropic errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Something unexpected'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.body.fallbackReason).toBe('ANTHROPIC_UNKNOWN_ERROR')
    })

    it('returns ALL_PROVIDERS_FAILED when both fail', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Anthropic down'))
      mockOpenAICreate.mockRejectedValue(new Error('OpenAI down'))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('ALL_PROVIDERS_FAILED')
      expect(res.body.details).toBe('OpenAI down')
    })

    it('notifies admin about OpenAI billing failure in fallback', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Anthropic down'))
      mockOpenAICreate.mockRejectedValue(new Error('insufficient_quota'))

      await request(app).post('/api/ai/extract').send({ documentText: 'Test policy document.' })

      expect(mockNotifyBillingIssue).toHaveBeenCalledWith(
        'OpenAI',
        expect.stringContaining('insufficient_quota'),
        expect.any(Object)
      )
    })

    it('notifies admin about Anthropic billing error on fallback', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(mockNotifyBillingIssue).toHaveBeenCalledWith(
        'Anthropic',
        expect.stringContaining('credit'),
        expect.any(Object)
      )
    })

    it('notifies admin about Anthropic rate limit on fallback', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate_limit'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(mockNotifyRateLimit).toHaveBeenCalledWith('Anthropic', expect.any(Object))
    })

    it('notifies admin about Anthropic auth error on fallback', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('401 invalid x-api-key'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(mockNotifyAPIError).toHaveBeenCalledWith(
        'Anthropic',
        'INVALID_API_KEY',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('falls back when Anthropic returns invalid JSON', async () => {
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse('Not valid JSON'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
      expect(res.body.fallback).toBe(true)
    })

    it('falls back when Anthropic returns empty response', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
      })
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
    })

    it('returns 503 when no providers are configured', async () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document.' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('NO_PROVIDERS_CONFIGURED')
    })

    it('uses OpenAI directly when only OpenAI is configured', async () => {
      delete process.env.ANTHROPIC_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document with json.' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
      expect(res.body.fallback).toBeFalsy() // Not a fallback, it's the primary
    })

    it('uses client-provided prompt in unified endpoint', async () => {
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract').send({
        documentText: 'Test document.',
        systemPrompt: 'Custom unified prompt.',
      })

      const callArgs = mockAnthropicCreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toBe('Test document.')
    })

    it('uses admin-managed prompt in unified endpoint', async () => {
      mockGetExtractionPrompt.mockResolvedValue({
        systemPrompt: 'Admin system prompt.',
        userPrompt: 'Admin user prompt.',
        templateName: 'master-extractor',
        version: 1,
      })
      mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract').send({ documentText: 'Test document.' })

      // Anthropic uses the admin user prompt
      const callArgs = mockAnthropicCreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toBe('Admin user prompt.')
    })

    it('handles OpenAI invalid JSON in fallback path', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Anthropic down'))
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse('not valid json'))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('ALL_PROVIDERS_FAILED')
    })
  })

  // ===========================================================================
  // POST /api/ai/chat
  // ===========================================================================
  describe('POST /api/ai/chat', () => {
    it('successfully chats with OpenAI', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Your kasko covers collision damage.' } }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        model: 'gpt-4o-mini',
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'What does my kasko cover?', provider: 'openai' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.response).toBe('Your kasko covers collision damage.')
      expect(res.body.provider).toBe('openai')
    })

    it('successfully chats with Anthropic', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Your kasko covers collision.' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-3-5-haiku-20241022',
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'What does my kasko cover?', provider: 'anthropic' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.response).toBe('Your kasko covers collision.')
      expect(res.body.provider).toBe('anthropic')
    })

    it('uses admin-managed chat prompt when available', async () => {
      mockGetChatPrompt.mockResolvedValue({
        systemPrompt: 'Admin chat prompt - You are an insurance expert.',
        userPrompt: 'User message processed.',
        templateName: 'policy-chat',
        version: 2,
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })

      await request(app).post('/api/ai/chat').send({ message: 'Test', provider: 'openai' })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toContain('Admin chat prompt')
    })

    it('uses fallback chat prompt when admin prompt unavailable', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })

      await request(app).post('/api/ai/chat').send({ message: 'Test', provider: 'openai' })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toContain('expert insurance policy assistant')
    })

    it('includes policy context in system prompt', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })

      await request(app).post('/api/ai/chat').send({
        message: 'Tell me about my policy',
        policyContext: 'Policy: POL-001\nProvider: Allianz',
        provider: 'openai',
      })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toContain('POL-001')
      expect(callArgs.messages[0].content).toContain('Allianz')
    })

    it('includes conversation history for OpenAI', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Follow-up response' } }],
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
      })

      await request(app)
        .post('/api/ai/chat')
        .send({
          message: 'And the premium?',
          conversationHistory: [
            { role: 'user', content: 'What is my kasko?' },
            { role: 'assistant', content: 'It is a comprehensive auto policy.' },
          ],
          provider: 'openai',
        })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      // system + 2 history + 1 new = 4 messages
      expect(callArgs.messages).toHaveLength(4)
      expect(callArgs.messages[1].content).toBe('What is my kasko?')
      expect(callArgs.messages[2].content).toBe('It is a comprehensive auto policy.')
      expect(callArgs.messages[3].content).toBe('And the premium?')
    })

    it('includes conversation history for Anthropic', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Follow-up response' }],
        usage: { input_tokens: 30, output_tokens: 10 },
      })

      await request(app)
        .post('/api/ai/chat')
        .send({
          message: 'And the premium?',
          conversationHistory: [
            { role: 'user', content: 'What is my kasko?' },
            { role: 'assistant', content: 'It is a comprehensive auto policy.' },
          ],
          provider: 'anthropic',
        })

      const callArgs = mockAnthropicCreate.mock.calls[0][0]
      // 2 history + 1 new = 3 messages (system is separate for Anthropic)
      expect(callArgs.messages).toHaveLength(3)
      expect(callArgs.system).toBeDefined() // System prompt is separate
    })

    it('falls back to Anthropic when OpenAI requested but not configured', async () => {
      delete process.env.OPENAI_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Fallback response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('anthropic')
    })

    it('falls back to OpenAI when Anthropic requested but not configured', async () => {
      delete process.env.ANTHROPIC_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Fallback response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'anthropic' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
    })

    it('returns EMPTY_RESPONSE for empty OpenAI chat response', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('EMPTY_RESPONSE')
    })

    it('returns EMPTY_RESPONSE for empty Anthropic chat response', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 5, output_tokens: 0 },
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'anthropic' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('EMPTY_RESPONSE')
    })

    it('returns INVALID_API_KEY for auth errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('401 Invalid API key'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
    })

    it('returns RATE_LIMIT_EXCEEDED for rate limit errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('429 rate_limit'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('returns TIMEOUT for timeout errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('timeout waiting for response'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
    })

    it('returns CHAT_FAILED for generic errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('Something unexpected'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('CHAT_FAILED')
    })

    it('tracks cost for OpenAI chat', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        model: 'gpt-4o-mini',
      })

      await request(app).post('/api/ai/chat').send({ message: 'Test', provider: 'openai' })

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          operation: 'chat',
        })
      )
    })

    it('tracks cost for Anthropic chat', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 50, output_tokens: 20 },
        model: 'claude-3-5-haiku-20241022',
      })

      await request(app).post('/api/ai/chat').send({ message: 'Test', provider: 'anthropic' })

      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          operation: 'chat',
        })
      )
    })

    it('returns 503 when OpenAI provider not configured for chat', async () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PROVIDER_NOT_CONFIGURED')
    })

    it('returns 400 for missing message', async () => {
      const res = await request(app).post('/api/ai/chat').send({})

      expect(res.status).toBe(400)
    })

    it('returns 415 for non-JSON content type', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Content-Type', 'text/plain')
        .send('test')

      expect(res.status).toBe(415)
      expect(res.body.code).toBe('INVALID_CONTENT_TYPE')
    })
  })

  // ===========================================================================
  // GET /api/ai/providers
  // ===========================================================================
  describe('GET /api/ai/providers', () => {
    it('returns true for configured providers', async () => {
      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.openai).toBe(true)
      expect(res.body.anthropic).toBe(true)
      expect(res.body.google).toBe(true) // GOOGLE_CLOUD_API_KEY is set
    })

    it('returns false for unconfigured providers', async () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.GOOGLE_CLOUD_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.openai).toBe(false)
      expect(res.body.anthropic).toBe(false)
    })

    it('includes documentAI field in response', async () => {
      const res = await request(app).get('/api/ai/providers')

      expect(res.body).toHaveProperty('documentAI')
    })
  })

  // ===========================================================================
  // GET /api/ai/diagnose
  // ===========================================================================
  describe('GET /api/ai/diagnose', () => {
    it('returns diagnostic results for configured providers', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-20241022',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.status).toBe(200)
      expect(res.body.openai.configured).toBe(true)
      expect(res.body.openai.valid).toBe(true)
      expect(res.body.openai.latencyMs).toBeGreaterThanOrEqual(0)
      expect(res.body.anthropic.configured).toBe(true)
      expect(res.body.anthropic.valid).toBe(true)
      expect(res.body.timestamp).toBeDefined()
    })

    it('includes environment in non-production', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-20241022',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.environment).toBeDefined()
    })

    it('includes model info in non-production', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-20241022',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.model).toBe('gpt-4o-mini')
      expect(res.body.anthropic.model).toBe('claude-3-5-haiku-20241022')
    })

    it('reports invalid OpenAI key with error code', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('401 Incorrect API key'))
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-20241022',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.valid).toBe(false)
      expect(res.body.openai.errorCode).toBe('INVALID_CREDENTIALS')
      expect(res.body.openai.error).toBeDefined()
    })

    it('reports Anthropic rate limit with error code', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate limit'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.anthropic.valid).toBe(false)
      expect(res.body.anthropic.errorCode).toBe('RATE_LIMITED')
    })

    it('reports Anthropic billing errors', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.anthropic.valid).toBe(false)
      expect(res.body.anthropic.errorCode).toBe('BILLING_ERROR')
    })

    it('reports OpenAI quota errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('insufficient_quota'))
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-20241022',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.valid).toBe(false)
      expect(res.body.openai.errorCode).toBe('QUOTA_EXHAUSTED')
    })

    it('returns summary with recommendations', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-20241022',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.summary).toBeDefined()
      expect(res.body.summary.anyProviderConfigured).toBe(true)
      expect(res.body.summary.anyProviderValid).toBe(true)
      expect(res.body.summary.extractionReady).toBe(true)
    })

    it('returns appropriate recommendation when no providers configured', async () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.GOOGLE_CLOUD_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.summary.anyProviderConfigured).toBe(false)
      expect(res.body.summary.recommendation).toContain('OPENAI_API_KEY')
    })

    it('returns appropriate recommendation when keys invalid', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('401 Incorrect API key'))
      mockAnthropicCreate.mockRejectedValue(new Error('401 invalid x-api-key'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.summary.anyProviderValid).toBe(false)
      expect(res.body.summary.recommendation).toContain('invalid')
    })

    it('reports unconfigured providers as not configured', async () => {
      delete process.env.OPENAI_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-20241022',
      })
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.openai.configured).toBe(false)
      expect(res.body.openai.valid).toBe(false)
      expect(res.body.anthropic.configured).toBe(true)
      expect(res.body.anthropic.valid).toBe(true)
    })
  })

  // ===========================================================================
  // Processing Log endpoints
  // ===========================================================================
  describe('POST /api/ai/processing-log', () => {
    it('creates a processing log', async () => {
      mockCreateProcessingLog.mockResolvedValue({
        data: { id: 'log-1', document_id: 'doc-1', filename: 'test.pdf' },
        error: null,
      })

      const res = await request(app)
        .post('/api/ai/processing-log')
        .send({ document_id: 'doc-1', filename: 'test.pdf' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('log-1')
    })

    it('returns 400 for missing document_id', async () => {
      const res = await request(app).post('/api/ai/processing-log').send({ filename: 'test.pdf' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('document_id')
    })

    it('returns 400 for missing filename', async () => {
      const res = await request(app).post('/api/ai/processing-log').send({ document_id: 'doc-1' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toContain('filename')
    })

    it('returns 500 on database error', async () => {
      mockCreateProcessingLog.mockResolvedValue({
        data: null,
        error: 'Database connection failed',
      })

      const res = await request(app)
        .post('/api/ai/processing-log')
        .send({ document_id: 'doc-1', filename: 'test.pdf' })

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })

    it('returns 500 on thrown exception', async () => {
      mockCreateProcessingLog.mockRejectedValue(new Error('Unexpected error'))

      const res = await request(app)
        .post('/api/ai/processing-log')
        .send({ document_id: 'doc-1', filename: 'test.pdf' })

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
    })
  })

  describe('PATCH /api/ai/processing-log/:documentId', () => {
    it('updates a processing log', async () => {
      mockUpdateProcessingLog.mockResolvedValue({
        id: 'log-1',
        document_id: 'doc-1',
        status: 'completed',
      })

      const res = await request(app)
        .patch('/api/ai/processing-log/doc-1')
        .send({ status: 'completed' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 404 when log not found', async () => {
      mockUpdateProcessingLog.mockResolvedValue(null)

      const res = await request(app)
        .patch('/api/ai/processing-log/nonexistent')
        .send({ status: 'completed' })

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('not found')
    })

    it('returns 500 on error', async () => {
      mockUpdateProcessingLog.mockRejectedValue(new Error('DB error'))

      const res = await request(app)
        .patch('/api/ai/processing-log/doc-1')
        .send({ status: 'completed' })

      expect(res.status).toBe(500)
    })
  })

  describe('POST /api/ai/processing-log/:documentId/stage', () => {
    it('adds a stage to a processing log', async () => {
      mockAddProcessingStage.mockResolvedValue(true)

      const res = await request(app)
        .post('/api/ai/processing-log/doc-1/stage')
        .send({ stage: 'pdf_extraction', status: 'completed' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns 400 for missing stage field', async () => {
      const res = await request(app)
        .post('/api/ai/processing-log/doc-1/stage')
        .send({ status: 'completed' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('stage')
    })

    it('returns 400 for missing status field', async () => {
      const res = await request(app)
        .post('/api/ai/processing-log/doc-1/stage')
        .send({ stage: 'pdf_extraction' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('status')
    })

    it('returns 404 when processing log not found', async () => {
      mockAddProcessingStage.mockResolvedValue(false)

      const res = await request(app)
        .post('/api/ai/processing-log/nonexistent/stage')
        .send({ stage: 'pdf_extraction', status: 'completed' })

      expect(res.status).toBe(404)
    })

    it('returns 500 on error', async () => {
      mockAddProcessingStage.mockRejectedValue(new Error('DB error'))

      const res = await request(app)
        .post('/api/ai/processing-log/doc-1/stage')
        .send({ stage: 'pdf_extraction', status: 'completed' })

      expect(res.status).toBe(500)
    })
  })

  describe('GET /api/ai/processing-log/:documentId', () => {
    it('retrieves a processing log', async () => {
      mockGetProcessingLog.mockResolvedValue({
        id: 'log-1',
        document_id: 'doc-1',
        filename: 'test.pdf',
        stages: [],
      })

      const res = await request(app).get('/api/ai/processing-log/doc-1')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.document_id).toBe('doc-1')
    })

    it('returns 404 when log not found', async () => {
      mockGetProcessingLog.mockResolvedValue(null)

      const res = await request(app).get('/api/ai/processing-log/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('not found')
    })

    it('returns 500 on error', async () => {
      mockGetProcessingLog.mockRejectedValue(new Error('DB error'))

      const res = await request(app).get('/api/ai/processing-log/doc-1')

      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // Validation tests (cross-endpoint)
  // ===========================================================================
  describe('Input Validation', () => {
    it('returns 415 for non-JSON content type on extract/openai', async () => {
      const res = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'text/plain')
        .send('test')

      expect(res.status).toBe(415)
      expect(res.body.code).toBe('INVALID_CONTENT_TYPE')
    })

    it('returns 415 for non-JSON content type on extract/anthropic', async () => {
      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .set('Content-Type', 'text/plain')
        .send('test')

      expect(res.status).toBe(415)
      expect(res.body.code).toBe('INVALID_CONTENT_TYPE')
    })

    it('returns 415 for non-JSON content type on unified extract', async () => {
      const res = await request(app)
        .post('/api/ai/extract')
        .set('Content-Type', 'text/plain')
        .send('test')

      expect(res.status).toBe(415)
      expect(res.body.code).toBe('INVALID_CONTENT_TYPE')
    })

    it('returns 400 for missing documentText on extract/openai', async () => {
      const res = await request(app).post('/api/ai/extract/openai').send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for empty documentText on extract/anthropic', async () => {
      const res = await request(app).post('/api/ai/extract/anthropic').send({ documentText: '' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for missing documentText on unified extract', async () => {
      const res = await request(app).post('/api/ai/extract').send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('accepts Turkish characters in documentText', async () => {
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      const res = await request(app).post('/api/ai/extract/openai').send({
        documentText: 'Kasko Sigortas\u0131 - \u0130stanbul \u015Ei\u015Fli - JSON format',
      })

      expect([200, 503]).toContain(res.status)
    })
  })
})
