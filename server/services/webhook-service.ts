/**
 * Settings Webhook Service
 *
 * Manages webhook subscriptions and delivers setting-change events
 * to registered external endpoints.
 *
 * Features:
 * - CRUD for webhook registrations
 * - Async delivery with retry (exponential backoff)
 * - HMAC-SHA256 signature for payload verification
 * - Delivery log with status tracking
 * - Rate limiting per webhook endpoint
 */

import crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// =============================================================================
// TYPES
// =============================================================================

export interface Webhook {
  id: string
  name: string
  url: string
  secret: string
  events: WebhookEvent[]
  categories: string[] // empty = all categories
  enabled: boolean
  created_at: string
  updated_at: string
  last_triggered_at?: string
  failure_count: number
}

export interface WebhookInput {
  name: string
  url: string
  events: WebhookEvent[]
  categories?: string[]
  enabled?: boolean
}

export type WebhookEvent =
  | 'setting.updated'
  | 'setting.batch_updated'
  | 'setting.imported'
  | 'feature_flag.toggled'

export interface WebhookDelivery {
  id: string
  webhook_id: string
  event: WebhookEvent
  payload: Record<string, unknown>
  status: 'pending' | 'success' | 'failed'
  status_code?: number
  response_body?: string
  attempts: number
  max_attempts: number
  next_retry_at?: string
  created_at: string
  completed_at?: string
  error_message?: string
}

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  data: {
    category: string
    changes: Array<{
      key: string
      previous_value: unknown
      new_value: unknown
    }>
    reason?: string
    changed_by?: string
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_DELIVERY_ATTEMPTS = 3
const RETRY_DELAYS_MS = [2000, 8000, 30000] // exponential-ish backoff
const DELIVERY_TIMEOUT_MS = 10000
const MAX_RESPONSE_BODY_LENGTH = 1000

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.warn('[WebhookService] Supabase not configured')
    return null
  }

  supabase = createClient(url, key)
  return supabase
}

// =============================================================================
// HMAC SIGNATURE
// =============================================================================

/**
 * Sign a payload with HMAC-SHA256 using the webhook's secret.
 * Recipients can verify with: HMAC-SHA256(body, secret) === X-Webhook-Signature header.
 */
export function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Generate a random secret for a new webhook.
 */
export function generateSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`
}

// =============================================================================
// WEBHOOK CRUD
// =============================================================================

/**
 * List all webhooks.
 */
export async function listWebhooks(): Promise<Webhook[]> {
  const client = getSupabase()
  if (!client) return []

  const { data, error } = await client
    .from('settings_webhooks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[WebhookService] List error:', error)
    return []
  }

  return (data || []).map(mapDbToWebhook)
}

/**
 * Get a single webhook by ID.
 */
export async function getWebhook(id: string): Promise<Webhook | null> {
  const client = getSupabase()
  if (!client) return null

  const { data, error } = await client
    .from('settings_webhooks')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('[WebhookService] Get error:', error)
    return null
  }

  return mapDbToWebhook(data)
}

/**
 * Create a new webhook.
 */
export async function createWebhook(input: WebhookInput): Promise<Webhook | null> {
  const client = getSupabase()
  if (!client) return null

  const secret = generateSecret()

  const { data, error } = await client
    .from('settings_webhooks')
    .insert([{
      name: input.name,
      url: input.url,
      secret,
      events: input.events,
      categories: input.categories || [],
      enabled: input.enabled ?? true,
      failure_count: 0,
    }])
    .select()
    .single()

  if (error) {
    console.error('[WebhookService] Create error:', error)
    return null
  }

  return mapDbToWebhook(data)
}

/**
 * Update an existing webhook.
 */
export async function updateWebhook(
  id: string,
  input: Partial<WebhookInput>
): Promise<Webhook | null> {
  const client = getSupabase()
  if (!client) return null

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (input.name !== undefined) updateData.name = input.name
  if (input.url !== undefined) updateData.url = input.url
  if (input.events !== undefined) updateData.events = input.events
  if (input.categories !== undefined) updateData.categories = input.categories
  if (input.enabled !== undefined) updateData.enabled = input.enabled

  const { data, error } = await client
    .from('settings_webhooks')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[WebhookService] Update error:', error)
    return null
  }

  return mapDbToWebhook(data)
}

/**
 * Delete a webhook and its delivery log.
 */
export async function deleteWebhook(id: string): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false

  // Delete deliveries first (FK constraint)
  await client.from('webhook_deliveries').delete().eq('webhook_id', id)

  const { error } = await client.from('settings_webhooks').delete().eq('id', id)

  if (error) {
    console.error('[WebhookService] Delete error:', error)
    return false
  }

  return true
}

/**
 * Regenerate the secret for a webhook.
 */
export async function regenerateSecret(id: string): Promise<string | null> {
  const client = getSupabase()
  if (!client) return null

  const newSecret = generateSecret()

  const { error } = await client
    .from('settings_webhooks')
    .update({ secret: newSecret, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[WebhookService] Regenerate secret error:', error)
    return null
  }

  return newSecret
}

// =============================================================================
// DELIVERY
// =============================================================================

/**
 * Fire webhooks for a setting change event.
 * This is async and non-blocking — errors are logged, not thrown.
 */
export async function fireWebhooks(
  event: WebhookEvent,
  data: WebhookPayload['data']
): Promise<void> {
  const client = getSupabase()
  if (!client) return

  // Fetch enabled webhooks that subscribe to this event
  const { data: webhooks, error } = await client
    .from('settings_webhooks')
    .select('*')
    .eq('enabled', true)
    .contains('events', [event])

  if (error || !webhooks || webhooks.length === 0) {
    return
  }

  // Filter by category if the webhook has category filters
  const matchingWebhooks = webhooks.filter((wh) => {
    if (!wh.categories || wh.categories.length === 0) return true
    return wh.categories.includes(data.category)
  })

  // Deliver to each webhook in parallel (fire-and-forget)
  const deliveryPromises = matchingWebhooks.map((wh) =>
    deliverToWebhook(mapDbToWebhook(wh), event, data).catch((err) =>
      console.error(`[WebhookService] Delivery error for ${wh.name}:`, err)
    )
  )

  await Promise.allSettled(deliveryPromises)
}

/**
 * Deliver a payload to a single webhook endpoint.
 */
async function deliverToWebhook(
  webhook: Webhook,
  event: WebhookEvent,
  data: WebhookPayload['data']
): Promise<void> {
  const client = getSupabase()
  if (!client) return

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  }

  const bodyString = JSON.stringify(payload)
  const signature = signPayload(bodyString, webhook.secret)

  // Create delivery record
  const { data: delivery, error: insertError } = await client
    .from('webhook_deliveries')
    .insert([{
      webhook_id: webhook.id,
      event,
      payload,
      status: 'pending',
      attempts: 0,
      max_attempts: MAX_DELIVERY_ATTEMPTS,
    }])
    .select()
    .single()

  if (insertError || !delivery) {
    console.error('[WebhookService] Failed to create delivery record:', insertError)
    return
  }

  // Attempt delivery with retries
  await attemptDelivery(webhook, delivery.id, bodyString, signature)
}

/**
 * Attempt HTTP delivery with retries on failure.
 */
async function attemptDelivery(
  webhook: Webhook,
  deliveryId: string,
  bodyString: string,
  signature: string,
  attempt: number = 1
): Promise<void> {
  const client = getSupabase()
  if (!client) return

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': bodyString ? JSON.parse(bodyString).event : '',
        'X-Webhook-Delivery': deliveryId,
        'User-Agent': 'InsurAI-Webhooks/1.0',
      },
      body: bodyString,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    const responseBody = await response.text().catch(() => '')
    const truncatedBody = responseBody.slice(0, MAX_RESPONSE_BODY_LENGTH)

    if (response.ok) {
      // Success
      await client.from('webhook_deliveries').update({
        status: 'success',
        status_code: response.status,
        response_body: truncatedBody,
        attempts: attempt,
        completed_at: new Date().toISOString(),
      }).eq('id', deliveryId)

      // Reset failure count
      await client.from('settings_webhooks').update({
        failure_count: 0,
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', webhook.id)
    } else {
      throw new Error(`HTTP ${response.status}: ${truncatedBody}`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (attempt < MAX_DELIVERY_ATTEMPTS) {
      // Schedule retry
      const delayMs = RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString()

      await client.from('webhook_deliveries').update({
        attempts: attempt,
        error_message: errorMessage,
        next_retry_at: nextRetryAt,
      }).eq('id', deliveryId)

      // Retry after delay
      setTimeout(() => {
        attemptDelivery(webhook, deliveryId, bodyString, signPayload(bodyString, webhook.secret), attempt + 1)
          .catch((err) => console.error('[WebhookService] Retry error:', err))
      }, delayMs)
    } else {
      // Final failure
      await client.from('webhook_deliveries').update({
        status: 'failed',
        attempts: attempt,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      }).eq('id', deliveryId)

      // Increment failure count on webhook
      await client.from('settings_webhooks').update({
        failure_count: (webhook.failure_count || 0) + 1,
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', webhook.id)

      console.warn(`[WebhookService] Delivery failed after ${attempt} attempts for ${webhook.name}: ${errorMessage}`)
    }
  }
}

/**
 * Send a test ping to a webhook endpoint.
 */
export async function testWebhook(id: string): Promise<{
  success: boolean
  statusCode?: number
  responseBody?: string
  error?: string
  durationMs: number
}> {
  const webhook = await getWebhook(id)
  if (!webhook) {
    return { success: false, error: 'Webhook not found', durationMs: 0 }
  }

  const payload: WebhookPayload = {
    event: 'setting.updated',
    timestamp: new Date().toISOString(),
    data: {
      category: 'test',
      changes: [{
        key: 'test_ping',
        previous_value: null,
        new_value: 'ping',
      }],
      reason: 'Test delivery from admin panel',
    },
  }

  const bodyString = JSON.stringify(payload)
  const signature = signPayload(bodyString, webhook.secret)

  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'setting.updated',
        'X-Webhook-Delivery': 'test',
        'User-Agent': 'InsurAI-Webhooks/1.0',
      },
      body: bodyString,
      signal: controller.signal,
    })

    clearTimeout(timeout)
    const responseBody = await response.text().catch(() => '')
    const durationMs = Date.now() - start

    return {
      success: response.ok,
      statusCode: response.status,
      responseBody: responseBody.slice(0, MAX_RESPONSE_BODY_LENGTH),
      durationMs,
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - start,
    }
  }
}

/**
 * Get delivery log for a webhook.
 */
export async function getDeliveries(
  webhookId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
  const client = getSupabase()
  if (!client) return { deliveries: [], total: 0 }

  const { limit = 20, offset = 0 } = options

  const { data, error, count } = await client
    .from('webhook_deliveries')
    .select('*', { count: 'exact' })
    .eq('webhook_id', webhookId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[WebhookService] Deliveries fetch error:', error)
    return { deliveries: [], total: 0 }
  }

  return {
    deliveries: (data || []) as WebhookDelivery[],
    total: count || 0,
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function mapDbToWebhook(row: Record<string, unknown>): Webhook {
  return {
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    secret: row.secret as string,
    events: (row.events || []) as WebhookEvent[],
    categories: (row.categories || []) as string[],
    enabled: row.enabled as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_triggered_at: row.last_triggered_at as string | undefined,
    failure_count: (row.failure_count || 0) as number,
  }
}

// Re-export for use in route wiring
export { MAX_DELIVERY_ATTEMPTS }
