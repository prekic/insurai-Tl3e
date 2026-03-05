/**
 * FXService Unit Tests
 *
 * Tests for:
 * - SUPPORTED_CURRENCIES and FALLBACK_RATES exports
 * - convertSync() — identity, TRY→USD, USD→EUR, uses cached rates
 * - convert() — async with cached rates and fresh fetch
 * - getRates() — caching within TTL, fetch after TTL expiry, fallback on fetch failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// =============================================================================
// MOCKS
// =============================================================================

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// =============================================================================
// IMPORTS (after mocks)
// =============================================================================

import {
  SUPPORTED_CURRENCIES,
  FALLBACK_RATES,
  type SupportedCurrency as _SupportedCurrency,
} from './fx-service'

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates a fresh FXService instance for test isolation.
 * We re-import the module each time to reset the singleton's internal cache.
 */
async function createFreshService() {
  vi.resetModules()
  const mod = await import('./fx-service')
  return mod.fxService
}

function mockSuccessResponse(
  rates: Record<string, number> = { TRY: 1, USD: 34, EUR: 37, GBP: 43 }
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ base: 'TRY', rates }),
  })
}

function mockFailedResponse() {
  mockFetch.mockRejectedValueOnce(new Error('Network error'))
}

function mockNonOkResponse() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: async () => ({ error: 'Internal error' }),
  })
}

// =============================================================================
// TESTS
// =============================================================================

describe('FXService Exports', () => {
  it('exports SUPPORTED_CURRENCIES with TRY, USD, EUR, GBP', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['TRY', 'USD', 'EUR', 'GBP'])
    expect(SUPPORTED_CURRENCIES).toHaveLength(4)
  })

  it('exports FALLBACK_RATES with TRY as base (1)', () => {
    expect(FALLBACK_RATES.TRY).toBe(1)
    expect(FALLBACK_RATES.USD).toBe(33.5)
    expect(FALLBACK_RATES.EUR).toBe(36.5)
    expect(FALLBACK_RATES.GBP).toBe(42.5)
  })

  it('FALLBACK_RATES has entries for all supported currencies', () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(FALLBACK_RATES[currency]).toBeDefined()
      expect(typeof FALLBACK_RATES[currency]).toBe('number')
      expect(FALLBACK_RATES[currency]).toBeGreaterThan(0)
    }
  })
})

describe('FXService.convertSync()', () => {
  let service: Awaited<ReturnType<typeof createFreshService>>

  beforeEach(async () => {
    vi.clearAllMocks()
    service = await createFreshService()
  })

  it('returns same amount for identity conversion (same currency)', () => {
    expect(service.convertSync(100, 'TRY', 'TRY')).toBe(100)
    expect(service.convertSync(250.5, 'USD', 'USD')).toBe(250.5)
    expect(service.convertSync(0, 'EUR', 'EUR')).toBe(0)
  })

  it('converts TRY→USD using fallback rates when no cache', () => {
    // 100 TRY * 1 (TRY rate) / 33.5 (USD rate)
    const result = service.convertSync(100, 'TRY', 'USD')
    expect(result).toBeCloseTo(100 / 33.5, 5)
  })

  it('converts USD→EUR using fallback rates when no cache', () => {
    // 100 USD * 33.5 (USD rate) / 36.5 (EUR rate)
    const result = service.convertSync(100, 'USD', 'EUR')
    expect(result).toBeCloseTo((100 * 33.5) / 36.5, 5)
  })

  it('converts TRY→GBP using fallback rates', () => {
    const result = service.convertSync(1000, 'TRY', 'GBP')
    expect(result).toBeCloseTo(1000 / 42.5, 5)
  })

  it('converts GBP→TRY using fallback rates', () => {
    // 10 GBP * 42.5 / 1 = 425 TRY
    const result = service.convertSync(10, 'GBP', 'TRY')
    expect(result).toBeCloseTo(425, 5)
  })

  it('handles zero amount', () => {
    expect(service.convertSync(0, 'TRY', 'USD')).toBe(0)
  })

  it('uses cached rates when available', async () => {
    // Populate cache by calling getRates
    mockSuccessResponse({ TRY: 1, USD: 34, EUR: 37, GBP: 43 })
    await service.getRates()

    // convertSync should now use cached rate (34) not fallback (33.5)
    const result = service.convertSync(100, 'TRY', 'USD')
    expect(result).toBeCloseTo(100 / 34, 5)
  })
})

describe('FXService.convert() (async)', () => {
  let service: Awaited<ReturnType<typeof createFreshService>>

  beforeEach(async () => {
    vi.clearAllMocks()
    service = await createFreshService()
  })

  it('returns same amount for identity conversion without fetching', async () => {
    const result = await service.convert(500, 'EUR', 'EUR')
    expect(result).toBe(500)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches rates and converts TRY→USD', async () => {
    mockSuccessResponse({ TRY: 1, USD: 34, EUR: 37, GBP: 43 })
    const result = await service.convert(100, 'TRY', 'USD')
    expect(result).toBeCloseTo(100 / 34, 5)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('fetches rates and converts USD→EUR', async () => {
    mockSuccessResponse({ TRY: 1, USD: 34, EUR: 37, GBP: 43 })
    const result = await service.convert(100, 'USD', 'EUR')
    expect(result).toBeCloseTo((100 * 34) / 37, 5)
  })

  it('uses cached rates on second call within TTL', async () => {
    mockSuccessResponse({ TRY: 1, USD: 34, EUR: 37, GBP: 43 })

    await service.convert(100, 'TRY', 'USD')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Second call should use cache
    const result = await service.convert(200, 'TRY', 'USD')
    expect(result).toBeCloseTo(200 / 34, 5)
    expect(mockFetch).toHaveBeenCalledTimes(1) // no additional fetch
  })

  it('falls back to FALLBACK_RATES when fetch fails', async () => {
    mockFailedResponse()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await service.convert(100, 'TRY', 'USD')
    expect(result).toBeCloseTo(100 / 33.5, 5)
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('falls back to FALLBACK_RATES when response is not ok', async () => {
    mockNonOkResponse()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await service.convert(100, 'TRY', 'EUR')
    expect(result).toBeCloseTo(100 / 36.5, 5)

    warnSpy.mockRestore()
  })
})

describe('FXService.getRates() caching', () => {
  let service: Awaited<ReturnType<typeof createFreshService>>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    service = await createFreshService()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns cached rates within TTL (4 hours)', async () => {
    mockSuccessResponse({ TRY: 1, USD: 34, EUR: 37, GBP: 43 })

    const first = await service.getRates()
    expect(first.rates.USD).toBe(34)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Advance 3 hours (within 4h TTL)
    vi.advanceTimersByTime(3 * 60 * 60 * 1000)

    const second = await service.getRates()
    expect(second.rates.USD).toBe(34)
    expect(mockFetch).toHaveBeenCalledTimes(1) // still cached
  })

  it('fetches new rates after TTL expires', async () => {
    mockSuccessResponse({ TRY: 1, USD: 34, EUR: 37, GBP: 43 })

    await service.getRates()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Advance past 4h TTL
    vi.advanceTimersByTime(4 * 60 * 60 * 1000 + 1)

    mockSuccessResponse({ TRY: 1, USD: 35, EUR: 38, GBP: 44 })

    const refreshed = await service.getRates()
    expect(refreshed.rates.USD).toBe(35)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns fallback rates with base TRY on fetch failure', async () => {
    mockFailedResponse()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await service.getRates()
    expect(result.base).toBe('TRY')
    expect(result.rates).toEqual(FALLBACK_RATES)
    expect(result.timestamp).toBeGreaterThan(0)

    warnSpy.mockRestore()
  })

  it('returns fresh timestamp on each call (fallback)', async () => {
    mockFailedResponse()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const now = Date.now()
    const result = await service.getRates()
    expect(result.timestamp).toBeGreaterThanOrEqual(now)

    warnSpy.mockRestore()
  })

  it('calls /api/fx/rates endpoint', async () => {
    mockSuccessResponse()
    await service.getRates()
    expect(mockFetch).toHaveBeenCalledWith('/api/fx/rates')
  })

  it('does not cache fallback results (re-fetches next time)', async () => {
    mockFailedResponse()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await service.getRates()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Next call should attempt fetch again since fallback is not cached
    mockSuccessResponse({ TRY: 1, USD: 35, EUR: 38, GBP: 44 })
    const second = await service.getRates()
    expect(second.rates.USD).toBe(35)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    warnSpy.mockRestore()
  })
})
