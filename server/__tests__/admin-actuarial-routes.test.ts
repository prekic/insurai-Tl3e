/**
 * Admin Actuarial Routes Tests
 *
 * Tests for GET /configs and POST /configs/:name/version endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockLogError,
  mockLogInfo,
  mockLogWarn,
  mockLogDebug,
  mockFrom,
  mockSelect,
  mockEq,
  mockOrder,
  mockLimit,
  _mockSingle,
  mockInsert,
  mockUpdate,
} = vi.hoisted(() => {
  const _mockSingle = vi.fn()
  const mockLimit = vi.fn().mockReturnValue({ single: _mockSingle })
  const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockEq = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockSelect = vi.fn()
  const mockFrom = vi.fn()

  return {
    mockLogError: vi.fn(),
    mockLogInfo: vi.fn(),
    mockLogWarn: vi.fn(),
    mockLogDebug: vi.fn(),
    mockFrom,
    mockSelect,
    mockEq,
    mockOrder,
    mockLimit,
    _mockSingle,
    mockInsert,
    mockUpdate,
  }
})

// Mock persistence service
const { mockPersistEvaluationResult, mockGetEvaluationHistory } = vi.hoisted(() => ({
  mockPersistEvaluationResult: vi.fn(),
  mockGetEvaluationHistory: vi.fn(),
}))

vi.mock('../services/actuarial-persistence.js', () => ({
  persistEvaluationResult: mockPersistEvaluationResult,
  getEvaluationHistory: mockGetEvaluationHistory,
}))

// Mock logger
vi.mock('../lib/logger.js', () => {
  const child = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: { ...child, child: vi.fn(() => child) },
    logger: { ...child, child: vi.fn(() => child) },
  }
})

// Mock the shared module
vi.mock('../routes/admin/shared.js', () => {
  const loggerChild = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    authenticateAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
    requireSuperAdmin: () => [(_req: unknown, _res: unknown, next: () => void) => next()],
    requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    logAdminAction: vi.fn().mockResolvedValue(undefined),
    getSupabaseWithError: vi.fn().mockReturnValue({
      client: { from: mockFrom },
      error: null,
    }),
    qstr: (val: string | string[] | undefined) => {
      if (Array.isArray(val)) return val[0] ?? ''
      return val ?? ''
    },
    logger: {
      ...loggerChild,
      child: vi.fn(() => loggerChild),
    },
    authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  }
})

// ---------------------------------------------------------------------------
// App Setup
// ---------------------------------------------------------------------------

import actuarialRouter from '../routes/admin/actuarial.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
    req.adminUser = {
      id: 'admin-test-001',
      email: 'admin@test.com',
      role: 'super_admin',
      status: 'active',
      permissions: [],
    }
    next()
  })
  app.use('/', actuarialRouter)
  return app
}

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const MOCK_CONFIG_SETS = [
  {
    id: 'cs-001',
    name: 'monte_carlo_defaults',
    description: 'Monte Carlo simulation parameters',
    config_type: 'monte_carlo',
    is_active: true,
    updated_at: '2026-02-28T10:00:00Z',
    versions: [
      {
        id: 'v-001',
        version: 3,
        config_data: { numSimulations: 10000, seed: 42 },
        change_summary: 'Increased simulation count',
        created_at: '2026-02-28T10:00:00Z',
      },
    ],
  },
  {
    id: 'cs-002',
    name: 'topsis_criteria_defaults',
    description: 'TOPSIS ranking criteria',
    config_type: 'topsis',
    is_active: true,
    updated_at: '2026-02-28T09:00:00Z',
    versions: [],
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /configs', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  function setupSupabaseChain(data: unknown, error: unknown = null) {
    mockLimit.mockReturnValue({ data, error })
    mockOrder.mockReturnValue({ limit: mockLimit })
    // eq is called twice: .eq('is_active', true) then .eq('versions.is_active', true)
    mockEq.mockReturnValueOnce({ eq: mockEq }).mockReturnValueOnce({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
  }

  it('returns transformed config sets with latest version', async () => {
    setupSupabaseChain(MOCK_CONFIG_SETS)

    const res = await request(app).get('/configs')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(2)

    // First config set has a version
    const first = res.body.data[0]
    expect(first.name).toBe('monte_carlo_defaults')
    expect(first.configType).toBe('monte_carlo')
    expect(first.isActive).toBe(true)
    expect(first.latestVersion).toBeTruthy()
    expect(first.latestVersion.version).toBe(3)
    expect(first.latestVersion.configData).toEqual({ numSimulations: 10000, seed: 42 })

    // Second config set has no versions
    const second = res.body.data[1]
    expect(second.name).toBe('topsis_criteria_defaults')
    expect(second.latestVersion).toBeNull()
  })

  it('returns empty array when no active config sets exist', async () => {
    setupSupabaseChain([])

    const res = await request(app).get('/configs')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual([])
  })

  it('returns 500 on Supabase query error', async () => {
    setupSupabaseChain(null, { message: 'Database connection failed' })

    const res = await request(app).get('/configs')

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('Failed to fetch actuarial configs')
    expect(mockLogError).toHaveBeenCalled()
  })

  it('returns 503 when database is not configured', async () => {
    const { getSupabaseWithError } = await import('../routes/admin/shared.js')
    vi.mocked(getSupabaseWithError).mockReturnValueOnce({
      client: null,
      error: 'SUPABASE_URL not set',
    })

    const res = await request(app).get('/configs')

    expect(res.status).toBe(503)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('SUPABASE_URL not set')
  })

  it('queries with correct Supabase filter chain', async () => {
    setupSupabaseChain([])

    await request(app).get('/configs')

    expect(mockFrom).toHaveBeenCalledWith('actuarial_config_sets')
    expect(mockEq).toHaveBeenCalledWith('is_active', true)
    expect(mockEq).toHaveBeenCalledWith('versions.is_active', true)
    expect(mockOrder).toHaveBeenCalledWith('version', {
      ascending: false,
      referencedTable: 'actuarial_config_set_versions',
    })
    expect(mockLimit).toHaveBeenCalledWith(1, {
      referencedTable: 'actuarial_config_set_versions',
    })
  })
})

describe('POST /configs/:name/version', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  it('creates a new version for an existing config set', async () => {
    // Step 1: find config set
    const singleConfigSet = vi.fn().mockResolvedValue({
      data: { id: 'cs-001' },
      error: null,
    })
    const eqName = vi.fn().mockReturnValue({ single: singleConfigSet })
    const selectId = vi.fn().mockReturnValue({ eq: eqName })

    // Step 2: find max version
    const singleMaxVersion = vi.fn().mockResolvedValue({
      data: { version: 5 },
      error: null,
    })
    const limitMaxVersion = vi.fn().mockReturnValue({ single: singleMaxVersion })
    const orderMaxVersion = vi.fn().mockReturnValue({ limit: limitMaxVersion })
    const eqConfigSetId = vi.fn().mockReturnValue({ order: orderMaxVersion })
    const selectVersion = vi.fn().mockReturnValue({ eq: eqConfigSetId })

    // Step 3: insert new version
    const singleInsert = vi.fn().mockResolvedValue({
      data: {
        id: 'v-new',
        config_set_id: 'cs-001',
        version: 6,
        config_data: { numSimulations: 20000 },
        change_summary: 'Doubled simulations',
        is_active: true,
        created_at: '2026-02-28T12:00:00Z',
      },
      error: null,
    })
    const selectInserted = vi.fn().mockReturnValue({ single: singleInsert })
    mockInsert.mockReturnValue({ select: selectInserted })

    let fromCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'actuarial_config_sets') {
        return { select: selectId }
      }
      if (table === 'actuarial_config_set_versions') {
        if (fromCallCount === 2) {
          return { select: selectVersion }
        }
        return { insert: mockInsert }
      }
      return {}
    })

    const res = await request(app)
      .post('/configs/monte_carlo_defaults/version')
      .send({ configData: { numSimulations: 20000 }, changeSummary: 'Doubled simulations' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.version).toBe(6)
  })

  it('returns 400 when configData is missing', async () => {
    const res = await request(app)
      .post('/configs/monte_carlo_defaults/version')
      .send({ changeSummary: 'No data' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('configData is required')
  })

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/configs/monte_carlo_defaults/version').send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('configData is required')
  })

  it('returns 404 when config set does not exist', async () => {
    const singleNotFound = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Row not found', code: 'PGRST116' },
    })
    const eqName = vi.fn().mockReturnValue({ single: singleNotFound })
    const selectId = vi.fn().mockReturnValue({ eq: eqName })
    mockFrom.mockReturnValue({ select: selectId })

    const res = await request(app)
      .post('/configs/nonexistent_config/version')
      .send({ configData: { key: 'value' } })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Config set not found')
  })

  it('returns 503 when database is not configured', async () => {
    const { getSupabaseWithError } = await import('../routes/admin/shared.js')
    vi.mocked(getSupabaseWithError).mockReturnValueOnce({
      client: null,
      error: 'Database not configured',
    })

    const res = await request(app)
      .post('/configs/monte_carlo_defaults/version')
      .send({ configData: { key: 'value' } })

    expect(res.status).toBe(503)
    expect(res.body.error).toBe('Database not configured')
  })

  it('uses default change summary when none provided', async () => {
    // Step 1: find config set
    const singleConfigSet = vi.fn().mockResolvedValue({
      data: { id: 'cs-001' },
      error: null,
    })
    const eqName = vi.fn().mockReturnValue({ single: singleConfigSet })
    const selectId = vi.fn().mockReturnValue({ eq: eqName })

    // Step 2: no existing versions
    const singleMaxVersion = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Row not found' },
    })
    const limitMaxVersion = vi.fn().mockReturnValue({ single: singleMaxVersion })
    const orderMaxVersion = vi.fn().mockReturnValue({ limit: limitMaxVersion })
    const eqConfigSetId = vi.fn().mockReturnValue({ order: orderMaxVersion })
    const selectVersion = vi.fn().mockReturnValue({ eq: eqConfigSetId })

    // Step 3: insert
    const singleInsert = vi.fn().mockResolvedValue({
      data: {
        id: 'v-001',
        config_set_id: 'cs-001',
        version: 1,
        config_data: { seed: 99 },
        change_summary: 'Updated via Admin UI',
        is_active: true,
        created_at: '2026-02-28T12:00:00Z',
      },
      error: null,
    })
    const selectInserted = vi.fn().mockReturnValue({ single: singleInsert })
    mockInsert.mockReturnValue({ select: selectInserted })

    let fromCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'actuarial_config_sets') {
        return { select: selectId }
      }
      if (table === 'actuarial_config_set_versions') {
        if (fromCallCount === 2) {
          return { select: selectVersion }
        }
        return { insert: mockInsert }
      }
      return {}
    })

    const res = await request(app)
      .post('/configs/monte_carlo_defaults/version')
      .send({ configData: { seed: 99 } })

    expect(res.status).toBe(200)
    // Version starts at 1 when no existing versions
    expect(res.body.data.version).toBe(1)
    expect(res.body.data.change_summary).toBe('Updated via Admin UI')
  })

  it('returns 500 on insert error', async () => {
    // Step 1: find config set
    const singleConfigSet = vi.fn().mockResolvedValue({
      data: { id: 'cs-001' },
      error: null,
    })
    const eqName = vi.fn().mockReturnValue({ single: singleConfigSet })
    const selectId = vi.fn().mockReturnValue({ eq: eqName })

    // Step 2: existing version
    const singleMaxVersion = vi.fn().mockResolvedValue({
      data: { version: 1 },
      error: null,
    })
    const limitMaxVersion = vi.fn().mockReturnValue({ single: singleMaxVersion })
    const orderMaxVersion = vi.fn().mockReturnValue({ limit: limitMaxVersion })
    const eqConfigSetId = vi.fn().mockReturnValue({ order: orderMaxVersion })
    const selectVersion = vi.fn().mockReturnValue({ eq: eqConfigSetId })

    // Step 3: insert fails
    const singleInsert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Unique constraint violated' },
    })
    const selectInserted = vi.fn().mockReturnValue({ single: singleInsert })
    mockInsert.mockReturnValue({ select: selectInserted })

    let fromCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'actuarial_config_sets') {
        return { select: selectId }
      }
      if (table === 'actuarial_config_set_versions') {
        if (fromCallCount === 2) {
          return { select: selectVersion }
        }
        return { insert: mockInsert }
      }
      return {}
    })

    const res = await request(app)
      .post('/configs/monte_carlo_defaults/version')
      .send({ configData: { key: 'value' } })

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(mockLogError).toHaveBeenCalled()
  })
})

describe('POST /evaluation-results', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  it('persists evaluation result and returns ID', async () => {
    mockPersistEvaluationResult.mockResolvedValue('result-uuid-123')

    const res = await request(app)
      .post('/evaluation-results')
      .send({
        policyId: 'policy-123',
        resultData: { score: 0.95 },
        eligible: true,
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe('result-uuid-123')
    expect(mockPersistEvaluationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        policyId: 'policy-123',
        resultData: { score: 0.95 },
        eligible: true,
      })
    )
  })

  it('returns 400 when policyId is missing', async () => {
    const res = await request(app)
      .post('/evaluation-results')
      .send({ resultData: { score: 0.95 } })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('policyId and resultData are required')
  })

  it('returns 400 when resultData is missing', async () => {
    const res = await request(app).post('/evaluation-results').send({ policyId: 'policy-123' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('policyId and resultData are required')
  })

  it('returns 500 when persistence fails', async () => {
    mockPersistEvaluationResult.mockResolvedValue(null)

    const res = await request(app)
      .post('/evaluation-results')
      .send({ policyId: 'policy-123', resultData: { score: 0.95 } })

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
  })

  it('handles server error during persistence', async () => {
    mockPersistEvaluationResult.mockRejectedValue(new Error('DB Error'))

    const res = await request(app)
      .post('/evaluation-results')
      .send({ policyId: 'policy-123', resultData: { score: 0.95 } })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Server error persisting evaluation result')
  })
})

describe('GET /evaluation-results', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  it('returns evaluation history with total count', async () => {
    const mockData = [{ id: '1', policy_id: 'p1' }]
    mockGetEvaluationHistory.mockResolvedValue({ data: mockData, total: 1 })

    const res = await request(app).get('/evaluation-results')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual(mockData)
    expect(res.body.total).toBe(1)
  })

  it('filters by policyId', async () => {
    mockGetEvaluationHistory.mockResolvedValue({ data: [], total: 0 })

    await request(app).get('/evaluation-results?policyId=p123')

    expect(mockGetEvaluationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        policyId: 'p123',
      })
    )
  })

  it('passes pagination parameters', async () => {
    mockGetEvaluationHistory.mockResolvedValue({ data: [], total: 0 })

    await request(app).get('/evaluation-results?limit=10&offset=20')

    expect(mockGetEvaluationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        offset: 20,
      })
    )
  })

  it('returns 500 when history retrieval fails', async () => {
    mockGetEvaluationHistory.mockResolvedValue(null)

    const res = await request(app).get('/evaluation-results')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to fetch evaluation history')
  })
})

describe('PATCH /feature-flag', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  it('updates the feature flag', async () => {
    const mockUpdateChain = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockUpdate.mockReturnValue(mockUpdateChain)
    mockFrom.mockReturnValue({ update: mockUpdate })

    const res = await request(app).patch('/feature-flag').send({ enabled: true })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('feature_flags')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
    expect(mockUpdateChain.eq).toHaveBeenCalledWith('key', 'actuarial_engine_enabled')
  })

  it('returns 400 for non-boolean enabled', async () => {
    const res = await request(app).patch('/feature-flag').send({ enabled: 'true' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('enabled must be a boolean')
  })

  it('returns 400 when enabled is missing', async () => {
    const res = await request(app).patch('/feature-flag').send({})

    expect(res.status).toBe(400)
  })

  it('returns 503 when DB not configured', async () => {
    const { getSupabaseWithError } = await import('../routes/admin/shared.js')
    vi.mocked(getSupabaseWithError).mockReturnValueOnce({
      client: null,
      error: 'DB Down',
    })

    const res = await request(app).patch('/feature-flag').send({ enabled: true })

    expect(res.status).toBe(503)
  })

  it('returns 500 on update error', async () => {
    const mockUpdateChain = {
      eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
    }
    mockUpdate.mockReturnValue(mockUpdateChain)
    mockFrom.mockReturnValue({ update: mockUpdate })

    const res = await request(app).patch('/feature-flag').send({ enabled: true })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to update feature flag')
  })
})
