/**
 * Config Performance Monitor
 *
 * Tracks config fetch latency, cache hit/miss rates, and error rates
 * to help determine if the 5-minute cache TTL is appropriate.
 *
 * Stores metrics in a rolling window (last 1000 events, max 1 hour).
 * All data is in-memory only — no database writes.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ConfigFetchEvent {
  timestamp: number
  category: string
  method: string // 'get' | 'getCategory' | 'getAIConfig' | etc.
  latencyMs: number
  cacheHit: boolean
  success: boolean
  errorMessage?: string
}

export interface LatencyStats {
  count: number
  avgMs: number
  minMs: number
  maxMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
}

export interface CacheStats {
  totalRequests: number
  cacheHits: number
  cacheMisses: number
  hitRate: number
}

export interface CategoryStats {
  category: string
  fetchCount: number
  avgLatencyMs: number
  cacheHitRate: number
  errorCount: number
}

export interface PerformanceSnapshot {
  /** ISO timestamp of when this snapshot was taken */
  snapshotAt: string
  /** How long the monitor has been running (ms) */
  uptimeMs: number
  /** Total events tracked in the current window */
  totalEvents: number
  /** Overall latency statistics (cache misses only, to measure actual DB latency) */
  dbLatency: LatencyStats
  /** Overall latency statistics (all requests including cache hits) */
  overallLatency: LatencyStats
  /** Cache hit/miss breakdown */
  cache: CacheStats
  /** Per-category breakdown */
  categories: CategoryStats[]
  /** Error rate */
  errorRate: number
  /** Current cache TTL in ms */
  cacheTtlMs: number
  /** TTL recommendation based on observed patterns */
  ttlRecommendation: TtlRecommendation
  /** Recent events (last 20) for live monitoring */
  recentEvents: ConfigFetchEvent[]
  /** Active performance alerts */
  alerts: PerformanceAlert[]
  /** Alert thresholds configuration */
  alertThresholds: AlertThresholds
}

export interface TtlRecommendation {
  currentTtlMs: number
  suggestedTtlMs: number
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

// =============================================================================
// ALERT TYPES
// =============================================================================

export type AlertSeverity = 'warning' | 'critical'

export interface AlertThresholds {
  /** Minimum cache hit rate before warning (0-1). Default: 0.5 */
  cacheHitRateWarning: number
  /** Minimum cache hit rate before critical alert (0-1). Default: 0.3 */
  cacheHitRateCritical: number
  /** Maximum error rate before warning (0-1). Default: 0.05 */
  errorRateWarning: number
  /** Maximum error rate before critical alert (0-1). Default: 0.15 */
  errorRateCritical: number
  /** Maximum average DB latency (ms) before warning. Default: 200 */
  dbLatencyWarning: number
  /** Maximum average DB latency (ms) before critical alert. Default: 500 */
  dbLatencyCritical: number
  /** Minimum events required before alert evaluation. Default: 20 */
  minEventsForAlert: number
  /** Cooldown between repeated alerts of the same type (ms). Default: 5 minutes */
  alertCooldownMs: number
}

export interface PerformanceAlert {
  id: string
  type: 'cache_hit_rate' | 'error_rate' | 'db_latency'
  severity: AlertSeverity
  message: string
  currentValue: number
  threshold: number
  triggeredAt: number
}

export interface AlertEvaluation {
  alerts: PerformanceAlert[]
  thresholds: AlertThresholds
  suppressedCount: number
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  cacheHitRateWarning: 0.5,
  cacheHitRateCritical: 0.3,
  errorRateWarning: 0.05,
  errorRateCritical: 0.15,
  dbLatencyWarning: 200,
  dbLatencyCritical: 500,
  minEventsForAlert: 20,
  alertCooldownMs: 5 * 60 * 1000, // 5 minutes
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_EVENTS = 1000
const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// =============================================================================
// PERFORMANCE MONITOR CLASS
// =============================================================================

export class ConfigPerformanceMonitor {
  private static instance: ConfigPerformanceMonitor
  private events: ConfigFetchEvent[] = []
  private startedAt: number = Date.now()
  private cacheTtlMs: number = DEFAULT_CACHE_TTL_MS
  private alertThresholds: AlertThresholds = { ...DEFAULT_ALERT_THRESHOLDS }
  private lastAlertTimes: Map<string, number> = new Map()
  private activeAlerts: PerformanceAlert[] = []
  private onAlertCallback: ((alerts: PerformanceAlert[]) => void) | null = null

  private constructor() {}

  static getInstance(): ConfigPerformanceMonitor {
    if (!ConfigPerformanceMonitor.instance) {
      ConfigPerformanceMonitor.instance = new ConfigPerformanceMonitor()
    }
    return ConfigPerformanceMonitor.instance
  }

  /** Reset for testing */
  static resetInstance(): void {
    ConfigPerformanceMonitor.instance = null as unknown as ConfigPerformanceMonitor
  }

  /** Set the current cache TTL (called by ConfigurationService) */
  setCacheTtl(ttlMs: number): void {
    this.cacheTtlMs = ttlMs
  }

  /** Record a config fetch event and evaluate alerts */
  record(event: Omit<ConfigFetchEvent, 'timestamp'>): void {
    const fullEvent: ConfigFetchEvent = {
      ...event,
      timestamp: Date.now(),
    }

    this.events.push(fullEvent)
    this.pruneEvents()

    // Evaluate alerts every 10 events to avoid overhead on every record
    if (this.events.length % 10 === 0) {
      this.evaluateAlerts()
    }
  }

  /** Get a full performance snapshot */
  getSnapshot(): PerformanceSnapshot {
    this.pruneEvents()
    const events = this.events

    const dbEvents = events.filter((e) => !e.cacheHit && e.success)
    const allLatencies = events.filter((e) => e.success).map((e) => e.latencyMs)
    const dbLatencies = dbEvents.map((e) => e.latencyMs)

    return {
      snapshotAt: new Date().toISOString(),
      uptimeMs: Date.now() - this.startedAt,
      totalEvents: events.length,
      dbLatency: this.computeLatencyStats(dbLatencies),
      overallLatency: this.computeLatencyStats(allLatencies),
      cache: this.computeCacheStats(events),
      categories: this.computeCategoryStats(events),
      errorRate: events.length > 0
        ? events.filter((e) => !e.success).length / events.length
        : 0,
      cacheTtlMs: this.cacheTtlMs,
      ttlRecommendation: this.computeTtlRecommendation(events, dbLatencies),
      recentEvents: events.slice(-20).reverse(),
      alerts: this.activeAlerts,
      alertThresholds: { ...this.alertThresholds },
    }
  }

  /** Get just the cache stats (lightweight) */
  getCacheStats(): CacheStats {
    this.pruneEvents()
    return this.computeCacheStats(this.events)
  }

  /** Get the event count */
  getEventCount(): number {
    this.pruneEvents()
    return this.events.length
  }

  /** Set alert thresholds */
  setAlertThresholds(thresholds: Partial<AlertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds }
  }

  /** Get current alert thresholds */
  getAlertThresholds(): AlertThresholds {
    return { ...this.alertThresholds }
  }

  /** Register a callback for when alerts are triggered */
  onAlert(callback: ((alerts: PerformanceAlert[]) => void) | null): void {
    this.onAlertCallback = callback
  }

  /** Get currently active alerts */
  getActiveAlerts(): PerformanceAlert[] {
    return [...this.activeAlerts]
  }

  /** Evaluate current metrics against thresholds and return any alerts */
  evaluateAlerts(): AlertEvaluation {
    this.pruneEvents()
    const events = this.events
    const thresholds = this.alertThresholds
    const now = Date.now()
    const alerts: PerformanceAlert[] = []
    let suppressedCount = 0

    // Not enough data to evaluate
    if (events.length < thresholds.minEventsForAlert) {
      this.activeAlerts = []
      return { alerts: [], thresholds, suppressedCount: 0 }
    }

    const cacheStats = this.computeCacheStats(events)
    const dbEvents = events.filter((e) => !e.cacheHit && e.success)
    const dbLatencies = dbEvents.map((e) => e.latencyMs)
    const avgDbLatency = dbLatencies.length > 0
      ? dbLatencies.reduce((a, b) => a + b, 0) / dbLatencies.length
      : 0
    const errorRate = events.length > 0
      ? events.filter((e) => !e.success).length / events.length
      : 0

    // Cache hit rate alerts
    if (cacheStats.hitRate < thresholds.cacheHitRateCritical) {
      const alert = this.createAlert('cache_hit_rate', 'critical', cacheStats.hitRate, thresholds.cacheHitRateCritical, now)
      if (alert) alerts.push(alert); else suppressedCount++
    } else if (cacheStats.hitRate < thresholds.cacheHitRateWarning) {
      const alert = this.createAlert('cache_hit_rate', 'warning', cacheStats.hitRate, thresholds.cacheHitRateWarning, now)
      if (alert) alerts.push(alert); else suppressedCount++
    }

    // Error rate alerts
    if (errorRate > thresholds.errorRateCritical) {
      const alert = this.createAlert('error_rate', 'critical', errorRate, thresholds.errorRateCritical, now)
      if (alert) alerts.push(alert); else suppressedCount++
    } else if (errorRate > thresholds.errorRateWarning) {
      const alert = this.createAlert('error_rate', 'warning', errorRate, thresholds.errorRateWarning, now)
      if (alert) alerts.push(alert); else suppressedCount++
    }

    // DB latency alerts
    if (dbLatencies.length > 0) {
      if (avgDbLatency > thresholds.dbLatencyCritical) {
        const alert = this.createAlert('db_latency', 'critical', avgDbLatency, thresholds.dbLatencyCritical, now)
        if (alert) alerts.push(alert); else suppressedCount++
      } else if (avgDbLatency > thresholds.dbLatencyWarning) {
        const alert = this.createAlert('db_latency', 'warning', avgDbLatency, thresholds.dbLatencyWarning, now)
        if (alert) alerts.push(alert); else suppressedCount++
      }
    }

    this.activeAlerts = alerts

    // Notify callback if there are new alerts
    if (alerts.length > 0 && this.onAlertCallback) {
      this.onAlertCallback(alerts)
    }

    return { alerts, thresholds, suppressedCount }
  }

  /** Clear all events */
  clear(): void {
    this.events = []
    this.startedAt = Date.now()
    this.activeAlerts = []
    this.lastAlertTimes.clear()
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private createAlert(
    type: PerformanceAlert['type'],
    severity: AlertSeverity,
    currentValue: number,
    threshold: number,
    now: number
  ): PerformanceAlert | null {
    const alertKey = `${type}:${severity}`
    const lastTriggered = this.lastAlertTimes.get(alertKey) || 0

    if (now - lastTriggered < this.alertThresholds.alertCooldownMs) {
      return null // Cooldown active
    }

    this.lastAlertTimes.set(alertKey, now)

    const messages: Record<PerformanceAlert['type'], (s: AlertSeverity, v: number, t: number) => string> = {
      cache_hit_rate: (s, v, t) =>
        `${s === 'critical' ? 'Critical' : 'Warning'}: Cache hit rate dropped to ${(v * 100).toFixed(1)}% (threshold: ${(t * 100).toFixed(0)}%)`,
      error_rate: (s, v, t) =>
        `${s === 'critical' ? 'Critical' : 'Warning'}: Error rate at ${(v * 100).toFixed(1)}% (threshold: ${(t * 100).toFixed(0)}%)`,
      db_latency: (s, v, t) =>
        `${s === 'critical' ? 'Critical' : 'Warning'}: DB latency at ${v.toFixed(0)}ms (threshold: ${t.toFixed(0)}ms)`,
    }

    return {
      id: `${type}-${severity}-${now}`,
      type,
      severity,
      message: messages[type](severity, currentValue, threshold),
      currentValue,
      threshold,
      triggeredAt: now,
    }
  }

  private pruneEvents(): void {
    const cutoff = Date.now() - MAX_AGE_MS

    // Remove events older than MAX_AGE_MS
    while (this.events.length > 0 && this.events[0].timestamp < cutoff) {
      this.events.shift()
    }

    // Trim to MAX_EVENTS
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS)
    }
  }

  private computeLatencyStats(latencies: number[]): LatencyStats {
    if (latencies.length === 0) {
      return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 }
    }

    const sorted = [...latencies].sort((a, b) => a - b)
    const sum = sorted.reduce((a, b) => a + b, 0)

    return {
      count: sorted.length,
      avgMs: Math.round((sum / sorted.length) * 100) / 100,
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
      p50Ms: this.percentile(sorted, 50),
      p95Ms: this.percentile(sorted, 95),
      p99Ms: this.percentile(sorted, 99),
    }
  }

  private percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0
    const index = Math.ceil((p / 100) * sortedArr.length) - 1
    return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))]
  }

  private computeCacheStats(events: ConfigFetchEvent[]): CacheStats {
    const total = events.length
    const hits = events.filter((e) => e.cacheHit).length
    const misses = total - hits

    return {
      totalRequests: total,
      cacheHits: hits,
      cacheMisses: misses,
      hitRate: total > 0 ? Math.round((hits / total) * 10000) / 10000 : 0,
    }
  }

  private computeCategoryStats(events: ConfigFetchEvent[]): CategoryStats[] {
    const byCategory = new Map<string, ConfigFetchEvent[]>()

    for (const event of events) {
      const existing = byCategory.get(event.category) || []
      existing.push(event)
      byCategory.set(event.category, existing)
    }

    return Array.from(byCategory.entries())
      .map(([category, catEvents]) => {
        const successEvents = catEvents.filter((e) => e.success)
        const avgLatency = successEvents.length > 0
          ? successEvents.reduce((sum, e) => sum + e.latencyMs, 0) / successEvents.length
          : 0

        return {
          category,
          fetchCount: catEvents.length,
          avgLatencyMs: Math.round(avgLatency * 100) / 100,
          cacheHitRate: catEvents.length > 0
            ? Math.round((catEvents.filter((e) => e.cacheHit).length / catEvents.length) * 10000) / 10000
            : 0,
          errorCount: catEvents.filter((e) => !e.success).length,
        }
      })
      .sort((a, b) => b.fetchCount - a.fetchCount)
  }

  private computeTtlRecommendation(
    events: ConfigFetchEvent[],
    dbLatencies: number[]
  ): TtlRecommendation {
    const current = this.cacheTtlMs
    const cacheStats = this.computeCacheStats(events)

    // Not enough data for recommendation
    if (events.length < 10) {
      return {
        currentTtlMs: current,
        suggestedTtlMs: current,
        reason: 'Insufficient data (need at least 10 events)',
        confidence: 'low',
      }
    }

    const avgDbLatency = dbLatencies.length > 0
      ? dbLatencies.reduce((a, b) => a + b, 0) / dbLatencies.length
      : 0

    // If cache hit rate is very high (>90%) and DB latency is low (<50ms),
    // TTL could be shorter for fresher data
    if (cacheStats.hitRate > 0.90 && avgDbLatency < 50) {
      const suggested = Math.max(60000, Math.round(current * 0.5)) // At least 1 minute
      if (suggested < current) {
        return {
          currentTtlMs: current,
          suggestedTtlMs: suggested,
          reason: `High cache hit rate (${(cacheStats.hitRate * 100).toFixed(1)}%) and low DB latency (${avgDbLatency.toFixed(0)}ms avg) suggest TTL can be reduced for fresher config`,
          confidence: 'medium',
        }
      }
    }

    // If cache hit rate is low (<50%), settings are being fetched frequently
    // from the DB — increase TTL
    if (cacheStats.hitRate < 0.50 && events.length > 20) {
      const suggested = Math.min(600000, Math.round(current * 2)) // Max 10 minutes
      return {
        currentTtlMs: current,
        suggestedTtlMs: suggested,
        reason: `Low cache hit rate (${(cacheStats.hitRate * 100).toFixed(1)}%) indicates frequent DB fetches — consider increasing TTL`,
        confidence: 'medium',
      }
    }

    // If DB latency is high (>200ms), increase TTL to reduce load
    if (avgDbLatency > 200) {
      const suggested = Math.min(600000, Math.round(current * 1.5))
      return {
        currentTtlMs: current,
        suggestedTtlMs: suggested,
        reason: `High DB latency (${avgDbLatency.toFixed(0)}ms avg) suggests increasing TTL to reduce database load`,
        confidence: 'high',
      }
    }

    // Current TTL seems appropriate
    return {
      currentTtlMs: current,
      suggestedTtlMs: current,
      reason: `Current TTL appears appropriate — hit rate ${(cacheStats.hitRate * 100).toFixed(1)}%, avg DB latency ${avgDbLatency.toFixed(0)}ms`,
      confidence: events.length > 50 ? 'high' : 'medium',
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const configPerformanceMonitor = ConfigPerformanceMonitor.getInstance()
