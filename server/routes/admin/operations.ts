/**
 * Admin Operations Routes
 *
 * Health, metrics, AI operations, policy operations, security logs,
 * audit logs, configuration, feature flags, data export, log ingestion.
 */

import { Router, Request, Response } from 'express'
import os from 'os'
import {
  authenticateAdmin,
  requireRole,
  logAdminAction,
  aiRequests,
  policyOperations,
  securityLogs,
  auditLogs,
  blockedIPs,
  requestCounters,
  MAX_ENTRIES,
  serverStartTime,
  qstr,
  getClientIp,
} from './shared.js'
import type { AuthenticatedRequest, AIRequest, PolicyOperation, SecurityLog } from './shared.js'

const router = Router()

// ============================================================================
// SYSTEM HEALTH & METRICS
// ============================================================================

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      lastChecked: new Date().toISOString(),
      components: [
        {
          name: 'API Server',
          status: 'healthy',
          responseTime: 0,
          lastChecked: new Date().toISOString(),
        },
        {
          name: 'OpenAI',
          status: process.env.OPENAI_API_KEY ? 'healthy' : 'degraded',
          lastChecked: new Date().toISOString(),
          details: process.env.OPENAI_API_KEY ? 'API key configured' : 'API key not configured',
        },
        {
          name: 'Anthropic',
          status: process.env.ANTHROPIC_API_KEY ? 'healthy' : 'degraded',
          lastChecked: new Date().toISOString(),
          details: process.env.ANTHROPIC_API_KEY ? 'API key configured' : 'API key not configured',
        },
        {
          name: 'Google Vision',
          status: process.env.GOOGLE_CLOUD_API_KEY ? 'healthy' : 'degraded',
          lastChecked: new Date().toISOString(),
          details: process.env.GOOGLE_CLOUD_API_KEY
            ? 'API key configured'
            : 'API key not configured',
        },
      ],
    }

    res.json({ success: true, data: health })
  } catch (_error) {
    res.status(500).json({ success: false, error: 'Failed to get health status' })
  }
})

router.get('/metrics', authenticateAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const cpus = os.cpus()
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedMemory = totalMemory - freeMemory

    // Calculate CPU usage
    const cpuUsage =
      cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
        const idle = cpu.times.idle
        return acc + ((total - idle) / total) * 100
      }, 0) / cpus.length

    const memInfo = process.memoryUsage()

    const metrics = {
      cpu: {
        usage: Math.round(cpuUsage * 100) / 100,
        cores: cpus.length,
      },
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: Math.round((usedMemory / totalMemory) * 100 * 100) / 100,
      },
      disk: {
        used: 0, // Would need additional package for disk stats
        total: 0,
        percentage: 0,
      },
      network: {
        requestsPerMinute: aiRequests.filter(
          (r) => new Date(r.timestamp) > new Date(Date.now() - 60000)
        ).length,
        bytesIn: 0,
        bytesOut: 0,
      },
      process: {
        pid: process.pid,
        uptime: Math.floor((Date.now() - serverStartTime) / 1000),
        heapUsed: memInfo.heapUsed,
        heapTotal: memInfo.heapTotal,
      },
    }

    res.json({ success: true, data: metrics })
  } catch (_error) {
    res.status(500).json({ success: false, error: 'Failed to get metrics' })
  }
})

// ============================================================================
// AI OPERATIONS
// ============================================================================

router.get('/ai/requests', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { provider, operation, status, userId, startDate, endDate, limit = 100 } = req.query

    let results = [...aiRequests]

    if (provider) {
      results = results.filter((r) => r.provider === provider)
    }
    if (operation) {
      results = results.filter((r) => r.operation === operation)
    }
    if (status) {
      results = results.filter((r) => r.status === status)
    }
    if (userId) {
      results = results.filter((r) => r.userId === userId)
    }
    if (startDate) {
      results = results.filter((r) => r.timestamp >= (startDate as string))
    }
    if (endDate) {
      results = results.filter((r) => r.timestamp <= (endDate as string))
    }

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    results = results.slice(0, Number(limit))

    res.json({ success: true, data: results, total: aiRequests.length })
  } catch (_error) {
    res.status(500).json({ success: false, error: 'Failed to get AI requests' })
  }
})

router.get('/ai/requests/:id', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  const request = aiRequests.find((r) => r.id === req.params.id)

  if (!request) {
    res.status(404).json({ success: false, error: 'Request not found' })
    return
  }

  res.json({ success: true, data: request })
})

router.get('/ai/stats', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    let requests = [...aiRequests]

    if (startDate) {
      requests = requests.filter((r) => r.timestamp >= (startDate as string))
    }
    if (endDate) {
      requests = requests.filter((r) => r.timestamp <= (endDate as string))
    }

    const byProvider: Record<
      string,
      {
        requests: number
        tokens: { input: number; output: number; total: number }
        cost: number
        errors: number
        totalResponseTime: number
      }
    > = {}

    const byOperation: Record<
      string,
      {
        requests: number
        successes: number
        totalResponseTime: number
        totalTokens: number
        totalCost: number
      }
    > = {}

    for (const request of requests) {
      // By provider
      if (!byProvider[request.provider]) {
        byProvider[request.provider] = {
          requests: 0,
          tokens: { input: 0, output: 0, total: 0 },
          cost: 0,
          errors: 0,
          totalResponseTime: 0,
        }
      }
      byProvider[request.provider].requests++
      byProvider[request.provider].tokens.input += request.tokens?.input ?? 0
      byProvider[request.provider].tokens.output += request.tokens?.output ?? 0
      byProvider[request.provider].tokens.total += request.tokens?.total ?? 0
      byProvider[request.provider].cost += request.cost?.total ?? 0
      byProvider[request.provider].totalResponseTime += request.responseTime ?? 0
      if (request.status === 'error') {
        byProvider[request.provider].errors++
      }

      // By operation
      if (!byOperation[request.operation]) {
        byOperation[request.operation] = {
          requests: 0,
          successes: 0,
          totalResponseTime: 0,
          totalTokens: 0,
          totalCost: 0,
        }
      }
      byOperation[request.operation].requests++
      if (request.status === 'success') {
        byOperation[request.operation].successes++
      }
      byOperation[request.operation].totalResponseTime += request.responseTime ?? 0
      byOperation[request.operation].totalTokens += request.tokens?.total ?? 0
      byOperation[request.operation].totalCost += request.cost?.total ?? 0
    }

    const totalRequests = requests.length
    const totalTokens = requests.reduce((sum, r) => sum + (r.tokens?.total ?? 0), 0)
    const totalCost = requests.reduce((sum, r) => sum + (r.cost?.total ?? 0), 0)
    const totalErrors = requests.filter((r) => r.status === 'error').length
    const totalResponseTime = requests.reduce((sum, r) => sum + (r.responseTime ?? 0), 0)

    const stats = {
      totalRequests,
      totalTokens,
      totalCost,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      byProvider: Object.fromEntries(
        Object.entries(byProvider).map(([provider, stats]) => [
          provider,
          {
            requests: stats.requests,
            tokens: stats.tokens,
            cost: stats.cost,
            averageResponseTime: stats.requests > 0 ? stats.totalResponseTime / stats.requests : 0,
            errorCount: stats.errors,
            errorRate: stats.requests > 0 ? stats.errors / stats.requests : 0,
          },
        ])
      ),
      byOperation: Object.fromEntries(
        Object.entries(byOperation).map(([operation, stats]) => [
          operation,
          {
            requests: stats.requests,
            successRate: stats.requests > 0 ? stats.successes / stats.requests : 0,
            averageResponseTime: stats.requests > 0 ? stats.totalResponseTime / stats.requests : 0,
            averageTokens: stats.requests > 0 ? stats.totalTokens / stats.requests : 0,
            totalCost: stats.totalCost,
          },
        ])
      ),
    }

    res.json({ success: true, data: stats })
  } catch (_error) {
    res.status(500).json({ success: false, error: 'Failed to get AI stats' })
  }
})

// ============================================================================
// POLICY OPERATIONS
// ============================================================================

router.get(
  '/policies/operations',
  authenticateAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { type, userId, status, startDate, endDate, limit = 100 } = req.query

      let results = [...policyOperations]

      if (type) {
        results = results.filter((o) => o.type === type)
      }
      if (userId) {
        results = results.filter((o) => o.userId === userId)
      }
      if (status) {
        results = results.filter((o) => o.status === status)
      }
      if (startDate) {
        results = results.filter((o) => o.timestamp >= (startDate as string))
      }
      if (endDate) {
        results = results.filter((o) => o.timestamp <= (endDate as string))
      }

      results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      results = results.slice(0, Number(limit))

      res.json({ success: true, data: results, total: policyOperations.length })
    } catch (_error) {
      res.status(500).json({ success: false, error: 'Failed to get policy operations' })
    }
  }
)

router.get('/policies/stats', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    let operations = [...policyOperations]

    if (startDate) {
      operations = operations.filter((o) => o.timestamp >= (startDate as string))
    }
    if (endDate) {
      operations = operations.filter((o) => o.timestamp <= (endDate as string))
    }

    const stats = {
      total: operations.length,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      averageExtractionTime: 0,
      extractionSuccessRate: 0,
      ocrUsageRate: 0,
    }

    let extractionTime = 0
    let extractionCount = 0
    let ocrCount = 0

    for (const op of operations) {
      stats.byType[op.type] = (stats.byType[op.type] || 0) + 1
      stats.byStatus[op.status] = (stats.byStatus[op.status] || 0) + 1

      if (op.type === 'extraction' && op.duration) {
        extractionTime += op.duration
        extractionCount++
      }

      if (op.extractionInfo?.ocrUsed) {
        ocrCount++
      }
    }

    stats.averageExtractionTime = extractionCount > 0 ? extractionTime / extractionCount : 0
    stats.extractionSuccessRate = stats.total > 0 ? (stats.byStatus.success || 0) / stats.total : 0
    stats.ocrUsageRate = stats.total > 0 ? ocrCount / stats.total : 0

    res.json({ success: true, data: stats })
  } catch (_error) {
    res.status(500).json({ success: false, error: 'Failed to get policy stats' })
  }
})

// ============================================================================
// SECURITY LOGS
// ============================================================================

router.get('/security/logs', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventType, severity, resolved, startDate, endDate, limit = 100 } = req.query

    let results = [...securityLogs]

    if (eventType) {
      results = results.filter((l) => l.eventType === eventType)
    }
    if (severity) {
      results = results.filter((l) => l.severity === severity)
    }
    if (resolved !== undefined) {
      results = results.filter((l) => l.resolved === (resolved === 'true'))
    }
    if (startDate) {
      results = results.filter((l) => l.timestamp >= (startDate as string))
    }
    if (endDate) {
      results = results.filter((l) => l.timestamp <= (endDate as string))
    }

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    results = results.slice(0, Number(limit))

    res.json({ success: true, data: results, total: securityLogs.length })
  } catch (_error) {
    res.status(500).json({ success: false, error: 'Failed to get security logs' })
  }
})

router.post(
  '/security/logs/:id/resolve',
  authenticateAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const log = securityLogs.find((l) => l.id === req.params.id)

    if (!log) {
      res.status(404).json({ success: false, error: 'Log not found' })
      return
    }

    log.resolved = true

    res.json({ success: true, data: log })
  }
)

// ============================================================================
// RATE LIMITING
// ============================================================================

router.get(
  '/security/rate-limits',
  authenticateAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    const rateLimits = {
      endpoints: [
        {
          endpoint: '/api/ai/chat',
          windowMs: 3600000,
          maxRequests: 60,
          currentUsage: 0,
          blockedRequests: 0,
        },
        {
          endpoint: '/api/ai/extract/*',
          windowMs: 3600000,
          maxRequests: 20,
          currentUsage: 0,
          blockedRequests: 0,
        },
        {
          endpoint: '/api/ai/ocr',
          windowMs: 3600000,
          maxRequests: 30,
          currentUsage: 0,
          blockedRequests: 0,
        },
        {
          endpoint: '/api/health',
          windowMs: 60000,
          maxRequests: 60,
          currentUsage: 0,
          blockedRequests: 0,
        },
      ],
      blockedIPs: Array.from(blockedIPs.entries()).map(([ip, data]) => ({
        ip,
        ...data,
        requestCount: 0,
        isManual: false,
      })),
      recentViolations: [],
    }

    res.json({ success: true, data: rateLimits })
  }
)

router.post('/security/block-ip', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { ip, reason, expiresIn } = req.body

  if (!ip || !reason) {
    res.status(400).json({ success: false, error: 'IP and reason are required' })
    return
  }

  // Validate IP format (IPv4 or IPv6)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    res.status(400).json({ success: false, error: 'Invalid IP address format' })
    return
  }

  // Validate expiresIn if provided (must be positive number, max 30 days)
  const MAX_BLOCK_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
  let expiresAt: string | undefined
  if (expiresIn !== undefined) {
    const expMs = Number(expiresIn)
    if (isNaN(expMs) || expMs <= 0 || expMs > MAX_BLOCK_DURATION_MS) {
      res
        .status(400)
        .json({ success: false, error: 'expiresIn must be a positive number (ms), max 30 days' })
      return
    }
    expiresAt = new Date(Date.now() + expMs).toISOString()
  }

  // Cap blockedIPs to prevent unbounded growth
  if (blockedIPs.size >= 10000) {
    const firstKey = blockedIPs.keys().next().value
    if (firstKey) blockedIPs.delete(firstKey)
  }

  blockedIPs.set(ip, {
    reason: String(reason).slice(0, 500),
    blockedAt: new Date().toISOString(),
    expiresAt,
  })

  res.json({ success: true, message: `IP ${ip} blocked` })
})

router.delete(
  '/security/block-ip/:ip',
  authenticateAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    const ip = qstr(req.params.ip)

    if (blockedIPs.has(ip)) {
      blockedIPs.delete(ip)
      res.json({ success: true, message: `IP ${ip} unblocked` })
    } else {
      res.status(404).json({ success: false, error: 'IP not found in blocklist' })
    }
  }
)

// ============================================================================
// AUDIT LOGS
// ============================================================================

router.get('/audit/logs', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { actorId, action, resourceType, resourceId, startDate, endDate, limit = 100 } = req.query

    let results = [...auditLogs]

    if (actorId) {
      results = results.filter((l) => l.actorId === actorId)
    }
    if (action) {
      results = results.filter((l) => l.action === action)
    }
    if (resourceType) {
      results = results.filter((l) => l.resourceType === resourceType)
    }
    if (resourceId) {
      results = results.filter((l) => l.resourceId === resourceId)
    }
    if (startDate) {
      results = results.filter((l) => l.timestamp >= (startDate as string))
    }
    if (endDate) {
      results = results.filter((l) => l.timestamp <= (endDate as string))
    }

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    results = results.slice(0, Number(limit))

    res.json({ success: true, data: results, total: auditLogs.length })
  } catch (_error) {
    res.status(500).json({ success: false, error: 'Failed to get audit logs' })
  }
})

// ============================================================================
// CONFIGURATION
// ============================================================================

const appConfigs = new Map<string, { value: unknown; type: string; description: string }>()

// Initialize default configs
appConfigs.set('ai.default_provider', {
  value: 'openai',
  type: 'string',
  description: 'Default AI provider',
})
appConfigs.set('ai.chat_model', { value: 'gpt-4o-mini', type: 'string', description: 'Chat model' })
appConfigs.set('ai.extraction_model', {
  value: 'gpt-4o',
  type: 'string',
  description: 'Extraction model',
})
appConfigs.set('ai.temperature', { value: 0.3, type: 'number', description: 'AI temperature' })
appConfigs.set('features.enable_chat', { value: true, type: 'boolean', description: 'Enable chat' })
appConfigs.set('features.enable_ocr', { value: true, type: 'boolean', description: 'Enable OCR' })
appConfigs.set('features.enable_gap_analysis', {
  value: true,
  type: 'boolean',
  description: 'Enable gap analysis',
})
appConfigs.set('system.maintenance_mode', {
  value: false,
  type: 'boolean',
  description: 'Maintenance mode',
})

router.get('/config', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { category } = req.query

  const configs: Array<{
    id: string
    category: string
    key: string
    value: unknown
    type: string
    description: string
  }> = []

  for (const [key, config] of appConfigs.entries()) {
    const [cat, configKey] = key.split('.')
    if (!category || cat === category) {
      configs.push({
        id: key,
        category: cat,
        key: configKey,
        value: config.value,
        type: config.type,
        description: config.description,
      })
    }
  }

  res.json({ success: true, data: configs })
})

router.put(
  '/config/:id',
  authenticateAdmin,
  requireRole('admin', 'super_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    const id = qstr(req.params.id)
    const { value } = req.body

    const config = appConfigs.get(id)
    if (!config) {
      res.status(404).json({ success: false, error: 'Config not found' })
      return
    }

    const oldValue = config.value
    config.value = value
    appConfigs.set(id, config)

    // Log audit with proper admin info
    auditLogs.push({
      id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
      timestamp: new Date().toISOString(),
      actorId: req.adminUser?.id || 'unknown',
      actorEmail: req.adminUser?.email || 'unknown',
      action: 'update',
      resourceType: 'config',
      resourceId: id,
      changes: [{ field: 'value', oldValue, newValue: value }],
      ipAddress: getClientIp(req),
    })
    if (auditLogs.length > MAX_ENTRIES) auditLogs.shift()

    // Also log to database
    logAdminAction(req, 'update', 'config', id, { value: oldValue }, { value })

    res.json({ success: true, data: { id, ...config } })
  }
)

// ============================================================================
// FEATURE FLAGS
// ============================================================================

const featureFlags = new Map<
  string,
  {
    name: string
    description: string
    enabled: boolean
    enabledPercentage?: number
  }
>()

// Initialize defaults
featureFlags.set('new_extraction_pipeline', {
  name: 'New Extraction Pipeline',
  description: 'Use combined document processing pipeline',
  enabled: false,
  enabledPercentage: 0,
})
featureFlags.set('pii_redaction', {
  name: 'PII Redaction',
  description: 'Automatically redact PII from documents',
  enabled: true,
})
featureFlags.set('dark_mode', {
  name: 'Dark Mode',
  description: 'Enable dark mode UI',
  enabled: false,
  enabledPercentage: 10,
})

router.get('/feature-flags', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const flags = Array.from(featureFlags.entries()).map(([id, flag]) => ({
    id,
    ...flag,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  res.json({ success: true, data: flags })
})

router.put(
  '/feature-flags/:id',
  authenticateAdmin,
  requireRole('admin', 'super_admin'),
  (req: AuthenticatedRequest, res: Response) => {
    const id = qstr(req.params.id)
    const updates = req.body

    const flag = featureFlags.get(id)
    if (!flag) {
      res.status(404).json({ success: false, error: 'Feature flag not found' })
      return
    }

    const previousState = { ...flag }
    // Only allow known fields to prevent mass assignment
    if (updates.name !== undefined) flag.name = String(updates.name)
    if (updates.description !== undefined) flag.description = String(updates.description)
    if (updates.enabled !== undefined) flag.enabled = Boolean(updates.enabled)
    if (updates.enabledPercentage !== undefined)
      flag.enabledPercentage = Number(updates.enabledPercentage)
    featureFlags.set(id, flag)

    const action =
      updates.enabled !== undefined ? (updates.enabled ? 'enable' : 'disable') : 'update'

    auditLogs.push({
      id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
      timestamp: new Date().toISOString(),
      actorId: req.adminUser?.id || 'unknown',
      actorEmail: req.adminUser?.email || 'unknown',
      action,
      resourceType: 'feature_flag',
      resourceId: id,
      ipAddress: getClientIp(req),
    })
    if (auditLogs.length > MAX_ENTRIES) auditLogs.shift()

    // Log to database
    logAdminAction(req, action, 'feature_flag', id, previousState, flag)

    res.json({ success: true, data: { id, ...flag } })
  }
)

// ============================================================================
// DATA EXPORT
// ============================================================================

router.get(
  '/export',
  authenticateAdmin,
  requireRole('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    const exportData = {
      aiRequests: aiRequests.slice(-1000),
      policyOperations: policyOperations.slice(-1000),
      securityLogs: securityLogs.slice(-1000),
      auditLogs: auditLogs.slice(-1000),
      exportedAt: new Date().toISOString(),
      exportedBy: req.adminUser?.email,
    }

    // Log export action
    await logAdminAction(req, 'export', 'admin_data', undefined, undefined, {
      recordCounts: {
        aiRequests: exportData.aiRequests.length,
        policyOperations: exportData.policyOperations.length,
        securityLogs: exportData.securityLogs.length,
        auditLogs: exportData.auditLogs.length,
      },
    })

    res.json({ success: true, data: exportData })
  }
)

// ============================================================================
// LOG INGESTION (for frontend to report operations)
// ============================================================================

router.post('/log/ai-request', (req: Request, res: Response) => {
  const request = req.body

  if (!request.provider || !request.operation) {
    res.status(400).json({ success: false, error: 'Missing required fields' })
    return
  }

  const id = `ai-${Date.now()}-${++requestCounters.aiRequestId}`
  const aiRequest: AIRequest = {
    id,
    timestamp: new Date().toISOString(),
    ...request,
    clientIp: req.ip,
  }

  aiRequests.push(aiRequest)

  // Keep only last MAX_ENTRIES
  if (aiRequests.length > MAX_ENTRIES) {
    aiRequests.shift()
  }

  res.json({ success: true, id })
})

router.post('/log/policy-operation', (req: Request, res: Response) => {
  const operation = req.body

  if (!operation.type || !operation.userId) {
    res.status(400).json({ success: false, error: 'Missing required fields' })
    return
  }

  const id = `policy-op-${Date.now()}-${++requestCounters.policyOpId}`
  const policyOp: PolicyOperation = {
    id,
    timestamp: new Date().toISOString(),
    ...operation,
  }

  policyOperations.push(policyOp)

  if (policyOperations.length > MAX_ENTRIES) {
    policyOperations.shift()
  }

  res.json({ success: true, id })
})

router.post('/log/security', (req: Request, res: Response) => {
  const log = req.body

  if (!log.eventType || !log.severity) {
    res.status(400).json({ success: false, error: 'Missing required fields' })
    return
  }

  const id = `security-${Date.now()}-${++requestCounters.securityLogId}`
  const securityLog: SecurityLog = {
    id,
    timestamp: new Date().toISOString(),
    ...log,
    ipAddress: req.ip || 'unknown',
    resolved: false,
  }

  securityLogs.push(securityLog)

  if (securityLogs.length > MAX_ENTRIES) {
    securityLogs.shift()
  }

  res.json({ success: true, id })
})

export default router
