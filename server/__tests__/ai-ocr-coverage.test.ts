/**
 * AI Routes OCR & Remaining Branch Coverage Tests
 *
 * Targets uncovered branches in server/routes/ai.ts:
 * - OCR endpoint: production error messages, cost tracking edge cases
 * - Document AI: success path with partial data (missing fields, empty pages/tables)
 * - Chat: error classification (INVALID_API_KEY, RATE_LIMIT_EXCEEDED, TIMEOUT), production mode
 * - Diagnose: OAuth success path, HTTP 400 with no error status, production mode
 * - Processing log endpoints: create/update/stage/get with validation and errors
 * - Helper functions: buildConfidencePromptSection, GCP credential path resolution
 * - Unified extract: fallback chain, admin notifications on errors
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
  mockGoogleAuthGetAccessToken.mockResolvedValue('test-oauth-token')
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

// =============================================================================
// TESTS
// =============================================================================
describe('AI Routes - OCR & Branch Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // OCR Endpoint: Production Mode Error Messages
  // ===========================================================================
  describe('OCR endpoint - production error messages', () => {
    it('returns generic timeout message in production', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()

      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
      expect(res.body.error).toBe('Request timed out, please try again')
      expect(res.body.details).toBeUndefined() // No details in production
      fetchSpy.mockRestore()
    })

    it('returns generic INVALID_API_KEY message in production', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'API key not valid. Please pass a valid API key.' },
          }),
          { status: 400 }
        )
      )

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
      expect(res.body.error).toBe('Document scanning service unavailable')
      expect(res.body.details).toBeUndefined()
      fetchSpy.mockRestore()
    })

    it('returns generic API_NOT_ENABLED message in production', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('PERMISSION_DENIED: Vision API not enabled'))

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('API_NOT_ENABLED')
      expect(res.body.error).toBe('Document scanning service unavailable')
      fetchSpy.mockRestore()
    })

    it('returns generic BILLING_ERROR message in production', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('BILLING not enabled'))

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('BILLING_ERROR')
      expect(res.body.error).toBe('Document scanning service unavailable')
      fetchSpy.mockRestore()
    })

    it('returns generic RATE_LIMIT_EXCEEDED message in production', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'))

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(res.body.error).toBe('Service busy, please try again later')
      fetchSpy.mockRestore()
    })

    it('returns generic OCR_FAILED message for unknown errors in production', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Something completely unexpected'))

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('OCR_FAILED')
      expect(res.body.error).toBe('Unable to process scanned document')
      expect(res.body.details).toBeUndefined()
      fetchSpy.mockRestore()
    })

    it('includes details in non-production mode', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Specific test error'))

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('OCR_FAILED')
      expect(res.body.details).toBe('Specific test error')
      fetchSpy.mockRestore()
    })

    it('handles non-Error exceptions', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue('string error')

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('OCR_FAILED')
      fetchSpy.mockRestore()
    })
  })

  // ===========================================================================
  // OCR Endpoint: Cost Tracking
  // ===========================================================================
  describe('OCR endpoint - cost tracking', () => {
    it('tracks cost based on page count from annotation', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            responses: [
              {
                fullTextAnnotation: {
                  text: 'Page 1 text',
                  pages: [
                    { blocks: [{ confidence: 0.95 }] },
                    { blocks: [{ confidence: 0.9 }] },
                    { blocks: [{ confidence: 0.85 }] },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(200)
      expect(res.body.data.pageCount).toBe(3)
      // Cost = 3 pages * 0.0015 = 0.0045
      expect(res.body.cost).toBeCloseTo(0.0045, 4)
      expect(mockRecordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          model: 'cloud-vision-v1',
          operation: 'ocr',
          totalCost: expect.closeTo(0.0045, 4),
        })
      )
      fetchSpy.mockRestore()
    })

    it('defaults page count to 1 when pages array is absent', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            responses: [
              {
                fullTextAnnotation: { text: 'text only' },
              },
            ],
          }),
          { status: 200 }
        )
      )

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(200)
      expect(res.body.data.pageCount).toBe(1)
      expect(res.body.data.confidence).toBe(0)
      fetchSpy.mockRestore()
    })

    it('returns empty text when no annotation present', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ responses: [{}] }), { status: 200 }))

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      expect(res.status).toBe(200)
      expect(res.body.data.text).toBe('')
      expect(res.body.data.pageCount).toBe(1)
      fetchSpy.mockRestore()
    })

    it('handles recordUsage failure in non-production silently', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'test' }
      mockRecordUsage.mockRejectedValue(new Error('DB write error'))
      const app = await createApp()

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            responses: [
              { fullTextAnnotation: { text: 'ok', pages: [{ blocks: [{ confidence: 0.9 }] }] } },
            ],
          }),
          { status: 200 }
        )
      )

      const res = await request(app).post('/api/ai/ocr').send({ imageBase64: 'dGVzdA==' })

      // Cost tracking failure doesn't block the response
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      fetchSpy.mockRestore()
    })
  })

  // ===========================================================================
  // Document AI: Success Path with Partial Data
  // ===========================================================================
  describe('Document AI - success path with partial data', () => {
    it('handles response with no form fields or tables', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'test',
      }
      const app = await createApp()

      const docAIResponse = {
        document: {
          text: 'Simple text document',
          pages: [{ pageNumber: 1, blocks: [{ confidence: 0.88 }] }],
        },
      }

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(docAIResponse), { status: 200 }))

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.text).toBe('Simple text document')
      expect(res.body.data.confidence).toBeCloseTo(0.88, 2)
      expect(res.body.data.formFields).toBeUndefined() // No form fields
      expect(res.body.data.tables).toBeUndefined() // No tables
      expect(res.body.data.pageCount).toBe(1)
      expect(res.body.data.processingTimeMs).toBeGreaterThanOrEqual(0)
      fetchSpy.mockRestore()
    })

    it('handles form fields with missing fieldName or fieldValue', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'test',
      }
      const app = await createApp()

      const docAIResponse = {
        document: {
          text: 'Form document',
          pages: [
            {
              formFields: [
                // Field with empty name - name defaults to ''
                {
                  fieldName: { textAnchor: {} },
                  fieldValue: { textAnchor: { content: 'some value' } },
                },
                // Field with empty value - value defaults to ''
                {
                  fieldName: { textAnchor: { content: 'Field Label' } },
                  fieldValue: { textAnchor: {} },
                },
                // Field with both empty - should be skipped
                { fieldName: { textAnchor: {} }, fieldValue: { textAnchor: {} } },
                // Field with no bounding poly
                {
                  fieldName: { textAnchor: { content: 'Name' } },
                  fieldValue: { textAnchor: { content: 'Value' } },
                },
              ],
              blocks: [{ confidence: 0.9 }],
            },
          ],
        },
      }

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(docAIResponse), { status: 200 }))

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(200)
      // 3 fields should be included (first two have a name or value, fourth has both)
      // Third field has both empty - should be skipped
      expect(res.body.data.formFields).toHaveLength(3)
      // Fourth field has no bounding box
      expect(res.body.data.formFields[2].boundingBox).toBeUndefined()
      fetchSpy.mockRestore()
    })

    it('handles tables with only body rows (no header rows)', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'test',
      }
      const app = await createApp()

      const docAIResponse = {
        document: {
          text: 'Table document',
          pages: [
            {
              tables: [
                {
                  bodyRows: [
                    {
                      cells: [
                        { layout: { textAnchor: { content: 'Cell 1' }, confidence: 0.85 } },
                        { layout: { textAnchor: { content: 'Cell 2' }, confidence: 0.8 } },
                      ],
                    },
                  ],
                },
              ],
              blocks: [{ confidence: 0.85 }],
            },
          ],
        },
      }

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(docAIResponse), { status: 200 }))

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(200)
      expect(res.body.data.tables).toHaveLength(1)
      expect(res.body.data.tables[0].headerRows).toBe(0)
      expect(res.body.data.tables[0].rows).toHaveLength(1) // Only body rows
      expect(res.body.data.tables[0].rows[0].cells).toHaveLength(2)
      fetchSpy.mockRestore()
    })

    it('handles cells with missing layout/rowSpan/colSpan defaults', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'test',
      }
      const app = await createApp()

      const docAIResponse = {
        document: {
          text: 'Table with sparse cells',
          pages: [
            {
              tables: [
                {
                  headerRows: [{ cells: [{ layout: null }] }],
                  bodyRows: [{ cells: [{}] }], // Cell with no layout at all
                },
              ],
              blocks: [],
            },
          ],
        },
      }

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(docAIResponse), { status: 200 }))

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(200)
      // Tables should include rows even with sparse data
      expect(res.body.data.tables).toHaveLength(1)
      // Cells should default: text='', rowSpan=1, colSpan=1, confidence=0
      const headerCell = res.body.data.tables[0].rows[0].cells[0]
      expect(headerCell.text).toBe('')
      expect(headerCell.rowSpan).toBe(1)
      expect(headerCell.colSpan).toBe(1)
      fetchSpy.mockRestore()
    })

    it('calculates average confidence from blocks across multiple pages', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'test',
      }
      const app = await createApp()

      const docAIResponse = {
        document: {
          text: 'Multi-page document',
          pages: [
            { blocks: [{ confidence: 0.9 }, { confidence: 0.8 }] },
            { blocks: [{ confidence: 0.7 }] },
          ],
        },
      }

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(docAIResponse), { status: 200 }))

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(200)
      // Avg = (0.9 + 0.8 + 0.7) / 3 = 0.8
      expect(res.body.data.confidence).toBeCloseTo(0.8, 2)
      expect(res.body.data.pageCount).toBe(2)
      fetchSpy.mockRestore()
    })

    it('defaults confidence to 0.8 when no blocks have confidence', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'test',
      }
      const app = await createApp()

      const docAIResponse = {
        document: {
          text: 'No confidence blocks',
          pages: [{ blocks: [] }],
        },
      }

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(docAIResponse), { status: 200 }))

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(200)
      expect(res.body.data.confidence).toBe(0.8) // Default when no blocks
      fetchSpy.mockRestore()
    })

    it('accepts custom languageHints', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'test',
      }
      const app = await createApp()

      const docAIResponse = {
        document: { text: 'German doc', pages: [{ blocks: [{ confidence: 0.9 }] }] },
      }

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(docAIResponse), { status: 200 }))

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({
          documentBase64: 'dGVzdA==',
          mimeType: 'application/pdf',
          languageHints: ['de', 'en'],
        })

      expect(res.status).toBe(200)
      // Verify the request body included the language hints
      const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(fetchBody.processOptions.ocrConfig.hints.languageHints).toEqual(['de', 'en'])
      fetchSpy.mockRestore()
    })
  })

  // ===========================================================================
  // Document AI: Production Mode Error Messages
  // ===========================================================================
  describe('Document AI - production error messages', () => {
    it('returns generic messages in production mode', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'production',
      }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: 'PERMISSION_DENIED: check service account' } }),
            { status: 403 }
          )
        )

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PERMISSION_DENIED')
      expect(res.body.error).toBe('Document processing service unavailable')
      expect(res.body.details).toBeUndefined()
      fetchSpy.mockRestore()
    })

    it('returns PAGE_LIMIT_EXCEEDED with user-friendly message in production', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'production',
      }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: 'Document pages exceed the limit: 15 got 20' } }),
            { status: 400 }
          )
        )

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PAGE_LIMIT_EXCEEDED')
      expect(res.body.error).toContain('Document exceeds page limit')
      fetchSpy.mockRestore()
    })

    it('returns INVALID_DOCUMENT with generic message in production', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'production',
      }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: 'INVALID_ARGUMENT: unsupported format' } }),
            { status: 400 }
          )
        )

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_DOCUMENT')
      expect(res.body.error).toBe('Unable to process this document format')
      fetchSpy.mockRestore()
    })

    it('returns generic DOCUMENT_AI_FAILED message for unknown errors in production', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        NODE_ENV: 'production',
      }
      const app = await createApp()

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Random unexpected error'))

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('DOCUMENT_AI_FAILED')
      expect(res.body.error).toBe('Unable to process document')
      expect(res.body.details).toBeUndefined()
      fetchSpy.mockRestore()
    })

    it('returns PROVIDER_NOT_CONFIGURED with generic message in production', async () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      process.env.NODE_ENV = 'production'
      const app = await createApp()

      const res = await request(app)
        .post('/api/ai/ocr/document-ai')
        .send({ documentBase64: 'dGVzdA==', mimeType: 'application/pdf' })

      expect(res.status).toBe(503)
      expect(res.body.error).toBe('Document processing service unavailable')
    })
  })

  // ===========================================================================
  // Chat Endpoint: Error Classification Branches
  // ===========================================================================
  describe('Chat endpoint - error classification', () => {
    it('classifies INVALID_API_KEY for 401 errors in chat', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('401 Incorrect API key'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
      expect(res.body.details).toContain('401')
    })

    it('classifies RATE_LIMIT_EXCEEDED for 429 errors in chat', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('429 rate_limit exceeded'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('classifies TIMEOUT for timeout errors in chat', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('timeout waiting for response'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
    })

    it('returns generic messages in production mode for chat errors', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('401 Invalid API key'))

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
      expect(res.body.error).toBe('Chat service temporarily unavailable')
      expect(res.body.details).toBeUndefined()
    })

    it('returns EMPTY_RESPONSE for Anthropic chat with no text block', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'image', source: {} }], // No text block
        usage: { input_tokens: 10, output_tokens: 0 },
        model: 'claude-3-5-haiku-latest',
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'anthropic' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('EMPTY_RESPONSE')
    })

    it('returns PROVIDER_NOT_CONFIGURED for Anthropic when not configured', async () => {
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      process.env.NODE_ENV = 'test'
      const app = await createApp()

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'anthropic' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('PROVIDER_NOT_CONFIGURED')
    })

    it('falls back OpenAI to Anthropic when OpenAI not configured', async () => {
      delete process.env.OPENAI_API_KEY
      process.env.ANTHROPIC_API_KEY = 'test-key'
      process.env.NODE_ENV = 'test'
      const app = await createApp()
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Anthropic response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'claude-3-5-haiku-latest',
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Test', provider: 'openai' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('anthropic')
    })
  })

  // ===========================================================================
  // Diagnose Endpoint: OAuth Path and Edge Cases
  // ===========================================================================
  describe('Diagnose endpoint - OAuth and edge cases', () => {
    it('uses OAuth authentication for Google when service account available', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/creds.json',
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: '' } }] }), {
          status: 200,
        })
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.status).toBe(200)
      expect(res.body.google.valid).toBe(true)
      expect(res.body.google.authMethod).toBe('oauth')
      // Verify Bearer token was used
      const fetchCall = fetchSpy.mock.calls[0]
      const fetchOpts = fetchCall[1] as RequestInit
      expect((fetchOpts.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-oauth-token'
      )
      fetchSpy.mockRestore()
    })

    it('reports HTTP 400 with no errorStatus as INVALID_API_KEY', async () => {
      process.env = {
        ...originalEnv,
        GOOGLE_CLOUD_API_KEY: 'test-key',
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-haiku-latest',
      })

      // HTTP 400 with no error status field
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'API key not valid', code: 400 } }), {
          status: 400,
        })
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('INVALID_CREDENTIALS')
      fetchSpy.mockRestore()
    })

    it('includes environment field in non-production mode', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.environment).toBe('test')
    })

    it('excludes environment field in production mode', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        model: 'gpt-4o-mini',
      })

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.environment).toBeUndefined()
      // Model should also be hidden
      expect(res.body.openai.model).toBeUndefined()
    })

    it('reports correct recommendation when no providers configured', async () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      process.env.NODE_ENV = 'test'
      const app = await createApp()

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.summary.anyProviderConfigured).toBe(false)
      expect(res.body.summary.recommendation).toContain('Add OPENAI_API_KEY')
    })

    it('reports recommendation for configured but invalid providers', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('401 Incorrect API key'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.summary.anyProviderConfigured).toBe(true)
      expect(res.body.summary.anyProviderValid).toBe(false)
      expect(res.body.summary.recommendation).toContain('invalid')
    })

    it('handles Anthropic diagnostic with billing error', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance too low'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.anthropic.configured).toBe(true)
      expect(res.body.anthropic.valid).toBe(false)
      expect(res.body.anthropic.errorCode).toBe('BILLING_ERROR')
    })

    it('handles Anthropic diagnostic with rate limit error', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate limit'))

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.anthropic.errorCode).toBe('RATE_LIMITED')
    })

    it('reports sanitized error message in production for Google Vision', async () => {
      process.env = { ...originalEnv, GOOGLE_CLOUD_API_KEY: 'test-key', NODE_ENV: 'production' }
      const app = await createApp()

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'PERMISSION_DENIED: API not enabled', status: 'PERMISSION_DENIED' },
          }),
          { status: 403 }
        )
      )

      const res = await request(app).get('/api/ai/diagnose')

      expect(res.body.google.valid).toBe(false)
      expect(res.body.google.errorCode).toBe('API_NOT_ENABLED')
      expect(res.body.google.error).toBe('Service not available')
      expect(res.body.google.model).toBeUndefined() // Not shown in production
      fetchSpy.mockRestore()
    })
  })

  // ===========================================================================
  // Processing Log Endpoints
  // ===========================================================================
  describe('Processing log endpoints', () => {
    it('POST /processing-log creates a log entry', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockCreateProcessingLog.mockResolvedValue({ data: { id: 'log-001', document_id: 'doc-001' } })

      const res = await request(app)
        .post('/api/ai/processing-log')
        .send({ document_id: 'doc-001', filename: 'policy.pdf' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('log-001')
    })

    it('POST /processing-log returns 400 when document_id missing', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const res = await request(app).post('/api/ai/processing-log').send({ filename: 'policy.pdf' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('document_id')
    })

    it('POST /processing-log returns 400 when filename missing', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const res = await request(app).post('/api/ai/processing-log').send({ document_id: 'doc-001' })

      expect(res.status).toBe(400)
    })

    it('POST /processing-log returns 500 on service error', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockCreateProcessingLog.mockResolvedValue({ error: 'Database connection failed' })

      const res = await request(app)
        .post('/api/ai/processing-log')
        .send({ document_id: 'doc-001', filename: 'policy.pdf' })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Database connection failed')
    })

    it('POST /processing-log returns 500 on unexpected exception', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockCreateProcessingLog.mockRejectedValue(new Error('Unexpected'))

      const res = await request(app)
        .post('/api/ai/processing-log')
        .send({ document_id: 'doc-001', filename: 'policy.pdf' })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Unexpected')
    })

    it('PATCH /processing-log/:documentId updates a log', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockUpdateProcessingLog.mockResolvedValue({ id: 'doc-001', status: 'completed' })

      const res = await request(app)
        .patch('/api/ai/processing-log/doc-001')
        .send({ status: 'completed' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('PATCH /processing-log/:documentId returns 404 when not found', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockUpdateProcessingLog.mockResolvedValue(null)

      const res = await request(app)
        .patch('/api/ai/processing-log/nonexistent')
        .send({ status: 'completed' })

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('not found')
    })

    it('PATCH /processing-log/:documentId returns 500 on error', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockUpdateProcessingLog.mockRejectedValue(new Error('DB error'))

      const res = await request(app)
        .patch('/api/ai/processing-log/doc-001')
        .send({ status: 'completed' })

      expect(res.status).toBe(500)
    })

    it('POST /processing-log/:documentId/stage adds a stage', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAddProcessingStage.mockResolvedValue(true)

      const res = await request(app)
        .post('/api/ai/processing-log/doc-001/stage')
        .send({ stage: 'ocr', status: 'completed' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('POST /processing-log/:documentId/stage returns 400 when stage field is missing', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const res = await request(app)
        .post('/api/ai/processing-log/doc-001/stage')
        .send({ status: 'completed' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('stage and status are required')
    })

    it('POST /processing-log/:documentId/stage returns 400 when status field is missing', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()

      const res = await request(app)
        .post('/api/ai/processing-log/doc-001/stage')
        .send({ stage: 'ocr' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('stage and status are required')
    })

    it('POST /processing-log/:documentId/stage returns 404 when not found', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAddProcessingStage.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/ai/processing-log/nonexistent/stage')
        .send({ stage: 'ocr', status: 'completed' })

      expect(res.status).toBe(404)
    })

    it('POST /processing-log/:documentId/stage returns 500 on error', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAddProcessingStage.mockRejectedValue(new Error('Stage error'))

      const res = await request(app)
        .post('/api/ai/processing-log/doc-001/stage')
        .send({ stage: 'ocr', status: 'completed' })

      expect(res.status).toBe(500)
    })

    it('GET /processing-log/:documentId returns the log', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockGetProcessingLog.mockResolvedValue({ id: 'doc-001', filename: 'policy.pdf', stages: [] })

      const res = await request(app).get('/api/ai/processing-log/doc-001')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('doc-001')
    })

    it('GET /processing-log/:documentId returns 404 when not found', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockGetProcessingLog.mockResolvedValue(null)

      const res = await request(app).get('/api/ai/processing-log/nonexistent')

      expect(res.status).toBe(404)
    })

    it('GET /processing-log/:documentId returns 500 on error', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockGetProcessingLog.mockRejectedValue(new Error('Read error'))

      const res = await request(app).get('/api/ai/processing-log/doc-001')

      expect(res.status).toBe(500)
    })
  })

  // ===========================================================================
  // Unified Extract Endpoint: Fallback Chain Details
  // ===========================================================================
  describe('Unified extract - fallback chain details', () => {
    it('reports billing fallback reason and notifies admin', async () => {
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: VALID_POLICY_JSON } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'gpt-4o',
      })

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy json document.' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('openai')
      expect(res.body.fallback).toBe(true)
      expect(res.body.fallbackReason).toBe('ANTHROPIC_BILLING_ERROR')
      expect(res.body.fallbackChain).toBeDefined()
      expect(res.body.fallbackChain[0]).toEqual(
        expect.objectContaining({
          provider: 'anthropic',
          success: false,
          error_code: 'ANTHROPIC_BILLING_ERROR',
        })
      )
      expect(mockNotifyBillingIssue).toHaveBeenCalled()
    })

    it('reports rate limit fallback reason and notifies admin', async () => {
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate_limit exceeded'))
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: VALID_POLICY_JSON } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'gpt-4o',
      })

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy json document.' })

      expect(res.status).toBe(200)
      expect(res.body.fallbackReason).toBe('ANTHROPIC_RATE_LIMITED')
      expect(mockNotifyRateLimit).toHaveBeenCalled()
    })

    it('reports auth error fallback reason and notifies admin', async () => {
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('401 invalid x-api-key'))
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: VALID_POLICY_JSON } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'gpt-4o',
      })

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy json document.' })

      expect(res.status).toBe(200)
      expect(res.body.fallbackReason).toBe('ANTHROPIC_AUTH_ERROR')
      expect(mockNotifyAPIError).toHaveBeenCalled()
    })

    it('reports overloaded fallback reason without admin notification', async () => {
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('529 overloaded'))
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: VALID_POLICY_JSON } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'gpt-4o',
      })

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy json document.' })

      expect(res.status).toBe(200)
      expect(res.body.fallbackReason).toBe('ANTHROPIC_OVERLOADED')
      // Overloaded is transient, no admin notification
      expect(mockNotifyBillingIssue).not.toHaveBeenCalled()
      expect(mockNotifyRateLimit).not.toHaveBeenCalled()
      expect(mockNotifyAPIError).not.toHaveBeenCalled()
    })

    it('reports timeout fallback reason', async () => {
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('ETIMEDOUT'))
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: VALID_POLICY_JSON } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'gpt-4o',
      })

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy json document.' })

      expect(res.status).toBe(200)
      expect(res.body.fallbackReason).toBe('ANTHROPIC_TIMEOUT')
    })

    it('notifies admin when OpenAI fallback also fails with billing error', async () => {
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('credit balance insufficient'))
      mockOpenAICreate.mockRejectedValue(new Error('insufficient_quota'))

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy json document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('ALL_PROVIDERS_FAILED')
      // Both Anthropic and OpenAI billing notifications sent
      expect(mockNotifyBillingIssue).toHaveBeenCalledTimes(2)
    })

    it('returns ALL_PROVIDERS_FAILED when OpenAI returns invalid JSON in fallback', async () => {
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('overloaded'))
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'not valid json {broken' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'gpt-4o',
      })

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test policy json document.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('ALL_PROVIDERS_FAILED')
    })

    it('uses client-provided prompt in unified extract', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: VALID_POLICY_JSON }],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-3-5-sonnet-20241022',
      })

      const res = await request(app)
        .post('/api/ai/extract')
        .send({ documentText: 'Test document json.', systemPrompt: 'Custom prompt json' })

      expect(res.status).toBe(200)
      expect(res.body.provider).toBe('anthropic')
    })
  })

  // ===========================================================================
  // Providers Endpoint
  // ===========================================================================
  describe('GET /providers', () => {
    it('reports all providers when all keys are set', async () => {
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-key',
        ANTHROPIC_API_KEY: 'test-key',
        GOOGLE_CLOUD_API_KEY: 'test-key',
        NODE_ENV: 'test',
      }
      const app = await createApp()

      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.openai).toBe(true)
      expect(res.body.anthropic).toBe(true)
      expect(res.body.google).toBe(true)
    })

    it('reports no providers when no keys are set', async () => {
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      process.env.NODE_ENV = 'test'
      const app = await createApp()

      const res = await request(app).get('/api/ai/providers')

      expect(res.status).toBe(200)
      expect(res.body.openai).toBe(false)
      expect(res.body.anthropic).toBe(false)
      expect(res.body.google).toBe(false)
    })
  })

  // ===========================================================================
  // OpenAI Extract: Error Classification Branches
  // ===========================================================================
  describe('OpenAI extract - error classification', () => {
    it('classifies QUOTA_EXCEEDED for insufficient_quota error', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('insufficient_quota'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('QUOTA_EXCEEDED')
    })

    it('classifies TIMEOUT for timeout error', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('ETIMEDOUT'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
    })

    it('classifies DOCUMENT_TOO_LARGE for context_length_exceeded', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('context_length_exceeded'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('DOCUMENT_TOO_LARGE')
    })

    it('classifies RATE_LIMIT_EXCEEDED for 429 error', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockRejectedValue(new Error('429 rate limit'))

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('returns INVALID_JSON for non-parseable OpenAI response', async () => {
      process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'not valid json {{{' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        model: 'gpt-4o',
      })

      const res = await request(app)
        .post('/api/ai/extract/openai')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(502)
      expect(res.body.code).toBe('INVALID_JSON')
    })
  })

  // ===========================================================================
  // Anthropic Extract: Error Classification and Notification Branches
  // ===========================================================================
  describe('Anthropic extract - error classification and notifications', () => {
    it('classifies BILLING_ERROR and notifies admin for billing issues', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('FAILED_PRECONDITION: billing'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('BILLING_ERROR')
      expect(mockNotifyBillingIssue).toHaveBeenCalledWith(
        'Anthropic',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('classifies RATE_LIMIT_EXCEEDED and notifies admin for rate limit', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('429 rate_limit'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(mockNotifyRateLimit).toHaveBeenCalledWith('Anthropic', expect.any(Object))
    })

    it('classifies INVALID_API_KEY and notifies admin for auth errors', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('401 invalid x-api-key'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('INVALID_API_KEY')
      expect(mockNotifyAPIError).toHaveBeenCalledWith(
        'Anthropic',
        'INVALID_API_KEY',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('classifies TIMEOUT for timeout errors', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockRejectedValue(new Error('ETIMEDOUT'))

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TIMEOUT')
    })

    it('extracts JSON from markdown code blocks in Anthropic response', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n' + VALID_POLICY_JSON + '\n```' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-3-5-sonnet-20241022',
      })

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.policyNumber).toBe('POL-123')
    })

    it('returns INVALID_JSON for non-parseable Anthropic response', async () => {
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', NODE_ENV: 'test' }
      const app = await createApp()
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json at all' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: 'claude-3-5-sonnet-20241022',
      })

      const res = await request(app)
        .post('/api/ai/extract/anthropic')
        .send({ documentText: 'Test document json.' })

      expect(res.status).toBe(502)
      expect(res.body.code).toBe('INVALID_JSON')
    })
  })
})
