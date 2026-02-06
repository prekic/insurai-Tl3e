/**
 * useUserPreferences Hook
 *
 * Provides read/write access to the current user's preferences.
 * Preferences are stored in the user_preferences table and override
 * admin settings for user-overridable categories (ui, email).
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/supabase/auth-context'
import { configService } from '@/lib/config/configuration-service'
import {
  USER_OVERRIDABLE_CATEGORIES,
  PREFERENCE_FIELDS,
  type UserOverridableCategory,
  type PreferenceFieldMeta,
} from '@/lib/config/user-overridable'

export interface UserPreferencesState {
  /** User preferences keyed by category, then by setting key */
  preferences: Record<UserOverridableCategory, Record<string, unknown>>
  /** Whether preferences are currently loading */
  isLoading: boolean
  /** Whether a save operation is in progress */
  isSaving: boolean
  /** Error message if any operation failed */
  error: string | null
  /** Success message after save */
  successMessage: string | null
  /** Whether the user is authenticated */
  isAuthenticated: boolean
  /** Update a single preference */
  updatePreference: (category: UserOverridableCategory, key: string, value: unknown) => void
  /** Save all pending changes to the database */
  savePreferences: () => Promise<void>
  /** Reset a category to admin defaults (remove user overrides) */
  resetCategory: (category: UserOverridableCategory) => Promise<void>
  /** Reset a single preference to admin default */
  resetPreference: (category: UserOverridableCategory, key: string) => void
  /** Check if a preference has been modified from admin default */
  isModified: (category: UserOverridableCategory, key: string) => boolean
  /** Get the admin default value for a preference */
  getAdminDefault: (category: UserOverridableCategory, key: string) => unknown
  /** Get field metadata for display */
  getFieldMeta: (category: UserOverridableCategory) => PreferenceFieldMeta[]
  /** Refresh preferences from database */
  refresh: () => Promise<void>
}

const EMPTY_PREFS: Record<UserOverridableCategory, Record<string, unknown>> = {
  ui: {},
  email: {},
}

export function useUserPreferences(): UserPreferencesState {
  const { user } = useAuth()
  const [preferences, setPreferences] = useState<Record<UserOverridableCategory, Record<string, unknown>>>({ ...EMPTY_PREFS })
  const [adminDefaults, setAdminDefaults] = useState<Record<UserOverridableCategory, Record<string, unknown>>>({ ...EMPTY_PREFS })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const isAuthenticated = !!user

  // Load preferences and admin defaults
  const loadPreferences = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Fetch admin defaults and user preferences in parallel
      const [uiDefaults, emailDefaults, uiPrefs, emailPrefs] = await Promise.all([
        configService.getCategory('ui'),
        configService.getCategory('email'),
        configService.getUserPreferences(user.id, 'ui'),
        configService.getUserPreferences(user.id, 'email'),
      ])

      setAdminDefaults({
        ui: uiDefaults,
        email: emailDefaults,
      })

      setPreferences({
        ui: uiPrefs || {},
        email: emailPrefs || {},
      })
    } catch (err) {
      console.warn('[UserPreferences] Failed to load preferences:', err)
      setError(err instanceof Error ? err.message : 'Failed to load preferences')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  // Update a single preference locally (not persisted until savePreferences)
  const updatePreference = useCallback(
    (category: UserOverridableCategory, key: string, value: unknown) => {
      setPreferences((prev) => ({
        ...prev,
        [category]: {
          ...prev[category],
          [key]: value,
        },
      }))
      // Clear messages on change
      setSuccessMessage(null)
      setError(null)
    },
    []
  )

  // Save all preferences to database
  const savePreferences = useCallback(async () => {
    if (!user?.id) return

    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const savePromises = USER_OVERRIDABLE_CATEGORIES.map((category) => {
        const prefs = preferences[category]
        // Only save if there are actual preferences
        if (Object.keys(prefs).length === 0) {
          return Promise.resolve(true)
        }
        return configService.setUserPreferences(user.id, category, prefs)
      })

      const results = await Promise.all(savePromises)
      const allSucceeded = results.every(Boolean)

      if (allSucceeded) {
        setSuccessMessage('Preferences saved successfully')
        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        setError('Some preferences could not be saved')
      }
    } catch (err) {
      console.warn('[UserPreferences] Failed to save preferences:', err)
      setError(err instanceof Error ? err.message : 'Failed to save preferences')
    } finally {
      setIsSaving(false)
    }
  }, [user?.id, preferences])

  // Reset a whole category (remove all user overrides)
  const resetCategory = useCallback(
    async (category: UserOverridableCategory) => {
      if (!user?.id) return

      setIsSaving(true)
      setError(null)

      try {
        const success = await configService.setUserPreferences(user.id, category, {})
        if (success) {
          setPreferences((prev) => ({
            ...prev,
            [category]: {},
          }))
          setSuccessMessage(`${category === 'ui' ? 'UI' : 'Email'} preferences reset to defaults`)
          setTimeout(() => setSuccessMessage(null), 3000)
        } else {
          setError('Failed to reset preferences')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reset preferences')
      } finally {
        setIsSaving(false)
      }
    },
    [user?.id]
  )

  // Reset a single preference
  const resetPreference = useCallback(
    (category: UserOverridableCategory, key: string) => {
      setPreferences((prev) => {
        const updated = { ...prev[category] }
        delete updated[key]
        return { ...prev, [category]: updated }
      })
      setSuccessMessage(null)
      setError(null)
    },
    []
  )

  // Check if a preference is modified from admin default
  const isModified = useCallback(
    (category: UserOverridableCategory, key: string): boolean => {
      return preferences[category][key] !== undefined
    },
    [preferences]
  )

  // Get admin default value
  const getAdminDefault = useCallback(
    (category: UserOverridableCategory, key: string): unknown => {
      return adminDefaults[category][key]
    },
    [adminDefaults]
  )

  // Get field metadata
  const getFieldMeta = useCallback(
    (category: UserOverridableCategory): PreferenceFieldMeta[] => {
      return PREFERENCE_FIELDS[category]
    },
    []
  )

  return {
    preferences,
    isLoading,
    isSaving,
    error,
    successMessage,
    isAuthenticated,
    updatePreference,
    savePreferences,
    resetCategory,
    resetPreference,
    isModified,
    getAdminDefault,
    getFieldMeta,
    refresh: loadPreferences,
  }
}
