/**
 * FX Routes Tests
 *
 * Tests for GET /api/fx/rates endpoint:
 * - Returns rates object with base, rates, timestamp, source
 * - Rate caching (same response within TTL)
 * - Error handling (500 response with fallback rates)
 *
 * Tests for GET /api/fx/status endpoint:
 * - Returns diagnostic info (hasApiKey, lastFetchTime, supportedCurrencies)
 *
 * Tests for exchangerate.host API integration:
 * - Fetches live rates when EXCHANGERATE_API_KEY is set
 * - Falls back gracefully when API fails or key is missing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('express-rate-limit', () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../lib/logger.js', () => {
  const noop = () => {}
  const child = { debug: noop, info: noop, warn: noop, error: noop, child: () => child }
  return { logger: child, default: child }
})

// =============================================================================
// HELPERS
// =============================================================================

const EXPECTED_FALLBACK_RATES = {
  TRY: 1,
  USD: 33.5,
  EUR: 36.5,
  GBP: 42.5,
  CHF: 38.0,
  SAR: 8.9,
  AED: 9.1,
}

async function buildApp() {
  vi.resetModules()
  const app = express()
  app.use(express.json())
  const { default: fxRouter } = await import('../routes/fx.js')
  app.use('/api/fx', fxRouter)
  return app
}

// =============================================================================
// TESTS
// =============================================================================

describe('GET /api/fx/rates', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.clearAllMocks()
    // Build fresh app to reset module-level cachedRates and lastFetchTime
    app = await buildApp()
  })

  it('returns 200 with base, rates, and timestamp', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body).toHaveProperty('base', 'TRY')
    expect(res.body).toHaveProperty('rates')
    expect(res.body).toHaveProperty('timestamp')
    expect(typeof res.body.timestamp).toBe('number')
    expect(res.body.timestamp).toBeGreaterThan(0)
  })

  it('returns all supported currencies in rates', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.rates).toHaveProperty('TRY')
    expect(res.body.rates).toHaveProperty('USD')
    expect(res.body.rates).toHaveProperty('EUR')
    expect(res.body.rates).toHaveProperty('GBP')
  })

  it('returns fallback rates (static values)', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.rates).toEqual(EXPECTED_FALLBACK_RATES)
  })

  it('returns TRY base rate as 1', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.rates.TRY).toBe(1)
    expect(res.body.base).toBe('TRY')
  })

  it('returns cached response on second request within TTL', async () => {
    const res1 = await request(app).get('/api/fx/rates').expect(200)
    const res2 = await request(app).get('/api/fx/rates').expect(200)

    // Same timestamp means cached
    expect(res2.body.timestamp).toBe(res1.body.timestamp)
    expect(res2.body.rates).toEqual(res1.body.rates)
  })

  it('updates timestamp on first request (lastFetchTime was 0)', async () => {
    const before = Date.now()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.timestamp).toBeGreaterThanOrEqual(before)
  })

  it('returns valid JSON content-type', async () => {
    const res = await request(app).get('/api/fx/rates')

    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('all rate values are positive numbers', async () => {
    const res = await request(app).get('/api/fx/rates').expect(200)

    for (const [_currency, rate] of Object.entries(res.body.rates)) {
      expect(typeof rate).toBe('number')
      expect(rate).toBeGreaterThan(0)
    }
  })
})

describe('GET /api/fx/rates — Cache behavior across requests', () => {
  it('returns same timestamp for multiple rapid requests', async () => {
    const app = await buildApp()

    const results = await Promise.all([
      request(app).get('/api/fx/rates'),
      request(app).get('/api/fx/rates'),
      request(app).get('/api/fx/rates'),
    ])

    const timestamps = results.map((r) => r.body.timestamp)
    // All should share the same cached timestamp
    expect(timestamps[0]).toBe(timestamps[1])
    expect(timestamps[1]).toBe(timestamps[2])
  })
})

describe('GET /api/fx/rates — Error handling', () => {
  it('returns 404 for unsupported sub-routes', async () => {
    const app = await buildApp()
    await request(app).get('/api/fx/convert').expect(404)
  })

  it('returns 404 for POST to rates endpoint', async () => {
    const app = await buildApp()
    await request(app).post('/api/fx/rates').expect(404)
  })
})

// =============================================================================
// STATUS ENDPOINT
// =============================================================================

describe('GET /api/fx/status', () => {
  it('returns 200 with diagnostic fields', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/fx/status').expect(200)

    expect(res.body).toHaveProperty('hasApiKey')
    expect(res.body).toHaveProperty('lastFetchTime')
    expect(res.body).toHaveProperty('lastFetchSource')
    expect(res.body).toHaveProperty('cacheTtlMs')
    expect(res.body).toHaveProperty('supportedCurrencies')
    expect(res.body).toHaveProperty('currentRates')
  })

  it('reports hasApiKey as false when not set', async () => {
    delete process.env.EXCHANGERATE_API_KEY
    const app = await buildApp()
    const res = await request(app).get('/api/fx/status').expect(200)

    expect(res.body.hasApiKey).toBe(false)
  })

  it('reports hasApiKey as true when set', async () => {
    process.env.EXCHANGERATE_API_KEY = 'test-key-123'
    const app = await buildApp()
    const res = await request(app).get('/api/fx/status').expect(200)

    expect(res.body.hasApiKey).toBe(true)
    delete process.env.EXCHANGERATE_API_KEY
  })

  it('returns all 7 supported currencies', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/fx/status').expect(200)

    expect(res.body.supportedCurrencies).toEqual(['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'SAR', 'AED'])
    expect(res.body.supportedCurrencies).toHaveLength(7)
  })

  it('returns null lastFetchTime before any rates request', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/fx/status').expect(200)

    expect(res.body.lastFetchTime).toBeNull()
    expect(res.body.cacheAgeMs).toBeNull()
  })

  it('returns lastFetchTime after a rates request', async () => {
    const app = await buildApp()
    await request(app).get('/api/fx/rates').expect(200)
    const res = await request(app).get('/api/fx/status').expect(200)

    expect(res.body.lastFetchTime).toBeGreaterThan(0)
    expect(res.body.cacheAgeMs).toBeGreaterThanOrEqual(0)
  })

  it('returns cacheTtlMs as 6 hours', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/fx/status').expect(200)

    expect(res.body.cacheTtlMs).toBe(1000 * 60 * 60 * 6)
  })

  it('returns currentRates with fallback values before fetch', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/fx/status').expect(200)

    expect(res.body.currentRates).toEqual(EXPECTED_FALLBACK_RATES)
  })
})

// =============================================================================
// RATES WITH SOURCE FIELD
// =============================================================================

describe('GET /api/fx/rates — source field', () => {
  it('returns source field in response', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body).toHaveProperty('source')
    expect(['api', 'fallback']).toContain(res.body.source)
  })

  it('returns source=fallback when no API key is set', async () => {
    delete process.env.EXCHANGERATE_API_KEY
    const app = await buildApp()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.source).toBe('fallback')
  })
})

// =============================================================================
// LIVE API INTEGRATION (mocked fetch)
// =============================================================================

describe('GET /api/fx/rates — exchangerate.host integration', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.EXCHANGERATE_API_KEY
  })

  it('uses live rates when API key is set and API succeeds', async () => {
    process.env.EXCHANGERATE_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        quotes: {
          TRYUSD: 0.03, // 1 TRY = 0.03 USD → 1 USD = 33.3333 TRY
          TRYEUR: 0.027, // 1 TRY = 0.027 EUR → 1 EUR = 37.037 TRY
          TRYGBP: 0.023, // 1 TRY = 0.023 GBP → 1 GBP = 43.4783 TRY
          TRYCHF: 0.026, // 1 TRY = 0.026 CHF → 1 CHF = 38.4615 TRY
          TRYSAR: 0.112, // 1 TRY = 0.112 SAR → 1 SAR = 8.9286 TRY
          TRYAED: 0.11, // 1 TRY = 0.11 AED → 1 AED = 9.0909 TRY
        },
      }),
    }) as typeof fetch

    const app = await buildApp()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.source).toBe('api')
    expect(res.body.rates.TRY).toBe(1)
    // 1/0.03 = 33.3333
    expect(res.body.rates.USD).toBeCloseTo(33.3333, 2)
    expect(res.body.rates.EUR).toBeCloseTo(37.037, 2)
    expect(res.body.rates.GBP).toBeCloseTo(43.4783, 2)
    expect(res.body.rates.CHF).toBeCloseTo(38.4615, 2)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back when API returns success=false', async () => {
    process.env.EXCHANGERATE_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        error: { code: 104, info: 'Monthly API request limit reached' },
      }),
    }) as typeof fetch

    const app = await buildApp()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.source).toBe('fallback')
    expect(res.body.rates).toEqual(EXPECTED_FALLBACK_RATES)
  })

  it('falls back when API returns non-OK HTTP status', async () => {
    process.env.EXCHANGERATE_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as typeof fetch

    const app = await buildApp()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.source).toBe('fallback')
    expect(res.body.rates).toEqual(EXPECTED_FALLBACK_RATES)
  })

  it('falls back when fetch throws network error', async () => {
    process.env.EXCHANGERATE_API_KEY = 'test-key'
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as typeof fetch

    const app = await buildApp()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.source).toBe('fallback')
    expect(res.body.rates).toEqual(EXPECTED_FALLBACK_RATES)
  })

  it('uses fallback for individual missing currencies', async () => {
    process.env.EXCHANGERATE_API_KEY = 'test-key'
    // Only provide USD and EUR, omit the rest
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        quotes: {
          TRYUSD: 0.03,
          TRYEUR: 0.027,
          // GBP, CHF, SAR, AED missing
        },
      }),
    }) as typeof fetch

    const app = await buildApp()
    const res = await request(app).get('/api/fx/rates').expect(200)

    expect(res.body.source).toBe('api')
    expect(res.body.rates.USD).toBeCloseTo(33.3333, 2)
    expect(res.body.rates.EUR).toBeCloseTo(37.037, 2)
    // Missing currencies should use fallback values
    expect(res.body.rates.GBP).toBe(42.5)
    expect(res.body.rates.CHF).toBe(38.0)
    expect(res.body.rates.SAR).toBe(8.9)
    expect(res.body.rates.AED).toBe(9.1)
  })

  it('caches API results and does not re-fetch within TTL', async () => {
    process.env.EXCHANGERATE_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        quotes: {
          TRYUSD: 0.03,
          TRYEUR: 0.027,
          TRYGBP: 0.023,
          TRYCHF: 0.026,
          TRYSAR: 0.112,
          TRYAED: 0.11,
        },
      }),
    }) as typeof fetch

    const app = await buildApp()
    await request(app).get('/api/fx/rates').expect(200)
    await request(app).get('/api/fx/rates').expect(200)
    await request(app).get('/api/fx/rates').expect(200)

    // Only one fetch call despite 3 requests
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
