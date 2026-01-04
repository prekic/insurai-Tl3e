/**
 * Analytics Hooks
 * React hooks for tracking and A/B testing
 */

import { useEffect, useCallback, useState, useRef } from 'react'
import type {
  FeatureName,
  UserAction,
  SessionInfo,
  UsageStats,
  ExperimentVariant,
  AnalyticsConfig,
} from '@/types/analytics'
import {
  analytics,
  trackPageView,
  trackFeature,
  trackAction,
  trackError,
  startTiming,
} from '@/lib/analytics/tracker'
import {
  experiments,
  getVariant,
  isInTreatment,
  trackConversion,
} from '@/lib/analytics/experiments'

// =============================================================================
// Core Analytics Hooks
// =============================================================================

/**
 * Initialize analytics on mount
 */
export function useAnalytics(config?: Partial<AnalyticsConfig>): void {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    analytics.initialize(config)

    return () => {
      analytics.destroy()
    }
  }, [config])
}

/**
 * Track page views automatically
 */
export function usePageView(page: string, title?: string): void {
  useEffect(() => {
    trackPageView(page, title)
  }, [page, title])
}

/**
 * Get current session info
 */
export function useSession(): SessionInfo | null {
  const [session, setSession] = useState<SessionInfo | null>(null)

  useEffect(() => {
    const updateSession = () => {
      setSession(analytics.getSessionInfo())
    }

    updateSession()

    // Update session info periodically
    const interval = setInterval(updateSession, 10000)
    return () => clearInterval(interval)
  }, [])

  return session
}

/**
 * Get usage statistics
 */
export function useUsageStats(startDate?: Date, endDate?: Date): {
  stats: UsageStats | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
} {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await analytics.getStats(startDate, endDate)
      setStats(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stats'))
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { stats, loading, error, refresh }
}

// =============================================================================
// Tracking Hooks
// =============================================================================

/**
 * Track feature usage with automatic timing
 */
export function useFeatureTracking(feature: FeatureName): {
  trackUsage: (action?: UserAction, metadata?: Record<string, unknown>) => void
  trackSuccess: (metadata?: Record<string, unknown>) => void
  trackFailure: (error?: Error, metadata?: Record<string, unknown>) => void
  startTiming: () => () => void
} {
  const trackUsage = useCallback(
    (action: UserAction = 'view', metadata?: Record<string, unknown>) => {
      trackFeature(feature, action, { metadata })
    },
    [feature]
  )

  const trackSuccess = useCallback(
    (metadata?: Record<string, unknown>) => {
      trackFeature(feature, 'submit', { success: true, metadata })
    },
    [feature]
  )

  const trackFailure = useCallback(
    (error?: Error, metadata?: Record<string, unknown>) => {
      trackFeature(feature, 'submit', {
        success: false,
        metadata: { ...metadata, error: error?.message },
      })
      if (error) {
        trackError(error, { feature })
      }
    },
    [feature]
  )

  const startFeatureTiming = useCallback(() => {
    return startTiming(`feature_${feature}`)
  }, [feature])

  // Track view on mount
  useEffect(() => {
    trackUsage('view')
  }, [trackUsage])

  return {
    trackUsage,
    trackSuccess,
    trackFailure,
    startTiming: startFeatureTiming,
  }
}

/**
 * Track user actions
 */
export function useActionTracking(): {
  track: (action: UserAction, target: string, metadata?: Record<string, unknown>) => void
  trackClick: (target: string, metadata?: Record<string, unknown>) => void
  trackSubmit: (formName: string, success?: boolean) => void
} {
  const track = useCallback(
    (action: UserAction, target: string, metadata?: Record<string, unknown>) => {
      trackAction(action, target, metadata)
    },
    []
  )

  const trackClick = useCallback(
    (target: string, metadata?: Record<string, unknown>) => {
      trackAction('click', target, metadata)
    },
    []
  )

  const trackSubmit = useCallback((formName: string, success: boolean = true) => {
    trackAction('submit', formName, { success })
  }, [])

  return { track, trackClick, trackSubmit }
}

/**
 * Track errors in a component
 */
export function useErrorTracking(): {
  track: (error: Error | string, context?: Record<string, unknown>) => void
} {
  const track = useCallback(
    (error: Error | string, context?: Record<string, unknown>) => {
      trackError(error, context)
    },
    []
  )

  return { track }
}

// =============================================================================
// A/B Testing Hooks
// =============================================================================

/**
 * Get experiment variant
 */
export function useExperiment(experimentId: string): {
  variant: ExperimentVariant | null
  isControl: boolean
  isTreatment: boolean
  trackConversion: (metricName?: string, value?: number) => void
} {
  const [variant, setVariant] = useState<ExperimentVariant | null>(null)

  useEffect(() => {
    experiments.initialize()
    const v = getVariant(experimentId)
    setVariant(v)
  }, [experimentId])

  const isControl = variant?.name === 'Control'
  const isTreatment = variant?.name === 'Treatment'

  const track = useCallback(
    (metricName: string = 'conversion', value: number = 1) => {
      trackConversion(experimentId, metricName, value)
    },
    [experimentId]
  )

  return {
    variant,
    isControl,
    isTreatment,
    trackConversion: track,
  }
}

/**
 * Simple A/B test hook
 */
export function useABTest(experimentId: string): boolean {
  const [inTreatment, setInTreatment] = useState(false)

  useEffect(() => {
    experiments.initialize()
    setInTreatment(isInTreatment(experimentId))
  }, [experimentId])

  return inTreatment
}

/**
 * Feature flag based on experiment
 */
export function useFeatureFlag(
  experimentId: string,
  defaultValue: boolean = false
): boolean {
  const [enabled, setEnabled] = useState(defaultValue)

  useEffect(() => {
    experiments.initialize()
    const variant = getVariant(experimentId)

    if (variant) {
      // Check if variant has a config with 'enabled' flag
      const isEnabled = variant.config?.enabled as boolean | undefined
      setEnabled(isEnabled ?? variant.name === 'Treatment')
    }
  }, [experimentId])

  return enabled
}

/**
 * Multi-variant experiment hook
 */
export function useMultiVariant<T extends string>(
  experimentId: string,
  defaultVariant: T
): T {
  const [currentVariant, setCurrentVariant] = useState<T>(defaultVariant)

  useEffect(() => {
    experiments.initialize()
    const variant = getVariant(experimentId)

    if (variant) {
      setCurrentVariant(variant.name as T)
    }
  }, [experimentId])

  return currentVariant
}

// =============================================================================
// Combined Hooks
// =============================================================================

/**
 * Combined analytics hook with common functionality
 */
export function useTracker(): {
  // Tracking
  trackPageView: (page: string, title?: string) => void
  trackFeature: (
    feature: FeatureName,
    action?: UserAction,
    options?: { success?: boolean; duration?: number; metadata?: Record<string, unknown> }
  ) => void
  trackAction: (action: UserAction, target: string, metadata?: Record<string, unknown>) => void
  trackError: (error: Error | string, context?: Record<string, unknown>) => void
  startTiming: (label: string) => () => void

  // Experiments
  getVariant: (experimentId: string) => ExperimentVariant | null
  isInTreatment: (experimentId: string) => boolean
  trackConversion: (experimentId: string, metricName?: string, value?: number) => void

  // Session
  session: SessionInfo | null
} {
  const session = useSession()

  return {
    trackPageView,
    trackFeature,
    trackAction,
    trackError,
    startTiming,
    getVariant,
    isInTreatment,
    trackConversion,
    session,
  }
}
