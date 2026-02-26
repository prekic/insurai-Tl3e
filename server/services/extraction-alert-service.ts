/**
 * Extraction Alert Service
 *
 * Evaluates extraction health metrics against configurable thresholds
 * and fires admin notifications (+ optional email) when thresholds are exceeded.
 *
 * Alert cooldown prevents notification flooding — same alert type will not
 * re-fire within the configured cooldown window.
 */

import { logger } from '../lib/logger.js'
import { createNotification } from './admin-notification-service.js'

const svcLog = logger.child('extraction-alert-service')

// In-memory cooldown tracking (resets on server restart — acceptable since
// the first post-restart alert is always useful)
const lastAlertFired = new Map<string, number>()

function isOnCooldown(alertKey: string, cooldownMs: number): boolean {
  const last = lastAlertFired.get(alertKey)
  return last !== undefined && Date.now() - last < cooldownMs
}

function markAlertFired(alertKey: string): void {
  lastAlertFired.set(alertKey, Date.now())
}

interface MonitoringConfig {
  errorRateWarningThreshold: number
  errorRateCriticalThreshold: number
  avgLatencyCriticalMs: number
  checkIntervalMs: number
  alertCooldownMinutes: number
  enableEmailAlerts: boolean
  alertEmailAddresses: string
}

interface HealthSnapshot {
  last_24h: { total: number; error_rate: number }
  by_provider: Record<string, { total: number; failed: number; avg_latency_ms: number }>
}

/**
 * Evaluate extraction health against thresholds and dispatch alerts.
 * Called throttled from recordExtractionEvent() in ai.ts.
 */
export async function evaluateAndDispatchAlerts(
  snapshot: HealthSnapshot,
  config: MonitoringConfig
): Promise<void> {
  try {
    const cooldownMs = config.alertCooldownMinutes * 60 * 1000

    // Skip if no extraction data in the window
    if (snapshot.last_24h.total === 0) return

    // 1. Overall error rate check
    const errorRate = snapshot.last_24h.error_rate
    if (errorRate >= config.errorRateCriticalThreshold) {
      await fireAlert('error_rate_critical', cooldownMs, {
        type: 'error' as const,
        category: 'performance' as const,
        title: 'Critical: High Extraction Error Rate',
        message: `Error rate is ${(errorRate * 100).toFixed(1)}% (threshold: ${(config.errorRateCriticalThreshold * 100).toFixed(1)}%)`,
      })
    } else if (errorRate >= config.errorRateWarningThreshold) {
      await fireAlert('error_rate_warning', cooldownMs, {
        type: 'warning' as const,
        category: 'performance' as const,
        title: 'Warning: Elevated Extraction Error Rate',
        message: `Error rate is ${(errorRate * 100).toFixed(1)}% (threshold: ${(config.errorRateWarningThreshold * 100).toFixed(1)}%)`,
      })
    }

    // 2. Per-provider latency check
    for (const [provider, stats] of Object.entries(snapshot.by_provider)) {
      if (stats.avg_latency_ms > config.avgLatencyCriticalMs && stats.total >= 3) {
        await fireAlert(`latency_critical:${provider}`, cooldownMs, {
          type: 'warning' as const,
          category: 'performance' as const,
          title: `Slow Extraction: ${provider}`,
          message: `${provider} avg latency ${stats.avg_latency_ms}ms exceeds ${config.avgLatencyCriticalMs}ms threshold (${stats.total} requests)`,
        })
      }
    }
  } catch (err) {
    svcLog.warn('Alert evaluation failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function fireAlert(
  alertKey: string,
  cooldownMs: number,
  notification: {
    type: 'error' | 'warning' | 'info'
    category: 'performance'
    title: string
    message: string
  }
): Promise<void> {
  if (isOnCooldown(alertKey, cooldownMs)) return
  markAlertFired(alertKey)

  // Admin notification (always)
  await createNotification({
    type: notification.type,
    category: notification.category,
    title: notification.title,
    message: notification.message,
  }).catch((err) =>
    svcLog.warn('Failed to create admin notification for alert', {
      alertKey,
      error: err instanceof Error ? err.message : String(err),
    })
  )

  svcLog.warn('Extraction health alert fired', {
    alertKey,
    title: notification.title,
  })
}

/**
 * Get current alert cooldown state (for admin status endpoint)
 */
export function getAlertState(): Record<string, number> {
  return Object.fromEntries(lastAlertFired)
}

/**
 * Reset alert state (for testing)
 */
export function resetAlertState(): void {
  lastAlertFired.clear()
}
