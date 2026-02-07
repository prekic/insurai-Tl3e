/**
 * Admin Authentication Middleware Tests
 *
 * Comprehensive tests for JWT token generation/verification,
 * password hashing, Express middleware (authenticateAdmin, requireRole,
 * requirePermission), and refresh token generation.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Response, NextFunction } from 'express'

// ---------------------------------------------------------------------------
// Environment setup - MUST happen before importing admin-auth
// ---------------------------------------------------------------------------
const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long-for-testing'
const originalEnv = { ...process.env }

// Set env vars before any import so the module picks them up
process.env.ADMIN_JWT_SECRET = TEST_JWT_SECRET
process.env.NODE_ENV = 'test'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the logger to silence output during tests
vi.mock('../lib/logger.js', () => {
  const noopLogger: Record<string, unknown> = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  noopLogger.child = () => noopLogger
  return { default: noopLogger, logger: noopLogger }
})

// Mock Supabase so that database calls don't run.
// All mock references must be inline inside the factory (vi.mock is hoisted).
vi.mock('@supabase/supabase-js', () => {
  // Build a chain-able query object that returns { data: null, error: null }
  const makeSingle = () => vi.fn().mockResolvedValue({ data: null, error: null })
  const makeChain = (): Record<string, ReturnType<typeof vi.fn>> => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    const single = makeSingle()
    chain.single = single
    chain.gt = vi.fn().mockReturnValue({ single })
    chain.is = vi.fn().mockReturnValue({ gt: chain.gt, single })
    chain.eq = vi.fn().mockImplementation(() => chain)
    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.update = vi.fn().mockReturnValue(chain)
    return chain
  }
  const queryChain = makeChain()
  return {
    createClient: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(queryChain),
    }),
  }
})

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are registered)
// ---------------------------------------------------------------------------
import {
  generateAdminToken,
  verifyAdminToken,
  generateRefreshToken,
  hashPassword,
  verifyPassword,
  hashToken,
  authenticateAdmin,
  requireRole,
  requirePermission,
  type AdminUser,
  type AuthenticatedRequest,
} from '../middleware/admin-auth.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'admin-user-123',
    email: 'admin@test.com',
    role: 'admin',
    status: 'active',
    permissions: [],
    ...overrides,
  }
}

function createMockReq(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as AuthenticatedRequest
}

function createMockRes() {
  const res: Record<string, unknown> = { statusCode: 200 }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  return res as unknown as Response & { statusCode: number; body: Record<string, unknown> }
}

function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
beforeAll(() => {
  process.env.ADMIN_JWT_SECRET = TEST_JWT_SECRET
})

afterAll(() => {
  process.env = originalEnv
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// TESTS
// ============================================================================

// ---------- generateAdminToken / verifyAdminToken ----------

describe('generateAdminToken / verifyAdminToken', () => {
  const sessionId = 'session-abc-123'

  it('should generate a token that can be verified', () => {
    const user = makeAdminUser()
    const token = generateAdminToken(user, sessionId)

    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3) // JWT has 3 parts

    const payload = verifyAdminToken(token)
    expect(payload).not.toBeNull()
  })

  it('should include correct sub, email, role, sessionId in payload', () => {
    const user = makeAdminUser({
      id: 'user-456',
      email: 'super@test.com',
      role: 'super_admin',
    })
    const token = generateAdminToken(user, 'sess-xyz')
    const payload = verifyAdminToken(token)

    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe('user-456')
    expect(payload!.email).toBe('super@test.com')
    expect(payload!.role).toBe('super_admin')
    expect(payload!.sessionId).toBe('sess-xyz')
  })

  it('should include iat and exp in the payload', () => {
    const user = makeAdminUser()
    const token = generateAdminToken(user, sessionId)
    const payload = verifyAdminToken(token)

    expect(payload).not.toBeNull()
    expect(typeof payload!.iat).toBe('number')
    expect(typeof payload!.exp).toBe('number')
    expect(payload!.exp).toBeGreaterThan(payload!.iat)
  })

  it('should return null for a tampered token', () => {
    const user = makeAdminUser()
    const token = generateAdminToken(user, sessionId)

    // Tamper with the payload section
    const parts = token.split('.')
    parts[1] = parts[1] + 'tampered'
    const tampered = parts.join('.')

    expect(verifyAdminToken(tampered)).toBeNull()
  })

  it('should return null for a completely invalid string', () => {
    expect(verifyAdminToken('not-a-jwt')).toBeNull()
    expect(verifyAdminToken('')).toBeNull()
    expect(verifyAdminToken('a.b.c')).toBeNull()
  })

  it('should return null for a token signed with a different secret', async () => {
    // Dynamically import jsonwebtoken to sign with a different secret
    const jwt = await import('jsonwebtoken')
    const otherToken = jwt.default.sign(
      { sub: 'admin-1', email: 'a@b.com', role: 'admin', sessionId: 's-1' },
      'completely-different-secret-key-that-is-long-enough',
      { issuer: 'insurai-admin', audience: 'insurai-admin-api' }
    )

    expect(verifyAdminToken(otherToken)).toBeNull()
  })

  it('should return null for wrong issuer', async () => {
    const jwt = await import('jsonwebtoken')
    const badIssuer = jwt.default.sign(
      { sub: 'admin-1', email: 'a@b.com', role: 'admin', sessionId: 's-1' },
      TEST_JWT_SECRET,
      { issuer: 'wrong-issuer', audience: 'insurai-admin-api' }
    )

    expect(verifyAdminToken(badIssuer)).toBeNull()
  })

  it('should return null for wrong audience', async () => {
    const jwt = await import('jsonwebtoken')
    const badAudience = jwt.default.sign(
      { sub: 'admin-1', email: 'a@b.com', role: 'admin', sessionId: 's-1' },
      TEST_JWT_SECRET,
      { issuer: 'insurai-admin', audience: 'wrong-audience' }
    )

    expect(verifyAdminToken(badAudience)).toBeNull()
  })

  it('should return null for an expired token', async () => {
    const jwt = await import('jsonwebtoken')
    const expired = jwt.default.sign(
      { sub: 'admin-1', email: 'a@b.com', role: 'admin', sessionId: 's-1' },
      TEST_JWT_SECRET,
      { issuer: 'insurai-admin', audience: 'insurai-admin-api', expiresIn: '-10s' }
    )

    expect(verifyAdminToken(expired)).toBeNull()
  })

  it('should produce different tokens for different users', () => {
    const user1 = makeAdminUser({ id: 'user-1', email: 'one@test.com' })
    const user2 = makeAdminUser({ id: 'user-2', email: 'two@test.com' })

    const token1 = generateAdminToken(user1, sessionId)
    const token2 = generateAdminToken(user2, sessionId)

    expect(token1).not.toBe(token2)
  })
})

// ---------- generateRefreshToken ----------

describe('generateRefreshToken', () => {
  it('should generate a valid JWT string', () => {
    const user = makeAdminUser()
    const token = generateRefreshToken(user, 'sess-1')

    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)
  })

  it('should contain the correct sub and sessionId', async () => {
    const jwt = await import('jsonwebtoken')
    const user = makeAdminUser({ id: 'refresh-user-99' })
    const token = generateRefreshToken(user, 'sess-refresh')

    // Decode without verification (refresh tokens don't have issuer/audience)
    const decoded = jwt.default.decode(token) as Record<string, unknown>
    expect(decoded.sub).toBe('refresh-user-99')
    expect(decoded.sessionId).toBe('sess-refresh')
    expect(decoded.type).toBe('refresh')
  })

  it('should produce a different token from generateAdminToken for the same user', () => {
    const user = makeAdminUser()
    const accessToken = generateAdminToken(user, 'sess-1')
    const refreshToken = generateRefreshToken(user, 'sess-1')

    expect(accessToken).not.toBe(refreshToken)
  })
})

// ---------- hashPassword / verifyPassword ----------

describe('hashPassword / verifyPassword', () => {
  it('should hash and verify a correct password', async () => {
    const password = 'SuperSecure123!'
    const hash = await hashPassword(password)

    expect(typeof hash).toBe('string')
    expect(hash).not.toBe(password) // hash should differ from plaintext
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true)

    const isValid = await verifyPassword(password, hash)
    expect(isValid).toBe(true)
  })

  it('should reject a wrong password', async () => {
    const hash = await hashPassword('correctPassword')
    const isValid = await verifyPassword('wrongPassword', hash)
    expect(isValid).toBe(false)
  })

  it('should produce different hashes for the same password (salt)', async () => {
    const password = 'samePassword'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)

    expect(hash1).not.toBe(hash2)

    // But both should still verify
    expect(await verifyPassword(password, hash1)).toBe(true)
    expect(await verifyPassword(password, hash2)).toBe(true)
  })

  it('should handle empty string password', async () => {
    const hash = await hashPassword('')
    expect(typeof hash).toBe('string')
    expect(await verifyPassword('', hash)).toBe(true)
    expect(await verifyPassword('notempty', hash)).toBe(false)
  })

  it('should handle unicode passwords', async () => {
    const password = 'Türkçe$ifre123'
    const hash = await hashPassword(password)
    expect(await verifyPassword(password, hash)).toBe(true)
    expect(await verifyPassword('Turkce$ifre123', hash)).toBe(false)
  })
})

// ---------- hashToken ----------

describe('hashToken', () => {
  it('should return a hex string', () => {
    const result = hashToken('test-token')
    expect(typeof result).toBe('string')
    expect(result).toMatch(/^[0-9a-f]+$/)
  })

  it('should return consistent output for the same input', () => {
    const a = hashToken('same-input')
    const b = hashToken('same-input')
    expect(a).toBe(b)
  })

  it('should return different output for different inputs', () => {
    const a = hashToken('token-alpha')
    const b = hashToken('token-beta')
    expect(a).not.toBe(b)
  })

  it('should return a 64-character SHA-256 hex digest', () => {
    const result = hashToken('any-token')
    expect(result).toHaveLength(64)
  })

  it('should handle empty string', () => {
    const result = hashToken('')
    expect(typeof result).toBe('string')
    expect(result).toHaveLength(64)
  })
})

// ---------- authenticateAdmin middleware ----------

describe('authenticateAdmin', () => {
  it('should return 401 AUTH_REQUIRED when no Authorization header', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()

    authenticateAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'AUTH_REQUIRED',
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 INVALID_AUTH_FORMAT for non-Bearer scheme', () => {
    const req = createMockReq({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    })
    const res = createMockRes()
    const next = createMockNext()

    authenticateAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_AUTH_FORMAT' })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 INVALID_AUTH_FORMAT for malformed Bearer header', () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer' }, // no space-separated token
    })
    const res = createMockRes()
    const next = createMockNext()

    authenticateAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_AUTH_FORMAT' })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 INVALID_AUTH_FORMAT for Bearer with extra segments', () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer token extra' },
    })
    const res = createMockRes()
    const next = createMockNext()

    authenticateAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_AUTH_FORMAT' })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 INVALID_TOKEN for an expired token', async () => {
    const jwt = await import('jsonwebtoken')
    const expired = jwt.default.sign(
      { sub: 'admin-1', email: 'a@b.com', role: 'admin', sessionId: 's-1' },
      TEST_JWT_SECRET,
      { issuer: 'insurai-admin', audience: 'insurai-admin-api', expiresIn: '-10s' }
    )

    const req = createMockReq({
      headers: { authorization: `Bearer ${expired}` },
    })
    const res = createMockRes()
    const next = createMockNext()

    authenticateAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN' })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 INVALID_TOKEN for a random invalid token', () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer some.invalid.token' },
    })
    const res = createMockRes()
    const next = createMockNext()

    authenticateAdmin(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN' })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should call next() and populate req.adminUser for a valid token', () => {
    const user = makeAdminUser({
      id: 'admin-mid-test',
      email: 'middleware@test.com',
      role: 'super_admin',
    })
    const token = generateAdminToken(user, 'sess-mid')

    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` },
    })
    const res = createMockRes()
    const next = createMockNext()

    authenticateAdmin(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect((req as AuthenticatedRequest).adminUser).toEqual({
      id: 'admin-mid-test',
      email: 'middleware@test.com',
      role: 'super_admin',
      status: 'active',
      permissions: [],
    })
  })

  it('should populate req.adminSession with session id and tokenHash', () => {
    const user = makeAdminUser()
    const sessionId = 'sess-hash-check'
    const token = generateAdminToken(user, sessionId)

    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` },
    })
    const res = createMockRes()
    const next = createMockNext()

    authenticateAdmin(req, res, next)

    const session = (req as AuthenticatedRequest).adminSession
    expect(session).toBeDefined()
    expect(session!.id).toBe(sessionId)
    expect(session!.tokenHash).toBe(hashToken(token))
  })
})

// ---------- requireRole ----------

describe('requireRole', () => {
  it('should return 401 when req.adminUser is not set', () => {
    const middleware = requireRole('admin')
    const req = createMockReq() // no adminUser
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 403 INSUFFICIENT_ROLE when user has wrong role', () => {
    const middleware = requireRole('super_admin')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'admin' }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: ['super_admin'],
        userRole: 'admin',
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should call next() when user has the required role', () => {
    const middleware = requireRole('admin')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'admin' }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('should call next() when user has one of multiple allowed roles', () => {
    const middleware = requireRole('admin', 'super_admin')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'super_admin' }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should reject when role matches none of multiple allowed roles', () => {
    const middleware = requireRole('super_admin')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'admin' }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('should not grant super_admin access when only admin is required (strict role match)', () => {
    // requireRole checks exact membership in the allowedRoles array
    // super_admin does NOT automatically bypass requireRole — it must be listed
    const middleware = requireRole('admin')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'super_admin' }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    // super_admin is NOT in ['admin'], so it should be rejected
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('should allow super_admin when explicitly included in allowed roles', () => {
    const middleware = requireRole('admin', 'super_admin')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'super_admin' }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })
})

// ---------- requirePermission ----------

describe('requirePermission', () => {
  it('should return 401 when req.adminUser is not set', () => {
    const middleware = requirePermission('manage_users')
    const req = createMockReq()
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should call next() for super_admin regardless of permissions', () => {
    const middleware = requirePermission('manage_users', 'delete_everything')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'super_admin', permissions: [] }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('should call next() when user has wildcard (*) permission', () => {
    const middleware = requirePermission('manage_users')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'admin', permissions: ['*'] }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should return 403 when admin lacks required permission', () => {
    const middleware = requirePermission('manage_users')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'admin', permissions: ['view_logs'] }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredPermissions: ['manage_users'],
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('should call next() when admin has all required permissions', () => {
    const middleware = requirePermission('manage_users', 'manage_prompts')
    const req = createMockReq({
      adminUser: makeAdminUser({
        role: 'admin',
        permissions: ['manage_users', 'manage_prompts', 'view_logs'],
      }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should return 403 when admin has only some of the required permissions', () => {
    const middleware = requirePermission('manage_users', 'manage_prompts')
    const req = createMockReq({
      adminUser: makeAdminUser({
        role: 'admin',
        permissions: ['manage_users'], // missing manage_prompts
      }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('should call next() when no permissions are required (empty list)', () => {
    const middleware = requirePermission()
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'admin', permissions: [] }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should handle admin with empty permissions array correctly', () => {
    const middleware = requirePermission('some_permission')
    const req = createMockReq({
      adminUser: makeAdminUser({ role: 'admin', permissions: [] }),
    })
    const res = createMockRes()
    const next = createMockNext()

    middleware(req as AuthenticatedRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})

// ---------- getJWTSecret edge cases ----------

describe('getJWTSecret configuration', () => {
  it('should throw when ADMIN_JWT_SECRET is not set', async () => {
    // We need to re-import the module with the env var unset.
    // Use vi.resetModules and dynamic import.
    vi.resetModules()

    const savedSecret = process.env.ADMIN_JWT_SECRET
    const savedJwtSecret = process.env.JWT_SECRET
    delete process.env.ADMIN_JWT_SECRET
    delete process.env.JWT_SECRET

    // Re-mock dependencies since we reset modules
    vi.doMock('../lib/logger.js', () => {
      const noopLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => noopLogger,
      }
      return { default: noopLogger, logger: noopLogger }
    })

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ eq: vi.fn(), single: vi.fn() }),
          insert: vi.fn(),
          update: vi.fn(),
        }),
      }),
    }))

    const mod = await import('../middleware/admin-auth.js')

    // generateAdminToken calls getJWTSecretCached -> getJWTSecret which should throw
    expect(() =>
      mod.generateAdminToken(makeAdminUser(), 'sess-1')
    ).toThrow('ADMIN_JWT_SECRET is not configured')

    // Restore
    process.env.ADMIN_JWT_SECRET = savedSecret
    if (savedJwtSecret) process.env.JWT_SECRET = savedJwtSecret
    vi.resetModules()
  })
})

// ---------- Integration: authenticateAdmin + requireRole chain ----------

describe('authenticateAdmin + requireRole integration', () => {
  it('should pass through the full middleware chain for a valid admin user', () => {
    const user = makeAdminUser({ role: 'admin' })
    const token = generateAdminToken(user, 'sess-int')

    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` },
    })
    const res = createMockRes()
    const next1 = createMockNext()

    // Step 1: authenticateAdmin
    authenticateAdmin(req as AuthenticatedRequest, res, next1)
    expect(next1).toHaveBeenCalledTimes(1)

    // Step 2: requireRole
    const roleMiddleware = requireRole('admin')
    const next2 = createMockNext()
    roleMiddleware(req as AuthenticatedRequest, res, next2)
    expect(next2).toHaveBeenCalledTimes(1)
  })

  it('should block at requireRole if the token role does not match', () => {
    const user = makeAdminUser({ role: 'admin' })
    const token = generateAdminToken(user, 'sess-int2')

    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` },
    })
    const res = createMockRes()
    const next1 = createMockNext()

    // Step 1: authenticateAdmin passes
    authenticateAdmin(req as AuthenticatedRequest, res, next1)
    expect(next1).toHaveBeenCalledTimes(1)

    // Step 2: requireRole('super_admin') blocks
    const roleMiddleware = requireRole('super_admin')
    const res2 = createMockRes()
    const next2 = createMockNext()
    roleMiddleware(req as AuthenticatedRequest, res2, next2)

    expect(res2.status).toHaveBeenCalledWith(403)
    expect(next2).not.toHaveBeenCalled()
  })
})

// ---------- Integration: authenticateAdmin + requirePermission chain ----------

describe('authenticateAdmin + requirePermission integration', () => {
  it('should pass when super_admin requests permission-gated resource', () => {
    const user = makeAdminUser({ role: 'super_admin' })
    const token = generateAdminToken(user, 'sess-perm')

    const req = createMockReq({
      headers: { authorization: `Bearer ${token}` },
    })
    const res = createMockRes()
    const next1 = createMockNext()

    authenticateAdmin(req as AuthenticatedRequest, res, next1)
    expect(next1).toHaveBeenCalledTimes(1)

    const permMiddleware = requirePermission('manage_users', 'manage_prompts')
    const next2 = createMockNext()
    permMiddleware(req as AuthenticatedRequest, res, next2)
    expect(next2).toHaveBeenCalledTimes(1)
  })
})
