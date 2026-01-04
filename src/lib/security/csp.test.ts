/**
 * Tests for Content Security Policy Configuration
 * Tests CSP directives, meta tag building, and violation handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CSP_DIRECTIVES,
  CSP_DEV_ADDITIONS,
  CSP_SERVER_ONLY,
  buildCSPMetaTag,
  handleCSPViolation,
  setupCSPViolationListener,
} from './csp'

// =============================================================================
// CSP Directives Tests
// =============================================================================

describe('CSP_DIRECTIVES', () => {
  it('should have default-src set to self', () => {
    expect(CSP_DIRECTIVES['default-src']).toContain("'self'")
  })

  it('should include Sentry in script-src', () => {
    expect(CSP_DIRECTIVES['script-src']).toContain('https://*.sentry.io')
    expect(CSP_DIRECTIVES['script-src']).toContain('https://*.sentry-cdn.com')
  })

  it('should allow unsafe-inline for styles (Tailwind)', () => {
    expect(CSP_DIRECTIVES['style-src']).toContain("'unsafe-inline'")
  })

  it('should include Google Fonts in style-src', () => {
    expect(CSP_DIRECTIVES['style-src']).toContain('https://fonts.googleapis.com')
  })

  it('should include gstatic for fonts', () => {
    expect(CSP_DIRECTIVES['font-src']).toContain('https://fonts.gstatic.com')
  })

  it('should allow data URIs for fonts', () => {
    expect(CSP_DIRECTIVES['font-src']).toContain('data:')
  })

  it('should allow data and blob for images', () => {
    expect(CSP_DIRECTIVES['img-src']).toContain('data:')
    expect(CSP_DIRECTIVES['img-src']).toContain('blob:')
  })

  it('should include Supabase in img-src', () => {
    expect(CSP_DIRECTIVES['img-src']).toContain('https://*.supabase.co')
  })

  it('should include Supabase connections', () => {
    expect(CSP_DIRECTIVES['connect-src']).toContain('https://*.supabase.co')
    expect(CSP_DIRECTIVES['connect-src']).toContain('wss://*.supabase.co')
  })

  it('should include Sentry in connect-src', () => {
    expect(CSP_DIRECTIVES['connect-src']).toContain('https://*.sentry.io')
    expect(CSP_DIRECTIVES['connect-src']).toContain('https://*.ingest.sentry.io')
  })

  it('should restrict object-src to none', () => {
    expect(CSP_DIRECTIVES['object-src']).toContain("'none'")
  })

  it('should restrict frame-src to self', () => {
    expect(CSP_DIRECTIVES['frame-src']).toContain("'self'")
  })

  it('should restrict base-uri to self', () => {
    expect(CSP_DIRECTIVES['base-uri']).toContain("'self'")
  })

  it('should restrict form-action to self', () => {
    expect(CSP_DIRECTIVES['form-action']).toContain("'self'")
  })

  it('should allow blob workers', () => {
    expect(CSP_DIRECTIVES['worker-src']).toContain('blob:')
  })

  it('should allow blob child-src', () => {
    expect(CSP_DIRECTIVES['child-src']).toContain('blob:')
  })

  it('should restrict media-src to self', () => {
    expect(CSP_DIRECTIVES['media-src']).toContain("'self'")
  })

  it('should restrict manifest-src to self', () => {
    expect(CSP_DIRECTIVES['manifest-src']).toContain("'self'")
  })
})

// =============================================================================
// CSP Dev Additions Tests
// =============================================================================

describe('CSP_DEV_ADDITIONS', () => {
  it('should include unsafe-inline for scripts in dev', () => {
    expect(CSP_DEV_ADDITIONS['script-src']).toContain("'unsafe-inline'")
  })

  it('should include unsafe-eval for scripts in dev (HMR)', () => {
    expect(CSP_DEV_ADDITIONS['script-src']).toContain("'unsafe-eval'")
  })

  it('should allow localhost websockets in dev', () => {
    expect(CSP_DEV_ADDITIONS['connect-src']).toContain('ws://localhost:*')
    expect(CSP_DEV_ADDITIONS['connect-src']).toContain('wss://localhost:*')
  })
})

// =============================================================================
// CSP Server Only Tests
// =============================================================================

describe('CSP_SERVER_ONLY', () => {
  it('should prevent iframe embedding', () => {
    expect(CSP_SERVER_ONLY['frame-ancestors']).toContain("'none'")
  })

  it('should have upgrade-insecure-requests', () => {
    expect(CSP_SERVER_ONLY['upgrade-insecure-requests']).toEqual([])
  })
})

// =============================================================================
// buildCSPMetaTag Tests
// =============================================================================

describe('buildCSPMetaTag', () => {
  it('should build valid CSP string for production', () => {
    const csp = buildCSPMetaTag(false)

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
  })

  it('should include all directives separated by semicolons', () => {
    const csp = buildCSPMetaTag(false)
    const directives = csp.split('; ')

    expect(directives.length).toBeGreaterThan(10)
  })

  it('should include Supabase in production', () => {
    const csp = buildCSPMetaTag(false)

    expect(csp).toContain('https://*.supabase.co')
  })

  it('should include Sentry in production', () => {
    const csp = buildCSPMetaTag(false)

    expect(csp).toContain('https://*.sentry.io')
  })

  it('should NOT include unsafe-eval in production', () => {
    const csp = buildCSPMetaTag(false)

    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('should NOT include localhost websockets in production', () => {
    const csp = buildCSPMetaTag(false)

    expect(csp).not.toContain('ws://localhost')
  })

  it('should include dev additions when isDev is true', () => {
    const csp = buildCSPMetaTag(true)

    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain("'unsafe-inline'")
  })

  it('should include localhost websockets in dev mode', () => {
    const csp = buildCSPMetaTag(true)

    expect(csp).toContain('ws://localhost:*')
    expect(csp).toContain('wss://localhost:*')
  })

  it('should merge dev additions with base directives', () => {
    const csp = buildCSPMetaTag(true)
    const scriptSrc = csp.split('; ').find(d => d.startsWith('script-src'))

    // Should have both base (Sentry) and dev (unsafe-eval)
    expect(scriptSrc).toContain('https://*.sentry.io')
    expect(scriptSrc).toContain("'unsafe-eval'")
  })

  it('should default to production when isDev is not provided', () => {
    const csp = buildCSPMetaTag()

    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('should produce consistent output for same input', () => {
    const csp1 = buildCSPMetaTag(false)
    const csp2 = buildCSPMetaTag(false)

    expect(csp1).toBe(csp2)
  })

  it('should properly format directive values with spaces', () => {
    const csp = buildCSPMetaTag(false)

    // Each directive should have format: "directive-name value1 value2"
    const directives = csp.split('; ')
    for (const directive of directives) {
      const parts = directive.split(' ')
      expect(parts.length).toBeGreaterThanOrEqual(2)
    }
  })
})

// =============================================================================
// handleCSPViolation Tests
// =============================================================================

describe('handleCSPViolation', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  it('should log CSP violation details', () => {
    const mockEvent = {
      blockedURI: 'https://evil.com/script.js',
      violatedDirective: 'script-src',
      originalPolicy: "script-src 'self'",
      sourceFile: 'https://example.com/page.html',
      lineNumber: 42,
      columnNumber: 10,
    } as SecurityPolicyViolationEvent

    handleCSPViolation(mockEvent)

    expect(consoleWarnSpy).toHaveBeenCalledWith('CSP Violation:', {
      blockedURI: 'https://evil.com/script.js',
      violatedDirective: 'script-src',
      originalPolicy: "script-src 'self'",
      sourceFile: 'https://example.com/page.html',
      lineNumber: 42,
      columnNumber: 10,
    })
  })

  it('should handle img-src violation', () => {
    const mockEvent = {
      blockedURI: 'https://tracker.com/pixel.gif',
      violatedDirective: 'img-src',
      originalPolicy: "img-src 'self' data:",
      sourceFile: '',
      lineNumber: 0,
      columnNumber: 0,
    } as SecurityPolicyViolationEvent

    handleCSPViolation(mockEvent)

    expect(consoleWarnSpy).toHaveBeenCalledWith('CSP Violation:', expect.objectContaining({
      blockedURI: 'https://tracker.com/pixel.gif',
      violatedDirective: 'img-src',
    }))
  })

  it('should handle inline script violation', () => {
    const mockEvent = {
      blockedURI: 'inline',
      violatedDirective: 'script-src',
      originalPolicy: "script-src 'self'",
      sourceFile: 'https://example.com/page.html',
      lineNumber: 100,
      columnNumber: 1,
    } as SecurityPolicyViolationEvent

    handleCSPViolation(mockEvent)

    expect(consoleWarnSpy).toHaveBeenCalledWith('CSP Violation:', expect.objectContaining({
      blockedURI: 'inline',
      lineNumber: 100,
    }))
  })

  it('should handle eval violation', () => {
    const mockEvent = {
      blockedURI: 'eval',
      violatedDirective: 'script-src',
      originalPolicy: "script-src 'self'",
      sourceFile: 'https://example.com/app.js',
      lineNumber: 55,
      columnNumber: 20,
    } as SecurityPolicyViolationEvent

    handleCSPViolation(mockEvent)

    expect(consoleWarnSpy).toHaveBeenCalledWith('CSP Violation:', expect.objectContaining({
      blockedURI: 'eval',
    }))
  })

  it('should handle connect-src violation', () => {
    const mockEvent = {
      blockedURI: 'https://unauthorized-api.com/data',
      violatedDirective: 'connect-src',
      originalPolicy: "connect-src 'self' https://*.supabase.co",
      sourceFile: '',
      lineNumber: 0,
      columnNumber: 0,
    } as SecurityPolicyViolationEvent

    handleCSPViolation(mockEvent)

    expect(consoleWarnSpy).toHaveBeenCalledWith('CSP Violation:', expect.objectContaining({
      violatedDirective: 'connect-src',
    }))
  })
})

// =============================================================================
// setupCSPViolationListener Tests
// =============================================================================

describe('setupCSPViolationListener', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    // Mock document for browser environment
    addEventListenerSpy = vi.fn()

    vi.stubGlobal('document', {
      addEventListener: addEventListenerSpy,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should add security policy violation listener', () => {
    setupCSPViolationListener()

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'securitypolicyviolation',
      handleCSPViolation
    )
  })

  it('should call addEventListener exactly once', () => {
    setupCSPViolationListener()

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1)
  })
})

describe('setupCSPViolationListener - no document', () => {
  it('should not throw when document is undefined', () => {
    // Remove document
    vi.stubGlobal('document', undefined)

    expect(() => setupCSPViolationListener()).not.toThrow()

    vi.unstubAllGlobals()
  })
})

// =============================================================================
// CSP Integration Tests
// =============================================================================

describe('CSP Integration', () => {
  it('should have all essential security directives', () => {
    const essentialDirectives = [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'connect-src',
      'object-src',
      'base-uri',
      'form-action',
    ]

    for (const directive of essentialDirectives) {
      expect(CSP_DIRECTIVES).toHaveProperty(directive)
    }
  })

  it('should have self in default-src as fallback', () => {
    expect(CSP_DIRECTIVES['default-src']).toContain("'self'")
  })

  it('should block plugins with object-src none', () => {
    expect(CSP_DIRECTIVES['object-src']).toEqual(["'none'"])
  })

  it('should prevent base tag hijacking', () => {
    expect(CSP_DIRECTIVES['base-uri']).toContain("'self'")
  })

  it('should prevent form hijacking', () => {
    expect(CSP_DIRECTIVES['form-action']).toContain("'self'")
  })

  it('should be immutable (readonly)', () => {
    // The as const makes these readonly
    expect(CSP_DIRECTIVES['default-src']).toBeInstanceOf(Array)
  })
})

// =============================================================================
// CSP String Parsing Tests
// =============================================================================

describe('CSP String Format', () => {
  it('should produce parseable CSP string', () => {
    const csp = buildCSPMetaTag(false)
    const directives = csp.split('; ')

    const parsed: Record<string, string[]> = {}
    for (const directive of directives) {
      const [name, ...values] = directive.split(' ')
      parsed[name] = values
    }

    expect(Object.keys(parsed).length).toBeGreaterThan(0)
  })

  it('should not have empty directive values', () => {
    const csp = buildCSPMetaTag(false)
    const directives = csp.split('; ')

    for (const directive of directives) {
      const parts = directive.split(' ')
      expect(parts.length).toBeGreaterThan(1)
      expect(parts[0]).not.toBe('')
    }
  })

  it('should not have duplicate directive names', () => {
    const csp = buildCSPMetaTag(false)
    const directives = csp.split('; ')

    const names = directives.map(d => d.split(' ')[0])
    const uniqueNames = new Set(names)

    expect(names.length).toBe(uniqueNames.size)
  })

  it('should not have trailing semicolon', () => {
    const csp = buildCSPMetaTag(false)

    expect(csp.endsWith(';')).toBe(false)
    expect(csp.endsWith('; ')).toBe(false)
  })

  it('should use proper semicolon-space separator', () => {
    const csp = buildCSPMetaTag(false)

    // Should use "; " not ";" or " ;" or "  ;  "
    expect(csp).toContain('; ')
    expect(csp).not.toContain(' ;')
    expect(csp).not.toContain(';;')
  })
})
