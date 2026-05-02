/**
 * Sprint 2 PR-S2.4 — regression tests for the 3 new recognition-insight
 * rules added to fix the Round-4 reviewer's "AI Insights too thin"
 * complaint.
 *
 * The reviewer flagged that on a 27-coverage Anadolu policy with
 * Sompo Japan transfer + AS+ network flagship feature, the AI Insights
 * panel showed only 2 visible items + "+2 More". They wanted recognition
 * of the policy's actual richness in the top of the list.
 */
import { describe, it, expect } from 'vitest'
import {
  generateNicheKlozeCountInsight,
  generateInsurerTransferInsight,
  generateNetworkBenefitInsight,
} from '../extraction/insights'
import type { ExtractedPolicyData, ExtractedCoverage } from '../extraction-schema'

const baseData: ExtractedPolicyData = {
  policyNumber: 'KAS-1',
  provider: 'Test Insurer',
  policyType: 'kasko',
  insuredName: 'Test',
  insuredAddress: null,
  startDate: '2026-01-01',
  endDate: '2027-01-01',
  premium: 12500,
  currency: 'TRY',
  paymentFrequency: null,
  coverages: [],
  specialConditions: [],
  exclusions: [],
}

const cov = (overrides: Partial<ExtractedCoverage>): ExtractedCoverage => ({
  name: 'Test Coverage',
  nameTr: 'Test Teminat',
  limit: 100000,
  deductible: 0,
  included: true,
  ...overrides,
})

describe('generateNicheKlozeCountInsight (PR-S2.4)', () => {
  it('returns null on empty coverages', () => {
    expect(generateNicheKlozeCountInsight(baseData)).toBeNull()
  })

  it('returns null on a basic 4-coverage policy', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      coverages: [
        cov({ category: 'main' }),
        cov({ category: 'main' }),
        cov({ category: 'liability' }),
        cov({ category: 'supplementary' }),
      ],
    }
    expect(generateNicheKlozeCountInsight(data)).toBeNull()
  })

  it('emits insight when 5+ supplementary klozes are present', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      coverages: [
        cov({ category: 'main' }),
        cov({ category: 'supplementary', name: 'Hatalı Akaryakıt' }),
        cov({ category: 'supplementary', name: 'Cam Koruma' }),
        cov({ category: 'supplementary', name: 'Hasarsızlık Koruma' }),
        cov({ category: 'supplementary', name: 'Eskisi Yerine Yenisi' }),
        cov({ category: 'supplementary', name: 'Evcil Hayvan' }),
      ],
    }
    const result = generateNicheKlozeCountInsight(data)
    expect(result).not.toBeNull()
    expect(result).toContain('6 teminat kalemi')
    expect(result).toContain('5 ek/asistans klozu')
  })

  it('emits insight on a 27-coverage Anadolu-style policy with mix of categories', () => {
    const coverages: ExtractedCoverage[] = []
    for (let i = 0; i < 5; i++) coverages.push(cov({ category: 'main' }))
    for (let i = 0; i < 12; i++)
      coverages.push(cov({ category: 'supplementary', name: `Niche Kloze ${i}` }))
    for (let i = 0; i < 3; i++) coverages.push(cov({ category: 'assistance' }))
    for (let i = 0; i < 2; i++) coverages.push(cov({ category: 'liability' }))
    for (let i = 0; i < 5; i++) coverages.push(cov({ category: 'legal' }))
    const data: ExtractedPolicyData = { ...baseData, coverages }
    const result = generateNicheKlozeCountInsight(data)
    expect(result).not.toBeNull()
    expect(result).toContain('27 teminat kalemi')
    expect(result).toContain('15 ek/asistans')
  })

  it('still emits on a 20-coverage policy with 3 supplementary (volume threshold)', () => {
    const coverages: ExtractedCoverage[] = []
    for (let i = 0; i < 17; i++) coverages.push(cov({ category: 'main' }))
    for (let i = 0; i < 3; i++) coverages.push(cov({ category: 'supplementary' }))
    const data: ExtractedPolicyData = { ...baseData, coverages }
    expect(generateNicheKlozeCountInsight(data)).not.toBeNull()
  })
})

describe('generateInsurerTransferInsight (PR-S2.4)', () => {
  it('returns null on a baseline policy with no transfer signal', () => {
    expect(generateInsurerTransferInsight(baseData)).toBeNull()
  })

  it('emits the strong insight when both transfer + NCD signals present', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      specialConditions: [
        'Önceki sigortacı Sompo Japan ile yenilenmiştir',
        'Hasarsızlık indirimi %50 (Kademe 3) korunarak devredildi',
      ],
    }
    const result = generateInsurerTransferInsight(data)
    expect(result).not.toBeNull()
    expect(result).toContain('hasarsızlık indirim kademesinin korunduğu')
  })

  it('emits the hedged insight when only transfer signal is present', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      specialConditions: ['Bu poliçe Sompo Japan poliçesinden devirdir'],
    }
    const result = generateInsurerTransferInsight(data)
    expect(result).not.toBeNull()
    expect(result).toContain('devir/yenileme görünüyor')
  })

  it('returns null when only NCD signal but no transfer indicator', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      specialConditions: ['Hasarsızlık indirimi %50 uygulanmıştır'],
    }
    expect(generateInsurerTransferInsight(data)).toBeNull()
  })

  it('matches "yenilenmiştir" / "geçiş poliçesi" / "carry-over" / "devir" patterns', () => {
    const cases = [
      'Önceki sigortacıdan yenilenmiştir',
      'Geçiş poliçesi olarak düzenlenmiştir',
      'Policy renewed via carry-over from prior insurer',
      'Devir işlemi tamamlanmıştır',
    ]
    for (const cond of cases) {
      const data: ExtractedPolicyData = {
        ...baseData,
        specialConditions: [cond],
      }
      // Without NCD signal, hedged variant fires
      expect(generateInsurerTransferInsight(data)).not.toBeNull()
    }
  })
})

describe('generateNetworkBenefitInsight (PR-S2.4)', () => {
  it('returns null when no AS+ / Anlaşmalı Servis signal', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      coverages: [cov({ name: 'Standard Service', nameTr: 'Standart Servis' })],
    }
    expect(generateNetworkBenefitInsight(data)).toBeNull()
  })

  it('emits insight when "AS+" appears in coverage name', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      coverages: [
        cov({ name: 'AS+ Yetkili Servis Ağı', nameTr: 'AS+ Yetkili Servis Ağı' }),
      ],
    }
    const result = generateNetworkBenefitInsight(data)
    expect(result).not.toBeNull()
    expect(result).toContain('Anlaşmalı Servis Ağı')
  })

  it('emits insight when "Anlaşmalı Servis Ağı" appears in coverage description', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      coverages: [
        cov({
          name: 'Service Network Benefit',
          nameTr: 'Servis Ağı Avantajı',
          description: 'Anlaşmalı Servis Ağı kapsamında küçük onarımlar NCD\'yi etkilemez',
        }),
      ],
    }
    expect(generateNetworkBenefitInsight(data)).not.toBeNull()
  })

  it('matches "Yetkili Servis Ağı" variant', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      coverages: [cov({ nameTr: 'Yetkili Servis Ağı kapsamında onarım' })],
    }
    expect(generateNetworkBenefitInsight(data)).not.toBeNull()
  })

  it('does NOT match the bare word "servis" alone (avoids false positives)', () => {
    const data: ExtractedPolicyData = {
      ...baseData,
      coverages: [cov({ nameTr: 'Genel servis ihtiyaçları' })],
    }
    expect(generateNetworkBenefitInsight(data)).toBeNull()
  })
})
