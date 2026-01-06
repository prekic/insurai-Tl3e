/**
 * Chat Routes Tests
 *
 * Tests for the multi-turn chat endpoint (/api/ai/chat)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock the AI clients
const mockOpenAICreate = vi.fn()
const mockAnthropicCreate = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockOpenAICreate,
      },
    },
  })),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  })),
}))

// Set up environment variables before importing routes
const originalEnv = process.env

describe('Chat Routes', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      NODE_ENV: 'test',
    }

    // Reset module cache to pick up new env vars
    vi.resetModules()

    // Import fresh instance of routes
    const aiRoutes = (await import('../routes/ai')).default

    app = express()
    app.use(express.json())
    app.use('/api/ai', aiRoutes)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('POST /api/ai/chat', () => {
    it('returns 400 for missing message', async () => {
      const response = await request(app).post('/api/ai/chat').send({})

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Validation failed')
    })

    it('returns 400 for empty message', async () => {
      const response = await request(app).post('/api/ai/chat').send({ message: '' })

      expect(response.status).toBe(400)
    })

    it('returns 400 for message too long', async () => {
      const longMessage = 'a'.repeat(5000) // Max is 4000
      const response = await request(app).post('/api/ai/chat').send({ message: longMessage })

      expect(response.status).toBe(400)
    })

    it('returns 415 for non-JSON content type', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .set('Content-Type', 'text/plain')
        .send('test message')

      expect(response.status).toBe(415)
      expect(response.body.code).toBe('INVALID_CONTENT_TYPE')
    })

    it('successfully calls OpenAI provider', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Test response from OpenAI' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      })

      const response = await request(app).post('/api/ai/chat').send({
        message: 'What does my Kasko cover?',
        provider: 'openai',
      })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.response).toBe('Test response from OpenAI')
      expect(response.body.provider).toBe('openai')
    })

    it('successfully calls Anthropic provider', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Test response from Anthropic' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      })

      const response = await request(app).post('/api/ai/chat').send({
        message: 'What does my Kasko cover?',
        provider: 'anthropic',
      })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.response).toBe('Test response from Anthropic')
      expect(response.body.provider).toBe('anthropic')
    })

    it('includes conversation history in OpenAI request', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Follow-up response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      })

      const conversationHistory = [
        { role: 'user', content: 'What is Kasko?' },
        { role: 'assistant', content: 'Kasko is comprehensive auto insurance in Turkey.' },
      ]

      await request(app).post('/api/ai/chat').send({
        message: 'What does it cover?',
        conversationHistory,
        provider: 'openai',
      })

      // Verify the messages passed to OpenAI include history
      expect(mockOpenAICreate).toHaveBeenCalled()
      const callArgs = mockOpenAICreate.mock.calls[0][0]
      // Should have: system + 2 history + 1 new = 4 messages
      expect(callArgs.messages.length).toBe(4)
      expect(callArgs.messages[0].role).toBe('system')
      expect(callArgs.messages[1].content).toBe('What is Kasko?')
      expect(callArgs.messages[2].content).toBe('Kasko is comprehensive auto insurance in Turkey.')
      expect(callArgs.messages[3].content).toBe('What does it cover?')
    })

    it('includes policy context in system prompt', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Policy-specific response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      })

      const policyContext = 'Policy: POL-001\nProvider: Allianz\nType: Kasko'

      await request(app).post('/api/ai/chat').send({
        message: 'Tell me about my policy',
        policyContext,
        provider: 'openai',
      })

      expect(mockOpenAICreate).toHaveBeenCalled()
      const callArgs = mockOpenAICreate.mock.calls[0][0]
      expect(callArgs.messages[0].role).toBe('system')
      expect(callArgs.messages[0].content).toContain(policyContext)
    })

    it('handles OpenAI API errors gracefully', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('OpenAI API error'))

      const response = await request(app).post('/api/ai/chat').send({
        message: 'Test question',
        provider: 'openai',
      })

      expect(response.status).toBe(500)
      expect(response.body.code).toBe('CHAT_FAILED')
    })

    it('handles Anthropic API errors gracefully', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('Anthropic API error'))

      const response = await request(app).post('/api/ai/chat').send({
        message: 'Test question',
        provider: 'anthropic',
      })

      expect(response.status).toBe(500)
      expect(response.body.code).toBe('CHAT_FAILED')
    })

    it('handles rate limit errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('429 rate_limit exceeded'))

      const response = await request(app).post('/api/ai/chat').send({
        message: 'Test question',
        provider: 'openai',
      })

      expect(response.status).toBe(500)
      expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('handles authentication errors', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('401 Invalid API key'))

      const response = await request(app).post('/api/ai/chat').send({
        message: 'Test question',
        provider: 'openai',
      })

      expect(response.status).toBe(500)
      expect(response.body.code).toBe('INVALID_API_KEY')
    })

    it('returns 500 for empty OpenAI response', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      })

      const response = await request(app).post('/api/ai/chat').send({
        message: 'Test question',
        provider: 'openai',
      })

      expect(response.status).toBe(500)
      expect(response.body.code).toBe('EMPTY_RESPONSE')
    })

    it('returns 500 for empty Anthropic response', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [],
      })

      const response = await request(app).post('/api/ai/chat').send({
        message: 'Test question',
        provider: 'anthropic',
      })

      expect(response.status).toBe(500)
      expect(response.body.code).toBe('EMPTY_RESPONSE')
    })

    it('limits conversation history to 50 messages', async () => {
      const longHistory = Array(55)
        .fill(null)
        .map((_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        }))

      const response = await request(app).post('/api/ai/chat').send({
        message: 'Test',
        conversationHistory: longHistory,
        provider: 'openai',
      })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Validation failed')
    })

    it('sanitizes message content', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Sanitized response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      })

      await request(app).post('/api/ai/chat').send({
        message: 'Test message\x00with null bytes',
        provider: 'openai',
      })

      expect(mockOpenAICreate).toHaveBeenCalled()
      const callArgs = mockOpenAICreate.mock.calls[0][0]
      // Null bytes should be removed
      expect(callArgs.messages[1].content).not.toContain('\x00')
    })

    it('defaults to openai provider when not specified', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { content: 'Default provider response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      })

      const response = await request(app).post('/api/ai/chat').send({
        message: 'Test question',
        // No provider specified
      })

      expect(response.status).toBe(200)
      expect(response.body.provider).toBe('openai')
    })
  })

  describe('Chat endpoint - provider fallback', () => {
    it('falls back to anthropic when openai not configured', async () => {
      // Remove OpenAI key
      delete process.env.OPENAI_API_KEY
      vi.resetModules()

      const aiRoutes = (await import('../routes/ai')).default
      const testApp = express()
      testApp.use(express.json())
      testApp.use('/api/ai', aiRoutes)

      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Fallback response from Anthropic' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      })

      const response = await request(testApp).post('/api/ai/chat').send({
        message: 'Test question',
        provider: 'openai', // Request OpenAI but it's not configured
      })

      expect(response.status).toBe(200)
      expect(response.body.provider).toBe('anthropic')
    })
  })
})
