/**
 * Real-time Monitoring Middleware for Admin Dashboard
 *
 * Provides comprehensive system monitoring including:
 * - Real-time metrics collection
 * - System health checks
 * - Performance tracking
 * - Configurable alerting
 * - Analytics and trends
 */

import { supabase } from '../lib/supabase.js'

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SystemMetrics {
  timestamp: string
  cpu: {
    usage: number
    loadAverage: number[]
  }
  memory: {
    used: number
    total: number
    percentage: number
  }
  requests: {
    total: number
    perMinute: number
    perHour: number
  }
  errors: {
    total: number
    perMinute: number
    rate: number
  }
  latency: {
    p50: number
    p95: number
    p99: number
    avg: number
  }
  uptime: number
}

export interface ComponentHealth {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  lastCheck: string
  responseTime?: number
  message?: string
  details?: Record<string, unknown>
}

export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  components: ComponentHealth[]
  uptime: number
}

export interface AlertRule {
  id: string
  name: string
  description: string
  metric: string
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  threshold: number
  severity: 'info' | 'warning' | 'critical'
  enabled: boolean
  cooldownMinutes: number
  notificationChannels: string[]
  createdAt: string
  updatedAt: string
  lastTriggered?: string
}

export interface Alert {
  id: string
  ruleId: string
  ruleName: string
  metric: string
  value: number
  threshold: number
  severity: 'info' | 'warning' | 'critical'
  message: string
  timestamp: string
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: string
  resolved: boolean
  resolvedAt?: string
}

export interface RequestMetric {
  endpoint: string
  method: string
  statusCode: number
  responseTime: number
  timestamp: string
  userId?: string
  provider?: string
  error?: string
}

export interface EndpointStats {
  endpoint: string
  method: string
  totalRequests: number
  successCount: number
  errorCount: number
  avgResponseTime: number
  p95ResponseTime: number
  errorRate: number
}

export interface TrendData {
  timestamp: string
  value: number
}

export interface AnalyticsTrends {
  period: string
  requests: TrendData[]
  errors: TrendData[]
  latency: TrendData[]
  aiUsage: TrendData[]
}

export interface DashboardSummary {
  metrics: SystemMetrics
  health: HealthCheckResult
  activeAlerts: Alert[]
  recentActivity: RequestMetric[]
  topEndpoints: EndpointStats[]
  trends: AnalyticsTrends
}

// ============================================================================
// In-Memory Storage
// ============================================================================

const metricsBuffer: RequestMetric[] = []
const MAX_BUFFER_SIZE = 10000

const alertRules: Map<string, AlertRule> = new Map()
const activeAlerts: Map<string, Alert> = new Map()
const alertHistory: Alert[] = []
const MAX_ALERT_HISTORY = 1000

let requestCount = 0
let errorCount = 0
let totalResponseTime = 0
const responseTimes: number[] = []
const MAX_RESPONSE_TIMES = 1000

const startTime = Date.now()

// Rate tracking
const minuteRequests: Map<number, number> = new Map()
const minuteErrors: Map<number, number> = new Map()

// ============================================================================
// Metrics Collection
// ============================================================================

/**
 * Record a request metric
 */
export function recordRequest(metric: RequestMetric): void {
  // Add to buffer
  metricsBuffer.push(metric)
  if (metricsBuffer.length > MAX_BUFFER_SIZE) {
    metricsBuffer.shift()
  }

  // Update counters
  requestCount++
  totalResponseTime += metric.responseTime

  // Track response times for percentiles
  responseTimes.push(metric.responseTime)
  if (responseTimes.length > MAX_RESPONSE_TIMES) {
    responseTimes.shift()
  }

  // Track errors
  if (metric.statusCode >= 400) {
    errorCount++
  }

  // Track per-minute stats
  const minuteKey = Math.floor(Date.now() / 60000)
  minuteRequests.set(minuteKey, (minuteRequests.get(minuteKey) || 0) + 1)
  if (metric.statusCode >= 400) {
    minuteErrors.set(minuteKey, (minuteErrors.get(minuteKey) || 0) + 1)
  }

  // Clean old minute entries (keep last 60 minutes)
  const oldMinuteKey = minuteKey - 60
  for (const [key] of minuteRequests) {
    if (key < oldMinuteKey) {
      minuteRequests.delete(key)
      minuteErrors.delete(key)
    }
  }

  // Check alert rules
  checkAlertRules(metric)

  // Persist to database asynchronously
  persistMetric(metric).catch(() => {
    // Silently fail - metrics are also in memory
  })
}

/**
 * Persist metric to database
 */
async function persistMetric(metric: RequestMetric): Promise<void> {
  if (!supabase) return

  await supabase.from('request_metrics').insert({
    endpoint: metric.endpoint,
    method: metric.method,
    status_code: metric.statusCode,
    response_time: metric.responseTime,
    user_id: metric.userId,
    provider: metric.provider,
    error: metric.error,
    created_at: metric.timestamp,
  })
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

/**
 * Get current system metrics
 */
export function getSystemMetrics(): SystemMetrics {
  const now = Date.now()
  const uptimeMs = now - startTime

  // Calculate requests per minute/hour
  const currentMinute = Math.floor(now / 60000)
  let requestsPerMinute = 0
  let requestsPerHour = 0
  let errorsPerMinute = 0

  for (const [key, count] of minuteRequests) {
    if (key === currentMinute) {
      requestsPerMinute = count
    }
    if (key >= currentMinute - 60) {
      requestsPerHour += count
    }
  }

  for (const [key, count] of minuteErrors) {
    if (key === currentMinute) {
      errorsPerMinute = count
    }
  }

  // Memory usage (Node.js process)
  const memUsage = process.memoryUsage()

  return {
    timestamp: new Date().toISOString(),
    cpu: {
      usage: process.cpuUsage().user / 1000000, // Convert to seconds
      loadAverage: [0, 0, 0], // Would need os module for actual load
    },
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
    },
    requests: {
      total: requestCount,
      perMinute: requestsPerMinute,
      perHour: requestsPerHour,
    },
    errors: {
      total: errorCount,
      perMinute: errorsPerMinute,
      rate: requestCount > 0 ? (errorCount / requestCount) * 100 : 0,
    },
    latency: {
      p50: percentile(responseTimes, 50),
      p95: percentile(responseTimes, 95),
      p99: percentile(responseTimes, 99),
      avg: requestCount > 0 ? totalResponseTime / requestCount : 0,
    },
    uptime: Math.floor(uptimeMs / 1000),
  }
}

// ============================================================================
// Health Checks
// ============================================================================

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<ComponentHealth> {
  const start = Date.now()
  try {
    if (!supabase) {
      return {
        name: 'database',
        status: 'unknown',
        lastCheck: new Date().toISOString(),
        message: 'Supabase client not initialized',
      }
    }

    const { error } = await supabase.from('admin_users').select('count').limit(1)
    const responseTime = Date.now() - start

    if (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        responseTime,
        message: error.message,
      }
    }

    return {
      name: 'database',
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      lastCheck: new Date().toISOString(),
      responseTime,
      message: responseTime < 1000 ? 'Connected' : 'Slow response',
    }
  } catch (err) {
    return {
      name: 'database',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      responseTime: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Check AI provider health
 */
async function checkAIProviderHealth(provider: string): Promise<ComponentHealth> {
  const envKey =
    provider === 'openai'
      ? 'OPENAI_API_KEY'
      : provider === 'anthropic'
        ? 'ANTHROPIC_API_KEY'
        : 'GOOGLE_CLOUD_API_KEY'

  const hasKey = !!process.env[envKey]

  return {
    name: `ai-${provider}`,
    status: hasKey ? 'healthy' : 'unknown',
    lastCheck: new Date().toISOString(),
    message: hasKey ? 'API key configured' : 'API key not configured',
    details: {
      configured: hasKey,
    },
  }
}

/**
 * Check memory health
 */
function checkMemoryHealth(): ComponentHealth {
  const memUsage = process.memoryUsage()
  const percentage = (memUsage.heapUsed / memUsage.heapTotal) * 100

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
  let message = 'Memory usage normal'

  if (percentage > 90) {
    status = 'unhealthy'
    message = 'Critical memory usage'
  } else if (percentage > 75) {
    status = 'degraded'
    message = 'High memory usage'
  }

  return {
    name: 'memory',
    status,
    lastCheck: new Date().toISOString(),
    message,
    details: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: Math.round(percentage * 100) / 100,
    },
  }
}

/**
 * Check error rate health
 */
function checkErrorRateHealth(): ComponentHealth {
  const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
  let message = 'Error rate normal'

  if (errorRate > 10) {
    status = 'unhealthy'
    message = 'Critical error rate'
  } else if (errorRate > 5) {
    status = 'degraded'
    message = 'Elevated error rate'
  }

  return {
    name: 'error-rate',
    status,
    lastCheck: new Date().toISOString(),
    message,
    details: {
      rate: Math.round(errorRate * 100) / 100,
      totalErrors: errorCount,
      totalRequests: requestCount,
    },
  }
}

/**
 * Run all health checks
 */
export async function runHealthChecks(): Promise<HealthCheckResult> {
  const components: ComponentHealth[] = []

  // Run all checks in parallel
  const [database, openai, anthropic, google] = await Promise.all([
    checkDatabaseHealth(),
    checkAIProviderHealth('openai'),
    checkAIProviderHealth('anthropic'),
    checkAIProviderHealth('google'),
  ])

  components.push(database)
  components.push(openai)
  components.push(anthropic)
  components.push(google)
  components.push(checkMemoryHealth())
  components.push(checkErrorRateHealth())

  // Determine overall status
  const hasUnhealthy = components.some((c) => c.status === 'unhealthy')
  const hasDegraded = components.some((c) => c.status === 'degraded')

  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
  if (hasUnhealthy) {
    overall = 'unhealthy'
  } else if (hasDegraded) {
    overall = 'degraded'
  }

  return {
    overall,
    timestamp: new Date().toISOString(),
    components,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  }
}

// ============================================================================
// Alert Management
// ============================================================================

/**
 * Create an alert rule
 */
export function createAlertRule(
  rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>
): AlertRule {
  const now = new Date().toISOString()
  const newRule: AlertRule = {
    ...rule,
    id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  }

  alertRules.set(newRule.id, newRule)
  return newRule
}

/**
 * Get all alert rules
 */
export function getAlertRules(): AlertRule[] {
  return Array.from(alertRules.values())
}

/**
 * Get alert rule by ID
 */
export function getAlertRule(id: string): AlertRule | undefined {
  return alertRules.get(id)
}

/**
 * Update an alert rule
 */
export function updateAlertRule(
  id: string,
  updates: Partial<Omit<AlertRule, 'id' | 'createdAt'>>
): AlertRule | null {
  const rule = alertRules.get(id)
  if (!rule) return null

  const updated: AlertRule = {
    ...rule,
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  alertRules.set(id, updated)
  return updated
}

/**
 * Delete an alert rule
 */
export function deleteAlertRule(id: string): boolean {
  return alertRules.delete(id)
}

/**
 * Check alert rules against a metric
 */
function checkAlertRules(metric: RequestMetric): void {
  for (const rule of alertRules.values()) {
    if (!rule.enabled) continue

    // Check cooldown
    if (rule.lastTriggered) {
      const cooldownMs = rule.cooldownMinutes * 60 * 1000
      if (Date.now() - new Date(rule.lastTriggered).getTime() < cooldownMs) {
        continue
      }
    }

    let value: number | undefined
    let triggered = false

    // Map metric to rule
    switch (rule.metric) {
      case 'response_time':
        value = metric.responseTime
        break
      case 'error_rate':
        value = requestCount > 0 ? (errorCount / requestCount) * 100 : 0
        break
      case 'status_code':
        value = metric.statusCode
        break
      default:
        continue
    }

    if (value === undefined) continue

    // Check condition
    switch (rule.condition) {
      case 'gt':
        triggered = value > rule.threshold
        break
      case 'gte':
        triggered = value >= rule.threshold
        break
      case 'lt':
        triggered = value < rule.threshold
        break
      case 'lte':
        triggered = value <= rule.threshold
        break
      case 'eq':
        triggered = value === rule.threshold
        break
    }

    if (triggered) {
      triggerAlert(rule, value)
    }
  }
}

/**
 * Trigger an alert
 */
function triggerAlert(rule: AlertRule, value: number): void {
  const alert: Alert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ruleId: rule.id,
    ruleName: rule.name,
    metric: rule.metric,
    value,
    threshold: rule.threshold,
    severity: rule.severity,
    message: `${rule.name}: ${rule.metric} is ${value} (threshold: ${rule.threshold})`,
    timestamp: new Date().toISOString(),
    acknowledged: false,
    resolved: false,
  }

  activeAlerts.set(alert.id, alert)
  alertHistory.push(alert)

  // Trim history
  if (alertHistory.length > MAX_ALERT_HISTORY) {
    alertHistory.shift()
  }

  // Update rule last triggered
  rule.lastTriggered = alert.timestamp
  alertRules.set(rule.id, rule)

  // Persist alert
  persistAlert(alert).catch(() => {})
}

/**
 * Persist alert to database
 */
async function persistAlert(alert: Alert): Promise<void> {
  if (!supabase) return

  await supabase.from('monitoring_alerts').insert({
    id: alert.id,
    rule_id: alert.ruleId,
    rule_name: alert.ruleName,
    metric: alert.metric,
    value: alert.value,
    threshold: alert.threshold,
    severity: alert.severity,
    message: alert.message,
    acknowledged: alert.acknowledged,
    resolved: alert.resolved,
    created_at: alert.timestamp,
  })
}

/**
 * Get active alerts
 */
export function getActiveAlerts(): Alert[] {
  return Array.from(activeAlerts.values()).filter((a) => !a.resolved)
}

/**
 * Get alert history
 */
export function getAlertHistory(limit = 100): Alert[] {
  return alertHistory.slice(-limit)
}

/**
 * Acknowledge an alert
 */
export function acknowledgeAlert(alertId: string, acknowledgedBy: string): Alert | null {
  const alert = activeAlerts.get(alertId)
  if (!alert) return null

  alert.acknowledged = true
  alert.acknowledgedBy = acknowledgedBy
  alert.acknowledgedAt = new Date().toISOString()

  activeAlerts.set(alertId, alert)
  return alert
}

/**
 * Resolve an alert
 */
export function resolveAlert(alertId: string): Alert | null {
  const alert = activeAlerts.get(alertId)
  if (!alert) return null

  alert.resolved = true
  alert.resolvedAt = new Date().toISOString()

  activeAlerts.set(alertId, alert)
  return alert
}

// ============================================================================
// Analytics & Trends
// ============================================================================

/**
 * Get endpoint statistics
 */
export function getEndpointStats(): EndpointStats[] {
  const statsMap: Map<string, EndpointStats> = new Map()

  for (const metric of metricsBuffer) {
    const key = `${metric.method}:${metric.endpoint}`
    const existing = statsMap.get(key) || {
      endpoint: metric.endpoint,
      method: metric.method,
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      errorRate: 0,
    }

    existing.totalRequests++
    if (metric.statusCode < 400) {
      existing.successCount++
    } else {
      existing.errorCount++
    }

    statsMap.set(key, existing)
  }

  // Calculate averages and percentiles
  for (const [key, stats] of statsMap) {
    const metrics = metricsBuffer.filter(
      (m) => m.method === stats.method && m.endpoint === stats.endpoint
    )
    const times = metrics.map((m) => m.responseTime)

    stats.avgResponseTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0
    stats.p95ResponseTime = percentile(times, 95)
    stats.errorRate = stats.totalRequests > 0 ? (stats.errorCount / stats.totalRequests) * 100 : 0

    statsMap.set(key, stats)
  }

  return Array.from(statsMap.values()).sort((a, b) => b.totalRequests - a.totalRequests)
}

/**
 * Get trends for a time period
 */
export function getTrends(
  periodMinutes: number = 60,
  intervalMinutes: number = 5
): AnalyticsTrends {
  const now = Date.now()
  const startTime = now - periodMinutes * 60 * 1000
  const intervals = Math.ceil(periodMinutes / intervalMinutes)

  const requests: TrendData[] = []
  const errors: TrendData[] = []
  const latency: TrendData[] = []
  const aiUsage: TrendData[] = []

  for (let i = 0; i < intervals; i++) {
    const intervalStart = startTime + i * intervalMinutes * 60 * 1000
    const intervalEnd = intervalStart + intervalMinutes * 60 * 1000
    const timestamp = new Date(intervalStart).toISOString()

    // Filter metrics for this interval
    const intervalMetrics = metricsBuffer.filter((m) => {
      const time = new Date(m.timestamp).getTime()
      return time >= intervalStart && time < intervalEnd
    })

    requests.push({
      timestamp,
      value: intervalMetrics.length,
    })

    errors.push({
      timestamp,
      value: intervalMetrics.filter((m) => m.statusCode >= 400).length,
    })

    const times = intervalMetrics.map((m) => m.responseTime)
    latency.push({
      timestamp,
      value: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
    })

    // AI usage (count AI-related endpoints)
    aiUsage.push({
      timestamp,
      value: intervalMetrics.filter((m) => m.endpoint.includes('/ai/')).length,
    })
  }

  return {
    period: `${periodMinutes}m`,
    requests,
    errors,
    latency,
    aiUsage,
  }
}

/**
 * Get recent activity
 */
export function getRecentActivity(limit: number = 50): RequestMetric[] {
  return metricsBuffer.slice(-limit).reverse()
}

// ============================================================================
// Dashboard Summary
// ============================================================================

/**
 * Get dashboard summary
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [metrics, health] = await Promise.all([
    Promise.resolve(getSystemMetrics()),
    runHealthChecks(),
  ])

  return {
    metrics,
    health,
    activeAlerts: getActiveAlerts(),
    recentActivity: getRecentActivity(20),
    topEndpoints: getEndpointStats().slice(0, 10),
    trends: getTrends(60, 5),
  }
}

// ============================================================================
// Default Alert Rules
// ============================================================================

/**
 * Initialize default alert rules
 */
export function initializeDefaultAlertRules(): void {
  // High response time alert
  if (!Array.from(alertRules.values()).find((r) => r.metric === 'response_time')) {
    createAlertRule({
      name: 'High Response Time',
      description: 'Alert when response time exceeds 5 seconds',
      metric: 'response_time',
      condition: 'gt',
      threshold: 5000,
      severity: 'warning',
      enabled: true,
      cooldownMinutes: 5,
      notificationChannels: ['dashboard'],
    })
  }

  // Critical response time alert
  if (
    !Array.from(alertRules.values()).find(
      (r) => r.metric === 'response_time' && r.severity === 'critical'
    )
  ) {
    createAlertRule({
      name: 'Critical Response Time',
      description: 'Alert when response time exceeds 10 seconds',
      metric: 'response_time',
      condition: 'gt',
      threshold: 10000,
      severity: 'critical',
      enabled: true,
      cooldownMinutes: 1,
      notificationChannels: ['dashboard', 'email'],
    })
  }

  // High error rate alert
  if (!Array.from(alertRules.values()).find((r) => r.metric === 'error_rate')) {
    createAlertRule({
      name: 'High Error Rate',
      description: 'Alert when error rate exceeds 5%',
      metric: 'error_rate',
      condition: 'gt',
      threshold: 5,
      severity: 'warning',
      enabled: true,
      cooldownMinutes: 10,
      notificationChannels: ['dashboard'],
    })
  }

  // Critical error rate alert
  if (
    !Array.from(alertRules.values()).find(
      (r) => r.metric === 'error_rate' && r.severity === 'critical'
    )
  ) {
    createAlertRule({
      name: 'Critical Error Rate',
      description: 'Alert when error rate exceeds 10%',
      metric: 'error_rate',
      condition: 'gt',
      threshold: 10,
      severity: 'critical',
      enabled: true,
      cooldownMinutes: 5,
      notificationChannels: ['dashboard', 'email'],
    })
  }
}

// Initialize default rules on module load
initializeDefaultAlertRules()
