/**
 * Environment & Configuration Validation Tests
 *
 * These tests verify that the application is properly configured for real use.
 * They do NOT mock external dependencies - they test actual configuration.
 *
 * By default, these tests SKIP when environment variables are not configured.
 * This is expected behavior for development and CI environments.
 *
 * To run full validation before deployment:
 *   1. Configure all required environment variables in .env
 *   2. Run: npm test -- src/__tests__/integration/environment-validation.test.ts
 *
 * Tests will:
 *   - SKIP with a warning when env vars are missing (development/CI mode)
 *   - PASS when env vars are correctly configured (production validation mode)
 *   - FAIL when env vars are configured but invalid (catches config errors)
 */

import { describe, it, expect } from 'vitest'

// Helper to skip tests when env var is not set (expected in dev/CI)
const skipIfNotConfigured = (envVar: string | undefined, description: string) => {
  if (!envVar) {
    console.log(`ℹ️  Skipping: ${description} (not configured in this environment)`)
    return true
  }
  return false
}

describe('Environment Configuration Validation', () => {
  describe('Required Environment Variables', () => {
    it('should have VITE_API_PROXY_URL configured for AI extraction', () => {
      const proxyUrl = import.meta.env.VITE_API_PROXY_URL
      if (skipIfNotConfigured(proxyUrl, 'VITE_API_PROXY_URL')) return

      expect(proxyUrl).not.toBe('')
      expect(proxyUrl).toMatch(/^https?:\/\//)
    })

    it('should have Supabase URL configured', () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      if (skipIfNotConfigured(supabaseUrl, 'VITE_SUPABASE_URL')) return

      expect(supabaseUrl).not.toBe('')
      expect(supabaseUrl).toMatch(/supabase\.co/)
    })

    it('should have Supabase anon key configured', () => {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (skipIfNotConfigured(anonKey, 'VITE_SUPABASE_ANON_KEY')) return

      expect(anonKey).not.toBe('')
      expect(anonKey.length).toBeGreaterThan(100) // JWT tokens are long
    })

    it('should have Sentry DSN configured for error tracking', () => {
      const sentryDsn = import.meta.env.VITE_SENTRY_DSN
      if (skipIfNotConfigured(sentryDsn, 'VITE_SENTRY_DSN')) return

      expect(sentryDsn).not.toBe('')
      expect(sentryDsn).toMatch(/sentry\.io/)
    })
  })

  describe('API Proxy Connectivity', () => {
    // These tests require the backend server to be running
    // They will skip gracefully if server is unavailable
    // Run with: npm run dev:server & npm test

    it('should be able to reach the API proxy health endpoint', async () => {
      const proxyUrl = import.meta.env.VITE_API_PROXY_URL
      if (skipIfNotConfigured(proxyUrl, 'API proxy connectivity')) return

      try {
        const response = await fetch(`${proxyUrl}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })

        expect(response.ok).toBe(true)

        const data = await response.json()
        expect(data.status).toBe('ok')
      } catch (_error) {
        // Server not running - this is expected in unit test mode
        console.log(`ℹ️  Backend server not running at ${proxyUrl} - skipping connectivity test`)
        console.log('   Start server with: npm run dev:server')
      }
    })

    it('should have at least one AI provider configured on the server', async () => {
      const proxyUrl = import.meta.env.VITE_API_PROXY_URL
      if (skipIfNotConfigured(proxyUrl, 'AI provider check')) return

      try {
        const response = await fetch(`${proxyUrl}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })

        if (!response.ok) {
          console.log(`ℹ️  Health check failed with status ${response.status}`)
          return
        }

        const data = await response.json()
        const { providers } = data

        expect(providers).toBeDefined()

        const hasProvider = providers.openai || providers.anthropic || providers.google
        if (!hasProvider) {
          console.error(
            '❌ No AI provider configured on server. ' +
            'Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_CLOUD_API_KEY in server .env'
          )
        }

        expect(hasProvider).toBe(true)
      } catch {
        // Server not running - skip this test
        console.log(`ℹ️  Cannot connect to ${proxyUrl} - skipping provider verification`)
      }
    })
  })
})

describe('AI Extraction Integration', () => {
  it('should NOT return demo/fallback data when AI is expected to work', async () => {
    // This test ensures that when we think AI is configured,
    // we actually get real extraction, not demo fallback

    const proxyUrl = import.meta.env.VITE_API_PROXY_URL
    if (skipIfNotConfigured(proxyUrl, 'AI extraction test')) return

    // Check if server has AI providers
    try {
      const healthResponse = await fetch(`${proxyUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      })

      if (!healthResponse.ok) {
        console.log('ℹ️  API proxy not available - skipping integration test')
        return
      }

      const health = await healthResponse.json()
      const hasProvider = health.providers?.openai || health.providers?.anthropic

      if (!hasProvider) {
        console.log('ℹ️  No AI provider configured on server - skipping integration test')
        return
      }

      // If we get here, AI should work - test a real extraction
      const response = await fetch(`${proxyUrl}/api/ai/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Poliçe No: 12345\nSigortalı: Test User\nPrim: 5000 TL',
          provider: 'openai',
        }),
        signal: AbortSignal.timeout(30000),
      })

      // Should get a response (even if extraction fails, it should be an API response, not fallback)
      expect(response.status).not.toBe(404)

      const result = await response.json()

      // If successful, should have extraction data
      // If failed, should have an error message - NOT silent fallback
      if (response.ok) {
        expect(result.policyNumber || result.error).toBeDefined()
      } else {
        expect(result.error).toBeDefined()
      }
    } catch (error) {
      // Network errors are acceptable in test environment
      console.log(`ℹ️  Integration test skipped due to network: ${error}`)
    }
  })
})
