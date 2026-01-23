/**
 * Fallback Locale Rule Pack
 *
 * Used when locale cannot be detected or is not supported.
 * Applies minimal, safe normalization rules.
 */

import type { LocaleRulePack } from '@insurai/types'

export const fallbackLocalePack: LocaleRulePack = {
  id: 'locale-fallback-v1',
  type: 'locale',
  locale: 'fallback',
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
        // Generic single-letter sequence merging
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

    customRules: [
      // Remove common barcode patterns
      {
        id: 'fallback-barcode-b',
        name: 'Remove B^^^B patterns',
        pattern: 'B[\\^<>]+B[^\\s\\n]*',
        replacement: '',
        flags: 'gi',
        order: 100,
      },
      {
        id: 'fallback-barcode-a',
        name: 'Remove a!!!a patterns',
        pattern: 'a!{2,}[aA!]*',
        replacement: '',
        flags: 'gi',
        order: 101,
      },
      {
        id: 'fallback-garbage',
        name: 'Remove garbage clusters',
        pattern: '[<>\\[\\]{}|\\\\^$@#]{4,}',
        replacement: '',
        flags: 'g',
        order: 102,
      },
    ],
  },

  validators: {
    date: [
      { format: 'yyyy-MM-dd', strict: true },
      { format: 'dd/MM/yyyy', strict: true },
      { format: 'MM/dd/yyyy', strict: true },
      { format: 'dd.MM.yyyy', strict: true },
    ],

    currency: [
      { code: 'USD', symbols: ['$', 'USD'] },
      { code: 'EUR', symbols: ['€', 'EUR'] },
      { code: 'GBP', symbols: ['£', 'GBP'] },
    ],
  },
}
