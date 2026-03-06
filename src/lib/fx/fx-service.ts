export const SUPPORTED_CURRENCIES = [
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
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const FALLBACK_RATES: Record<SupportedCurrency, number> = {
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

export interface FXRates {
  base: SupportedCurrency
  rates: Record<SupportedCurrency, number>
  timestamp: number
}

class FXService {
  private ratesCache: FXRates | null = null
  private CACHE_TTL_MS = 1000 * 60 * 60 * 4 // 4 hours

  /**
   * Fetches exchange rates from the server proxy.
   */
  async getRates(): Promise<FXRates> {
    if (this.ratesCache && Date.now() - this.ratesCache.timestamp < this.CACHE_TTL_MS) {
      return this.ratesCache
    }

    try {
      const response = await fetch('/api/fx/rates')
      if (!response.ok) {
        throw new Error('Failed to fetch FX rates')
      }
      const data = await response.json()

      this.ratesCache = {
        base: data.base,
        rates: data.rates,
        timestamp: Date.now(),
      }
      return this.ratesCache
    } catch (error) {
      console.warn('FXService: fetch failed, falling back to static rates', error)
      return {
        base: 'TRY',
        rates: FALLBACK_RATES,
        timestamp: Date.now(),
      }
    }
  }

  /**
   * Converts an amount from one currency to another.
   * Forces fetching rates if they are not cached.
   */
  async convert(amount: number, from: SupportedCurrency, to: SupportedCurrency): Promise<number> {
    if (from === to) return amount

    const { rates } = await this.getRates()

    // Using TRY as the base
    const fromRate = rates[from] || FALLBACK_RATES[from]
    const toRate = rates[to] || FALLBACK_RATES[to]

    // Convert to base (TRY) first, then to target
    const amountInTry = amount * fromRate
    return amountInTry / toRate
  }

  /**
   * Synchronous conversion using cached or fallback rates.
   * Useful for React renders where async is not directly usable.
   */
  convertSync(amount: number, from: SupportedCurrency, to: SupportedCurrency): number {
    if (from === to) return amount

    const rates = this.ratesCache?.rates || FALLBACK_RATES

    const fromRate = rates[from] || FALLBACK_RATES[from]
    const toRate = rates[to] || FALLBACK_RATES[to]

    const amountInTry = amount * fromRate
    return amountInTry / toRate
  }
}

export const fxService = new FXService()
