/**
 * Operations Logger
 * Captures and stores all operations for admin monitoring
 */

import type {
  AIRequest,
  AIProvider,
  AIOperation,
  AIRequestParameters,
  PolicyOperation,
  PolicyOperationType,
  PipelineStageResult,
  UserActivity,
  UserAction,
  SecurityAuditLog,
  SecurityEventType,
  AuditLog,
  AuditAction,
  AuditResourceType,
  UserRole,
} from '@/types/admin'

// ============================================================================
// IN-MEMORY STORAGE (Replace with database in production)
// ============================================================================

const MAX_ENTRIES = 10000

class CircularBuffer<T> {
  private buffer: T[] = []
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  push(item: T): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift()
    }
    this.buffer.push(item)
  }

  getAll(): T[] {
    return [...this.buffer]
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.buffer.filter(predicate)
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.buffer.find(predicate)
  }

  clear(): void {
    this.buffer = []
  }

  get length(): number {
    return this.buffer.length
  }
}

// Storage instances
const aiRequests = new CircularBuffer<AIRequest>(MAX_ENTRIES)
const policyOperations = new CircularBuffer<PolicyOperation>(MAX_ENTRIES)
const userActivities = new CircularBuffer<UserActivity>(MAX_ENTRIES)
const securityLogs = new CircularBuffer<SecurityAuditLog>(MAX_ENTRIES)
const auditLogs = new CircularBuffer<AuditLog>(MAX_ENTRIES)

// ============================================================================
// AI REQUEST LOGGING
// ============================================================================

let aiRequestCounter = 0

export interface LogAIRequestParams {
  provider: AIProvider
  operation: AIOperation
  model: string
  endpoint: string
  prompt: string
  systemPrompt?: string
  conversationHistory?: Array<{ role: string; content: string }>
  parameters?: AIRequestParameters
  userId?: string
  sessionId?: string
  policyId?: string
  documentId?: string
  clientIp?: string
  userAgent?: string
}

export interface AIRequestResult {
  response?: string
  status: AIRequest['status']
  error?: string
  tokens: { input: number; output: number; total: number }
  cost: { input: number; output: number; total: number }
}

export function startAIRequest(params: LogAIRequestParams): string {
  const id = `ai-${Date.now()}-${++aiRequestCounter}`
  const timestamp = new Date().toISOString()

  const request: AIRequest = {
    id,
    timestamp,
    provider: params.provider,
    operation: params.operation,
    model: params.model,
    endpoint: params.endpoint,
    prompt: params.prompt,
    systemPrompt: params.systemPrompt,
    conversationHistory: params.conversationHistory,
    parameters: params.parameters || {},
    userId: params.userId,
    sessionId: params.sessionId,
    policyId: params.policyId,
    documentId: params.documentId,
    clientIp: params.clientIp,
    userAgent: params.userAgent,
    responseTime: 0,
    status: 'pending',
    tokens: { input: 0, output: 0, total: 0 },
    cost: { input: 0, output: 0, total: 0 },
  }

  aiRequests.push(request)
  return id
}

export function completeAIRequest(
  id: string,
  startTime: number,
  result: AIRequestResult
): void {
  const request = aiRequests.find((r) => r.id === id)
  if (request) {
    request.responseTime = Date.now() - startTime
    request.response = result.response
    request.status = result.status
    request.error = result.error
    request.tokens = result.tokens
    request.cost = result.cost
  }
}

export function logAIRequest(
  params: LogAIRequestParams,
  result: AIRequestResult,
  responseTime: number
): string {
  const id = `ai-${Date.now()}-${++aiRequestCounter}`
  const timestamp = new Date().toISOString()

  const request: AIRequest = {
    id,
    timestamp,
    provider: params.provider,
    operation: params.operation,
    model: params.model,
    endpoint: params.endpoint,
    prompt: params.prompt,
    systemPrompt: params.systemPrompt,
    conversationHistory: params.conversationHistory,
    parameters: params.parameters || {},
    userId: params.userId,
    sessionId: params.sessionId,
    policyId: params.policyId,
    documentId: params.documentId,
    clientIp: params.clientIp,
    userAgent: params.userAgent,
    response: result.response,
    responseTime,
    status: result.status,
    error: result.error,
    tokens: result.tokens,
    cost: result.cost,
  }

  aiRequests.push(request)
  return id
}

export function getAIRequests(filters?: {
  provider?: AIProvider
  operation?: AIOperation
  status?: AIRequest['status']
  userId?: string
  startDate?: string
  endDate?: string
  limit?: number
}): AIRequest[] {
  let results = aiRequests.getAll()

  if (filters) {
    if (filters.provider) {
      results = results.filter((r) => r.provider === filters.provider)
    }
    if (filters.operation) {
      results = results.filter((r) => r.operation === filters.operation)
    }
    if (filters.status) {
      results = results.filter((r) => r.status === filters.status)
    }
    if (filters.userId) {
      results = results.filter((r) => r.userId === filters.userId)
    }
    if (filters.startDate) {
      results = results.filter((r) => r.timestamp >= filters.startDate!)
    }
    if (filters.endDate) {
      results = results.filter((r) => r.timestamp <= filters.endDate!)
    }
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (filters?.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

// ============================================================================
// POLICY OPERATION LOGGING
// ============================================================================

let policyOpCounter = 0

export interface LogPolicyOperationParams {
  type: PolicyOperationType
  userId: string
  policyId?: string
  documentInfo?: PolicyOperation['documentInfo']
  extractionInfo?: PolicyOperation['extractionInfo']
  clientIp?: string
  userAgent?: string
}

export function startPolicyOperation(params: LogPolicyOperationParams): string {
  const id = `policy-op-${Date.now()}-${++policyOpCounter}`
  const timestamp = new Date().toISOString()

  const operation: PolicyOperation = {
    id,
    timestamp,
    type: params.type,
    userId: params.userId,
    policyId: params.policyId,
    status: 'pending',
    documentInfo: params.documentInfo,
    clientIp: params.clientIp,
    userAgent: params.userAgent,
  }

  policyOperations.push(operation)
  return id
}

export function updatePolicyOperation(
  id: string,
  updates: Partial<PolicyOperation>
): void {
  const operation = policyOperations.find((o) => o.id === id)
  if (operation) {
    Object.assign(operation, updates)
  }
}

export function completePolicyOperation(
  id: string,
  startTime: number,
  result: {
    status: 'success' | 'failed'
    policyId?: string
    extractionInfo?: PolicyOperation['extractionInfo']
    pipelineStages?: PipelineStageResult[]
    error?: string
    errorCode?: string
  }
): void {
  const operation = policyOperations.find((o) => o.id === id)
  if (operation) {
    operation.duration = Date.now() - startTime
    operation.status = result.status
    operation.policyId = result.policyId || operation.policyId
    operation.extractionInfo = result.extractionInfo
    operation.pipelineStages = result.pipelineStages
    operation.error = result.error
    operation.errorCode = result.errorCode
  }
}

export function getPolicyOperations(filters?: {
  type?: PolicyOperationType
  userId?: string
  status?: PolicyOperation['status']
  startDate?: string
  endDate?: string
  limit?: number
}): PolicyOperation[] {
  let results = policyOperations.getAll()

  if (filters) {
    if (filters.type) {
      results = results.filter((o) => o.type === filters.type)
    }
    if (filters.userId) {
      results = results.filter((o) => o.userId === filters.userId)
    }
    if (filters.status) {
      results = results.filter((o) => o.status === filters.status)
    }
    if (filters.startDate) {
      results = results.filter((o) => o.timestamp >= filters.startDate!)
    }
    if (filters.endDate) {
      results = results.filter((o) => o.timestamp <= filters.endDate!)
    }
  }

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (filters?.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

// ============================================================================
// USER ACTIVITY LOGGING
// ============================================================================

let activityCounter = 0

export function logUserActivity(params: {
  userId: string
  action: UserAction
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  sessionId?: string
}): string {
  const id = `activity-${Date.now()}-${++activityCounter}`
  const timestamp = new Date().toISOString()

  const activity: UserActivity = {
    id,
    userId: params.userId,
    timestamp,
    action: params.action,
    details: params.details || {},
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    sessionId: params.sessionId,
  }

  userActivities.push(activity)
  return id
}

export function getUserActivities(filters?: {
  userId?: string
  action?: UserAction
  startDate?: string
  endDate?: string
  limit?: number
}): UserActivity[] {
  let results = userActivities.getAll()

  if (filters) {
    if (filters.userId) {
      results = results.filter((a) => a.userId === filters.userId)
    }
    if (filters.action) {
      results = results.filter((a) => a.action === filters.action)
    }
    if (filters.startDate) {
      results = results.filter((a) => a.timestamp >= filters.startDate!)
    }
    if (filters.endDate) {
      results = results.filter((a) => a.timestamp <= filters.endDate!)
    }
  }

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (filters?.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

// ============================================================================
// SECURITY AUDIT LOGGING
// ============================================================================

let securityLogCounter = 0

export function logSecurityEvent(params: {
  eventType: SecurityEventType
  severity: SecurityAuditLog['severity']
  userId?: string
  ipAddress: string
  userAgent?: string
  details: Record<string, unknown>
}): string {
  const id = `security-${Date.now()}-${++securityLogCounter}`
  const timestamp = new Date().toISOString()

  const log: SecurityAuditLog = {
    id,
    timestamp,
    eventType: params.eventType,
    severity: params.severity,
    userId: params.userId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    details: params.details,
    resolved: false,
  }

  securityLogs.push(log)
  return id
}

export function resolveSecurityEvent(
  id: string,
  resolvedBy: string
): void {
  const log = securityLogs.find((l) => l.id === id)
  if (log) {
    log.resolved = true
    log.resolvedAt = new Date().toISOString()
    log.resolvedBy = resolvedBy
  }
}

export function getSecurityLogs(filters?: {
  eventType?: SecurityEventType
  severity?: SecurityAuditLog['severity']
  resolved?: boolean
  startDate?: string
  endDate?: string
  limit?: number
}): SecurityAuditLog[] {
  let results = securityLogs.getAll()

  if (filters) {
    if (filters.eventType) {
      results = results.filter((l) => l.eventType === filters.eventType)
    }
    if (filters.severity) {
      results = results.filter((l) => l.severity === filters.severity)
    }
    if (filters.resolved !== undefined) {
      results = results.filter((l) => l.resolved === filters.resolved)
    }
    if (filters.startDate) {
      results = results.filter((l) => l.timestamp >= filters.startDate!)
    }
    if (filters.endDate) {
      results = results.filter((l) => l.timestamp <= filters.endDate!)
    }
  }

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (filters?.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

// ============================================================================
// AUDIT TRAIL LOGGING
// ============================================================================

let auditLogCounter = 0

export function logAuditEvent(params: {
  actorId: string
  actorEmail: string
  actorRole: UserRole
  action: AuditAction
  resourceType: AuditResourceType
  resourceId?: string
  previousState?: unknown
  newState?: unknown
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>
  ipAddress: string
  userAgent?: string
  sessionId?: string
  reason?: string
}): string {
  const id = `audit-${Date.now()}-${++auditLogCounter}`
  const timestamp = new Date().toISOString()

  const log: AuditLog = {
    id,
    timestamp,
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    previousState: params.previousState,
    newState: params.newState,
    changes: params.changes,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    sessionId: params.sessionId,
    reason: params.reason,
  }

  auditLogs.push(log)
  return id
}

export function getAuditLogs(filters?: {
  actorId?: string
  action?: AuditAction
  resourceType?: AuditResourceType
  resourceId?: string
  startDate?: string
  endDate?: string
  limit?: number
}): AuditLog[] {
  let results = auditLogs.getAll()

  if (filters) {
    if (filters.actorId) {
      results = results.filter((l) => l.actorId === filters.actorId)
    }
    if (filters.action) {
      results = results.filter((l) => l.action === filters.action)
    }
    if (filters.resourceType) {
      results = results.filter((l) => l.resourceType === filters.resourceType)
    }
    if (filters.resourceId) {
      results = results.filter((l) => l.resourceId === filters.resourceId)
    }
    if (filters.startDate) {
      results = results.filter((l) => l.timestamp >= filters.startDate!)
    }
    if (filters.endDate) {
      results = results.filter((l) => l.timestamp <= filters.endDate!)
    }
  }

  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (filters?.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

// ============================================================================
// STATISTICS HELPERS
// ============================================================================

export function getAIUsageStatistics(startDate: string, endDate: string) {
  const requests = getAIRequests({ startDate, endDate })

  const byProvider: Record<string, {
    requests: number
    tokens: { input: number; output: number; total: number }
    cost: number
    totalResponseTime: number
    errors: number
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
        totalResponseTime: 0,
        errors: 0,
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

  return {
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
}

export function getPolicyStatistics(startDate: string, endDate: string) {
  const operations = getPolicyOperations({ startDate, endDate })

  const stats = {
    total: operations.length,
    byType: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    totalExtractionTime: 0,
    extractionCount: 0,
    ocrCount: 0,
  }

  for (const op of operations) {
    // By type
    stats.byType[op.type] = (stats.byType[op.type] || 0) + 1

    // By status
    stats.byStatus[op.status] = (stats.byStatus[op.status] || 0) + 1

    // Extraction stats
    if (op.type === 'extraction' && op.duration) {
      stats.totalExtractionTime += op.duration
      stats.extractionCount++
    }

    if (op.extractionInfo?.ocrUsed) {
      stats.ocrCount++
    }
  }

  return {
    total: stats.total,
    byType: stats.byType,
    byStatus: stats.byStatus,
    averageExtractionTime: stats.extractionCount > 0
      ? stats.totalExtractionTime / stats.extractionCount
      : 0,
    extractionSuccessRate: stats.byStatus.success
      ? stats.byStatus.success / stats.total
      : 0,
    ocrUsageRate: stats.total > 0 ? stats.ocrCount / stats.total : 0,
  }
}

// ============================================================================
// CLEANUP & EXPORT
// ============================================================================

export function clearAllLogs(): void {
  aiRequests.clear()
  policyOperations.clear()
  userActivities.clear()
  securityLogs.clear()
  auditLogs.clear()
}

export function exportLogs() {
  return {
    aiRequests: aiRequests.getAll(),
    policyOperations: policyOperations.getAll(),
    userActivities: userActivities.getAll(),
    securityLogs: securityLogs.getAll(),
    auditLogs: auditLogs.getAll(),
    exportedAt: new Date().toISOString(),
  }
}
