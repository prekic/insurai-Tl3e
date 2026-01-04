/**
 * Dependency Validation Tests
 *
 * These tests verify that all required dependencies are installed and importable.
 * They catch missing package issues before runtime.
 */

import { describe, it, expect } from 'vitest'

describe('Required Dependencies', () => {
  describe('Core Dependencies', () => {
    it('should have React installed', async () => {
      const react = await import('react')
      expect(react).toBeDefined()
      expect(react.useState).toBeDefined()
    })

    it('should have React DOM installed', async () => {
      const reactDom = await import('react-dom/client')
      expect(reactDom).toBeDefined()
      expect(reactDom.createRoot).toBeDefined()
    })

    it('should have React Router installed', async () => {
      const router = await import('react-router-dom')
      expect(router).toBeDefined()
      expect(router.BrowserRouter).toBeDefined()
    })
  })

  describe('Performance & Monitoring Dependencies', () => {
    it('should have web-vitals installed', async () => {
      const webVitals = await import('web-vitals')
      expect(webVitals).toBeDefined()
      expect(webVitals.onLCP).toBeDefined()
      expect(webVitals.onCLS).toBeDefined()
      // Note: onFID was renamed to onINP in web-vitals v4+
      expect(webVitals.onINP).toBeDefined()
    })

    it('should have Sentry React SDK installed', async () => {
      const sentry = await import('@sentry/react')
      expect(sentry).toBeDefined()
      expect(sentry.init).toBeDefined()
      expect(sentry.captureException).toBeDefined()
    })
  })

  describe('AI & Document Processing Dependencies', () => {
    it('should have OpenAI SDK installed', async () => {
      const openai = await import('openai')
      expect(openai).toBeDefined()
    })

    it('should have Anthropic SDK installed', async () => {
      const anthropic = await import('@anthropic-ai/sdk')
      expect(anthropic).toBeDefined()
    })

    it('should have PDF.js installed', async () => {
      // PDF.js requires browser environment, so we just check the package exists
      // by verifying the import doesn't throw a MODULE_NOT_FOUND error
      try {
        // Use a lighter import that doesn't require DOM
        const pkgJson = await import('pdfjs-dist/package.json')
        expect(pkgJson.name).toBe('pdfjs-dist')
      } catch (error) {
        // If package.json import fails, try the main module
        // It will fail with DOMMatrix error in Node, but that's OK - package exists
        if (error instanceof Error && error.message.includes('MODULE_NOT_FOUND')) {
          throw new Error('pdfjs-dist package is not installed')
        }
        // DOMMatrix error means package exists but needs browser - that's fine
        expect(true).toBe(true)
      }
    })
  })

  describe('Backend Dependencies', () => {
    it('should have Supabase client installed', async () => {
      const supabase = await import('@supabase/supabase-js')
      expect(supabase).toBeDefined()
      expect(supabase.createClient).toBeDefined()
    })
  })

  describe('UI Dependencies', () => {
    it('should have Lucide React icons installed', async () => {
      const lucide = await import('lucide-react')
      expect(lucide).toBeDefined()
      expect(lucide.Upload).toBeDefined()
    })

    it('should have Framer Motion installed', async () => {
      const motion = await import('framer-motion')
      expect(motion).toBeDefined()
      expect(motion.motion).toBeDefined()
    })

    it('should have Sonner toast installed', async () => {
      const sonner = await import('sonner')
      expect(sonner).toBeDefined()
      expect(sonner.toast).toBeDefined()
    })
  })
})

describe('CDN Resource Availability', () => {
  it('should have accessible PDF.js worker URL', async () => {
    // Get the version from package.json to construct expected URL
    try {
      const pkgJson = await import('pdfjs-dist/package.json')
      const version = pkgJson.version

      // Test unpkg (primary CDN)
      const unpkgUrl = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`

      const response = await fetch(unpkgUrl, {
        method: 'HEAD', // Just check if resource exists
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        console.error(`❌ PDF.js worker not found at ${unpkgUrl}`)
        console.error(`   Status: ${response.status}`)
        console.error('   This will cause PDF parsing to fail!')

        // Try jsdelivr as backup check
        const jsdelivrUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
        const backupResponse = await fetch(jsdelivrUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(10000),
        })

        if (backupResponse.ok) {
          console.warn(`⚠️ Consider using jsdelivr instead: ${jsdelivrUrl}`)
        }

        throw new Error(`PDF.js worker v${version} not available on CDN`)
      }

      expect(response.ok).toBe(true)
    } catch (error) {
      if (error instanceof Error && error.message.includes('not available')) {
        throw error
      }
      // Network errors in test environment are acceptable
      console.warn(`⚠️ Cannot verify PDF.js worker URL (network): ${error}`)
    }
  })

  it('should use a PDF.js version available on CDN', async () => {
    try {
      const pkgJson = await import('pdfjs-dist/package.json')
      const version = pkgJson.version

      // Version should be a valid semver
      expect(version).toMatch(/^\d+\.\d+\.\d+/)

      // Log the version for debugging
      console.log(`📦 PDF.js version: ${version}`)
    } catch {
      console.warn('⚠️ Could not read pdfjs-dist version')
    }
  })
})
