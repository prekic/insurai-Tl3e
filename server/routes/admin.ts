/**
 * Admin API Routes
 * Server-side endpoints for admin dashboard
 *
 * Features:
 * - JWT-based authentication with session management
 * - Role-based access control (admin, super_admin)
 * - Database persistence with fallback to in-memory storage
 * - Comprehensive audit logging
 */

import { Router, Request, Response } from 'express'
import os from 'os'
import {
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
  AuthenticatedRequest,
} from '../middleware/admin-auth.js'
import * as adminDb from '../services/admin-db.js'
import * as costControl from '../middleware/cost-control.js'
import * as promptVersioning from '../middleware/prompt-versioning.js'
import * as monitoring from '../middleware/monitoring.js'

const router = Router()

// ============================================================================
// IN-MEMORY FALLBACK STORAGE (Used when database is unavailable)
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

// Fallback storage when database is unavailable
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

// Helper to get client IP
function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress || 'unknown'
}

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

/**
 * Admin login endpoint
 * POST /api/admin/auth/login
 */
router.post('/auth/login', async (req: Request, res: Response) => {
  console.log('[Admin Login] Request received')
  try {
    const { email, password } = req.body
    console.log('[Admin Login] Attempting login for:', email)

    if (!email || !password) {
      console.log('[Admin Login] Missing credentials')
      res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS',
      })
      return
    }

    // Get admin user from database
    console.log('[Admin Login] Fetching user from database...')
    let adminUser
    try {
      adminUser = await getAdminUserByEmail(email)
      console.log('[Admin Login] User fetch result:', adminUser ? 'found' : 'not found', adminUser?.status)
    } catch (dbError) {
      console.error('[Admin Login] Database error fetching user:', dbError)
      res.status(500).json({
        success: false,
        error: 'Database error',
        code: 'DB_ERROR',
        debug: String(dbError),
      })
      return
    }

    if (!adminUser || !adminUser.passwordHash) {
      console.log('[Admin Login] No user or no password hash - adminUser:', !!adminUser, 'hasHash:', !!adminUser?.passwordHash)
      // Log failed attempt (non-blocking)
      adminDb.logSecurityEvent({
        eventType: 'login_failed',
        severity: 'warning',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        details: { email, reason: 'user_not_found' },
      }).catch(() => {})

      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      })
      return
    }

    // Check if user is active
    if (adminUser.status !== 'active') {
      adminDb.logSecurityEvent({
        eventType: 'login_failed',
        severity: 'warning',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        details: { email, reason: 'account_inactive', status: adminUser.status },
      }).catch(() => {})

      res.status(401).json({
        success: false,
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE',
      })
      return
    }

    // Verify password
    console.log('[Admin Login] Verifying password...')
    let passwordValid: boolean
    try {
      passwordValid = await verifyPassword(password, adminUser.passwordHash)
      console.log('[Admin Login] Password valid:', passwordValid)
    } catch (pwError) {
      console.error('[Admin Login] Password verification error:', pwError)
      res.status(500).json({
        success: false,
        error: 'Password verification failed',
        code: 'PASSWORD_ERROR',
        debug: String(pwError),
      })
      return
    }

    if (!passwordValid) {
      adminDb.logSecurityEvent({
        eventType: 'login_failed',
        severity: 'warning',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        details: { email, reason: 'invalid_password' },
      }).catch(() => {})

      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      })
      return
    }

    // Generate tokens
    console.log('[Admin Login] Generating tokens...')
    const sessionId = crypto.randomUUID()
    const token = generateAdminToken(adminUser, sessionId)
    const refreshToken = generateRefreshToken(adminUser, sessionId)
    console.log('[Admin Login] Tokens generated successfully')

    // Create session in database (non-blocking - don't fail login if this fails)
    try {
      await createAdminSession(
        adminUser.id,
        hashToken(token),
        hashToken(refreshToken),
        getClientIp(req),
        req.headers['user-agent'] || 'unknown'
      )
    } catch (sessionError) {
      console.error('Failed to create session (non-critical):', sessionError)
    }

    // Update login stats (non-blocking)
    updateAdminLogin(adminUser.id, getClientIp(req)).catch((err) => {
      console.error('Failed to update login stats (non-critical):', err)
    })

    // Log successful login (non-blocking)
    adminDb.logSecurityEvent({
      eventType: 'login_success',
      severity: 'info',
      userId: adminUser.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      details: { email, role: adminUser.role },
    }).catch((err) => {
      console.error('Failed to log security event (non-critical):', err)
    })

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '30m',
        user: {
          id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role,
          displayName: adminUser.displayName,
        },
      },
    })
  } catch (error) {
    console.error('[Admin Login] Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'LOGIN_ERROR',
      debug: {
        message: errorMessage,
        stack: errorStack,
      },
    })
  }
})

/**
 * Admin logout endpoint
 * POST /api/admin/auth/logout
 */
router.post('/auth/logout', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.adminSession?.id) {
      await revokeAdminSession(req.adminSession.id, req.adminUser?.id)
    }

    await adminDb.logSecurityEvent({
      eventType: 'logout',
      severity: 'info',
      userId: req.adminUser?.id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      details: { email: req.adminUser?.email },
    })

    res.json({ success: true, message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ success: false, error: 'Logout failed' })
  }
})

/**
 * Refresh token endpoint
 * POST /api/admin/auth/refresh
 */
router.post('/auth/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: 'Refresh token is required',
        code: 'MISSING_TOKEN',
      })
      return
    }

    // Verify refresh token
    const payload = verifyAdminToken(refreshToken)
    if (!payload || (payload as any).type !== 'refresh') {
      res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      })
      return
    }

    // Get admin user
    const adminUser = await getAdminUserByEmail(payload.email)
    if (!adminUser || adminUser.status !== 'active') {
      res.status(401).json({
        success: false,
        error: 'User not found or inactive',
        code: 'USER_INACTIVE',
      })
      return
    }

    // Generate new tokens
    const sessionId = crypto.randomUUID()
    const newToken = generateAdminToken(adminUser, sessionId)
    const newRefreshToken = generateRefreshToken(adminUser, sessionId)

    // Create new session
    await createAdminSession(
      adminUser.id,
      hashToken(newToken),
      hashToken(newRefreshToken),
      getClientIp(req),
      req.headers['user-agent'] || 'unknown'
    )

    // Revoke old session
    await revokeAdminSession(payload.sessionId)

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '30m',
      },
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    res.status(500).json({ success: false, error: 'Token refresh failed' })
  }
})

/**
 * Get current admin user
 * GET /api/admin/auth/me
 */
router.get('/auth/me', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      id: req.adminUser?.id,
      email: req.adminUser?.email,
      role: req.adminUser?.role,
      displayName: req.adminUser?.displayName,
      permissions: req.adminUser?.permissions,
    },
  })
})

// ============================================================================
// ADMIN USER MANAGEMENT (Super Admin Only)
// ============================================================================

/**
 * List all admin users
 * GET /api/admin/users
 */
router.get('/users', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await adminDb.getAdminUsers()

    // Log access
    await logAdminAction(req, 'view', 'admin_users')

    res.json({ success: true, data: users })
  } catch (error) {
    console.error('Failed to list admin users:', error)
    res.status(500).json({ success: false, error: 'Failed to list admin users' })
  }
})

/**
 * Create new admin user
 * POST /api/admin/users
 */
router.post('/users', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, role, displayName, permissions } = req.body

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required',
      })
      return
    }

    // Check if user already exists
    const existing = await getAdminUserByEmail(email)
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'User with this email already exists',
        code: 'USER_EXISTS',
      })
      return
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const newUser = await adminDb.createAdminUser({
      email: email.toLowerCase(),
      passwordHash,
      role: role || 'admin',
      displayName,
      permissions: permissions || [],
    })

    // Log action
    await logAdminAction(req, 'create', 'admin_user', newUser?.id, undefined, {
      email,
      role: role || 'admin',
    })

    res.json({
      success: true,
      data: newUser,
    })
  } catch (error) {
    console.error('Failed to create admin user:', error)
    res.status(500).json({ success: false, error: 'Failed to create admin user' })
  }
})

/**
 * Update admin user
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params
    const { role, status, displayName, permissions, password } = req.body

    const updates: Record<string, any> = {}
    if (role) updates.role = role
    if (status) updates.status = status
    if (displayName !== undefined) updates.display_name = displayName
    if (permissions) updates.permissions = permissions
    if (password) updates.password_hash = await hashPassword(password)

    const updated = await adminDb.updateAdminUser(id, updates)

    if (!updated) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'update', 'admin_user', id, undefined, updates)

    res.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update admin user:', error)
    res.status(500).json({ success: false, error: 'Failed to update admin user' })
  }
})

/**
 * Delete admin user
 * DELETE /api/admin/users/:id
 */
router.delete('/users/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    // Prevent self-deletion
    if (id === req.adminUser?.id) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete your own account',
        code: 'SELF_DELETE_FORBIDDEN',
      })
      return
    }

    const deleted = await adminDb.deleteAdminUser(id)

    if (!deleted) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'delete', 'admin_user', id)

    res.json({ success: true, message: 'User deleted' })
  } catch (error) {
    console.error('Failed to delete admin user:', error)
    res.status(500).json({ success: false, error: 'Failed to delete admin user' })
  }
})

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
          details: process.env.GOOGLE_CLOUD_API_KEY ? 'API key configured' : 'API key not configured',
        },
      ],
    }

    res.json({ success: true, data: health })
  } catch (error) {
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
  } catch (error) {
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

router.get('/policies/operations', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
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
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get security logs' })
  }
})

router.post('/security/logs/:id/resolve', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
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

router.get('/security/rate-limits', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
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

router.post('/security/block-ip', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
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

router.delete('/security/block-ip/:ip', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
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

router.put('/config/:id', authenticateAdmin, requireRole('admin', 'super_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
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

  // Also log to database
  logAdminAction(req, 'update', 'config', id, { value: oldValue }, { value })

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

router.get('/feature-flags', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const flags = Array.from(featureFlags.entries()).map(([id, flag]) => ({
    id,
    ...flag,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  res.json({ success: true, data: flags })
})

router.put('/feature-flags/:id', authenticateAdmin, requireRole('admin', 'super_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const updates = req.body

  const flag = featureFlags.get(id)
  if (!flag) {
    res.status(404).json({ success: false, error: 'Feature flag not found' })
    return
  }

  const previousState = { ...flag }
  Object.assign(flag, updates)
  featureFlags.set(id, flag)

  const action = updates.enabled !== undefined ? (updates.enabled ? 'enable' : 'disable') : 'update'

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

  // Log to database
  logAdminAction(req, action, 'feature_flag', id, previousState, flag)

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

router.get('/prompts', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
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

router.get('/prompts/:id', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
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

router.put('/prompts/:id', authenticateAdmin, requireRole('admin', 'super_admin'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const updates = req.body

  const template = promptTemplates.get(id)
  if (!template) {
    res.status(404).json({ success: false, error: 'Template not found' })
    return
  }

  const previousState = { ...template }
  Object.assign(template, updates)
  promptTemplates.set(id, template)

  auditLogs.push({
    id: `audit-${Date.now()}-${++requestCounters.auditLogId}`,
    timestamp: new Date().toISOString(),
    actorId: req.adminUser?.id || 'unknown',
    actorEmail: req.adminUser?.email || 'unknown',
    action: 'update',
    resourceType: 'prompt_template',
    resourceId: id,
    ipAddress: getClientIp(req),
  })

  // Log to database
  logAdminAction(req, 'update', 'prompt_template', id, previousState, template)

  res.json({ success: true, data: { id, ...template } })
})

router.post('/prompts', authenticateAdmin, requireRole('admin', 'super_admin'), (req: AuthenticatedRequest, res: Response) => {
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
    actorId: req.adminUser?.id || 'unknown',
    actorEmail: req.adminUser?.email || 'unknown',
    action: 'create',
    resourceType: 'prompt_template',
    resourceId: id,
    ipAddress: getClientIp(req),
  })

  // Log to database
  logAdminAction(req, 'create', 'prompt_template', id, undefined, template)

  res.json({ success: true, data: { id, ...template } })
})

// ============================================================================
// DATA EXPORT
// ============================================================================

router.get('/export', authenticateAdmin, requireRole('admin', 'super_admin'), async (req: AuthenticatedRequest, res: Response) => {
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

// ============================================================================
// COST BUDGET MANAGEMENT (Phase 2)
// ============================================================================

/**
 * List all budgets
 * GET /api/admin/budgets
 */
router.get('/budgets', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const budgets = await costControl.getActiveBudgets()

    // Log access
    await logAdminAction(req, 'view', 'budgets')

    res.json({ success: true, data: budgets })
  } catch (error) {
    console.error('Failed to list budgets:', error)
    res.status(500).json({ success: false, error: 'Failed to list budgets' })
  }
})

/**
 * Get a specific budget
 * GET /api/admin/budgets/:id
 */
router.get('/budgets/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const budget = await costControl.getBudget(req.params.id)

    if (!budget) {
      res.status(404).json({ success: false, error: 'Budget not found' })
      return
    }

    res.json({ success: true, data: budget })
  } catch (error) {
    console.error('Failed to get budget:', error)
    res.status(500).json({ success: false, error: 'Failed to get budget' })
  }
})

/**
 * Create a new budget
 * POST /api/admin/budgets
 */
router.post('/budgets', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      budgetType,
      limitAmount,
      alertThresholdPercent,
      actionOnExceed,
      appliesTo,
    } = req.body

    if (!name || !budgetType || !limitAmount) {
      res.status(400).json({
        success: false,
        error: 'Name, budgetType, and limitAmount are required',
      })
      return
    }

    const budget = await costControl.upsertBudget({
      name,
      budgetType,
      limitAmount: parseFloat(limitAmount),
      alertThresholdPercent: alertThresholdPercent || 80,
      actionOnExceed: actionOnExceed || 'warn',
      appliesTo: appliesTo || 'all',
      isActive: true,
    })

    // Log action
    await logAdminAction(req, 'create', 'budget', budget?.id, undefined, { name, limitAmount })

    res.json({ success: true, data: budget })
  } catch (error) {
    console.error('Failed to create budget:', error)
    res.status(500).json({ success: false, error: 'Failed to create budget' })
  }
})

/**
 * Update a budget
 * PUT /api/admin/budgets/:id
 */
router.put('/budgets/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params
    const updates = req.body

    // Get existing budget
    const existing = await costControl.getBudget(id)
    if (!existing) {
      res.status(404).json({ success: false, error: 'Budget not found' })
      return
    }

    const budget = await costControl.upsertBudget({
      ...existing,
      ...updates,
      id,
    })

    // Log action
    await logAdminAction(req, 'update', 'budget', id, existing, updates)

    res.json({ success: true, data: budget })
  } catch (error) {
    console.error('Failed to update budget:', error)
    res.status(500).json({ success: false, error: 'Failed to update budget' })
  }
})

/**
 * Delete/deactivate a budget
 * DELETE /api/admin/budgets/:id
 */
router.delete('/budgets/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    // Get existing budget
    const existing = await costControl.getBudget(id)
    if (!existing) {
      res.status(404).json({ success: false, error: 'Budget not found' })
      return
    }

    // Soft delete by setting isActive to false
    await costControl.upsertBudget({
      ...existing,
      isActive: false,
    })

    // Log action
    await logAdminAction(req, 'delete', 'budget', id)

    res.json({ success: true, message: 'Budget deactivated' })
  } catch (error) {
    console.error('Failed to delete budget:', error)
    res.status(500).json({ success: false, error: 'Failed to delete budget' })
  }
})

/**
 * Reset budget usage
 * POST /api/admin/budgets/:id/reset
 */
router.post('/budgets/:id/reset', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    const success = await costControl.resetBudgetUsage(id)

    if (!success) {
      res.status(404).json({ success: false, error: 'Budget not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'reset', 'budget', id)

    res.json({ success: true, message: 'Budget usage reset' })
  } catch (error) {
    console.error('Failed to reset budget:', error)
    res.status(500).json({ success: false, error: 'Failed to reset budget' })
  }
})

// ============================================================================
// COST ALERTS
// ============================================================================

/**
 * Get recent cost alerts
 * GET /api/admin/cost/alerts
 */
router.get('/cost/alerts', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const alerts = await costControl.getRecentAlerts(limit)

    res.json({ success: true, data: alerts })
  } catch (error) {
    console.error('Failed to get alerts:', error)
    res.status(500).json({ success: false, error: 'Failed to get alerts' })
  }
})

/**
 * Acknowledge an alert
 * POST /api/admin/cost/alerts/:id/acknowledge
 */
router.post('/cost/alerts/:id/acknowledge', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    const success = await costControl.acknowledgeAlert(id, req.adminUser?.email || 'unknown')

    if (!success) {
      res.status(404).json({ success: false, error: 'Alert not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'acknowledge', 'cost_alert', id)

    res.json({ success: true, message: 'Alert acknowledged' })
  } catch (error) {
    console.error('Failed to acknowledge alert:', error)
    res.status(500).json({ success: false, error: 'Failed to acknowledge alert' })
  }
})

// ============================================================================
// COST USAGE STATISTICS
// ============================================================================

/**
 * Get usage statistics
 * GET /api/admin/cost/usage
 */
router.get('/cost/usage', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query

    // Default to last 30 days if not specified
    const end = endDate as string || new Date().toISOString()
    const start = startDate as string || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const stats = await costControl.getUsageStats(start, end)

    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('Failed to get usage stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get usage stats' })
  }
})

/**
 * Get cost summary dashboard data
 * GET /api/admin/cost/summary
 */
router.get('/cost/summary', authenticateAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Get budgets
    const budgets = await costControl.getActiveBudgets()

    // Get today's usage
    const today = new Date()
    const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString()
    const todayEnd = new Date().toISOString()
    const todayStats = await costControl.getUsageStats(todayStart, todayEnd)

    // Get this month's usage
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const monthStats = await costControl.getUsageStats(monthStart, todayEnd)

    // Get recent alerts
    const alerts = await costControl.getRecentAlerts(10)
    const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged)

    // Calculate budget status
    const budgetStatus = budgets.map((budget) => {
      const percentUsed = (budget.currentUsage / budget.limitAmount) * 100
      let status: 'healthy' | 'warning' | 'critical' = 'healthy'
      if (percentUsed >= 100) {
        status = 'critical'
      } else if (percentUsed >= budget.alertThresholdPercent) {
        status = 'warning'
      }

      return {
        id: budget.id,
        name: budget.name,
        type: budget.budgetType,
        limit: budget.limitAmount,
        used: budget.currentUsage,
        percentUsed,
        status,
        action: budget.actionOnExceed,
      }
    })

    const summary = {
      today: {
        cost: todayStats.totalCost,
        requests: todayStats.totalRequests,
      },
      thisMonth: {
        cost: monthStats.totalCost,
        requests: monthStats.totalRequests,
      },
      budgets: budgetStatus,
      alerts: {
        total: alerts.length,
        unacknowledged: unacknowledgedAlerts.length,
        recent: unacknowledgedAlerts.slice(0, 5),
      },
      byProvider: todayStats.byProvider,
    }

    res.json({ success: true, data: summary })
  } catch (error) {
    console.error('Failed to get cost summary:', error)
    res.status(500).json({ success: false, error: 'Failed to get cost summary' })
  }
})

/**
 * Get model pricing information
 * GET /api/admin/cost/pricing
 */
router.get('/cost/pricing', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  // Return pricing info for all known models
  const models = [
    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
    'claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
    'gemini-1.5-pro', 'gemini-1.5-flash',
  ]

  const pricing = models.map((model) => ({
    model,
    pricing: costControl.getModelPricing(model),
  }))

  res.json({ success: true, data: pricing })
})

// ============================================================================
// PROMPT TEMPLATE MANAGEMENT (Phase 3)
// ============================================================================

/**
 * List all prompt templates
 * GET /api/admin/prompts/templates
 */
router.get('/prompts/templates', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const category = req.query.category as promptVersioning.PromptCategory | undefined
    const templates = await promptVersioning.getTemplates(category)

    res.json({ success: true, data: templates })
  } catch (error) {
    console.error('Failed to list templates:', error)
    res.status(500).json({ success: false, error: 'Failed to list templates' })
  }
})

/**
 * Get a specific template
 * GET /api/admin/prompts/templates/:id
 */
router.get('/prompts/templates/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await promptVersioning.getTemplate(req.params.id)

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' })
      return
    }

    // Get versions for this template
    const versions = await promptVersioning.getVersions(req.params.id)

    res.json({ success: true, data: { ...template, versions } })
  } catch (error) {
    console.error('Failed to get template:', error)
    res.status(500).json({ success: false, error: 'Failed to get template' })
  }
})

/**
 * Create a new template
 * POST /api/admin/prompts/templates
 */
router.post('/prompts/templates', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, category, systemPrompt, userPromptTemplate, isDefault } = req.body

    if (!name || !category || !systemPrompt || !userPromptTemplate) {
      res.status(400).json({
        success: false,
        error: 'Name, category, systemPrompt, and userPromptTemplate are required',
      })
      return
    }

    const template = await promptVersioning.createTemplate({
      name,
      description: description || '',
      category,
      systemPrompt,
      userPromptTemplate,
      isActive: true,
      isDefault: isDefault || false,
      createdBy: req.adminUser?.email,
    })

    // Log action
    await logAdminAction(req, 'create', 'prompt_template', template.id, undefined, { name, category })

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('Failed to create template:', error)
    res.status(500).json({ success: false, error: 'Failed to create template' })
  }
})

/**
 * Update a template
 * PUT /api/admin/prompts/templates/:id
 */
router.put('/prompts/templates/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params
    const { name, description, systemPrompt, userPromptTemplate, isActive, isDefault, changeDescription } = req.body

    const template = await promptVersioning.updateTemplate(
      id,
      { name, description, systemPrompt, userPromptTemplate, isActive, isDefault },
      changeDescription || 'Update via admin API',
      req.adminUser?.email
    )

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'update', 'prompt_template', id)

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('Failed to update template:', error)
    res.status(500).json({ success: false, error: 'Failed to update template' })
  }
})

/**
 * Delete a template
 * DELETE /api/admin/prompts/templates/:id
 */
router.delete('/prompts/templates/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    const success = await promptVersioning.deleteTemplate(id)

    if (!success) {
      res.status(404).json({ success: false, error: 'Template not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'delete', 'prompt_template', id)

    res.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Failed to delete template:', error)
    res.status(500).json({ success: false, error: 'Failed to delete template' })
  }
})

/**
 * Get template statistics
 * GET /api/admin/prompts/templates/:id/stats
 */
router.get('/prompts/templates/:id/stats', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await promptVersioning.getTemplateStats(req.params.id)

    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('Failed to get template stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get template stats' })
  }
})

// ============================================================================
// PROMPT VERSION MANAGEMENT
// ============================================================================

/**
 * Get all versions for a template
 * GET /api/admin/prompts/templates/:templateId/versions
 */
router.get('/prompts/templates/:templateId/versions', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versions = await promptVersioning.getVersions(req.params.templateId)

    res.json({ success: true, data: versions })
  } catch (error) {
    console.error('Failed to get versions:', error)
    res.status(500).json({ success: false, error: 'Failed to get versions' })
  }
})

/**
 * Get a specific version
 * GET /api/admin/prompts/versions/:id
 */
router.get('/prompts/versions/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const version = await promptVersioning.getVersion(req.params.id)

    if (!version) {
      res.status(404).json({ success: false, error: 'Version not found' })
      return
    }

    res.json({ success: true, data: version })
  } catch (error) {
    console.error('Failed to get version:', error)
    res.status(500).json({ success: false, error: 'Failed to get version' })
  }
})

/**
 * Rollback to a specific version
 * POST /api/admin/prompts/templates/:templateId/rollback/:versionId
 */
router.post('/prompts/templates/:templateId/rollback/:versionId', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateId, versionId } = req.params

    const template = await promptVersioning.rollbackToVersion(templateId, versionId, req.adminUser?.email)

    if (!template) {
      res.status(404).json({ success: false, error: 'Template or version not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'rollback', 'prompt_template', templateId, undefined, { versionId })

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('Failed to rollback:', error)
    res.status(500).json({ success: false, error: 'Failed to rollback' })
  }
})

/**
 * Compare two versions
 * GET /api/admin/prompts/versions/compare
 */
router.get('/prompts/versions/compare', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { versionA, versionB } = req.query

    if (!versionA || !versionB) {
      res.status(400).json({ success: false, error: 'versionA and versionB are required' })
      return
    }

    const [a, b] = await Promise.all([
      promptVersioning.getVersion(versionA as string),
      promptVersioning.getVersion(versionB as string),
    ])

    if (!a || !b) {
      res.status(404).json({ success: false, error: 'One or both versions not found' })
      return
    }

    res.json({
      success: true,
      data: {
        versionA: a,
        versionB: b,
        diff: {
          systemPromptChanged: a.systemPrompt !== b.systemPrompt,
          userPromptChanged: a.userPromptTemplate !== b.userPromptTemplate,
          variablesChanged: JSON.stringify(a.variables) !== JSON.stringify(b.variables),
        },
      },
    })
  } catch (error) {
    console.error('Failed to compare versions:', error)
    res.status(500).json({ success: false, error: 'Failed to compare versions' })
  }
})

// ============================================================================
// A/B TESTING MANAGEMENT
// ============================================================================

/**
 * List all A/B tests
 * GET /api/admin/prompts/ab-tests
 */
router.get('/prompts/ab-tests', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = req.query.status as promptVersioning.ABTest['status'] | undefined
    const tests = await promptVersioning.getABTests(status)

    res.json({ success: true, data: tests })
  } catch (error) {
    console.error('Failed to list A/B tests:', error)
    res.status(500).json({ success: false, error: 'Failed to list A/B tests' })
  }
})

/**
 * Get a specific A/B test
 * GET /api/admin/prompts/ab-tests/:id
 */
router.get('/prompts/ab-tests/:id', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const test = await promptVersioning.getABTest(req.params.id)

    if (!test) {
      res.status(404).json({ success: false, error: 'A/B test not found' })
      return
    }

    // Include version details
    const [controlVersion, ...treatmentVersions] = await Promise.all([
      promptVersioning.getVersion(test.controlVersionId),
      ...test.treatmentVersionIds.map((id) => promptVersioning.getVersion(id)),
    ])

    res.json({
      success: true,
      data: {
        ...test,
        controlVersion,
        treatmentVersions: treatmentVersions.filter(Boolean),
      },
    })
  } catch (error) {
    console.error('Failed to get A/B test:', error)
    res.status(500).json({ success: false, error: 'Failed to get A/B test' })
  }
})

/**
 * Create a new A/B test
 * POST /api/admin/prompts/ab-tests
 */
router.post('/prompts/ab-tests', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      description,
      templateId,
      controlVersionId,
      treatmentVersionIds,
      trafficAllocation,
      primaryMetric,
      minSampleSize,
    } = req.body

    if (!name || !templateId || !controlVersionId || !treatmentVersionIds || !trafficAllocation) {
      res.status(400).json({
        success: false,
        error: 'name, templateId, controlVersionId, treatmentVersionIds, and trafficAllocation are required',
      })
      return
    }

    // Validate traffic allocation adds up to 100%
    const totalAllocation = Object.values(trafficAllocation as Record<string, number>).reduce((sum, v) => sum + v, 0)
    if (Math.abs(totalAllocation - 100) > 0.1) {
      res.status(400).json({
        success: false,
        error: 'Traffic allocation must add up to 100%',
      })
      return
    }

    const test = await promptVersioning.createABTest({
      name,
      description: description || '',
      templateId,
      status: 'draft',
      controlVersionId,
      treatmentVersionIds,
      trafficAllocation,
      primaryMetric: primaryMetric || 'success_rate',
      minSampleSize: minSampleSize || 100,
      createdBy: req.adminUser?.email,
    })

    // Log action
    await logAdminAction(req, 'create', 'ab_test', test.id, undefined, { name, templateId })

    res.json({ success: true, data: test })
  } catch (error) {
    console.error('Failed to create A/B test:', error)
    res.status(500).json({ success: false, error: 'Failed to create A/B test' })
  }
})

/**
 * Update A/B test status
 * PUT /api/admin/prompts/ab-tests/:id/status
 */
router.put('/prompts/ab-tests/:id/status', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!status || !['draft', 'running', 'paused', 'completed', 'cancelled'].includes(status)) {
      res.status(400).json({
        success: false,
        error: 'Valid status is required (draft, running, paused, completed, cancelled)',
      })
      return
    }

    const test = await promptVersioning.updateABTestStatus(id, status)

    if (!test) {
      res.status(404).json({ success: false, error: 'A/B test not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'update_status', 'ab_test', id, undefined, { status })

    res.json({ success: true, data: test })
  } catch (error) {
    console.error('Failed to update A/B test status:', error)
    res.status(500).json({ success: false, error: 'Failed to update A/B test status' })
  }
})

/**
 * Get A/B test results
 * GET /api/admin/prompts/ab-tests/:id/results
 */
router.get('/prompts/ab-tests/:id/results', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const results = await promptVersioning.calculateABTestResults(req.params.id)

    if (!results) {
      res.status(404).json({ success: false, error: 'A/B test not found' })
      return
    }

    res.json({ success: true, data: results })
  } catch (error) {
    console.error('Failed to get A/B test results:', error)
    res.status(500).json({ success: false, error: 'Failed to get A/B test results' })
  }
})

/**
 * Apply winning version from A/B test
 * POST /api/admin/prompts/ab-tests/:id/apply-winner
 */
router.post('/prompts/ab-tests/:id/apply-winner', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    // Get test results
    const test = await promptVersioning.getABTest(id)
    if (!test) {
      res.status(404).json({ success: false, error: 'A/B test not found' })
      return
    }

    if (!test.results?.winner) {
      res.status(400).json({ success: false, error: 'No winner determined yet' })
      return
    }

    // Get winning version
    const winningVersion = await promptVersioning.getVersion(test.results.winner)
    if (!winningVersion) {
      res.status(404).json({ success: false, error: 'Winning version not found' })
      return
    }

    // Update template with winning version's prompts
    const template = await promptVersioning.updateTemplate(
      test.templateId,
      {
        systemPrompt: winningVersion.systemPrompt,
        userPromptTemplate: winningVersion.userPromptTemplate,
      },
      `Applied winning version from A/B test: ${test.name}`,
      req.adminUser?.email
    )

    // Mark test as completed
    await promptVersioning.updateABTestStatus(id, 'completed')

    // Log action
    await logAdminAction(req, 'apply_winner', 'ab_test', id, undefined, { winnerId: test.results.winner })

    res.json({ success: true, data: template })
  } catch (error) {
    console.error('Failed to apply winner:', error)
    res.status(500).json({ success: false, error: 'Failed to apply winner' })
  }
})

// ============================================================================
// PROMPT PREVIEW & TESTING
// ============================================================================

/**
 * Preview rendered prompt with variables
 * POST /api/admin/prompts/preview
 */
router.post('/prompts/preview', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateId, versionId, variables } = req.body

    if (!templateId && !versionId) {
      res.status(400).json({ success: false, error: 'templateId or versionId is required' })
      return
    }

    let version: promptVersioning.PromptVersion | null = null

    if (versionId) {
      version = await promptVersioning.getVersion(versionId)
    } else {
      version = await promptVersioning.getLatestVersion(templateId)
    }

    if (!version) {
      res.status(404).json({ success: false, error: 'Version not found' })
      return
    }

    const rendered = {
      systemPrompt: promptVersioning.renderPrompt(version.systemPrompt, variables || {}),
      userPrompt: promptVersioning.renderPrompt(version.userPromptTemplate, variables || {}),
      variables: version.variables,
      missingVariables: version.variables.filter((v) => !variables?.[v]),
    }

    res.json({ success: true, data: rendered })
  } catch (error) {
    console.error('Failed to preview prompt:', error)
    res.status(500).json({ success: false, error: 'Failed to preview prompt' })
  }
})

/**
 * Extract variables from a template string
 * POST /api/admin/prompts/extract-variables
 */
router.post('/prompts/extract-variables', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { template } = req.body

    if (!template) {
      res.status(400).json({ success: false, error: 'template is required' })
      return
    }

    const variables = promptVersioning.extractVariables(template)

    res.json({ success: true, data: { variables } })
  } catch (error) {
    console.error('Failed to extract variables:', error)
    res.status(500).json({ success: false, error: 'Failed to extract variables' })
  }
})

// ============================================================================
// MONITORING ENDPOINTS (Phase 4)
// ============================================================================

/**
 * Get system metrics
 * GET /api/admin/monitoring/metrics
 */
router.get('/monitoring/metrics', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = monitoring.getSystemMetrics()
    res.json({ success: true, data: metrics })
  } catch (error) {
    console.error('Failed to get metrics:', error)
    res.status(500).json({ success: false, error: 'Failed to get metrics' })
  }
})

/**
 * Run health checks
 * GET /api/admin/monitoring/health
 */
router.get('/monitoring/health', async (_req: Request, res: Response) => {
  try {
    const health = await monitoring.runHealthChecks()
    res.json({ success: true, data: health })
  } catch (error) {
    console.error('Failed to run health checks:', error)
    res.status(500).json({ success: false, error: 'Failed to run health checks' })
  }
})

/**
 * Get dashboard summary
 * GET /api/admin/monitoring/dashboard
 */
router.get('/monitoring/dashboard', authenticateAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const summary = await monitoring.getDashboardSummary()
    res.json({ success: true, data: summary })
  } catch (error) {
    console.error('Failed to get dashboard summary:', error)
    res.status(500).json({ success: false, error: 'Failed to get dashboard summary' })
  }
})

/**
 * Get endpoint statistics
 * GET /api/admin/monitoring/endpoints
 */
router.get('/monitoring/endpoints', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = monitoring.getEndpointStats()
    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('Failed to get endpoint stats:', error)
    res.status(500).json({ success: false, error: 'Failed to get endpoint stats' })
  }
})

/**
 * Get trends
 * GET /api/admin/monitoring/trends
 */
router.get('/monitoring/trends', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const periodMinutes = parseInt(req.query.period as string) || 60
    const intervalMinutes = parseInt(req.query.interval as string) || 5
    const trends = monitoring.getTrends(periodMinutes, intervalMinutes)
    res.json({ success: true, data: trends })
  } catch (error) {
    console.error('Failed to get trends:', error)
    res.status(500).json({ success: false, error: 'Failed to get trends' })
  }
})

/**
 * Get recent activity
 * GET /api/admin/monitoring/activity
 */
router.get('/monitoring/activity', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const activity = monitoring.getRecentActivity(limit)
    res.json({ success: true, data: activity })
  } catch (error) {
    console.error('Failed to get recent activity:', error)
    res.status(500).json({ success: false, error: 'Failed to get recent activity' })
  }
})

// ============================================================================
// ALERT RULES MANAGEMENT
// ============================================================================

/**
 * List alert rules
 * GET /api/admin/monitoring/alert-rules
 */
router.get('/monitoring/alert-rules', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rules = monitoring.getAlertRules()
    res.json({ success: true, data: rules })
  } catch (error) {
    console.error('Failed to get alert rules:', error)
    res.status(500).json({ success: false, error: 'Failed to get alert rules' })
  }
})

/**
 * Get a specific alert rule
 * GET /api/admin/monitoring/alert-rules/:id
 */
router.get('/monitoring/alert-rules/:id', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const rule = monitoring.getAlertRule(req.params.id)

    if (!rule) {
      res.status(404).json({ success: false, error: 'Alert rule not found' })
      return
    }

    res.json({ success: true, data: rule })
  } catch (error) {
    console.error('Failed to get alert rule:', error)
    res.status(500).json({ success: false, error: 'Failed to get alert rule' })
  }
})

/**
 * Create an alert rule
 * POST /api/admin/monitoring/alert-rules
 */
router.post('/monitoring/alert-rules', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, metric, condition, threshold, severity, enabled, cooldownMinutes, notificationChannels } = req.body

    if (!name || !metric || !condition || threshold === undefined) {
      res.status(400).json({
        success: false,
        error: 'name, metric, condition, and threshold are required',
      })
      return
    }

    const rule = monitoring.createAlertRule({
      name,
      description: description || '',
      metric,
      condition,
      threshold,
      severity: severity || 'warning',
      enabled: enabled !== false,
      cooldownMinutes: cooldownMinutes || 5,
      notificationChannels: notificationChannels || ['dashboard'],
    })

    // Log action
    await logAdminAction(req, 'create', 'alert_rule', rule.id, undefined, { name, metric })

    res.json({ success: true, data: rule })
  } catch (error) {
    console.error('Failed to create alert rule:', error)
    res.status(500).json({ success: false, error: 'Failed to create alert rule' })
  }
})

/**
 * Update an alert rule
 * PUT /api/admin/monitoring/alert-rules/:id
 */
router.put('/monitoring/alert-rules/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params
    const updates = req.body

    const rule = monitoring.updateAlertRule(id, updates)

    if (!rule) {
      res.status(404).json({ success: false, error: 'Alert rule not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'update', 'alert_rule', id, undefined, updates)

    res.json({ success: true, data: rule })
  } catch (error) {
    console.error('Failed to update alert rule:', error)
    res.status(500).json({ success: false, error: 'Failed to update alert rule' })
  }
})

/**
 * Delete an alert rule
 * DELETE /api/admin/monitoring/alert-rules/:id
 */
router.delete('/monitoring/alert-rules/:id', ...requireSuperAdmin(), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    const success = monitoring.deleteAlertRule(id)

    if (!success) {
      res.status(404).json({ success: false, error: 'Alert rule not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'delete', 'alert_rule', id)

    res.json({ success: true, message: 'Alert rule deleted' })
  } catch (error) {
    console.error('Failed to delete alert rule:', error)
    res.status(500).json({ success: false, error: 'Failed to delete alert rule' })
  }
})

// ============================================================================
// ALERTS MANAGEMENT
// ============================================================================

/**
 * Get active alerts
 * GET /api/admin/monitoring/alerts
 */
router.get('/monitoring/alerts', authenticateAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const alerts = monitoring.getActiveAlerts()
    res.json({ success: true, data: alerts })
  } catch (error) {
    console.error('Failed to get alerts:', error)
    res.status(500).json({ success: false, error: 'Failed to get alerts' })
  }
})

/**
 * Get alert history
 * GET /api/admin/monitoring/alerts/history
 */
router.get('/monitoring/alerts/history', authenticateAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const history = monitoring.getAlertHistory(limit)
    res.json({ success: true, data: history })
  } catch (error) {
    console.error('Failed to get alert history:', error)
    res.status(500).json({ success: false, error: 'Failed to get alert history' })
  }
})

/**
 * Acknowledge an alert
 * POST /api/admin/monitoring/alerts/:id/acknowledge
 */
router.post('/monitoring/alerts/:id/acknowledge', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    const alert = monitoring.acknowledgeAlert(id, req.adminUser?.email || 'unknown')

    if (!alert) {
      res.status(404).json({ success: false, error: 'Alert not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'acknowledge', 'monitoring_alert', id)

    res.json({ success: true, data: alert })
  } catch (error) {
    console.error('Failed to acknowledge alert:', error)
    res.status(500).json({ success: false, error: 'Failed to acknowledge alert' })
  }
})

/**
 * Resolve an alert
 * POST /api/admin/monitoring/alerts/:id/resolve
 */
router.post('/monitoring/alerts/:id/resolve', authenticateAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params

    const alert = monitoring.resolveAlert(id)

    if (!alert) {
      res.status(404).json({ success: false, error: 'Alert not found' })
      return
    }

    // Log action
    await logAdminAction(req, 'resolve', 'monitoring_alert', id)

    res.json({ success: true, data: alert })
  } catch (error) {
    console.error('Failed to resolve alert:', error)
    res.status(500).json({ success: false, error: 'Failed to resolve alert' })
  }
})

export default router
