/**
 * Tests for server/services/notification-service.ts
 *
 * Covers: VAPID configuration, sendPushNotification core logic,
 * 410/404 stale subscription cleanup, and convenience helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (must be hoisted before any imports that use them)
// ---------------------------------------------------------------------------

const { mockSetVapidDetails, mockSendNotification } = vi.hoisted(() => ({
  mockSetVapidDetails: vi.fn(),
  mockSendNotification: vi.fn(),
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}))

const {
  mockFrom,
  mockSelect,
  mockSelectEq,
  mockEq,
  mockIn,
  mockDelete,
  mockThen,
  mockCatch,
  mockCreateClient,
} = vi.hoisted(() => {
  const mockCatch = vi.fn().mockReturnThis()
  const mockThen = vi.fn().mockReturnThis()
  const mockIn = vi.fn().mockReturnValue({ then: mockThen, catch: mockCatch })
  const mockEq = vi.fn().mockReturnValue({
    in: mockIn,
    then: mockThen,
    catch: mockCatch,
  })
  // mockSelectEq: resolves the select().eq() chain (data query)
  const mockSelectEq = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockSelectEq })
  const mockDelete = vi.fn().mockReturnValue({ eq: mockEq })
  const mockFrom = vi.fn().mockReturnValue({
    select: mockSelect,
    delete: mockDelete,
  })

  return {
    mockFrom,
    mockSelect,
    mockSelectEq,
    mockEq,
    mockIn,
    mockDelete,
    mockThen,
    mockCatch,
    mockCreateClient: vi.fn().mockReturnValue({ from: mockFrom }),
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSubscriptions(
  count: number
): Array<{ id: string; endpoint: string; p256dh: string; auth: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: `sub-${i}`,
    endpoint: `https://push.example.com/subscription-${i}`,
    p256dh: `key-${i}`,
    auth: `auth-${i}`,
  }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notification-service', () => {
  let service: typeof import('../services/notification-service.js')

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Re-establish Supabase mock chain after clearAllMocks wipes implementations
    mockSelectEq.mockResolvedValue({ data: null, error: null })
    mockSelect.mockReturnValue({ eq: mockSelectEq })
    const mockEqForDelete = mockEq
    mockEqForDelete.mockReturnValue({ in: mockIn, then: mockThen, catch: mockCatch })
    mockIn.mockReturnValue({ then: mockThen, catch: mockCatch })
    mockThen.mockReturnThis()
    mockCatch.mockReturnThis()
    mockDelete.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect, delete: mockDelete })
    mockCreateClient.mockReturnValue({ from: mockFrom })

    // Reset env
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    delete process.env.VAPID_SUBJECT
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.FRONTEND_URL

    // Re-import fresh module so module-level vars are reset
    service = await import('../services/notification-service.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // configureWebPush
  // -------------------------------------------------------------------------
  describe('configureWebPush', () => {
    it('calls setVapidDetails when keys are present', () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.VAPID_SUBJECT = 'mailto:test@example.com'

      service.configureWebPush()

      expect(mockSetVapidDetails).toHaveBeenCalledWith(
        'mailto:test@example.com',
        'pub-key',
        'priv-key'
      )
    })

    it('uses default subject when VAPID_SUBJECT is not set', () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'

      service.configureWebPush()

      expect(mockSetVapidDetails).toHaveBeenCalledWith(
        'mailto:contact@insurai.com',
        'pub-key',
        'priv-key'
      )
    })

    it('does NOT call setVapidDetails when public key is missing', () => {
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      // No public key

      service.configureWebPush()

      expect(mockSetVapidDetails).not.toHaveBeenCalled()
    })

    it('does NOT call setVapidDetails when private key is missing', () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      // No private key

      service.configureWebPush()

      expect(mockSetVapidDetails).not.toHaveBeenCalled()
    })

    it('does NOT configure when both keys are missing', () => {
      service.configureWebPush()
      expect(mockSetVapidDetails).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // getVapidPublicKey
  // -------------------------------------------------------------------------
  describe('getVapidPublicKey', () => {
    it('returns null when VAPID_PUBLIC_KEY is not set', () => {
      expect(service.getVapidPublicKey()).toBeNull()
    })

    it('returns the key when VAPID_PUBLIC_KEY is set', () => {
      process.env.VAPID_PUBLIC_KEY = 'my-public-key'
      expect(service.getVapidPublicKey()).toEqual('my-public-key')
    })
  })

  // -------------------------------------------------------------------------
  // isWebPushConfigured
  // -------------------------------------------------------------------------
  describe('isWebPushConfigured', () => {
    it('returns false before configureWebPush is called', () => {
      expect(service.isWebPushConfigured()).toBe(false)
    })

    it('returns false when keys are missing', () => {
      service.configureWebPush()
      expect(service.isWebPushConfigured()).toBe(false)
    })

    it('returns true after successful configuration', () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'

      service.configureWebPush()

      expect(service.isWebPushConfigured()).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // sendPushNotification
  // -------------------------------------------------------------------------
  describe('sendPushNotification', () => {
    const userId = 'user-123'
    const payload = {
      title: 'Test',
      body: 'Test body',
      url: '/dashboard',
    }

    it('returns 0 when web push is not configured', async () => {
      // Do NOT call configureWebPush — webPushConfigured stays false
      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(0)
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('returns 0 when Supabase is not configured', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      service.configureWebPush()
      // No SUPABASE_URL/KEY — getSupabase returns null

      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(0)
    })

    it('returns 0 when Supabase query fails', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()

      mockSelectEq.mockResolvedValueOnce({
        data: null,
        error: { message: 'DB error' },
      })

      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(0)
    })

    it('returns 0 when user has no subscriptions', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()

      mockSelectEq.mockResolvedValueOnce({ data: [], error: null })

      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(0)
      expect(mockSendNotification).not.toHaveBeenCalled()
    })

    it('sends to each subscription and counts successes', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()

      const subs = makeSubscriptions(3)
      mockSelectEq.mockResolvedValueOnce({ data: subs, error: null })
      mockSendNotification.mockResolvedValue(undefined) // all succeed

      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(3)
      expect(mockSendNotification).toHaveBeenCalledTimes(3)
    })

    it('sends stringified JSON payload', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()

      const subs = makeSubscriptions(1)
      mockSelectEq.mockResolvedValueOnce({ data: subs, error: null })
      mockSendNotification.mockResolvedValue(undefined)

      await service.sendPushNotification(userId, payload)

      expect(mockSendNotification).toHaveBeenCalledWith(
        { endpoint: subs[0].endpoint, keys: { p256dh: subs[0].p256dh, auth: subs[0].auth } },
        JSON.stringify(payload)
      )
    })

    it('marks 410 responses as stale (subscription expired)', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()

      const subs = makeSubscriptions(1)
      mockSelectEq.mockResolvedValueOnce({ data: subs, error: null })
      const err410 = Object.assign(new Error('Gone'), { statusCode: 410 })
      mockSendNotification.mockRejectedValueOnce(err410)

      // stale cleanup chain
      mockEq.mockReturnValueOnce({ in: mockIn })
      mockIn.mockReturnValueOnce({ then: mockThen, catch: mockCatch })

      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(0) // no successes
      // Delete should have been called to clean up
      expect(mockDelete).toHaveBeenCalled()
    })

    it('marks 404 responses as stale (subscription not found)', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()

      const subs = makeSubscriptions(1)
      mockSelectEq.mockResolvedValueOnce({ data: subs, error: null })
      const err404 = Object.assign(new Error('Not Found'), { statusCode: 404 })
      mockSendNotification.mockRejectedValueOnce(err404)

      mockEq.mockReturnValueOnce({ in: mockIn })
      mockIn.mockReturnValueOnce({ then: mockThen, catch: mockCatch })

      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(0)
      expect(mockDelete).toHaveBeenCalled()
    })

    it('does NOT delete on non-4xx errors (5xx, network errors)', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()

      const subs = makeSubscriptions(1)
      mockSelectEq.mockResolvedValueOnce({ data: subs, error: null })
      const err500 = Object.assign(new Error('Server Error'), { statusCode: 500 })
      mockSendNotification.mockRejectedValueOnce(err500)

      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(0)
      // Delete should NOT be called for non-410/404 errors
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('counts successes among partial failures', async () => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()

      const subs = makeSubscriptions(3)
      mockSelectEq.mockResolvedValueOnce({ data: subs, error: null })

      // First succeeds, second fails with 410, third succeeds
      mockSendNotification
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }))
        .mockResolvedValueOnce(undefined)

      mockEq.mockReturnValueOnce({ in: mockIn })
      mockIn.mockReturnValueOnce({ then: mockThen, catch: mockCatch })

      const result = await service.sendPushNotification(userId, payload)
      expect(result).toBe(2) // 2 of 3 succeeded
    })
  })

  // -------------------------------------------------------------------------
  // sendExtractionCompleteNotification
  // -------------------------------------------------------------------------
  describe('sendExtractionCompleteNotification', () => {
    beforeEach(() => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()
      mockSelectEq.mockResolvedValue({ data: makeSubscriptions(1), error: null })
      mockSendNotification.mockResolvedValue(undefined)
    })

    it('sends a notification with Turkish title', async () => {
      await service.sendExtractionCompleteNotification('user-1', 'kasko', 'POL-001')

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { title: string; body: string; url: string }
      expect(parsed.title).toBe('Analiz tamamlandı ✓')
    })

    it('includes policy number and type in body', async () => {
      await service.sendExtractionCompleteNotification('user-1', 'kasko', 'POL-001')

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { body: string }
      expect(parsed.body).toContain('kasko')
      expect(parsed.body).toContain('POL-001')
    })

    it('omits policy number when null', async () => {
      await service.sendExtractionCompleteNotification('user-1', 'trafik', null)

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { body: string }
      expect(parsed.body).toContain('trafik')
      // No " – " separator when there's no policy number
      expect(parsed.body).not.toContain(' – ')
    })

    it('points URL to /dashboard', async () => {
      await service.sendExtractionCompleteNotification('user-1', 'kasko', null)

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { url: string }
      expect(parsed.url).toContain('/dashboard')
    })

    it('includes view and dismiss actions', async () => {
      await service.sendExtractionCompleteNotification('user-1', 'kasko', null)

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { actions: Array<{ action: string }> }
      const actionIds = parsed.actions.map((a) => a.action)
      expect(actionIds).toContain('view')
      expect(actionIds).toContain('dismiss')
    })
  })

  // -------------------------------------------------------------------------
  // sendPolicyExpiryNotification
  // -------------------------------------------------------------------------
  describe('sendPolicyExpiryNotification', () => {
    beforeEach(() => {
      process.env.VAPID_PUBLIC_KEY = 'pub-key'
      process.env.VAPID_PRIVATE_KEY = 'priv-key'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
      service.configureWebPush()
      mockSelectEq.mockResolvedValue({ data: makeSubscriptions(1), error: null })
      mockSendNotification.mockResolvedValue(undefined)
    })

    it('includes days until expiry in title', async () => {
      await service.sendPolicyExpiryNotification('user-1', 'kasko', 'POL-001', 7)

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { title: string }
      expect(parsed.title).toContain('7')
    })

    it('includes policy type in body', async () => {
      await service.sendPolicyExpiryNotification('user-1', 'sağlık', null, 14)

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { body: string }
      expect(parsed.body).toContain('sağlık')
      expect(parsed.body).toContain('14')
    })

    it('includes policy number when provided', async () => {
      await service.sendPolicyExpiryNotification('user-1', 'konut', 'KON-999', 30)

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { body: string }
      expect(parsed.body).toContain('KON-999')
    })

    it('points URL to /dashboard', async () => {
      await service.sendPolicyExpiryNotification('user-1', 'kasko', null, 5)

      const callArg = mockSendNotification.mock.calls[0][1] as string
      const parsed = JSON.parse(callArg) as { url: string }
      expect(parsed.url).toContain('/dashboard')
    })
  })
})
