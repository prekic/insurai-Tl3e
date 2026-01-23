/**
 * Turkish Motor Kasko Policy Pack
 *
 * Validation and extraction rules for Turkish comprehensive auto insurance (Kasko).
 *
 * Covers:
 * - Birleşik Kasko (Combined Kasko)
 * - Genişletilmiş Kasko (Extended Kasko)
 * - Standard Kasko
 *
 * Key fields:
 * - Policy number, SBM reference
 * - Vehicle: plate, VIN, make/model, year
 * - Insured: name, address, TC Kimlik
 * - Premium: base, BSMV, total
 * - Coverages: collision, theft, fire, natural disasters, etc.
 */

import type { PolicyRulePack, ValidationSeverity } from '@insurai/types'

export const motorKaskoTRPack: PolicyRulePack = {
  id: 'policy-motor-kasko-tr-v2',
  type: 'policy',
  policyType: 'motor_kasko',
  locales: ['tr-TR'],
  version: '2.0.0',
  active: true,
  createdAt: new Date('2026-01-23'),
  updatedAt: new Date('2026-01-23'),

  // Classification keywords
  classifiers: {
    keywordsAny: [
      'KASKO',
      'POLİÇE',
      'ARAÇ',
      'PLAKA',
      'ŞASİ',
      'MOTOR NO',
      'OTOMOBİL',
      'TAŞIT',
    ],
    keywordsStrong: [
      'Birleşik Kasko',
      'Genişletilmiş Kasko',
      'KASKO SİGORTA POLİÇESİ',
      'BİRLEŞİK KASKO',
      'GENİŞLETİLMİŞ KASKO',
    ],
    keywordsExclude: [
      'TRAFİK SİGORTASI',
      'ZORUNLU MALİ SORUMLULUK',
      'ZMSS',
      'DASK',
      'DEPREM',
    ],
    layoutPatterns: [
      {
        description: 'Standard kasko layout',
        requiredRegions: ['text', 'table'],
        optionalRegions: ['qr', 'barcode', 'logo'],
      },
    ],
  },

  // Field validators
  validators: {
    // =========================================================================
    // POLICY IDENTIFIERS
    // =========================================================================

    'policy.policyNo': [
      {
        regex: '^\\d{8,20}$',
        severity: 'critical' as ValidationSeverity,
        message: 'Policy number must be 8-20 digits',
      },
    ],

    'policy.sbmRefNo': [
      {
        regex: '^[A-Za-z0-9+/=]{20,100}$',
        severity: 'error' as ValidationSeverity,
        message: 'SBM Ref No should be a base64-like string',
      },
    ],

    'policy.sbmPolicyNo': [
      {
        regex: '^\\d{8,15}$',
        severity: 'error' as ValidationSeverity,
        message: 'SBM Policy No must be 8-15 digits',
      },
    ],

    'policy.renewalNo': [
      {
        regex: '^\\d{1,5}$',
        severity: 'info' as ValidationSeverity,
        message: 'Renewal number should be 1-5 digits',
      },
    ],

    // =========================================================================
    // DATES
    // =========================================================================

    'policy.effectiveFrom': [
      {
        parse: 'date',
        severity: 'critical' as ValidationSeverity,
        message: 'Effective from date is required and must be valid',
      },
    ],

    'policy.effectiveTo': [
      {
        parse: 'date',
        severity: 'critical' as ValidationSeverity,
        message: 'Effective to date is required and must be valid',
      },
    ],

    'policy.issueDate': [
      {
        parse: 'date',
        severity: 'error' as ValidationSeverity,
        message: 'Issue date must be valid',
      },
    ],

    // =========================================================================
    // VEHICLE DATA (CRITICAL)
    // =========================================================================

    'vehicle.plate': [
      {
        regex: '^\\d{2}\\s?[A-ZÇĞİÖŞÜ]{1,3}\\s?\\d{2,4}$',
        severity: 'critical' as ValidationSeverity,
        message: 'Turkish plate format: XX YYY ZZZZ (e.g., 34 ABC 1234)',
      },
    ],

    'vehicle.vin': [
      {
        regex: '^[A-HJ-NPR-Z0-9]{17}$',
        severity: 'critical' as ValidationSeverity,
        message: 'VIN must be exactly 17 characters (no I, O, Q)',
      },
      {
        rule: 'vinCheckDigit',
        severity: 'warn' as ValidationSeverity,
        message: 'VIN check digit validation failed',
      },
    ],

    'vehicle.engineNo': [
      {
        regex: '^[A-Z0-9]{6,20}$',
        severity: 'error' as ValidationSeverity,
        message: 'Engine number should be 6-20 alphanumeric characters',
      },
    ],

    'vehicle.makeModel': [
      {
        regex: '.{3,}',
        required: true,
        severity: 'error' as ValidationSeverity,
        message: 'Make/Model is required',
      },
    ],

    'vehicle.year': [
      {
        parse: 'number',
        min: 1950,
        max: 2030,
        severity: 'error' as ValidationSeverity,
        message: 'Vehicle year must be between 1950 and 2030',
      },
    ],

    'vehicle.registrationDate': [
      {
        parse: 'date',
        severity: 'warn' as ValidationSeverity,
        message: 'Registration date should be valid',
      },
    ],

    'vehicle.usage': [
      {
        regex: '^(HUSUSİ|TİCARİ|RESMİ)\\s*(OTOMOBİL|KAMYONET|KAMYON|OTOBÜS|MOTOSİKLET)?',
        severity: 'warn' as ValidationSeverity,
        message: 'Vehicle usage should match known categories',
      },
    ],

    // =========================================================================
    // INSURED PARTY
    // =========================================================================

    'insured.name': [
      {
        regex: '.{3,}',
        required: true,
        severity: 'critical' as ValidationSeverity,
        message: 'Insured name is required',
      },
    ],

    'insured.tcKimlik': [
      {
        regex: '^[1-9]\\d{10}$',
        severity: 'error' as ValidationSeverity,
        message: 'TC Kimlik must be 11 digits starting with non-zero',
      },
      {
        rule: 'tcKimlikChecksum',
        severity: 'warn' as ValidationSeverity,
        message: 'TC Kimlik checksum validation failed',
      },
    ],

    'insured.vkn': [
      {
        regex: '^\\d{10}$',
        severity: 'error' as ValidationSeverity,
        message: 'VKN (Tax ID) must be 10 digits',
      },
    ],

    'insured.customerNo': [
      {
        regex: '^\\d{6,15}$',
        severity: 'info' as ValidationSeverity,
        message: 'Customer number should be 6-15 digits',
      },
    ],

    // =========================================================================
    // PREMIUM & PAYMENT
    // =========================================================================

    'premium.netPremium': [
      {
        parse: 'money',
        min: 0,
        severity: 'error' as ValidationSeverity,
        message: 'Net premium must be a positive amount',
      },
    ],

    'premium.bsmv': [
      {
        parse: 'money',
        min: 0,
        severity: 'error' as ValidationSeverity,
        message: 'BSMV (tax) must be a positive amount',
      },
    ],

    'premium.totalPayable': [
      {
        parse: 'money',
        min: 0,
        severity: 'critical' as ValidationSeverity,
        message: 'Total payable must be a positive amount',
      },
      {
        rule: 'premiumSumCheck',
        severity: 'warn' as ValidationSeverity,
        message: 'Total should equal net premium + BSMV',
      },
    ],

    // =========================================================================
    // COVERAGES (LIMITS)
    // =========================================================================

    'limits.collision': [
      {
        parse: 'money',
        min: 0,
        severity: 'warn' as ValidationSeverity,
        message: 'Collision limit should be specified',
      },
    ],

    'limits.theft': [
      {
        parse: 'money',
        min: 0,
        severity: 'warn' as ValidationSeverity,
        message: 'Theft limit should be specified',
      },
    ],

    'limits.fire': [
      {
        parse: 'money',
        min: 0,
        severity: 'warn' as ValidationSeverity,
        message: 'Fire limit should be specified',
      },
    ],

    'limits.naturalDisaster': [
      {
        parse: 'money',
        min: 0,
        severity: 'warn' as ValidationSeverity,
        message: 'Natural disaster limit should be specified',
      },
    ],

    'limits.imm': [
      {
        parse: 'money',
        min: 0,
        severity: 'info' as ValidationSeverity,
        message: 'İhtiyari Mali Mesuliyet (IMM) limit',
      },
    ],

    'limits.driver': [
      {
        parse: 'money',
        min: 0,
        severity: 'info' as ValidationSeverity,
        message: 'Driver personal accident limit',
      },
    ],

    'limits.passenger': [
      {
        parse: 'money',
        min: 0,
        severity: 'info' as ValidationSeverity,
        message: 'Passenger personal accident limit',
      },
    ],

    // =========================================================================
    // AGENT/BROKER
    // =========================================================================

    'agent.code': [
      {
        regex: '^\\d{4,10}$',
        severity: 'info' as ValidationSeverity,
        message: 'Agent code should be 4-10 digits',
      },
    ],

    'agent.name': [
      {
        regex: '.{3,}',
        severity: 'info' as ValidationSeverity,
        message: 'Agent name should be specified',
      },
    ],

    'agent.levhaNo': [
      {
        regex: '^[A-Z]\\d{5}-[A-Z]{2}\\d{2}$',
        severity: 'warn' as ValidationSeverity,
        message: 'Levha registration number format: TXXXXX-CEXX',
      },
    ],

    // =========================================================================
    // DOCUMENT STRUCTURE
    // =========================================================================

    'document.pageMarker': [
      {
        regex: 'Sayfa\\s*:\\s*(\\d+)\\s*/\\s*(\\d+)',
        severity: 'error' as ValidationSeverity,
        rule: 'pageSequenceMustBeContinuous',
        message: 'Page markers should be continuous',
      },
    ],
  },

  // Fields to extract
  extractionTargets: [
    // Policy identifiers
    'policy.policyNo',
    'policy.sbmRefNo',
    'policy.sbmPolicyNo',
    'policy.renewalNo',
    'policy.effectiveFrom',
    'policy.effectiveTo',
    'policy.issueDate',
    'policy.insurancePeriodDays',

    // Insurer
    'insurer.name',
    'insurer.address',

    // Insured party
    'insured.name',
    'insured.address',
    'insured.tcKimlik',
    'insured.vkn',
    'insured.customerNo',
    'insured.phone',
    'insured.email',

    // Vehicle data
    'vehicle.plate',
    'vehicle.vin',
    'vehicle.engineNo',
    'vehicle.make',
    'vehicle.model',
    'vehicle.makeModel',
    'vehicle.year',
    'vehicle.registrationDate',
    'vehicle.type',
    'vehicle.usage',
    'vehicle.color',
    'vehicle.fuelType',
    'vehicle.engineCapacity',
    'vehicle.seatCount',

    // Premium
    'premium.netPremium',
    'premium.bsmv',
    'premium.totalPayable',
    'premium.paymentMethod',
    'premium.installmentCount',

    // Coverage limits
    'limits.vehicleValue',
    'limits.collision',
    'limits.theft',
    'limits.fire',
    'limits.naturalDisaster',
    'limits.flood',
    'limits.glass',
    'limits.imm',
    'limits.immBodily',
    'limits.immMaterial',
    'limits.driver',
    'limits.passenger',
    'limits.legalProtection',
    'limits.rentalCar',
    'limits.towing',

    // Deductibles
    'deductible.collision',
    'deductible.theft',
    'deductible.glass',

    // Agent
    'agent.code',
    'agent.name',
    'agent.address',
    'agent.phone',
    'agent.levhaNo',
    'agent.personnelName',
    'agent.personnelId',
  ],
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate VIN check digit (position 9)
 */
export function validateVINCheckDigit(vin: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return false
  }

  const transliteration: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  }

  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

  let sum = 0
  for (let i = 0; i < 17; i++) {
    const char = vin[i]
    const value = /\d/.test(char) ? parseInt(char, 10) : transliteration[char] || 0
    sum += value * weights[i]
  }

  const checkDigit = sum % 11
  const expectedChar = checkDigit === 10 ? 'X' : checkDigit.toString()

  return vin[8] === expectedChar
}

/**
 * Parse Turkish plate number into components
 */
export function parseTurkishPlate(plate: string): {
  valid: boolean
  province?: number
  letters?: string
  number?: number
} {
  const normalized = plate.replace(/\s+/g, '').toUpperCase()
  const match = normalized.match(/^(\d{2})([A-ZÇĞİÖŞÜ]{1,3})(\d{2,4})$/)

  if (!match) {
    return { valid: false }
  }

  const province = parseInt(match[1], 10)
  if (province < 1 || province > 81) {
    return { valid: false }
  }

  return {
    valid: true,
    province,
    letters: match[2],
    number: parseInt(match[3], 10),
  }
}

/**
 * Known Turkish provinces by plate code
 */
export const TURKISH_PROVINCES: Record<number, string> = {
  1: 'Adana', 2: 'Adıyaman', 3: 'Afyonkarahisar', 4: 'Ağrı', 5: 'Amasya',
  6: 'Ankara', 7: 'Antalya', 8: 'Artvin', 9: 'Aydın', 10: 'Balıkesir',
  11: 'Bilecik', 12: 'Bingöl', 13: 'Bitlis', 14: 'Bolu', 15: 'Burdur',
  16: 'Bursa', 17: 'Çanakkale', 18: 'Çankırı', 19: 'Çorum', 20: 'Denizli',
  21: 'Diyarbakır', 22: 'Edirne', 23: 'Elazığ', 24: 'Erzincan', 25: 'Erzurum',
  26: 'Eskişehir', 27: 'Gaziantep', 28: 'Giresun', 29: 'Gümüşhane', 30: 'Hakkari',
  31: 'Hatay', 32: 'Isparta', 33: 'Mersin', 34: 'İstanbul', 35: 'İzmir',
  36: 'Kars', 37: 'Kastamonu', 38: 'Kayseri', 39: 'Kırklareli', 40: 'Kırşehir',
  41: 'Kocaeli', 42: 'Konya', 43: 'Kütahya', 44: 'Malatya', 45: 'Manisa',
  46: 'Kahramanmaraş', 47: 'Mardin', 48: 'Muğla', 49: 'Muş', 50: 'Nevşehir',
  51: 'Niğde', 52: 'Ordu', 53: 'Rize', 54: 'Sakarya', 55: 'Samsun',
  56: 'Siirt', 57: 'Sinop', 58: 'Sivas', 59: 'Tekirdağ', 60: 'Tokat',
  61: 'Trabzon', 62: 'Tunceli', 63: 'Şanlıurfa', 64: 'Uşak', 65: 'Van',
  66: 'Yozgat', 67: 'Zonguldak', 68: 'Aksaray', 69: 'Bayburt', 70: 'Karaman',
  71: 'Kırıkkale', 72: 'Batman', 73: 'Şırnak', 74: 'Bartın', 75: 'Ardahan',
  76: 'Iğdır', 77: 'Yalova', 78: 'Karabük', 79: 'Kilis', 80: 'Osmaniye',
  81: 'Düzce',
}
