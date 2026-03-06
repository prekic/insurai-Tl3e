import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import logger from '../lib/logger.js'

const router = Router()
const log = logger.child('FX')

const fxLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests to FX service', code: 'RATE_LIMIT_EXCEEDED' },
})

// Currencies supported by the platform — TRY is always base = 1
const SUPPORTED_SYMBOLS = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'SAR', 'AED'] as const

// Fallback rates (approximate Q1 2026 values) used when API is unavailable
const FALLBACK_RATES: Record<string, number> = {
  TRY: 1,
  USD: 33.5,
  EUR: 36.5,
  GBP: 42.5,
  CHF: 38.0,
  SAR: 8.9,
  AED: 9.1,
}

let cachedRates: Record<string, number> = { ...FALLBACK_RATES }
let lastFetchTime = 0
let lastFetchSource: 'api' | 'fallback' = 'fallback'
const SERVER_CACHE_TTL = 1000 * 60 * 60 * 6 // 6 hours

/**
 * Fetch live rates from exchangerate.host.
 * Returns null on failure so caller can fall back gracefully.
 */
async function fetchLiveRates(): Promise<Record<string, number> | null> {
  const apiKey = process.env.EXCHANGERATE_API_KEY
  if (!apiKey) {
    log.info('EXCHANGERATE_API_KEY not set — using fallback rates')
    return null
  }

  try {
    const symbols = SUPPORTED_SYMBOLS.filter((s) => s !== 'TRY').join(',')
    const url = `https://api.exchangerate.host/live?access_key=${apiKey}&source=TRY&currencies=${symbols}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) {
      log.warn('exchangerate.host returned non-OK status', { status: response.status })
      return null
    }

    const data = await response.json()

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

    for (const symbol of SUPPORTED_SYMBOLS) {
      if (symbol === 'TRY') continue

      const quoteKey = `TRY${symbol}`
      const quoteValue = data.quotes[quoteKey]

      if (typeof quoteValue === 'number' && quoteValue > 0) {
        // API gives TRY→X rate (e.g., TRYUSD=0.0299 means 1 TRY = 0.0299 USD)
        // We want X→TRY rate (e.g., 1 USD = 33.44 TRY) which is 1/quote
        rates[symbol] = Math.round((1 / quoteValue) * 10000) / 10000
      } else {
        // Use fallback for this specific currency if missing
        rates[symbol] = FALLBACK_RATES[symbol] ?? 1
      }
    }

    log.info('Live FX rates fetched from exchangerate.host', {
      currencies: Object.keys(rates).length,
      sampleRate: `1 USD = ${rates.USD} TRY`,
    })

    return rates
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      log.warn('exchangerate.host request timed out (10s)')
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
    const now = Date.now()
    if (now - lastFetchTime < SERVER_CACHE_TTL && lastFetchTime > 0) {
      return res.json({
        base: 'TRY',
        rates: cachedRates,
        timestamp: lastFetchTime,
        source: lastFetchSource,
      })
    }

    const liveRates = await fetchLiveRates()

    if (liveRates) {
      cachedRates = liveRates
      lastFetchSource = 'api'
    } else {
      cachedRates = { ...FALLBACK_RATES }
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
      rates: FALLBACK_RATES,
      base: 'TRY',
      source: 'fallback',
    })
  }
})

// Diagnostic endpoint for admin visibility
router.get('/status', fxLimiter, (_req, res) => {
  res.json({
    hasApiKey: !!process.env.EXCHANGERATE_API_KEY,
    lastFetchTime: lastFetchTime || null,
    lastFetchSource,
    cacheAgeMs: lastFetchTime ? Date.now() - lastFetchTime : null,
    cacheTtlMs: SERVER_CACHE_TTL,
    supportedCurrencies: [...SUPPORTED_SYMBOLS],
    currentRates: cachedRates,
  })
})

export default router
