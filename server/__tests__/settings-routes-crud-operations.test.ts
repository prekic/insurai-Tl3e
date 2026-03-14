/**
 * Settings Routes — CRUD Operations Tests
 *
 * Covers all branches in:
 * - GET/PUT /feature-flags and /feature-flags/:key
 * - GET/PUT /regional-factors and /regional-factors/:id
 * - GET/PUT /providers and /providers/:id
 * - GET/PUT /benchmarks and /benchmarks/:id
 * - GET /:category (catch-all — 503, 500, 404, 200)
 * - GET /:category/:key (503, 404, 200)
 * - PUT /:category/:key (503, 400, 404, 403, min/max/allowed value constraints, audit log, webhook)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// =============================================================================
// HOISTED MOCKS
// =============================================================================

const { mockFireWebhooks, mockFrom } = vi.hoisted(() => ({
  mockFireWebhooks: vi.fn().mockResolvedValue(undefined),
  mockFrom: vi.fn(),
}))

// Mock webhook service
vi.mock('../services/webhook-service.js', () => ({
  fireWebhooks: (...args: unknown[]) => mockFireWebhooks(...args),
}))

// Mock logger (suppress all output)
vi.mock('../lib/logger.js', () => {
  const noop = vi.fn()
  const child = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: vi.fn().mockReturnThis(),
  }
  return { default: child, logger: child }
})

// Mock supabase createClient — controlled via mockFrom
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

// =============================================================================
// CHAINABLE QUERY BUILDER
// =============================================================================

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
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(finalResult)
  chain.then = (resolve: (v: unknown) => void) => resolve(finalResult)
  return chain
}

// =============================================================================
// APP SETUP
// =============================================================================

async function buildApp() {
  const { default: settingsRouter } = await import('../routes/settings.js')
  const app = express()
  app.use(express.json())
  app.use('/', settingsRouter)
  return app
}

// =============================================================================
// TESTS
// =============================================================================

describe('Settings Routes — CRUD Operations', () => {
  let app: express.Express

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
    app = await buildApp()
  })

  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    vi.resetModules()
  })

  // ===========================================================================
  // FEATURE FLAGS — GET /feature-flags
  // ===========================================================================

  describe('GET /feature-flags', () => {
    it('returns 503 when supabase is not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).get('/feature-flags')
      expect(res.status).toBe(503)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Database not configured')
    })

    it('returns 500 on database error', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'DB error' } }))
      const res = await request(app).get('/feature-flags')
      expect(res.status).toBe(500)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Failed to fetch feature flags')
    })

    it('returns empty array when no flags exist', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: [], error: null }))
      const res = await request(app).get('/feature-flags')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual([])
    })

    it('maps snake_case DB columns to camelCase response', async () => {
      const dbFlag = {
        id: 'flag-1',
        key: 'new_eval',
        name: 'New Evaluation',
        description: 'desc',
        enabled: true,
        rollout_percentage: 50,
        user_segments: ['beta'],
        conditions: { rule: 'A' },
        expires_at: '2026-12-31',
        created_at: '2026-01-01',
        updated_at: '2026-02-01',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: [dbFlag], error: null }))
      const res = await request(app).get('/feature-flags')
      expect(res.status).toBe(200)
      expect(res.body.data[0]).toMatchObject({
        id: 'flag-1',
        key: 'new_eval',
        name: 'New Evaluation',
        enabled: true,
        rolloutPercentage: 50,
        userSegments: ['beta'],
        conditions: { rule: 'A' },
        expiresAt: '2026-12-31',
      })
    })
  })

  // ===========================================================================
  // FEATURE FLAGS — PUT /feature-flags/:key
  // ===========================================================================

  describe('PUT /feature-flags/:key', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).put('/feature-flags/my_flag').send({ enabled: true })
      expect(res.status).toBe(503)
    })

    it('returns 400 for invalid body (rolloutPercentage out of range)', async () => {
      const res = await request(app).put('/feature-flags/my_flag').send({ rolloutPercentage: 150 })
      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Invalid request body')
      expect(res.body.details).toBeDefined()
    })

    it('returns 404 when DB returns error (flag not found)', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'no rows' } }))
      const res = await request(app).put('/feature-flags/missing_flag').send({ enabled: false })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Feature flag not found')
    })

    it('returns 404 when DB returns null data (flag not found)', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: null }))
      const res = await request(app).put('/feature-flags/missing_flag').send({ enabled: true })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Feature flag not found')
    })

    it('returns 200 and fires webhook on successful update', async () => {
      const updatedFlag = {
        key: 'my_flag',
        enabled: true,
        rollout_percentage: 100,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: updatedFlag, error: null }))
      const res = await request(app)
        .put('/feature-flags/my_flag')
        .send({ enabled: true, rolloutPercentage: 100 })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        key: 'my_flag',
        enabled: true,
        rolloutPercentage: 100,
      })
      // Webhook fires asynchronously — give it a tick
      await new Promise((r) => setTimeout(r, 10))
      expect(mockFireWebhooks).toHaveBeenCalledWith(
        'feature_flag.toggled',
        expect.objectContaining({ category: 'feature_flags' })
      )
    })

    it('updates all optional fields (userSegments, conditions, expiresAt)', async () => {
      const updatedFlag = {
        key: 'my_flag',
        enabled: false,
        rollout_percentage: 25,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: updatedFlag, error: null }))
      const res = await request(app)
        .put('/feature-flags/my_flag')
        .send({
          enabled: false,
          rolloutPercentage: 25,
          userSegments: ['admins'],
          conditions: { env: 'prod' },
          expiresAt: '2026-06-01',
        })
      expect(res.status).toBe(200)
    })

    it('continues normally even when webhook rejects', async () => {
      mockFireWebhooks.mockRejectedValueOnce(new Error('webhook down'))
      const updatedFlag = {
        key: 'my_flag',
        enabled: true,
        rollout_percentage: 0,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: updatedFlag, error: null }))
      const res = await request(app).put('/feature-flags/my_flag').send({ enabled: true })
      expect(res.status).toBe(200)
    })
  })

  // ===========================================================================
  // REGIONAL FACTORS — GET /regional-factors
  // ===========================================================================

  describe('GET /regional-factors', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).get('/regional-factors')
      expect(res.status).toBe(503)
    })

    it('returns 500 on database error', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'query failed' } }))
      const res = await request(app).get('/regional-factors')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to fetch regional factors')
    })

    it('returns 200 with empty array when no factors found', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: [], error: null }))
      const res = await request(app).get('/regional-factors')
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('defaults to current year when year param not provided', async () => {
      const chain = buildQueryChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)
      await request(app).get('/regional-factors')
      // Verify eq was called with current year
      const currentYear = new Date().getFullYear()
      expect(chain.eq).toHaveBeenCalledWith('year', currentYear)
    })

    it('uses provided year query param', async () => {
      const chain = buildQueryChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)
      await request(app).get('/regional-factors?year=2025')
      expect(chain.eq).toHaveBeenCalledWith('year', 2025)
    })

    it('maps DB snake_case to camelCase in response', async () => {
      const dbFactor = {
        id: 'rf-1',
        region_code: 'marmara',
        region_name: 'Marmara',
        region_name_tr: 'Marmara',
        policy_type: 'kasko',
        risk_factor: 1.15,
        year: 2026,
        source: 'SEDDK',
        notes: 'High risk area',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: [dbFactor], error: null }))
      const res = await request(app).get('/regional-factors')
      expect(res.status).toBe(200)
      expect(res.body.data[0]).toMatchObject({
        id: 'rf-1',
        regionCode: 'marmara',
        regionName: 'Marmara',
        regionNameTr: 'Marmara',
        riskFactor: 1.15,
      })
    })
  })

  // ===========================================================================
  // REGIONAL FACTORS — PUT /regional-factors/:id
  // ===========================================================================

  describe('PUT /regional-factors/:id', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).put('/regional-factors/rf-1').send({ riskFactor: 1.1 })
      expect(res.status).toBe(503)
    })

    it('returns 400 when riskFactor is missing', async () => {
      const res = await request(app).put('/regional-factors/rf-1').send({ notes: 'test' })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
    })

    it('returns 400 when riskFactor is below 0', async () => {
      const res = await request(app).put('/regional-factors/rf-1').send({ riskFactor: -0.1 })
      expect(res.status).toBe(400)
    })

    it('returns 400 when riskFactor exceeds 5', async () => {
      const res = await request(app).put('/regional-factors/rf-1').send({ riskFactor: 5.1 })
      expect(res.status).toBe(400)
    })

    it('returns 404 when DB returns error', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'not found' } }))
      const res = await request(app).put('/regional-factors/rf-99').send({ riskFactor: 1.2 })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Regional factor not found')
    })

    it('returns 404 when DB returns null data', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: null }))
      const res = await request(app).put('/regional-factors/rf-99').send({ riskFactor: 1.2 })
      expect(res.status).toBe(404)
    })

    it('returns 200 on successful update with camelCase response', async () => {
      const dbFactor = {
        id: 'rf-1',
        region_code: 'ege',
        risk_factor: 1.05,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbFactor, error: null }))
      const res = await request(app)
        .put('/regional-factors/rf-1')
        .send({ riskFactor: 1.05, notes: 'Updated' })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        id: 'rf-1',
        regionCode: 'ege',
        riskFactor: 1.05,
      })
    })

    it('accepts riskFactor boundary values (0 and 5)', async () => {
      const dbFactor = { id: 'rf-1', region_code: 'x', risk_factor: 0, updated_at: '2026-02-20' }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbFactor, error: null }))
      const res0 = await request(app).put('/regional-factors/rf-1').send({ riskFactor: 0 })
      expect(res0.status).toBe(200)

      const dbFactor5 = { id: 'rf-2', region_code: 'y', risk_factor: 5, updated_at: '2026-02-20' }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbFactor5, error: null }))
      const res5 = await request(app).put('/regional-factors/rf-2').send({ riskFactor: 5 })
      expect(res5.status).toBe(200)
    })
  })

  // ===========================================================================
  // INSURANCE PROVIDERS — GET /providers
  // ===========================================================================

  describe('GET /providers', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).get('/providers')
      expect(res.status).toBe(503)
    })

    it('returns 500 on database error', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'db error' } }))
      const res = await request(app).get('/providers')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to fetch providers')
    })

    it('returns 200 with empty array when no providers', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: [], error: null }))
      const res = await request(app).get('/providers')
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('maps DB snake_case to camelCase in response', async () => {
      const dbProvider = {
        id: 'prov-1',
        code: 'allianz',
        name: 'Allianz',
        name_tr: 'Allianz Türkiye',
        market_share: 12.8,
        customer_rating: 4.2,
        established_year: 1923,
        headquarters: 'İstanbul',
        website: 'allianz.com.tr',
        logo_url: 'https://logo.url',
        specialties: ['kasko', 'health'],
        is_active: true,
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: [dbProvider], error: null }))
      const res = await request(app).get('/providers')
      expect(res.status).toBe(200)
      expect(res.body.data[0]).toMatchObject({
        id: 'prov-1',
        code: 'allianz',
        nameTr: 'Allianz Türkiye',
        marketShare: 12.8,
        customerRating: 4.2,
        isActive: true,
      })
    })
  })

  // ===========================================================================
  // INSURANCE PROVIDERS — PUT /providers/:id
  // ===========================================================================

  describe('PUT /providers/:id', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).put('/providers/prov-1').send({ marketShare: 15 })
      expect(res.status).toBe(503)
    })

    it('returns 400 for invalid body (marketShare out of range)', async () => {
      const res = await request(app).put('/providers/prov-1').send({ marketShare: 150 })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
    })

    it('returns 400 for customerRating out of range', async () => {
      const res = await request(app).put('/providers/prov-1').send({ customerRating: 6 })
      expect(res.status).toBe(400)
    })

    it('returns 404 when DB returns error', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'not found' } }))
      const res = await request(app).put('/providers/prov-99').send({ isActive: false })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Provider not found')
    })

    it('returns 404 when DB returns null data', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: null }))
      const res = await request(app).put('/providers/prov-99').send({ isActive: false })
      expect(res.status).toBe(404)
    })

    it('returns 200 with camelCase response on success', async () => {
      const dbProvider = {
        id: 'prov-1',
        code: 'axa',
        name: 'AXA',
        market_share: 11.5,
        customer_rating: 4.0,
        is_active: true,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbProvider, error: null }))
      const res = await request(app)
        .put('/providers/prov-1')
        .send({ marketShare: 11.5, customerRating: 4.0, isActive: true })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        id: 'prov-1',
        code: 'axa',
        marketShare: 11.5,
        customerRating: 4.0,
        isActive: true,
      })
    })

    it('does NOT fire webhooks for provider updates', async () => {
      const dbProvider = {
        id: 'prov-1',
        code: 'axa',
        name: 'AXA',
        market_share: 10,
        customer_rating: 3.9,
        is_active: true,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbProvider, error: null }))
      await request(app).put('/providers/prov-1').send({ isActive: false })
      await new Promise((r) => setTimeout(r, 10))
      expect(mockFireWebhooks).not.toHaveBeenCalled()
    })

    it('accepts body with only isActive field (all optional)', async () => {
      const dbProvider = {
        id: 'prov-1',
        code: 'hdi',
        name: 'HDI',
        market_share: 4.8,
        customer_rating: 3.8,
        is_active: false,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbProvider, error: null }))
      const res = await request(app).put('/providers/prov-1').send({ isActive: false })
      expect(res.status).toBe(200)
    })
  })

  // ===========================================================================
  // MARKET BENCHMARKS — GET /benchmarks
  // ===========================================================================

  describe('GET /benchmarks', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).get('/benchmarks')
      expect(res.status).toBe(503)
    })

    it('returns 500 on database error', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'db error' } }))
      const res = await request(app).get('/benchmarks')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to fetch benchmarks')
    })

    it('returns 200 with empty array when no benchmarks', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: [], error: null }))
      const res = await request(app).get('/benchmarks')
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('defaults to current year when year param not provided', async () => {
      const chain = buildQueryChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)
      await request(app).get('/benchmarks')
      const currentYear = new Date().getFullYear()
      expect(chain.eq).toHaveBeenCalledWith('year', currentYear)
    })

    it('filters by policyType when provided', async () => {
      const chain = buildQueryChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)
      await request(app).get('/benchmarks?policyType=kasko')
      expect(chain.eq).toHaveBeenCalledWith('policy_type', 'kasko')
    })

    it('does NOT add policyType filter when not provided', async () => {
      const chain = buildQueryChain({ data: [], error: null })
      mockFrom.mockReturnValue(chain)
      await request(app).get('/benchmarks')
      const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls
      const policyTypeCalls = eqCalls.filter(([k]: string[]) => k === 'policy_type')
      expect(policyTypeCalls).toHaveLength(0)
    })

    it('maps DB snake_case to camelCase', async () => {
      const dbBenchmark = {
        id: 'bm-1',
        policy_type: 'kasko',
        coverage_type: 'collision',
        coverage_name_tr: 'Çarpma',
        region_code: 'marmara',
        year: 2026,
        min_limit: 100000,
        typical_limit: 500000,
        max_limit: 2000000,
        min_deductible: 0,
        typical_deductible: 1000,
        max_deductible: 5000,
        inclusion_rate: 100,
        importance: 'critical',
        source: 'SEDDK',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: [dbBenchmark], error: null }))
      const res = await request(app).get('/benchmarks')
      expect(res.status).toBe(200)
      expect(res.body.data[0]).toMatchObject({
        id: 'bm-1',
        policyType: 'kasko',
        coverageType: 'collision',
        coverageNameTr: 'Çarpma',
        typicalLimit: 500000,
        inclusionRate: 100,
        importance: 'critical',
      })
    })
  })

  // ===========================================================================
  // MARKET BENCHMARKS — PUT /benchmarks/:id
  // ===========================================================================

  describe('PUT /benchmarks/:id', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).put('/benchmarks/bm-1').send({ typicalLimit: 500000 })
      expect(res.status).toBe(503)
    })

    it('returns 400 for invalid body (inclusionRate out of range)', async () => {
      const res = await request(app).put('/benchmarks/bm-1').send({ inclusionRate: 150 })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
    })

    it('returns 400 for invalid importance value', async () => {
      const res = await request(app).put('/benchmarks/bm-1').send({ importance: 'invalid' })
      expect(res.status).toBe(400)
    })

    it('returns 404 when DB returns error', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'not found' } }))
      const res = await request(app).put('/benchmarks/bm-99').send({ typicalLimit: 500000 })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Benchmark not found')
    })

    it('returns 404 when DB returns null data', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: null }))
      const res = await request(app).put('/benchmarks/bm-99').send({ typicalLimit: 500000 })
      expect(res.status).toBe(404)
    })

    it('returns 200 with camelCase response on success', async () => {
      const dbBenchmark = {
        id: 'bm-1',
        policy_type: 'kasko',
        coverage_type: 'collision',
        typical_limit: 500000,
        inclusion_rate: 100,
        importance: 'critical',
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbBenchmark, error: null }))
      const res = await request(app).put('/benchmarks/bm-1').send({
        typicalLimit: 500000,
        inclusionRate: 100,
        importance: 'critical',
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        id: 'bm-1',
        policyType: 'kasko',
        coverageType: 'collision',
        typicalLimit: 500000,
        inclusionRate: 100,
        importance: 'critical',
      })
    })

    it('accepts all optional benchmark fields', async () => {
      const dbBenchmark = {
        id: 'bm-1',
        policy_type: 'health',
        coverage_type: 'hospital',
        typical_limit: 200000,
        inclusion_rate: 80,
        importance: 'standard',
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbBenchmark, error: null }))
      const res = await request(app).put('/benchmarks/bm-1').send({
        minLimit: 50000,
        typicalLimit: 200000,
        maxLimit: 500000,
        typicalDeductible: 2000,
        inclusionRate: 80,
        importance: 'standard',
      })
      expect(res.status).toBe(200)
    })

    it('accepts importance=optional enum value', async () => {
      const dbBenchmark = {
        id: 'bm-2',
        policy_type: 'kasko',
        coverage_type: 'glass',
        typical_limit: 10000,
        inclusion_rate: 60,
        importance: 'optional',
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbBenchmark, error: null }))
      const res = await request(app).put('/benchmarks/bm-2').send({ importance: 'optional' })
      expect(res.status).toBe(200)
      expect(res.body.data.importance).toBe('optional')
    })
  })

  // ===========================================================================
  // CATCH-ALL — GET /:category
  // ===========================================================================

  describe('GET /:category', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).get('/ai')
      expect(res.status).toBe(503)
    })

    it('returns 500 on database error', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'query failed' } }))
      const res = await request(app).get('/ai')
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to fetch settings')
    })

    it('returns 404 when data is null', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: null }))
      const res = await request(app).get('/unknown_category')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Category not found')
    })

    it('returns 404 when data is empty array', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: [], error: null }))
      const res = await request(app).get('/nonexistent')
      expect(res.status).toBe(404)
    })

    it('returns 200 with settings array on success', async () => {
      const dbSetting = {
        id: 'set-1',
        key: 'openai_model',
        value: 'gpt-4o',
        value_type: 'string',
        description: 'OpenAI model',
        description_tr: 'OpenAI modeli',
        is_sensitive: false,
        is_readonly: false,
        display_order: 1,
        min_value: null,
        max_value: null,
        allowed_values: null,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: [dbSetting], error: null }))
      const res = await request(app).get('/ai')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.category).toBe('ai')
      expect(res.body.data.settings).toHaveLength(1)
      expect(res.body.data.settings[0]).toMatchObject({
        id: 'set-1',
        key: 'openai_model',
        value: 'gpt-4o',
        valueType: 'string',
        isSensitive: false,
        isReadonly: false,
      })
    })
  })

  // ===========================================================================
  // CATCH-ALL — GET /:category/:key
  // ===========================================================================

  describe('GET /:category/:key', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).get('/ai/openai_model')
      expect(res.status).toBe(503)
    })

    it('returns 404 when setting not found (DB error)', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'no rows' } }))
      const res = await request(app).get('/ai/nonexistent_key')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Setting not found')
    })

    it('returns 404 when setting not found (null data)', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: null }))
      const res = await request(app).get('/ai/nonexistent_key')
      expect(res.status).toBe(404)
    })

    it('returns 200 with full setting details on success', async () => {
      const dbSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'temperature',
        value: 0.1,
        value_type: 'number',
        description: 'AI temperature',
        description_tr: 'AI sıcaklığı',
        is_sensitive: false,
        is_readonly: false,
        min_value: 0,
        max_value: 2,
        allowed_values: null,
        updated_at: '2026-02-20T00:00:00Z',
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: dbSetting, error: null }))
      const res = await request(app).get('/ai/temperature')
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        id: 'set-1',
        category: 'ai',
        key: 'temperature',
        value: 0.1,
        valueType: 'number',
        minValue: 0,
        maxValue: 2,
      })
    })
  })

  // ===========================================================================
  // CATCH-ALL — PUT /:category/:key
  // ===========================================================================

  describe('PUT /:category/:key', () => {
    it('returns 503 when supabase not configured', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const freshApp = await buildApp()
      const res = await request(freshApp).put('/ai/temperature').send({ value: 0.5 })
      expect(res.status).toBe(503)
    })

    it('returns 400 when reason is not a string (schema validation fails)', async () => {
      // updateSettingSchema: value is z.unknown() (accepts anything incl. undefined),
      // but reason must be a string when present
      const res = await request(app).put('/ai/temperature').send({ value: 0.5, reason: 12345 })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
    })

    it('returns 404 when setting does not exist (fetch error)', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: { message: 'no rows' } }))
      const res = await request(app).put('/ai/nonexistent').send({ value: 0.5 })
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Setting not found')
    })

    it('returns 404 when setting does not exist (null fetch data)', async () => {
      mockFrom.mockReturnValue(buildQueryChain({ data: null, error: null }))
      const res = await request(app).put('/ai/nonexistent').send({ value: 0.5 })
      expect(res.status).toBe(404)
    })

    it('returns 403 when setting is read-only', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'readonly_key',
        value: 'fixed',
        is_readonly: true,
        min_value: null,
        max_value: null,
        allowed_values: null,
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: existingSetting, error: null }))
      const res = await request(app).put('/ai/readonly_key').send({ value: 'changed' })
      expect(res.status).toBe(403)
      expect(res.body.error).toBe('Setting is read-only')
    })

    it('returns 400 when numeric value is below min_value', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'temperature',
        value: 0.5,
        is_readonly: false,
        min_value: 0,
        max_value: 2,
        allowed_values: null,
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: existingSetting, error: null }))
      const res = await request(app).put('/ai/temperature').send({ value: -0.1 })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('at least 0')
    })

    it('returns 400 when numeric value is above max_value', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'temperature',
        value: 0.5,
        is_readonly: false,
        min_value: 0,
        max_value: 2,
        allowed_values: null,
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: existingSetting, error: null }))
      const res = await request(app).put('/ai/temperature').send({ value: 2.5 })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('at most 2')
    })

    it('returns 400 when value not in allowed_values', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'provider',
        value: 'openai',
        is_readonly: false,
        min_value: null,
        max_value: null,
        allowed_values: ['openai', 'anthropic'],
      }
      mockFrom.mockReturnValue(buildQueryChain({ data: existingSetting, error: null }))
      const res = await request(app).put('/ai/provider').send({ value: 'google' })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('one of: openai, anthropic')
    })

    it('returns 500 when update query fails', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'temperature',
        value: 0.5,
        is_readonly: false,
        min_value: null,
        max_value: null,
        allowed_values: null,
      }
      // First call: fetch existing — success
      // Second call: update — error
      mockFrom
        .mockReturnValueOnce(buildQueryChain({ data: existingSetting, error: null }))
        .mockReturnValueOnce(buildQueryChain({ data: null, error: { message: 'update failed' } }))
      const res = await request(app).put('/ai/temperature').send({ value: 0.7 })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Failed to update setting')
    })

    it('returns 200 on successful update without reason', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'temperature',
        value: 0.5,
        is_readonly: false,
        min_value: 0,
        max_value: 2,
        allowed_values: null,
      }
      const updatedSetting = { ...existingSetting, value: 0.7, updated_at: '2026-02-20T00:00:00Z' }

      mockFrom
        .mockReturnValueOnce(buildQueryChain({ data: existingSetting, error: null }))
        .mockReturnValueOnce(buildQueryChain({ data: updatedSetting, error: null }))

      const res = await request(app).put('/ai/temperature').send({ value: 0.7 })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toMatchObject({
        key: 'temperature',
        previousValue: 0.5,
        newValue: 0.7,
        updatedAt: '2026-02-20T00:00:00Z',
      })
    })

    it('inserts audit log row when reason is provided', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'evaluation',
        key: 'weight_coverage',
        value: 30,
        is_readonly: false,
        min_value: 0,
        max_value: 100,
        allowed_values: null,
      }
      const updatedSetting = { ...existingSetting, value: 35, updated_at: '2026-02-20T00:00:00Z' }

      const insertChain = buildQueryChain({ data: {}, error: null })
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: existingSetting, error: null })
        if (callCount === 2) return buildQueryChain({ data: updatedSetting, error: null })
        // Third call is the audit log insert
        return insertChain
      })

      const res = await request(app)
        .put('/evaluation/weight_coverage')
        .send({ value: 35, reason: 'Increased weight for better scoring' })
      expect(res.status).toBe(200)
      expect(insertChain.insert).toHaveBeenCalled()
    })

    it('fires webhook on successful update', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'max_tokens',
        value: 4096,
        is_readonly: false,
        min_value: null,
        max_value: null,
        allowed_values: null,
      }
      const updatedSetting = { ...existingSetting, value: 8192, updated_at: '2026-02-20T00:00:00Z' }

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: existingSetting, error: null })
        return buildQueryChain({ data: updatedSetting, error: null })
      })

      await request(app).put('/ai/max_tokens').send({ value: 8192 })
      await new Promise((r) => setTimeout(r, 10))
      expect(mockFireWebhooks).toHaveBeenCalledWith(
        'setting.updated',
        expect.objectContaining({
          category: 'ai',
          changes: expect.arrayContaining([
            expect.objectContaining({ key: 'max_tokens', new_value: 8192 }),
          ]),
        })
      )
    })

    it('continues normally when webhook rejects', async () => {
      mockFireWebhooks.mockRejectedValueOnce(new Error('webhook down'))
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'temperature',
        value: 0.1,
        is_readonly: false,
        min_value: null,
        max_value: null,
        allowed_values: null,
      }
      const updatedSetting = { ...existingSetting, value: 0.2, updated_at: '2026-02-20T00:00:00Z' }

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: existingSetting, error: null })
        return buildQueryChain({ data: updatedSetting, error: null })
      })

      const res = await request(app).put('/ai/temperature').send({ value: 0.2 })
      expect(res.status).toBe(200)
    })

    it('skips min_value check for non-numeric values', async () => {
      // min_value is set but value is a string — should not trigger 400
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'provider',
        value: 'openai',
        is_readonly: false,
        min_value: 0,
        max_value: null,
        allowed_values: null,
      }
      const updatedSetting = {
        ...existingSetting,
        value: 'anthropic',
        updated_at: '2026-02-20T00:00:00Z',
      }

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: existingSetting, error: null })
        return buildQueryChain({ data: updatedSetting, error: null })
      })

      const res = await request(app).put('/ai/provider').send({ value: 'anthropic' })
      expect(res.status).toBe(200)
    })

    it('skips max_value check for non-numeric values', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'model',
        value: 'gpt-4o',
        is_readonly: false,
        min_value: null,
        max_value: 100,
        allowed_values: null,
      }
      const updatedSetting = {
        ...existingSetting,
        value: 'claude-3',
        updated_at: '2026-02-20T00:00:00Z',
      }

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: existingSetting, error: null })
        return buildQueryChain({ data: updatedSetting, error: null })
      })

      const res = await request(app).put('/ai/model').send({ value: 'claude-3' })
      expect(res.status).toBe(200)
    })

    it('value within allowed_values passes validation', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ai',
        key: 'provider',
        value: 'openai',
        is_readonly: false,
        min_value: null,
        max_value: null,
        allowed_values: ['openai', 'anthropic'],
      }
      const updatedSetting = {
        ...existingSetting,
        value: 'anthropic',
        updated_at: '2026-02-20T00:00:00Z',
      }

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: existingSetting, error: null })
        return buildQueryChain({ data: updatedSetting, error: null })
      })

      const res = await request(app).put('/ai/provider').send({ value: 'anthropic' })
      expect(res.status).toBe(200)
    })

    it('accepts null value field (updateSettingSchema accepts unknown)', async () => {
      const existingSetting = {
        id: 'set-1',
        category: 'ui',
        key: 'theme',
        value: 'light',
        is_readonly: false,
        min_value: null,
        max_value: null,
        allowed_values: null,
      }
      const updatedSetting = { ...existingSetting, value: null, updated_at: '2026-02-20T00:00:00Z' }

      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return buildQueryChain({ data: existingSetting, error: null })
        return buildQueryChain({ data: updatedSetting, error: null })
      })

      const res = await request(app).put('/ui/theme').send({ value: null })
      expect(res.status).toBe(200)
    })
  })
})
