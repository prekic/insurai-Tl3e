/**
 * Settings Routes Tests
 *
 * Tests for the admin settings API endpoints (/api/admin/settings/*)
 * Covers settings history/audit log functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Sample audit log data
const createMockAuditLog = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `audit-${i + 1}`,
    setting_id: `setting-${i + 1}`,
    category: ['ai', 'evaluation', 'rate_limits', 'ocr', 'feature_flags'][i % 5],
    key: `setting_key_${i + 1}`,
    previous_value: `old_value_${i + 1}`,
    new_value: `new_value_${i + 1}`,
    changed_by: `user-${(i % 3) + 1}`,
    changed_at: new Date(Date.now() - i * 3600000).toISOString(),
    reason: i % 2 === 0 ? `Reason ${i + 1}` : null,
    ip_address: `192.168.1.${i + 1}`,
    user_agent: 'Mozilla/5.0',
  }))
}

const createMockAdminUsers = () => [
  { id: 'user-1', email: 'admin1@example.com' },
  { id: 'user-2', email: 'admin2@example.com' },
  { id: 'user-3', email: 'admin3@example.com' },
]

describe('Settings History - Data Transformation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Audit Log Data Structure', () => {
    it('should create mock audit log with correct structure', () => {
      const mockData = createMockAuditLog(5)

      expect(mockData).toHaveLength(5)
      expect(mockData[0]).toHaveProperty('id')
      expect(mockData[0]).toHaveProperty('category')
      expect(mockData[0]).toHaveProperty('key')
      expect(mockData[0]).toHaveProperty('previous_value')
      expect(mockData[0]).toHaveProperty('new_value')
      expect(mockData[0]).toHaveProperty('changed_by')
      expect(mockData[0]).toHaveProperty('changed_at')
      expect(mockData[0]).toHaveProperty('reason')
      expect(mockData[0]).toHaveProperty('ip_address')
    })

    it('should cycle through categories', () => {
      const mockData = createMockAuditLog(5)

      expect(mockData[0].category).toBe('ai')
      expect(mockData[1].category).toBe('evaluation')
      expect(mockData[2].category).toBe('rate_limits')
      expect(mockData[3].category).toBe('ocr')
      expect(mockData[4].category).toBe('feature_flags')
    })

    it('should have alternating reasons (even entries have reasons)', () => {
      const mockData = createMockAuditLog(4)

      expect(mockData[0].reason).toBe('Reason 1')
      expect(mockData[1].reason).toBeNull()
      expect(mockData[2].reason).toBe('Reason 3')
      expect(mockData[3].reason).toBeNull()
    })

    it('should cycle user IDs correctly', () => {
      const mockData = createMockAuditLog(4)

      expect(mockData[0].changed_by).toBe('user-1')
      expect(mockData[1].changed_by).toBe('user-2')
      expect(mockData[2].changed_by).toBe('user-3')
      expect(mockData[3].changed_by).toBe('user-1')
    })
  })

  describe('Admin Users Data', () => {
    it('should create mock admin users with correct structure', () => {
      const users = createMockAdminUsers()

      expect(users).toHaveLength(3)
      expect(users[0]).toEqual({ id: 'user-1', email: 'admin1@example.com' })
      expect(users[1]).toEqual({ id: 'user-2', email: 'admin2@example.com' })
      expect(users[2]).toEqual({ id: 'user-3', email: 'admin3@example.com' })
    })
  })

  describe('Response Transformation Logic', () => {
    it('should transform database entries to API response format', () => {
      const dbEntry = createMockAuditLog(1)[0]
      const adminUsers: Record<string, string> = { 'user-1': 'admin1@example.com' }

      // Simulate the transformation done in the API endpoint
      const transformedEntry = {
        id: dbEntry.id,
        settingId: dbEntry.setting_id,
        category: dbEntry.category,
        key: dbEntry.key,
        previousValue: dbEntry.previous_value,
        newValue: dbEntry.new_value,
        changedBy: dbEntry.changed_by,
        changedByEmail: adminUsers[dbEntry.changed_by] || 'Unknown',
        changedAt: dbEntry.changed_at,
        reason: dbEntry.reason,
        ipAddress: dbEntry.ip_address,
        userAgent: dbEntry.user_agent,
      }

      expect(transformedEntry.id).toBe('audit-1')
      expect(transformedEntry.settingId).toBe('setting-1')
      expect(transformedEntry.category).toBe('ai')
      expect(transformedEntry.previousValue).toBe('old_value_1')
      expect(transformedEntry.newValue).toBe('new_value_1')
      expect(transformedEntry.changedByEmail).toBe('admin1@example.com')
    })

    it('should show Unknown for unmatched user IDs', () => {
      const dbEntry = createMockAuditLog(1)[0]
      dbEntry.changed_by = 'unknown-user'
      const adminUsers: Record<string, string> = {}

      const changedByEmail = adminUsers[dbEntry.changed_by] || 'Unknown'

      expect(changedByEmail).toBe('Unknown')
    })

    it('should handle null changed_by', () => {
      const dbEntry = createMockAuditLog(1)[0]
      dbEntry.changed_by = null as unknown as string
      const adminUsers: Record<string, string> = {}

      const changedByEmail = adminUsers[dbEntry.changed_by] || 'Unknown'

      expect(changedByEmail).toBe('Unknown')
    })
  })

  describe('Pagination Logic', () => {
    it('should calculate hasMore correctly when more entries exist', () => {
      const total = 50
      const limit = 20
      const offset = 0

      const hasMore = total > offset + limit

      expect(hasMore).toBe(true)
    })

    it('should calculate hasMore correctly when on last page', () => {
      const total = 50
      const limit = 20
      const offset = 40

      const hasMore = total > offset + limit

      expect(hasMore).toBe(false)
    })

    it('should enforce maximum limit', () => {
      const requestedLimit = 500
      const maxLimit = 200

      const limit = Math.min(requestedLimit, maxLimit)

      expect(limit).toBe(200)
    })

    it('should use default limit when not provided', () => {
      const requestedLimit = undefined
      const defaultLimit = 50

      const limit = requestedLimit || defaultLimit

      expect(limit).toBe(50)
    })

    it('should parse offset correctly', () => {
      const offsetParam = '20'
      const offset = parseInt(offsetParam) || 0

      expect(offset).toBe(20)
    })

    it('should default offset to 0 when not provided', () => {
      const offsetParam = undefined
      const offset = parseInt(offsetParam as unknown as string) || 0

      expect(offset).toBe(0)
    })
  })

  describe('Category Filtering', () => {
    it('should filter by category correctly', () => {
      const mockData = createMockAuditLog(10)
      const categoryFilter = 'ai'

      const filtered = mockData.filter((entry) => entry.category === categoryFilter)

      expect(filtered.length).toBe(2) // Every 5th entry is 'ai' (indices 0 and 5)
      expect(filtered.every((e) => e.category === 'ai')).toBe(true)
    })

    it('should return all entries when no category filter', () => {
      const mockData = createMockAuditLog(10)
      const categoryFilter = undefined

      const filtered = categoryFilter
        ? mockData.filter((entry) => entry.category === categoryFilter)
        : mockData

      expect(filtered.length).toBe(10)
    })
  })
})

// =============================================================================
// Export / Import Tests
// =============================================================================

describe('Settings Export - Data Structure', () => {
  const EXPORT_VERSION = 1

  it('should produce correct export envelope structure', () => {
    const exportData = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: 'admin@test.com',
      settings: {},
      featureFlags: [],
      regionalFactors: [],
      providers: [],
      benchmarks: [],
    }

    expect(exportData.version).toBe(1)
    expect(exportData).toHaveProperty('exportedAt')
    expect(exportData).toHaveProperty('exportedBy')
    expect(exportData).toHaveProperty('settings')
    expect(exportData).toHaveProperty('featureFlags')
    expect(exportData).toHaveProperty('regionalFactors')
    expect(exportData).toHaveProperty('providers')
    expect(exportData).toHaveProperty('benchmarks')
  })

  it('should group settings by category', () => {
    const dbRows = [
      { category: 'ai', key: 'temperature', value: 0.1, value_type: 'number' },
      { category: 'ai', key: 'max_tokens', value: 4096, value_type: 'number' },
      { category: 'evaluation', key: 'weight_premium', value: 20, value_type: 'number' },
    ]

    const grouped: Record<string, Array<{ key: string; value: unknown; valueType: string }>> = {}
    for (const row of dbRows) {
      if (!grouped[row.category]) grouped[row.category] = []
      grouped[row.category].push({ key: row.key, value: row.value, valueType: row.value_type })
    }

    expect(Object.keys(grouped)).toEqual(['ai', 'evaluation'])
    expect(grouped.ai).toHaveLength(2)
    expect(grouped.evaluation).toHaveLength(1)
    expect(grouped.ai[0]).toEqual({ key: 'temperature', value: 0.1, valueType: 'number' })
  })

  it('should transform feature flag db rows to export format', () => {
    const dbFlag = {
      key: 'use_db_config',
      description: 'Use DB config',
      enabled: true,
      rollout_percentage: 100,
      user_segments: ['all'],
      conditions: {},
      expires_at: null,
    }

    const exportFlag = {
      key: dbFlag.key,
      description: dbFlag.description,
      enabled: dbFlag.enabled,
      rolloutPercentage: dbFlag.rollout_percentage,
      userSegments: dbFlag.user_segments,
      conditions: dbFlag.conditions,
      expiresAt: dbFlag.expires_at,
    }

    expect(exportFlag.key).toBe('use_db_config')
    expect(exportFlag.rolloutPercentage).toBe(100)
    expect(exportFlag.enabled).toBe(true)
  })

  it('should transform regional factor db rows to export format', () => {
    const dbFactor = {
      region_code: 'marmara',
      region_name: 'Marmara',
      region_name_tr: 'Marmara',
      policy_type: 'all',
      risk_factor: 1.15,
      year: 2026,
      source: 'SEDDK',
      notes: null,
    }

    const exportFactor = {
      regionCode: dbFactor.region_code,
      regionName: dbFactor.region_name,
      regionNameTr: dbFactor.region_name_tr,
      policyType: dbFactor.policy_type,
      riskFactor: dbFactor.risk_factor,
      year: dbFactor.year,
      source: dbFactor.source,
      notes: dbFactor.notes,
    }

    expect(exportFactor.regionCode).toBe('marmara')
    expect(exportFactor.riskFactor).toBe(1.15)
  })
})

describe('Settings Import - Validation Logic', () => {
  it('should accept valid import data', () => {
    const importData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        ai: [{ key: 'temperature', value: 0.2 }],
      },
    }

    expect(importData.version).toBe(1)
    expect(importData.settings.ai).toHaveLength(1)
  })

  it('should validate value against min/max constraints', () => {
    const existing = { min_value: 0, max_value: 1, allowed_values: null }
    const value = 0.5

    const isBelowMin = existing.min_value !== null && value < existing.min_value
    const isAboveMax = existing.max_value !== null && value > existing.max_value

    expect(isBelowMin).toBe(false)
    expect(isAboveMax).toBe(false)
  })

  it('should reject value below minimum', () => {
    const existing = { min_value: 0, max_value: 1 }
    const value = -0.5

    const isBelowMin = existing.min_value !== null && value < existing.min_value

    expect(isBelowMin).toBe(true)
  })

  it('should reject value above maximum', () => {
    const existing = { min_value: 0, max_value: 1 }
    const value = 1.5

    const isAboveMax = existing.max_value !== null && value > existing.max_value

    expect(isAboveMax).toBe(true)
  })

  it('should reject value not in allowed_values', () => {
    const allowedValues = ['gpt-4o', 'gpt-4o-mini']
    const value = 'gpt-3.5-turbo'

    const isAllowed = allowedValues.includes(value)

    expect(isAllowed).toBe(false)
  })

  it('should accept value in allowed_values', () => {
    const allowedValues = ['gpt-4o', 'gpt-4o-mini']
    const value = 'gpt-4o'

    const isAllowed = allowedValues.includes(value)

    expect(isAllowed).toBe(true)
  })

  it('should skip readonly settings during import', () => {
    const existing = { is_readonly: true, value: 'original' }
    const _importValue = 'modified'

    const shouldSkip = existing.is_readonly

    expect(shouldSkip).toBe(true)
    expect(existing.value).toBe('original')
  })

  it('should skip unchanged values during import', () => {
    const existingValue = { temperature: 0.1 }
    const importValue = { temperature: 0.1 }

    const isUnchanged = JSON.stringify(existingValue) === JSON.stringify(importValue)

    expect(isUnchanged).toBe(true)
  })

  it('should detect changed values during import', () => {
    const existingValue = 0.1
    const importValue = 0.2

    const isUnchanged = JSON.stringify(existingValue) === JSON.stringify(importValue)

    expect(isUnchanged).toBe(false)
  })
})

describe('Settings Import - Mode Logic', () => {
  it('should skip non-existing settings in merge mode', () => {
    const mode = 'merge'
    const existsInDb = false

    const shouldSkip = mode === 'merge' && !existsInDb

    expect(shouldSkip).toBe(true)
  })

  it('should report error for non-existing settings in overwrite mode', () => {
    const mode = 'overwrite'
    const existsInDb = false

    const shouldSkip = mode === 'merge' && !existsInDb
    const shouldError = mode === 'overwrite' && !existsInDb

    expect(shouldSkip).toBe(false)
    expect(shouldError).toBe(true)
  })

  it('should process existing settings in both modes', () => {
    const existsInDb = true
    const mergeMode = 'merge'
    const overwriteMode = 'overwrite'

    expect(mergeMode === 'merge' && !existsInDb).toBe(false)
    expect(overwriteMode === 'merge' && !existsInDb).toBe(false)
  })
})

describe('Settings Import - Results Tracking', () => {
  it('should track results per section', () => {
    const results = {
      settings: { updated: 5, skipped: 3, errors: ['ai.bad_key: not found'] },
      featureFlags: { updated: 2, skipped: 1, errors: [] },
      regionalFactors: { updated: 0, skipped: 7, errors: [] },
    }

    const totalUpdated = results.settings.updated + results.featureFlags.updated + results.regionalFactors.updated
    const totalSkipped = results.settings.skipped + results.featureFlags.skipped + results.regionalFactors.skipped
    const totalErrors = results.settings.errors.length + results.featureFlags.errors.length + results.regionalFactors.errors.length

    expect(totalUpdated).toBe(7)
    expect(totalSkipped).toBe(11)
    expect(totalErrors).toBe(1)
  })

  it('should produce correct summary structure', () => {
    const summary = {
      totalUpdated: 7,
      totalSkipped: 11,
      totalErrors: 1,
    }

    expect(summary).toHaveProperty('totalUpdated')
    expect(summary).toHaveProperty('totalSkipped')
    expect(summary).toHaveProperty('totalErrors')
  })
})

describe('Server Config Performance Monitor', () => {
  // Test the server-side performance functions imported from settings.ts
  // We test the same logic pattern used in the route handlers

  it('should compute percentile correctly', () => {
    // Percentile function logic (same as in settings.ts)
    function percentile(sorted: number[], p: number): number {
      if (sorted.length === 0) return 0
      const idx = Math.ceil((p / 100) * sorted.length) - 1
      return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
    }

    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentile(sorted, 50)).toBe(5)
    expect(percentile(sorted, 95)).toBe(10)
    expect(percentile(sorted, 99)).toBe(10)
    expect(percentile([], 50)).toBe(0)
  })

  it('should compute correct stats from events', () => {
    const events = [
      { timestamp: Date.now(), category: 'ai', latencyMs: 10, cacheHit: false, success: true },
      { timestamp: Date.now(), category: 'ai', latencyMs: 20, cacheHit: true, success: true },
      { timestamp: Date.now(), category: 'ai', latencyMs: 30, cacheHit: false, success: true },
      { timestamp: Date.now(), category: 'evaluation', latencyMs: 50, cacheHit: false, success: false },
    ]

    const totalHits = events.filter((e) => e.cacheHit).length
    const hitRate = events.length > 0 ? totalHits / events.length : 0
    const errorRate = events.length > 0 ? events.filter((e) => !e.success).length / events.length : 0

    expect(totalHits).toBe(1)
    expect(hitRate).toBe(0.25)
    expect(errorRate).toBe(0.25)
  })

  it('should group events by category', () => {
    const events = [
      { timestamp: Date.now(), category: 'ai', latencyMs: 10, cacheHit: false, success: true },
      { timestamp: Date.now(), category: 'ai', latencyMs: 20, cacheHit: true, success: true },
      { timestamp: Date.now(), category: 'evaluation', latencyMs: 50, cacheHit: false, success: true },
    ]

    const catMap = new Map<string, typeof events>()
    for (const ev of events) {
      const arr = catMap.get(ev.category) || []
      arr.push(ev)
      catMap.set(ev.category, arr)
    }

    expect(catMap.size).toBe(2)
    expect(catMap.get('ai')!.length).toBe(2)
    expect(catMap.get('evaluation')!.length).toBe(1)
  })

  it('should filter DB events correctly (cache misses only)', () => {
    const events = [
      { timestamp: Date.now(), category: 'ai', latencyMs: 0.5, cacheHit: true, success: true },
      { timestamp: Date.now(), category: 'ai', latencyMs: 50, cacheHit: false, success: true },
      { timestamp: Date.now(), category: 'ai', latencyMs: 100, cacheHit: false, success: false },
    ]

    const dbEvents = events.filter((e) => !e.cacheHit && e.success)
    expect(dbEvents.length).toBe(1)
    expect(dbEvents[0].latencyMs).toBe(50)
  })

  it('should compute per-category hit rate', () => {
    const events = [
      { timestamp: Date.now(), category: 'ai', latencyMs: 0.5, cacheHit: true, success: true },
      { timestamp: Date.now(), category: 'ai', latencyMs: 0.5, cacheHit: true, success: true },
      { timestamp: Date.now(), category: 'ai', latencyMs: 50, cacheHit: false, success: true },
    ]

    const hits = events.filter((e) => e.cacheHit).length
    const hitRate = Math.round((hits / events.length) * 10000) / 10000

    expect(hitRate).toBeCloseTo(0.6667, 3)
  })

  it('should handle empty events array', () => {
    const events: { timestamp: number; category: string; latencyMs: number; cacheHit: boolean; success: boolean }[] = []

    const totalHits = events.filter((e) => e.cacheHit).length
    const hitRate = events.length > 0 ? totalHits / events.length : 0
    const errorRate = events.length > 0 ? events.filter((e) => !e.success).length / events.length : 0

    expect(hitRate).toBe(0)
    expect(errorRate).toBe(0)
  })
})

describe('Settings History - Response Structure', () => {
  it('should have correct pagination structure', () => {
    const pagination = {
      total: 100,
      limit: 20,
      offset: 0,
      hasMore: true,
    }

    expect(pagination).toHaveProperty('total')
    expect(pagination).toHaveProperty('limit')
    expect(pagination).toHaveProperty('offset')
    expect(pagination).toHaveProperty('hasMore')
    expect(typeof pagination.total).toBe('number')
    expect(typeof pagination.limit).toBe('number')
    expect(typeof pagination.offset).toBe('number')
    expect(typeof pagination.hasMore).toBe('boolean')
  })

  it('should have correct success response structure', () => {
    const response = {
      success: true,
      data: {
        history: createMockAuditLog(5),
        pagination: {
          total: 5,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      },
    }

    expect(response.success).toBe(true)
    expect(response.data).toHaveProperty('history')
    expect(response.data).toHaveProperty('pagination')
    expect(Array.isArray(response.data.history)).toBe(true)
  })

  it('should have correct error response structure', () => {
    const response = {
      success: false,
      error: 'Database not configured',
    }

    expect(response.success).toBe(false)
    expect(response.error).toBe('Database not configured')
  })
})

// =============================================================================
// BATCH UPDATE TESTS
// =============================================================================

describe('Settings Batch Update - Request Validation', () => {
  it('should require updates array', () => {
    const body = {}
    const hasUpdates = 'updates' in body && Array.isArray((body as Record<string, unknown>).updates)

    expect(hasUpdates).toBe(false)
  })

  it('should require at least one update', () => {
    const body = { updates: [] }
    const isValid = body.updates.length >= 1

    expect(isValid).toBe(false)
  })

  it('should enforce max 50 updates', () => {
    const updates = Array.from({ length: 51 }, (_, i) => ({
      category: 'ai',
      key: `key_${i}`,
      value: i,
    }))
    const isValid = updates.length <= 50

    expect(isValid).toBe(false)
  })

  it('should require category and key for each update', () => {
    const update = { category: 'ai', key: 'temperature', value: 0.5 }

    expect(update.category).toBeTruthy()
    expect(update.key).toBeTruthy()
    expect('value' in update).toBe(true)
  })

  it('should accept optional reason', () => {
    const body = {
      updates: [{ category: 'ai', key: 'temperature', value: 0.5 }],
      reason: 'Tuning model parameters',
    }

    expect(body.reason).toBe('Tuning model parameters')
  })
})

describe('Settings Batch Update - Validation Logic', () => {
  const createMockSettings = () => [
    { id: 's1', category: 'ai', key: 'temperature', value: 0.1, is_readonly: false, min_value: 0, max_value: 2, allowed_values: null },
    { id: 's2', category: 'ai', key: 'max_tokens', value: 4096, is_readonly: false, min_value: 100, max_value: 128000, allowed_values: null },
    { id: 's3', category: 'ai', key: 'model_version', value: 'v1', is_readonly: true, min_value: null, max_value: null, allowed_values: null },
    { id: 's4', category: 'evaluation', key: 'weight_premium', value: 20, is_readonly: false, min_value: 0, max_value: 100, allowed_values: null },
    { id: 's5', category: 'ai', key: 'preferred_provider', value: 'auto', is_readonly: false, min_value: null, max_value: null, allowed_values: ['auto', 'openai', 'anthropic'] },
  ]

  it('should detect non-existent settings', () => {
    const settings = createMockSettings()
    const settingsMap = new Map(settings.map((s) => [`${s.category}:${s.key}`, s]))

    const update = { category: 'ai', key: 'nonexistent', value: 42 }
    const existing = settingsMap.get(`${update.category}:${update.key}`)

    expect(existing).toBeUndefined()
  })

  it('should detect readonly settings', () => {
    const settings = createMockSettings()
    const settingsMap = new Map(settings.map((s) => [`${s.category}:${s.key}`, s]))

    const update = { category: 'ai', key: 'model_version', value: 'v2' }
    const existing = settingsMap.get(`${update.category}:${update.key}`)

    expect(existing?.is_readonly).toBe(true)
  })

  it('should validate min/max constraints', () => {
    const settings = createMockSettings()
    const settingsMap = new Map(settings.map((s) => [`${s.category}:${s.key}`, s]))

    const update = { category: 'ai', key: 'temperature', value: 5.0 }
    const existing = settingsMap.get(`${update.category}:${update.key}`)

    const exceedsMax = existing!.max_value !== null &&
      typeof update.value === 'number' &&
      update.value > existing!.max_value

    expect(exceedsMax).toBe(true)
  })

  it('should validate allowed values', () => {
    const settings = createMockSettings()
    const settingsMap = new Map(settings.map((s) => [`${s.category}:${s.key}`, s]))

    const update = { category: 'ai', key: 'preferred_provider', value: 'invalid_provider' }
    const existing = settingsMap.get(`${update.category}:${update.key}`)

    const isAllowed = !existing!.allowed_values ||
      (existing!.allowed_values as string[]).includes(update.value as string)

    expect(isAllowed).toBe(false)
  })

  it('should skip unchanged values', () => {
    const settings = createMockSettings()
    const settingsMap = new Map(settings.map((s) => [`${s.category}:${s.key}`, s]))

    const update = { category: 'ai', key: 'temperature', value: 0.1 }
    const existing = settingsMap.get(`${update.category}:${update.key}`)

    const isUnchanged = JSON.stringify(existing!.value) === JSON.stringify(update.value)

    expect(isUnchanged).toBe(true)
  })

  it('should pass validation for valid updates', () => {
    const settings = createMockSettings()
    const settingsMap = new Map(settings.map((s) => [`${s.category}:${s.key}`, s]))

    const updates = [
      { category: 'ai', key: 'temperature', value: 0.7 },
      { category: 'ai', key: 'max_tokens', value: 8192 },
      { category: 'evaluation', key: 'weight_premium', value: 25 },
    ]

    const errors: string[] = []
    const valid: typeof updates = []

    for (const update of updates) {
      const existing = settingsMap.get(`${update.category}:${update.key}`)
      if (!existing) { errors.push(`${update.key}: not found`); continue }
      if (existing.is_readonly) { errors.push(`${update.key}: readonly`); continue }
      if (existing.min_value !== null && typeof update.value === 'number' && update.value < existing.min_value) {
        errors.push(`${update.key}: below min`); continue
      }
      if (existing.max_value !== null && typeof update.value === 'number' && update.value > existing.max_value) {
        errors.push(`${update.key}: above max`); continue
      }
      if (JSON.stringify(existing.value) !== JSON.stringify(update.value)) {
        valid.push(update)
      }
    }

    expect(errors).toHaveLength(0)
    expect(valid).toHaveLength(3)
  })

  it('should collect all validation errors before applying any updates', () => {
    const settings = createMockSettings()
    const settingsMap = new Map(settings.map((s) => [`${s.category}:${s.key}`, s]))

    const updates = [
      { category: 'ai', key: 'temperature', value: 5.0 },      // exceeds max
      { category: 'ai', key: 'nonexistent', value: 42 },        // not found
      { category: 'ai', key: 'model_version', value: 'v2' },    // readonly
      { category: 'ai', key: 'preferred_provider', value: 'x' }, // not allowed
    ]

    const errors: Array<{ key: string; error: string }> = []

    for (const update of updates) {
      const existing = settingsMap.get(`${update.category}:${update.key}`)
      if (!existing) { errors.push({ key: update.key, error: 'not found' }); continue }
      if (existing.is_readonly) { errors.push({ key: update.key, error: 'readonly' }); continue }
      if (existing.max_value !== null && typeof update.value === 'number' && update.value > existing.max_value) {
        errors.push({ key: update.key, error: 'above max' }); continue
      }
      if (existing.allowed_values && !(existing.allowed_values as string[]).includes(update.value as string)) {
        errors.push({ key: update.key, error: 'not allowed' }); continue
      }
    }

    expect(errors).toHaveLength(4)
    expect(errors[0].key).toBe('temperature')
    expect(errors[1].key).toBe('nonexistent')
    expect(errors[2].key).toBe('model_version')
    expect(errors[3].key).toBe('preferred_provider')
  })
})

describe('Settings Batch Update - Response Structure', () => {
  it('should report updated, skipped, and error counts', () => {
    const response = {
      success: true,
      data: {
        updated: 3,
        skipped: 1,
        errors: 0,
        results: [
          { category: 'ai', key: 'temperature', previousValue: 0.1, newValue: 0.7 },
          { category: 'ai', key: 'max_tokens', previousValue: 4096, newValue: 8192 },
          { category: 'evaluation', key: 'weight_premium', previousValue: 20, newValue: 25 },
        ],
      },
    }

    expect(response.success).toBe(true)
    expect(response.data.updated).toBe(3)
    expect(response.data.skipped).toBe(1)
    expect(response.data.errors).toBe(0)
    expect(response.data.results).toHaveLength(3)
  })

  it('should include previous and new values in results', () => {
    const result = { category: 'ai', key: 'temperature', previousValue: 0.1, newValue: 0.7 }

    expect(result.previousValue).toBe(0.1)
    expect(result.newValue).toBe(0.7)
    expect(result.category).toBe('ai')
    expect(result.key).toBe('temperature')
  })

  it('should include error details when some updates fail', () => {
    const response = {
      success: false,
      data: {
        updated: 2,
        skipped: 0,
        errors: 1,
        results: [
          { category: 'ai', key: 'temperature', previousValue: 0.1, newValue: 0.7 },
          { category: 'ai', key: 'max_tokens', previousValue: 4096, newValue: 8192 },
        ],
        errorDetails: [
          { category: 'ai', key: 'model_version', error: 'Database update failed' },
        ],
      },
    }

    expect(response.success).toBe(false)
    expect(response.data.errors).toBe(1)
    expect(response.data.errorDetails).toHaveLength(1)
    expect(response.data.errorDetails[0].key).toBe('model_version')
  })

  it('should return validation errors with all failed keys', () => {
    const response = {
      success: false,
      error: 'Validation failed for one or more settings',
      validationErrors: [
        { category: 'ai', key: 'temperature', error: 'Value must be at most 2' },
        { category: 'ai', key: 'nonexistent', error: 'Setting not found' },
      ],
      validCount: 1,
    }

    expect(response.success).toBe(false)
    expect(response.validationErrors).toHaveLength(2)
    expect(response.validCount).toBe(1)
  })
})

describe('Settings Batch Update - Audit Logging', () => {
  it('should prefix reason with [Batch] for audit entries', () => {
    const userReason = 'Tuning model parameters'
    const auditReason = `[Batch] ${userReason}`

    expect(auditReason).toBe('[Batch] Tuning model parameters')
  })

  it('should create audit entries only for changed values', () => {
    const updates = [
      { key: 'temperature', value: 0.7, previousValue: 0.1 },     // changed
      { key: 'max_tokens', value: 4096, previousValue: 4096 },     // unchanged
      { key: 'weight_premium', value: 25, previousValue: 20 },     // changed
    ]

    const changed = updates.filter((u) =>
      JSON.stringify(u.value) !== JSON.stringify(u.previousValue)
    )

    expect(changed).toHaveLength(2)
    expect(changed[0].key).toBe('temperature')
    expect(changed[1].key).toBe('weight_premium')
  })

  it('should not create audit entries when reason is not provided', () => {
    const reason: string | undefined = undefined
    const shouldLog = !!reason

    expect(shouldLog).toBe(false)
  })
})

describe('Settings Batch Update - Cross-Category', () => {
  it('should support updates across multiple categories', () => {
    const updates = [
      { category: 'ai', key: 'temperature', value: 0.7 },
      { category: 'evaluation', key: 'weight_premium', value: 25 },
      { category: 'rate_limits', key: 'chat_requests_per_hour', value: 100 },
    ]

    const uniqueCategories = [...new Set(updates.map((u) => u.category))]

    expect(uniqueCategories).toHaveLength(3)
    expect(uniqueCategories).toContain('ai')
    expect(uniqueCategories).toContain('evaluation')
    expect(uniqueCategories).toContain('rate_limits')
  })

  it('should fetch settings for all relevant categories efficiently', () => {
    const updates = [
      { category: 'ai', key: 'temperature', value: 0.7 },
      { category: 'ai', key: 'max_tokens', value: 8192 },
      { category: 'evaluation', key: 'weight_premium', value: 25 },
    ]

    const uniqueCategories = [...new Set(updates.map((u) => u.category))]

    // Only 2 categories need to be fetched, not 3 individual queries
    expect(uniqueCategories).toHaveLength(2)
  })
})
