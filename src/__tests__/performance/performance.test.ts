/**
 * Performance Tests
 *
 * Tests to verify performance optimizations are in place:
 * - Bundle splitting
 * - Lazy loading
 * - Resource hints
 * - Service worker
 * - FCP optimization
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Performance Optimizations', () => {
  describe('Bundle Configuration', () => {
    it('has manual chunks configured in vite.config.ts', async () => {
      const configPath = path.resolve(__dirname, '../../../vite.config.ts')
      const configContent = fs.readFileSync(configPath, 'utf-8')

      // Verify manual chunks are defined
      expect(configContent).toContain('manualChunks')
      expect(configContent).toContain('vendor-react')
      expect(configContent).toContain('vendor-animation')
      expect(configContent).toContain('vendor-pdf')
      expect(configContent).toContain('vendor-ai')
      expect(configContent).toContain('vendor-ui')
      expect(configContent).toContain('vendor-supabase')
    })

    it('has bundle visualizer configured', async () => {
      const configPath = path.resolve(__dirname, '../../../vite.config.ts')
      const configContent = fs.readFileSync(configPath, 'utf-8')

      expect(configContent).toContain('visualizer')
      expect(configContent).toContain("ANALYZE === 'true'")
    })

    it('has analyze script in package.json', async () => {
      const packagePath = path.resolve(__dirname, '../../../package.json')
      const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))

      expect(packageContent.scripts['build:analyze']).toBeDefined()
      expect(packageContent.scripts['build:analyze']).toContain('ANALYZE=true')
    })
  })

  describe('Lazy Loading', () => {
    it('has route components lazy loaded in App.tsx', async () => {
      const appPath = path.resolve(__dirname, '../../App.tsx')
      const appContent = fs.readFileSync(appPath, 'utf-8')

      // Verify lazy loading is used for route components
      expect(appContent).toContain("lazy(() =>")
      expect(appContent).toContain('LandingPage')
      expect(appContent).toContain('PolicyUpload')
      expect(appContent).toContain('PolicyDashboard')
      expect(appContent).toContain('Settings')
      expect(appContent).toContain('MyAccount')
    })

    it('has Suspense wrapper for lazy components', async () => {
      const appPath = path.resolve(__dirname, '../../App.tsx')
      const appContent = fs.readFileSync(appPath, 'utf-8')

      expect(appContent).toContain('<Suspense')
      expect(appContent).toContain('fallback={<PageLoader')
    })
  })

  describe('Resource Hints', () => {
    it('has preconnect hints in index.html', async () => {
      const indexPath = path.resolve(__dirname, '../../../index.html')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Check preconnect hints
      expect(indexContent).toContain('rel="preconnect"')
      expect(indexContent).toContain('fonts.googleapis.com')
      expect(indexContent).toContain('fonts.gstatic.com')
    })

    it('has dns-prefetch hints for external domains', async () => {
      const indexPath = path.resolve(__dirname, '../../../index.html')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      expect(indexContent).toContain('rel="dns-prefetch"')
      expect(indexContent).toContain('supabase.co')
      expect(indexContent).toContain('unpkg.com')
    })

    it('has font preloading configured', async () => {
      const indexPath = path.resolve(__dirname, '../../../index.html')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      expect(indexContent).toContain('rel="preload"')
      expect(indexContent).toContain('as="font"')
      expect(indexContent).toContain('type="font/woff2"')
    })
  })

  describe('Critical CSS', () => {
    it('has inline critical CSS in index.html', async () => {
      const indexPath = path.resolve(__dirname, '../../../index.html')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      // Check for inline styles
      expect(indexContent).toContain('<style>')
      expect(indexContent).toContain('#root:empty::before')
      expect(indexContent).toContain('@keyframes spin')
    })

    it('has fallback font-family defined', async () => {
      const indexPath = path.resolve(__dirname, '../../../index.html')
      const indexContent = fs.readFileSync(indexPath, 'utf-8')

      expect(indexContent).toContain('font-family: Inter')
      expect(indexContent).toContain('BlinkMacSystemFont')
      expect(indexContent).toContain('sans-serif')
    })
  })

  describe('Service Worker', () => {
    it('has service worker file', async () => {
      const swPath = path.resolve(__dirname, '../../../public/sw.js')
      expect(fs.existsSync(swPath)).toBe(true)
    })

    it('has service worker with caching strategies', async () => {
      const swPath = path.resolve(__dirname, '../../../public/sw.js')
      const swContent = fs.readFileSync(swPath, 'utf-8')

      expect(swContent).toContain('CACHE_VERSION')
      expect(swContent).toContain('STATIC_CACHE')
      expect(swContent).toContain('DYNAMIC_CACHE')
      expect(swContent).toContain('API_CACHE')
    })

    it('has cache-first strategy for static assets', async () => {
      const swPath = path.resolve(__dirname, '../../../public/sw.js')
      const swContent = fs.readFileSync(swPath, 'utf-8')

      expect(swContent).toContain('cacheFirst')
      expect(swContent).toContain('isStaticAsset')
    })

    it('has network-first strategy for API calls', async () => {
      const swPath = path.resolve(__dirname, '../../../public/sw.js')
      const swContent = fs.readFileSync(swPath, 'utf-8')

      expect(swContent).toContain('networkFirst')
      expect(swContent).toContain('/api/')
    })

    it('has stale-while-revalidate strategy for HTML', async () => {
      const swPath = path.resolve(__dirname, '../../../public/sw.js')
      const swContent = fs.readFileSync(swPath, 'utf-8')

      expect(swContent).toContain('staleWhileRevalidate')
      expect(swContent).toContain('text/html')
    })

    it('has offline fallback page', async () => {
      const swPath = path.resolve(__dirname, '../../../public/sw.js')
      const swContent = fs.readFileSync(swPath, 'utf-8')

      expect(swContent).toContain('/offline.html')
    })
  })

  describe('PWA Configuration', () => {
    it('has PWA module', async () => {
      const pwaPath = path.resolve(__dirname, '../../lib/pwa/index.ts')
      expect(fs.existsSync(pwaPath)).toBe(true)
    })

    it('has PWA initialization in main.tsx', async () => {
      const mainPath = path.resolve(__dirname, '../../main.tsx')
      const mainContent = fs.readFileSync(mainPath, 'utf-8')

      expect(mainContent).toContain('initializePWA')
      expect(mainContent).toContain('import.meta.env.PROD')
    })

    it('has manifest.json configured', async () => {
      const manifestPath = path.resolve(__dirname, '../../../public/manifest.json')
      expect(fs.existsSync(manifestPath)).toBe(true)

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      expect(manifest.name).toBeDefined()
      expect(manifest.short_name).toBeDefined()
      expect(manifest.start_url).toBeDefined()
      expect(manifest.display).toBe('standalone')
    })
  })

  describe('Lighthouse Configuration', () => {
    it('has lighthouse CI config', async () => {
      const configPath = path.resolve(__dirname, '../../../lighthouserc.js')
      expect(fs.existsSync(configPath)).toBe(true)
    })

    it('has FCP threshold configured', async () => {
      const configPath = path.resolve(__dirname, '../../../lighthouserc.js')
      const configContent = fs.readFileSync(configPath, 'utf-8')

      expect(configContent).toContain('first-contentful-paint')
      expect(configContent).toContain('maxNumericValue')
    })

    it('has LCP threshold < 2500ms', async () => {
      const configPath = path.resolve(__dirname, '../../../lighthouserc.js')
      const configContent = fs.readFileSync(configPath, 'utf-8')

      expect(configContent).toContain('largest-contentful-paint')
      expect(configContent).toContain('2500')
    })

    it('has CLS threshold < 0.1', async () => {
      const configPath = path.resolve(__dirname, '../../../lighthouserc.js')
      const configContent = fs.readFileSync(configPath, 'utf-8')

      expect(configContent).toContain('cumulative-layout-shift')
      expect(configContent).toContain('0.1')
    })

    it('requires 80% performance score minimum', async () => {
      const configPath = path.resolve(__dirname, '../../../lighthouserc.js')
      const configContent = fs.readFileSync(configPath, 'utf-8')

      expect(configContent).toContain('categories:performance')
      expect(configContent).toContain('minScore: 0.8')
    })
  })

  describe('Web Vitals Monitoring', () => {
    it('has web-vitals package', async () => {
      const packagePath = path.resolve(__dirname, '../../../package.json')
      const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))

      expect(packageContent.dependencies['web-vitals']).toBeDefined()
    })

    it('has performance monitoring initialized', async () => {
      const mainPath = path.resolve(__dirname, '../../main.tsx')
      const mainContent = fs.readFileSync(mainPath, 'utf-8')

      expect(mainContent).toContain('initWebVitals')
    })
  })
})

describe('Bundle Size Expectations', () => {
  it('has chunk size warning limit configured', async () => {
    const configPath = path.resolve(__dirname, '../../../vite.config.ts')
    const configContent = fs.readFileSync(configPath, 'utf-8')

    expect(configContent).toContain('chunkSizeWarningLimit')
    expect(configContent).toContain('600')
  })

  it('separates large dependencies into vendor chunks', async () => {
    const configPath = path.resolve(__dirname, '../../../vite.config.ts')
    const configContent = fs.readFileSync(configPath, 'utf-8')

    // These large dependencies should be in separate chunks
    const largeVendors = [
      'framer-motion',
      'pdfjs-dist',
      'openai',
      '@anthropic-ai/sdk',
      '@supabase/supabase-js',
    ]

    for (const vendor of largeVendors) {
      expect(configContent).toContain(vendor)
    }
  })
})

describe('Image Optimization', () => {
  it('uses SVG for icon', async () => {
    const indexPath = path.resolve(__dirname, '../../../index.html')
    const indexContent = fs.readFileSync(indexPath, 'utf-8')

    expect(indexContent).toContain('type="image/svg+xml"')
  })
})

describe('Script Loading', () => {
  it('uses module type for main script', async () => {
    const indexPath = path.resolve(__dirname, '../../../index.html')
    const indexContent = fs.readFileSync(indexPath, 'utf-8')

    expect(indexContent).toContain('type="module"')
    expect(indexContent).toContain('src="/src/main.tsx"')
  })
})
