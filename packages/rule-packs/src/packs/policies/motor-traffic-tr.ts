/**
 * Turkish Motor Traffic (ZMSS) Policy Pack
 *
 * Zorunlu Mali Sorumluluk Sigortası (Mandatory Third Party Liability)
 */

import type { PolicyRulePack, ValidationSeverity } from '@insurai/types'

export const motorTrafficTRPack: PolicyRulePack = {
  id: 'policy-motor-traffic-tr-v1',
  type: 'policy',
  policyType: 'motor_traffic',
  locales: ['tr-TR'],
  version: '1.0.0',
  active: true,
  createdAt: new Date('2026-01-23'),
  updatedAt: new Date('2026-01-23'),

  classifiers: {
    keywordsAny: ['TRAFİK', 'ZMSS', 'MALİ SORUMLULUK', 'ZORUNLU'],
    keywordsStrong: [
      'TRAFİK SİGORTASI',
      'ZORUNLU MALİ SORUMLULUK SİGORTASI',
      'ZMSS POLİÇESİ',
    ],
    keywordsExclude: ['KASKO'],
  },

  validators: {
    'vehicle.plate': [
      {
        regex: '^\\d{2}\\s?[A-ZÇĞİÖŞÜ]{1,3}\\s?\\d{2,4}$',
        severity: 'critical' as ValidationSeverity,
        message: 'Turkish plate format required',
      },
    ],
    'limits.bodilyInjuryPerPerson': [
      {
        parse: 'money',
        min: 0,
        severity: 'error' as ValidationSeverity,
        message: 'Bodily injury per person limit required',
      },
    ],
    'limits.bodilyInjuryPerAccident': [
      {
        parse: 'money',
        min: 0,
        severity: 'error' as ValidationSeverity,
        message: 'Bodily injury per accident limit required',
      },
    ],
    'limits.propertyDamagePerAccident': [
      {
        parse: 'money',
        min: 0,
        severity: 'error' as ValidationSeverity,
        message: 'Property damage per accident limit required',
      },
    ],
  },

  extractionTargets: [
    'policy.policyNo',
    'policy.effectiveFrom',
    'policy.effectiveTo',
    'vehicle.plate',
    'vehicle.vin',
    'insured.name',
    'premium.totalPayable',
    'limits.bodilyInjuryPerPerson',
    'limits.bodilyInjuryPerAccident',
    'limits.propertyDamagePerAccident',
    'limits.propertyDamagePerVehicle',
  ],
}
