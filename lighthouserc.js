/**
 * Lighthouse CI Configuration
 *
 * Automated performance scoring for insurai
 * Run with: npm run lighthouse
 *
 * Thresholds based on Core Web Vitals standards:
 * - Performance: 90+ (good), 50-89 (needs improvement), <50 (poor)
 * - Accessibility: 90+ required
 * - Best Practices: 90+ required
 * - SEO: 90+ required
 */
module.exports = {
  ci: {
    collect: {
      // Use static server for built assets
      staticDistDir: './dist',
      // Number of runs for statistical accuracy
      numberOfRuns: 3,
      // URLs to test
      url: [
        'http://localhost:5173/',
        'http://localhost:5173/dashboard',
        'http://localhost:5173/upload',
      ],
      // Chrome flags for consistent results
      settings: {
        chromeFlags: '--no-sandbox --disable-gpu --disable-dev-shm-usage',
        // Throttling settings (simulate mobile)
        throttlingMethod: 'simulate',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
        },
        // Form factor
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
      },
    },
    assert: {
      // Performance budgets and assertions
      assertions: {
        // Core Web Vitals
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],

        // Category scores (0-1 scale)
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],

        // Resource hints
        'uses-rel-preconnect': 'warn',
        'uses-rel-preload': 'off',

        // Performance optimizations
        'unminified-css': 'error',
        'unminified-javascript': 'error',
        'unused-css-rules': 'warn',
        'unused-javascript': 'warn',
        'modern-image-formats': 'warn',
        'uses-responsive-images': 'warn',
        'offscreen-images': 'warn',
        'render-blocking-resources': 'warn',

        // Accessibility checks
        'color-contrast': 'error',
        'image-alt': 'error',
        'label': 'error',
        'link-name': 'error',
        'button-name': 'error',
        'html-has-lang': 'error',
        'meta-viewport': 'error',

        // Best practices
        'errors-in-console': 'warn',
        'deprecations': 'warn',
        'doctype': 'error',
        'charset': 'error',
        'inspector-issues': 'warn',

        // SEO
        'document-title': 'error',
        'meta-description': 'warn',
        'http-status-code': 'error',
        'is-crawlable': 'error',
        'robots-txt': 'off', // Not applicable in dev
      },
    },
    upload: {
      // Upload to temporary public storage (for CI)
      target: 'temporary-public-storage',
    },
  },
}
