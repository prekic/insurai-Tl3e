/**
 * Security Types
 * Rate limiting and audit logging for production readiness
 */

// ============================================
// Rate Limiting Types
// ============================================

/**
 * Operations that can be rate limited
 */
export type RateLimitedOperation =
  | 'ai_extraction'      // AI document extraction (expensive)
  | 'ai_ocr'             // OCR processing
  | 'ai_consensus'       // Multi-model consensus
  | 'policy_upload'      // File uploads
  | 'policy_create'      // Policy creation
  | 'policy_search'      // Search queries
  | 'auth_signin'        // Sign in attempts
  | 'auth_signup'        // Account creation
  | 'auth_password_reset' // Password reset requests
  | 'export_csv'         // Data export
  | 'export_pdf'         // PDF generation
  | 'chat_message'       // AI chat messages

/**
 * Rate limit configuration for an operation
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  maxRequests: number
  /** Time window in milliseconds */
  windowMs: number
  /** Optional cost per request (for quota tracking) */
  costPerRequest?: number
  /** Whether to apply per-user or global limit */
  scope: 'user' | 'global' | 'ip'
  /** Custom error message */
  errorMessage?: string
}

/**
 * Rate limit state for a specific key
 */
export interface RateLimitState {
  /** Number of requests in current window */
  count: number
  /** Window start timestamp */
  windowStart: number
  /** Accumulated cost if tracking */
  totalCost?: number
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean
  /** Remaining requests in window */
  remaining: number
  /** When the limit resets (timestamp) */
  resetAt: number
  /** Current count in window */
  count: number
  /** If blocked, retry after (ms) */
  retryAfter?: number
}

/**
 * Rate limit violation event
 */
export interface RateLimitViolation {
  operation: RateLimitedOperation
  key: string
  limit: number
  current: number
  timestamp: number
  userAgent?: string
}

// ============================================
// Audit Logging Types
// ============================================

/**
 * Audit event categories
 */
export type AuditEventCategory =
  | 'auth'           // Authentication events
  | 'policy'         // Policy CRUD operations
  | 'document'       // Document uploads/downloads
  | 'ai'             // AI processing events
  | 'export'         // Data export events
  | 'search'         // Search operations
  | 'settings'       // Configuration changes
  | 'security'       // Security-related events
  | 'error'          // Error events

/**
 * Specific audit event types
 */
export type AuditEventType =
  // Auth events
  | 'auth.signin'
  | 'auth.signin_failed'
  | 'auth.signout'
  | 'auth.signup'
  | 'auth.signup_failed'
  | 'auth.password_reset'
  | 'auth.password_changed'
  | 'auth.session_expired'
  // Policy events
  | 'policy.created'
  | 'policy.updated'
  | 'policy.deleted'
  | 'policy.viewed'
  | 'policy.compared'
  // Document events
  | 'document.uploaded'
  | 'document.upload_failed'
  | 'document.downloaded'
  | 'document.deleted'
  // AI events
  | 'ai.extraction_started'
  | 'ai.extraction_completed'
  | 'ai.extraction_failed'
  | 'ai.extraction_cached'
  | 'ai.ocr_started'
  | 'ai.ocr_completed'
  | 'ai.ocr_failed'
  | 'ai.consensus_completed'
  | 'ai.chat_message'
  // Export events
  | 'export.csv_generated'
  | 'export.pdf_generated'
  | 'export.failed'
  // Search events
  | 'search.performed'
  // Settings events
  | 'settings.api_key_configured'
  | 'settings.api_key_removed'
  | 'settings.preference_changed'
  // Security events
  | 'security.rate_limit_exceeded'
  | 'security.suspicious_activity'
  | 'security.api_key_exposed'
  // Error events
  | 'error.unhandled'
  | 'error.api_error'

/**
 * Audit log severity levels
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical'

/**
 * Base audit event structure
 */
export interface AuditEvent {
  /** Unique event ID */
  id: string
  /** Event type */
  type: AuditEventType
  /** Event category */
  category: AuditEventCategory
  /** Severity level */
  severity: AuditSeverity
  /** Event timestamp */
  timestamp: number
  /** ISO timestamp for display */
  timestampISO: string
  /** User ID if authenticated */
  userId?: string
  /** Session ID */
  sessionId?: string
  /** IP address (hashed for privacy) */
  ipHash?: string
  /** User agent string */
  userAgent?: string
  /** Event-specific details */
  details: Record<string, unknown>
  /** Operation duration in ms */
  durationMs?: number
  /** Associated resource ID */
  resourceId?: string
  /** Resource type */
  resourceType?: string
  /** Whether operation succeeded */
  success: boolean
  /** Error message if failed */
  errorMessage?: string
  /** Error code if failed */
  errorCode?: string
}

/**
 * AI-specific audit details
 */
export interface AIAuditDetails {
  provider: 'openai' | 'anthropic' | 'google'
  model?: string
  documentLength?: number
  confidence?: number
  cacheHit?: boolean
  tokenCount?: number
  estimatedCost?: number
  pageCount?: number
}

/**
 * Policy audit details
 */
export interface PolicyAuditDetails {
  policyId: string
  policyNumber?: string
  policyType?: string
  provider?: string
  action: 'create' | 'update' | 'delete' | 'view'
  changedFields?: string[]
}

/**
 * Auth audit details
 */
export interface AuthAuditDetails {
  method: 'email' | 'google' | 'github' | 'magic_link'
  email?: string
  failureReason?: string
  mfaUsed?: boolean
}

/**
 * Export audit details
 */
export interface ExportAuditDetails {
  format: 'csv' | 'pdf' | 'json'
  policyCount: number
  fileSize?: number
}

/**
 * Audit log query options
 */
export interface AuditLogQuery {
  /** Filter by category */
  category?: AuditEventCategory
  /** Filter by event type */
  type?: AuditEventType
  /** Filter by user ID */
  userId?: string
  /** Filter by severity */
  severity?: AuditSeverity
  /** Start date */
  startDate?: Date
  /** End date */
  endDate?: Date
  /** Resource ID */
  resourceId?: string
  /** Success status */
  success?: boolean
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Audit log statistics
 */
export interface AuditLogStats {
  totalEvents: number
  eventsByCategory: Record<AuditEventCategory, number>
  eventsBySeverity: Record<AuditSeverity, number>
  errorRate: number
  avgDurationMs: number
  topEventTypes: Array<{ type: AuditEventType; count: number }>
  periodStart: number
  periodEnd: number
}

/**
 * Audit log retention policy
 */
export interface AuditRetentionPolicy {
  /** Days to keep info logs */
  infoRetentionDays: number
  /** Days to keep warning logs */
  warningRetentionDays: number
  /** Days to keep error/critical logs */
  errorRetentionDays: number
  /** Maximum total log entries */
  maxEntries: number
}

/**
 * Default retention policy
 */
export const DEFAULT_RETENTION_POLICY: AuditRetentionPolicy = {
  infoRetentionDays: 30,
  warningRetentionDays: 90,
  errorRetentionDays: 365,
  maxEntries: 10000,
}

// ============================================
// Security Monitor Types
// ============================================

/**
 * Security alert thresholds
 */
export interface SecurityAlertThresholds {
  /** Failed logins before alert */
  failedLoginsThreshold: number
  /** Rate limit violations before alert */
  rateLimitViolationsThreshold: number
  /** Suspicious pattern detection sensitivity */
  suspiciousActivitySensitivity: 'low' | 'medium' | 'high'
}

/**
 * Security alert
 */
export interface SecurityAlert {
  id: string
  type: 'brute_force' | 'rate_abuse' | 'data_scraping' | 'suspicious_pattern'
  severity: 'warning' | 'critical'
  userId?: string
  ipHash?: string
  description: string
  timestamp: number
  resolved: boolean
  resolvedAt?: number
  resolvedBy?: string
}
