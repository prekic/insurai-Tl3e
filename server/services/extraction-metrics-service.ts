/**
 * Extraction Metrics Service
 *
 * Persists extraction events to Supabase for historical analysis.
 * Dual-write pattern: events are recorded in-memory (ring buffer in ai.ts)
 * AND persisted to DB (this service). DB is queried as fallback after restart.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'

const svcLog = logger.child('extraction-metrics')

let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (supabase && process.env.NODE_ENV !== 'test') return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  supabase = createClient(url, key)
  return supabase
}

export interface ExtractionMetricRecord {
  request_id: string
  provider: 'openai' | 'anthropic' | 'unknown'
  success: boolean
  duration_ms: number
  error_code?: string
  error_message?: string
  document_length?: number
}

/**
 * Persist a single extraction event to the database.
 * Fire-and-forget — does not throw on failure.
 */
export async function persistExtractionEvent(event: ExtractionMetricRecord): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false

  try {
    const { error } = await db.from('extraction_metrics').insert({
      request_id: event.request_id,
      provider: event.provider,
      success: event.success,
      duration_ms: event.duration_ms,
      error_code: event.error_code || null,
      error_message: event.error_message ? event.error_message.slice(0, 500) : null,
      document_length: event.document_length || null,
    })

    if (error) {
      svcLog.warn('Failed to persist extraction metric', { error: error.message })
      return false
    }
    return true
  } catch (err) {
    svcLog.warn('Failed to persist extraction metric', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Query extraction health snapshot from DB.
 * Used as fallback when in-memory buffer is empty (after server restart).
 */
export async function getDBExtractionHealth(hours = 24): Promise<{
  last_period: { total: number; success: number; failed: number; error_rate: number }
  by_provider: Record<string, { total: number; failed: number; avg_latency_ms: number }>
  recent_errors: Array<{
    requestId: string
    provider: string
    code: string
    message: string
    timestamp: string
  }>
  hourly_buckets: Array<{
    hour: string
    total: number
    success: number
    failed: number
    avg_latency_ms: number
  }>
} | null> {
  const db = getSupabase()
  if (!db) return null

  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    // Fetch all records in the time window
    const { data: records, error } = await db
      .from('extraction_metrics')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error || !records) {
      svcLog.warn('Failed to query extraction metrics', { error: error?.message })
      return null
    }

    // Aggregate in-code (simpler than complex SQL for this volume)
    const total = records.length
    const success = records.filter((r) => r.success).length
    const failed = total - success

    // Per-provider
    const providerMap: Record<string, { total: number; failed: number; latencySum: number }> = {}
    for (const r of records) {
      if (!providerMap[r.provider]) {
        providerMap[r.provider] = { total: 0, failed: 0, latencySum: 0 }
      }
      providerMap[r.provider].total++
      if (!r.success) providerMap[r.provider].failed++
      providerMap[r.provider].latencySum += r.duration_ms || 0
    }

    const by_provider: Record<string, { total: number; failed: number; avg_latency_ms: number }> =
      {}
    for (const [provider, stats] of Object.entries(providerMap)) {
      by_provider[provider] = {
        total: stats.total,
        failed: stats.failed,
        avg_latency_ms: stats.total > 0 ? Math.round(stats.latencySum / stats.total) : 0,
      }
    }

    // Recent errors (last 10)
    const recent_errors = records
      .filter((r) => !r.success)
      .slice(0, 10)
      .map((r) => ({
        requestId: r.request_id,
        provider: r.provider,
        code: r.error_code || 'UNKNOWN',
        message: (r.error_message || '').slice(0, 200),
        timestamp: r.created_at,
      }))

    // Hourly buckets for time-series chart
    const nowMs = Date.now()
    const hourlyMap: Record<
      string,
      { total: number; success: number; failed: number; latencySum: number }
    > = {}
    for (let i = 23; i >= 0; i--) {
      const bucketStart = new Date(nowMs - i * 60 * 60 * 1000)
      bucketStart.setMinutes(0, 0, 0)
      hourlyMap[bucketStart.toISOString()] = { total: 0, success: 0, failed: 0, latencySum: 0 }
    }
    for (const r of records) {
      const rTime = new Date(r.created_at)
      rTime.setMinutes(0, 0, 0)
      const key = rTime.toISOString()
      if (hourlyMap[key]) {
        hourlyMap[key].total++
        if (r.success) hourlyMap[key].success++
        else hourlyMap[key].failed++
        hourlyMap[key].latencySum += r.duration_ms || 0
      }
    }
    const hourly_buckets = Object.entries(hourlyMap).map(([hour, b]) => ({
      hour,
      total: b.total,
      success: b.success,
      failed: b.failed,
      avg_latency_ms: b.total > 0 ? Math.round(b.latencySum / b.total) : 0,
    }))

    return {
      last_period: {
        total,
        success,
        failed,
        error_rate: total > 0 ? failed / total : 0,
      },
      by_provider,
      recent_errors,
      hourly_buckets,
    }
  } catch (err) {
    svcLog.warn('Failed to query extraction metrics', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Query extraction health snapshot from DB for historical trends.
 * Supports grouping by day.
 */
export async function getDBExtractionHealthHistorical(days = 7): Promise<{
  daily_buckets: Array<{
    date: string
    total: number
    success: number
    failed: number
    avg_latency_ms: number
  }>
} | null> {
  const db = getSupabase()
  if (!db) return null

  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data: records, error } = await db
      .from('extraction_metrics')
      .select('created_at, success, duration_ms')
      .gte('created_at', since)
      .order('created_at', { ascending: true })

    if (error || !records) {
      svcLog.warn('Failed to query historical extraction metrics', { error: error?.message })
      return null
    }

    const nowMs = Date.now()
    const dailyMap: Record<
      string,
      { total: number; success: number; failed: number; latencySum: number }
    > = {}

    // Initialize buckets for the last N days
    for (let i = days - 1; i >= 0; i--) {
      const bucketDate = new Date(nowMs - i * 24 * 60 * 60 * 1000)
      bucketDate.setHours(0, 0, 0, 0)
      dailyMap[bucketDate.toISOString().split('T')[0]] = {
        total: 0,
        success: 0,
        failed: 0,
        latencySum: 0,
      }
    }

    for (const r of records) {
      const dateKey = r.created_at.split('T')[0]
      if (dailyMap[dateKey]) {
        dailyMap[dateKey].total++
        if (r.success) dailyMap[dateKey].success++
        else dailyMap[dateKey].failed++
        dailyMap[dateKey].latencySum += r.duration_ms || 0
      }
    }

    const daily_buckets = Object.entries(dailyMap).map(([date, b]) => ({
      date,
      total: b.total,
      success: b.success,
      failed: b.failed,
      avg_latency_ms: b.total > 0 ? Math.round(b.latencySum / b.total) : 0,
    }))

    return {
      daily_buckets,
    }
  } catch (err) {
    svcLog.warn('Failed to query historical extraction metrics', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
