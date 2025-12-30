/**
 * Turkish Insurance Provider Data
 * Based on TSB (Türkiye Sigorta Birliği) market share statistics
 * Data reflects 2024 market conditions
 */

import type { ProviderInfo, InsuranceProvider } from '@/types/market-data'

export const INSURANCE_PROVIDERS: Record<InsuranceProvider, ProviderInfo> = {
  allianz: {
    id: 'allianz',
    name: 'Allianz Sigorta',
    nameTr: 'Allianz Sigorta',
    marketShare: 12.8,
    rating: 4.2,
    established: 1923,
    headquarters: 'Istanbul',
  },
  axa: {
    id: 'axa',
    name: 'AXA Sigorta',
    nameTr: 'AXA Sigorta',
    marketShare: 10.5,
    rating: 4.0,
    established: 1893,
    headquarters: 'Istanbul',
  },
  anadolu: {
    id: 'anadolu',
    name: 'Anadolu Sigorta',
    nameTr: 'Anadolu Sigorta',
    marketShare: 9.2,
    rating: 4.3,
    established: 1925,
    headquarters: 'Istanbul',
  },
  aksigorta: {
    id: 'aksigorta',
    name: 'Aksigorta',
    nameTr: 'Aksigorta',
    marketShare: 8.7,
    rating: 4.1,
    established: 1960,
    headquarters: 'Istanbul',
  },
  mapfre: {
    id: 'mapfre',
    name: 'Mapfre Sigorta',
    nameTr: 'Mapfre Sigorta',
    marketShare: 7.4,
    rating: 3.9,
    established: 1992,
    headquarters: 'Istanbul',
  },
  sompo: {
    id: 'sompo',
    name: 'Sompo Sigorta',
    nameTr: 'Sompo Sigorta',
    marketShare: 6.8,
    rating: 4.0,
    established: 1993,
    headquarters: 'Istanbul',
  },
  zurich: {
    id: 'zurich',
    name: 'Zurich Sigorta',
    nameTr: 'Zurich Sigorta',
    marketShare: 5.2,
    rating: 4.1,
    established: 1986,
    headquarters: 'Istanbul',
  },
  hdi: {
    id: 'hdi',
    name: 'HDI Sigorta',
    nameTr: 'HDI Sigorta',
    marketShare: 4.8,
    rating: 3.8,
    established: 2002,
    headquarters: 'Istanbul',
  },
  turkiye: {
    id: 'turkiye',
    name: 'Türkiye Sigorta',
    nameTr: 'Türkiye Sigorta',
    marketShare: 4.5,
    rating: 4.0,
    established: 2019, // Merger of Güneş and Halk Sigorta
    headquarters: 'Istanbul',
  },
  groupama: {
    id: 'groupama',
    name: 'Groupama Sigorta',
    nameTr: 'Groupama Sigorta',
    marketShare: 4.2,
    rating: 3.9,
    established: 1991,
    headquarters: 'Istanbul',
  },
  ergo: {
    id: 'ergo',
    name: 'ERGO Sigorta',
    nameTr: 'ERGO Sigorta',
    marketShare: 3.8,
    rating: 3.8,
    established: 2015,
    headquarters: 'Istanbul',
  },
  ray: {
    id: 'ray',
    name: 'Ray Sigorta',
    nameTr: 'Ray Sigorta',
    marketShare: 3.5,
    rating: 3.7,
    established: 1958,
    headquarters: 'Istanbul',
  },
  generali: {
    id: 'generali',
    name: 'Generali Sigorta',
    nameTr: 'Generali Sigorta',
    marketShare: 3.2,
    rating: 4.0,
    established: 1989,
    headquarters: 'Istanbul',
  },
  neova: {
    id: 'neova',
    name: 'Neova Sigorta',
    nameTr: 'Neova Sigorta',
    marketShare: 2.8,
    rating: 3.6,
    established: 2008,
    headquarters: 'Istanbul',
  },
  quick: {
    id: 'quick',
    name: 'Quick Sigorta',
    nameTr: 'Quick Sigorta',
    marketShare: 2.5,
    rating: 3.5,
    established: 2003,
    headquarters: 'Istanbul',
  },
}

/**
 * Get provider by name (fuzzy match)
 */
export function findProviderByName(name: string): ProviderInfo | undefined {
  const normalizedName = name.toLowerCase().replace(/\s+/g, '')

  for (const provider of Object.values(INSURANCE_PROVIDERS)) {
    const providerNameNormalized = provider.name.toLowerCase().replace(/\s+/g, '')
    const providerNameTrNormalized = provider.nameTr.toLowerCase().replace(/\s+/g, '')

    if (
      providerNameNormalized.includes(normalizedName) ||
      normalizedName.includes(providerNameNormalized) ||
      providerNameTrNormalized.includes(normalizedName) ||
      normalizedName.includes(providerNameTrNormalized)
    ) {
      return provider
    }
  }

  return undefined
}

/**
 * Get providers sorted by market share
 */
export function getProvidersByMarketShare(): ProviderInfo[] {
  return Object.values(INSURANCE_PROVIDERS).sort((a, b) => b.marketShare - a.marketShare)
}

/**
 * Get provider rank by market share
 */
export function getProviderRank(providerId: InsuranceProvider): number {
  const sorted = getProvidersByMarketShare()
  return sorted.findIndex((p) => p.id === providerId) + 1
}
