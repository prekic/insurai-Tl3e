/**
 * AI Routes — Error Classifier & Google Vision Diagnostic Branch Coverage
 *
 * Targets specific branches in server/routes/ai.ts not covered by the existing
 * ai-routes-extended.test.ts and ai-ocr-coverage.test.ts files:
 *
 * - classifyDiagnosticError: PROVIDER_OVERLOADED, NOT_FOUND, NETWORK_ERROR, UNKNOWN_ERROR
 * - sanitizeDiagnosticError: production mode mapping for every error code
 * - GET /diagnose Google Vision: UNAUTHENTICATED, FAILED_PRECONDITION, RESOURCE_EXHAUSTED,
 *     NOT_FOUND (httpStatus 404), httpStatus 403 without PERMISSION_DENIED, authMethod='none'
 * - Google Vision diagnose exception handler (fetch itself throws)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================
const {
  mockOpenAICreate,
  mockAnthropicCreate,
  mockGetAIConfig,
  mockGetExtractionPrompt,
  mockGetChatPrompt,
  mockCalculateCost,
  mockRecordUsage,
  mockNotifyBillingIssue,
  mockNotifyRateLimit,
  mockNotifyAPIError,
  mockCreateProcessingLog,
  mockUpdateProcessingLog,
  mockAddProcessingStage,
  mockGetProcessingLog,
  mockGoogleAuthGetAccessToken,
} = vi.hoisted(() => ({
  mockOpenAICreate: vi.fn(),
  mockAnthropicCreate: vi.fn(),
  mockGetAIConfig: vi.fn(),
  mockGetExtractionPrompt: vi.fn(),
  mockGetChatPrompt: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockNotifyBillingIssue: vi.fn(),
  mockNotifyRateLimit: vi.fn(),
  mockNotifyAPIError: vi.fn(),
  mockCreateProcessingLog: vi.fn(),
  mockUpdateProcessingLog: vi.fn(),
  mockAddProcessingStage: vi.fn(),
  mockGetProcessingLog: vi.fn(),
  mockGoogleAuthGetAccessToken: vi.fn(),
}))

// =============================================================================
// MODULE MOCKS
// =============================================================================

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: mockOpenAICreate } } }
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockAnthropicCreate } }
  }),
}))

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(function () {
    return { getAccessToken: mockGoogleAuthGetAccessToken }
  }),
}))

vi.mock('../middleware/rate-limit.js', () => ({
  aiExtractionLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  ocrLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  chatLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../lib/logger.js', () => {
  const noop = () => {}
  const childLogger = { debug: noop, info: noop, warn: noop, error: noop, child: () => childLogger }
  return { default: childLogger, logger: childLogger }
})

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

vi.mock('../services/prompt-service.js', () => ({
  getExtractionPrompt: (...args: unknown[]) => mockGetExtractionPrompt(...args),
  getChatPrompt: (...args: unknown[]) => mockGetChatPrompt(...args),
}))

vi.mock('../middleware/cost-control.js', () => ({
  calculateCost: (...args: unknown[]) => mockCalculateCost(...args),
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}))

vi.mock('../services/admin-notification-service.js', () => ({
  notifyBillingIssue: (...args: unknown[]) => mockNotifyBillingIssue(...args),
  notifyRateLimit: (...args: unknown[]) => mockNotifyRateLimit(...args),
  notifyAPIError: (...args: unknown[]) => mockNotifyAPIError(...args),
}))

vi.mock('../services/processing-log-service.js', () => ({
  createProcessingLog: (...args: unknown[]) => mockCreateProcessingLog(...args),
  updateProcessingLog: (...args: unknown[]) => mockUpdateProcessingLog(...args),
  addProcessingStage: (...args: unknown[]) => mockAddProcessingStage(...args),
  getProcessingLog: (...args: unknown[]) => mockGetProcessingLog(...args),
}))

vi.mock('../schemas/extraction-schema.js', () => ({
  EXTRACTION_JSON_SCHEMA: {
    name: 'policy_extraction',
    strict: true,
    schema: { type: 'object', properties: {} },
  },
}))

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
// DEFAULT CONFIG & HELPERS
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

function setupDefaultMocks() {
  mockGetAIConfig.mockResolvedValue(DEFAULT_AI_CONFIG)
  mockGetExtractionPrompt.mockResolvedValue(null)
  mockGetChatPrompt.mockResolvedValue(null)
  mockCalculateCost.mockReturnValue({ inputCost: 0.001, outputCost: 0.002, totalCost: 0.003 })
  mockRecordUsage.mockResolvedValue(undefined)
  mockNotifyBillingIssue.mockResolvedValue(undefined)
  mockNotifyRateLimit.mockResolvedValue(undefined)
  mockNotifyAPIError.mockResolvedValue(undefined)
  mockGoogleAuthGetAccessToken.mockResolvedValue(null) // No service account by default
}

const originalEnv = { ...process.env }

async function createApp(env: Record<string, string | undefined> = {}) {
  process.env = { ...originalEnv, ...env }
  vi.resetModules()
  setupDefaultMocks()
  const aiRouter = (await import('../routes/ai')).default
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/ai', aiRouter)
  return app
}

// Helper that makes OpenAI and Anthropic succeed so Google is the only focus
function setupSuccessfulAIProviders() {
  mockOpenAICreate.mockResolvedValue({
    choices: [{ message: { content: 'OK' } }],
    model: 'gpt-4o-mini',
  })
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'OK' }],
    model: 'claude-3-5-haiku-20241022',
  })
}

// =============================================================================
// TESTS
// =============================================================================

describe('AI Routes — Error Classifier & Google Vision Branches', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // classifyDiagnosticError — PROVIDER_OVERLOADED
  // Triggered via diagnose endpoint when OpenAI throws with "overloaded" or "529"
  // ===========================================================================
  describe('classifyDiagnosticError — PROVIDER_OVERLOADED', () => {
    it('classifies "overloaded" keyword as PROVIDER_OVERLOADED via diagnose', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockOpenAICreate.mockRejectedValue(new Error('Claude overloaded'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.valid).toBe(false)
      expect(res.body.openai.errorCode).toBe('PROVIDER_OVERLOADED')
    })

    it('classifies "529" status code as PROVIDER_OVERLOADED via diagnose', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockOpenAICreate.mockRejectedValue(new Error('HTTP 529 service unavailable'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.valid).toBe(false)
      expect(res.body.openai.errorCode).toBe('PROVIDER_OVERLOADED')
    })
  })

  // ===========================================================================
  // classifyDiagnosticError — NOT_FOUND
  // ===========================================================================
  describe('classifyDiagnosticError — NOT_FOUND', () => {
    it('classifies "NOT_FOUND" keyword as NOT_FOUND via diagnose', async () => {
      const app = await createApp({ ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockAnthropicCreate.mockRejectedValue(new Error('NOT_FOUND: model does not exist'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.anthropic.valid).toBe(false)
      expect(res.body.anthropic.errorCode).toBe('NOT_FOUND')
    })

    it('classifies "404" in message as NOT_FOUND via diagnose', async () => {
      const app = await createApp({ ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockAnthropicCreate.mockRejectedValue(new Error('HTTP 404 resource not found'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.anthropic.valid).toBe(false)
      expect(res.body.anthropic.errorCode).toBe('NOT_FOUND')
    })
  })

  // ===========================================================================
  // classifyDiagnosticError — NETWORK_ERROR
  // ===========================================================================
  describe('classifyDiagnosticError — NETWORK_ERROR', () => {
    it('classifies ENOTFOUND as NETWORK_ERROR via diagnose', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockOpenAICreate.mockRejectedValue(new Error('ENOTFOUND api.openai.com'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('NETWORK_ERROR')
    })

    it('classifies ECONNREFUSED as NETWORK_ERROR via diagnose', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockOpenAICreate.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:443'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('NETWORK_ERROR')
    })

    it('classifies ETIMEDOUT as NETWORK_ERROR via diagnose', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockOpenAICreate.mockRejectedValue(new Error('ETIMEDOUT connecting to api.openai.com'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('NETWORK_ERROR')
    })

    it('classifies "fetch failed" as NETWORK_ERROR via diagnose', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockOpenAICreate.mockRejectedValue(new Error('fetch failed'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('NETWORK_ERROR')
    })
  })

  // ===========================================================================
  // classifyDiagnosticError — UNKNOWN_ERROR (fallback)
  // ===========================================================================
  describe('classifyDiagnosticError — UNKNOWN_ERROR', () => {
    it('classifies unrecognized error message as UNKNOWN_ERROR via diagnose', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' })
      mockOpenAICreate.mockRejectedValue(new Error('Something completely different happened'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('UNKNOWN_ERROR')
    })
  })

  // ===========================================================================
  // sanitizeDiagnosticError — production mode mapping for all codes
  // Each errorCode must map to its specified generic user-facing message
  // ===========================================================================
  describe('sanitizeDiagnosticError — production mode message mapping', () => {
    it('maps INVALID_CREDENTIALS to "Service configuration error" in production', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockRejectedValue(new Error('401 Incorrect API key provided'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('INVALID_CREDENTIALS')
      expect(res.body.openai.error).toBe('Service configuration error')
    })

    it('maps RATE_LIMITED to "Service temporarily busy" in production', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockRejectedValue(new Error('429 too many requests'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('RATE_LIMITED')
      expect(res.body.openai.error).toBe('Service temporarily busy')
    })

    it('maps QUOTA_EXHAUSTED to "Service quota exhausted" in production', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockRejectedValue(new Error('insufficient_quota on your account'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('QUOTA_EXHAUSTED')
      expect(res.body.openai.error).toBe('Service quota exhausted')
    })

    it('maps PROVIDER_OVERLOADED to "Service temporarily busy" in production', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockRejectedValue(new Error('system overloaded right now'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('PROVIDER_OVERLOADED')
      expect(res.body.openai.error).toBe('Service temporarily busy')
    })

    it('maps BILLING_ERROR to "Service temporarily unavailable" in production', async () => {
      const app = await createApp({ ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.anthropic.errorCode).toBe('BILLING_ERROR')
      expect(res.body.anthropic.error).toBe('Service temporarily unavailable')
    })

    it('maps NETWORK_ERROR to "Service unreachable" in production', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockRejectedValue(new Error('ENOTFOUND api.openai.com'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('NETWORK_ERROR')
      expect(res.body.openai.error).toBe('Service unreachable')
    })

    it('maps NOT_FOUND to "Service not configured" in production', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockRejectedValue(new Error('NOT_FOUND: resource does not exist'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('NOT_FOUND')
      expect(res.body.openai.error).toBe('Service not configured')
    })

    it('maps UNKNOWN_ERROR to "Service error" in production', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockRejectedValue(new Error('some truly unknown failure'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.openai.errorCode).toBe('UNKNOWN_ERROR')
      expect(res.body.openai.error).toBe('Service error')
    })

    it('production recommendation sanitized when no providers configured', async () => {
      const app = await createApp({ NODE_ENV: 'production' })
      // No AI keys set

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.summary.anyProviderConfigured).toBe(false)
      expect(res.body.summary.recommendation).toBe('AI service not configured - contact support')
    })

    it('production recommendation sanitized when providers invalid', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockRejectedValue(new Error('401 invalid key'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.summary.anyProviderValid).toBe(false)
      expect(res.body.summary.recommendation).toBe(
        'AI service temporarily unavailable - please try again later'
      )
    })

    it('production recommendation when providers are valid', async () => {
      const app = await createApp({ OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.summary.anyProviderValid).toBe(true)
      expect(res.body.summary.recommendation).toBe('AI services available')
    })
  })

  // ===========================================================================
  // GET /diagnose — Google Vision HTTP error response branches
  // Tests the response.ok === false block with various error status codes
  // ===========================================================================
  describe('GET /diagnose — Google Vision HTTP error response branches', () => {
    it('maps UNAUTHENTICATED errorStatus to INVALID_CREDENTIALS', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      setupSuccessfulAIProviders()

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Request had invalid authentication credentials',
              status: 'UNAUTHENTICATED',
              code: 401,
            },
          }),
          { status: 401 }
        )
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('INVALID_CREDENTIALS')
    })

    it('maps httpStatus 401 (no UNAUTHENTICATED status field) to INVALID_CREDENTIALS', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'Authentication failed - check GOOGLE_CLOUD_API_KEY' },
          }),
          { status: 401 }
        )
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('INVALID_CREDENTIALS')
    })

    it('maps FAILED_PRECONDITION errorStatus to BILLING_ERROR', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Billing account not active',
              status: 'FAILED_PRECONDITION',
              code: 400,
            },
          }),
          { status: 400 }
        )
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('BILLING_ERROR')
    })

    it('maps RESOURCE_EXHAUSTED errorStatus to RATE_LIMITED', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Quota exceeded for quota metric',
              status: 'RESOURCE_EXHAUSTED',
              code: 429,
            },
          }),
          { status: 429 }
        )
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('RATE_LIMITED')
    })

    it('maps httpStatus 429 (no status field) to RATE_LIMITED', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Too Many Requests' } }), { status: 429 })
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('RATE_LIMITED')
    })

    it('maps NOT_FOUND errorStatus to NOT_FOUND', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'The requested URL was not found', status: 'NOT_FOUND', code: 404 },
          }),
          { status: 404 }
        )
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('NOT_FOUND')
    })

    it('maps httpStatus 404 (no NOT_FOUND status field) to NOT_FOUND', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Vision API endpoint not found' } }), {
          status: 404,
        })
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('NOT_FOUND')
    })

    it('maps httpStatus 403 (no PERMISSION_DENIED errorStatus) to API_NOT_ENABLED', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'Forbidden', status: 'FORBIDDEN', code: 403 } }),
          { status: 403 }
        )
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('API_NOT_ENABLED')
      // Error message includes the status code
      expect(res.body.google.error).toContain('Permission denied')
    })

    it('records authMethod in successful google response', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ responses: [{}] }), { status: 200 })
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(true)
      expect(res.body.google.authMethod).toBe('api_key')
    })

    it('handles fetch exception in Google Vision diagnostic (catch block)', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED 142.250.185.74:443'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('NETWORK_ERROR')
    })
  })

  // ===========================================================================
  // GET /diagnose — authMethod='none' branch
  // Service account configured but OAuth token retrieval fails + no API key
  // ===========================================================================
  describe('GET /diagnose — authMethod none (both auth methods fail)', () => {
    it('reports INVALID_CREDENTIALS when service account fails and no API key', async () => {
      // Set GOOGLE_APPLICATION_CREDENTIALS so hasServiceAccount=true, but token fails
      const app = await createApp({
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/fake-creds.json',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'test',
        // No GOOGLE_CLOUD_API_KEY — so both auth paths fail
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      // Token retrieval fails
      mockGoogleAuthGetAccessToken.mockResolvedValue(null)

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.configured).toBe(true)
      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('INVALID_CREDENTIALS')
    })

    it('sanitizes authMethod=none error in production', async () => {
      const app = await createApp({
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/fake-creds.json',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'production',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockGoogleAuthGetAccessToken.mockResolvedValue(null)

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('INVALID_CREDENTIALS')
      expect(res.body.google.error).toBe('Service configuration error')
    })
  })

  // ===========================================================================
  // GET /diagnose — API_NOT_ENABLED errorCode maps correctly in sanitization
  // ===========================================================================
  describe('sanitizeDiagnosticError — API_NOT_ENABLED code', () => {
    it('maps API_NOT_ENABLED to "Service not available" in production mode for Google Vision', async () => {
      const app = await createApp({
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        NODE_ENV: 'production',
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Cloud Vision API not enabled',
              status: 'PERMISSION_DENIED',
              code: 403,
            },
          }),
          { status: 403 }
        )
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.errorCode).toBe('API_NOT_ENABLED')
      expect(res.body.google.error).toBe('Service not available')
    })
  })
})
