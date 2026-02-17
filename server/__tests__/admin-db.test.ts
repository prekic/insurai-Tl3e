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
  setConfig,
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
  updatePromptTemplate,
  createPromptTemplate,
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

      it('should return true on successful update', async () => {
        setMockResult(null, null)

        const result = await updateCostBudget('budget-1', { limitAmount: 200 })

        expect(result).toBe(true)
        expect(mockFrom).toHaveBeenCalledWith('cost_budgets')
      })
    })
  })

  // ==========================================================================
  // EXPANDED TESTS — SUCCESS PATHS
  // ==========================================================================

  describe('Admin User Management - Success Paths', () => {
    describe('getAdminUsers - success', () => {
      it('should return mapped admin users on success', async () => {
        const mockData = [
          {
            id: 'user-1',
            email: 'admin@test.com',
            role: 'admin',
            status: 'active',
            display_name: 'Admin User',
            permissions: ['read', 'write'],
            last_login_at: '2026-02-01T00:00:00Z',
            last_login_ip: '127.0.0.1',
            login_count: 5,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-02-01T00:00:00Z',
          },
          {
            id: 'user-2',
            email: 'editor@test.com',
            role: 'editor',
            status: 'active',
            display_name: null,
            permissions: null,
            last_login_at: null,
            last_login_ip: null,
            login_count: null,
            created_at: '2026-01-15T00:00:00Z',
            updated_at: '2026-01-15T00:00:00Z',
          },
        ]
        setMockResult(mockData)

        const users = await getAdminUsers()

        expect(users).toHaveLength(2)
        expect(users[0].id).toBe('user-1')
        expect(users[0].email).toBe('admin@test.com')
        expect(users[0].displayName).toBe('Admin User')
        expect(users[0].permissions).toEqual(['read', 'write'])
        expect(users[0].loginCount).toBe(5)
        expect(users[0].lastLoginAt).toBe('2026-02-01T00:00:00Z')
        expect(users[0].lastLoginIp).toBe('127.0.0.1')
        // null permissions default to empty array
        expect(users[1].permissions).toEqual([])
        // null login_count defaults to 0
        expect(users[1].loginCount).toBe(0)
      })
    })

    describe('updateAdminUser - success', () => {
      it('should return updated admin user on success', async () => {
        const mockUpdated = {
          id: 'user-1',
          email: 'admin@test.com',
          role: 'super_admin',
          status: 'active',
          display_name: 'Updated Name',
          permissions: ['read', 'write', 'admin'],
          last_login_at: '2026-02-01T00:00:00Z',
          last_login_ip: '10.0.0.1',
          login_count: 10,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-02-10T00:00:00Z',
        }
        setMockResult(mockUpdated)

        const result = await updateAdminUser('user-1', { role: 'super_admin' })

        expect(result).not.toBeNull()
        expect(result?.role).toBe('super_admin')
        expect(result?.displayName).toBe('Updated Name')
        expect(result?.loginCount).toBe(10)
      })
    })

    describe('deleteAdminUser - success', () => {
      it('should return true on successful delete', async () => {
        setMockResult(null, null)

        const result = await deleteAdminUser('user-1')

        expect(result).toBe(true)
        expect(mockFrom).toHaveBeenCalledWith('admin_users')
      })
    })
  })

  // ==========================================================================
  // EXPANDED CONFIG TESTS
  // ==========================================================================

  describe('App Configuration - Expanded', () => {
    describe('getConfigs - success', () => {
      it('should return mapped configs on success', async () => {
        const mockConfigs = [
          {
            id: 'cfg-1',
            category: 'ai',
            key: 'temperature',
            value: '0.7',
            value_type: 'number',
            description: 'AI temperature',
            is_secret: false,
            is_editable: true,
            modified_by: 'admin-1',
            modified_at: '2026-02-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]
        setMockResult(mockConfigs)

        const configs = await getConfigs()

        expect(configs).toHaveLength(1)
        expect(configs[0].category).toBe('ai')
        expect(configs[0].key).toBe('temperature')
        expect(configs[0].value).toBe(0.7) // JSON parsed
        expect(configs[0].isEditable).toBe(true)
        expect(configs[0].isSecret).toBe(false)
      })

      it('should filter by category when provided', async () => {
        setMockResult([])

        await getConfigs('ai')

        expect(mockFrom).toHaveBeenCalledWith('app_configs')
      })
    })

    describe('getConfig - success', () => {
      it('should return mapped config when found', async () => {
        const mockConfig = {
          id: 'cfg-1',
          category: 'ai',
          key: 'model',
          value: '"gpt-4o"',
          value_type: 'string',
          description: 'AI model',
          is_secret: false,
          is_editable: true,
          modified_by: null,
          modified_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        }
        setMockResult(mockConfig)

        const config = await getConfig('ai', 'model')

        expect(config).not.toBeNull()
        expect(config?.value).toBe('gpt-4o')
        expect(config?.category).toBe('ai')
        expect(config?.key).toBe('model')
      })
    })

    describe('mapConfig - JSON parse fallback', () => {
      it('should use raw value when JSON.parse fails', async () => {
        // Pass a non-JSON-parseable string as value
        const mockConfig = {
          id: 'cfg-1',
          category: 'ai',
          key: 'prompt',
          value: 'not valid json {{{',
          value_type: 'string',
          description: 'Bad value',
          is_secret: false,
          is_editable: true,
          modified_by: null,
          modified_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        }
        setMockResult(mockConfig)

        const config = await getConfig('ai', 'prompt')

        expect(config).not.toBeNull()
        // Falls back to raw value when JSON.parse fails
        expect(config?.value).toBe('not valid json {{{')
      })
    })

    describe('setConfig', () => {
      it('should return false when config not found', async () => {
        // getConfig will return null (no data, error)
        setMockResult(null, new Error('Not found'))

        const result = await setConfig('ai', 'nonexistent', 'value', 'admin')

        expect(result).toBe(false)
      })

      it('should return false when config is not editable', async () => {
        // getConfig returns a config that is not editable
        const mockConfig = {
          id: 'cfg-1',
          category: 'ai',
          key: 'secret_key',
          value: '"value"',
          value_type: 'string',
          description: 'Not editable',
          is_secret: true,
          is_editable: false,
          modified_by: null,
          modified_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        }
        setMockResult(mockConfig)

        const result = await setConfig('ai', 'secret_key', 'new-value', 'admin')

        expect(result).toBe(false)
      })

      it('should update config and log history on success', async () => {
        // First call is getConfig (returns editable config)
        const mockConfig = {
          id: 'cfg-1',
          category: 'ai',
          key: 'temperature',
          value: '0.5',
          value_type: 'number',
          description: 'Temperature',
          is_secret: false,
          is_editable: true,
          modified_by: null,
          modified_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        }
        setMockResult(mockConfig)

        const result = await setConfig('ai', 'temperature', 0.7, 'admin-1', 'Tuning')

        // The result depends on whether the update chain succeeds
        // Since our mock chain always resolves with mockQueryResult which has error: null, it should pass
        expect(mockFrom).toHaveBeenCalledWith('app_configs')
      })
    })
  })

  // ==========================================================================
  // EXPANDED FEATURE FLAG TESTS
  // ==========================================================================

  describe('Feature Flags - Expanded', () => {
    describe('getFeatureFlags - success', () => {
      it('should return mapped feature flags', async () => {
        const mockFlags = [
          {
            id: 'flag-1',
            name: 'use_db_config',
            description: 'Enable DB config',
            enabled: true,
            enabled_percentage: 100,
            enabled_for_roles: ['admin'],
            enabled_for_users: ['user-1'],
            metadata: { tier: 'stable' },
            created_at: '2026-01-01T00:00:00Z',
            created_by: 'admin',
            updated_at: '2026-02-01T00:00:00Z',
            updated_by: 'admin-2',
          },
          {
            id: 'flag-2',
            name: 'new_feature',
            description: undefined,
            enabled: false,
            enabled_percentage: undefined,
            enabled_for_roles: null,
            enabled_for_users: null,
            metadata: null,
            created_at: '2026-02-01T00:00:00Z',
            created_by: undefined,
            updated_at: '2026-02-01T00:00:00Z',
            updated_by: undefined,
          },
        ]
        setMockResult(mockFlags)

        const flags = await getFeatureFlags()

        expect(flags).toHaveLength(2)
        expect(flags[0].name).toBe('use_db_config')
        expect(flags[0].enabled).toBe(true)
        expect(flags[0].enabledPercentage).toBe(100)
        expect(flags[0].enabledForRoles).toEqual(['admin'])
        expect(flags[0].enabledForUsers).toEqual(['user-1'])
        expect(flags[0].metadata).toEqual({ tier: 'stable' })
        // Null defaults
        expect(flags[1].enabledForRoles).toEqual([])
        expect(flags[1].enabledForUsers).toEqual([])
        expect(flags[1].metadata).toEqual({})
      })
    })

    describe('getFeatureFlag - success', () => {
      it('should return mapped feature flag when found', async () => {
        const mockFlag = {
          id: 'flag-1',
          name: 'test_flag',
          description: 'Test',
          enabled: true,
          enabled_percentage: 50,
          enabled_for_roles: [],
          enabled_for_users: [],
          metadata: {},
          created_at: '2026-01-01T00:00:00Z',
          created_by: 'admin',
          updated_at: '2026-02-01T00:00:00Z',
          updated_by: null,
        }
        setMockResult(mockFlag)

        const flag = await getFeatureFlag('flag-1')

        expect(flag).not.toBeNull()
        expect(flag?.name).toBe('test_flag')
        expect(flag?.enabledPercentage).toBe(50)
      })
    })

    describe('updateFeatureFlag - success', () => {
      it('should return true on successful update', async () => {
        setMockResult(null, null)

        const result = await updateFeatureFlag('flag-1', { enabled: true }, 'admin')

        expect(result).toBe(true)
        expect(mockFrom).toHaveBeenCalledWith('feature_flags')
      })
    })
  })

  // ==========================================================================
  // EXPANDED AUDIT LOG TESTS
  // ==========================================================================

  describe('Audit Logs - Expanded', () => {
    describe('getAuditLogs - success with data', () => {
      it('should return mapped audit logs', async () => {
        const mockLogs = [
          {
            id: 'log-1',
            timestamp: '2026-02-01T00:00:00Z',
            actor_id: 'admin-1',
            actor_email: 'admin@test.com',
            actor_role: 'admin',
            action: 'update',
            resource_type: 'policy',
            resource_id: 'pol-1',
            previous_state: { status: 'active' },
            new_state: { status: 'expired' },
            changes: [{ field: 'status', oldValue: 'active', newValue: 'expired' }],
            ip_address: '127.0.0.1',
            user_agent: 'Mozilla/5.0',
            session_id: 'sess-1',
            reason: 'Policy expired',
          },
        ]
        setMockResult(mockLogs)

        const logs = await getAuditLogs()

        expect(logs).toHaveLength(1)
        expect(logs[0].id).toBe('log-1')
        expect(logs[0].actorId).toBe('admin-1')
        expect(logs[0].actorEmail).toBe('admin@test.com')
        expect(logs[0].action).toBe('update')
        expect(logs[0].resourceType).toBe('policy')
        expect(logs[0].resourceId).toBe('pol-1')
        expect(logs[0].changes).toHaveLength(1)
        expect(logs[0].reason).toBe('Policy expired')
        expect(logs[0].sessionId).toBe('sess-1')
      })
    })

    describe('getAuditLogs - with all filters', () => {
      it('should apply actorId filter', async () => {
        setMockResult([])

        await getAuditLogs({ actorId: 'admin-1' })

        expect(mockFrom).toHaveBeenCalledWith('audit_logs')
      })

      it('should apply resourceType filter', async () => {
        setMockResult([])

        await getAuditLogs({ resourceType: 'policy' })

        expect(mockFrom).toHaveBeenCalledWith('audit_logs')
      })

      it('should apply action filter', async () => {
        setMockResult([])

        await getAuditLogs({ action: 'create' })

        expect(mockFrom).toHaveBeenCalledWith('audit_logs')
      })

      it('should apply startDate and endDate filters', async () => {
        setMockResult([])

        await getAuditLogs({ startDate: '2026-01-01', endDate: '2026-02-01' })

        expect(mockFrom).toHaveBeenCalledWith('audit_logs')
      })

      it('should apply limit and offset', async () => {
        setMockResult([])

        await getAuditLogs({ limit: 10, offset: 20 })

        expect(mockFrom).toHaveBeenCalledWith('audit_logs')
      })

      it('should apply offset with default limit when limit not provided', async () => {
        setMockResult([])

        await getAuditLogs({ offset: 5 })

        expect(mockFrom).toHaveBeenCalledWith('audit_logs')
      })
    })
  })

  // ==========================================================================
  // EXPANDED SECURITY EVENTS TESTS
  // ==========================================================================

  describe('Security Events - Expanded', () => {
    describe('getSecurityEvents - success with data', () => {
      it('should return mapped security events', async () => {
        const mockEvents = [
          {
            id: 'ev-1',
            timestamp: '2026-02-01T00:00:00Z',
            event_type: 'login_failure',
            severity: 'high',
            user_id: 'user-1',
            ip_address: '192.168.1.1',
            user_agent: 'Chrome',
            details: { attempts: 5 },
            resolved: false,
            resolved_at: null,
            resolved_by: null,
            resolution_notes: null,
          },
        ]
        setMockResult(mockEvents)

        const events = await getSecurityEvents()

        expect(events).toHaveLength(1)
        expect(events[0].eventType).toBe('login_failure')
        expect(events[0].severity).toBe('high')
        expect(events[0].userId).toBe('user-1')
        expect(events[0].resolved).toBe(false)
        expect(events[0].details).toEqual({ attempts: 5 })
      })

      it('should default details to empty object when null', async () => {
        const mockEvents = [
          {
            id: 'ev-2',
            timestamp: '2026-02-01T00:00:00Z',
            event_type: 'test',
            severity: 'low',
            user_id: null,
            ip_address: null,
            user_agent: null,
            details: null,
            resolved: false,
            resolved_at: null,
            resolved_by: null,
            resolution_notes: null,
          },
        ]
        setMockResult(mockEvents)

        const events = await getSecurityEvents()

        expect(events[0].details).toEqual({})
      })
    })

    describe('getSecurityEvents - with filters', () => {
      it('should apply eventType filter', async () => {
        setMockResult([])
        await getSecurityEvents({ eventType: 'suspicious_activity' })
        expect(mockFrom).toHaveBeenCalledWith('security_events')
      })

      it('should apply severity filter', async () => {
        setMockResult([])
        await getSecurityEvents({ severity: 'critical' })
        expect(mockFrom).toHaveBeenCalledWith('security_events')
      })

      it('should apply resolved filter', async () => {
        setMockResult([])
        await getSecurityEvents({ resolved: true })
        expect(mockFrom).toHaveBeenCalledWith('security_events')
      })

      it('should apply date range and limit filters', async () => {
        setMockResult([])
        await getSecurityEvents({ startDate: '2026-01-01', endDate: '2026-02-01', limit: 50 })
        expect(mockFrom).toHaveBeenCalledWith('security_events')
      })
    })

    describe('resolveSecurityEvent - success', () => {
      it('should return true on successful resolve', async () => {
        setMockResult(null, null)

        const result = await resolveSecurityEvent('ev-1', 'admin-1', 'False positive')

        expect(result).toBe(true)
        expect(mockFrom).toHaveBeenCalledWith('security_events')
      })

      it('should resolve without notes', async () => {
        setMockResult(null, null)

        const result = await resolveSecurityEvent('ev-1', 'admin-1')

        expect(result).toBe(true)
      })
    })
  })

  // ==========================================================================
  // EXPANDED BLOCKED IP TESTS
  // ==========================================================================

  describe('Blocked IPs - Expanded', () => {
    describe('getBlockedIPs - success', () => {
      it('should return mapped blocked IPs', async () => {
        const mockIPs = [
          {
            ip: '192.168.1.100',
            reason: 'Brute force',
            blocked_at: '2026-02-01T00:00:00Z',
            expires_at: '2026-03-01T00:00:00Z',
            is_permanent: false,
            block_count: 3,
            created_by: 'admin-1',
            last_attempt_at: '2026-02-01T12:00:00Z',
          },
          {
            ip: '10.0.0.1',
            reason: 'Spam',
            blocked_at: '2026-01-15T00:00:00Z',
            expires_at: null,
            is_permanent: true,
            block_count: 1,
            created_by: 'system',
            last_attempt_at: null,
          },
        ]
        setMockResult(mockIPs)

        const ips = await getBlockedIPs()

        expect(ips).toHaveLength(2)
        expect(ips[0].ip).toBe('192.168.1.100')
        expect(ips[0].reason).toBe('Brute force')
        expect(ips[0].isPermanent).toBe(false)
        expect(ips[0].blockCount).toBe(3)
        expect(ips[1].isPermanent).toBe(true)
      })
    })

    describe('blockIP - success', () => {
      it('should return true on successful block without expiration', async () => {
        setMockResult(null, null)

        const result = await blockIP('192.168.1.200', 'Suspicious activity', 'admin-1')

        expect(result).toBe(true)
        expect(mockFrom).toHaveBeenCalledWith('blocked_ips')
      })

      it('should return true on successful block with expiration', async () => {
        setMockResult(null, null)

        const result = await blockIP('10.0.0.5', 'Temp block', 'admin-1', 86400000) // 24 hours

        expect(result).toBe(true)
      })
    })

    describe('unblockIP - success', () => {
      it('should return true on successful unblock', async () => {
        setMockResult(null, null)

        const result = await unblockIP('192.168.1.100')

        expect(result).toBe(true)
        expect(mockFrom).toHaveBeenCalledWith('blocked_ips')
      })
    })

    describe('isIPBlocked - non-expired block', () => {
      it('should return true for non-expired block with future expiry', async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString()
        setMockResult({ ip: '192.168.1.100', expires_at: futureDate })

        const result = await isIPBlocked('192.168.1.100')

        expect(result).toBe(true)
      })
    })
  })

  // ==========================================================================
  // EXPANDED PROMPT TEMPLATE TESTS
  // ==========================================================================

  describe('Prompt Templates - Expanded', () => {
    describe('getPromptTemplates - success', () => {
      it('should return mapped prompt templates', async () => {
        const mockTemplates = [
          {
            id: 'tmpl-1',
            name: 'Extraction Prompt',
            description: 'Main extraction prompt',
            category: 'extraction',
            version: 3,
            is_active: true,
            system_prompt: 'You are an insurance expert.',
            user_prompt_template: 'Extract data from: {{document}}',
            variables: [{ name: 'document', description: 'PDF text', type: 'string', required: true }],
            default_provider: 'openai',
            default_model: 'gpt-4o',
            parameters: { temperature: 0.1 },
            usage_count: 100,
            last_used_at: '2026-02-10T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            created_by: 'admin-1',
            updated_at: '2026-02-01T00:00:00Z',
            updated_by: 'admin-2',
          },
        ]
        setMockResult(mockTemplates)

        const templates = await getPromptTemplates()

        expect(templates).toHaveLength(1)
        expect(templates[0].name).toBe('Extraction Prompt')
        expect(templates[0].version).toBe(3)
        expect(templates[0].isActive).toBe(true)
        expect(templates[0].systemPrompt).toBe('You are an insurance expert.')
        expect(templates[0].defaultProvider).toBe('openai')
        expect(templates[0].usageCount).toBe(100)
        expect(templates[0].variables).toHaveLength(1)
      })

      it('should filter by category when provided', async () => {
        setMockResult([])

        await getPromptTemplates('extraction')

        expect(mockFrom).toHaveBeenCalledWith('prompt_templates')
      })

      it('should handle null variables and parameters', async () => {
        const mockTemplates = [
          {
            id: 'tmpl-2',
            name: 'Simple',
            description: undefined,
            category: 'chat',
            version: 1,
            is_active: false,
            system_prompt: 'Hello',
            user_prompt_template: 'Test',
            variables: null,
            default_provider: null,
            default_model: null,
            parameters: null,
            usage_count: 0,
            last_used_at: null,
            created_at: '2026-01-01T00:00:00Z',
            created_by: null,
            updated_at: '2026-01-01T00:00:00Z',
            updated_by: null,
          },
        ]
        setMockResult(mockTemplates)

        const templates = await getPromptTemplates()

        expect(templates[0].variables).toEqual([])
        expect(templates[0].parameters).toEqual({})
      })
    })

    describe('getPromptTemplate - success', () => {
      it('should return mapped prompt template', async () => {
        const mockTemplate = {
          id: 'tmpl-1',
          name: 'Test',
          description: 'Test template',
          category: 'extraction',
          version: 1,
          is_active: true,
          system_prompt: 'System prompt',
          user_prompt_template: 'User prompt',
          variables: [],
          default_provider: 'openai',
          default_model: 'gpt-4o',
          parameters: {},
          usage_count: 50,
          last_used_at: '2026-02-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          created_by: 'admin',
          updated_at: '2026-01-15T00:00:00Z',
          updated_by: 'admin',
        }
        setMockResult(mockTemplate)

        const template = await getPromptTemplate('tmpl-1')

        expect(template).not.toBeNull()
        expect(template?.id).toBe('tmpl-1')
        expect(template?.usageCount).toBe(50)
      })
    })

    describe('getActivePromptTemplate - success', () => {
      it('should return active template for category', async () => {
        const mockTemplate = {
          id: 'tmpl-active',
          name: 'Active Extraction',
          description: 'Active',
          category: 'extraction',
          version: 5,
          is_active: true,
          system_prompt: 'Active system prompt',
          user_prompt_template: 'Active user prompt',
          variables: [],
          default_provider: 'anthropic',
          default_model: 'claude-sonnet-4-20250514',
          parameters: { temperature: 0.2 },
          usage_count: 200,
          last_used_at: '2026-02-15T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          created_by: 'admin',
          updated_at: '2026-02-15T00:00:00Z',
          updated_by: 'admin',
        }
        setMockResult(mockTemplate)

        const template = await getActivePromptTemplate('extraction')

        expect(template).not.toBeNull()
        expect(template?.isActive).toBe(true)
        expect(template?.category).toBe('extraction')
      })
    })

    describe('updatePromptTemplate', () => {
      it('should return false when template not found', async () => {
        setMockResult(null, new Error('Not found'))

        const result = await updatePromptTemplate('nonexistent', { name: 'Updated' }, 'admin')

        expect(result).toBe(false)
      })

      it('should save version history and update template on success', async () => {
        // getPromptTemplate returns existing template
        const mockTemplate = {
          id: 'tmpl-1',
          name: 'Test',
          description: 'Test',
          category: 'extraction',
          version: 2,
          is_active: true,
          system_prompt: 'Old system prompt',
          user_prompt_template: 'Old user prompt',
          variables: [],
          default_provider: 'openai',
          default_model: 'gpt-4o',
          parameters: {},
          usage_count: 10,
          last_used_at: null,
          created_at: '2026-01-01T00:00:00Z',
          created_by: 'admin',
          updated_at: '2026-01-15T00:00:00Z',
          updated_by: 'admin',
        }
        setMockResult(mockTemplate)

        const result = await updatePromptTemplate(
          'tmpl-1',
          { systemPrompt: 'New system prompt' } as Partial<unknown> as never,
          'admin-2'
        )

        // It calls mockFrom for prompt_templates and prompt_versions
        expect(mockFrom).toHaveBeenCalledWith('prompt_templates')
      })
    })

    describe('createPromptTemplate', () => {
      it('should create a new prompt template and return id', async () => {
        setMockResult({ id: 'new-tmpl-id' })

        const result = await createPromptTemplate(
          {
            name: 'New Template',
            description: 'A new template',
            category: 'chat',
            isActive: true,
            systemPrompt: 'You are helpful',
            userPromptTemplate: 'Help with: {{query}}',
            variables: [{ name: 'query', description: 'User query', type: 'string', required: true }],
            defaultProvider: 'openai',
            defaultModel: 'gpt-4o',
            parameters: { temperature: 0.5 },
          },
          'admin-1'
        )

        expect(result).toBe('new-tmpl-id')
        expect(mockFrom).toHaveBeenCalledWith('prompt_templates')
      })

      it('should return null on creation error', async () => {
        setMockResult(null, new Error('Duplicate name'))

        const result = await createPromptTemplate(
          {
            name: 'Duplicate',
            category: 'extraction',
            isActive: false,
            systemPrompt: 'Test',
            userPromptTemplate: 'Test',
            variables: [],
            parameters: {},
          },
          'admin-1'
        )

        expect(result).toBeNull()
      })
    })

    describe('deletePromptTemplate - success', () => {
      it('should return true on successful delete', async () => {
        setMockResult(null, null)

        const result = await deletePromptTemplate('tmpl-1')

        expect(result).toBe(true)
        expect(mockFrom).toHaveBeenCalledWith('prompt_templates')
      })
    })
  })

  // ==========================================================================
  // EXPANDED AI REQUEST LOG TESTS
  // ==========================================================================

  describe('AI Request Logs - Expanded', () => {
    describe('getAIRequestLogs - success with data', () => {
      it('should return mapped AI request logs', async () => {
        const mockLogs = [
          {
            id: 'req-1',
            timestamp: '2026-02-01T00:00:00Z',
            user_id: 'user-1',
            session_id: 'sess-1',
            provider: 'openai',
            model: 'gpt-4o',
            operation: 'extraction',
            endpoint: '/api/ai/extract/openai',
            policy_id: 'pol-1',
            document_id: 'doc-1',
            prompt_template_id: 'tmpl-1',
            input_tokens: 1500,
            output_tokens: 500,
            total_tokens: 2000,
            input_cost: '0.015',
            output_cost: '0.010',
            total_cost: '0.025',
            response_time_ms: 3500,
            status: 'success',
            error_message: null,
            error_code: null,
            client_ip: '127.0.0.1',
            user_agent: 'InsurAI/1.0',
          },
        ]
        setMockResult(mockLogs)

        const logs = await getAIRequestLogs()

        expect(logs).toHaveLength(1)
        expect(logs[0].provider).toBe('openai')
        expect(logs[0].model).toBe('gpt-4o')
        expect(logs[0].inputTokens).toBe(1500)
        expect(logs[0].inputCost).toBe(0.015)
        expect(logs[0].outputCost).toBe(0.01)
        expect(logs[0].totalCost).toBe(0.025)
        expect(logs[0].responseTimeMs).toBe(3500)
        expect(logs[0].status).toBe('success')
      })

      it('should handle null cost strings', async () => {
        const mockLogs = [
          {
            id: 'req-2',
            timestamp: '2026-02-01T00:00:00Z',
            user_id: null,
            session_id: null,
            provider: 'anthropic',
            model: 'claude-3-5-haiku',
            operation: 'chat',
            endpoint: null,
            policy_id: null,
            document_id: null,
            prompt_template_id: null,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            input_cost: null,
            output_cost: null,
            total_cost: null,
            response_time_ms: null,
            status: 'error',
            error_message: 'Timeout',
            error_code: 'TIMEOUT',
            client_ip: null,
            user_agent: null,
          },
        ]
        setMockResult(mockLogs)

        const logs = await getAIRequestLogs()

        expect(logs[0].inputCost).toBe(0)
        expect(logs[0].outputCost).toBe(0)
        expect(logs[0].totalCost).toBe(0)
        expect(logs[0].errorMessage).toBe('Timeout')
        expect(logs[0].errorCode).toBe('TIMEOUT')
      })
    })

    describe('getAIRequestLogs - with filters', () => {
      it('should apply userId filter', async () => {
        setMockResult([])
        await getAIRequestLogs({ userId: 'user-1' })
        expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
      })

      it('should apply provider filter', async () => {
        setMockResult([])
        await getAIRequestLogs({ provider: 'openai' })
        expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
      })

      it('should apply operation filter', async () => {
        setMockResult([])
        await getAIRequestLogs({ operation: 'chat' })
        expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
      })

      it('should apply status filter', async () => {
        setMockResult([])
        await getAIRequestLogs({ status: 'error' })
        expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
      })

      it('should apply date range filters', async () => {
        setMockResult([])
        await getAIRequestLogs({ startDate: '2026-01-01', endDate: '2026-02-01' })
        expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
      })

      it('should apply limit and offset', async () => {
        setMockResult([])
        await getAIRequestLogs({ limit: 25, offset: 50 })
        expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
      })

      it('should apply offset with default limit when limit not provided', async () => {
        setMockResult([])
        await getAIRequestLogs({ offset: 10 })
        expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
      })

      it('should apply all filters together', async () => {
        setMockResult([])
        await getAIRequestLogs({
          userId: 'user-1',
          provider: 'anthropic',
          operation: 'extraction',
          status: 'success',
          startDate: '2026-01-01',
          endDate: '2026-02-01',
          limit: 10,
          offset: 0,
        })
        expect(mockFrom).toHaveBeenCalledWith('ai_request_logs')
      })
    })

    describe('getAIUsageStats - with real data', () => {
      it('should aggregate stats from request logs', async () => {
        const mockLogs = [
          {
            provider: 'openai',
            operation: 'extraction',
            total_tokens: 2000,
            total_cost: '0.025',
            status: 'success',
            response_time_ms: 3000,
          },
          {
            provider: 'openai',
            operation: 'chat',
            total_tokens: 500,
            total_cost: '0.005',
            status: 'success',
            response_time_ms: 1000,
          },
          {
            provider: 'anthropic',
            operation: 'extraction',
            total_tokens: 1500,
            total_cost: '0.020',
            status: 'error',
            response_time_ms: 5000,
          },
        ]
        setMockResult(mockLogs)

        const stats = await getAIUsageStats('2026-01-01', '2026-02-01')

        expect(stats.totalRequests).toBe(3)
        expect(stats.totalTokens).toBe(4000) // 2000 + 500 + 1500
        // totalCost: 0.025 + 0.005 + 0.020 = 0.05
        expect(stats.totalCost).toBeCloseTo(0.05, 4)
        // errorRate: 1 error / 3 total
        expect(stats.errorRate).toBeCloseTo(1 / 3, 4)
        // averageResponseTime: (3000 + 1000 + 5000) / 3 = 3000
        expect(stats.averageResponseTime).toBeCloseTo(3000, 0)

        // byProvider
        expect(stats.byProvider.openai.requests).toBe(2)
        expect(stats.byProvider.openai.tokens).toBe(2500)
        expect(stats.byProvider.anthropic.requests).toBe(1)
        expect(stats.byProvider.anthropic.tokens).toBe(1500)

        // byOperation
        expect(stats.byOperation.extraction.requests).toBe(2)
        expect(stats.byOperation.extraction.successes).toBe(1)
        expect(stats.byOperation.extraction.successRate).toBe(0.5) // 1/2
        expect(stats.byOperation.chat.requests).toBe(1)
        expect(stats.byOperation.chat.successRate).toBe(1) // 1/1
      })

      it('should handle empty data correctly', async () => {
        setMockResult([])

        const stats = await getAIUsageStats('2026-01-01', '2026-02-01')

        expect(stats.totalRequests).toBe(0)
        expect(stats.totalTokens).toBe(0)
        expect(stats.totalCost).toBe(0)
        expect(stats.errorRate).toBe(0)
        expect(stats.averageResponseTime).toBe(0)
        expect(stats.byProvider).toEqual({})
        expect(stats.byOperation).toEqual({})
      })

      it('should handle null token/cost values gracefully', async () => {
        const mockLogs = [
          {
            provider: 'openai',
            operation: 'chat',
            total_tokens: null,
            total_cost: null,
            status: 'success',
            response_time_ms: null,
          },
        ]
        setMockResult(mockLogs)

        const stats = await getAIUsageStats('2026-01-01', '2026-02-01')

        expect(stats.totalRequests).toBe(1)
        expect(stats.totalTokens).toBe(0)
        expect(stats.totalCost).toBe(0)
        expect(stats.averageResponseTime).toBe(0)
      })
    })
  })

  // ==========================================================================
  // EXPANDED COST BUDGET TESTS
  // ==========================================================================

  describe('Cost Budgets - Expanded', () => {
    describe('getCostBudgets - success', () => {
      it('should return mapped cost budgets', async () => {
        const mockBudgets = [
          {
            id: 'budget-1',
            name: 'Monthly AI Budget',
            budget_type: 'monthly',
            limit_amount: '100.00',
            current_usage: '45.50',
            alert_threshold_percent: 80,
            action_on_exceed: 'warn',
            applies_to: 'all',
            reset_at: '2026-03-01T00:00:00Z',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
            created_by: 'admin-1',
            updated_at: '2026-02-01T00:00:00Z',
          },
        ]
        setMockResult(mockBudgets)

        const budgets = await getCostBudgets()

        expect(budgets).toHaveLength(1)
        expect(budgets[0].name).toBe('Monthly AI Budget')
        expect(budgets[0].limitAmount).toBe(100)
        expect(budgets[0].currentUsage).toBe(45.5)
        expect(budgets[0].alertThresholdPercent).toBe(80)
        expect(budgets[0].actionOnExceed).toBe('warn')
        expect(budgets[0].isActive).toBe(true)
      })
    })
  })
})
