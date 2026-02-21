import env from '@/lib/env'

// Lazy-loaded SDK instances (only imported when needed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedOpenAI: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedAnthropic: any = null

// Environment variables for AI providers
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const GOOGLE_CLOUD_API_KEY = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY

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
function getApiKey(envKey: string | undefined, storageKey: string): string | null {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOpenAIClient(): Promise<any> {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAnthropicClient(): Promise<any> {
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
  userId?: string
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
  fallbackChain?: Array<{ provider: string; success: boolean; duration_ms?: number; error?: string; error_code?: string }>
}> {
  const proxyUrl = getProxyUrl()
  if (!proxyUrl) {
    return { success: false, error: 'Proxy not configured' }
  }

  try {
    console.warn('[extractViaProxy] Calling unified endpoint:', `${proxyUrl}/api/ai/extract`)

    // Use unified endpoint with automatic fallback
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (userId) headers['x-user-id'] = userId
    const response = await fetch(`${proxyUrl}/api/ai/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        documentText,
        systemPrompt,
      }),
    })

    console.warn('[extractViaProxy] Response status:', response.status, response.statusText)

    const result = await response.json()

    console.warn('[extractViaProxy] Parsed response:', {
      success: result.success,
      hasData: !!result.data,
      dataType: result.data ? typeof result.data : 'undefined',
      dataKeys: result.data && typeof result.data === 'object' ? Object.keys(result.data).slice(0, 15) : [],
      provider: result.provider,
      fallback: result.fallback,
      error: result.error,
      hasUsage: !!result.usage,
    })

    if (!response.ok) {
      const errorMsg = result.details
        ? `${result.error || 'Server error'}: ${result.details}`
        : result.error || `HTTP ${response.status}`
      console.error('[extractViaProxy] HTTP error:', errorMsg, { code: result.code, status: response.status })
      return {
        success: false,
        error: errorMsg,
      }
    }

    // Check if result.data exists and has expected structure
    if (!result.data) {
      console.error('[extractViaProxy] Server returned success but no data!')
      return {
        success: false,
        error: 'Server returned success but no data',
      }
    }

    console.warn('[extractViaProxy] Returning successful result with data')
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
    }
  } catch (error) {
    console.error('[extractViaProxy] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
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
    extractionModel: 'claude-sonnet-4-20250514' as const,
    backupModel: 'claude-3-5-haiku-20241022' as const,
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
