/**
 * Internal cron routes — NOT exposed to the public internet.
 *
 * All endpoints require a `Authorization: Bearer <CRON_SECRET>` header.
 * The secret is compared with constant-time crypto.timingSafeEqual to
 * prevent timing attacks.
 *
 * Triggered by .github/workflows/notify-expiring.yml (daily at 08:00 UTC).
 */

import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import {
  sendPolicyExpiryNotification,
  isWebPushConfigured,
} from '../services/notification-service.js'
import { logger } from '../lib/logger.js'

const router = Router()
const log = logger.child('internal-cron')

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    log.warn('CRON_SECRET not set — rejecting all cron requests')
    res.status(503).json({ success: false, error: 'CRON_SECRET not configured' })
    return false
  }

  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  // Constant-time comparison to prevent timing attacks
  const secretBuf = Buffer.from(secret)
  const tokenBuf = Buffer.from(token)
  const valid =
    secretBuf.length === tokenBuf.length &&
    crypto.timingSafeEqual(secretBuf, tokenBuf)

  if (!valid) {
    log.warn('Cron request rejected — invalid CRON_SECRET', {
      ip: req.ip,
      path: req.path,
    })
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Supabase (service-role, bypasses RLS so we can read all users' policies)
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// POST /api/internal/cron/notify-expiring
//
// Queries policies expiring in exactly NOTIFY_DAYS_BEFORE days (default: 7,
// 14, 30) and sends a push notification to the policy owner for each one.
//
// Idempotent: safe to call multiple times on the same day — each day maps
// to exactly one of the window thresholds, so a policy is only notified once
// per window.
// ---------------------------------------------------------------------------

const NOTIFY_WINDOWS = [7, 14, 30] // days before expiry

interface ExpiringPolicy {
  id: string
  user_id: string
  policy_number: string
  type: string
  expiry_date: string
}

router.post('/cron/notify-expiring', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return

  if (!isWebPushConfigured()) {
    log.warn('notify-expiring: web push not configured, skipping')
    return res.json({ success: true, skipped: true, reason: 'push_not_configured' })
  }

  const db = getSupabase()
  if (!db) {
    log.warn('notify-expiring: Supabase not configured')
    return res.status(503).json({ success: false, error: 'Database not configured' })
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const results: Record<number, { found: number; sent: number; errors: number }> = {}
  let totalSent = 0
  let totalErrors = 0

  for (const daysBefore of NOTIFY_WINDOWS) {
    const targetDate = new Date(today)
    targetDate.setUTCDate(targetDate.getUTCDate() + daysBefore)
    const targetDateStr = targetDate.toISOString().split('T')[0] // YYYY-MM-DD

    const { data: policies, error } = await db
      .from('policies')
      .select('id, user_id, policy_number, type, expiry_date')
      .eq('expiry_date', targetDateStr)
      .in('status', ['active', 'expiring'])

    if (error) {
      log.warn('notify-expiring: query failed', { daysBefore, error: error.message })
      results[daysBefore] = { found: 0, sent: 0, errors: 1 }
      totalErrors++
      continue
    }

    const bucket = { found: (policies ?? []).length, sent: 0, errors: 0 }

    for (const policy of (policies ?? []) as ExpiringPolicy[]) {
      try {
        await sendPolicyExpiryNotification(
          policy.user_id,
          policy.type,
          policy.policy_number,
          daysBefore,
        )
        bucket.sent++
        totalSent++
      } catch (err) {
        log.warn('notify-expiring: failed to send notification', {
          policyId: policy.id,
          userId: policy.user_id,
          error: err instanceof Error ? err.message : String(err),
        })
        bucket.errors++
        totalErrors++
      }
    }

    results[daysBefore] = bucket
    log.info('notify-expiring: window processed', {
      daysBefore,
      targetDate: targetDateStr,
      ...bucket,
    })
  }

  log.info('notify-expiring: run complete', { totalSent, totalErrors })
  return res.json({ success: true, totalSent, totalErrors, windows: results })
})

export default router
