/**
 * Security Module
 * Rate limiting, audit logging, key management, and security monitoring
 */

// Rate Limiter
export {
  rateLimiter,
  rateLimit,
  checkRateLimit,
  consumeRateLimit,
  formatRetryAfter,
  getUserQuotas,
} from './rate-limiter'

// Audit Logger
export {
  auditLogger,
  audit,
  createTimedAudit,
} from './audit-logger'

// Secure Key Manager
export {
  secureKeyManager,
  validateKeyFormat,
  maskApiKey,
  migrateOldKeys,
} from './key-manager'
export type { APIKeyProvider } from './key-manager'

// Security Monitor
export {
  securityMonitor,
  inputSanitizer,
  isSecureContext,
  generateSecurityReport,
} from './security-monitor'

// Re-export types
export type {
  RateLimitedOperation,
  RateLimitConfig,
  RateLimitResult,
  RateLimitViolation,
  AuditEvent,
  AuditEventType,
  AuditEventCategory,
  AuditSeverity,
  AuditLogQuery,
  AuditLogStats,
  AIAuditDetails,
  PolicyAuditDetails,
  AuthAuditDetails,
  ExportAuditDetails,
  SecurityAlert,
  SecurityAlertThresholds,
} from '@/types/security'

// Integration with rate limiter violations
import { rateLimiter } from './rate-limiter'
import { auditLogger } from './audit-logger'
import { securityMonitor } from './security-monitor'
import { migrateOldKeys } from './key-manager'

/**
 * Initialize security module
 * Sets up rate limit violation logging, security monitoring, and key migration
 */
export async function initializeSecurity(): Promise<void> {
  // Migrate old API keys to encrypted storage
  try {
    await migrateOldKeys()
  } catch {
    console.warn('Failed to migrate old API keys')
  }

  // Initialize security monitor
  securityMonitor.initialize()

  // Log rate limit violations
  rateLimiter.onViolation((violation) => {
    auditLogger.logSecurity('security.rate_limit_exceeded', {
      operation: violation.operation,
      limit: violation.limit,
      current: violation.current,
    })
  })

  // Periodic cleanup
  if (typeof setInterval !== 'undefined') {
    // Clean up expired rate limits every 5 minutes
    setInterval(() => {
      rateLimiter.cleanup()
    }, 5 * 60 * 1000)

    // Clean up old audit logs daily
    setInterval(() => {
      auditLogger.cleanup()
    }, 24 * 60 * 60 * 1000)
  }
}

/**
 * Security dashboard data
 */
export interface SecurityDashboardData {
  rateLimits: {
    operation: string
    used: number
    limit: number
    remaining: number
    resetAt: string
  }[]
  recentEvents: Awaited<ReturnType<typeof auditLogger.query>>
  stats: Awaited<ReturnType<typeof auditLogger.getStats>>
}

/**
 * Get security dashboard data for a user
 */
export async function getSecurityDashboardData(
  userId: string
): Promise<SecurityDashboardData> {
  const quotas = await import('./rate-limiter').then(m => m.getUserQuotas(userId))

  const rateLimits = Object.entries(quotas).map(([operation, data]) => ({
    operation,
    ...data,
  }))

  const recentEvents = await auditLogger.query({
    userId,
    limit: 50,
  })

  const stats = await auditLogger.getStats()

  return {
    rateLimits,
    recentEvents,
    stats,
  }
}
