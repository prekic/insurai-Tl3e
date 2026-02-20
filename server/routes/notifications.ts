/**
 * Notification API Routes
 *
 * Web Push API (VAPID) subscription management for browser push notifications.
 * Allows users to subscribe/unsubscribe their browser and check subscription status.
 *
 * Authentication: Supabase user JWT via x-user-id header (same pattern as email routes).
 * Rate limiting: authLimiter (10 req/15min) on mutating endpoints.
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'
import { authLimiter } from '../middleware/rate-limit.js'
import {
  getVapidPublicKey,
  isWebPushConfigured,
} from '../services/notification-service.js'

const log = logger.child('NotificationRoutes')
const router = Router()

// ---------------------------------------------------------------------------
// Supabase client (service role for writing subscriptions)
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const subscribeSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL'),
  keys: z.object({
    p256dh: z.string().min(10, 'p256dh key required'),
    auth: z.string().min(10, 'auth key required'),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL'),
})

// ---------------------------------------------------------------------------
// Helper: Extract and validate userId from request headers
// ---------------------------------------------------------------------------

function extractUserId(req: Request): string | null {
  const userId = req.headers['x-user-id'] as string | undefined
  return userId && userId.length > 0 ? userId : null
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/notifications/public-key
 * Returns the VAPID public key for the browser to create a subscription.
 * No authentication required — the public key is safe to expose.
 */
router.get('/public-key', (_req: Request, res: Response) => {
  const publicKey = getVapidPublicKey()
  if (!publicKey) {
    return res.status(503).json({
      success: false,
      error: 'Push notifications not configured',
      code: 'PUSH_NOT_CONFIGURED',
    })
  }
  return res.json({ success: true, publicKey })
})

/**
 * GET /api/notifications/status
 * Returns whether the current user has any active push subscriptions.
 * Requires x-user-id header.
 */
router.get('/status', async (req: Request, res: Response) => {
  const userId = extractUserId(req)
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const db = getSupabase()
  if (!db) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  try {
    const { data, error, count } = await db
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (error) {
      log.warn('Failed to check push subscription status', { userId, error: error.message })
      return res.status(500).json({ success: false, error: 'Database error' })
    }

    return res.json({
      success: true,
      subscribed: (count ?? 0) > 0,
      deviceCount: count ?? 0,
    })
  } catch (error) {
    log.error('Unexpected error in status check', {
      userId, error: error instanceof Error ? error.message : String(error)
    })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * POST /api/notifications/subscribe
 * Register a push subscription for the current user/browser.
 * Upserts on (user_id, endpoint) — safe to call repeatedly.
 * Rate limited: 10 req/15min.
 */
router.post('/subscribe', authLimiter, async (req: Request, res: Response) => {
  const userId = extractUserId(req)
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  if (!isWebPushConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Push notifications not configured',
      code: 'PUSH_NOT_CONFIGURED',
    })
  }

  const parsed = subscribeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid subscription payload',
      details: parsed.error.issues,
    })
  }

  const { endpoint, keys } = parsed.data
  const db = getSupabase()
  if (!db) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const userAgent = (req.headers['user-agent'] as string | undefined)?.substring(0, 500)

  try {
    const { error } = await db.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    )

    if (error) {
      log.warn('Failed to store push subscription', { userId, error: error.message })
      return res.status(500).json({ success: false, error: 'Failed to store subscription' })
    }

    log.info('Push subscription registered', {
      userId,
      endpoint: endpoint.substring(0, 50) + '...',
    })
    return res.json({ success: true })
  } catch (error) {
    log.error('Unexpected error storing subscription', {
      userId, error: error instanceof Error ? error.message : String(error)
    })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

/**
 * DELETE /api/notifications/unsubscribe
 * Remove a push subscription for the current user/browser.
 * Rate limited: 10 req/15min.
 */
router.delete('/unsubscribe', authLimiter, async (req: Request, res: Response) => {
  const userId = extractUserId(req)
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const parsed = unsubscribeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'endpoint required',
      details: parsed.error.issues,
    })
  }

  const { endpoint } = parsed.data
  const db = getSupabase()
  if (!db) {
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  try {
    const { error } = await db
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)

    if (error) {
      log.warn('Failed to remove push subscription', { userId, error: error.message })
      return res.status(500).json({ success: false, error: 'Failed to remove subscription' })
    }

    log.info('Push subscription removed', {
      userId,
      endpoint: endpoint.substring(0, 50) + '...',
    })
    return res.json({ success: true })
  } catch (error) {
    log.error('Unexpected error removing subscription', {
      userId, error: error instanceof Error ? error.message : String(error)
    })
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

export default router
