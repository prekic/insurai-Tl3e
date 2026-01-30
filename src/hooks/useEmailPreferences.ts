/**
 * Hook for managing user email preferences
 *
 * Syncs with server-side email preferences via the API.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/supabase/auth-context'
import env from '@/lib/env'

export interface EmailPreferences {
  marketing: boolean
  policy_alerts: boolean
  expiration_reminders: boolean
  weekly_digest: boolean
}

const DEFAULT_PREFERENCES: EmailPreferences = {
  marketing: true,
  policy_alerts: true,
  expiration_reminders: true,
  weekly_digest: false,
}

interface UseEmailPreferencesReturn {
  preferences: EmailPreferences
  isLoading: boolean
  error: string | null
  updatePreference: (key: keyof EmailPreferences, value: boolean) => Promise<void>
  updatePreferences: (updates: Partial<EmailPreferences>) => Promise<void>
  refresh: () => Promise<void>
  isConfigured: boolean
}

export function useEmailPreferences(): UseEmailPreferencesReturn {
  const { user, session } = useAuth()
  const [preferences, setPreferences] = useState<EmailPreferences>(DEFAULT_PREFERENCES)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConfigured, setIsConfigured] = useState(false)

  const apiUrl = env.proxyUrl || ''

  // Check if email service is configured
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/email/status`)
        if (response.ok) {
          const data = await response.json()
          setIsConfigured(data.configured)
        }
      } catch {
        // Email service not available
        setIsConfigured(false)
      }
    }
    checkStatus()
  }, [apiUrl])

  // Fetch preferences from server
  const fetchPreferences = useCallback(async () => {
    if (!user || !session) {
      setPreferences(DEFAULT_PREFERENCES)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${apiUrl}/api/email/preferences`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'x-user-id': user.id,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences })
      } else if (response.status === 401) {
        // Not authenticated, use defaults
        setPreferences(DEFAULT_PREFERENCES)
      } else {
        throw new Error('Failed to fetch preferences')
      }
    } catch (err) {
      console.warn('[useEmailPreferences] Failed to fetch:', err)
      // Use defaults on error
      setPreferences(DEFAULT_PREFERENCES)
    } finally {
      setIsLoading(false)
    }
  }, [user, session, apiUrl])

  // Fetch on mount and when user changes
  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])

  // Update a single preference
  const updatePreference = useCallback(
    async (key: keyof EmailPreferences, value: boolean) => {
      if (!user || !session) {
        // Update locally only if not authenticated
        setPreferences((prev) => ({ ...prev, [key]: value }))
        return
      }

      // Optimistic update
      setPreferences((prev) => ({ ...prev, [key]: value }))

      try {
        const response = await fetch(`${apiUrl}/api/email/preferences`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'x-user-id': user.id,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ [key]: value }),
        })

        if (!response.ok) {
          throw new Error('Failed to update preference')
        }
      } catch (err) {
        // Rollback on error
        setPreferences((prev) => ({ ...prev, [key]: !value }))
        setError('Failed to update email preference')
        throw err
      }
    },
    [user, session, apiUrl]
  )

  // Update multiple preferences at once
  const updatePreferences = useCallback(
    async (updates: Partial<EmailPreferences>) => {
      if (!user || !session) {
        setPreferences((prev) => ({ ...prev, ...updates }))
        return
      }

      // Optimistic update
      const previousPrefs = { ...preferences }
      setPreferences((prev) => ({ ...prev, ...updates }))

      try {
        const response = await fetch(`${apiUrl}/api/email/preferences`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'x-user-id': user.id,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          throw new Error('Failed to update preferences')
        }
      } catch (err) {
        // Rollback on error
        setPreferences(previousPrefs)
        setError('Failed to update email preferences')
        throw err
      }
    },
    [user, session, apiUrl, preferences]
  )

  return {
    preferences,
    isLoading,
    error,
    updatePreference,
    updatePreferences,
    refresh: fetchPreferences,
    isConfigured,
  }
}
