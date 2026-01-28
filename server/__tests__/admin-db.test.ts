/**
 * Admin Database Service Tests
 *
 * Tests for server/services/admin-db.ts
 * Uses mocked Supabase client to test all database operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create a configurable mock chain
let mockQueryResult: { data: unknown; error: Error | null } = { data: null, error: null }

const createMockChain = () => {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'gte', 'lte', 'limit', 'range', 'upsert', 'single', 'rpc']

  methods.forEach(method => {
    if (method === 'single') {
      chain[method] = vi.fn(() => Promise.resolve(mockQueryResult))
    } else if (method === 'rpc') {
      chain[method] = vi.fn(() => Promise.resolve({ error: null }))
    } else {
      chain[method] = vi.fn(() => chain)
    }
  })

  // Make chain thenable for terminal operations without single()
  ;(chain as Record<string, unknown>).then = (resolve: (value: unknown) => void) => {
    resolve(mockQueryResult)
  }

  return chain
}

const mockFrom = vi.fn(() => createMockChain())
const mockRpc = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}))

// Set environment variables before importing the module
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

// Import after mocking
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getConfigs,
  getConfig,
  getFeatureFlags,
  getFeatureFlag,
  updateFeatureFlag,
  createFeatureFlag,
  getAuditLogs,
  createAuditLog,
  getSecurityEvents,
  createSecurityEvent,
  resolveSecurityEvent,
  getBlockedIPs,
  blockIP,
  unblockIP,
  isIPBlocked,
  getPromptTemplates,
  getPromptTemplate,
  getActivePromptTemplate,
  deletePromptTemplate,
  recordPromptUsage,
  getAIRequestLogs,
  createAIRequestLog,
  getAIUsageStats,
  getCostBudgets,
  updateCostBudget,
  getClientWithError,
  logSecurityEvent,
} from '../services/admin-db.js'

// Helper to set mock result
function setMockResult(data: unknown, error: Error | null = null) {
  mockQueryResult = { data, error }
}

describe('Admin Database Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryResult = { data: null, error: null }
  })

  // ==========================================================================
  // CLIENT INITIALIZATION
  // ==========================================================================

  describe('getClientWithError', () => {
    it('should return client when properly configured', () => {
      const result = getClientWithError()
      expect(result.error).toBeNull()
      expect(result.client).toBeTruthy()
    })
  })

  // ==========================================================================
  // ADMIN USER MANAGEMENT
  // ==========================================================================

  describe('Admin User Management', () => {
    describe('getAdminUsers', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('DB Error'))

        const users = await getAdminUsers()

        expect(users).toEqual([])
      })
    })

    describe('createAdminUser', () => {
      it('should create a new admin user', async () => {
        const mockResponse = {
          id: 'new-user-id',
          email: 'new@test.com',
          role: 'editor',
          status: 'active',
          display_name: 'New User',
          permissions: ['read'],
          created_at: '2026-01-28T00:00:00Z',
          updated_at: '2026-01-28T00:00:00Z',
        }

        setMockResult(mockResponse)

        const result = await createAdminUser({
          email: 'new@test.com',
          passwordHash: 'hashed',
          role: 'editor',
        })

        expect(mockFrom).toHaveBeenCalledWith('admin_users')
        expect(result).toBeTruthy()
        expect(result?.email).toBe('new@test.com')
      })

      it('should return null on creation error', async () => {
        setMockResult(null, new Error('Insert failed'))

        const result = await createAdminUser({
          email: 'test@test.com',
          passwordHash: 'hash',
          role: 'admin',
        })

        expect(result).toBeNull()
      })
    })

    describe('updateAdminUser', () => {
      it('should return null on update error', async () => {
        setMockResult(null, new Error('Update failed'))

        const result = await updateAdminUser('invalid-id', { role: 'admin' })

        expect(result).toBeNull()
      })
    })

    describe('deleteAdminUser', () => {
      it('should return false on delete error', async () => {
        setMockResult(null, new Error('Delete failed'))

        const result = await deleteAdminUser('invalid-id')

        expect(result).toBe(false)
      })
    })
  })

  // ==========================================================================
  // APP CONFIGURATION
  // ==========================================================================

  describe('App Configuration', () => {
    describe('getConfigs', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const configs = await getConfigs()

        expect(configs).toEqual([])
      })
    })

    describe('getConfig', () => {
      it('should return null when config not found', async () => {
        setMockResult(null, new Error('Not found'))

        const config = await getConfig('invalid', 'key')

        expect(config).toBeNull()
      })
    })
  })

  // ==========================================================================
  // FEATURE FLAGS
  // ==========================================================================

  describe('Feature Flags', () => {
    describe('getFeatureFlags', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const flags = await getFeatureFlags()

        expect(flags).toEqual([])
      })
    })

    describe('getFeatureFlag', () => {
      it('should return null when not found', async () => {
        setMockResult(null, new Error('Not found'))

        const flag = await getFeatureFlag('invalid-id')

        expect(flag).toBeNull()
      })
    })

    describe('updateFeatureFlag', () => {
      it('should return false on update error', async () => {
        setMockResult(null, new Error('Update failed'))

        const result = await updateFeatureFlag('invalid-id', { enabled: false }, 'admin')

        expect(result).toBe(false)
      })
    })

    describe('createFeatureFlag', () => {
      it('should create a new feature flag', async () => {
        setMockResult({ id: 'new-flag-id' })

        const result = await createFeatureFlag(
          {
            id: 'new-flag',
            name: 'test_flag',
            enabled: false,
            enabledForRoles: [],
            enabledForUsers: [],
            metadata: {},
          },
          'admin'
        )

        expect(result).toBe('new-flag-id')
      })

      it('should return null on creation error', async () => {
        setMockResult(null, new Error('Create failed'))

        const result = await createFeatureFlag(
          {
            id: 'new-flag',
            name: 'test_flag',
            enabled: false,
            enabledForRoles: [],
            enabledForUsers: [],
            metadata: {},
          },
          'admin'
        )

        expect(result).toBeNull()
      })
    })
  })

  // ==========================================================================
  // AUDIT LOGS
  // ==========================================================================

  describe('Audit Logs', () => {
    describe('getAuditLogs', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const logs = await getAuditLogs()

        expect(logs).toEqual([])
      })
    })

    describe('createAuditLog', () => {
      it('should create an audit log entry', async () => {
        setMockResult({ id: 'new-log-id' })

        const result = await createAuditLog({
          actorId: 'admin-1',
          action: 'update',
          resourceType: 'policy',
        })

        expect(result).toBe('new-log-id')
      })

      it('should return null on creation error', async () => {
        setMockResult(null, new Error('Create failed'))

        const result = await createAuditLog({
          action: 'test',
          resourceType: 'test',
        })

        expect(result).toBeNull()
      })
    })
  })

  // ==========================================================================
  // SECURITY EVENTS
  // ==========================================================================

  describe('Security Events', () => {
    describe('getSecurityEvents', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const events = await getSecurityEvents()

        expect(events).toEqual([])
      })
    })

    describe('createSecurityEvent', () => {
      it('should create a security event', async () => {
        setMockResult({ id: 'new-event-id' })

        const result = await createSecurityEvent({
          eventType: 'suspicious_activity',
          severity: 'high',
          details: { reason: 'Multiple failed attempts' },
        })

        expect(result).toBe('new-event-id')
      })

      it('should return null on creation error', async () => {
        setMockResult(null, new Error('Create failed'))

        const result = await createSecurityEvent({
          eventType: 'test',
          severity: 'low',
          details: {},
        })

        expect(result).toBeNull()
      })
    })

    describe('logSecurityEvent (alias)', () => {
      it('should be an alias for createSecurityEvent', async () => {
        setMockResult({ id: 'event-id' })

        const result = await logSecurityEvent({
          eventType: 'login_success',
          severity: 'info',
          details: {},
        })

        expect(result).toBe('event-id')
      })
    })

    describe('resolveSecurityEvent', () => {
      it('should return false on resolve error', async () => {
        setMockResult(null, new Error('Update failed'))

        const result = await resolveSecurityEvent('invalid-id', 'admin')

        expect(result).toBe(false)
      })
    })
  })

  // ==========================================================================
  // BLOCKED IPS
  // ==========================================================================

  describe('Blocked IPs', () => {
    describe('getBlockedIPs', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const ips = await getBlockedIPs()

        expect(ips).toEqual([])
      })
    })

    describe('blockIP', () => {
      it('should return false on block error', async () => {
        setMockResult(null, new Error('Block failed'))

        const result = await blockIP('192.168.1.100', 'Test', 'admin')

        expect(result).toBe(false)
      })
    })

    describe('unblockIP', () => {
      it('should return false on unblock error', async () => {
        setMockResult(null, new Error('Unblock failed'))

        const result = await unblockIP('invalid-ip')

        expect(result).toBe(false)
      })
    })

    describe('isIPBlocked', () => {
      it('should return true for blocked IP', async () => {
        setMockResult({ ip: '192.168.1.100', expires_at: null })

        const result = await isIPBlocked('192.168.1.100')

        expect(result).toBe(true)
      })

      it('should return false for non-blocked IP', async () => {
        setMockResult(null, new Error('Not found'))

        const result = await isIPBlocked('192.168.1.1')

        expect(result).toBe(false)
      })

      it('should return false and unblock for expired block', async () => {
        const expiredDate = new Date(Date.now() - 86400000).toISOString()
        setMockResult({ ip: '192.168.1.100', expires_at: expiredDate })

        const result = await isIPBlocked('192.168.1.100')

        expect(result).toBe(false)
      })
    })
  })

  // ==========================================================================
  // PROMPT TEMPLATES
  // ==========================================================================

  describe('Prompt Templates', () => {
    describe('getPromptTemplates', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const templates = await getPromptTemplates()

        expect(templates).toEqual([])
      })
    })

    describe('getPromptTemplate', () => {
      it('should return null when not found', async () => {
        setMockResult(null, new Error('Not found'))

        const template = await getPromptTemplate('invalid-id')

        expect(template).toBeNull()
      })
    })

    describe('getActivePromptTemplate', () => {
      it('should return null when no active template', async () => {
        setMockResult(null, new Error('No active template'))

        const template = await getActivePromptTemplate('nonexistent')

        expect(template).toBeNull()
      })
    })

    describe('deletePromptTemplate', () => {
      it('should return false on delete error', async () => {
        setMockResult(null, new Error('Delete failed'))

        const result = await deletePromptTemplate('invalid-id')

        expect(result).toBe(false)
      })
    })

    describe('recordPromptUsage', () => {
      it('should call rpc to increment usage', async () => {
        await recordPromptUsage('template-1')

        expect(mockRpc).toHaveBeenCalledWith('increment_prompt_usage', { template_id: 'template-1' })
      })
    })
  })

  // ==========================================================================
  // AI REQUEST LOGS
  // ==========================================================================

  describe('AI Request Logs', () => {
    describe('getAIRequestLogs', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const logs = await getAIRequestLogs()

        expect(logs).toEqual([])
      })
    })

    describe('createAIRequestLog', () => {
      it('should create an AI request log', async () => {
        setMockResult({ id: 'new-log-id' })

        const result = await createAIRequestLog({
          userId: 'user-1',
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'chat',
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300,
          inputCost: 0.001,
          outputCost: 0.006,
          totalCost: 0.007,
          status: 'success',
        })

        expect(result).toBe('new-log-id')
      })

      it('should return null on creation error', async () => {
        setMockResult(null, new Error('Create failed'))

        const result = await createAIRequestLog({
          provider: 'openai',
          model: 'gpt-4o',
          operation: 'test',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
          status: 'error',
        })

        expect(result).toBeNull()
      })
    })

    describe('getAIUsageStats', () => {
      it('should return empty stats on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const stats = await getAIUsageStats('2026-01-01', '2026-01-31')

        expect(stats.totalRequests).toBe(0)
        expect(stats.totalTokens).toBe(0)
        expect(stats.totalCost).toBe(0)
      })
    })
  })

  // ==========================================================================
  // COST BUDGETS
  // ==========================================================================

  describe('Cost Budgets', () => {
    describe('getCostBudgets', () => {
      it('should return empty array on error', async () => {
        setMockResult(null, new Error('Fetch failed'))

        const budgets = await getCostBudgets()

        expect(budgets).toEqual([])
      })
    })

    describe('updateCostBudget', () => {
      it('should return false on update error', async () => {
        setMockResult(null, new Error('Update failed'))

        const result = await updateCostBudget('invalid-id', { limitAmount: 100 })

        expect(result).toBe(false)
      })
    })
  })
})
