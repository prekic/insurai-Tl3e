/**
 * Analytics Service
 *
 * Tracks user events for conversion optimization.
 * Supports Google Analytics 4 (GA4) integration.
 *
 * Environment Variables:
 * - VITE_GA_MEASUREMENT_ID: Google Analytics 4 Measurement ID (e.g., G-XXXXXXXXXX)
 * - VITE_ANALYTICS_ENABLED: Set to 'true' to enable analytics in production
 *
 * The service:
 * - Logs events to console in development
 * - Stores events in sessionStorage for debugging
 * - Sends events to GA4 when configured
 * - Respects user consent settings (KVKK/GDPR)
 */

// Declare gtag on window for TypeScript
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

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
  gaMeasurementId: string | null
  consentGiven: boolean
}

// Check if user has given analytics consent (stored in localStorage)
function hasAnalyticsConsent(): boolean {
  try {
    const consent = localStorage.getItem('insurai_analytics_consent')
    return consent === 'true'
  } catch {
    return false
  }
}

const config: AnalyticsConfig = {
  enabled: true,
  debug: import.meta.env.DEV,
  gaMeasurementId: import.meta.env.VITE_GA_MEASUREMENT_ID || null,
  consentGiven: hasAnalyticsConsent(),
}

// ============================================================================
// GA4 Initialization & Consent Management
// ============================================================================

/**
 * Initialize Google Analytics 4
 * Call this after user gives consent or on page load if consent already given
 */
function initGA4(): void {
  if (!config.gaMeasurementId || typeof window === 'undefined') return
  if (window.gtag) return // Already initialized

  // Load gtag.js script
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${config.gaMeasurementId}`
  document.head.appendChild(script)

  // Initialize dataLayer and gtag
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', config.gaMeasurementId, {
    // Respect consent mode
    anonymize_ip: true,
    send_page_view: false, // We'll send page views manually
  })

  if (config.debug) {
    console.warn('[Analytics] GA4 initialized with ID:', config.gaMeasurementId)
  }
}

/**
 * Set analytics consent and initialize GA4 if consent given
 * Call this when user accepts analytics in cookie/privacy banner
 */
export function setAnalyticsConsent(consent: boolean): void {
  try {
    localStorage.setItem('insurai_analytics_consent', consent ? 'true' : 'false')
    config.consentGiven = consent

    if (consent) {
      initGA4()
    }

    if (config.debug) {
      console.warn('[Analytics] Consent set to:', consent)
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if user has given analytics consent
 */
export function hasGivenAnalyticsConsent(): boolean {
  return config.consentGiven
}

// Initialize GA4 on load if consent already given
if (typeof window !== 'undefined' && config.consentGiven && config.gaMeasurementId) {
  initGA4()
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

  // Send to Google Analytics 4 if configured and consent given
  if (window.gtag && config.gaMeasurementId && config.consentGiven) {
    // Convert event name to GA4 format (snake_case)
    const ga4EventName = event.replace(/-/g, '_')

    // Send event with properties
    window.gtag('event', ga4EventName, {
      ...properties,
      // Add common parameters
      event_category: event.startsWith('trial_') ? 'trial_funnel' : 'general',
      event_timestamp: timestamp,
    })
  }
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

// ============================================================================
// Analytics Status & Configuration
// ============================================================================

/**
 * Get current analytics configuration status
 * Useful for debugging and admin panel
 */
export function getAnalyticsStatus(): {
  enabled: boolean
  debug: boolean
  ga4Configured: boolean
  ga4MeasurementId: string | null
  consentGiven: boolean
  totalEventsTracked: number
} {
  return {
    enabled: config.enabled,
    debug: config.debug,
    ga4Configured: !!config.gaMeasurementId,
    ga4MeasurementId: config.gaMeasurementId,
    consentGiven: config.consentGiven,
    totalEventsTracked: getTrackedEvents().length,
  }
}
