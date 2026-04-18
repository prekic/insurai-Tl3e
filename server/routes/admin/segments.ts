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

// =============================================================================
// Email → UUID resolver (opt-in, env-gated)
// =============================================================================

/**
 * The resolver exposes `auth.users.email` to admins. It is OPT-IN:
 * operators must explicitly set `ENABLE_ADMIN_EMAIL_RESOLVER=true` in the
 * server environment after a privacy review. Default: disabled (returns 403).
 *
 * Why env var instead of a DB feature flag?
 *   - Zero migration cost
 *   - Can't be toggled via the admin panel (avoids accidental enable)
 *   - Explicit operational decision required at deploy time
 *
 * Rate-limit: caller can request ≤ RESOLVE_MAX_EMAILS emails per call, and
 * we page through auth.users up to RESOLVE_MAX_USER_LIST. If the platform
 * has more users than the latter, the response includes
 * `cappedAtUserListLimit: true` so the operator knows partial data came back.
 */
const RESOLVE_MAX_EMAILS = 50
const RESOLVE_MAX_USER_LIST = 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isResolverEnabled(): boolean {
  return process.env.ENABLE_ADMIN_EMAIL_RESOLVER === 'true'
}

/**
 * Resolve a batch of emails to Supabase auth user UUIDs.
 * POST /api/admin/app-users/resolve-emails
 * Body: { emails: string[] }
 * Returns: { resolved: Array<{ email, userId }>, missing: string[], cappedAtUserListLimit: boolean }
 */
router.post(
  '/app-users/resolve-emails',
  ...requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isResolverEnabled()) {
        res.status(403).json({
          success: false,
          error: 'Email resolver is disabled.',
          code: 'RESOLVER_DISABLED',
          hint: 'Set ENABLE_ADMIN_EMAIL_RESOLVER=true in the server environment after a privacy review.',
        })
        return
      }

      const { emails } = (req.body ?? {}) as { emails?: unknown }
      if (!Array.isArray(emails) || emails.length === 0) {
        res
          .status(400)
          .json({ success: false, error: 'Body must be { emails: string[] } with ≥ 1 entry' })
        return
      }
      if (emails.length > RESOLVE_MAX_EMAILS) {
        res.status(400).json({
          success: false,
          error: `Too many emails (max ${RESOLVE_MAX_EMAILS})`,
        })
        return
      }

      // Normalize + validate
      const normalized: string[] = []
      for (const raw of emails) {
        if (typeof raw !== 'string') continue
        const trimmed = raw.trim().toLowerCase()
        if (!trimmed || !EMAIL_REGEX.test(trimmed)) continue
        if (!normalized.includes(trimmed)) normalized.push(trimmed)
      }
      if (normalized.length === 0) {
        res.status(400).json({ success: false, error: 'No valid email addresses in request' })
        return
      }

      const { client: supabase, error: dbError } = getSupabaseWithError()
      if (!supabase) {
        res.status(503).json({ success: false, error: dbError || 'Database not configured' })
        return
      }

      // Page through auth.users up to RESOLVE_MAX_USER_LIST.
      // Supabase admin API paginates 1-indexed; perPage capped at 1000.
      const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: RESOLVE_MAX_USER_LIST,
      })
      if (listErr) {
        log.error('auth.admin.listUsers failed for email resolver', { error: listErr.message })
        res.status(500).json({ success: false, error: 'Failed to load user list' })
        return
      }

      const users = listData?.users ?? []
      const byEmail = new Map<string, string>()
      for (const u of users) {
        if (u.email) byEmail.set(u.email.toLowerCase(), u.id)
      }

      const resolved: Array<{ email: string; userId: string }> = []
      const missing: string[] = []
      for (const email of normalized) {
        const id = byEmail.get(email)
        if (id) resolved.push({ email, userId: id })
        else missing.push(email)
      }

      const cappedAtUserListLimit = users.length >= RESOLVE_MAX_USER_LIST

      await logAdminAction(req, 'view', 'auth_users', undefined, undefined, {
        emails_requested: normalized.length,
        emails_resolved: resolved.length,
        emails_missing: missing.length,
        capped: cappedAtUserListLimit,
      })

      res.json({
        success: true,
        data: { resolved, missing, cappedAtUserListLimit },
      })
    } catch (error) {
      log.error('Email resolver failed', { error: String(error) })
      res.status(500).json({ success: false, error: 'Email resolver failed' })
    }
  }
)

export default router
