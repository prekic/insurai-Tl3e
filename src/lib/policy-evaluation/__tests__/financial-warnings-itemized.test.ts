/**
 * Regression tests for Sprint 2 P1 #7 — Critical Financial Risks itemization.
 *
 * Reviewer caught the panel rendering a single generic "Policy contains
 * conditional deductibles requiring review" warning even on a policy that
 * has 5+ named conditional deductibles plus an IMM industrial-site carve-out.
 * The fix emits one Issue per conditional deductible (severity bucketed by
 * percentage) plus one Issue per Coverage.carveOuts entry.
 */
import { describe, it, expect } from 'vitest'
import { evaluatePolicy } from '../evaluator'
import type { AnalyzedPolicy } from '@/types/policy'

const baseKaskoPolicy: AnalyzedPolicy = {
  id: 'p-fr',
  policyNumber: 'KAS-FR-1',
  provider: 'Test Insurer',
  type: 'kasko',
  typeTr: 'Kasko',
  coverage: 500000,
  premium: 12500,
  deductible: 0,
  startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow → active
  expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
  status: 'active',
  insuredPerson: 'Jane Driver',
  documentType: 'policy',
  uploadDate: new Date().toISOString().split('T')[0],
  logo: '🚗',
  fileName: 'kasko.pdf',
  coverages: [],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'Motor',
  aiConfidence: 0.9,
  aiInsights: [],
}

describe('FinancialWarnings — itemized conditional deductibles (P1 #7)', () => {
  it('emits ZERO conditional-deductible Issues when none are present', () => {
    const result = evaluatePolicy({ ...baseKaskoPolicy, conditionalDeductibles: undefined })
    const condIssues = result.compliance.issues.filter((i) =>
      /deductible|muafiyet/i.test(i.description + i.descriptionTR)
    )
    // Zero conditional-deductible-specific issues; the generic message no
    // longer fires either.
    expect(
      condIssues.some(
        (i) => i.description === 'Policy contains conditional deductibles requiring review'
      )
    ).toBe(false)
  })

  it('emits ONE Issue per conditional deductible scenario (was: one generic)', () => {
    const policy = {
      ...baseKaskoPolicy,
      conditionalDeductibles: [
        'Anlaşmalı olmayan servis: %35',
        'Pert araç muafiyeti: %35',
        'Kullanım Şekli: %80',
      ],
    }
    const result = evaluatePolicy(policy)
    const itemized = result.compliance.issues.filter(
      (i) => i.descriptionTR && /muafiyet|kullanım|servis/i.test(i.descriptionTR)
    )
    expect(itemized.length).toBe(3)
    expect(itemized.map((i) => i.descriptionTR)).toEqual([
      'Anlaşmalı olmayan servis: %35',
      'Pert araç muafiyeti: %35',
      'Kullanım Şekli: %80',
    ])
  })

  it('buckets severity by deductible percentage', () => {
    const policy = {
      ...baseKaskoPolicy,
      conditionalDeductibles: [
        'Kullanım Şekli: %80', // critical
        'Anlaşmalı olmayan servis: %35', // high
        'İlk cam hasarı muafiyeti: %20', // medium
      ],
    }
    const result = evaluatePolicy(policy)
    const byScenario = new Map(
      result.compliance.issues
        .filter((i) => i.descriptionTR && /kullan|servis|cam/i.test(i.descriptionTR))
        .map((i) => [i.descriptionTR, i.severity])
    )
    expect(byScenario.get('Kullanım Şekli: %80')).toBe('critical')
    expect(byScenario.get('Anlaşmalı olmayan servis: %35')).toBe('high')
    expect(byScenario.get('İlk cam hasarı muafiyeti: %20')).toBe('medium')
  })

  it('translates known Turkish scenarios to English in description field', () => {
    const policy = {
      ...baseKaskoPolicy,
      conditionalDeductibles: ['Kullanım Şekli: %80'],
    }
    const result = evaluatePolicy(policy)
    const issue = result.compliance.issues.find((i) => i.descriptionTR === 'Kullanım Şekli: %80')
    expect(issue).toBeDefined()
    // Falls into the "kullanım şekli" branch — should mention misuse/commercial.
    expect(issue!.description.toLowerCase()).toMatch(/misuse|commercial-use|rideshare|rental/)
    expect(issue!.description).toContain('%80')
  })

  it('falls back to the verbatim Turkish string when no English stem matches', () => {
    const policy = {
      ...baseKaskoPolicy,
      conditionalDeductibles: ['Bilinmeyen senaryo: %42'],
    }
    const result = evaluatePolicy(policy)
    const issue = result.compliance.issues.find(
      (i) => i.descriptionTR === 'Bilinmeyen senaryo: %42'
    )
    expect(issue).toBeDefined()
    // No keyword stem matches → English description = original string
    expect(issue!.description).toBe('Bilinmeyen senaryo: %42')
  })

  it('surfaces Coverage.carveOuts as their own medium-severity Issues', () => {
    const policy: AnalyzedPolicy = {
      ...baseKaskoPolicy,
      coverages: [
        {
          name: 'IMM Sınırsız',
          nameTr: 'İhtiyari Mali Mesuliyet Sınırsız',
          limit: 0,
          deductible: 0,
          included: true,
          isUnlimited: true,
          category: 'liability',
          carveOuts: [
            'Subject to 2,500,000 TL cap at airports/ports/fuel depots',
            'Excludes intentional damage',
          ],
        },
      ],
    }
    const result = evaluatePolicy(policy)
    const carveOutIssues = result.compliance.issues.filter(
      (i) => i.severity === 'medium' && i.description.includes('IMM')
    )
    expect(carveOutIssues.length).toBe(2)
    expect(carveOutIssues[0].description).toContain('2,500,000')
    expect(carveOutIssues[1].description).toContain('intentional')
  })
})
