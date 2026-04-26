import env from '@/lib/env'

import type { OpenAI } from 'openai'
import type Anthropic from '@anthropic-ai/sdk'

// Lazy-loaded SDK instances (only imported when needed)
let cachedOpenAI: OpenAI | null = null
let cachedAnthropic: Anthropic | null = null

// Environment variables for AI providers
const OPENAI_API_KEY = env.config.openaiKey
const ANTHROPIC_API_KEY = env.config.anthropicKey
const GOOGLE_CLOUD_API_KEY = env.config.googleCloudKey

// API key storage key (for user-configured keys)
const STORAGE_KEYS = {
  OPENAI: 'insurai_openai_key',
  ANTHROPIC: 'insurai_anthropic_key',
  GOOGLE_CLOUD: 'insurai_google_cloud_key',
} as const

/**
 * Check if the secure API proxy is configured
 * When enabled, API calls go through the backend server instead of directly from browser
 */
export function isProxyConfigured(): boolean {
  return env.hasProxy
}

/**
 * Get the API proxy URL
 * In production, auto-detects from window.location.origin if not explicitly set
 */
export function getProxyUrl(): string | null {
  return env.proxyUrl
}

/**
 * Check which providers are available via the proxy
 * Makes a request to the health endpoint
 */
export async function checkProxyProviders(): Promise<{
  openai: boolean
  anthropic: boolean
  google: boolean
} | null> {
  const proxyUrl = getProxyUrl()
  if (!proxyUrl) return null

  try {
    const response = await fetch(`${proxyUrl}/api/ai/providers`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Get API key from environment or localStorage
 */
function getApiKey(envKey: string | null | undefined, storageKey: string): string | null {
  // First check environment variable
  if (envKey && envKey !== 'sk-...' && envKey !== 'sk-ant-...') {
    return envKey
  }
  // Then check localStorage
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored && stored !== 'sk-...' && stored !== 'sk-ant-...') {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return null
}

// Valid provider names
const VALID_PROVIDERS = ['openai', 'anthropic', 'google'] as const
type ValidProvider = (typeof VALID_PROVIDERS)[number]

/**
 * Check if a specific AI provider is configured
 * Returns true if either:
 * 1. API proxy is configured (keys are on server)
 * 2. Direct API key is available (development mode)
 */
export function isProviderConfigured(provider: 'openai' | 'anthropic' | 'google'): boolean {
  // Validate provider is a known value
  if (!VALID_PROVIDERS.includes(provider as ValidProvider)) {
    return false
  }

  // If proxy is configured, assume known providers are available
  // (actual availability will be checked at runtime)
  if (isProxyConfigured()) {
    return true
  }

  // Fall back to direct key check
  switch (provider) {
    case 'openai':
      return !!getApiKey(OPENAI_API_KEY, STORAGE_KEYS.OPENAI)
    case 'anthropic':
      return !!getApiKey(ANTHROPIC_API_KEY, STORAGE_KEYS.ANTHROPIC)
    case 'google':
      return !!getApiKey(GOOGLE_CLOUD_API_KEY, STORAGE_KEYS.GOOGLE_CLOUD)
    default:
      return false
  }
}

/**
 * Check if any AI extraction is configured
 * Returns true if either:
 * 1. API proxy is configured (server handles AI calls)
 * 2. Direct API keys are available (frontend has keys - not recommended for production)
 */
export function isAIConfigured(): boolean {
  // If proxy is configured, AI should be available via the proxy
  if (isProxyConfigured()) {
    return true
  }
  // Fallback to direct key check (for local development without server)
  return isProviderConfigured('openai') || isProviderConfigured('anthropic')
}

/**
 * Check if OCR is available (Google Document AI)
 * Returns true if proxy is configured (server handles OCR) or direct key is available
 */
export function isOCRConfigured(): boolean {
  if (isProxyConfigured()) {
    return true // Assume proxy has OCR capability
  }
  return isProviderConfigured('google')
}

/**
 * Get list of configured providers
 */
export function getConfiguredProviders(): ('openai' | 'anthropic')[] {
  const providers: ('openai' | 'anthropic')[] = []
  if (isProviderConfigured('openai')) providers.push('openai')
  if (isProviderConfigured('anthropic')) providers.push('anthropic')
  return providers
}

/**
 * Get OpenAI client instance (for direct API access in development)
 * In production, use extractViaProxy() instead
 * @returns Promise that resolves to OpenAI client or null
 */
export async function getOpenAIClient(): Promise<OpenAI | null> {
  // Don't return client if proxy is configured - use proxy instead
  if (isProxyConfigured()) {
    console.warn('OpenAI client requested but proxy is configured. Use extractViaProxy() instead.')
    return null
  }

  const apiKey = getApiKey(OPENAI_API_KEY, STORAGE_KEYS.OPENAI)
  if (!apiKey) {
    return null
  }

  // Return cached instance if available
  if (cachedOpenAI) {
    return cachedOpenAI
  }

  // Dynamic import to avoid bundling when not needed
  const { default: OpenAI } = await import('openai')
  cachedOpenAI = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true, // For demo only - use backend proxy in production
  })
  return cachedOpenAI
}

/**
 * Get Anthropic client instance (for direct API access in development)
 * In production, use extractViaProxy() instead
 * @returns Promise that resolves to Anthropic client or null
 */
export async function getAnthropicClient(): Promise<Anthropic | null> {
  // Don't return client if proxy is configured - use proxy instead
  if (isProxyConfigured()) {
    console.warn(
      'Anthropic client requested but proxy is configured. Use extractViaProxy() instead.'
    )
    return null
  }

  const apiKey = getApiKey(ANTHROPIC_API_KEY, STORAGE_KEYS.ANTHROPIC)
  if (!apiKey) {
    return null
  }

  // Return cached instance if available
  if (cachedAnthropic) {
    return cachedAnthropic
  }

  // Dynamic import to avoid bundling when not needed
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  cachedAnthropic = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })
  return cachedAnthropic
}

/**
 * Get Google Cloud API key for Document AI (for direct API access in development)
 * In production, use ocrViaProxy() instead
 */
export function getGoogleCloudApiKey(): string | null {
  // Don't return key if proxy is configured - use proxy instead
  if (isProxyConfigured()) {
    console.warn(
      'Google Cloud API key requested but proxy is configured. Use ocrViaProxy() instead.'
    )
    return null
  }

  return getApiKey(GOOGLE_CLOUD_API_KEY, STORAGE_KEYS.GOOGLE_CLOUD)
}

/**
 * Extract policy data via secure backend proxy
 * Uses unified /api/ai/extract endpoint with automatic Anthropic->OpenAI fallback
 * The 'provider' parameter is kept for backward compatibility but is now ignored
 * (the server decides which provider to use with automatic fallback)
 */
export async function extractViaProxy(
  _provider: 'openai' | 'anthropic',
  documentText: string,
  systemPrompt: string,
  userId?: string,
  signal?: AbortSignal,
  _retryCount = 0
): Promise<{
  success: boolean
  data?: Record<string, unknown>
  error?: string
  provider?: 'openai' | 'anthropic'
  fallback?: boolean
  fallbackReason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
  // Observability fields
  requestId?: string
  route?: string
  fallbackChain?: Array<{
    provider: string
    success: boolean
    duration_ms?: number
    error?: string
    error_code?: string
  }>
  // Diagnostic: server-side phase timing
  serverPhaseTiming?: Record<string, number>
  serverElapsedMs?: number
  // Diagnostic: error classification
  errorCode?: string
  // Diagnostic: client-side elapsed time (for catch-block errors)
  clientElapsedMs?: number
}> {
  const proxyUrl = getProxyUrl()
  if (!proxyUrl) {
    return { success: false, error: 'Proxy not configured' }
  }

  const fetchStartMs = performance.now()

  // Build a combined signal: respect caller's signal (if any) AND enforce a hard timeout.
  // The server has a 125s budget; 135s gives 10s for network/serialization overhead.
  // Default 135_000 — configurable via app_settings ai.client_fetch_timeout_ms
  let FETCH_TIMEOUT_MS = 135_000
  try {
    const { getAIConfig } = await import('@/lib/config')
    const aiCfg = await getAIConfig()
    FETCH_TIMEOUT_MS = aiCfg.clientFetchTimeoutMs
  } catch {
    // Keep default
  }

  try {
    console.warn('[extractViaProxy] Calling unified endpoint:', `${proxyUrl}/api/ai/extract`, {
      attempt: _retryCount + 1,
      docLength: documentText?.length ?? 0,
    })

    // Use unified endpoint with automatic fallback
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Request SSE mode to keep Railway/PaaS connections alive with keepalive pings
      Accept: 'text/event-stream',
    }
    if (userId) headers['x-user-id'] = userId
    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

    const response = await fetch(`${proxyUrl}/api/ai/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        documentText,
        systemPrompt,
      }),
      signal: effectiveSignal,
    })

    const elapsedMs = Math.round(performance.now() - fetchStartMs)
    const contentType = response.headers.get('content-type') || ''

    // ── SSE Response Handling ────────────────────────────────────────
    // When the server supports SSE, it sends:
    //   :keepalive <timestamp>     ← periodic pings (ignored)
    //   event: status\ndata: 200   ← HTTP status code
    //   event: result\ndata: {...} ← final JSON payload
    // This keeps Railway's 30s gateway timeout from killing the connection.
    if (contentType.includes('text/event-stream') && response.body) {
      console.warn('[extractViaProxy] Using SSE mode for long-lived extraction')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sseStatus = 200
      let resultData: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE events (terminated by \n\n)
        let eventEnd: number
        while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
          const eventBlock = buffer.slice(0, eventEnd)
          buffer = buffer.slice(eventEnd + 2)

          // Skip keepalive comments (lines starting with :)
          if (eventBlock.startsWith(':')) continue

          // Parse SSE event
          const lines = eventBlock.split('\n')
          let eventType = ''
          let eventData = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7)
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6)
            }
          }

          if (eventType === 'status') {
            sseStatus = parseInt(eventData, 10) || 200
          } else if (eventType === 'result') {
            resultData = eventData
          }
        }
      }

      // Process the final result
      if (!resultData) {
        console.error('[extractViaProxy] SSE stream ended without result event')
        return { success: false, error: 'Server stream ended without sending results' }
      }

      const result = JSON.parse(resultData)
      console.warn('[extractViaProxy] SSE result:', {
        success: result.success,
        hasData: !!result.data,
        provider: result.provider,
        sseStatus,
        elapsedMs: Math.round(performance.now() - fetchStartMs),
      })

      if (sseStatus >= 400 || !result.success) {
        let errorMsg = ''
        if (sseStatus === 502 || sseStatus === 504) {
          errorMsg = `Server timed out or is busy (${sseStatus}). If you are using a free tier hosting provider, the AI extraction may have exceeded the execution limit. Try a shorter document.`
        } else {
          errorMsg = result.details
            ? `${result.error || 'Server error'}: ${result.details}`
            : result.error || `HTTP ${sseStatus}`
        }
        return {
          success: false,
          error: errorMsg,
          errorCode: result.code,
          requestId: result.requestId,
          serverPhaseTiming: result.phaseTiming,
          serverElapsedMs: result.elapsedMs,
          fallbackChain: result.fallbackChain,
        }
      }

      if (!result.data) {
        return {
          success: false,
          error: 'Server returned success but no data',
          requestId: result.requestId,
          serverElapsedMs: result.elapsedMs,
        }
      }

      return {
        success: true,
        data: result.data,
        provider: result.provider,
        fallback: result.fallback,
        ...(result.fallbackReason && { fallbackReason: result.fallbackReason }),
        usage: result.usage,
        requestId: result.requestId,
        route: result.route,
        fallbackChain: result.fallbackChain,
        serverPhaseTiming: result.phaseTiming,
        serverElapsedMs: result.elapsedMs,
      }
    }

    // ── Plain JSON Response (fallback / no SSE support) ──────────────
    console.warn('[extractViaProxy] Response status:', response.status, response.statusText, {
      elapsedMs,
    })

    const result = await response.json()

    console.warn('[extractViaProxy] Parsed response:', {
      success: result.success,
      hasData: !!result.data,
      provider: result.provider,
      fallback: result.fallback,
      error: result.error,
      elapsedMs,
    })

    if (!response.ok) {
      let errorMsg = ''

      if (response.status === 502 || response.status === 504) {
        errorMsg = `Server timed out or is busy (${response.status}). If you are using a free tier hosting provider, the AI extraction may have exceeded the execution limit. Try a shorter document.`
      } else {
        errorMsg = result.details
          ? `${result.error || 'Server error'}: ${result.details}`
          : result.error || `HTTP ${response.status}`
      }

      console.error('[extractViaProxy] HTTP error:', errorMsg, {
        code: result.code,
        status: response.status,
        elapsedMs,
      })
      return {
        success: false,
        error: errorMsg,
        // Thread server diagnostics so the UI can display failure context
        errorCode: result.code,
        requestId: result.requestId,
        serverPhaseTiming: result.phaseTiming,
        serverElapsedMs: result.elapsedMs,
        fallbackChain: result.fallbackChain,
      }
    }

    // Check if result.data exists and has expected structure
    if (!result.data) {
      console.error('[extractViaProxy] Server returned success but no data!', { elapsedMs })
      return {
        success: false,
        error: 'Server returned success but no data',
        requestId: result.requestId,
        serverElapsedMs: result.elapsedMs,
      }
    }

    return {
      success: true,
      data: result.data,
      provider: result.provider,
      fallback: result.fallback,
      ...(result.fallbackReason && { fallbackReason: result.fallbackReason }),
      usage: result.usage,
      // Observability: pass through server-side tracking data
      requestId: result.requestId,
      route: result.route,
      fallbackChain: result.fallbackChain,
      // Diagnostic: server-side phase timing breakdown
      serverPhaseTiming: result.phaseTiming,
      serverElapsedMs: result.elapsedMs,
    }
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - fetchStartMs)
    const rawMessage = error instanceof Error ? error.message : 'Network error'
    const isAbort = error instanceof Error && error.name === 'AbortError'

    // Check if this is a transient network error eligible for retry
    const isNetworkError =
      rawMessage === 'Load failed' ||
      rawMessage === 'Failed to fetch' ||
      rawMessage === 'NetworkError when attempting to fetch resource.'

    // Retry once for transient network errors (handles mobile LTE drops)
    if (_retryCount === 0 && isNetworkError && !isAbort && !signal?.aborted) {
      console.warn(`[extractViaProxy] Network error after ${elapsedMs}ms, retrying in 2s...`, {
        rawMessage,
        attempt: 1,
      })
      await new Promise((r) => setTimeout(r, 2000))
      return extractViaProxy(_provider, documentText, systemPrompt, userId, signal, 1)
    }

    // Enhance error with timing and context
    let enhancedMessage = rawMessage
    const isTimeout = isAbort && elapsedMs >= FETCH_TIMEOUT_MS - 5000
    if (isNetworkError) {
      const retryNote = _retryCount > 0 ? ' after retry' : ''
      enhancedMessage = `${rawMessage} (after ${elapsedMs}ms${retryNote} — network request to ${proxyUrl}/api/ai/extract failed — server may be restarting, timed out, or unreachable)`
    } else if (isTimeout) {
      enhancedMessage = `Extraction timed out after ${Math.round(elapsedMs / 1000)}s — the AI service may be busy. Please try again.`
    } else if (isAbort) {
      enhancedMessage = `Request was cancelled (after ${elapsedMs}ms)`
    }
    console.error('[extractViaProxy] Exception:', enhancedMessage, {
      originalError: rawMessage,
      proxyUrl,
      elapsedMs,
      attempt: _retryCount + 1,
      isAbort,
    })
    return {
      success: false,
      error: enhancedMessage,
      // Client-side diagnostic fields for UI display
      errorCode: isTimeout ? 'CLIENT_FETCH_TIMEOUT' : isAbort ? 'CLIENT_ABORT' : 'NETWORK_ERROR',
      clientElapsedMs: elapsedMs,
    }
  }
}

/**
 * Extract policy data via secure backend proxy with automatic fallback
 * Uses unified /api/ai/extract endpoint that tries Anthropic first, then OpenAI
 */
export async function extractWithFallback(
  documentText: string,
  systemPrompt?: string,
  policyType?: string
): Promise<{
  success: boolean
  data?: Record<string, unknown>
  error?: string
  provider?: 'openai' | 'anthropic'
  fallback?: boolean
  usage?: { input_tokens?: number; output_tokens?: number }
}> {
  const proxyUrl = getProxyUrl()
  if (!proxyUrl) {
    return { success: false, error: 'Proxy not configured' }
  }

  try {
    const response = await fetch(`${proxyUrl}/api/ai/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentText,
        systemPrompt,
        policyType,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`,
      }
    }

    return {
      success: true,
      data: result.data,
      provider: result.provider,
      fallback: result.fallback,
      usage: result.usage,
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Network error'
    let enhancedMessage = rawMessage
    if (
      rawMessage === 'Load failed' ||
      rawMessage === 'Failed to fetch' ||
      rawMessage === 'NetworkError when attempting to fetch resource.'
    ) {
      enhancedMessage = `${rawMessage} (network request to ${proxyUrl}/api/ai/extract failed — server may be restarting, timed out, or unreachable)`
    }
    return {
      success: false,
      error: enhancedMessage,
    }
  }
}

/**
 * Perform OCR via secure backend proxy
 */
export async function ocrViaProxy(imageBase64: string): Promise<{
  success: boolean
  data?: { text: string; confidence: number; pageCount: number }
  error?: string
}> {
  const proxyUrl = getProxyUrl()
  if (!proxyUrl) {
    return { success: false, error: 'Proxy not configured' }
  }

  try {
    const response = await fetch(`${proxyUrl}/api/ai/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`,
      }
    }

    return {
      success: true,
      data: result.data,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

/**
 * AI model configuration
 */
export const AI_CONFIG = {
  // OpenAI models
  openai: {
    extractionModel: 'gpt-4o' as const,
    backupModel: 'gpt-4o-mini' as const,
  },

  // Anthropic models
  anthropic: {
    extractionModel: 'claude-3-7-sonnet-20250219' as const,
    backupModel: 'claude-3-5-haiku-latest' as const,
  },

  // Max tokens for extraction response
  maxTokens: 4096,

  // Temperature for more deterministic outputs
  temperature: 0.1,

  // Hard reject threshold — below this, extraction is considered too unreliable
  minConfidence: 0.4,

  // Warning threshold — below this, results shown with a low-confidence warning
  warningConfidence: 0.7,

  // Multi-model consensus settings
  consensus: {
    // Require agreement between models for high-confidence extraction
    enabled: true,
    // Minimum agreement threshold (0-1)
    agreementThreshold: 0.8,
    // Fields to check for consensus
    consensusFields: ['policyNumber', 'provider', 'premium', 'startDate', 'endDate'] as const,
  },
} as const

export type AIProvider = 'openai' | 'anthropic'
export type ConsensusField = (typeof AI_CONFIG.consensus.consensusFields)[number]
