/**
 * Admin Users Route Coverage Tests
 *
 * Targets uncovered branches in server/routes/admin/users.ts:
 * - GET /users: success, error
 * - POST /users: missing fields, user exists, success, createAdminUser failure
 * - PUT /users/:id: partial updates (role/status/displayName/permissions/password), not found, success, error
 * - DELETE /users/:id: self-delete prevention, not found, success, error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================
const {
  mockGetAdminUsers,
  mockCreateAdminUser,
  mockUpdateAdminUser,
  mockDeleteAdminUser,
  mockGetAdminUserByEmail,
  mockHashPassword,
  mockLogAdminAction,
  mockAuthenticateAdmin,
} = vi.hoisted(() => ({
  mockGetAdminUsers: vi.fn(),
  mockCreateAdminUser: vi.fn(),
  mockUpdateAdminUser: vi.fn(),
  mockDeleteAdminUser: vi.fn(),
  mockGetAdminUserByEmail: vi.fn(),
  mockHashPassword: vi.fn(),
  mockLogAdminAction: vi.fn(),
  mockAuthenticateAdmin: vi.fn(),
}))

vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  const childLogger = { debug: noop, info: noop, warn: noop, error: noop, child: vi.fn().mockReturnThis() }
  return { logger: childLogger, default: childLogger }
})

vi.mock('../routes/admin/shared.js', () => ({
  requireSuperAdmin: () => [
    (req: any, _res: any, next: () => void) => {
      mockAuthenticateAdmin(req, _res, next)
    },
  ],
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  getAdminUserByEmail: (...args: unknown[]) => mockGetAdminUserByEmail(...args),
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
  adminDb: {
    getAdminUsers: (...args: unknown[]) => mockGetAdminUsers(...args),
    createAdminUser: (...args: unknown[]) => mockCreateAdminUser(...args),
    updateAdminUser: (...args: unknown[]) => mockUpdateAdminUser(...args),
    deleteAdminUser: (...args: unknown[]) => mockDeleteAdminUser(...args),
  },
  qstr: (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? ''),
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

// =============================================================================
// HELPERS
// =============================================================================
const ADMIN_USER = {
  id: 'admin-001',
  email: 'admin@test.com',
  role: 'super_admin',
  permissions: [],
}

function setupDefaultMocks() {
  mockAuthenticateAdmin.mockImplementation((req: any, _res: any, next: () => void) => {
    req.adminUser = { ...ADMIN_USER }
    req.adminSession = { id: 'sess-001', tokenHash: 'hash' }
    next()
  })
  mockGetAdminUsers.mockResolvedValue([ADMIN_USER])
  mockCreateAdminUser.mockResolvedValue({ id: 'new-001', email: 'new@test.com', role: 'admin' })
  mockUpdateAdminUser.mockResolvedValue({ id: 'admin-001', email: 'admin@test.com', role: 'admin' })
  mockDeleteAdminUser.mockResolvedValue(true)
  mockGetAdminUserByEmail.mockResolvedValue(null)
  mockHashPassword.mockResolvedValue('$2b$12$hashedpw')
  mockLogAdminAction.mockResolvedValue(undefined)
}

async function createApp() {
  const mod = await import('../routes/admin/users.js')
  const app = express()
  app.use(express.json())
  app.use('/api/admin', mod.default)
  return app
}

// =============================================================================
// TESTS
// =============================================================================
describe('Admin Users Routes', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    setupDefaultMocks()
    app = await createApp()
  })

  // =========================================================================
  // GET /users
  // =========================================================================
  describe('GET /users', () => {
    it('returns list of admin users', async () => {
      const res = await request(app).get('/api/admin/users')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveLength(1)
    })

    it('logs view action', async () => {
      await request(app).get('/api/admin/users')
      expect(mockLogAdminAction).toHaveBeenCalledWith(expect.anything(), 'view', 'admin_users')
    })

    it('returns 500 on getAdminUsers error', async () => {
      mockGetAdminUsers.mockRejectedValue(new Error('DB error'))
      const res = await request(app).get('/api/admin/users')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to list admin users')
    })
  })

  // =========================================================================
  // POST /users
  // =========================================================================
  describe('POST /users', () => {
    it('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .send({ password: 'test123' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Email and password are required')
    })

    it('returns 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .send({ email: 'new@test.com' })
      expect(res.status).toBe(400)
    })

    it('returns 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .send({})
      expect(res.status).toBe(400)
    })

    it('returns 409 when user already exists', async () => {
      mockGetAdminUserByEmail.mockResolvedValue({ id: 'existing-001', email: 'existing@test.com' })
      const res = await request(app)
        .post('/api/admin/users')
        .send({ email: 'existing@test.com', password: 'test123' })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('USER_EXISTS')
    })

    it('creates user with default role admin when not specified', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .send({ email: 'new@test.com', password: 'test123' })
      expect(res.status).toBe(200)
      expect(mockCreateAdminUser).toHaveBeenCalledWith(expect.objectContaining({
        role: 'admin',
        permissions: [],
      }))
    })

    it('creates user with specified role and permissions', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .send({
          email: 'new@test.com',
          password: 'test123',
          role: 'super_admin',
          displayName: 'New Admin',
          permissions: ['read:policies'],
        })
      expect(res.status).toBe(200)
      expect(mockCreateAdminUser).toHaveBeenCalledWith(expect.objectContaining({
        role: 'super_admin',
        displayName: 'New Admin',
        permissions: ['read:policies'],
      }))
    })

    it('lowercases email before saving', async () => {
      await request(app)
        .post('/api/admin/users')
        .send({ email: 'NEW@Test.COM', password: 'test123' })
      expect(mockCreateAdminUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'new@test.com',
      }))
    })

    it('hashes the password before saving', async () => {
      await request(app)
        .post('/api/admin/users')
        .send({ email: 'new@test.com', password: 'plaintext' })
      expect(mockHashPassword).toHaveBeenCalledWith('plaintext')
      expect(mockCreateAdminUser).toHaveBeenCalledWith(expect.objectContaining({
        passwordHash: '$2b$12$hashedpw',
      }))
    })

    it('logs create action', async () => {
      await request(app)
        .post('/api/admin/users')
        .send({ email: 'new@test.com', password: 'test123' })
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'create', 'admin_user', 'new-001', undefined,
        expect.objectContaining({ email: 'new@test.com' })
      )
    })

    it('returns 500 on createAdminUser error', async () => {
      mockCreateAdminUser.mockRejectedValue(new Error('DB insert error'))
      const res = await request(app)
        .post('/api/admin/users')
        .send({ email: 'new@test.com', password: 'test123' })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to create admin user')
    })
  })

  // =========================================================================
  // PUT /users/:id
  // =========================================================================
  describe('PUT /users/:id', () => {
    it('updates role only', async () => {
      const res = await request(app)
        .put('/api/admin/users/admin-001')
        .send({ role: 'super_admin' })
      expect(res.status).toBe(200)
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('admin-001', { role: 'super_admin' })
    })

    it('updates status only', async () => {
      await request(app)
        .put('/api/admin/users/admin-001')
        .send({ status: 'suspended' })
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('admin-001', { status: 'suspended' })
    })

    it('updates displayName including null/empty', async () => {
      await request(app)
        .put('/api/admin/users/admin-001')
        .send({ displayName: '' })
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('admin-001', { display_name: '' })
    })

    it('updates permissions', async () => {
      await request(app)
        .put('/api/admin/users/admin-001')
        .send({ permissions: ['read:policies', 'write:policies'] })
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('admin-001', {
        permissions: ['read:policies', 'write:policies'],
      })
    })

    it('hashes password when provided', async () => {
      await request(app)
        .put('/api/admin/users/admin-001')
        .send({ password: 'newpass' })
      expect(mockHashPassword).toHaveBeenCalledWith('newpass')
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('admin-001', {
        password_hash: '$2b$12$hashedpw',
      })
    })

    it('updates multiple fields at once', async () => {
      await request(app)
        .put('/api/admin/users/admin-001')
        .send({ role: 'admin', status: 'active', displayName: 'Updated', permissions: ['*'] })
      expect(mockUpdateAdminUser).toHaveBeenCalledWith('admin-001', {
        role: 'admin',
        status: 'active',
        display_name: 'Updated',
        permissions: ['*'],
      })
    })

    it('returns 404 when user not found', async () => {
      mockUpdateAdminUser.mockResolvedValue(null)
      const res = await request(app)
        .put('/api/admin/users/nonexistent')
        .send({ role: 'admin' })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('logs update action', async () => {
      await request(app)
        .put('/api/admin/users/admin-001')
        .send({ role: 'admin' })
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'update', 'admin_user', 'admin-001', undefined,
        expect.objectContaining({ role: 'admin' })
      )
    })

    it('returns 500 on error', async () => {
      mockUpdateAdminUser.mockRejectedValue(new Error('DB update error'))
      const res = await request(app)
        .put('/api/admin/users/admin-001')
        .send({ role: 'admin' })
      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // DELETE /users/:id
  // =========================================================================
  describe('DELETE /users/:id', () => {
    it('prevents self-deletion', async () => {
      const res = await request(app).delete('/api/admin/users/admin-001')
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('SELF_DELETE_FORBIDDEN')
    })

    it('returns 404 when user not found', async () => {
      mockDeleteAdminUser.mockResolvedValue(false)
      const res = await request(app).delete('/api/admin/users/other-user')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('deletes user successfully', async () => {
      const res = await request(app).delete('/api/admin/users/other-user')
      expect(res.status).toBe(200)
      expect(res.body.message).toBe('User deleted')
    })

    it('logs delete action', async () => {
      await request(app).delete('/api/admin/users/other-user')
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        expect.anything(), 'delete', 'admin_user', 'other-user'
      )
    })

    it('returns 500 on error', async () => {
      mockDeleteAdminUser.mockRejectedValue(new Error('DB error'))
      const res = await request(app).delete('/api/admin/users/other-user')
      expect(res.status).toBe(500)
    })
  })
})
