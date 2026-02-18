/**
 * Branch Coverage Tests for Supabase Client
 *
 * Targets uncovered branches in src/lib/supabase/client.ts:
 * - validateCredentials: no URL, no key, invalid URL, non-supabase hostname, non-JWT key
 * - createSafeClient: with credentials, without credentials
 * - Proxy handler: 'then'/'catch' property access, regular property access, apply trap
 * - isSupabaseConfigured: configured vs unconfigured
 * - Logging: production+browser vs non-production
 *
 * Uses vi.resetModules() + dynamic import to test module-level initialization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Store original import.meta.env
const originalEnv = { ...import.meta.env }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

afterEach(() => {
  // Restore env
  Object.assign(import.meta.env, originalEnv)
  vi.restoreAllMocks()
})

// ==================================================================
// validateCredentials branches
// ==================================================================
describe('validateCredentials branches', () => {
  it('returns null when VITE_SUPABASE_URL is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test')

    const { isSupabaseConfigured } = await import('./client')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('returns null when VITE_SUPABASE_ANON_KEY is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { isSupabaseConfigured } = await import('./client')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('returns null when both are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { isSupabaseConfigured } = await import('./client')
    expect(isSupabaseConfigured()).toBe(false)
  })
})

// ==================================================================
// Proxy handler branches (unconfigured client)
// ==================================================================
describe('Proxy handler branches (unconfigured client)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  })

  it('returns undefined for "then" property (not a promise)', async () => {
    const { supabase } = await import('./client')
    // Accessing .then should return undefined, not throw
    const thenVal = (supabase as unknown as Record<string, unknown>)['then']
    expect(thenVal).toBeUndefined()
  })

  it('returns undefined for "catch" property (not a promise)', async () => {
    const { supabase } = await import('./client')
    const catchVal = (supabase as unknown as Record<string, unknown>)['catch']
    expect(catchVal).toBeUndefined()
  })

  it('throws on accessing auth property', async () => {
    const { supabase } = await import('./client')
    expect(() => supabase.auth).toThrow('Supabase is not configured')
  })

  it('throws on accessing storage property', async () => {
    const { supabase } = await import('./client')
    expect(() => supabase.storage).toThrow('Supabase is not configured')
  })

  it('throws error with configuration instructions', async () => {
    const { supabase } = await import('./client')
    try {
      supabase.from('test')
      expect.fail('Should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('VITE_SUPABASE_URL')
      expect((e as Error).message).toContain('VITE_SUPABASE_ANON_KEY')
      expect((e as Error).message).toContain('local-only mode')
    }
  })
})

// ==================================================================
// isSupabaseConfigured
// ==================================================================
describe('isSupabaseConfigured', () => {
  it('returns false when URL is empty', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')

    const { isSupabaseConfigured } = await import('./client')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('returns false when key is empty', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { isSupabaseConfigured } = await import('./client')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('returns true when both are set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')

    const { isSupabaseConfigured } = await import('./client')
    expect(isSupabaseConfigured()).toBe(true)
  })
})

// ==================================================================
// URL validation in validateCredentials
// ==================================================================
describe('URL validation in validateCredentials', () => {
  it('warns when URL is not a supabase endpoint', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.com')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')

    const { isSupabaseConfigured } = await import('./client')
    expect(isSupabaseConfigured()).toBe(true)
    // console.warn is called with two args: message string, hostname
    const calls = warnSpy.mock.calls.flat().map(String)
    expect(calls.some(s => s.includes('does not appear to be a Supabase endpoint'))).toBe(true)
    warnSpy.mockRestore()
  })

  it('returns null for invalid URL format', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('VITE_SUPABASE_URL', 'not-a-valid-url')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')

    const { isSupabaseConfigured } = await import('./client')
    // validateCredentials returns null for invalid URL, but isSupabaseConfigured checks the raw env
    // The supabase client will be a proxy
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid VITE_SUPABASE_URL')
    )
    errorSpy.mockRestore()
  })

  it('warns when key does not look like a JWT', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'not-a-jwt-key')

    await import('./client')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('does not appear to be a valid JWT')
    )
    warnSpy.mockRestore()
  })

  it('does not warn for valid supabase URL', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('VITE_SUPABASE_URL', 'https://myproject.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')

    await import('./client')
    // Should not warn about non-supabase URL
    const supabaseWarnings = warnSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('does not appear to be a Supabase endpoint')
    )
    expect(supabaseWarnings).toHaveLength(0)
    warnSpy.mockRestore()
  })
})

// ==================================================================
// Logging branches for unconfigured state
// ==================================================================
describe('logging for unconfigured state', () => {
  it('logs warning in non-production', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const metaEnv = import.meta.env as Record<string, unknown>
    metaEnv.PROD = false

    await import('./client')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Supabase not configured')
    )
    warnSpy.mockRestore()
  })
})

// ==================================================================
// Configured client branches
// ==================================================================
describe('configured client', () => {
  it('creates real Supabase client when configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QiLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')

    const { supabase, isSupabaseConfigured } = await import('./client')
    expect(isSupabaseConfigured()).toBe(true)
    // Should be a real client, not a proxy
    expect(supabase).toBeDefined()
    // Should not throw when accessing .auth on real client
    expect(() => supabase.auth).not.toThrow()
  })
})
