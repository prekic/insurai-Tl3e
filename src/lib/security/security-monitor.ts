/**
 * Security Monitor
 * Detects suspicious activity and security threats
 */

import type {
  SecurityAlert,
  SecurityAlertThresholds,
  AuditEvent,
} from '@/types/security'
import { auditLogger } from './audit-logger'

/**
 * Default security thresholds
 */
const DEFAULT_THRESHOLDS: SecurityAlertThresholds = {
  failedLoginsThreshold: 5,
  rateLimitViolationsThreshold: 10,
  suspiciousActivitySensitivity: 'medium',
}

/**
 * Time windows for pattern detection (in ms)
 */
const TIME_WINDOWS = {
  failedLogins: 15 * 60 * 1000, // 15 minutes
  rateViolations: 60 * 60 * 1000, // 1 hour
  accessPattern: 5 * 60 * 1000, // 5 minutes
}

/**
 * Access pattern tracking
 */
interface AccessPattern {
  userId?: string
  ipHash?: string
  actions: Array<{
    type: string
    timestamp: number
    resourceId?: string
  }>
  lastCheck: number
}

/**
 * Security Monitor class
 */
class SecurityMonitor {
  private thresholds: SecurityAlertThresholds
  private alerts: SecurityAlert[] = []
  private accessPatterns: Map<string, AccessPattern> = new Map()
  private failedLogins: Map<string, number[]> = new Map()
  private rateViolations: Map<string, number[]> = new Map()
  private alertListeners: Array<(alert: SecurityAlert) => void> = []
  private initialized = false

  constructor(thresholds: SecurityAlertThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds
  }

  /**
   * Initialize the security monitor
   */
  initialize(): void {
    if (this.initialized) return

    // Subscribe to audit events
    auditLogger.onEvent((event) => {
      this.processEvent(event)
    })

    // Periodic cleanup
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 5 * 60 * 1000) // Every 5 minutes
    }

    this.initialized = true
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<SecurityAlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds }
  }

  /**
   * Process an audit event for security monitoring
   */
  private processEvent(event: AuditEvent): void {
    // Track failed login attempts
    if (event.type === 'auth.signin_failed' || event.type === 'auth.signup_failed') {
      this.trackFailedLogin(event)
    }

    // Track rate limit violations
    if (event.type === 'security.rate_limit_exceeded') {
      this.trackRateViolation(event)
    }

    // Track access patterns
    this.trackAccessPattern(event)

    // Check for injection attempts
    if (event.details) {
      this.checkForInjection(event)
    }
  }

  /**
   * Track failed login attempts
   */
  private trackFailedLogin(event: AuditEvent): void {
    const key = event.ipHash || event.userId || 'unknown'
    const now = Date.now()

    if (!this.failedLogins.has(key)) {
      this.failedLogins.set(key, [])
    }

    const attempts = this.failedLogins.get(key) ?? []
    attempts.push(now)

    // Clean old attempts
    const cutoff = now - TIME_WINDOWS.failedLogins
    const recentAttempts = attempts.filter((t) => t > cutoff)
    this.failedLogins.set(key, recentAttempts)

    // Check threshold
    if (recentAttempts.length >= this.thresholds.failedLoginsThreshold) {
      this.raiseAlert({
        type: 'brute_force',
        severity: recentAttempts.length >= this.thresholds.failedLoginsThreshold * 2 ? 'critical' : 'warning',
        userId: event.userId,
        ipHash: event.ipHash,
        description: `${recentAttempts.length} failed login attempts in ${TIME_WINDOWS.failedLogins / 60000} minutes`,
      })

      // Log the detection
      auditLogger.logSecurity('security.brute_force_detected', {
        attemptCount: recentAttempts.length,
        timeWindowMinutes: TIME_WINDOWS.failedLogins / 60000,
        ipHash: event.ipHash,
      })
    }
  }

  /**
   * Track rate limit violations
   */
  private trackRateViolation(event: AuditEvent): void {
    const key = event.userId || event.ipHash || 'unknown'
    const now = Date.now()

    if (!this.rateViolations.has(key)) {
      this.rateViolations.set(key, [])
    }

    const violations = this.rateViolations.get(key) ?? []
    violations.push(now)

    // Clean old violations
    const cutoff = now - TIME_WINDOWS.rateViolations
    const recentViolations = violations.filter((t) => t > cutoff)
    this.rateViolations.set(key, recentViolations)

    // Check threshold
    if (recentViolations.length >= this.thresholds.rateLimitViolationsThreshold) {
      this.raiseAlert({
        type: 'rate_abuse',
        severity: 'warning',
        userId: event.userId,
        ipHash: event.ipHash,
        description: `${recentViolations.length} rate limit violations in ${TIME_WINDOWS.rateViolations / 60000} minutes`,
      })
    }
  }

  /**
   * Track access patterns to detect anomalies
   */
  private trackAccessPattern(event: AuditEvent): void {
    const key = event.userId || event.ipHash || 'unknown'
    const now = Date.now()

    if (!this.accessPatterns.has(key)) {
      this.accessPatterns.set(key, {
        userId: event.userId,
        ipHash: event.ipHash,
        actions: [],
        lastCheck: now,
      })
    }

    const pattern = this.accessPatterns.get(key)
    if (!pattern) return

    pattern.actions.push({
      type: event.type,
      timestamp: event.timestamp,
      resourceId: event.resourceId,
    })

    // Limit stored actions
    if (pattern.actions.length > 100) {
      pattern.actions = pattern.actions.slice(-100)
    }

    // Check for suspicious patterns periodically
    if (now - pattern.lastCheck >= TIME_WINDOWS.accessPattern) {
      this.analyzeAccessPattern(key, pattern)
      pattern.lastCheck = now
    }
  }

  /**
   * Analyze access pattern for suspicious activity
   */
  private analyzeAccessPattern(_key: string, pattern: AccessPattern): void {
    const now = Date.now()
    const recentActions = pattern.actions.filter(
      (a) => a.timestamp > now - TIME_WINDOWS.accessPattern
    )

    if (recentActions.length < 5) return

    // Sensitivity-based thresholds
    const sensitivityMultiplier =
      this.thresholds.suspiciousActivitySensitivity === 'high' ? 0.5 :
      this.thresholds.suspiciousActivitySensitivity === 'low' ? 2 : 1

    // Check for rapid-fire requests (potential scraping)
    const requestsPerMinute = recentActions.length / (TIME_WINDOWS.accessPattern / 60000)
    const scrapingThreshold = 30 * sensitivityMultiplier

    if (requestsPerMinute > scrapingThreshold) {
      this.raiseAlert({
        type: 'data_scraping',
        severity: 'warning',
        userId: pattern.userId,
        ipHash: pattern.ipHash,
        description: `High request rate: ${Math.round(requestsPerMinute)} requests/minute`,
      })

      auditLogger.logSecurity('security.data_scraping_detected', {
        requestsPerMinute: Math.round(requestsPerMinute),
        ipHash: pattern.ipHash,
      })
    }

    // Check for unusual access patterns (e.g., accessing many different resources)
    const uniqueResources = new Set(recentActions.map((a) => a.resourceId).filter(Boolean))
    const uniqueResourceThreshold = 20 * sensitivityMultiplier

    if (uniqueResources.size > uniqueResourceThreshold) {
      this.raiseAlert({
        type: 'suspicious_pattern',
        severity: 'warning',
        userId: pattern.userId,
        ipHash: pattern.ipHash,
        description: `Unusual access pattern: ${uniqueResources.size} different resources accessed in ${TIME_WINDOWS.accessPattern / 60000} minutes`,
      })

      auditLogger.logSecurity('security.unusual_access_pattern', {
        uniqueResourceCount: uniqueResources.size,
        timeWindowMinutes: TIME_WINDOWS.accessPattern / 60000,
        ipHash: pattern.ipHash,
      })
    }
  }

  /**
   * Check for injection attempts in event details
   */
  private checkForInjection(event: AuditEvent): void {
    const details = JSON.stringify(event.details)

    // SQL injection patterns
    const sqlPatterns = [
      /(['"])\s*(OR|AND)\s+\1?\s*1\s*=\s*1/i,
      /UNION\s+SELECT/i,
      /;\s*DROP\s+TABLE/i,
      /--.*$/,
    ]

    // XSS patterns
    const xssPatterns = [
      /<script\b[^>]*>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
    ]

    for (const pattern of sqlPatterns) {
      if (pattern.test(details)) {
        auditLogger.logSecurity('security.injection_attempt_detected', {
          type: 'sql',
          eventType: event.type,
          userId: event.userId,
          ipHash: event.ipHash,
        })

        this.raiseAlert({
          type: 'suspicious_pattern',
          severity: 'critical',
          userId: event.userId,
          ipHash: event.ipHash,
          description: 'Potential SQL injection attempt detected',
        })
        return
      }
    }

    for (const pattern of xssPatterns) {
      if (pattern.test(details)) {
        auditLogger.logSecurity('security.xss_attempt_detected', {
          type: 'xss',
          eventType: event.type,
          userId: event.userId,
          ipHash: event.ipHash,
        })

        this.raiseAlert({
          type: 'suspicious_pattern',
          severity: 'critical',
          userId: event.userId,
          ipHash: event.ipHash,
          description: 'Potential XSS attack attempt detected',
        })
        return
      }
    }
  }

  /**
   * Raise a security alert
   */
  private raiseAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'resolved'>): void {
    // Check if similar alert already exists and is unresolved
    const existingAlert = this.alerts.find(
      (a) =>
        !a.resolved &&
        a.type === alertData.type &&
        a.userId === alertData.userId &&
        a.ipHash === alertData.ipHash
    )

    if (existingAlert) {
      // Update existing alert if it's more severe
      if (alertData.severity === 'critical' && existingAlert.severity === 'warning') {
        existingAlert.severity = 'critical'
        existingAlert.description = alertData.description
      }
      return
    }

    const alert: SecurityAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...alertData,
      timestamp: Date.now(),
      resolved: false,
    }

    this.alerts.push(alert)

    // Notify listeners
    for (const listener of this.alertListeners) {
      try {
        listener(alert)
      } catch {
        // Ignore listener errors
      }
    }

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100)
    }
  }

  /**
   * Get active (unresolved) alerts
   */
  getActiveAlerts(): SecurityAlert[] {
    return this.alerts.filter((a) => !a.resolved)
  }

  /**
   * Get all alerts (including resolved)
   */
  getAllAlerts(limit = 50): SecurityAlert[] {
    return this.alerts.slice(-limit).reverse()
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, resolvedBy?: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId)
    if (!alert) return false

    alert.resolved = true
    alert.resolvedAt = Date.now()
    alert.resolvedBy = resolvedBy

    return true
  }

  /**
   * Subscribe to new alerts
   */
  onAlert(listener: (alert: SecurityAlert) => void): () => void {
    this.alertListeners.push(listener)
    return () => {
      const index = this.alertListeners.indexOf(listener)
      if (index > -1) this.alertListeners.splice(index, 1)
    }
  }

  /**
   * Get security dashboard data
   */
  getSecurityDashboard(): {
    activeAlerts: number
    criticalAlerts: number
    recentAlerts: SecurityAlert[]
    failedLoginAttempts: number
    rateViolationCount: number
    suspiciousPatterns: number
  } {
    const activeAlerts = this.alerts.filter((a) => !a.resolved)
    const criticalAlerts = activeAlerts.filter((a) => a.severity === 'critical')

    let totalFailedLogins = 0
    for (const attempts of this.failedLogins.values()) {
      totalFailedLogins += attempts.length
    }

    let totalRateViolations = 0
    for (const violations of this.rateViolations.values()) {
      totalRateViolations += violations.length
    }

    return {
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      recentAlerts: this.getAllAlerts(10),
      failedLoginAttempts: totalFailedLogins,
      rateViolationCount: totalRateViolations,
      suspiciousPatterns: activeAlerts.filter((a) => a.type === 'suspicious_pattern').length,
    }
  }

  /**
   * Cleanup old data
   */
  private cleanup(): void {
    const now = Date.now()

    // Clean old failed logins
    for (const [key, attempts] of this.failedLogins) {
      const recent = attempts.filter((t) => t > now - TIME_WINDOWS.failedLogins * 2)
      if (recent.length === 0) {
        this.failedLogins.delete(key)
      } else {
        this.failedLogins.set(key, recent)
      }
    }

    // Clean old rate violations
    for (const [key, violations] of this.rateViolations) {
      const recent = violations.filter((t) => t > now - TIME_WINDOWS.rateViolations * 2)
      if (recent.length === 0) {
        this.rateViolations.delete(key)
      } else {
        this.rateViolations.set(key, recent)
      }
    }

    // Clean old access patterns
    for (const [key, pattern] of this.accessPatterns) {
      const recentActions = pattern.actions.filter(
        (a) => a.timestamp > now - TIME_WINDOWS.accessPattern * 2
      )
      if (recentActions.length === 0) {
        this.accessPatterns.delete(key)
      } else {
        pattern.actions = recentActions
      }
    }
  }

  /**
   * Clear all monitoring data
   */
  clear(): void {
    this.alerts = []
    this.failedLogins.clear()
    this.rateViolations.clear()
    this.accessPatterns.clear()
  }
}

/**
 * Singleton instance
 */
export const securityMonitor = new SecurityMonitor()

/**
 * Input sanitization utilities
 */
export const inputSanitizer = {
  /**
   * Sanitize string input to prevent XSS
   */
  sanitizeString(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
  },

  /**
   * Check if string contains potential injection
   */
  hasSuspiciousContent(input: string): boolean {
    const patterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /UNION\s+SELECT/i,
      /DROP\s+TABLE/i,
      /--\s*$/,
      /\/\*.*\*\//,
    ]

    return patterns.some((p) => p.test(input))
  },

  /**
   * Sanitize object values recursively
   */
  sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.sanitizeString(value)
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeObject(value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }

    return result as T
  },
}

/**
 * Check if running in secure context (HTTPS)
 */
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false
  return window.isSecureContext ?? window.location.protocol === 'https:'
}

/**
 * Generate a security report
 */
export async function generateSecurityReport(): Promise<{
  timestamp: string
  secureContext: boolean
  cryptoSupported: boolean
  alerts: SecurityAlert[]
  dashboard: ReturnType<SecurityMonitor['getSecurityDashboard']>
  recommendations: string[]
}> {
  const dashboard = securityMonitor.getSecurityDashboard()
  const recommendations: string[] = []

  // Generate recommendations based on current state
  if (!isSecureContext()) {
    recommendations.push('Application is not running in a secure context (HTTPS). API keys may be vulnerable.')
  }

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    recommendations.push('Web Crypto API is not available. API key encryption is disabled.')
  }

  if (dashboard.criticalAlerts > 0) {
    recommendations.push(`${dashboard.criticalAlerts} critical security alert(s) require immediate attention.`)
  }

  if (dashboard.failedLoginAttempts > 10) {
    recommendations.push('High number of failed login attempts detected. Consider implementing CAPTCHA or account lockout.')
  }

  if (dashboard.rateViolationCount > 20) {
    recommendations.push('Significant rate limit violations detected. Review rate limiting configuration.')
  }

  return {
    timestamp: new Date().toISOString(),
    secureContext: isSecureContext(),
    cryptoSupported: typeof crypto !== 'undefined' && !!crypto.subtle,
    alerts: securityMonitor.getAllAlerts(),
    dashboard,
    recommendations,
  }
}
