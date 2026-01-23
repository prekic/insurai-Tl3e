/**
 * English (UK) Locale Rule Pack
 */

import type { LocaleRulePack } from '@insurai/types'

export const englishGBLocalePack: LocaleRulePack = {
  id: 'locale-en-GB-v1',
  type: 'locale',
  locale: 'en-GB',
  version: '1.0.0',
  active: true,
  createdAt: new Date('2026-01-23'),
  updatedAt: new Date('2026-01-23'),

  normalization: {
    unicode: ['NFKC'],
    whitespace: {
      collapseRuns: true,
      preserveParagraphs: true,
      trimLines: true,
    },
    splitLetterMerge: {
      enabled: true,
      patterns: [
        {
          regex: '(?<![\\p{L}])([\\p{Lu}])(?:\\s+([\\p{Lu}])){2,}(?![\\p{Ll}])',
          action: 'mergeRemoveSpacesIfAllCaps',
        },
      ],
    },
    numberCanonicalization: {
      decimalSeparator: '.',
      thousandSeparator: ',',
      outputDecimalSeparator: '.',
      preserveOriginal: true,
    },
    customRules: [],
  },

  validators: {
    date: [
      { format: 'dd/MM/yyyy', strict: true },
      { format: 'dd-MM-yyyy', strict: false },
      { format: 'yyyy-MM-dd', strict: true },
    ],
    currency: [
      { code: 'GBP', symbols: ['£', 'GBP'] },
    ],
    phone: [
      { pattern: '^\\+44\\s?\\d{2,4}\\s?\\d{3,}$', description: 'UK phone' },
      { pattern: '^0\\d{2,4}\\s?\\d{3,}$', description: 'UK phone (0XXX)' },
    ],
    postalCode: [
      { pattern: '^[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}$', description: 'UK postcode' },
    ],
  },
}
