import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format currency in compact form for mobile (e.g., ₺980M, ₺5.2M)
 */
export function formatCurrencyCompact(amount: number, currency: string = 'TRY'): string {
  const symbols: Record<string, string> = {
    TRY: '₺',
    USD: '$',
    EUR: '€',
    GBP: '£',
  }
  const symbol = symbols[currency] || currency + ' '

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

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('tr-TR').format(num)
}
