import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLiveRates } from '../routes/fx.js'
import * as adminAuthModule from '../middleware/admin-auth.js'

// Mock dependencies
vi.mock('../middleware/admin-auth.js', async () => {
  const actual = await vi.importActual('../middleware/admin-auth.js')
  return {
    ...actual,
    getSupabaseWithError: vi.fn(),
  }
})

vi.mock('../lib/logger.js', () => ({
  default: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('FX Monitoring - fetchLiveRates Alerts', () => {
  const mockInsert = vi.fn()
  const mockSelect = vi.fn()
  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
  }))

  const mockSupabase = {
    from: mockFrom,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default successful mock responses
    mockSelect.mockReturnThis()
    // For order, limit, single
    const queryBuilder = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          rates: { EUR: 36.5, GBP: 43.2 },
        },
        error: null,
      }),
    }
    mockSelect.mockReturnValue(queryBuilder)
    mockInsert.mockResolvedValue({ error: null })

    const { getSupabaseWithError } = vi.mocked(adminAuthModule)
    getSupabaseWithError.mockReturnValue({
      client: mockSupabase as any,
      error: null,
    })

    // Mock global fetch for exchangerate.host API
    // EUR changed to 40 (which is > 5% diff from 36.5) -> quote = 1 / 40 = 0.025
    // GBP remains almost same ~ 43.4 -> quote = 1 / 43.4 = 0.02304
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        quotes: {
          TRYEUR: 0.025,
          TRYGBP: 0.02304,
        },
      }),
    })

    // Set mock env var because fetchLiveRates checks it
    process.env.EXCHANGERATE_API_KEY = 'mock_key'
  })

  afterEach(() => {
    delete process.env.EXCHANGERATE_API_KEY
  })

  it('detects combined rate fluctuations > 5% and creates an admin notification', async () => {
    const rates = await fetchLiveRates()

    expect(rates).toBeDefined()
    expect(rates).not.toBeNull()
    expect(rates!.EUR).toBe(40)

    // Check if the history insert was called
    expect(mockFrom).toHaveBeenCalledWith('fx_rate_history')
    expect(mockInsert).toHaveBeenCalledTimes(2) // Once for history, once for notification

    // The call to insert logic admin_notifications
    expect(mockFrom).toHaveBeenCalledWith('admin_notifications')
    const notificationCall = mockInsert.mock.calls.find(
      (call) =>
        Array.isArray(call[0]) &&
        call[0].length > 0 &&
        call[0][0].title === 'FX Rate Deviation Alert (>5%)'
    )
    expect(notificationCall).toBeDefined()
    const notificationArgs = notificationCall![0][0]
    expect(notificationArgs).toMatchObject({
      title: 'FX Rate Deviation Alert (>5%)',
      type: 'warning',
    })
    expect(notificationArgs.message).toContain('EUR: 9.6% (from 36.5 to 40)')
  })

  it('does not create a notification if fluctuations are <= 5%', async () => {
    // Override fetch to return a minor change
    // EUR returns ~37 -> quote = 1 / 37 = 0.02702
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        quotes: {
          TRYEUR: 0.02702,
          TRYGBP: 0.02304,
        },
      }),
    })

    await fetchLiveRates()

    // Should insert into history, but NOT admin_notifications
    expect(mockFrom).toHaveBeenCalledWith('fx_rate_history')
    expect(mockInsert).toHaveBeenCalledTimes(1) // Only for history

    // Verify it didn't call insert for admin_notifications
    const mockFromCalls = mockFrom.mock.calls.map((call: any[]) => call[0])
    expect(mockFromCalls).not.toContain('admin_notifications')
  })
})
