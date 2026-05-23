/**
 * Provider Health Monitor
 *
 * Runs at server startup and periodically to detect non-transient provider
 * issues (invalid credentials, disabled APIs, billing exhaustion) and
 * dispatches admin alerts so operators know about them without waiting for
 * users to report "Analysis Failed" errors.
 *
 * Companion to the diagnostic endpoint (/api/ai/diagnose) — reuses the same
 * test logic but runs proactively in the background.
 */

import { logger } from '../lib/logger.js'
import { dispatchAlert } from '../lib/alert-service.js'

// Used to share health status with the diagnostics endpoint
// Avoids circular import — diagnostics.ts imports from extraction.ts which
// imports alert-service.ts, and health-monitor lives in services/.
let statusSink: ((provider: string, status: string) => void) | null = null

export function setStatusSink(fn: (provider: string, status: string) => void): void {
  statusSink = fn
}

// Injected via dynamic import at runtime to avoid circular deps
let getOpenAIClient: () => any
let getAnthropicClient: () => any
let getDeepSeekClient: () => any
let getGeminiClient: () => any
let getGCPCredentialsPath: () => string | null

const svcLog = logger.child('provider-health-monitor')

// Cooldown: don't re-alert on the same issue within 15 minutes
const LAST_ALERT = new Map<string, number>()
const COOLDOWN_MS = 15 * 60 * 1000

function isCooldown(key: string): boolean {
  const last = LAST_ALERT.get(key)
  return last !== undefined && Date.now() - last < COOLDOWN_MS
}

export function setDiagnosticsImports(imports: {
  getOpenAIClient: () => any
  getAnthropicClient: () => any
  getDeepSeekClient: () => any
  getGeminiClient: () => any
  getGCPCredentialsPath: () => string | null
}): void {
  getOpenAIClient = imports.getOpenAIClient
  getAnthropicClient = imports.getAnthropicClient
  getDeepSeekClient = imports.getDeepSeekClient
  getGeminiClient = imports.getGeminiClient
  getGCPCredentialsPath = imports.getGCPCredentialsPath
}

/**
 * Run a full provider health check and dispatch alerts for any non-transient
 * issues found. Transient issues (rate limits, cold starts) are logged but
 * not alerted — only persistent/recoverable failures qualify.
 *
 * Returns a summary map: { providerName: 'healthy' | 'errorCode' }
 */
function pushStatus(name: string, status: string): void {
  statusSink?.(name, status)
}

export async function checkAllProviders(): Promise<Record<string, string>> {
  const results: Record<string, string> = {}

  await checkOpenAI(results)
  await checkAnthropic(results)
  await checkDeepSeek(results)
  await checkGemini(results)
  await checkGoogleVision(results)

  // Push results to diagnostics endpoint status sink
  for (const [name, status] of Object.entries(results)) {
    pushStatus(name, status)
  }

  const summary = Object.entries(results)
    .filter(([, status]) => status !== 'healthy')
    .map(([p, s]) => `${p}=${s}`)
    .join(', ')

  if (summary) {
    svcLog.warn('Provider health: DEGRADED', { details: summary })
  } else {
    svcLog.info('Provider health: all healthy')
  }

  return results
}

async function checkOpenAI(results: Record<string, string>): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    results.openai = 'NOT_CONFIGURED'
    return
  }
  results.openai = 'healthy'

  try {
    const client = getOpenAIClient?.()
    if (!client) {
      results.openai = 'CLIENT_FAILED'
      return
    }

    await client.chat.completions.create({
      model: 'gpt-5.4',
      messages: [{ role: 'user', content: 'OK' }],
      max_tokens: 5,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.includes('429') || msg.includes('rate_limit')) {
      // Rate limits are transient — log but don't alert
      results.openai = 'RATE_LIMITED'
      svcLog.warn('OpenAI rate limited (transient)', { message: msg.slice(0, 200) })
    } else if (msg.includes('401') || msg.includes('Incorrect API key')) {
      results.openai = 'INVALID_KEY'
      await dispatchAlert({
        severity: 'error',
        category: 'api_error',
        title: 'OpenAI API Key Invalid',
        message: 'OPENAI_API_KEY is not valid. Extraction will fail on OpenAI path.',
        provider: 'openai',
        dedupKey: 'health:openai:invalid_key',
      })
    } else if (msg.includes('insufficient_quota') || msg.includes('quota')) {
      results.openai = 'QUOTA_EXHAUSTED'
      await dispatchAlert({
        severity: 'error',
        category: 'billing',
        title: 'OpenAI Quota Exhausted',
        message: `OpenAI API quota exhausted. ${msg.slice(0, 200)}`,
        provider: 'openai',
        dedupKey: 'health:openai:quota',
      })
    } else {
      results.openai = 'ERROR'
      svcLog.warn('OpenAI health check failed', { message: msg.slice(0, 200) })
    }
  }
}

async function checkAnthropic(results: Record<string, string>): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    results.anthropic = 'NOT_CONFIGURED'
    return
  }
  results.anthropic = 'healthy'

  try {
    const client = getAnthropicClient?.()
    if (!client) {
      results.anthropic = 'CLIENT_FAILED'
      return
    }

    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'OK' }],
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.includes('credit') || msg.includes('billing')) {
      results.anthropic = 'BILLING_ERROR'
      if (!isCooldown('health:anthropic:billing')) {
        LAST_ALERT.set('health:anthropic:billing', Date.now())
        await dispatchAlert(
          {
            severity: 'error',
            category: 'billing',
            title: 'Anthropic Credits Exhausted',
            message:
              'Anthropic billing balance is too low. Every extraction will fall back to OpenAI.',
            provider: 'anthropic',
            dedupKey: 'health:anthropic:billing',
          },
          3600_000
        ) // 1 hour cooldown for billing alert
      }
    } else if (msg.includes('429')) {
      results.anthropic = 'RATE_LIMITED'
      svcLog.warn('Anthropic rate limited (transient)', { message: msg.slice(0, 200) })
    } else if (msg.includes('401') || msg.includes('x-api-key')) {
      results.anthropic = 'INVALID_KEY'
      await dispatchAlert({
        severity: 'error',
        category: 'api_error',
        title: 'Anthropic API Key Invalid',
        message: 'ANTHROPIC_API_KEY is not valid. Extraction will fall back to OpenAI.',
        provider: 'anthropic',
        dedupKey: 'health:anthropic:invalid_key',
      })
    } else {
      results.anthropic = 'ERROR'
      svcLog.warn('Anthropic health check failed', { message: msg.slice(0, 200) })
    }
  }
}

async function checkDeepSeek(results: Record<string, string>): Promise<void> {
  if (!process.env.DEEPSEEK_API_KEY) {
    results.deepseek = 'NOT_CONFIGURED'
    return
  }
  results.deepseek = 'healthy'

  try {
    const client = getDeepSeekClient?.()
    if (!client) {
      results.deepseek = 'CLIENT_FAILED'
      return
    }

    await client.chat.completions.create({
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'OK' }],
      max_tokens: 5,
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.includes('401') || msg.includes('Incorrect API key')) {
      results.deepseek = 'INVALID_KEY'
      await dispatchAlert({
        severity: 'warning',
        category: 'api_error',
        title: 'DeepSeek API Key Invalid',
        message: 'DEEPSEEK_API_KEY is not valid. DeepSeek fallback path will fail.',
        provider: 'deepseek',
        dedupKey: 'health:deepseek:invalid_key',
      })
    } else if (msg.includes('insufficient_quota')) {
      results.deepseek = 'QUOTA_EXHAUSTED'
      await dispatchAlert({
        severity: 'warning',
        category: 'billing',
        title: 'DeepSeek Quota Exhausted',
        message: 'DeepSeek API quota exhausted. Fallback path unavailable.',
        provider: 'deepseek',
        dedupKey: 'health:deepseek:quota',
      })
    } else {
      results.deepseek = 'ERROR'
      svcLog.warn('DeepSeek health check failed', { message: msg.slice(0, 200) })
    }
  }
}

async function checkGemini(results: Record<string, string>): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    results.gemini = 'NOT_CONFIGURED'
    return
  }
  results.gemini = 'healthy'

  try {
    const client = getGeminiClient?.()
    if (!client) {
      results.gemini = 'CLIENT_FAILED'
      return
    }

    // Test with a simple content generation
    await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'OK' }] }],
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (
      msg.includes('API_KEY_INVALID') ||
      msg.includes('API key not valid') ||
      msg.includes('invalid')
    ) {
      results.gemini = 'INVALID_KEY'
      if (!isCooldown('health:gemini:invalid_key')) {
        LAST_ALERT.set('health:gemini:invalid_key', Date.now())
        await dispatchAlert(
          {
            severity: 'error',
            category: 'api_error',
            title: 'Gemini API Key Invalid',
            message:
              'GEMINI_API_KEY is invalid. OCR fallback (Gemini) will fail. Scanned PDFs will not work.',
            provider: 'gemini',
            dedupKey: 'health:gemini:invalid_key',
          },
          3600_000
        ) // 1 hour cooldown
      }
    } else if (msg.includes('PERMISSION_DENIED') || msg.includes('not enabled')) {
      results.gemini = 'API_NOT_ENABLED'
      await dispatchAlert({
        severity: 'error',
        category: 'api_error',
        title: 'Gemini API Not Enabled',
        message:
          'Gemini API is not enabled for this project/API key. Enable it in Google AI Studio or Cloud Console.',
        provider: 'gemini',
        dedupKey: 'health:gemini:not_enabled',
      })
    } else if (msg.includes('429')) {
      results.gemini = 'RATE_LIMITED'
      svcLog.warn('Gemini rate limited (transient)', { message: msg.slice(0, 200) })
    } else {
      results.gemini = 'ERROR'
      svcLog.warn('Gemini health check failed', { message: msg.slice(0, 200) })
    }
  }
}

async function checkGoogleVision(results: Record<string, string>): Promise<void> {
  const hasApiKey = !!process.env.GOOGLE_CLOUD_API_KEY
  const hasServiceAccount = !!getGCPCredentialsPath?.()

  if (!hasApiKey && !hasServiceAccount) {
    results.google_vision = 'NOT_CONFIGURED'
    return
  }
  results.google_vision = 'healthy'

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    let url = 'https://vision.googleapis.com/v1/images:annotate'

    if (hasApiKey) {
      url += `?key=${process.env.GOOGLE_CLOUD_API_KEY}`
    } else {
      results.google_vision = 'AUTH_FAILED'
      await dispatchAlert({
        severity: 'error',
        category: 'api_error',
        title: 'Google Cloud Vision Auth Failed',
        message: 'No Google Cloud API key configured. OCR via Vision API will fail.',
        provider: 'google_vision',
        dedupKey: 'health:google_vision:auth_failed',
      })
      return
    }

    // Test with a tiny 1x1 white PNG
    const testImage =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requests: [
          {
            image: { content: testImage },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          },
        ],
      }),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as any
      const errMsg = body?.error?.message || `HTTP ${response.status}`

      if (
        errMsg.includes('not enabled') ||
        errMsg.includes('PERMISSION_DENIED') ||
        response.status === 403
      ) {
        results.google_vision = 'API_NOT_ENABLED'
        await dispatchAlert({
          severity: 'error',
          category: 'api_error',
          title: 'Google Cloud Vision API Not Enabled',
          message: `Cloud Vision API is not enabled for this GCP project. OCR will fail. Error: ${errMsg.slice(0, 200)}`,
          provider: 'google_vision',
          dedupKey: 'health:google_vision:not_enabled',
        })
      } else if (response.status === 401) {
        results.google_vision = 'INVALID_CREDENTIALS'
        await dispatchAlert({
          severity: 'error',
          category: 'api_error',
          title: 'Google Cloud Vision Invalid Credentials',
          message: `Cloud Vision credentials are invalid. OCR will fail. Error: ${errMsg.slice(0, 200)}`,
          provider: 'google_vision',
          dedupKey: 'health:google_vision:invalid_credentials',
        })
      } else {
        results.google_vision = 'ERROR'
        svcLog.warn('Google Vision health check failed', { message: errMsg.slice(0, 200) })
      }
    }
  } catch (err: any) {
    results.google_vision = 'ERROR'
    svcLog.warn('Google Vision health check threw', {
      message: (err?.message || String(err)).slice(0, 200),
    })
  }
}

/**
 * Single-pass boot check: runs once at startup and fires alerts for any
 * non-transient provider issues found.
 *
 * Returns a promise that resolves after all checks complete (does NOT block
 * server startup — runs in background).
 */
export async function bootProviderCheck(): Promise<void> {
  svcLog.info('Running boot-time provider health check...')

  try {
    const results = await checkAllProviders()
    const degraded = Object.entries(results).filter(([, s]) => s !== 'healthy')
    const notConfigured = Object.entries(results).filter(([, s]) => s === 'NOT_CONFIGURED')

    if (degraded.length > 0) {
      // Already dispatched individual alerts above — also send a summary
      const summary = degraded.map(([p, s]) => `${p}: ${s}`).join(', ')
      svcLog.warn(`Provider health DEGRADED at boot: ${summary}`)

      await dispatchAlert(
        {
          severity: degraded.some(([, s]) => s.includes('BILLING') || s.includes('INVALID_KEY'))
            ? 'error'
            : 'warning',
          category: 'system',
          title: 'Provider Health Degraded at Startup',
          message:
            `Boot health check found degraded providers: ${summary}` +
            (notConfigured.length > 0 ? ` (${notConfigured.length} not configured)` : ''),
          dedupKey: 'health:boot:summary',
        },
        3600_000
      )
    }

    if (notConfigured.length > 0) {
      const names = notConfigured.map(([p]) => p).join(', ')
      svcLog.info(`Providers intentionally not configured: ${names}`)
    }
  } catch (err: any) {
    svcLog.error('Boot provider check failed', {
      error: err?.message || String(err),
    })
  }
}

/**
 * Start periodic provider health checks.
 * Runs on the given interval (default: 15 minutes).
 */
let periodicTimer: ReturnType<typeof setInterval> | null = null

export function startPeriodicHealthCheck(intervalMs = 15 * 60 * 1000): void {
  if (periodicTimer) return
  svcLog.info('Starting periodic provider health checks', { intervalMs })

  periodicTimer = setInterval(async () => {
    try {
      await checkAllProviders()
    } catch (err: any) {
      svcLog.error('Periodic health check error', {
        error: err?.message || String(err),
      })
    }
  }, intervalMs)
}

export function stopPeriodicHealthCheck(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer)
    periodicTimer = null
  }
}
