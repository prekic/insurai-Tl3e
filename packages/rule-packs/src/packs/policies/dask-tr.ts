/**
 * Turkish DASK (Earthquake) Policy Pack
 */

import type { PolicyRulePack, ValidationSeverity } from '@insurai/types'

export const daskTRPack: PolicyRulePack = {
  id: 'policy-dask-tr-v1',
  type: 'policy',
  policyType: 'property_dask',
  locales: ['tr-TR'],
  version: '1.0.0',
  active: true,
  createdAt: new Date('2026-01-23'),
  updatedAt: new Date('2026-01-23'),

  classifiers: {
    keywordsAny: ['DASK', 'DEPREM', 'ZORUNLU DEPREM'],
    keywordsStrong: ['DASK POLİÇESİ', 'ZORUNLU DEPREM SİGORTASI'],
    keywordsExclude: ['KASKO', 'TRAFİK'],
  },

  validators: {
    'policy.daskNo': [
      {
        regex: '^\\d{10,20}$',
        severity: 'critical' as ValidationSeverity,
        message: 'DASK policy number required',
      },
    ],
    'property.uavtCode': [
      {
        regex: '^\\d{10}$',
        severity: 'error' as ValidationSeverity,
        message: 'UAVT address code should be 10 digits',
      },
    ],
    'limits.building': [
      {
        parse: 'money',
        min: 0,
        max: 1000000, // DASK has maximum limits
        severity: 'error' as ValidationSeverity,
        message: 'DASK building coverage limit',
      },
    ],
  },

  extractionTargets: [
    'policy.policyNo',
    'policy.daskNo',
    'policy.effectiveFrom',
    'policy.effectiveTo',
    'property.address',
    'property.uavtCode',
    'property.constructionYear',
    'property.area',
    'property.floors',
    'insured.name',
    'premium.totalPayable',
    'limits.building',
  ],
}
