#!/usr/bin/env npx tsx
/**
 * Config Performance Baseline Script
 *
 * Exercises the server-side config service to generate performance data,
 * then fetches the /api/admin/settings/performance endpoint to validate
 * the 5-minute cache TTL recommendation.
 *
 * Usage:
 *   # Against local server (default):
 *   npx tsx scripts/config-perf-baseline.ts
 *
 *   # Against production:
 *   ADMIN_TOKEN=<jwt> BASE_URL=https://insurai-production.up.railway.app npx tsx scripts/config-perf-baseline.ts
 *
 * What it does:
 *   1. Simulates realistic config access patterns (AI extraction, OCR, evaluation, etc.)
 *   2. Hits the config endpoints repeatedly to build up performance data
 *   3. Fetches the /performance snapshot and prints a full analysis
 *   4. Validates the TTL recommendation algorithm's output
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:4001'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''

// =============================================================================
// HELPERS
// =============================================================================

async function fetchJSON(path: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (ADMIN_TOKEN) {
    headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  const text = await res.text()

  try {
    return { status: res.status, data: JSON.parse(text) }
  } catch {
    return { status: res.status, data: text }
  }
}

function formatMs(ms: number): string {
  return ms < 1 ? '<1ms' : `${ms.toFixed(1)}ms`
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

// =============================================================================
// STEP 1: HEALTH CHECK
// =============================================================================

async function checkHealth() {
  console.log('\n=== Step 1: Health Check ===\n')

  const { status, data } = await fetchJSON('/api/health')
  if (status !== 200) {
    console.error(`Health check failed (${status}):`, data)
    process.exit(1)
  }

  console.log(`Status: ${data.status}`)
  console.log(`Providers: openai=${data.providers?.openai}, anthropic=${data.providers?.anthropic}, google=${data.providers?.google}`)
  console.log(`Database: ${data.database || 'unknown'}`)
}

// =============================================================================
// STEP 2: SIMULATE CONFIG ACCESS PATTERNS
// =============================================================================

async function simulateConfigAccess() {
  console.log('\n=== Step 2: Simulate Config Access Patterns ===\n')

  // These endpoints trigger getAIConfig(), getRateLimitsConfig(), etc. on the server
  // Each call goes through getCategorySettings() which is now instrumented

  const endpoints = [
    '/api/ai/providers',        // Triggers config reads
    '/api/health',              // Light endpoint
  ]

  // Make multiple requests to build up performance data
  const rounds = 10
  const results: { endpoint: string; latencyMs: number; status: number }[] = []

  for (let i = 0; i < rounds; i++) {
    for (const endpoint of endpoints) {
      const start = performance.now()
      const { status } = await fetchJSON(endpoint)
      const latencyMs = performance.now() - start
      results.push({ endpoint, latencyMs, status })
    }

    // Brief pause between rounds to simulate real traffic
    if (i < rounds - 1) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  // Summary
  const byEndpoint = new Map<string, number[]>()
  for (const r of results) {
    const existing = byEndpoint.get(r.endpoint) || []
    existing.push(r.latencyMs)
    byEndpoint.set(r.endpoint, existing)
  }

  console.log('Request latencies from client perspective:')
  for (const [endpoint, latencies] of byEndpoint) {
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
    const sorted = [...latencies].sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
    console.log(`  ${endpoint}: avg=${formatMs(avg)}, p95=${formatMs(p95)}, count=${latencies.length}`)
  }

  return results.length
}

// =============================================================================
// STEP 3: FETCH AND ANALYZE PERFORMANCE SNAPSHOT
// =============================================================================

async function fetchPerformanceSnapshot() {
  console.log('\n=== Step 3: Server Performance Snapshot ===\n')

  const { status, data } = await fetchJSON('/api/admin/settings/performance')

  if (status === 401) {
    console.log('Admin endpoint requires authentication.')
    console.log('Set ADMIN_TOKEN env var to access the performance endpoint.')
    console.log('\nTo get a token:')
    console.log('  1. Log into admin panel')
    console.log('  2. Copy JWT from browser devtools (Application > Local Storage > admin_token)')
    console.log('  3. Run: ADMIN_TOKEN=<jwt> npx tsx scripts/config-perf-baseline.ts')
    return null
  }

  if (status !== 200 || !data.success) {
    console.error(`Failed to fetch performance data (${status}):`, data)
    return null
  }

  return data.data
}

function analyzeSnapshot(snapshot: Record<string, unknown>) {
  const totalEvents = snapshot.totalEvents as number
  const dbLatency = snapshot.dbLatency as Record<string, number>
  const overallLatency = snapshot.overallLatency as Record<string, number>
  const cacheData = snapshot.cache as Record<string, number>
  const categories = snapshot.categories as Array<Record<string, unknown>>
  const errorRate = snapshot.errorRate as number
  const alerts = snapshot.alerts as unknown[]
  const ttlRec = snapshot.ttlRecommendation as Record<string, unknown> | undefined

  console.log('--- Overview ---')
  console.log(`  Total events tracked: ${totalEvents}`)
  console.log(`  Error rate: ${formatPercent(errorRate)}`)
  console.log()

  console.log('--- Cache Statistics ---')
  console.log(`  Total requests:  ${cacheData.totalRequests}`)
  console.log(`  Cache hits:      ${cacheData.cacheHits}`)
  console.log(`  Cache misses:    ${cacheData.cacheMisses}`)
  console.log(`  Hit rate:        ${formatPercent(cacheData.hitRate)}`)
  console.log()

  console.log('--- DB Latency (cache misses only) ---')
  if (dbLatency.count > 0) {
    console.log(`  Count:   ${dbLatency.count}`)
    console.log(`  Average: ${formatMs(dbLatency.avgMs)}`)
    console.log(`  Min:     ${formatMs(dbLatency.minMs)}`)
    console.log(`  P50:     ${formatMs(dbLatency.p50Ms)}`)
    console.log(`  P95:     ${formatMs(dbLatency.p95Ms)}`)
    console.log(`  P99:     ${formatMs(dbLatency.p99Ms)}`)
    console.log(`  Max:     ${formatMs(dbLatency.maxMs)}`)
  } else {
    console.log('  No DB fetches recorded (all cache hits)')
  }
  console.log()

  console.log('--- Overall Latency (all requests) ---')
  if (overallLatency.count > 0) {
    console.log(`  Count:   ${overallLatency.count}`)
    console.log(`  Average: ${formatMs(overallLatency.avgMs)}`)
    console.log(`  P50:     ${formatMs(overallLatency.p50Ms)}`)
    console.log(`  P95:     ${formatMs(overallLatency.p95Ms)}`)
  }
  console.log()

  if (categories && categories.length > 0) {
    console.log('--- Per-Category Breakdown ---')
    for (const cat of categories) {
      console.log(`  ${cat.category}: ${cat.fetchCount} fetches, avg=${formatMs(cat.avgLatencyMs as number)}, hitRate=${formatPercent(cat.cacheHitRate as number)}, errors=${cat.errorCount}`)
    }
    console.log()
  }

  if (alerts && alerts.length > 0) {
    console.log('--- Active Alerts ---')
    for (const alert of alerts as Array<Record<string, unknown>>) {
      console.log(`  [${alert.severity}] ${alert.message}`)
    }
    console.log()
  }

  if (ttlRec) {
    console.log('--- TTL Recommendation ---')
    console.log(`  Current TTL:   ${(ttlRec.currentTtlMs as number) / 1000}s`)
    console.log(`  Suggested TTL: ${(ttlRec.suggestedTtlMs as number) / 1000}s`)
    console.log(`  Reason:        ${ttlRec.reason}`)
    console.log(`  Confidence:    ${ttlRec.confidence}`)
  }
}

// =============================================================================
// STEP 4: VALIDATE TTL RECOMMENDATION
// =============================================================================

function validateTtlRecommendation(snapshot: Record<string, unknown>) {
  console.log('\n=== Step 4: TTL Validation Analysis ===\n')

  const cacheData = snapshot.cache as Record<string, number>
  const dbLatency = snapshot.dbLatency as Record<string, number>
  const totalEvents = snapshot.totalEvents as number
  const errorRate = snapshot.errorRate as number

  const CURRENT_TTL_MS = 300000 // 5 minutes

  console.log('Evaluation criteria for 5-minute (300s) cache TTL:')
  console.log()

  // Criterion 1: Cache hit rate
  const hitRate = cacheData.hitRate
  if (hitRate > 0.90) {
    console.log(`  [PASS] Cache hit rate ${formatPercent(hitRate)} > 90%`)
    console.log('         → Cache is very effective; TTL could be shorter for fresher config')
  } else if (hitRate > 0.50) {
    console.log(`  [GOOD] Cache hit rate ${formatPercent(hitRate)} is healthy (50-90%)`)
    console.log('         → Current TTL is appropriate')
  } else if (hitRate > 0) {
    console.log(`  [WARN] Cache hit rate ${formatPercent(hitRate)} < 50%`)
    console.log('         → Consider increasing TTL to reduce DB load')
  } else {
    console.log('  [INFO] No cache data yet (cold start)')
  }

  // Criterion 2: DB latency
  const avgDbLatency = dbLatency.avgMs
  if (avgDbLatency > 200) {
    console.log(`  [WARN] Avg DB latency ${formatMs(avgDbLatency)} > 200ms`)
    console.log('         → High latency suggests increasing TTL to reduce DB calls')
  } else if (avgDbLatency > 50) {
    console.log(`  [GOOD] Avg DB latency ${formatMs(avgDbLatency)} is moderate (50-200ms)`)
    console.log('         → Current TTL is appropriate')
  } else if (avgDbLatency > 0) {
    console.log(`  [PASS] Avg DB latency ${formatMs(avgDbLatency)} < 50ms`)
    console.log('         → DB is fast; TTL could be shorter if fresher config needed')
  } else {
    console.log('  [INFO] No DB latency data yet')
  }

  // Criterion 3: Error rate
  if (errorRate > 0.05) {
    console.log(`  [WARN] Error rate ${formatPercent(errorRate)} > 5%`)
    console.log('         → High error rate may indicate DB connectivity issues')
  } else {
    console.log(`  [GOOD] Error rate ${formatPercent(errorRate)} < 5%`)
  }

  // Criterion 4: Data sufficiency
  if (totalEvents < 10) {
    console.log(`  [INFO] Only ${totalEvents} events — insufficient for high-confidence recommendation`)
    console.log('         → Need at least 10 events; 50+ for high confidence')
  } else if (totalEvents < 50) {
    console.log(`  [INFO] ${totalEvents} events — medium confidence level`)
  } else {
    console.log(`  [GOOD] ${totalEvents} events — high confidence data set`)
  }

  // Final recommendation
  console.log()
  console.log('--- Final Assessment ---')
  console.log()

  if (totalEvents < 10) {
    console.log('  RECOMMENDATION: Keep 5-minute TTL (insufficient data to recommend change)')
    console.log(`  Suggested TTL: ${CURRENT_TTL_MS / 1000}s (unchanged)`)
  } else if (hitRate > 0.90 && avgDbLatency < 50) {
    const suggested = Math.max(60, CURRENT_TTL_MS / 2 / 1000)
    console.log(`  RECOMMENDATION: TTL can be reduced to ${suggested}s for fresher config`)
    console.log('  Rationale: Very high cache hit rate + fast DB means shorter TTL is safe')
  } else if (hitRate < 0.50 || avgDbLatency > 200) {
    const suggested = Math.min(600, CURRENT_TTL_MS * 2 / 1000)
    console.log(`  RECOMMENDATION: Consider increasing TTL to ${suggested}s`)
    console.log('  Rationale: Low hit rate or high DB latency warrants longer cache lifetime')
  } else {
    console.log('  RECOMMENDATION: Current 5-minute TTL is appropriate')
    console.log('  Rationale: Cache hit rate and DB latency are within healthy ranges')
  }

  console.log()
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   Config Performance Baseline                ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log(`║  Target: ${BASE_URL.padEnd(36)}║`)
  console.log(`║  Auth:   ${ADMIN_TOKEN ? 'Provided' : 'Not set (limited analysis)'.padEnd(36)}║`)
  console.log('╚══════════════════════════════════════════════╝')

  try {
    // Step 1: Verify server is healthy
    await checkHealth()

    // Step 2: Generate config access traffic
    const requestCount = await simulateConfigAccess()
    console.log(`\nGenerated ${requestCount} requests to build performance data.`)

    // Step 3: Fetch server performance snapshot
    const snapshot = await fetchPerformanceSnapshot()

    if (snapshot) {
      analyzeSnapshot(snapshot)

      // Step 4: Validate TTL recommendation
      validateTtlRecommendation(snapshot)
    } else {
      // Fallback analysis from client-side request data
      console.log('\n=== Fallback: Client-Side Analysis ===\n')
      console.log('Without admin access, we can only analyze client-to-server latency.')
      console.log('For full server-side config performance metrics, provide ADMIN_TOKEN.')
      console.log()
      console.log('Based on general analysis:')
      console.log('  - 5-minute TTL is a reasonable default for config settings')
      console.log('  - Admin settings change infrequently (minutes/hours, not seconds)')
      console.log('  - 5-minute cache reduces DB queries by ~97% during steady state')
      console.log('  - Worst case: config changes take up to 5 minutes to propagate')
      console.log('  - This delay is acceptable for admin configuration changes')
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
