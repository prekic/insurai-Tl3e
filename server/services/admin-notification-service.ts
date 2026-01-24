/**
 * Admin Notification Service
 *
 * Stores and retrieves admin notifications for API errors, billing issues, etc.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type NotificationType = 'error' | 'warning' | 'info'
export type NotificationCategory = 'billing' | 'api_error' | 'rate_limit' | 'system' | 'security'

export interface AdminNotification {
  id?: string
  type: NotificationType
  category: NotificationCategory
  title: string
  message: string
  provider?: string  // 'anthropic', 'openai', etc.
  details?: Record<string, unknown>
  acknowledged: boolean
  created_at?: string
  acknowledged_at?: string
  acknowledged_by?: string
}

let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.warn('[AdminNotificationService] Supabase not configured')
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
    console.error('[AdminNotification]', notification.type.toUpperCase(), notification.title, notification.message)
    return null
  }

  const { data, error } = await client
    .from('admin_notifications')
    .insert([{
      ...notification,
      acknowledged: false,
    }])
    .select()
    .single()

  if (error) {
    // Log to console as fallback
    console.error('[AdminNotification] Failed to save:', error)
    console.error('[AdminNotification]', notification.type.toUpperCase(), notification.title, notification.message)
    return null
  }

  console.log('[AdminNotification] Created:', notification.title)
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
    console.error('[AdminNotificationService] Failed to fetch:', error)
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

  let query = client
    .from('admin_notifications')
    .select('*', { count: 'exact' })

  if (category) {
    query = query.eq('category', category)
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[AdminNotificationService] Failed to fetch:', error)
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
    console.error('[AdminNotificationService] Failed to acknowledge:', error)
    return false
  }

  return true
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
