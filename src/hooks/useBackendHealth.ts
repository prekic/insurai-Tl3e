import { useState, useEffect, useCallback } from 'react'
import { getProxyUrl } from '@/lib/ai/config'

export interface BackendHealth {
  status: 'checking' | 'healthy' | 'unhealthy' | 'unconfigured'
  providers: {
    openai: boolean
    anthropic: boolean
    google: boolean
  }
  error?: string
  lastChecked?: Date
}

/**
 * Hook to check backend server health and AI provider availability
 * Useful for showing users whether AI extraction will work
 */
export function useBackendHealth(autoCheck = true) {
  const [health, setHealth] = useState<BackendHealth>({
    status: 'checking',
    providers: { openai: false, anthropic: false, google: false },
  })

  const checkHealth = useCallback(async () => {
    const proxyUrl = getProxyUrl()

    if (!proxyUrl) {
      setHealth({
        status: 'unconfigured',
        providers: { openai: false, anthropic: false, google: false },
        error: 'Backend proxy URL not configured (VITE_API_PROXY_URL)',
      })
      return
    }

    setHealth(prev => ({ ...prev, status: 'checking' }))

    try {
      const response = await fetch(`${proxyUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`)
      }

      const data = await response.json()

      const hasAnyProvider = data.providers?.openai || data.providers?.anthropic

      setHealth({
        status: hasAnyProvider ? 'healthy' : 'unhealthy',
        providers: {
          openai: data.providers?.openai ?? false,
          anthropic: data.providers?.anthropic ?? false,
          google: data.providers?.google ?? false,
        },
        error: hasAnyProvider ? undefined : 'No AI providers configured on the server',
        lastChecked: new Date(),
      })
    } catch (error) {
      setHealth({
        status: 'unhealthy',
        providers: { openai: false, anthropic: false, google: false },
        error: error instanceof Error
          ? `Cannot reach backend server: ${error.message}`
          : 'Cannot reach backend server',
        lastChecked: new Date(),
      })
    }
  }, [])

  useEffect(() => {
    if (autoCheck) {
      checkHealth()
    }
  }, [autoCheck, checkHealth])

  return { health, checkHealth }
}
