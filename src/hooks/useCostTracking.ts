/**
 * React Hook for AI Cost Tracking
 * Provides cost analytics and budget monitoring
 */

import { useState, useEffect, useCallback } from 'react'
import {
  costTracker,
  formatCost,
  formatTokens,
  type UsageStats,
  type CostBudget,
} from '@/lib/ai/cost-tracking'

// =============================================================================
// Main Hook
// =============================================================================

interface UseCostTrackingResult {
  // State
  isLoading: boolean
  error: string | null

  // Current month status
  monthlySpent: number
  monthlyBudget: number
  percentUsed: number
  isOverBudget: boolean
  isWarning: boolean
  projectedMonthEnd: number

  // Stats
  stats: UsageStats | null
  totalCostSavings: number

  // Formatting helpers
  formatCost: (cost: number) => string
  formatTokens: (tokens: number) => string

  // Actions
  refresh: () => Promise<void>
  setBudget: (budget: Partial<CostBudget>) => void
}

export function useCostTracking(
  startDate?: Date,
  endDate?: Date
): UseCostTrackingResult {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [monthStatus, setMonthStatus] = useState<{
    spent: number
    budget: number
    percentUsed: number
    isOverBudget: boolean
    isWarning: boolean
    projectedMonthEnd: number
  }>({
    spent: 0,
    budget: 100,
    percentUsed: 0,
    isOverBudget: false,
    isWarning: false,
    projectedMonthEnd: 0,
  })

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      await costTracker.initialize()

      const [usageStats, status] = await Promise.all([
        costTracker.getStats(startDate, endDate),
        costTracker.getCurrentMonthStatus(),
      ])

      setStats(usageStats)
      setMonthStatus(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cost data')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  const refresh = useCallback(async () => {
    await loadData()
  }, [loadData])

  const setBudgetConfig = useCallback((budget: Partial<CostBudget>) => {
    costTracker.setBudget(budget)
    loadData()
  }, [loadData])

  return {
    isLoading,
    error,
    monthlySpent: monthStatus.spent,
    monthlyBudget: monthStatus.budget,
    percentUsed: monthStatus.percentUsed,
    isOverBudget: monthStatus.isOverBudget,
    isWarning: monthStatus.isWarning,
    projectedMonthEnd: monthStatus.projectedMonthEnd,
    stats,
    totalCostSavings: stats?.totalSavings ?? 0,
    formatCost,
    formatTokens,
    refresh,
    setBudget: setBudgetConfig,
  }
}

// =============================================================================
// Budget Alert Hook
// =============================================================================

interface UseBudgetAlertResult {
  showAlert: boolean
  alertType: 'warning' | 'error' | null
  message: string | null
  dismiss: () => void
}

export function useBudgetAlert(): UseBudgetAlertResult {
  const [dismissed, setDismissed] = useState(false)
  const { isOverBudget, isWarning, percentUsed, monthlyBudget } = useCostTracking()

  if (dismissed) {
    return {
      showAlert: false,
      alertType: null,
      message: null,
      dismiss: () => {},
    }
  }

  if (isOverBudget) {
    return {
      showAlert: true,
      alertType: 'error',
      message: `AI budget limit (${formatCost(monthlyBudget)}/month) reached. Some features may be limited.`,
      dismiss: () => setDismissed(true),
    }
  }

  if (isWarning) {
    return {
      showAlert: true,
      alertType: 'warning',
      message: `${Math.round(percentUsed * 100)}% of monthly AI budget used.`,
      dismiss: () => setDismissed(true),
    }
  }

  return {
    showAlert: false,
    alertType: null,
    message: null,
    dismiss: () => {},
  }
}

// =============================================================================
// Cost by Model Hook
// =============================================================================

interface CostByModelData {
  model: string
  requests: number
  inputTokens: number
  outputTokens: number
  cost: number
  avgCostPerRequest: number
}

export function useCostByModel(startDate?: Date, endDate?: Date) {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<CostByModelData[]>([])

  useEffect(() => {
    let mounted = true

    async function load() {
      setIsLoading(true)
      try {
        await costTracker.initialize()
        const byModel = await costTracker.getCostByModel(startDate, endDate)

        if (mounted) {
          const result = Object.entries(byModel).map(([model, stats]) => ({
            model,
            ...stats,
          }))
          setData(result.sort((a, b) => b.cost - a.cost))
          setIsLoading(false)
        }
      } catch {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [startDate, endDate])

  return { data, isLoading }
}

// =============================================================================
// Daily Cost History Hook
// =============================================================================

export function useDailyCosts(days = 30) {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<{ date: string; cost: number }[]>([])

  useEffect(() => {
    let mounted = true

    async function load() {
      setIsLoading(true)
      try {
        await costTracker.initialize()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const stats = await costTracker.getStats(startDate)

        if (mounted) {
          setData(stats.dailyCosts)
          setIsLoading(false)
        }
      } catch {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      mounted = false
    }
  }, [days])

  return { data, isLoading }
}
