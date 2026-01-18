/**
 * Admin Authentication Middleware
 * JWT-based authentication and role-based access control for admin routes
 */

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = any

// ============================================================================
// TYPES
// ============================================================================

export type AdminRole = 'admin' | 'super_admin'

export interface AdminUser {
  id: string
  email: string
  role: AdminRole
  status: 'active' | 'inactive' | 'suspended'
  displayName?: string
  permissions: string[]
}

export interface AdminTokenPayload {
  sub: string // admin user id
  email: string
  role: AdminRole
  sessionId: string
  iat: number
  exp: number
}

export interface AuthenticatedRequest extends Request {
  adminUser?: AdminUser
  adminSession?: {
    id: string
    tokenHash: string
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'insurai-admin-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '30m'
const REFRESH_TOKEN_EXPIRES_IN = process.env.ADMIN_REFRESH_EXPIRES_IN || '7d'
const BCRYPT_ROUNDS = 12

// Supabase client for database access
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabase: SupabaseClient<AnyDatabase> | null = null

function getSupabase(): SupabaseClient<AnyDatabase> | null {
  if (!supabase && supabaseUrl && supabaseServiceKey) {
    supabase = createClient<AnyDatabase>(supabaseUrl, supabaseServiceKey)
  }
  return supabase
}

// ============================================================================
// TOKEN GENERATION & VALIDATION
// ============================================================================

/**
 * Generate a JWT token for an admin user
 */
export function generateAdminToken(user: AdminUser, sessionId: string): string {
  const payload: Omit<AdminTokenPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    sessionId,
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'insurai-admin',
    audience: 'insurai-admin-api',
  } as jwt.SignOptions)
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(user: AdminUser, sessionId: string): string {
  return jwt.sign(
    { sub: user.id, sessionId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn'] } as jwt.SignOptions
  )
}

/**
 * Verify and decode a JWT token
 */
export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'insurai-admin',
      audience: 'insurai-admin-api',
    }) as AdminTokenPayload
    return decoded
  } catch (error) {
    return null
  }
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Hash a token for secure storage
 */
export function hashToken(token: string): string {
  // Use a simple hash for token comparison (not for passwords)
  return require('crypto').createHash('sha256').update(token).digest('hex')
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Database row type for admin users
 */
interface AdminUserRow {
  id: string
  email: string
  role: AdminRole
  status: 'active' | 'inactive' | 'suspended'
  display_name?: string
  permissions?: string[]
  password_hash?: string
  last_login_at?: string
  last_login_ip?: string
  login_count?: number
}

/**
 * Get admin user by ID from database
 */
export async function getAdminUserById(id: string): Promise<AdminUser | null> {
  const db = getSupabase()
  if (!db) {
    console.warn('Supabase not configured, using fallback admin check')
    return null
  }

  const { data, error } = await db
    .from('admin_users')
    .select('*')
    .eq('id', id)
    .eq('status', 'active')
    .single()

  if (error || !data) return null

  const row = data as AdminUserRow
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    permissions: row.permissions || [],
  }
}

/**
 * Get admin user by email from database
 */
export async function getAdminUserByEmail(email: string): Promise<(AdminUser & { passwordHash?: string }) | null> {
  const db = getSupabase()
  if (!db) {
    console.warn('Supabase not configured')
    return null
  }

  const { data, error } = await db
    .from('admin_users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single()

  if (error || !data) return null

  const row = data as AdminUserRow
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    permissions: row.permissions || [],
    passwordHash: row.password_hash,
  }
}

/**
 * Create admin session in database
 */
export async function createAdminSession(
  adminId: string,
  tokenHash: string,
  refreshTokenHash: string,
  ipAddress: string,
  userAgent: string
): Promise<string | null> {
  const db = getSupabase()
  if (!db) return null

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

  const { data, error } = await db
    .from('admin_sessions')
    .insert({
      admin_id: adminId,
      token_hash: tokenHash,
      refresh_token_hash: refreshTokenHash,
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create admin session:', error)
    return null
  }

  const row = data as { id: string }
  return row.id
}

/**
 * Validate admin session
 */
export async function validateAdminSession(sessionId: string, tokenHash: string): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false

  const { data, error } = await db
    .from('admin_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !data) return false

  // Update last activity
  await db
    .from('admin_sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', sessionId)

  return true
}

/**
 * Revoke admin session
 */
export async function revokeAdminSession(sessionId: string, revokedBy?: string): Promise<void> {
  const db = getSupabase()
  if (!db) return

  await db
    .from('admin_sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy,
    })
    .eq('id', sessionId)
}

/**
 * Log admin login attempt
 */
export async function updateAdminLogin(adminId: string, ipAddress: string): Promise<void> {
  const db = getSupabase()
  if (!db) return

  // First update login timestamp and IP
  await db
    .from('admin_users')
    .update({
      last_login_at: new Date().toISOString(),
      last_login_ip: ipAddress,
    })
    .eq('id', adminId)

  // Then increment login count using RPC if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).rpc('increment_login_count', { row_id: adminId })
  } catch {
    // RPC might not exist, that's okay
  }
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Main admin authentication middleware
 * Validates JWT token and attaches admin user to request
 */
export function authenticateAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Check for Authorization header
  const authHeader = req.headers.authorization
  const legacyToken = req.headers['x-admin-token'] as string | undefined

  // Development mode bypass (only if explicitly enabled)
  if (process.env.NODE_ENV === 'development' && process.env.ADMIN_DEV_BYPASS === 'true') {
    req.adminUser = {
      id: 'dev-admin',
      email: 'dev@insurai.com',
      role: 'super_admin',
      status: 'active',
      permissions: ['*'],
    }
    return next()
  }

  // Check legacy token (for backward compatibility)
  if (!authHeader && legacyToken && legacyToken === process.env.ADMIN_SECRET) {
    req.adminUser = {
      id: 'legacy-admin',
      email: 'admin@insurai.com',
      role: 'admin',
      status: 'active',
      permissions: [],
    }
    console.warn('Using legacy admin token authentication - please migrate to JWT')
    return next()
  }

  // No auth provided
  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  // Extract Bearer token
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: 'Invalid authorization header format',
      code: 'INVALID_AUTH_FORMAT',
    })
    return
  }

  const token = parts[1]

  // Verify JWT
  const payload = verifyAdminToken(token)
  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
    })
    return
  }

  // Attach admin info to request
  req.adminUser = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    status: 'active',
    permissions: [],
  }

  req.adminSession = {
    id: payload.sessionId,
    tokenHash: hashToken(token),
  }

  // Validate session asynchronously (non-blocking)
  validateAdminSession(payload.sessionId, hashToken(token))
    .then((valid) => {
      if (!valid) {
        console.warn(`Invalid session for admin ${payload.email}`)
      }
    })
    .catch(console.error)

  next()
}

/**
 * Role-based access control middleware factory
 * Creates middleware that requires specific admin roles
 */
export function requireRole(...allowedRoles: AdminRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // First ensure user is authenticated
    if (!req.adminUser) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      })
      return
    }

    // Check if user has required role
    if (!allowedRoles.includes(req.adminUser.role)) {
      res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required: ${allowedRoles.join(' or ')}`,
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: allowedRoles,
        userRole: req.adminUser.role,
      })
      return
    }

    next()
  }
}

/**
 * Permission-based access control middleware factory
 * Creates middleware that requires specific permissions
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      })
      return
    }

    // Super admin has all permissions
    if (req.adminUser.role === 'super_admin') {
      return next()
    }

    // Check wildcard permission
    if (req.adminUser.permissions.includes('*')) {
      return next()
    }

    // Check specific permissions
    const hasAllPermissions = requiredPermissions.every(
      (perm) => req.adminUser!.permissions.includes(perm)
    )

    if (!hasAllPermissions) {
      res.status(403).json({
        success: false,
        error: 'Missing required permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredPermissions,
      })
      return
    }

    next()
  }
}

/**
 * Combined authentication + role check middleware
 */
export function requireAdmin(role?: AdminRole) {
  return [
    authenticateAdmin,
    ...(role ? [requireRole(role)] : []),
  ]
}

/**
 * Require super admin access
 */
export function requireSuperAdmin() {
  return requireAdmin('super_admin')
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Log admin action to audit log
 */
export async function logAdminAction(
  req: AuthenticatedRequest,
  action: string,
  resourceType: string,
  resourceId?: string,
  previousState?: unknown,
  newState?: unknown,
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>
): Promise<void> {
  const db = getSupabase()
  if (!db) return

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'

  await db.from('audit_logs').insert({
    actor_id: req.adminUser?.id,
    actor_email: req.adminUser?.email,
    actor_role: req.adminUser?.role,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    previous_state: previousState,
    new_state: newState,
    changes,
    ip_address: clientIp,
    user_agent: req.headers['user-agent'],
    session_id: req.adminSession?.id,
  })
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  authenticateAdmin,
  requireRole,
  requirePermission,
  requireAdmin,
  requireSuperAdmin,
  generateAdminToken,
  generateRefreshToken,
  verifyAdminToken,
  hashPassword,
  verifyPassword,
  hashToken,
  getAdminUserById,
  getAdminUserByEmail,
  createAdminSession,
  validateAdminSession,
  revokeAdminSession,
  logAdminAction,
}
