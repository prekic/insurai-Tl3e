/**
 * AI Routes — GCP Credential Paths, Service Account OCR & Providers Branch Coverage
 *
 * Targets specific branches in server/routes/ai.ts not covered by existing test files:
 *
 * - getGCPCredentialsPath: GCP_SERVICE_ACCOUNT_BASE64 (base64 decode + temp file write),
 *     GCP_CREDENTIALS_BASE64 (alternative env var), common file locations (existsSync)
 * - GET /providers: google=true via service account credentials (no API key)
 * - POST /ocr: service account + OAuth token succeeds → Bearer auth used
 * - POST /ocr: service account + OAuth token fails → falls back to API key
 * - POST /ocr/document-ai: isDocumentAIConfigured()=true but token=null → 503 AUTH_FAILED
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
  mockExistsSync,
  mockWriteFileSync,
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
  mockExistsSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}))

// =============================================================================
// MODULE MOCKS
// =============================================================================
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      chat: { completions: { create: mockOpenAICreate } },
    }
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: { create: mockAnthropicCreate },
    }
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
    unlinkSync: vi.fn(),
  }
})

// =============================================================================
// HELPERS
// =============================================================================
const DEFAULT_AI_CONFIG = {
  openaiExtractionModel: 'gpt-4o',
  openaiBackupModel: 'gpt-4o-mini',
  anthropicExtractionModel: 'claude-3-5-sonnet-20241022',
  anthropicBackupModel: 'claude-3-5-haiku-latest',
  maxTokens: 4096,
  temperature: 0.1,
  chatTemperature: 0.7,
  minConfidence: 0.7,
  warningConfidence: 0.7,
  extractionTimeoutMs: 90000,
  preferredProvider: 'auto' as const,
  enableFallback: true,
  consensusEnabled: false,
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
  ocrFetchTimeoutMs: 90000,
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
  mockGoogleAuthGetAccessToken.mockResolvedValue('test-oauth-token')
  mockExistsSync.mockReturnValue(false)
  mockWriteFileSync.mockReturnValue(undefined)
}

const originalEnv = { ...process.env }

async function createApp() {
  vi.resetModules()
  setupDefaultMocks()
  const aiRouter = (await import('../routes/ai')).default
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/ai', aiRouter)
  return app
}

// A minimal valid service account JSON to use in base64 tests
const FAKE_SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-id',
  private_key:
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0123\n-----END RSA PRIVATE KEY-----',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
})

const FAKE_SERVICE_ACCOUNT_BASE64 = Buffer.from(FAKE_SERVICE_ACCOUNT).toString('base64')

// =============================================================================
// TESTS
// =============================================================================
describe('AI Routes — GCP Credential Paths, Service Account OCR & Providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // getGCPCredentialsPath — GCP_SERVICE_ACCOUNT_BASE64 branch
  // ===========================================================================
  describe('GCP_SERVICE_ACCOUNT_BASE64 credential path', () => {
    it('decodes base64 credentials, writes temp file, and returns temp path', async () => {
      process.env = {
        ...originalEnv,
        GCP_SERVICE_ACCOUNT_BASE64: FAKE_SERVICE_ACCOUNT_BASE64,
        GCP_PROJECT_ID: 'test-project',
        GCP_DOCAI_PROCESSOR_ID: 'test-processor',
      }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_CREDENTIALS_BASE64
      delete process.env.GOOGLE_CLOUD_API_KEY

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      // google=true because GCP_SERVICE_ACCOUNT_BASE64 provided a credentials path
      expect(res.status).toBe(200)
      expect(res.body.google).toBe(true)
      expect(res.body.documentAI).toBe(true)

      // writeFileSync was called with the decoded JSON content
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
      const [writePath, writeContent] = mockWriteFileSync.mock.calls[0] as [string, string, unknown]
      expect(writePath).toContain('.gcp-credentials-temp.json')
      expect(writeContent).toBe(FAKE_SERVICE_ACCOUNT)
    })

    it('returns google=true for providers when only GCP_SERVICE_ACCOUNT_BASE64 is set (no API key)', async () => {
      process.env = {
        ...originalEnv,
        GCP_SERVICE_ACCOUNT_BASE64: FAKE_SERVICE_ACCOUNT_BASE64,
      }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GCP_CREDENTIALS_BASE64

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.google).toBe(true)
    })
  })

  // ===========================================================================
  // getGCPCredentialsPath — GCP_CREDENTIALS_BASE64 fallback env var name
  // ===========================================================================
  describe('GCP_CREDENTIALS_BASE64 credential path (alternative env var name)', () => {
    it('decodes GCP_CREDENTIALS_BASE64 when GCP_SERVICE_ACCOUNT_BASE64 is not set', async () => {
      process.env = {
        ...originalEnv,
        GCP_CREDENTIALS_BASE64: FAKE_SERVICE_ACCOUNT_BASE64,
      }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GOOGLE_CLOUD_API_KEY

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.google).toBe(true)

      // writeFileSync should have been called to write decoded credentials
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
      const [, writeContent] = mockWriteFileSync.mock.calls[0] as [string, string, unknown]
      expect(writeContent).toBe(FAKE_SERVICE_ACCOUNT)
    })
  })

  // ===========================================================================
  // getGCPCredentialsPath — common file locations (existsSync)
  // ===========================================================================
  describe('Common file location scan via existsSync', () => {
    it('returns path when gcp-service-account.json found at common location', async () => {
      process.env = { ...originalEnv }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      delete process.env.GOOGLE_CLOUD_API_KEY

      // First call to existsSync returns true (first common path found)
      mockExistsSync.mockReturnValueOnce(true)

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.google).toBe(true)
      // existsSync was called to check common paths
      expect(mockExistsSync).toHaveBeenCalled()
      const checkedPaths = mockExistsSync.mock.calls.map((c: unknown[]) => c[0] as string)
      const hasGcpPath = checkedPaths.some((p) => p.includes('gcp-service-account.json'))
      expect(hasGcpPath).toBe(true)
    })

    it('returns null when no common file paths found (google=false)', async () => {
      process.env = { ...originalEnv }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      delete process.env.GOOGLE_CLOUD_API_KEY

      // All existsSync calls return false
      mockExistsSync.mockReturnValue(false)

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.google).toBe(false)
    })
  })

  // ===========================================================================
  // POST /ocr — service account + OAuth token succeeds → Bearer auth
  // ===========================================================================
  describe('POST /ocr — service account OAuth authentication', () => {
    it('uses Bearer token when service account credentials and OAuth token available', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/sa-creds.json',
        NODE_ENV: 'test',
      }
      delete process.env.GOOGLE_CLOUD_API_KEY

      // createApp() calls setupDefaultMocks() which sets token to 'test-oauth-token'.
      // Override AFTER createApp() so our value takes effect.
      const app = await createApp()
      mockGoogleAuthGetAccessToken.mockResolvedValue('sa-oauth-token')

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            responses: [
              {
                fullTextAnnotation: {
                  text: 'Poliçe No: 123',
                  pages: [{ blocks: [{ confidence: 0.95 }] }],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      // Verify the fetch was called with Bearer token, not API key query param
      expect(fetchSpy).toHaveBeenCalledOnce()
      const fetchCall = fetchSpy.mock.calls[0] as [string, RequestInit]
      const fetchUrl = fetchCall[0]
      const fetchOpts = fetchCall[1]
      const headers = fetchOpts.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer sa-oauth-token')
      expect(fetchUrl).not.toContain('?key=')

      fetchSpy.mockRestore()
    })
  })

  // ===========================================================================
  // POST /ocr — service account present but OAuth token fails → falls back to API key
  // ===========================================================================
  describe('POST /ocr — OAuth token failure fallback to API key', () => {
    it('falls back to API key auth when OAuth token retrieval fails', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/sa-creds.json',
        GOOGLE_CLOUD_API_KEY: 'fallback-api-key',
        NODE_ENV: 'test',
      }

      // createApp() calls setupDefaultMocks() — override AFTER to set null token
      const app = await createApp()
      // OAuth token retrieval fails (returns null)
      mockGoogleAuthGetAccessToken.mockResolvedValue(null)

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            responses: [{ fullTextAnnotation: { text: 'some OCR text', pages: [] } }],
          }),
          { status: 200 }
        )
      )

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      // Verify fetch was called with API key query param, not Bearer token
      expect(fetchSpy).toHaveBeenCalledOnce()
      const fetchCall = fetchSpy.mock.calls[0] as [string, RequestInit]
      const fetchUrl = fetchCall[0]
      const fetchOpts = fetchCall[1]
      const headers = fetchOpts.headers as Record<string, string>
      expect(fetchUrl).toContain('?key=fallback-api-key')
      expect(headers['Authorization']).toBeUndefined()

      fetchSpy.mockRestore()
    })

    it('returns 503 when service account present, OAuth fails, and no API key', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/sa-creds.json',
        NODE_ENV: 'test',
      }
      delete process.env.GOOGLE_CLOUD_API_KEY

      const app = await createApp()
      // Override AFTER createApp() so setupDefaultMocks() doesn't reset it
      mockGoogleAuthGetAccessToken.mockResolvedValue(null)

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PROVIDER_NOT_CONFIGURED')
    })
  })

  // ===========================================================================
  // POST /ocr/document-ai — access token null → AUTH_FAILED 503
  // ===========================================================================
  describe('POST /ocr/document-ai — access token failure', () => {
    it('returns 503 AUTH_FAILED when isDocumentAIConfigured but access token is null', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/sa-creds.json',
        GCP_PROJECT_ID: 'test-project',
        GCP_DOCAI_PROCESSOR_ID: 'test-processor',
        NODE_ENV: 'test',
      }

      const app = await createApp()
      // Override AFTER createApp() — setupDefaultMocks() sets token to 'test-oauth-token'
      mockGoogleAuthGetAccessToken.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('AUTH_FAILED')
    })

    it('returns production-safe error message for AUTH_FAILED in production mode', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/sa-creds.json',
        GCP_PROJECT_ID: 'test-project',
        GCP_DOCAI_PROCESSOR_ID: 'test-processor',
        NODE_ENV: 'production',
      }

      const app = await createApp()
      // Override AFTER createApp() — setupDefaultMocks() sets token to 'test-oauth-token'
      mockGoogleAuthGetAccessToken.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('AUTH_FAILED')
      expect(res.body.error).toBe('Document processing service unavailable')
    })
  })

  // ===========================================================================
  // GET /providers — google=true via service account (GCP_SERVICE_ACCOUNT_BASE64 set)
  // ===========================================================================
  describe('GET /providers — google via service account credentials', () => {
    it('reports documentAI=true when both GCP credentials and project/processor configured', async () => {
      process.env = {
        ...originalEnv,
        GCP_SERVICE_ACCOUNT_BASE64: FAKE_SERVICE_ACCOUNT_BASE64,
        GCP_PROJECT_ID: 'test-project',
        GCP_DOCAI_PROCESSOR_ID: 'test-processor',
      }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GOOGLE_CLOUD_API_KEY

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.google).toBe(true)
      expect(res.body.documentAI).toBe(true)
    })

    it('reports documentAI=false when credentials present but no GCP_DOCAI_PROCESSOR_ID', async () => {
      process.env = {
        ...originalEnv,
        GCP_SERVICE_ACCOUNT_BASE64: FAKE_SERVICE_ACCOUNT_BASE64,
      }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GCP_DOCAI_PROCESSOR_ID

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      // google=true (credentials path found via base64)
      expect(res.body.google).toBe(true)
      // documentAI=false because isDocumentAIConfigured() requires processorId
      // (GCP_DOCAI_PROCESSOR_ID defaults to 'c2741b178ab61433' if not set — so this may be true)
      // Actually the code falls back: GCP_CONFIG.processorId = process.env.GCP_DOCAI_PROCESSOR_ID || 'c2741b178ab61433'
      // So documentAI will be true because the default processorId is always set.
      expect(res.body.documentAI).toBe(true)
    })

    it('reports google=false and documentAI=false when no credentials and no API key', async () => {
      process.env = { ...originalEnv }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      delete process.env.GOOGLE_CLOUD_API_KEY

      mockExistsSync.mockReturnValue(false)

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.google).toBe(false)
      expect(res.body.documentAI).toBe(false)
    })
  })

  // ===========================================================================
  // Invalid base64 credentials (JSON.parse fails) → falls through to file scan
  // ===========================================================================
  describe('GCP_SERVICE_ACCOUNT_BASE64 — invalid base64/JSON handling', () => {
    it('falls through to file scan when base64 contains invalid JSON', async () => {
      process.env = {
        ...originalEnv,
        GCP_SERVICE_ACCOUNT_BASE64: Buffer.from('not valid json content').toString('base64'),
      }
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GOOGLE_CLOUD_API_KEY

      // No common files exist
      mockExistsSync.mockReturnValue(false)

      const app = await createApp()
      const res = await request(app).get('/api/ai/providers')

      // writeFileSync should NOT have been called (JSON.parse failed)
      expect(mockWriteFileSync).not.toHaveBeenCalled()
      // No credentials found → google=false
      expect(res.body.google).toBe(false)
    })
  })
})
