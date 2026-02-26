/**
 * Admin Content Routes
 *
 * Processing logs (Document Journey), notifications, premium benchmarks.
 */

import { Router, Response } from 'express'
import {
  authenticateAdmin,
  requireSuperAdmin,
  logAdminAction,
  getSupabaseWithError,
  qstr,
  logger,
} from './shared.js'
import type { AuthenticatedRequest } from './shared.js'
import * as processingLogService from '../../services/processing-log-service.js'
import * as adminNotificationService from '../../services/admin-notification-service.js'

const log = logger.child('AdminContent')
const router = Router()

// ============================================================================
// PROCESSING LOGS (Document Journey Tracking)
// ============================================================================

/**
 * Get processing logs with filtering and pagination
 * GET /api/admin/processing-logs
 */
router.get(
  '/processing-logs',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        status,
        ocr_used,
        ai_provider,
        from_date,
        to_date,
        search,
        limit = '50',
        offset = '0',
      } = req.query

      const filters = {
        status: status as string | undefined,
        ocr_used: ocr_used === 'true' ? true : ocr_used === 'false' ? false : undefined,
        ai_provider: ai_provider as string | undefined,
        from_date: from_date as string | undefined,
        to_date: to_date as string | undefined,
        search: search as string | undefined,
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
      }

      const result = await processingLogService.listProcessingLogs(filters)

      res.json({
        success: true,
        data: result.logs,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
      })
    } catch (error) {
      log.error('Failed to list processing logs', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to list processing logs' })
    }
  }
)

/**
 * Get processing statistics for dashboard
 * GET /api/admin/processing-logs/stats
 */
router.get(
  '/processing-logs/stats',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30
      const stats = await processingLogService.getProcessingStats(days)

      res.json({
        success: true,
        data: stats,
      })
    } catch (error) {
      log.error('Failed to get processing stats', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get processing stats' })
    }
  }
)

/**
 * Delete selected processing logs
 * DELETE /api/admin/processing-logs
 * Body: { ids: string[] } or { all: true, status?: string, before_date?: string }
 */
router.delete(
  '/processing-logs',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ids, all, status, before_date } = req.body as {
        ids?: string[]
        all?: boolean
        status?: string
        before_date?: string
      }

      let deletedCount = 0

      if (all) {
        deletedCount = await processingLogService.deleteAllProcessingLogs({
          status,
          before_date,
        })
        await logAdminAction(req, 'delete_all', 'processing_logs', undefined, undefined, {
          deletedCount,
          status,
          before_date,
        })
      } else if (ids && Array.isArray(ids) && ids.length > 0) {
        deletedCount = await processingLogService.deleteProcessingLogs(ids)
        await logAdminAction(req, 'delete', 'processing_logs', undefined, undefined, {
          deletedCount,
          ids,
        })
      } else {
        res.status(400).json({ success: false, error: 'Provide ids array or all: true' })
        return
      }

      res.json({
        success: true,
        message: `Deleted ${deletedCount} processing log${deletedCount !== 1 ? 's' : ''}`,
        deletedCount,
      })
    } catch (error) {
      log.error('Failed to delete processing logs', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to delete processing logs' })
    }
  }
)

/**
 * Get a specific processing log by document ID
 * GET /api/admin/processing-logs/:documentId
 */
router.get(
  '/processing-logs/:documentId',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const documentId = qstr(req.params.documentId)
      const logRecord = await processingLogService.getProcessingLog(documentId)

      if (!logRecord) {
        res.status(404).json({ success: false, error: 'Processing log not found' })
        return
      }

      res.json({
        success: true,
        data: logRecord,
      })
    } catch (error) {
      log.error('Failed to get processing log', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get processing log' })
    }
  }
)

/**
 * Get processing log by policy ID
 * GET /api/admin/processing-logs/by-policy/:policyId
 */
router.get(
  '/processing-logs/by-policy/:policyId',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const policyId = qstr(req.params.policyId)
      const logRecord = await processingLogService.getProcessingLogByPolicyId(policyId)

      if (!logRecord) {
        res.status(404).json({ success: false, error: 'Processing log not found for this policy' })
        return
      }

      res.json({
        success: true,
        data: logRecord,
      })
    } catch (error) {
      log.error('Failed to get processing log by policy', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get processing log' })
    }
  }
)

/**
 * Clean up old processing logs
 * POST /api/admin/processing-logs/cleanup
 */
router.post(
  '/processing-logs/cleanup',
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const daysOld = parseInt(req.body.daysOld as string) || 90
      const deletedCount = await processingLogService.deleteOldLogs(daysOld)

      // Log the action
      await logAdminAction(req, 'cleanup', 'processing_logs', undefined, undefined, {
        daysOld,
        deletedCount,
      })

      res.json({
        success: true,
        message: `Deleted ${deletedCount} logs older than ${daysOld} days`,
        deletedCount,
      })
    } catch (error) {
      log.error('Failed to cleanup processing logs', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to cleanup processing logs' })
    }
  }
)

// ============================================================================
// ADMIN NOTIFICATIONS
// ============================================================================

/**
 * Get unacknowledged notifications (for badge count)
 * GET /api/admin/notifications/unacknowledged
 */
router.get(
  '/notifications/unacknowledged',
  authenticateAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const notifications = await adminNotificationService.getUnacknowledgedNotifications()
      res.json({
        success: true,
        data: notifications,
        count: notifications.length,
      })
    } catch (error) {
      log.error('Failed to get unacknowledged notifications', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get notifications' })
    }
  }
)

/**
 * Get all notifications with pagination
 * GET /api/admin/notifications
 */
router.get(
  '/notifications',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50
      const offset = parseInt(req.query.offset as string) || 0
      const category = req.query.category as
        | adminNotificationService.NotificationCategory
        | undefined

      const result = await adminNotificationService.getNotifications({ limit, offset, category })
      res.json({
        success: true,
        data: result.notifications,
        total: result.total,
        limit,
        offset,
      })
    } catch (error) {
      log.error('Failed to get notifications', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to get notifications' })
    }
  }
)

/**
 * Acknowledge a notification
 * POST /api/admin/notifications/:id/acknowledge
 */
router.post(
  '/notifications/:id/acknowledge',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)
      const acknowledgedBy = req.adminUser?.email || 'unknown'

      const success = await adminNotificationService.acknowledgeNotification(id, acknowledgedBy)

      if (!success) {
        res.status(404).json({ success: false, error: 'Notification not found' })
        return
      }

      // Log action
      await logAdminAction(req, 'acknowledge', 'notification', id)

      res.json({ success: true, message: 'Notification acknowledged' })
    } catch (error) {
      log.error('Failed to acknowledge notification', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to acknowledge notification' })
    }
  }
)

/**
 * Acknowledge all notifications
 * POST /api/admin/notifications/acknowledge-all
 */
router.post(
  '/notifications/acknowledge-all',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const acknowledgedBy = req.adminUser?.email || 'unknown'
      const notifications = await adminNotificationService.getUnacknowledgedNotifications()

      let acknowledgedCount = 0
      for (const notification of notifications) {
        if (notification.id) {
          const success = await adminNotificationService.acknowledgeNotification(
            notification.id,
            acknowledgedBy
          )
          if (success) acknowledgedCount++
        }
      }

      // Log action
      await logAdminAction(req, 'acknowledge_all', 'notifications', undefined, undefined, {
        count: acknowledgedCount,
      })

      res.json({
        success: true,
        message: `Acknowledged ${acknowledgedCount} notifications`,
        acknowledgedCount,
      })
    } catch (error) {
      log.error('Failed to acknowledge all notifications', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to acknowledge notifications' })
    }
  }
)

/**
 * Delete selected notifications
 * DELETE /api/admin/notifications
 * Body: { ids: string[] } or { all: true, category?: string, acknowledged?: boolean }
 */
router.delete(
  '/notifications',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ids, all, category, acknowledged } = req.body as {
        ids?: string[]
        all?: boolean
        category?: adminNotificationService.NotificationCategory
        acknowledged?: boolean
      }

      let deletedCount = 0

      if (all) {
        deletedCount = await adminNotificationService.deleteAllNotifications({
          category,
          acknowledged,
        })
        await logAdminAction(req, 'delete_all', 'notifications', undefined, undefined, {
          deletedCount,
          category,
          acknowledged,
        })
      } else if (ids && Array.isArray(ids) && ids.length > 0) {
        deletedCount = await adminNotificationService.deleteNotifications(ids)
        await logAdminAction(req, 'delete', 'notifications', undefined, undefined, {
          deletedCount,
          ids,
        })
      } else {
        res.status(400).json({ success: false, error: 'Provide ids array or all: true' })
        return
      }

      res.json({
        success: true,
        message: `Deleted ${deletedCount} notification${deletedCount !== 1 ? 's' : ''}`,
        deletedCount,
      })
    } catch (error) {
      log.error('Failed to delete notifications', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to delete notifications' })
    }
  }
)

// ============================================================================
// PREMIUM BENCHMARKS MANAGEMENT
// ============================================================================

/**
 * Premium Benchmark interface for admin management
 */
interface PremiumBenchmark {
  id: string
  insurance_type: string
  insurance_type_tr: string
  sub_type: string | null
  sub_type_tr: string | null
  min_premium: number
  avg_premium: number
  max_premium: number
  comparison_method: 'direct_premium' | 'value_based'
  value_min_rate: number | null
  value_avg_rate: number | null
  value_max_rate: number | null
  currency: string
  year: number
  source: string | null
  source_tr: string | null
  notes: string | null
  notes_tr: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Get all premium benchmarks
 * GET /api/admin/benchmarks
 */
router.get('/benchmarks', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { insurance_type, is_active } = req.query
    const { client: supabase, error: supabaseError } = getSupabaseWithError()

    if (!supabase) {
      res.status(503).json({ success: false, error: supabaseError || 'Database not configured' })
      return
    }

    let query = supabase
      .from('premium_benchmarks')
      .select('*')
      .order('insurance_type', { ascending: true })
      .order('sub_type', { ascending: true })

    if (insurance_type) {
      query = query.eq('insurance_type', insurance_type)
    }

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true')
    }

    const { data, error } = await query

    if (error) {
      log.error('Failed to fetch benchmarks', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to fetch benchmarks' })
      return
    }

    res.json({ success: true, data: data as PremiumBenchmark[] })
  } catch (error) {
    log.error('Failed to fetch benchmarks', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ success: false, error: 'Failed to fetch benchmarks' })
  }
})

/**
 * Get a specific benchmark
 * GET /api/admin/benchmarks/:id
 */
router.get(
  '/benchmarks/:id',
  authenticateAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)
      const { client: supabase, error: supabaseError } = getSupabaseWithError()

      if (!supabase) {
        res.status(503).json({ success: false, error: supabaseError || 'Database not configured' })
        return
      }

      const { data, error } = await supabase
        .from('premium_benchmarks')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        res.status(404).json({ success: false, error: 'Benchmark not found' })
        return
      }

      res.json({ success: true, data: data as PremiumBenchmark })
    } catch (error) {
      log.error('Failed to fetch benchmark', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to fetch benchmark' })
    }
  }
)

/**
 * Create a new benchmark
 * POST /api/admin/benchmarks
 */
router.post(
  '/benchmarks',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        insurance_type,
        insurance_type_tr,
        sub_type,
        sub_type_tr,
        min_premium,
        avg_premium,
        max_premium,
        comparison_method,
        value_min_rate,
        value_avg_rate,
        value_max_rate,
        currency,
        year,
        source,
        source_tr,
        notes,
        notes_tr,
      } = req.body

      if (
        !insurance_type ||
        !insurance_type_tr ||
        min_premium === undefined ||
        avg_premium === undefined ||
        max_premium === undefined
      ) {
        res.status(400).json({
          success: false,
          error:
            'insurance_type, insurance_type_tr, min_premium, avg_premium, and max_premium are required',
        })
        return
      }

      const { client: supabase, error: supabaseError } = getSupabaseWithError()

      if (!supabase) {
        res.status(503).json({ success: false, error: supabaseError || 'Database not configured' })
        return
      }

      const { data, error } = await supabase
        .from('premium_benchmarks')
        .insert({
          insurance_type,
          insurance_type_tr,
          sub_type: sub_type || null,
          sub_type_tr: sub_type_tr || null,
          min_premium: parseFloat(min_premium),
          avg_premium: parseFloat(avg_premium),
          max_premium: parseFloat(max_premium),
          comparison_method: comparison_method || 'direct_premium',
          value_min_rate: value_min_rate ? parseFloat(value_min_rate) : null,
          value_avg_rate: value_avg_rate ? parseFloat(value_avg_rate) : null,
          value_max_rate: value_max_rate ? parseFloat(value_max_rate) : null,
          currency: currency || 'TRY',
          year: year || new Date().getFullYear(),
          source: source || null,
          source_tr: source_tr || null,
          notes: notes || null,
          notes_tr: notes_tr || null,
          is_active: true,
          created_by: req.adminUser?.id || null,
        })
        .select()
        .single()

      if (error) {
        log.error('Failed to create benchmark', {
          error: error instanceof Error ? error.message : String(error),
        })
        res.status(500).json({ success: false, error: 'Failed to create benchmark' })
        return
      }

      // Log action
      await logAdminAction(req, 'create', 'premium_benchmark', data.id, undefined, {
        insurance_type,
        sub_type,
      })

      res.json({ success: true, data: data as PremiumBenchmark })
    } catch (error) {
      log.error('Failed to create benchmark', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to create benchmark' })
    }
  }
)

/**
 * Update a benchmark
 * PUT /api/admin/benchmarks/:id
 */
router.put(
  '/benchmarks/:id',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)
      const updates = req.body

      const { client: supabase, error: supabaseError } = getSupabaseWithError()

      if (!supabase) {
        res.status(503).json({ success: false, error: supabaseError || 'Database not configured' })
        return
      }

      // Get existing for audit log
      const { data: existing } = await supabase
        .from('premium_benchmarks')
        .select('*')
        .eq('id', id)
        .single()

      if (!existing) {
        res.status(404).json({ success: false, error: 'Benchmark not found' })
        return
      }

      // Prepare update object
      const updateData: Record<string, unknown> = {
        updated_by: req.adminUser?.id || null,
      }

      // Only include fields that are explicitly provided
      const allowedFields = [
        'insurance_type',
        'insurance_type_tr',
        'sub_type',
        'sub_type_tr',
        'min_premium',
        'avg_premium',
        'max_premium',
        'comparison_method',
        'value_min_rate',
        'value_avg_rate',
        'value_max_rate',
        'currency',
        'year',
        'source',
        'source_tr',
        'notes',
        'notes_tr',
        'is_active',
      ]

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          // Parse numeric fields
          if (
            [
              'min_premium',
              'avg_premium',
              'max_premium',
              'value_min_rate',
              'value_avg_rate',
              'value_max_rate',
            ].includes(field)
          ) {
            updateData[field] = updates[field] !== null ? parseFloat(updates[field]) : null
          } else if (field === 'year') {
            updateData[field] = parseInt(updates[field])
          } else {
            updateData[field] = updates[field]
          }
        }
      }

      const { data, error } = await supabase
        .from('premium_benchmarks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        log.error('Failed to update benchmark', {
          error: error instanceof Error ? error.message : String(error),
        })
        res.status(500).json({ success: false, error: 'Failed to update benchmark' })
        return
      }

      // Log action
      await logAdminAction(req, 'update', 'premium_benchmark', id, existing, updates)

      res.json({ success: true, data: data as PremiumBenchmark })
    } catch (error) {
      log.error('Failed to update benchmark', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to update benchmark' })
    }
  }
)

/**
 * Delete a benchmark (soft delete by setting is_active = false)
 * DELETE /api/admin/benchmarks/:id
 */
router.delete(
  '/benchmarks/:id',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = qstr(req.params.id)
      const { client: supabase, error: supabaseError } = getSupabaseWithError()

      if (!supabase) {
        res.status(503).json({ success: false, error: supabaseError || 'Database not configured' })
        return
      }

      // Soft delete
      const { error } = await supabase
        .from('premium_benchmarks')
        .update({ is_active: false, updated_by: req.adminUser?.id || null })
        .eq('id', id)

      if (error) {
        log.error('Failed to delete benchmark', {
          error: error instanceof Error ? error.message : String(error),
        })
        res.status(500).json({ success: false, error: 'Failed to delete benchmark' })
        return
      }

      // Log action
      await logAdminAction(req, 'delete', 'premium_benchmark', id)

      res.json({ success: true, message: 'Benchmark deactivated' })
    } catch (error) {
      log.error('Failed to delete benchmark', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to delete benchmark' })
    }
  }
)

/**
 * Get available insurance types for dropdown
 * GET /api/admin/benchmarks/insurance-types
 */
router.get(
  '/benchmarks/insurance-types',
  authenticateAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const { client: supabase, error: supabaseError } = getSupabaseWithError()

      if (!supabase) {
        res.status(503).json({ success: false, error: supabaseError || 'Database not configured' })
        return
      }

      const { data, error } = await supabase
        .from('premium_benchmarks')
        .select('insurance_type, insurance_type_tr')
        .eq('is_active', true)

      if (error) {
        log.error('Failed to fetch insurance types', {
          error: error instanceof Error ? error.message : String(error),
        })
        res.status(500).json({ success: false, error: 'Failed to fetch insurance types' })
        return
      }

      // Get unique types
      const types = [
        ...new Map(
          data.map((item: { insurance_type: string; insurance_type_tr: string }) => [
            item.insurance_type,
            item,
          ])
        ).values(),
      ]

      res.json({ success: true, data: types })
    } catch (error) {
      log.error('Failed to fetch insurance types', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to fetch insurance types' })
    }
  }
)

/**
 * Bulk update benchmarks for a specific year
 * PUT /api/admin/benchmarks/bulk-update
 */
router.put(
  '/benchmarks/bulk-update',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { year, multiplier, insurance_type } = req.body

      if (!year || !multiplier) {
        res.status(400).json({
          success: false,
          error: 'year and multiplier are required',
        })
        return
      }

      const { client: supabase, error: supabaseError } = getSupabaseWithError()

      if (!supabase) {
        res.status(503).json({ success: false, error: supabaseError || 'Database not configured' })
        return
      }

      // Get all active benchmarks for the type (or all if not specified)
      let query = supabase.from('premium_benchmarks').select('*').eq('is_active', true)

      if (insurance_type) {
        query = query.eq('insurance_type', insurance_type)
      }

      const { data: benchmarks, error: fetchError } = await query

      if (fetchError) {
        log.error('Failed to fetch benchmarks for bulk update', {
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        })
        res.status(500).json({ success: false, error: 'Failed to fetch benchmarks' })
        return
      }

      // Update each benchmark
      const mult = parseFloat(multiplier)
      let updatedCount = 0

      for (const benchmark of benchmarks || []) {
        const { error: updateError } = await supabase
          .from('premium_benchmarks')
          .update({
            min_premium: Math.round(benchmark.min_premium * mult),
            avg_premium: Math.round(benchmark.avg_premium * mult),
            max_premium: Math.round(benchmark.max_premium * mult),
            year: parseInt(year),
            updated_by: req.adminUser?.id || null,
          })
          .eq('id', benchmark.id)

        if (!updateError) {
          updatedCount++
        }
      }

      // Log action
      await logAdminAction(req, 'bulk_update', 'premium_benchmarks', undefined, undefined, {
        year,
        multiplier,
        insurance_type: insurance_type || 'all',
        updatedCount,
      })

      res.json({
        success: true,
        message: `Updated ${updatedCount} benchmarks`,
        updatedCount,
      })
    } catch (error) {
      log.error('Failed to bulk update benchmarks', {
        error: error instanceof Error ? error.message : String(error),
      })
      res.status(500).json({ success: false, error: 'Failed to bulk update benchmarks' })
    }
  }
)

export default router
