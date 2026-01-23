import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@insurai/types': path.resolve(__dirname, '../packages/types/src/index.ts'),
      '@insurai/rule-packs': path.resolve(__dirname, '../packages/rule-packs/src/index.ts'),
    },
  },
})
