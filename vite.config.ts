/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle visualizer - generates stats.html after build
    // Run: ANALYZE=true npm run build && open stats.html
    ...(process.env.ANALYZE === 'true'
      ? [
        visualizer({
          filename: 'stats.html',
          open: true,
          gzipSize: true,
          brotliSize: true,
          template: 'treemap', // 'treemap', 'sunburst', 'network'
        }),
      ]
      : []),
    // Sentry source map upload (only when auth token is configured)
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG || 'insurai',
          project: process.env.SENTRY_PROJECT || 'insurai-web',
          authToken: process.env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            assets: './dist/**',
          },
          // Only upload in production builds
          disable: process.env.NODE_ENV !== 'production',
        }),
      ]
      : []),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    // Generate hidden source maps for Sentry error tracking
    // 'hidden' means maps are generated and uploaded to Sentry but not referenced in bundles
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Only split out large, independent libraries to avoid circular deps
          // PDF.js for parsing (large, independent)
          if (id.includes('node_modules/pdfjs-dist')) {
            return 'vendor-pdfjs'
          }
          // PDF-lib for splitting (large, independent)
          if (id.includes('node_modules/pdf-lib')) {
            return 'vendor-pdflib'
          }
          // Let Vite handle the rest automatically to avoid initialization errors
        },
      },
    },
    // Increase warning limit for larger chunks
    chunkSizeWarningLimit: 800,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    testTimeout: 10000,
    exclude: ['node_modules', 'e2e', 'dist', 'services'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/index.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // Coverage thresholds - adjust as coverage improves
      thresholds: {
        statements: 20,
        branches: 60,
        functions: 50,
        lines: 20,
      },
    },
  },
})
