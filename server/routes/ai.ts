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
import { getAIConfig } from '../services/config-service.js'
import { getChatPrompt, getExtractionPrompt } from '../services/prompt-service.js'
import * as adminNotificationService from '../services/admin-notification-service.js'
import { EXTRACTION_JSON_SCHEMA } from '../schemas/extraction-schema.js'

const router = Router()

/**
 * ANTHROPIC_SCHEMA_PROMPT
 * Claude doesn't support OpenAI's response_format parameter, so the JSON schema
 * must be included in the prompt text itself to ensure structured output.
 * This is critical for reliable extraction with Claude models.
 */
const ANTHROPIC_SCHEMA_PROMPT = `
You are an expert insurance policy analyzer. Extract all policy information and return it as valid JSON.

## CRITICAL: Output Format

You MUST respond with ONLY valid JSON matching this exact schema. Do not include any text before or after the JSON.

{
  "policyNumber": string | null,
  "provider": string | null,
  "policyType": "kasko" | "traffic" | "home" | "health" | "life" | "dask" | "business" | "nakliyat" | null,
  "policyTypeTr": string | null,
  "insuredName": string | null,
  "insuredAddress": string | null,
  "startDate": string | null,
  "endDate": string | null,
  "premium": number | null,
  "currency": string | null,
  "paymentFrequency": "annual" | "semi-annual" | "quarterly" | "monthly" | null,
  "vehicleInfo": {
    "plate": string | null,
    "make": string | null,
    "model": string | null,
    "year": number | null,
    "chassisNumber": string | null,
    "engineNumber": string | null,
    "color": string | null,
    "usageType": string | null,
    "marketValue": number | null
  } | null,
  "propertyInfo": {
    "address": string | null,
    "buildingType": string | null,
    "constructionYear": number | null,
    "squareMeters": number | null,
    "numberOfFloors": number | null,
    "floor": number | null,
    "heatingType": string | null,
    "securityFeatures": string[] | null
  } | null,
  "coverages": [
    {
      "name": string,
      "nameTr": string | null,
      "limit": number | null,
      "deductible": number | null,
      "description": string | null,
      "isUnlimited": boolean | null,
      "isMarketValue": boolean | null,
      "category": "main" | "liability" | "supplementary" | "assistance" | "legal" | "other" | null
    }
  ],
  "specialConditions": string[],
  "exclusions": string[],
  "confidence": {
    "overall": number,
    "policyNumber": number,
    "provider": number,
    "dates": number,
    "premium": number,
    "coverages": number
  },
  "amendmentInfo": {
    "isAmendment": boolean,
    "amendmentNumber": string | null,
    "amendmentDate": string | null,
    "basePolicyNumber": string | null,
    "amendmentReason": string | null,
    "premiumDifference": number | null
  }
}

## Important Notes:
- Dates must be in YYYY-MM-DD format
- Confidence scores must be between 0 and 1
- For Turkish policies, include both English (name) and Turkish (nameTr) coverage names
- Set isUnlimited: true for "Sınırsız" coverages
- Set isMarketValue: true for "Rayiç Değer" coverages
- Extract all coverages found in the document

Now analyze the following policy document:
`

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
 * Cleanup temp GCP credentials file on process exit.
 * The file is written from base64 env var and should not persist on disk.
 */
function cleanupTempCredentials(): void {
  const tempPath = path.join(process.cwd(), '.gcp-credentials-temp.json')
  try {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
      console.log('[Document AI] Cleaned up temp credentials file')
    }
  } catch {
    // Best-effort cleanup - don't crash on exit
  }
}

// Register cleanup handlers (runs on normal exit and signals)
process.on('exit', cleanupTempCredentials)
process.on('SIGINT', () => { cleanupTempCredentials(); process.exit(0) })
process.on('SIGTERM', () => { cleanupTempCredentials(); process.exit(0) })

/**
 * Get the path to GCP service account credentials
 */
// Cache for credentials file path (written once from env var)
let _cachedCredentialsPath: string | null = null

function getGCPCredentialsPath(): string | null {
  // Return cached path if already resolved
  if (_cachedCredentialsPath) {
    return _cachedCredentialsPath
  }

  // Check environment variable for file path first
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    _cachedCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    return _cachedCredentialsPath
  }

  // Check for base64-encoded credentials (for Railway/Heroku/etc.)
  // This allows passing service account JSON as an environment variable
  // Supports both GCP_SERVICE_ACCOUNT_BASE64 (user's existing var) and GCP_CREDENTIALS_BASE64
  const base64Credentials = process.env.GCP_SERVICE_ACCOUNT_BASE64 || process.env.GCP_CREDENTIALS_BASE64
  if (base64Credentials) {
    try {
      const credentialsJson = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      // Validate it's proper JSON
      JSON.parse(credentialsJson)
      // Write to temp file
      const tempPath = path.join(process.cwd(), '.gcp-credentials-temp.json')
      fs.writeFileSync(tempPath, credentialsJson, { mode: 0o600 })
      console.log('[Document AI] Credentials loaded from base64 environment variable')
      _cachedCredentialsPath = tempPath
      return _cachedCredentialsPath
    } catch (error) {
      console.error('[Document AI] Failed to decode base64 credentials:', error)
    }
  }

  // Check common locations
  const possiblePaths = [
    path.join(process.cwd(), 'gcp-service-account.json'),
    path.join(__dirname, '..', '..', 'gcp-service-account.json'),
    path.join(__dirname, '..', '..', '..', 'gcp-service-account.json'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      _cachedCredentialsPath = p
      return _cachedCredentialsPath
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
  console.log('[Document AI] getDocumentAIAccessToken() called')
  const credentialsPath = getGCPCredentialsPath()
  console.log('[Document AI] Credentials path:', credentialsPath)
  if (!credentialsPath) {
    console.error('[Document AI] No credentials file found')
    return null
  }

  try {
    console.log('[Document AI] Creating GoogleAuth instance...')
    const auth = new GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    console.log('[Document AI] GoogleAuth created, getting access token...')
    const token = await auth.getAccessToken()
    console.log('[Document AI] Access token obtained successfully, length:', token ? String(token).length : 0)
    return token as string
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : ''
    console.error('[Document AI] Failed to get access token:', errorMessage)
    console.error('[Document AI] Error stack:', errorStack)
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
    status?: string  // GCP error status like "INVALID_ARGUMENT", "PERMISSION_DENIED"
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

      // Get AI config from database (falls back to defaults if unavailable)
      const aiConfig = await getAIConfig()
      console.log(`[${requestId}] 🔧 Using config: model=${model || aiConfig.openaiExtractionModel}, temp=${aiConfig.temperature}, tokens=${aiConfig.maxTokens}`)

      // Ensure "json" is in the prompt (required by OpenAI when using response_format: json_object)
      const jsonReminder = '\n\nRespond with valid JSON only.'
      const systemPromptWithJson = finalSystemPrompt.includes('json') || finalSystemPrompt.includes('JSON')
        ? finalSystemPrompt
        : finalSystemPrompt + jsonReminder
      const userPromptWithJson = finalUserPrompt.includes('json') || finalUserPrompt.includes('JSON') || systemPromptWithJson.includes('json')
        ? finalUserPrompt
        : finalUserPrompt + jsonReminder

      const response = await client.chat.completions.create({
        model: model || aiConfig.openaiExtractionModel,
        messages: [
          { role: 'system', content: systemPromptWithJson },
          { role: 'user', content: userPromptWithJson },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: EXTRACTION_JSON_SCHEMA,
        },
        max_tokens: aiConfig.maxTokens,
        temperature: aiConfig.temperature,
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
        // Still prepend schema for reliable JSON output
        finalSystemPrompt = ANTHROPIC_SCHEMA_PROMPT
        finalUserPrompt = clientPrompt + '\n\n' + documentText
      } else {
        // Use admin-managed prompt with schema
        const renderedPrompt = await getExtractionPrompt(documentText, policyType)
        if (renderedPrompt) {
          // Prepend schema to admin prompt for reliable JSON output
          finalSystemPrompt = ANTHROPIC_SCHEMA_PROMPT
          finalUserPrompt = renderedPrompt.userPrompt
          promptTemplateUsed = `${renderedPrompt.templateName} v${renderedPrompt.version}`
          console.log(`[Extraction/Anthropic] Using prompt template: ${promptTemplateUsed} (with schema)`)
        } else {
          finalSystemPrompt = ANTHROPIC_SCHEMA_PROMPT
          console.log('[Extraction/Anthropic] Using ANTHROPIC_SCHEMA_PROMPT fallback')
        }
      }

      // Get AI config from database (falls back to defaults if unavailable)
      const aiConfig = await getAIConfig()

      const response = await client.messages.create({
        model: model || aiConfig.anthropicExtractionModel,
        max_tokens: aiConfig.maxTokens,
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
      const usedModel = response.model || model || aiConfig.anthropicExtractionModel
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
      // Always log errors for debugging
      console.error('[Anthropic Extraction Error]', JSON.stringify(errorDetails, null, 2))

      // Determine specific error code and notify admin for certain errors
      const IS_PRODUCTION = process.env.NODE_ENV === 'production'
      let code = 'EXTRACTION_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process document' : 'Anthropic extraction failed'
      let shouldNotifyAdmin = false
      let notificationCategory: 'billing' | 'api_error' | 'rate_limit' = 'api_error'

      if (message.includes('401') || message.includes('invalid x-api-key') || message.includes('Invalid API Key')) {
        code = 'INVALID_API_KEY'
        userMessage = IS_PRODUCTION ? 'AI service temporarily unavailable' : 'Anthropic API key is invalid'
        shouldNotifyAdmin = true
        notificationCategory = 'api_error'
      } else if (message.includes('429') || message.includes('rate_limit')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION ? 'Service busy, please try again later' : 'Anthropic rate limit exceeded - please wait and retry'
        shouldNotifyAdmin = true
        notificationCategory = 'rate_limit'
      } else if (message.includes('credit') || message.includes('billing') || message.includes('overloaded')) {
        code = 'BILLING_ERROR'
        userMessage = IS_PRODUCTION ? 'AI service temporarily unavailable' : 'Anthropic billing issue - check your account'
        shouldNotifyAdmin = true
        notificationCategory = 'billing'
      } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION ? 'Request timed out, please try again' : 'Request timed out - try a smaller document'
      }

      // Create admin notification for critical errors
      if (shouldNotifyAdmin) {
        if (notificationCategory === 'billing') {
          adminNotificationService.notifyBillingIssue('Anthropic', message, errorDetails).catch((err) => {
            console.error('[Admin Notification Error]', err)
          })
        } else if (notificationCategory === 'rate_limit') {
          adminNotificationService.notifyRateLimit('Anthropic', errorDetails).catch((err) => {
            console.error('[Admin Notification Error]', err)
          })
        } else {
          adminNotificationService.notifyAPIError('Anthropic', code, message, errorDetails).catch((err) => {
            console.error('[Admin Notification Error]', err)
          })
        }
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
 * POST /api/ai/extract
 * Unified extraction endpoint with automatic fallback
 * Tries primary provider first (Anthropic), falls back to OpenAI if it fails
 * Rate limited: 20 requests per hour
 * Creates admin notifications on critical errors
 */
router.post(
  '/extract',
  validateJSON,
  aiExtractionLimiter,
  validateAnthropicExtraction, // Use same validation
  async (req: Request, res: Response) => {
    const requestId = `ext-${Date.now()}`
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'
    console.log(`[${requestId}] Unified extraction request received`)

    const { documentText, systemPrompt: clientPrompt, model, policyType } = req.body as AnthropicExtractionInput & { policyType?: string; model?: string }

    // Get extraction prompt (shared between providers)
    // For Anthropic, we use ANTHROPIC_SCHEMA_PROMPT to ensure structured JSON output
    // For OpenAI, we use response_format: json_schema
    const anthropicSystemPrompt: string = ANTHROPIC_SCHEMA_PROMPT
    let openaiSystemPrompt: string
    let finalUserPrompt = documentText

    if (clientPrompt) {
      openaiSystemPrompt = clientPrompt
      finalUserPrompt = documentText
    } else {
      const renderedPrompt = await getExtractionPrompt(documentText, policyType)
      if (renderedPrompt) {
        openaiSystemPrompt = renderedPrompt.systemPrompt
        finalUserPrompt = renderedPrompt.userPrompt
        console.log(`[${requestId}] Using prompt template: ${renderedPrompt.templateName} v${renderedPrompt.version}`)
      } else {
        openaiSystemPrompt = 'Extract policy information as JSON.'
        console.log(`[${requestId}] Using fallback prompt`)
      }
    }

    // Get AI config from database (falls back to defaults if unavailable)
    const aiConfig = await getAIConfig()
    console.log(`[${requestId}] 🔧 Using config: anthropic=${aiConfig.anthropicExtractionModel}, openai=${aiConfig.openaiExtractionModel}`)

    // Try Anthropic first if available
    const anthropicClient = getAnthropicClient()
    const openaiClient = getOpenAIClient()

    if (anthropicClient) {
      console.log(`[${requestId}] Trying Anthropic first (with ANTHROPIC_SCHEMA_PROMPT)...`)
      try {
        const response = await anthropicClient.messages.create({
          model: model || aiConfig.anthropicExtractionModel,
          max_tokens: aiConfig.maxTokens,
          system: anthropicSystemPrompt,
          messages: [{ role: 'user', content: finalUserPrompt }],
        })

        const textBlock = response.content.find((block) => block.type === 'text')
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('Empty response from Anthropic')
        }

        // Parse JSON from response
        let jsonContent = textBlock.text
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
          jsonContent = jsonMatch[1].trim()
        }

        // Track cost
        const usedModel = response.model || model || aiConfig.anthropicExtractionModel
        const inputTokens = response.usage.input_tokens
        const outputTokens = response.usage.output_tokens
        const cost = calculateCost(usedModel, inputTokens, outputTokens)

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
        }).catch(() => {})

        console.log(`[${requestId}] Anthropic extraction successful`)
        return res.json({
          success: true,
          data: JSON.parse(jsonContent),
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          model: response.model,
          provider: 'anthropic',
          cost: cost.totalCost,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[${requestId}] Anthropic failed:`, message)

        // Determine if we should notify admin and fall back
        const isBillingError = message.includes('credit') || message.includes('billing')
        const isRateLimitError = message.includes('429') || message.includes('rate_limit')
        const isAuthError = message.includes('401') || message.includes('invalid x-api-key')

        // Notify admin for critical errors
        if (isBillingError) {
          console.log(`[${requestId}] Anthropic billing error - notifying admin and falling back to OpenAI`)
          adminNotificationService.notifyBillingIssue('Anthropic', message, {
            requestId,
            errorMessage: message,
            timestamp: new Date().toISOString(),
          }).catch(() => {})
        } else if (isRateLimitError) {
          console.log(`[${requestId}] Anthropic rate limit - notifying admin and falling back to OpenAI`)
          adminNotificationService.notifyRateLimit('Anthropic', {
            requestId,
            errorMessage: message,
            timestamp: new Date().toISOString(),
          }).catch(() => {})
        } else if (isAuthError) {
          console.log(`[${requestId}] Anthropic auth error - notifying admin and falling back to OpenAI`)
          adminNotificationService.notifyAPIError('Anthropic', 'INVALID_API_KEY', message, {
            requestId,
            timestamp: new Date().toISOString(),
          }).catch(() => {})
        }

        // Fall back to OpenAI if available
        if (openaiClient) {
          console.log(`[${requestId}] Falling back to OpenAI...`)
        }
      }
    }

    // Try OpenAI (either as fallback or primary)
    if (openaiClient) {
      try {
        // Ensure "json" is in the prompt for OpenAI
        const jsonReminder = '\n\nRespond with valid JSON only.'
        const systemPromptWithJson = openaiSystemPrompt.includes('json') || openaiSystemPrompt.includes('JSON')
          ? openaiSystemPrompt
          : openaiSystemPrompt + jsonReminder
        const userPromptWithJson = finalUserPrompt.includes('json') || finalUserPrompt.includes('JSON') || systemPromptWithJson.includes('json')
          ? finalUserPrompt
          : finalUserPrompt + jsonReminder

        const response = await openaiClient.chat.completions.create({
          model: aiConfig.openaiExtractionModel,
          messages: [
            { role: 'system', content: systemPromptWithJson },
            { role: 'user', content: userPromptWithJson },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: EXTRACTION_JSON_SCHEMA,
          },
          max_tokens: aiConfig.maxTokens,
          temperature: aiConfig.temperature,
        })

        const content = response.choices[0]?.message?.content
        if (!content) {
          throw new Error('Empty response from OpenAI')
        }

        // Track cost
        const usedModel = response.model || aiConfig.openaiExtractionModel
        const inputTokens = response.usage?.prompt_tokens || 0
        const outputTokens = response.usage?.completion_tokens || 0
        const cost = calculateCost(usedModel, inputTokens, outputTokens)

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
        }).catch(() => {})

        console.log(`[${requestId}] OpenAI extraction successful (fallback: ${!!anthropicClient})`)
        return res.json({
          success: true,
          data: JSON.parse(content),
          usage: response.usage,
          model: response.model,
          provider: 'openai',
          fallback: !!anthropicClient, // Indicates if we fell back from Anthropic
          cost: cost.totalCost,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[${requestId}] OpenAI also failed:`, message)

        // Notify admin about OpenAI failure too
        if (message.includes('insufficient_quota') || message.includes('billing')) {
          adminNotificationService.notifyBillingIssue('OpenAI', message, {
            requestId,
            timestamp: new Date().toISOString(),
          }).catch(() => {})
        }

        return res.status(500).json({
          error: IS_PRODUCTION ? 'Unable to process document' : 'All AI providers failed',
          code: 'ALL_PROVIDERS_FAILED',
          ...(process.env.NODE_ENV !== 'production' && { details: message }),
          timestamp: new Date().toISOString(),
        })
      }
    }

    // No providers available
    return res.status(503).json({
      error: IS_PRODUCTION ? 'AI service unavailable' : 'No AI providers configured',
      code: 'NO_PROVIDERS_CONFIGURED',
    })
  }
)

/**
 * POST /api/ai/ocr
 * Proxy for Google Cloud Vision OCR
 * Rate limited: 30 requests per hour
 * Validated: imageBase64 required, max 15MB, valid base64 format
 *
 * Authentication priority (most secure first):
 * 1. Service account OAuth token (if GCP_SERVICE_ACCOUNT_BASE64 configured)
 * 2. API key in header (X-goog-api-key) - keeps key out of URLs/logs
 * 3. API key in query param (fallback) - less secure, visible in logs
 */
router.post(
  '/ocr',
  validateJSON,
  ocrLimiter,
  validateOCR,
  async (req: Request, res: Response) => {
    try {
      // Try OAuth token first (most secure - uses service account, no API key exposure)
      const oauthToken = await getDocumentAIAccessToken()
      const apiKey = process.env.GOOGLE_CLOUD_API_KEY

      if (!oauthToken && !apiKey) {
        return res.status(503).json({
          error: 'Google Cloud not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      // Body is validated and sanitized by middleware
      const { imageBase64 } = req.body as OCRInput

      // Build request with appropriate authentication
      // Priority: OAuth token > API key header > API key query param
      let url = 'https://vision.googleapis.com/v1/images:annotate'
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (oauthToken) {
        // Most secure: OAuth bearer token from service account
        headers['Authorization'] = `Bearer ${oauthToken}`
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Vision OCR] Using OAuth bearer token authentication')
        }
      } else if (apiKey) {
        // Fallback: API key in header (X-goog-api-key with correct capitalization)
        // Note: Header keeps API key out of URL logs, but query param is more reliable
        // Using query param as Google REST APIs have inconsistent header support
        url = `${url}?key=${apiKey}`
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Vision OCR] Using API key authentication (query param)')
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
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
    // Version marker for debugging deployments (v4 = Jan 28 2026, enableImagelessMode fix)
    // Version marker: v5 = removed unsupported enableImagelessMode (standard OCR processor, 15-page limit)
    console.log('[Document AI] OCR route v5 invoked (standard processor, 15-page limit)')
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'
    const startTime = Date.now()

    try {
      // Check if Document AI is configured
      console.log('[Document AI] Checking configuration...')
      if (!isDocumentAIConfigured()) {
        console.log('[Document AI] NOT configured, returning 503')
        return res.status(503).json({
          error: IS_PRODUCTION ? 'Document processing service unavailable' : 'Document AI not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      // Get access token
      console.log('[Document AI] Getting access token...')
      const accessToken = await getDocumentAIAccessToken()
      if (!accessToken) {
        console.error('[Document AI] Access token is null/empty, returning 503')
        return res.status(503).json({
          error: IS_PRODUCTION ? 'Document processing service unavailable' : 'Failed to get Document AI access token',
          code: 'AUTH_FAILED',
        })
      }
      console.log('[Document AI] Access token received')

      const { documentBase64, mimeType, languageHints } = req.body as DocumentAIInput

      // Build Document AI endpoint
      const endpoint = `https://${GCP_CONFIG.location}-documentai.googleapis.com/v1/projects/${GCP_CONFIG.projectId}/locations/${GCP_CONFIG.location}/processors/${GCP_CONFIG.processorId}:process`

      console.log(`[Document AI] Calling API: ${GCP_CONFIG.location}-documentai.googleapis.com, project=${GCP_CONFIG.projectId}, processor=${GCP_CONFIG.processorId}`)

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
          skipHumanReview: true,
          // Note: enableImagelessMode is only available on Enterprise Document OCR processors
          // Standard OCR processors have a 15-page limit
          // For documents >15 pages, the fallback to pdf.js will be used
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
        // Enhanced error logging for debugging
        console.error('[Document AI] API call failed:', {
          status: response.status,
          statusText: response.statusText,
          errorMessage: errorData.error?.message,
          errorCode: errorData.error?.code,
          errorStatus: errorData.error?.status,
          processingTimeMs: Date.now() - startTime,
        })
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

      // ALWAYS log Document AI errors (needed to debug production issues)
      console.error('[Document AI Error]', JSON.stringify(errorDetails, null, 2))

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
      } else if (message.includes('exceed the limit') || message.includes('exceed limit')) {
        // Standard OCR processor has a 15-page limit per request.
        // Documents >15 pages should be split client-side via pdf-splitter.ts.
        code = 'PAGE_LIMIT_EXCEEDED'
        console.error('[Document AI] PAGE LIMIT ERROR - document should have been split before sending')
        console.error('[Document AI] Error message:', message)
        userMessage = IS_PRODUCTION
          ? 'Document exceeds page limit. Please upload a document with 15 or fewer pages per chunk.'
          : `Document AI page limit exceeded: ${message}. Documents >15 pages must be split via pdf-splitter.ts.`
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

      // Get AI config for chat settings
      const aiConfig = await getAIConfig()

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
          model: aiConfig.openaiBackupModel, // Use backup/fast model for chat
          messages,
          max_tokens: 1024,
          temperature: aiConfig.chatTemperature,
        })

        const content = response.choices[0]?.message?.content
        if (!content) {
          return res.status(500).json({
            error: IS_PRODUCTION ? 'Unable to generate response' : 'Empty response from OpenAI',
            code: 'EMPTY_RESPONSE',
          })
        }

        // Track cost usage for chat
        const chatModel = response.model || aiConfig.openaiBackupModel
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
          model: aiConfig.anthropicBackupModel, // Use backup/fast model for chat
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
        const chatModel = response.model || aiConfig.anthropicBackupModel
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
  authMethod?: string // 'oauth' | 'api_key' - only for Google Vision
}

/**
 * Sanitize diagnostic error message for production
 * In production, hide technical details like .env file paths and API key names
 */
function sanitizeDiagnosticError(error: string, isProduction: boolean): string {
  if (!isProduction) return error

  // Map technical errors to user-friendly messages for SaaS
  if (error.includes('Invalid API key') || error.includes('401') || error.includes('Incorrect') || error.includes('Authentication failed')) {
    return 'Service configuration error'
  }
  if (error.includes('Rate limit') || error.includes('429') || error.includes('quota') || error.includes('try again later')) {
    return 'Service temporarily busy'
  }
  if (error.includes('billing') || error.includes('credit') || error.includes('BILLING') || error.includes('Billing')) {
    return 'Service temporarily unavailable'
  }
  if (error.includes('PERMISSION_DENIED') || error.includes('not enabled') || error.includes('Permission denied')) {
    return 'Service not available'
  }
  if (error.includes('NOT_FOUND') || error.includes('not found') || error.includes('404')) {
    return 'Service not configured'
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
  // Check both OAuth (service account) and API key authentication
  const googleApiKey = process.env.GOOGLE_CLOUD_API_KEY
  const hasServiceAccount = !!getGCPCredentialsPath()

  if (googleApiKey || hasServiceAccount) {
    diagnostics.google.configured = true
    const startTime = Date.now()
    try {
      // Try OAuth token first (most secure)
      const oauthToken = hasServiceAccount ? await getDocumentAIAccessToken() : null

      // Build request with appropriate authentication
      let url = 'https://vision.googleapis.com/v1/images:annotate'
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      let authMethod = 'none'
      if (oauthToken) {
        headers['Authorization'] = `Bearer ${oauthToken}`
        authMethod = 'oauth'
      } else if (googleApiKey) {
        url = `${url}?key=${googleApiKey}`
        authMethod = 'api_key'
      }

      // Make a minimal API call to verify credentials work
      // Using a tiny 1x1 white PNG to minimize cost
      const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requests: [{ image: { content: testImage }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }],
        }),
      })
      diagnostics.google.latencyMs = Date.now() - startTime

      if (response.ok) {
        diagnostics.google.valid = true
        // Only show details in non-production
        if (!IS_PRODUCTION) {
          diagnostics.google.model = 'cloud-vision-v1'
          // Show which auth method was used (oauth is more secure than api_key)
          diagnostics.google.authMethod = authMethod
        }
      } else {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string; status?: string; code?: number }
        }
        diagnostics.google.valid = false

        // Check both message and status fields from Google Cloud API response
        const errorMessage = errorData.error?.message || ''
        const errorStatus = errorData.error?.status || ''
        const httpStatus = response.status

        // Log full error in development for debugging
        if (!IS_PRODUCTION) {
          console.log('[Vision Diagnose] Error response:', {
            authMethod,
            httpStatus,
            errorStatus,
            errorMessage,
            fullError: errorData.error
          })
        }

        let errorMsg = errorMessage || `HTTP ${httpStatus}`

        // Map Google Cloud error statuses to actionable messages
        if (errorMsg.includes('API key not valid') || httpStatus === 400) {
          errorMsg = 'Invalid API key - check GOOGLE_CLOUD_API_KEY in .env'
        } else if (errorStatus === 'PERMISSION_DENIED' || errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('has not been used')) {
          errorMsg = 'Cloud Vision API not enabled - enable it in Google Cloud Console'
        } else if (errorStatus === 'UNAUTHENTICATED' || httpStatus === 401) {
          errorMsg = 'Authentication failed - check GOOGLE_CLOUD_API_KEY'
        } else if (errorStatus === 'FAILED_PRECONDITION' || errorMsg.includes('Billing') || errorMsg.includes('BILLING')) {
          errorMsg = 'Billing not enabled on Google Cloud project'
        } else if (errorStatus === 'RESOURCE_EXHAUSTED' || httpStatus === 429) {
          errorMsg = 'Rate limit exceeded - try again later'
        } else if (errorStatus === 'NOT_FOUND' || httpStatus === 404) {
          errorMsg = 'Vision API endpoint not found - check API configuration'
        } else if (httpStatus === 403) {
          // Catch-all for 403 errors with unrecognized status
          errorMsg = `Permission denied (${errorStatus || 'unknown'}) - check API key permissions`
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

// ============================================================================
// PROCESSING LOGS (Document Journey Tracking)
// ============================================================================

import * as processingLogService from '../services/processing-log-service.js'

/**
 * Create a new processing log
 * POST /api/ai/processing-log
 */
router.post('/processing-log', async (req: Request, res: Response) => {
  try {
    const log = req.body

    if (!log.document_id || !log.filename) {
      res.status(400).json({
        success: false,
        error: 'document_id and filename are required',
      })
      return
    }

    const result = await processingLogService.createProcessingLog(log)

    if (result.error || !result.data) {
      res.status(500).json({
        success: false,
        error: result.error || 'Unknown database error',
      })
      return
    }

    res.json({ success: true, data: result.data })
  } catch (error) {
    console.error('Failed to create processing log:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create processing log',
    })
  }
})

/**
 * Update a processing log
 * PATCH /api/ai/processing-log/:documentId
 */
router.patch('/processing-log/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params
    const updates = req.body

    const result = await processingLogService.updateProcessingLog(documentId, updates)

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Processing log not found',
      })
      return
    }

    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Failed to update processing log:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update processing log',
    })
  }
})

/**
 * Add a stage to a processing log
 * POST /api/ai/processing-log/:documentId/stage
 */
router.post('/processing-log/:documentId/stage', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params
    const stage = req.body

    if (!stage.stage || !stage.status) {
      res.status(400).json({
        success: false,
        error: 'stage and status are required',
      })
      return
    }

    const success = await processingLogService.addProcessingStage(documentId, stage)

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Processing log not found',
      })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Failed to add processing stage:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add processing stage',
    })
  }
})

/**
 * Get a processing log by document ID
 * GET /api/ai/processing-log/:documentId
 */
router.get('/processing-log/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params
    const log = await processingLogService.getProcessingLog(documentId)

    if (!log) {
      res.status(404).json({
        success: false,
        error: 'Processing log not found',
      })
      return
    }

    res.json({ success: true, data: log })
  } catch (error) {
    console.error('Failed to get processing log:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get processing log',
    })
  }
})

export default router
