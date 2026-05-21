/**
 * Extraction Pipeline
 *
 * Clean provider-loop pattern for insurance policy extraction.
 * Iterates through providers (Anthropic → OpenAI → DeepSeek) with
 * output validation at each step.
 *
 * The pipeline accepts factory functions for each provider call so that
 * the actual API client setup and provider-specific logic can remain
 * in extraction.ts.
 *
 * This is a refactored replacement for the inline Anthropic→OpenAI→DeepSeek
 * fallback chain in the /extract handler. The primary Anthropic path and
 * multi-LLM debate pipeline remain untouched.
 */

import {
  classifyDocument,
  checkTypeConsistency,
  type ClassificationResult,
} from './classifier-gate.js'
import { validateOutput, type ValidationResult } from './output-validator.js'
import { alertBilling, alertProviderFallback, alertAllProvidersFailed } from './alert-service.js'
import { logger } from './logger.js'

const log = logger.child('extraction-pipeline')

// ── Error types (mirror extraction.ts so the pipeline can classify errors) ──

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'BillingError'
  }
}

export class TransientError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'TransientError'
  }
}

/**
 * Classify a provider error into BillingError, TransientError, or the original error.
 * Billing = credit/quota/precondition failure (needs operator action).
 * Transient = rate-limit/timeout/overload (should retry next provider).
 */
export function classifyProviderError(
  error: unknown,
  provider: string,
  _requestId?: string
): Error {
  const message = error instanceof Error ? error.message : String(error)

  // Billing/quota errors (operator must act)
  const billingPatterns = [
    'credit',
    'billing',
    'insufficient_quota',
    'quota',
    'FAILED_PRECONDITION',
    'account_balance',
    'insufficient',
    'rate limit exceeded for org',
    'exceeded your current quota',
    'Insufficient',
    'payment required',
  ]
  for (const p of billingPatterns) {
    if (message.toLowerCase().includes(p)) {
      return new BillingError(message, provider, error)
    }
  }

  // AbortError = SDK timeout (transient)
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new TransientError(message, provider, error)
  }

  // Auth errors usually transient
  if (error instanceof Error && error.name === 'AuthenticationError') {
    return new TransientError(message, provider, error)
  }

  // Transient patterns: rate limit, 429, overloaded, 529, network timeouts
  const transientPatterns = [
    '429',
    '529',
    '503',
    'rate_limit',
    'rate limit',
    'overloaded',
    'overloaded_error',
    'too many requests',
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'context_length_exceeded',
    'bad gateway',
    'service unavailable',
    'internal server error',
    'Please try again',
    'try again later',
  ]
  for (const p of transientPatterns) {
    if (message.toLowerCase().includes(p.toLowerCase())) {
      return new TransientError(message, provider, error)
    }
  }

  // Default: return original
  if (error instanceof Error) return error
  return new Error(String(error))
}

// ── Interfaces ──

export type ProviderName = 'anthropic' | 'openai' | 'deepseek'

export interface ProviderUsage {
  inputTokens: number
  outputTokens: number
  cost: number
  model: string
}

export interface FallbackChainEntry {
  provider: string
  success: boolean
  errorCode?: string
  reasons?: string[]
}

export interface ExtractionResult {
  data: unknown
  provider: ProviderName
  promptVersion?: string
  degradedReason?: string
  usage: ProviderUsage
  fallbackChain: FallbackChainEntry[]
  validationFailures?: string[]
  durationMs: number
  classification: ClassificationResult
}

export interface ProviderCallConfig {
  model?: string
  temperature?: number
  maxTokens?: number
}

/**
 * Signature for a factory function that calls a single provider.
 * The pipeline passes the system prompt, user message, and config.
 * Returns the raw content string and usage metadata.
 */
export type ProviderCallFn = (
  systemPrompt: string,
  userMessage: string,
  config: ProviderCallConfig
) => Promise<{
  content: string
  usage: ProviderUsage
}>

export interface ProviderCallbacks {
  anthropic: ProviderCallFn | null
  openai: ProviderCallFn | null
  deepseek: ProviderCallFn | null
}

/**
 * Alert callbacks — the pipeline fires these so the caller can plug in
 * their own alerting (e.g. to Sentry, admin notifications, record metrics).
 */
export interface PipelineAlerters {
  onBillingError?: (
    provider: string,
    message: string,
    details?: Record<string, unknown>
  ) => Promise<void>
  onProviderFallback?: (
    provider: string,
    reason: string,
    requestId: string,
    details?: Record<string, unknown>
  ) => Promise<void>
  onAllProvidersFailed?: (
    reason: string,
    requestId: string,
    providerChain: string,
    details?: Record<string, unknown>
  ) => Promise<void>
}

/**
 * Options for the extraction pipeline.
 */
export interface PipelineOptions {
  /** Request ID for logging / tracing */
  requestId: string
  /** Expected document type hint */
  policyType?: string
  /** Prompt version tag for metadata */
  promptVersion?: string
  /** Alert callbacks (defaults to alert-service module) */
  alerters?: PipelineAlerters
  /** Classification override (skips classifyDocument if provided) */
  classification?: ClassificationResult
  /** Minimum coverages for output validation by policy type */
  minCoverages?: number
}

// ── Default alerters (use the alert-service module) ──

const defaultAlerters: PipelineAlerters = {
  onBillingError: async (provider, message, details) => {
    await alertBilling(provider, message, details)
  },
  onProviderFallback: async (provider, reason, requestId, details) => {
    await alertProviderFallback(provider, reason, requestId, details)
  },
  onAllProvidersFailed: async (reason, requestId, providerChain, details) => {
    await alertAllProvidersFailed(reason, requestId, providerChain, details)
  },
}

// ── Validation helpers ──

function getMinCoveragesForType(
  classification: ClassificationResult,
  explicitMin?: number
): number {
  if (explicitMin !== undefined) return explicitMin
  switch (classification.type) {
    case 'kasko':
      return 5
    case 'home':
      return 3
    case 'traffic':
      return 2
    default:
      return 2
  }
}

// ── Pipeline ──

export type PipelineResult =
  | {
      success: true
      result: ExtractionResult
    }
  | {
      success: false
      error: string
      errorCode: string
      degradedReason?: string
      fallbackChain: FallbackChainEntry[]
      durationMs: number
    }

/**
 * Run the extraction pipeline with provider fallback.
 *
 * @param documentText   - The OCR'd document text
 * @param systemPrompt   - System prompt for all providers (OpenAI/DeepSeek variant)
 * @param userMessage    - User message (typically the document text)
 * @param providers      - Provider callback factories (null = unavailable)
 * @param options        - Pipeline options
 * @param config         - Provider call config (model, temperature, maxTokens)
 *
 * @returns PipelineResult — either a successful ExtractionResult or a failure with details.
 *
 * Provider iteration order: anthropic → openai → deepseek.
 * If a provider succeeds but the output fails validation, the next provider is tried.
 * If all providers fail, the result reflects the final error.
 */
export async function runExtractionPipeline(
  documentText: string,
  systemPrompt: string,
  userMessage: string,
  providers: ProviderCallbacks,
  options: PipelineOptions,
  config: ProviderCallConfig = {}
): Promise<PipelineResult> {
  const {
    requestId,
    policyType,
    promptVersion,
    alerters = defaultAlerters,
    classification: classificationOverride,
  } = options
  const startTime = Date.now()

  // 1. Classify the document (or use override)
  const classification = classificationOverride ?? classifyDocument(documentText)
  const minCoverages = getMinCoveragesForType(classification, options.minCoverages)

  const providerOrder: ProviderName[] = ['anthropic', 'openai', 'deepseek']

  let degradedReason: string | undefined
  let lastError: Error | undefined
  let lastErrorCode: string | undefined
  const fallbackChain: FallbackChainEntry[] = []

  // 2. Iterate over providers
  for (const provider of providerOrder) {
    const callFn = providers[provider]
    if (!callFn) {
      // Provider not configured — log as failure and skip
      fallbackChain.push({
        provider,
        success: false,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
        reasons: ['Provider client not available'],
      })
      continue
    }

    log.info('[pipeline] Trying provider', {
      requestId,
      provider,
      promptVersion,
      iteration: providerOrder.indexOf(provider) + 1,
      ofTotal: providerOrder.length,
    })

    try {
      const result = await callFn(systemPrompt, userMessage, config)

      // Parse the JSON content
      let parsedData: unknown
      try {
        parsedData = JSON.parse(result.content)
      } catch {
        log.warn('[pipeline] Provider returned invalid JSON', {
          requestId,
          provider,
          contentPreview: result.content.substring(0, 200),
        })
        fallbackChain.push({
          provider,
          success: false,
          errorCode: 'INVALID_JSON',
          reasons: ['AI returned invalid JSON'],
        })
        continue
      }

      // 3. Validate output deterministically
      const parsedRecord = parsedData as Record<string, unknown>
      const validation: ValidationResult = validateOutput(parsedRecord, documentText, policyType, {
        minCoverages,
      })

      if (!validation.pass) {
        const reasons = validation.checks.filter((c) => !c.pass).map((c) => c.message)

        log.warn('[pipeline] Provider output rejected by validation', {
          requestId,
          provider,
          reasons,
          summary: validation.summary,
        })

        // If this is the last provider, accept the result with a degraded marker
        const isLastProvider = providerOrder.indexOf(provider) === providerOrder.length - 1
        if (isLastProvider) {
          degradedReason = degradedReason || 'all_providers_failed_validation'
          log.info('[pipeline] Last provider — accepting validated-failed output', {
            requestId,
            provider,
            validationSummary: validation.summary,
          })

          fallbackChain.push({
            provider,
            success: true,
            errorCode: 'VALIDATION_FAILED',
            reasons: ['Output validation failed, accepted as degraded'],
          })

          return {
            success: true,
            result: {
              data: parsedData,
              provider,
              promptVersion,
              degradedReason,
              usage: result.usage,
              fallbackChain,
              validationFailures: reasons,
              durationMs: Date.now() - startTime,
              classification,
            },
          }
        }

        // Not the last provider — fall back to next
        fallbackChain.push({
          provider,
          success: false,
          errorCode: 'VALIDATION_FAILED',
          reasons,
        })
        continue
      }

      // 4. Check type consistency (advisory — doesn't cause fallback)
      const typeCheck = checkTypeConsistency(
        classification,
        parsedRecord.policyType as string | undefined
      )
      if (!typeCheck.consistent) {
        log.warn('[pipeline] Policy type mismatch (advisory)', {
          requestId,
          provider,
          mismatch: typeCheck.mismatchDescription,
        })
      }

      // 5. Success — return result
      log.info('[pipeline] Provider succeeded', {
        requestId,
        provider,
        coverageCount: (parsedRecord as any).coverages?.length ?? 0,
        validationPassed: true,
        durationMs: Date.now() - startTime,
      })

      fallbackChain.push({
        provider,
        success: true,
      })

      return {
        success: true,
        result: {
          data: parsedData,
          provider,
          promptVersion,
          degradedReason,
          usage: result.usage,
          fallbackChain,
          durationMs: Date.now() - startTime,
          classification,
        },
      }
    } catch (err) {
      // Classify the error
      const classified = classifyProviderError(err, provider, requestId)
      const errorMessage = err instanceof Error ? err.message : String(err)

      // Build error code
      let errorCode: string
      if (classified instanceof BillingError) {
        errorCode = `${provider.toUpperCase()}_BILLING_ERROR`
        // Track degraded reason
        if (!degradedReason) degradedReason = `${provider}_billing_error`
      } else if (classified instanceof TransientError) {
        errorCode = `${provider.toUpperCase()}_TRANSIENT_ERROR`
        if (!degradedReason) degradedReason = `${provider}_transient_error`
      } else {
        errorCode = `${provider.toUpperCase()}_ERROR`
        if (!degradedReason) degradedReason = `${provider}_error`
      }

      log.warn('[pipeline] Provider failed', {
        requestId,
        provider,
        errorType: classified.name,
        errorCode,
        message: errorMessage.substring(0, 200),
      })

      // Fire alerts
      if (classified instanceof BillingError) {
        await alerters.onBillingError?.(provider, errorMessage, { requestId, errorCode })
      } else {
        await alerters.onProviderFallback?.(provider, errorCode, requestId, { errorMessage })
      }

      lastError = classified
      lastErrorCode = errorCode
      fallbackChain.push({
        provider,
        success: false,
        errorCode,
        reasons: [errorMessage.substring(0, 200)],
      })
    }
  }

  // 6. All providers failed
  const durationMs = Date.now() - startTime

  // Fire all-providers-failed alert
  const providerChainStr = providerOrder.join('→')
  await alerters.onAllProvidersFailed?.(
    lastError?.message || 'All providers exhausted',
    requestId,
    providerChainStr,
    { fallbackChain }
  )

  log.error('[pipeline] All providers failed', {
    requestId,
    lastError: lastError?.message?.substring(0, 200),
    lastErrorCode,
    degradedReason,
    fallbackChain,
    durationMs,
  })

  // If all were billing errors, return 503-compatible result
  const allBilling = fallbackChain.every(
    (e) => !e.success && e.errorCode?.includes('BILLING_ERROR')
  )

  if (allBilling) {
    return {
      success: false,
      error: 'All AI providers exhausted (billing/credit) — operator action required',
      errorCode: 'ALL_PROVIDERS_BILLING_ERROR',
      degradedReason,
      fallbackChain,
      durationMs,
    }
  }

  return {
    success: false,
    error: lastError?.message || 'All AI providers failed',
    errorCode: lastErrorCode || 'ALL_PROVIDERS_FAILED',
    degradedReason,
    fallbackChain,
    durationMs,
  }
}
