/**
 * AI Routes Tests
 *
 * Tests for AI proxy endpoints including validation and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock the AI client libraries
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '{"policyNumber": "POL-123"}' } }],
              usage: { prompt_tokens: 100, completion_tokens: 50 },
              model: 'gpt-4o',
            }),
          },
        },
      }
    }),
  }
})

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: '{"policyNumber": "POL-456"}' }],
            usage: { input_tokens: 100, output_tokens: 50 },
            model: 'claude-3-5-sonnet-20241022',
          }),
        },
      }
    }),
  }
})

// Import the router after mocks are set up
import aiRouter from '../routes/ai'

describe('AI Routes', () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/api/ai', aiRouter)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/ai/providers', () => {
    it('should return provider availability status', async () => {
      const response = await request(app).get('/api/ai/providers')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('openai')
      expect(response.body).toHaveProperty('anthropic')
      expect(response.body).toHaveProperty('google')
    })

    it('should return false when no API keys configured', async () => {
      // Clear any existing keys
      const originalOpenAI = process.env.OPENAI_API_KEY
      const originalAnthropic = process.env.ANTHROPIC_API_KEY
      const originalGoogle = process.env.GOOGLE_CLOUD_API_KEY

      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.GOOGLE_CLOUD_API_KEY

      const response = await request(app).get('/api/ai/providers')

      expect(response.status).toBe(200)
      expect(response.body.openai).toBe(false)
      expect(response.body.anthropic).toBe(false)
      expect(response.body.google).toBe(false)

      // Restore
      if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI
      if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic
      if (originalGoogle) process.env.GOOGLE_CLOUD_API_KEY = originalGoogle
    })
  })

  describe('POST /api/ai/extract/openai', () => {
    it('should return 503 when OpenAI not configured', async () => {
      const original = process.env.OPENAI_API_KEY
      delete process.env.OPENAI_API_KEY

      const response = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'application/json')
        .send({ documentText: 'Test document content for extraction' })

      expect(response.status).toBe(503)
      expect(response.body.code).toBe('PROVIDER_NOT_CONFIGURED')

      if (original) process.env.OPENAI_API_KEY = original
    })

    it('should return 415 for non-JSON content type', async () => {
      const response = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'text/plain')
        .send('Test document')

      expect(response.status).toBe(415)
      expect(response.body.code).toBe('INVALID_CONTENT_TYPE')
    })

    it('should return 400 for missing documentText', async () => {
      const response = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'application/json')
        .send({})

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 400 for empty documentText', async () => {
      const response = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'application/json')
        .send({ documentText: '' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /api/ai/extract/anthropic', () => {
    it('should return 503 when Anthropic not configured', async () => {
      const original = process.env.ANTHROPIC_API_KEY
      delete process.env.ANTHROPIC_API_KEY

      const response = await request(app)
        .post('/api/ai/extract/anthropic')
        .set('Content-Type', 'application/json')
        .send({ documentText: 'Test document content for extraction' })

      expect(response.status).toBe(503)
      expect(response.body.code).toBe('PROVIDER_NOT_CONFIGURED')

      if (original) process.env.ANTHROPIC_API_KEY = original
    })

    it('should return 400 for missing documentText', async () => {
      const response = await request(app)
        .post('/api/ai/extract/anthropic')
        .set('Content-Type', 'application/json')
        .send({})

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 415 for non-JSON content type', async () => {
      const response = await request(app)
        .post('/api/ai/extract/anthropic')
        .set('Content-Type', 'text/plain')
        .send('Test document')

      expect(response.status).toBe(415)
      expect(response.body.code).toBe('INVALID_CONTENT_TYPE')
    })

    it('should return 400 for empty documentText', async () => {
      const response = await request(app)
        .post('/api/ai/extract/anthropic')
        .set('Content-Type', 'application/json')
        .send({ documentText: '' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /api/ai/ocr', () => {
    it('should return 503 when Google Cloud not configured', async () => {
      const original = process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GOOGLE_CLOUD_API_KEY

      const response = await request(app)
        .post('/api/ai/ocr')
        .set('Content-Type', 'application/json')
        .send({ imageBase64: 'SGVsbG8gV29ybGQ=' })

      expect(response.status).toBe(503)
      expect(response.body.code).toBe('PROVIDER_NOT_CONFIGURED')

      if (original) process.env.GOOGLE_CLOUD_API_KEY = original
    })

    it('should return 400 for missing imageBase64', async () => {
      const response = await request(app)
        .post('/api/ai/ocr')
        .set('Content-Type', 'application/json')
        .send({})

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 400 for invalid base64', async () => {
      const response = await request(app)
        .post('/api/ai/ocr')
        .set('Content-Type', 'application/json')
        .send({ imageBase64: 'not-valid-base64!!!' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 415 for non-JSON content type', async () => {
      const response = await request(app)
        .post('/api/ai/ocr')
        .set('Content-Type', 'text/plain')
        .send('base64data')

      expect(response.status).toBe(415)
      expect(response.body.code).toBe('INVALID_CONTENT_TYPE')
    })
  })

  describe('Rate Limiting', () => {
    it('should accept requests within rate limit', async () => {
      const response = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'application/json')
        .send({ documentText: 'Test document content' })

      // Should either succeed or return provider not configured (not rate limited)
      expect([200, 503]).toContain(response.status)
    })
  })

  describe('Input Validation', () => {
    it('should sanitize null bytes in documentText', async () => {
      const response = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'application/json')
        .send({ documentText: 'Test\0document\x00content' })

      // Should not fail due to null bytes - validation should clean them
      expect([200, 503]).toContain(response.status)
    })

    it('should accept Turkish characters', async () => {
      const response = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'application/json')
        .send({
          documentText: 'Kasko Sigortası - İstanbul Şişli',
        })

      // Should accept Turkish characters without validation errors
      expect([200, 503]).toContain(response.status)
    })

    it('should reject oversized documentText', async () => {
      const response = await request(app)
        .post('/api/ai/extract/openai')
        .set('Content-Type', 'application/json')
        .send({
          documentText: 'a'.repeat(600000), // Over 500KB limit
        })

      // Should be rejected - either 400 (validation) or 413 (payload too large)
      expect([400, 413]).toContain(response.status)
    })
  })
})
