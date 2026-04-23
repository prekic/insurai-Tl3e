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
import logger from '../../lib/logger.js'
import { generalLimiter } from '../../middleware/rate-limit.js'
import { validateJSON } from '../../middleware/validation.js'
import { getClientWithError } from '../../services/admin-db.js'
import { getAIConfig } from '../../services/config-service.js'
import { getSenseCheckPrompt } from '../../services/prompt-service.js'

const log = logger.child('AI')

// ES Module directory resolution
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

/**
 * ProviderDiagnostic interface for /api/ai/diagnose
 */
interface ProviderDiagnostic {
  configured: boolean
  valid: boolean
  error?: string
  errorCode?: string // Always returned — actionable category for admins (e.g., 'API_NOT_ENABLED', 'BILLING_ERROR')
  latencyMs?: number
  model?: string
  authMethod?: string // 'oauth' | 'api_key' - only for Google Vision
}

/**
 * Classify a diagnostic error into an actionable error code.
 * Error codes are always returned (even in production) — they contain no secrets.
 */
function classifyDiagnosticError(error: string): string {
  if (
    error.includes('Invalid API key') ||
    error.includes('401') ||
    error.includes('Incorrect') ||
    error.includes('Authentication failed') ||
    error.includes('UNAUTHENTICATED')
  ) {
    return 'INVALID_CREDENTIALS'
  }
  if (
    error.includes('Rate limit') ||
    error.includes('429') ||
    error.includes('RESOURCE_EXHAUSTED')
  ) {
    return 'RATE_LIMITED'
  }
  if (error.includes('quota') || error.includes('insufficient_quota')) {
    return 'QUOTA_EXHAUSTED'
  }
  // Overloaded is a transient capacity issue, NOT a billing error
  if (error.includes('overloaded') || error.includes('529')) {
    return 'PROVIDER_OVERLOADED'
  }
  if (
    error.includes('billing') ||
    error.includes('credit') ||
    error.includes('BILLING') ||
    error.includes('Billing') ||
    error.includes('FAILED_PRECONDITION')
  ) {
    return 'BILLING_ERROR'
  }
  if (
    error.includes('PERMISSION_DENIED') ||
    error.includes('not enabled') ||
    error.includes('has not been used') ||
    error.includes('Permission denied')
  ) {
    return 'API_NOT_ENABLED'
  }
  if (error.includes('NOT_FOUND') || error.includes('not found') || error.includes('404')) {
    return 'NOT_FOUND'
  }
  if (
    error.includes('ENOTFOUND') ||
    error.includes('ECONNREFUSED') ||
    error.includes('ETIMEDOUT') ||
    error.includes('fetch failed')
  ) {
    return 'NETWORK_ERROR'
  }
  return 'UNKNOWN_ERROR'
}

/**
 * Sanitize diagnostic error message for production.
 * In production, hide technical details like .env file paths and API key names.
 * Error codes (from classifyDiagnosticError) are always safe to expose.
 */
function sanitizeDiagnosticError(error: string, isProduction: boolean): string {
  if (!isProduction) return error

  const code = classifyDiagnosticError(error)
  const codeToMessage: Record<string, string> = {
    INVALID_CREDENTIALS: 'Service configuration error',
    RATE_LIMITED: 'Service temporarily busy',
    QUOTA_EXHAUSTED: 'Service quota exhausted',
    PROVIDER_OVERLOADED: 'Service temporarily busy',
    BILLING_ERROR: 'Service temporarily unavailable',
    API_NOT_ENABLED: 'Service not available',
    NOT_FOUND: 'Service not configured',
    NETWORK_ERROR: 'Service unreachable',
    UNKNOWN_ERROR: 'Service error',
  }
  return codeToMessage[code] || 'Service error'
}

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
 * POST /api/ai/sense-check
 * Evaluates generated warnings/insights for false positives.
 */
router.post('/sense-check', validateJSON, async (req: Request, res: Response) => {
  try {
    const { rawInsights, policyData } = req.body
    const policyType = policyData?.type || '*'

    const aiConfig = await getAIConfig()

    // Fetch dynamic guidelines from DB
    let guidelinesText = ''
    try {
      const { client: db } = getClientWithError()
      if (db) {
        const { data } = await db
          .from('ai_insight_guidelines')
          .select('guidance_text')
          .eq('is_active', true)
          .in('policy_type', ['*', policyType])

        if (data && data.length > 0) {
          guidelinesText = data
            .map((d: any, index: number) => `${index + 1}. ${d.guidance_text}`)
            .join('\n')
        }
      }
    } catch (dbErr) {
      log.warn('Failed to fetch ai_insight_guidelines', { error: String(dbErr) })
    }

    const finalGuidelines =
      guidelinesText ||
      'No specific rules defined. Use your best judgment to filter false positives.'

    const renderedPrompt = await getSenseCheckPrompt(
      finalGuidelines,
      JSON.stringify(policyData, null, 2),
      JSON.stringify(rawInsights, null, 2)
    )

    if (!renderedPrompt) {
      log.error('Could not load sense-check prompt template')
      return res.json({ success: true, validInsights: rawInsights, provider: 'fallback' })
    }

    const { systemPrompt, userPrompt } = renderedPrompt

    const anthropicClient = getAnthropicClient()
    const openaiClient = getOpenAIClient()

    if (anthropicClient) {
      try {
        const response = await anthropicClient.messages.create({
          model: aiConfig.anthropicBackupModel || aiConfig.anthropicExtractionModel,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })
        const textBlock = response.content.find((block: any) => block.type === 'text')
        if (textBlock && textBlock.type === 'text') {
          let jsonString = textBlock.text
          const jsonMatch = jsonString.match(/\\{.*\\}/s)
          if (jsonMatch) jsonString = jsonMatch[0]
          const result = JSON.parse(jsonString)
          return res.json({
            success: true,
            validInsights: result.validInsights || rawInsights,
            provider: 'anthropic',
          })
        }
      } catch (err) {
        log.warn('Anthropic sense-check failed, falling back', { error: String(err) })
      }
    }

    if (openaiClient) {
      try {
        const response = await openaiClient.chat.completions.create({
          model: aiConfig.openaiBackupModel || aiConfig.openaiExtractionModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        })
        const content = response.choices[0]?.message?.content
        if (content) {
          const result = JSON.parse(content)
          return res.json({
            success: true,
            validInsights: result.validInsights || rawInsights,
            provider: 'openai',
          })
        }
      } catch (err) {
        log.warn('OpenAI sense-check failed', { error: String(err) })
      }
    }

    // If all fail, return original insights safely
    return res.json({ success: true, validInsights: rawInsights, provider: 'fallback' })
  } catch (e) {
    log.error('Sense-check fatal error', { error: String(e) })
    // Safe fallback
    return res.json({
      success: true,
      validInsights: req.body?.rawInsights || [],
      provider: 'fallback',
      error: String(e),
    })
  }
})

/**
 * GET /api/ai/sense-check-prompt-preview
 * Returns the final system prompt that would be sent to the AI for sense-checking,
 * including all currently active custom guidelines combined with default rules.
 */
router.get('/sense-check-prompt-preview', async (req: Request, res: Response) => {
  try {
    const policyType = (req.query.policyType as string) || '*'

    let guidelinesText = ''
    try {
      const { client: db } = getClientWithError()
      if (db) {
        const { data } = await db
          .from('ai_insight_guidelines')
          .select('guidance_text')
          .eq('is_active', true)
          .in('policy_type', ['*', policyType])

        if (data && data.length > 0) {
          guidelinesText = data
            .map((d: any, index: number) => `${index + 1}. ${d.guidance_text}`)
            .join('\n')
        }
      }
    } catch (dbErr) {
      log.warn('Failed to fetch ai_insight_guidelines for preview', { error: String(dbErr) })
    }

    const finalGuidelines =
      guidelinesText ||
      'No specific rules defined. Use your best judgment to filter false positives.'

    const renderedPrompt = await getSenseCheckPrompt(
      finalGuidelines,
      '{{Sample Policy Data}}',
      '{{Sample Raw Insights}}'
    )

    if (!renderedPrompt) {
      log.error('Could not load sense-check prompt template for preview')
      return res.status(500).json({ success: false, error: 'Could not load prompt template' })
    }

    return res.json({ success: true, prompt: renderedPrompt.systemPrompt })
  } catch (e) {
    log.error('Sense-check prompt preview error', { error: String(e) })
    return res.status(500).json({ success: false, error: String(e) })
  }
})
/**
 * GET /api/ai/providers
 * Check which AI providers are configured
 */
router.get('/providers', generalLimiter, (_req: Request, res: Response) => {
  // Google Vision can authenticate via API key OR service account OAuth
  const hasGoogleVision = !!process.env.GOOGLE_CLOUD_API_KEY || !!getGCPCredentialsPath()
  res.json({
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: hasGoogleVision,
    documentAI: isDocumentAIConfigured(),
  })
})
/**
 * GET /api/ai/diagnose
 * Test API key validity by making minimal API calls to each provider
 * This helps debug extraction failures by verifying credentials work
 * In production: Returns sanitized results suitable for end users
 * In development: Returns detailed diagnostic information for debugging
 */
router.get('/diagnose', generalLimiter, async (_req: Request, res: Response) => {
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
      diagnostics.openai.errorCode = classifyDiagnosticError(errorMsg)
      diagnostics.openai.error = sanitizeDiagnosticError(errorMsg, IS_PRODUCTION)
      log.warn('OpenAI diagnostic failed', {
        errorCode: diagnostics.openai.errorCode,
        error: errorMsg,
      })
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
          model: 'claude-3-5-haiku-latest',
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
      diagnostics.anthropic.errorCode = classifyDiagnosticError(errorMsg)
      diagnostics.anthropic.error = sanitizeDiagnosticError(errorMsg, IS_PRODUCTION)
      log.warn('Anthropic diagnostic failed', {
        errorCode: diagnostics.anthropic.errorCode,
        error: errorMsg,
      })
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

      if (hasServiceAccount && !oauthToken) {
        log.warn(
          'Google Vision diagnostic: service account found but OAuth token retrieval failed — falling back to API key'
        )
      }

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

      if (authMethod === 'none') {
        // Both auth methods failed — report clearly
        diagnostics.google.valid = false
        diagnostics.google.latencyMs = Date.now() - startTime
        diagnostics.google.errorCode = 'INVALID_CREDENTIALS'
        diagnostics.google.error = sanitizeDiagnosticError(
          'Authentication failed - no valid OAuth token or API key',
          IS_PRODUCTION
        )
        log.warn('Google Vision diagnostic: no valid authentication method available', {
          hasServiceAccount,
          hasApiKey: !!googleApiKey,
        })
      } else {
        // Make a minimal API call to verify credentials work
        // Using a tiny 1x1 white PNG to minimize cost
        const testImage =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            requests: [
              {
                image: { content: testImage },
                features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
              },
            ],
          }),
        })
        diagnostics.google.latencyMs = Date.now() - startTime

        // Always report auth method (no secret exposure — just 'oauth' or 'api_key')
        diagnostics.google.authMethod = authMethod

        if (response.ok) {
          diagnostics.google.valid = true
          if (!IS_PRODUCTION) {
            diagnostics.google.model = 'cloud-vision-v1'
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

          let errorMsg = errorMessage || `HTTP ${httpStatus}`

          // Map Google Cloud error statuses to actionable messages
          if (errorMsg.includes('API key not valid') || (httpStatus === 400 && !errorStatus)) {
            errorMsg = 'Invalid API key - check GOOGLE_CLOUD_API_KEY in .env'
          } else if (
            errorStatus === 'PERMISSION_DENIED' ||
            errorMsg.includes('PERMISSION_DENIED') ||
            errorMsg.includes('has not been used')
          ) {
            errorMsg = 'Cloud Vision API not enabled - enable it in Google Cloud Console'
          } else if (errorStatus === 'UNAUTHENTICATED' || httpStatus === 401) {
            errorMsg = 'Authentication failed - check GOOGLE_CLOUD_API_KEY'
          } else if (
            errorStatus === 'FAILED_PRECONDITION' ||
            errorMsg.includes('Billing') ||
            errorMsg.includes('BILLING')
          ) {
            errorMsg = 'Billing not enabled on Google Cloud project'
          } else if (errorStatus === 'RESOURCE_EXHAUSTED' || httpStatus === 429) {
            errorMsg = 'Rate limit exceeded - try again later'
          } else if (errorStatus === 'NOT_FOUND' || httpStatus === 404) {
            errorMsg = 'Vision API endpoint not found - check API configuration'
          } else if (httpStatus === 403) {
            errorMsg = `Permission denied (${errorStatus || 'unknown'}) - check API key permissions`
          }

          diagnostics.google.errorCode = classifyDiagnosticError(errorMsg)
          diagnostics.google.error = sanitizeDiagnosticError(errorMsg, IS_PRODUCTION)

          // Always log the real error server-side (visible in Railway logs)
          log.warn('Google Vision diagnostic failed', {
            errorCode: diagnostics.google.errorCode,
            authMethod,
            httpStatus,
            errorStatus,
            errorMessage,
          })
        }
      }
    } catch (error) {
      diagnostics.google.valid = false
      diagnostics.google.latencyMs = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      diagnostics.google.errorCode = classifyDiagnosticError(errorMsg)
      diagnostics.google.error = sanitizeDiagnosticError(errorMsg, IS_PRODUCTION)
      log.warn('Google Vision diagnostic exception', {
        errorCode: diagnostics.google.errorCode,
        error: errorMsg,
      })
    }
  }

  // Log diagnostic results for debugging (only in development)
  if (process.env.NODE_ENV !== 'production') {
    // Variance adapter: log.debug accepts Record<string, unknown> metadata;
    // diagnostics is a typed result object. Same pattern as audit-logger.ts.
    // eslint-disable-next-line no-restricted-syntax
    log.debug('Diagnostic results', diagnostics as unknown as Record<string, unknown>)
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

import * as processingLogService from '../../services/processing-log-service.js'

/**
 * Create a new processing log
 * POST /api/ai/processing-log
 * Rate limited: general limiter (60 requests per minute)
 */
router.post('/processing-log', generalLimiter, async (req: Request, res: Response) => {
  try {
    const logEntry = req.body

    if (!logEntry.document_id || !logEntry.filename) {
      res.status(400).json({
        success: false,
        error: 'document_id and filename are required',
      })
      return
    }

    const result = await processingLogService.createProcessingLog(logEntry)

    if (result.error || !result.data) {
      res.status(500).json({
        success: false,
        error: result.error || 'Unknown database error',
      })
      return
    }

    res.json({ success: true, data: result.data })
  } catch (error) {
    log.error('Failed to create processing log', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create processing log',
    })
  }
})

/**
 * Update a processing log
 * PATCH /api/ai/processing-log/:documentId
 * Rate limited: general limiter (60 requests per minute)
 */
router.patch('/processing-log/:documentId', generalLimiter, async (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId as string
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
    log.error('Failed to update processing log', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update processing log',
    })
  }
})

/**
 * Add a stage to a processing log
 * POST /api/ai/processing-log/:documentId/stage
 * Rate limited: general limiter (60 requests per minute)
 */
router.post(
  '/processing-log/:documentId/stage',
  generalLimiter,
  async (req: Request, res: Response) => {
    try {
      const documentId = req.params.documentId as string
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
      log.error('Failed to add processing stage', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add processing stage',
      })
    }
  }
)

/**
 * Get a processing log by document ID
 * GET /api/ai/processing-log/:documentId
 * Rate limited: general limiter (60 requests per minute)
 */
router.get('/processing-log/:documentId', generalLimiter, async (req: Request, res: Response) => {
  try {
    const documentId = req.params.documentId as string
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
    log.error('Failed to get processing log', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get processing log',
    })
  }
})

export default router
