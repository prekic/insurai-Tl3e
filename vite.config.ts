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
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // React core
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router')) {
            return 'vendor-react'
          }
          // Animation library
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-animation'
          }
          // PDF.js for parsing (large dependency)
          if (id.includes('node_modules/pdfjs-dist')) {
            return 'vendor-pdfjs'
          }
          // PDF-lib for splitting (separate chunk)
          if (id.includes('node_modules/pdf-lib')) {
            return 'vendor-pdflib'
          }
          // OpenAI SDK - separate from Anthropic
          if (id.includes('node_modules/openai')) {
            return 'vendor-openai'
          }
          // Anthropic SDK - separate chunk
          if (id.includes('node_modules/@anthropic-ai')) {
            return 'vendor-anthropic'
          }
          // UI utilities
          if (id.includes('node_modules/sonner') ||
              id.includes('node_modules/lucide-react') ||
              id.includes('node_modules/clsx') ||
              id.includes('node_modules/tailwind-merge')) {
            return 'vendor-ui'
          }
          // Supabase
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase'
          }
          // Sentry
          if (id.includes('node_modules/@sentry')) {
            return 'vendor-sentry'
          }
          // Other large node_modules go to common vendor
          if (id.includes('node_modules')) {
            return 'vendor-common'
          }
        },
      },
    },
    // Increase warning limit slightly since we're now properly chunking
    chunkSizeWarningLimit: 600,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['node_modules', 'e2e', 'dist'],
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
