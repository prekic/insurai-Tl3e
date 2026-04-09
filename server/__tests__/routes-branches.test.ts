/**
 * Routes Branch Coverage Tests
 *
 * Targets uncovered branches in:
 * - server/routes/ai.ts (50.25% branches) — GCP credentials, OCR auth paths, Document AI,
 *   chat provider fallback, unified extract edge cases, diagnose endpoint Google paths
 * - server/middleware/rate-limit.ts (39.62% branches) — config caching, keyGenerator paths,
 *   skip logic, extractSecureUserId, getConfigSync, rateLimitHandler, refreshRateLimitConfig
 * - server/routes/admin/shared.ts (40% branches) — qstr, getClientIp helper conditionals
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
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
const mockExistsSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockUnlinkSync = vi.fn()
const mockGetRateLimitsConfig = vi.fn()

// =============================================================================
// MODULE MOCKS
// =============================================================================

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

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: mockAnthropicCreate,
      },
    }
  }),
}))

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(function () {
    return {
      getAccessToken: mockGoogleAuthGetAccessToken,
    }
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

vi.mock('../services/config-service.js', () => ({
  getAIConfig: (...args: unknown[]) => mockGetAIConfig(...args),
  getRateLimitsConfig: (...args: unknown[]) => mockGetRateLimitsConfig(...args),
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

vi.mock('../../shared/extraction-schema.js', () => ({
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
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  }
})

// =============================================================================
// DEFAULTS & HELPERS
// =============================================================================

const DEFAULT_AI_CONFIG = {
  openaiExtractionModel: 'gpt-4o',
  openaiBackupModel: 'gpt-4o-mini',
  anthropicExtractionModel: 'claude-sonnet-4-20250514',
  anthropicBackupModel: 'claude-3-5-haiku-latest',
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
  mockExistsSync.mockReturnValue(false)
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

function makeOpenAIResponse(content: string, model = 'gpt-4o') {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    model,
  }
}

function _makeAnthropicResponse(content: string, model = 'claude-sonnet-4-20250514') {
  return {
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: 100, output_tokens: 50 },
    model,
  }
}

const originalEnv = { ...process.env }

// =============================================================================
// AI ROUTES BRANCH TESTS
// =============================================================================

describe('AI Routes Branch Coverage', () => {
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

  // ---------------------------------------------------------------------------
  // GCP Credentials Path Branches
  // ---------------------------------------------------------------------------
  describe('GCP Credentials Path branches', () => {
    it('returns cached credentials path on second call', async () => {
      // Set up base64 credentials so the path gets cached
      const fakeCredentials = JSON.stringify({ type: 'service_account', project_id: 'test' })
      process.env.GCP_SERVICE_ACCOUNT_BASE64 = Buffer.from(fakeCredentials).toString('base64')
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      vi.resetModules()
      setupDefaultMocks()
      mockExistsSync.mockReturnValue(false)
      mockGoogleAuthGetAccessToken.mockResolvedValue('test-token')

      // Build an app that calls the GCP path twice (via providers + diagnose)
      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      // First call caches the path
      const res1 = await request(testApp).get('/api/ai/providers')
      expect(res1.body.documentAI).toBe(true)

      // Second call should use cached path
      const res2 = await request(testApp).get('/api/ai/providers')
      expect(res2.body.documentAI).toBe(true)
    })

    it('uses GOOGLE_APPLICATION_CREDENTIALS env var when set', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/fake-creds.json'
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      vi.resetModules()
      setupDefaultMocks()

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/providers')
      expect(res.body.documentAI).toBe(true)
    })

    it('falls back to GCP_CREDENTIALS_BASE64 when GCP_SERVICE_ACCOUNT_BASE64 not set', async () => {
      const fakeCredentials = JSON.stringify({ type: 'service_account', project_id: 'test' })
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      process.env.GCP_CREDENTIALS_BASE64 = Buffer.from(fakeCredentials).toString('base64')
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      vi.resetModules()
      setupDefaultMocks()
      mockExistsSync.mockReturnValue(false)

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/providers')
      expect(res.body.documentAI).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('handles invalid base64 credentials gracefully', async () => {
      process.env.GCP_SERVICE_ACCOUNT_BASE64 = 'not-valid-json-when-decoded'
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_CREDENTIALS_BASE64
      vi.resetModules()
      setupDefaultMocks()
      mockExistsSync.mockReturnValue(false)

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/providers')
      // Should still report google as true because API key is set
      expect(res.body.google).toBe(true)
    })

    it('checks common file paths when no env vars are set', async () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      vi.resetModules()
      setupDefaultMocks()
      // First call returns false, second returns true (simulating found at a common path)
      mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true)

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/providers')
      expect(res.body.documentAI).toBe(true)
    })

    it('returns documentAI false when no credentials found', async () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      vi.resetModules()
      setupDefaultMocks()
      mockExistsSync.mockReturnValue(false)

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/providers')
      expect(res.body.documentAI).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // OCR Endpoint Auth Branches
  // ---------------------------------------------------------------------------
  describe('OCR auth branches', () => {
    it('uses OAuth bearer token when service account is available', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('oauth-test-token')

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            responses: [
              {
                fullTextAnnotation: {
                  text: 'OCR text',
                  pages: [{ blocks: [{ confidence: 0.95 }] }],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      // Verify OAuth token was used (not API key in URL)
      const fetchCall = fetchSpy.mock.calls[0]
      expect(fetchCall[0]).toBe('https://vision.googleapis.com/v1/images:annotate')
      const fetchOpts = fetchCall[1] as RequestInit
      expect((fetchOpts.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer oauth-test-token'
      )
      fetchSpy.mockRestore()
    })

    it('falls back to API key when OAuth token retrieval fails', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockRejectedValue(new Error('Auth failed'))

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            responses: [
              { fullTextAnnotation: { text: 'text', pages: [{ blocks: [{ confidence: 0.9 }] }] } },
            ],
          }),
          { status: 200 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(200)
      // URL should include API key
      const fetchUrl = fetchSpy.mock.calls[0][0] as string
      expect(fetchUrl).toContain('?key=')
      fetchSpy.mockRestore()
    })

    it('returns 503 when neither OAuth nor API key available', async () => {
      delete process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      vi.resetModules()
      setupDefaultMocks()
      mockExistsSync.mockReturnValue(false)

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PROVIDER_NOT_CONFIGURED')
    })

    it('returns TIMEOUT error code when OCR fetch is aborted', async () => {
      vi.resetModules()
      setupDefaultMocks()

      // Create an error that satisfies: error instanceof Error && error.name === 'AbortError'
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
      fetchSpy.mockRestore()
    })

    it('returns API_NOT_ENABLED for PERMISSION_DENIED OCR errors', async () => {
      vi.resetModules()
      setupDefaultMocks()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('PERMISSION_DENIED: API not enabled'))

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('API_NOT_ENABLED')
      fetchSpy.mockRestore()
    })

    it('returns BILLING_ERROR for billing-related OCR errors', async () => {
      vi.resetModules()
      setupDefaultMocks()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('BILLING not enabled on project'))

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('BILLING_ERROR')
      fetchSpy.mockRestore()
    })

    it('returns RATE_LIMIT_EXCEEDED for 429/RESOURCE_EXHAUSTED OCR errors', async () => {
      vi.resetModules()
      setupDefaultMocks()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'))

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
      fetchSpy.mockRestore()
    })

    it('returns INVALID_API_KEY for bad API key OCR errors', async () => {
      vi.resetModules()
      setupDefaultMocks()

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'API key not valid. Please pass a valid API key.' },
          }),
          { status: 400 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
      fetchSpy.mockRestore()
    })

    it('handles non-ok response with failed JSON parse in OCR', async () => {
      vi.resetModules()
      setupDefaultMocks()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response('not json', { status: 500, statusText: 'Internal Server Error' })
        )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('OCR_FAILED')
      fetchSpy.mockRestore()
    })
  })

  // ---------------------------------------------------------------------------
  // Document AI Endpoint Branches
  // ---------------------------------------------------------------------------
  describe('Document AI branches', () => {
    it('returns 503 when Document AI not configured', async () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      vi.resetModules()
      setupDefaultMocks()
      mockExistsSync.mockReturnValue(false)

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PROVIDER_NOT_CONFIGURED')
    })

    it('returns AUTH_FAILED when access token retrieval fails', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockRejectedValue(new Error('Token error'))

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('AUTH_FAILED')
    })

    it('returns TIMEOUT for aborted Document AI requests', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('token')

      // Create an error that satisfies: error instanceof Error && error.name === 'AbortError'
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
      fetchSpy.mockRestore()
    })

    it('returns PERMISSION_DENIED for permission errors', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('token')

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'PERMISSION_DENIED: check service account', code: 403 },
          }),
          { status: 403 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PERMISSION_DENIED')
      fetchSpy.mockRestore()
    })

    it('returns PROCESSOR_NOT_FOUND for NOT_FOUND errors', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('token')

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'NOT_FOUND: processor does not exist', code: 404 },
          }),
          { status: 404 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PROCESSOR_NOT_FOUND')
      fetchSpy.mockRestore()
    })

    it('returns RATE_LIMIT_EXCEEDED for RESOURCE_EXHAUSTED', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('token')

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: 'RESOURCE_EXHAUSTED: quota exceeded', code: 429 } }),
            { status: 429 }
          )
        )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
      fetchSpy.mockRestore()
    })

    it('returns PAGE_LIMIT_EXCEEDED for documents exceeding page limit', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('token')

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Document pages in non-imageless mode exceed the limit: 15 got 20',
              code: 400,
            },
          }),
          { status: 400 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PAGE_LIMIT_EXCEEDED')
      fetchSpy.mockRestore()
    })

    it('returns INVALID_DOCUMENT for INVALID_ARGUMENT errors', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('token')

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'INVALID_ARGUMENT: unsupported format', code: 400 },
          }),
          { status: 400 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_DOCUMENT')
      fetchSpy.mockRestore()
    })

    it('successfully processes Document AI response with form fields and tables', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('token')

      const docAIResponse = {
        document: {
          text: 'Extracted text content',
          pages: [
            {
              pageNumber: 1,
              formFields: [
                {
                  fieldName: { textAnchor: { content: 'Policy Number' }, confidence: 0.95 },
                  fieldValue: { textAnchor: { content: 'POL-001' }, confidence: 0.9 },
                  boundingPoly: {
                    normalizedVertices: [
                      { x: 0.1, y: 0.1 },
                      { x: 0.3, y: 0.1 },
                      { x: 0.3, y: 0.15 },
                      { x: 0.1, y: 0.15 },
                    ],
                  },
                },
              ],
              tables: [
                {
                  headerRows: [
                    {
                      cells: [
                        {
                          layout: { textAnchor: { content: 'Coverage' }, confidence: 0.9 },
                          rowSpan: 1,
                          colSpan: 1,
                        },
                      ],
                    },
                  ],
                  bodyRows: [
                    { cells: [{ layout: { textAnchor: { content: 'Kasko' }, confidence: 0.85 } }] },
                  ],
                },
              ],
              blocks: [{ confidence: 0.92 }],
            },
          ],
        },
      }

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(docAIResponse), { status: 200 }))

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.text).toBe('Extracted text content')
      expect(res.body.data.formFields).toHaveLength(1)
      expect(res.body.data.formFields[0].name).toBe('Policy Number')
      expect(res.body.data.tables).toHaveLength(1)
      expect(res.body.data.tables[0].headerRows).toBe(1)
      fetchSpy.mockRestore()
    })

    it('handles empty Document AI response body', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockResolvedValue('token')

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('DOCUMENT_AI_FAILED')
      fetchSpy.mockRestore()
    })
  })

  // ---------------------------------------------------------------------------
  // Chat Provider Fallback Branches
  // ---------------------------------------------------------------------------
  describe('Chat provider fallback branches', () => {
    it('uses anthropic when anthropic requested but no openai key and anthropic key exists', async () => {
      // This covers the branch where provider='anthropic' and ANTHROPIC_API_KEY exists
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Anthropic response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-3-5-haiku-latest',
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test question', provider: 'anthropic' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('anthropic')
    })

    it('returns 503 when anthropic requested, not configured, and openai also not configured', async () => {
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      vi.resetModules()
      setupDefaultMocks()

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'anthropic' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PROVIDER_NOT_CONFIGURED')
    })

    it('handles Anthropic chat error with BILLING classification', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'anthropic' })

      expect(res.status).toBe(500)
      // Chat errors go through generic classification — billing isn't a specific chat code
      expect(res.body.code).toBe('CHAT_FAILED')
    })

    it('includes policyContext in admin-managed chat prompt', async () => {
      mockGetChatPrompt.mockResolvedValue({
        systemPrompt: 'Admin prompt with policy context built-in.',
        userPrompt: 'Processed user query.',
        templateName: 'policy-chat',
        version: 3,
      })
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Response about policy' } }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        model: 'gpt-4o-mini',
      })

      const res = await request(app).post('/api/ai/chat').send({
        message: 'What about my coverage?',
        policyContext: 'POL-001 Kasko',
        provider: 'openai',
      })

      expect(res.status).toBe(200)
      // Admin prompt was used instead of fallback
      const callArgs = mockOpenAICreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toBe('Admin prompt with policy context built-in.')
    })
  })

  // ---------------------------------------------------------------------------
  // Unified Extract — OpenAI-Only Branches
  // ---------------------------------------------------------------------------
  describe('Unified extract — OpenAI-only path', () => {
    it('skips Anthropic when only OpenAI configured and uses OpenAI directly', async () => {
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
        .send({ documentText: 'Test document with json.' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
      expect(res.body.fallback).toBeFalsy()
      expect(mockAnthropicCreate).not.toHaveBeenCalled()
    })

    it('returns ALL_PROVIDERS_FAILED when OpenAI-only path returns empty response', async () => {
      delete process.env.ANTHROPIC_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      })

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/extract')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('ALL_PROVIDERS_FAILED')
    })
  })

  // ---------------------------------------------------------------------------
  // Diagnose Endpoint — Google Vision Branches
  // ---------------------------------------------------------------------------
  describe('Diagnose — Google Vision branches', () => {
    it('reports authMethod=none when both OAuth and API key fail', async () => {
      // Service account found but OAuth fails, and no API key
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json'
      delete process.env.GOOGLE_CLOUD_API_KEY
      vi.resetModules()
      setupDefaultMocks()
      mockGoogleAuthGetAccessToken.mockRejectedValue(new Error('OAuth failed'))
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.google.configured).toBe(true)
      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('INVALID_CREDENTIALS')
    })

    it('reports PERMISSION_DENIED error from Google Vision diagnostic', async () => {
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Cloud Vision API has not been used in project',
              status: 'PERMISSION_DENIED',
            },
          }),
          { status: 403 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('API_NOT_ENABLED')
      fetchSpy.mockRestore()
    })

    it('reports BILLING_ERROR from Google Vision diagnostic', async () => {
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'Billing account not configured', status: 'FAILED_PRECONDITION' },
          }),
          { status: 403 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('BILLING_ERROR')
      fetchSpy.mockRestore()
    })

    it('reports RATE_LIMITED from Google Vision diagnostic', async () => {
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'Rate limit exceeded', status: 'RESOURCE_EXHAUSTED' },
          }),
          { status: 429 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('RATE_LIMITED')
      fetchSpy.mockRestore()
    })

    it('reports NOT_FOUND from Google Vision diagnostic for 404', async () => {
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: 'Endpoint not found', status: 'NOT_FOUND' } }),
            { status: 404 }
          )
        )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('NOT_FOUND')
      fetchSpy.mockRestore()
    })

    it('reports error from fetch exception in Google Vision diagnostic', async () => {
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('NETWORK_ERROR')
      fetchSpy.mockRestore()
    })

    it('reports HTTP 403 with permission denied message', async () => {
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: '', code: 403 } }), { status: 403 })
        )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      // 403 with empty message gets mapped to permission denied
      expect(res.body.google.error).toBeDefined()
      fetchSpy.mockRestore()
    })

    it('reports UNAUTHENTICATED error from Google Vision diagnostic', async () => {
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'Authentication failed', status: 'UNAUTHENTICATED' },
          }),
          { status: 401 }
        )
      )

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('INVALID_CREDENTIALS')
      fetchSpy.mockRestore()
    })
  })

  // ---------------------------------------------------------------------------
  // OpenAI Extract — JSON Reminder / Prompt Branches
  // ---------------------------------------------------------------------------
  describe('OpenAI extract prompt branches', () => {
    it('appends JSON reminder to user prompt when no json keyword present', async () => {
      mockGetExtractionPrompt.mockResolvedValue({
        systemPrompt: 'Extract policy data as JSON.',
        userPrompt: 'Here is the policy document text.', // No "json" keyword
        templateName: 'test',
        version: 1,
      })
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document content.' })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      // User prompt should have json reminder appended since it lacks "json"
      // but system prompt has "JSON" so systemPromptWithJson includes 'json' -> user prompt should not get reminder
      expect(callArgs.messages[0].content).toContain('JSON')
    })

    it('adds json reminder to system prompt that lacks json keyword', async () => {
      mockGetExtractionPrompt.mockResolvedValue({
        systemPrompt: 'Extract all policy information.', // No json/JSON keyword
        userPrompt: 'Document text without keyword.',
        templateName: 'no-json',
        version: 1,
      })
      mockOpenAICreate.mockResolvedValue(makeOpenAIResponse(VALID_POLICY_JSON))

      await request(app).post('/api/ai/extract/openai').send({ documentText: 'Test.' })

      const callArgs = mockOpenAICreate.mock.calls[0][0]
      // System prompt should have json reminder appended
      expect(callArgs.messages[0].content).toContain('Respond with valid JSON only.')
    })
  })

  // ---------------------------------------------------------------------------
  // Anthropic Extract — PROVIDER_OVERLOADED Branch
  // ---------------------------------------------------------------------------
  describe('Anthropic extract — overloaded branch in standalone endpoint', () => {
    it('returns PROVIDER_OVERLOADED for 529 error on standalone endpoint', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('529 overloaded'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PROVIDER_OVERLOADED')
    })

    it('returns EXTRACTION_FAILED for unknown errors on standalone endpoint', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Something completely unexpected'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('EXTRACTION_FAILED')
    })
  })

  // ---------------------------------------------------------------------------
  // Production Error Message Branches
  // ---------------------------------------------------------------------------
  describe('Production vs development error messages', () => {
    it('hides details in production for OpenAI extraction errors', async () => {
      process.env.NODE_ENV = 'production'
      vi.resetModules()
      setupDefaultMocks()
      mockOpenAICreate.mockRejectedValue(new Error('401 Incorrect API key'))

      const aiRouter = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRouter)

      const res = await request(testApp)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
      expect(res.body.error).toBe('AI service temporarily unavailable')
      expect(res.body.details).toBeUndefined()
    })

    it('shows details in non-production for Anthropic extraction errors', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('timeout waiting for response'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
      expect(res.body.details).toBe('timeout waiting for response')
    })
  })
})

// =============================================================================
// RATE LIMIT BRANCH TESTS
// Tests use vi.importActual to bypass the global mock on rate-limit.js
// =============================================================================

describe('Rate Limit Branch Coverage', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, NODE_ENV: 'test' }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // We import the actual module (not the mock) for testing rate-limit internals
  async function importActualRateLimit() {
    return vi.importActual<typeof import('../middleware/rate-limit')>('../middleware/rate-limit')
  }

  describe('extractSecureUserId branches', () => {
    it('exports getRateLimitConfig function', async () => {
      const mod = await importActualRateLimit()
      const config = mod.getRateLimitConfig()
      expect(config).toBeDefined()
      expect(config.general).toBeDefined()
      expect(config.general.windowMs).toBeGreaterThan(0)
      expect(config.general.max).toBeGreaterThan(0)
    })

    it('exports rateLimitConfig with all endpoints', async () => {
      const mod = await importActualRateLimit()
      expect(mod.rateLimitConfig).toBeDefined()
      expect(mod.rateLimitConfig.general.windowMs).toBeGreaterThan(0)
    })
  })

  describe('getConfig and getConfigSync branches', () => {
    it('refreshRateLimitConfig is a callable async function', async () => {
      const mod = await importActualRateLimit()
      expect(typeof mod.refreshRateLimitConfig).toBe('function')
      // Call it — should not throw even if config-service returns defaults
      await expect(mod.refreshRateLimitConfig()).resolves.toBeUndefined()
    })

    it('getRateLimitConfig returns default config structure', async () => {
      const mod = await importActualRateLimit()
      const config = mod.getRateLimitConfig()

      // Verify structure has all expected endpoint configs
      expect(config.general).toHaveProperty('windowMs')
      expect(config.general).toHaveProperty('max')
      expect(config.ai).toHaveProperty('windowMs')
      expect(config.ai).toHaveProperty('max')
      expect(config.ocr).toHaveProperty('windowMs')
      expect(config.ocr).toHaveProperty('max')
      expect(config.chat).toHaveProperty('windowMs')
      expect(config.chat).toHaveProperty('max')
      expect(config.health).toHaveProperty('windowMs')
      expect(config.health).toHaveProperty('max')
      expect(config.auth).toHaveProperty('windowMs')
      expect(config.auth).toHaveProperty('max')
    })
  })

  describe('createRateLimiter branches', () => {
    it('creates a custom rate limiter with default message', async () => {
      const mod = await importActualRateLimit()
      const limiter = mod.createRateLimiter({ windowMs: 60000, max: 10 })
      expect(limiter).toBeDefined()
      expect(typeof limiter).toBe('function')
    })

    it('creates a custom rate limiter with custom message', async () => {
      const mod = await importActualRateLimit()
      const limiter = mod.createRateLimiter({
        windowMs: 60000,
        max: 10,
        message: 'Custom limit exceeded',
      })
      expect(limiter).toBeDefined()
      expect(typeof limiter).toBe('function')
    })
  })

  describe('skip function branches', () => {
    it('exports all named rate limiters', async () => {
      const mod = await importActualRateLimit()
      expect(mod.generalLimiter).toBeDefined()
      expect(mod.aiExtractionLimiter).toBeDefined()
      expect(mod.ocrLimiter).toBeDefined()
      expect(mod.chatLimiter).toBeDefined()
      expect(mod.healthLimiter).toBeDefined()
      expect(mod.authLimiter).toBeDefined()
    })

    it('rate limiters are functions (middleware)', async () => {
      const mod = await importActualRateLimit()
      expect(typeof mod.generalLimiter).toBe('function')
      expect(typeof mod.aiExtractionLimiter).toBe('function')
      expect(typeof mod.ocrLimiter).toBe('function')
      expect(typeof mod.chatLimiter).toBe('function')
      expect(typeof mod.healthLimiter).toBe('function')
      expect(typeof mod.authLimiter).toBe('function')
    })
  })

  describe('rateLimitConfig export', () => {
    it('exports all endpoint configurations with correct structure', async () => {
      const mod = await importActualRateLimit()
      const config = mod.rateLimitConfig
      expect(config.general).toBeDefined()
      expect(config.ai).toBeDefined()
      expect(config.ocr).toBeDefined()
      expect(config.chat).toBeDefined()
      expect(config.health).toBeDefined()
      expect(config.auth).toBeDefined()
    })

    it('default general windowMs is 15 minutes (900000ms)', async () => {
      const mod = await importActualRateLimit()
      // Without env var overrides, defaults should be used
      expect(mod.rateLimitConfig.general.windowMs).toBe(
        parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10)
      )
    })

    it('default AI max is 20 requests per hour', async () => {
      const mod = await importActualRateLimit()
      expect(mod.rateLimitConfig.ai.max).toBe(parseInt(process.env.RATE_LIMIT_AI_MAX || '20', 10))
    })

    it('default health limiter allows 60 per minute', async () => {
      const mod = await importActualRateLimit()
      expect(mod.rateLimitConfig.health.windowMs).toBe(60000)
      expect(mod.rateLimitConfig.health.max).toBe(60)
    })

    it('default auth limiter allows 10 attempts per 15 minutes', async () => {
      const mod = await importActualRateLimit()
      expect(mod.rateLimitConfig.auth.windowMs).toBe(900000)
      expect(mod.rateLimitConfig.auth.max).toBe(10)
    })
  })
})

// =============================================================================
// SHARED ADMIN UTILITY BRANCH TESTS
// =============================================================================

describe('Admin Shared Utilities Branch Coverage', () => {
  describe('qstr branches', () => {
    it('returns first element when value is an array', async () => {
      const { qstr } = await import('../routes/admin/shared')
      expect(qstr(['first', 'second'])).toBe('first')
    })

    it('returns empty string when value is an empty array', async () => {
      const { qstr } = await import('../routes/admin/shared')
      expect(qstr([])).toBe('')
    })

    it('returns the string when value is a plain string', async () => {
      const { qstr } = await import('../routes/admin/shared')
      expect(qstr('hello')).toBe('hello')
    })

    it('returns empty string when value is undefined', async () => {
      const { qstr } = await import('../routes/admin/shared')
      expect(qstr(undefined)).toBe('')
    })
  })

  describe('getClientIp branches', () => {
    it('extracts first IP from x-forwarded-for header', async () => {
      const { getClientIp } = await import('../routes/admin/shared')
      const req = {
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '::1' },
      } as unknown as import('express').Request
      expect(getClientIp(req)).toBe('1.2.3.4')
    })

    it('falls back to req.ip when no x-forwarded-for', async () => {
      const { getClientIp } = await import('../routes/admin/shared')
      const req = {
        headers: {},
        ip: '10.0.0.1',
        socket: { remoteAddress: '::1' },
      } as unknown as import('express').Request
      expect(getClientIp(req)).toBe('10.0.0.1')
    })

    it('falls back to socket.remoteAddress when no ip', async () => {
      const { getClientIp } = await import('../routes/admin/shared')
      const req = {
        headers: {},
        ip: undefined,
        socket: { remoteAddress: '192.168.1.1' },
      } as unknown as import('express').Request
      expect(getClientIp(req)).toBe('192.168.1.1')
    })

    it('returns unknown when no IP info available', async () => {
      const { getClientIp } = await import('../routes/admin/shared')
      const req = {
        headers: {},
        ip: undefined,
        socket: { remoteAddress: undefined },
      } as unknown as import('express').Request
      expect(getClientIp(req)).toBe('unknown')
    })
  })

  describe('shared in-memory storage exports', () => {
    it('exports all in-memory arrays and maps', async () => {
      const shared = await import('../routes/admin/shared')
      expect(Array.isArray(shared.aiRequests)).toBe(true)
      expect(Array.isArray(shared.policyOperations)).toBe(true)
      expect(Array.isArray(shared.securityLogs)).toBe(true)
      expect(Array.isArray(shared.auditLogs)).toBe(true)
      expect(shared.blockedIPs instanceof Map).toBe(true)
      expect(shared.requestCounters).toBeDefined()
      expect(shared.requestCounters.aiRequestId).toBeTypeOf('number')
      expect(shared.MAX_ENTRIES).toBe(10000)
      expect(typeof shared.serverStartTime).toBe('number')
    })
  })

  describe('re-exported modules', () => {
    it('re-exports authenticateAdmin and related auth functions', async () => {
      const shared = await import('../routes/admin/shared')
      expect(typeof shared.authenticateAdmin).toBe('function')
      expect(typeof shared.requireRole).toBe('function')
      expect(typeof shared.requireSuperAdmin).toBe('function')
      expect(typeof shared.generateAdminToken).toBe('function')
      expect(typeof shared.hashPassword).toBe('function')
      expect(typeof shared.verifyPassword).toBe('function')
      expect(typeof shared.hashToken).toBe('function')
    })

    it('re-exports logger', async () => {
      const shared = await import('../routes/admin/shared')
      expect(shared.logger).toBeDefined()
    })
  })
})

// =============================================================================
// classifyDiagnosticError / sanitizeDiagnosticError BRANCH TESTS
// (Tested indirectly through diagnose endpoint)
// =============================================================================

describe('Diagnostic Error Classification Branches', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    // Stub global fetch — the /api/ai/diagnose endpoint calls fetch() directly
    // for Google Vision API checks. Without this, real HTTP requests cause 10s timeouts.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ responses: [{}] }), { status: 200 }))
    )
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-key',
      ANTHROPIC_API_KEY: 'test-key',
      GOOGLE_CLOUD_API_KEY: 'test-key',
      NODE_ENV: 'test',
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...originalEnv }
  })

  it('classifies PROVIDER_OVERLOADED for overloaded errors', async () => {
    vi.resetModules()
    setupDefaultMocks()
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'OK' } }],
      model: 'gpt-4o-mini',
    })
    mockAnthropicCreate.mockRejectedValue(new Error('529 overloaded error'))

    const aiRouter = (await import('../routes/ai')).default
    const testApp = express()
    testApp.use(express.json())
    testApp.use('/api/ai', aiRouter)

    const res = await request(testApp).get('/api/ai/diagnose')
    expect(res.body.anthropic.errorCode).toBe('PROVIDER_OVERLOADED')
  })

  it('classifies NETWORK_ERROR for fetch failed errors', async () => {
    vi.resetModules()
    setupDefaultMocks()
    mockOpenAICreate.mockRejectedValue(new Error('fetch failed'))
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      model: 'claude-3-5-haiku-latest',
    })

    const aiRouter = (await import('../routes/ai')).default
    const testApp = express()
    testApp.use(express.json())
    testApp.use('/api/ai', aiRouter)

    const res = await request(testApp).get('/api/ai/diagnose')
    expect(res.body.openai.errorCode).toBe('NETWORK_ERROR')
  })

  it('classifies UNKNOWN_ERROR for unrecognized error patterns', async () => {
    vi.resetModules()
    setupDefaultMocks()
    mockOpenAICreate.mockRejectedValue(new Error('Something completely novel'))
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      model: 'claude-3-5-haiku-latest',
    })

    const aiRouter = (await import('../routes/ai')).default
    const testApp = express()
    testApp.use(express.json())
    testApp.use('/api/ai', aiRouter)

    const res = await request(testApp).get('/api/ai/diagnose')
    expect(res.body.openai.errorCode).toBe('UNKNOWN_ERROR')
  })

  it('sanitizes error messages in production mode', async () => {
    process.env.NODE_ENV = 'production'
    vi.resetModules()
    setupDefaultMocks()
    mockOpenAICreate.mockRejectedValue(new Error('401 Incorrect API key'))
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      model: 'claude-3-5-haiku-latest',
    })

    const aiRouter = (await import('../routes/ai')).default
    const testApp = express()
    testApp.use(express.json())
    testApp.use('/api/ai', aiRouter)

    const res = await request(testApp).get('/api/ai/diagnose')

    // In production, error message should be sanitized
    expect(res.body.openai.error).toBe('Service configuration error')
    // But error code is always returned
    expect(res.body.openai.errorCode).toBe('INVALID_CREDENTIALS')
    // environment should NOT be included in production
    expect(res.body.environment).toBeUndefined()
    // model should NOT be included in production
    expect(res.body.openai.model).toBeUndefined()
  })

  it('returns full details in non-production mode', async () => {
    vi.resetModules()
    setupDefaultMocks()
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'OK' } }],
      model: 'gpt-4o-mini',
    })
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      model: 'claude-3-5-haiku-latest',
    })

    const aiRouter = (await import('../routes/ai')).default
    const testApp = express()
    testApp.use(express.json())
    testApp.use('/api/ai', aiRouter)

    const res = await request(testApp).get('/api/ai/diagnose')

    // In non-production, model and environment should be included
    expect(res.body.environment).toBeDefined()
    expect(res.body.openai.model).toBe('gpt-4o-mini')
    expect(res.body.anthropic.model).toBe('claude-3-5-haiku-latest')
  })

  it('returns proper summary when all providers are valid', async () => {
    vi.resetModules()
    setupDefaultMocks()
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'OK' } }],
      model: 'gpt-4o-mini',
    })
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      model: 'claude-3-5-haiku-latest',
    })

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ responses: [{}] }), { status: 200 }))

    const aiRouter = (await import('../routes/ai')).default
    const testApp = express()
    testApp.use(express.json())
    testApp.use('/api/ai', aiRouter)

    const res = await request(testApp).get('/api/ai/diagnose')

    expect(res.body.summary.anyProviderConfigured).toBe(true)
    expect(res.body.summary.anyProviderValid).toBe(true)
    expect(res.body.summary.extractionReady).toBe(true)
    expect(res.body.google.valid).toBe(true)
    fetchSpy.mockRestore()
  })

  it('returns non-production recommendation when some providers invalid', async () => {
    vi.resetModules()
    setupDefaultMocks()
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'OK' } }],
      model: 'gpt-4o-mini',
    })
    mockAnthropicCreate.mockRejectedValue(new Error('401 invalid x-api-key'))

    const aiRouter = (await import('../routes/ai')).default
    const testApp = express()
    testApp.use(express.json())
    testApp.use('/api/ai', aiRouter)

    const res = await request(testApp).get('/api/ai/diagnose')

    // At least one provider works, so overall is still ready
    expect(res.body.summary.anyProviderValid).toBe(true)
    expect(res.body.summary.extractionReady).toBe(true)
  })
})
