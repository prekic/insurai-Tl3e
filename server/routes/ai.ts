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
import {
  validateOpenAIExtraction,
  validateAnthropicExtraction,
  validateOCR,
  validateJSON,
  type OpenAIExtractionInput,
  type AnthropicExtractionInput,
  type OCRInput,
} from '../middleware/validation'

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
 * Validated: documentText required, max 500KB
 */
router.post(
  '/extract/openai',
  validateJSON,
  aiExtractionLimiter,
  validateOpenAIExtraction,
  async (req: Request, res: Response) => {
    try {
      const client = getOpenAIClient()
      if (!client) {
        return res.status(503).json({
          error: 'OpenAI not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      // Body is validated and sanitized by middleware
      const { documentText, systemPrompt, model } = req.body as OpenAIExtractionInput

      const response = await client.chat.completions.create({
        model: model || 'gpt-4o',
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
      const message = error instanceof Error ? error.message : 'Unknown error'
      const errorDetails = {
        timestamp: new Date().toISOString(),
        provider: 'openai',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message,
        documentTextLength: (req.body as OpenAIExtractionInput).documentText?.length ?? 0,
      }
      // Only log full error details in development
      if (process.env.NODE_ENV !== 'production') {
        console.error('[OpenAI Extraction Error]', JSON.stringify(errorDetails, null, 2))
      }

      // Determine specific error code
      // In production, show generic messages; in dev/staging, show specific ones
      const IS_PRODUCTION = process.env.NODE_ENV === 'production'
      let code = 'EXTRACTION_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process document' : 'OpenAI extraction failed'

      if (message.includes('401') || message.includes('Incorrect API key')) {
        code = 'INVALID_API_KEY'
        userMessage = IS_PRODUCTION ? 'AI service temporarily unavailable' : 'OpenAI API key is invalid'
      } else if (message.includes('429')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION ? 'Service busy, please try again later' : 'OpenAI rate limit exceeded - please wait and retry'
      } else if (message.includes('insufficient_quota')) {
        code = 'QUOTA_EXCEEDED'
        userMessage = IS_PRODUCTION ? 'AI service temporarily unavailable' : 'OpenAI API quota exhausted - add credits to your account'
      } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION ? 'Request timed out, please try again' : 'Request timed out - try a smaller document'
      } else if (message.includes('context_length_exceeded')) {
        code = 'DOCUMENT_TOO_LARGE'
        userMessage = IS_PRODUCTION ? 'Document is too large to process' : 'Document too large for AI processing'
      }

      res.status(500).json({
        error: userMessage,
        code,
        // Only show detailed error info in development/staging for debugging
        ...(process.env.NODE_ENV !== 'production' && { details: message }),
        timestamp: errorDetails.timestamp,
      })
    }
  }
)

/**
 * POST /api/ai/extract/anthropic
 * Proxy for Anthropic/Claude policy extraction
 * Rate limited: 20 requests per hour
 * Validated: documentText required, max 500KB
 */
router.post(
  '/extract/anthropic',
  validateJSON,
  aiExtractionLimiter,
  validateAnthropicExtraction,
  async (req: Request, res: Response) => {
    try {
      const client = getAnthropicClient()
      if (!client) {
        return res.status(503).json({
          error: 'Anthropic not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      // Body is validated and sanitized by middleware
      const { documentText, systemPrompt, model } = req.body as AnthropicExtractionInput

      const response = await client.messages.create({
        model: model || 'claude-sonnet-4-20250514',
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
      const message = error instanceof Error ? error.message : 'Unknown error'
      const errorDetails = {
        timestamp: new Date().toISOString(),
        provider: 'anthropic',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message,
        documentTextLength: (req.body as AnthropicExtractionInput).documentText?.length ?? 0,
      }
      // Only log full error details in development
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Anthropic Extraction Error]', JSON.stringify(errorDetails, null, 2))
      }

      // Determine specific error code
      // In production, show generic messages; in dev/staging, show specific ones
      const IS_PRODUCTION = process.env.NODE_ENV === 'production'
      let code = 'EXTRACTION_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process document' : 'Anthropic extraction failed'

      if (message.includes('401') || message.includes('invalid x-api-key') || message.includes('Invalid API Key')) {
        code = 'INVALID_API_KEY'
        userMessage = IS_PRODUCTION ? 'AI service temporarily unavailable' : 'Anthropic API key is invalid'
      } else if (message.includes('429') || message.includes('rate_limit')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION ? 'Service busy, please try again later' : 'Anthropic rate limit exceeded - please wait and retry'
      } else if (message.includes('credit') || message.includes('billing') || message.includes('overloaded')) {
        code = 'BILLING_ERROR'
        userMessage = IS_PRODUCTION ? 'AI service temporarily unavailable' : 'Anthropic billing issue - check your account'
      } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION ? 'Request timed out, please try again' : 'Request timed out - try a smaller document'
      }

      res.status(500).json({
        error: userMessage,
        code,
        // Only show detailed error info in development/staging for debugging
        ...(process.env.NODE_ENV !== 'production' && { details: message }),
        timestamp: errorDetails.timestamp,
      })
    }
  }
)

/**
 * POST /api/ai/ocr
 * Proxy for Google Cloud Vision OCR
 * Rate limited: 30 requests per hour
 * Validated: imageBase64 required, max 15MB, valid base64 format
 */
router.post(
  '/ocr',
  validateJSON,
  ocrLimiter,
  validateOCR,
  async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.GOOGLE_CLOUD_API_KEY
      if (!apiKey) {
        return res.status(503).json({
          error: 'Google Cloud not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      // Body is validated and sanitized by middleware
      const { imageBase64 } = req.body as OCRInput

      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
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
        }
      )

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string }
        }
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
      const message = error instanceof Error ? error.message : 'Unknown error'
      const errorDetails = {
        timestamp: new Date().toISOString(),
        provider: 'google-vision',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message,
      }
      // Only log full error details in development
      if (process.env.NODE_ENV !== 'production') {
        console.error('[OCR Error]', JSON.stringify(errorDetails, null, 2))
      }

      // Determine specific error code
      // In production, show generic messages; in dev/staging, show specific ones
      const IS_PRODUCTION = process.env.NODE_ENV === 'production'
      let code = 'OCR_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process scanned document' : 'OCR processing failed'

      if (message.includes('API key not valid') || message.includes('400')) {
        code = 'INVALID_API_KEY'
        userMessage = IS_PRODUCTION ? 'Document scanning service unavailable' : 'Google Cloud API key is invalid'
      } else if (message.includes('PERMISSION_DENIED')) {
        code = 'API_NOT_ENABLED'
        userMessage = IS_PRODUCTION ? 'Document scanning service unavailable' : 'Cloud Vision API not enabled - enable it in Google Cloud Console'
      } else if (message.includes('BILLING')) {
        code = 'BILLING_ERROR'
        userMessage = IS_PRODUCTION ? 'Document scanning service unavailable' : 'Billing not enabled on Google Cloud project'
      } else if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION ? 'Service busy, please try again later' : 'Google Cloud rate limit exceeded'
      }

      res.status(500).json({
        error: userMessage,
        code,
        // Only show detailed error info in development/staging for debugging
        ...(process.env.NODE_ENV !== 'production' && { details: message }),
        timestamp: errorDetails.timestamp,
      })
    }
  }
)

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

/**
 * Diagnostic result for a single provider
 */
interface ProviderDiagnostic {
  configured: boolean
  valid: boolean
  error?: string
  latencyMs?: number
  model?: string
}

/**
 * Sanitize diagnostic error message for production
 * In production, hide technical details like .env file paths and API key names
 */
function sanitizeDiagnosticError(error: string, isProduction: boolean): string {
  if (!isProduction) return error

  // Map technical errors to user-friendly messages for SaaS
  if (error.includes('Invalid API key') || error.includes('401') || error.includes('Incorrect')) {
    return 'Service configuration error'
  }
  if (error.includes('Rate limit') || error.includes('429') || error.includes('quota')) {
    return 'Service temporarily busy'
  }
  if (error.includes('billing') || error.includes('credit') || error.includes('BILLING')) {
    return 'Service temporarily unavailable'
  }
  if (error.includes('PERMISSION_DENIED') || error.includes('not enabled')) {
    return 'Service not available'
  }
  return 'Service error'
}

/**
 * GET /api/ai/diagnose
 * Test API key validity by making minimal API calls to each provider
 * This helps debug extraction failures by verifying credentials work
 * In production: Returns sanitized results suitable for end users
 * In development: Returns detailed diagnostic information for debugging
 */
router.get('/diagnose', async (_req: Request, res: Response) => {
  const IS_PRODUCTION = process.env.NODE_ENV === 'production'

  const diagnostics: {
    openai: ProviderDiagnostic
    anthropic: ProviderDiagnostic
    google: ProviderDiagnostic
    timestamp: string
    environment?: string // Only included in non-production
  } = {
    openai: { configured: false, valid: false },
    anthropic: { configured: false, valid: false },
    google: { configured: false, valid: false },
    timestamp: new Date().toISOString(),
    // Only expose environment in non-production
    ...(IS_PRODUCTION ? {} : { environment: process.env.NODE_ENV || 'development' }),
  }

  // Test OpenAI
  if (process.env.OPENAI_API_KEY) {
    diagnostics.openai.configured = true
    const startTime = Date.now()
    try {
      const client = getOpenAIClient()
      if (client) {
        // Make a minimal API call to verify the key works
        const response = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "OK"' }],
          max_tokens: 5,
        })
        diagnostics.openai.valid = true
        diagnostics.openai.latencyMs = Date.now() - startTime
        // Only show model in non-production
        if (!IS_PRODUCTION) {
          diagnostics.openai.model = response.model
        }
      }
    } catch (error) {
      diagnostics.openai.valid = false
      diagnostics.openai.latencyMs = Date.now() - startTime
      let errorMsg = error instanceof Error ? error.message : 'Unknown error'
      // Provide specific guidance for common errors (in dev only)
      if (errorMsg.includes('401') || errorMsg.includes('Incorrect API key')) {
        errorMsg = 'Invalid API key - check OPENAI_API_KEY in .env'
      } else if (errorMsg.includes('429')) {
        errorMsg = 'Rate limit exceeded or quota exhausted'
      } else if (errorMsg.includes('insufficient_quota')) {
        errorMsg = 'API quota exhausted - add credits to your OpenAI account'
      }
      diagnostics.openai.error = sanitizeDiagnosticError(errorMsg, IS_PRODUCTION)
    }
  }

  // Test Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    diagnostics.anthropic.configured = true
    const startTime = Date.now()
    try {
      const client = getAnthropicClient()
      if (client) {
        // Make a minimal API call to verify the key works
        const response = await client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Say "OK"' }],
        })
        diagnostics.anthropic.valid = true
        diagnostics.anthropic.latencyMs = Date.now() - startTime
        // Only show model in non-production
        if (!IS_PRODUCTION) {
          diagnostics.anthropic.model = response.model
        }
      }
    } catch (error) {
      diagnostics.anthropic.valid = false
      diagnostics.anthropic.latencyMs = Date.now() - startTime
      let errorMsg = error instanceof Error ? error.message : 'Unknown error'
      // Provide specific guidance for common errors (in dev only)
      if (errorMsg.includes('401') || errorMsg.includes('invalid x-api-key')) {
        errorMsg = 'Invalid API key - check ANTHROPIC_API_KEY in .env'
      } else if (errorMsg.includes('429')) {
        errorMsg = 'Rate limit exceeded'
      } else if (errorMsg.includes('credit') || errorMsg.includes('billing')) {
        errorMsg = 'Billing issue - check your Anthropic account'
      }
      diagnostics.anthropic.error = sanitizeDiagnosticError(errorMsg, IS_PRODUCTION)
    }
  }

  // Test Google Cloud Vision (OCR)
  if (process.env.GOOGLE_CLOUD_API_KEY) {
    diagnostics.google.configured = true
    const startTime = Date.now()
    try {
      // Make a minimal API call to verify the key works
      // Using a tiny 1x1 white PNG to minimize cost
      const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{ image: { content: testImage }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }],
          }),
        }
      )
      diagnostics.google.latencyMs = Date.now() - startTime

      if (response.ok) {
        diagnostics.google.valid = true
        // Only show model in non-production
        if (!IS_PRODUCTION) {
          diagnostics.google.model = 'cloud-vision-v1'
        }
      } else {
        const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string; status?: string } }
        diagnostics.google.valid = false
        let errorMsg = errorData.error?.message || `HTTP ${response.status}`
        // Provide specific guidance
        if (errorMsg.includes('API key not valid') || response.status === 400) {
          errorMsg = 'Invalid API key - check GOOGLE_CLOUD_API_KEY in .env'
        } else if (errorMsg.includes('PERMISSION_DENIED')) {
          errorMsg = 'Cloud Vision API not enabled - enable it in Google Cloud Console'
        } else if (errorMsg.includes('BILLING')) {
          errorMsg = 'Billing not enabled on Google Cloud project'
        }
        diagnostics.google.error = sanitizeDiagnosticError(errorMsg, IS_PRODUCTION)
      }
    } catch (error) {
      diagnostics.google.valid = false
      diagnostics.google.latencyMs = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      diagnostics.google.error = sanitizeDiagnosticError(errorMsg, IS_PRODUCTION)
    }
  }

  // Log diagnostic results for debugging (only in development)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AI Diagnose] Results:', JSON.stringify(diagnostics, null, 2))
  }

  // Determine overall status
  const anyValid = diagnostics.openai.valid || diagnostics.anthropic.valid
  const anyConfigured = diagnostics.openai.configured || diagnostics.anthropic.configured

  // Sanitized recommendations for production (SaaS)
  let recommendation: string
  if (!anyConfigured) {
    recommendation = IS_PRODUCTION
      ? 'AI service not configured - contact support'
      : 'Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env file'
  } else if (!anyValid) {
    recommendation = IS_PRODUCTION
      ? 'AI service temporarily unavailable - please try again later'
      : 'API keys are configured but invalid - check the error messages above'
  } else {
    recommendation = IS_PRODUCTION
      ? 'AI services available'
      : 'All configured providers are working'
  }

  res.json({
    ...diagnostics,
    summary: {
      anyProviderConfigured: anyConfigured,
      anyProviderValid: anyValid,
      extractionReady: anyValid,
      ocrReady: diagnostics.google.valid,
      recommendation,
    },
  })
})

export default router
