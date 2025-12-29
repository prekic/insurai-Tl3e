import OpenAI from 'openai'

// Environment variable for OpenAI API key
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

/**
 * Check if AI extraction is configured
 */
export function isAIConfigured(): boolean {
  return !!OPENAI_API_KEY && OPENAI_API_KEY !== 'sk-...'
}

/**
 * Get OpenAI client instance
 * Note: In production, API calls should go through a backend to protect the API key
 */
export function getOpenAIClient(): OpenAI | null {
  if (!isAIConfigured()) {
    return null
  }

  return new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true, // For demo only - use backend proxy in production
  })
}

/**
 * AI model configuration
 */
export const AI_CONFIG = {
  // Primary model for document understanding
  extractionModel: 'gpt-4o' as const,

  // Backup model for simpler tasks
  backupModel: 'gpt-4o-mini' as const,

  // Max tokens for extraction response
  maxTokens: 4096,

  // Temperature for more deterministic outputs
  temperature: 0.1,

  // Minimum confidence threshold
  minConfidence: 0.7,
} as const
