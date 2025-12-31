/**
 * AI Cost Tracking Module
 * Token-based pricing and usage analytics for AI API calls
 */

// Main tracker
export { costTracker } from './tracker'

// Types and utilities
export type { UsageRecord, UsageStats, CostBudget, ModelPricing } from './types'
export {
  MODEL_PRICING,
  DEFAULT_BUDGET,
  calculateCost,
  estimateTokens,
  estimateExtractionOutputTokens,
  formatCost,
  formatTokens,
} from './types'

// =============================================================================
// Convenience Functions
// =============================================================================

import { costTracker } from './tracker'
import type { AIProvider } from '@/lib/ai/config'

/**
 * Record AI API usage and calculate cost
 */
export async function trackAIUsage(params: {
  provider: AIProvider
  model: string
  operation: 'extraction' | 'ocr' | 'consensus' | 'analysis'
  inputText?: string
  inputTokens?: number
  outputTokens?: number
  cacheHit?: boolean
  documentLength?: number
  pageCount?: number
  durationMs?: number
  success?: boolean
  errorMessage?: string
  userId?: string
}) {
  return costTracker.recordUsage(params)
}

/**
 * Get usage statistics for a time period
 */
export async function getUsageStats(startDate?: Date, endDate?: Date, userId?: string) {
  return costTracker.getStats(startDate, endDate, userId)
}

/**
 * Get current month's budget status
 */
export async function getBudgetStatus() {
  return costTracker.getCurrentMonthStatus()
}

/**
 * Check if a request should be allowed based on budget
 */
export async function checkBudgetLimit(userId?: string, estimatedCost?: number) {
  return costTracker.checkBudget(userId, estimatedCost)
}

/**
 * Get cost breakdown by model
 */
export async function getCostByModel(startDate?: Date, endDate?: Date) {
  return costTracker.getCostByModel(startDate, endDate)
}

/**
 * Set monthly budget limit
 */
export function setMonthlyBudget(limit: number) {
  costTracker.setBudget({ monthlyLimit: limit })
}

/**
 * Initialize cost tracking (call at app startup)
 */
export async function initializeCostTracking() {
  await costTracker.initialize()
}
