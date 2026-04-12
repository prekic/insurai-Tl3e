/**
 * Audit Logger
 * Structured logging for security, compliance, and debugging
 */

import type {
  AuditEvent,
  AuditEventType,
  AuditEventCategory,
  AuditSeverity,
  AuditLogQuery,
  AuditLogStats,
  AuditRetentionPolicy,
  AIAuditDetails,
  PolicyAuditDetails,
  AuthAuditDetails,
  ExportAuditDetails,
} from '@/types/security'
import { DEFAULT_RETENTION_POLICY } from '@/types/security'

/**
 * Storage configuration
 */
const STORAGE_KEY = 'insurai_audit_log'
const DB_NAME = 'insurai_audit'
const DB_VERSION = 1
const STORE_NAME = 'events'

/**
 * Event listeners for real-time logging
 */
type EventListener = (event: AuditEvent) => void
const eventListeners: EventListener[] = []

/**
 * Hash function for IP privacy
 */
async function hashString(str: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Fallback for non-secure contexts
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(8, '0')
  }

  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate unique ID
 */
function generateId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `${timestamp}-${random}`
}

/**
 * Get category from event type
 */
function getCategoryFromType(type: AuditEventType): AuditEventCategory {
  const prefix = type.split('.')[0]
  const categoryMap: Record<string, AuditEventCategory> = {
    auth: 'auth',
    policy: 'policy',
    document: 'document',
    ai: 'ai',
    export: 'export',
    search: 'search',
    settings: 'settings',
    security: 'security',
    error: 'error',
  }
  return categoryMap[prefix] ?? 'error'
}

/**
 * Determine severity from event type
 */
function getSeverityFromType(type: AuditEventType, success: boolean): AuditSeverity {
  if (!success && type.includes('failed')) return 'error'
  if (type.includes('security.')) return 'warning'
  if (type.includes('error.')) return 'error'
  if (type.includes('critical')) return 'critical'
  return 'info'
}

/**
 * Audit Logger class
 * Provides structured logging with IndexedDB persistence
 */
class AuditLogger {
  private db: IDBDatabase | null = null
  private dbInitPromise: Promise<void> | null = null
  private memoryLog: AuditEvent[] = []
  private retentionPolicy: AuditRetentionPolicy
  private debug: boolean

  constructor(debug = false) {
    this.retentionPolicy = DEFAULT_RETENTION_POLICY
    this.debug = debug
    this.initDatabase()
  }

  /**
   * Initialize IndexedDB
   */
  private async initDatabase(): Promise<void> {
    if (this.dbInitPromise) return this.dbInitPromise

    this.dbInitPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve()
        return
      }

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => {
          resolve()
        }

        request.onsuccess = () => {
          this.db = request.result
          resolve()
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result

          // Create events store with indexes
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
            store.createIndex('timestamp', 'timestamp', { unique: false })
            store.createIndex('type', 'type', { unique: false })
            store.createIndex('category', 'category', { unique: false })
            store.createIndex('userId', 'userId', { unique: false })
            store.createIndex('severity', 'severity', { unique: false })
            store.createIndex('resourceId', 'resourceId', { unique: false })
          }
        }
      } catch {
        resolve()
      }
    })

    return this.dbInitPromise
  }

  /**
   * Log an audit event
   */
  async log(
    type: AuditEventType,
    details: Record<string, unknown> = {},
    options: {
      userId?: string
      sessionId?: string
      resourceId?: string
      resourceType?: string
      durationMs?: number
      success?: boolean
      errorMessage?: string
      errorCode?: string
      ip?: string
    } = {}
  ): Promise<AuditEvent> {
    const now = Date.now()
    const success = options.success ?? !type.includes('failed')

    const event: AuditEvent = {
      id: generateId(),
      type,
      category: getCategoryFromType(type),
      severity: getSeverityFromType(type, success),
      timestamp: now,
      timestampISO: new Date(now).toISOString(),
      userId: options.userId,
      sessionId: options.sessionId,
      ipHash: options.ip ? await hashString(options.ip) : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      details,
      durationMs: options.durationMs,
      resourceId: options.resourceId,
      resourceType: options.resourceType,
      success,
      errorMessage: options.errorMessage,
      errorCode: options.errorCode,
    }

    // Store event
    await this.storeEvent(event)

    // Notify listeners
    this.notifyListeners(event)

    // Debug output
    if (this.debug) {
      if (success) {
        console.warn('[AUDIT]', type, details)
      } else {
        console.error('[AUDIT ERROR]', type, details)
      }
    }

    return event
  }

  /**
   * Log AI-related events with typed details
   */
  async logAI(
    type: Extract<AuditEventType, `ai.${string}`>,
    details: AIAuditDetails,
    options?: {
      userId?: string
      durationMs?: number
      success?: boolean
      errorMessage?: string
    }
  ): Promise<AuditEvent> {
    return this.log(type, details as unknown as Record<string, unknown>, {
      ...options,
      resourceType: 'ai_operation',
    })
  }

  /**
   * Log policy-related events with typed details
   */
  async logPolicy(
    type: Extract<AuditEventType, `policy.${string}`>,
    details: PolicyAuditDetails,
    options?: {
      userId?: string
      success?: boolean
    }
  ): Promise<AuditEvent> {
    return this.log(type, details as unknown as Record<string, unknown>, {
      ...options,
      resourceId: details.policyId,
      resourceType: 'policy',
    })
  }

  /**
   * Log auth-related events with typed details
   */
  async logAuth(
    type: Extract<AuditEventType, `auth.${string}`>,
    details: AuthAuditDetails,
    options?: {
      userId?: string
      ip?: string
      success?: boolean
    }
  ): Promise<AuditEvent> {
    // Remove sensitive data
    const safeDetails = {
      method: details.method,
      failureReason: details.failureReason,
      mfaUsed: details.mfaUsed,
      // Only include masked email
      email: details.email ? this.maskEmail(details.email) : undefined,
    }

    return this.log(type, safeDetails as unknown as Record<string, unknown>, {
      ...options,
      resourceType: 'auth',
    })
  }

  /**
   * Log export events with typed details
   */
  async logExport(
    type: Extract<AuditEventType, `export.${string}`>,
    details: ExportAuditDetails,
    options?: {
      userId?: string
      success?: boolean
    }
  ): Promise<AuditEvent> {
    return this.log(type, details as unknown as Record<string, unknown>, {
      ...options,
      resourceType: 'export',
    })
  }

  /**
   * Log security events
   */
  async logSecurity(
    type: Extract<AuditEventType, `security.${string}`>,
    details: Record<string, unknown>,
    options?: {
      userId?: string
      ip?: string
    }
  ): Promise<AuditEvent> {
    return this.log(type, details, {
      ...options,
      success: false,
      resourceType: 'security',
    })
  }

  /**
   * Log errors
   */
  async logError(
    error: Error | string,
    context?: Record<string, unknown>,
    options?: {
      userId?: string
    }
  ): Promise<AuditEvent> {
    const errorDetails =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n'),
          }
        : { message: error }

    return this.log(
      'error.unhandled',
      { ...errorDetails, ...context },
      {
        ...options,
        success: false,
        errorMessage: typeof error === 'string' ? error : error.message,
      }
    )
  }

  /**
   * Query audit logs
   */
  async query(options: AuditLogQuery = {}): Promise<AuditEvent[]> {
    await this.dbInitPromise

    if (!this.db) {
      // Fallback to memory log
      return this.queryMemory(options)
    }

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const events: AuditEvent[] = []

      let cursorRequest: IDBRequest

      // Use appropriate index based on query
      if (options.userId) {
        cursorRequest = store.index('userId').openCursor(IDBKeyRange.only(options.userId))
      } else if (options.category) {
        cursorRequest = store.index('category').openCursor(IDBKeyRange.only(options.category))
      } else if (options.type) {
        cursorRequest = store.index('type').openCursor(IDBKeyRange.only(options.type))
      } else {
        cursorRequest = store.index('timestamp').openCursor(null, 'prev')
      }

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor && events.length < (options.limit ?? 100)) {
          const event = cursor.value as AuditEvent

          // Apply filters
          if (this.matchesQuery(event, options)) {
            events.push(event)
          }

          cursor.continue()
        } else {
          resolve(events)
        }
      }

      cursorRequest.onerror = () => reject(cursorRequest.error)
    })
  }

  /**
   * Get audit log statistics
   */
  async getStats(startDate?: Date, endDate?: Date): Promise<AuditLogStats> {
    const start = startDate?.getTime() ?? Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
    const end = endDate?.getTime() ?? Date.now()

    const events = await this.query({
      startDate: new Date(start),
      endDate: new Date(end),
      limit: 10000,
    })

    const eventsByCategory: Record<AuditEventCategory, number> = {
      auth: 0,
      policy: 0,
      document: 0,
      ai: 0,
      export: 0,
      search: 0,
      settings: 0,
      security: 0,
      error: 0,
    }

    const eventsBySeverity: Record<AuditSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    }

    const typeCount: Record<string, number> = {}
    let totalDuration = 0
    let durationCount = 0
    let errorCount = 0

    for (const event of events) {
      eventsByCategory[event.category]++
      eventsBySeverity[event.severity]++
      typeCount[event.type] = (typeCount[event.type] ?? 0) + 1

      if (event.durationMs) {
        totalDuration += event.durationMs
        durationCount++
      }

      if (!event.success) {
        errorCount++
      }
    }

    const topEventTypes = Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type: type as AuditEventType, count }))

    return {
      totalEvents: events.length,
      eventsByCategory,
      eventsBySeverity,
      errorRate: events.length > 0 ? errorCount / events.length : 0,
      avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
      topEventTypes,
      periodStart: start,
      periodEnd: end,
    }
  }

  /**
   * Clean up old logs based on retention policy
   */
  async cleanup(): Promise<number> {
    await this.dbInitPromise

    const now = Date.now()
    let cleaned = 0

    if (!this.db) {
      // Cleanup memory log
      const originalLength = this.memoryLog.length
      this.memoryLog = this.memoryLog.filter((event) => {
        const age = now - event.timestamp
        const days = age / (24 * 60 * 60 * 1000)

        if (event.severity === 'info' && days > this.retentionPolicy.infoRetentionDays) return false
        if (event.severity === 'warning' && days > this.retentionPolicy.warningRetentionDays)
          return false
        if (
          (event.severity === 'error' || event.severity === 'critical') &&
          days > this.retentionPolicy.errorRetentionDays
        )
          return false

        return true
      })
      return originalLength - this.memoryLog.length
    }

    // Cleanup IndexedDB
    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const cursorRequest = store.index('timestamp').openCursor()

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor) {
          const event = cursor.value as AuditEvent
          const age = now - event.timestamp
          const days = age / (24 * 60 * 60 * 1000)

          let shouldDelete = false

          if (event.severity === 'info' && days > this.retentionPolicy.infoRetentionDays) {
            shouldDelete = true
          } else if (
            event.severity === 'warning' &&
            days > this.retentionPolicy.warningRetentionDays
          ) {
            shouldDelete = true
          } else if (
            (event.severity === 'error' || event.severity === 'critical') &&
            days > this.retentionPolicy.errorRetentionDays
          ) {
            shouldDelete = true
          }

          if (shouldDelete) {
            cursor.delete()
            cleaned++
          }

          cursor.continue()
        } else {
          resolve(cleaned)
        }
      }

      cursorRequest.onerror = () => reject(cursorRequest.error)
    })
  }

  /**
   * Clear all logs
   */
  async clear(): Promise<void> {
    await this.dbInitPromise

    this.memoryLog = []

    if (!this.db) return

    const db = this.db
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Add event listener
   */
  onEvent(listener: EventListener): () => void {
    eventListeners.push(listener)
    return () => {
      const index = eventListeners.indexOf(listener)
      if (index > -1) eventListeners.splice(index, 1)
    }
  }

  /**
   * Set retention policy
   */
  setRetentionPolicy(policy: Partial<AuditRetentionPolicy>): void {
    this.retentionPolicy = { ...this.retentionPolicy, ...policy }
  }

  /**
   * Enable/disable debug mode
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled
  }

  /**
   * Export logs as JSON
   */
  async export(options: AuditLogQuery = {}): Promise<string> {
    const events = await this.query(options)
    return JSON.stringify(events, null, 2)
  }

  // Private methods

  private async storeEvent(event: AuditEvent): Promise<void> {
    // Always store in memory as backup
    this.memoryLog.push(event)

    // Trim memory log if too large
    if (this.memoryLog.length > this.retentionPolicy.maxEntries) {
      this.memoryLog = this.memoryLog.slice(-this.retentionPolicy.maxEntries)
    }

    // Try localStorage fallback
    this.saveToLocalStorage()

    await this.dbInitPromise

    if (!this.db) return

    const db = this.db
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        store.add(event)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve() // Don't fail if storage fails
      } catch {
        resolve()
      }
    })
  }

  private queryMemory(options: AuditLogQuery): AuditEvent[] {
    let events = this.memoryLog.filter((event) => this.matchesQuery(event, options))

    // Sort by timestamp descending
    events.sort((a, b) => b.timestamp - a.timestamp)

    // Apply offset and limit
    if (options.offset) {
      events = events.slice(options.offset)
    }
    if (options.limit) {
      events = events.slice(0, options.limit)
    }

    return events
  }

  private matchesQuery(event: AuditEvent, options: AuditLogQuery): boolean {
    if (options.category && event.category !== options.category) return false
    if (options.type && event.type !== options.type) return false
    if (options.userId && event.userId !== options.userId) return false
    if (options.severity && event.severity !== options.severity) return false
    if (options.resourceId && event.resourceId !== options.resourceId) return false
    if (options.success !== undefined && event.success !== options.success) return false
    if (options.startDate && event.timestamp < options.startDate.getTime()) return false
    if (options.endDate && event.timestamp > options.endDate.getTime()) return false

    return true
  }

  private notifyListeners(event: AuditEvent): void {
    for (const listener of eventListeners) {
      try {
        listener(event)
      } catch {
        // Ignore listener errors
      }
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (!domain) return '***'
    const maskedLocal = local.length > 2 ? local[0] + '***' + local[local.length - 1] : '***'
    return `${maskedLocal}@${domain}`
  }

  private saveToLocalStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      // Only save recent events to localStorage as backup
      const recentEvents = this.memoryLog.slice(-100)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentEvents))
    } catch {
      // Storage full or unavailable
    }
  }
}

/**
 * Singleton audit logger instance
 */
export const auditLogger = new AuditLogger()

/**
 * Convenience function for logging
 */
export function audit(
  type: AuditEventType,
  details?: Record<string, unknown>,
  options?: Parameters<typeof auditLogger.log>[2]
): Promise<AuditEvent> {
  return auditLogger.log(type, details ?? {}, options)
}

/**
 * Create a timed audit log (measures duration)
 */
export function createTimedAudit(
  type: AuditEventType,
  details?: Record<string, unknown>,
  options?: Parameters<typeof auditLogger.log>[2]
): {
  complete: (extraDetails?: Record<string, unknown>, success?: boolean) => Promise<AuditEvent>
  fail: (error: Error | string, extraDetails?: Record<string, unknown>) => Promise<AuditEvent>
} {
  const startTime = Date.now()

  return {
    async complete(extraDetails = {}, success = true) {
      return auditLogger.log(
        type,
        { ...details, ...extraDetails },
        {
          ...options,
          durationMs: Date.now() - startTime,
          success,
        }
      )
    },
    async fail(error, extraDetails = {}) {
      const errorMessage = error instanceof Error ? error.message : error
      return auditLogger.log(
        type,
        { ...details, ...extraDetails },
        {
          ...options,
          durationMs: Date.now() - startTime,
          success: false,
          errorMessage,
        }
      )
    },
  }
}
