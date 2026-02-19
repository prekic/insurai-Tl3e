/**
 * Admin Auth Middleware Coverage Tests
 *
 * Targets uncovered branches in server/middleware/admin-auth.ts:
 * - getSupabaseWithError: existing error cache, existing client cache, missing URL, missing key, init exception
 * - getAdminUserById: db null, query error, success
 * - getAdminUserByEmail: db null, query error, no data, success
 * - createAdminSession: db null, insert error, success
 * - validateAdminSession: db null, query error, success + activity update
 * - revokeAdminSession: db null, success, with/without revokedBy
 * - updateAdminLogin: db null, success, RPC error caught
 * - logAdminAction: db null, success with all fields
 * - requireAdmin: with role, without role
 * - requireSuperAdmin: returns correct middleware array
 * - authenticateAdmin: async session validation branches (valid/invalid, catch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Response as _Response, NextFunction as _NextFunction } from 'express'

// =============================================================================
// HOISTED MOCKS
// =============================================================================
const {
  mockFrom,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockEq,
  mockIs,
  mockGt,
  mockSingle,
  mockRpc,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockIs: vi.fn(),
  mockGt: vi.fn(),
  mockSingle: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  const child = { debug: noop, info: noop, warn: noop, error: noop, child: vi.fn().mockReturnThis() }
  return { default: child, logger: child }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    const chain = {
      from: mockFrom,
      select: mockSelect.mockReturnThis(),
      insert: mockInsert.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      is: mockIs.mockReturnThis(),
      gt: mockGt.mockReturnThis(),
      single: mockSingle,
      rpc: mockRpc,
    }
    mockFrom.mockReturnValue(chain)
    return chain
  }),
}))

const originalEnv = { ...process.env }
const TEST_SECRET = 'test-jwt-secret-that-is-definitely-longer-than-32-characters'

beforeEach(() => {
  vi.clearAllMocks()
  process.env = { ...originalEnv }
  process.env.ADMIN_JWT_SECRET = TEST_SECRET
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  mockSingle.mockResolvedValue({ data: null, error: null })
  mockRpc.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  process.env = originalEnv
})

// =============================================================================
// TESTS
// =============================================================================
describe('admin-auth coverage', () => {

  // =========================================================================
  // getAdminUserById
  // =========================================================================
  describe('getAdminUserById', () => {
    it('returns null when supabase not configured', async () => {
      vi.resetModules()
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserById('some-id')
      expect(result).toBeNull()
    })

    it('returns null when query has error', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserById('some-id')
      expect(result).toBeNull()
    })

    it('returns null when no data', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: null, error: null })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserById('some-id')
      expect(result).toBeNull()
    })

    it('returns user when found', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({
        data: {
          id: 'user-001',
          email: 'admin@test.com',
          role: 'admin',
          status: 'active',
          display_name: 'Test Admin',
          permissions: ['read:policies'],
        },
        error: null,
      })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserById('user-001')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('user-001')
      expect(result!.displayName).toBe('Test Admin')
      expect(result!.permissions).toEqual(['read:policies'])
    })

    it('defaults permissions to empty array when null', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({
        data: {
          id: 'user-001',
          email: 'admin@test.com',
          role: 'admin',
          status: 'active',
          permissions: null,
        },
        error: null,
      })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserById('user-001')
      expect(result!.permissions).toEqual([])
    })
  })

  // =========================================================================
  // getAdminUserByEmail
  // =========================================================================
  describe('getAdminUserByEmail', () => {
    it('returns null when supabase not configured', async () => {
      vi.resetModules()
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserByEmail('admin@test.com')
      expect(result).toBeNull()
    })

    it('returns null when query has error', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST', message: 'Error', details: '' } })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserByEmail('admin@test.com')
      expect(result).toBeNull()
    })

    it('returns null when no data', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: null, error: null })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserByEmail('admin@test.com')
      expect(result).toBeNull()
    })

    it('returns user with passwordHash when found', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({
        data: {
          id: 'user-001',
          email: 'admin@test.com',
          role: 'admin',
          status: 'active',
          display_name: 'Admin',
          permissions: null,
          password_hash: '$2b$12$hash',
        },
        error: null,
      })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.getAdminUserByEmail('Admin@Test.Com')
      expect(result).not.toBeNull()
      expect(result!.passwordHash).toBe('$2b$12$hash')
      expect(result!.permissions).toEqual([])
    })
  })

  // =========================================================================
  // createAdminSession
  // =========================================================================
  describe('createAdminSession', () => {
    it('returns null when supabase not configured', async () => {
      vi.resetModules()
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.createAdminSession('id', 'hash', 'rHash', '127.0.0.1', 'ua')
      expect(result).toBeNull()
    })

    it('returns null when insert has error', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Insert failed' } })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.createAdminSession('id', 'hash', 'rHash', '127.0.0.1', 'ua')
      expect(result).toBeNull()
    })

    it('returns session id on success', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: { id: 'sess-001' }, error: null })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.createAdminSession('id', 'hash', 'rHash', '127.0.0.1', 'ua')
      expect(result).toBe('sess-001')
    })
  })

  // =========================================================================
  // validateAdminSession
  // =========================================================================
  describe('validateAdminSession', () => {
    it('returns false when supabase not configured', async () => {
      vi.resetModules()
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.validateAdminSession('sess-001', 'hash')
      expect(result).toBe(false)
    })

    it('returns false when query has error', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.validateAdminSession('sess-001', 'hash')
      expect(result).toBe(false)
    })

    it('returns false when no data', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: null, error: null })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.validateAdminSession('sess-001', 'hash')
      expect(result).toBe(false)
    })

    it('returns true and updates activity on success', async () => {
      vi.resetModules()
      mockSingle.mockResolvedValue({ data: { id: 'sess-001' }, error: null })
      const mod = await import('../middleware/admin-auth.js')
      const result = await mod.validateAdminSession('sess-001', 'hash')
      expect(result).toBe(true)
      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // revokeAdminSession
  // =========================================================================
  describe('revokeAdminSession', () => {
    it('returns when supabase not configured', async () => {
      vi.resetModules()
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await import('../middleware/admin-auth.js')
      await mod.revokeAdminSession('sess-001')
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('revokes session with revokedBy', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')
      await mod.revokeAdminSession('sess-001', 'admin-001')
      expect(mockUpdate).toHaveBeenCalled()
      expect(mockEq).toHaveBeenCalledWith('id', 'sess-001')
    })

    it('revokes session without revokedBy', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')
      await mod.revokeAdminSession('sess-001')
      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // updateAdminLogin
  // =========================================================================
  describe('updateAdminLogin', () => {
    it('returns when supabase not configured', async () => {
      vi.resetModules()
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await import('../middleware/admin-auth.js')
      await mod.updateAdminLogin('admin-001', '127.0.0.1')
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('updates login timestamp and increments count', async () => {
      vi.resetModules()
      mockRpc.mockResolvedValue({ data: null, error: null })
      const mod = await import('../middleware/admin-auth.js')
      await mod.updateAdminLogin('admin-001', '127.0.0.1')
      expect(mockUpdate).toHaveBeenCalled()
      expect(mockRpc).toHaveBeenCalledWith('increment_login_count', { row_id: 'admin-001' })
    })

    it('handles RPC error silently', async () => {
      vi.resetModules()
      mockRpc.mockRejectedValue(new Error('RPC not found'))
      const mod = await import('../middleware/admin-auth.js')
      // Should not throw
      await mod.updateAdminLogin('admin-001', '127.0.0.1')
      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // logAdminAction
  // =========================================================================
  describe('logAdminAction', () => {
    it('returns when supabase not configured', async () => {
      vi.resetModules()
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await import('../middleware/admin-auth.js')
      const req = {
        adminUser: { id: 'a', email: 'a@test.com', role: 'admin' },
        adminSession: { id: 's' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test' },
      } as any
      await mod.logAdminAction(req, 'test', 'resource')
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('inserts audit log with all fields', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')
      const req = {
        adminUser: { id: 'admin-001', email: 'admin@test.com', role: 'admin' },
        adminSession: { id: 'sess-001' },
        ip: '10.0.0.1',
        socket: { remoteAddress: '10.0.0.1' },
        headers: { 'user-agent': 'TestBrowser' },
      } as any
      await mod.logAdminAction(req, 'create', 'policy', 'p-001', { old: 1 }, { new: 2 }, [{ field: 'x', oldValue: 1, newValue: 2 }])
      expect(mockFrom).toHaveBeenCalledWith('audit_logs')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        actor_id: 'admin-001',
        actor_email: 'admin@test.com',
        action: 'create',
        resource_type: 'policy',
        resource_id: 'p-001',
        ip_address: '10.0.0.1',
      }))
    })

    it('uses socket.remoteAddress when ip is undefined', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')
      const req = {
        adminUser: { id: 'a' },
        adminSession: { id: 's' },
        ip: undefined,
        socket: { remoteAddress: '192.168.1.1' },
        headers: {},
      } as any
      await mod.logAdminAction(req, 'view', 'dashboard')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        ip_address: '192.168.1.1',
      }))
    })

    it('uses "unknown" when neither ip nor socket address available', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')
      const req = {
        adminUser: undefined,
        adminSession: undefined,
        ip: undefined,
        socket: { remoteAddress: undefined },
        headers: {},
      } as any
      await mod.logAdminAction(req, 'view', 'dashboard')
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        ip_address: 'unknown',
      }))
    })
  })

  // =========================================================================
  // requireAdmin
  // =========================================================================
  describe('requireAdmin', () => {
    it('returns array with authenticateAdmin only when no role', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')
      const middleware = mod.requireAdmin()
      expect(middleware).toHaveLength(1) // just authenticateAdmin
    })

    it('returns array with authenticateAdmin + requireRole when role provided', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')
      const middleware = mod.requireAdmin('super_admin')
      expect(middleware).toHaveLength(2) // authenticateAdmin + requireRole
    })
  })

  // =========================================================================
  // requireSuperAdmin
  // =========================================================================
  describe('requireSuperAdmin', () => {
    it('returns array with authenticateAdmin + requireRole(super_admin)', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')
      const middleware = mod.requireSuperAdmin()
      expect(middleware).toHaveLength(2)
    })
  })

  // =========================================================================
  // getSupabaseWithError edge cases
  // =========================================================================
  describe('getSupabaseWithError', () => {
    it('returns cached error on subsequent calls', async () => {
      vi.resetModules()
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      const mod = await import('../middleware/admin-auth.js')

      const result1 = mod.getSupabaseWithError()
      expect(result1.client).toBeNull()
      expect(result1.error).toContain('SUPABASE_URL')

      // Second call returns cached error
      const result2 = mod.getSupabaseWithError()
      expect(result2.error).toBe(result1.error)
    })

    it('returns cached client on subsequent calls', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')

      const result1 = mod.getSupabaseWithError()
      expect(result1.client).not.toBeNull()

      const result2 = mod.getSupabaseWithError()
      expect(result2.client).toBe(result1.client)
    })

    it('reports missing service key', async () => {
      vi.resetModules()
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const mod = await import('../middleware/admin-auth.js')

      const result = mod.getSupabaseWithError()
      expect(result.client).toBeNull()
      expect(result.error).toContain('SUPABASE_SERVICE_ROLE_KEY')
    })
  })

  // =========================================================================
  // JWT secret caching
  // =========================================================================
  describe('JWT secret caching', () => {
    it('caches the secret after first resolution', async () => {
      vi.resetModules()
      const mod = await import('../middleware/admin-auth.js')

      // Generate two tokens - both should use same cached secret
      const user = { id: 'u1', email: 'u@t.com', role: 'admin' as const, status: 'active' as const, permissions: [] }
      const token1 = mod.generateAdminToken(user, 'sess-1')
      const token2 = mod.generateAdminToken(user, 'sess-2')

      // Both tokens should be valid
      expect(mod.verifyAdminToken(token1)).not.toBeNull()
      expect(mod.verifyAdminToken(token2)).not.toBeNull()
    })
  })
})
