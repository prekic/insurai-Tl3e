/**
 * Hook for managing Web Push notification subscriptions.
 *
 * Handles permission requests, VAPID key fetching, SW subscription,
 * and server-side registration — all in one place.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/supabase/auth-context'
import { subscribeToPush, unsubscribeFromPush, getPushSubscription } from '@/lib/pwa'
import env from '@/lib/env'

export interface UsePushNotifications {
  /** True if the browser supports the Push API */
  isSupported: boolean
  /** Current browser notification permission state */
  permission: NotificationPermission
  /** True if this browser is subscribed to push notifications */
  isSubscribed: boolean
  /** True while subscribe/unsubscribe is in progress */
  isLoading: boolean
  /** Error message if the last action failed */
  error: string | null
  /** Subscribe this browser to push notifications */
  subscribe: () => Promise<boolean>
  /** Unsubscribe this browser from push notifications */
  unsubscribe: () => Promise<boolean>
}

/**
 * Check if the current environment supports Web Push.
 */
function checkSupport(): boolean {
  return (
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'serviceWorker' in navigator &&
    'Notification' in window
  )
}

export function usePushNotifications(): UsePushNotifications {
  const { user, session } = useAuth()
  const [isSupported] = useState<boolean>(checkSupport)
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiUrl = env.proxyUrl || ''

  // ---------------------------------------------------------------------------
  // Shared fetch helper
  // ---------------------------------------------------------------------------

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (user?.id) headers['x-user-id'] = user.id
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
    return headers
  }, [user, session])

  // ---------------------------------------------------------------------------
  // Check SW subscription state on mount / user change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isSupported || !user) {
      setIsSubscribed(false)
      return
    }

    const checkStatus = async () => {
      try {
        // Primary source: SW push manager (device-level truth)
        const swSubscription = await getPushSubscription()
        if (!swSubscription) {
          setIsSubscribed(false)
          return
        }

        // Cross-reference with server (confirms DB record exists)
        const response = await fetch(`${apiUrl}/api/notifications/status`, {
          headers: authHeaders(),
        })
        if (response.ok) {
          const data = await response.json()
          setIsSubscribed(data.subscribed === true && data.deviceCount > 0)
        } else {
          // If server check fails fall back to SW state
          setIsSubscribed(true)
        }
      } catch {
        // Network error — treat SW state as truth
        const swSubscription = await getPushSubscription().catch(() => null)
        setIsSubscribed(swSubscription !== null)
      }
    }

    checkStatus()
  }, [isSupported, user, apiUrl, authHeaders])

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) return false
    setIsLoading(true)
    setError(null)

    try {
      // 1. Request browser permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setError('Notification permission denied')
        return false
      }

      // 2. Fetch VAPID public key from server
      const keyResponse = await fetch(`${apiUrl}/api/notifications/public-key`)
      if (!keyResponse.ok) {
        setError('Push notifications not available')
        return false
      }
      const { publicKey } = await keyResponse.json()

      // 3. Subscribe in SW (uses the existing helper from pwa/index.ts)
      const subscription = await subscribeToPush(publicKey)
      if (!subscription) {
        setError('Failed to create push subscription')
        return false
      }

      // 4. Register on server
      const subscriptionJson = subscription.toJSON()
      const registerResponse = await fetch(`${apiUrl}/api/notifications/subscribe`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscriptionJson.keys?.p256dh ?? '',
            auth: subscriptionJson.keys?.auth ?? '',
          },
        }),
      })

      if (!registerResponse.ok) {
        // Clean up SW subscription if server registration failed
        await unsubscribeFromPush().catch(() => undefined)
        setError('Failed to register subscription on server')
        return false
      }

      setIsSubscribed(true)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, user, apiUrl, authHeaders])

  // ---------------------------------------------------------------------------
  // Unsubscribe
  // ---------------------------------------------------------------------------

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) return false
    setIsLoading(true)
    setError(null)

    try {
      // 1. Get current subscription endpoint before unsubscribing SW
      const currentSubscription = await getPushSubscription()
      const endpoint = currentSubscription?.endpoint

      // 2. Unsubscribe in SW
      const swOk = await unsubscribeFromPush()

      // 3. Remove from server
      if (endpoint) {
        await fetch(`${apiUrl}/api/notifications/unsubscribe`, {
          method: 'DELETE',
          headers: authHeaders(),
          body: JSON.stringify({ endpoint }),
        }).catch(() => undefined) // Best-effort server cleanup
      }

      setIsSubscribed(false)
      return swOk
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unsubscribe failed')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, user, apiUrl, authHeaders])

  return { isSupported, permission, isSubscribed, isLoading, error, subscribe, unsubscribe }
}
