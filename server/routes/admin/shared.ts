/**
 * Shared state and helpers for admin route modules.
 *
 * All in-memory arrays are exported by reference so every sub-router
 * reads / writes the *same* data.
 */

import { Request } from 'express'

// Re-export middleware that sub-routers attach to individual endpoints.
export {
  authenticateAdmin,
  requireRole,
  requireSuperAdmin,
  generateAdminToken,
  generateRefreshToken,
  verifyAdminToken,
  hashPassword,
  verifyPassword,
  hashToken,
  getAdminUserByEmail,
  createAdminSession,
  revokeAdminSession,
  updateAdminLogin,
  logAdminAction,
  getSupabaseWithError,
} from '../../middleware/admin-auth.js'

export type { AuthenticatedRequest } from '../../middleware/admin-auth.js'
export { authLimiter } from '../../middleware/rate-limit.js'

// Re-export service modules used by multiple sub-routers.
export * as adminDb from '../../services/admin-db.js'
export * as costControl from '../../middleware/cost-control.js'
export * as promptVersioning from '../../middleware/prompt-versioning.js'
export * as monitoring from '../../middleware/monitoring.js'
export * as promptService from '../../services/prompt-service.js'

// ============================================================================
// INTERFACES
// ============================================================================

export interface AIRequest {
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

export interface PolicyOperation {
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

export interface SecurityLog {
  id: string
  timestamp: string
  eventType: string
  severity: string
  userId?: string
  ipAddress: string
  details: Record<string, unknown>
  resolved: boolean
}

export interface AuditLog {
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

// ============================================================================
// IN-MEMORY FALLBACK STORAGE  (single shared instance for all sub-routers)
// ============================================================================

export const aiRequests: AIRequest[] = []
export const policyOperations: PolicyOperation[] = []
export const securityLogs: SecurityLog[] = []
export const auditLogs: AuditLog[] = []
export const blockedIPs: Map<string, { reason: string; blockedAt: string; expiresAt?: string }> = new Map()

export const requestCounters: { aiRequestId: number; policyOpId: number; securityLogId: number; auditLogId: number } = {
  aiRequestId: 0,
  policyOpId: 0,
  securityLogId: 0,
  auditLogId: 0,
}

export const MAX_ENTRIES = 10000
export const serverStartTime = Date.now()

// ============================================================================
// HELPERS
// ============================================================================

/** Safely extract a string from Express req.params or req.query (which may be string | string[]). */
export function qstr(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/** Helper to get client IP from request headers. */
export function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress || 'unknown'
}
