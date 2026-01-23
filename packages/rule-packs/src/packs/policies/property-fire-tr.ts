/**
 * Turkish Property Fire Policy Pack
 */

import type { PolicyRulePack, ValidationSeverity } from '@insurai/types'

export const propertyFireTRPack: PolicyRulePack = {
  id: 'policy-property-fire-tr-v1',
  type: 'policy',
  policyType: 'property_fire',
  locales: ['tr-TR'],
  version: '1.0.0',
  active: true,
  createdAt: new Date('2026-01-23'),
  updatedAt: new Date('2026-01-23'),

  classifiers: {
    keywordsAny: ['YANGIN', 'KONUT', 'İŞYERİ', 'BİNA'],
    keywordsStrong: ['YANGIN SİGORTASI', 'KONUT SİGORTASI'],
    keywordsExclude: ['DASK', 'DEPREM', 'KASKO'],
  },

  validators: {
    'property.address': [
      {
        regex: '.{10,}',
        severity: 'critical' as ValidationSeverity,
        message: 'Property address is required',
      },
    ],
    'limits.building': [
      {
        parse: 'money',
        min: 0,
        severity: 'error' as ValidationSeverity,
        message: 'Building coverage limit',
      },
    ],
    'limits.contents': [
      {
        parse: 'money',
        min: 0,
        severity: 'warn' as ValidationSeverity,
        message: 'Contents coverage limit',
      },
    ],
  },

  extractionTargets: [
    'policy.policyNo',
    'policy.effectiveFrom',
    'policy.effectiveTo',
    'property.address',
    'property.type',
    'property.area',
    'insured.name',
    'premium.totalPayable',
    'limits.building',
    'limits.contents',
    'limits.liability',
  ],
}
