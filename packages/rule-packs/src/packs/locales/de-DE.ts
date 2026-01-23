/**
 * German (Germany) Locale Rule Pack
 */

import type { LocaleRulePack } from '@insurai/types'

export const germanLocalePack: LocaleRulePack = {
  id: 'locale-de-DE-v1',
  type: 'locale',
  locale: 'de-DE',
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
      decimalSeparator: ',',
      thousandSeparator: '.',
      outputDecimalSeparator: '.',
      preserveOriginal: true,
    },
    customRules: [],
  },

  validators: {
    date: [
      { format: 'dd.MM.yyyy', strict: true },
      { format: 'dd/MM/yyyy', strict: false },
      { format: 'yyyy-MM-dd', strict: true },
    ],
    currency: [
      { code: 'EUR', symbols: ['€', 'EUR', 'Euro'] },
    ],
    phone: [
      { pattern: '^\\+49\\s?\\d{2,4}\\s?\\d{3,}$', description: 'German phone' },
      { pattern: '^0\\d{2,4}\\s?\\d{3,}$', description: 'German phone (0XXX)' },
    ],
    postalCode: [
      { pattern: '^\\d{5}$', description: 'German postal code (5 digits)' },
    ],
  },
}
