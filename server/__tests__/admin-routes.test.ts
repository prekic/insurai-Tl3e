/**
 * Admin Routes Tests
 *
 * Comprehensive tests for admin API endpoints (/api/admin/*)
 * Covers authentication, user management, metrics, security, and prompts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import type { Express } from 'express'

// Mock bcrypt for password operations
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$12$hashedpassword'),
    compare: vi.fn().mockImplementation((password: string) => {
      return Promise.resolve(password === 'correctpassword')
    }),
  },
}))

// Mock jsonwebtoken
const mockJwtSign = vi.fn().mockReturnValue('mock-jwt-token')
const mockJwtVerify = vi.fn()

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: (...args: unknown[]) => mockJwtSign(...args),
    verify: (...args: unknown[]) => mockJwtVerify(...args),
  },
}))

// Mock Supabase client
const mockSupabaseFrom = vi.fn()
const mockSupabaseSelect = vi.fn()
const mockSupabaseSingle = vi.fn()
const mockSupabaseInsert = vi.fn()
const mockSupabaseUpdate = vi.fn()
const mockSupabaseDelete = vi.fn()
const mockSupabaseEq = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    from: mockSupabaseFrom,
  }),
}))

// Setup mock chain for Supabase
function setupSupabaseMock() {
  mockSupabaseFrom.mockReturnValue({
    select: mockSupabaseSelect,
    insert: mockSupabaseInsert,
    update: mockSupabaseUpdate,
    delete: mockSupabaseDelete,
  })
  mockSupabaseSelect.mockReturnValue({
    eq: mockSupabaseEq,
    single: mockSupabaseSingle,
  })
  mockSupabaseEq.mockReturnValue({
    eq: mockSupabaseEq,
    single: mockSupabaseSingle,
    is: vi.fn().mockReturnValue({
      gt: vi.fn().mockReturnValue({
        single: mockSupabaseSingle,
      }),
    }),
  })
  mockSupabaseInsert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: mockSupabaseSingle,
    }),
  })
  mockSupabaseUpdate.mockReturnValue({
    eq: mockSupabaseEq,
  })
  mockSupabaseDelete.mockReturnValue({
    eq: mockSupabaseEq,
  })
}

// Store original env
const originalEnv = process.env

describe('Admin Routes', () => {
  let app: Express

  beforeEach(async () => {
    vi.clearAllMocks()
    setupSupabaseMock()

    // Set up test environment
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      ADMIN_JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters-for-security',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    }

    // Reset module cache
    vi.resetModules()

    // Import fresh instance of routes
    const adminRoutes = (await import('../routes/admin')).default

    app = express()
    app.use(express.json())
    app.use('/api/admin', adminRoutes)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // ============================================================================
  // AUTHENTICATION ENDPOINTS
  // ============================================================================

  describe('Authentication', () => {
    describe('POST /api/admin/auth/login', () => {
      it('returns 400 for missing email', async () => {
        const response = await request(app)
          .post('/api/admin/auth/login')
          .send({ password: 'test123' })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
      })

      it('returns 400 for missing password', async () => {
        const response = await request(app)
          .post('/api/admin/auth/login')
          .send({ email: 'admin@test.com' })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
      })

      it('returns 401 for invalid credentials', async () => {
        // Mock user not found
        mockSupabaseSingle.mockResolvedValueOnce({ data: null, error: null })

        const response = await request(app)
          .post('/api/admin/auth/login')
          .send({ email: 'admin@test.com', password: 'wrongpassword' })

        expect(response.status).toBe(401)
        expect(response.body.code).toBe('INVALID_CREDENTIALS')
      })

      it('returns 401 for inactive user', async () => {
        mockSupabaseSingle.mockResolvedValueOnce({
          data: {
            id: 'user-1',
            email: 'admin@test.com',
            role: 'admin',
            status: 'suspended',
            password_hash: '$2a$12$hashedpassword',
          },
          error: null,
        })

        const response = await request(app)
          .post('/api/admin/auth/login')
          .send({ email: 'admin@test.com', password: 'correctpassword' })

        expect(response.status).toBe(401)
        expect(response.body.code).toBe('ACCOUNT_INACTIVE')
      })

      it('returns tokens for valid credentials', async () => {
        // Mock user found with correct status
        mockSupabaseSingle
          .mockResolvedValueOnce({
            data: {
              id: 'user-1',
              email: 'admin@test.com',
              role: 'admin',
              status: 'active',
              password_hash: '$2a$12$hashedpassword',
              permissions: ['read', 'write'],
            },
            error: null,
          })
          // Mock session creation
          .mockResolvedValueOnce({
            data: { id: 'session-1' },
            error: null,
          })

        const response = await request(app)
          .post('/api/admin/auth/login')
          .send({ email: 'admin@test.com', password: 'correctpassword' })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.token).toBeDefined()
        expect(response.body.refreshToken).toBeDefined()
        expect(response.body.user.email).toBe('admin@test.com')
      })
    })

    describe('POST /api/admin/auth/logout', () => {
      it('returns 401 without auth header', async () => {
        const response = await request(app)
          .post('/api/admin/auth/logout')

        expect(response.status).toBe(401)
        expect(response.body.code).toBe('AUTH_REQUIRED')
      })

      it('returns 401 with invalid token', async () => {
        mockJwtVerify.mockImplementationOnce(() => {
          throw new Error('Invalid token')
        })

        const response = await request(app)
          .post('/api/admin/auth/logout')
          .set('Authorization', 'Bearer invalid-token')

        expect(response.status).toBe(401)
        expect(response.body.code).toBe('INVALID_TOKEN')
      })

      it('successfully logs out with valid token', async () => {
        mockJwtVerify.mockReturnValueOnce({
          sub: 'user-1',
          email: 'admin@test.com',
          role: 'admin',
          sessionId: 'session-1',
        })
        mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })

        const response = await request(app)
          .post('/api/admin/auth/logout')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })
    })

    describe('POST /api/admin/auth/refresh', () => {
      it('returns 400 for missing refresh token', async () => {
        const response = await request(app)
          .post('/api/admin/auth/refresh')
          .send({})

        expect(response.status).toBe(400)
        expect(response.body.code).toBe('MISSING_REFRESH_TOKEN')
      })

      it('returns 401 for invalid refresh token', async () => {
        mockJwtVerify.mockImplementationOnce(() => {
          throw new Error('Invalid token')
        })

        const response = await request(app)
          .post('/api/admin/auth/refresh')
          .send({ refreshToken: 'invalid-refresh-token' })

        expect(response.status).toBe(401)
        expect(response.body.code).toBe('INVALID_REFRESH_TOKEN')
      })

      it('returns new tokens for valid refresh token', async () => {
        mockJwtVerify.mockReturnValueOnce({
          sub: 'user-1',
          sessionId: 'session-1',
          type: 'refresh',
        })
        // Mock user lookup
        mockSupabaseSingle
          .mockResolvedValueOnce({
            data: {
              id: 'user-1',
              email: 'admin@test.com',
              role: 'admin',
              status: 'active',
              permissions: [],
            },
            error: null,
          })
          // Mock session validation
          .mockResolvedValueOnce({
            data: { id: 'session-1' },
            error: null,
          })
          // Mock session update
          .mockResolvedValueOnce({
            data: { id: 'session-1' },
            error: null,
          })

        const response = await request(app)
          .post('/api/admin/auth/refresh')
          .send({ refreshToken: 'valid-refresh-token' })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.token).toBeDefined()
      })
    })

    describe('GET /api/admin/auth/me', () => {
      it('returns 401 without auth header', async () => {
        const response = await request(app)
          .get('/api/admin/auth/me')

        expect(response.status).toBe(401)
      })

      it('returns user info with valid token', async () => {
        mockJwtVerify.mockReturnValueOnce({
          sub: 'user-1',
          email: 'admin@test.com',
          role: 'admin',
          sessionId: 'session-1',
        })
        mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })

        const response = await request(app)
          .get('/api/admin/auth/me')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.user.email).toBe('admin@test.com')
        expect(response.body.user.role).toBe('admin')
      })
    })
  })

  // ============================================================================
  // USER MANAGEMENT ENDPOINTS
  // ============================================================================

  describe('User Management', () => {
    const superAdminToken = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'super-1',
        email: 'super@test.com',
        role: 'super_admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    const regularAdminToken = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    describe('GET /api/admin/users', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/users')
        expect(response.status).toBe(401)
      })

      it('returns 403 for non-super_admin', async () => {
        regularAdminToken()

        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', 'Bearer admin-token')

        expect(response.status).toBe(403)
        expect(response.body.code).toBe('INSUFFICIENT_ROLE')
      })

      it('returns users list for super_admin', async () => {
        superAdminToken()
        mockSupabaseSelect.mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: [
              { id: 'user-1', email: 'user1@test.com', role: 'admin' },
              { id: 'user-2', email: 'user2@test.com', role: 'admin' },
            ],
            error: null,
          }),
        })

        const response = await request(app)
          .get('/api/admin/users')
          .set('Authorization', 'Bearer super-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(Array.isArray(response.body.users)).toBe(true)
      })
    })

    describe('POST /api/admin/users', () => {
      it('returns 403 for non-super_admin', async () => {
        regularAdminToken()

        const response = await request(app)
          .post('/api/admin/users')
          .set('Authorization', 'Bearer admin-token')
          .send({ email: 'new@test.com', password: 'password123', role: 'admin' })

        expect(response.status).toBe(403)
      })

      it('returns 400 for missing required fields', async () => {
        superAdminToken()

        const response = await request(app)
          .post('/api/admin/users')
          .set('Authorization', 'Bearer super-token')
          .send({ email: 'new@test.com' })

        expect(response.status).toBe(400)
      })

      it('creates user successfully as super_admin', async () => {
        superAdminToken()
        mockSupabaseSingle
          .mockResolvedValueOnce({ data: null, error: null }) // Email check
          .mockResolvedValueOnce({
            data: { id: 'new-user-1', email: 'new@test.com', role: 'admin' },
            error: null,
          })

        const response = await request(app)
          .post('/api/admin/users')
          .set('Authorization', 'Bearer super-token')
          .send({
            email: 'new@test.com',
            password: 'password123',
            role: 'admin',
          })

        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
      })
    })

    describe('PUT /api/admin/users/:id', () => {
      it('returns 403 for non-super_admin', async () => {
        regularAdminToken()

        const response = await request(app)
          .put('/api/admin/users/user-1')
          .set('Authorization', 'Bearer admin-token')
          .send({ role: 'super_admin' })

        expect(response.status).toBe(403)
      })

      it('updates user successfully', async () => {
        superAdminToken()
        mockSupabaseEq.mockResolvedValueOnce({
          data: { id: 'user-1', email: 'user@test.com', role: 'admin' },
          error: null,
        })

        const response = await request(app)
          .put('/api/admin/users/user-1')
          .set('Authorization', 'Bearer super-token')
          .send({ role: 'admin', status: 'active' })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })
    })

    describe('DELETE /api/admin/users/:id', () => {
      it('returns 403 for non-super_admin', async () => {
        regularAdminToken()

        const response = await request(app)
          .delete('/api/admin/users/user-1')
          .set('Authorization', 'Bearer admin-token')

        expect(response.status).toBe(403)
      })

      it('prevents self-deletion', async () => {
        superAdminToken()

        const response = await request(app)
          .delete('/api/admin/users/super-1')
          .set('Authorization', 'Bearer super-token')

        expect(response.status).toBe(400)
        expect(response.body.code).toBe('CANNOT_DELETE_SELF')
      })

      it('deletes user successfully', async () => {
        superAdminToken()
        mockSupabaseEq.mockResolvedValueOnce({ data: {}, error: null })

        const response = await request(app)
          .delete('/api/admin/users/other-user')
          .set('Authorization', 'Bearer super-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })
    })
  })

  // ============================================================================
  // HEALTH & METRICS ENDPOINTS
  // ============================================================================

  describe('Health & Metrics', () => {
    describe('GET /api/admin/health', () => {
      it('returns health status without auth', async () => {
        const response = await request(app).get('/api/admin/health')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data.status).toBe('healthy')
        expect(response.body.data.uptime).toBeDefined()
      })
    })

    describe('GET /api/admin/metrics', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/metrics')
        expect(response.status).toBe(401)
      })

      it('returns metrics with valid auth', async () => {
        mockJwtVerify.mockReturnValueOnce({
          sub: 'admin-1',
          email: 'admin@test.com',
          role: 'admin',
          sessionId: 'session-1',
        })
        mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })

        const response = await request(app)
          .get('/api/admin/metrics')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toBeDefined()
        expect(response.body.data.memory).toBeDefined()
        expect(response.body.data.cpu).toBeDefined()
      })
    })
  })

  // ============================================================================
  // SECURITY ENDPOINTS
  // ============================================================================

  describe('Security', () => {
    const authenticatedAdmin = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    describe('GET /api/admin/security/logs', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/security/logs')
        expect(response.status).toBe(401)
      })

      it('returns security logs', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/security/logs')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(Array.isArray(response.body.data)).toBe(true)
      })
    })

    describe('GET /api/admin/security/rate-limits', () => {
      it('returns rate limit configuration', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/security/rate-limits')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toBeDefined()
      })
    })

    describe('POST /api/admin/security/block-ip', () => {
      it('blocks IP address', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .post('/api/admin/security/block-ip')
          .set('Authorization', 'Bearer valid-token')
          .send({ ip: '192.168.1.100', reason: 'Suspicious activity' })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })

      it('returns 400 for missing IP', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .post('/api/admin/security/block-ip')
          .set('Authorization', 'Bearer valid-token')
          .send({ reason: 'Test' })

        expect(response.status).toBe(400)
      })
    })

    describe('DELETE /api/admin/security/block-ip/:ip', () => {
      it('unblocks IP address', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .delete('/api/admin/security/block-ip/192.168.1.100')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })
    })
  })

  // ============================================================================
  // AUDIT LOG ENDPOINTS
  // ============================================================================

  describe('Audit Logs', () => {
    describe('GET /api/admin/audit/logs', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/audit/logs')
        expect(response.status).toBe(401)
      })

      it('returns audit logs with pagination', async () => {
        mockJwtVerify.mockReturnValueOnce({
          sub: 'admin-1',
          email: 'admin@test.com',
          role: 'admin',
          sessionId: 'session-1',
        })
        mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })

        const response = await request(app)
          .get('/api/admin/audit/logs')
          .query({ page: 1, limit: 20 })
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(Array.isArray(response.body.data)).toBe(true)
      })
    })
  })

  // ============================================================================
  // PROMPT MANAGEMENT ENDPOINTS
  // ============================================================================

  describe('Prompts', () => {
    const authenticatedAdmin = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    const superAdminToken = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'super-1',
        email: 'super@test.com',
        role: 'super_admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    describe('GET /api/admin/prompts', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/prompts')
        expect(response.status).toBe(401)
      })

      it('returns prompts list', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/prompts')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })
    })

    describe('GET /api/admin/prompts/:id', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/prompts/prompt-1')
        expect(response.status).toBe(401)
      })

      it('returns prompt by ID', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/prompts/prompt-1')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
      })
    })

    describe('PUT /api/admin/prompts/:id', () => {
      it('returns 403 for non-admin role', async () => {
        mockJwtVerify.mockReturnValueOnce({
          sub: 'viewer-1',
          email: 'viewer@test.com',
          role: 'viewer',
          sessionId: 'session-1',
        })
        mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })

        const response = await request(app)
          .put('/api/admin/prompts/prompt-1')
          .set('Authorization', 'Bearer viewer-token')
          .send({ content: 'New content' })

        expect(response.status).toBe(403)
      })

      it('updates prompt as admin', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .put('/api/admin/prompts/prompt-1')
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'Updated prompt', content: 'New content' })

        expect(response.status).toBe(200)
      })
    })

    describe('POST /api/admin/prompts', () => {
      it('returns 403 for non-super_admin', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .post('/api/admin/prompts')
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'New Prompt', content: 'Content', category: 'extraction' })

        expect(response.status).toBe(403)
      })

      it('creates prompt as super_admin', async () => {
        superAdminToken()

        const response = await request(app)
          .post('/api/admin/prompts')
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'New Prompt',
            content: 'Prompt content here',
            category: 'extraction',
          })

        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
      })
    })
  })

  // ============================================================================
  // CONFIG ENDPOINTS
  // ============================================================================

  describe('Config', () => {
    const authenticatedAdmin = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    describe('GET /api/admin/config', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/config')
        expect(response.status).toBe(401)
      })

      it('returns config options', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/config')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toBeDefined()
      })
    })

    describe('GET /api/admin/feature-flags', () => {
      it('returns feature flags', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/feature-flags')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toBeDefined()
      })
    })
  })

  // ============================================================================
  // COST & BUDGET ENDPOINTS
  // ============================================================================

  describe('Cost & Budgets', () => {
    const authenticatedAdmin = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    const superAdminToken = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'super-1',
        email: 'super@test.com',
        role: 'super_admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    describe('GET /api/admin/cost/summary', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/cost/summary')
        expect(response.status).toBe(401)
      })

      it('returns cost summary', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/cost/summary')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })
    })

    describe('GET /api/admin/cost/pricing', () => {
      it('returns pricing info', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/cost/pricing')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toBeDefined()
      })
    })

    describe('GET /api/admin/budgets', () => {
      it('returns budgets list', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/budgets')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })
    })

    describe('POST /api/admin/budgets', () => {
      it('returns 403 for non-super_admin', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .post('/api/admin/budgets')
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'New Budget', limit: 1000 })

        expect(response.status).toBe(403)
      })

      it('creates budget as super_admin', async () => {
        superAdminToken()

        const response = await request(app)
          .post('/api/admin/budgets')
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'Monthly Budget',
            limit: 1000,
            period: 'monthly',
          })

        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
      })
    })
  })

  // ============================================================================
  // LOGGING ENDPOINTS (Unauthenticated for internal use)
  // ============================================================================

  describe('Internal Logging', () => {
    describe('POST /api/admin/log/ai-request', () => {
      it('logs AI request', async () => {
        const response = await request(app)
          .post('/api/admin/log/ai-request')
          .send({
            provider: 'openai',
            operation: 'extraction',
            model: 'gpt-4o',
            tokens: { input: 100, output: 50, total: 150 },
            cost: { input: 0.001, output: 0.002, total: 0.003 },
            responseTime: 1500,
            status: 'success',
          })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })

      it('returns 400 for missing required fields', async () => {
        const response = await request(app)
          .post('/api/admin/log/ai-request')
          .send({ provider: 'openai' })

        expect(response.status).toBe(400)
      })
    })

    describe('POST /api/admin/log/policy-operation', () => {
      it('logs policy operation', async () => {
        const response = await request(app)
          .post('/api/admin/log/policy-operation')
          .send({
            type: 'upload',
            userId: 'user-1',
            status: 'success',
          })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })
    })

    describe('POST /api/admin/log/security', () => {
      it('logs security event', async () => {
        const response = await request(app)
          .post('/api/admin/log/security')
          .send({
            eventType: 'failed_login',
            severity: 'medium',
            ipAddress: '192.168.1.1',
            details: { email: 'attacker@test.com' },
          })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
      })

      it('returns 400 for missing eventType', async () => {
        const response = await request(app)
          .post('/api/admin/log/security')
          .send({ severity: 'high' })

        expect(response.status).toBe(400)
      })
    })
  })

  // ============================================================================
  // AI REQUEST MONITORING ENDPOINTS
  // ============================================================================

  describe('AI Request Monitoring', () => {
    const authenticatedAdmin = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    describe('GET /api/admin/ai/requests', () => {
      it('returns 401 without auth', async () => {
        const response = await request(app).get('/api/admin/ai/requests')
        expect(response.status).toBe(401)
      })

      it('returns AI requests list', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/ai/requests')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(Array.isArray(response.body.data)).toBe(true)
      })

      it('supports limit parameter', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/ai/requests')
          .query({ limit: 10 })
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.total).toBeDefined()
      })
    })

    describe('GET /api/admin/ai/stats', () => {
      it('returns AI usage stats', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/ai/stats')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toBeDefined()
        expect(response.body.data.totalRequests).toBeDefined()
      })
    })
  })

  // ============================================================================
  // POLICY OPERATIONS MONITORING
  // ============================================================================

  describe('Policy Operations', () => {
    const authenticatedAdmin = () => {
      mockJwtVerify.mockReturnValueOnce({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        sessionId: 'session-1',
      })
      mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })
    }

    describe('GET /api/admin/policies/operations', () => {
      it('returns policy operations list', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/policies/operations')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(Array.isArray(response.body.data)).toBe(true)
      })
    })

    describe('GET /api/admin/policies/stats', () => {
      it('returns policy stats', async () => {
        authenticatedAdmin()

        const response = await request(app)
          .get('/api/admin/policies/stats')
          .set('Authorization', 'Bearer valid-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toBeDefined()
      })
    })
  })

  // ============================================================================
  // EXPORT ENDPOINT
  // ============================================================================

  describe('Export', () => {
    describe('GET /api/admin/export', () => {
      it('returns 403 for non-admin', async () => {
        mockJwtVerify.mockReturnValueOnce({
          sub: 'viewer-1',
          email: 'viewer@test.com',
          role: 'viewer',
          sessionId: 'session-1',
        })
        mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })

        const response = await request(app)
          .get('/api/admin/export')
          .set('Authorization', 'Bearer viewer-token')

        expect(response.status).toBe(403)
      })

      it('exports data as admin', async () => {
        mockJwtVerify.mockReturnValueOnce({
          sub: 'admin-1',
          email: 'admin@test.com',
          role: 'admin',
          sessionId: 'session-1',
        })
        mockSupabaseSingle.mockResolvedValueOnce({ data: {}, error: null })

        const response = await request(app)
          .get('/api/admin/export')
          .set('Authorization', 'Bearer admin-token')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data).toBeDefined()
      })
    })
  })
})
