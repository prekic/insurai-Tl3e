/**
 * Environment Configuration Tests
 *
 * Tests for environment variable parsing, validation, and warning generation utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getEnvConfig,
  getEnvWarnings,
  isProductionReady,
  validateEnvironment,
  env,
} from './env'

describe('Environment Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getEnvConfig', () => {
    it('should be a callable function', () => {
      expect(typeof getEnvConfig).toBe('function')
    })

    it('should return an object', () => {
      const config = getEnvConfig()
      expect(typeof config).toBe('object')
      expect(config).not.toBeNull()
    })

    it('should have Supabase configuration fields', () => {
      const config = getEnvConfig()
      expect('supabaseUrl' in config).toBe(true)
      expect('supabaseAnonKey' in config).toBe(true)
      expect('isSupabaseConfigured' in config).toBe(true)
    })

    it('should have AI provider fields', () => {
      const config = getEnvConfig()
      expect('openaiKey' in config).toBe(true)
      expect('anthropicKey' in config).toBe(true)
      expect('googleCloudKey' in config).toBe(true)
      expect('isAIConfigured' in config).toBe(true)
    })

    it('should have environment mode fields', () => {
      const config = getEnvConfig()
      expect('isDevelopment' in config).toBe(true)
      expect('isProduction' in config).toBe(true)
      expect('appUrl' in config).toBe(true)
    })

    it('should return consistent results', () => {
      const config1 = getEnvConfig()
      const config2 = getEnvConfig()
      expect(config1).toEqual(config2)
    })
  })

  describe('getEnvWarnings', () => {
    it('should be a callable function', () => {
      expect(typeof getEnvWarnings).toBe('function')
    })

    it('should return an array', () => {
      const warnings = getEnvWarnings()
      expect(Array.isArray(warnings)).toBe(true)
    })

    it('should have proper warning structure', () => {
      const warnings = getEnvWarnings()
      warnings.forEach((warning) => {
        expect('level' in warning).toBe(true)
        expect('message' in warning).toBe(true)
        expect(['info', 'warning', 'error']).toContain(warning.level)
      })
    })

    it('should return consistent results', () => {
      const warnings1 = getEnvWarnings()
      const warnings2 = getEnvWarnings()
      expect(warnings1).toEqual(warnings2)
    })
  })

  describe('isProductionReady', () => {
    it('should be a callable function', () => {
      expect(typeof isProductionReady).toBe('function')
    })

    it('should return a boolean', () => {
      const result = isProductionReady()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('validateEnvironment', () => {
    it('should be a callable function', () => {
      expect(typeof validateEnvironment).toBe('function')
    })

    it('should not throw', () => {
      expect(() => validateEnvironment()).not.toThrow()
    })
  })

  describe('env export', () => {
    it('should have isDev property', () => {
      expect('isDev' in env).toBe(true)
      expect(typeof env.isDev).toBe('boolean')
    })

    it('should have isProd property', () => {
      expect('isProd' in env).toBe(true)
      expect(typeof env.isProd).toBe('boolean')
    })

    it('should have hasSupabase property', () => {
      expect('hasSupabase' in env).toBe(true)
      expect(typeof env.hasSupabase).toBe('boolean')
    })

    it('should have hasAI property', () => {
      expect('hasAI' in env).toBe(true)
      expect(typeof env.hasAI).toBe('boolean')
    })

    it('should have hasProxy property', () => {
      expect('hasProxy' in env).toBe(true)
      expect(typeof env.hasProxy).toBe('boolean')
    })

    it('should have proxyUrl property', () => {
      expect('proxyUrl' in env).toBe(true)
    })

    it('should have config property', () => {
      expect('config' in env).toBe(true)
      expect(typeof env.config).toBe('object')
    })

    it('should have warnings property', () => {
      expect('warnings' in env).toBe(true)
      expect(Array.isArray(env.warnings)).toBe(true)
    })
  })

  describe('API key validation logic', () => {
    it('should reject placeholder keys', () => {
      const isValidKey = (key: string | null, prefix: string): boolean => {
        if (!key) return false
        if (key === `${prefix}...`) return false
        if (key.length < 20) return false
        return true
      }

      expect(isValidKey('sk-...', 'sk-')).toBe(false)
      expect(isValidKey('sk-ant-...', 'sk-ant-')).toBe(false)
    })

    it('should reject short keys', () => {
      const isValidKey = (key: string | null, prefix: string): boolean => {
        if (!key) return false
        if (key === `${prefix}...`) return false
        if (key.length < 20) return false
        return true
      }

      expect(isValidKey('sk-short', 'sk-')).toBe(false)
      expect(isValidKey('sk-ant-sh', 'sk-ant-')).toBe(false)
    })

    it('should accept valid length keys', () => {
      const isValidKey = (key: string | null, prefix: string): boolean => {
        if (!key) return false
        if (key === `${prefix}...`) return false
        if (key.length < 20) return false
        return true
      }

      expect(isValidKey('sk-12345678901234567890', 'sk-')).toBe(true)
      expect(isValidKey('sk-ant-12345678901234567890', 'sk-ant-')).toBe(true)
    })

    it('should reject null keys', () => {
      const isValidKey = (key: string | null, prefix: string): boolean => {
        if (!key) return false
        if (key === `${prefix}...`) return false
        if (key.length < 20) return false
        return true
      }

      expect(isValidKey(null, 'sk-')).toBe(false)
    })
  })

  describe('warning generation logic', () => {
    interface EnvConfig {
      isSupabaseConfigured: boolean
      isAIConfigured: boolean
      openaiKey: string | null
      anthropicKey: string | null
      googleCloudKey: string | null
      isProduction: boolean
    }

    interface EnvWarning {
      level: 'info' | 'warning' | 'error'
      message: string
      suggestion?: string
    }

    const generateWarnings = (config: EnvConfig): EnvWarning[] => {
      const warnings: EnvWarning[] = []

      if (!config.isSupabaseConfigured) {
        warnings.push({
          level: 'info',
          message: 'Supabase not configured - using local storage',
        })
      }

      if (!config.isAIConfigured) {
        warnings.push({
          level: 'warning',
          message: 'No AI provider configured - using demo mode',
        })
      } else if (!config.openaiKey) {
        warnings.push({
          level: 'info',
          message: 'OpenAI not configured - using Anthropic only',
        })
      } else if (!config.anthropicKey) {
        warnings.push({
          level: 'info',
          message: 'Anthropic not configured - multi-model consensus unavailable',
        })
      }

      if (!config.googleCloudKey) {
        warnings.push({
          level: 'info',
          message: 'Google Cloud not configured - OCR unavailable',
        })
      }

      if (config.isProduction && !config.isSupabaseConfigured) {
        warnings.push({
          level: 'error',
          message: 'Production build without Supabase',
        })
      }

      return warnings
    }

    it('should warn when Supabase is not configured', () => {
      const warnings = generateWarnings({
        isSupabaseConfigured: false,
        isAIConfigured: true,
        openaiKey: 'key',
        anthropicKey: 'key',
        googleCloudKey: 'key',
        isProduction: false,
      })

      expect(warnings).toContainEqual(
        expect.objectContaining({
          level: 'info',
          message: expect.stringContaining('Supabase not configured'),
        })
      )
    })

    it('should warn when AI is not configured', () => {
      const warnings = generateWarnings({
        isSupabaseConfigured: true,
        isAIConfigured: false,
        openaiKey: null,
        anthropicKey: null,
        googleCloudKey: 'key',
        isProduction: false,
      })

      expect(warnings).toContainEqual(
        expect.objectContaining({
          level: 'warning',
          message: expect.stringContaining('No AI provider configured'),
        })
      )
    })

    it('should warn when only OpenAI is configured', () => {
      const warnings = generateWarnings({
        isSupabaseConfigured: true,
        isAIConfigured: true,
        openaiKey: 'key',
        anthropicKey: null,
        googleCloudKey: 'key',
        isProduction: false,
      })

      expect(warnings).toContainEqual(
        expect.objectContaining({
          level: 'info',
          message: expect.stringContaining('Anthropic not configured'),
        })
      )
    })

    it('should warn when only Anthropic is configured', () => {
      const warnings = generateWarnings({
        isSupabaseConfigured: true,
        isAIConfigured: true,
        openaiKey: null,
        anthropicKey: 'key',
        googleCloudKey: 'key',
        isProduction: false,
      })

      expect(warnings).toContainEqual(
        expect.objectContaining({
          level: 'info',
          message: expect.stringContaining('OpenAI not configured'),
        })
      )
    })

    it('should error in production without Supabase', () => {
      const warnings = generateWarnings({
        isSupabaseConfigured: false,
        isAIConfigured: true,
        openaiKey: 'key',
        anthropicKey: 'key',
        googleCloudKey: 'key',
        isProduction: true,
      })

      expect(warnings).toContainEqual(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('Production build without Supabase'),
        })
      )
    })
  })

  describe('production readiness logic', () => {
    it('should not be ready in development', () => {
      const isReady = (isProd: boolean, hasSupabase: boolean, hasAI: boolean) =>
        isProd && hasSupabase && hasAI

      expect(isReady(false, true, true)).toBe(false)
    })

    it('should be ready with all requirements', () => {
      const isReady = (isProd: boolean, hasSupabase: boolean, hasAI: boolean) =>
        isProd && hasSupabase && hasAI

      expect(isReady(true, true, true)).toBe(true)
    })

    it('should not be ready without AI', () => {
      const isReady = (isProd: boolean, hasSupabase: boolean, hasAI: boolean) =>
        isProd && hasSupabase && hasAI

      expect(isReady(true, true, false)).toBe(false)
    })

    it('should not be ready without Supabase', () => {
      const isReady = (isProd: boolean, hasSupabase: boolean, hasAI: boolean) =>
        isProd && hasSupabase && hasAI

      expect(isReady(true, false, true)).toBe(false)
    })
  })

  describe('consensus availability', () => {
    it('should require both OpenAI and Anthropic for consensus', () => {
      const hasConsensus = (openaiKey: string | null, anthropicKey: string | null) =>
        !!(openaiKey && anthropicKey)

      expect(hasConsensus('key1', 'key2')).toBe(true)
      expect(hasConsensus('key1', null)).toBe(false)
      expect(hasConsensus(null, 'key2')).toBe(false)
      expect(hasConsensus(null, null)).toBe(false)
    })
  })

  describe('default app URL', () => {
    it('should use localhost in development', () => {
      const getAppUrl = (configuredUrl: string | undefined, isDev: boolean) =>
        configuredUrl || (isDev ? 'http://localhost:5173' : '')

      expect(getAppUrl(undefined, true)).toBe('http://localhost:5173')
      expect(getAppUrl(undefined, false)).toBe('')
    })

    it('should use configured URL when provided', () => {
      const getAppUrl = (configuredUrl: string | undefined, isDev: boolean) =>
        configuredUrl || (isDev ? 'http://localhost:5173' : '')

      expect(getAppUrl('https://app.example.com', true)).toBe('https://app.example.com')
      expect(getAppUrl('https://app.example.com', false)).toBe('https://app.example.com')
    })
  })
})
