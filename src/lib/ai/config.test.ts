import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted mocks — variables used inside vi.mock() factories
// ---------------------------------------------------------------------------
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    hasProxy: false,
    proxyUrl: null as string | null,
    hasAI: false,
    isDev: true,
    isProd: false,
    hasSupabase: false,
    config: {},
    warnings: [],
  },
}))

// ---------------------------------------------------------------------------
// Mock @/lib/env — the default export is read at module import time in config.ts
// ---------------------------------------------------------------------------
vi.mock('@/lib/env', () => ({
  default: mockEnv,
  env: mockEnv,
}))

// ---------------------------------------------------------------------------
// Mock dynamic imports for OpenAI and Anthropic SDKs
// ---------------------------------------------------------------------------
const mockOpenAIInstance = { chat: { completions: { create: vi.fn() } } }
const mockAnthropicInstance = { messages: { create: vi.fn() } }

vi.mock('openai', () => ({
  default: function OpenAI() {
    return mockOpenAIInstance
  },
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: function Anthropic() {
    return mockAnthropicInstance
  },
}))

// ---------------------------------------------------------------------------
// Module under test — import AFTER mocks are set up
// ---------------------------------------------------------------------------
import {
  isProxyConfigured,
  getProxyUrl,
  checkProxyProviders,
  isProviderConfigured,
  isAIConfigured,
  isOCRConfigured,
  getConfiguredProviders,
  getOpenAIClient,
  getAnthropicClient,
  getGoogleCloudApiKey,
  extractViaProxy,
  extractWithFallback,
  ocrViaProxy,
  AI_CONFIG,
} from './config'
import type { AIProvider, ConsensusField } from './config'

// ---------------------------------------------------------------------------
// localStorage mock using a simple Map
// ---------------------------------------------------------------------------
let store: Map<string, string>

function setupLocalStorageMock() {
  store = new Map()
  const mockStorage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get length() {
      return store.size
    },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Helper to reset module-level cached SDK instances
// ---------------------------------------------------------------------------
// The cached openai/anthropic clients are module-level lets; we need
// to re-import the module to reset them. We use vi.resetModules() and
// dynamic import for tests that need fresh state.
async function freshImport() {
  vi.resetModules()
  return (await import('./config')) as typeof import('./config')
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('AI Config (config.ts)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    setupLocalStorageMock()

    // Default: no proxy configured
    mockEnv.hasProxy = false
    mockEnv.proxyUrl = null
    mockEnv.hasAI = false
    mockEnv.isDev = true
    mockEnv.isProd = false
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // =========================================================================
  // AI_CONFIG static values
  // =========================================================================
  describe('AI_CONFIG', () => {
    it('should have correct OpenAI model configuration', () => {
      expect(AI_CONFIG.openai.extractionModel).toBe('gpt-4o')
      expect(AI_CONFIG.openai.backupModel).toBe('gpt-4o-mini')
    })

    it('should have correct Anthropic model configuration', () => {
      expect(AI_CONFIG.anthropic.extractionModel).toBe('claude-sonnet-4-20250514')
      expect(AI_CONFIG.anthropic.backupModel).toBe('claude-3-5-haiku-20241022')
    })

    it('should have correct extraction settings', () => {
      expect(AI_CONFIG.maxTokens).toBe(4096)
      expect(AI_CONFIG.temperature).toBe(0.1)
      expect(AI_CONFIG.minConfidence).toBe(0.4)
      expect(AI_CONFIG.warningConfidence).toBe(0.7)
    })

    it('should have correct consensus settings', () => {
      expect(AI_CONFIG.consensus.enabled).toBe(true)
      expect(AI_CONFIG.consensus.agreementThreshold).toBe(0.8)
      expect(AI_CONFIG.consensus.consensusFields).toEqual([
        'policyNumber',
        'provider',
        'premium',
        'startDate',
        'endDate',
      ])
    })

    it('should be readonly (frozen by as const)', () => {
      // as const makes properties readonly; verify types exist
      const model: string = AI_CONFIG.openai.extractionModel
      expect(model).toBe('gpt-4o')
    })
  })

  // =========================================================================
  // Type exports
  // =========================================================================
  describe('type exports', () => {
    it('should export AIProvider type', () => {
      const provider: AIProvider = 'openai'
      expect(provider).toBe('openai')
      const provider2: AIProvider = 'anthropic'
      expect(provider2).toBe('anthropic')
    })

    it('should export ConsensusField type', () => {
      const field: ConsensusField = 'policyNumber'
      expect(field).toBe('policyNumber')
    })
  })

  // =========================================================================
  // isProxyConfigured / getProxyUrl
  // =========================================================================
  describe('isProxyConfigured', () => {
    it('should return false when env.hasProxy is false', () => {
      mockEnv.hasProxy = false
      expect(isProxyConfigured()).toBe(false)
    })

    it('should return true when env.hasProxy is true', () => {
      mockEnv.hasProxy = true
      expect(isProxyConfigured()).toBe(true)
    })
  })

  describe('getProxyUrl', () => {
    it('should return null when env.proxyUrl is null', () => {
      mockEnv.proxyUrl = null
      expect(getProxyUrl()).toBeNull()
    })

    it('should return the proxy URL string when set', () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      expect(getProxyUrl()).toBe('http://localhost:4001')
    })
  })

  // =========================================================================
  // checkProxyProviders
  // =========================================================================
  describe('checkProxyProviders', () => {
    it('should return null when proxy is not configured', async () => {
      mockEnv.proxyUrl = null
      const result = await checkProxyProviders()
      expect(result).toBeNull()
    })

    it('should fetch providers from proxy and return result', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      const providerData = { openai: true, anthropic: true, google: false }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => providerData,
      })

      const result = await checkProxyProviders()
      expect(result).toEqual(providerData)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/providers',
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      )
    })

    it('should return null when fetch response is not ok', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
      const result = await checkProxyProviders()
      expect(result).toBeNull()
    })

    it('should return null when fetch throws a network error', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'))
      const result = await checkProxyProviders()
      expect(result).toBeNull()
    })
  })

  // =========================================================================
  // getApiKey (tested through isProviderConfigured & client getters)
  // =========================================================================
  describe('isProviderConfigured', () => {
    describe('when proxy is configured', () => {
      beforeEach(() => {
        mockEnv.hasProxy = true
      })

      it('should return true for openai when proxy is configured', () => {
        expect(isProviderConfigured('openai')).toBe(true)
      })

      it('should return true for anthropic when proxy is configured', () => {
        expect(isProviderConfigured('anthropic')).toBe(true)
      })

      it('should return true for google when proxy is configured', () => {
        expect(isProviderConfigured('google')).toBe(true)
      })

      it('should return false for unknown provider even when proxy is configured', () => {
        // @ts-expect-error Testing invalid provider
        expect(isProviderConfigured('unknown')).toBe(false)
      })
    })

    describe('when proxy is NOT configured (direct key mode)', () => {
      beforeEach(() => {
        mockEnv.hasProxy = false
      })

      it('should return false for openai when no key is available', () => {
        expect(isProviderConfigured('openai')).toBe(false)
      })

      it('should return true for openai when key is in localStorage', () => {
        store.set('insurai_openai_key', 'sk-proj-real-key-1234567890')
        expect(isProviderConfigured('openai')).toBe(true)
      })

      it('should return false for anthropic when no key is available', () => {
        expect(isProviderConfigured('anthropic')).toBe(false)
      })

      it('should return true for anthropic when key is in localStorage', () => {
        store.set('insurai_anthropic_key', 'sk-ant-real-key-1234567890')
        expect(isProviderConfigured('anthropic')).toBe(true)
      })

      it('should return false for google when no key is available', () => {
        expect(isProviderConfigured('google')).toBe(false)
      })

      it('should return true for google when key is in localStorage', () => {
        store.set('insurai_google_cloud_key', 'AIzaSy-valid-key-123')
        expect(isProviderConfigured('google')).toBe(true)
      })

      it('should return false for unknown/invalid provider name', () => {
        // @ts-expect-error Testing invalid provider
        expect(isProviderConfigured('gpt')).toBe(false)
        // @ts-expect-error Testing invalid provider
        expect(isProviderConfigured('')).toBe(false)
      })

      it('should reject placeholder key "sk-..." in localStorage', () => {
        store.set('insurai_openai_key', 'sk-...')
        expect(isProviderConfigured('openai')).toBe(false)
      })

      it('should reject placeholder key "sk-ant-..." in localStorage', () => {
        store.set('insurai_anthropic_key', 'sk-ant-...')
        expect(isProviderConfigured('anthropic')).toBe(false)
      })

      it('should handle localStorage throwing an error gracefully', () => {
        // Simulate localStorage being unavailable (e.g., in SSR)
        const mockStorage = {
          getItem: vi.fn(() => {
            throw new Error('localStorage not available')
          }),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn(),
          length: 0,
          key: vi.fn(),
        }
        Object.defineProperty(globalThis, 'localStorage', {
          value: mockStorage,
          writable: true,
          configurable: true,
        })
        // No env var set, localStorage throws => should return false
        expect(isProviderConfigured('openai')).toBe(false)
      })
    })
  })

  // =========================================================================
  // isAIConfigured
  // =========================================================================
  describe('isAIConfigured', () => {
    it('should return true when proxy is configured', () => {
      mockEnv.hasProxy = true
      expect(isAIConfigured()).toBe(true)
    })

    it('should return false when no proxy and no keys', () => {
      mockEnv.hasProxy = false
      expect(isAIConfigured()).toBe(false)
    })

    it('should return true when openai key is available (no proxy)', () => {
      mockEnv.hasProxy = false
      store.set('insurai_openai_key', 'sk-valid-key-abcdef1234567890')
      expect(isAIConfigured()).toBe(true)
    })

    it('should return true when anthropic key is available (no proxy)', () => {
      mockEnv.hasProxy = false
      store.set('insurai_anthropic_key', 'sk-ant-valid-key-abcdef1234567890')
      expect(isAIConfigured()).toBe(true)
    })

    it('should return false when only google key is available (no proxy)', () => {
      // isAIConfigured only checks openai + anthropic, not google
      mockEnv.hasProxy = false
      store.set('insurai_google_cloud_key', 'AIzaSy-valid-key-123')
      expect(isAIConfigured()).toBe(false)
    })
  })

  // =========================================================================
  // isOCRConfigured
  // =========================================================================
  describe('isOCRConfigured', () => {
    it('should return true when proxy is configured', () => {
      mockEnv.hasProxy = true
      expect(isOCRConfigured()).toBe(true)
    })

    it('should return false when no proxy and no google key', () => {
      mockEnv.hasProxy = false
      expect(isOCRConfigured()).toBe(false)
    })

    it('should return true when google key is in localStorage (no proxy)', () => {
      mockEnv.hasProxy = false
      store.set('insurai_google_cloud_key', 'AIzaSy-valid-key-12345')
      expect(isOCRConfigured()).toBe(true)
    })
  })

  // =========================================================================
  // getConfiguredProviders
  // =========================================================================
  describe('getConfiguredProviders', () => {
    it('should return both providers when proxy is configured', () => {
      mockEnv.hasProxy = true
      const providers = getConfiguredProviders()
      expect(providers).toEqual(['openai', 'anthropic'])
    })

    it('should return empty array when nothing is configured', () => {
      mockEnv.hasProxy = false
      const providers = getConfiguredProviders()
      expect(providers).toEqual([])
    })

    it('should return only openai when only openai key is present', () => {
      mockEnv.hasProxy = false
      store.set('insurai_openai_key', 'sk-valid-key-1234567890abcdef')
      const providers = getConfiguredProviders()
      expect(providers).toEqual(['openai'])
    })

    it('should return only anthropic when only anthropic key is present', () => {
      mockEnv.hasProxy = false
      store.set('insurai_anthropic_key', 'sk-ant-valid-key-1234567890abcdef')
      const providers = getConfiguredProviders()
      expect(providers).toEqual(['anthropic'])
    })

    it('should return both when both keys are present (no proxy)', () => {
      mockEnv.hasProxy = false
      store.set('insurai_openai_key', 'sk-valid-key-1234567890abcdef')
      store.set('insurai_anthropic_key', 'sk-ant-valid-key-1234567890abcdef')
      const providers = getConfiguredProviders()
      expect(providers).toEqual(['openai', 'anthropic'])
    })

    it('should always return an array', () => {
      expect(Array.isArray(getConfiguredProviders())).toBe(true)
    })
  })

  // =========================================================================
  // getOpenAIClient
  // =========================================================================
  describe('getOpenAIClient', () => {
    it('should return null and warn when proxy is configured', async () => {
      mockEnv.hasProxy = true
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const client = await getOpenAIClient()
      expect(client).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        'OpenAI client requested but proxy is configured. Use extractViaProxy() instead.'
      )
      warnSpy.mockRestore()
    })

    it('should return null when no API key is available', async () => {
      mockEnv.hasProxy = false
      const client = await getOpenAIClient()
      expect(client).toBeNull()
    })

    it('should create and return OpenAI client when key is available', async () => {
      mockEnv.hasProxy = false
      store.set('insurai_openai_key', 'sk-test-valid-key-1234567890abcdef')
      const mod = await freshImport()
      const client = await mod.getOpenAIClient()
      expect(client).toBe(mockOpenAIInstance)
    })

    it('should return cached client on second call', async () => {
      mockEnv.hasProxy = false
      store.set('insurai_openai_key', 'sk-test-valid-key-1234567890abcdef')
      const mod = await freshImport()
      const client1 = await mod.getOpenAIClient()
      const client2 = await mod.getOpenAIClient()
      expect(client1).toBe(client2)
    })
  })

  // =========================================================================
  // getAnthropicClient
  // =========================================================================
  describe('getAnthropicClient', () => {
    it('should return null and warn when proxy is configured', async () => {
      mockEnv.hasProxy = true
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const client = await getAnthropicClient()
      expect(client).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        'Anthropic client requested but proxy is configured. Use extractViaProxy() instead.'
      )
      warnSpy.mockRestore()
    })

    it('should return null when no API key is available', async () => {
      mockEnv.hasProxy = false
      const client = await getAnthropicClient()
      expect(client).toBeNull()
    })

    it('should create and return Anthropic client when key is available', async () => {
      mockEnv.hasProxy = false
      store.set('insurai_anthropic_key', 'sk-ant-test-valid-key-1234567890abcdef')
      const mod = await freshImport()
      const client = await mod.getAnthropicClient()
      expect(client).toBe(mockAnthropicInstance)
    })

    it('should return cached client on second call', async () => {
      mockEnv.hasProxy = false
      store.set('insurai_anthropic_key', 'sk-ant-test-valid-key-1234567890abcdef')
      const mod = await freshImport()
      const client1 = await mod.getAnthropicClient()
      const client2 = await mod.getAnthropicClient()
      expect(client1).toBe(client2)
    })
  })

  // =========================================================================
  // getGoogleCloudApiKey
  // =========================================================================
  describe('getGoogleCloudApiKey', () => {
    it('should return null and warn when proxy is configured', () => {
      mockEnv.hasProxy = true
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const key = getGoogleCloudApiKey()
      expect(key).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        'Google Cloud API key requested but proxy is configured. Use ocrViaProxy() instead.'
      )
      warnSpy.mockRestore()
    })

    it('should return null when no key is available and no proxy', () => {
      mockEnv.hasProxy = false
      expect(getGoogleCloudApiKey()).toBeNull()
    })

    it('should return key from localStorage when available', () => {
      mockEnv.hasProxy = false
      store.set('insurai_google_cloud_key', 'AIzaSy-my-valid-key-123')
      expect(getGoogleCloudApiKey()).toBe('AIzaSy-my-valid-key-123')
    })

    it('should reject placeholder key', () => {
      mockEnv.hasProxy = false
      store.set('insurai_google_cloud_key', 'sk-...')
      expect(getGoogleCloudApiKey()).toBeNull()
    })

    it('should reject sk-ant-... placeholder key', () => {
      mockEnv.hasProxy = false
      store.set('insurai_google_cloud_key', 'sk-ant-...')
      expect(getGoogleCloudApiKey()).toBeNull()
    })
  })

  // =========================================================================
  // extractViaProxy
  // =========================================================================
  describe('extractViaProxy', () => {
    it('should return error when proxy is not configured', async () => {
      mockEnv.proxyUrl = null
      const result = await extractViaProxy('openai', 'doc text', 'prompt')
      expect(result).toEqual({ success: false, error: 'Proxy not configured' })
    })

    it('should call unified extract endpoint and return success', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      const serverResponse = {
        success: true,
        data: { policyNumber: 'POL-001', provider: 'Allianz' },
        provider: 'anthropic',
        fallback: false,
        usage: { input_tokens: 500, output_tokens: 200 },
        requestId: 'req-123',
        route: 'unified',
        fallbackChain: [{ provider: 'anthropic', success: true, duration_ms: 1500 }],
      }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => serverResponse,
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await extractViaProxy('anthropic', 'document text', 'system prompt')
      warnSpy.mockRestore()

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ policyNumber: 'POL-001', provider: 'Allianz' })
      expect(result.provider).toBe('anthropic')
      expect(result.fallback).toBe(false)
      expect(result.usage).toEqual({ input_tokens: 500, output_tokens: 200 })
      expect(result.requestId).toBe('req-123')
      expect(result.route).toBe('unified')
      expect(result.fallbackChain).toHaveLength(1)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/extract',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentText: 'document text', systemPrompt: 'system prompt' }),
        }
      )
    })

    it('should include fallbackReason when present in response', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          success: true,
          data: { policyNumber: 'POL-002' },
          provider: 'openai',
          fallback: true,
          fallbackReason: 'Anthropic billing error',
          usage: { input_tokens: 100 },
        }),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await extractViaProxy('anthropic', 'doc', 'prompt')
      warnSpy.mockRestore()

      expect(result.success).toBe(true)
      expect(result.fallbackReason).toBe('Anthropic billing error')
    })

    it('should not include fallbackReason when absent in response', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          success: true,
          data: { policyNumber: 'POL-003' },
          provider: 'anthropic',
          fallback: false,
          usage: {},
        }),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await extractViaProxy('anthropic', 'doc', 'prompt')
      warnSpy.mockRestore()

      expect(result.success).toBe(true)
      expect(result).not.toHaveProperty('fallbackReason')
    })

    it('should handle HTTP error response with details field', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({
          error: 'Extraction failed',
          details: 'Provider returned invalid JSON',
          code: 'EXTRACTION_ERROR',
        }),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()
      errorSpy.mockRestore()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Extraction failed: Provider returned invalid JSON')
    })

    it('should handle HTTP error response without details field', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: 'Rate limit exceeded' }),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()
      errorSpy.mockRestore()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Rate limit exceeded')
    })

    it('should handle HTTP error with no error field in body', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => ({}),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()
      errorSpy.mockRestore()

      expect(result.success).toBe(false)
      expect(result.error).toBe('HTTP 502')
    })

    it('should handle HTTP error with details but no error field', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ details: 'some details' }),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()
      errorSpy.mockRestore()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Server error: some details')
    })

    it('should return error when server returns success but no data', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ success: true }),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()
      errorSpy.mockRestore()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Server returned success but no data')
    })

    it('should handle network errors (fetch throws Error)', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()
      errorSpy.mockRestore()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to fetch')
    })

    it('should handle non-Error thrown objects', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockRejectedValue('string error')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()
      errorSpy.mockRestore()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  // =========================================================================
  // extractWithFallback
  // =========================================================================
  describe('extractWithFallback', () => {
    it('should return error when proxy is not configured', async () => {
      mockEnv.proxyUrl = null
      const result = await extractWithFallback('doc text')
      expect(result).toEqual({ success: false, error: 'Proxy not configured' })
    })

    it('should call unified extract endpoint with all optional params', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      const serverResponse = {
        success: true,
        data: { policyNumber: 'POL-001' },
        provider: 'anthropic',
        fallback: false,
        usage: { input_tokens: 300, output_tokens: 100 },
      }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => serverResponse,
      })

      const result = await extractWithFallback('document text', 'system prompt', 'kasko')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ policyNumber: 'POL-001' })
      expect(result.provider).toBe('anthropic')
      expect(result.fallback).toBe(false)
      expect(result.usage).toEqual({ input_tokens: 300, output_tokens: 100 })

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/extract',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentText: 'document text',
            systemPrompt: 'system prompt',
            policyType: 'kasko',
          }),
        }
      )
    })

    it('should work without optional parameters', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { policyNumber: 'POL-002' },
          provider: 'openai',
          fallback: true,
          usage: {},
        }),
      })

      const result = await extractWithFallback('document text')
      expect(result.success).toBe(true)

      const callBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(callBody.documentText).toBe('document text')
      expect(callBody.systemPrompt).toBeUndefined()
      expect(callBody.policyType).toBeUndefined()
    })

    it('should handle HTTP error response with error field', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      })

      const result = await extractWithFallback('doc')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal server error')
    })

    it('should handle HTTP error without error field', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      })

      const result = await extractWithFallback('doc')
      expect(result.success).toBe(false)
      expect(result.error).toBe('HTTP 503')
    })

    it('should handle fetch throwing Error', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Timeout'))

      const result = await extractWithFallback('doc')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Timeout')
    })

    it('should handle non-Error thrown value', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockRejectedValue(42)

      const result = await extractWithFallback('doc')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  // =========================================================================
  // ocrViaProxy
  // =========================================================================
  describe('ocrViaProxy', () => {
    it('should return error when proxy is not configured', async () => {
      mockEnv.proxyUrl = null
      const result = await ocrViaProxy('base64data')
      expect(result).toEqual({ success: false, error: 'Proxy not configured' })
    })

    it('should call OCR endpoint and return success', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      const ocrData = { text: 'extracted text', confidence: 0.95, pageCount: 3 }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: ocrData }),
      })

      const result = await ocrViaProxy('base64imagedata')
      expect(result.success).toBe(true)
      expect(result.data).toEqual(ocrData)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/ai/ocr',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: 'base64imagedata' }),
        }
      )
    })

    it('should handle HTTP error with error field', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad request: invalid base64' }),
      })

      const result = await ocrViaProxy('invalid')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Bad request: invalid base64')
    })

    it('should handle HTTP error without error field', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      })

      const result = await ocrViaProxy('data')
      expect(result.success).toBe(false)
      expect(result.error).toBe('HTTP 503')
    })

    it('should handle fetch throwing Error', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const result = await ocrViaProxy('data')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection refused')
    })

    it('should handle non-Error thrown value', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockRejectedValue(null)

      const result = await ocrViaProxy('data')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  // =========================================================================
  // Edge cases for getApiKey (tested through public functions)
  // =========================================================================
  describe('getApiKey edge cases (via isProviderConfigured)', () => {
    beforeEach(() => {
      mockEnv.hasProxy = false
    })

    it('should accept a valid non-placeholder key from localStorage', () => {
      store.set('insurai_openai_key', 'sk-proj-abc123validkey1234567890')
      expect(isProviderConfigured('openai')).toBe(true)
    })

    it('should reject empty string in localStorage', () => {
      store.set('insurai_openai_key', '')
      expect(isProviderConfigured('openai')).toBe(false)
    })

    it('should handle undefined envKey gracefully', () => {
      // VITE_OPENAI_API_KEY is undefined in test env; no localStorage key set
      expect(isProviderConfigured('openai')).toBe(false)
    })
  })

  // =========================================================================
  // extractViaProxy response logging (dataKeys branch)
  // =========================================================================
  describe('extractViaProxy logging branches', () => {
    it('should handle data being a non-object type in logging', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      // data is a string, not an object — the logging branch `typeof result.data === 'object'` should be false
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          success: true,
          data: 'raw string data',
          provider: 'openai',
        }),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()

      // Should still return success because data is truthy
      expect(result.success).toBe(true)
      expect(result.data).toBe('raw string data')
    })

    it('should handle data being null (falsy) in response', async () => {
      mockEnv.proxyUrl = 'http://localhost:4001'
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          success: true,
          data: null,
          provider: 'openai',
        }),
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await extractViaProxy('openai', 'doc', 'prompt')
      warnSpy.mockRestore()
      errorSpy.mockRestore()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Server returned success but no data')
    })
  })
})
