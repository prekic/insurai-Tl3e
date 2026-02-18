/**
 * Sentry Branch Coverage Tests
 *
 * Tests all conditional branches in src/lib/sentry.ts by using vi.resetModules()
 * + dynamic import to re-evaluate the module with different import.meta.env values.
 *
 * The key challenge: SENTRY_DSN, IS_PRODUCTION, IS_STAGING are read at module load
 * time from import.meta.env. Each describe block stubs env vars, resets modules,
 * and dynamically imports sentry.ts so module-level constants pick up the new values.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoist mock variables for use inside vi.mock() factory
// ---------------------------------------------------------------------------
const {
  mockInit,
  mockSetUser,
  mockSetContext,
  mockCaptureException,
  mockCaptureMessage,
  mockAddBreadcrumb,
  mockBrowserTracingIntegration,
  mockReplayIntegration,
} = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockSetUser: vi.fn(),
  mockSetContext: vi.fn(),
  mockCaptureException: vi.fn(() => 'mock-event-id-123'),
  mockCaptureMessage: vi.fn(),
  mockAddBreadcrumb: vi.fn(),
  mockBrowserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  mockReplayIntegration: vi.fn(() => ({ name: 'Replay' })),
}))

// ---------------------------------------------------------------------------
// Mock @sentry/react — must be at top level for vi.mock hoisting
// ---------------------------------------------------------------------------
vi.mock('@sentry/react', () => ({
  init: mockInit,
  setUser: mockSetUser,
  setContext: mockSetContext,
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  addBreadcrumb: mockAddBreadcrumb,
  browserTracingIntegration: mockBrowserTracingIntegration,
  replayIntegration: mockReplayIntegration,
  ErrorBoundary: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// Helper: set PROD/DEV flags via direct assignment (Object.defineProperty
// fails on Vitest 4's import.meta.env proxy)
// ---------------------------------------------------------------------------
const metaEnv = import.meta.env as Record<string, unknown>

function setProdMode(prod: boolean) {
  metaEnv.PROD = prod
  metaEnv.DEV = !prod
}

// ---------------------------------------------------------------------------
// Helper: fresh module import with specific env vars
// ---------------------------------------------------------------------------
async function importSentry(envOverrides: Record<string, string | boolean | undefined> = {}) {
  vi.resetModules()

  // Apply env stubs for string-based env vars
  for (const [key, value] of Object.entries(envOverrides)) {
    if (key === 'PROD' || key === 'DEV') continue // handled separately
    if (value === undefined) {
      vi.stubEnv(key, '')
    } else {
      vi.stubEnv(key, String(value))
    }
  }

  // Set PROD/DEV flags via direct assignment
  if ('PROD' in envOverrides) {
    setProdMode(!!envOverrides.PROD)
  }

  return await import('./sentry')
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  // Restore default test environment (not production)
  setProdMode(false)
})

// ===========================================================================
// getSampleRates() — internal function tested indirectly via initSentry
// ===========================================================================
describe('getSampleRates() branches', () => {
  it('uses staging rates when VITE_SENTRY_ENVIRONMENT is staging', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://test@sentry.io/123',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.initSentry()

    expect(mockInit).toHaveBeenCalledTimes(1)
    const config = mockInit.mock.calls[0][0]
    expect(config.tracesSampleRate).toBe(0.5)
    expect(config.replaysSessionSampleRate).toBe(0.3)
    expect(config.replaysOnErrorSampleRate).toBe(1.0)
    expect(config.environment).toBe('staging')
  })

  it('uses production rates when PROD is true and not staging', async () => {
    // Force PROD to true via direct assignment
    setProdMode(true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    expect(mockInit).toHaveBeenCalledTimes(1)
    const config = mockInit.mock.calls[0][0]
    expect(config.tracesSampleRate).toBe(0.1)
    expect(config.replaysSessionSampleRate).toBe(0.1)
    expect(config.replaysOnErrorSampleRate).toBe(1.0)

    // Restore
    setProdMode(false)
  })

  it('uses development rates when neither staging nor production', async () => {
    setProdMode(false)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://test@sentry.io/123')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    expect(mockInit).toHaveBeenCalledTimes(1)
    const config = mockInit.mock.calls[0][0]
    expect(config.tracesSampleRate).toBe(1.0)
    expect(config.replaysSessionSampleRate).toBe(0)
    expect(config.replaysOnErrorSampleRate).toBe(1.0)
  })
})

// ===========================================================================
// initSentry()
// ===========================================================================
describe('initSentry() branches', () => {
  it('initializes Sentry when DSN is configured', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://abc@sentry.io/456',
      VITE_SENTRY_ENVIRONMENT: 'staging',
      VITE_APP_VERSION: '2.0.0',
    })

    mod.initSentry()

    expect(mockInit).toHaveBeenCalledTimes(1)
    const config = mockInit.mock.calls[0][0]
    expect(config.dsn).toBe('https://abc@sentry.io/456')
    expect(config.release).toBe('insurai@2.0.0')
    expect(config.integrations).toHaveLength(2)
    expect(mockBrowserTracingIntegration).toHaveBeenCalled()
    expect(mockReplayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      blockAllMedia: true,
    })
    expect(config.ignoreErrors).toContain('ResizeObserver loop')
    expect(config.ignoreErrors).toContain('Failed to fetch')
  })

  it('does NOT initialize Sentry and logs warning when DSN missing in production', async () => {
    setProdMode(true)
    vi.stubEnv('VITE_SENTRY_DSN', '')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '')
    vi.resetModules()

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mod = await import('./sentry')
    mod.initSentry()

    expect(mockInit).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith('Sentry DSN not configured. Error tracking disabled.')

    consoleSpy.mockRestore()
  })

  it('does NOT initialize Sentry and does NOT log when DSN missing in development', async () => {
    setProdMode(false)
    vi.stubEnv('VITE_SENTRY_DSN', '')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '')
    vi.resetModules()

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mod = await import('./sentry')
    mod.initSentry()

    expect(mockInit).not.toHaveBeenCalled()
    expect(consoleSpy).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('uses default APP_VERSION 0.1.0 when VITE_APP_VERSION is not set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://x@sentry.io/1')
    vi.stubEnv('VITE_APP_VERSION', '')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    const config = mockInit.mock.calls[0][0]
    expect(config.release).toBe('insurai@0.1.0')
  })

  it('infers environment as production when PROD is true and no explicit VITE_SENTRY_ENVIRONMENT', async () => {
    setProdMode(true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://x@sentry.io/1')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    const config = mockInit.mock.calls[0][0]
    expect(config.environment).toBe('production')

    setProdMode(false)
  })

  it('infers environment as development when PROD is false and no explicit VITE_SENTRY_ENVIRONMENT', async () => {
    setProdMode(false)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://x@sentry.io/1')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    const config = mockInit.mock.calls[0][0]
    expect(config.environment).toBe('development')
  })
})

// ===========================================================================
// beforeSend() — tested by capturing the callback passed to Sentry.init
// ===========================================================================
describe('beforeSend() branches', () => {
  async function getBeforeSend() {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://x@sentry.io/1')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging')
    vi.resetModules()
    mockInit.mockClear()

    const mod = await import('./sentry')
    mod.initSentry()

    expect(mockInit).toHaveBeenCalledTimes(1)
    return mockInit.mock.calls[0][0].beforeSend as (event: Record<string, unknown>) => Record<string, unknown>
  }

  it('removes Authorization header from request', async () => {
    const beforeSend = await getBeforeSend()

    const event = {
      request: {
        headers: {
          Authorization: 'Bearer super-secret-token',
          'X-API-Key': 'my-api-key',
          'Content-Type': 'application/json',
        },
      },
    }

    const result = beforeSend(event) as typeof event
    expect(result.request.headers.Authorization).toBeUndefined()
    expect(result.request.headers['X-API-Key']).toBeUndefined()
    expect(result.request.headers['Content-Type']).toBe('application/json')
  })

  it('masks policy numbers (XX-XXXXXXXX) in breadcrumb messages', async () => {
    const beforeSend = await getBeforeSend()

    const event = {
      breadcrumbs: [
        { message: 'Loading policy 12-34567890 details' },
        { message: 'Compare 11-11111111 vs 22-22222222' },
      ],
    }

    const result = beforeSend(event) as typeof event
    expect(result.breadcrumbs[0].message).toBe('Loading policy [POLICY_NUMBER] details')
    expect(result.breadcrumbs[1].message).toBe('Compare [POLICY_NUMBER] vs [POLICY_NUMBER]')
  })

  it('masks TC Kimlik numbers (11 digits) in breadcrumb messages', async () => {
    const beforeSend = await getBeforeSend()

    const event = {
      breadcrumbs: [
        { message: 'Verified TC 12345678901' },
        { message: 'Users 99887766554 and 11223344556 compared' },
      ],
    }

    const result = beforeSend(event) as typeof event
    expect(result.breadcrumbs[0].message).toBe('Verified TC [TC_KIMLIK]')
    expect(result.breadcrumbs[1].message).toBe('Users [TC_KIMLIK] and [TC_KIMLIK] compared')
  })

  it('handles breadcrumbs without message field gracefully', async () => {
    const beforeSend = await getBeforeSend()

    const event = {
      breadcrumbs: [
        { category: 'http', data: { url: '/api/test' } },
        { message: 'Policy 12-34567890' },
        { category: 'navigation' },
      ],
    }

    const result = beforeSend(event) as typeof event
    expect(result.breadcrumbs[0]).toEqual({ category: 'http', data: { url: '/api/test' } })
    expect(result.breadcrumbs[1].message).toBe('Policy [POLICY_NUMBER]')
    expect(result.breadcrumbs[2]).toEqual({ category: 'navigation' })
  })

  it('returns event unchanged when no breadcrumbs', async () => {
    const beforeSend = await getBeforeSend()

    const event = {
      message: 'Test error without breadcrumbs',
    }

    const result = beforeSend(event)
    expect(result).toEqual({ message: 'Test error without breadcrumbs' })
  })

  it('returns event unchanged when no request headers', async () => {
    const beforeSend = await getBeforeSend()

    const event = {
      message: 'No request object',
      breadcrumbs: [{ message: 'Clean message' }],
    }

    const result = beforeSend(event) as typeof event
    expect(result.message).toBe('No request object')
    expect(result.breadcrumbs[0].message).toBe('Clean message')
  })

  it('handles combined policy + TC Kimlik in same breadcrumb', async () => {
    const beforeSend = await getBeforeSend()

    const event = {
      breadcrumbs: [
        { message: 'Policy 12-34567890 for TC 12345678901' },
      ],
    }

    const result = beforeSend(event) as typeof event
    expect(result.breadcrumbs[0].message).toBe('Policy [POLICY_NUMBER] for TC [TC_KIMLIK]')
  })

  it('leaves non-matching numbers untouched', async () => {
    const beforeSend = await getBeforeSend()

    const event = {
      breadcrumbs: [
        { message: 'Amount 15000 for user 12345' },
      ],
    }

    const result = beforeSend(event) as typeof event
    expect(result.breadcrumbs[0].message).toBe('Amount 15000 for user 12345')
  })
})

// ===========================================================================
// setSentryUser() — with and without DSN
// ===========================================================================
describe('setSentryUser() branches', () => {
  it('returns early when DSN is not configured', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })

    mod.setSentryUser({ id: 'user-1', email: 'test@test.com' })
    expect(mockSetUser).not.toHaveBeenCalled()
  })

  it('sets user on Sentry when DSN is configured and user is provided', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.setSentryUser({ id: 'user-42', email: 'user@example.com' })

    expect(mockSetUser).toHaveBeenCalledTimes(1)
    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-42', email: 'user@example.com' })
  })

  it('sets user without email when DSN is configured', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.setSentryUser({ id: 'user-no-email' })

    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-no-email', email: undefined })
  })

  it('clears user (sets null) when DSN is configured and null passed', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.setSentryUser(null)

    expect(mockSetUser).toHaveBeenCalledTimes(1)
    expect(mockSetUser).toHaveBeenCalledWith(null)
  })
})

// ===========================================================================
// setSentryContext() — with and without DSN
// ===========================================================================
describe('setSentryContext() branches', () => {
  it('returns early when DSN is not configured', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })

    mod.setSentryContext('policy', { type: 'kasko' })
    expect(mockSetContext).not.toHaveBeenCalled()
  })

  it('calls Sentry.setContext when DSN is configured', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.setSentryContext('policy', { type: 'kasko', premium: 15000 })

    expect(mockSetContext).toHaveBeenCalledTimes(1)
    expect(mockSetContext).toHaveBeenCalledWith('policy', { type: 'kasko', premium: 15000 })
  })
})

// ===========================================================================
// captureError() — with and without DSN
// ===========================================================================
describe('captureError() branches', () => {
  it('logs to console and returns undefined when DSN is not configured', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const err = new Error('Test capture')
    const ctx = { policyId: 'p-123' }
    const result = mod.captureError(err, ctx)

    expect(result).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith('Error captured (Sentry disabled):', err, ctx)
    expect(mockCaptureException).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('logs to console without context when DSN is not configured and no context passed', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const err = new Error('No context')
    const result = mod.captureError(err)

    expect(result).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith('Error captured (Sentry disabled):', err, undefined)

    consoleSpy.mockRestore()
  })

  it('calls Sentry.captureException and returns event ID when DSN is configured', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    const err = new Error('Real error')
    const ctx = { userId: 'u-1' }
    const result = mod.captureError(err, ctx)

    expect(result).toBe('mock-event-id-123')
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).toHaveBeenCalledWith(err, { extra: ctx })
  })

  it('calls Sentry.captureException without context when none provided', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    const err = new Error('No context error')
    mod.captureError(err)

    expect(mockCaptureException).toHaveBeenCalledWith(err, { extra: undefined })
  })
})

// ===========================================================================
// captureMessage() — with and without DSN
// ===========================================================================
describe('captureMessage() branches', () => {
  it('falls back to console.info when DSN is not configured', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    mod.captureMessage('Info message', 'info')

    expect(consoleSpy).toHaveBeenCalledWith('[info] Info message')
    expect(mockCaptureMessage).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('falls back to console.info with warning level when DSN is not configured', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    mod.captureMessage('Watch out', 'warning')

    expect(consoleSpy).toHaveBeenCalledWith('[warning] Watch out')

    consoleSpy.mockRestore()
  })

  it('falls back to console.info with error level when DSN is not configured', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    mod.captureMessage('Something broke', 'error')

    expect(consoleSpy).toHaveBeenCalledWith('[error] Something broke')

    consoleSpy.mockRestore()
  })

  it('uses default info level when no level specified and DSN not configured', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    mod.captureMessage('Default level message')

    expect(consoleSpy).toHaveBeenCalledWith('[info] Default level message')

    consoleSpy.mockRestore()
  })

  it('calls Sentry.captureMessage when DSN is configured', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.captureMessage('Production message', 'warning')

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    expect(mockCaptureMessage).toHaveBeenCalledWith('Production message', 'warning')
  })

  it('calls Sentry.captureMessage with default info level when DSN is configured', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.captureMessage('Info msg')

    expect(mockCaptureMessage).toHaveBeenCalledWith('Info msg', 'info')
  })
})

// ===========================================================================
// addBreadcrumb() — with and without DSN
// ===========================================================================
describe('addBreadcrumb() branches', () => {
  it('returns early when DSN is not configured', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })

    mod.addBreadcrumb('click', 'ui', { button: 'submit' })
    expect(mockAddBreadcrumb).not.toHaveBeenCalled()
  })

  it('calls Sentry.addBreadcrumb when DSN is configured', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.addBreadcrumb('User navigated', 'navigation', { to: '/dashboard' })

    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1)
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      message: 'User navigated',
      category: 'navigation',
      data: { to: '/dashboard' },
      level: 'info',
    })
  })

  it('calls Sentry.addBreadcrumb without data when not provided', async () => {
    const mod = await importSentry({
      VITE_SENTRY_DSN: 'https://x@sentry.io/1',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    mod.addBreadcrumb('Simple breadcrumb', 'default')

    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      message: 'Simple breadcrumb',
      category: 'default',
      data: undefined,
      level: 'info',
    })
  })
})

// ===========================================================================
// Sentry.init config — enabled flag branches
// ===========================================================================
describe('Sentry enabled flag branches', () => {
  it('enabled is true when IS_PRODUCTION is true', async () => {
    setProdMode(true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://x@sentry.io/1')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VITE_SENTRY_DEBUG', '')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    const config = mockInit.mock.calls[0][0]
    expect(config.enabled).toBe(true)

    setProdMode(false)
  })

  it('enabled is true when IS_STAGING is true', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://x@sentry.io/1')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('VITE_SENTRY_DEBUG', '')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    const config = mockInit.mock.calls[0][0]
    expect(config.enabled).toBe(true)
  })

  it('enabled is true when VITE_SENTRY_DEBUG is true in development', async () => {
    setProdMode(false)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://x@sentry.io/1')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'development')
    vi.stubEnv('VITE_SENTRY_DEBUG', 'true')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    const config = mockInit.mock.calls[0][0]
    expect(config.enabled).toBe(true)
  })

  it('enabled is false in development without debug flag', async () => {
    setProdMode(false)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://x@sentry.io/1')
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'development')
    vi.stubEnv('VITE_SENTRY_DEBUG', '')
    vi.resetModules()

    const mod = await import('./sentry')
    mod.initSentry()

    const config = mockInit.mock.calls[0][0]
    expect(config.enabled).toBe(false)
  })
})

// ===========================================================================
// ErrorBoundary re-export
// ===========================================================================
describe('ErrorBoundary re-export', () => {
  it('re-exports ErrorBoundary from @sentry/react', async () => {
    const mod = await importSentry({ VITE_SENTRY_DSN: '' })
    expect(mod.ErrorBoundary).toBeDefined()
  })
})
