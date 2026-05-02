/**
 * Sprint 1 PR-S1.3 — verifies the 80% Kullanım Şekli scenario surfaces
 * in Critical Financial Risks for the Round-4 reviewer's Anadolu policy.
 *
 * Pipeline:
 *   1. PR-S1.2 broadened classifyExclusions regex so the kloz text matches
 *      and produces a canonical "Rent-a-car / ticari kullanım: %80" entry
 *      in policy.conditionalDeductibles[]
 *   2. evaluator.ts:1480 reads each entry, calls
 *      bucketConditionalDeductibleSeverity(scenario)
 *   3. Bucketer returns severity='critical' for percent >= 80
 *   4. Issue gets pushed to compliance.issues[] with the canonical label
 *      as descriptionTR
 *   5. FinancialWarningsCard filters for severity ∈ {'critical','high'} and
 *      renders each as a red-bordered alert box
 *
 * This file pins the end-to-end behavior using the EXACT label format that
 * PR-S1.2's classifyExclusions produces. If a future change to the label
 * format ("Rent-a-car / ticari kullanım: %80" → something else) regresses
 * this surfacing, these tests catch it.
 */
import { describe, it, expect } from 'vitest'
import { evaluatePolicy, bucketConditionalDeductibleSeverity } from '../evaluator'
import type { AnalyzedPolicy } from '@/types/policy'

const baseKaskoPolicy: AnalyzedPolicy = {
  id: 'p-r4-anadolu',
  policyNumber: 'KAS-R4-1',
  provider: 'Anadolu Sigorta',
  type: 'kasko',
  typeTr: 'Kasko',
  coverage: 500000,
  premium: 12500,
  deductible: 0,
  startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
  expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
  status: 'active',
  insuredPerson: 'Eriş Ambalaj',
  documentType: 'policy',
  uploadDate: new Date().toISOString().split('T')[0],
  logo: '🚗',
  fileName: 'anadolu-kasko.pdf',
  coverages: [],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'Motor',
  aiConfidence: 0.9,
  aiInsights: [],
}

describe('Round-4 PR-S1.3 — Critical Financial Risks for canonical %80 label', () => {
  it('bucketConditionalDeductibleSeverity returns critical for "Rent-a-car / ticari kullanım: %80"', () => {
    // Canonical label format produced by classifyExclusions after PR-S1.2.
    const result = bucketConditionalDeductibleSeverity('Rent-a-car / ticari kullanım: %80')
    expect(result.severity).toBe('critical')
    expect(result.percent).toBe(80)
  })

  it('bucketer thresholds: 80→critical, 79→high, 30→high, 29→medium', () => {
    expect(bucketConditionalDeductibleSeverity('Test: %80').severity).toBe('critical')
    expect(bucketConditionalDeductibleSeverity('Test: %79').severity).toBe('high')
    expect(bucketConditionalDeductibleSeverity('Test: %30').severity).toBe('high')
    expect(bucketConditionalDeductibleSeverity('Test: %29').severity).toBe('medium')
    expect(bucketConditionalDeductibleSeverity('Test: %5').severity).toBe('medium')
  })

  it('evaluatePolicy emits a critical-severity issue for the canonical %80 label', () => {
    const policy: AnalyzedPolicy = {
      ...baseKaskoPolicy,
      conditionalDeductibles: ['Rent-a-car / ticari kullanım: %80'],
    }
    const result = evaluatePolicy(policy)

    const criticalRentACar = result.compliance.issues.find(
      (i) => i.severity === 'critical' && i.descriptionTR === 'Rent-a-car / ticari kullanım: %80'
    )

    expect(criticalRentACar).toBeDefined()
    // English description should mention misuse / commercial-use / rideshare per
    // translateConditionalDeductibleEN's "kullanım"/"rent" branch (line 149-150).
    expect(criticalRentACar!.description.toLowerCase()).toMatch(
      /misuse|commercial-use|rideshare|rental|test drive/
    )
  })

  it('evaluatePolicy emits both a 35% high and an 80% critical when both Anadolu scenarios are present', () => {
    // Mirror what classifyExclusions produces from the Round-4 reviewer's
    // Anadolu policy: AS+ network %35 + Kullanım Şekli %80.
    const policy: AnalyzedPolicy = {
      ...baseKaskoPolicy,
      conditionalDeductibles: [
        'Anlaşmalı olmayan servis: %35',
        'Rent-a-car / ticari kullanım: %80',
      ],
    }
    const result = evaluatePolicy(policy)

    const severities = new Map(
      result.compliance.issues
        .filter(
          (i) =>
            i.descriptionTR === 'Anlaşmalı olmayan servis: %35' ||
            i.descriptionTR === 'Rent-a-car / ticari kullanım: %80'
        )
        .map((i) => [i.descriptionTR, i.severity])
    )
    expect(severities.get('Anlaşmalı olmayan servis: %35')).toBe('high')
    expect(severities.get('Rent-a-car / ticari kullanım: %80')).toBe('critical')

    // FinancialWarningsCard filter: severity === 'critical' || 'high'.
    // Both scenarios should render in the panel.
    const renderable = result.compliance.issues.filter(
      (i) => i.severity === 'critical' || i.severity === 'high'
    )
    expect(renderable.length).toBeGreaterThanOrEqual(2)
  })

  it('handles the Turkish %80\'i suffix format inside the canonical label gracefully', () => {
    // Defensive — if a downstream caller passes a label with the Turkish
    // suffix attached (`%80'i`), the bucketer's `(?!\d)` boundary should
    // still extract 80 cleanly.
    const result = bucketConditionalDeductibleSeverity("Rent-a-car / ticari kullanım: %80'i")
    expect(result.severity).toBe('critical')
    expect(result.percent).toBe(80)
  })
})
