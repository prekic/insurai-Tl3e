/**
 * AI Proxy Routes
 *
 * Secure server-side proxy for AI provider APIs.
 * Keeps API keys secure on the server, never exposed to the browser.
 * Includes cost tracking and budget enforcement.
 */

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI, createPartFromBase64 } from '@google/genai'
import crypto from 'node:crypto'
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
import { hashOcrInput, lookupOcrCache, storeOcrCache } from '../../services/ocr-cache.js'
import { sendExtractionCompleteNotification } from '../../services/notification-service.js'
import { getExtractionPrompt } from '../../services/prompt-service.js'
import { buildAnthropicSchemaPrompt, type ConfidenceWeights } from '../../lib/ai-prompts.js'
import {
  executeWithSelfHealingLoop,
  validateExtractionFields,
  JUDGE_JSON_SCHEMA,
  JUDGE_SYSTEM_PROMPT,
} from '../../lib/self-healing.js'
import { recordExtractionEvent, recordOverviewMetrics } from './shared.js'
import { runStage2Validation } from '../../../src/lib/policy-pipeline/stage2-validate/orchestrator.js'

const log = logger.child('AI')

// Allowlist of models a request body may set via the `model` field on extraction
// endpoints. Without this guard, any caller (including untrusted clients on the
// public internet) could pick claude-3-opus ($75/M output tokens) or any other
// frontier-tier model and run up the bill. Cost-control PR (May 3, 2026).
//
// To add a new model, list its bare alias here; the dated suffix variant is
// also tolerated (e.g. claude-haiku-4-5-20251001) for forward-compat with the
// Anthropic SDK echoing dated model names — see gotcha #151.
const EXTRACTION_MODEL_ALLOWLIST = new Set([
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-sonnet-4-6-20251022',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'deepseek-chat',
  'deepseek-reasoner',
])

/**
 * Reject the request with HTTP 400 if `model` is set to a value outside the
 * allowlist. Returns true if the caller should continue (model unset OR in
 * allowlist), false if a 400 has been sent.
 */
function assertExtractionModelAllowed(model: unknown, res: Response): boolean {
  if (model === undefined || model === null || model === '') return true
  if (typeof model !== 'string' || !EXTRACTION_MODEL_ALLOWLIST.has(model)) {
    res.status(400).json({
      error: 'model not in allowlist',
      code: 'MODEL_NOT_ALLOWED',
      allowed: Array.from(EXTRACTION_MODEL_ALLOWLIST),
    })
    return false
  }
  return true
}

// ES Module directory resolution
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

// Note: callers should use buildAnthropicSchemaPrompt(weights) with config-driven weights

// Initialize clients (lazy - only when keys are available)
let openaiClient: OpenAI | null = null
let anthropicClient: Anthropic | null = null
let deepseekClient: OpenAI | null = null

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
 * Get or create an OpenAI-compatible client for DeepSeek API.
 * DeepSeek is ~10x cheaper than gpt-5.4 and serves as fallback for quota/rate-limit errors.
 */
function getDeepSeekClient(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return null
  if (!deepseekClient) {
    // DEEPSEEK_BASE_URL might contain an api key instead of a URL (misconfiguration)
    const rawBase = process.env.DEEPSEEK_BASE_URL
    const validUrl =
      rawBase && rawBase.startsWith('http') && !rawBase.startsWith('sk-')
        ? rawBase
        : 'https://api.deepseek.com'
    try {
      deepseekClient = new OpenAI({
        apiKey,
        baseURL: validUrl,
      })
    } catch {
      log.warn('Failed to create DeepSeek client', { rawBase, validUrl })
      return null
    }
  }
  return deepseekClient
}

let geminiClient: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return geminiClient
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
// Diagnostic: test DeepSeek connectivity right from the Railway process
router.get('/test-deepseek', async (_req: Request, res: Response) => {
  const hasKey = !!process.env.DEEPSEEK_API_KEY
  const keyLen = process.env.DEEPSEEK_API_KEY?.length ?? 0
  try {
    const rawBaseUrl = process.env.DEEPSEEK_BASE_URL
    const baseUrlResolved =
      rawBaseUrl && rawBaseUrl.startsWith('http') && !rawBaseUrl.startsWith('sk-')
        ? rawBaseUrl
        : 'https://api.deepseek.com'
    const dsClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: baseUrlResolved,
    })
    const response = await dsClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Say hello in JSON like {"hello":true}' }],
      response_format: { type: 'json_object' },
      max_tokens: 20,
      temperature: 0,
    })
    res.json({
      ok: true,
      hasKey,
      keyLen,
      model: response.model,
      content: response.choices[0]?.message?.content,
    })
    res.json({
      ok: true,
      hasKey,
      keyLen,
      rawBaseUrl: process.env.DEEPSEEK_BASE_URL || '(empty)',
      baseUrlResolved,
      model: response.model,
      content: response.choices[0]?.message?.content,
    })
  } catch (err: any) {
    res.json({
      ok: false,
      hasKey,
      keyLen,
      rawBaseUrl: process.env.DEEPSEEK_BASE_URL || '(empty)',
      error: err.message,
    })
  }
})

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
      let deepseekFallback = getDeepSeekClient()
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

      if (!assertExtractionModelAllowed(model, res)) return
      log.info('Document received', {
        requestId,
        chars: documentText?.length || 0,
        type: policyType || 'auto-detect',
        model: model || 'gpt-5.4',
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

      const workerCaller = async (userPrompt: string, temperature: number) => {
        const response = await client.chat.completions.create(
          {
            model: model || aiConfig.openaiExtractionModel,
            messages: [
              { role: 'system', content: systemPromptWithJson },
              { role: 'user', content: userPrompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: EXTRACTION_JSON_SCHEMA,
            },
            max_completion_tokens: aiConfig.maxTokens,
            temperature,
          },
          { signal: AbortSignal.timeout(300_000) }
        )
        const usedModel = response.model || model || 'gpt-5.4'
        const inputTokens = response.usage?.prompt_tokens || 0
        const outputTokens = response.usage?.completion_tokens || 0
        return {
          content: response.choices[0]?.message?.content || '',
          usage: {
            inputTokens,
            outputTokens,
            cost: calculateCost(usedModel, inputTokens, outputTokens).totalCost,
            model: usedModel,
          },
        }
      }

      const judgeCaller = async (documentTextStr: string, workerContent: string) => {
        const judgeUserPrompt = `Original Document:\n\n${documentTextStr}\n\nExtraction Result:\n\n${workerContent}`
        const response = await client.chat.completions.create(
          {
            model: model || aiConfig.openaiExtractionModel,
            messages: [
              { role: 'system', content: JUDGE_SYSTEM_PROMPT },
              { role: 'user', content: judgeUserPrompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: JUDGE_JSON_SCHEMA,
            },
            temperature: 0.0,
          },
          { signal: AbortSignal.timeout(300_000) }
        )
        const usedModel = response.model || model || 'gpt-5.4'
        const inputTokens = response.usage?.prompt_tokens || 0
        const outputTokens = response.usage?.completion_tokens || 0
        return {
          content: response.choices[0]?.message?.content || '',
          usage: {
            inputTokens,
            outputTokens,
            cost: calculateCost(usedModel, inputTokens, outputTokens).totalCost,
            model: usedModel,
          },
        }
      }

      // OLD debate block — removed. The unified /extract route handles debate.
      // Keeping the debug/test-deepseek route but NOT this dead code.

      const healingResult = await executeWithSelfHealingLoop(
        documentText,
        userPromptWithJson,
        aiConfig.temperature,
        workerCaller,
        judgeCaller,
        (content) => JSON.parse(content)
      )

      // ── DeepSeek Fallback ──
      // If primary OpenAI fails (quota exhausted, rate limited, network error)
      // and DeepSeek is configured, retry with DeepSeek (~10x cheaper).
      // Force check: always retry with DeepSeek on WORKER_ERROR if key exists
      const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY
      log.warn('[fallback] Healing result', {
        requestId,
        success: healingResult.success,
        hasData: !!healingResult.data,
        hasDeepSeekClient: !!deepseekFallback,
        hasDeepSeekKey,
        code: healingResult.code,
        error: healingResult.error?.substring(0, 150),
      })
      if (!healingResult.success && !healingResult.data && (deepseekFallback || hasDeepSeekKey)) {
        // Re-create client if needed (belt-and-suspenders)
        if (!deepseekFallback && hasDeepSeekKey) {
          const rawBase = process.env.DEEPSEEK_BASE_URL
          const validUrl =
            rawBase && rawBase.startsWith('http') && !rawBase.startsWith('sk-')
              ? rawBase
              : 'https://api.deepseek.com'
          log.warn('[fallback] deepseekFallback was null, recreating client from env directly', {
            validUrl,
          })
          try {
            deepseekFallback = new OpenAI({
              apiKey: process.env.DEEPSEEK_API_KEY!,
              baseURL: validUrl,
            })
          } catch (recreateErr: any) {
            log.error('[fallback] Failed to recreate DeepSeek client', {
              error: recreateErr.message,
            })
            deepseekFallback = null
          }
        }
        log.warn('[fallback] OpenAI failed, retrying with DeepSeek', {
          requestId,
          error: healingResult.error?.substring(0, 200),
        })

        const dsClient = deepseekFallback!
        const deepSeekWorker = async (userPrompt: string, temperature: number) => {
          const response = await dsClient.chat.completions.create(
            {
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: systemPromptWithJson },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
              max_tokens: aiConfig.maxTokens,
              temperature,
            },
            { signal: AbortSignal.timeout(300_000) }
          )
          const inputTokens = response.usage?.prompt_tokens || 0
          const outputTokens = response.usage?.completion_tokens || 0
          return {
            content: response.choices[0]?.message?.content || '',
            usage: {
              inputTokens,
              outputTokens,
              cost: calculateCost('deepseek-chat', inputTokens, outputTokens).totalCost,
              model: 'deepseek-chat',
            },
          }
        }
        const deepSeekJudge = async (_doc: string, workerContent: string) => {
          const judgePrompt = `Original Document:\n\n${finalUserPrompt}\n\nExtraction Result:\n\n${workerContent}`
          const response = await dsClient.chat.completions.create(
            {
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: JUDGE_SYSTEM_PROMPT },
                { role: 'user', content: judgePrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.0,
            },
            { signal: AbortSignal.timeout(300_000) }
          )
          const inputTokens = response.usage?.prompt_tokens || 0
          const outputTokens = response.usage?.completion_tokens || 0
          return {
            content: response.choices[0]?.message?.content || '',
            usage: {
              inputTokens,
              outputTokens,
              cost: calculateCost('deepseek-chat', inputTokens, outputTokens).totalCost,
              model: 'deepseek-chat',
            },
          }
        }
        const fallbackResult = await executeWithSelfHealingLoop(
          documentText,
          userPromptWithJson,
          aiConfig.temperature,
          deepSeekWorker,
          deepSeekJudge,
          (content) => JSON.parse(content)
        )
        if (fallbackResult.success || fallbackResult.data) {
          // Use fallback result instead
          healingResult.success = true
          healingResult.data = fallbackResult.data
          healingResult.finalModel = 'deepseek-chat (fallback)'
          healingResult.totalCost = fallbackResult.totalCost
          healingResult.totalInputTokens = fallbackResult.totalInputTokens
          healingResult.totalOutputTokens = fallbackResult.totalOutputTokens
          log.info('[fallback] DeepSeek fallback succeeded', { requestId })
        } else {
          log.error('[fallback] Both OpenAI and DeepSeek failed', { requestId })
        }
      }

      if (!healingResult.success && !healingResult.data) {
        return res.status(500).json({
          error: healingResult.error || 'OpenAI extraction failed',
          code: healingResult.code || 'EMPTY_RESPONSE',
        })
      }

      // DEV UTILITY: Stage 2 bypass for raw-LLM baseline capture.
      // Requires ALL THREE conditions: ?skipStage2=1 query param, ALLOW_STAGE2_BYPASS=true env var,
      // and NODE_ENV !== 'production'. No single condition is sufficient on its own.
      const skipStage2 =
        req.query.skipStage2 === '1' &&
        process.env.ALLOW_STAGE2_BYPASS === 'true' &&
        process.env.NODE_ENV !== 'production'
      if (skipStage2) {
        console.warn(
          '[STAGE2-BYPASS] Skipping runStage2Validation for raw LLM capture. NODE_ENV=' +
            process.env.NODE_ENV
        )
      }
      const parsedData = skipStage2 ? healingResult.data : runStage2Validation(healingResult.data)
      const usedModel = healingResult.finalModel || model || 'gpt-5.4'
      const inputTokens = healingResult.totalInputTokens
      const outputTokens = healingResult.totalOutputTokens
      const totalCost = healingResult.totalCost

      // Record usage asynchronously (don't block response)
      recordUsage({
        provider: 'openai',
        model: usedModel,
        operation: 'extraction',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost: 0, // calculateCost returns totalCost in our simple mock
        outputCost: 0,
        totalCost,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          log.debug('Cost tracking failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })

      // Run semantic field-level validation (zero AI cost, catches format issues)
      const fieldFailures = validateExtractionFields(parsedData as Record<string, any>)
      if (fieldFailures.length > 0) {
        log.warn('Semantic validation found field issues', {
          requestId,
          failures: fieldFailures.map((r) => `${r.field}=${r.value} (${r.hint})`),
        })
      }

      log.info('Extraction successful', {
        requestId,
        inputTokens,
        outputTokens,
        cost: totalCost,
        attempts: healingResult.attempts,
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
        cost: totalCost,
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
        fieldValidation:
          fieldFailures.length > 0
            ? fieldFailures.map((r) => ({
                field: r.field,
                value: r.value,
                hint: r.hint,
              }))
            : undefined,
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
        model: usedModel,
        cost: totalCost,
        attempts: healingResult.attempts,
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
        model: 'gpt-5.4',
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

      if (!assertExtractionModelAllowed(model, res)) return

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

      const workerCaller = async (userPrompt: string, temperature: number) => {
        const response = await client.messages
          .stream(
            {
              model: model || aiConfig.anthropicExtractionModel,
              max_tokens: Math.max(aiConfig.maxTokens, 32768),
              system: finalSystemPrompt,
              messages: [{ role: 'user', content: userPrompt }],
              temperature,
            },
            { signal: AbortSignal.timeout(300_000) }
          )
          .finalMessage()
        const textBlock = response.content.find((block) => block.type === 'text')
        let jsonContent = textBlock?.type === 'text' ? textBlock.text : ''
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
          jsonContent = jsonMatch[1].trim()
        }
        const usedModel = response.model || model || aiConfig.anthropicExtractionModel
        const inputTokens = response.usage.input_tokens
        const outputTokens = response.usage.output_tokens
        return {
          content: jsonContent,
          usage: {
            inputTokens,
            outputTokens,
            cost: calculateCost(usedModel, inputTokens, outputTokens).totalCost,
            model: usedModel,
          },
        }
      }

      const judgeCaller = async (documentTextStr: string, workerContent: string) => {
        const judgeUserPrompt = `Original Document:\n\n${documentTextStr}\n\nExtraction Result:\n\n${workerContent}\n\nPlease output the JSON containing stepByStepAnalysis, score, pass, and qualitativeFeedback as instructed.`
        const response = await client.messages
          .stream(
            {
              model: model || aiConfig.anthropicExtractionModel,
              max_tokens: aiConfig.maxTokens,
              system: JUDGE_SYSTEM_PROMPT,
              messages: [{ role: 'user', content: judgeUserPrompt }],
              temperature: 0.0,
            },
            { signal: AbortSignal.timeout(300_000) }
          )
          .finalMessage()
        const textBlock = response.content.find((block) => block.type === 'text')
        let jsonContent = textBlock?.type === 'text' ? textBlock.text : ''
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
          jsonContent = jsonMatch[1].trim()
        }
        const usedModel = response.model || model || aiConfig.anthropicExtractionModel
        const inputTokens = response.usage.input_tokens
        const outputTokens = response.usage.output_tokens
        return {
          content: jsonContent,
          usage: {
            inputTokens,
            outputTokens,
            cost: calculateCost(usedModel, inputTokens, outputTokens).totalCost,
            model: usedModel,
          },
        }
      }

      const healingResult = await executeWithSelfHealingLoop(
        documentText,
        finalUserPrompt,
        aiConfig.temperature,
        workerCaller,
        judgeCaller,
        (content) => JSON.parse(content)
      )

      if (!healingResult.success && !healingResult.data) {
        return res.status(500).json({
          error: healingResult.error || 'Anthropic extraction failed',
          code: healingResult.code || 'EMPTY_RESPONSE',
        })
      }

      // DEV UTILITY: Stage 2 bypass for raw-LLM baseline capture.
      // Requires ALL THREE conditions: ?skipStage2=1 query param, ALLOW_STAGE2_BYPASS=true env var,
      // and NODE_ENV !== 'production'. No single condition is sufficient on its own.
      const skipStage2 =
        req.query.skipStage2 === '1' &&
        process.env.ALLOW_STAGE2_BYPASS === 'true' &&
        process.env.NODE_ENV !== 'production'
      if (skipStage2) {
        console.warn(
          '[STAGE2-BYPASS] Skipping runStage2Validation for raw LLM capture. NODE_ENV=' +
            process.env.NODE_ENV
        )
      }
      const parsedData = skipStage2 ? healingResult.data : runStage2Validation(healingResult.data)
      const usedModel = healingResult.finalModel || model || aiConfig.anthropicExtractionModel
      const inputTokens = healingResult.totalInputTokens
      const outputTokens = healingResult.totalOutputTokens
      const totalCost = healingResult.totalCost

      // Record usage asynchronously (don't block response)
      recordUsage({
        provider: 'anthropic',
        model: usedModel,
        operation: 'extraction',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost: 0,
        outputCost: 0,
        totalCost,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          log.debug('Cost tracking failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })

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
        cost: totalCost,
        documentLength: (req.body as AnthropicExtractionInput).documentText?.length ?? 0,
        userId: req.headers['x-user-id'] as string | undefined,
      })

      res.json({
        success: true,
        data: parsedData,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        model: usedModel,
        cost: totalCost,
        attempts: healingResult.attempts,
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
        model: 'claude-sonnet-4-6',
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

    // ── SSE Keepalive Mode ──────────────────────────────────────────────
    // Railway (and similar PaaS) reverse proxies kill idle HTTP connections
    // after ~30s. AI extraction can take 60-120s. When the client sends
    // Accept: text/event-stream, we switch to SSE mode:
    //   1. Set Content-Type: text/event-stream + disable buffering
    //   2. Send `:keepalive\n\n` comment every 10s to keep connection alive
    //   3. Monkey-patch res.json() to send the final payload as an SSE
    //      `data:` event, then close the stream
    // Clients without this header get the same JSON response as before.
    const useSSE = req.headers.accept?.includes('text/event-stream')
    let keepaliveInterval: ReturnType<typeof setInterval> | null = null

    if (useSSE) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no') // Disable nginx/Railway buffering
      res.flushHeaders()

      // Send keepalive pings every 10s
      keepaliveInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(`:keepalive ${Date.now()}\n\n`)
        }
      }, 10_000)

      // Monkey-patch res.json to wrap in SSE event format
      res.json = function sseJson(body: unknown) {
        if (keepaliveInterval) clearInterval(keepaliveInterval)
        if (res.writableEnded) return res
        const statusCode = res.statusCode || 200
        // Send the HTTP status as a separate event so the client can distinguish errors
        res.write(`event: status\ndata: ${statusCode}\n\n`)
        res.write(`event: result\ndata: ${JSON.stringify(body)}\n\n`)
        res.end()
        return res
      } as typeof res.json
      // Ensure status().json() still works — status just sets statusCode
      res.status = function sseStatus(code: number) {
        res.statusCode = code
        return res
      } as typeof res.status
    }

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
    if (!assertExtractionModelAllowed(model, res)) return

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
          const response = await anthropicClient.messages
            .stream(
              {
                model: model || aiConfig.anthropicExtractionModel,
                max_tokens: Math.max(aiConfig.maxTokens, 32768),
                system: anthropicSystemPrompt,
                messages: [{ role: 'user', content: finalUserPrompt }],
              },
              { signal: AbortSignal.timeout(primaryTimeout) }
            )
            .finalMessage()

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
            // DEV UTILITY: Stage 2 bypass for raw-LLM baseline capture.
            // Requires ALL THREE conditions: ?skipStage2=1 query param, ALLOW_STAGE2_BYPASS=true
            // env var, and NODE_ENV !== 'production'. No single condition is sufficient.
            const skipStage2 =
              req.query.skipStage2 === '1' &&
              process.env.ALLOW_STAGE2_BYPASS === 'true' &&
              process.env.NODE_ENV !== 'production'
            if (skipStage2) {
              console.warn(
                '[STAGE2-BYPASS] Skipping runStage2Validation for raw LLM capture. NODE_ENV=' +
                  process.env.NODE_ENV
              )
            }
            const rawParsed = JSON.parse(jsonContent)
            parsedData = skipStage2 ? rawParsed : runStage2Validation(rawParsed)
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

    // ── Multi-LLM Debate Pipeline ────────────────────────────────
    // Always runs 2 independent extractors with cross-validation.
    // Each extractor has the full fallback chain (Anthropic→OpenAI→DeepSeek)
    // with different prompt/temperature variants to ensure divergence.
    // Up to 3 rounds of debate.
    {
      log.info('[debate] Running always-on debate pipeline', { requestId })
      try {
        const { runDebatePipeline, createOpenAIComparator } =
          await import('../../lib/debate-pipeline.js')

        // ── Create DeepSeek client (shared by extractors + comparator) ──
        const debateDSClient =
          getDeepSeekClient() ||
          (process.env.DEEPSEEK_API_KEY
            ? new OpenAI({
                apiKey: process.env.DEEPSEEK_API_KEY!,
                baseURL:
                  process.env.DEEPSEEK_BASE_URL &&
                  process.env.DEEPSEEK_BASE_URL.startsWith('http') &&
                  !process.env.DEEPSEEK_BASE_URL.startsWith('sk-')
                    ? process.env.DEEPSEEK_BASE_URL
                    : 'https://api.deepseek.com',
              })
            : null)

        if (!debateDSClient) {
          log.warn('[debate] No DeepSeek client available, skipping debate', { requestId })
          throw new Error('No DeepSeek client for debate')
        }

        // Narrow type for closure safety
        const dsNarrow: OpenAI = debateDSClient

        // ── Fallback-capable extractor factory ────────────────────────
        // Each extractor uses DeepSeek with a different prompt variant +
        // temperature to ensure divergence even when both hit the same provider.
        async function debateExtract(
          systemMsg: string,
          userMsg: string,
          variant: 'standard' | 'slightly_different'
        ): Promise<import('../../lib/debate-pipeline.js').ExtractionWithMeta> {
          // Different variants ensure divergence
          const temp =
            variant === 'slightly_different'
              ? Math.min(aiConfig.temperature + 0.2, 0.7)
              : aiConfig.temperature
          const variantSuffix =
            variant === 'slightly_different'
              ? '\n\nNOTE: Pay extra attention to coverage limit amounts, deductibles, and exclusions. List them with maximum detail.'
              : '\n\nNOTE: Focus on policy metadata — extract insurer/sigortacı company name, insured/sigortalı name, dates, premium, provider, vehicle. Ensure ALL top-level fields are populated.'

          const response = await dsNarrow.chat.completions.create(
            {
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: systemMsg + variantSuffix },
                { role: 'user', content: userMsg },
              ],
              response_format: { type: 'json_object' },
              max_tokens: aiConfig.maxTokens,
              temperature: temp,
            },
            { signal: AbortSignal.timeout(120_000) }
          )

          const content = response.choices[0]?.message?.content || ''
          let parsed: Record<string, unknown> = {}
          try {
            parsed = JSON.parse(content)
          } catch {
            /* invalid JSON, parsed stays empty */
          }

          const usedModel = 'deepseek-chat'
          const inputTokens = response.usage?.prompt_tokens || 0
          const outputTokens = response.usage?.completion_tokens || 0
          return {
            content,
            parsed,
            usage: {
              inputTokens,
              outputTokens,
              cost: calculateCost(usedModel, inputTokens, outputTokens).totalCost,
              model: usedModel,
              source: variant === 'slightly_different' ? 'extractor_b' : 'extractor_a',
              round: 0,
            },
          }
        }

        // Use the same function for both extractors — divergence comes from different prompt variants
        async function extractorA(
          systemMsg: string,
          userMsg: string,
          _variant: 'standard' | 'slightly_different'
        ) {
          return debateExtract(systemMsg, userMsg, 'standard')
        }
        async function extractorB(
          systemMsg: string,
          userMsg: string,
          _variant: 'standard' | 'slightly_different'
        ) {
          return debateExtract(systemMsg, userMsg, 'slightly_different')
        }

        // Comparator also uses DeepSeek SDK (same chat.completions.create API)
        const comparator = createOpenAIComparator(dsNarrow)

        // Round 3 arbitrator
        async function arbitrator(
          systemMsg: string,
          userMsg: string,
          _variant: 'standard' | 'slightly_different'
        ) {
          const result = await debateExtract(systemMsg, userMsg, 'standard')
          result.usage.source = 'arbitrator'
          result.usage.round = 3
          return result
        }

        const debateResult = await runDebatePipeline(
          extractorA,
          extractorB,
          comparator,
          arbitrator,
          openaiSystemPrompt,
          finalUserPrompt,
          documentText,
          3
        )

        const finalParsed = debateResult.final.parsed as Record<string, unknown>

        // ── Post-debate metadata completeness fix ────────────────────
        // The debate pipeline always uses DeepSeek with json_object (no strict schema),
        // which routinely drops non-revenue metadata fields (insurer, insuredName,
        // vehicle details). Since debate is the final decision-maker, we fill
        // missing mandatory fields by re-asking DeepSeek for just those fields.
        const metadataFieldsToCheck = [
          'insurer',
          'insuredName',
          'vehicleMake',
          'vehicleModel',
          'vehicleYear',
          'vehiclePlate',
          'vin',
        ]
        const missingFields = metadataFieldsToCheck.filter(
          (f) => finalParsed[f] === undefined || finalParsed[f] === null
        )
        if (missingFields.length > 0 && dsNarrow) {
          const currentJson = JSON.stringify(finalParsed, null, 2)
          const enrichPrompt = `You receive a partial policy extraction JSON (below). The following fields are MISSING: ${missingFields.join(', ')}.

Extract ONLY these missing fields from the original document text and return a JSON object with those fields filled.

If a field's value is not found in the document, use an empty string ("") rather than null.

Return ONLY a JSON object with exactly these fields: ${missingFields.join(', ')}

Partial extraction:
${currentJson}

Original document:
${documentText.substring(0, 8000)}`
          try {
            const enrich = await dsNarrow.chat.completions.create(
              {
                model: 'deepseek-chat',
                messages: [
                  {
                    role: 'system',
                    content:
                      'You extract missing metadata fields from insurance policy documents. Return ONLY valid JSON with exactly the requested fields.',
                  },
                  { role: 'user', content: enrichPrompt },
                ],
                response_format: { type: 'json_object' },
                max_tokens: 2000,
                temperature: 0.0,
              },
              { signal: AbortSignal.timeout(60_000) }
            )
            const enrichRaw = enrich.choices[0]?.message?.content || '{}'
            const enrichData = JSON.parse(enrichRaw) as Record<string, unknown>
            for (const field of metadataFieldsToCheck) {
              const val = enrichData[field]
              if (val !== undefined && val !== null && val !== '') {
                finalParsed[field] = val
              }
            }
          } catch (enrichErr: any) {
            log.warn('[debate] Metadata enrichment failed', {
              requestId,
              missingFields: missingFields.join(','),
              error: enrichErr.message?.substring(0, 100),
            })
          }
        }

        // Round-trip validator: check raw LLM output for suspicious values
        // without importing client-side code (avoids compilation dependency issue).
        let roundTripValid = true
        let roundTripWarning: string | undefined
        try {
          const pn = String(finalParsed.policyNumber || '')
          if (!pn || pn.startsWith('POL-') || pn.startsWith('pol-')) {
            roundTripValid = false
            roundTripWarning = 'Policy number is missing or looks like a fallback timestamp'
          }
          // LLM often uses 'provider' rather than 'insurer' — check both
          const insCompany = finalParsed.insurer || finalParsed.insuredBy || finalParsed.provider
          if (!insCompany || insCompany === 'MISSING') {
            roundTripValid = false
            roundTripWarning = (roundTripWarning || '') + ' Insurer missing'
          }
          // LLM often uses 'insured' rather than 'insuredName'/'insuredPerson'
          if (!finalParsed.insuredName && !finalParsed.insuredPerson && !finalParsed.insured) {
            roundTripValid = false
            roundTripWarning = (roundTripWarning || '') + ' Insured name missing'
          }
          if (!finalParsed.startDate || !finalParsed.endDate) {
            roundTripValid = false
            roundTripWarning = (roundTripWarning || '') + ' Dates missing'
          }
          if (!finalParsed.premium) {
            roundTripValid = false
            roundTripWarning = (roundTripWarning || '') + ' Premium missing'
          }
        } catch (convErr: any) {
          roundTripValid = false
          roundTripWarning = `Validator crashed: ${convErr.message}`
        }

        const parsedData = runStage2Validation(finalParsed)

        log.info('[debate] Pipeline completed', {
          requestId,
          roundCount: debateResult.roundCount,
          totalCost: debateResult.totalCost,
          totalTokens: debateResult.totalTokens,
          disagreements: debateResult.disagreements.length,
          roundTripValid,
          roundTripWarning,
        })

        return res.json({
          success: true,
          data: parsedData,
          usage: {
            input_tokens: debateResult.totalTokens,
            output_tokens: 0,
            total_cost: debateResult.totalCost,
          },
          model: 'debate',
          provider: 'debate_pipeline',
          fallback: !!anthropicClient,
          ...((req as any)._fallbackReason && { fallbackReason: (req as any)._fallbackReason }),
          cost: debateResult.totalCost,
          requestId,
          route: '/api/ai/extract',
          elapsedMs: Date.now() - startTime,
          phaseTiming,
          debate: {
            roundCount: debateResult.roundCount,
            totalCost: debateResult.totalCost,
            totalTokens: debateResult.totalTokens,
            disagreements: debateResult.disagreements,
            roundTripValid,
            roundTripWarning,
          },
          fallbackChain: anthropicClient
            ? [{ provider: 'anthropic', success: false, error_code: (req as any)._fallbackReason }]
            : undefined,
        })
      } catch (debateError) {
        log.error('[debate] Pipeline failed, falling back to single extraction', {
          requestId,
          error: debateError instanceof Error ? debateError.message : String(debateError),
        })
        // Fall through to regular OpenAI/DeepSeek extraction
      }
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
            max_completion_tokens: aiConfig.maxTokens,
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
          const rawParsed = JSON.parse(content)
          // Run stage2 validation even on the fallback path (same as Anthropic primary path).
          // FIX: Previously this path returned raw LLM output without runStage2Validation,
          // meaning the /extract OpenAI fallback bypassed canonicalization entirely.
          parsedOpenAIData = runStage2Validation(rawParsed)
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
          model: 'gpt-5.4',
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

        // ── DeepSeek Fallback ──
        // If both Anthropic and OpenAI failed, and DeepSeek is configured, try it
        // before giving up. DeepSeek uses json_object (not json_schema like OpenAI).
        const deepseekClient = getDeepSeekClient()
        const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY
        if (deepseekClient || hasDeepSeekKey) {
          const dsClient =
            deepseekClient ||
            new OpenAI({
              apiKey: process.env.DEEPSEEK_API_KEY!,
              baseURL:
                process.env.DEEPSEEK_BASE_URL &&
                process.env.DEEPSEEK_BASE_URL.startsWith('http') &&
                !process.env.DEEPSEEK_BASE_URL.startsWith('sk-')
                  ? process.env.DEEPSEEK_BASE_URL
                  : 'https://api.deepseek.com',
            })

          try {
            log.warn('[fallback] Anthropic+OpenAI failed, retrying with DeepSeek', {
              requestId,
              anthropicError: (req as any)._fallbackReason,
              openaiError: openaiErrorCode,
            })

            const deepseekStart = Date.now()
            // Ensure prompts ask for JSON (DeepSeek needs json_object response_format)
            const dsSystemPrompt =
              openaiSystemPrompt.includes('json') || openaiSystemPrompt.includes('JSON')
                ? openaiSystemPrompt
                : openaiSystemPrompt + '\n\nRespond with valid JSON only.'
            const dsUserPrompt =
              finalUserPrompt.includes('json') || finalUserPrompt.includes('JSON')
                ? finalUserPrompt
                : finalUserPrompt + '\n\nRespond with valid JSON only.'

            const dsResponse = await dsClient.chat.completions.create(
              {
                model: 'deepseek-chat',
                messages: [
                  { role: 'system', content: dsSystemPrompt },
                  { role: 'user', content: dsUserPrompt },
                ],
                response_format: { type: 'json_object' },
                max_tokens: aiConfig.maxTokens,
                temperature: aiConfig.temperature,
              },
              { signal: AbortSignal.timeout(120_000) }
            )

            const dsContent = dsResponse.choices[0]?.message?.content
            if (!dsContent) throw new Error('Empty response from DeepSeek')

            const dsInputTokens = dsResponse.usage?.prompt_tokens || 0
            const dsOutputTokens = dsResponse.usage?.completion_tokens || 0
            const dsCost = calculateCost('deepseek-chat', dsInputTokens, dsOutputTokens)

            recordUsage({
              provider: 'deepseek',
              model: 'deepseek-chat',
              operation: 'extraction',
              inputTokens: dsInputTokens,
              outputTokens: dsOutputTokens,
              totalTokens: dsInputTokens + dsOutputTokens,
              inputCost: dsCost.inputCost,
              outputCost: dsCost.outputCost,
              totalCost: dsCost.totalCost,
              timestamp: new Date().toISOString(),
            }).catch((err: any) =>
              log.warn('Failed to record DeepSeek usage', {
                requestId,
                error: err instanceof Error ? err.message : String(err),
              })
            )

            let parsedDSData: unknown
            try {
              const rawParsed = JSON.parse(dsContent)
              // Run stage2 validation (same as primary path)
              parsedDSData = runStage2Validation(rawParsed)
            } catch (_parseError) {
              throw new Error('DeepSeek returned invalid JSON')
            }

            markPhase('deepseek_ms', deepseekStart)
            log.info('[fallback] DeepSeek fallback succeeded', {
              requestId,
              deepseekMs: Date.now() - deepseekStart,
              phaseTiming,
            })

            return res.json({
              success: true,
              data: parsedDSData,
              model: 'deepseek-chat',
              provider: 'deepseek',
              fallback: true,
              fallbackChain: [
                {
                  provider: 'anthropic',
                  success: false,
                  error_code: (req as any)._fallbackReason,
                },
                { provider: 'openai', success: false, error_code: openaiErrorCode },
                { provider: 'deepseek', success: true },
              ],
              cost: dsCost.totalCost,
              requestId,
              route: '/api/ai/extract',
              elapsedMs: Date.now() - startTime,
              phaseTiming,
            })
          } catch (deepseekError) {
            const dsMsg =
              deepseekError instanceof Error ? deepseekError.message : 'Unknown DeepSeek error'
            log.error('[fallback] DeepSeek also failed', {
              requestId,
              error: dsMsg,
              phaseTiming,
            })

            // Capture all-providers-failed including DeepSeek
            captureServerError(deepseekError instanceof Error ? deepseekError : new Error(dsMsg), {
              requestId,
              provider: 'deepseek',
              errorCode: 'DEEPSEEK_ERROR',
              documentLength: documentText?.length ?? 0,
              allProvidersFailed: true,
            })

            return res.status(500).json({
              error: 'All AI providers failed',
              code: 'ALL_PROVIDERS_FAILED',
              details:
                `Anthropic: ${(req as any)._fallbackReason}. ` +
                `OpenAI: ${message.substring(0, 100)}. ` +
                `DeepSeek: ${dsMsg}`,
              elapsedMs: Date.now() - startTime,
              phaseTiming: { ...phaseTiming, deepseek_ms: Date.now() - startTime },
              requestId,
              timestamp: new Date().toISOString(),
            })
          }
        }

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
  error?: { message: string; code?: string; status?: string }
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

    // Resolve OCR timeout from config (DB-overridable). Same key drives
    // Document AI and Vision OCR — both have similar cold-start profiles.
    const aiCfgVision = await getAIConfig()
    const ocrFetchTimeoutMs = aiCfgVision.ocrFetchTimeoutMs

    const visionRequestBody = JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['tr', 'en'] },
        },
      ],
    })

    const callVision = async (): Promise<globalThis.Response> => {
      const controller = new AbortController()
      const fetchTimeout = setTimeout(() => controller.abort(), ocrFetchTimeoutMs)
      try {
        return await fetch(url, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: visionRequestBody,
        })
      } finally {
        clearTimeout(fetchTimeout)
      }
    }

    // ONE retry on AbortError (timeout) — see comment on the Document AI path
    // for rationale.
    let response: globalThis.Response
    try {
      response = await callVision()
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message?.includes('aborted'))
      if (!isAbort) throw err
      log.warn('[OCR] cold-start retry: vision', { ocrFetchTimeoutMs })
      response = await callVision()
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

      const { documentBase64, mimeType, languageHints, cacheKey } = req.body as DocumentAIInput

      // Cache lookup BEFORE the live Document AI call (cost-control PR, May 3 2026).
      // Document AI is deterministic on identical input. The challenge: pdf-lib's
      // save() is non-deterministic across Node processes, so sha256(documentBase64)
      // changes every run for the same source PDF (cross-process date/PID-based
      // randomness inside pdf-lib). When the client supplies a stable `cacheKey`
      // (e.g. `${sha256(sourceFileBytes)}:${chunkIdx}/${totalChunks}`), we hash that
      // instead — which IS stable across runs and produces real cache hits.
      // Cache failures never block the live OCR path (lookup returns null on error).
      const cacheSha = cacheKey
        ? crypto.createHash('sha256').update(cacheKey).digest('hex')
        : hashOcrInput(documentBase64)
      const cached = await lookupOcrCache(cacheSha)
      if (cached) {
        const cachedProcessingMs = Date.now() - startTime
        log.info('OCR cache hit', {
          sha256: cacheSha.slice(0, 16),
          via: cacheKey ? 'cacheKey' : 'documentBase64',
          textBytes: cached.text.length,
          processingTimeMs: cachedProcessingMs,
        })
        return res.json({
          success: true,
          data: {
            text: cached.text,
            confidence: cached.confidence ?? 0.85,
            pageCount: cached.pageCount ?? 1,
            processingTimeMs: cachedProcessingMs,
            cached: true,
          },
          cost: 0,
        })
      }

      // Build Document AI endpoint
      const endpoint = `https://${GCP_CONFIG.location}-documentai.googleapis.com/v1/projects/${GCP_CONFIG.projectId}/locations/${GCP_CONFIG.location}/processors/${GCP_CONFIG.processorId}:process`

      // Resolve timeout from config (DB-overridable, defaults to 90 s).
      // Replaces the hardcoded 60 000 ms ceiling that aborted Allianz at
      // exactly 60.057 s in production. See migration 044 and findings F0.
      const aiCfg = await getAIConfig()
      const ocrFetchTimeoutMs = aiCfg.ocrFetchTimeoutMs

      log.info('Calling Document AI API', {
        location: GCP_CONFIG.location,
        project: GCP_CONFIG.projectId,
        processor: GCP_CONFIG.processorId,
        setupMs: Date.now() - startTime,
        ocrFetchTimeoutMs,
      })

      const requestBody = JSON.stringify({
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
      })

      // Single attempt against Document AI. Aborts on the configured timeout.
      // Throws AbortError when the timeout fires; any other rejection (network,
      // GCP 5xx surfacing as fetch error) is rethrown unchanged.
      const callDocumentAI = async (): Promise<globalThis.Response> => {
        const controller = new AbortController()
        const fetchTimeout = setTimeout(() => controller.abort(), ocrFetchTimeoutMs)
        try {
          return await fetch(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: requestBody,
          })
        } finally {
          clearTimeout(fetchTimeout)
        }
      }

      // ONE retry on AbortError (timeout). Document AI cold-starts can spike
      // well past the steady-state latency, and the second attempt almost
      // always succeeds because the processor is warm. We do NOT retry on
      // genuine HTTP 4xx/5xx (those aren't cold-start), and we do NOT retry
      // beyond once (would compound latency unacceptably for the user).
      let response: globalThis.Response
      try {
        response = await callDocumentAI()
      } catch (err) {
        const isAbort =
          err instanceof Error && (err.name === 'AbortError' || err.message?.includes('aborted'))
        if (!isAbort) throw err
        log.warn('[OCR] cold-start retry: document-ai', {
          firstAttemptMs: Date.now() - startTime,
          ocrFetchTimeoutMs,
        })
        response = await callDocumentAI()
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

      // Cache write — fire-and-forget. Failure to store does not invalidate
      // the live OCR result we already have to return to the caller.
      void storeOcrCache(
        cacheSha,
        result.document.text || '',
        pageCount,
        avgConfidence,
        mimeType,
        languageHints
      )

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
// GEMINI MULTIMODAL OCR
// ============================================================================

/**
 * POST /api/ai/ocr/gemini
 * Single-pass multimodal OCR using Gemini 2.5 Flash.
 * Sends the raw image directly to Gemini and gets back extracted text,
 * eliminating the legacy 3-step pipeline (Cloud Vision → LLM cleanup → text).
 * Rate limited: 30 requests per hour
 */
router.post(
  '/ocr/gemini',
  validateJSON,
  ocrLimiter,
  validateOCR,
  async (req: Request, res: Response) => {
    const IS_PRODUCTION = process.env.NODE_ENV === 'production'
    const startTime = Date.now()

    try {
      const client = getGeminiClient()
      if (!client) {
        return res.status(503).json({
          error: IS_PRODUCTION
            ? 'Document processing service unavailable'
            : 'Gemini not configured — set GEMINI_API_KEY',
          code: 'PROVIDER_NOT_CONFIGURED',
        })
      }

      const { imageBase64 } = req.body as { imageBase64: string }
      const aiConfig = await getAIConfig()
      const model = aiConfig.geminiModel || 'gemini-2.5-flash'

      // Detect MIME type from base64 header (fallback to image/png)
      let mimeType = 'image/png'
      let imageData = imageBase64
      if (imageBase64.startsWith('/9j/')) mimeType = 'image/jpeg'
      else if (imageBase64.startsWith('JVBER')) mimeType = 'application/pdf'
      else if (imageBase64.startsWith('iVBOR')) mimeType = 'image/png'

      // PDF rendering fallback: if the document is a PDF, try rendering
      // pages to images before sending to Gemini. Some GCP projects block
      // the native `application/pdf` MIME type, but images always work.
      let renderedPages = 0
      if (mimeType === 'application/pdf') {
        try {
          const pdfjsLib = await import('pdfjs-dist')
          // canvas (node-canvas) is optional — may not be installed in production
          let createCanvas: any
          try {
            // Dynamic import with string literal to survive TS module resolution
            // canvas is a native C++ module not available in all environments (e.g. Railway)
            createCanvas = await Function('return import("canvas").then(m => m.createCanvas)')()
          } catch {
            log.warn('Gemini OCR: canvas module not available, skipping PDF rendering')
            throw new Error('canvas module not available')
          }
          const pdfBuf = Buffer.from(imageBase64, 'base64')
          const doc = await pdfjsLib.getDocument({ data: pdfBuf.buffer }).promise
          const maxPages = Math.min(doc.numPages, 5) // Max 5 pages to avoid timeouts

          // Render all pages as JPEG images and concatenate them
          const renderedBuffers: Buffer[] = []
          for (let i = 1; i <= maxPages; i++) {
            const page = await doc.getPage(i)
            const viewport = page.getViewport({ scale: 1.5 }) // Slightly higher res
            const canvas = createCanvas(viewport.width, viewport.height)
            const ctx = canvas.getContext('2d')
            await (page.render as any)({ canvasContext: ctx as any, viewport }).promise
            renderedBuffers.push(canvas.toBuffer('image/jpeg', { quality: 0.85 }))
            renderedPages++
          }
          const combinedImage = Buffer.concat(renderedBuffers)
          imageData = combinedImage.toString('base64')
          mimeType = 'image/jpeg'
          log.info('Gemini OCR: rendered PDF pages to images', {
            totalPages: doc.numPages,
            renderedPages,
            imageBytes: combinedImage.length,
          })
        } catch (renderErr) {
          log.warn('Gemini OCR: PDF page rendering failed, trying raw PDF', {
            error: renderErr instanceof Error ? renderErr.message : String(renderErr),
          })
          // Fall through — use the original PDF data
        }
      }

      log.info('Gemini OCR: processing document', { model, mimeType, renderedPages })

      const imagePart = createPartFromBase64(imageData, mimeType)

      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              imagePart,
              {
                text: 'Extract ALL text from this document image. Preserve the original layout, structure, and line breaks as closely as possible. Output ONLY the extracted text, no commentary or formatting instructions. For Turkish insurance documents, pay special attention to monetary values, dates, policy numbers, and coverage details.',
              },
            ],
          },
        ],
        config: {
          temperature: 0.0,
          maxOutputTokens: 8192,
        },
      })

      const extractedText = response.text || ''
      const inputTokens = response.usageMetadata?.promptTokenCount || 0
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0

      // Calculate cost using the pricing table
      const costResult = calculateCost(model, inputTokens, outputTokens)

      // Record usage asynchronously
      recordUsage({
        provider: 'google',
        model,
        operation: 'ocr-gemini',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost: costResult.inputCost,
        outputCost: costResult.outputCost,
        totalCost: costResult.totalCost,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        if (!IS_PRODUCTION)
          log.debug('Cost tracking failed', {
            error: err instanceof Error ? err.message : String(err),
          })
      })

      const processingTimeMs = Date.now() - startTime
      log.info('Gemini OCR complete', {
        model,
        inputTokens,
        outputTokens,
        cost: costResult.totalCost,
        textLength: extractedText.length,
        processingTimeMs,
      })

      res.json({
        success: true,
        data: {
          text: extractedText,
          confidence: extractedText.length > 50 ? 0.92 : 0.5,
          pageCount: 1,
          processingTimeMs,
        },
        cost: costResult.totalCost,
        usage: { inputTokens, outputTokens, model },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const processingTimeMs = Date.now() - startTime

      log.error('Gemini OCR failed', {
        error: message,
        processingTimeMs,
      })

      let code = 'GEMINI_OCR_FAILED'
      let userMessage = IS_PRODUCTION
        ? 'Unable to process document'
        : `Gemini OCR failed: ${message}`

      if (error instanceof Error && error.name === 'AbortError') {
        code = 'TIMEOUT'
        userMessage = IS_PRODUCTION ? 'Request timed out, please try again' : 'Gemini OCR timed out'
      } else if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        code = 'RATE_LIMITED'
        userMessage = IS_PRODUCTION
          ? 'Service busy, please try again later'
          : 'Gemini rate limit exceeded'
      } else if (
        message.includes('API key') ||
        message.includes('401') ||
        message.includes('403')
      ) {
        code = 'AUTH_FAILED'
        userMessage = IS_PRODUCTION
          ? 'Document processing service unavailable'
          : 'Gemini API key invalid — check GEMINI_API_KEY'
      }

      res.status(500).json({
        error: userMessage,
        code,
        ...(!IS_PRODUCTION && { details: message }),
        timestamp: new Date().toISOString(),
      })
    }
  }
)

// ============================================================================
// PROCESSING LOGS (Document Journey Tracking)
// ============================================================================

export default router
