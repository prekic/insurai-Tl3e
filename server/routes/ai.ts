/**
 * AI Proxy Routes
 *
 * Secure server-side proxy for AI provider APIs.
 * Keeps API keys secure on the server, never exposed to the browser.
 */

import { Router, Request, Response } from 'express'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { aiExtractionLimiter, ocrLimiter } from '../middleware/rate-limit'

const router = Router()

// Initialize clients (lazy - only when keys are available)
let openaiClient: OpenAI | null = null
let anthropicClient: Anthropic | null = null

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

/**
 * POST /api/ai/extract/openai
 * Proxy for OpenAI policy extraction
 * Rate limited: 20 requests per hour
 */
router.post('/extract/openai', aiExtractionLimiter, async (req: Request, res: Response) => {
  try {
    const client = getOpenAIClient()
    if (!client) {
      return res.status(503).json({
        error: 'OpenAI not configured',
        code: 'PROVIDER_NOT_CONFIGURED',
      })
    }

    const { documentText, systemPrompt, model = 'gpt-4o' } = req.body

    if (!documentText) {
      return res.status(400).json({
        error: 'Missing documentText',
        code: 'INVALID_REQUEST',
      })
    }

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt || 'Extract policy information as JSON.' },
        { role: 'user', content: documentText },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      temperature: 0.1,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return res.status(500).json({
        error: 'Empty response from OpenAI',
        code: 'EMPTY_RESPONSE',
      })
    }

    res.json({
      success: true,
      data: JSON.parse(content),
      usage: response.usage,
      model: response.model,
    })
  } catch (error) {
    console.error('OpenAI extraction error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({
      error: 'OpenAI extraction failed',
      code: 'EXTRACTION_FAILED',
      details: process.env.NODE_ENV === 'development' ? message : undefined,
    })
  }
})

/**
 * POST /api/ai/extract/anthropic
 * Proxy for Anthropic/Claude policy extraction
 * Rate limited: 20 requests per hour
 */
router.post('/extract/anthropic', aiExtractionLimiter, async (req: Request, res: Response) => {
  try {
    const client = getAnthropicClient()
    if (!client) {
      return res.status(503).json({
        error: 'Anthropic not configured',
        code: 'PROVIDER_NOT_CONFIGURED',
      })
    }

    const { documentText, systemPrompt, model = 'claude-sonnet-4-20250514' } = req.body

    if (!documentText) {
      return res.status(400).json({
        error: 'Missing documentText',
        code: 'INVALID_REQUEST',
      })
    }

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt || 'Extract policy information as JSON.',
      messages: [{ role: 'user', content: documentText }],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return res.status(500).json({
        error: 'Empty response from Anthropic',
        code: 'EMPTY_RESPONSE',
      })
    }

    // Parse JSON from response (Claude may wrap in markdown)
    let jsonContent = textBlock.text
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim()
    }

    res.json({
      success: true,
      data: JSON.parse(jsonContent),
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      model: response.model,
    })
  } catch (error) {
    console.error('Anthropic extraction error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({
      error: 'Anthropic extraction failed',
      code: 'EXTRACTION_FAILED',
      details: process.env.NODE_ENV === 'development' ? message : undefined,
    })
  }
})

/**
 * POST /api/ai/ocr
 * Proxy for Google Cloud Vision OCR
 * Rate limited: 30 requests per hour
 */
router.post('/ocr', ocrLimiter, async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY
    if (!apiKey) {
      return res.status(503).json({
        error: 'Google Cloud not configured',
        code: 'PROVIDER_NOT_CONFIGURED',
      })
    }

    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({
        error: 'Missing imageBase64',
        code: 'INVALID_REQUEST',
      })
    }

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            imageContext: { languageHints: ['tr', 'en'] },
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new Error(errorData.error?.message || `API error: ${response.status}`)
    }

    const result = (await response.json()) as {
      responses?: Array<{
        fullTextAnnotation?: {
          text?: string
          pages?: Array<{ blocks?: Array<{ confidence?: number }> }>
        }
      }>
    }
    const annotation = result.responses?.[0]?.fullTextAnnotation

    res.json({
      success: true,
      data: {
        text: annotation?.text || '',
        confidence: annotation?.pages?.[0]?.blocks?.[0]?.confidence || 0,
        pageCount: annotation?.pages?.length || 1,
      },
    })
  } catch (error) {
    console.error('OCR error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({
      error: 'OCR processing failed',
      code: 'OCR_FAILED',
      details: process.env.NODE_ENV === 'development' ? message : undefined,
    })
  }
})

/**
 * GET /api/ai/providers
 * Check which AI providers are configured
 */
router.get('/providers', (_req: Request, res: Response) => {
  res.json({
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_CLOUD_API_KEY,
  })
})

export default router
