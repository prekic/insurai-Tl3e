/**
 * TTL Recommendation Validation Tests
 *
 * Validates the 5-minute cache TTL by simulating realistic production
 * config access patterns and verifying the TTL recommendation engine
 * produces appropriate suggestions.
 *
 * Based on production baseline data (Feb 2026):
 * - Health endpoint: ~800ms round-trip (includes network)
 * - AI providers: ~400ms round-trip
 * - AI diagnose: ~3000ms round-trip (includes provider checks)
 * - Server-side config DB fetch: typically 20-100ms (Supabase)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ConfigPerformanceMonitor } from '../config-performance-monitor'

describe('TTL Recommendation Validation', () => {
  let monitor: ConfigPerformanceMonitor

  beforeEach(() => {
    ConfigPerformanceMonitor.resetInstance()
    monitor = ConfigPerformanceMonitor.getInstance()
    monitor.setCacheTtl(300000) // 5 minutes — current default
  })

  // =========================================================================
  // Scenario 1: Typical production — steady-state with warm cache
  // =========================================================================

  it('should recommend keeping 5-min TTL for typical production load', () => {
    // Simulate: 4 config reads per extraction, ~10 extractions/hour
    // First read is a miss, next 3 within same TTL window are hits
    // This gives ~75% hit rate with moderate DB latency

    // Cold start misses
    for (let i = 0; i < 10; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 45 + Math.random() * 30, cacheHit: false, success: true })
    }

    // Warm cache hits (3x more than misses for 75% hit rate)
    for (let i = 0; i < 30; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 0.1 + Math.random() * 0.5, cacheHit: true, success: true })
    }

    // Some OCR config reads
    for (let i = 0; i < 5; i++) {
      monitor.record({ category: 'ocr', method: 'getOCRConfig', latencyMs: 50 + Math.random() * 20, cacheHit: false, success: true })
    }
    for (let i = 0; i < 15; i++) {
      monitor.record({ category: 'ocr', method: 'getOCRConfig', latencyMs: 0.2, cacheHit: true, success: true })
    }

    const snapshot = monitor.getSnapshot()

    // 75% hit rate, ~50ms avg DB latency → should keep current TTL
    expect(snapshot.cache.hitRate).toBeGreaterThan(0.70)
    expect(snapshot.cache.hitRate).toBeLessThan(0.90)
    expect(snapshot.ttlRecommendation.suggestedTtlMs).toBe(300000) // Keep 5 minutes
    expect(snapshot.ttlRecommendation.reason).toContain('appropriate')
    expect(snapshot.errorRate).toBe(0)
    expect(snapshot.alerts).toHaveLength(0)
  })

  // =========================================================================
  // Scenario 2: High-traffic with excellent cache — can reduce TTL
  // =========================================================================

  it('should suggest reducing TTL when cache hit rate >90% and DB is fast', () => {
    // Simulate: Very active server, 95% cache hits, fast DB (<50ms)
    for (let i = 0; i < 5; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 25 + Math.random() * 20, cacheHit: false, success: true })
    }
    for (let i = 0; i < 95; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 0.1 + Math.random() * 0.3, cacheHit: true, success: true })
    }

    const snapshot = monitor.getSnapshot()

    expect(snapshot.cache.hitRate).toBeGreaterThan(0.90)
    expect(snapshot.dbLatency.avgMs).toBeLessThan(50)
    // Should suggest lower TTL (150s = 5min * 0.5)
    expect(snapshot.ttlRecommendation.suggestedTtlMs).toBe(150000)
    expect(snapshot.ttlRecommendation.reason).toContain('reduced')
    expect(snapshot.ttlRecommendation.confidence).toBe('medium')
  })

  // =========================================================================
  // Scenario 3: Slow DB — should increase TTL
  // =========================================================================

  it('should suggest increasing TTL when DB latency is high', () => {
    // Simulate: Supabase under load, >200ms avg
    for (let i = 0; i < 20; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 200 + Math.random() * 150, cacheHit: false, success: true })
    }
    for (let i = 0; i < 30; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 0.2, cacheHit: true, success: true })
    }

    const snapshot = monitor.getSnapshot()

    expect(snapshot.dbLatency.avgMs).toBeGreaterThan(200)
    // Should suggest 450s (5min * 1.5)
    expect(snapshot.ttlRecommendation.suggestedTtlMs).toBe(450000)
    expect(snapshot.ttlRecommendation.reason).toContain('latency')
    expect(snapshot.ttlRecommendation.confidence).toBe('high')
  })

  // =========================================================================
  // Scenario 4: Low hit rate — cache thrashing
  // =========================================================================

  it('should suggest increasing TTL when cache hit rate is low', () => {
    // Simulate: Many different categories being fetched, low reuse
    const categories = ['ai', 'evaluation', 'rate_limits', 'ocr', 'gap_analysis', 'ui']
    for (let i = 0; i < 30; i++) {
      const cat = categories[i % categories.length]
      // Mostly misses
      monitor.record({ category: cat, method: 'get', latencyMs: 80 + Math.random() * 40, cacheHit: false, success: true })
    }
    // Only a few hits
    for (let i = 0; i < 5; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 0.3, cacheHit: true, success: true })
    }

    const snapshot = monitor.getSnapshot()

    expect(snapshot.cache.hitRate).toBeLessThan(0.50)
    // Should suggest 600s (5min * 2)
    expect(snapshot.ttlRecommendation.suggestedTtlMs).toBe(600000)
    expect(snapshot.ttlRecommendation.reason).toContain('Low cache hit rate')
  })

  // =========================================================================
  // Scenario 5: Insufficient data — keep current
  // =========================================================================

  it('should keep current TTL when insufficient data', () => {
    // Only 5 events — below the 10-event threshold
    for (let i = 0; i < 5; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 50, cacheHit: false, success: true })
    }

    const snapshot = monitor.getSnapshot()

    expect(snapshot.ttlRecommendation.suggestedTtlMs).toBe(300000) // Unchanged
    expect(snapshot.ttlRecommendation.confidence).toBe('low')
    expect(snapshot.ttlRecommendation.reason).toContain('Insufficient data')
  })

  // =========================================================================
  // Scenario 6: Alert thresholds
  // =========================================================================

  it('should trigger cache hit rate warning when below 50%', () => {
    // Disable alert cooldown so manual evaluateAlerts() works after auto-evaluation
    monitor.setAlertThresholds({ alertCooldownMs: 0 })

    for (let i = 0; i < 25; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 60, cacheHit: false, success: true })
    }
    for (let i = 0; i < 5; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 0.2, cacheHit: true, success: true })
    }

    const evaluation = monitor.evaluateAlerts()

    expect(evaluation.alerts.length).toBeGreaterThanOrEqual(1)
    const cacheAlert = evaluation.alerts.find(a => a.type === 'cache_hit_rate')
    expect(cacheAlert).toBeDefined()
    // 5/30 = 16.7% — below both critical (30%) and warning (50%)
    expect(cacheAlert!.severity).toBe('critical')
  })

  it('should trigger DB latency warning when above 200ms', () => {
    // Disable alert cooldown so manual evaluateAlerts() works after auto-evaluation
    monitor.setAlertThresholds({ alertCooldownMs: 0 })

    for (let i = 0; i < 25; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 250, cacheHit: false, success: true })
    }

    const evaluation = monitor.evaluateAlerts()

    const dbAlert = evaluation.alerts.find(a => a.type === 'db_latency')
    expect(dbAlert).toBeDefined()
    expect(dbAlert!.severity).toBe('warning')
    expect(dbAlert!.currentValue).toBeGreaterThan(200)
  })

  it('should trigger error rate alert when above 5%', () => {
    for (let i = 0; i < 19; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 50, cacheHit: false, success: true })
    }
    for (let i = 0; i < 3; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 5000, cacheHit: false, success: false, errorMessage: 'DB timeout' })
    }

    const evaluation = monitor.evaluateAlerts()

    const errorAlert = evaluation.alerts.find(a => a.type === 'error_rate')
    expect(errorAlert).toBeDefined()
    expect(errorAlert!.severity).toBe('warning')
  })

  // =========================================================================
  // Scenario 7: Per-category statistics
  // =========================================================================

  it('should track per-category statistics correctly', () => {
    // AI: 80% hit rate
    for (let i = 0; i < 4; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 45, cacheHit: false, success: true })
    }
    for (let i = 0; i < 16; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 0.2, cacheHit: true, success: true })
    }

    // OCR: 60% hit rate
    for (let i = 0; i < 4; i++) {
      monitor.record({ category: 'ocr', method: 'getOCRConfig', latencyMs: 55, cacheHit: false, success: true })
    }
    for (let i = 0; i < 6; i++) {
      monitor.record({ category: 'ocr', method: 'getOCRConfig', latencyMs: 0.3, cacheHit: true, success: true })
    }

    const snapshot = monitor.getSnapshot()

    const aiStats = snapshot.categories.find(c => c.category === 'ai')
    const ocrStats = snapshot.categories.find(c => c.category === 'ocr')

    expect(aiStats).toBeDefined()
    expect(aiStats!.fetchCount).toBe(20)
    expect(aiStats!.cacheHitRate).toBe(0.8)

    expect(ocrStats).toBeDefined()
    expect(ocrStats!.fetchCount).toBe(10)
    expect(ocrStats!.cacheHitRate).toBe(0.6)
  })

  // =========================================================================
  // Scenario 8: Production-realistic Supabase latency profile
  // =========================================================================

  it('should validate 5-min TTL with realistic Supabase latency profile', () => {
    // Supabase hosted in US/EU, insurai in Railway
    // Typical Supabase query latency: 20-80ms for simple SELECT
    // Occasional spikes to 150-200ms during high load

    // Simulate 1 hour of production traffic:
    // ~40 extractions/hour, each reads AI config once (cache miss every 5 min = ~12 misses/hour)
    // Plus OCR config, evaluation config reads

    // AI config: 12 misses, 28 hits
    const aiMissLatencies = [25, 35, 42, 28, 55, 32, 48, 180, 38, 45, 30, 62]
    for (const latency of aiMissLatencies) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: latency, cacheHit: false, success: true })
    }
    for (let i = 0; i < 28; i++) {
      monitor.record({ category: 'ai', method: 'getAIConfig', latencyMs: 0.05 + Math.random() * 0.2, cacheHit: true, success: true })
    }

    // OCR config: 12 misses, 18 hits
    for (let i = 0; i < 12; i++) {
      monitor.record({ category: 'ocr', method: 'getOCRConfig', latencyMs: 30 + Math.random() * 40, cacheHit: false, success: true })
    }
    for (let i = 0; i < 18; i++) {
      monitor.record({ category: 'ocr', method: 'getOCRConfig', latencyMs: 0.1, cacheHit: true, success: true })
    }

    // Evaluation config: 6 misses, 12 hits
    for (let i = 0; i < 6; i++) {
      monitor.record({ category: 'evaluation', method: 'get', latencyMs: 35 + Math.random() * 25, cacheHit: false, success: true })
    }
    for (let i = 0; i < 12; i++) {
      monitor.record({ category: 'evaluation', method: 'get', latencyMs: 0.15, cacheHit: true, success: true })
    }

    // Rate limits config: 4 misses, 8 hits
    for (let i = 0; i < 4; i++) {
      monitor.record({ category: 'rate_limits', method: 'get', latencyMs: 22 + Math.random() * 15, cacheHit: false, success: true })
    }
    for (let i = 0; i < 8; i++) {
      monitor.record({ category: 'rate_limits', method: 'get', latencyMs: 0.1, cacheHit: true, success: true })
    }

    const snapshot = monitor.getSnapshot()

    // Validate the profile
    console.log('=== Production-Realistic Validation ===')
    console.log(`Total events: ${snapshot.totalEvents}`)
    console.log(`Cache hit rate: ${(snapshot.cache.hitRate * 100).toFixed(1)}%`)
    console.log(`DB avg latency: ${snapshot.dbLatency.avgMs.toFixed(1)}ms`)
    console.log(`DB p95 latency: ${snapshot.dbLatency.p95Ms.toFixed(1)}ms`)
    console.log(`Error rate: ${(snapshot.errorRate * 100).toFixed(1)}%`)
    console.log(`TTL recommendation: ${snapshot.ttlRecommendation.suggestedTtlMs / 1000}s`)
    console.log(`Reason: ${snapshot.ttlRecommendation.reason}`)
    console.log(`Confidence: ${snapshot.ttlRecommendation.confidence}`)

    // Assertions
    // ~65% cache hits (34 misses out of 100 total)
    expect(snapshot.cache.hitRate).toBeGreaterThan(0.55)
    expect(snapshot.cache.hitRate).toBeLessThan(0.75)

    // DB latency should be moderate (40-80ms avg)
    expect(snapshot.dbLatency.avgMs).toBeGreaterThan(20)
    expect(snapshot.dbLatency.avgMs).toBeLessThan(100)

    // With 65% hit rate and moderate latency, TTL should stay at 5 minutes
    expect(snapshot.ttlRecommendation.suggestedTtlMs).toBe(300000)
    expect(snapshot.ttlRecommendation.confidence).toBe('high') // 100+ events
    expect(snapshot.errorRate).toBe(0)
    expect(snapshot.alerts).toHaveLength(0)
  })

  // =========================================================================
  // Scenario 9: Boundary conditions
  // =========================================================================

  it('should handle TTL floor correctly (minimum 60s)', () => {
    // Set TTL to 120s, then trigger "reduce" recommendation
    monitor.setCacheTtl(120000)

    for (let i = 0; i < 5; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 20, cacheHit: false, success: true })
    }
    for (let i = 0; i < 95; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 0.1, cacheHit: true, success: true })
    }

    const snapshot = monitor.getSnapshot()

    // 120s * 0.5 = 60s, which is the floor
    expect(snapshot.ttlRecommendation.suggestedTtlMs).toBe(60000)
  })

  it('should handle TTL ceiling correctly (maximum 600s)', () => {
    // Set TTL to 480s, then trigger "increase" recommendation
    monitor.setCacheTtl(480000)

    for (let i = 0; i < 25; i++) {
      monitor.record({ category: 'ai', method: 'get', latencyMs: 300, cacheHit: false, success: true })
    }

    const snapshot = monitor.getSnapshot()

    // 480s * 1.5 = 720s, but capped at 600s
    expect(snapshot.ttlRecommendation.suggestedTtlMs).toBe(600000)
  })
})
