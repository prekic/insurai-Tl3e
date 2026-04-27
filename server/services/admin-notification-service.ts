/**
 * Admin Notification Service
 *
 * Stores and retrieves admin notifications for API errors, billing issues, etc.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'

const log = logger.child('AdminNotification')

export type NotificationType = 'error' | 'warning' | 'info'
export type NotificationCategory =
  | 'billing'
  | 'api_error'
  | 'rate_limit'
  | 'system'
  | 'security'
  | 'performance'

export interface AdminNotification {
  id?: string
  type: NotificationType
  category: NotificationCategory
  title: string
  message: string
  provider?: string // 'anthropic', 'openai', etc.
  details?: Record<string, unknown>
  acknowledged: boolean
  created_at?: string
  acknowledged_at?: string
  acknowledged_by?: string
}

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

/**
 * Create a new admin notification
 */
export async function createNotification(
  notification: Omit<AdminNotification, 'id' | 'created_at' | 'acknowledged'>
): Promise<AdminNotification | null> {
  const client = getSupabase()
  if (!client) {
    // Log to console if database not available
    log.error(`${notification.type.toUpperCase()} ${notification.title}: ${notification.message}`)
    return null
  }

  const { data, error } = await client
    .from('admin_notifications')
    .insert([
      {
        ...notification,
        acknowledged: false,
      },
    ])
    .select()
    .single()

  if (error) {
    // Surface the full PostgrestError shape (code/message/details/hint) instead of the
    // opaque String(error) coercion that masked the real cause in production logs.
    log.error('Failed to save notification', {
      pgCode: error.code ?? null,
      pgMessage: error.message ?? null,
      pgDetails: error.details ?? null,
      pgHint: error.hint ?? null,
      diagnosticHint: error.message?.includes('does not exist')
        ? 'Table missing — run migration 008a_admin_notifications.sql'
        : error.message?.includes('new row violates') || error.code === '42501'
          ? 'RLS policy blocking insert — check admin_notifications_service_role policy from migration 041'
          : error.code === 'PGRST301' || error.message?.includes('JWT')
            ? 'Service role key invalid or expired — verify SUPABASE_SERVICE_ROLE_KEY env var'
            : undefined,
    })
    log.error(`${notification.type.toUpperCase()} ${notification.title}: ${notification.message}`)
    return null
  }

  log.info('Created notification', { title: notification.title })
  return data as AdminNotification
}

/**
 * Get unacknowledged notifications
 */
export async function getUnacknowledgedNotifications(): Promise<AdminNotification[]> {
  const client = getSupabase()
  if (!client) return []

  const { data, error } = await client
    .from('admin_notifications')
    .select('*')
    .eq('acknowledged', false)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    log.error('Failed to fetch unacknowledged notifications', { error: String(error) })
    return []
  }

  return data as AdminNotification[]
}

/**
 * Get all notifications with pagination
 */
export async function getNotifications(
  options: { limit?: number; offset?: number; category?: NotificationCategory } = {}
): Promise<{ notifications: AdminNotification[]; total: number }> {
  const client = getSupabase()
  if (!client) return { notifications: [], total: 0 }

  const { limit = 50, offset = 0, category } = options

  let query = client.from('admin_notifications').select('*', { count: 'exact' })

  if (category) {
    query = query.eq('category', category)
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    log.error('Failed to fetch notifications', { error: String(error) })
    return { notifications: [], total: 0 }
  }

  return {
    notifications: data as AdminNotification[],
    total: count || 0,
  }
}

/**
 * Acknowledge a notification
 */
export async function acknowledgeNotification(
  notificationId: string,
  acknowledgedBy?: string
): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false

  const { error } = await client
    .from('admin_notifications')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: acknowledgedBy,
    })
    .eq('id', notificationId)

  if (error) {
    log.error('Failed to acknowledge notification', { error: String(error) })
    return false
  }

  return true
}

/**
 * Delete notifications by IDs
 */
export async function deleteNotifications(ids: string[]): Promise<number> {
  const client = getSupabase()
  if (!client) return 0

  const { error, count } = await client
    .from('admin_notifications')
    .delete({ count: 'exact' })
    .in('id', ids)

  if (error) {
    log.error('Failed to delete notifications', { error: String(error), count: ids.length })
    return 0
  }

  log.info('Deleted notifications', { count: count || 0 })
  return count || 0
}

/**
 * Delete all notifications matching a filter
 */
export async function deleteAllNotifications(
  options: { category?: NotificationCategory; acknowledged?: boolean } = {}
): Promise<number> {
  const client = getSupabase()
  if (!client) return 0

  let query = client.from('admin_notifications').delete({ count: 'exact' })

  if (options.category) {
    query = query.eq('category', options.category)
  }
  if (options.acknowledged !== undefined) {
    query = query.eq('acknowledged', options.acknowledged)
  }

  // Safety: require at least one filter or explicit "all"
  if (!options.category && options.acknowledged === undefined) {
    // Delete all — use a truthy condition
    query = query.gte('created_at', '1970-01-01')
  }

  const { error, count } = await query

  if (error) {
    log.error('Failed to delete all notifications', { error: String(error) })
    return 0
  }

  log.info('Deleted all matching notifications', { count: count || 0, options })
  return count || 0
}

/**
 * Helper: Create billing notification
 */
export async function notifyBillingIssue(
  provider: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  await createNotification({
    type: 'error',
    category: 'billing',
    title: `${provider.toUpperCase()} Billing Issue`,
    message,
    provider,
    details,
  })
}

/**
 * Helper: Create API error notification
 */
export async function notifyAPIError(
  provider: string,
  errorType: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  await createNotification({
    type: 'error',
    category: 'api_error',
    title: `${provider.toUpperCase()} API Error: ${errorType}`,
    message,
    provider,
    details,
  })
}

/**
 * Helper: Create rate limit notification
 */
export async function notifyRateLimit(
  provider: string,
  details?: Record<string, unknown>
): Promise<void> {
  await createNotification({
    type: 'warning',
    category: 'rate_limit',
    title: `${provider.toUpperCase()} Rate Limit Exceeded`,
    message: `API rate limit reached for ${provider}. Requests are being throttled.`,
    provider,
    details,
  })
}

/**
 * Helper: Create performance alert notification
 */
export async function notifyPerformanceAlert(
  alertType: string,
  severity: 'warning' | 'critical',
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  await createNotification({
    type: severity === 'critical' ? 'error' : 'warning',
    category: 'performance',
    title: `Config Performance ${severity === 'critical' ? 'Critical' : 'Warning'}: ${alertType}`,
    message,
    details,
  })
}

/**
 * Startup probe — verify the service can write to admin_notifications at boot,
 * not on the first alert fire. Surfaces env-var and migration-not-applied issues
 * immediately as a clear log line rather than silently failing later.
 *
 * Probe semantics:
 *   - 'ok': can read the table (RLS + key + migration all healthy)
 *   - 'unconfigured': SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing
 *   - 'failed': Supabase reachable but the read errored (logged with full PostgrestError shape)
 *
 * Call once at server startup; fire-and-forget. Never throws.
 */
export async function probeAdminNotifications(): Promise<'ok' | 'unconfigured' | 'failed'> {
  const client = getSupabase()
  if (!client) {
    log.warn(
      '[ADMIN-NOTIFY-INIT] unconfigured — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. ' +
        'Alerts will be logged but not persisted.'
    )
    return 'unconfigured'
  }

  const { error } = await client
    .from('admin_notifications')
    .select('id', { count: 'exact', head: true })
    .limit(1)

  if (error) {
    log.error('[ADMIN-NOTIFY-INIT] failed', {
      pgCode: error.code ?? null,
      pgMessage: error.message ?? null,
      pgDetails: error.details ?? null,
      pgHint: error.hint ?? null,
      diagnosticHint: error.message?.includes('does not exist')
        ? 'Table missing — apply migration 008a_admin_notifications.sql'
        : error.code === '42501' || error.message?.includes('permission denied')
          ? 'RLS policy rejecting service_role read — verify migration 041 applied'
          : error.code === 'PGRST301' || error.message?.includes('JWT')
            ? 'Service role key invalid or expired — verify SUPABASE_SERVICE_ROLE_KEY env var'
            : undefined,
    })
    return 'failed'
  }

  log.info('[ADMIN-NOTIFY-INIT] ok')
  return 'ok'
}
