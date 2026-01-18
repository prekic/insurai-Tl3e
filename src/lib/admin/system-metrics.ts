/**
 * System Metrics & Health Monitoring
 * Tracks server health, performance metrics, and component status
 */

import type {
  SystemHealth,
  ComponentHealth,
  ServerMetrics,
  RateLimitConfig,
  RateLimitStatus,
  BlockedIP,
  RateLimitViolation,
  AdminAlert,
  AlertType,
  AlertRule,
} from '@/types/admin'

// ============================================================================
// SYSTEM HEALTH
// ============================================================================

const VERSION = '1.0.0'

export async function getSystemHealth(): Promise<SystemHealth> {
  const components = await checkAllComponents()

  const unhealthyCount = components.filter((c) => c.status === 'unhealthy').length
  const degradedCount = components.filter((c) => c.status === 'degraded').length

  let status: SystemHealth['status'] = 'healthy'
  if (unhealthyCount > 0) {
    status = 'unhealthy'
  } else if (degradedCount > 0) {
    status = 'degraded'
  }

  return {
    status,
    uptime: getUptime(),
    version: VERSION,
    environment: getEnvironment(),
    lastChecked: new Date().toISOString(),
    components,
  }
}

async function checkAllComponents(): Promise<ComponentHealth[]> {
  const components: ComponentHealth[] = []

  // Check API server
  components.push(await checkAPIServer())

  // Check Supabase
  components.push(await checkSupabase())

  // Check AI providers
  components.push(await checkOpenAI())
  components.push(await checkAnthropic())
  components.push(await checkGoogleVision())

  return components
}

async function checkAPIServer(): Promise<ComponentHealth> {
  const startTime = Date.now()
  try {
    // In browser, check via API
    const response = await fetch('/api/health', { method: 'GET' })
    const responseTime = Date.now() - startTime

    return {
      name: 'API Server',
      status: response.ok ? 'healthy' : 'unhealthy',
      responseTime,
      lastChecked: new Date().toISOString(),
      details: response.ok ? 'Server responding normally' : `Status: ${response.status}`,
    }
  } catch (error) {
    return {
      name: 'API Server',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

async function checkSupabase(): Promise<ComponentHealth> {
  const startTime = Date.now()
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    if (!supabaseUrl) {
      return {
        name: 'Supabase',
        status: 'unhealthy',
        lastChecked: new Date().toISOString(),
        details: 'Supabase URL not configured',
      }
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      },
    })
    const responseTime = Date.now() - startTime

    return {
      name: 'Supabase',
      status: response.ok || response.status === 400 ? 'healthy' : 'degraded',
      responseTime,
      lastChecked: new Date().toISOString(),
      details: 'Database connected',
    }
  } catch (error) {
    return {
      name: 'Supabase',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

async function checkOpenAI(): Promise<ComponentHealth> {
  const startTime = Date.now()
  try {
    const response = await fetch('/api/ai/providers')
    const data = await response.json()
    const responseTime = Date.now() - startTime

    const hasOpenAI = data.providers?.includes('openai')

    return {
      name: 'OpenAI',
      status: hasOpenAI ? 'healthy' : 'degraded',
      responseTime,
      lastChecked: new Date().toISOString(),
      details: hasOpenAI ? 'API key configured' : 'API key not configured',
    }
  } catch {
    return {
      name: 'OpenAI',
      status: 'degraded',
      responseTime: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: 'Unable to verify status',
    }
  }
}

async function checkAnthropic(): Promise<ComponentHealth> {
  const startTime = Date.now()
  try {
    const response = await fetch('/api/ai/providers')
    const data = await response.json()
    const responseTime = Date.now() - startTime

    const hasAnthropic = data.providers?.includes('anthropic')

    return {
      name: 'Anthropic',
      status: hasAnthropic ? 'healthy' : 'degraded',
      responseTime,
      lastChecked: new Date().toISOString(),
      details: hasAnthropic ? 'API key configured' : 'API key not configured',
    }
  } catch {
    return {
      name: 'Anthropic',
      status: 'degraded',
      responseTime: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: 'Unable to verify status',
    }
  }
}

async function checkGoogleVision(): Promise<ComponentHealth> {
  const startTime = Date.now()
  try {
    const response = await fetch('/api/ai/providers')
    const data = await response.json()
    const responseTime = Date.now() - startTime

    const hasGoogle = data.providers?.includes('google')

    return {
      name: 'Google Vision',
      status: hasGoogle ? 'healthy' : 'degraded',
      responseTime,
      lastChecked: new Date().toISOString(),
      details: hasGoogle ? 'API key configured' : 'API key not configured (OCR disabled)',
    }
  } catch {
    return {
      name: 'Google Vision',
      status: 'degraded',
      responseTime: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: 'Unable to verify status',
    }
  }
}

// ============================================================================
// SERVER METRICS
// ============================================================================

let serverStartTime = Date.now()

export function setServerStartTime(time: number): void {
  serverStartTime = time
}

function getUptime(): number {
  return Math.floor((Date.now() - serverStartTime) / 1000)
}

function getEnvironment(): 'development' | 'staging' | 'production' {
  const env = import.meta.env.MODE || 'development'
  if (env === 'production') return 'production'
  if (env === 'staging') return 'staging'
  return 'development'
}

export async function getServerMetrics(): Promise<ServerMetrics> {
  // In browser context, fetch from server
  try {
    const response = await fetch('/api/admin/metrics')
    if (response.ok) {
      return await response.json()
    }
  } catch {
    // Fall through to defaults
  }

  // Return estimated metrics from browser
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory
  return {
    cpu: {
      usage: 0, // Not available in browser
      cores: navigator.hardwareConcurrency || 1,
    },
    memory: {
      used: memory?.usedJSHeapSize || 0,
      total: memory?.jsHeapSizeLimit || 0,
      percentage: memory ? (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100 : 0,
    },
    disk: {
      used: 0, // Not available in browser
      total: 0,
      percentage: 0,
    },
    network: {
      requestsPerMinute: 0,
      bytesIn: 0,
      bytesOut: 0,
    },
    process: {
      pid: 0,
      uptime: getUptime(),
      heapUsed: memory?.usedJSHeapSize || 0,
      heapTotal: memory?.totalJSHeapSize || 0,
    },
  }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

// Default rate limit configurations
const DEFAULT_RATE_LIMITS: RateLimitConfig[] = [
  { endpoint: '/api/ai/chat', windowMs: 3600000, maxRequests: 60, currentUsage: 0, blockedRequests: 0 },
  { endpoint: '/api/ai/extract/*', windowMs: 3600000, maxRequests: 20, currentUsage: 0, blockedRequests: 0 },
  { endpoint: '/api/ai/ocr', windowMs: 3600000, maxRequests: 30, currentUsage: 0, blockedRequests: 0 },
  { endpoint: '/api/health', windowMs: 60000, maxRequests: 60, currentUsage: 0, blockedRequests: 0 },
]

const blockedIPs: BlockedIP[] = []
const rateLimitViolations: RateLimitViolation[] = []
let violationCounter = 0

export function getRateLimitStatus(): RateLimitStatus {
  return {
    endpoints: [...DEFAULT_RATE_LIMITS],
    blockedIPs: [...blockedIPs],
    recentViolations: rateLimitViolations.slice(-100),
  }
}

export function recordRateLimitViolation(params: {
  ip: string
  endpoint: string
  userId?: string
  requestCount: number
  limit: number
}): void {
  const violation: RateLimitViolation = {
    id: `violation-${Date.now()}-${++violationCounter}`,
    timestamp: new Date().toISOString(),
    ip: params.ip,
    endpoint: params.endpoint,
    userId: params.userId,
    requestCount: params.requestCount,
    limit: params.limit,
    action: params.requestCount > params.limit * 2 ? 'blocked' : 'rate_limited',
  }

  rateLimitViolations.push(violation)

  // Keep only last 1000 violations
  if (rateLimitViolations.length > 1000) {
    rateLimitViolations.shift()
  }
}

export function blockIP(ip: string, reason: string, expiresIn?: number): void {
  const existing = blockedIPs.find((b) => b.ip === ip)
  if (existing) {
    existing.requestCount++
    return
  }

  blockedIPs.push({
    ip,
    reason,
    blockedAt: new Date().toISOString(),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn).toISOString() : undefined,
    requestCount: 1,
    isManual: false,
  })
}

export function unblockIP(ip: string): boolean {
  const index = blockedIPs.findIndex((b) => b.ip === ip)
  if (index !== -1) {
    blockedIPs.splice(index, 1)
    return true
  }
  return false
}

export function isIPBlocked(ip: string): boolean {
  const blocked = blockedIPs.find((b) => b.ip === ip)
  if (!blocked) return false

  // Check if block has expired
  if (blocked.expiresAt && new Date(blocked.expiresAt) < new Date()) {
    unblockIP(ip)
    return false
  }

  return true
}

// ============================================================================
// ALERTS
// ============================================================================

const alerts: AdminAlert[] = []
let alertCounter = 0

const alertRules: AlertRule[] = [
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    description: 'Triggers when error rate exceeds threshold',
    enabled: true,
    metric: 'error_rate',
    operator: 'gt',
    threshold: 0.1, // 10%
    window: 300, // 5 minutes
    severity: 'error',
    cooldownMinutes: 15,
  },
  {
    id: 'cost-threshold',
    name: 'Daily Cost Threshold',
    description: 'Triggers when daily AI cost exceeds limit',
    enabled: true,
    metric: 'daily_cost',
    operator: 'gt',
    threshold: 100, // $100
    window: 86400, // 24 hours
    severity: 'warning',
    cooldownMinutes: 60,
  },
  {
    id: 'api-latency',
    name: 'High API Latency',
    description: 'Triggers when average response time is too high',
    enabled: true,
    metric: 'avg_response_time',
    operator: 'gt',
    threshold: 5000, // 5 seconds
    window: 300, // 5 minutes
    severity: 'warning',
    cooldownMinutes: 10,
  },
]

export function createAlert(params: {
  type: AlertType
  severity: AdminAlert['severity']
  title: string
  message: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  actions?: AdminAlert['actions']
}): string {
  const id = `alert-${Date.now()}-${++alertCounter}`

  const alert: AdminAlert = {
    id,
    timestamp: new Date().toISOString(),
    type: params.type,
    severity: params.severity,
    title: params.title,
    message: params.message,
    acknowledged: false,
    resolved: false,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    metadata: params.metadata,
    actions: params.actions,
  }

  alerts.push(alert)

  // Keep only last 500 alerts
  if (alerts.length > 500) {
    alerts.shift()
  }

  return id
}

export function acknowledgeAlert(id: string, acknowledgedBy: string): boolean {
  const alert = alerts.find((a) => a.id === id)
  if (alert) {
    alert.acknowledged = true
    alert.acknowledgedAt = new Date().toISOString()
    alert.acknowledgedBy = acknowledgedBy
    return true
  }
  return false
}

export function resolveAlert(id: string, resolvedBy: string): boolean {
  const alert = alerts.find((a) => a.id === id)
  if (alert) {
    alert.resolved = true
    alert.resolvedAt = new Date().toISOString()
    alert.resolvedBy = resolvedBy
    return true
  }
  return false
}

export function getAlerts(filters?: {
  type?: AlertType
  severity?: AdminAlert['severity']
  acknowledged?: boolean
  resolved?: boolean
  limit?: number
}): AdminAlert[] {
  let results = [...alerts]

  if (filters) {
    if (filters.type) {
      results = results.filter((a) => a.type === filters.type)
    }
    if (filters.severity) {
      results = results.filter((a) => a.severity === filters.severity)
    }
    if (filters.acknowledged !== undefined) {
      results = results.filter((a) => a.acknowledged === filters.acknowledged)
    }
    if (filters.resolved !== undefined) {
      results = results.filter((a) => a.resolved === filters.resolved)
    }
  }

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (filters?.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

export function getAlertRules(): AlertRule[] {
  return [...alertRules]
}

export function updateAlertRule(id: string, updates: Partial<AlertRule>): boolean {
  const rule = alertRules.find((r) => r.id === id)
  if (rule) {
    Object.assign(rule, updates)
    return true
  }
  return false
}

// ============================================================================
// PERIODIC HEALTH CHECK
// ============================================================================

let healthCheckInterval: ReturnType<typeof setInterval> | null = null
let lastHealthStatus: SystemHealth | null = null

export function startHealthMonitoring(intervalMs: number = 60000): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
  }

  const runCheck = async () => {
    const health = await getSystemHealth()

    // Check for status changes
    if (lastHealthStatus && lastHealthStatus.status !== health.status) {
      if (health.status === 'unhealthy') {
        createAlert({
          type: 'system_health',
          severity: 'critical',
          title: 'System Health Critical',
          message: `System status changed from ${lastHealthStatus.status} to ${health.status}`,
          metadata: { components: health.components },
        })
      } else if (health.status === 'degraded') {
        createAlert({
          type: 'system_health',
          severity: 'warning',
          title: 'System Health Degraded',
          message: `System status changed from ${lastHealthStatus.status} to ${health.status}`,
          metadata: { components: health.components },
        })
      }
    }

    lastHealthStatus = health
  }

  runCheck()
  healthCheckInterval = setInterval(runCheck, intervalMs)
}

export function stopHealthMonitoring(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
  }
}
