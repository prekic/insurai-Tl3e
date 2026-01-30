/**
 * Analytics Service
 *
 * Tracks user events for conversion optimization.
 * Events are logged to console in development and can be extended
 * to send to analytics providers (e.g., Mixpanel, Amplitude, GA4).
 */

export type TrialFunnelEvent =
  | 'trial_page_view'
  | 'trial_upload_started'
  | 'trial_upload_failed'
  | 'trial_analysis_started'
  | 'trial_analysis_completed'
  | 'trial_analysis_failed'
  | 'trial_email_captured'
  | 'trial_share_copied'
  | 'trial_signup_clicked'
  | 'trial_signup_completed'
  | 'trial_policy_transferred'

export type GeneralEvent =
  | 'page_view'
  | 'signup_started'
  | 'signup_completed'
  | 'login_completed'
  | 'policy_uploaded'
  | 'policy_analyzed'
  | 'policy_shared'

export type AnalyticsEvent = TrialFunnelEvent | GeneralEvent

export interface EventProperties {
  [key: string]: string | number | boolean | undefined
}

interface AnalyticsConfig {
  enabled: boolean
  debug: boolean
}

const config: AnalyticsConfig = {
  enabled: true,
  debug: import.meta.env.DEV,
}

/**
 * Track an analytics event
 */
export function trackEvent(event: AnalyticsEvent, properties?: EventProperties): void {
  if (!config.enabled) return

  const timestamp = new Date().toISOString()
  const eventData = {
    event,
    properties: properties || {},
    timestamp,
    url: typeof window !== 'undefined' ? window.location.pathname : undefined,
  }

  // Log in development
  if (config.debug) {
    console.warn('[Analytics]', event, properties || {})
  }

  // Store events in sessionStorage for debugging
  try {
    const events = JSON.parse(sessionStorage.getItem('insurai_analytics') || '[]')
    events.push(eventData)
    // Keep last 100 events
    if (events.length > 100) events.shift()
    sessionStorage.setItem('insurai_analytics', JSON.stringify(events))
  } catch {
    // Ignore storage errors
  }

  // TODO: Send to analytics provider
  // Examples:
  // - mixpanel.track(event, properties)
  // - amplitude.logEvent(event, properties)
  // - gtag('event', event, properties)
}

/**
 * Track a page view
 */
export function trackPageView(pageName: string, properties?: EventProperties): void {
  trackEvent('page_view', { page: pageName, ...properties })
}

// ============================================================================
// Trial Funnel Tracking Helpers
// ============================================================================

/**
 * Track trial page view
 */
export function trackTrialPageView(): void {
  trackEvent('trial_page_view')
}

/**
 * Track trial upload started
 */
export function trackTrialUploadStarted(fileType: string, fileSize: number): void {
  trackEvent('trial_upload_started', { fileType, fileSize })
}

/**
 * Track trial upload failed
 */
export function trackTrialUploadFailed(reason: string): void {
  trackEvent('trial_upload_failed', { reason })
}

/**
 * Track trial analysis started
 */
export function trackTrialAnalysisStarted(): void {
  trackEvent('trial_analysis_started')
}

/**
 * Track trial analysis completed
 */
export function trackTrialAnalysisCompleted(
  policyType: string,
  confidence: number,
  coverageCount: number
): void {
  trackEvent('trial_analysis_completed', {
    policyType,
    confidence,
    coverageCount,
  })
}

/**
 * Track trial analysis failed
 */
export function trackTrialAnalysisFailed(reason: string): void {
  trackEvent('trial_analysis_failed', { reason })
}

/**
 * Track email capture
 */
export function trackTrialEmailCaptured(): void {
  trackEvent('trial_email_captured')
}

/**
 * Track share link copied
 */
export function trackTrialShareCopied(): void {
  trackEvent('trial_share_copied')
}

/**
 * Track signup click from trial
 */
export function trackTrialSignupClicked(source: 'header' | 'banner' | 'trial_used'): void {
  trackEvent('trial_signup_clicked', { source })
}

/**
 * Track successful signup after trial
 */
export function trackTrialSignupCompleted(): void {
  trackEvent('trial_signup_completed')
}

/**
 * Track trial policy transferred to user account
 */
export function trackTrialPolicyTransferred(): void {
  trackEvent('trial_policy_transferred')
}

// ============================================================================
// Funnel Analysis Helpers
// ============================================================================

/**
 * Get all tracked events for debugging
 */
export function getTrackedEvents(): Array<{
  event: string
  properties: EventProperties
  timestamp: string
}> {
  try {
    return JSON.parse(sessionStorage.getItem('insurai_analytics') || '[]')
  } catch {
    return []
  }
}

/**
 * Clear tracked events
 */
export function clearTrackedEvents(): void {
  try {
    sessionStorage.removeItem('insurai_analytics')
  } catch {
    // Ignore
  }
}

/**
 * Calculate trial funnel metrics from tracked events
 */
export function getTrialFunnelMetrics(): {
  pageViews: number
  uploadsStarted: number
  analysesCompleted: number
  signupClicks: number
  conversionRate: number
} {
  const events = getTrackedEvents()

  const pageViews = events.filter((e) => e.event === 'trial_page_view').length
  const uploadsStarted = events.filter((e) => e.event === 'trial_upload_started').length
  const analysesCompleted = events.filter((e) => e.event === 'trial_analysis_completed').length
  const signupClicks = events.filter((e) => e.event === 'trial_signup_clicked').length

  const conversionRate = pageViews > 0 ? (signupClicks / pageViews) * 100 : 0

  return {
    pageViews,
    uploadsStarted,
    analysesCompleted,
    signupClicks,
    conversionRate,
  }
}
