/**
 * Notification Service
 *
 * Manages Web Push API (VAPID) push notifications for InsurAI.
 * Sends browser push notifications for policy extraction completion,
 * expiry warnings, and other user-relevant events.
 *
 * Key design decisions:
 * - All send operations are non-blocking fire-and-forget (caller should .catch())
 * - 410/404 push responses automatically remove stale subscriptions from DB
 * - Missing VAPID configuration degrades gracefully (logs warning, no crash)
 */

import webpush from 'web-push'
import type { PushSubscription } from 'web-push'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'

const log = logger.child('NotificationService')

// ---------------------------------------------------------------------------
// VAPID Configuration
// ---------------------------------------------------------------------------

// Read env vars at call time (not module load time) so tests can set them
// after import without needing to re-import the module.
let webPushConfigured = false

/**
 * Call once at server startup to initialize web-push with VAPID credentials.
 * If VAPID keys are not set, push notifications will be silently skipped.
 */
export function configureWebPush(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:contact@insurai.com'

  if (!publicKey || !privateKey) {
    log.warn('VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY not set — push notifications disabled', {
      hint: 'Generate keys: node -e "const wp=require(\'web-push\'); console.log(JSON.stringify(wp.generateVAPIDKeys(),null,2))"'
    })
    return
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    webPushConfigured = true
    log.info('Web push VAPID configured successfully')
  } catch (error) {
    log.warn('Failed to configure web push VAPID', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}

export function isWebPushConfigured(): boolean {
  return webPushConfigured
}

// ---------------------------------------------------------------------------
// Supabase Client
// ---------------------------------------------------------------------------

let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  supabase = createClient(url, key)
  return supabase
}

// ---------------------------------------------------------------------------
// Push Payload Types
// ---------------------------------------------------------------------------

export interface PushPayload {
  title: string
  body: string
  url: string
  actions?: Array<{ action: string; title: string }>
}

// ---------------------------------------------------------------------------
// Core Send Function
// ---------------------------------------------------------------------------

/**
 * Send a push notification to all registered devices for a user.
 * Automatically removes expired/revoked subscriptions (410/404 responses).
 *
 * @returns number of successful sends (0 if push not configured or no subscriptions)
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<number> {
  if (!webPushConfigured) return 0

  const db = getSupabase()
  if (!db) {
    log.warn('Cannot send push notification — Supabase not configured', { userId })
    return 0
  }

  // Fetch all subscriptions for this user
  const { data: subscriptions, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    log.warn('Failed to fetch push subscriptions', { userId, error: error.message })
    return 0
  }

  if (!subscriptions || subscriptions.length === 0) return 0

  const payloadString = JSON.stringify(payload)
  let successCount = 0
  const staleEndpoints: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const pushSubscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }

      try {
        await webpush.sendNotification(pushSubscription, payloadString)
        successCount++
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 410 || statusCode === 404) {
          // Subscription is gone — browser unsubscribed or push service removed it
          log.info('Push subscription expired, marking for removal', {
            userId, endpoint: sub.endpoint.substring(0, 50) + '...'
          })
          staleEndpoints.push(sub.endpoint)
        } else {
          log.warn('Push notification send failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
            statusCode,
          })
        }
      }
    })
  )

  // Clean up stale subscriptions (non-blocking)
  if (staleEndpoints.length > 0) {
    Promise.resolve(
      db.from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .in('endpoint', staleEndpoints)
    ).then(() => {
      log.info('Removed stale push subscriptions', { userId, count: staleEndpoints.length })
    }).catch((err: unknown) => {
      log.warn('Failed to remove stale push subscriptions', {
        userId, error: err instanceof Error ? err.message : String(err)
      })
    })
  }

  return successCount
}

// ---------------------------------------------------------------------------
// Convenience Notification Helpers
// ---------------------------------------------------------------------------

const APP_URL = process.env.FRONTEND_URL || 'https://insurai-production.up.railway.app'

/**
 * Notify user that their policy extraction completed successfully.
 */
export async function sendExtractionCompleteNotification(
  userId: string,
  policyType: string,
  policyNumber: string | null
): Promise<void> {
  const policyLabel = policyNumber
    ? `${policyType} – ${policyNumber}`
    : policyType

  await sendPushNotification(userId, {
    title: 'Analiz tamamlandı ✓',
    body: `${policyLabel} poliçenizin analizi hazır.`,
    url: `${APP_URL}/dashboard`,
    actions: [
      { action: 'view', title: 'Görüntüle' },
      { action: 'dismiss', title: 'Kapat' },
    ],
  })
}

/**
 * Notify user that a policy is expiring soon.
 */
export async function sendPolicyExpiryNotification(
  userId: string,
  policyType: string,
  policyNumber: string | null,
  daysUntilExpiry: number
): Promise<void> {
  const policyLabel = policyNumber
    ? `${policyType} – ${policyNumber}`
    : policyType

  await sendPushNotification(userId, {
    title: `Poliçe bitiyor: ${daysUntilExpiry} gün`,
    body: `${policyLabel} poliçeniz ${daysUntilExpiry} gün içinde sona erecek.`,
    url: `${APP_URL}/dashboard`,
    actions: [
      { action: 'view', title: 'Poliçeyi Gör' },
      { action: 'dismiss', title: 'Kapat' },
    ],
  })
}
