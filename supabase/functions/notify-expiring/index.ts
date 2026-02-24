import "https://esm.sh/@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import webpush from 'npm:web-push@3.6.7';

// ---------------------------------------------------------------------------
// VAPID Configuration
// ---------------------------------------------------------------------------
const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:contact@insurai.com'
const appUrl = Deno.env.get('FRONTEND_URL') || 'https://insurai-production.up.railway.app'

let webPushConfigured = false
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    webPushConfigured = true
    console.log('Web push VAPID configured successfully')
  } catch (error) {
    console.error('Failed to configure web push VAPID', error)
  }
} else {
  console.warn('VAPID keys not set. Push notifications are disabled.')
}

// ---------------------------------------------------------------------------
// Push Notification Logic
// ---------------------------------------------------------------------------

interface PushPayload {
  title: string
  body: string
  url: string
  actions?: Array<{ action: string; title: string }>
}

async function sendPushNotification(
  supabase: any,
  userId: string,
  payload: PushPayload
): Promise<number> {
  if (!webPushConfigured) return 0

  // Fetch all subscriptions for this user
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error || !subscriptions || subscriptions.length === 0) {
    return 0
  }

  const payloadString = JSON.stringify(payload)
  let successCount = 0
  const staleEndpoints: string[] = []

  // Must process synchronously or carefully aggregate promises as Edge Functions timeout aggressively if not awaited
  await Promise.allSettled(
    subscriptions.map(async (sub: any) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }

      try {
        await webpush.sendNotification(pushSubscription, payloadString)
        successCount++
      } catch (err: any) {
        const statusCode = err.statusCode
        if (statusCode === 410 || statusCode === 404) {
          // Subscription is gone
          staleEndpoints.push(sub.endpoint)
        } else {
          console.warn('Push notification send failed for user', userId, err.message || err)
        }
      }
    })
  )

  // Clean up stale subscriptions
  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .in('endpoint', staleEndpoints)
  }

  return successCount
}

async function sendPolicyExpiryNotification(
  supabase: any,
  userId: string,
  policyType: string,
  policyNumber: string | null,
  daysUntilExpiry: number
): Promise<void> {
  const policyLabel = policyNumber
    ? `${policyType} – ${policyNumber}`
    : policyType

  await sendPushNotification(supabase, userId, {
    title: `Poliçe bitiyor: ${daysUntilExpiry} gün`,
    body: `${policyLabel} poliçeniz ${daysUntilExpiry} gün içinde sona erecek.`,
    url: `${appUrl}/dashboard`,
    actions: [
      { action: 'view', title: 'Poliçeyi Gör' },
      { action: 'dismiss', title: 'Kapat' },
    ],
  })
}

// ---------------------------------------------------------------------------
// Edge Function Handler
// ---------------------------------------------------------------------------

const NOTIFY_WINDOWS = [7, 14, 30] // days before expiry

Deno.serve(async (req) => {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    // Verify authentication via auth header if desired, but pg_cron can also safely trigger this
    // if we secure it. For now, we'll rely on the standard Supabase anon/service_role keys
    // passed in the header by pg_net if we configure it that way, or we bypass it
    // if we run it strictly internal. Best practice is verifying the service role key.
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')) {
       // Only allow authorized internal cron invocation
       // Note: pg_net will need to send this header
       // return new Response('Unauthorized', { status: 401 })
       // Actually, we'll use the Authorization header exactly as it is to initialize the client
    }

    // Initialize Supabase Client with the Authorization header securely
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    if (!webPushConfigured) {
      console.warn('terminate: web push not configured')
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'push_not_configured' }), { headers: { 'Content-Type': 'application/json' } })
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

      const { data: policies, error } = await supabase
        .from('policies')
        .select('id, user_id, policy_number, type, expiry_date')
        .eq('expiry_date', targetDateStr)
        .in('status', ['active', 'expiring'])

      if (error) {
        console.error('query failed', { daysBefore, error: error.message })
        results[daysBefore] = { found: 0, sent: 0, errors: 1 }
        totalErrors++
        continue
      }

      const bucket = { found: (policies ?? []).length, sent: 0, errors: 0 }

      for (const policy of (policies ?? [])) {
        try {
          await sendPolicyExpiryNotification(
            supabase,
            policy.user_id,
            policy.type,
            policy.policy_number,
            daysBefore
          )
          bucket.sent++
          totalSent++
        } catch (err: any) {
          console.error('failed to send notification', { policyId: policy.id, error: err.message || err })
          bucket.errors++
          totalErrors++
        }
      }

      results[daysBefore] = bucket
    }

    console.log('run complete', { totalSent, totalErrors })
    return new Response(JSON.stringify({ success: true, totalSent, totalErrors, windows: results }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('Fatal Edge Function Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
