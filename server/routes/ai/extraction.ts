/**
 * AI Proxy Routes
 *
 * Secure server-side proxy for AI provider APIs.
 * Keeps API keys secure on the server, never exposed to the browser.
 * Includes cost tracking and budget enforcement.
 */

import Anthropic from '@anthropic-ai/sdk'
import { Request, Response, Router } from 'express'
import * as fs from 'fs'
import { GoogleAuth } from 'google-auth-library'
import OpenAI from 'openai'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { EXTRACTION_JSON_SCHEMA } from '../../../shared/extraction-schema.js'
import logger from '../../lib/logger.js'
import { captureServerError } from '../../lib/sentry.js'
import { calculateCost, recordUsage } from '../../middleware/cost-control.js'
import { aiExtractionLimiter, ocrLimiter } from '../../middleware/rate-limit.js'
import {
  validateAnthropicExtraction,
  validateDocumentAI,
  validateJSON,
  validateOCR,
  validateOpenAIExtraction,
  type AnthropicExtractionInput,
  type DocumentAIInput,
  type OCRInput,
  type OpenAIExtractionInput,
} from '../../middleware/validation.js'
import * as adminNotificationService from '../../services/admin-notification-service.js'
import { getAIConfig } from '../../services/config-service.js'
import { sendExtractionCompleteNotification } from '../../services/notification-service.js'
import { getExtractionPrompt } from '../../services/prompt-service.js'
import { buildAnthropicSchemaPrompt, type ConfidenceWeights } from '../../lib/ai-prompts.js'
import { recordExtractionEvent, recordOverviewMetrics } from './shared.js'

const log = logger.child('AI')

// ES Module directory resolution
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

// Note: callers should use buildAnthropicSchemaPrompt(weights) with config-driven weights

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
      log.debug('Cleaned up temp credentials file')
    }
  } catch {
    // Best-effort cleanup - don't crash on exit
  }
}

// Register cleanup handlers (runs on normal exit and signals)
process.on('exit', cleanupTempCredentials)
process.on('SIGINT', () => {
  cleanupTempCredentials()
  process.exit(0)
})
process.on('SIGTERM', () => {
  cleanupTempCredentials()
  process.exit(0)
})

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
  const base64Credentials =
    process.env.GCP_SERVICE_ACCOUNT_BASE64 || process.env.GCP_CREDENTIALS_BASE64
  if (base64Credentials) {
    try {
      const credentialsJson = Buffer.from(base64Credentials, 'base64').toString('utf-8')
      // Validate it's proper JSON
      JSON.parse(credentialsJson)
      // Write to temp file
      const tempPath = path.join(process.cwd(), '.gcp-credentials-temp.json')
      fs.writeFileSync(tempPath, credentialsJson, { mode: 0o600 })
      log.info('Credentials loaded from base64 environment variable')
      _cachedCredentialsPath = tempPath
      return _cachedCredentialsPath
    } catch (error) {
      log.error('Failed to decode base64 credentials', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Check common locations
  const possiblePaths = [
    path.join(process.cwd(), 'gcp-service-account.json'),
    path.join(__dirname, '..', '..', '..', 'gcp-service-account.json'),
    path.join(__dirname, '..', '..', '..', '..', 'gcp-service-account.json'),
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
  log.debug('getDocumentAIAccessToken called')
  const credentialsPath = getGCPCredentialsPath()
  log.debug('Credentials path resolved', { credentialsPath })
  if (!credentialsPath) {
    log.error('No credentials file found')
    return null
  }

  try {
    log.debug('Creating GoogleAuth instance')
    const auth = new GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    log.debug('GoogleAuth created, getting access token')
    const token = await auth.getAccessToken()
    log.debug('Access token obtained successfully', {
      tokenLength: token ? String(token).length : 0,
    })
    return token as string
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : ''
    log.error('Failed to get access token', { error: errorMessage, stack: errorStack })
    return null
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
    const startTime = Date.now()
    log.info('Extraction request received', { requestId })

    try {
      const client = getOpenAIClient()
      if (!client) {
        log.warn('OpenAI client not configured', { requestId })
        return res.status(503).json({
          error: 'OpenAI not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }
      log.debug('OpenAI client ready', { requestId })

      // Body is validated and sanitized by middleware
      const {
        documentText,
        systemPrompt: clientPrompt,
        model,
        policyType,
      } = req.body as OpenAIExtractionInput & { policyType?: string }
      log.info('Document received', {
        requestId,
        chars: documentText?.length || 0,
        type: policyType || 'auto-detect',
        model: model || 'gpt-4o',
      })

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
          log.info('Using prompt template', {
            requestId,
            provider: 'openai',
            template: promptTemplateUsed,
          })
        } else {
          finalSystemPrompt = 'Extract policy information as JSON.'
          log.info('Using fallback prompt', {
            requestId,
            provider: 'openai',
            reason: 'admin prompt unavailable',
          })
        }
      }

      log.info('Calling OpenAI API', { requestId })
      log.debug('System prompt preview', {
        requestId,
        preview: finalSystemPrompt.substring(0, 100),
      })
      log.debug('User prompt length', { requestId, chars: finalUserPrompt.length })

      // Get AI config from database (falls back to defaults if unavailable)
      const aiConfig = await getAIConfig()
      log.info('Using config', {
        requestId,
        model: model || aiConfig.openaiExtractionModel,
        temperature: aiConfig.temperature,
        maxTokens: aiConfig.maxTokens,
      })

      // Ensure "json" is in the prompt (required by OpenAI when using response_format: json_object)
      const jsonReminder = '\n\nRespond with valid JSON only.'
      const systemPromptWithJson =
        finalSystemPrompt.includes('json') || finalSystemPrompt.includes('JSON')
          ? finalSystemPrompt
          : finalSystemPrompt + jsonReminder
      const userPromptWithJson =
        finalUserPrompt.includes('json') ||
        finalUserPrompt.includes('JSON') ||
        systemPromptWithJson.includes('json')
          ? finalUserPrompt
          : finalUserPrompt + jsonReminder

      const response = await client.chat.completions.create(
        {
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
        },
        { signal: AbortSignal.timeout(60_000) }
      )
      log.debug('OpenAI responded', { requestId })

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
          log.debug('Cost tracking failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })

      let parsedData: unknown
      try {
        parsedData = JSON.parse(content)
      } catch (parseError) {
        log.error('OpenAI returned invalid JSON', {
          requestId,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          contentPreview: content.slice(0, 200),
        })
        return res
          .status(502)
          .json({ success: false, error: 'AI returned invalid JSON', code: 'INVALID_JSON' })
      }

      log.info('Extraction successful', {
        requestId,
        inputTokens,
        outputTokens,
        cost: cost.totalCost,
      })

      // Record successful extraction metric
      recordExtractionEvent({
        requestId,
        timestamp: new Date().toISOString(),
        provider: 'openai',
        success: true,
        durationMs: Date.now() - startTime,
        documentLength: (req.body as OpenAIExtractionInput).documentText?.length ?? 0,
      })
      recordOverviewMetrics({
        requestId,
        provider: 'openai',
        model: usedModel,
        operation: 'extraction',
        success: true,
        durationMs: Date.now() - startTime,
        inputTokens,
        outputTokens,
        cost: cost.totalCost,
        documentLength: (req.body as OpenAIExtractionInput).documentText?.length ?? 0,
        userId: req.headers['x-user-id'] as string | undefined,
      })

      // Fire push notification if user is authenticated (non-blocking fire-and-forget)
      const notifyUserIdOAI = req.headers['x-user-id'] as string | undefined
      if (notifyUserIdOAI) {
        const extractedOAI = parsedData as Record<string, unknown>
        sendExtractionCompleteNotification(
          notifyUserIdOAI,
          String(extractedOAI.policyType || 'policy'),
          (extractedOAI.policyNumber as string | null | undefined) ?? null
        ).catch((err) =>
          log.warn('Push notification failed after OpenAI extraction', {
            requestId,
            error: err instanceof Error ? err.message : String(err),
          })
        )
      }

      res.json({
        success: true,
        data: parsedData,
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
      log.error('Extraction failed', {
        requestId,
        errorType: errorDetails.errorType,
        message: message.substring(0, 200),
      })

      // Determine specific error code
      // In production, show generic messages; in dev/staging, show specific ones
      const IS_PRODUCTION = process.env.NODE_ENV === 'production'
      let code = 'EXTRACTION_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process document' : 'OpenAI extraction failed'

      if (message.includes('401') || message.includes('Incorrect API key')) {
        code = 'INVALID_API_KEY'
        userMessage = IS_PRODUCTION
          ? 'AI service temporarily unavailable'
          : 'OpenAI API key is invalid'
      } else if (message.includes('429')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION
          ? 'Service busy, please try again later'
          : 'OpenAI rate limit exceeded - please wait and retry'
      } else if (message.includes('insufficient_quota')) {
        code = 'QUOTA_EXCEEDED'
        userMessage = IS_PRODUCTION
          ? 'AI service temporarily unavailable'
          : 'OpenAI API quota exhausted - add credits to your account'
      } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION
          ? 'Request timed out, please try again'
          : 'Request timed out - try a smaller document'
      } else if (message.includes('context_length_exceeded')) {
        code = 'DOCUMENT_TOO_LARGE'
        userMessage = IS_PRODUCTION
          ? 'Document is too large to process'
          : 'Document too large for AI processing'
      }

      // Capture in Sentry with extraction context
      captureServerError(error instanceof Error ? error : new Error(message), {
        requestId,
        provider: 'openai',
        errorCode: code,
        documentLength: errorDetails.documentTextLength,
      })

      // Record extraction metric
      recordExtractionEvent({
        requestId,
        timestamp: errorDetails.timestamp,
        provider: 'openai',
        success: false,
        durationMs: Date.now() - startTime,
        errorCode: code,
        errorMessage: message.substring(0, 200),
        documentLength: errorDetails.documentTextLength,
      })
      recordOverviewMetrics({
        requestId,
        provider: 'openai',
        model: 'gpt-4o',
        operation: 'extraction',
        success: false,
        durationMs: Date.now() - startTime,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        documentLength: errorDetails.documentTextLength,
        userId: req.headers['x-user-id'] as string | undefined,
        errorCode: code,
        errorMessage: message.substring(0, 200),
      })

      // Notify admin of extraction failure
      adminNotificationService
        .notifyAPIError('OpenAI', code, message.substring(0, 200), {
          requestId,
          documentLength: errorDetails.documentTextLength,
        })
        .catch((err) =>
          log.warn('Failed to notify extraction error', {
            requestId,
            error: err instanceof Error ? err.message : String(err),
          })
        )

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
    const requestId = `ext-ant-${Date.now()}`
    const startTime = Date.now()
    try {
      const client = getAnthropicClient()
      if (!client) {
        return res.status(503).json({
          error: 'Anthropic not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      // Body is validated and sanitized by middleware
      const {
        documentText,
        systemPrompt: clientPrompt,
        model,
        policyType,
      } = req.body as AnthropicExtractionInput & { policyType?: string }

      // Get AI config from database first (needed for dynamic confidence weights in prompt)
      const aiConfig = await getAIConfig()

      // Build Anthropic schema prompt with admin-configurable confidence weights
      const confidenceWeights: ConfidenceWeights = {
        policyNumber: aiConfig.confidenceWeightPolicyNumber,
        provider: aiConfig.confidenceWeightProvider,
        dates: aiConfig.confidenceWeightDates,
        premium: aiConfig.confidenceWeightPremium,
        coverages: aiConfig.confidenceWeightCoverages,
      }
      const schemaPrompt = buildAnthropicSchemaPrompt(confidenceWeights)

      // Get extraction prompt from admin system (falls back to hardcoded if unavailable)
      let finalSystemPrompt: string
      let finalUserPrompt = documentText
      let promptTemplateUsed: string | undefined

      if (clientPrompt) {
        // Use client-provided prompt (backward compatibility)
        // Still prepend schema for reliable JSON output
        finalSystemPrompt = schemaPrompt
        finalUserPrompt = clientPrompt + '\n\n' + documentText
      } else {
        // Use admin-managed prompt with schema
        const renderedPrompt = await getExtractionPrompt(documentText, policyType)
        if (renderedPrompt) {
          // Prepend schema to admin prompt for reliable JSON output
          finalSystemPrompt = schemaPrompt
          finalUserPrompt = renderedPrompt.userPrompt
          promptTemplateUsed = `${renderedPrompt.templateName} v${renderedPrompt.version}`
          log.info('Using prompt template', {
            provider: 'anthropic',
            template: promptTemplateUsed,
            withSchema: true,
          })
        } else {
          finalSystemPrompt = schemaPrompt
          log.info('Using ANTHROPIC_SCHEMA_PROMPT fallback', { provider: 'anthropic' })
        }
      }

      const response = await client.messages.create(
        {
          model: model || aiConfig.anthropicExtractionModel,
          max_tokens: aiConfig.maxTokens,
          system: finalSystemPrompt,
          messages: [{ role: 'user', content: finalUserPrompt }],
        },
        { signal: AbortSignal.timeout(60_000) }
      )

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
          log.debug('Cost tracking failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })

      let parsedData: unknown
      try {
        parsedData = JSON.parse(jsonContent)
      } catch (parseError) {
        log.error('Anthropic returned invalid JSON', {
          requestId,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          contentPreview: jsonContent.slice(0, 200),
        })
        return res
          .status(502)
          .json({ success: false, error: 'AI returned invalid JSON', code: 'INVALID_JSON' })
      }

      // Record successful extraction metric
      recordExtractionEvent({
        requestId,
        timestamp: new Date().toISOString(),
        provider: 'anthropic',
        success: true,
        durationMs: Date.now() - startTime,
        documentLength: (req.body as AnthropicExtractionInput).documentText?.length ?? 0,
      })
      recordOverviewMetrics({
        requestId,
        provider: 'anthropic',
        model: usedModel,
        operation: 'extraction',
        success: true,
        durationMs: Date.now() - startTime,
        inputTokens,
        outputTokens,
        cost: cost.totalCost,
        documentLength: (req.body as AnthropicExtractionInput).documentText?.length ?? 0,
        userId: req.headers['x-user-id'] as string | undefined,
      })

      res.json({
        success: true,
        data: parsedData,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
        model: response.model,
        cost: cost.totalCost,
      })

      // Fire push notification if user is authenticated (non-blocking fire-and-forget)
      const notifyUserIdANT = req.headers['x-user-id'] as string | undefined
      if (notifyUserIdANT) {
        const extractedANT = parsedData as Record<string, unknown>
        sendExtractionCompleteNotification(
          notifyUserIdANT,
          String(extractedANT.policyType || 'policy'),
          (extractedANT.policyNumber as string | null | undefined) ?? null
        ).catch((err) =>
          log.warn('Push notification failed after Anthropic extraction', {
            requestId,
            error: err instanceof Error ? err.message : String(err),
          })
        )
      }
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
      log.error('Extraction failed', errorDetails)

      // Determine specific error code and notify admin for certain errors
      const IS_PRODUCTION = process.env.NODE_ENV === 'production'
      let code = 'EXTRACTION_FAILED'
      let userMessage = IS_PRODUCTION ? 'Unable to process document' : 'Anthropic extraction failed'
      let shouldNotifyAdmin = false
      let notificationCategory: 'billing' | 'api_error' | 'rate_limit' = 'api_error'

      if (
        message.includes('401') ||
        message.includes('invalid x-api-key') ||
        message.includes('Invalid API Key')
      ) {
        code = 'INVALID_API_KEY'
        userMessage = IS_PRODUCTION
          ? 'AI service temporarily unavailable'
          : 'Anthropic API key is invalid'
        shouldNotifyAdmin = true
        notificationCategory = 'api_error'
      } else if (message.includes('429') || message.includes('rate_limit')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION
          ? 'Service busy, please try again later'
          : 'Anthropic rate limit exceeded - please wait and retry'
        shouldNotifyAdmin = true
        notificationCategory = 'rate_limit'
      } else if (
        message.includes('credit') ||
        message.includes('billing') ||
        message.includes('FAILED_PRECONDITION')
      ) {
        code = 'BILLING_ERROR'
        userMessage = IS_PRODUCTION
          ? 'AI service temporarily unavailable'
          : 'Anthropic billing issue - check your account'
        shouldNotifyAdmin = true
        notificationCategory = 'billing'
      } else if (message.includes('overloaded') || message.includes('529')) {
        code = 'PROVIDER_OVERLOADED'
        userMessage = IS_PRODUCTION
          ? 'AI service temporarily busy, please retry'
          : 'Anthropic API overloaded - temporary capacity issue'
      } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION
          ? 'Request timed out, please try again'
          : 'Request timed out - try a smaller document'
      }

      // Capture in Sentry with extraction context
      captureServerError(error instanceof Error ? error : new Error(message), {
        requestId,
        provider: 'anthropic',
        errorCode: code,
        documentLength: errorDetails.documentTextLength,
      })

      // Record extraction metric
      recordExtractionEvent({
        requestId,
        timestamp: errorDetails.timestamp,
        provider: 'anthropic',
        success: false,
        durationMs: Date.now() - startTime,
        errorCode: code,
        errorMessage: message.substring(0, 200),
        documentLength: errorDetails.documentTextLength,
      })
      recordOverviewMetrics({
        requestId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        operation: 'extraction',
        success: false,
        durationMs: Date.now() - startTime,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        documentLength: errorDetails.documentTextLength,
        userId: req.headers['x-user-id'] as string | undefined,
        errorCode: code,
        errorMessage: message.substring(0, 200),
      })

      // Create admin notification for critical errors
      if (shouldNotifyAdmin) {
        if (notificationCategory === 'billing') {
          adminNotificationService
            .notifyBillingIssue('Anthropic', message, errorDetails)
            .catch((err) => {
              log.error('Admin notification failed', {
                error: err instanceof Error ? err.message : String(err),
              })
            })
        } else if (notificationCategory === 'rate_limit') {
          adminNotificationService.notifyRateLimit('Anthropic', errorDetails).catch((err) => {
            log.error('Admin notification failed', {
              error: err instanceof Error ? err.message : String(err),
            })
          })
        } else {
          adminNotificationService
            .notifyAPIError('Anthropic', code, message, errorDetails)
            .catch((err) => {
              log.error('Admin notification failed', {
                error: err instanceof Error ? err.message : String(err),
              })
            })
        }
      } else {
        // Still notify admin for non-critical errors (just as api_error, not billing/rate_limit)
        adminNotificationService
          .notifyAPIError('Anthropic', code, message.substring(0, 200), {
            requestId,
            documentLength: errorDetails.documentTextLength,
          })
          .catch((err) =>
            log.warn('Failed to notify extraction error', {
              requestId,
              error: err instanceof Error ? err.message : String(err),
            })
          )
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
    const startTime = Date.now()
    // Total request budget: hard cap to prevent client-side timeout race.
    // Client timeout is 150s; we must respond well before that.
    // Defaults: REQUEST_BUDGET_MS=125_000, PRIMARY=65_000, FALLBACK=55_000
    // Now read from aiConfig (fetched below) — see ai.request_budget_ms etc. in app_settings

    // Phase-level timing diagnostics — surfaces WHERE time is spent
    const phaseTiming: Record<string, number> = {}
    function markPhase(name: string, startMs: number) {
      phaseTiming[name] = Date.now() - startMs
    }

    const {
      documentText,
      systemPrompt: clientPrompt,
      model,
      policyType,
    } = req.body as AnthropicExtractionInput & { policyType?: string; model?: string }

    log.info('Unified extraction request received', {
      requestId,
      documentLength: documentText?.length ?? 0,
      policyType: policyType ?? 'auto',
      hasClientPrompt: !!clientPrompt,
    })

    // Get AI config from database first (needed for dynamic confidence weights in prompt)
    const configStart = Date.now()
    const aiConfig = await getAIConfig()
    markPhase('configLoad_ms', configStart)

    // Timeout budget from config (defaults: 125s / 65s / 55s)
    const REQUEST_BUDGET_MS = aiConfig.requestBudgetMs
    const PRIMARY_PROVIDER_TIMEOUT_MS = aiConfig.primaryProviderTimeoutMs
    const FALLBACK_PROVIDER_TIMEOUT_MS = aiConfig.fallbackProviderTimeoutMs

    // Build Anthropic schema prompt with admin-configurable confidence weights
    const confidenceWeights: ConfidenceWeights = {
      policyNumber: aiConfig.confidenceWeightPolicyNumber,
      provider: aiConfig.confidenceWeightProvider,
      dates: aiConfig.confidenceWeightDates,
      premium: aiConfig.confidenceWeightPremium,
      coverages: aiConfig.confidenceWeightCoverages,
    }
    const anthropicSchemaPrompt = buildAnthropicSchemaPrompt(confidenceWeights)

    // Get extraction prompt (shared between providers)
    // For Anthropic, we append the schema prompt to ensure structured JSON output
    // For OpenAI, we use response_format: json_schema
    let openaiSystemPrompt: string
    let anthropicSystemPrompt: string
    let finalUserPrompt = documentText

    const promptStart = Date.now()
    if (clientPrompt) {
      openaiSystemPrompt = clientPrompt
      anthropicSystemPrompt = `${clientPrompt}\n\n${anthropicSchemaPrompt}`
      finalUserPrompt = documentText
      markPhase('promptLoad_ms', promptStart)
    } else {
      const renderedPrompt = await getExtractionPrompt(documentText, policyType)
      markPhase('promptLoad_ms', promptStart)
      if (renderedPrompt) {
        openaiSystemPrompt = renderedPrompt.systemPrompt
        anthropicSystemPrompt = `${renderedPrompt.systemPrompt}\n\n${anthropicSchemaPrompt}`
        finalUserPrompt = renderedPrompt.userPrompt
        log.info('Using prompt template', {
          requestId,
          template: renderedPrompt.templateName,
          version: renderedPrompt.version,
        })
      } else {
        openaiSystemPrompt = 'Extract policy information as JSON.'
        anthropicSystemPrompt = `Extract policy information as JSON.\n\n${anthropicSchemaPrompt}`
        log.info('Using fallback prompt', { requestId })
      }
    }

    log.info('Using config', {
      requestId,
      anthropicModel: aiConfig.anthropicExtractionModel,
      openaiModel: aiConfig.openaiExtractionModel,
      setupMs: Date.now() - startTime,
      phaseTiming,
    })

    // Try Anthropic first if available
    const anthropicClient = getAnthropicClient()
    const openaiClient = getOpenAIClient()

    if (anthropicClient) {
      const anthropicStart = Date.now()
      // Calculate remaining budget for primary provider
      const elapsedSoFar = Date.now() - startTime
      const primaryTimeout = Math.min(
        PRIMARY_PROVIDER_TIMEOUT_MS,
        REQUEST_BUDGET_MS - elapsedSoFar - 5000
      )
      if (primaryTimeout <= 5000) {
        log.warn('Budget nearly exhausted before Anthropic attempt, skipping to fallback', {
          requestId,
          elapsedSoFar,
          budgetMs: REQUEST_BUDGET_MS,
        })
      } else {
        log.info('Trying Anthropic first', {
          requestId,
          elapsedMs: anthropicStart - startTime,
          timeoutMs: primaryTimeout,
        })
        try {
          const response = await anthropicClient.messages.create(
            {
              model: model || aiConfig.anthropicExtractionModel,
              max_tokens: aiConfig.maxTokens,
              system: anthropicSystemPrompt,
              messages: [{ role: 'user', content: finalUserPrompt }],
            },
            { signal: AbortSignal.timeout(primaryTimeout) }
          )

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

          let parsedData: unknown
          try {
            parsedData = JSON.parse(jsonContent)
          } catch (parseError) {
            log.error('Anthropic returned invalid JSON', {
              requestId,
              parseError: parseError instanceof Error ? parseError.message : String(parseError),
              contentPreview: jsonContent.slice(0, 200),
            })
            throw new Error('AI returned invalid JSON — response could not be parsed')
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
          }).catch((err) =>
            log.warn('Failed to record Anthropic usage', {
              requestId,
              error: err instanceof Error ? err.message : String(err),
            })
          )

          markPhase('anthropic_ms', anthropicStart)

          log.info('Anthropic extraction successful', {
            requestId,
            anthropicMs: Date.now() - anthropicStart,
            totalMs: Date.now() - startTime,
            phaseTiming,
          })

          // Record successful extraction metric
          recordExtractionEvent({
            requestId,
            timestamp: new Date().toISOString(),
            provider: 'anthropic',
            success: true,
            durationMs: Date.now() - startTime,
            documentLength: documentText?.length ?? 0,
          })
          recordOverviewMetrics({
            requestId,
            provider: 'anthropic',
            model: usedModel,
            operation: 'extraction',
            success: true,
            durationMs: Date.now() - startTime,
            inputTokens,
            outputTokens,
            cost: cost.totalCost,
            documentLength: documentText?.length ?? 0,
            userId: req.headers['x-user-id'] as string | undefined,
          })

          // Fire push notification if user is authenticated (non-blocking fire-and-forget)
          const notifyUserIdUNI_ANT = req.headers['x-user-id'] as string | undefined
          if (notifyUserIdUNI_ANT) {
            const extractedUNI_ANT = parsedData as Record<string, unknown>
            sendExtractionCompleteNotification(
              notifyUserIdUNI_ANT,
              String(extractedUNI_ANT.policyType || 'policy'),
              (extractedUNI_ANT.policyNumber as string | null | undefined) ?? null
            ).catch((err) =>
              log.warn('Push notification failed after unified/Anthropic extraction', {
                requestId,
                error: err instanceof Error ? err.message : String(err),
              })
            )
          }

          return res.json({
            success: true,
            data: parsedData,
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            model: response.model,
            provider: 'anthropic',
            cost: cost.totalCost,
            requestId,
            route: '/api/ai/extract',
            elapsedMs: Date.now() - startTime,
            phaseTiming,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          markPhase('anthropic_ms', anthropicStart)
          log.error('Anthropic failed', {
            requestId,
            error: message,
            anthropicMs: Date.now() - anthropicStart,
            totalMs: Date.now() - startTime,
            phaseTiming,
          })

          // Classify the Anthropic error for structured fallback reporting
          const isBillingError =
            message.includes('credit') ||
            message.includes('billing') ||
            message.includes('FAILED_PRECONDITION')
          const isRateLimitError = message.includes('429') || message.includes('rate_limit')
          const isAuthError = message.includes('401') || message.includes('invalid x-api-key')
          const isOverloadedError = message.includes('overloaded') || message.includes('529')

          // Determine fallback reason for structured response
          const isAbortTimeout = error instanceof Error && error.name === 'AbortError'
          let fallbackReason = 'ANTHROPIC_UNKNOWN_ERROR'
          if (isAbortTimeout) fallbackReason = 'ANTHROPIC_SDK_TIMEOUT'
          else if (isBillingError) fallbackReason = 'ANTHROPIC_BILLING_ERROR'
          else if (isRateLimitError) fallbackReason = 'ANTHROPIC_RATE_LIMITED'
          else if (isAuthError) fallbackReason = 'ANTHROPIC_AUTH_ERROR'
          else if (isOverloadedError) fallbackReason = 'ANTHROPIC_OVERLOADED'
          else if (message.includes('timeout') || message.includes('ETIMEDOUT'))
            fallbackReason = 'ANTHROPIC_TIMEOUT'

          // Capture in Sentry (even though we're falling back to OpenAI, record the failure)
          captureServerError(error instanceof Error ? error : new Error(message), {
            requestId,
            provider: 'anthropic',
            errorCode: fallbackReason,
            documentLength: documentText?.length ?? 0,
            willFallback: !!openaiClient,
          })

          // Record Anthropic failure metric (even in fallback path)
          recordExtractionEvent({
            requestId,
            timestamp: new Date().toISOString(),
            provider: 'anthropic',
            success: false,
            durationMs: Date.now() - anthropicStart,
            errorCode: fallbackReason,
            errorMessage: message.substring(0, 200),
            documentLength: documentText?.length ?? 0,
          })
          recordOverviewMetrics({
            requestId,
            provider: 'anthropic',
            model: aiConfig.anthropicExtractionModel,
            operation: 'extraction',
            success: false,
            durationMs: Date.now() - anthropicStart,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            documentLength: documentText?.length ?? 0,
            userId: req.headers['x-user-id'] as string | undefined,
            errorCode: fallbackReason,
            errorMessage: message.substring(0, 200),
          })

          // Notify admin for critical errors (not for transient capacity issues)
          if (isBillingError) {
            log.warn('Anthropic billing error, falling back to OpenAI', {
              requestId,
              fallbackReason,
            })
            adminNotificationService
              .notifyBillingIssue('Anthropic', message, {
                requestId,
                errorMessage: message,
                timestamp: new Date().toISOString(),
              })
              .catch((err) =>
                log.warn('Failed to notify billing issue', {
                  provider: 'Anthropic',
                  requestId,
                  error: err instanceof Error ? err.message : String(err),
                })
              )
          } else if (isRateLimitError) {
            log.warn('Anthropic rate limit, falling back to OpenAI', { requestId, fallbackReason })
            adminNotificationService
              .notifyRateLimit('Anthropic', {
                requestId,
                errorMessage: message,
                timestamp: new Date().toISOString(),
              })
              .catch((err) =>
                log.warn('Failed to notify rate limit', {
                  provider: 'Anthropic',
                  requestId,
                  error: err instanceof Error ? err.message : String(err),
                })
              )
          } else if (isAuthError) {
            log.warn('Anthropic auth error, falling back to OpenAI', { requestId, fallbackReason })
            adminNotificationService
              .notifyAPIError('Anthropic', 'INVALID_API_KEY', message, {
                requestId,
                timestamp: new Date().toISOString(),
              })
              .catch((err) =>
                log.warn('Failed to notify API error', {
                  provider: 'Anthropic',
                  requestId,
                  error: err instanceof Error ? err.message : String(err),
                })
              )
          } else if (isOverloadedError) {
            log.info('Anthropic overloaded (capacity issue), falling back to OpenAI', {
              requestId,
              fallbackReason,
            })
          } else {
            log.warn('Anthropic failed with unknown error, falling back to OpenAI', {
              requestId,
              fallbackReason,
              error: message,
            })
          }

          // Store fallback reason for response
          ;(req as Request & { _fallbackReason?: string })._fallbackReason = fallbackReason

          // Fall back to OpenAI if available
          if (openaiClient) {
            log.info('Falling back to OpenAI', { requestId, fallbackReason })
          }
        }
      } // end primaryTimeout > 5000 check
    }

    // Check budget before attempting fallback — if we've used too much time, fail fast
    const budgetRemaining = REQUEST_BUDGET_MS - (Date.now() - startTime)
    if (budgetRemaining < 10_000 && openaiClient && anthropicClient) {
      log.warn('Request budget exhausted after Anthropic, no time for OpenAI fallback', {
        requestId,
        elapsedMs: Date.now() - startTime,
        budgetMs: REQUEST_BUDGET_MS,
        budgetRemainingMs: budgetRemaining,
      })

      recordExtractionEvent({
        requestId,
        timestamp: new Date().toISOString(),
        provider: 'anthropic',
        success: false,
        durationMs: Date.now() - startTime,
        errorCode: 'BUDGET_EXHAUSTED',
        errorMessage: 'Request time budget exhausted before fallback could start',
        documentLength: documentText?.length ?? 0,
      })
      recordOverviewMetrics({
        requestId,
        provider: 'anthropic',
        model: 'unknown',
        operation: 'extraction',
        success: false,
        durationMs: Date.now() - startTime,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        documentLength: documentText?.length ?? 0,
        userId: req.headers['x-user-id'] as string | undefined,
        errorCode: 'BUDGET_EXHAUSTED',
        errorMessage: 'Request time budget exhausted',
      })

      return res.status(504).json({
        error: 'Extraction timed out — the AI service took too long to respond',
        code: 'EXTRACTION_BUDGET_EXHAUSTED',
        details: `Primary provider (Anthropic) timed out after ${Math.round((Date.now() - startTime) / 1000)}s. No time remaining for fallback. Try again — subsequent requests are typically faster.`,
        elapsedMs: Date.now() - startTime,
        requestId,
        phaseTiming,
      })
    }

    // Try OpenAI (either as fallback or primary)
    if (openaiClient) {
      const openaiStart = Date.now()
      // Calculate remaining budget for fallback provider
      const fallbackTimeout = Math.min(
        FALLBACK_PROVIDER_TIMEOUT_MS,
        REQUEST_BUDGET_MS - (Date.now() - startTime) - 2000
      )
      log.info('Trying OpenAI', {
        requestId,
        elapsedMs: openaiStart - startTime,
        timeoutMs: fallbackTimeout,
        isFallback: !!anthropicClient,
      })
      try {
        // Ensure "json" is in the prompt for OpenAI
        const jsonReminder = '\n\nRespond with valid JSON only.'
        const systemPromptWithJson =
          openaiSystemPrompt.includes('json') || openaiSystemPrompt.includes('JSON')
            ? openaiSystemPrompt
            : openaiSystemPrompt + jsonReminder
        const userPromptWithJson =
          finalUserPrompt.includes('json') ||
          finalUserPrompt.includes('JSON') ||
          systemPromptWithJson.includes('json')
            ? finalUserPrompt
            : finalUserPrompt + jsonReminder

        const response = await openaiClient.chat.completions.create(
          {
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
          },
          { signal: AbortSignal.timeout(Math.max(fallbackTimeout, 10_000)) }
        )

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
        }).catch((err) =>
          log.warn('Failed to record OpenAI usage', {
            requestId,
            error: err instanceof Error ? err.message : String(err),
          })
        )

        let parsedOpenAIData: unknown
        try {
          parsedOpenAIData = JSON.parse(content)
        } catch (parseError) {
          log.error('OpenAI returned invalid JSON', {
            requestId,
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
            contentPreview: content.slice(0, 200),
          })
          throw new Error('AI returned invalid JSON — response could not be parsed')
        }

        markPhase('openai_ms', openaiStart)

        const isFallback = !!anthropicClient
        const storedFallbackReason = (req as Request & { _fallbackReason?: string })._fallbackReason
        log.info('OpenAI extraction successful', {
          requestId,
          fallback: isFallback,
          fallbackReason: storedFallbackReason,
          openaiMs: phaseTiming['openai_ms'],
          totalMs: Date.now() - startTime,
          phaseTiming,
        })

        // Record successful extraction metric
        recordExtractionEvent({
          requestId,
          timestamp: new Date().toISOString(),
          provider: 'openai',
          success: true,
          durationMs: Date.now() - startTime,
          documentLength: documentText?.length ?? 0,
        })
        recordOverviewMetrics({
          requestId,
          provider: 'openai',
          model: usedModel,
          operation: 'extraction',
          success: true,
          durationMs: Date.now() - startTime,
          inputTokens,
          outputTokens,
          cost: cost.totalCost,
          documentLength: documentText?.length ?? 0,
          userId: req.headers['x-user-id'] as string | undefined,
        })

        // Fire push notification if user is authenticated (non-blocking fire-and-forget)
        const notifyUserIdUNI_OAI = req.headers['x-user-id'] as string | undefined
        if (notifyUserIdUNI_OAI) {
          const extractedUNI_OAI = parsedOpenAIData as Record<string, unknown>
          sendExtractionCompleteNotification(
            notifyUserIdUNI_OAI,
            String(extractedUNI_OAI.policyType || 'policy'),
            (extractedUNI_OAI.policyNumber as string | null | undefined) ?? null
          ).catch((err) =>
            log.warn('Push notification failed after unified/OpenAI extraction', {
              requestId,
              error: err instanceof Error ? err.message : String(err),
            })
          )
        }

        return res.json({
          success: true,
          data: parsedOpenAIData,
          usage: response.usage,
          model: response.model,
          provider: 'openai',
          fallback: isFallback, // Indicates if we fell back from Anthropic
          ...(isFallback && storedFallbackReason && { fallbackReason: storedFallbackReason }),
          cost: cost.totalCost,
          requestId,
          route: '/api/ai/extract',
          elapsedMs: Date.now() - startTime,
          phaseTiming,
          ...(isFallback && {
            fallbackChain: [
              { provider: 'anthropic', success: false, error_code: storedFallbackReason },
              { provider: 'openai', success: true, duration_ms: phaseTiming['openai_ms'] },
            ],
          }),
        })
      } catch (error) {
        markPhase('openai_ms', openaiStart)
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('OpenAI also failed', { requestId, error: message, phaseTiming })

        // Classify error code
        let openaiErrorCode = 'OPENAI_UNKNOWN_ERROR'
        const isAbortTimeout = error instanceof Error && error.name === 'AbortError'
        if (isAbortTimeout) openaiErrorCode = 'OPENAI_SDK_TIMEOUT'
        else if (message.includes('401') || message.includes('Incorrect API key'))
          openaiErrorCode = 'OPENAI_AUTH_ERROR'
        else if (message.includes('429')) openaiErrorCode = 'OPENAI_RATE_LIMITED'
        else if (message.includes('insufficient_quota') || message.includes('billing'))
          openaiErrorCode = 'OPENAI_BILLING_ERROR'
        else if (message.includes('timeout') || message.includes('ETIMEDOUT'))
          openaiErrorCode = 'OPENAI_TIMEOUT'
        else if (message.includes('context_length_exceeded'))
          openaiErrorCode = 'OPENAI_CONTEXT_LENGTH'

        // Capture in Sentry — both providers failed, this is critical
        captureServerError(error instanceof Error ? error : new Error(message), {
          requestId,
          provider: 'openai',
          errorCode: openaiErrorCode,
          documentLength: documentText?.length ?? 0,
          allProvidersFailed: true,
        })

        // Record OpenAI failure metric
        recordExtractionEvent({
          requestId,
          timestamp: new Date().toISOString(),
          provider: 'openai',
          success: false,
          durationMs: Date.now() - openaiStart,
          errorCode: openaiErrorCode,
          errorMessage: message.substring(0, 200),
          documentLength: documentText?.length ?? 0,
        })
        recordOverviewMetrics({
          requestId,
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'extraction',
          success: false,
          durationMs: Date.now() - openaiStart,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          documentLength: documentText?.length ?? 0,
          userId: req.headers['x-user-id'] as string | undefined,
          errorCode: openaiErrorCode,
          errorMessage: message.substring(0, 200),
        })

        // Notify admin — both providers failed is always critical
        adminNotificationService
          .notifyAPIError(
            'OpenAI',
            openaiErrorCode,
            `All providers failed. OpenAI error: ${message.substring(0, 200)}`,
            {
              requestId,
              allProvidersFailed: true,
              documentLength: documentText?.length ?? 0,
            }
          )
          .catch((err) =>
            log.warn('Failed to notify all-providers-failed', {
              requestId,
              error: err instanceof Error ? err.message : String(err),
            })
          )

        // Legacy: specific billing notification
        if (message.includes('insufficient_quota') || message.includes('billing')) {
          adminNotificationService
            .notifyBillingIssue('OpenAI', message, {
              requestId,
              timestamp: new Date().toISOString(),
            })
            .catch((err) =>
              log.warn('Failed to notify billing issue', {
                provider: 'OpenAI',
                requestId,
                error: err instanceof Error ? err.message : String(err),
              })
            )
        }

        const isTimeout = openaiErrorCode.includes('TIMEOUT')
        return res.status(isTimeout ? 504 : 500).json({
          error: isTimeout
            ? 'Extraction timed out — the AI service took too long to respond. Please try again.'
            : 'All AI providers failed',
          code: isTimeout ? 'EXTRACTION_TIMEOUT' : 'ALL_PROVIDERS_FAILED',
          details: message,
          elapsedMs: Date.now() - startTime,
          phaseTiming,
          requestId,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // No providers available
    log.error('No AI providers configured', {
      requestId,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    })
    return res.status(503).json({
      error:
        'No AI providers configured. Check OPENAI_API_KEY and ANTHROPIC_API_KEY environment variables.',
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
interface DocumentAIResponse {
  error?: { message: string }
  document?: any
}

router.post('/ocr', validateJSON, ocrLimiter, validateOCR, async (req: Request, res: Response) => {
  try {
    // Only attempt OAuth if service account credentials exist (avoids wasted async call)
    const hasServiceAccount = !!getGCPCredentialsPath()
    const oauthToken = hasServiceAccount ? await getDocumentAIAccessToken() : null
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY

    if (hasServiceAccount && !oauthToken) {
      log.warn(
        'Vision OCR: service account found but OAuth token retrieval failed — falling back to API key'
      )
    }

    if (!oauthToken && !apiKey) {
      return res.status(503).json({
        error: 'Google Cloud not configured',
        code: 'PROVIDER_NOT_CONFIGURED',
      })
    }

    // Body is validated and sanitized by middleware
    const { imageBase64 } = req.body as OCRInput

    // Build request with appropriate authentication
    // Priority: OAuth token > API key query param
    let url = 'https://vision.googleapis.com/v1/images:annotate'
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (oauthToken) {
      headers['Authorization'] = `Bearer ${oauthToken}`
      log.info('Vision OCR: using OAuth bearer token authentication')
    } else if (apiKey) {
      url = `${url}?key=${apiKey}`
      log.info('Vision OCR: using API key authentication')
    }

    // Call Vision OCR with 60-second timeout to prevent hanging
    const controller = new AbortController()
    const fetchTimeout = setTimeout(() => controller.abort(), 60000)
    let response: globalThis.Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        signal: controller.signal,
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
    } finally {
      clearTimeout(fetchTimeout)
    }

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
        log.debug('Cost tracking failed', {
          error: err instanceof Error ? err.message : String(err),
        })
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
      log.debug('OCR failed', errorDetails)
    }

    // Determine specific error code
    // In production, show generic messages; in dev/staging, show specific ones
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'
    let code = 'OCR_FAILED'
    let userMessage = IS_PRODUCTION ? 'Unable to process scanned document' : 'OCR processing failed'

    if (error instanceof Error && error.name === 'AbortError') {
      code = 'TIMEOUT'
      userMessage = IS_PRODUCTION
        ? 'Request timed out, please try again'
        : 'Vision OCR timed out after 60s - try a smaller image'
    } else if (message.includes('API key not valid') || message.includes('400')) {
      code = 'INVALID_API_KEY'
      userMessage = IS_PRODUCTION
        ? 'Document scanning service unavailable'
        : 'Google Cloud API key is invalid'
    } else if (message.includes('PERMISSION_DENIED')) {
      code = 'API_NOT_ENABLED'
      userMessage = IS_PRODUCTION
        ? 'Document scanning service unavailable'
        : 'Cloud Vision API not enabled - enable it in Google Cloud Console'
    } else if (message.includes('BILLING')) {
      code = 'BILLING_ERROR'
      userMessage = IS_PRODUCTION
        ? 'Document scanning service unavailable'
        : 'Billing not enabled on Google Cloud project'
    } else if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      code = 'RATE_LIMIT_EXCEEDED'
      userMessage = IS_PRODUCTION
        ? 'Service busy, please try again later'
        : 'Google Cloud rate limit exceeded'
    }

    res.status(500).json({
      error: userMessage,
      code,
      // Only show detailed error info in development/staging for debugging
      ...(process.env.NODE_ENV !== 'production' && { details: message }),
      timestamp: errorDetails.timestamp,
    })
  }
})

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
    log.info('OCR route invoked', { version: 'v5', processor: 'standard', pageLimit: 15 })
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'
    const startTime = Date.now()

    try {
      // Check if Document AI is configured
      log.debug('Checking configuration')
      if (!isDocumentAIConfigured()) {
        log.warn('Not configured, returning 503')
        return res.status(503).json({
          error: IS_PRODUCTION
            ? 'Document processing service unavailable'
            : 'Document AI not configured',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      // Get access token
      log.debug('Getting access token')
      const accessToken = await getDocumentAIAccessToken()
      if (!accessToken) {
        log.error('Access token is null/empty, returning 503')
        return res.status(503).json({
          error: IS_PRODUCTION
            ? 'Document processing service unavailable'
            : 'Failed to get Document AI access token',
          code: 'AUTH_FAILED',
        })
      }
      log.debug('Access token received')

      const { documentBase64, mimeType, languageHints } = req.body as DocumentAIInput

      // Build Document AI endpoint
      const endpoint = `https://${GCP_CONFIG.location}-documentai.googleapis.com/v1/projects/${GCP_CONFIG.projectId}/locations/${GCP_CONFIG.location}/processors/${GCP_CONFIG.processorId}:process`

      log.info('Calling Document AI API', {
        location: GCP_CONFIG.location,
        project: GCP_CONFIG.projectId,
        processor: GCP_CONFIG.processorId,
        setupMs: Date.now() - startTime,
      })

      // Call Document AI with 60-second timeout to prevent hanging
      const controller = new AbortController()
      const fetchTimeout = setTimeout(() => controller.abort(), 60000)
      let response: globalThis.Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
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
      } finally {
        clearTimeout(fetchTimeout)
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({ error: { message: `HTTP ${response.status}` } }))) as DocumentAIResponse
        // Enhanced error logging for debugging
        log.error('API call failed', {
          status: response.status,
          statusText: response.statusText,
          errorMessage: errorData.error?.message,
          errorCode: errorData.error?.code,
          errorStatus: errorData.error?.status,
          processingTimeMs: Date.now() - startTime,
        })
        throw new Error(errorData.error?.message || `Document AI error: ${response.status}`)
      }

      const result = (await response.json()) as DocumentAIResponse

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
          const confidence =
            (field.fieldName?.confidence || 0 + (field.fieldValue?.confidence || 0)) / 2

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
        rows: Array<{
          cells: Array<{ text: string; rowSpan: number; colSpan: number; confidence: number }>
        }>
        headerRows: number
        confidence: number
      }> = []

      for (const page of result.document.pages || []) {
        for (const table of page.tables || []) {
          const rows: Array<{
            cells: Array<{ text: string; rowSpan: number; colSpan: number; confidence: number }>
          }> = []

          // Process header rows
          const headerRowCount = table.headerRows?.length || 0
          for (const row of table.headerRows || []) {
            const cells = (row.cells || []).map((cell: any) => ({
              text: cell.layout?.textAnchor?.content?.trim() || '',
              rowSpan: cell.rowSpan || 1,
              colSpan: cell.colSpan || 1,
              confidence: cell.layout?.confidence || 0,
            }))
            rows.push({ cells })
          }

          // Process body rows
          for (const row of table.bodyRows || []) {
            const cells = (row.cells || []).map((cell: any) => ({
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
        if (!IS_PRODUCTION)
          log.debug('Cost tracking failed', {
            error: err instanceof Error ? err.message : String(err),
          })
      })

      log.info('Document AI OCR complete', {
        pageCount,
        formFields: formFields.length,
        tables: tables.length,
        processingTimeMs,
      })

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
      log.error('Processing failed', errorDetails)

      let code = 'DOCUMENT_AI_FAILED'
      let userMessage = IS_PRODUCTION
        ? 'Unable to process document'
        : 'Document AI processing failed'

      if (error instanceof Error && error.name === 'AbortError') {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION
          ? 'Request timed out, please try again'
          : 'Document AI timed out after 60s - try a smaller document'
      } else if (message.includes('PERMISSION_DENIED')) {
        code = 'PERMISSION_DENIED'
        userMessage = IS_PRODUCTION
          ? 'Document processing service unavailable'
          : 'Document AI permission denied - check service account permissions'
      } else if (message.includes('NOT_FOUND')) {
        code = 'PROCESSOR_NOT_FOUND'
        userMessage = IS_PRODUCTION
          ? 'Document processing service unavailable'
          : 'Document AI processor not found - check processor ID'
      } else if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        code = 'RATE_LIMIT_EXCEEDED'
        userMessage = IS_PRODUCTION
          ? 'Service busy, please try again later'
          : 'Document AI rate limit exceeded'
      } else if (message.includes('exceed the limit') || message.includes('exceed limit')) {
        // Standard OCR processor has a 15-page limit per request.
        // Documents >15 pages should be split client-side via pdf-splitter.ts.
        code = 'PAGE_LIMIT_EXCEEDED'
        log.error('Page limit exceeded - document should have been split before sending', {
          errorMessage: message,
        })
        userMessage = IS_PRODUCTION
          ? 'Document exceeds page limit. Please upload a document with 15 or fewer pages per chunk.'
          : `Document AI page limit exceeded: ${message}. Documents >15 pages must be split via pdf-splitter.ts.`
      } else if (message.includes('INVALID_ARGUMENT')) {
        code = 'INVALID_DOCUMENT'
        userMessage = IS_PRODUCTION
          ? 'Unable to process this document format'
          : 'Invalid document format for Document AI'
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
// ============================================================================
// PROCESSING LOGS (Document Journey Tracking)
// ============================================================================

export default router
