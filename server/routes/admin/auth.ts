/**
 * Admin Authentication Routes
 *
 * Endpoints: /diagnostics, /auth/login, /auth/logout, /auth/refresh, /auth/me
 */

import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { logger } from '../../lib/logger.js'

const log = logger.child('AdminAuth')

import {
  authenticateAdmin,
  generateAdminToken,
  generateRefreshToken,
  verifyAdminToken,
  verifyPassword,
  hashToken,
  getAdminUserByEmail,
  createAdminSession,
  revokeAdminSession,
  updateAdminLogin,
  getSupabaseWithError,
  authLimiter,
  adminDb,
  getClientIp,
} from './shared.js'
import type { AuthenticatedRequest } from './shared.js'

const router = Router()

// ============================================================================
// DIAGNOSTIC ENDPOINTS (Public - for debugging deployment issues)
// ============================================================================

/**
 * Admin configuration diagnostic endpoint
 * GET /api/admin/diagnostics
 * Returns configuration status without exposing secrets
 * Use this to debug deployment issues (e.g., missing env vars)
 */
router.get('/diagnostics', (_req: Request, res: Response) => {
  const hasJwtSecret = !!(process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET)
  const jwtSecretLength = (process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || '').length
  const hasSupabaseUrl = !!process.env.SUPABASE_URL
  const hasViteSupabaseUrl = !!process.env.VITE_SUPABASE_URL
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  // Check Supabase client initialization
  const { client, error: supabaseError } = getSupabaseWithError()

  // AI provider configuration checks
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const hasGoogleApiKey = !!process.env.GOOGLE_CLOUD_API_KEY
  const hasGCPServiceAccount = !!(process.env.GCP_SERVICE_ACCOUNT_BASE64 || process.env.GCP_CREDENTIALS_BASE64 || process.env.GOOGLE_APPLICATION_CREDENTIALS)

  const issues: string[] = []
  if (!hasJwtSecret) issues.push('ADMIN_JWT_SECRET not configured')
  if (jwtSecretLength > 0 && jwtSecretLength < 32) issues.push('ADMIN_JWT_SECRET too short (< 32 chars)')
  if (!hasSupabaseUrl && !hasViteSupabaseUrl) issues.push('SUPABASE_URL not configured')
  if (!hasServiceKey) issues.push('SUPABASE_SERVICE_ROLE_KEY not configured')
  if (!client && supabaseError) issues.push(`Supabase init failed: ${supabaseError}`)
  if (!hasOpenAI && !hasAnthropic) issues.push('No AI extraction provider configured (need OPENAI_API_KEY or ANTHROPIC_API_KEY)')
  if (!hasGoogleApiKey && !hasGCPServiceAccount) issues.push('No Google Cloud credentials configured (need GOOGLE_CLOUD_API_KEY or GCP_SERVICE_ACCOUNT_BASE64)')

  res.json({
    success: issues.length === 0,
    status: issues.length === 0 ? 'healthy' : 'misconfigured',
    timestamp: new Date().toISOString(),
    config: {
      hasJwtSecret,
      jwtSecretLength: jwtSecretLength > 0 ? `${jwtSecretLength} chars` : 'not set',
      hasSupabaseUrl,
      hasViteSupabaseUrl,
      hasServiceKey,
      supabaseClientInitialized: !!client,
      supabaseError: supabaseError || null,
      // AI provider status (no secrets exposed — only boolean presence)
      hasOpenAI,
      hasAnthropic,
      hasGoogleApiKey,
      hasGCPServiceAccount,
    },
    issues: issues.length > 0 ? issues : undefined,
    nodeEnv: process.env.NODE_ENV,
    hint: 'Run GET /api/ai/diagnose for live provider validation (makes test API calls)',
  })
})

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

/**
 * Admin login endpoint
 * POST /api/admin/auth/login
 */
router.post('/auth/login', authLimiter, async (req: Request, res: Response) => {
  log.info('Login request received')
  try {
    const { email, password } = req.body
    log.info('Attempting login', { email })

    if (!email || !password) {
      log.warn('Missing credentials')
      res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS',
      })
      return
    }

    // Check Supabase configuration FIRST - fail fast with clear error
    const { client: supabaseClient, error: supabaseError } = getSupabaseWithError()
    if (!supabaseClient) {
      log.error('Supabase not configured', { error: supabaseError })
      res.status(503).json({
        success: false,
        error: 'Database service unavailable',
        code: 'DB_NOT_CONFIGURED',
        message: supabaseError || 'Supabase is not properly configured',
        details: {
          hasSupabaseUrl: !!process.env.SUPABASE_URL,
          hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      })
      return
    }

    // Get admin user from database
    log.info('Fetching user from database')
    let adminUser
    try {
      adminUser = await getAdminUserByEmail(email)
      log.info('User fetch result', { found: !!adminUser, status: adminUser?.status })
    } catch (dbError) {
      log.error('Database error fetching user', { error: dbError instanceof Error ? dbError.message : String(dbError) })
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError)
      res.status(500).json({
        success: false,
        error: 'Database query failed',
        code: 'DB_QUERY_ERROR',
        message: errorMessage,
      })
      return
    }

    if (!adminUser || !adminUser.passwordHash) {
      log.warn('No user or no password hash', { hasUser: !!adminUser, hasHash: !!adminUser?.passwordHash })
      // Log failed attempt (non-blocking)
      adminDb.logSecurityEvent({
        eventType: 'login_failed',
        severity: 'warning',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        details: { email, reason: 'user_not_found' },
      }).catch((err) => log.warn('Failed to log security event', { event: 'login_failed', reason: 'user_not_found', error: err instanceof Error ? err.message : String(err) }))

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
      }).catch((err) => log.warn('Failed to log security event', { event: 'login_failed', reason: 'account_inactive', error: err instanceof Error ? err.message : String(err) }))

      res.status(401).json({
        success: false,
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE',
      })
      return
    }

    // Verify password
    log.info('Verifying password')
    let passwordValid: boolean
    try {
      passwordValid = await verifyPassword(password, adminUser.passwordHash)
      log.info('Password verification complete', { valid: passwordValid })
    } catch (pwError) {
      log.error('Password verification error', { error: pwError instanceof Error ? pwError.message : String(pwError) })
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
      }).catch((err) => log.warn('Failed to log security event', { event: 'login_failed', reason: 'invalid_password', error: err instanceof Error ? err.message : String(err) }))

      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      })
      return
    }

    // Check JWT secret is configured before generating tokens
    const jwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET
    if (!jwtSecret) {
      log.error('ADMIN_JWT_SECRET not configured')
      res.status(503).json({
        success: false,
        error: 'Server configuration error',
        code: 'JWT_NOT_CONFIGURED',
        message: 'ADMIN_JWT_SECRET environment variable is not set',
      })
      return
    }

    // Generate tokens
    log.info('Generating tokens')
    const sessionId = crypto.randomUUID()
    let token: string
    let refreshToken: string
    try {
      token = generateAdminToken(adminUser, sessionId)
      refreshToken = generateRefreshToken(adminUser, sessionId)
      log.info('Tokens generated successfully')
    } catch (tokenError) {
      log.error('Token generation failed', { error: tokenError instanceof Error ? tokenError.message : String(tokenError) })
      res.status(500).json({
        success: false,
        error: 'Token generation failed',
        code: 'TOKEN_GENERATION_ERROR',
        debug: tokenError instanceof Error ? tokenError.message : String(tokenError),
      })
      return
    }

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
      log.warn('Failed to create session (non-critical)', { error: sessionError instanceof Error ? sessionError.message : String(sessionError) })
    }

    // Update login stats (non-blocking)
    updateAdminLogin(adminUser.id, getClientIp(req)).catch((err) => {
      log.warn('Failed to update login stats (non-critical)', { error: err instanceof Error ? err.message : String(err) })
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
      log.warn('Failed to log security event (non-critical)', { error: err instanceof Error ? err.message : String(err) })
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
    log.error('Unexpected login error', { error: error instanceof Error ? error.message : String(error) })
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
router.post('/auth/refresh', authLimiter, async (req: Request, res: Response) => {
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

export default router
