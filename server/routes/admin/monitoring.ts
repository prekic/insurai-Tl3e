/**
 * Admin Monitoring Routes
 *
 * System metrics, health checks, dashboard, endpoint stats,
 * trends, activity, alert rules, and alert management.
 */

import { Router, Request, Response } from 'express'
import {
  authenticateAdmin,
  requireSuperAdmin,
  logAdminAction,
  monitoring,
  qstr,
  logger,
} from './shared.js'
import type { AuthenticatedRequest } from './shared.js'
import { getExtractionHealthSnapshot } from '../ai.js'

const log = logger.child('AdminMonitoring')
const router = Router()

// ============================================================================
// MONITORING ENDPOINTS (Phase 4)
// ============================================================================

/**
 * Get system metrics
 * GET /api/admin/monitoring/metrics
 */
router.get(
  '/monitoring/metrics',
  authenticateAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    try {
      const metrics = monitoring.getSystemMetrics()
      res.json({ success: true, data: metrics })
    } catch (error) {
      log.error('Failed to get metrics', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get metrics' })
    }
  }
)

/**
 * Run health checks
 * GET /api/admin/monitoring/health
 */
router.get('/monitoring/health', async (_req: Request, res: Response) => {
  try {
    const health = await monitoring.runHealthChecks()
    res.json({ success: true, data: health })
  } catch (error) {
    log.error('Failed to run health checks', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to run health checks' })
  }
})

/**
 * Get dashboard summary
 * GET /api/admin/monitoring/dashboard
 */
router.get(
  '/monitoring/dashboard',
  authenticateAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const summary = await monitoring.getDashboardSummary()
      res.json({ success: true, data: summary })
    } catch (error) {
      log.error('Failed to get dashboard summary', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get dashboard summary' })
    }
  }
)

/**
 * Get endpoint statistics
 * GET /api/admin/monitoring/endpoints
 */
router.get(
  '/monitoring/endpoints',
  authenticateAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = monitoring.getEndpointStats()
      res.json({ success: true, data: stats })
    } catch (error) {
      log.error('Failed to get endpoint stats', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get endpoint stats' })
    }
  }
)

/**
 * Get trends
 * GET /api/admin/monitoring/trends
 */
router.get('/monitoring/trends', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const periodMinutes = parseInt(req.query.period as string) || 60
    const intervalMinutes = parseInt(req.query.interval as string) || 5
    const trends = monitoring.getTrends(periodMinutes, intervalMinutes)
    res.json({ success: true, data: trends })
  } catch (error) {
    log.error('Failed to get trends', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to get trends' })
  }
})

/**
 * Get recent activity
 * GET /api/admin/monitoring/activity
 */
router.get(
  '/monitoring/activity',
  authenticateAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50
      const activity = monitoring.getRecentActivity(limit)
      res.json({ success: true, data: activity })
    } catch (error) {
      log.error('Failed to get recent activity', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get recent activity' })
    }
  }
)

// ============================================================================
// ALERT RULES MANAGEMENT
// ============================================================================

/**
 * List alert rules
 * GET /api/admin/monitoring/alert-rules
 */
router.get(
  '/monitoring/alert-rules',
  authenticateAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    try {
      const rules = monitoring.getAlertRules()
      res.json({ success: true, data: rules })
    } catch (error) {
      log.error('Failed to get alert rules', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get alert rules' })
    }
  }
)

/**
 * Get a specific alert rule
 * GET /api/admin/monitoring/alert-rules/:id
 */
router.get(
  '/monitoring/alert-rules/:id',
  authenticateAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const rule = monitoring.getAlertRule(qstr(req.params.id))

      if (!rule) {
        res.status(404).json({ success: false, error: 'Alert rule not found' })
        return
      }

      res.json({ success: true, data: rule })
    } catch (error) {
      log.error('Failed to get alert rule', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get alert rule' })
    }
  }
)

/**
 * Create an alert rule
 * POST /api/admin/monitoring/alert-rules
 */
router.post(
  '/monitoring/alert-rules',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        name,
        description,
        metric,
        condition,
        threshold,
        severity,
        enabled,
        cooldownMinutes,
        notificationChannels,
      } = req.body

      if (!name || !metric || !condition || threshold === undefined) {
        res.status(400).json({
          success: false,
          error: 'name, metric, condition, and threshold are required',
        })
        return
      }

      const rule = monitoring.createAlertRule({
        name,
        description: description || '',
        metric,
        condition,
        threshold,
        severity: severity || 'warning',
        enabled: enabled !== false,
        cooldownMinutes: cooldownMinutes || 5,
        notificationChannels: notificationChannels || ['dashboard'],
      })

      // Log action
      await logAdminAction(req, 'create', 'alert_rule', rule.id, undefined, { name, metric })

      res.json({ success: true, data: rule })
    } catch (error) {
      log.error('Failed to create alert rule', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to create alert rule' })
    }
  }
)

/**
 * Update an alert rule
 * PUT /api/admin/monitoring/alert-rules/:id
 */
router.put(
  '/monitoring/alert-rules/:id',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)
      const updates = req.body

      const rule = monitoring.updateAlertRule(id, updates)

      if (!rule) {
        res.status(404).json({ success: false, error: 'Alert rule not found' })
        return
      }

      // Log action
      await logAdminAction(req, 'update', 'alert_rule', id, undefined, updates)

      res.json({ success: true, data: rule })
    } catch (error) {
      log.error('Failed to update alert rule', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to update alert rule' })
    }
  }
)

/**
 * Delete an alert rule
 * DELETE /api/admin/monitoring/alert-rules/:id
 */
router.delete(
  '/monitoring/alert-rules/:id',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)

      const success = monitoring.deleteAlertRule(id)

      if (!success) {
        res.status(404).json({ success: false, error: 'Alert rule not found' })
        return
      }

      // Log action
      await logAdminAction(req, 'delete', 'alert_rule', id)

      res.json({ success: true, message: 'Alert rule deleted' })
    } catch (error) {
      log.error('Failed to delete alert rule', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to delete alert rule' })
    }
  }
)

// ============================================================================
// ALERTS MANAGEMENT
// ============================================================================

/**
 * Get active alerts
 * GET /api/admin/monitoring/alerts
 */
router.get('/monitoring/alerts', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const alerts = monitoring.getActiveAlerts()
    res.json({ success: true, data: alerts })
  } catch (error) {
    log.error('Failed to get alerts', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to get alerts' })
  }
})

/**
 * Get alert history
 * GET /api/admin/monitoring/alerts/history
 */
router.get(
  '/monitoring/alerts/history',
  authenticateAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100
      const history = monitoring.getAlertHistory(limit)
      res.json({ success: true, data: history })
    } catch (error) {
      log.error('Failed to get alert history', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get alert history' })
    }
  }
)

/**
 * Acknowledge an alert
 * POST /api/admin/monitoring/alerts/:id/acknowledge
 */
router.post(
  '/monitoring/alerts/:id/acknowledge',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)

      const alert = monitoring.acknowledgeAlert(id, req.adminUser?.email || 'unknown')

      if (!alert) {
        res.status(404).json({ success: false, error: 'Alert not found' })
        return
      }

      // Log action
      await logAdminAction(req, 'acknowledge', 'monitoring_alert', id)

      res.json({ success: true, data: alert })
    } catch (error) {
      log.error('Failed to acknowledge alert', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to acknowledge alert' })
    }
  }
)

/**
 * Resolve an alert
 * POST /api/admin/monitoring/alerts/:id/resolve
 */
router.post(
  '/monitoring/alerts/:id/resolve',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)

      const alert = monitoring.resolveAlert(id)

      if (!alert) {
        res.status(404).json({ success: false, error: 'Alert not found' })
        return
      }

      // Log action
      await logAdminAction(req, 'resolve', 'monitoring_alert', id)

      res.json({ success: true, data: alert })
    } catch (error) {
      log.error('Failed to resolve alert', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to resolve alert' })
    }
  }
)

// ============================================================================
// EXTRACTION HEALTH (AI Extraction Metrics)
// ============================================================================

/**
 * Get extraction health snapshot
 * GET /api/admin/monitoring/extraction-health
 *
 * Returns in-memory extraction metrics from the last 24h:
 * - Total/success/failed counts with error rate
 * - Per-provider breakdown (openai, anthropic) with avg latency
 * - Recent errors (last 10) with request IDs and error codes
 */
router.get(
  '/monitoring/extraction-health',
  authenticateAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const snapshot = await getExtractionHealthSnapshot()
      res.json({ success: true, data: snapshot })
    } catch (error) {
      log.error('Failed to get extraction health', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get extraction health' })
    }
  }
)

export default router
