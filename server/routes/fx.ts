import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import logger from '../lib/logger.js'
import { getSupabaseWithError } from '../middleware/admin-auth.js'
import { getFXConfig } from '../services/config-service.js'

const router = Router()
const log = logger.child('FX')

const fxLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests to FX service', code: 'RATE_LIMIT_EXCEEDED' },
})

// Default currencies supported by the platform — TRY is always base = 1
const DEFAULT_SUPPORTED_SYMBOLS = [
  'TRY',
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'SAR',
  'AED',
  'JPY',
  'CAD',
  'AUD',
] as const

// Default fallback rates (approximate Q1 2026 values) used when API is unavailable
const DEFAULT_FALLBACK_RATES: Record<string, number> = {
  TRY: 1,
  USD: 33.5,
  EUR: 36.5,
  GBP: 42.5,
  CHF: 38.0,
  SAR: 8.9,
  AED: 9.1,
  JPY: 0.22,
  CAD: 24.5,
  AUD: 21.8,
}

// Default cache TTL and API timeout (overridden by config service at request time)
const DEFAULT_SERVER_CACHE_TTL = 1000 * 60 * 60 * 6 // 6 hours
const DEFAULT_API_TIMEOUT_MS = 10_000

let cachedRates: Record<string, number> = { ...DEFAULT_FALLBACK_RATES }
let lastFetchTime = 0
let lastFetchSource: 'api' | 'fallback' = 'fallback'

/**
 * Fetch live rates from exchangerate.host.
 * Returns null on failure so caller can fall back gracefully.
 */
export async function fetchLiveRates(options?: {
  supportedCurrencies?: string[]
  fallbackRates?: Record<string, number>
  apiTimeoutMs?: number
}): Promise<Record<string, number> | null> {
  const supportedSymbols = options?.supportedCurrencies || [...DEFAULT_SUPPORTED_SYMBOLS]
  const fallbackRates = options?.fallbackRates || DEFAULT_FALLBACK_RATES
  const apiTimeoutMs = options?.apiTimeoutMs || DEFAULT_API_TIMEOUT_MS

  const apiKey = process.env.EXCHANGERATE_API_KEY
  if (!apiKey) {
    log.info('EXCHANGERATE_API_KEY not set — using fallback rates')
    return null
  }

  try {
    const symbols = supportedSymbols.filter((s) => s !== 'TRY').join(',')
    const url = `https://api.exchangerate.host/live?access_key=${apiKey}&source=TRY&currencies=${symbols}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), apiTimeoutMs)

    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) {
      log.warn('exchangerate.host returned non-OK status', { status: response.status })
      return null
    }

    const data = (await response.json()) as {
      success?: boolean
      quotes?: Record<string, number>
      error?: unknown
    }

    if (!data.success || !data.quotes) {
      log.warn('exchangerate.host returned unsuccessful response', {
        success: data.success,
        error: data.error,
      })
      return null
    }

    // API returns quotes like { TRYUSD: 0.0299, TRYEUR: 0.0274, ... }
    // We need the inverse: how many TRY per 1 foreign currency unit
    const rates: Record<string, number> = { TRY: 1 }

    for (const symbol of supportedSymbols) {
      if (symbol === 'TRY') continue

      const quoteKey = `TRY${symbol}`
      const quoteValue = data.quotes[quoteKey]

      if (typeof quoteValue === 'number' && quoteValue > 0) {
        // API gives TRY→X rate (e.g., TRYUSD=0.0299 means 1 TRY = 0.0299 USD)
        // We want X→TRY rate (e.g., 1 USD = 33.44 TRY) which is 1/quote
        rates[symbol] = Math.round((1 / quoteValue) * 10000) / 10000
      } else {
        // Use fallback for this specific currency if missing
        rates[symbol] = fallbackRates[symbol] ?? 1
      }
    }

    log.info('Live FX rates fetched from exchangerate.host', {
      currencies: Object.keys(rates).length,
      sampleRate: `1 USD = ${rates.USD} TRY`,
    })

    // FX Rate Deviation Alerts and History Storage
    try {
      const { client: supabase } = getSupabaseWithError()
      if (supabase) {
        const deviations: string[] = []
        const historyRows = []

        for (const [currency, newRate] of Object.entries(rates)) {
          if (currency === 'TRY') continue

          historyRows.push({
            base_currency: 'TRY',
            target_currency: currency,
            rate: newRate,
            source: 'api',
          })

          const oldRate = cachedRates[currency]
          if (oldRate && oldRate > 0) {
            const deviation = Math.abs(newRate - oldRate) / oldRate
            if (deviation > 0.05) {
              // 5% threshold
              deviations.push(
                `${currency}: ${(deviation * 100).toFixed(1)}% (from ${oldRate} to ${newRate})`
              )
            }
          }
        }

        if (deviations.length > 0) {
          log.warn('Significant FX rate deviation detected', { deviations })
          await supabase.from('admin_notifications').insert([
            {
              type: 'warning',
              category: 'system',
              title: 'FX Rate Deviation Alert (>5%)',
              message: `Significant FX rate deviations detected: ${deviations.join(', ')}`,
              provider: 'exchangerate.host',
              details: { deviations },
            },
          ])
        }

        if (historyRows.length > 0) {
          await supabase.from('fx_rate_history').insert(historyRows)
        }
      }
    } catch (dbErr) {
      log.error('Failed to save FX rate history or dispatch alerts', {
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      })
    }

    return rates
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      log.warn(`exchangerate.host request timed out (${apiTimeoutMs}ms)`)
    } else {
      log.warn('Failed to fetch live FX rates', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  }
}

router.get('/rates', fxLimiter, async (_req, res) => {
  try {
    const fxConfig = await getFXConfig()
    const cacheTtl = fxConfig.serverCacheTtlMs || DEFAULT_SERVER_CACHE_TTL
    const fallbackRates = fxConfig.fallbackRates || DEFAULT_FALLBACK_RATES
    const supportedCurrencies = fxConfig.supportedCurrencies || [...DEFAULT_SUPPORTED_SYMBOLS]

    const now = Date.now()
    if (now - lastFetchTime < cacheTtl && lastFetchTime > 0) {
      return res.json({
        base: 'TRY',
        rates: cachedRates,
        timestamp: lastFetchTime,
        source: lastFetchSource,
      })
    }

    const liveRates = await fetchLiveRates({
      supportedCurrencies,
      fallbackRates,
      apiTimeoutMs: fxConfig.apiTimeoutMs || DEFAULT_API_TIMEOUT_MS,
    })

    if (liveRates) {
      cachedRates = liveRates
      lastFetchSource = 'api'
    } else {
      cachedRates = { ...fallbackRates }
      lastFetchSource = 'fallback'
    }
    lastFetchTime = now

    res.json({
      base: 'TRY',
      rates: cachedRates,
      timestamp: lastFetchTime,
      source: lastFetchSource,
    })
  } catch (error) {
    log.error('FX rates fetch error', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({
      error: 'Failed to fetch rates',
      rates: DEFAULT_FALLBACK_RATES,
      base: 'TRY',
      source: 'fallback',
    })
  }
})

// Diagnostic endpoint for admin visibility
router.get('/status', fxLimiter, async (_req, res) => {
  const fxConfig = await getFXConfig()

  res.json({
    hasApiKey: !!process.env.EXCHANGERATE_API_KEY,
    lastFetchTime: lastFetchTime || null,
    lastFetchSource,
    cacheAgeMs: lastFetchTime ? Date.now() - lastFetchTime : null,
    cacheTtlMs: fxConfig.serverCacheTtlMs || DEFAULT_SERVER_CACHE_TTL,
    supportedCurrencies: fxConfig.supportedCurrencies || [...DEFAULT_SUPPORTED_SYMBOLS],
    currentRates: cachedRates,
  })
})

export default router
