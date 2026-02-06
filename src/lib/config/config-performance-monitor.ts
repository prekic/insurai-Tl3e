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
}

export interface TtlRecommendation {
  currentTtlMs: number
  suggestedTtlMs: number
  reason: string
  confidence: 'high' | 'medium' | 'low'
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

  /** Record a config fetch event */
  record(event: Omit<ConfigFetchEvent, 'timestamp'>): void {
    const fullEvent: ConfigFetchEvent = {
      ...event,
      timestamp: Date.now(),
    }

    this.events.push(fullEvent)
    this.pruneEvents()
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

  /** Clear all events */
  clear(): void {
    this.events = []
    this.startedAt = Date.now()
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

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
