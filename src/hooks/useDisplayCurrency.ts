import { useCallback, useEffect, useState } from 'react'
import { fxService, type SupportedCurrency } from '@/lib/fx/fx-service'
import { useUserPreferences } from './useUserPreferences'
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export function useDisplayCurrency() {
  const { preferences } = useUserPreferences()
  const { locale } = useI18n()
  const [isReady, setIsReady] = useState(false)

  // Explicitly cast to the SupportedCurrency type as preferences could be string
  const displayCurrency = (preferences?.ui?.display_currency || 'TRY') as SupportedCurrency

  // Pre-warm the cache
  useEffect(() => {
    fxService.getRates().then(() => setIsReady(true))
  }, [])

  const convert = useCallback(
    (amount: number, fromBase: SupportedCurrency = 'TRY') => {
      return fxService.convertSync(amount, fromBase, displayCurrency)
    },
    [displayCurrency]
  )

  const formatConverted = useCallback(
    (amount: number, fromBase: SupportedCurrency = 'TRY') => {
      const convertedValue = fxService.convertSync(amount, fromBase, displayCurrency)
      return formatCurrency(convertedValue, displayCurrency, locale)
    },
    [displayCurrency, locale]
  )

  const formatConvertedCompact = useCallback(
    (amount: number, fromBase: SupportedCurrency = 'TRY') => {
      const convertedValue = fxService.convertSync(amount, fromBase, displayCurrency)
      return formatCurrencyCompact(convertedValue, displayCurrency, locale)
    },
    [displayCurrency, locale]
  )

  return {
    displayCurrency,
    convert,
    formatConverted,
    formatConvertedCompact,
    isReady,
  }
}
