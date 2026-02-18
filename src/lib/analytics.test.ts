import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Storage mock helpers
// ---------------------------------------------------------------------------

let localStore: Map<string, string>
let sessionStore: Map<string, string>

function createMockStorage() {
  const store = new Map<string, string>()
  return {
    store,
    mock: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
      clear: vi.fn(() => {
        store.clear()
      }),
      get length() {
        return store.size
      },
      key: vi.fn((index: number) => {
        const keys = Array.from(store.keys())
        return keys[index] ?? null
      }),
    },
  }
}

function installMockStorages() {
  const local = createMockStorage()
  const session = createMockStorage()
  localStore = local.store
  sessionStore = session.store
  Object.defineProperty(globalThis, 'localStorage', {
    value: local.mock,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: session.mock,
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Helper: fresh module import
// ---------------------------------------------------------------------------

async function importAnalytics() {
  vi.resetModules()
  return await import('./analytics')
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  installMockStorages()
  // Clean window.gtag / dataLayer between tests
  delete window.gtag
  delete window.dataLayer
  // Default: no GA measurement ID, DEV mode
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', '')
  vi.stubEnv('DEV', 'true')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// ===========================================================================
// Consent Management
// ===========================================================================

describe('setAnalyticsConsent', () => {
  it('stores consent=true in localStorage', async () => {
    const { setAnalyticsConsent } = await importAnalytics()
    setAnalyticsConsent(true)
    expect(localStore.get('insurai_analytics_consent')).toBe('true')
  })

  it('stores consent=false in localStorage', async () => {
    const { setAnalyticsConsent } = await importAnalytics()
    setAnalyticsConsent(false)
    expect(localStore.get('insurai_analytics_consent')).toBe('false')
  })

  it('updates hasGivenAnalyticsConsent after setting consent', async () => {
    const { setAnalyticsConsent, hasGivenAnalyticsConsent } = await importAnalytics()
    expect(hasGivenAnalyticsConsent()).toBe(false)
    setAnalyticsConsent(true)
    expect(hasGivenAnalyticsConsent()).toBe(true)
  })

  it('does not throw when localStorage throws', async () => {
    const { setAnalyticsConsent } = await importAnalytics()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => setAnalyticsConsent(true)).not.toThrow()
  })
})

describe('hasGivenAnalyticsConsent', () => {
  it('returns false when no consent stored', async () => {
    const { hasGivenAnalyticsConsent } = await importAnalytics()
    expect(hasGivenAnalyticsConsent()).toBe(false)
  })

  it('returns true when consent was previously stored and module re-imported', async () => {
    localStore.set('insurai_analytics_consent', 'true')
    const { hasGivenAnalyticsConsent } = await importAnalytics()
    expect(hasGivenAnalyticsConsent()).toBe(true)
  })

  it('returns false when localStorage getItem throws', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const { hasGivenAnalyticsConsent } = await importAnalytics()
    expect(hasGivenAnalyticsConsent()).toBe(false)
  })
})

// ===========================================================================
// GA4 Initialization
// ===========================================================================

describe('GA4 initialization', () => {
  it('does not initialize GA4 when measurement ID is missing', async () => {
    const { setAnalyticsConsent } = await importAnalytics()
    setAnalyticsConsent(true)
    expect(window.gtag).toBeUndefined()
  })

  it('does not initialize GA4 when consent is not given', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TESTID123')
    const { hasGivenAnalyticsConsent } = await importAnalytics()
    expect(hasGivenAnalyticsConsent()).toBe(false)
    expect(window.gtag).toBeUndefined()
  })

  it('initializes GA4 when consent given and measurement ID exists', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TESTID123')
    const appendChildSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)
    const { setAnalyticsConsent } = await importAnalytics()
    setAnalyticsConsent(true)

    // Script element should have been appended
    expect(appendChildSpy).toHaveBeenCalled()
    const script = appendChildSpy.mock.calls[0][0] as HTMLScriptElement
    expect(script.src).toContain('googletagmanager.com/gtag/js?id=G-TESTID123')
    expect(script.async).toBe(true)

    // window.gtag should be defined
    expect(window.gtag).toBeDefined()
    expect(typeof window.gtag).toBe('function')

    appendChildSpy.mockRestore()
  })

  it('does not double-initialize GA4', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TESTID123')
    const appendChildSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)
    const { setAnalyticsConsent } = await importAnalytics()

    setAnalyticsConsent(true)
    const callCount = appendChildSpy.mock.calls.length
    setAnalyticsConsent(true) // Second call
    expect(appendChildSpy.mock.calls.length).toBe(callCount)

    appendChildSpy.mockRestore()
  })

  it('auto-initializes GA4 on module load when consent already stored', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-AUTOTEST')
    localStore.set('insurai_analytics_consent', 'true')
    const appendChildSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)

    await importAnalytics()

    expect(appendChildSpy).toHaveBeenCalled()
    expect(window.gtag).toBeDefined()

    appendChildSpy.mockRestore()
  })

  it('pushes config event to dataLayer on init', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-DATATEST')
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)
    const { setAnalyticsConsent } = await importAnalytics()
    setAnalyticsConsent(true)

    expect(window.dataLayer).toBeDefined()
    expect(window.dataLayer!.length).toBeGreaterThanOrEqual(2) // 'js' + 'config'
  })
})

// ===========================================================================
// trackEvent
// ===========================================================================

describe('trackEvent', () => {
  it('stores event in sessionStorage', async () => {
    const { trackEvent } = await importAnalytics()
    trackEvent('page_view', { page: '/test' })

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('page_view')
    expect(events[0].properties.page).toBe('/test')
  })

  it('includes timestamp in stored event', async () => {
    const { trackEvent } = await importAnalytics()
    trackEvent('page_view')

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].timestamp).toBeDefined()
    expect(new Date(events[0].timestamp).getTime()).not.toBeNaN()
  })

  it('includes url from window.location.pathname', async () => {
    const { trackEvent } = await importAnalytics()
    trackEvent('page_view')

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].url).toBeDefined()
  })

  it('stores empty properties when none provided', async () => {
    const { trackEvent } = await importAnalytics()
    trackEvent('signup_started')

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].properties).toEqual({})
  })

  it('caps stored events at 100', async () => {
    const { trackEvent } = await importAnalytics()
    for (let i = 0; i < 105; i++) {
      trackEvent('page_view', { index: i })
    }

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events).toHaveLength(100)
    // First 5 should have been shifted out; earliest remaining should have index=5
    expect(events[0].properties.index).toBe(5)
  })

  it('does not throw when sessionStorage throws', async () => {
    const { trackEvent } = await importAnalytics()
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => trackEvent('page_view')).not.toThrow()
  })

  it('sends event to GA4 when gtag configured and consent given', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-GATEST')
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)
    const { setAnalyticsConsent, trackEvent } = await importAnalytics()
    setAnalyticsConsent(true)

    const gtagSpy = vi.fn()
    window.gtag = gtagSpy

    trackEvent('policy_uploaded', { provider: 'Allianz' })
    expect(gtagSpy).toHaveBeenCalledWith('event', 'policy_uploaded', expect.objectContaining({
      provider: 'Allianz',
      event_category: 'general',
    }))
  })

  it('sets event_category to trial_funnel for trial events', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-CATTEST')
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)
    const { setAnalyticsConsent, trackEvent } = await importAnalytics()
    setAnalyticsConsent(true)

    const gtagSpy = vi.fn()
    window.gtag = gtagSpy

    trackEvent('trial_page_view')
    expect(gtagSpy).toHaveBeenCalledWith('event', 'trial_page_view', expect.objectContaining({
      event_category: 'trial_funnel',
    }))
  })

  it('does not send to GA4 when consent not given', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-NOCONSENT')
    const { trackEvent } = await importAnalytics()

    const gtagSpy = vi.fn()
    window.gtag = gtagSpy

    trackEvent('page_view')
    expect(gtagSpy).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// trackPageView
// ===========================================================================

describe('trackPageView', () => {
  it('tracks page_view event with page name', async () => {
    const { trackPageView } = await importAnalytics()
    trackPageView('dashboard')

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('page_view')
    expect(events[0].properties.page).toBe('dashboard')
  })

  it('merges additional properties', async () => {
    const { trackPageView } = await importAnalytics()
    trackPageView('upload', { source: 'nav' })

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].properties.page).toBe('upload')
    expect(events[0].properties.source).toBe('nav')
  })
})

// ===========================================================================
// Trial Funnel Tracking Helpers
// ===========================================================================

describe('trial funnel helpers', () => {
  it('trackTrialPageView tracks trial_page_view', async () => {
    const { trackTrialPageView } = await importAnalytics()
    trackTrialPageView()

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_page_view')
  })

  it('trackTrialUploadStarted includes fileType and fileSize', async () => {
    const { trackTrialUploadStarted } = await importAnalytics()
    trackTrialUploadStarted('application/pdf', 2048000)

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_upload_started')
    expect(events[0].properties.fileType).toBe('application/pdf')
    expect(events[0].properties.fileSize).toBe(2048000)
  })

  it('trackTrialUploadFailed includes reason', async () => {
    const { trackTrialUploadFailed } = await importAnalytics()
    trackTrialUploadFailed('file_too_large')

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_upload_failed')
    expect(events[0].properties.reason).toBe('file_too_large')
  })

  it('trackTrialAnalysisStarted tracks trial_analysis_started', async () => {
    const { trackTrialAnalysisStarted } = await importAnalytics()
    trackTrialAnalysisStarted()

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_analysis_started')
  })

  it('trackTrialAnalysisCompleted includes policyType, confidence, coverageCount', async () => {
    const { trackTrialAnalysisCompleted } = await importAnalytics()
    trackTrialAnalysisCompleted('kasko', 0.92, 12)

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_analysis_completed')
    expect(events[0].properties).toEqual({
      policyType: 'kasko',
      confidence: 0.92,
      coverageCount: 12,
    })
  })

  it('trackTrialAnalysisFailed includes reason', async () => {
    const { trackTrialAnalysisFailed } = await importAnalytics()
    trackTrialAnalysisFailed('timeout')

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_analysis_failed')
    expect(events[0].properties.reason).toBe('timeout')
  })

  it('trackTrialEmailCaptured tracks trial_email_captured', async () => {
    const { trackTrialEmailCaptured } = await importAnalytics()
    trackTrialEmailCaptured()

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_email_captured')
  })

  it('trackTrialShareCopied tracks trial_share_copied', async () => {
    const { trackTrialShareCopied } = await importAnalytics()
    trackTrialShareCopied()

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_share_copied')
  })

  it('trackTrialSignupClicked includes source', async () => {
    const { trackTrialSignupClicked } = await importAnalytics()
    trackTrialSignupClicked('banner')

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_signup_clicked')
    expect(events[0].properties.source).toBe('banner')
  })

  it('trackTrialSignupCompleted tracks trial_signup_completed', async () => {
    const { trackTrialSignupCompleted } = await importAnalytics()
    trackTrialSignupCompleted()

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_signup_completed')
  })

  it('trackTrialPolicyTransferred tracks trial_policy_transferred', async () => {
    const { trackTrialPolicyTransferred } = await importAnalytics()
    trackTrialPolicyTransferred()

    const events = JSON.parse(sessionStore.get('insurai_analytics') || '[]')
    expect(events[0].event).toBe('trial_policy_transferred')
  })
})

// ===========================================================================
// getTrackedEvents / clearTrackedEvents
// ===========================================================================

describe('getTrackedEvents', () => {
  it('returns empty array when no events stored', async () => {
    const { getTrackedEvents } = await importAnalytics()
    expect(getTrackedEvents()).toEqual([])
  })

  it('returns stored events', async () => {
    const { trackEvent, getTrackedEvents } = await importAnalytics()
    trackEvent('page_view')
    trackEvent('signup_started')

    const events = getTrackedEvents()
    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('page_view')
    expect(events[1].event).toBe('signup_started')
  })

  it('returns empty array when sessionStorage throws', async () => {
    const { getTrackedEvents } = await importAnalytics()
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(getTrackedEvents()).toEqual([])
  })

  it('returns empty array when sessionStorage has invalid JSON', async () => {
    const { getTrackedEvents } = await importAnalytics()
    sessionStore.set('insurai_analytics', 'not-json')
    expect(getTrackedEvents()).toEqual([])
  })
})

describe('clearTrackedEvents', () => {
  it('removes events from sessionStorage', async () => {
    const { trackEvent, clearTrackedEvents, getTrackedEvents } = await importAnalytics()
    trackEvent('page_view')
    expect(getTrackedEvents()).toHaveLength(1)

    clearTrackedEvents()
    expect(getTrackedEvents()).toEqual([])
  })

  it('does not throw when sessionStorage throws', async () => {
    const { clearTrackedEvents } = await importAnalytics()
    vi.spyOn(sessionStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => clearTrackedEvents()).not.toThrow()
  })
})

// ===========================================================================
// getTrialFunnelMetrics
// ===========================================================================

describe('getTrialFunnelMetrics', () => {
  it('returns all zeros when no events', async () => {
    const { getTrialFunnelMetrics } = await importAnalytics()
    const metrics = getTrialFunnelMetrics()
    expect(metrics).toEqual({
      pageViews: 0,
      uploadsStarted: 0,
      analysesCompleted: 0,
      signupClicks: 0,
      conversionRate: 0,
    })
  })

  it('counts trial events correctly', async () => {
    const {
      getTrialFunnelMetrics,
      trackTrialPageView,
      trackTrialUploadStarted,
      trackTrialAnalysisCompleted,
      trackTrialSignupClicked,
    } = await importAnalytics()

    trackTrialPageView()
    trackTrialPageView()
    trackTrialUploadStarted('application/pdf', 1000)
    trackTrialAnalysisCompleted('kasko', 0.9, 5)
    trackTrialSignupClicked('banner')

    const metrics = getTrialFunnelMetrics()
    expect(metrics.pageViews).toBe(2)
    expect(metrics.uploadsStarted).toBe(1)
    expect(metrics.analysesCompleted).toBe(1)
    expect(metrics.signupClicks).toBe(1)
  })

  it('calculates conversion rate as signupClicks/pageViews * 100', async () => {
    const {
      getTrialFunnelMetrics,
      trackTrialPageView,
      trackTrialSignupClicked,
    } = await importAnalytics()

    trackTrialPageView()
    trackTrialPageView()
    trackTrialPageView()
    trackTrialPageView()
    trackTrialSignupClicked('header')

    const metrics = getTrialFunnelMetrics()
    expect(metrics.conversionRate).toBe(25) // 1/4 * 100
  })

  it('returns 0 conversion rate when no page views', async () => {
    const { getTrialFunnelMetrics, trackTrialSignupClicked } = await importAnalytics()
    trackTrialSignupClicked('header')

    const metrics = getTrialFunnelMetrics()
    expect(metrics.conversionRate).toBe(0)
  })

  it('ignores non-trial events in funnel metrics', async () => {
    const { getTrialFunnelMetrics, trackEvent } = await importAnalytics()

    trackEvent('page_view', { page: '/dashboard' })
    trackEvent('signup_completed')
    trackEvent('policy_uploaded')

    const metrics = getTrialFunnelMetrics()
    expect(metrics.pageViews).toBe(0)
    expect(metrics.uploadsStarted).toBe(0)
  })
})

// ===========================================================================
// getAnalyticsStatus
// ===========================================================================

describe('getAnalyticsStatus', () => {
  it('returns correct status when no GA4 configured', async () => {
    const { getAnalyticsStatus } = await importAnalytics()
    const status = getAnalyticsStatus()

    expect(status.enabled).toBe(true)
    expect(status.ga4Configured).toBe(false)
    expect(status.ga4MeasurementId).toBeNull()
    expect(status.consentGiven).toBe(false)
    expect(status.totalEventsTracked).toBe(0)
  })

  it('reflects GA4 measurement ID when configured', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-STATUS123')
    const { getAnalyticsStatus } = await importAnalytics()
    const status = getAnalyticsStatus()

    expect(status.ga4Configured).toBe(true)
    expect(status.ga4MeasurementId).toBe('G-STATUS123')
  })

  it('reflects consent status', async () => {
    localStore.set('insurai_analytics_consent', 'true')
    const { getAnalyticsStatus } = await importAnalytics()
    const status = getAnalyticsStatus()

    expect(status.consentGiven).toBe(true)
  })

  it('reflects total events tracked', async () => {
    const { getAnalyticsStatus, trackEvent } = await importAnalytics()
    trackEvent('page_view')
    trackEvent('signup_started')

    const status = getAnalyticsStatus()
    expect(status.totalEventsTracked).toBe(2)
  })

  it('updates consent after setAnalyticsConsent', async () => {
    const { getAnalyticsStatus, setAnalyticsConsent } = await importAnalytics()
    expect(getAnalyticsStatus().consentGiven).toBe(false)

    setAnalyticsConsent(true)
    expect(getAnalyticsStatus().consentGiven).toBe(true)

    setAnalyticsConsent(false)
    expect(getAnalyticsStatus().consentGiven).toBe(false)
  })
})

// ===========================================================================
// Module-level initialization guard
// ===========================================================================

describe('module-level auto-init', () => {
  it('does not auto-init when consent not stored', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-NOINIT')
    await importAnalytics()
    expect(window.gtag).toBeUndefined()
  })

  it('does not auto-init when measurement ID empty', async () => {
    localStore.set('insurai_analytics_consent', 'true')
    await importAnalytics()
    expect(window.gtag).toBeUndefined()
  })
})

// ===========================================================================
// Edge cases
// ===========================================================================

describe('edge cases', () => {
  it('handles pre-existing events in sessionStorage', async () => {
    const preExisting = [{ event: 'old_event', properties: {}, timestamp: '2026-01-01T00:00:00Z' }]
    sessionStore.set('insurai_analytics', JSON.stringify(preExisting))

    const { trackEvent, getTrackedEvents } = await importAnalytics()
    trackEvent('page_view')

    const events = getTrackedEvents()
    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('old_event')
    expect(events[1].event).toBe('page_view')
  })

  it('handles corrupt sessionStorage data gracefully during trackEvent', async () => {
    sessionStore.set('insurai_analytics', '{broken}')
    const { trackEvent } = await importAnalytics()

    // Should not throw even though JSON.parse will fail
    expect(() => trackEvent('page_view')).not.toThrow()
  })

  it('consent value "false" in localStorage means no consent', async () => {
    localStore.set('insurai_analytics_consent', 'false')
    const { hasGivenAnalyticsConsent } = await importAnalytics()
    expect(hasGivenAnalyticsConsent()).toBe(false)
  })

  it('consent value must be exactly "true" to grant consent', async () => {
    localStore.set('insurai_analytics_consent', 'yes')
    const { hasGivenAnalyticsConsent } = await importAnalytics()
    expect(hasGivenAnalyticsConsent()).toBe(false)
  })
})
