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
import { alertBilling, dispatchAlert } from '../../lib/alert-service.js'
import { loadPrompts, getPromptVersionTag } from '../../lib/prompt-loader.js'
import { classifyDocument, checkTypeConsistency } from '../../lib/classifier-gate.js'
import { BillingError, classifyProviderError } from '../../lib/extraction-pipeline.js'
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

export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

export function getAnthropicClient(): Anthropic | null {
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
export function getDeepSeekClient(): OpenAI | null {
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

export function getGeminiClient(): GoogleGenAI | null {
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

export function getGCPCredentialsPath(): string | null {
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
export async function getDocumentAIAccessToken(): Promise<string | null> {
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

      // ── FIX 2: Centralised prompt loading (same prompt across all endpoints) ──
      const loadedPrompts = await loadPrompts(documentText, policyType, clientPrompt)
      const { openaiSystemPrompt: finalSystemPrompt, userPrompt: finalUserPrompt } = loadedPrompts
      const promptVersion = getPromptVersionTag(loadedPrompts.templateMeta)

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
        promptVersion,
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
/**
 * POST /api/ai/extract
 * Unified extraction endpoint — uses DeepSeek directly (only working provider).
 * Anthropic billing exhausted, OpenAI rate-limited. When they recover, add them
 * back as fallbacks before DeepSeek.
 */
router.post(
  '/extract',
  validateJSON,
  aiExtractionLimiter,
  validateAnthropicExtraction,
  async (req: Request, res: Response) => {
    const requestId = `ext-${Date.now()}`
    const startTime = Date.now()

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

    // Get AI config from database
    const configStart = Date.now()
    const aiConfig = await getAIConfig()
    markPhase('configLoad_ms', configStart)

    // ── Document classifier — gates policy type before extraction ──
    const classification = classifyDocument(documentText)
    log.info('Document classification', {
      requestId,
      type: classification.type,
      confidence: classification.confidence,
      hints: classification.hints.slice(0, 5),
    })

    const effectivePolicyType = policyType || classification.type

    // ── Centralised prompt loading ──
    const promptStart = Date.now()
    const loadedPrompts = await loadPrompts(documentText, effectivePolicyType, clientPrompt)
    markPhase('promptLoad_ms', promptStart)
    const {
      openaiSystemPrompt,
      userPrompt: finalUserPrompt,
      templateMeta: promptMeta,
    } = loadedPrompts
    const promptVersion = getPromptVersionTag(promptMeta)

    let degradedReason: string | undefined

    log.info('Using config', {
      requestId,
      openaiModel: aiConfig.openaiExtractionModel,
      promptVersion,
      classification: classification.type,
      setupMs: Date.now() - startTime,
      phaseTiming,
    })

    // ── DeepSeek Extraction (only working provider) ─────────────────
    const dsClient = getDeepSeekClient()
    if (!dsClient) {
      log.error('No DeepSeek client available', { requestId })
      return res.status(503).json({
        error: 'Extraction unavailable — no AI provider configured',
        code: 'NO_PROVIDER_AVAILABLE',
        requestId,
        elapsedMs: Date.now() - startTime,
      })
    }

    const dsStart = Date.now()
    try {
      // Append JSON instruction to system prompt, plus anti-training-data guard
      const dsSystemPrompt =
        openaiSystemPrompt.includes('json') || openaiSystemPrompt.includes('JSON')
          ? openaiSystemPrompt
          : openaiSystemPrompt + '\n\nRespond with valid JSON only.'

      const dsSystemPromptFinal =
        dsSystemPrompt +
        '\n\nNEVER use training data defaults. Every value comes from the document text in the user message.'

      // DeepSeek's json_object mode needs a concrete flat JSON example to match our format.
      // Without one, DeepSeek uses its nested schema and returns null values.
      const dsOutputSchema =
        '\n\nReturn flat JSON following this structure (replace values from document, add more coverages):\n' +
        '{\n' +
        '  "policyNumber": "string_from_doc",\n' +
        '  "insurer": "string_from_doc",\n' +
        '  "insuredName": "string_from_doc",\n' +
        '  "startDate": "YYYY-MM-DD",\n' +
        '  "endDate": "YYYY-MM-DD",\n' +
        '  "premium": 12345,\n' +
        '  "vehicleMake": "string_from_doc",\n' +
        '  "vehicleModel": "string_from_doc",\n' +
        '  "vehicleYear": "YYYY",\n' +
        '  "vehiclePlate": "string_from_doc",\n' +
        '  "NCD": 50,\n' +
        '  "policyType": "kasko",\n' +
        '  "coverages": [\n' +
        '    { "name": "Kasko Teminatı", "limit": 500000 },\n' +
        '    { "name": "İhtiyari Mali Sorumluluk", "limit": 500000 },\n' +
        '    { "name": "Hukuksal Koruma", "limit": 25000 },\n' +
        '    { "name": "Koltuk Ferdi Kaza Vefat", "limit": 50000 },\n' +
        '    { "name": "Koltuk Ferdi Kaza Sakatlık", "limit": 50000 },\n' +
        '    { "name": "Motorlu Araca Bağlı Ferdi Kaza", "limit": 50000 },\n' +
        '    { "name": "Sürücüye Bağlı Ferdi Kaza", "limit": 50000 },\n' +
        '    { "name": "Yol Yardım", "limit": null },\n' +
        '    { "name": "İkame Araç", "limit": null },\n' +
        '    { "name": "Cam Kırılması", "limit": null },\n' +
        '    { "name": "Ek Donanım", "limit": 50000 }\n' +
        '  ]\n' +
        '}\n' +
        'CRITICAL: You MUST read values from the DOCUMENT TEXT above, NOT from this example. ' +
        'Replace all placeholder values with data from the actual document. ' +
        'Read every line of the document. Do NOT use training data defaults.'

      const response = await dsClient.chat.completions.create(
        {
          model: model || 'deepseek-chat',
          messages: [
            { role: 'system', content: dsSystemPromptFinal },
            { role: 'user', content: finalUserPrompt + dsOutputSchema },
          ],
          response_format: { type: 'json_object' },
          max_tokens: aiConfig.maxTokens,
          temperature: aiConfig.temperature,
        },
        { signal: AbortSignal.timeout(aiConfig.requestBudgetMs || 120_000) }
      )

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('Empty response from DeepSeek')
      }

      markPhase('deepseek_ms', dsStart)

      // Parse JSON
      let rawParsed: Record<string, unknown>
      try {
        rawParsed = JSON.parse(content) as Record<string, unknown>
      } catch {
        log.error('DeepSeek returned invalid JSON', {
          requestId,
          contentPreview: content.slice(0, 200),
        })
        throw new Error('AI returned invalid JSON — response could not be parsed')
      }

      // ── Normalize DeepSeek output format ───────────────────────────
      // DeepSeek's json_object mode can use a COMPLETELY DIFFERENT schema
      // (insurerName, policyholderName, grossPremium, vehicles[], errors[], etc.)
      // instead of our flat expected schema. Handle three cases:
      //   1) Nested objects (policy: {...}, parties: {...}, premiums: {...})
      //   2) Alternative top-level field names (insurerName → insurer, etc.)
      //   3) Extra arrays (errors[], taxes[], installments[]) to clean up

      // ── Case 1: Flatten nested object patterns ──────────────────────
      if (rawParsed.policy && typeof rawParsed.policy === 'object' && !rawParsed.policyNumber) {
        const p = rawParsed.policy as Record<string, unknown>
        if (p.policyNumber) rawParsed.policyNumber = p.policyNumber
        if (p.startDate) rawParsed.startDate = p.startDate
        if (p.endDate) rawParsed.endDate = p.endDate
      }
      if (rawParsed.parties && typeof rawParsed.parties === 'object') {
        const pa = rawParsed.parties as Record<string, unknown>
        const insured = pa.insured as Record<string, unknown> | undefined
        if (insured?.name && !rawParsed.insuredName) rawParsed.insuredName = insured.name
        if (insured?.idNumber && !rawParsed.insuredId) rawParsed.insuredId = insured.idNumber
        // Also check policyholder (alternative DeepSeek naming)
        const polholder = pa.policyholder as Record<string, unknown> | undefined
        if (polholder?.name && !rawParsed.insuredName) rawParsed.insuredName = polholder.name
      }
      if (
        typeof rawParsed.insurer === 'object' &&
        rawParsed.insurer !== null &&
        !Array.isArray(rawParsed.insurer)
      ) {
        const ins = rawParsed.insurer as Record<string, unknown>
        if (ins.name) rawParsed.insurer = ins.name
      }
      if (rawParsed.premiums && typeof rawParsed.premiums === 'object') {
        const pr = rawParsed.premiums as Record<string, unknown>
        if (pr.totalPayable && !rawParsed.premium) rawParsed.premium = pr.totalPayable
        if (pr.grossPremium && !rawParsed.premium) rawParsed.premium = pr.grossPremium
        if (pr.currency && !rawParsed.currency) rawParsed.currency = pr.currency
      }
      if (
        rawParsed.vehicles &&
        Array.isArray(rawParsed.vehicles) &&
        rawParsed.vehicles.length > 0
      ) {
        const v = rawParsed.vehicles[0] as Record<string, unknown>
        if (v.plate && !rawParsed.vehiclePlate) rawParsed.vehiclePlate = v.plate
        if (v.make && !rawParsed.vehicleMake) rawParsed.vehicleMake = v.make
        if (v.model && !rawParsed.vehicleModel) rawParsed.vehicleModel = v.model
        if (v.year && !rawParsed.vehicleYear) rawParsed.vehicleYear = v.year
        if (v.vin && !rawParsed.vin) rawParsed.vin = v.vin
      }

      // ── Case 2: Map alternative field names DeepSeek uses ──────────
      // DeepSeek sometimes uses a completely different schema at the top level
      // (insurerName, grossPremium, policyholderName, etc.) instead of ours.
      const altFieldMap: Record<string, string> = {
        insurerName: 'insurer',
        policyholderName: 'insuredName',
        policyholderIdNumber: 'insuredId',
        policyholderAddress: 'insuredAddress',
        policyholderTaxNumber: 'insuredTaxNumber',
        grossPremium: 'premium',
        netPremium: 'premiumNet',
        totalPayable: 'premium',
        premiumsCurrency: 'currency',
        issueDateTime: 'startDate',
        durationDays: 'durationDays',
      }
      for (const [altKey, targetKey] of Object.entries(altFieldMap)) {
        const val = rawParsed[altKey]
        if (val !== undefined && val !== null) {
          // Only set target if it's not already populated
          if (rawParsed[targetKey] === undefined || rawParsed[targetKey] === null) {
            rawParsed[targetKey] = val
          }
          delete rawParsed[altKey]
        }
      }

      // ── Case 3: Clean up DeepSeek extra arrays that confuse stage2 ──
      for (const extraKey of ['clauses', 'taxes', 'installments', 'errors', 'endorsements']) {
        delete rawParsed[extraKey]
      }

      // ── Case 4: Normalize coverage limit format ───────────────────
      // DeepSeek sometimes outputs limit as {"amount": 500000, "currency": "TRY"}
      // instead of a simple number. Normalize to plain number for stage2.
      const coverageList = rawParsed.coverages as Array<Record<string, unknown>> | undefined
      if (coverageList) {
        for (const c of coverageList) {
          const lim = c.limit
          if (lim !== null && typeof lim === 'object' && !Array.isArray(lim)) {
            // Extract amount from {amount: number, currency: string}
            const limObj = lim as Record<string, unknown>
            c.limit = (typeof limObj.amount === 'number' ? limObj.amount : null) as number | null
          }
        }
      }

      // ── Inject policyType if DeepSeek dropped it ──────────────────
      if (!rawParsed.policyType && !rawParsed.policy_type) {
        rawParsed.policyType = classification.type
      }

      // Track cost
      const usedModel = 'deepseek-chat'
      const inputTokens = response.usage?.prompt_tokens || 0
      const outputTokens = response.usage?.completion_tokens || 0
      const cost = calculateCost(usedModel, inputTokens, outputTokens)

      recordUsage({
        provider: 'deepseek',
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
        log.warn('Failed to record DeepSeek usage', {
          requestId,
          error: err instanceof Error ? err.message : String(err),
        })
      )

      // ── Stage2 validation ──
      let stage2Data: unknown
      try {
        stage2Data = runStage2Validation(rawParsed)
      } catch (stage2Err: any) {
        log.error('Stage2 validation failed', {
          requestId,
          error: stage2Err.message?.substring(0, 200),
        })
        stage2Data = rawParsed // Fall back to raw LLM output
        degradedReason = 'stage2_validation_failed'
      }

      log.info('Provider succeeded', {
        requestId,
        provider: 'deepseek',
        coverageCount: ((stage2Data || rawParsed) as any)?.coverages?.length ?? 0,
        validationPassed: true,
        durationMs: Date.now() - dsStart,
      })

      // Record extraction metric
      recordExtractionEvent({
        requestId,
        timestamp: new Date().toISOString(),
        provider: 'deepseek',
        success: true,
        durationMs: Date.now() - startTime,
        documentLength: documentText?.length ?? 0,
      })
      recordOverviewMetrics({
        requestId,
        provider: 'deepseek',
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

      // Fire push notification if user is authenticated
      const notifyUserId = req.headers['x-user-id'] as string | undefined
      if (notifyUserId) {
        sendExtractionCompleteNotification(
          notifyUserId,
          String(rawParsed.policyType || classification.type),
          (rawParsed.policyNumber as string | null | undefined) ?? null
        ).catch((err) =>
          log.warn('Push notification failed after extraction', {
            requestId,
            error: err instanceof Error ? err.message : String(err),
          })
        )
      }

      // ── Type consistency check ──
      const consistency = checkTypeConsistency(
        classification,
        rawParsed.policyType as string | null | undefined
      )
      if (!consistency.consistent) {
        log.warn('Type mismatch in response: ' + consistency.mismatchDescription, { requestId })
        degradedReason = degradedReason
          ? degradedReason + '; Type mismatch: ' + consistency.mismatchDescription
          : 'Type mismatch: ' + consistency.mismatchDescription
        dispatchAlert({
          severity: 'warning',
          category: 'api_error',
          title: 'Policy Type Mismatch (DeepSeek)',
          message: consistency.mismatchDescription || 'Unknown mismatch',
          provider: 'deepseek',
          dedupKey:
            'type_mismatch:' + classification.type + '->' + String(rawParsed.policyType || '?'),
        }).catch(() => {})
      }

      log.info('Extraction completed', {
        requestId,
        finalProvider: 'deepseek',
        promptVersion,
        degradedReason,
        totalDurationMs: Date.now() - startTime,
        success: true,
      })

      return res.json({
        success: true,
        data: stage2Data,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        model: usedModel,
        provider: 'deepseek',
        cost: cost.totalCost,
        requestId,
        route: '/api/ai/extract',
        elapsedMs: Date.now() - startTime,
        phaseTiming,
        degradedReason,
        promptVersion,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      markPhase('deepseek_ms', dsStart)
      log.error('DeepSeek extraction failed', {
        requestId,
        error: message,
        durationMs: Date.now() - dsStart,
        totalMs: Date.now() - startTime,
        phaseTiming,
      })

      // Classify error
      const classified = classifyProviderError(error, 'deepseek', requestId)
      const errorCode =
        classified instanceof BillingError
          ? 'DEEPSEEK_BILLING_ERROR'
          : `DEEPSEEK_ERROR_${error instanceof Error ? error.name : 'UNKNOWN'}`.substring(0, 50)

      captureServerError(error instanceof Error ? error : new Error(message), {
        requestId,
        provider: 'deepseek',
        errorCode,
        documentLength: documentText?.length ?? 0,
      })

      recordExtractionEvent({
        requestId,
        timestamp: new Date().toISOString(),
        provider: 'deepseek',
        success: false,
        durationMs: Date.now() - dsStart,
        errorCode,
        errorMessage: message.substring(0, 200),
        documentLength: documentText?.length ?? 0,
      })
      recordOverviewMetrics({
        requestId,
        provider: 'deepseek',
        model: 'deepseek-chat',
        operation: 'extraction',
        success: false,
        durationMs: Date.now() - dsStart,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        documentLength: documentText?.length ?? 0,
        userId: req.headers['x-user-id'] as string | undefined,
        errorCode,
        errorMessage: message.substring(0, 200),
      })

      if (classified instanceof BillingError) {
        alertBilling('DeepSeek', message, {
          requestId,
          fallbackReason: errorCode,
          phaseTiming,
        }).catch(() => {})
      }

      // All providers failed — return error
      log.info('Extraction completed', {
        requestId,
        finalProvider: 'deepseek',
        promptVersion,
        degradedReason,
        totalDurationMs: Date.now() - startTime,
        success: false,
        errorCode,
      })

      if (classified instanceof BillingError) {
        return res.status(503).json({
          error: 'Extraction unavailable — AI provider billing exhausted',
          code: 'EXTRACTION_UNAVAILABLE_BILLING',
          details: message,
          elapsedMs: Date.now() - startTime,
          phaseTiming,
          requestId,
          timestamp: new Date().toISOString(),
        })
      }

      return res.status(500).json({
        error: 'Extraction failed',
        code: errorCode,
        details: message,
        elapsedMs: Date.now() - startTime,
        phaseTiming,
        requestId,
        timestamp: new Date().toISOString(),
      })
    }
  }
)

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

    // Fire alert for non-transient OCR errors so operators know immediately
    if (code === 'INVALID_API_KEY' || code === 'API_NOT_ENABLED' || code === 'BILLING_ERROR') {
      dispatchAlert({
        severity: 'error',
        category: 'api_error',
        title: 'Google Cloud Vision OCR Failed — ' + code,
        message: `Cloud Vision OCR rejected with ${code}: ${message.slice(0, 300)}`,
        provider: 'google_vision',
        dedupKey: 'ocr:vision:' + code,
      }).catch(() => {})
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

      // Fire alert for non-transient Document AI errors
      if (code === 'PERMISSION_DENIED' || code === 'PROCESSOR_NOT_FOUND') {
        dispatchAlert({
          severity: 'error',
          category: 'api_error',
          title: 'Document AI Failed — ' + code,
          message: `Document AI OCR rejected with ${code}: ${message.slice(0, 300)}`,
          provider: 'google_document_ai',
          dedupKey: 'ocr:document-ai:' + code,
        }).catch(() => {})
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

      // Fire alert for non-transient Gemini OCR failures
      if (code === 'AUTH_FAILED') {
        dispatchAlert({
          severity: 'error',
          category: 'api_error',
          title: 'Gemini OCR Failed — ' + code,
          message: `Gemini OCR rejected with ${code}: ${message.slice(0, 300)}`,
          provider: 'gemini',
          dedupKey: 'ocr:gemini:' + code,
        }).catch(() => {})
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
