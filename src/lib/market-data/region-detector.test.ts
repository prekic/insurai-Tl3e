/**
 * Region Detector Tests
 *
 * Tests for Turkish region detection from address strings
 */

import { describe, it, expect } from 'vitest'
import {
  detectRegionFromAddress,
  getRegionDisplayName,
  getRegionCities,
} from './region-detector'

describe('detectRegionFromAddress', () => {
  it('should return marmara for undefined address', () => {
    expect(detectRegionFromAddress(undefined)).toBe('marmara')
  })

  it('should return marmara for empty string', () => {
    expect(detectRegionFromAddress('')).toBe('marmara')
  })

  it('should detect marmara region cities', () => {
    expect(detectRegionFromAddress('Istanbul Kadikoy')).toBe('marmara')
    expect(detectRegionFromAddress('Bursa Nilufer')).toBe('marmara')
    expect(detectRegionFromAddress('Kocaeli Gebze')).toBe('marmara')
    expect(detectRegionFromAddress('Sakarya')).toBe('marmara')
    expect(detectRegionFromAddress('Edirne Merkez')).toBe('marmara')
    expect(detectRegionFromAddress('Yalova')).toBe('marmara')
    expect(detectRegionFromAddress('Bilecik')).toBe('marmara')
  })

  it('should detect ege region cities', () => {
    expect(detectRegionFromAddress('Izmir Karsiyaka')).toBe('ege')
    expect(detectRegionFromAddress('Denizli Pamukkale')).toBe('ege')
    expect(detectRegionFromAddress('Muğla Bodrum')).toBe('ege')
    expect(detectRegionFromAddress('Manisa')).toBe('ege')
    expect(detectRegionFromAddress('Afyonkarahisar')).toBe('ege')
    expect(detectRegionFromAddress('Kütahya')).toBe('ege')
  })

  it('should detect akdeniz region cities', () => {
    expect(detectRegionFromAddress('Antalya Lara')).toBe('akdeniz')
    expect(detectRegionFromAddress('Adana Seyhan')).toBe('akdeniz')
    expect(detectRegionFromAddress('Mersin')).toBe('akdeniz')
    expect(detectRegionFromAddress('Hatay Antakya')).toBe('akdeniz')
    expect(detectRegionFromAddress('Isparta')).toBe('akdeniz')
    expect(detectRegionFromAddress('Burdur')).toBe('akdeniz')
  })

  it('should detect ic_anadolu region cities', () => {
    expect(detectRegionFromAddress('Ankara Cankaya')).toBe('ic_anadolu')
    expect(detectRegionFromAddress('Konya Selcuklu')).toBe('ic_anadolu')
    expect(detectRegionFromAddress('Eskişehir')).toBe('ic_anadolu')
    expect(detectRegionFromAddress('Kayseri')).toBe('ic_anadolu')
    expect(detectRegionFromAddress('Nevşehir')).toBe('ic_anadolu')
    expect(detectRegionFromAddress('Karaman')).toBe('ic_anadolu')
  })

  it('should detect karadeniz region cities', () => {
    expect(detectRegionFromAddress('Trabzon Ortahisar')).toBe('karadeniz')
    expect(detectRegionFromAddress('Samsun')).toBe('karadeniz')
    expect(detectRegionFromAddress('Rize')).toBe('karadeniz')
    expect(detectRegionFromAddress('Artvin')).toBe('karadeniz')
    expect(detectRegionFromAddress('Zonguldak')).toBe('karadeniz')
    expect(detectRegionFromAddress('Bolu')).toBe('karadeniz')
  })

  it('should detect dogu_anadolu region cities', () => {
    expect(detectRegionFromAddress('Erzurum')).toBe('dogu_anadolu')
    expect(detectRegionFromAddress('Van')).toBe('dogu_anadolu')
    expect(detectRegionFromAddress('Malatya')).toBe('dogu_anadolu')
    expect(detectRegionFromAddress('Ağrı')).toBe('dogu_anadolu')
    expect(detectRegionFromAddress('Kars')).toBe('dogu_anadolu')
    expect(detectRegionFromAddress('Ardahan')).toBe('dogu_anadolu')
  })

  it('should detect guneydogu region cities', () => {
    expect(detectRegionFromAddress('Gaziantep')).toBe('guneydogu')
    expect(detectRegionFromAddress('Diyarbakır')).toBe('guneydogu')
    expect(detectRegionFromAddress('Şanlıurfa')).toBe('guneydogu')
    expect(detectRegionFromAddress('Mardin')).toBe('guneydogu')
    expect(detectRegionFromAddress('Batman')).toBe('guneydogu')
    expect(detectRegionFromAddress('Kilis')).toBe('guneydogu')
  })

  it('should be case-insensitive', () => {
    expect(detectRegionFromAddress('ISTANBUL')).toBe('marmara')
    expect(detectRegionFromAddress('ankara')).toBe('ic_anadolu')
    expect(detectRegionFromAddress('TRABZON')).toBe('karadeniz')
  })

  it('should match partial addresses', () => {
    expect(detectRegionFromAddress('34 Istanbul Cd. No: 15')).toBe('marmara')
    expect(detectRegionFromAddress('Izmir Yolu Uzeri, Denizli')).toBe('ege')
  })

  it('should default to marmara for unknown addresses', () => {
    expect(detectRegionFromAddress('Unknown City')).toBe('marmara')
    expect(detectRegionFromAddress('Planet Mars')).toBe('marmara')
  })

  it('should handle Turkish characters in addresses', () => {
    expect(detectRegionFromAddress('İstanbul')).toBe('marmara')
    expect(detectRegionFromAddress('Çanakkale')).toBe('marmara')
    expect(detectRegionFromAddress('Tekirdağ')).toBe('marmara')
    expect(detectRegionFromAddress('Şanlıurfa')).toBe('guneydogu')
    expect(detectRegionFromAddress('İçel')).toBe('akdeniz')
  })

  it('should detect alternative city names', () => {
    // İzmit is an alternative name for Kocaeli
    expect(detectRegionFromAddress('İzmit')).toBe('marmara')
    // İçel is an alternative name for Mersin
    expect(detectRegionFromAddress('İçel')).toBe('akdeniz')
    // Maraş is an alternative for Kahramanmaraş
    expect(detectRegionFromAddress('Maraş')).toBe('akdeniz')
    // Urfa is an alternative for Şanlıurfa
    expect(detectRegionFromAddress('Urfa')).toBe('guneydogu')
    // Afyon is an alternative for Afyonkarahisar
    expect(detectRegionFromAddress('Afyon')).toBe('ege')
  })
})

describe('getRegionDisplayName', () => {
  it('should return English and Turkish names for marmara', () => {
    const result = getRegionDisplayName('marmara')
    expect(result.name).toBe('Marmara')
    expect(result.nameTr).toBe('Marmara')
  })

  it('should return English and Turkish names for ege', () => {
    const result = getRegionDisplayName('ege')
    expect(result.name).toBe('Aegean')
    expect(result.nameTr).toBe('Ege')
  })

  it('should return English and Turkish names for akdeniz', () => {
    const result = getRegionDisplayName('akdeniz')
    expect(result.name).toBe('Mediterranean')
    expect(result.nameTr).toBe('Akdeniz')
  })

  it('should return names for all 7 regions', () => {
    const regions = ['marmara', 'ege', 'akdeniz', 'ic_anadolu', 'karadeniz', 'dogu_anadolu', 'guneydogu'] as const
    for (const region of regions) {
      const result = getRegionDisplayName(region)
      expect(result.name).toBeTruthy()
      expect(result.nameTr).toBeTruthy()
    }
  })

  it('should return correct Turkish names for all regions', () => {
    expect(getRegionDisplayName('ic_anadolu').nameTr).toBe('İç Anadolu')
    expect(getRegionDisplayName('karadeniz').nameTr).toBe('Karadeniz')
    expect(getRegionDisplayName('dogu_anadolu').nameTr).toBe('Doğu Anadolu')
    expect(getRegionDisplayName('guneydogu').nameTr).toBe('Güneydoğu Anadolu')
  })
})

describe('getRegionCities', () => {
  it('should return unique cities for marmara', () => {
    const cities = getRegionCities('marmara')
    expect(cities.length).toBeGreaterThan(0)
    // Should be unique
    expect(new Set(cities).size).toBe(cities.length)
  })

  it('should prefer Turkish-formatted city names', () => {
    const cities = getRegionCities('marmara')
    // Should contain Turkish versions like İstanbul (not istanbul)
    expect(cities).toContain('İstanbul')
    expect(cities).toContain('Bursa')
  })

  it('should return cities for all 7 regions', () => {
    const regions = ['marmara', 'ege', 'akdeniz', 'ic_anadolu', 'karadeniz', 'dogu_anadolu', 'guneydogu'] as const
    for (const region of regions) {
      const cities = getRegionCities(region)
      expect(cities.length).toBeGreaterThan(0)
    }
  })

  it('should return unique cities without lowercase duplicates', () => {
    const regions = ['marmara', 'ege', 'akdeniz', 'ic_anadolu', 'karadeniz', 'dogu_anadolu', 'guneydogu'] as const
    for (const region of regions) {
      const cities = getRegionCities(region)
      // Every city should be unique
      expect(new Set(cities).size).toBe(cities.length)
    }
  })

  it('should return expected city count for karadeniz (largest region list)', () => {
    const cities = getRegionCities('karadeniz')
    // Karadeniz has 36 entries (18 pairs), so 18 unique cities
    expect(cities.length).toBe(18)
  })

  it('should return expected city count for guneydogu (smallest region list)', () => {
    const cities = getRegionCities('guneydogu')
    // guneydogu: gaziantep, diyarbakır, şanlıurfa, mardin, batman, şırnak, siirt, adıyaman, kilis
    // But urfa/Urfa are extras for şanlıurfa, so pairs: 10 entries = 5 pairs for base + urfa pair
    // Actually counting the source: gaziantep(2), diyarbakır(2), şanlıurfa(2)+urfa(2), mardin(2), batman(2), şırnak(2), siirt(2), adıyaman(2), kilis(2) = 20 entries
    // getRegionCities steps by 2, taking i+1 (Turkish version): 10 unique cities
    expect(cities.length).toBe(10)
  })
})
