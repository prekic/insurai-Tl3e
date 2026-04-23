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
  getSupabaseWithError,
  monitoring,
  qstr,
  logger,
} from './shared.js'
import type { AuthenticatedRequest } from './shared.js'
import { getExtractionHealthSnapshot } from '../ai/shared.js'
import { getAlertState } from '../../services/extraction-alert-service.js'

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

    // Also poll actuarial bounds silently
    import('../../services/notification-service.js')
      .then((m) => m.checkActuarialHealth())
      .catch((err) => log.error('Failed to run actuarial health check', { error: err.message }))

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
// EXTRACTION ALERT COOLDOWN STATUS
// ============================================================================

/**
 * Get extraction alert cooldown state
 * GET /api/admin/monitoring/alerts/status
 */
router.get(
  '/monitoring/alerts/status',
  authenticateAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    try {
      const alertState = getAlertState()
      res.json({ success: true, data: { lastFired: alertState } })
    } catch (error) {
      log.error('Failed to get alert status', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Internal server error' })
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

/**
 * Get historical extraction health trends
 * GET /api/admin/monitoring/extraction-health/historical
 */
router.get(
  '/monitoring/extraction-health/historical',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7
      const { getDBExtractionHealthHistorical } =
        await import('../../services/extraction-metrics-service.js')
      const historicalData = await getDBExtractionHealthHistorical(days)
      res.json({ success: true, data: historicalData })
    } catch (error) {
      log.error('Failed to get historical extraction health', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get historical extraction health' })
    }
  }
)

/**
 * Get pg_cron jobs and their recent runs
 * GET /api/admin/monitoring/cron-jobs
 */
router.get(
  '/monitoring/cron-jobs',
  authenticateAdmin,
  requireSuperAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const { client: supabase, error: supabaseError } = getSupabaseWithError()

      if (!supabase) {
        res.status(503).json({ success: false, error: supabaseError || 'Database not configured' })
        return
      }

      // Fetch active jobs
      const { data: jobs, error: jobsError } = await supabase
        .from('vw_cron_jobs')
        .select('*')
        .order('jobid', { ascending: true })

      if (jobsError) {
        throw new Error(`Failed to fetch cron jobs: ${jobsError.message}`)
      }

      // Fetch recent runs for each job
      const { data: runs, error: runsError } = await supabase
        .from('vw_cron_job_runs')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(100) // Get the latest 100 runs across all jobs

      if (runsError) {
        throw new Error(`Failed to fetch cron job runs: ${runsError.message}`)
      }

      // Aggregate data
      const aggregatedJobs = jobs.map((job: Record<string, unknown>) => ({
        ...job,
        recent_runs: runs
          .filter((run: Record<string, unknown>) => run.jobid === job.jobid)
          .slice(0, 5),
      }))

      res.json({ success: true, data: aggregatedJobs })
    } catch (error) {
      log.error('Failed to get cron jobs', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get cron jobs' })
    }
  }
)

// ============================================================================
// KASKO PILOT ROLLBACK TRIGGER MONITORING
// ============================================================================

/**
 * Get KASKO pilot rollback trigger status
 * Fetches QA records from kasko_pilot_qa_records and evaluates rollback thresholds.
 * GET /api/admin/monitoring/pilot-rollback-status
 */
router.get(
  '/monitoring/pilot-rollback-status',
  authenticateAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const { client: supabase, error: dbError } = getSupabaseWithError()

      if (!supabase) {
        log.warn('Supabase not configured for pilot rollback status', { error: dbError })
        return res.json({
          success: true,
          data: {
            totalRecords: 0,
            shouldPause: false,
            triggers: [],
            message: dbError || 'Supabase not configured',
          },
        })
      }

      // Fetch recent QA records (last 30 days, ordered by review_date)
      const { data: rows, error } = await supabase
        .from('kasko_pilot_qa_records')
        .select('*')
        .gte('review_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('review_date', { ascending: true })

      if (error) {
        log.warn('Failed to fetch pilot QA records', { error: error.message })
        return res.json({
          success: true,
          data: {
            totalRecords: 0,
            shouldPause: false,
            triggers: [],
            message: 'No QA records available (table may not exist yet)',
          },
        })
      }

      if (!rows || rows.length === 0) {
        return res.json({
          success: true,
          data: {
            totalRecords: 0,
            shouldPause: false,
            triggers: [],
            message: 'No pilot QA records found in the last 30 days',
          },
        })
      }

      // Map DB rows to PilotQARecord shape for getRollbackTriggerStatus
      const records = rows.map((r: Record<string, unknown>) => ({
        documentId: r.document_id as string,
        filename: r.filename as string,
        branch: r.branch as string,
        reviewDate: r.review_date as string,
        reviewerUserId: r.reviewer_user_id as string,
        extractionSuccess: r.extraction_success as boolean,
        extractionModel: r.extraction_model as string,
        textCharCount: r.text_char_count as number,
        pageCount: r.page_count as number,
        reviewerOutcome: r.reviewer_outcome as string,
        reviewTimeMinutes: r.review_time_minutes as number,
        correctionCategories: r.correction_categories as string[],
        criticalFieldsMissed: r.critical_fields_missed as string[],
        displayMode: r.display_mode as string,
        triggersFired: r.triggers_fired as string[],
        phraseClean: r.phrase_clean as boolean,
        foundProhibitedPhrases: r.found_prohibited_phrases as string[],
        admissionStatus: r.admission_status as string,
        admissionReason: r.admission_reason as string,
        countedInPilotMetrics: r.counted_in_pilot_metrics as boolean,
        coverageCountExtracted: r.coverage_count_extracted as number,
        specialConditionCount: r.special_condition_count as number,
        hasRayicDeger: r.has_rayic_deger as boolean,
        hasConditionalDeductible: r.has_conditional_deductible as boolean,
        sourceQuoteCount: r.source_quote_count as number,
        confidenceScore: r.confidence_score as number,
        zeroCoverage: r.zero_coverage as boolean,
        deductibleMiss: r.deductible_miss as boolean,
        specialConditionMiss: r.special_condition_miss as boolean,
        majorCorrection: r.major_correction as boolean,
        reviewerNotes: r.reviewer_notes as string,
      }))

      // Only evaluate records that are counted in pilot metrics
      const metricsRecords = records.filter(
        (r: { countedInPilotMetrics: boolean }) => r.countedInPilotMetrics
      )

      // Import and evaluate rollback triggers
      // Note: This is a shared module — we import it dynamically to avoid bundling client code in server
      const { getRollbackTriggerStatus } = await import(
        '../../../src/lib/analysis/kasko-pilot-gate.js' as string
      )
      const rollbackStatus = getRollbackTriggerStatus(metricsRecords)

      // Compute admission breakdown
      const admissionBreakdown = {
        pilot_eligible_clean: records.filter(
          (r: { admissionStatus: string }) => r.admissionStatus === 'pilot_eligible_clean'
        ).length,
        pilot_eligible_moderate: records.filter(
          (r: { admissionStatus: string }) => r.admissionStatus === 'pilot_eligible_moderate'
        ).length,
        pilot_ineligible_noisy: records.filter(
          (r: { admissionStatus: string }) => r.admissionStatus === 'pilot_ineligible_noisy'
        ).length,
        pilot_ineligible_incomplete: records.filter(
          (r: { admissionStatus: string }) => r.admissionStatus === 'pilot_ineligible_incomplete'
        ).length,
      }

      // ── Calibration status (D1 — Apr 2026) ────────────────────────────
      // Surface current sample count vs minimum + last-calibration audit so
      // the admin UI can render a "Pilot samples: N/50 · Next recalibration at 50"
      // tile and call out when pilot-phase overrides were used.
      const PRODUCTION_MIN_SAMPLE_SIZE = 50
      const sampleCount = metricsRecords.length
      const samplesUntilRecalibration = Math.max(0, PRODUCTION_MIN_SAMPLE_SIZE - sampleCount)

      let lastCalibration: {
        appliedAt: string
        sampleCount: number
        forced: boolean
        minSample: number
        production: boolean
        filterType: string
        thresholds: Record<string, number>
      } | null = null
      try {
        const { data: auditRow } = await supabase
          .from('app_settings')
          .select('value')
          .eq('category', 'evaluation')
          .eq('key', 'grade_thresholds_last_calibrated')
          .maybeSingle()
        if (auditRow?.value && typeof auditRow.value === 'string') {
          lastCalibration = JSON.parse(auditRow.value)
        }
      } catch (err) {
        log.warn('Failed to read grade_thresholds_last_calibrated audit row', {
          error: err instanceof Error ? err.message : String(err),
        })
      }

      res.json({
        success: true,
        data: {
          totalRecords: rows.length,
          metricsRecords: metricsRecords.length,
          shouldPause: rollbackStatus.shouldPause,
          triggers: rollbackStatus.triggers,
          admissionBreakdown,
          recentRecords: rows.slice(-10).reverse(), // Last 10 records for display
          calibration: {
            sampleCount,
            productionMinSampleSize: PRODUCTION_MIN_SAMPLE_SIZE,
            samplesUntilRecalibration,
            readyForProductionRecalibration:
              sampleCount >= PRODUCTION_MIN_SAMPLE_SIZE && !rollbackStatus.shouldPause,
            lastCalibration,
          },
        },
      })
    } catch (error) {
      log.error('Failed to get pilot rollback status', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get pilot rollback status' })
    }
  }
)

export default router
