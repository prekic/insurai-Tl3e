/**
 * Email Scheduler Service
 *
 * Handles scheduled email jobs like policy expiration reminders.
 * Can be triggered by cron job, Railway scheduled task, or manual invocation.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  sendPolicyExpiringEmail,
  sendPolicyExpiredEmail,
  isEmailConfigured,
} from './email-service.js'
import { logger } from '../lib/logger.js'

const log = logger.child('EmailScheduler')

// Supabase client
let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (supabase && process.env.NODE_ENV !== 'test') return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    log.warn('Supabase not configured')
    return null
  }

  supabase = createClient(url, key)
  return supabase
}

// Reminder intervals in days
const REMINDER_DAYS = [30, 14, 7, 3, 1]

interface ExpiringPolicy {
  user_id: string
  user_email: string
  policy_id: string
  policy_number: string
  provider: string
  type_tr: string
  expiry_date: string
  days_remaining: number
}

/**
 * Process policy expiration reminders
 * Should be run daily via cron or scheduled task
 */
export async function processExpirationReminders(): Promise<{
  processed: number
  sent: number
  errors: number
}> {
  log.info('Starting expiration reminder processing...')

  if (!isEmailConfigured()) {
    log.warn('Email service not configured, skipping')
    return { processed: 0, sent: 0, errors: 0 }
  }

  const client = getSupabase()
  if (!client) {
    log.error('Database not configured')
    return { processed: 0, sent: 0, errors: 0 }
  }

  let processed = 0
  let sent = 0
  let errors = 0

  try {
    // Get all expiring policies for users who have opted in
    const { data: policies, error } = await client.rpc('get_expiring_policies', {
      days_ahead: 31, // Get policies expiring within 31 days
    })

    if (error) {
      log.error('Failed to fetch expiring policies', { error: String(error) })
      return { processed: 0, sent: 0, errors: 1 }
    }

    if (!policies || policies.length === 0) {
      log.info('No expiring policies found')
      return { processed: 0, sent: 0, errors: 0 }
    }

    log.info(`Found ${policies.length} expiring policies`)

    // Group policies by user to avoid spamming
    const policiesByUser = groupByUser(policies as ExpiringPolicy[])

    // Process each user's policies
    for (const [userEmail, userPolicies] of Object.entries(policiesByUser)) {
      // Find the most urgent policy (fewest days remaining)
      const mostUrgent = userPolicies.reduce((a, b) =>
        a.days_remaining < b.days_remaining ? a : b
      )

      // Only send if days_remaining matches one of our reminder intervals
      if (!REMINDER_DAYS.includes(mostUrgent.days_remaining)) {
        continue
      }

      processed++

      // Check if we've already sent this reminder today
      const alreadySent = await hasReminderBeenSent(
        client,
        mostUrgent.policy_id,
        mostUrgent.days_remaining
      )

      if (alreadySent) {
        log.debug(`Reminder already sent for policy ${mostUrgent.policy_number}`)
        continue
      }

      try {
        // Send expiration reminder
        const result = await sendPolicyExpiringEmail(userEmail, {
          policyNumber: mostUrgent.policy_number,
          provider: mostUrgent.provider,
          typeTr: mostUrgent.type_tr,
          expiryDate: formatDate(mostUrgent.expiry_date),
          daysRemaining: mostUrgent.days_remaining,
        })

        if (result.success) {
          sent++
          // Record that we sent this reminder
          await recordReminderSent(client, mostUrgent.policy_id, mostUrgent.days_remaining)
          log.info(`Sent reminder: ${mostUrgent.policy_number} (${mostUrgent.days_remaining} days)`)
        } else {
          errors++
          log.error('Failed to send reminder', { error: String(result.error) })
        }
      } catch (err) {
        errors++
        log.error('Error sending reminder', { error: String(err) })
      }
    }

    log.info('Completed expiration reminders', { processed, sent, errors })
    return { processed, sent, errors }
  } catch (err) {
    log.error('Processing error', { error: String(err) })
    return { processed, sent, errors: errors + 1 }
  }
}

/**
 * Process expired policy notifications
 * Sends notification on the day a policy expires
 */
export async function processExpiredNotifications(): Promise<{
  processed: number
  sent: number
  errors: number
}> {
  log.info('Starting expired policy notification processing...')

  if (!isEmailConfigured()) {
    log.warn('Email service not configured, skipping')
    return { processed: 0, sent: 0, errors: 0 }
  }

  const client = getSupabase()
  if (!client) {
    log.error('Database not configured')
    return { processed: 0, sent: 0, errors: 0 }
  }

  let processed = 0
  let sent = 0
  let errors = 0

  try {
    // Get policies that expired today
    const today = new Date().toISOString().split('T')[0]
    const { data: policies, error } = await client
      .from('policies')
      .select(
        `
        id,
        policy_number,
        provider,
        type_tr,
        expiry_date,
        user_id,
        users!inner(email)
      `
      )
      .eq('expiry_date', today)
      .neq('status', 'expired')

    if (error) {
      log.error('Failed to fetch expired policies', { error: String(error) })
      return { processed: 0, sent: 0, errors: 1 }
    }

    if (!policies || policies.length === 0) {
      log.info('No newly expired policies found')
      return { processed: 0, sent: 0, errors: 0 }
    }

    log.info(`Found ${policies.length} expired policies`)

    for (const policy of policies) {
      processed++
      // Supabase-js types the joined `users` relation loosely; the runtime
      // shape is always { email: string } from the policies→users FK join.
      // eslint-disable-next-line no-restricted-syntax
      const userEmail = (policy.users as unknown as { email: string })?.email

      if (!userEmail) continue

      try {
        const result = await sendPolicyExpiredEmail(userEmail, {
          policyNumber: policy.policy_number,
          provider: policy.provider,
          typeTr: policy.type_tr,
          expiryDate: formatDate(policy.expiry_date),
        })

        if (result.success) {
          sent++
          // Update policy status to expired
          await client.from('policies').update({ status: 'expired' }).eq('id', policy.id)
          log.info(`Sent expired notification: ${policy.policy_number}`)
        } else {
          errors++
        }
      } catch (err) {
        errors++
        log.error('Error sending expired notification', { error: String(err) })
      }
    }

    return { processed, sent, errors }
  } catch (err) {
    log.error('Processing error', { error: String(err) })
    return { processed, sent, errors: errors + 1 }
  }
}

/**
 * Main scheduler function - runs all scheduled email jobs
 */
export async function runScheduledEmailJobs(): Promise<void> {
  log.info('Running all scheduled email jobs...')
  const startTime = Date.now()

  // Process expiration reminders
  const reminderResults = await processExpirationReminders()

  // Process expired notifications
  const expiredResults = await processExpiredNotifications()

  const duration = Date.now() - startTime
  log.info(`All jobs completed in ${duration}ms`, {
    reminders: reminderResults,
    expired: expiredResults,
  })
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function groupByUser(policies: ExpiringPolicy[]): Record<string, ExpiringPolicy[]> {
  return policies.reduce(
    (acc, policy) => {
      const email = policy.user_email
      if (!acc[email]) {
        acc[email] = []
      }
      acc[email].push(policy)
      return acc
    },
    {} as Record<string, ExpiringPolicy[]>
  )
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

async function hasReminderBeenSent(
  client: SupabaseClient,
  policyId: string,
  daysRemaining: number
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]

  const { data } = await client
    .from('scheduled_emails')
    .select('id')
    .eq('payload->policy_id', policyId)
    .eq('payload->days_remaining', daysRemaining)
    .eq('status', 'sent')
    .gte('created_at', today)
    .limit(1)

  return (data?.length || 0) > 0
}

async function recordReminderSent(
  client: SupabaseClient,
  policyId: string,
  daysRemaining: number
): Promise<void> {
  await client.from('scheduled_emails').insert({
    email_type: 'policy_expiring',
    recipient: '', // Will be filled from the actual send
    scheduled_for: new Date().toISOString(),
    status: 'sent',
    payload: {
      policy_id: policyId,
      days_remaining: daysRemaining,
    },
  })
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

// Allow running from command line
if (process.argv[1]?.includes('email-scheduler')) {
  runScheduledEmailJobs()
    .then(() => {
      log.info('CLI execution completed')
      process.exit(0)
    })
    .catch((err) => {
      log.error('CLI execution failed', { error: String(err) })
      process.exit(1)
    })
}
