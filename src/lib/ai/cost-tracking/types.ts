/**
 * AI Cost Tracking Types
 * Token-based pricing and usage tracking for AI API calls
 */

import type { AIProvider } from '@/lib/ai/config'

// =============================================================================
// Pricing Models (as of December 2024)
// =============================================================================

/**
 * Pricing per 1000 tokens for each provider/model
 */
export interface ModelPricing {
  inputPer1K: number // Cost per 1000 input tokens (USD)
  outputPer1K: number // Cost per 1000 output tokens (USD)
  contextLimit: number // Maximum context window in tokens
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI pricing
  'gpt-4o': {
    inputPer1K: 0.0025, // $2.50 per 1M input tokens
    outputPer1K: 0.01, // $10 per 1M output tokens
    contextLimit: 128000,
  },
  'gpt-5.4-mini': {
    inputPer1K: 0.00015, // $0.15 per 1M input tokens
    outputPer1K: 0.0006, // $0.60 per 1M output tokens
    contextLimit: 128000,
  },
  'gpt-4-turbo': {
    inputPer1K: 0.01, // $10 per 1M input tokens
    outputPer1K: 0.03, // $30 per 1M output tokens
    contextLimit: 128000,
  },

  // Anthropic Claude pricing
  'claude-3-5-sonnet-20241022': {
    inputPer1K: 0.003, // $3 per 1M input tokens
    outputPer1K: 0.015, // $15 per 1M output tokens
    contextLimit: 200000,
  },
  'claude-3-5-haiku-latest': {
    inputPer1K: 0.001, // $1 per 1M input tokens
    outputPer1K: 0.005, // $5 per 1M output tokens
    contextLimit: 200000,
  },
  'claude-3-opus-20240229': {
    inputPer1K: 0.015, // $15 per 1M input tokens
    outputPer1K: 0.075, // $75 per 1M output tokens
    contextLimit: 200000,
  },

  // Google Document AI (per page)
  'google-document-ai': {
    inputPer1K: 1.5, // $1.50 per 1000 pages
    outputPer1K: 0,
    contextLimit: 0,
  },
}

// =============================================================================
// Usage Types
// =============================================================================

/**
 * Single API usage record
 */
export interface UsageRecord {
  id: string
  timestamp: number
  provider: AIProvider
  model: string
  operation: 'extraction' | 'ocr' | 'consensus' | 'analysis'

  // Token counts
  inputTokens: number
  outputTokens: number
  totalTokens: number

  // Cost calculation
  inputCost: number
  outputCost: number
  totalCost: number

  // Cache info
  cacheHit: boolean
  cacheSavings: number

  // Request details
  documentLength?: number
  pageCount?: number
  durationMs?: number
  success: boolean
  errorMessage?: string

  // User context
  userId?: string
  sessionId?: string
}

/**
 * Aggregated usage statistics
 */
export interface UsageStats {
  // Time period
  periodStart: number
  periodEnd: number

  // Request counts
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  cachedRequests: number

  // Token usage
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number

  // Costs
  totalCost: number
  totalSavings: number // From cache hits
  netCost: number // totalCost - totalSavings

  // By provider
  byProvider: Record<
    AIProvider,
    {
      requests: number
      tokens: number
      cost: number
    }
  >

  // By operation
  byOperation: Record<
    string,
    {
      requests: number
      tokens: number
      cost: number
    }
  >

  // Performance
  avgDurationMs: number
  p95DurationMs: number

  // Cost trends
  dailyCosts: { date: string; cost: number }[]
}

/**
 * Cost budget configuration
 */
export interface CostBudget {
  // Monthly limits
  monthlyLimit: number // Maximum monthly spend (USD)
  warningThreshold: number // Warn when reaching this % of limit
  hardLimit: boolean // Block requests when limit reached

  // Per-user limits
  perUserDaily: number // Max daily spend per user
  perUserMonthly: number // Max monthly spend per user

  // Alert configuration
  alertEmail?: string
  slackWebhook?: string
}

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET: CostBudget = {
  monthlyLimit: 100, // $100/month
  warningThreshold: 0.8, // Warn at 80%
  hardLimit: false, // Don't block, just warn
  perUserDaily: 5, // $5/day per user
  perUserMonthly: 50, // $50/month per user
}

// =============================================================================
// Token Estimation
// =============================================================================

/**
 * Estimate token count from text
 * Uses a simple heuristic: ~4 characters per token on average
 */
export function estimateTokens(text: string): number {
  // GPT/Claude tokenization approximation:
  // - ~4 characters per token for English text
  // - Turkish text may use more tokens due to special characters
  // - JSON structure adds overhead

  const charCount = text.length
  const wordCount = text.split(/\s+/).length

  // Use character-based estimation with word adjustment
  const charBasedEstimate = Math.ceil(charCount / 4)
  const wordBasedEstimate = Math.ceil(wordCount * 1.3)

  // Return the larger estimate for safety
  return Math.max(charBasedEstimate, wordBasedEstimate)
}

/**
 * Estimate output tokens for extraction operation
 * Based on typical extraction response size
 */
export function estimateExtractionOutputTokens(inputTokens: number): number {
  // Extraction output is typically 500-2000 tokens
  // Scales slightly with input size
  const baseOutput = 800
  const scaleFactor = Math.log10(inputTokens + 1) * 100
  return Math.round(baseOutput + scaleFactor)
}

// =============================================================================
// Cost Calculation
// =============================================================================

/**
 * Calculate cost for a request
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o']

  const inputCost = (inputTokens / 1000) * pricing.inputPer1K
  const outputCost = (outputTokens / 1000) * pricing.outputPer1K
  const totalCost = inputCost + outputCost

  return {
    inputCost: Math.round(inputCost * 10000) / 10000, // 4 decimal places
    outputCost: Math.round(outputCost * 10000) / 10000,
    totalCost: Math.round(totalCost * 10000) / 10000,
  }
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(2)}¢`
  }
  return `$${cost.toFixed(4)}`
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return tokens.toString()
}
