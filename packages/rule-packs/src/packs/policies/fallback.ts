/**
 * Fallback Policy Pack
 *
 * Used when policy type cannot be detected.
 * Applies minimal validation and extracts common fields.
 */

import type { PolicyRulePack, ValidationSeverity } from '@insurai/types'

export const fallbackPolicyPack: PolicyRulePack = {
  id: 'policy-fallback-v1',
  type: 'policy',
  policyType: 'unknown',
  locales: ['*'],
  version: '1.0.0',
  active: true,
  createdAt: new Date('2026-01-23'),
  updatedAt: new Date('2026-01-23'),

  classifiers: {
    keywordsAny: ['policy', 'insurance', 'coverage', 'premium'],
    keywordsStrong: [],
  },

  validators: {
    'policy.policyNo': [
      {
        regex: '.{3,}',
        severity: 'error' as ValidationSeverity,
        message: 'Policy number should be present',
      },
    ],
    'policy.effectiveFrom': [
      {
        parse: 'date',
        severity: 'error' as ValidationSeverity,
        message: 'Effective from date should be valid',
      },
    ],
    'policy.effectiveTo': [
      {
        parse: 'date',
        severity: 'error' as ValidationSeverity,
        message: 'Effective to date should be valid',
      },
    ],
  },

  extractionTargets: [
    'policy.policyNo',
    'policy.effectiveFrom',
    'policy.effectiveTo',
    'insured.name',
    'insurer.name',
    'premium.totalPayable',
  ],
}
