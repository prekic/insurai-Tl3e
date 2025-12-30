/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Animation library
          'vendor-animation': ['framer-motion'],

          // PDF parsing (large dependency)
          'vendor-pdf': ['pdfjs-dist'],

          // AI SDKs
          'vendor-ai': ['openai', '@anthropic-ai/sdk'],

          // UI utilities
          'vendor-ui': ['sonner', 'lucide-react', 'clsx', 'tailwind-merge'],

          // Supabase
          'vendor-supabase': ['@supabase/supabase-js'],
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
