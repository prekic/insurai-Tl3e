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

// Hardcoded fallback logic in case an external API is not integrated
// In a real scenario, this route would abstract API keys and calls to a service like Fixer or ExchangeRate-API
const FALLBACK_RATES = {
  TRY: 1,
  USD: 33.5,
  EUR: 36.5,
  GBP: 42.5,
}

let cachedRates = { ...FALLBACK_RATES }
let lastFetchTime = 0
const SERVER_CACHE_TTL = 1000 * 60 * 60 * 6 // 6 hours

router.get('/rates', fxLimiter, async (_req, res) => {
  try {
    const now = Date.now()
    if (now - lastFetchTime < SERVER_CACHE_TTL) {
      return res.json({
        base: 'TRY',
        rates: cachedRates,
        timestamp: lastFetchTime,
      })
    }

    // TODO: integrate external Exchange Rate API here
    // For now, simulate fetching by using static base fallback
    cachedRates = { ...FALLBACK_RATES }
    lastFetchTime = now

    res.json({
      base: 'TRY',
      rates: cachedRates,
      timestamp: lastFetchTime,
    })
  } catch (error) {
    log.error('FX rates fetch error', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to fetch rates', rates: FALLBACK_RATES, base: 'TRY' })
  }
})

export default router
