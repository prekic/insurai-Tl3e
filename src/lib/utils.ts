import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Locale mapping: app locale → Intl locale string
const INTL_LOCALE_MAP: Record<string, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
}

function getIntlLocale(locale?: string): string {
  return INTL_LOCALE_MAP[locale || 'tr'] || 'tr-TR'
}

export function formatCurrency(amount: number, currency: string = 'TRY', locale?: string): string {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Currency symbols for worldwide currencies
 * Ordered by frequency of use in international insurance
 */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  // Major currencies
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  CHF: 'CHF ',
  AUD: 'A$',
  CAD: 'C$',
  // European currencies
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  CZK: 'Kč',
  HUF: 'Ft',
  RON: 'lei',
  BGN: 'лв',
  HRK: 'kn',
  RSD: 'дин',
  UAH: '₴',
  RUB: '₽',
  // Middle East & Africa
  AED: 'د.إ',
  SAR: '﷼',
  QAR: '﷼',
  KWD: 'د.ك',
  BHD: '.د.ب',
  OMR: '﷼',
  ILS: '₪',
  EGP: 'E£',
  ZAR: 'R',
  NGN: '₦',
  KES: 'KSh',
  MAD: 'د.م.',
  // Asia Pacific
  INR: '₹',
  PKR: '₨',
  BDT: '৳',
  LKR: '₨',
  NPR: '₨',
  KRW: '₩',
  TWD: 'NT$',
  HKD: 'HK$',
  SGD: 'S$',
  MYR: 'RM',
  THB: '฿',
  IDR: 'Rp',
  PHP: '₱',
  VND: '₫',
  // Americas
  MXN: 'MX$',
  BRL: 'R$',
  ARS: '$',
  CLP: '$',
  COP: '$',
  PEN: 'S/',
  // Other
  NZD: 'NZ$',
}

/**
 * Format currency in compact form for mobile (e.g., ₺980M, $5.2M)
 */
export function formatCurrencyCompact(
  amount: number,
  currency: string = 'TRY',
  _locale?: string
): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency + ' '

  if (amount >= 1_000_000_000) {
    const value = amount / 1_000_000_000
    return `${symbol}${value >= 10 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}B`
  }
  if (amount >= 1_000_000) {
    const value = amount / 1_000_000
    return `${symbol}${value >= 10 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (amount >= 1_000) {
    const value = amount / 1_000
    return `${symbol}${value >= 10 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}K`
  }
  return `${symbol}${Math.round(amount)}`
}

/**
 * Expected currencies by country/region for validation
 */
export const EXPECTED_CURRENCIES_BY_REGION: Record<string, string[]> = {
  // Turkey
  TR: ['TRY', 'USD', 'EUR'],
  // Major markets that commonly use multiple currencies
  US: ['USD'],
  GB: ['GBP', 'EUR'],
  DE: ['EUR'],
  FR: ['EUR'],
  // Add more as needed
}

/**
 * Validate if currency matches the expected region
 * Returns warning message if mismatch detected
 */
export function validateCurrencyRegion(
  currency: string,
  address: string | undefined | null
): { valid: boolean; warning?: string } {
  if (!address || !currency) {
    return { valid: true }
  }

  const addressLower = address.toLowerCase()

  // Turkish address indicators
  const turkishIndicators = [
    'türkiye',
    'turkey',
    'istanbul',
    'ankara',
    'izmir',
    'antalya',
    'bursa',
    'adana',
    'konya',
    'gaziantep',
    'mersin',
    'kayseri',
    'eskişehir',
    'diyarbakır',
    'samsun',
    'denizli',
    'şanlıurfa',
    'adapazarı',
    'malatya',
    'trabzon',
    'erzurum',
    'van',
    'batman',
    'elazığ',
    'sivas',
    'manisa',
    'kahramanmaraş',
    'muğla',
    'aydın',
    'balıkesir',
    'tekirdağ',
    'kocaeli',
    'sakarya',
    'ordu',
    'afyon',
    'çorum',
    'tokat',
    'edirne',
    'yozgat',
    'çanakkale',
    'isparta',
    'zonguldak',
    'rize',
    'karaman',
    'aksaray',
    'giresun',
    'niğde',
    'muş',
    'kırşehir',
    'uşak',
    'mardin',
    'kilis',
  ]

  const isTurkishAddress = turkishIndicators.some((ind) => addressLower.includes(ind))

  if (isTurkishAddress) {
    // Turkish addresses should typically use TRY, but USD/EUR are acceptable for international policies
    const acceptableCurrencies = ['TRY', 'USD', 'EUR', 'GBP']
    if (!acceptableCurrencies.includes(currency)) {
      return {
        valid: false,
        warning: `Unusual currency ${currency} detected for Turkish address. Expected TRY, USD, or EUR.`,
      }
    }
    // Warn if non-TRY but don't mark invalid
    if (currency !== 'TRY') {
      return {
        valid: true,
        warning: `Foreign currency (${currency}) used for Turkish address. Verify this is intentional.`,
      }
    }
  }

  // US address indicators
  const usIndicators = [
    'usa',
    'united states',
    'america',
    'new york',
    'california',
    'texas',
    'florida',
  ]
  const isUSAddress = usIndicators.some((ind) => addressLower.includes(ind))

  if (isUSAddress && currency !== 'USD') {
    return {
      valid: true,
      warning: `Non-USD currency (${currency}) for US address. Verify this is intentional.`,
    }
  }

  // UK address indicators
  const ukIndicators = [
    'uk',
    'united kingdom',
    'england',
    'scotland',
    'wales',
    'london',
    'manchester',
    'birmingham',
  ]
  const isUKAddress = ukIndicators.some((ind) => addressLower.includes(ind))

  if (isUKAddress && !['GBP', 'EUR', 'USD'].includes(currency)) {
    return {
      valid: true,
      warning: `Unusual currency (${currency}) for UK address. Expected GBP, EUR, or USD.`,
    }
  }

  // Eurozone indicators
  const eurozoneIndicators = [
    'germany',
    'france',
    'italy',
    'spain',
    'netherlands',
    'belgium',
    'austria',
    'ireland',
    'portugal',
    'greece',
    'finland',
  ]
  const isEurozoneAddress = eurozoneIndicators.some((ind) => addressLower.includes(ind))

  if (isEurozoneAddress && !['EUR', 'USD'].includes(currency)) {
    return {
      valid: true,
      warning: `Unusual currency (${currency}) for Eurozone address. Expected EUR or USD.`,
    }
  }

  return { valid: true }
}

export function formatDate(date: string | Date, locale?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatNumber(num: number, locale?: string): string {
  return new Intl.NumberFormat(getIntlLocale(locale)).format(num)
}
