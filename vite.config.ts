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
  },
})
