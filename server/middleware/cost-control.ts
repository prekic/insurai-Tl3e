/**
 * Cost Control Middleware
 * Enforces budget limits and tracks AI usage costs
 */

import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'
import { getCostConfig } from '../services/config-service.js'

const log = logger.child('CostControl')

// ============================================================================
// TYPES
// ============================================================================

export interface CostBudget {
  id: string
  name: string
  budgetType: 'daily' | 'weekly' | 'monthly' | 'total'
  limitAmount: number
  currentUsage: number
  alertThresholdPercent: number
  actionOnExceed: 'warn' | 'block' | 'notify' | 'none'
  appliesTo?: string // 'all', specific user ID, or provider name
  resetAt?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CostAlert {
  id: string
  budgetId: string
  budgetName: string
  alertType: 'threshold_warning' | 'budget_exceeded' | 'budget_blocked'
  currentUsage: number
  limitAmount: number
  percentUsed: number
  message: string
  createdAt: string
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: string
}

export interface AIUsageCost {
  provider: string
  model: string
  operation: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  userId?: string
  sessionId?: string
  timestamp: string
}

// Cost per 1000 tokens (in USD) - Updated April 2026
// Used as sync fallback when DB config is unavailable
const DEFAULT_COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  // Current models (April 2026)
  'gpt-5.4': { input: 0.003, output: 0.012 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'gemini-2.5-flash': { input: 0.0003, output: 0.0025 },
  // Legacy models (retained for historical cost tracking)
  // OpenAI
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  // Anthropic
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  // Google
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  // Default fallback
  default: { input: 0.001, output: 0.002 },
}

// Cached token pricing from DB config, refreshed periodically
let cachedTokenPricing: Record<string, { input: number; output: number }> | null = null
let cachedTokenPricingExpiry = 0
const TOKEN_PRICING_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Refresh the cached token pricing from DB config (fire-and-forget safe).
 * Call this in async contexts to keep the cache warm.
 */
export async function refreshTokenPricingCache(): Promise<void> {
  try {
    const costConfig = await getCostConfig()
    if (costConfig.tokenPricing && Object.keys(costConfig.tokenPricing).length > 0) {
      cachedTokenPricing = costConfig.tokenPricing
      cachedTokenPricingExpiry = Date.now() + TOKEN_PRICING_CACHE_TTL_MS
    }
  } catch (err) {
    log.warn('Failed to refresh token pricing from DB config, using defaults', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Get the current token pricing map (sync).
 * Returns DB-configured pricing if cached, otherwise defaults.
 */
function getTokenPricing(): Record<string, { input: number; output: number }> {
  if (cachedTokenPricing && Date.now() < cachedTokenPricingExpiry) {
    return cachedTokenPricing
  }
  // Trigger async refresh for next call (fire-and-forget)
  refreshTokenPricingCache().catch(() => {})
  // Return cached (even if expired) or defaults
  return cachedTokenPricing || DEFAULT_COST_PER_1K_TOKENS
}

// ============================================================================
// DATABASE CLIENT
// ============================================================================

let supabase: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  if (supabase) return supabase

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return null
  }

  supabase = createClient(url, serviceKey)
  return supabase
}

// ============================================================================
// IN-MEMORY FALLBACK (for when database is unavailable)
// ============================================================================

const inMemoryBudgets: Map<string, CostBudget> = new Map()
const inMemoryAlerts: CostAlert[] = []
const inMemoryUsage: AIUsageCost[] = []

// Initialize default budgets
function initializeDefaultBudgets(): void {
  if (inMemoryBudgets.size > 0) return

  inMemoryBudgets.set('daily-total', {
    id: 'daily-total',
    name: 'Daily Total Budget',
    budgetType: 'daily',
    limitAmount: 50.0, // $50/day default
    currentUsage: 0,
    alertThresholdPercent: 80,
    actionOnExceed: 'warn',
    appliesTo: 'all',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  inMemoryBudgets.set('monthly-total', {
    id: 'monthly-total',
    name: 'Monthly Total Budget',
    budgetType: 'monthly',
    limitAmount: 1000.0, // $1000/month default
    currentUsage: 0,
    alertThresholdPercent: 75,
    actionOnExceed: 'notify',
    appliesTo: 'all',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

initializeDefaultBudgets()

// ============================================================================
// COST CALCULATION
// ============================================================================

/**
 * Strip a versioned model suffix (e.g. `-20251022`) so callers passing a
 * runtime-echoed model name like `claude-sonnet-4-6-20251022` still hit
 * the bare `claude-sonnet-4-6` pricing entry instead of silently falling
 * through to `default`. Anthropic and OpenAI both echo dated variants
 * back in `response.model` even when the request asked for an alias.
 */
function normaliseModelKey(model: string): string {
  return model.replace(/-\d{6,}$/, '')
}

/**
 * Calculate cost for token usage
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  const tokenPricing = getTokenPricing()
  const normalisedModel = normaliseModelKey(model)
  const pricing =
    tokenPricing[model] ||
    tokenPricing[normalisedModel] ||
    tokenPricing['default'] ||
    DEFAULT_COST_PER_1K_TOKENS['default']

  const inputCost = (inputTokens / 1000) * pricing.input
  const outputCost = (outputTokens / 1000) * pricing.output
  const totalCost = inputCost + outputCost

  return {
    inputCost: Math.round(inputCost * 1000000) / 1000000, // 6 decimal places
    outputCost: Math.round(outputCost * 1000000) / 1000000,
    totalCost: Math.round(totalCost * 1000000) / 1000000,
  }
}

/**
 * Get model pricing info
 */
export function getModelPricing(model: string): { input: number; output: number } {
  const tokenPricing = getTokenPricing()
  return tokenPricing[model] || tokenPricing['default'] || DEFAULT_COST_PER_1K_TOKENS['default']
}

// ============================================================================
// BUDGET MANAGEMENT
// ============================================================================

/**
 * Get all active budgets
 */
export async function getActiveBudgets(): Promise<CostBudget[]> {
  const db = getClient()

  if (db) {
    const { data, error } = await db.from('cost_budgets').select('*').eq('is_active', true)

    if (!error && data) {
      return data.map(mapBudgetFromDb)
    }
  }

  // Fallback to in-memory
  return Array.from(inMemoryBudgets.values()).filter((b) => b.isActive)
}

/**
 * Get budget by ID
 */
export async function getBudget(id: string): Promise<CostBudget | null> {
  const db = getClient()

  if (db) {
    const { data, error } = await db.from('cost_budgets').select('*').eq('id', id).single()

    if (!error && data) {
      return mapBudgetFromDb(data)
    }
  }

  return inMemoryBudgets.get(id) || null
}

/**
 * Create or update budget
 */
export async function upsertBudget(
  budget: Partial<CostBudget> & { id?: string }
): Promise<CostBudget | null> {
  const db = getClient()
  const now = new Date().toISOString()

  const budgetData: CostBudget = {
    id: budget.id || `budget-${Date.now()}`,
    name: budget.name || 'New Budget',
    budgetType: budget.budgetType || 'monthly',
    limitAmount: budget.limitAmount || 100,
    currentUsage: budget.currentUsage || 0,
    alertThresholdPercent: budget.alertThresholdPercent || 80,
    actionOnExceed: budget.actionOnExceed || 'warn',
    appliesTo: budget.appliesTo || 'all',
    resetAt: budget.resetAt,
    isActive: budget.isActive !== false,
    createdAt: budget.createdAt || now,
    updatedAt: now,
  }

  if (db) {
    const { data, error } = await db
      .from('cost_budgets')
      .upsert({
        id: budgetData.id,
        name: budgetData.name,
        budget_type: budgetData.budgetType,
        limit_amount: budgetData.limitAmount,
        current_usage: budgetData.currentUsage,
        alert_threshold_percent: budgetData.alertThresholdPercent,
        action_on_exceed: budgetData.actionOnExceed,
        applies_to: budgetData.appliesTo,
        reset_at: budgetData.resetAt,
        is_active: budgetData.isActive,
        updated_at: now,
      })
      .select()
      .single()

    if (!error && data) {
      return mapBudgetFromDb(data)
    }
  }

  // Fallback to in-memory
  inMemoryBudgets.set(budgetData.id, budgetData)
  return budgetData
}

/**
 * Update budget usage
 */
export async function updateBudgetUsage(
  budgetId: string,
  additionalCost: number
): Promise<boolean> {
  const db = getClient()

  if (db) {
    const { error } = await db.rpc('increment_budget_usage', {
      budget_id: budgetId,
      cost_amount: additionalCost,
    })

    if (!error) return true

    // If RPC doesn't exist, fallback to manual update
    const { data: current } = await db
      .from('cost_budgets')
      .select('current_usage')
      .eq('id', budgetId)
      .single()

    if (current) {
      const { error: updateError } = await db
        .from('cost_budgets')
        .update({
          current_usage: (current.current_usage || 0) + additionalCost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', budgetId)

      return !updateError
    }
  }

  // Fallback to in-memory
  const budget = inMemoryBudgets.get(budgetId)
  if (budget) {
    budget.currentUsage += additionalCost
    budget.updatedAt = new Date().toISOString()
    return true
  }

  return false
}

/**
 * Reset budget usage (for periodic budgets)
 */
export async function resetBudgetUsage(budgetId: string): Promise<boolean> {
  const db = getClient()
  const now = new Date()

  if (db) {
    const { error } = await db
      .from('cost_budgets')
      .update({
        current_usage: 0,
        reset_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', budgetId)

    return !error
  }

  const budget = inMemoryBudgets.get(budgetId)
  if (budget) {
    budget.currentUsage = 0
    budget.resetAt = now.toISOString()
    budget.updatedAt = now.toISOString()
    return true
  }

  return false
}

function mapBudgetFromDb(row: Record<string, unknown>): CostBudget {
  return {
    id: row.id as string,
    name: row.name as string,
    budgetType: row.budget_type as CostBudget['budgetType'],
    limitAmount: parseFloat(row.limit_amount as string),
    currentUsage: parseFloat((row.current_usage as string) || '0'),
    alertThresholdPercent: row.alert_threshold_percent as number,
    actionOnExceed: row.action_on_exceed as CostBudget['actionOnExceed'],
    appliesTo: row.applies_to as string | undefined,
    resetAt: row.reset_at as string | undefined,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ============================================================================
// BUDGET CHECKING & ALERTS
// ============================================================================

/**
 * Check if a budget allows the request
 */
export async function checkBudget(
  estimatedCost: number,
  userId?: string,
  provider?: string
): Promise<{
  allowed: boolean
  warnings: string[]
  blockedBy?: string
  alerts: CostAlert[]
}> {
  const budgets = await getActiveBudgets()
  const warnings: string[] = []
  const alerts: CostAlert[] = []
  let blocked = false
  let blockedBy: string | undefined

  for (const budget of budgets) {
    // Check if budget applies to this request
    if (budget.appliesTo && budget.appliesTo !== 'all') {
      if (budget.appliesTo !== userId && budget.appliesTo !== provider) {
        continue
      }
    }

    const projectedUsage = budget.currentUsage + estimatedCost
    // Note: projectedPercent can be used for logging if needed
    // const projectedPercentUsed = (projectedUsage / budget.limitAmount) * 100

    // Check if threshold warning needed
    const currentPercent = (budget.currentUsage / budget.limitAmount) * 100
    if (currentPercent >= budget.alertThresholdPercent && currentPercent < 100) {
      const alert = createAlert(budget, 'threshold_warning', budget.currentUsage)
      alerts.push(alert)
      warnings.push(
        `Budget "${budget.name}" is at ${currentPercent.toFixed(1)}% (threshold: ${budget.alertThresholdPercent}%)`
      )
    }

    // Check if budget would be exceeded
    if (projectedUsage > budget.limitAmount) {
      const alert = createAlert(budget, 'budget_exceeded', projectedUsage)
      alerts.push(alert)

      switch (budget.actionOnExceed) {
        case 'block':
          blocked = true
          blockedBy = budget.name
          break
        case 'warn':
          warnings.push(
            `Budget "${budget.name}" would be exceeded: $${projectedUsage.toFixed(4)} / $${budget.limitAmount.toFixed(2)}`
          )
          break
        case 'notify':
          // Will be handled by alert system
          break
      }
    }
  }

  // Store alerts
  await storeAlerts(alerts)

  return {
    allowed: !blocked,
    warnings,
    blockedBy,
    alerts,
  }
}

/**
 * Create an alert object
 */
function createAlert(
  budget: CostBudget,
  alertType: CostAlert['alertType'],
  currentUsage: number
): CostAlert {
  const percentUsed = (currentUsage / budget.limitAmount) * 100

  let message: string
  switch (alertType) {
    case 'threshold_warning':
      message = `Budget "${budget.name}" has reached ${percentUsed.toFixed(1)}% of the $${budget.limitAmount.toFixed(2)} limit`
      break
    case 'budget_exceeded':
      message = `Budget "${budget.name}" has been exceeded: $${currentUsage.toFixed(4)} / $${budget.limitAmount.toFixed(2)}`
      break
    case 'budget_blocked':
      message = `Request blocked: Budget "${budget.name}" limit of $${budget.limitAmount.toFixed(2)} exceeded`
      break
    default:
      message = `Budget alert for "${budget.name}"`
  }

  return {
    id: `alert-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
    budgetId: budget.id,
    budgetName: budget.name,
    alertType,
    currentUsage,
    limitAmount: budget.limitAmount,
    percentUsed,
    message,
    createdAt: new Date().toISOString(),
    acknowledged: false,
  }
}

/**
 * Store alerts in database or memory
 */
async function storeAlerts(alerts: CostAlert[]): Promise<void> {
  if (alerts.length === 0) return

  const db = getClient()

  if (db) {
    const rows = alerts.map((alert) => ({
      id: alert.id,
      budget_id: alert.budgetId,
      budget_name: alert.budgetName,
      alert_type: alert.alertType,
      current_usage: alert.currentUsage,
      limit_amount: alert.limitAmount,
      percent_used: alert.percentUsed,
      message: alert.message,
      acknowledged: alert.acknowledged,
    }))

    await db.from('cost_alerts').insert(rows)
  }

  // Also store in memory for quick access
  inMemoryAlerts.push(...alerts)

  // Keep only last 1000 alerts in memory
  if (inMemoryAlerts.length > 1000) {
    inMemoryAlerts.splice(0, inMemoryAlerts.length - 1000)
  }
}

/**
 * Get recent alerts
 */
export async function getRecentAlerts(limit: number = 50): Promise<CostAlert[]> {
  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('cost_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!error && data) {
      return data.map((row) => ({
        id: row.id,
        budgetId: row.budget_id,
        budgetName: row.budget_name,
        alertType: row.alert_type,
        currentUsage: parseFloat(row.current_usage),
        limitAmount: parseFloat(row.limit_amount),
        percentUsed: row.percent_used,
        message: row.message,
        createdAt: row.created_at,
        acknowledged: row.acknowledged,
        acknowledgedBy: row.acknowledged_by,
        acknowledgedAt: row.acknowledged_at,
      }))
    }
  }

  return inMemoryAlerts.slice(-limit).reverse()
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
  const db = getClient()
  const now = new Date().toISOString()

  if (db) {
    const { error } = await db
      .from('cost_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: now,
      })
      .eq('id', alertId)

    return !error
  }

  const alert = inMemoryAlerts.find((a) => a.id === alertId)
  if (alert) {
    alert.acknowledged = true
    alert.acknowledgedBy = acknowledgedBy
    alert.acknowledgedAt = now
    return true
  }

  return false
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Record AI usage cost
 */
export async function recordUsage(usage: AIUsageCost): Promise<void> {
  const db = getClient()

  if (db) {
    await db.from('ai_request_logs').insert({
      provider: usage.provider,
      model: usage.model,
      operation: usage.operation,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      input_cost: usage.inputCost,
      output_cost: usage.outputCost,
      total_cost: usage.totalCost,
      user_id: usage.userId,
      session_id: usage.sessionId,
      status: 'success',
    })
  }

  // Update all applicable budgets
  const budgets = await getActiveBudgets()
  for (const budget of budgets) {
    if (
      budget.appliesTo === 'all' ||
      budget.appliesTo === usage.userId ||
      budget.appliesTo === usage.provider
    ) {
      await updateBudgetUsage(budget.id, usage.totalCost)
    }
  }

  // Store in memory for quick aggregation
  inMemoryUsage.push(usage)
  if (inMemoryUsage.length > 10000) {
    inMemoryUsage.splice(0, inMemoryUsage.length - 10000)
  }
}

/**
 * Get usage statistics
 */
export async function getUsageStats(
  startDate: string,
  endDate: string
): Promise<{
  totalCost: number
  totalRequests: number
  byProvider: Record<string, { cost: number; requests: number }>
  byModel: Record<string, { cost: number; requests: number; tokens: number }>
  byDay: Array<{ date: string; cost: number; requests: number }>
}> {
  const db = getClient()

  if (db) {
    const { data, error } = await db
      .from('ai_request_logs')
      .select('*')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate)

    if (!error && data) {
      return aggregateUsageStats(
        data.map((row) => ({
          provider: row.provider,
          model: row.model,
          operation: row.operation,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          totalTokens: row.total_tokens,
          inputCost: parseFloat(row.input_cost || '0'),
          outputCost: parseFloat(row.output_cost || '0'),
          totalCost: parseFloat(row.total_cost || '0'),
          timestamp: row.timestamp,
        }))
      )
    }
  }

  // Fallback to in-memory
  const filtered = inMemoryUsage.filter((u) => u.timestamp >= startDate && u.timestamp <= endDate)
  return aggregateUsageStats(filtered)
}

function aggregateUsageStats(usage: AIUsageCost[]): {
  totalCost: number
  totalRequests: number
  byProvider: Record<string, { cost: number; requests: number }>
  byModel: Record<string, { cost: number; requests: number; tokens: number }>
  byDay: Array<{ date: string; cost: number; requests: number }>
} {
  const byProvider: Record<string, { cost: number; requests: number }> = {}
  const byModel: Record<string, { cost: number; requests: number; tokens: number }> = {}
  const byDayMap: Record<string, { cost: number; requests: number }> = {}

  let totalCost = 0

  for (const u of usage) {
    totalCost += u.totalCost

    // By provider
    if (!byProvider[u.provider]) {
      byProvider[u.provider] = { cost: 0, requests: 0 }
    }
    byProvider[u.provider].cost += u.totalCost
    byProvider[u.provider].requests++

    // By model
    if (!byModel[u.model]) {
      byModel[u.model] = { cost: 0, requests: 0, tokens: 0 }
    }
    byModel[u.model].cost += u.totalCost
    byModel[u.model].requests++
    byModel[u.model].tokens += u.totalTokens

    // By day
    const day = u.timestamp.split('T')[0]
    if (!byDayMap[day]) {
      byDayMap[day] = { cost: 0, requests: 0 }
    }
    byDayMap[day].cost += u.totalCost
    byDayMap[day].requests++
  }

  const byDay = Object.entries(byDayMap)
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalCost,
    totalRequests: usage.length,
    byProvider,
    byModel,
    byDay,
  }
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

export interface CostControlRequest extends Request {
  estimatedCost?: number
  budgetCheck?: {
    allowed: boolean
    warnings: string[]
    blockedBy?: string
  }
}

/**
 * Middleware to estimate and check cost before AI request
 */
export function costControlMiddleware(
  estimateTokens: (req: Request) => { inputTokens: number; model: string }
) {
  return async (req: CostControlRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { inputTokens, model } = estimateTokens(req)

      // Estimate output tokens (typically 1-2x input for chat, less for extraction)
      const operation = req.path.includes('chat') ? 'chat' : 'extraction'
      const estimatedOutputTokens = operation === 'chat' ? inputTokens * 1.5 : inputTokens * 0.5

      // Calculate estimated cost
      const cost = calculateCost(model, inputTokens, estimatedOutputTokens)
      req.estimatedCost = cost.totalCost

      // Check budget
      const userId = (req as any).user?.id
      const provider = req.path.includes('anthropic') ? 'anthropic' : 'openai'

      const budgetCheck = await checkBudget(cost.totalCost, userId, provider)
      req.budgetCheck = budgetCheck

      if (!budgetCheck.allowed) {
        res.status(429).json({
          success: false,
          error: `Request blocked: ${budgetCheck.blockedBy} budget exceeded`,
          code: 'BUDGET_EXCEEDED',
          details: {
            blockedBy: budgetCheck.blockedBy,
            estimatedCost: cost.totalCost,
          },
        })
        return
      }

      // Add warnings to response headers
      if (budgetCheck.warnings.length > 0) {
        res.setHeader('X-Budget-Warnings', JSON.stringify(budgetCheck.warnings))
      }

      next()
    } catch (error) {
      log.error('Cost control middleware error', {
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't block on errors - just continue
      next()
    }
  }
}

/**
 * Helper to estimate tokens from request body
 */
export function estimateTokensFromRequest(req: Request): { inputTokens: number; model: string } {
  const body = req.body || {}
  const message = body.message || body.prompt || body.document || ''
  const context = body.policyContext || body.context || ''
  const history = body.conversationHistory || []

  // Rough estimation: 4 characters per token
  const messageTokens = Math.ceil(message.length / 4)
  const contextTokens = Math.ceil(context.length / 4)
  const historyTokens = history.reduce((sum: number, h: { content?: string }) => {
    return sum + Math.ceil((h.content?.length || 0) / 4)
  }, 0)

  const inputTokens = messageTokens + contextTokens + historyTokens

  // Determine model
  const model = body.model || (req.path.includes('anthropic') ? 'claude-haiku-4-5' : 'gpt-4o-mini')

  return { inputTokens, model }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Cost calculation
  calculateCost,
  getModelPricing,
  refreshTokenPricingCache,
  // Budget management
  getActiveBudgets,
  getBudget,
  upsertBudget,
  updateBudgetUsage,
  resetBudgetUsage,
  // Budget checking
  checkBudget,
  // Alerts
  getRecentAlerts,
  acknowledgeAlert,
  // Usage tracking
  recordUsage,
  getUsageStats,
  // Middleware
  costControlMiddleware,
  estimateTokensFromRequest,
}
