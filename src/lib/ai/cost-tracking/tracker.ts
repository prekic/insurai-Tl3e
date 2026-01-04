/**
 * AI Cost Tracker Service
 * Tracks API usage and costs with IndexedDB persistence
 */

import type { AIProvider } from '@/lib/ai/config'
import type { UsageRecord, UsageStats, CostBudget } from './types'
import {
  DEFAULT_BUDGET,
  calculateCost,
  estimateTokens,
  estimateExtractionOutputTokens,
  MODEL_PRICING,
} from './types'

// =============================================================================
// Storage Constants
// =============================================================================

const DB_NAME = 'insurai_cost_tracking'
const DB_VERSION = 1
const STORE_NAME = 'usage'
const BUDGET_KEY = 'cost_budget'

// =============================================================================
// Database Helpers
// =============================================================================

/**
 * Open IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('provider', 'provider', { unique: false })
        store.createIndex('userId', 'userId', { unique: false })
        store.createIndex('operation', 'operation', { unique: false })
      }
    }
  })
}

/**
 * Check if IndexedDB is available
 */
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

// =============================================================================
// Cost Tracker Class
// =============================================================================

class CostTracker {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null
  private budget: CostBudget = DEFAULT_BUDGET
  private memoryRecords: UsageRecord[] = []
  private statsCache: { stats: UsageStats; timestamp: number } | null = null

  /**
   * Initialize the tracker
   */
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    // Load budget from localStorage
    this.loadBudget()

    if (!isIndexedDBAvailable()) {
      return
    }

    try {
      this.db = await openDatabase()
    } catch {
      // IndexedDB not available, will use memory storage
    }
  }

  /**
   * Record an API usage
   */
  async recordUsage(params: {
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
    sessionId?: string
  }): Promise<UsageRecord> {
    await this.initialize()

    const {
      provider,
      model,
      operation,
      inputText,
      inputTokens: providedInputTokens,
      outputTokens: providedOutputTokens,
      cacheHit = false,
      documentLength,
      pageCount,
      durationMs,
      success = true,
      errorMessage,
      userId,
      sessionId,
    } = params

    // Calculate token counts
    let inputTokens = providedInputTokens ?? 0
    let outputTokens = providedOutputTokens ?? 0

    if (!providedInputTokens && inputText) {
      inputTokens = estimateTokens(inputText)
    }
    if (!providedOutputTokens && inputTokens > 0) {
      outputTokens = estimateExtractionOutputTokens(inputTokens)
    }

    const totalTokens = inputTokens + outputTokens

    // Calculate costs
    const { inputCost, outputCost, totalCost } = calculateCost(model, inputTokens, outputTokens)

    // Calculate cache savings (what would have been spent)
    const cacheSavings = cacheHit ? totalCost : 0
    const actualCost = cacheHit ? 0 : totalCost

    const record: UsageRecord = {
      id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      provider,
      model,
      operation,
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost,
      outputCost,
      totalCost: actualCost,
      cacheHit,
      cacheSavings,
      documentLength,
      pageCount,
      durationMs,
      success,
      errorMessage,
      userId,
      sessionId,
    }

    // Store record
    await this.storeRecord(record)

    // Invalidate stats cache
    this.statsCache = null

    return record
  }

  /**
   * Get usage statistics for a time period
   */
  async getStats(
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<UsageStats> {
    await this.initialize()

    const start = startDate?.getTime() ?? Date.now() - 30 * 24 * 60 * 60 * 1000 // Last 30 days
    const end = endDate?.getTime() ?? Date.now()

    // Check cache (for default period without user filter)
    if (!userId && !startDate && !endDate && this.statsCache) {
      const cacheAge = Date.now() - this.statsCache.timestamp
      if (cacheAge < 60000) { // 1 minute cache
        return this.statsCache.stats
      }
    }

    const records = await this.queryRecords(start, end, userId)
    const stats = this.calculateStats(records, start, end)

    // Cache stats
    if (!userId && !startDate && !endDate) {
      this.statsCache = { stats, timestamp: Date.now() }
    }

    return stats
  }

  /**
   * Get current month's cost and budget status
   */
  async getCurrentMonthStatus(): Promise<{
    spent: number
    budget: number
    percentUsed: number
    remaining: number
    isOverBudget: boolean
    isWarning: boolean
    daysRemaining: number
    projectedMonthEnd: number
  }> {
    await this.initialize()

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const stats = await this.getStats(monthStart)

    const spent = stats.netCost
    const budget = this.budget.monthlyLimit
    const percentUsed = budget > 0 ? spent / budget : 0
    const remaining = Math.max(0, budget - spent)
    const isOverBudget = spent >= budget
    const isWarning = percentUsed >= this.budget.warningThreshold

    // Calculate days remaining and projection
    const dayOfMonth = now.getDate()
    const daysInMonth = monthEnd.getDate()
    const daysRemaining = daysInMonth - dayOfMonth
    const dailyRate = dayOfMonth > 0 ? spent / dayOfMonth : 0
    const projectedMonthEnd = dailyRate * daysInMonth

    return {
      spent: Math.round(spent * 100) / 100,
      budget,
      percentUsed: Math.round(percentUsed * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
      isOverBudget,
      isWarning,
      daysRemaining,
      projectedMonthEnd: Math.round(projectedMonthEnd * 100) / 100,
    }
  }

  /**
   * Check if a request should be allowed based on budget
   */
  async checkBudget(
    userId?: string,
    _estimatedCost?: number
  ): Promise<{
    allowed: boolean
    reason?: string
    currentSpend: number
    limit: number
  }> {
    await this.initialize()

    const monthStatus = await this.getCurrentMonthStatus()

    // Check global monthly limit
    if (this.budget.hardLimit && monthStatus.isOverBudget) {
      return {
        allowed: false,
        reason: 'Monthly budget limit reached',
        currentSpend: monthStatus.spent,
        limit: this.budget.monthlyLimit,
      }
    }

    // Check per-user limits if userId provided
    if (userId) {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      const userDailyStats = await this.getStats(todayStart, now, userId)
      const userMonthlyStats = await this.getStats(monthStart, now, userId)

      if (userDailyStats.netCost >= this.budget.perUserDaily) {
        return {
          allowed: false,
          reason: 'Daily per-user limit reached',
          currentSpend: userDailyStats.netCost,
          limit: this.budget.perUserDaily,
        }
      }

      if (userMonthlyStats.netCost >= this.budget.perUserMonthly) {
        return {
          allowed: false,
          reason: 'Monthly per-user limit reached',
          currentSpend: userMonthlyStats.netCost,
          limit: this.budget.perUserMonthly,
        }
      }
    }

    return {
      allowed: true,
      currentSpend: monthStatus.spent,
      limit: this.budget.monthlyLimit,
    }
  }

  /**
   * Get cost by model
   */
  async getCostByModel(startDate?: Date, endDate?: Date): Promise<Record<string, {
    requests: number
    inputTokens: number
    outputTokens: number
    cost: number
    avgCostPerRequest: number
  }>> {
    await this.initialize()

    const start = startDate?.getTime() ?? Date.now() - 30 * 24 * 60 * 60 * 1000
    const end = endDate?.getTime() ?? Date.now()

    const records = await this.queryRecords(start, end)
    const byModel: Record<string, {
      requests: number
      inputTokens: number
      outputTokens: number
      cost: number
    }> = {}

    for (const record of records) {
      if (!byModel[record.model]) {
        byModel[record.model] = {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
        }
      }

      byModel[record.model].requests++
      byModel[record.model].inputTokens += record.inputTokens
      byModel[record.model].outputTokens += record.outputTokens
      byModel[record.model].cost += record.totalCost
    }

    // Add average cost per request
    const result: Record<string, {
      requests: number
      inputTokens: number
      outputTokens: number
      cost: number
      avgCostPerRequest: number
    }> = {}

    for (const [model, data] of Object.entries(byModel)) {
      result[model] = {
        ...data,
        avgCostPerRequest: data.requests > 0 ? data.cost / data.requests : 0,
      }
    }

    return result
  }

  /**
   * Set budget configuration
   */
  setBudget(budget: Partial<CostBudget>): void {
    this.budget = { ...this.budget, ...budget }
    this.saveBudget()
  }

  /**
   * Get current budget configuration
   */
  getBudget(): CostBudget {
    return { ...this.budget }
  }

  /**
   * Clear all usage records
   */
  async clearRecords(): Promise<void> {
    await this.initialize()
    this.memoryRecords = []
    this.statsCache = null

    if (!this.db) return

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get model pricing information
   */
  getModelPricing(model: string): { inputPer1K: number; outputPer1K: number; contextLimit: number } {
    return MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o']
  }

  // Private methods

  private async storeRecord(record: UsageRecord): Promise<void> {
    // Always store in memory
    this.memoryRecords.push(record)

    // Trim memory if too large
    if (this.memoryRecords.length > 10000) {
      this.memoryRecords = this.memoryRecords.slice(-10000)
    }

    if (!this.db) return

    const db = this.db
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        store.add(record)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve() // Don't fail on storage errors
      } catch {
        resolve()
      }
    })
  }

  private async queryRecords(
    start: number,
    end: number,
    userId?: string
  ): Promise<UsageRecord[]> {
    if (!this.db) {
      // Fallback to memory records
      return this.memoryRecords.filter(r => {
        if (r.timestamp < start || r.timestamp > end) return false
        if (userId && r.userId !== userId) return false
        return true
      })
    }

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('timestamp')
      const range = IDBKeyRange.bound(start, end)
      const request = index.openCursor(range)

      const records: UsageRecord[] = []

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const record = cursor.value as UsageRecord
          if (!userId || record.userId === userId) {
            records.push(record)
          }
          cursor.continue()
        } else {
          resolve(records)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  private calculateStats(records: UsageRecord[], start: number, end: number): UsageStats {
    const stats: UsageStats = {
      periodStart: start,
      periodEnd: end,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      totalSavings: 0,
      netCost: 0,
      byProvider: {
        openai: { requests: 0, tokens: 0, cost: 0 },
        anthropic: { requests: 0, tokens: 0, cost: 0 },
      },
      byOperation: {},
      avgDurationMs: 0,
      p95DurationMs: 0,
      dailyCosts: [],
    }

    const durations: number[] = []
    const dailyCostMap: Record<string, number> = {}

    for (const record of records) {
      stats.totalRequests++
      if (record.success) stats.successfulRequests++
      else stats.failedRequests++
      if (record.cacheHit) stats.cachedRequests++

      stats.totalInputTokens += record.inputTokens
      stats.totalOutputTokens += record.outputTokens
      stats.totalTokens += record.totalTokens
      stats.totalCost += record.totalCost
      stats.totalSavings += record.cacheSavings

      // By provider
      if (stats.byProvider[record.provider]) {
        stats.byProvider[record.provider].requests++
        stats.byProvider[record.provider].tokens += record.totalTokens
        stats.byProvider[record.provider].cost += record.totalCost
      }

      // By operation
      if (!stats.byOperation[record.operation]) {
        stats.byOperation[record.operation] = { requests: 0, tokens: 0, cost: 0 }
      }
      stats.byOperation[record.operation].requests++
      stats.byOperation[record.operation].tokens += record.totalTokens
      stats.byOperation[record.operation].cost += record.totalCost

      // Duration tracking
      if (record.durationMs) {
        durations.push(record.durationMs)
      }

      // Daily costs
      const date = new Date(record.timestamp).toISOString().split('T')[0]
      dailyCostMap[date] = (dailyCostMap[date] ?? 0) + record.totalCost
    }

    stats.netCost = stats.totalCost - stats.totalSavings

    // Calculate duration stats
    if (durations.length > 0) {
      stats.avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length
      durations.sort((a, b) => a - b)
      const p95Index = Math.floor(durations.length * 0.95)
      stats.p95DurationMs = durations[p95Index] ?? durations[durations.length - 1]
    }

    // Convert daily costs to array
    stats.dailyCosts = Object.entries(dailyCostMap)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return stats
  }

  private loadBudget(): void {
    if (typeof localStorage === 'undefined') return

    try {
      const stored = localStorage.getItem(BUDGET_KEY)
      if (stored) {
        this.budget = { ...DEFAULT_BUDGET, ...JSON.parse(stored) }
      }
    } catch {
      // Use default budget
    }
  }

  private saveBudget(): void {
    if (typeof localStorage === 'undefined') return

    try {
      localStorage.setItem(BUDGET_KEY, JSON.stringify(this.budget))
    } catch {
      // Storage not available
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const costTracker = new CostTracker()
