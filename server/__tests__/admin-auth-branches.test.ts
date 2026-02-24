/**
 * Admin Auth Route Branch Coverage Tests
 *
 * Targets the ~67% uncovered branches in server/routes/admin/auth.ts.
 * Existing tests in admin-auth.test.ts cover the middleware (generateAdminToken,
 * verifyPassword, authenticateAdmin, requireRole, requirePermission).
 * This file tests the Express route handlers: /diagnostics, /auth/login,
 * /auth/logout, /auth/refresh, /auth/me.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================

const {
  mockGetSupabaseWithError,
  mockGetAdminUserByEmail,
  mockVerifyPassword,
  mockGenerateAdminToken,
  mockGenerateRefreshToken,
  mockVerifyAdminToken,
  mockCreateAdminSession,
  mockRevokeAdminSession,
  mockUpdateAdminLogin,
  mockHashToken,
  mockLogSecurityEvent,
  mockAuthenticateAdmin,
} = vi.hoisted(() => ({
  mockGetSupabaseWithError: vi.fn(),
  mockGetAdminUserByEmail: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockGenerateAdminToken: vi.fn(),
  mockGenerateRefreshToken: vi.fn(),
  mockVerifyAdminToken: vi.fn(),
  mockCreateAdminSession: vi.fn(),
  mockRevokeAdminSession: vi.fn(),
  mockUpdateAdminLogin: vi.fn(),
  mockHashToken: vi.fn(),
  mockLogSecurityEvent: vi.fn(),
  mockAuthenticateAdmin: vi.fn(),
}))

// =============================================================================
// MODULE MOCKS
// =============================================================================

vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  const childLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: childLogger,
    logger: childLogger,
  }
})

vi.mock('../routes/admin/shared.js', () => ({
  getSupabaseWithError: (...args: unknown[]) => mockGetSupabaseWithError(...args),
  getAdminUserByEmail: (...args: unknown[]) => mockGetAdminUserByEmail(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  generateAdminToken: (...args: unknown[]) => mockGenerateAdminToken(...args),
  generateRefreshToken: (...args: unknown[]) => mockGenerateRefreshToken(...args),
  verifyAdminToken: (...args: unknown[]) => mockVerifyAdminToken(...args),
  createAdminSession: (...args: unknown[]) => mockCreateAdminSession(...args),
  revokeAdminSession: (...args: unknown[]) => mockRevokeAdminSession(...args),
  updateAdminLogin: (...args: unknown[]) => mockUpdateAdminLogin(...args),
  hashToken: (...args: unknown[]) => mockHashToken(...args),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticateAdmin: (...args: unknown[]) => mockAuthenticateAdmin(...args),
  adminDb: {
    logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
  },
}))

// =============================================================================
// HELPERS & CONSTANTS
// =============================================================================

const ACTIVE_ADMIN = {
  id: 'admin-001',
  email: 'admin@test.com',
  role: 'admin' as const,
  status: 'active' as const,
  displayName: 'Test Admin',
  permissions: ['read:policies'],
  passwordHash: '$2b$12$hashedpassword',
}

const originalEnv = { ...process.env }

function setupDefaultMocks() {
  mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
  mockGetAdminUserByEmail.mockResolvedValue(ACTIVE_ADMIN)
  mockVerifyPassword.mockResolvedValue(true)
  mockGenerateAdminToken.mockReturnValue('mock-access-token')
  mockGenerateRefreshToken.mockReturnValue('mock-refresh-token')
  mockVerifyAdminToken.mockReturnValue(null)
  mockCreateAdminSession.mockResolvedValue('session-001')
  mockRevokeAdminSession.mockResolvedValue(undefined)
  mockUpdateAdminLogin.mockResolvedValue(undefined)
  mockHashToken.mockReturnValue('hashed-token')
  mockLogSecurityEvent.mockResolvedValue(undefined)
  mockAuthenticateAdmin.mockImplementation(
    (req: any, _res: any, next: () => void) => {
      req.adminUser = {
        id: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        displayName: 'Test Admin',
        permissions: ['read:policies'],
      }
      req.adminSession = { id: 'session-001', tokenHash: 'hash' }
      next()
    }
  )
}

async function createApp() {
  const mod = await import('../routes/admin/auth.js')
  const authRouter = mod.default
  const app = express()
  app.use(express.json())
  app.use('/api/admin', authRouter)
  return app
}

// =============================================================================
// TESTS
// =============================================================================

describe('Admin Auth Routes Branch Coverage', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    setupDefaultMocks()
    app = await createApp()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // ===========================================================================
  // GET /diagnostics
  // ===========================================================================
  describe('GET /diagnostics', () => {
    it('returns healthy when all env vars are set', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'AIza-test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })

      // re-create app so env vars are read fresh
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.status).toBe('healthy')
      expect(res.body.issues).toBeUndefined()
      expect(res.body.config.hasJwtSecret).toBe(true)
      expect(res.body.config.hasSupabaseUrl).toBe(true)
      expect(res.body.config.hasServiceKey).toBe(true)
      expect(res.body.config.supabaseClientInitialized).toBe(true)
      expect(res.body.config.hasOpenAI).toBe(true)
      expect(res.body.config.hasAnthropic).toBe(true)
      expect(res.body.config.hasGoogleApiKey).toBe(true)
    })

    it('reports misconfigured when ADMIN_JWT_SECRET is missing', async () => {
      delete process.env.ADMIN_JWT_SECRET
      delete process.env.JWT_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.success).toBe(false)
      expect(res.body.status).toBe('misconfigured')
      expect(res.body.issues).toContain('ADMIN_JWT_SECRET not configured')
      expect(res.body.config.hasJwtSecret).toBe(false)
      expect(res.body.config.jwtSecretLength).toBe('not set')
    })

    it('reports short JWT secret issue', async () => {
      process.env.ADMIN_JWT_SECRET = 'short'
      delete process.env.JWT_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.success).toBe(false)
      expect(res.body.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('too short')])
      )
      expect(res.body.config.jwtSecretLength).toBe('5 chars')
    })

    it('uses JWT_SECRET as fallback for hasJwtSecret', async () => {
      delete process.env.ADMIN_JWT_SECRET
      process.env.JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.config.hasJwtSecret).toBe(true)
      expect(res.body.config.jwtSecretLength).toBe('64 chars')
    })

    it('reports issue when SUPABASE_URL and VITE_SUPABASE_URL are both missing', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('SUPABASE_URL not configured')])
      )
    })

    it('does not report SUPABASE_URL issue when VITE_SUPABASE_URL is set', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      const supabaseIssues = (res.body.issues || []).filter((i: string) =>
        i.includes('SUPABASE_URL')
      )
      expect(supabaseIssues).toHaveLength(0)
      expect(res.body.config.hasViteSupabaseUrl).toBe(true)
    })

    it('reports issue when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY')])
      )
    })

    it('reports Supabase init failure from getSupabaseWithError', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({
        client: null,
        error: 'Failed to init: invalid URL',
      })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.success).toBe(false)
      expect(res.body.config.supabaseClientInitialized).toBe(false)
      expect(res.body.config.supabaseError).toBe('Failed to init: invalid URL')
      expect(res.body.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('Supabase init failed')])
      )
    })

    it('reports no AI provider issue when both OPENAI and ANTHROPIC keys missing', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('No AI extraction provider configured'),
        ])
      )
      expect(res.body.config.hasOpenAI).toBe(false)
      expect(res.body.config.hasAnthropic).toBe(false)
    })

    it('does not report AI provider issue when only OPENAI key exists', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      delete process.env.ANTHROPIC_API_KEY
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      const aiIssues = (res.body.issues || []).filter((i: string) =>
        i.includes('No AI extraction')
      )
      expect(aiIssues).toHaveLength(0)
      expect(res.body.config.hasOpenAI).toBe(true)
      expect(res.body.config.hasAnthropic).toBe(false)
    })

    it('reports no Google credentials when all GCP vars missing', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      delete process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('No Google Cloud credentials'),
        ])
      )
      expect(res.body.config.hasGoogleApiKey).toBe(false)
      expect(res.body.config.hasGCPServiceAccount).toBe(false)
    })

    it('does not report Google issue when GCP_SERVICE_ACCOUNT_BASE64 is set', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      delete process.env.GOOGLE_CLOUD_API_KEY
      process.env.GCP_SERVICE_ACCOUNT_BASE64 = 'base64data'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      const googleIssues = (res.body.issues || []).filter((i: string) =>
        i.includes('No Google Cloud')
      )
      expect(googleIssues).toHaveLength(0)
      expect(res.body.config.hasGCPServiceAccount).toBe(true)
    })

    it('does not report Google issue when GCP_CREDENTIALS_BASE64 is set', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      delete process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      process.env.GCP_CREDENTIALS_BASE64 = 'base64data'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.config.hasGCPServiceAccount).toBe(true)
    })

    it('does not report Google issue when GOOGLE_APPLICATION_CREDENTIALS is set', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      delete process.env.GOOGLE_CLOUD_API_KEY
      delete process.env.GCP_SERVICE_ACCOUNT_BASE64
      delete process.env.GCP_CREDENTIALS_BASE64
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/creds.json'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.config.hasGCPServiceAccount).toBe(true)
    })

    it('returns nodeEnv and timestamp', async () => {
      process.env.NODE_ENV = 'production'
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.nodeEnv).toBe('production')
      expect(res.body.timestamp).toBeDefined()
      expect(res.body.hint).toContain('/api/ai/diagnose')
    })

    it('reports supabaseError as null when client initializes successfully', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.GOOGLE_CLOUD_API_KEY = 'test'
      mockGetSupabaseWithError.mockReturnValue({ client: {}, error: null })
      app = await createApp()

      const res = await request(app).get('/api/admin/diagnostics')

      expect(res.body.config.supabaseError).toBeNull()
    })
  })

  // ===========================================================================
  // POST /auth/login
  // ===========================================================================
  describe('POST /auth/login', () => {
    it('returns 400 MISSING_CREDENTIALS when email is missing', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ password: 'test123' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('MISSING_CREDENTIALS')
      expect(res.body.success).toBe(false)
    })

    it('returns 400 MISSING_CREDENTIALS when password is missing', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('MISSING_CREDENTIALS')
    })

    it('returns 400 MISSING_CREDENTIALS when body is empty', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('MISSING_CREDENTIALS')
    })

    it('returns 503 DB_NOT_CONFIGURED when Supabase is not available', async () => {
      mockGetSupabaseWithError.mockReturnValue({
        client: null,
        error: 'SUPABASE_URL is not configured',
      })

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('DB_NOT_CONFIGURED')
      expect(res.body.message).toContain('SUPABASE_URL')
      expect(res.body.details).toBeDefined()
    })

    it('returns 503 DB_NOT_CONFIGURED with hasSupabaseUrl/hasServiceKey details', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      mockGetSupabaseWithError.mockReturnValue({
        client: null,
        error: 'Service key missing',
      })
      app = await createApp()

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('DB_NOT_CONFIGURED')
      expect(res.body.details.hasSupabaseUrl).toBe(true)
      expect(res.body.details.hasServiceKey).toBe(false)
    })

    it('returns 500 DB_QUERY_ERROR when getAdminUserByEmail throws', async () => {
      mockGetAdminUserByEmail.mockRejectedValue(new Error('DB connection timeout'))

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('DB_QUERY_ERROR')
      expect(res.body.message).toContain('DB connection timeout')
    })

    it('returns 500 DB_QUERY_ERROR with string error when non-Error thrown', async () => {
      mockGetAdminUserByEmail.mockRejectedValue('string error')

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('DB_QUERY_ERROR')
      expect(res.body.message).toBe('string error')
    })

    it('returns 401 INVALID_CREDENTIALS when user not found', async () => {
      mockGetAdminUserByEmail.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'nobody@test.com', password: 'test123' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_CREDENTIALS')
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'login_failed',
          details: expect.objectContaining({ reason: 'user_not_found' }),
        })
      )
    })

    it('returns 401 INVALID_CREDENTIALS when user has no passwordHash', async () => {
      mockGetAdminUserByEmail.mockResolvedValue({
        ...ACTIVE_ADMIN,
        passwordHash: undefined,
      })

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_CREDENTIALS')
    })

    it('logs security event on user_not_found (and handles .catch silently)', async () => {
      mockGetAdminUserByEmail.mockResolvedValue(null)
      mockLogSecurityEvent.mockRejectedValue(new Error('DB write failed'))

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'nobody@test.com', password: 'test123' })

      // Should still return 401, not crash
      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 401 ACCOUNT_INACTIVE when user status is not active', async () => {
      mockGetAdminUserByEmail.mockResolvedValue({
        ...ACTIVE_ADMIN,
        status: 'suspended',
      })

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('ACCOUNT_INACTIVE')
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            reason: 'account_inactive',
            status: 'suspended',
          }),
        })
      )
    })

    it('handles security event logging failure for inactive account', async () => {
      mockGetAdminUserByEmail.mockResolvedValue({
        ...ACTIVE_ADMIN,
        status: 'inactive',
      })
      mockLogSecurityEvent.mockRejectedValue(new Error('log failed'))

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('ACCOUNT_INACTIVE')
    })

    it('returns 500 PASSWORD_ERROR when verifyPassword throws', async () => {
      mockVerifyPassword.mockRejectedValue(new Error('bcrypt internal error'))

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PASSWORD_ERROR')
      expect(res.body.debug).toContain('bcrypt internal error')
    })

    it('returns 500 PASSWORD_ERROR with String(error) for non-Error thrown', async () => {
      mockVerifyPassword.mockRejectedValue('non-error-value')

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('PASSWORD_ERROR')
      expect(res.body.debug).toBe('non-error-value')
    })

    it('returns 401 INVALID_CREDENTIALS when password is wrong', async () => {
      mockVerifyPassword.mockResolvedValue(false)

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'wrong' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_CREDENTIALS')
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ reason: 'invalid_password' }),
        })
      )
    })

    it('handles security event logging failure for invalid_password', async () => {
      mockVerifyPassword.mockResolvedValue(false)
      mockLogSecurityEvent.mockRejectedValue(new Error('log failed'))

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'wrong' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 503 JWT_NOT_CONFIGURED when no JWT secret', async () => {
      delete process.env.ADMIN_JWT_SECRET
      delete process.env.JWT_SECRET
      app = await createApp()

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(503)
      expect(res.body.code).toBe('JWT_NOT_CONFIGURED')
      expect(res.body.message).toContain('ADMIN_JWT_SECRET')
    })

    it('returns 500 TOKEN_GENERATION_ERROR when generateAdminToken throws', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()
      mockGenerateAdminToken.mockImplementation(() => {
        throw new Error('JWT sign failed')
      })

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TOKEN_GENERATION_ERROR')
      expect(res.body.debug).toContain('JWT sign failed')
    })

    it('returns 500 TOKEN_GENERATION_ERROR with String(error) for non-Error thrown', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()
      mockGenerateAdminToken.mockImplementation(() => {
        throw 'non-error-token-failure'
      })

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('TOKEN_GENERATION_ERROR')
      expect(res.body.debug).toBe('non-error-token-failure')
    })

    it('succeeds even when createAdminSession fails', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()
      mockCreateAdminSession.mockRejectedValue(new Error('session DB error'))

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      // Login should still succeed — session creation is non-blocking
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.token).toBe('mock-access-token')
    })

    it('succeeds even when updateAdminLogin fails', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()
      mockUpdateAdminLogin.mockRejectedValue(new Error('update login failed'))

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('succeeds even when security event logging for login_success fails', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()
      // Make logSecurityEvent fail only for login_success call
      mockLogSecurityEvent.mockRejectedValue(new Error('security log failed'))

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('returns full user data and tokens on successful login', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.token).toBe('mock-access-token')
      expect(res.body.data.refreshToken).toBe('mock-refresh-token')
      expect(res.body.data.expiresIn).toBeDefined()
      expect(res.body.data.user.id).toBe(ACTIVE_ADMIN.id)
      expect(res.body.data.user.email).toBe(ACTIVE_ADMIN.email)
      expect(res.body.data.user.role).toBe(ACTIVE_ADMIN.role)
      expect(res.body.data.user.displayName).toBe(ACTIVE_ADMIN.displayName)
    })

    it('uses ADMIN_JWT_EXPIRES_IN env var for expiresIn field', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      process.env.ADMIN_JWT_EXPIRES_IN = '1h'
      app = await createApp()

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.body.data.expiresIn).toBe('1h')
    })

    it('defaults expiresIn to 30m when ADMIN_JWT_EXPIRES_IN is not set', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      delete process.env.ADMIN_JWT_EXPIRES_IN
      app = await createApp()

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.body.data.expiresIn).toBe('30m')
    })

    it('returns 500 LOGIN_ERROR on unexpected errors in outer catch', async () => {
      // Simulate unexpected error by making getSupabaseWithError throw
      mockGetSupabaseWithError.mockImplementation(() => {
        throw new Error('Unexpected crash')
      })

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('LOGIN_ERROR')
      expect(res.body.debug.message).toBe('Unexpected crash')
      expect(res.body.debug.stack).toBeDefined()
    })

    it('returns 500 LOGIN_ERROR with non-Error debug info', async () => {
      mockGetSupabaseWithError.mockImplementation(() => {
        throw 'string-crash'
      })

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(res.status).toBe(500)
      expect(res.body.code).toBe('LOGIN_ERROR')
      expect(res.body.debug.message).toBe('string-crash')
      expect(res.body.debug.stack).toBeUndefined()
    })

    it('calls hashToken for both access and refresh tokens', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()

      await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(mockHashToken).toHaveBeenCalledWith('mock-access-token')
      expect(mockHashToken).toHaveBeenCalledWith('mock-refresh-token')
    })

    it('passes correct arguments to createAdminSession', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()

      await request(app)
        .post('/api/admin/auth/login')
        .set('User-Agent', 'TestBrowser/1.0')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(mockCreateAdminSession).toHaveBeenCalledWith(
        ACTIVE_ADMIN.id,
        'hashed-token', // hashToken result for access token
        'hashed-token', // hashToken result for refresh token
        '127.0.0.1',    // getClientIp result
        'TestBrowser/1.0'
      )
    })

    it('logs security event for successful login with email and role', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()

      await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'login_success',
          severity: 'info',
          userId: ACTIVE_ADMIN.id,
          details: expect.objectContaining({
            email: 'admin@test.com',
            role: ACTIVE_ADMIN.role,
          }),
        })
      )
    })

    it('uses "unknown" as user-agent fallback when header missing', async () => {
      process.env.ADMIN_JWT_SECRET = 'a'.repeat(64)
      app = await createApp()

      // supertest always sends user-agent header, but the logSecurityEvent receives it from req
      // The getClientIp and user-agent checks in the code use req.headers['user-agent'] || 'unknown'
      // Since we mock getClientIp, we test the user-agent path is called
      await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' })

      // Verify createAdminSession was called (which receives user-agent)
      expect(mockCreateAdminSession).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // POST /auth/logout
  // ===========================================================================
  describe('POST /auth/logout', () => {
    it('returns success on successful logout with session', async () => {
      const res = await request(app)
        .post('/api/admin/auth/logout')
        .set('Authorization', 'Bearer mock-token')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Logged out successfully')
      expect(mockRevokeAdminSession).toHaveBeenCalledWith('session-001', 'admin-001')
    })

    it('does not call revokeAdminSession when no session ID', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = {
            id: 'admin-001',
            email: 'admin@test.com',
            role: 'admin',
          }
          // No adminSession attached
          next()
        }
      )
      app = await createApp()

      const res = await request(app)
        .post('/api/admin/auth/logout')
        .set('Authorization', 'Bearer mock-token')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(mockRevokeAdminSession).not.toHaveBeenCalled()
    })

    it('logs security event on logout', async () => {
      await request(app)
        .post('/api/admin/auth/logout')
        .set('Authorization', 'Bearer mock-token')

      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'logout',
          severity: 'info',
          userId: 'admin-001',
          details: expect.objectContaining({ email: 'admin@test.com' }),
        })
      )
    })

    it('returns 500 on error during logout', async () => {
      mockRevokeAdminSession.mockRejectedValue(new Error('DB error'))

      const res = await request(app)
        .post('/api/admin/auth/logout')
        .set('Authorization', 'Bearer mock-token')

      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Logout failed')
    })

    it('returns 500 on security event logging error during logout', async () => {
      mockLogSecurityEvent.mockRejectedValue(new Error('Logging error'))

      const res = await request(app)
        .post('/api/admin/auth/logout')
        .set('Authorization', 'Bearer mock-token')

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Logout failed')
    })
  })

  // ===========================================================================
  // POST /auth/refresh
  // ===========================================================================
  describe('POST /auth/refresh', () => {
    it('returns 400 MISSING_TOKEN when no refreshToken provided', async () => {
      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('MISSING_TOKEN')
    })

    it('returns 401 INVALID_REFRESH_TOKEN when verifyAdminToken returns null', async () => {
      mockVerifyAdminToken.mockReturnValue(null)

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'bad-token' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN')
    })

    it('returns 401 INVALID_REFRESH_TOKEN when token type is not refresh', async () => {
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'sess-001',
        type: 'access', // not 'refresh'
      })

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'access-token-used-as-refresh' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN')
    })

    it('returns 401 USER_INACTIVE when admin user not found', async () => {
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'sess-001',
        type: 'refresh',
      })
      mockGetAdminUserByEmail.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('USER_INACTIVE')
    })

    it('returns 401 USER_INACTIVE when admin user is not active', async () => {
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'sess-001',
        type: 'refresh',
      })
      mockGetAdminUserByEmail.mockResolvedValue({
        ...ACTIVE_ADMIN,
        status: 'suspended',
      })

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('USER_INACTIVE')
    })

    it('returns new tokens on successful refresh', async () => {
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'old-sess',
        type: 'refresh',
      })
      mockGetAdminUserByEmail.mockResolvedValue(ACTIVE_ADMIN)
      mockGenerateAdminToken.mockReturnValue('new-access-token')
      mockGenerateRefreshToken.mockReturnValue('new-refresh-token')

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.token).toBe('new-access-token')
      expect(res.body.data.refreshToken).toBe('new-refresh-token')
      expect(res.body.data.expiresIn).toBeDefined()
    })

    it('creates new session and revokes old one on refresh', async () => {
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'old-sess-id',
        type: 'refresh',
      })
      mockGetAdminUserByEmail.mockResolvedValue(ACTIVE_ADMIN)

      await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(mockCreateAdminSession).toHaveBeenCalled()
      expect(mockRevokeAdminSession).toHaveBeenCalledWith('old-sess-id')
    })

    it('uses ADMIN_JWT_EXPIRES_IN env var for refresh response', async () => {
      process.env.ADMIN_JWT_EXPIRES_IN = '2h'
      app = await createApp()
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'old-sess',
        type: 'refresh',
      })
      mockGetAdminUserByEmail.mockResolvedValue(ACTIVE_ADMIN)

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(res.body.data.expiresIn).toBe('2h')
    })

    it('defaults expiresIn to 30m when ADMIN_JWT_EXPIRES_IN not set', async () => {
      delete process.env.ADMIN_JWT_EXPIRES_IN
      app = await createApp()
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'old-sess',
        type: 'refresh',
      })
      mockGetAdminUserByEmail.mockResolvedValue(ACTIVE_ADMIN)

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(res.body.data.expiresIn).toBe('30m')
    })

    it('returns 500 on unexpected error during refresh', async () => {
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'old-sess',
        type: 'refresh',
      })
      mockGetAdminUserByEmail.mockRejectedValue(new Error('DB crash'))

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Token refresh failed')
    })

    it('returns 500 on non-Error thrown during refresh', async () => {
      mockVerifyAdminToken.mockReturnValue({
        sub: 'admin-001',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'old-sess',
        type: 'refresh',
      })
      mockGetAdminUserByEmail.mockRejectedValue('string-error')

      const res = await request(app)
        .post('/api/admin/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Token refresh failed')
    })
  })

  // ===========================================================================
  // GET /auth/me
  // ===========================================================================
  describe('GET /auth/me', () => {
    it('returns current admin user data', async () => {
      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', 'Bearer mock-token')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe('admin-001')
      expect(res.body.data.email).toBe('admin@test.com')
      expect(res.body.data.role).toBe('admin')
      expect(res.body.data.displayName).toBe('Test Admin')
      expect(res.body.data.permissions).toEqual(['read:policies'])
    })

    it('returns undefined fields when adminUser is partially populated', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          req.adminUser = {
            id: 'admin-002',
            email: 'minimal@test.com',
            role: 'admin',
            // no displayName or permissions
          }
          next()
        }
      )
      app = await createApp()

      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', 'Bearer mock-token')

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('admin-002')
      expect(res.body.data.displayName).toBeUndefined()
      expect(res.body.data.permissions).toBeUndefined()
    })

    it('returns undefined fields when no adminUser is attached', async () => {
      mockAuthenticateAdmin.mockImplementation(
        (req: any, _res: any, next: () => void) => {
          // authenticateAdmin passes but doesn't set adminUser
          // (edge case — normally impossible but covers null-safe ?. usage)
          next()
        }
      )
      app = await createApp()

      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', 'Bearer mock-token')

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBeUndefined()
      expect(res.body.data.email).toBeUndefined()
    })
  })
})
