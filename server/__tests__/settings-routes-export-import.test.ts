/**
 * Settings Routes — Export and Import Endpoint Tests
 *
 * Comprehensive tests for:
 *   GET  /export  — Export all configuration as JSON backup
 *   POST /import  — Import configuration from a backup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockFrom, mockFireWebhooks, mockLogWarn, mockLogError, mockLogInfo } =
  vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockFireWebhooks: vi.fn().mockResolvedValue(undefined),
    mockLogWarn: vi.fn(),
    mockLogError: vi.fn(),
    mockLogInfo: vi.fn(),
  }))

// Mock logger
vi.mock('../lib/logger.js', () => {
  const child = {
    debug: vi.fn(),
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

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

// Mock webhook service
vi.mock('../services/webhook-service.js', () => ({
  fireWebhooks: (...args: unknown[]) => mockFireWebhooks(...args),
}))

// ---------------------------------------------------------------------------
// Imports (after vi.mock calls)
// ---------------------------------------------------------------------------

import express from 'express'
import request from 'supertest'
import settingsRouter from '../routes/settings.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable Supabase query mock that resolves with finalResult.
 * Supports all common chainable methods.
 */
function buildQueryChain(finalResult: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  // Make the chain thenable so queries without .single() resolve with finalResult
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)
  return chain
}

function createApp(adminUser?: Record<string, unknown>) {
  const app = express()
  app.use(express.json())
  app.use((req: express.Request & { adminUser?: unknown }, _res, next) => {
    req.adminUser = adminUser ?? { id: 'admin-001' }
    next()
  })
  app.use('/', settingsRouter)
  return app
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const SETTINGS_DATA = [
  { category: 'ai', key: 'temperature', value: 0.1, value_type: 'number' },
  { category: 'ai', key: 'max_tokens', value: 4096, value_type: 'number' },
  { category: 'evaluation', key: 'weight_premium', value: 20, value_type: 'number' },
]

const FLAGS_DATA = [
  {
    key: 'use_db_config',
    description: 'Use DB config',
    enabled: true,
    rollout_percentage: 100,
    user_segments: [],
    conditions: {},
    expires_at: null,
  },
]

const FACTORS_DATA = [
  {
    region_code: 'marmara',
    region_name: 'Marmara',
    region_name_tr: 'Marmara',
    policy_type: 'all',
    risk_factor: 1.15,
    year: 2025,
    source: 'seddk',
    notes: null,
  },
]

const PROVIDERS_DATA = [
  {
    code: 'allianz',
    name: 'Allianz',
    name_tr: 'Allianz',
    market_share: 12.8,
    customer_rating: 4.2,
    established_year: 1923,
    headquarters: 'Istanbul',
    website: 'allianz.com.tr',
    specialties: ['kasko', 'health'],
    is_active: true,
  },
]

const BENCHMARKS_DATA = [
  {
    policy_type: 'kasko',
    coverage_type: 'collision',
    coverage_name_tr: 'Çarpma',
    region_code: 'tr',
    year: 2025,
    min_limit: 100000,
    typical_limit: 500000,
    max_limit: 2000000,
    min_deductible: 0,
    typical_deductible: 5000,
    max_deductible: 50000,
    inclusion_rate: 100,
    importance: 'critical',
    source: 'market',
  },
]

const ADMIN_USER_DATA = { email: 'admin@example.com' }

/**
 * Build a mockFrom implementation for the export route.
 * The export fetches from 5 tables in Promise.all and then admin_users and settings_audit_log.
 */
function buildExportFromMock({
  settingsError = null,
  settingsData = SETTINGS_DATA,
  flagsData = FLAGS_DATA,
  factorsData = FACTORS_DATA,
  providersData = PROVIDERS_DATA,
  benchmarksData = BENCHMARKS_DATA,
  adminEmail = ADMIN_USER_DATA.email,
  adminEmailNull = false,
}: {
  settingsError?: unknown
  settingsData?: unknown[]
  flagsData?: unknown[]
  factorsData?: unknown[]
  providersData?: unknown[]
  benchmarksData?: unknown[]
  adminEmail?: string
  adminEmailNull?: boolean
} = {}) {
  return (tableName: string) => {
    if (tableName === 'app_settings') {
      return buildQueryChain({ data: settingsData, error: settingsError })
    }
    if (tableName === 'feature_flags') {
      return buildQueryChain({ data: flagsData, error: null })
    }
    if (tableName === 'regional_factors') {
      return buildQueryChain({ data: factorsData, error: null })
    }
    if (tableName === 'insurance_providers') {
      return buildQueryChain({ data: providersData, error: null })
    }
    if (tableName === 'market_benchmarks') {
      return buildQueryChain({ data: benchmarksData, error: null })
    }
    if (tableName === 'admin_users') {
      const adminData = adminEmailNull ? null : { email: adminEmail }
      return buildQueryChain({ data: adminData, error: null })
    }
    if (tableName === 'settings_audit_log') {
      return buildQueryChain({ data: null, error: null })
    }
    return buildQueryChain({ data: null, error: null })
  }
}

/** Minimal valid import body */
function makeImportBody(overrides?: Record<string, unknown>) {
  return {
    config: {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        ai: [{ key: 'temperature', value: 0.2 }],
      },
    },
    mode: 'merge',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// GET /export
// ---------------------------------------------------------------------------

describe('GET /export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  // ---- 503 when Supabase is not configured ---------------------------------

  it('should return 503 when SUPABASE_URL is not set', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(503)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/database not configured/i)
  })

  it('should return 503 when only SUPABASE_URL is missing', async () => {
    delete process.env.SUPABASE_URL
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(503)
    expect(res.body.success).toBe(false)
  })

  it('should return 503 when only SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(503)
    expect(res.body.success).toBe(false)
  })

  // ---- 500 when settings query errors -------------------------------------

  it('should return 500 when settings query returns an error', async () => {
    mockFrom.mockImplementation(
      buildExportFromMock({ settingsError: { message: 'DB error' } }),
    )
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/failed to export settings/i)
  })

  // ---- 500 on unhandled exception ------------------------------------------

  it('should return 500 if Promise.all throws unexpectedly', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected connection error')
    })
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/internal server error/i)
  })

  // ---- Successful export with admin user ----------------------------------

  it('should return 200 with full export data on success', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('version', 1)
    expect(res.body.data).toHaveProperty('exportedAt')
    expect(res.body.data).toHaveProperty('exportedBy')
    expect(res.body.data).toHaveProperty('settings')
    expect(res.body.data).toHaveProperty('featureFlags')
    expect(res.body.data).toHaveProperty('regionalFactors')
    expect(res.body.data).toHaveProperty('providers')
    expect(res.body.data).toHaveProperty('benchmarks')
  })

  it('should include exportedBy as admin email when adminUser.id exists and email is found', async () => {
    mockFrom.mockImplementation(buildExportFromMock({ adminEmail: 'admin@example.com' }))
    const res = await request(createApp({ id: 'admin-001' })).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.data.exportedBy).toBe('admin@example.com')
  })

  it('should set exportedBy to "unknown" when no adminUser in request', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    // No adminUser attached
    const app = express()
    app.use(express.json())
    app.use('/', settingsRouter)
    const res = await request(app).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.data.exportedBy).toBe('unknown')
  })

  it('should set exportedBy to "unknown" when admin email lookup returns null', async () => {
    mockFrom.mockImplementation(buildExportFromMock({ adminEmailNull: true }))
    const res = await request(createApp({ id: 'admin-001' })).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.data.exportedBy).toBe('unknown')
  })

  // ---- Settings grouping --------------------------------------------------

  it('should group settings by category', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    const settings = res.body.data.settings
    expect(settings).toHaveProperty('ai')
    expect(settings).toHaveProperty('evaluation')
    expect(Array.isArray(settings.ai)).toBe(true)
    expect(settings.ai[0]).toHaveProperty('key', 'temperature')
    expect(settings.ai[0]).toHaveProperty('value', 0.1)
    expect(settings.ai[0]).toHaveProperty('valueType', 'number')
  })

  it('should return settings as empty object when settings data is empty', async () => {
    mockFrom.mockImplementation(buildExportFromMock({ settingsData: [] }))
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.data.settings).toEqual({})
  })

  // ---- Feature flags in export --------------------------------------------

  it('should map feature flags with camelCase keys', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    const flags = res.body.data.featureFlags
    expect(Array.isArray(flags)).toBe(true)
    expect(flags[0]).toHaveProperty('key', 'use_db_config')
    expect(flags[0]).toHaveProperty('enabled', true)
    expect(flags[0]).toHaveProperty('rolloutPercentage', 100)
  })

  it('should return empty featureFlags array when flags data is empty', async () => {
    mockFrom.mockImplementation(buildExportFromMock({ flagsData: [] }))
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.data.featureFlags).toEqual([])
  })

  // ---- Regional factors in export -----------------------------------------

  it('should map regional factors with camelCase keys', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    const factors = res.body.data.regionalFactors
    expect(Array.isArray(factors)).toBe(true)
    expect(factors[0]).toHaveProperty('regionCode', 'marmara')
    expect(factors[0]).toHaveProperty('riskFactor', 1.15)
  })

  it('should return empty regionalFactors array when factors data is empty', async () => {
    mockFrom.mockImplementation(buildExportFromMock({ factorsData: [] }))
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.data.regionalFactors).toEqual([])
  })

  // ---- Providers in export -------------------------------------------------

  it('should map providers with camelCase keys', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    const providers = res.body.data.providers
    expect(Array.isArray(providers)).toBe(true)
    expect(providers[0]).toHaveProperty('code', 'allianz')
    expect(providers[0]).toHaveProperty('marketShare', 12.8)
    expect(providers[0]).toHaveProperty('nameTr', 'Allianz')
  })

  it('should return empty providers array when providers data is empty', async () => {
    mockFrom.mockImplementation(buildExportFromMock({ providersData: [] }))
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.data.providers).toEqual([])
  })

  // ---- Benchmarks in export -----------------------------------------------

  it('should map benchmarks with camelCase keys', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    const benchmarks = res.body.data.benchmarks
    expect(Array.isArray(benchmarks)).toBe(true)
    expect(benchmarks[0]).toHaveProperty('policyType', 'kasko')
    expect(benchmarks[0]).toHaveProperty('minLimit', 100000)
    expect(benchmarks[0]).toHaveProperty('inclusionRate', 100)
  })

  it('should return empty benchmarks array when benchmarks data is empty', async () => {
    mockFrom.mockImplementation(buildExportFromMock({ benchmarksData: [] }))
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    expect(res.body.data.benchmarks).toEqual([])
  })

  // ---- EXPORT_VERSION is 1 ------------------------------------------------

  it('should include version = 1 in export data', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    const res = await request(createApp()).get('/export')
    expect(res.body.data.version).toBe(1)
  })

  // ---- exportedAt is ISO string -------------------------------------------

  it('should include a valid exportedAt ISO timestamp', async () => {
    mockFrom.mockImplementation(buildExportFromMock())
    const before = Date.now()
    const res = await request(createApp()).get('/export')
    const after = Date.now()
    const ts = new Date(res.body.data.exportedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  // ---- Audit log insert is called -----------------------------------------

  it('should insert a settings_audit_log record after successful export', async () => {
    let auditChain: ReturnType<typeof buildQueryChain> | null = null
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'settings_audit_log') {
        auditChain = buildQueryChain({ data: null, error: null })
        return auditChain
      }
      return buildExportFromMock()(tableName)
    })
    await request(createApp()).get('/export')
    // The chain's insert should have been called
    expect(auditChain).not.toBeNull()
    // The insert call is on the chain; verify .insert was invoked
    expect((auditChain as unknown as Record<string, ReturnType<typeof vi.fn>>).insert).toHaveBeenCalled()
  })

  // ---- VITE_ fallback for SUPABASE_URL ------------------------------------

  it('should use VITE_SUPABASE_URL as fallback when SUPABASE_URL is not set', async () => {
    delete process.env.SUPABASE_URL
    process.env.VITE_SUPABASE_URL = 'https://vite-test.supabase.co'
    mockFrom.mockImplementation(buildExportFromMock())
    const res = await request(createApp()).get('/export')
    expect(res.status).toBe(200)
    delete process.env.VITE_SUPABASE_URL
  })
})

// ---------------------------------------------------------------------------
// POST /import
// ---------------------------------------------------------------------------

describe('POST /import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  // ---- 503 when DB not configured -----------------------------------------

  it('should return 503 when Supabase is not configured', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const res = await request(createApp()).post('/import').send(makeImportBody())
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/database not configured/i)
  })

  // ---- 400 Zod validation errors ------------------------------------------

  it('should return 400 when body is missing config field', async () => {
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))
    const res = await request(createApp()).post('/import').send({ mode: 'merge' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/invalid import data/i)
    expect(Array.isArray(res.body.details)).toBe(true)
  })

  it('should return 400 when config.version is missing', async () => {
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))
    const res = await request(createApp())
      .post('/import')
      .send({
        config: { exportedAt: new Date().toISOString() },
        mode: 'merge',
      })
    expect(res.status).toBe(400)
    expect(res.body.details).toBeDefined()
  })

  it('should return 400 when mode is an invalid enum value', async () => {
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))
    const res = await request(createApp())
      .post('/import')
      .send({
        config: { version: 1, exportedAt: new Date().toISOString() },
        mode: 'invalid_mode',
      })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('should return 400 when config.exportedAt is missing', async () => {
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))
    const res = await request(createApp())
      .post('/import')
      .send({
        config: { version: 1 },
        mode: 'merge',
      })
    expect(res.status).toBe(400)
  })

  // ---- Settings import — merge mode, not found → skip --------------------

  it('should skip settings in merge mode when setting does not exist in DB', async () => {
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        // .single() returns null data (not found)
        const chain = buildQueryChain({ data: null, error: null })
        return chain
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody({ mode: 'merge' }))

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.skipped).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.updated).toBe(0)
    expect(res.body.data.results.settings.errors).toHaveLength(0)
  })

  // ---- Settings import — overwrite mode, not found → error ----------------

  it('should add error in overwrite mode when setting does not exist in DB', async () => {
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        return buildQueryChain({ data: null, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody({ mode: 'overwrite' }))

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.errors[0]).toMatch(/not found in database/)
  })

  // ---- Settings import — readonly setting → skip --------------------------

  it('should skip readonly settings', async () => {
    const readonlySetting = {
      id: 'set-001',
      value: 0.1,
      is_readonly: true,
      min_value: null,
      max_value: null,
      allowed_values: null,
    }
    let callCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        callCount++
        // First call: .single() for the existing record lookup
        const chain = buildQueryChain({ data: readonlySetting, error: null })
        return chain
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody())

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.skipped).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.updated).toBe(0)
    expect(callCount).toBeGreaterThan(0)
  })

  // ---- Settings import — value below min_value → error -------------------

  it('should add error when numeric value is below min_value constraint', async () => {
    const existingSetting = {
      id: 'set-001',
      value: 0.1,
      is_readonly: false,
      min_value: 0.5,
      max_value: null,
      allowed_values: null,
    }
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        return buildQueryChain({ data: existingSetting, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    // temperature value 0.2 is below min_value 0.5
    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody())

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.errors[0]).toMatch(/below minimum/)
  })

  // ---- Settings import — value above max_value → error --------------------

  it('should add error when numeric value is above max_value constraint', async () => {
    const existingSetting = {
      id: 'set-001',
      value: 0.1,
      is_readonly: false,
      min_value: null,
      max_value: 0.1, // Our import value 0.2 exceeds this
      allowed_values: null,
    }
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        return buildQueryChain({ data: existingSetting, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody())

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.errors[0]).toMatch(/above maximum/)
  })

  // ---- Settings import — value not in allowed_values → error --------------

  it('should add error when value is not in allowed_values list', async () => {
    const existingSetting = {
      id: 'set-001',
      value: 'gpt-4o',
      is_readonly: false,
      min_value: null,
      max_value: null,
      allowed_values: ['gpt-4o', 'gpt-4o-mini'], // 0.2 is not in this list
    }
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        return buildQueryChain({ data: existingSetting, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    // temperature: 0.2 — not in the allowed string list
    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody())

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.errors[0]).toMatch(/not in allowed values/)
  })

  // ---- Settings import — value unchanged → skip ---------------------------

  it('should skip settings when JSON.stringify matches existing value', async () => {
    const existingSetting = {
      id: 'set-001',
      value: 0.2, // Same as what we're importing
      is_readonly: false,
      min_value: null,
      max_value: null,
      allowed_values: null,
    }
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        return buildQueryChain({ data: existingSetting, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody())

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.skipped).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.updated).toBe(0)
  })

  // ---- Settings import — update fails → error -----------------------------

  it('should add error when update query fails', async () => {
    const existingSetting = {
      id: 'set-001',
      value: 0.9, // Different from 0.2 so update is attempted
      is_readonly: false,
      min_value: null,
      max_value: null,
      allowed_values: null,
    }

    let selectCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        selectCallCount++
        if (selectCallCount === 1) {
          // First call: select existing — returns found
          return buildQueryChain({ data: existingSetting, error: null })
        }
        // Second call: update — returns error
        return buildQueryChain({ data: null, error: { message: 'Update constraint violation' } })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody())

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.errors[0]).toMatch(/update failed/)
  })

  // ---- Settings import — success → updated count increases ----------------

  it('should increment updated count on successful setting update', async () => {
    const existingSetting = {
      id: 'set-001',
      value: 0.9, // Different so update is needed
      is_readonly: false,
      min_value: null,
      max_value: null,
      allowed_values: null,
    }

    let appSettingsCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        appSettingsCallCount++
        // Odd calls: select (returns existing), even calls: update (returns success)
        if (appSettingsCallCount % 2 === 1) {
          return buildQueryChain({ data: existingSetting, error: null })
        }
        return buildQueryChain({ data: null, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody())

    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.updated).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.errors).toHaveLength(0)
  })

  // ---- Feature flags — merge mode, not found → skip -----------------------

  it('should skip feature flags in merge mode when flag does not exist', async () => {
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        return buildQueryChain({ data: null, error: null })
      }
      if (tableName === 'feature_flags') {
        return buildQueryChain({ data: null, error: null }) // not found
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        featureFlags: [{ key: 'missing_flag', enabled: true }],
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.featureFlags.skipped).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.featureFlags.errors).toHaveLength(0)
  })

  // ---- Feature flags — overwrite mode, not found → error ------------------

  it('should add error for missing feature flag in overwrite mode', async () => {
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'feature_flags') {
        return buildQueryChain({ data: null, error: null }) // not found
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        featureFlags: [{ key: 'missing_flag', enabled: true }],
      },
      mode: 'overwrite',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.featureFlags.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.featureFlags.errors[0]).toMatch(/not found in database/)
  })

  // ---- Feature flags — update fails → error --------------------------------

  it('should add error when feature flag update fails', async () => {
    const existingFlag = { id: 'flag-001', enabled: false, rollout_percentage: 0 }

    let flagCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'feature_flags') {
        flagCallCount++
        if (flagCallCount === 1) {
          // select: flag exists
          return buildQueryChain({ data: existingFlag, error: null })
        }
        // update: fails
        return buildQueryChain({ data: null, error: { message: 'Flag update error' } })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        featureFlags: [{ key: 'my_flag', enabled: true }],
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.featureFlags.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.featureFlags.errors[0]).toMatch(/update failed/)
  })

  // ---- Feature flags — success → updated++ --------------------------------

  it('should increment featureFlags.updated on successful flag update', async () => {
    const existingFlag = { id: 'flag-001', enabled: false, rollout_percentage: 0 }

    let flagCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'feature_flags') {
        flagCallCount++
        if (flagCallCount === 1) {
          return buildQueryChain({ data: existingFlag, error: null })
        }
        return buildQueryChain({ data: null, error: null }) // update succeeds
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        featureFlags: [{ key: 'my_flag', enabled: true, rolloutPercentage: 50 }],
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.featureFlags.updated).toBe(1)
    expect(res.body.data.results.featureFlags.errors).toHaveLength(0)
  })

  // ---- Regional factors — merge + not found → skip -------------------------

  it('should skip regional factors in merge mode when factor is not found', async () => {
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'regional_factors') {
        return buildQueryChain({ data: null, error: null }) // not found
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        regionalFactors: [{ regionCode: 'unknown', policyType: 'all', riskFactor: 1.0 }],
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.regionalFactors.skipped).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.regionalFactors.errors).toHaveLength(0)
  })

  // ---- Regional factors — overwrite + not found → error -------------------

  it('should add error for missing regional factor in overwrite mode', async () => {
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'regional_factors') {
        return buildQueryChain({ data: null, error: null }) // not found
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        regionalFactors: [{ regionCode: 'unknown', policyType: 'all', riskFactor: 1.0 }],
      },
      mode: 'overwrite',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.regionalFactors.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.regionalFactors.errors[0]).toMatch(/not found/)
  })

  // ---- Regional factors — unchanged risk_factor → skip --------------------

  it('should skip regional factor when risk_factor is unchanged', async () => {
    const existingFactor = { id: 'factor-001', risk_factor: 1.0 }
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'regional_factors') {
        return buildQueryChain({ data: existingFactor, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        regionalFactors: [{ regionCode: 'marmara', policyType: 'all', riskFactor: 1.0 }],
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.regionalFactors.skipped).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.regionalFactors.updated).toBe(0)
  })

  // ---- Regional factors — update fails → error ----------------------------

  it('should add error when regional factor update fails', async () => {
    const existingFactor = { id: 'factor-001', risk_factor: 1.0 }

    let factorCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'regional_factors') {
        factorCallCount++
        if (factorCallCount === 1) {
          return buildQueryChain({ data: existingFactor, error: null })
        }
        return buildQueryChain({ data: null, error: { message: 'Factor update error' } })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        regionalFactors: [{ regionCode: 'marmara', policyType: 'all', riskFactor: 1.5 }],
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.regionalFactors.errors.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.regionalFactors.errors[0]).toMatch(/update failed/)
  })

  // ---- Regional factors — success → updated++ -----------------------------

  it('should increment regionalFactors.updated on successful factor update', async () => {
    const existingFactor = { id: 'factor-001', risk_factor: 1.0 }

    let factorCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'regional_factors') {
        factorCallCount++
        if (factorCallCount === 1) {
          return buildQueryChain({ data: existingFactor, error: null })
        }
        return buildQueryChain({ data: null, error: null }) // update succeeds
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        regionalFactors: [{ regionCode: 'marmara', policyType: 'all', riskFactor: 1.5 }],
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.regionalFactors.updated).toBe(1)
    expect(res.body.data.results.regionalFactors.errors).toHaveLength(0)
  })

  // ---- Webhook fired when totalUpdated > 0 --------------------------------

  it('should fire webhook when at least one item is updated', async () => {
    const existingSetting = {
      id: 'set-001',
      value: 0.9,
      is_readonly: false,
      min_value: null,
      max_value: null,
      allowed_values: null,
    }

    let appSettingsCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        appSettingsCallCount++
        if (appSettingsCallCount % 2 === 1) {
          return buildQueryChain({ data: existingSetting, error: null })
        }
        return buildQueryChain({ data: null, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp()).post('/import').send(makeImportBody())
    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.updated).toBeGreaterThan(0)
    expect(mockFireWebhooks).toHaveBeenCalledWith(
      'setting.imported',
      expect.objectContaining({ category: '_system' }),
    )
  })

  // ---- Webhook NOT fired when totalUpdated = 0 ----------------------------

  it('should NOT fire webhook when no items are updated', async () => {
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
          ai: [{ key: 'temperature', value: 0.2 }],
        },
      },
      mode: 'merge', // merge + not found = skip
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.updated).toBe(0)
    expect(mockFireWebhooks).not.toHaveBeenCalled()
  })

  // ---- Webhook failure is logged but does not affect response --------------

  it('should return 200 even when webhook fires but rejects', async () => {
    mockFireWebhooks.mockRejectedValueOnce(new Error('Webhook timeout'))

    const existingSetting = {
      id: 'set-001',
      value: 0.9,
      is_readonly: false,
      min_value: null,
      max_value: null,
      allowed_values: null,
    }

    let appSettingsCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        appSettingsCallCount++
        if (appSettingsCallCount % 2 === 1) {
          return buildQueryChain({ data: existingSetting, error: null })
        }
        return buildQueryChain({ data: null, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const res = await request(createApp()).post('/import').send(makeImportBody())
    // The webhook error is caught and logged — response must still be 200
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  // ---- 500 on unhandled outer exception -----------------------------------

  it('should return 500 on unhandled exception in outer try-catch', async () => {
    // Force getSupabaseAdmin to return a client whose .from() throws
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected DB connection failure')
    })

    const res = await request(createApp())
      .post('/import')
      .send(makeImportBody())

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/internal server error/i)
  })

  // ---- Summary totals in response -----------------------------------------

  it('should return correct summary totals in response', async () => {
    // All settings skipped in merge mode (not found)
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
          ai: [
            { key: 'temperature', value: 0.2 },
            { key: 'max_tokens', value: 2048 },
          ],
        },
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    const summary = res.body.data.summary
    expect(summary).toHaveProperty('totalUpdated')
    expect(summary).toHaveProperty('totalSkipped')
    expect(summary).toHaveProperty('totalErrors')
    expect(typeof summary.totalUpdated).toBe('number')
    expect(typeof summary.totalSkipped).toBe('number')
    expect(typeof summary.totalErrors).toBe('number')
    // Both settings skipped (merge + not found)
    expect(summary.totalSkipped).toBe(2)
    expect(summary.totalUpdated).toBe(0)
    expect(summary.totalErrors).toBe(0)
  })

  // ---- sections filter — only imports specified section -------------------

  it('should only import specified sections when sections array is provided', async () => {
    // We specify only featureFlags; settings should not be touched
    const existingFlag = { id: 'flag-001', enabled: false, rollout_percentage: 0 }

    let flagCallCount = 0
    let settingsCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'feature_flags') {
        flagCallCount++
        if (flagCallCount === 1) {
          return buildQueryChain({ data: existingFlag, error: null })
        }
        return buildQueryChain({ data: null, error: null })
      }
      if (tableName === 'app_settings') {
        settingsCallCount++
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: { ai: [{ key: 'temperature', value: 0.2 }] },
        featureFlags: [{ key: 'my_flag', enabled: true }],
      },
      mode: 'merge',
      sections: ['featureFlags'], // Only import feature flags
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    // settings section should NOT have been touched (no app_settings queries)
    expect(settingsCallCount).toBe(0)
    // feature flags should have been processed
    expect(res.body.data.results.featureFlags.updated).toBe(1)
  })

  // ---- Default mode is 'merge' -------------------------------------------

  it('should default mode to "merge" when mode is not provided', async () => {
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: { ai: [{ key: 'temperature', value: 0.2 }] },
      },
      // No mode specified — defaults to 'merge'
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    // merge + not found = skipped (not error)
    expect(res.body.data.results.settings.skipped).toBeGreaterThanOrEqual(1)
    expect(res.body.data.results.settings.errors).toHaveLength(0)
  })

  // ---- Empty config sections are a no-op ----------------------------------

  it('should succeed with no operations when config has no settings, flags or factors', async () => {
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        // settings/featureFlags/regionalFactors omitted
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    const summary = res.body.data.summary
    expect(summary.totalUpdated).toBe(0)
    expect(summary.totalSkipped).toBe(0)
    expect(summary.totalErrors).toBe(0)
  })

  // ---- Audit log is always inserted after import --------------------------

  it('should insert a settings_audit_log record after import completes', async () => {
    let auditInsertCalled = false
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'settings_audit_log') {
        const chain = buildQueryChain({ data: null, error: null })
        const originalInsert = chain.insert as ReturnType<typeof vi.fn>
        chain.insert = vi.fn().mockImplementation((...args: unknown[]) => {
          auditInsertCalled = true
          return originalInsert(...args)
        })
        return chain
      }
      return buildQueryChain({ data: null, error: null })
    })

    await request(createApp()).post('/import').send(makeImportBody())
    expect(auditInsertCalled).toBe(true)
  })

  // ---- adminUser id used as changed_by ------------------------------------

  it('should pass adminUser.id as changed_by to update queries', async () => {
    const existingSetting = {
      id: 'set-001',
      value: 0.9,
      is_readonly: false,
      min_value: null,
      max_value: null,
      allowed_values: null,
    }

    const capturedUpdateArgs: unknown[] = []
    let appSettingsCallCount = 0

    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'app_settings') {
        appSettingsCallCount++
        if (appSettingsCallCount % 2 === 1) {
          return buildQueryChain({ data: existingSetting, error: null })
        }
        // Capture the update call arguments
        const chain = buildQueryChain({ data: null, error: null })
        const originalUpdate = chain.update as ReturnType<typeof vi.fn>
        chain.update = vi.fn().mockImplementation((data: unknown) => {
          capturedUpdateArgs.push(data)
          return originalUpdate(data)
        })
        return chain
      }
      return buildQueryChain({ data: null, error: null })
    })

    await request(createApp({ id: 'specific-admin-id' })).post('/import').send(makeImportBody())

    expect(capturedUpdateArgs.length).toBeGreaterThan(0)
    const updateData = capturedUpdateArgs[0] as Record<string, unknown>
    expect(updateData.updated_by).toBe('specific-admin-id')
  })

  // ---- featureFlags with rolloutPercentage --------------------------------

  it('should pass rolloutPercentage as rollout_percentage to flag update', async () => {
    const existingFlag = { id: 'flag-001', enabled: false, rollout_percentage: 0 }
    const capturedUpdateArgs: unknown[] = []

    let flagCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'feature_flags') {
        flagCallCount++
        if (flagCallCount === 1) {
          return buildQueryChain({ data: existingFlag, error: null })
        }
        const chain = buildQueryChain({ data: null, error: null })
        const originalUpdate = chain.update as ReturnType<typeof vi.fn>
        chain.update = vi.fn().mockImplementation((data: unknown) => {
          capturedUpdateArgs.push(data)
          return originalUpdate(data)
        })
        return chain
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        featureFlags: [{ key: 'my_flag', enabled: true, rolloutPercentage: 75 }],
      },
      mode: 'merge',
    }

    await request(createApp()).post('/import').send(body)

    expect(capturedUpdateArgs.length).toBeGreaterThan(0)
    const updateData = capturedUpdateArgs[0] as Record<string, unknown>
    expect(updateData.rollout_percentage).toBe(75)
    expect(updateData.enabled).toBe(true)
  })

  // ---- featureFlags without enabled/rolloutPercentage ---------------------

  it('should handle featureFlag with no enabled or rolloutPercentage (neither set)', async () => {
    const existingFlag = { id: 'flag-001', enabled: true, rollout_percentage: 100 }

    let flagCallCount = 0
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'feature_flags') {
        flagCallCount++
        if (flagCallCount === 1) {
          return buildQueryChain({ data: existingFlag, error: null })
        }
        return buildQueryChain({ data: null, error: null })
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        featureFlags: [{ key: 'my_flag' }], // only key, no enabled/rollout
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.featureFlags.updated).toBe(1)
  })

  // ---- Multiple settings categories handled correctly ---------------------

  it('should process settings across multiple categories', async () => {
    // All not found in merge → all skipped
    mockFrom.mockImplementation(() => buildQueryChain({ data: null, error: null }))

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
          ai: [{ key: 'temperature', value: 0.2 }],
          evaluation: [{ key: 'weight_premium', value: 25 }],
          rate_limits: [{ key: 'chat_per_hour', value: 60 }],
        },
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    expect(res.body.data.results.settings.skipped).toBe(3)
    expect(res.body.data.results.settings.updated).toBe(0)
  })

  // ---- regionalFactors default policyType to 'all' -----------------------

  it('should default policyType to "all" when not provided in regionalFactors', async () => {
    const eqArgs: Array<[string, unknown]> = []
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'regional_factors') {
        const chain = buildQueryChain({ data: null, error: null })
        const originalEq = chain.eq as ReturnType<typeof vi.fn>
        chain.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
          eqArgs.push([col, val])
          return originalEq(col, val)
        })
        return chain
      }
      return buildQueryChain({ data: null, error: null })
    })

    const body = {
      config: {
        version: 1,
        exportedAt: new Date().toISOString(),
        regionalFactors: [{ regionCode: 'marmara', riskFactor: 1.2 }], // policyType omitted → defaults to 'all'
      },
      mode: 'merge',
    }

    const res = await request(createApp()).post('/import').send(body)
    expect(res.status).toBe(200)
    // eq('policy_type', 'all') should have been called
    const policyTypeCall = eqArgs.find(([col]) => col === 'policy_type')
    expect(policyTypeCall).toBeDefined()
    expect(policyTypeCall?.[1]).toBe('all')
  })
})
