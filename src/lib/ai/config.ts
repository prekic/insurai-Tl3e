import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

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

/**
 * Check if a specific AI provider is configured
 */
export function isProviderConfigured(provider: 'openai' | 'anthropic' | 'google'): boolean {
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
 * Get OpenAI client instance
 * Note: In production, API calls should go through a backend to protect the API key
 */
export function getOpenAIClient(): OpenAI | null {
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
 * Get Anthropic client instance
 * Note: In production, API calls should go through a backend to protect the API key
 */
export function getAnthropicClient(): Anthropic | null {
  const apiKey = getApiKey(ANTHROPIC_API_KEY, STORAGE_KEYS.ANTHROPIC)
  if (!apiKey) {
    return null
  }

  return new Anthropic({
    apiKey,
    // Note: Anthropic SDK doesn't need dangerouslyAllowBrowser flag
  })
}

/**
 * Get Google Cloud API key for Document AI
 */
export function getGoogleCloudApiKey(): string | null {
  return getApiKey(GOOGLE_CLOUD_API_KEY, STORAGE_KEYS.GOOGLE_CLOUD)
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
