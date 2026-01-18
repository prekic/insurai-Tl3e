/**
 * Admin API Routes
 * Server-side endpoints for admin dashboard
 */

import { Router, Request, Response, NextFunction } from 'express'
import os from 'os'

const router = Router()

// ============================================================================
// IN-MEMORY STORAGE (Matches frontend admin module)
// ============================================================================

interface AIRequest {
  id: string
  timestamp: string
  provider: string
  operation: string
  model: string
  endpoint: string
  userId?: string
  prompt: string
  systemPrompt?: string
  response?: string
  responseTime: number
  status: string
  error?: string
  tokens: { input: number; output: number; total: number }
  cost: { input: number; output: number; total: number }
  clientIp?: string
}

interface PolicyOperation {
  id: string
  timestamp: string
  type: string
  userId: string
  policyId?: string
  status: string
  duration?: number
  documentInfo?: {
    filename: string
    size: number
    pageCount: number
  }
  extractionInfo?: {
    provider: string
    model: string
    confidence: number
    ocrUsed: boolean
  }
  error?: string
}

interface SecurityLog {
  id: string
  timestamp: string
  eventType: string
  severity: string
  userId?: string
  ipAddress: string
  details: Record<string, unknown>
  resolved: boolean
}

interface AuditLog {
  id: string
  timestamp: string
  actorId: string
  actorEmail: string
  action: string
  resourceType: string
  resourceId?: string
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>
  ipAddress: string
}

// Storage
const aiRequests: AIRequest[] = []
const policyOperations: PolicyOperation[] = []
const securityLogs: SecurityLog[] = []
const auditLogs: AuditLog[] = []
const blockedIPs: Map<string, { reason: string; blockedAt: string; expiresAt?: string }> = new Map()

let requestCounters = {
  aiRequestId: 0,
  policyOpId: 0,
  securityLogId: 0,
  auditLogId: 0,
}

const MAX_ENTRIES = 10000
const serverStartTime = Date.now()

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Admin authentication middleware (simplified - use proper auth in production)
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // In production, verify JWT and check admin role
  const adminToken = req.headers['x-admin-token']
  const isDevMode = process.env.NODE_ENV !== 'production'

  // Allow in dev mode or with valid admin token
  if (isDevMode || adminToken === process.env.ADMIN_SECRET) {
    next()
  } else {
    res.status(403).json({ success: false, error: 'Admin access required' })
  }
}

// ============================================================================
// SYSTEM HEALTH & METRICS
// ============================================================================

router.get('/health', async (req: Request, res: Response) => {
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
          details: process.env.GOOGLE_CLOUD_API_KEY ? 'API key configured' : 'API key not configured',
        },
      ],
    }

    res.json({ success: true, data: health })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get health status' })
  }
})

router.get('/metrics', requireAdmin, async (req: Request, res: Response) => {
  try {
    const cpus = os.cpus()
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedMemory = totalMemory - freeMemory

    // Calculate CPU usage
    const cpuUsage = cpus.reduce((acc, cpu) => {
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get metrics' })
  }
})

// ============================================================================
// AI OPERATIONS
// ============================================================================

router.get('/ai/requests', requireAdmin, (req: Request, res: Response) => {
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get AI requests' })
  }
})

router.get('/ai/requests/:id', requireAdmin, (req: Request, res: Response) => {
  const request = aiRequests.find((r) => r.id === req.params.id)

  if (!request) {
    res.status(404).json({ success: false, error: 'Request not found' })
    return
  }

  res.json({ success: true, data: request })
})

router.get('/ai/stats', requireAdmin, (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    let requests = [...aiRequests]

    if (startDate) {
      requests = requests.filter((r) => r.timestamp >= (startDate as string))
    }
    if (endDate) {
      requests = requests.filter((r) => r.timestamp <= (endDate as string))
    }

    const byProvider: Record<string, {
      requests: number
      tokens: { input: number; output: number; total: number }
      cost: number
      errors: number
      totalResponseTime: number
    }> = {}

    const byOperation: Record<string, {
      requests: number
      successes: number
      totalResponseTime: number
      totalTokens: number
      totalCost: number
    }> = {}

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
      byProvider[request.provider].tokens.input += request.tokens.input
      byProvider[request.provider].tokens.output += request.tokens.output
      byProvider[request.provider].tokens.total += request.tokens.total
      byProvider[request.provider].cost += request.cost.total
      byProvider[request.provider].totalResponseTime += request.responseTime
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
      byOperation[request.operation].totalResponseTime += request.responseTime
      byOperation[request.operation].totalTokens += request.tokens.total
      byOperation[request.operation].totalCost += request.cost.total
    }

    const totalRequests = requests.length
    const totalTokens = requests.reduce((sum, r) => sum + r.tokens.total, 0)
    const totalCost = requests.reduce((sum, r) => sum + r.cost.total, 0)
    const totalErrors = requests.filter((r) => r.status === 'error').length
    const totalResponseTime = requests.reduce((sum, r) => sum + r.responseTime, 0)

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
            averageResponseTime: stats.requests > 0
              ? stats.totalResponseTime / stats.requests
              : 0,
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
            successRate: stats.requests > 0
              ? stats.successes / stats.requests
              : 0,
            averageResponseTime: stats.requests > 0
              ? stats.totalResponseTime / stats.requests
              : 0,
            averageTokens: stats.requests > 0
              ? stats.totalTokens / stats.requests
              : 0,
            totalCost: stats.totalCost,
          },
        ])
      ),
    }

    res.json({ success: true, data: stats })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get AI stats' })
  }
})

// ============================================================================
// POLICY OPERATIONS
// ============================================================================

router.get('/policies/operations', requireAdmin, (req: Request, res: Response) => {
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get policy operations' })
  }
})

router.get('/policies/stats', requireAdmin, (req: Request, res: Response) => {
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get policy stats' })
  }
})

// ============================================================================
// SECURITY LOGS
// ============================================================================

router.get('/security/logs', requireAdmin, (req: Request, res: Response) => {
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get security logs' })
  }
})

router.post('/security/logs/:id/resolve', requireAdmin, (req: Request, res: Response) => {
  const log = securityLogs.find((l) => l.id === req.params.id)

  if (!log) {
    res.status(404).json({ success: false, error: 'Log not found' })
    return
  }

  log.resolved = true

  res.json({ success: true, data: log })
})

// ============================================================================
// RATE LIMITING
// ============================================================================

router.get('/security/rate-limits', requireAdmin, (req: Request, res: Response) => {
  const rateLimits = {
    endpoints: [
      { endpoint: '/api/ai/chat', windowMs: 3600000, maxRequests: 60, currentUsage: 0, blockedRequests: 0 },
      { endpoint: '/api/ai/extract/*', windowMs: 3600000, maxRequests: 20, currentUsage: 0, blockedRequests: 0 },
      { endpoint: '/api/ai/ocr', windowMs: 3600000, maxRequests: 30, currentUsage: 0, blockedRequests: 0 },
      { endpoint: '/api/health', windowMs: 60000, maxRequests: 60, currentUsage: 0, blockedRequests: 0 },
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
})

router.post('/security/block-ip', requireAdmin, (req: Request, res: Response) => {
  const { ip, reason, expiresIn } = req.body

  if (!ip || !reason) {
    res.status(400).json({ success: false, error: 'IP and reason are required' })
    return
  }

  blockedIPs.set(ip, {
    reason,
    blockedAt: new Date().toISOString(),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn).toISOString() : undefined,
  })

  res.json({ success: true, message: `IP ${ip} blocked` })
})

router.delete('/security/block-ip/:ip', requireAdmin, (req: Request, res: Response) => {
  const ip = req.params.ip

  if (blockedIPs.has(ip)) {
    blockedIPs.delete(ip)
    res.json({ success: true, message: `IP ${ip} unblocked` })
  } else {
    res.status(404).json({ success: false, error: 'IP not found in blocklist' })
  }
})

// ============================================================================
// AUDIT LOGS
// ============================================================================

router.get('/audit/logs', requireAdmin, (req: Request, res: Response) => {
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get audit logs' })
  }
})

// ============================================================================
// CONFIGURATION
// ============================================================================

const appConfigs = new Map<string, { value: unknown; type: string; description: string }>()

// Initialize default configs
appConfigs.set('ai.default_provider', { value: 'openai', type: 'string', description: 'Default AI provider' })
appConfigs.set('ai.chat_model', { value: 'gpt-4o-mini', type: 'string', description: 'Chat model' })
appConfigs.set('ai.extraction_model', { value: 'gpt-4o', type: 'string', description: 'Extraction model' })
appConfigs.set('ai.temperature', { value: 0.3, type: 'number', description: 'AI temperature' })
appConfigs.set('features.enable_chat', { value: true, type: 'boolean', description: 'Enable chat' })
appConfigs.set('features.enable_ocr', { value: true, type: 'boolean', description: 'Enable OCR' })
appConfigs.set('features.enable_gap_analysis', { value: true, type: 'boolean', description: 'Enable gap analysis' })
appConfigs.set('system.maintenance_mode', { value: false, type: 'boolean', description: 'Maintenance mode' })

router.get('/config', requireAdmin, (req: Request, res: Response) => {
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

router.put('/config/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params
  const { value } = req.body

  const config = appConfigs.get(id)
  if (!config) {
    res.status(404).json({ success: false, error: 'Config not found' })
    return
  }

  config.value = value
  appConfigs.set(id, config)

  // Log audit
  auditLogs.push({
    id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
    timestamp: new Date().toISOString(),
    actorId: 'admin',
    actorEmail: 'admin@system',
    action: 'update',
    resourceType: 'config',
    resourceId: id,
    changes: [{ field: 'value', oldValue: null, newValue: value }],
    ipAddress: req.ip || 'unknown',
  })

  res.json({ success: true, data: { id, ...config } })
})

// ============================================================================
// FEATURE FLAGS
// ============================================================================

const featureFlags = new Map<string, {
  name: string
  description: string
  enabled: boolean
  enabledPercentage?: number
}>()

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

router.get('/feature-flags', requireAdmin, (req: Request, res: Response) => {
  const flags = Array.from(featureFlags.entries()).map(([id, flag]) => ({
    id,
    ...flag,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  res.json({ success: true, data: flags })
})

router.put('/feature-flags/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body

  const flag = featureFlags.get(id)
  if (!flag) {
    res.status(404).json({ success: false, error: 'Feature flag not found' })
    return
  }

  Object.assign(flag, updates)
  featureFlags.set(id, flag)

  auditLogs.push({
    id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
    timestamp: new Date().toISOString(),
    actorId: 'admin',
    actorEmail: 'admin@system',
    action: updates.enabled !== undefined ? (updates.enabled ? 'enable' : 'disable') : 'update',
    resourceType: 'feature_flag',
    resourceId: id,
    ipAddress: req.ip || 'unknown',
  })

  res.json({ success: true, data: { id, ...flag } })
})

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const promptTemplates = new Map<string, {
  name: string
  description: string
  category: string
  systemPrompt: string
  userPromptTemplate: string
  isActive: boolean
  usageCount: number
}>()

// Initialize defaults
promptTemplates.set('extraction-default', {
  name: 'Policy Extraction (Default)',
  description: 'Standard prompt for extracting policy data',
  category: 'extraction',
  systemPrompt: 'You are an expert Turkish insurance document analyzer...',
  userPromptTemplate: 'Extract all relevant information from this document:\n\n{{document_text}}',
  isActive: true,
  usageCount: 0,
})
promptTemplates.set('chat-default', {
  name: 'Policy Chat (Default)',
  description: 'Standard prompt for policy questions',
  category: 'chat',
  systemPrompt: 'You are an expert Turkish insurance advisor...',
  userPromptTemplate: 'Policy: {{policy_context}}\n\nQuestion: {{user_message}}',
  isActive: true,
  usageCount: 0,
})

router.get('/prompts', requireAdmin, (req: Request, res: Response) => {
  const { category } = req.query

  const templates = Array.from(promptTemplates.entries())
    .filter(([, template]) => !category || template.category === category)
    .map(([id, template]) => ({
      id,
      ...template,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))

  res.json({ success: true, data: templates })
})

router.get('/prompts/:id', requireAdmin, (req: Request, res: Response) => {
  const template = promptTemplates.get(req.params.id)

  if (!template) {
    res.status(404).json({ success: false, error: 'Template not found' })
    return
  }

  res.json({
    success: true,
    data: {
      id: req.params.id,
      ...template,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })
})

router.put('/prompts/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body

  const template = promptTemplates.get(id)
  if (!template) {
    res.status(404).json({ success: false, error: 'Template not found' })
    return
  }

  Object.assign(template, updates)
  promptTemplates.set(id, template)

  auditLogs.push({
    id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
    timestamp: new Date().toISOString(),
    actorId: 'admin',
    actorEmail: 'admin@system',
    action: 'update',
    resourceType: 'prompt_template',
    resourceId: id,
    ipAddress: req.ip || 'unknown',
  })

  res.json({ success: true, data: { id, ...template } })
})

router.post('/prompts', requireAdmin, (req: Request, res: Response) => {
  const { name, description, category, systemPrompt, userPromptTemplate } = req.body

  if (!name || !category || !systemPrompt || !userPromptTemplate) {
    res.status(400).json({ success: false, error: 'Missing required fields' })
    return
  }

  const id = `prompt-${Date.now()}`
  const template = {
    name,
    description: description || '',
    category,
    systemPrompt,
    userPromptTemplate,
    isActive: false,
    usageCount: 0,
  }

  promptTemplates.set(id, template)

  auditLogs.push({
    id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
    timestamp: new Date().toISOString(),
    actorId: 'admin',
    actorEmail: 'admin@system',
    action: 'create',
    resourceType: 'prompt_template',
    resourceId: id,
    ipAddress: req.ip || 'unknown',
  })

  res.json({ success: true, data: { id, ...template } })
})

// ============================================================================
// DATA EXPORT
// ============================================================================

router.get('/export', requireAdmin, (req: Request, res: Response) => {
  const exportData = {
    aiRequests: aiRequests.slice(-1000),
    policyOperations: policyOperations.slice(-1000),
    securityLogs: securityLogs.slice(-1000),
    auditLogs: auditLogs.slice(-1000),
    exportedAt: new Date().toISOString(),
  }

  res.json({ success: true, data: exportData })
})

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
