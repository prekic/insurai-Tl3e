/**
 * AI Proxy Routes
 *
 * Secure server-side proxy for AI provider APIs.
 * Keeps API keys secure on the server, never exposed to the browser.
 * Includes cost tracking and budget enforcement.
 */

import { Router, Request, Response } from 'express'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { aiExtractionLimiter, ocrLimiter, chatLimiter } from '../middleware/rate-limit.js'
import {
  validateOpenAIExtraction,
  validateAnthropicExtraction,
  validateOCR,
  validateDocumentAI,
  validateChat,
  validateJSON,
  type OpenAIExtractionInput,
  type AnthropicExtractionInput,
  type OCRInput,
  type DocumentAIInput,
  type ChatInput,
  type ChatMessage,
} from '../middleware/validation.js'
import { GoogleAuth } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ES Module directory resolution
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import { calculateCost, recordUsage } from '../middleware/cost-control.js'
import { getChatPrompt, getExtractionPrompt } from '../services/prompt-service.js'

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

// ============================================================================
// DOCUMENT AI CONFIGURATION
// ============================================================================

const GCP_CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'gen-lang-client-0171803889',
  location: process.env.GCP_LOCATION || 'us',
  processorId: process.env.GCP_DOCAI_PROCESSOR_ID || 'c2741b178ab61433',
}

/**
 * Get the path to GCP service account credentials
 */
function getGCPCredentialsPath(): string | null {
  // Check environment variable first
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS
  }

  // Check common locations
  const possiblePaths = [
    path.join(process.cwd(), 'gcp-service-account.json'),
    path.join(__dirname, '..', '..', 'gcp-service-account.json'),
    path.join(__dirname, '..', '..', '..', 'gcp-service-account.json'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  return null
}

/**
 * Check if Document AI is configured
 */
function isDocumentAIConfigured(): boolean {
  const credentialsPath = getGCPCredentialsPath()
  return !!credentialsPath && !!GCP_CONFIG.projectId && !!GCP_CONFIG.processorId
}

/**
 * Get access token for Document AI
 */
async function getDocumentAIAccessToken(): Promise<string | null> {
  const credentialsPath = getGCPCredentialsPath()
  if (!credentialsPath) {
    console.error('[Document AI] No credentials file found')
    return null
  }

  try {
    const auth = new GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const token = await auth.getAccessToken()
    return token as string
  } catch (error) {
    console.error('[Document AI] Failed to get access token:', error)
    return null
  }
}

// Document AI response types
interface DocumentAIFormField {
  fieldName?: { textAnchor?: { content?: string }; confidence?: number }
  fieldValue?: { textAnchor?: { content?: string }; confidence?: number }
  boundingPoly?: { normalizedVertices?: Array<{ x: number; y: number }> }
}

interface DocumentAITable {
  headerRows?: DocumentAITableRow[]
  bodyRows?: DocumentAITableRow[]
}

interface DocumentAITableRow {
  cells?: DocumentAITableCell[]
}

interface DocumentAITableCell {
  layout?: { textAnchor?: { content?: string }; confidence?: number }
  rowSpan?: number
  colSpan?: number
}

interface DocumentAIPage {
  pageNumber?: number
  formFields?: DocumentAIFormField[]
  tables?: DocumentAITable[]
  blocks?: Array<{ confidence?: number }>
}

interface DocumentAIResponse {
  document?: {
    text?: string
    pages?: DocumentAIPage[]
  }
  error?: {
    code: number
    message: string
  }
}

/**
 * POST /api/ai/extract/openai
 * Proxy for OpenAI policy extraction
 * Rate limited: 20 requests per hour
 * Validated: documentText required, max 500KB
 * Uses admin-managed prompts from database with fallback
 */
router.post(
  '/extract/openai',
  validateJSON,
  aiExtractionLimiter,
  validateOpenAIExtraction,
  async (req: Request, res: Response) => {
    const requestId = `ext-${Date.now()}`
    console.log(`[${requestId}] 📥 Extraction request received`)

    try {
      const client = getOpenAIClient()
      if (!client) {
        console.log(`[${requestId}] ❌ OpenAI client not configured`)
        return res.status(503).json({
          error: 'OpenAI not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }
      console.log(`[${requestId}] ✅ OpenAI client ready`)

      // Body is validated and sanitized by middleware
      const { documentText, systemPrompt: clientPrompt, model, policyType } = req.body as OpenAIExtractionInput & { policyType?: string }
      console.log(`[${requestId}] 📄 Document: ${documentText?.length || 0} chars, type: ${policyType || 'auto-detect'}, model: ${model || 'gpt-4o'}`)

      // Get extraction prompt from admin system (falls back to hardcoded if unavailable)
      let finalSystemPrompt: string
      let finalUserPrompt = documentText
      let promptTemplateUsed: string | undefined

      if (clientPrompt) {
        // Use client-provided prompt (backward compatibility)
        finalSystemPrompt = clientPrompt
      } else {
        // Use admin-managed prompt
        const renderedPrompt = await getExtractionPrompt(documentText, policyType)
        if (renderedPrompt) {
          finalSystemPrompt = renderedPrompt.systemPrompt
          finalUserPrompt = renderedPrompt.userPrompt
          promptTemplateUsed = `${renderedPrompt.templateName} v${renderedPrompt.version}`
          console.log(`[Extraction/OpenAI] Using prompt template: ${promptTemplateUsed}`)
        } else {
          finalSystemPrompt = 'Extract policy information as JSON.'
          console.log('[Extraction/OpenAI] Using fallback prompt (admin prompt unavailable)')
        }
      }

      console.log(`[${requestId}] 🤖 Calling OpenAI API...`)
      console.log(`[${requestId}] 📝 System prompt: ${finalSystemPrompt.substring(0, 100)}...`)
      console.log(`[${requestId}] 📝 User prompt length: ${finalUserPrompt.length} chars`)

      // Ensure "json" is in the prompt (required by OpenAI when using response_format: json_object)
      const jsonReminder = '\n\nRespond with valid JSON only.'
      const systemPromptWithJson = finalSystemPrompt.includes('json') || finalSystemPrompt.includes('JSON')
        ? finalSystemPrompt
        : finalSystemPrompt + jsonReminder
      const userPromptWithJson = finalUserPrompt.includes('json') || finalUserPrompt.includes('JSON') || systemPromptWithJson.includes('json')
        ? finalUserPrompt
        : finalUserPrompt + jsonReminder

      const response = await client.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPromptWithJson },
          { role: 'user', content: userPromptWithJson },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4096,
        temperature: 0.1,
      })
      console.log(`[${requestId}] ✅ OpenAI responded`)

      const content = response.choices[0]?.message?.content
      if (!content) {
        return res.status(500).json({
          error: 'Empty response from OpenAI',
          code: 'EMPTY_RESPONSE',
        })
      }

      // Track cost usage
      const usedModel = response.model || model || 'gpt-4o'
      const inputTokens = response.usage?.prompt_tokens || 0
      const outputTokens = response.usage?.completion_tokens || 0
      const cost = calculateCost(usedModel, inputTokens, outputTokens)

      // Record usage asynchronously (don't block response)
      recordUsage({
        provider: 'openai',
        model: usedModel,
        operation: 'extraction',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost: cost.inputCost,
        outputCost: cost.outputCost,
        totalCost: cost.totalCost,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Cost Tracking Error]', err)
        }
      })

      console.log(`[${requestId}] ✅ Extraction successful: ${inputTokens}+${outputTokens} tokens, $${cost.totalCost.toFixed(4)}`)
      res.json({
        success: true,
        data: JSON.parse(content),
        usage: response.usage,
        model: response.model,
        cost: cost.totalCost,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const errorDetails = {
        requestId,
        timestamp: new Date().toISOString(),
        provider: 'openai',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message,
        documentTextLength: (req.body as OpenAIExtractionInput).documentText?.length ?? 0,
      }
      // Always log errors (safe info only)
      console.error(`[${requestId}] ❌ Extraction failed:`, errorDetails.errorType, '-', message.substring(0, 200))

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
 * Uses admin-managed prompts from database with fallback
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
      const { documentText, systemPrompt: clientPrompt, model, policyType } = req.body as AnthropicExtractionInput & { policyType?: string }

      // Get extraction prompt from admin system (falls back to hardcoded if unavailable)
      let finalSystemPrompt: string
      let finalUserPrompt = documentText
      let promptTemplateUsed: string | undefined

      if (clientPrompt) {
        // Use client-provided prompt (backward compatibility)
        finalSystemPrompt = clientPrompt
      } else {
        // Use admin-managed prompt
        const renderedPrompt = await getExtractionPrompt(documentText, policyType)
        if (renderedPrompt) {
          finalSystemPrompt = renderedPrompt.systemPrompt
          finalUserPrompt = renderedPrompt.userPrompt
          promptTemplateUsed = `${renderedPrompt.templateName} v${renderedPrompt.version}`
          console.log(`[Extraction/Anthropic] Using prompt template: ${promptTemplateUsed}`)
        } else {
          finalSystemPrompt = 'Extract policy information as JSON.'
          console.log('[Extraction/Anthropic] Using fallback prompt (admin prompt unavailable)')
        }
      }

      const response = await client.messages.create({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: finalSystemPrompt,
        messages: [{ role: 'user', content: finalUserPrompt }],
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

      // Track cost usage
      const usedModel = response.model || model || 'claude-sonnet-4-20250514'
      const inputTokens = response.usage.input_tokens
      const outputTokens = response.usage.output_tokens
      const cost = calculateCost(usedModel, inputTokens, outputTokens)

      // Record usage asynchronously (don't block response)
      recordUsage({
        provider: 'anthropic',
        model: usedModel,
        operation: 'extraction',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost: cost.inputCost,
        outputCost: cost.outputCost,
        totalCost: cost.totalCost,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Cost Tracking Error]', err)
        }
      })

      res.json({
        success: true,
        data: JSON.parse(jsonContent),
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
        model: response.model,
        cost: cost.totalCost,
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
      const pageCount = annotation?.pages?.length || 1

      // Track cost usage for OCR (Google Vision charges per image/page)
      // Estimate: $1.50 per 1000 pages for document text detection
      const ocrCost = pageCount * 0.0015

      // Record usage asynchronously (don't block response)
      recordUsage({
        provider: 'google',
        model: 'cloud-vision-v1',
        operation: 'ocr',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: ocrCost,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Cost Tracking Error]', err)
        }
      })

      res.json({
        success: true,
        data: {
          text: annotation?.text || '',
          confidence: annotation?.pages?.[0]?.blocks?.[0]?.confidence || 0,
          pageCount,
        },
        cost: ocrCost,
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
 * POST /api/ai/ocr/document-ai
 * Google Document AI OCR with form field and table extraction
 * Rate limited: 30 requests per hour
 * Validated: documentBase64 required, max 20MB
 * Returns enhanced OCR results with form fields and tables
 */
router.post(
  '/ocr/document-ai',
  validateJSON,
  ocrLimiter,
  validateDocumentAI,
  async (req: Request, res: Response) => {
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'
    const startTime = Date.now()

    try {
      // Check if Document AI is configured
      if (!isDocumentAIConfigured()) {
        return res.status(503).json({
          error: IS_PRODUCTION ? 'Document processing service unavailable' : 'Document AI not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      // Get access token
      const accessToken = await getDocumentAIAccessToken()
      if (!accessToken) {
        return res.status(503).json({
          error: IS_PRODUCTION ? 'Document processing service unavailable' : 'Failed to get Document AI access token',
          code: 'AUTH_FAILED',
        })
      }

      const { documentBase64, mimeType, languageHints } = req.body as DocumentAIInput

      // Build Document AI endpoint
      const endpoint = `https://${GCP_CONFIG.location}-documentai.googleapis.com/v1/projects/${GCP_CONFIG.projectId}/locations/${GCP_CONFIG.location}/processors/${GCP_CONFIG.processorId}:process`

      // Call Document AI
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawDocument: {
            content: documentBase64,
            mimeType,
          },
          // Language hints for better Turkish recognition
          processOptions: {
            ocrConfig: {
              hints: {
                languageHints: languageHints || ['tr', 'en'],
              },
            },
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } })) as DocumentAIResponse
        throw new Error(errorData.error?.message || `Document AI error: ${response.status}`)
      }

      const result = await response.json() as DocumentAIResponse

      if (!result.document) {
        throw new Error('Empty response from Document AI')
      }

      const processingTimeMs = Date.now() - startTime

      // Extract form fields
      const formFields: Array<{
        name: string
        value: string
        confidence: number
        boundingBox?: { x: number; y: number; width: number; height: number }
      }> = []

      for (const page of result.document.pages || []) {
        for (const field of page.formFields || []) {
          const name = field.fieldName?.textAnchor?.content?.trim() || ''
          const value = field.fieldValue?.textAnchor?.content?.trim() || ''
          const confidence = (field.fieldName?.confidence || 0 + (field.fieldValue?.confidence || 0)) / 2

          if (name || value) {
            formFields.push({
              name,
              value,
              confidence,
              boundingBox: field.boundingPoly?.normalizedVertices
                ? {
                    x: field.boundingPoly.normalizedVertices[0]?.x || 0,
                    y: field.boundingPoly.normalizedVertices[0]?.y || 0,
                    width:
                      (field.boundingPoly.normalizedVertices[2]?.x || 0) -
                      (field.boundingPoly.normalizedVertices[0]?.x || 0),
                    height:
                      (field.boundingPoly.normalizedVertices[2]?.y || 0) -
                      (field.boundingPoly.normalizedVertices[0]?.y || 0),
                  }
                : undefined,
            })
          }
        }
      }

      // Extract tables
      const tables: Array<{
        rows: Array<{ cells: Array<{ text: string; rowSpan: number; colSpan: number; confidence: number }> }>
        headerRows: number
        confidence: number
      }> = []

      for (const page of result.document.pages || []) {
        for (const table of page.tables || []) {
          const rows: Array<{ cells: Array<{ text: string; rowSpan: number; colSpan: number; confidence: number }> }> = []

          // Process header rows
          const headerRowCount = table.headerRows?.length || 0
          for (const row of table.headerRows || []) {
            const cells = (row.cells || []).map((cell) => ({
              text: cell.layout?.textAnchor?.content?.trim() || '',
              rowSpan: cell.rowSpan || 1,
              colSpan: cell.colSpan || 1,
              confidence: cell.layout?.confidence || 0,
            }))
            rows.push({ cells })
          }

          // Process body rows
          for (const row of table.bodyRows || []) {
            const cells = (row.cells || []).map((cell) => ({
              text: cell.layout?.textAnchor?.content?.trim() || '',
              rowSpan: cell.rowSpan || 1,
              colSpan: cell.colSpan || 1,
              confidence: cell.layout?.confidence || 0,
            }))
            rows.push({ cells })
          }

          if (rows.length > 0) {
            // Calculate average confidence
            let totalConfidence = 0
            let cellCount = 0
            for (const row of rows) {
              for (const cell of row.cells) {
                totalConfidence += cell.confidence
                cellCount++
              }
            }

            tables.push({
              rows,
              headerRows: headerRowCount,
              confidence: cellCount > 0 ? totalConfidence / cellCount : 0,
            })
          }
        }
      }

      // Calculate overall confidence
      let totalConfidence = 0
      let blockCount = 0
      for (const page of result.document.pages || []) {
        for (const block of page.blocks || []) {
          if (block.confidence !== undefined) {
            totalConfidence += block.confidence
            blockCount++
          }
        }
      }
      const avgConfidence = blockCount > 0 ? totalConfidence / blockCount : 0.8

      // Track cost usage (Document AI charges per page)
      // General OCR processor: ~$0.0015 per page
      const pageCount = result.document.pages?.length || 1
      const docaiCost = pageCount * 0.0015

      // Record usage asynchronously
      recordUsage({
        provider: 'google',
        model: 'document-ai-v1',
        operation: 'ocr-document-ai',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: docaiCost,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        if (!IS_PRODUCTION) console.error('[Cost Tracking Error]', err)
      })

      // Log success in development
      if (!IS_PRODUCTION) {
        console.log(`[Document AI] Processed ${pageCount} pages, ${formFields.length} form fields, ${tables.length} tables in ${processingTimeMs}ms`)
      }

      res.json({
        success: true,
        data: {
          text: result.document.text || '',
          confidence: avgConfidence,
          pageCount,
          formFields: formFields.length > 0 ? formFields : undefined,
          tables: tables.length > 0 ? tables : undefined,
          processingTimeMs,
        },
        cost: docaiCost,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const errorDetails = {
        timestamp: new Date().toISOString(),
        provider: 'google-document-ai',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message,
        processingTimeMs: Date.now() - startTime,
      }

      if (!IS_PRODUCTION) {
        console.error('[Document AI Error]', JSON.stringify(errorDetails, null, 2))
      }

      let code = 'DOCUMENT_AI_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process document' : 'Document AI processing failed'

      if (message.includes('PERMISSION_DENIED')) {
        code = 'PERMISSION_DENIED'
        userMessage = IS_PRODUCTION ? 'Document processing service unavailable' : 'Document AI permission denied - check service account permissions'
      } else if (message.includes('NOT_FOUND')) {
        code = 'PROCESSOR_NOT_FOUND'
        userMessage = IS_PRODUCTION ? 'Document processing service unavailable' : 'Document AI processor not found - check processor ID'
      } else if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION ? 'Service busy, please try again later' : 'Document AI rate limit exceeded'
      } else if (message.includes('INVALID_ARGUMENT')) {
        code = 'INVALID_DOCUMENT'
        userMessage = IS_PRODUCTION ? 'Unable to process this document format' : 'Invalid document format for Document AI'
      }

      res.status(500).json({
        error: userMessage,
        code,
        ...(!IS_PRODUCTION && { details: message }),
        timestamp: errorDetails.timestamp,
      })
    }
  }
)

/**
 * Fallback system prompt for policy chat assistant (used when admin prompt unavailable)
 */
const CHAT_SYSTEM_PROMPT_FALLBACK = `You are an expert insurance policy assistant for the Turkish insurance market. You help users understand their insurance policies, answer questions about coverage, compare policies, and identify potential gaps or issues.

Key guidelines:
- Be helpful, professional, and concise
- When discussing coverage, always mention specific limits and deductibles when available
- If you're unsure about something, say so rather than making up information
- Use Turkish insurance terminology when appropriate (e.g., Kasko, DASK, Trafik Sigortası)
- Currency should be in TRY (Turkish Lira)
- When comparing policies, highlight key differences in coverage, limits, and exclusions
- If asked about something outside the scope of the provided policy information, politely redirect to the policy content

If the user provides policy context, use that information to answer questions accurately.`

/**
 * POST /api/ai/chat
 * Multi-turn chat endpoint for policy assistant
 * Rate limited: 60 requests per hour
 * Supports conversation history for context
 * Uses admin-managed prompt from database with fallback
 */
router.post(
  '/chat',
  validateJSON,
  chatLimiter,
  validateChat,
  async (req: Request, res: Response) => {
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'

    try {
      const { message, conversationHistory, policyContext, provider } = req.body as ChatInput

      // Try the requested provider, fall back to the other if not available
      let useProvider = provider
      if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
        useProvider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai'
      } else if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
        useProvider = process.env.OPENAI_API_KEY ? 'openai' : 'anthropic'
      }

      // Get system prompt from admin (with fallback)
      let systemPrompt: string
      const renderedPrompt = await getChatPrompt(message, policyContext)
      if (renderedPrompt) {
        systemPrompt = renderedPrompt.systemPrompt
        console.log(`[Chat] Using prompt template: ${renderedPrompt.templateName} v${renderedPrompt.version}`)
      } else {
        // Fallback to hardcoded prompt
        systemPrompt = CHAT_SYSTEM_PROMPT_FALLBACK
        if (policyContext) {
          systemPrompt += `\n\nPolicy Information:\n${policyContext}`
        }
        console.log('[Chat] Using fallback prompt (admin prompt unavailable)')
      }

      if (useProvider === 'openai') {
        const client = getOpenAIClient()
        if (!client) {
          return res.status(503).json({
            error: IS_PRODUCTION ? 'Chat service unavailable' : 'OpenAI not configured',
            code: 'PROVIDER_NOT_CONFIGURED',
          })
        }

        // Build messages array with history
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          { role: 'user', content: message },
        ]

        const response = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: 1024,
          temperature: 0.7,
        })

        const content = response.choices[0]?.message?.content
        if (!content) {
          return res.status(500).json({
            error: IS_PRODUCTION ? 'Unable to generate response' : 'Empty response from OpenAI',
            code: 'EMPTY_RESPONSE',
          })
        }

        // Track cost usage for chat
        const chatModel = response.model || 'gpt-4o-mini'
        const inputTokens = response.usage?.prompt_tokens || 0
        const outputTokens = response.usage?.completion_tokens || 0
        const cost = calculateCost(chatModel, inputTokens, outputTokens)

        // Record usage asynchronously
        recordUsage({
          provider: 'openai',
          model: chatModel,
          operation: 'chat',
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          totalCost: cost.totalCost,
          timestamp: new Date().toISOString(),
        }).catch((err) => {
          if (!IS_PRODUCTION) console.error('[Cost Tracking Error]', err)
        })

        return res.json({
          success: true,
          response: content,
          provider: 'openai',
          usage: response.usage,
          cost: cost.totalCost,
        })
      } else {
        // Anthropic
        const client = getAnthropicClient()
        if (!client) {
          return res.status(503).json({
            error: IS_PRODUCTION ? 'Chat service unavailable' : 'Anthropic not configured',
            code: 'PROVIDER_NOT_CONFIGURED',
          })
        }

        // Build messages array with history
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...conversationHistory.map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          { role: 'user', content: message },
        ]

        const response = await client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        })

        const textBlock = response.content.find((block) => block.type === 'text')
        if (!textBlock || textBlock.type !== 'text') {
          return res.status(500).json({
            error: IS_PRODUCTION ? 'Unable to generate response' : 'Empty response from Anthropic',
            code: 'EMPTY_RESPONSE',
          })
        }

        // Track cost usage for chat
        const chatModel = response.model || 'claude-3-5-haiku-20241022'
        const inputTokens = response.usage.input_tokens
        const outputTokens = response.usage.output_tokens
        const cost = calculateCost(chatModel, inputTokens, outputTokens)

        // Record usage asynchronously
        recordUsage({
          provider: 'anthropic',
          model: chatModel,
          operation: 'chat',
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          totalCost: cost.totalCost,
          timestamp: new Date().toISOString(),
        }).catch((err) => {
          if (!IS_PRODUCTION) console.error('[Cost Tracking Error]', err)
        })

        return res.json({
          success: true,
          response: textBlock.text,
          provider: 'anthropic',
          usage: {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
          },
          cost: cost.totalCost,
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorDetails = {
        timestamp: new Date().toISOString(),
        provider: (req.body as ChatInput).provider || 'unknown',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message: errorMessage,
      }

      if (!IS_PRODUCTION) {
        console.error('[Chat Error]', JSON.stringify(errorDetails, null, 2))
      }

      // Determine specific error code
      let code = 'CHAT_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process your message' : 'Chat request failed'

      if (errorMessage.includes('401') || errorMessage.includes('API key')) {
        code = 'INVALID_API_KEY'
        userMessage = IS_PRODUCTION ? 'Chat service temporarily unavailable' : 'API key is invalid'
      } else if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION ? 'Service busy, please try again later' : 'Rate limit exceeded'
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION ? 'Request timed out, please try again' : 'Request timed out'
      }

      res.status(500).json({
        error: userMessage,
        code,
        ...(!IS_PRODUCTION && { details: errorMessage }),
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
    documentAI: isDocumentAIConfigured(),
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
