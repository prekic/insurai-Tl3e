import { useCallback, useEffect, useState } from 'react'
import { fxService, type SupportedCurrency } from '@/lib/fx/fx-service'
import { useUserPreferences } from './useUserPreferences'
import { formatCurrency } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function useDisplayCurrency() {
  const { preferences } = useUserPreferences()
  const { locale } = useTranslation()
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
    [displayCurrency, isReady]
  )

  const formatConverted = useCallback(
    (amount: number, fromBase: SupportedCurrency = 'TRY') => {
      const convertedValue = fxService.convertSync(amount, fromBase, displayCurrency)
      return formatCurrency(convertedValue, displayCurrency, locale)
    },
    [displayCurrency, locale, isReady]
  )

  return {
    displayCurrency,
    convert,
    formatConverted,
    isReady,
  }
}
