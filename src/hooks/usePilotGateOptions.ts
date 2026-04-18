import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/supabase/auth-context'
import { configService } from '@/lib/config'

/**
 * Minimal slice of `FeatureFlag` the pilot gate needs. Preserving
 * `rolloutPercentage` lets the gate make per-user bucket decisions. This
 * replaces the earlier `Record<string, boolean>` shape which forced the
 * gate to treat rollout as all-or-nothing.
 */
export interface PilotFeatureFlag {
  enabled: boolean
  rolloutPercentage: number
}

/**
 * Hook that loads feature flags and user segments needed for pilot gating.
 *
 * Returns the `options` object expected by `useDisplaySafeSummary`:
 *   { featureFlags, userSegments, userId }
 *
 * Feature flags are loaded from ConfigurationService (DB-backed with cache).
 * User segments are loaded from the user_segments table via Supabase.
 */
export function usePilotGateOptions(): {
  featureFlags: Record<string, PilotFeatureFlag>
  userSegments: string[]
  userId: string | undefined
  isLoading: boolean
} {
  const { user } = useAuth()
  const [featureFlags, setFeatureFlags] = useState<Record<string, PilotFeatureFlag>>({})
  const [userSegments, setUserSegments] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadPilotData() {
      try {
        // Load feature flags from ConfigurationService
        const flags = await configService.getFeatureFlags()
        if (cancelled) return
        const flagMap: Record<string, PilotFeatureFlag> = {}
        for (const flag of flags) {
          flagMap[flag.key] = {
            enabled: flag.enabled,
            rolloutPercentage: flag.rolloutPercentage,
          }
        }
        setFeatureFlags(flagMap)

        // Load user segments if user is logged in
        if (user?.id) {
          try {
            const { createClient } = await import('@supabase/supabase-js')
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
            if (supabaseUrl && supabaseKey) {
              const supabase = createClient(supabaseUrl, supabaseKey)
              const { data } = await supabase
                .from('user_segments')
                .select('segment_name')
                .eq('user_id', user.id)
              if (!cancelled && data) {
                setUserSegments(data.map((row: { segment_name: string }) => row.segment_name))
              }
            }
          } catch {
            // Segments table may not exist yet — degrade gracefully
            if (!cancelled) setUserSegments([])
          }
        }
      } catch {
        // Feature flags unavailable — degrade gracefully (pilot stays inactive)
        if (!cancelled) setFeatureFlags({})
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadPilotData()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return { featureFlags, userSegments, userId: user?.id, isLoading }
}
