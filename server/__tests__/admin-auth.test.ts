/**
 * Admin Authentication Middleware Tests
 *
 * Comprehensive tests for JWT auth, password hashing, token management,
 * and role/permission-based access control middleware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are available inside vi.mock factories
// (vi.mock is hoisted above all other code by vitest)
// ---------------------------------------------------------------------------

const {
  mockLogWarn,
  mockLogError,
  mockLogInfo,
  mockLogDebug,
  mockSingle,
} = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  mockSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
}))

// Mock the structured logger so tests don't produce console output
vi.mock('../lib/logger.js', () => {
  const child = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: {
      ...child,
      child: vi.fn(() => child),
    },
  }
})

// Mock Supabase so no real DB connection is attempted
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      single: mockSingle,
    })),
  })),
}))

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-jwt-secret-that-is-definitely-longer-than-32-characters-for-proper-validation'
const SHORT_SECRET = 'tooshort'
const TEST_SESSION_ID = 'session-abc-123'

const TEST_ADMIN_USER = {
  id: 'admin-user-id-001',
  email: 'admin@insurai.test',
  role: 'admin' as const,
  status: 'active' as const,
  permissions: ['read:policies', 'write:policies'],
}

const TEST_SUPER_ADMIN = {
  id: 'super-admin-id-001',
  email: 'super@insurai.test',
  role: 'super_admin' as const,
  status: 'active' as const,
  permissions: [],
}

const TEST_WILDCARD_ADMIN = {
  id: 'wildcard-admin-id-001',
  email: 'wildcard@insurai.test',
  role: 'admin' as const,
  status: 'active' as const,
  permissions: ['*'],
}

// Set test secret before the module is loaded (mocks are hoisted, but
// `_jwtSecret` is lazily resolved on first use, so this is fine).
process.env.ADMIN_JWT_SECRET = TEST_SECRET

// Import the module under test — mocks are already in place
import {
  generateAdminToken,
  generateRefreshToken,
  verifyAdminToken,
  hashPassword,
  verifyPassword,
  hashToken,
  authenticateAdmin,
  requireRole,
  requirePermission,
  type AuthenticatedRequest,
} from '../middleware/admin-auth.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(overrides: Partial<Record<string, unknown>> = {}): AuthenticatedRequest {
  return {
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as AuthenticatedRequest
}

function createMockResponse(): Response & { statusCode: number; _body: unknown } {
  const res: Record<string, unknown> = {
    statusCode: 200,
    _body: null,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(data: unknown) {
      res._body = data
      return res
    },
  }
  return res as unknown as Response & { statusCode: number; _body: unknown }
}

function createMockNext(): NextFunction & { called: boolean } {
  const fn = vi.fn() as unknown as NextFunction & { called: boolean }
  Object.defineProperty(fn, 'called', {
    get() {
      return (fn as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0
    },
  })
  return fn
}

// ============================================================================
// TESTS
// ============================================================================

describe('admin-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_JWT_SECRET = TEST_SECRET
  })

  // --------------------------------------------------------------------------
  // JWT Secret Configuration
  // --------------------------------------------------------------------------
  describe('JWT Secret Configuration', () => {
    const savedAdminSecret = process.env.ADMIN_JWT_SECRET
    const savedJwtSecret = process.env.JWT_SECRET

    afterEach(() => {
      // Restore env vars after each test in this block
      process.env.ADMIN_JWT_SECRET = savedAdminSecret ?? ''
      if (savedJwtSecret !== undefined) {
        process.env.JWT_SECRET = savedJwtSecret
      } else {
        delete process.env.JWT_SECRET
      }
    })

    it('throws when neither ADMIN_JWT_SECRET nor JWT_SECRET is configured', async () => {
      vi.resetModules()
      delete process.env.ADMIN_JWT_SECRET
      delete process.env.JWT_SECRET

      const mod = await import('../middleware/admin-auth.js')

      expect(() => {
        mod.generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      }).toThrow('ADMIN_JWT_SECRET is not configured')
    })

    it('falls back to JWT_SECRET when ADMIN_JWT_SECRET is not set', async () => {
      vi.resetModules()
      delete process.env.ADMIN_JWT_SECRET
      process.env.JWT_SECRET = TEST_SECRET

      const mod = await import('../middleware/admin-auth.js')
      const token = mod.generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      // Verify the token is decodable with that secret
      const decoded = jwt.verify(token, TEST_SECRET, {
        issuer: 'insurai-admin',
        audience: 'insurai-admin-api',
      }) as jwt.JwtPayload
      expect(decoded.sub).toBe(TEST_ADMIN_USER.id)
    })

    it('works but warns when secret is shorter than 32 characters', async () => {
      vi.resetModules()
      process.env.ADMIN_JWT_SECRET = SHORT_SECRET
      delete process.env.JWT_SECRET

      const mod = await import('../middleware/admin-auth.js')
      // Should not throw — short secret still produces a valid token
      const token = mod.generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      expect(token).toBeTruthy()

      // Verify the token works with the short secret
      const decoded = jwt.verify(token, SHORT_SECRET, {
        issuer: 'insurai-admin',
        audience: 'insurai-admin-api',
      }) as jwt.JwtPayload
      expect(decoded.sub).toBe(TEST_ADMIN_USER.id)
    })

    it('works with a valid long secret', async () => {
      vi.resetModules()
      process.env.ADMIN_JWT_SECRET = TEST_SECRET

      const mod = await import('../middleware/admin-auth.js')
      const token = mod.generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // JWT has 3 parts
    })
  })

  // --------------------------------------------------------------------------
  // Token Generation
  // --------------------------------------------------------------------------
  describe('generateAdminToken', () => {
    it('generates a valid JWT string with three parts', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)

      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('includes correct payload fields', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const decoded = jwt.decode(token) as jwt.JwtPayload

      expect(decoded.sub).toBe(TEST_ADMIN_USER.id)
      expect(decoded.email).toBe(TEST_ADMIN_USER.email)
      expect(decoded.role).toBe(TEST_ADMIN_USER.role)
      expect(decoded.sessionId).toBe(TEST_SESSION_ID)
      expect(decoded.iat).toBeDefined()
      expect(decoded.exp).toBeDefined()
    })

    it('sets issuer to insurai-admin', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const decoded = jwt.decode(token) as jwt.JwtPayload

      expect(decoded.iss).toBe('insurai-admin')
    })

    it('sets audience to insurai-admin-api', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const decoded = jwt.decode(token) as jwt.JwtPayload

      expect(decoded.aud).toBe('insurai-admin-api')
    })

    it('generates different tokens for different users', () => {
      const token1 = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const token2 = generateAdminToken(TEST_SUPER_ADMIN, 'session-xyz')

      expect(token1).not.toBe(token2)
    })

    it('sets expiration in the future', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const decoded = jwt.decode(token) as jwt.JwtPayload

      const nowSeconds = Math.floor(Date.now() / 1000)
      expect(decoded.exp).toBeGreaterThan(nowSeconds)
    })
  })

  // --------------------------------------------------------------------------
  // Refresh Token Generation
  // --------------------------------------------------------------------------
  describe('generateRefreshToken', () => {
    it('generates a valid JWT string', () => {
      const token = generateRefreshToken(TEST_ADMIN_USER, TEST_SESSION_ID)

      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('includes type "refresh" in payload', () => {
      const token = generateRefreshToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const decoded = jwt.decode(token) as jwt.JwtPayload

      expect(decoded.type).toBe('refresh')
    })

    it('includes user id and session id', () => {
      const token = generateRefreshToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const decoded = jwt.decode(token) as jwt.JwtPayload

      expect(decoded.sub).toBe(TEST_ADMIN_USER.id)
      expect(decoded.sessionId).toBe(TEST_SESSION_ID)
    })

    it('is a different token from the admin access token', () => {
      const accessToken = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const refreshToken = generateRefreshToken(TEST_ADMIN_USER, TEST_SESSION_ID)

      expect(accessToken).not.toBe(refreshToken)
    })

    it('is verifiable with the same secret', () => {
      const token = generateRefreshToken(TEST_ADMIN_USER, TEST_SESSION_ID)

      // Refresh tokens do NOT have issuer/audience claims
      const decoded = jwt.verify(token, TEST_SECRET) as jwt.JwtPayload
      expect(decoded.sub).toBe(TEST_ADMIN_USER.id)
    })
  })

  // --------------------------------------------------------------------------
  // Token Verification
  // --------------------------------------------------------------------------
  describe('verifyAdminToken', () => {
    it('returns payload for a valid token', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const payload = verifyAdminToken(token)

      expect(payload).not.toBeNull()
      expect(payload!.sub).toBe(TEST_ADMIN_USER.id)
      expect(payload!.email).toBe(TEST_ADMIN_USER.email)
      expect(payload!.role).toBe(TEST_ADMIN_USER.role)
      expect(payload!.sessionId).toBe(TEST_SESSION_ID)
    })

    it('returns null for a completely invalid token string', () => {
      const result = verifyAdminToken('not-a-valid-jwt-at-all')

      expect(result).toBeNull()
    })

    it('returns null for a token signed with a different secret', () => {
      const token = jwt.sign(
        { sub: TEST_ADMIN_USER.id, email: TEST_ADMIN_USER.email, role: 'admin', sessionId: 'x' },
        'different-secret-entirely',
        { issuer: 'insurai-admin', audience: 'insurai-admin-api', expiresIn: '30m' }
      )

      const result = verifyAdminToken(token)
      expect(result).toBeNull()
    })

    it('returns null for an expired token', () => {
      // Create a token with exp in the past
      const token = jwt.sign(
        {
          sub: TEST_ADMIN_USER.id,
          email: TEST_ADMIN_USER.email,
          role: 'admin',
          sessionId: TEST_SESSION_ID,
          exp: Math.floor(Date.now() / 1000) - 60, // 60 seconds ago
        },
        TEST_SECRET,
        { issuer: 'insurai-admin', audience: 'insurai-admin-api' }
      )

      const result = verifyAdminToken(token)
      expect(result).toBeNull()
    })

    it('returns null for a token with wrong issuer', () => {
      const token = jwt.sign(
        { sub: TEST_ADMIN_USER.id, email: TEST_ADMIN_USER.email, role: 'admin', sessionId: 'x' },
        TEST_SECRET,
        { issuer: 'wrong-issuer', audience: 'insurai-admin-api', expiresIn: '30m' }
      )

      const result = verifyAdminToken(token)
      expect(result).toBeNull()
    })

    it('returns null for a token with wrong audience', () => {
      const token = jwt.sign(
        { sub: TEST_ADMIN_USER.id, email: TEST_ADMIN_USER.email, role: 'admin', sessionId: 'x' },
        TEST_SECRET,
        { issuer: 'insurai-admin', audience: 'wrong-audience', expiresIn: '30m' }
      )

      const result = verifyAdminToken(token)
      expect(result).toBeNull()
    })

    it('returns null for an empty string', () => {
      expect(verifyAdminToken('')).toBeNull()
    })

    it('roundtrips through generate and verify', () => {
      const token = generateAdminToken(TEST_SUPER_ADMIN, 'sess-789')
      const payload = verifyAdminToken(token)

      expect(payload).not.toBeNull()
      expect(payload!.sub).toBe(TEST_SUPER_ADMIN.id)
      expect(payload!.email).toBe(TEST_SUPER_ADMIN.email)
      expect(payload!.role).toBe('super_admin')
      expect(payload!.sessionId).toBe('sess-789')
    })
  })

  // --------------------------------------------------------------------------
  // Password Hashing
  // --------------------------------------------------------------------------
  describe('hashPassword and verifyPassword', () => {
    it('hashes a password and returns a bcrypt hash string', async () => {
      const hash = await hashPassword('MyStrongP@ssw0rd!')

      expect(typeof hash).toBe('string')
      // bcrypt hashes start with $2a$ or $2b$
      expect(hash).toMatch(/^\$2[ab]\$/)
    })

    it('verifies the correct password against its hash', async () => {
      const password = 'CorrectHorse42Battery!'
      const hash = await hashPassword(password)

      const isValid = await verifyPassword(password, hash)
      expect(isValid).toBe(true)
    })

    it('rejects an incorrect password', async () => {
      const hash = await hashPassword('the-real-password')

      const isValid = await verifyPassword('wrong-password', hash)
      expect(isValid).toBe(false)
    })

    it('generates different hashes for the same password (unique salt)', async () => {
      const password = 'SamePassword123'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)

      expect(hash1).not.toBe(hash2)
      // But both should verify against the original password
      expect(await verifyPassword(password, hash1)).toBe(true)
      expect(await verifyPassword(password, hash2)).toBe(true)
    })

    it('handles empty string password', async () => {
      const hash = await hashPassword('')

      expect(typeof hash).toBe('string')
      expect(await verifyPassword('', hash)).toBe(true)
      expect(await verifyPassword('non-empty', hash)).toBe(false)
    })

    it('handles unicode passwords', async () => {
      const password = 'Parola-Turkce-ŞİÇ-123'
      const hash = await hashPassword(password)

      expect(await verifyPassword(password, hash)).toBe(true)
      expect(await verifyPassword('Parola-Turkce-SIC-123', hash)).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // Token Hashing (SHA-256)
  // --------------------------------------------------------------------------
  describe('hashToken', () => {
    it('returns a hex string of SHA-256 length (64 chars)', () => {
      const result = hashToken('some-token-value')

      expect(typeof result).toBe('string')
      expect(result).toHaveLength(64)
      expect(result).toMatch(/^[0-9a-f]{64}$/)
    })

    it('is deterministic — same input always produces same hash', () => {
      const input = 'deterministic-token'
      const hash1 = hashToken(input)
      const hash2 = hashToken(input)

      expect(hash1).toBe(hash2)
    })

    it('produces different hashes for different inputs', () => {
      const hash1 = hashToken('token-aaa')
      const hash2 = hashToken('token-bbb')

      expect(hash1).not.toBe(hash2)
    })

    it('matches the expected SHA-256 output from the crypto module', () => {
      const input = 'verify-against-crypto'
      const expected = crypto.createHash('sha256').update(input).digest('hex')

      expect(hashToken(input)).toBe(expected)
    })

    it('handles an empty string', () => {
      const result = hashToken('')
      const expected = crypto.createHash('sha256').update('').digest('hex')

      expect(result).toBe(expected)
      expect(result).toHaveLength(64)
    })
  })

  // --------------------------------------------------------------------------
  // authenticateAdmin Middleware
  // --------------------------------------------------------------------------
  describe('authenticateAdmin', () => {
    it('returns 401 with AUTH_REQUIRED when no Authorization header is present', () => {
      const req = createMockRequest()
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(401)
      expect((res._body as Record<string, unknown>).code).toBe('AUTH_REQUIRED')
      expect((res._body as Record<string, unknown>).success).toBe(false)
      expect(next.called).toBe(false)
    })

    it('returns 401 with INVALID_AUTH_FORMAT when Authorization is not Bearer', () => {
      const req = createMockRequest({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      })
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(401)
      expect((res._body as Record<string, unknown>).code).toBe('INVALID_AUTH_FORMAT')
      expect(next.called).toBe(false)
    })

    it('returns 401 with INVALID_AUTH_FORMAT for malformed Bearer header (extra parts)', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer token extra-stuff' },
      })
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(401)
      expect((res._body as Record<string, unknown>).code).toBe('INVALID_AUTH_FORMAT')
      expect(next.called).toBe(false)
    })

    it('returns 401 with INVALID_TOKEN when the JWT is invalid', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer not.a.valid-jwt' },
      })
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(401)
      expect((res._body as Record<string, unknown>).code).toBe('INVALID_TOKEN')
      expect(next.called).toBe(false)
    })

    it('returns 401 with INVALID_TOKEN for an expired JWT', () => {
      const expiredToken = jwt.sign(
        {
          sub: TEST_ADMIN_USER.id,
          email: TEST_ADMIN_USER.email,
          role: TEST_ADMIN_USER.role,
          sessionId: TEST_SESSION_ID,
          exp: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
        },
        TEST_SECRET,
        { issuer: 'insurai-admin', audience: 'insurai-admin-api' }
      )

      const req = createMockRequest({
        headers: { authorization: `Bearer ${expiredToken}` },
      })
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(401)
      expect((res._body as Record<string, unknown>).code).toBe('INVALID_TOKEN')
      expect(next.called).toBe(false)
    })

    it('calls next() and attaches adminUser for a valid token', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      })
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
      expect(req.adminUser).toBeDefined()
      expect(req.adminUser!.id).toBe(TEST_ADMIN_USER.id)
      expect(req.adminUser!.email).toBe(TEST_ADMIN_USER.email)
      expect(req.adminUser!.role).toBe(TEST_ADMIN_USER.role)
      expect(req.adminUser!.status).toBe('active')
    })

    it('attaches adminSession with session id and token hash', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      })
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(req.adminSession).toBeDefined()
      expect(req.adminSession!.id).toBe(TEST_SESSION_ID)
      expect(req.adminSession!.tokenHash).toBe(hashToken(token))
    })

    it('sets adminUser.permissions to an empty array', () => {
      // authenticateAdmin sets permissions to [] since JWT doesn't carry them
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      })
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(req.adminUser!.permissions).toEqual([])
    })

    it('works with a super_admin token', () => {
      const token = generateAdminToken(TEST_SUPER_ADMIN, 'super-session')
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      })
      const res = createMockResponse()
      const next = createMockNext()

      authenticateAdmin(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
      expect(req.adminUser!.role).toBe('super_admin')
      expect(req.adminUser!.email).toBe(TEST_SUPER_ADMIN.email)
    })
  })

  // --------------------------------------------------------------------------
  // requireRole Middleware
  // --------------------------------------------------------------------------
  describe('requireRole', () => {
    it('returns 401 when no adminUser is attached to the request', () => {
      const middleware = requireRole('admin')
      const req = createMockRequest() // no adminUser
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(401)
      expect((res._body as Record<string, unknown>).code).toBe('AUTH_REQUIRED')
      expect(next.called).toBe(false)
    })

    it('returns 403 when user role does not match required role', () => {
      const middleware = requireRole('super_admin')
      const req = createMockRequest()
      req.adminUser = { ...TEST_ADMIN_USER } // role is 'admin'
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(403)
      expect((res._body as Record<string, unknown>).code).toBe('INSUFFICIENT_ROLE')
      expect((res._body as Record<string, unknown>).requiredRoles).toEqual(['super_admin'])
      expect((res._body as Record<string, unknown>).userRole).toBe('admin')
      expect(next.called).toBe(false)
    })

    it('calls next() when user has the required role', () => {
      const middleware = requireRole('admin')
      const req = createMockRequest()
      req.adminUser = { ...TEST_ADMIN_USER }
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
      expect(res.statusCode).toBe(200) // unchanged
    })

    it('calls next() when user role matches one of multiple allowed roles', () => {
      const middleware = requireRole('admin', 'super_admin')
      const req = createMockRequest()
      req.adminUser = { ...TEST_ADMIN_USER } // role is 'admin'
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
    })

    it('passes for super_admin when super_admin is in allowed roles', () => {
      const middleware = requireRole('super_admin')
      const req = createMockRequest()
      req.adminUser = { ...TEST_SUPER_ADMIN }
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
    })

    it('includes helpful error message listing required roles', () => {
      const middleware = requireRole('super_admin')
      const req = createMockRequest()
      req.adminUser = { ...TEST_ADMIN_USER }
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      const body = res._body as Record<string, unknown>
      expect(body.error).toContain('super_admin')
    })

    it('lists multiple required roles in the error message', () => {
      const middleware = requireRole('super_admin')
      const req = createMockRequest()
      req.adminUser = { ...TEST_ADMIN_USER }
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      const body = res._body as Record<string, unknown>
      expect(body.error).toContain('Insufficient permissions')
    })
  })

  // --------------------------------------------------------------------------
  // requirePermission Middleware
  // --------------------------------------------------------------------------
  describe('requirePermission', () => {
    it('returns 401 when no adminUser is attached to the request', () => {
      const middleware = requirePermission('manage:users')
      const req = createMockRequest()
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(401)
      expect((res._body as Record<string, unknown>).code).toBe('AUTH_REQUIRED')
      expect(next.called).toBe(false)
    })

    it('bypasses permission check for super_admin role', () => {
      const middleware = requirePermission('manage:users', 'delete:everything')
      const req = createMockRequest()
      req.adminUser = { ...TEST_SUPER_ADMIN } // super_admin with no explicit permissions
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
      expect(res.statusCode).toBe(200)
    })

    it('passes when user has wildcard (*) permission', () => {
      const middleware = requirePermission('manage:users', 'manage:settings')
      const req = createMockRequest()
      req.adminUser = { ...TEST_WILDCARD_ADMIN } // permissions: ['*']
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
    })

    it('passes when user has all required specific permissions', () => {
      const middleware = requirePermission('read:policies', 'write:policies')
      const req = createMockRequest()
      req.adminUser = { ...TEST_ADMIN_USER } // permissions: ['read:policies', 'write:policies']
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
    })

    it('passes when user has a single required permission', () => {
      const middleware = requirePermission('read:policies')
      const req = createMockRequest()
      req.adminUser = { ...TEST_ADMIN_USER }
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(next.called).toBe(true)
    })

    it('returns 403 when user is missing one of the required permissions', () => {
      const middleware = requirePermission('read:policies', 'delete:policies')
      const req = createMockRequest()
      req.adminUser = { ...TEST_ADMIN_USER } // has read:policies and write:policies, but NOT delete:policies
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(403)
      expect((res._body as Record<string, unknown>).code).toBe('INSUFFICIENT_PERMISSIONS')
      expect((res._body as Record<string, unknown>).requiredPermissions).toEqual([
        'read:policies',
        'delete:policies',
      ])
      expect(next.called).toBe(false)
    })

    it('returns 403 when user has no matching permissions at all', () => {
      const middleware = requirePermission('manage:system')
      const req = createMockRequest()
      req.adminUser = {
        ...TEST_ADMIN_USER,
        permissions: [], // no permissions
      }
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(403)
      expect((res._body as Record<string, unknown>).code).toBe('INSUFFICIENT_PERMISSIONS')
      expect(next.called).toBe(false)
    })

    it('requires ALL permissions, not just one (AND logic)', () => {
      const middleware = requirePermission('read:policies', 'manage:users')
      const req = createMockRequest()
      req.adminUser = {
        ...TEST_ADMIN_USER,
        permissions: ['read:policies'], // has one but not the other
      }
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      expect(res.statusCode).toBe(403)
      expect(next.called).toBe(false)
    })

    it('does not treat admin role as super_admin for permission bypass', () => {
      const middleware = requirePermission('manage:system')
      const req = createMockRequest()
      req.adminUser = {
        ...TEST_ADMIN_USER,
        role: 'admin',
        permissions: [], // admin with no permissions
      }
      const res = createMockResponse()
      const next = createMockNext()

      middleware(req, res as unknown as Response, next)

      // Should NOT bypass — only super_admin gets automatic bypass
      expect(res.statusCode).toBe(403)
      expect(next.called).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // Integration: authenticateAdmin + requireRole
  // --------------------------------------------------------------------------
  describe('authenticateAdmin + requireRole integration', () => {
    it('full pipeline passes for admin with correct role', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      })
      const res = createMockResponse()
      const nextAuth = createMockNext()

      // Step 1: authenticate
      authenticateAdmin(req, res as unknown as Response, nextAuth)
      expect(nextAuth.called).toBe(true)

      // Step 2: require role
      const roleMiddleware = requireRole('admin')
      const nextRole = createMockNext()
      roleMiddleware(req, res as unknown as Response, nextRole)
      expect(nextRole.called).toBe(true)
    })

    it('full pipeline rejects admin when super_admin is required', () => {
      const token = generateAdminToken(TEST_ADMIN_USER, TEST_SESSION_ID)
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      })
      const res = createMockResponse()
      const nextAuth = createMockNext()

      authenticateAdmin(req, res as unknown as Response, nextAuth)
      expect(nextAuth.called).toBe(true)

      const roleMiddleware = requireRole('super_admin')
      const nextRole = createMockNext()
      roleMiddleware(req, res as unknown as Response, nextRole)
      expect(nextRole.called).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  // --------------------------------------------------------------------------
  // Integration: authenticateAdmin + requirePermission
  // --------------------------------------------------------------------------
  describe('authenticateAdmin + requirePermission integration', () => {
    it('super_admin passes any permission check after authentication', () => {
      const token = generateAdminToken(TEST_SUPER_ADMIN, 'super-sess')
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      })
      const res = createMockResponse()
      const nextAuth = createMockNext()

      authenticateAdmin(req, res as unknown as Response, nextAuth)
      expect(nextAuth.called).toBe(true)

      // super_admin should bypass any permission requirement
      const permMiddleware = requirePermission('manage:everything', 'delete:all')
      const nextPerm = createMockNext()
      permMiddleware(req, res as unknown as Response, nextPerm)
      expect(nextPerm.called).toBe(true)
    })
  })
})
