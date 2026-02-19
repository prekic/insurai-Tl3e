/**
 * Data Requests - Coverage Tests
 *
 * Targets uncovered branches in data-requests.ts
 */

import { describe, it, expect } from 'vitest'
import {
  generateDataRequests,
  formatDataRequestsChecklist,
  isDataMissing,
  type DataRequestsInput,
} from './data-requests'
import type {
  KaskoExtractionJSON,
  ExtractionError,
  NormalizationWarning,
} from '@/types/extraction-pipeline'

function createExtraction(overrides: Partial<KaskoExtractionJSON> = {}): KaskoExtractionJSON {
  return {
    policyNumber: 'POL-123456',
    endorsementNumber: null,
    provider: 'Allianz',
    agencyCode: null,
    agencyName: null,
    issueDate: '2026-01-01',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    isRenewal: false,
    insured: { name: 'Ahmet Yilmaz', tcKimlikNo: null, taxNo: null, address: null, phone: null, email: null },
    policyHolder: null,
    beneficiary: null,
    vehicles: [{ plate: '34 ABC 1234', make: 'Toyota', model: 'Corolla', year: 2022, chassisNo: 'VIN123', engineNo: null, color: null, usage: null, vehicleClass: null, fuelType: null, vehicleValue: { amount: 500000, isMarketValue: false, currency: 'TRY' } }],
    premium: { gross: 15000, net: 12000, tax: 3000, currency: 'TRY' },
    paymentInfo: null,
    coverages: [{ id: 'cov1', name: 'Collision', nameTr: 'Carpma', limit: 500000, deductible: 1000, deductiblePercent: null, isUnlimited: false, isMarketValue: false, isIncluded: true, category: 'main' }],
    exclusions: [],
    specialConditions: [],
    clauses: [],
    amendment: { isAmendment: false, type: null, reason: null, basePolicyNumber: null, premiumDifference: null },
    documentType: 'policy',
    extractionConfidence: 0.9,
    ...overrides,
  }
}

function createInput(overrides: Partial<DataRequestsInput> = {}): DataRequestsInput {
  return {
    extraction: createExtraction(),
    errors: [],
    normalizationWarnings: [],
    ...overrides,
  }
}

describe('data-requests coverage', () => {
  describe('generateDataRequests', () => {
    it('returns empty for complete extraction', () => {
      const report = generateDataRequests(createInput())
      expect(report.requests).toHaveLength(0)
      expect(report.canFinalize).toBe(true)
    })

    it('flags missing policy number as critical', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ policyNumber: null }) }))
      expect(report.requests.some(r => r.id === 'missing-policy-number')).toBe(true)
      expect(report.canFinalize).toBe(false)
    })

    it('flags missing startDate', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ startDate: null }) }))
      const req = report.requests.find(r => r.id === 'missing-dates')
      expect(req).toBeTruthy()
      expect(req!.affectedFields).toContain('startDate')
    })

    it('flags missing endDate', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ endDate: null }) }))
      expect(report.requests.some(r => r.id === 'missing-dates')).toBe(true)
    })

    it('flags missing both dates', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ startDate: null, endDate: null }) }))
      const req = report.requests.find(r => r.id === 'missing-dates')
      expect(req!.affectedFields).toContain('startDate')
      expect(req!.affectedFields).toContain('endDate')
    })

    it('flags missing premium (no gross or net)', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ premium: { gross: null, net: null, tax: null, currency: 'TRY' } }) }))
      expect(report.requests.some(r => r.id === 'missing-premium')).toBe(true)
    })

    it('does not flag premium when net is present', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ premium: { gross: null, net: 10000, tax: null, currency: 'TRY' } }) }))
      expect(report.requests.some(r => r.id === 'missing-premium')).toBe(false)
    })

    it('flags missing vehicles', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ vehicles: [] }) }))
      expect(report.requests.some(r => r.id === 'missing-vehicle')).toBe(true)
    })

    it('flags missing plate per vehicle', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ vehicles: [{ plate: null, make: null, model: null, year: null, chassisNo: 'VIN', engineNo: null, color: null, usage: null, vehicleClass: null, fuelType: null, vehicleValue: { amount: 500000, isMarketValue: false, currency: 'TRY' } }] }) }))
      expect(report.requests.some(r => r.id === 'missing-plate-0')).toBe(true)
    })

    it('flags missing chassisNo per vehicle', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ vehicles: [{ plate: '34 ABC 1234', make: null, model: null, year: null, chassisNo: null, engineNo: null, color: null, usage: null, vehicleClass: null, fuelType: null, vehicleValue: { amount: 500000, isMarketValue: false, currency: 'TRY' } }] }) }))
      expect(report.requests.some(r => r.id === 'missing-chassis-0')).toBe(true)
    })

    it('flags missing vehicle value', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ vehicles: [{ plate: '34 ABC 1234', make: null, model: null, year: null, chassisNo: 'VIN', engineNo: null, color: null, usage: null, vehicleClass: null, fuelType: null, vehicleValue: { amount: null, isMarketValue: false, currency: 'TRY' } }] }) }))
      expect(report.requests.some(r => r.id === 'missing-value-0')).toBe(true)
    })

    it('does not flag vehicle value when isMarketValue', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ vehicles: [{ plate: '34 ABC 1234', make: null, model: null, year: null, chassisNo: 'VIN', engineNo: null, color: null, usage: null, vehicleClass: null, fuelType: null, vehicleValue: { amount: null, isMarketValue: true, currency: 'TRY' } }] }) }))
      expect(report.requests.some(r => r.id === 'missing-value-0')).toBe(false)
    })

    it('flags missing insured name', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ insured: { name: null, tcKimlikNo: null, taxNo: null, address: null, phone: null, email: null } }) }))
      expect(report.requests.some(r => r.id === 'missing-insured-name')).toBe(true)
    })

    it('flags missing provider', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ provider: null }) }))
      expect(report.requests.some(r => r.id === 'missing-provider')).toBe(true)
    })

    it('flags missing coverages', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ coverages: [] }) }))
      expect(report.requests.some(r => r.id === 'missing-coverages')).toBe(true)
    })

    it('flags coverages without limits (more than 3 for truncation)', () => {
      const coverages = Array.from({ length: 5 }, (_, i) => ({
        id: `cov${i}`, name: `Cov${i}`, nameTr: `Tem${i}`, limit: null, deductible: null, deductiblePercent: null, isUnlimited: false, isMarketValue: false, isIncluded: true, category: 'main' as const,
      }))
      const report = generateDataRequests(createInput({ extraction: createExtraction({ coverages }) }))
      const req = report.requests.find(r => r.id === 'missing-coverage-limits')
      expect(req).toBeTruthy()
      expect(req!.description).toContain('...')
    })

    it('does not flag unlimited/marketValue coverages without limits', () => {
      const coverages = [
        { id: 'c1', name: 'A', nameTr: 'A', limit: null, deductible: null, deductiblePercent: null, isUnlimited: true, isMarketValue: false, isIncluded: true, category: 'main' as const },
        { id: 'c2', name: 'B', nameTr: 'B', limit: null, deductible: null, deductiblePercent: null, isUnlimited: false, isMarketValue: true, isIncluded: true, category: 'main' as const },
      ]
      const report = generateDataRequests(createInput({ extraction: createExtraction({ coverages }) }))
      expect(report.requests.some(r => r.id === 'missing-coverage-limits')).toBe(false)
    })

    it('handles critical missing_required errors', () => {
      const errors: ExtractionError[] = [{ type: 'missing_required', field: 'policyNumber', message: 'Missing', severity: 'critical' }]
      const report = generateDataRequests(createInput({ errors }))
      expect(report.requests.some(r => r.id === 'missing-critical-fields')).toBe(true)
    })

    it('ignores non-critical missing_required errors for critical fields', () => {
      const errors: ExtractionError[] = [{ type: 'missing_required', field: 'agencyName', message: 'Missing', severity: 'low' }]
      const report = generateDataRequests(createInput({ errors }))
      expect(report.requests.some(r => r.id === 'missing-critical-fields')).toBe(false)
    })

    it('handles parse_error type errors', () => {
      const errors: ExtractionError[] = [{ type: 'parse_error', field: 'premium', message: 'Parse fail', severity: 'medium' }]
      const report = generateDataRequests(createInput({ errors }))
      expect(report.requests.some(r => r.id === 'illegible-sections')).toBe(true)
    })

    it('handles ambiguous_value type errors with truncation', () => {
      const errors: ExtractionError[] = [
        { type: 'ambiguous_value', field: 'f1', message: 'A', severity: 'medium' },
        { type: 'ambiguous_value', field: 'f2', message: 'A', severity: 'medium' },
        { type: 'ambiguous_value', field: 'f3', message: 'A', severity: 'medium' },
        { type: 'ambiguous_value', field: 'f4', message: 'A', severity: 'medium' },
      ]
      const report = generateDataRequests(createInput({ errors }))
      const req = report.requests.find(r => r.id === 'ambiguous-values')
      expect(req).toBeTruthy()
    })

    it('handles truncation warnings', () => {
      const warnings: NormalizationWarning[] = [{ type: 'truncation', message: 'Truncated', severity: 'high' }]
      const report = generateDataRequests(createInput({ normalizationWarnings: warnings }))
      expect(report.requests.some(r => r.id === 'truncated-document')).toBe(true)
    })

    it('handles garbled_text warnings', () => {
      const warnings: NormalizationWarning[] = [{ type: 'garbled_text', message: 'Garbled', severity: 'medium' }]
      const report = generateDataRequests(createInput({ normalizationWarnings: warnings }))
      expect(report.requests.some(r => r.id === 'garbled-text')).toBe(true)
    })

    it('handles missing_section warnings', () => {
      const warnings: NormalizationWarning[] = [{ type: 'missing_section', message: 'TEMİNATLAR', severity: 'medium' }]
      const report = generateDataRequests(createInput({ normalizationWarnings: warnings }))
      expect(report.requests.some(r => r.id === 'missing-sections')).toBe(true)
    })

    it('flags amendment missing base policy', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ amendment: { isAmendment: true, type: null, reason: null, basePolicyNumber: null, premiumDifference: null } }) }))
      expect(report.requests.some(r => r.id === 'missing-base-policy')).toBe(true)
    })

    it('flags amendment missing premium difference', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ amendment: { isAmendment: true, type: null, reason: null, basePolicyNumber: 'POL-100', premiumDifference: null } }) }))
      expect(report.requests.some(r => r.id === 'missing-premium-diff')).toBe(true)
    })

    it('does not flag amendment fields for non-amendments', () => {
      const report = generateDataRequests(createInput())
      expect(report.requests.some(r => r.id === 'missing-base-policy')).toBe(false)
    })

    it('sorts by priority', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ policyNumber: null, provider: null }) }))
      if (report.requests.length >= 2) {
        const priorities = report.requests.map(r => r.priority)
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
        for (let i = 1; i < priorities.length; i++) {
          expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]])
        }
      }
    })

    it('calculates blockers including high+missing_page', () => {
      const errors: ExtractionError[] = [{ type: 'missing_required', field: 'policyNumber', message: 'M', severity: 'critical' }]
      const report = generateDataRequests(createInput({ errors }))
      expect(report.summary.blockers).toBeGreaterThanOrEqual(1)
    })
  })

  describe('formatDataRequestsChecklist', () => {
    it('returns success message for no requests', () => {
      const report = generateDataRequests(createInput())
      expect(formatDataRequestsChecklist(report)).toContain('Tüm gerekli veriler mevcut')
    })

    it('includes critical section', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ policyNumber: null }) }))
      expect(formatDataRequestsChecklist(report)).toContain('Kritik Eksikler')
    })

    it('includes high priority section', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ provider: null }) }))
      expect(formatDataRequestsChecklist(report)).toContain('Yüksek Öncelikli')
    })

    it('includes medium priority section', () => {
      const warnings: NormalizationWarning[] = [{ type: 'garbled_text', message: 'Bad', severity: 'medium' }]
      const report = generateDataRequests(createInput({ normalizationWarnings: warnings }))
      expect(formatDataRequestsChecklist(report)).toContain('Orta Öncelikli')
    })

    it('includes cannot finalize warning', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ policyNumber: null }) }))
      expect(formatDataRequestsChecklist(report)).toContain('sonuçlandırılamaz')
    })
  })

  describe('isDataMissing', () => {
    it('returns true for present type', () => {
      const report = generateDataRequests(createInput({ extraction: createExtraction({ vehicles: [] }) }))
      expect(isDataMissing(report, 'missing_annex')).toBe(true)
    })

    it('returns false for absent type', () => {
      const report = generateDataRequests(createInput())
      expect(isDataMissing(report, 'missing_page')).toBe(false)
    })
  })
})
