/**
 * Turkish Region Detector
 * Determines region from address for regional pricing adjustments
 */

import type { TurkishRegion } from '@/types/market-data'

/**
 * Turkish cities by region
 */
const REGION_CITIES: Record<TurkishRegion, string[]> = {
  marmara: [
    'istanbul', 'İstanbul',
    'bursa', 'Bursa',
    'kocaeli', 'Kocaeli', 'izmit', 'İzmit',
    'sakarya', 'Sakarya',
    'tekirdağ', 'Tekirdağ',
    'edirne', 'Edirne',
    'kırklareli', 'Kırklareli',
    'çanakkale', 'Çanakkale',
    'balıkesir', 'Balıkesir',
    'yalova', 'Yalova',
    'bilecik', 'Bilecik',
  ],
  ege: [
    'izmir', 'İzmir',
    'aydın', 'Aydın',
    'denizli', 'Denizli',
    'muğla', 'Muğla',
    'manisa', 'Manisa',
    'uşak', 'Uşak',
    'afyon', 'Afyon', 'afyonkarahisar', 'Afyonkarahisar',
    'kütahya', 'Kütahya',
  ],
  akdeniz: [
    'antalya', 'Antalya',
    'adana', 'Adana',
    'mersin', 'Mersin', 'içel', 'İçel',
    'hatay', 'Hatay',
    'kahramanmaraş', 'Kahramanmaraş', 'maraş', 'Maraş',
    'osmaniye', 'Osmaniye',
    'isparta', 'Isparta',
    'burdur', 'Burdur',
  ],
  ic_anadolu: [
    'ankara', 'Ankara',
    'konya', 'Konya',
    'eskişehir', 'Eskişehir',
    'kayseri', 'Kayseri',
    'sivas', 'Sivas',
    'yozgat', 'Yozgat',
    'kırıkkale', 'Kırıkkale',
    'kırşehir', 'Kırşehir',
    'nevşehir', 'Nevşehir',
    'aksaray', 'Aksaray',
    'niğde', 'Niğde',
    'karaman', 'Karaman',
    'çankırı', 'Çankırı',
  ],
  karadeniz: [
    'samsun', 'Samsun',
    'trabzon', 'Trabzon',
    'ordu', 'Ordu',
    'giresun', 'Giresun',
    'rize', 'Rize',
    'artvin', 'Artvin',
    'gümüşhane', 'Gümüşhane',
    'bayburt', 'Bayburt',
    'tokat', 'Tokat',
    'amasya', 'Amasya',
    'çorum', 'Çorum',
    'sinop', 'Sinop',
    'kastamonu', 'Kastamonu',
    'bartın', 'Bartın',
    'karabük', 'Karabük',
    'zonguldak', 'Zonguldak',
    'bolu', 'Bolu',
    'düzce', 'Düzce',
  ],
  dogu_anadolu: [
    'erzurum', 'Erzurum',
    'van', 'Van',
    'elazığ', 'Elazığ',
    'malatya', 'Malatya',
    'erzincan', 'Erzincan',
    'bingöl', 'Bingöl',
    'tunceli', 'Tunceli',
    'muş', 'Muş',
    'bitlis', 'Bitlis',
    'hakkari', 'Hakkari',
    'ağrı', 'Ağrı',
    'kars', 'Kars',
    'iğdır', 'Iğdır',
    'ardahan', 'Ardahan',
  ],
  guneydogu: [
    'gaziantep', 'Gaziantep',
    'diyarbakır', 'Diyarbakır',
    'şanlıurfa', 'Şanlıurfa', 'urfa', 'Urfa',
    'mardin', 'Mardin',
    'batman', 'Batman',
    'şırnak', 'Şırnak',
    'siirt', 'Siirt',
    'adıyaman', 'Adıyaman',
    'kilis', 'Kilis',
  ],
}

/**
 * Detect Turkish region from address string
 * @param address Address string (can be partial)
 * @returns Detected region or 'marmara' as default (most common)
 */
export function detectRegionFromAddress(address: string | undefined): TurkishRegion {
  if (!address) {
    return 'marmara' // Default to Marmara (includes Istanbul)
  }

  const normalizedAddress = address.toLowerCase()

  // Check each region's cities
  for (const [region, cities] of Object.entries(REGION_CITIES)) {
    for (const city of cities) {
      if (normalizedAddress.includes(city.toLowerCase())) {
        return region as TurkishRegion
      }
    }
  }

  // Default to Marmara if no match (most common region)
  return 'marmara'
}

/**
 * Get region display name
 */
export function getRegionDisplayName(region: TurkishRegion): { name: string; nameTr: string } {
  const names: Record<TurkishRegion, { name: string; nameTr: string }> = {
    marmara: { name: 'Marmara', nameTr: 'Marmara' },
    ege: { name: 'Aegean', nameTr: 'Ege' },
    akdeniz: { name: 'Mediterranean', nameTr: 'Akdeniz' },
    ic_anadolu: { name: 'Central Anatolia', nameTr: 'İç Anadolu' },
    karadeniz: { name: 'Black Sea', nameTr: 'Karadeniz' },
    dogu_anadolu: { name: 'Eastern Anatolia', nameTr: 'Doğu Anadolu' },
    guneydogu: { name: 'Southeastern Anatolia', nameTr: 'Güneydoğu Anadolu' },
  }

  return names[region]
}

/**
 * Get all major cities in a region
 */
export function getRegionCities(region: TurkishRegion): string[] {
  // Return unique, properly formatted city names
  const cities = REGION_CITIES[region]
  const uniqueCities = new Set<string>()

  for (let i = 0; i < cities.length; i += 2) {
    uniqueCities.add(cities[i + 1] || cities[i]) // Prefer Turkish version
  }

  return Array.from(uniqueCities)
}
