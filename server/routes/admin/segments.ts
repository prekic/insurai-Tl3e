/**
 * Admin Segment Management Routes
 *
 * Endpoints for managing user_segments (e.g., kasko_pilot_reviewers).
 * All endpoints require super admin auth.
 */

import { Router, Response } from 'express'
import { logger } from '../../lib/logger.js'

const log = logger.child('AdminSegments')
import { requireSuperAdmin, logAdminAction, getSupabaseWithError, qstr } from './shared.js'
import type { AuthenticatedRequest } from './shared.js'

const router = Router()

// Allowlist of valid segment names to prevent arbitrary table queries
const VALID_SEGMENT_NAMES = ['kasko_pilot_reviewers'] as const
type ValidSegmentName = (typeof VALID_SEGMENT_NAMES)[number]

function isValidSegmentName(name: string): name is ValidSegmentName {
  return (VALID_SEGMENT_NAMES as readonly string[]).includes(name)
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value)
}

/**
 * List all users in a given segment
 * GET /api/admin/segments?name=kasko_pilot_reviewers
 */
router.get(
  '/segments',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const segmentName = qstr(req.query.name as string)
      if (!segmentName) {
        res.status(400).json({
          success: false,
          error: 'Query parameter "name" is required',
        })
        return
      }
      if (!isValidSegmentName(segmentName)) {
        res.status(400).json({
          success: false,
          error: `Invalid segment name. Valid segments: ${VALID_SEGMENT_NAMES.join(', ')}`,
        })
        return
      }

      const { client: supabase, error: dbError } = getSupabaseWithError()
      if (!supabase) {
        res.status(503).json({ success: false, error: dbError || 'Database not configured' })
        return
      }

      const { data, error } = await supabase
        .from('user_segments')
        .select('id, user_id, segment_name, assigned_at, assigned_by')
        .eq('segment_name', segmentName)
        .order('assigned_at', { ascending: false })

      if (error) {
        log.warn('Failed to list segment users', {
          segment: segmentName,
          error: error.message,
        })
        // Table may not exist yet — graceful degradation
        res.json({ success: true, data: [] })
        return
      }

      await logAdminAction(req, 'view', 'user_segments', undefined, undefined, {
        segment: segmentName,
      })

      res.json({ success: true, data: data || [] })
    } catch (error) {
      log.error('Failed to list segment users', { error: String(error) })
      res.status(500).json({ success: false, error: 'Failed to list segment users' })
    }
  }
)

/**
 * Get segments for a specific user
 * GET /api/admin/segments/user/:userId
 */
router.get(
  '/segments/user/:userId',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = qstr(req.params.userId)
      if (!isValidUUID(userId)) {
        res.status(400).json({ success: false, error: 'userId must be a valid UUID' })
        return
      }

      const { client: supabase, error: dbError } = getSupabaseWithError()
      if (!supabase) {
        res.status(503).json({ success: false, error: dbError || 'Database not configured' })
        return
      }

      const { data, error } = await supabase
        .from('user_segments')
        .select('id, user_id, segment_name, assigned_at, assigned_by')
        .eq('user_id', userId)

      if (error) {
        log.warn('Failed to get user segments', {
          userId,
          error: error.message,
        })
        res.json({ success: true, data: [] })
        return
      }

      res.json({ success: true, data: data || [] })
    } catch (error) {
      log.error('Failed to get user segments', { error: String(error) })
      res.status(500).json({ success: false, error: 'Failed to get user segments' })
    }
  }
)

/**
 * Add user to a segment
 * POST /api/admin/segments
 * Body: { userId: string, segmentName: string }
 */
router.post(
  '/segments',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, segmentName } = req.body

      if (!userId || !segmentName) {
        res.status(400).json({
          success: false,
          error: 'userId and segmentName are required',
        })
        return
      }
      if (!isValidUUID(userId)) {
        res.status(400).json({ success: false, error: 'userId must be a valid UUID' })
        return
      }
      if (!isValidSegmentName(segmentName)) {
        res.status(400).json({
          success: false,
          error: `Invalid segment name. Valid segments: ${VALID_SEGMENT_NAMES.join(', ')}`,
        })
        return
      }

      const { client: supabase, error: dbError } = getSupabaseWithError()
      if (!supabase) {
        res.status(503).json({ success: false, error: dbError || 'Database not configured' })
        return
      }

      const assignedBy = req.adminUser?.email || 'admin'

      const { data, error } = await supabase
        .from('user_segments')
        .insert({
          user_id: userId,
          segment_name: segmentName,
          assigned_by: assignedBy,
        })
        .select()
        .single()

      if (error) {
        // Handle unique constraint violation (already assigned)
        if (error.code === '23505') {
          res.status(409).json({
            success: false,
            error: 'User is already in this segment',
            code: 'ALREADY_ASSIGNED',
          })
          return
        }
        log.error('Failed to add user to segment', {
          userId,
          segmentName,
          error: error.message,
        })
        res.status(500).json({ success: false, error: 'Failed to add user to segment' })
        return
      }

      await logAdminAction(req, 'create', 'user_segment', userId, undefined, {
        segmentName,
        assignedBy,
      })

      log.info('User added to segment', { userId, segmentName, assignedBy })
      res.json({ success: true, data })
    } catch (error) {
      log.error('Failed to add user to segment', { error: String(error) })
      res.status(500).json({ success: false, error: 'Failed to add user to segment' })
    }
  }
)

/**
 * Remove user from a segment
 * DELETE /api/admin/segments/:userId/:segmentName
 */
router.delete(
  '/segments/:userId/:segmentName',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = qstr(req.params.userId)
      const segmentName = qstr(req.params.segmentName)

      if (!userId || !segmentName) {
        res.status(400).json({
          success: false,
          error: 'userId and segmentName are required',
        })
        return
      }
      if (!isValidUUID(userId)) {
        res.status(400).json({ success: false, error: 'userId must be a valid UUID' })
        return
      }
      if (!isValidSegmentName(segmentName)) {
        res.status(400).json({
          success: false,
          error: `Invalid segment name. Valid segments: ${VALID_SEGMENT_NAMES.join(', ')}`,
        })
        return
      }

      const { client: supabase, error: dbError } = getSupabaseWithError()
      if (!supabase) {
        res.status(503).json({ success: false, error: dbError || 'Database not configured' })
        return
      }

      const { error, count } = await supabase
        .from('user_segments')
        .delete()
        .eq('user_id', userId)
        .eq('segment_name', segmentName)

      if (error) {
        log.error('Failed to remove user from segment', {
          userId,
          segmentName,
          error: error.message,
        })
        res.status(500).json({ success: false, error: 'Failed to remove user from segment' })
        return
      }

      await logAdminAction(req, 'delete', 'user_segment', userId, undefined, {
        segmentName,
      })

      log.info('User removed from segment', { userId, segmentName, count })
      res.json({ success: true, message: 'User removed from segment' })
    } catch (error) {
      log.error('Failed to remove user from segment', { error: String(error) })
      res.status(500).json({ success: false, error: 'Failed to remove user from segment' })
    }
  }
)

export default router
