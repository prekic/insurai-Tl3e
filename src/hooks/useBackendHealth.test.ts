import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useBackendHealth } from './useBackendHealth'

// Mock the config module
vi.mock('@/lib/ai/config', () => ({
  getProxyUrl: vi.fn(),
}))

import { getProxyUrl } from '@/lib/ai/config'

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
        json: () => Promise.resolve({
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
        json: () => Promise.resolve({
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
        json: () => Promise.resolve({
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
        json: () => Promise.resolve({
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
        json: () => Promise.resolve({
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
})
