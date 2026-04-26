/**
 * Admin Cost Management Routes
 *
 * Budgets, cost alerts, usage statistics, cost summary, model pricing.
 */

import { Router, Response } from 'express'
import {
  authenticateAdmin,
  requireSuperAdmin,
  logAdminAction,
  costControl,
  qstr,
  logger,
} from './shared.js'
import type { AuthenticatedRequest } from './shared.js'

const log = logger.child('AdminCost')
const router = Router()

// ============================================================================
// COST BUDGET MANAGEMENT (Phase 2)
// ============================================================================

/**
 * List all budgets
 * GET /api/admin/budgets
 */
router.get('/budgets', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const budgets = await costControl.getActiveBudgets()

    // Log access
    await logAdminAction(req, 'view', 'budgets')

    res.json({ success: true, data: budgets })
  } catch (error) {
    log.error('Failed to list budgets', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to list budgets' })
  }
})

/**
 * Get a specific budget
 * GET /api/admin/budgets/:id
 */
router.get('/budgets/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const budget = await costControl.getBudget(qstr(req.params.id))

    if (!budget) {
      res.status(404).json({ success: false, error: 'Budget not found' })
      return
    }

    res.json({ success: true, data: budget })
  } catch (error) {
    log.error('Failed to get budget', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to get budget' })
  }
})

/**
 * Create a new budget
 * POST /api/admin/budgets
 */
router.post(
  '/budgets',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, budgetType, limitAmount, alertThresholdPercent, actionOnExceed, appliesTo } =
        req.body

      if (!name || !budgetType || !limitAmount) {
        res.status(400).json({
          success: false,
          error: 'Name, budgetType, and limitAmount are required',
        })
        return
      }

      const budget = await costControl.upsertBudget({
        name,
        budgetType,
        limitAmount: parseFloat(limitAmount),
        alertThresholdPercent: alertThresholdPercent || 80,
        actionOnExceed: actionOnExceed || 'warn',
        appliesTo: appliesTo || 'all',
        isActive: true,
      })

      // Log action
      await logAdminAction(req, 'create', 'budget', budget?.id, undefined, { name, limitAmount })

      res.json({ success: true, data: budget })
    } catch (error) {
      log.error('Failed to create budget', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to create budget' })
    }
  }
)

/**
 * Update a budget
 * PUT /api/admin/budgets/:id
 */
router.put(
  '/budgets/:id',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)
      const updates = req.body

      // Get existing budget
      const existing = await costControl.getBudget(id)
      if (!existing) {
        res.status(404).json({ success: false, error: 'Budget not found' })
        return
      }

      const budget = await costControl.upsertBudget({
        ...existing,
        ...updates,
        id,
      })

      // Log action
      await logAdminAction(req, 'update', 'budget', id, existing, updates)

      res.json({ success: true, data: budget })
    } catch (error) {
      log.error('Failed to update budget', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to update budget' })
    }
  }
)

/**
 * Delete/deactivate a budget
 * DELETE /api/admin/budgets/:id
 */
router.delete(
  '/budgets/:id',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)

      // Get existing budget
      const existing = await costControl.getBudget(id)
      if (!existing) {
        res.status(404).json({ success: false, error: 'Budget not found' })
        return
      }

      // Soft delete by setting isActive to false
      await costControl.upsertBudget({
        ...existing,
        isActive: false,
      })

      // Log action
      await logAdminAction(req, 'delete', 'budget', id)

      res.json({ success: true, message: 'Budget deactivated' })
    } catch (error) {
      log.error('Failed to delete budget', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to delete budget' })
    }
  }
)

/**
 * Reset budget usage
 * POST /api/admin/budgets/:id/reset
 */
router.post(
  '/budgets/:id/reset',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)

      const success = await costControl.resetBudgetUsage(id)

      if (!success) {
        res.status(404).json({ success: false, error: 'Budget not found' })
        return
      }

      // Log action
      await logAdminAction(req, 'reset', 'budget', id)

      res.json({ success: true, message: 'Budget usage reset' })
    } catch (error) {
      log.error('Failed to reset budget', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to reset budget' })
    }
  }
)

// ============================================================================
// COST ALERTS
// ============================================================================

/**
 * Get recent cost alerts
 * GET /api/admin/cost/alerts
 */
router.get('/cost/alerts', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const alerts = await costControl.getRecentAlerts(limit)

    res.json({ success: true, data: alerts })
  } catch (error) {
    log.error('Failed to get alerts', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to get alerts' })
  }
})

/**
 * Acknowledge an alert
 * POST /api/admin/cost/alerts/:id/acknowledge
 */
router.post(
  '/cost/alerts/:id/acknowledge',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)

      const success = await costControl.acknowledgeAlert(id, req.adminUser?.email || 'unknown')

      if (!success) {
        res.status(404).json({ success: false, error: 'Alert not found' })
        return
      }

      // Log action
      await logAdminAction(req, 'acknowledge', 'cost_alert', id)

      res.json({ success: true, message: 'Alert acknowledged' })
    } catch (error) {
      log.error('Failed to acknowledge alert', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to acknowledge alert' })
    }
  }
)

// ============================================================================
// COST USAGE STATISTICS
// ============================================================================

/**
 * Get usage statistics
 * GET /api/admin/cost/usage
 */
router.get('/cost/usage', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    // Default to last 30 days if not specified
    const end = (endDate as string) || new Date().toISOString()
    const start =
      (startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const stats = await costControl.getUsageStats(start, end)

    res.json({ success: true, data: stats })
  } catch (error) {
    log.error('Failed to get usage stats', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to get usage stats' })
  }
})

/**
 * Get cost summary dashboard data
 * GET /api/admin/cost/summary
 */
router.get(
  '/cost/summary',
  authenticateAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      // Get budgets
      const budgets = await costControl.getActiveBudgets()

      // Get today's usage
      const today = new Date()
      const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString()
      const todayEnd = new Date().toISOString()
      const todayStats = await costControl.getUsageStats(todayStart, todayEnd)

      // Get this month's usage
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
      const monthStats = await costControl.getUsageStats(monthStart, todayEnd)

      // Get recent alerts
      const alerts = await costControl.getRecentAlerts(10)
      const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged)

      // Calculate budget status
      const budgetStatus = budgets.map((budget) => {
        const percentUsed = (budget.currentUsage / budget.limitAmount) * 100
        let status: 'healthy' | 'warning' | 'critical' = 'healthy'
        if (percentUsed >= 100) {
          status = 'critical'
        } else if (percentUsed >= budget.alertThresholdPercent) {
          status = 'warning'
        }

        return {
          id: budget.id,
          name: budget.name,
          type: budget.budgetType,
          limit: budget.limitAmount,
          used: budget.currentUsage,
          percentUsed,
          status,
          action: budget.actionOnExceed,
        }
      })

      const summary = {
        today: {
          cost: todayStats.totalCost,
          requests: todayStats.totalRequests,
        },
        thisMonth: {
          cost: monthStats.totalCost,
          requests: monthStats.totalRequests,
        },
        budgets: budgetStatus,
        alerts: {
          total: alerts.length,
          unacknowledged: unacknowledgedAlerts.length,
          recent: unacknowledgedAlerts.slice(0, 5),
        },
        byProvider: todayStats.byProvider,
      }

      res.json({ success: true, data: summary })
    } catch (error) {
      log.error('Failed to get cost summary', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get cost summary' })
    }
  }
)

/**
 * Get model pricing information
 * GET /api/admin/cost/pricing
 */
router.get('/cost/pricing', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  // Return pricing info for all known models
  const models = [
    // Current models (April 2026)
    'gpt-5.4',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'gemini-2.5-flash',
    // Legacy models
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'claude-3-5-sonnet',
    'claude-3-5-haiku',
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ]

  const pricing = models.map((model) => ({
    model,
    pricing: costControl.getModelPricing(model),
  }))

  res.json({ success: true, data: pricing })
})

export default router
