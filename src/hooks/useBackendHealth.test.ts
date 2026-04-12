import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useBackendHealth, type DiagnosticResult } from './useBackendHealth'

// Mock the proxy-utils module
vi.mock('@/lib/ai/proxy-utils', () => ({
  getProxyUrl: vi.fn(),
}))

import { getProxyUrl } from '@/lib/ai/proxy-utils'

const mockGetProxyUrl = vi.mocked(getProxyUrl)

describe('useBackendHealth', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('when proxy is not configured', () => {
    it('should return unconfigured status', async () => {
      mockGetProxyUrl.mockReturnValue(null)

      const { result } = renderHook(() => useBackendHealth())

      await waitFor(() => {
        expect(result.current.health.status).toBe('unconfigured')
      })

      expect(result.current.health.providers).toEqual({
        openai: false,
        anthropic: false,
        google: false,
      })
      expect(result.current.health.error).toContain('Backend proxy URL not configured')
    })
  })

  describe('when proxy is configured', () => {
    beforeEach(() => {
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')
    })

    it('should return healthy status when backend responds with providers', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            providers: {
              openai: true,
              anthropic: false,
              google: true,
            },
          }),
      })

      const { result } = renderHook(() => useBackendHealth())

      // Initially checking
      expect(result.current.health.status).toBe('checking')

      await waitFor(() => {
        expect(result.current.health.status).toBe('healthy')
      })

      expect(result.current.health.providers).toEqual({
        openai: true,
        anthropic: false,
        google: true,
      })
      expect(result.current.health.error).toBeUndefined()
      expect(result.current.health.lastChecked).toBeInstanceOf(Date)
    })

    it('should return unhealthy status when no providers are configured', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            providers: {
              openai: false,
              anthropic: false,
              google: false,
            },
          }),
      })

      const { result } = renderHook(() => useBackendHealth())

      await waitFor(() => {
        expect(result.current.health.status).toBe('unhealthy')
      })

      expect(result.current.health.error).toContain('No AI providers configured')
    })

    it('should return unhealthy status when backend returns error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      const { result } = renderHook(() => useBackendHealth())

      await waitFor(() => {
        expect(result.current.health.status).toBe('unhealthy')
      })

      expect(result.current.health.error).toContain('Backend returned 500')
    })

    it('should return unhealthy status when network request fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const { result } = renderHook(() => useBackendHealth())

      await waitFor(() => {
        expect(result.current.health.status).toBe('unhealthy')
      })

      expect(result.current.health.error).toContain('Cannot reach backend server')
      expect(result.current.health.error).toContain('Connection refused')
    })

    it('should not auto-check when autoCheck is false', async () => {
      globalThis.fetch = vi.fn()

      renderHook(() => useBackendHealth(false))

      // Wait a bit to ensure no fetch was made
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('should allow manual health check via checkHealth function', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            providers: { openai: true, anthropic: true, google: false },
          }),
      })

      const { result } = renderHook(() => useBackendHealth(false))

      // Initially should not have checked
      expect(result.current.health.status).toBe('checking')
      expect(globalThis.fetch).not.toHaveBeenCalled()

      // Manually trigger check
      await act(async () => {
        await result.current.checkHealth()
      })

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:4001/api/health',
        expect.objectContaining({
          method: 'GET',
        })
      )

      expect(result.current.health.status).toBe('healthy')
      expect(result.current.health.providers.openai).toBe(true)
      expect(result.current.health.providers.anthropic).toBe(true)
    })
  })

  describe('edge cases', () => {
    beforeEach(() => {
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')
    })

    it('should handle missing providers in response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            // providers field missing
          }),
      })

      const { result } = renderHook(() => useBackendHealth())

      await waitFor(() => {
        expect(result.current.health.status).toBe('unhealthy')
      })

      expect(result.current.health.providers).toEqual({
        openai: false,
        anthropic: false,
        google: false,
      })
    })

    it('should handle partial providers in response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'ok',
            providers: {
              openai: true,
              // anthropic and google missing
            },
          }),
      })

      const { result } = renderHook(() => useBackendHealth())

      await waitFor(() => {
        expect(result.current.health.status).toBe('healthy')
      })

      expect(result.current.health.providers).toEqual({
        openai: true,
        anthropic: false,
        google: false,
      })
    })

    it('should handle network timeout', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))

      const { result } = renderHook(() => useBackendHealth())

      await waitFor(() => {
        expect(result.current.health.status).toBe('unhealthy')
      })

      expect(result.current.health.error).toContain('ETIMEDOUT')
    })
  })

  describe('runDiagnostics', () => {
    it('should return null when proxy is not configured', async () => {
      mockGetProxyUrl.mockReturnValue(null)

      const { result } = renderHook(() => useBackendHealth(false))

      let diagnosticResult: DiagnosticResult | null = null
      await act(async () => {
        diagnosticResult = await result.current.runDiagnostics()
      })

      expect(diagnosticResult).toBeNull()
    })

    it('should fetch and return diagnostic results', async () => {
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')

      const mockDiagnostics: DiagnosticResult = {
        openai: { configured: true, valid: true, latencyMs: 250, model: 'gpt-4o-mini' },
        anthropic: { configured: false, valid: false },
        google: { configured: false, valid: false },
        timestamp: new Date().toISOString(),
        environment: 'development',
        summary: {
          anyProviderConfigured: true,
          anyProviderValid: true,
          extractionReady: true,
          ocrReady: false,
          recommendation: 'All configured providers are working',
        },
      }

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              providers: { openai: true, anthropic: false, google: false },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDiagnostics),
        })

      const { result } = renderHook(() => useBackendHealth(true))

      await waitFor(() => {
        expect(result.current.health.status).toBe('healthy')
      })

      let diagnosticResult: DiagnosticResult | null = null
      await act(async () => {
        diagnosticResult = await result.current.runDiagnostics()
      })

      expect(diagnosticResult).not.toBeNull()
      // @ts-expect-error - mismatch due to schema update
      expect(diagnosticResult?.openai.valid).toBe(true)
      // @ts-expect-error - mismatch due to schema update
      expect(diagnosticResult?.summary.extractionReady).toBe(true)
    })

    it('should update health state with diagnostic results showing invalid keys', async () => {
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')

      const mockDiagnostics: DiagnosticResult = {
        openai: {
          configured: true,
          valid: false,
          error: 'Invalid API key - check OPENAI_API_KEY in .env',
        },
        anthropic: { configured: false, valid: false },
        google: { configured: false, valid: false },
        timestamp: new Date().toISOString(),
        environment: 'development',
        summary: {
          anyProviderConfigured: true,
          anyProviderValid: false,
          extractionReady: false,
          ocrReady: false,
          recommendation: 'API keys are configured but invalid - check the error messages above',
        },
      }

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              providers: { openai: true, anthropic: false, google: false },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDiagnostics),
        })

      const { result } = renderHook(() => useBackendHealth(true))

      await waitFor(() => {
        expect(result.current.health.status).toBe('healthy')
      })

      await act(async () => {
        await result.current.runDiagnostics()
      })

      // After diagnostics, status should be updated based on provider validity
      expect(result.current.health.status).toBe('unhealthy')
      expect(result.current.health.diagnostics).toBeDefined()
      expect(result.current.health.diagnostics?.openai.error).toContain('Invalid API key')
    })

    it('should handle diagnostic endpoint failure gracefully', async () => {
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              providers: { openai: true, anthropic: false, google: false },
            }),
        })
        .mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useBackendHealth(true))

      await waitFor(() => {
        expect(result.current.health.status).toBe('healthy')
      })

      let diagnosticResult: DiagnosticResult | null = null
      await act(async () => {
        diagnosticResult = await result.current.runDiagnostics()
      })

      expect(diagnosticResult).toBeNull()
      // Health status should remain unchanged after failed diagnostics
      expect(result.current.health.status).toBe('healthy')
    })

    it('should handle non-ok response from diagnostic endpoint', async () => {
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              providers: { openai: true, anthropic: false, google: false },
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })

      const { result } = renderHook(() => useBackendHealth(true))

      await waitFor(() => {
        expect(result.current.health.status).toBe('healthy')
      })

      let diagnosticResult: DiagnosticResult | null = null
      await act(async () => {
        diagnosticResult = await result.current.runDiagnostics()
      })

      expect(diagnosticResult).toBeNull()
    })

    it('should show valid providers with latency info', async () => {
      mockGetProxyUrl.mockReturnValue('http://localhost:4001')

      const mockDiagnostics: DiagnosticResult = {
        openai: { configured: true, valid: true, latencyMs: 150, model: 'gpt-4o-mini' },
        anthropic: { configured: true, valid: true, latencyMs: 200, model: 'claude-3-5-haiku' },
        google: { configured: true, valid: true, latencyMs: 100, model: 'cloud-vision-v1' },
        timestamp: new Date().toISOString(),
        environment: 'development',
        summary: {
          anyProviderConfigured: true,
          anyProviderValid: true,
          extractionReady: true,
          ocrReady: true,
          recommendation: 'All configured providers are working',
        },
      }

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              providers: { openai: true, anthropic: true, google: true },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDiagnostics),
        })

      const { result } = renderHook(() => useBackendHealth(true))

      await waitFor(() => {
        expect(result.current.health.status).toBe('healthy')
      })

      let diagnosticResult: DiagnosticResult | null = null
      await act(async () => {
        diagnosticResult = await result.current.runDiagnostics()
      })

      // @ts-expect-error - mismatch due to schema update
      expect(diagnosticResult?.openai.latencyMs).toBe(150)
      // @ts-expect-error - mismatch due to schema update
      expect(diagnosticResult?.anthropic.latencyMs).toBe(200)
      // @ts-expect-error - mismatch due to schema update
      expect(diagnosticResult?.google.latencyMs).toBe(100)
      // @ts-expect-error - mismatch due to schema update
      expect(diagnosticResult?.summary.ocrReady).toBe(true)
    })
  })
})
