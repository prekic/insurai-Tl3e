import log from '../../lib/logger.js'
import { pgErr } from '../../lib/pg-err.js'
import {
  aiRequests,
  policyOperations,
  requestCounters,
  MAX_ENTRIES,
  type AIRequest,
  type PolicyOperation,
} from '../admin/shared.js'
import { persistExtractionEvent } from '../../services/extraction-metrics-service.js'
import { evaluateAndDispatchAlerts } from '../../services/extraction-alert-service.js'
import { getMonitoringConfig } from '../../services/config-service.js'

export interface OverviewMetricEvent {
  requestId: string
  provider: string
  model: string
  operation: 'extraction' | 'chat' | 'ocr'
  success: boolean
  durationMs: number
  inputTokens: number
  outputTokens: number
  cost: number
  documentLength?: number
  userId?: string
  errorCode?: string
  errorMessage?: string
  ocrUsed?: boolean
}

export function recordOverviewMetrics(event: OverviewMetricEvent): void {
  // Record to aiRequests array
  const aiReqId = `ai-${++requestCounters.aiRequestId}`
  const aiReq: AIRequest = {
    id: aiReqId,
    timestamp: new Date().toISOString(),
    provider: event.provider,
    operation: event.operation,
    model: event.model,
    endpoint: `/api/ai/${event.operation === 'extraction' ? 'extract' : event.operation}`,
    userId: event.userId,
    prompt: '',
    responseTime: event.durationMs ?? 0,
    status: event.success ? 'success' : 'error',
    error: event.errorMessage,
    tokens: {
      input: event.inputTokens ?? 0,
      output: event.outputTokens ?? 0,
      total: (event.inputTokens ?? 0) + (event.outputTokens ?? 0),
    },
    cost: {
      input: 0,
      output: 0,
      total: event.cost ?? 0,
    },
  }
  aiRequests.push(aiReq)
  if (aiRequests.length > MAX_ENTRIES) aiRequests.shift()

  // Record to policyOperations array (only for extractions)
  if (event.operation === 'extraction') {
    const policyOpId = `pol-${++requestCounters.policyOpId}`
    const policyOp: PolicyOperation = {
      id: policyOpId,
      timestamp: new Date().toISOString(),
      type: 'extraction',
      userId: event.userId || 'anonymous',
      status: event.success ? 'success' : 'error',
      duration: event.durationMs,
      extractionInfo: {
        provider: event.provider,
        model: event.model,
        confidence: 0,
        ocrUsed: event.ocrUsed ?? false,
      },
      error: event.errorMessage,
    }
    policyOperations.push(policyOp)
    if (policyOperations.length > MAX_ENTRIES) policyOperations.shift()
  }
}

export interface ExtractionEvent {
  requestId: string
  timestamp: string
  provider: 'openai' | 'anthropic' | 'deepseek' | 'unknown'
  success: boolean
  durationMs: number
  errorCode?: string
  errorMessage?: string
  documentLength?: number
}

// Default 200; configurable via monitoring.extraction_buffer_size in app_settings
export const EXTRACTION_BUFFER_SIZE = 200
export const extractionMetrics: ExtractionEvent[] = []

export let lastAlertCheckTime = 0
export let cachedCheckIntervalMs = 300000 // default 5 min; updated from MonitoringConfig on each check

export function recordExtractionEvent(event: ExtractionEvent): void {
  extractionMetrics.push(event)
  if (extractionMetrics.length > EXTRACTION_BUFFER_SIZE) {
    extractionMetrics.shift()
  }
  // Dual-write to DB (fire-and-forget, non-blocking)
  persistExtractionEvent({
    request_id: event.requestId,
    provider: event.provider,
    success: event.success,
    duration_ms: event.durationMs,
    error_code: event.errorCode,
    error_message: event.errorMessage,
    document_length: event.documentLength,
  }).catch((err) =>
    log.warn('Failed to persist extraction metric to DB', {
      ...pgErr(err),
      thrown: err instanceof Error ? err.message : String(err),
    })
  )

  // Throttled alert check — interval self-updates from DB config
  const now = Date.now()
  if (now - lastAlertCheckTime > cachedCheckIntervalMs) {
    lastAlertCheckTime = now
    // Fire-and-forget: get snapshot + config, then evaluate
    Promise.all([getExtractionHealthSnapshot(), getMonitoringConfig()])
      .then(([snapshot, config]) => {
        cachedCheckIntervalMs = config.checkIntervalMs
        return evaluateAndDispatchAlerts(snapshot, config)
      })
      .catch((err) =>
        log.warn('Alert dispatch failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      )
  }
}

/** Build 24 hourly buckets from extraction events for time-series visualization */
function buildHourlyBuckets(
  events: ExtractionEvent[],
  nowMs: number
): Array<{ hour: string; total: number; success: number; failed: number; avg_latency_ms: number }> {
  const buckets: Array<{
    hour: string
    total: number
    success: number
    failed: number
    totalLatency: number
  }> = []

  // Create 24 empty buckets (oldest first)
  for (let i = 23; i >= 0; i--) {
    const bucketStart = new Date(nowMs - i * 60 * 60 * 1000)
    bucketStart.setMinutes(0, 0, 0)
    buckets.push({
      hour: bucketStart.toISOString(),
      total: 0,
      success: 0,
      failed: 0,
      totalLatency: 0,
    })
  }

  // Assign events to buckets
  for (const e of events) {
    const eventTime = new Date(e.timestamp).getTime()
    for (let b = buckets.length - 1; b >= 0; b--) {
      const bucketTime = new Date(buckets[b].hour).getTime()
      if (eventTime >= bucketTime) {
        buckets[b].total++
        if (e.success) buckets[b].success++
        else buckets[b].failed++
        buckets[b].totalLatency += e.durationMs
        break
      }
    }
  }

  return buckets.map((b) => ({
    hour: b.hour,
    total: b.total,
    success: b.success,
    failed: b.failed,
    avg_latency_ms: b.total > 0 ? Math.round(b.totalLatency / b.total) : 0,
  }))
}

/** Exported for the admin monitoring endpoint */
export async function getExtractionHealthSnapshot() {
  const now = Date.now()
  const last24h = extractionMetrics.filter(
    (e) => now - new Date(e.timestamp).getTime() < 24 * 60 * 60 * 1000
  )

  // If buffer is empty (e.g., after server restart), try DB fallback
  if (last24h.length === 0) {
    try {
      const { getDBExtractionHealth } = await import('../../services/extraction-metrics-service.js')
      const dbHealth = await getDBExtractionHealth(24)
      if (dbHealth && dbHealth.last_period.total > 0) {
        return {
          last_24h: dbHealth.last_period,
          by_provider: dbHealth.by_provider,
          recent_errors: dbHealth.recent_errors,
          hourly_buckets: dbHealth.hourly_buckets || [],
          buffer_size: 0,
          source: 'database' as const,
        }
      }
    } catch {
      // DB fallback failed, return empty buffer data
    }
  }

  const total = last24h.length
  const failed = last24h.filter((e) => !e.success).length
  const succeeded = total - failed

  // Per-provider breakdown
  const byProvider: Record<string, { total: number; failed: number; totalLatency: number }> = {}
  for (const e of last24h) {
    const p = e.provider
    if (!byProvider[p]) byProvider[p] = { total: 0, failed: 0, totalLatency: 0 }
    byProvider[p].total++
    if (!e.success) byProvider[p].failed++
    byProvider[p].totalLatency += e.durationMs
  }

  const providerStats: Record<string, { total: number; failed: number; avg_latency_ms: number }> =
    {}
  for (const [p, stats] of Object.entries(byProvider)) {
    providerStats[p] = {
      total: stats.total,
      failed: stats.failed,
      avg_latency_ms: stats.total > 0 ? Math.round(stats.totalLatency / stats.total) : 0,
    }
  }

  // Recent errors (last 10)
  const recentErrors = last24h
    .filter((e) => !e.success)
    .slice(-10)
    .reverse()
    .map((e) => ({
      requestId: e.requestId,
      provider: e.provider,
      code: e.errorCode || 'UNKNOWN',
      message: e.errorMessage?.substring(0, 200),
      timestamp: e.timestamp,
    }))

  // Hourly buckets for time-series chart (last 24 hours)
  const hourlyBuckets = buildHourlyBuckets(last24h, now)

  return {
    last_24h: {
      total,
      success: succeeded,
      failed,
      error_rate: total > 0 ? Math.round((failed / total) * 1000) / 1000 : 0,
    },
    by_provider: providerStats,
    recent_errors: recentErrors,
    hourly_buckets: hourlyBuckets,
    buffer_size: extractionMetrics.length,
    source: 'memory' as const,
  }
}
