import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

// Environment variables for AI providers
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const GOOGLE_CLOUD_API_KEY = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY

// API proxy configuration (for secure production use)
const API_PROXY_URL = import.meta.env.VITE_API_PROXY_URL

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
  return !!API_PROXY_URL
}

/**
 * Get the API proxy URL
 */
export function getProxyUrl(): string | null {
  return API_PROXY_URL || null
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
  if (!API_PROXY_URL) return null

  try {
    const response = await fetch(`${API_PROXY_URL}/api/ai/providers`, {
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
 */
export function isAIConfigured(): boolean {
  return isProviderConfigured('openai') || isProviderConfigured('anthropic')
}

/**
 * Check if OCR is available (Google Document AI)
 */
export function isOCRConfigured(): boolean {
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
 */
export function getOpenAIClient(): OpenAI | null {
  // Don't return client if proxy is configured - use proxy instead
  if (isProxyConfigured()) {
    console.warn('OpenAI client requested but proxy is configured. Use extractViaProxy() instead.')
    return null
  }

  const apiKey = getApiKey(OPENAI_API_KEY, STORAGE_KEYS.OPENAI)
  if (!apiKey) {
    return null
  }

  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true, // For demo only - use backend proxy in production
  })
}

/**
 * Get Anthropic client instance (for direct API access in development)
 * In production, use extractViaProxy() instead
 */
export function getAnthropicClient(): Anthropic | null {
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

  return new Anthropic({
    apiKey,
  })
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
 */
export async function extractViaProxy(
  provider: 'openai' | 'anthropic',
  documentText: string,
  systemPrompt: string
): Promise<{
  success: boolean
  data?: Record<string, unknown>
  error?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}> {
  const proxyUrl = getProxyUrl()
  if (!proxyUrl) {
    return { success: false, error: 'Proxy not configured' }
  }

  try {
    const response = await fetch(`${proxyUrl}/api/ai/extract/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentText,
        systemPrompt,
        model:
          provider === 'openai' ? AI_CONFIG.openai.extractionModel : AI_CONFIG.anthropic.extractionModel,
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

  // Minimum confidence threshold
  minConfidence: 0.7,

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
