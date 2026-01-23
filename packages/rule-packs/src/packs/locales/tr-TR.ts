/**
 * Turkish (Turkey) Locale Rule Pack
 *
 * Comprehensive normalization and validation rules for Turkish insurance documents.
 * Handles:
 * - Turkish character normalization (İ/I, ı/i, etc.)
 * - OCR split-letter artifact merging
 * - Turkish number formatting (1.234,56)
 * - Date formats (DD.MM.YYYY, DD/MM/YYYY)
 * - Currency (TL, ₺, TRY)
 * - National ID (TC Kimlik) validation
 */

import type { LocaleRulePack } from '@insurai/types'

export const turkishLocalePack: LocaleRulePack = {
  id: 'locale-tr-TR-v2',
  type: 'locale',
  locale: 'tr-TR',
  version: '2.0.0',
  active: true,
  createdAt: new Date('2026-01-23'),
  updatedAt: new Date('2026-01-23'),

  normalization: {
    // Unicode normalization form
    unicode: ['NFKC'],

    // Whitespace handling
    whitespace: {
      collapseRuns: true,
      preserveParagraphs: true,
      trimLines: true,
    },

    // Turkish-specific diacritic handling
    turkishDiacritics: {
      normalizeII: true, // Handle İ/I/ı/i correctly
      preserveCase: true,
    },

    // OCR split-letter artifact merging (CRITICAL for Turkish OCR)
    splitLetterMerge: {
      enabled: true,
      patterns: [
        // Pattern 1: Single uppercase letters with spaces between
        // Matches: "B İ R L E Ş İ K" → "BİRLEŞİK"
        {
          regex: '(?<![\\p{L}])([\\p{Lu}])(?:\\s+([\\p{Lu}])){2,}(?![\\p{Ll}])',
          action: 'mergeRemoveSpacesIfAllCaps',
        },

        // Pattern 2: Mixed-length uppercase fragments
        // Matches: "GEN İŞ LETİLM İŞ" → "GENİŞLETİLMİŞ"
        {
          regex: '\\b([\\p{Lu}]{1,4})(?:\\s+([\\p{Lu}]{1,4})){2,}\\b',
          action: 'mergeRemoveSpacesIfAllCaps',
        },

        // Pattern 3: Leading uppercase + lowercase continuation
        // Matches: "M üşteri" → "Müşteri"
        {
          regex: '\\b([\\p{Lu}])\\s+([\\p{Ll}]{2,})\\b',
          action: 'mergeRemoveSpaces',
        },

        // Pattern 4: Internal lowercase spacing
        // Matches: "M üş teri" → "Müşteri"
        {
          regex: '\\b([\\p{Lu}])(?:\\s+[\\p{Ll}])+[\\p{Ll}]+\\b',
          action: 'custom',
          customHandler: 'mergeMultiSpacedWord',
        },
      ],
    },

    // Number formatting
    numberCanonicalization: {
      decimalSeparator: ',',
      thousandSeparator: '.',
      outputDecimalSeparator: '.', // Normalize to standard decimal
      preserveOriginal: true, // Keep original in evidence
    },

    // Custom rules for Turkish OCR cleanup
    customRules: [
      // Common Turkish words with known OCR patterns
      {
        id: 'tr-sigorta',
        name: 'Merge SİGORTA',
        pattern: 'S\\s*İ\\s*G\\s*O\\s*R\\s*T\\s*A',
        replacement: 'SİGORTA',
        flags: 'gi',
        order: 1,
      },
      {
        id: 'tr-police',
        name: 'Merge POLİÇE',
        pattern: 'P\\s*O\\s*L\\s*İ\\s*Ç\\s*E',
        replacement: 'POLİÇE',
        flags: 'gi',
        order: 2,
      },
      {
        id: 'tr-kasko',
        name: 'Merge KASKO',
        pattern: 'K\\s*A\\s*S\\s*K\\s*O',
        replacement: 'KASKO',
        flags: 'gi',
        order: 3,
      },
      {
        id: 'tr-birlesik',
        name: 'Merge BİRLEŞİK',
        pattern: 'B\\s*İ\\s*R\\s*L\\s*E\\s*Ş\\s*İ\\s*K',
        replacement: 'BİRLEŞİK',
        flags: 'gi',
        order: 4,
      },
      {
        id: 'tr-genisletilmis',
        name: 'Merge GENİŞLETİLMİŞ',
        pattern: 'G\\s*E\\s*N\\s*İ\\s*Ş\\s*L\\s*E\\s*T\\s*İ\\s*L\\s*M\\s*İ\\s*Ş',
        replacement: 'GENİŞLETİLMİŞ',
        flags: 'gi',
        order: 5,
      },
      {
        id: 'tr-turkiye',
        name: 'Merge TÜRKİYE',
        pattern: 'T\\s*Ü\\s*R\\s*K\\s*İ\\s*Y\\s*E',
        replacement: 'TÜRKİYE',
        flags: 'gi',
        order: 6,
      },
      {
        id: 'tr-sirket',
        name: 'Merge ŞİRKET',
        pattern: 'Ş\\s*İ\\s*R\\s*K\\s*E\\s*T',
        replacement: 'ŞİRKET',
        flags: 'gi',
        order: 7,
      },
      {
        id: 'tr-anonim',
        name: 'Merge ANONİM',
        pattern: 'A\\s*N\\s*O\\s*N\\s*İ\\s*M',
        replacement: 'ANONİM',
        flags: 'gi',
        order: 8,
      },
      {
        id: 'tr-sozlesme',
        name: 'Merge SÖZLEŞME',
        pattern: 'S\\s*Ö\\s*Z\\s*L\\s*E\\s*Ş\\s*M\\s*E',
        replacement: 'SÖZLEŞME',
        flags: 'gi',
        order: 9,
      },
      {
        id: 'tr-taraflari',
        name: 'Merge TARAFLARI',
        pattern: 'T\\s*A\\s*R\\s*A\\s*F\\s*L\\s*A\\s*R\\s*I',
        replacement: 'TARAFLARI',
        flags: 'gi',
        order: 10,
      },
      {
        id: 'tr-bilgileri',
        name: 'Merge BİLGİLERİ',
        pattern: 'B\\s*İ\\s*L\\s*G\\s*İ\\s*L\\s*E\\s*R\\s*İ',
        replacement: 'BİLGİLERİ',
        flags: 'gi',
        order: 11,
      },
      {
        id: 'tr-prim',
        name: 'Merge PRİM',
        pattern: 'P\\s*R\\s*İ\\s*M',
        replacement: 'PRİM',
        flags: 'gi',
        order: 12,
      },
      {
        id: 'tr-odeme',
        name: 'Merge ÖDEME',
        pattern: 'Ö\\s*D\\s*E\\s*M\\s*E',
        replacement: 'ÖDEME',
        flags: 'gi',
        order: 13,
      },
      {
        id: 'tr-plani',
        name: 'Merge PLANI',
        pattern: 'P\\s*L\\s*A\\s*N\\s*I',
        replacement: 'PLANI',
        flags: 'gi',
        order: 14,
      },
      {
        id: 'tr-arac',
        name: 'Merge ARAÇ',
        pattern: 'A\\s*R\\s*A\\s*Ç',
        replacement: 'ARAÇ',
        flags: 'gi',
        order: 15,
      },
      {
        id: 'tr-konusu',
        name: 'Merge KONUSU',
        pattern: 'K\\s*O\\s*N\\s*U\\s*S\\s*U',
        replacement: 'KONUSU',
        flags: 'gi',
        order: 16,
      },
      {
        id: 'tr-istanbul',
        name: 'Merge İSTANBUL',
        pattern: 'İ\\s*S\\s*T\\s*A\\s*N\\s*B\\s*U\\s*L',
        replacement: 'İSTANBUL',
        flags: 'gi',
        order: 17,
      },
      {
        id: 'tr-ankara',
        name: 'Merge ANKARA',
        pattern: 'A\\s*N\\s*K\\s*A\\s*R\\s*A',
        replacement: 'ANKARA',
        flags: 'gi',
        order: 18,
      },
      {
        id: 'tr-antalya',
        name: 'Merge ANTALYA',
        pattern: 'A\\s*N\\s*T\\s*A\\s*L\\s*Y\\s*A',
        replacement: 'ANTALYA',
        flags: 'gi',
        order: 19,
      },
      {
        id: 'tr-teminatlar',
        name: 'Merge TEMİNATLAR',
        pattern: 'T\\s*E\\s*M\\s*İ\\s*N\\s*A\\s*T\\s*L\\s*A\\s*R',
        replacement: 'TEMİNATLAR',
        flags: 'gi',
        order: 20,
      },
      {
        id: 'tr-muafiyetler',
        name: 'Merge MUAFİYETLER',
        pattern: 'M\\s*U\\s*A\\s*F\\s*İ\\s*Y\\s*E\\s*T\\s*L\\s*E\\s*R',
        replacement: 'MUAFİYETLER',
        flags: 'gi',
        order: 21,
      },
      {
        id: 'tr-policesi-suffix',
        name: 'Merge POLİÇESİ',
        pattern: 'P\\s*O\\s*L\\s*İ\\s*Ç\\s*E\\s*S\\s*İ',
        replacement: 'POLİÇESİ',
        flags: 'gi',
        order: 22,
      },
      {
        id: 'tr-sirketi-suffix',
        name: 'Merge ŞİRKETİ',
        pattern: 'Ş\\s*İ\\s*R\\s*K\\s*E\\s*T\\s*İ',
        replacement: 'ŞİRKETİ',
        flags: 'gi',
        order: 23,
      },

      // Lowercase patterns
      {
        id: 'tr-musteri',
        name: 'Merge Müşteri',
        pattern: 'M\\s*ü\\s*ş\\s*t\\s*e\\s*r\\s*i',
        replacement: 'Müşteri',
        flags: 'gi',
        order: 24,
      },
      {
        id: 'tr-duzenleme',
        name: 'Merge Düzenleme',
        pattern: 'D\\s*ü\\s*z\\s*e\\s*n\\s*l\\s*e\\s*m\\s*e',
        replacement: 'Düzenleme',
        flags: 'gi',
        order: 25,
      },
      {
        id: 'tr-sasi',
        name: 'Merge Şasi',
        pattern: 'Ş\\s*a\\s*s\\s*i',
        replacement: 'Şasi',
        flags: 'gi',
        order: 26,
      },
      {
        id: 'tr-gun',
        name: 'Merge gün',
        pattern: 'g\\s*ü\\s*n',
        replacement: 'gün',
        flags: 'g',
        order: 27,
      },
      {
        id: 'tr-sure',
        name: 'Merge süre',
        pattern: 's\\s*ü\\s*r\\s*e',
        replacement: 'süre',
        flags: 'g',
        order: 28,
      },

      // Barcode/garbage removal patterns
      {
        id: 'tr-barcode-b',
        name: 'Remove B^^^B patterns',
        pattern: 'B[\\^<>]+B[^\\s\\n]*',
        replacement: '',
        flags: 'gi',
        order: 100,
      },
      {
        id: 'tr-barcode-a',
        name: 'Remove a!!!a patterns',
        pattern: 'a!{2,}[aA!]*',
        replacement: '',
        flags: 'gi',
        order: 101,
      },
      {
        id: 'tr-garbage-punct',
        name: 'Remove punctuation runs',
        pattern: '[!^~_<>|]{3,}[^\\s\\n]*',
        replacement: '',
        flags: 'g',
        order: 102,
      },
      {
        id: 'tr-garbage-special',
        name: 'Remove special char clusters',
        pattern: '[<>\\[\\]{}|\\\\^$@#]{4,}',
        replacement: '',
        flags: 'g',
        order: 103,
      },
      {
        id: 'tr-garbage-mixed',
        name: 'Remove mixed garbage',
        pattern: '\\(\\([^)]*\\$[^)]*\\)\\)',
        replacement: '',
        flags: 'g',
        order: 104,
      },
      {
        id: 'tr-garbage-dollar',
        name: 'Remove $$ patterns',
        pattern: '\\$\\$[^$]+\\$\\$',
        replacement: '',
        flags: 'g',
        order: 105,
      },

      // Glued word splitting
      {
        id: 'tr-split-sigortasirket',
        name: 'Split Sigortaşirket',
        pattern: 'Sigorta(ş|Ş)irket(i)?',
        replacement: 'Sigorta Şirketi',
        flags: 'gi',
        order: 200,
      },
      {
        id: 'tr-split-sigortaliadi',
        name: 'Split sigortalıAdı',
        pattern: 'sigortalıAdı',
        replacement: 'Sigortalı Adı',
        flags: 'gi',
        order: 201,
      },
      {
        id: 'tr-split-hususiotomobil',
        name: 'Split HUSUSİOTOMOBİL',
        pattern: 'HUSUSİOTOMOBİL',
        replacement: 'HUSUSİ OTOMOBİL',
        flags: 'g',
        order: 202,
      },
      {
        id: 'tr-split-sanayive',
        name: 'Split SANAYİVE',
        pattern: 'SANAYİVE',
        replacement: 'SANAYİ VE',
        flags: 'g',
        order: 203,
      },
      {
        id: 'tr-split-limitedsirket',
        name: 'Split LİMİTEDŞİRKET',
        pattern: 'LİMİTEDŞİRKET',
        replacement: 'LİMİTED ŞİRKETİ',
        flags: 'g',
        order: 204,
      },
      {
        id: 'tr-split-sitesisit',
        name: 'Split SİTESİSit',
        pattern: 'SİTESİSit',
        replacement: 'SİTESİ Sit',
        flags: 'g',
        order: 205,
      },
      {
        id: 'tr-split-bilgileri-plaka',
        name: 'Split BİLGİLERİPlaka',
        pattern: 'BİLGİLERİPlaka',
        replacement: 'BİLGİLERİ Plaka',
        flags: 'g',
        order: 206,
      },
      {
        id: 'tr-split-bilgileri-tutar',
        name: 'Split BİLGİLERİTUTAR',
        pattern: 'BİLGİLERİTUTAR',
        replacement: 'BİLGİLERİ TUTAR',
        flags: 'g',
        order: 207,
      },
      {
        id: 'tr-split-tarihi-tutar',
        name: 'Split TARİHİTUTAR',
        pattern: 'TARİHİTUTAR',
        replacement: 'TARİHİ TUTAR',
        flags: 'g',
        order: 208,
      },

      // Label normalization
      {
        id: 'tr-label-policeno',
        name: 'Normalize poliçeNo',
        pattern: 'poli(ç|c)eNo',
        replacement: 'Poliçe No',
        flags: 'gi',
        order: 300,
      },
      {
        id: 'tr-label-policevadesi',
        name: 'Normalize poliçeVadesi',
        pattern: 'poli(ç|c)eVadesi',
        replacement: 'Poliçe Vadesi',
        flags: 'gi',
        order: 301,
      },
      {
        id: 'tr-label-adisoyadı',
        name: 'Normalize AdıSoyadı',
        pattern: 'AdıSoyadı',
        replacement: 'Adı Soyadı',
        flags: 'g',
        order: 302,
      },

      // Abbreviation spacing
      {
        id: 'tr-abbrev-mah',
        name: 'Space after MAH.',
        pattern: 'MAH\\.([A-ZÇĞİÖŞÜa-zçğıöşü])',
        replacement: 'MAH. $1',
        flags: 'g',
        order: 400,
      },
      {
        id: 'tr-abbrev-sok',
        name: 'Space after SOK.',
        pattern: 'SOK\\.([A-ZÇĞİÖŞÜa-zçğıöşü])',
        replacement: 'SOK. $1',
        flags: 'g',
        order: 401,
      },
      {
        id: 'tr-abbrev-cad',
        name: 'Space after CAD.',
        pattern: 'CAD\\.([A-ZÇĞİÖŞÜa-zçğıöşü])',
        replacement: 'CAD. $1',
        flags: 'g',
        order: 402,
      },
    ],
  },

  validators: {
    // Date formats used in Turkey
    date: [
      { format: 'dd.MM.yyyy', strict: true },
      { format: 'dd/MM/yyyy', strict: true },
      { format: 'dd-MM-yyyy', strict: false },
      { format: 'yyyy-MM-dd', strict: true }, // ISO format
    ],

    // Currency
    currency: [
      { code: 'TRY', symbols: ['TL', '₺', 'TRY', 'Türk Lirası'] },
    ],

    // Phone numbers
    phone: [
      { pattern: '^\\+90\\s?\\d{3}\\s?\\d{3}\\s?\\d{2}\\s?\\d{2}$', description: 'Turkish mobile (+90)' },
      { pattern: '^0\\d{3}\\s?\\d{3}\\s?\\d{2}\\s?\\d{2}$', description: 'Turkish mobile (0XXX)' },
      { pattern: '^\\d{3}\\s?\\d{3}\\s?\\d{2}\\s?\\d{2}$', description: 'Turkish mobile (XXX)' },
      { pattern: '^0?\\d{3}\\s?\\d{7}$', description: 'Turkish landline' },
    ],

    // Postal codes
    postalCode: [
      { pattern: '^\\d{5}$', description: 'Turkish postal code (5 digits)' },
    ],

    // National ID (TC Kimlik)
    nationalId: [
      {
        pattern: '^[1-9]\\d{10}$',
        checksum: 'tckimlik',
        description: 'TC Kimlik No (11 digits, Luhn-like checksum)',
      },
    ],
  },
}

// ============================================================================
// HELPER: TC Kimlik Checksum Validation
// ============================================================================

/**
 * Validate Turkish TC Kimlik number checksum
 */
export function validateTCKimlik(tcNo: string): boolean {
  if (!/^[1-9]\d{10}$/.test(tcNo)) {
    return false
  }

  const digits = tcNo.split('').map(Number)

  // Calculate 10th digit
  const odd = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
  const even = digits[1] + digits[3] + digits[5] + digits[7]
  const calc10 = ((odd * 7) - even) % 10
  if (calc10 < 0 || calc10 !== digits[9]) {
    return false
  }

  // Calculate 11th digit
  const sum10 = digits.slice(0, 10).reduce((a, b) => a + b, 0)
  const calc11 = sum10 % 10
  if (calc11 !== digits[10]) {
    return false
  }

  return true
}
