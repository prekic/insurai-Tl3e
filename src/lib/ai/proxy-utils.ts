/**
 * Proxy Utilities
 *
 * Lightweight utility functions for API proxy configuration.
 * These are separated from config.ts to avoid pulling in AI SDK dependencies.
 *
 * Use these functions when you only need proxy URL/status checks.
 * Use config.ts when you need AI client instances or extraction functions.
 */

import env from '@/lib/env'

/**
 * AI Provider type - duplicated here to avoid importing from config.ts
 * which would pull in the AI SDK dependencies
 */
export type AIProvider = 'openai' | 'anthropic'

/**
 * Check if the secure API proxy is configured
 * When enabled, API calls go through the backend server instead of directly from browser
 */
export function isProxyConfigured(): boolean {
  return env.hasProxy
}

/**
 * Get the proxy URL
 */
export function getProxyUrl(): string | null {
  return env.proxyUrl
}

/**
 * Check if any AI service is configured (either via proxy or direct keys)
 */
export function isAIConfigured(): boolean {
  // If proxy is configured, we can use AI services through it
  if (isProxyConfigured()) {
    return true
  }

  // Check for direct API keys in localStorage (dev/demo mode only)
  if (typeof window !== 'undefined') {
    const hasOpenAI = !!localStorage.getItem('insurai_openai_key')
    const hasAnthropic = !!localStorage.getItem('insurai_anthropic_key')
    return hasOpenAI || hasAnthropic
  }

  return false
}

/**
 * Check if OCR is configured (via proxy)
 */
export function isOCRConfigured(): boolean {
  // OCR is only available through proxy (Document AI requires server-side credentials)
  return isProxyConfigured()
}

/**
 * Check which providers are available via the proxy
 * Returns a promise with the configured providers
 */
export async function checkProxyProviders(): Promise<{
  openai: boolean
  anthropic: boolean
  google: boolean
}> {
  if (!isProxyConfigured()) {
    return { openai: false, anthropic: false, google: false }
  }

  try {
    const response = await fetch(`${getProxyUrl()}/api/ai/providers`)
    if (!response.ok) {
      return { openai: false, anthropic: false, google: false }
    }
    const data = await response.json()
    return {
      openai: data.openai?.configured ?? false,
      anthropic: data.anthropic?.configured ?? false,
      google: data.google?.configured ?? false,
    }
  } catch {
    return { openai: false, anthropic: false, google: false }
  }
}
