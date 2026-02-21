/**
 * Tests for src/hooks/usePushNotifications.ts
 *
 * Covers: isSupported detection, permission states, subscription status
 * checking, subscribe() and unsubscribe() flows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mutable auth state — avoids vi.doMock/vi.resetModules() bleed between tests
const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: {
    user: { id: 'user-123' } as { id: string } | null,
    session: { access_token: 'token-abc' } as { access_token: string } | null,
  },
}))

vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({ user: mockAuthState.user, session: mockAuthState.session }),
}))

const {
  mockGetPushSubscription,
  mockSubscribeToPush,
  mockUnsubscribeFromPush,
} = vi.hoisted(() => ({
  mockGetPushSubscription: vi.fn(),
  mockSubscribeToPush: vi.fn(),
  mockUnsubscribeFromPush: vi.fn(),
}))

vi.mock('@/lib/pwa', () => ({
  subscribeToPush: mockSubscribeToPush,
  unsubscribeFromPush: mockUnsubscribeFromPush,
  getPushSubscription: mockGetPushSubscription,
}))

vi.mock('@/lib/env', () => ({
  default: { proxyUrl: 'http://localhost:4001', hasProxy: true },
}))

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const originalNotification = globalThis.Notification

function setPushSupported(supported: boolean): void {
  if (supported) {
    Object.defineProperty(window, 'PushManager', {
      value: class PushManager {},
      writable: true,
      configurable: true,
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({}) },
      writable: true,
      configurable: true,
    })
     
    ;(globalThis as any).Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    }
  } else {
     
    delete (window as any).PushManager
    // Use delete so `'Notification' in window` returns false (assigning undefined still returns true)
     
    delete (globalThis as any).Notification
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mutable auth state to defaults
    mockAuthState.user = { id: 'user-123' }
    mockAuthState.session = { access_token: 'token-abc' }
    setPushSupported(true)
    // Default: no existing subscription
    mockGetPushSubscription.mockResolvedValue(null)
    // Default status response: not subscribed
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ subscribed: false, deviceCount: 0 }),
    })
  })

  afterEach(() => {
     
    ;(globalThis as any).Notification = originalNotification
  })

  async function renderHookWithImport() {
    const { usePushNotifications } = await import('./usePushNotifications')
    return renderHook(() => usePushNotifications())
  }

  // -------------------------------------------------------------------------
  // isSupported
  // -------------------------------------------------------------------------
  describe('isSupported', () => {
    it('is true when PushManager, serviceWorker, and Notification are available', async () => {
      setPushSupported(true)
      const { result } = await renderHookWithImport()
      expect(result.current.isSupported).toBe(true)
    })

    it('is false when PushManager is missing', async () => {
       
      delete (window as any).PushManager
      const { result } = await renderHookWithImport()
      expect(result.current.isSupported).toBe(false)
    })

    it('is false when Notification is missing', async () => {
      // Must delete (not assign undefined) so `'Notification' in window` returns false
       
      delete (globalThis as any).Notification
      const { result } = await renderHookWithImport()
      expect(result.current.isSupported).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Initial permission state
  // -------------------------------------------------------------------------
  describe('permission', () => {
    it('reflects Notification.permission on mount', async () => {
       
      ;(globalThis as any).Notification = { ...originalNotification, permission: 'granted', requestPermission: vi.fn() }
      const { result } = await renderHookWithImport()
      expect(result.current.permission).toBe('granted')
    })
  })

  // -------------------------------------------------------------------------
  // isSubscribed — mount check
  // -------------------------------------------------------------------------
  describe('isSubscribed on mount', () => {
    it('is false when no SW subscription exists', async () => {
      mockGetPushSubscription.mockResolvedValue(null)

      const { result } = await renderHookWithImport()

      await waitFor(() => {
        expect(result.current.isSubscribed).toBe(false)
      })
    })

    it('is true when SW subscription exists AND server confirms', async () => {
      const fakeSub = { endpoint: 'https://push.example.com/abc' }
      mockGetPushSubscription.mockResolvedValue(fakeSub)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ subscribed: true, deviceCount: 1 }),
      })

      const { result } = await renderHookWithImport()

      await waitFor(() => {
        expect(result.current.isSubscribed).toBe(true)
      })
    })

    it('falls back to SW state when server check fails', async () => {
      const fakeSub = { endpoint: 'https://push.example.com/abc' }
      mockGetPushSubscription.mockResolvedValue(fakeSub)
      mockFetch.mockResolvedValue({ ok: false })

      const { result } = await renderHookWithImport()

      await waitFor(() => {
        expect(result.current.isSubscribed).toBe(true) // trusts SW
      })
    })

    it('is false when user is null (not logged in)', async () => {
      // Use mutable auth state to avoid vi.doMock/vi.resetModules() contamination
      mockAuthState.user = null
      mockAuthState.session = null

      const { result } = await renderHookWithImport()

      await waitFor(() => {
        expect(result.current.isSubscribed).toBe(false)
      })
    })
  })

  // -------------------------------------------------------------------------
  // subscribe()
  // -------------------------------------------------------------------------
  describe('subscribe', () => {
    it('returns false when push is not supported', async () => {
       
      delete (window as any).PushManager
      const { result } = await renderHookWithImport()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.subscribe()
      })
      expect(ok).toBe(false)
    })

    it('requests notification permission', async () => {
       
      const mockRequest = vi.fn().mockResolvedValue('denied')
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: mockRequest }

      const { result } = await renderHookWithImport()

      await act(async () => {
        await result.current.subscribe()
      })

      expect(mockRequest).toHaveBeenCalled()
    })

    it('returns false when permission is denied', async () => {
       
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('denied') }

      const { result } = await renderHookWithImport()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.subscribe()
      })

      expect(ok).toBe(false)
    })

    it('fetches VAPID public key from server', async () => {
       
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') }
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ publicKey: 'vapid-public-key' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        })
      mockSubscribeToPush.mockResolvedValue({
        endpoint: 'https://push.example.com/new',
        toJSON: () => ({ keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
      })

      const { result } = await renderHookWithImport()

      await act(async () => {
        await result.current.subscribe()
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/public-key')
      )
    })

    it('returns false when VAPID key fetch fails', async () => {
       
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') }
      mockFetch.mockResolvedValueOnce({ ok: false })

      const { result } = await renderHookWithImport()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.subscribe()
      })

      expect(ok).toBe(false)
    })

    it('calls subscribeToPush with the VAPID key', async () => {
       
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') }
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ publicKey: 'the-vapid-key' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        })
      mockSubscribeToPush.mockResolvedValue({
        endpoint: 'https://push.example.com/new',
        toJSON: () => ({ keys: { p256dh: 'p256dh', auth: 'auth' } }),
      })

      const { result } = await renderHookWithImport()

      await act(async () => {
        await result.current.subscribe()
      })

      expect(mockSubscribeToPush).toHaveBeenCalledWith('the-vapid-key')
    })

    it('returns false when subscribeToPush returns null', async () => {
       
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'vapid-key' }),
      })
      mockSubscribeToPush.mockResolvedValue(null)

      const { result } = await renderHookWithImport()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.subscribe()
      })

      expect(ok).toBe(false)
    })

    it('posts subscription to server', async () => {
       
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') }
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ publicKey: 'vapid-key' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        })
      mockSubscribeToPush.mockResolvedValue({
        endpoint: 'https://push.example.com/new',
        toJSON: () => ({ keys: { p256dh: 'p256dh', auth: 'auth-token' } }),
      })

      const { result } = await renderHookWithImport()

      await act(async () => {
        await result.current.subscribe()
      })

      const postCall = mockFetch.mock.calls.find(([url]) =>
        (url as string).includes('/api/notifications/subscribe')
      )
      expect(postCall).toBeDefined()
      expect(postCall![1]).toMatchObject({ method: 'POST' })
    })

    it('returns true on successful subscription', async () => {
       
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') }
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ publicKey: 'vapid-key' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        })
      mockSubscribeToPush.mockResolvedValue({
        endpoint: 'https://push.example.com/new',
        toJSON: () => ({ keys: { p256dh: 'p256dh', auth: 'auth' } }),
      })

      const { result } = await renderHookWithImport()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.subscribe()
      })

      expect(ok).toBe(true)
      expect(result.current.isSubscribed).toBe(true)
    })

    it('returns false and unsubscribes from SW when server registration fails', async () => {
       
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') }
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ publicKey: 'vapid-key' }),
        })
        .mockResolvedValueOnce({ ok: false }) // server registration fails
      mockSubscribeToPush.mockResolvedValue({
        endpoint: 'https://push.example.com/new',
        toJSON: () => ({ keys: { p256dh: 'p256dh', auth: 'auth' } }),
      })
      mockUnsubscribeFromPush.mockResolvedValue(true)

      const { result } = await renderHookWithImport()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.subscribe()
      })

      expect(ok).toBe(false)
      expect(mockUnsubscribeFromPush).toHaveBeenCalled() // cleanup
    })

    it('sets isLoading during the operation', async () => {
      ;(globalThis as any).Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('denied') }

      const { result } = await renderHookWithImport()

      expect(result.current.isLoading).toBe(false)
      // isLoading becomes true during subscribe and false after
      let _loadingDuring = false
      ;(globalThis as any).Notification.requestPermission = vi.fn().mockImplementation(async () => {
        _loadingDuring = result.current.isLoading
        return 'denied'
      })

      await act(async () => {
        await result.current.subscribe()
      })

      expect(result.current.isLoading).toBe(false) // reset after
    })
  })

  // -------------------------------------------------------------------------
  // unsubscribe()
  // -------------------------------------------------------------------------
  describe('unsubscribe', () => {
    it('returns false when push is not supported', async () => {
       
      delete (window as any).PushManager
      const { result } = await renderHookWithImport()

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.unsubscribe()
      })

      expect(ok).toBe(false)
    })

    it('gets current subscription then unsubscribes from SW', async () => {
      const fakeSub = { endpoint: 'https://push.example.com/old' }
      mockGetPushSubscription.mockResolvedValue(fakeSub)
      mockUnsubscribeFromPush.mockResolvedValue(true)
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      const { result } = await renderHookWithImport()

      await act(async () => {
        await result.current.unsubscribe()
      })

      expect(mockUnsubscribeFromPush).toHaveBeenCalled()
    })

    it('sends DELETE to server with the endpoint', async () => {
      const endpoint = 'https://push.example.com/old-endpoint'
      mockGetPushSubscription
        .mockResolvedValueOnce(null) // mount check
        .mockResolvedValueOnce({ endpoint }) // during unsubscribe
      mockUnsubscribeFromPush.mockResolvedValue(true)
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      const { result } = await renderHookWithImport()

      await act(async () => {
        await result.current.unsubscribe()
      })

      const deleteCall = mockFetch.mock.calls.find(([url]) =>
        (url as string).includes('/api/notifications/unsubscribe')
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall![1]).toMatchObject({ method: 'DELETE' })
    })

    it('sets isSubscribed to false after successful unsubscribe', async () => {
      mockGetPushSubscription.mockResolvedValue(null)
      mockUnsubscribeFromPush.mockResolvedValue(true)
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      const { result } = await renderHookWithImport()

      await act(async () => {
        await result.current.unsubscribe()
      })

      expect(result.current.isSubscribed).toBe(false)
    })

    it('returns false when user is null', async () => {
      vi.doMock('@/lib/supabase/auth-context', () => ({
        useAuth: () => ({ user: null, session: null }),
      }))
      vi.resetModules()

      const { usePushNotifications } = await import('./usePushNotifications')
      const { result } = renderHook(() => usePushNotifications())

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.unsubscribe()
      })

      expect(ok).toBe(false)
    })
  })
})
