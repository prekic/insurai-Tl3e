/**
 * Unit tests for the canonical reviewer-mode policy summary builder.
 *
 * Tests cover: field formatting, locale switching, coverage limit cascade,
 * insight selection, safe wording integration, and the full builder output.
 */
import { describe, it, expect } from 'vitest'
import type { AnalyzedPolicy, Coverage } from '@/types/policy'
import {
  formatPremiumForReview,
  formatMonthlyPremiumForReview,
  formatInsuredForReview,
  formatDeductibleForReview,
  formatCoverageTotalForReview,
  formatCoverageItemLimitForReview,
  getLocalizedCoverageName,
  getLocalizedInsight,
  translateInsightLegacy,
  buildPolicyReviewerSummary,
} from '../policy-reviewer-summary'

// ── Test fixture ────────────────────────────────────────────────────

function createSpecimen(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'test-1',
    policyNumber: 'KSK-2026-001',
    provider: 'Anadolu Sigorta',
    logo: '',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 0,
    premium: 31140,
    monthlyPremium: 2595,
    deductible: 0,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    uploadDate: '2026-03-01',
    fileName: 'test.pdf',
    documentType: 'policy',
    aiConfidence: 0.85,
    insuredPerson: 'Erdem Yılmaz',
    location: 'İstanbul',
    coverages: [
      {
        name: 'Comprehensive Auto Insurance',
        nameTr: 'Kasko Ana Teminatı',
        limit: 0,
        deductible: 0,
        included: true,
        isMarketValue: true,
      },
      {
        name: 'Extended Liability Insurance',
        nameTr: 'İhtiyari Mali Mesuliyet',
        limit: 500000,
        deductible: 0,
        included: true,
      },
      {
        name: 'Mini Repair Service',
        nameTr: 'Mini Onarım',
        limit: 0,
        deductible: 0,
        included: true,
      },
    ],
    exclusions: ['Anahtarın kontakta bırakılması halinde çalınma teminat dışı'],
    specialConditions: [],
    insuranceLine: 'motor',
    aiInsights: [
      'Excellent coverage package with full protection',
      'No deductible applied to glass damage',
    ],
    aiInsightsTr: ['Mükemmel kapsamlı kasko teminatı', 'Muafiyetsiz cam onarımı uygulanmaktadır'],
    deductibleUncertain: true,
    premiumMissing: false,
    insuredMissing: false,
    conditionalDeductibles: ['Pert total araçlara %35 tenzili muafiyet uygulanması'],
    ...overrides,
  }
}

// ── Premium formatting ──────────────────────────────────────────────

describe('formatPremiumForReview', () => {
  it('returns formatted premium when present', () => {
    const p = createSpecimen()
    const result = formatPremiumForReview(p, 'tr')
    expect(result).toContain('31')
  })

  it('returns "Not Specified" when premiumMissing', () => {
    const p = createSpecimen({ premiumMissing: true })
    expect(formatPremiumForReview(p, 'en')).toBe('Not Specified')
  })

  it('returns "Belirtilmemiş" in TR when premium is 0', () => {
    const p = createSpecimen({ premium: 0 })
    expect(formatPremiumForReview(p, 'tr')).toBe('Belirtilmemiş')
  })

  it('uses custom formatAmount when provided', () => {
    const p = createSpecimen()
    const result = formatPremiumForReview(p, 'en', (n) => `$${n}`)
    expect(result).toBe('$31140')
  })
})

// ── Monthly premium formatting ──────────────────────────────────────

describe('formatMonthlyPremiumForReview', () => {
  it('returns formatted monthly premium when present', () => {
    const p = createSpecimen()
    expect(formatMonthlyPremiumForReview(p, 'en')).toContain('2')
  })

  it('returns "Belirtilmemiş" when premiumMissing', () => {
    const p = createSpecimen({ premiumMissing: true })
    expect(formatMonthlyPremiumForReview(p, 'tr')).toBe('Belirtilmemiş')
  })
})

// ── Insured formatting ──────────────────────────────────────────────

describe('formatInsuredForReview', () => {
  it('returns insured person name when present', () => {
    const p = createSpecimen()
    expect(formatInsuredForReview(p, 'tr')).toBe('Erdem Yılmaz')
  })

  it('returns "Cannot Verify" when insured is missing', () => {
    const p = createSpecimen({ insuredPerson: '', insuredMissing: true })
    expect(formatInsuredForReview(p, 'en')).toBe('Cannot Verify')
  })

  it('returns "Doğrulanamadı" when person empty', () => {
    const p = createSpecimen({ insuredPerson: '', insuredMissing: false })
    expect(formatInsuredForReview(p, 'tr')).toBe('Doğrulanamadı')
  })
})

// ── Deductible formatting ───────────────────────────────────────────

describe('formatDeductibleForReview', () => {
  it('shows uncertain text with conditional deductibles', () => {
    const p = createSpecimen({ deductibleUncertain: true })
    const result = formatDeductibleForReview(p, 'tr')
    expect(result).toContain('koşullu muafiyetler tespit edildi')
  })

  it('shows simple uncertain text without conditional deductibles', () => {
    const p = createSpecimen({ deductibleUncertain: true, conditionalDeductibles: [] })
    expect(formatDeductibleForReview(p, 'tr')).toBe('Koşullu / inceleme gerekli')
  })

  it('shows "None" for zero deductible without uncertainty', () => {
    const p = createSpecimen({ deductibleUncertain: false, deductible: 0, type: 'home' })
    expect(formatDeductibleForReview(p, 'en')).toBe('None')
  })

  it('formats numeric deductible', () => {
    const p = createSpecimen({ deductibleUncertain: false, deductible: 5000, type: 'home' })
    expect(formatDeductibleForReview(p, 'en')).toContain('5')
  })
})

// ── Coverage total formatting ───────────────────────────────────────

describe('formatCoverageTotalForReview', () => {
  it('returns market value text for market-value kasko', () => {
    const p = createSpecimen()
    expect(formatCoverageTotalForReview(p, 'tr')).toBe('Rayiç Değer (Piyasa Değeri)')
  })

  it('returns numeric value for non-zero coverage', () => {
    const p = createSpecimen({ coverage: 500000, coverages: [] })
    expect(formatCoverageTotalForReview(p, 'en')).toContain('500')
  })
})

// ── Coverage item limit cascade ─────────────────────────────────────

describe('formatCoverageItemLimitForReview', () => {
  it('returns safe-worded unlimited text for isUnlimited in TR', () => {
    const c: Coverage = { name: 'Test', limit: 0, deductible: 0, included: true, isUnlimited: true }
    // applySafeWording replaces "Sınırsız" with hedged phrasing
    const result = formatCoverageItemLimitForReview(c, 'tr')
    expect(result).not.toBe('Sınırsız')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns "Market Value" for isMarketValue in EN', () => {
    const c: Coverage = {
      name: 'Test',
      limit: 0,
      deductible: 0,
      included: true,
      isMarketValue: true,
    }
    expect(formatCoverageItemLimitForReview(c, 'en')).toBe('Market Value')
  })

  it('returns "Dahil" for zero-limit included service', () => {
    const c: Coverage = { name: 'Mini Onarım', limit: 0, deductible: 0, included: true }
    expect(formatCoverageItemLimitForReview(c, 'tr')).toMatch(/Dahil/)
  })

  it('formats numeric limit', () => {
    const c: Coverage = { name: 'Liability', limit: 500000, deductible: 0, included: true }
    expect(formatCoverageItemLimitForReview(c, 'en')).toContain('500')
  })

  it('applies applySafeWording to result', () => {
    // "Sınırsız" is promotional — applySafeWording replaces it
    const c: Coverage = { name: 'Test', limit: 0, deductible: 0, included: true, isUnlimited: true }
    const result = formatCoverageItemLimitForReview(c, 'tr')
    expect(result).not.toBe('Sınırsız')
    // EN "Unlimited" should also be safe-worded
    const resultEn = formatCoverageItemLimitForReview(c, 'en')
    expect(typeof resultEn).toBe('string')
  })
})

// ── Coverage name localization ──────────────────────────────────────

describe('getLocalizedCoverageName', () => {
  it('returns nameTr for Turkish locale when different from name', () => {
    const c = { name: 'Comprehensive Auto Insurance', nameTr: 'Kasko Ana Teminatı' }
    expect(getLocalizedCoverageName(c, 'tr')).toBe('Kasko Ana Teminatı')
  })

  it('returns name for English locale', () => {
    const c = { name: 'Comprehensive Auto Insurance', nameTr: 'Kasko Ana Teminatı' }
    expect(getLocalizedCoverageName(c, 'en')).toBe('Comprehensive Auto Insurance')
  })

  it('falls back to name when nameTr equals name', () => {
    const c = { name: 'Some Coverage', nameTr: 'Some Coverage' }
    // Should attempt i18n map lookup
    const result = getLocalizedCoverageName(c, 'tr')
    expect(typeof result).toBe('string')
  })
})

// ── Insight localization ────────────────────────────────────────────

describe('getLocalizedInsight', () => {
  it('returns aiInsightsTr when locale is TR and available', () => {
    const p = createSpecimen()
    expect(getLocalizedInsight(p, 0, 'tr')).toBe('Mükemmel kapsamlı kasko teminatı')
  })

  it('returns aiInsights when locale is EN', () => {
    const p = createSpecimen()
    expect(getLocalizedInsight(p, 0, 'en')).toBe('Excellent coverage package with full protection')
  })

  it('falls back to legacy translation when aiInsightsTr missing', () => {
    const p = createSpecimen({ aiInsightsTr: undefined })
    const result = getLocalizedInsight(p, 0, 'tr')
    expect(typeof result).toBe('string')
  })
})

// ── Legacy insight translation ──────────────────────────────────────

describe('translateInsightLegacy', () => {
  it('returns English text for EN locale', () => {
    expect(translateInsightLegacy('Some insight', 'en', {})).toBe('Some insight')
  })

  it('translates known patterns', () => {
    const translations = { 'Some insight': 'Bir görüş' }
    expect(translateInsightLegacy('Some insight', 'tr', translations)).toBe('Bir görüş')
  })

  it('preserves emoji prefix when translating', () => {
    const translations = { 'Glass is covered': 'Cam teminatlı' }
    expect(translateInsightLegacy('✓ Glass is covered', 'tr', translations)).toBe('✓ Cam teminatlı')
  })

  it('translates missing coverage pattern', () => {
    const translations = { missingCoverage: 'Yaygın teminat eksik: {name}' }
    const result = translateInsightLegacy('Missing common coverage: Glass', 'tr', translations)
    expect(result).toBe('Yaygın teminat eksik: Glass')
  })
})

// ── Full builder ────────────────────────────────────────────────────

describe('buildPolicyReviewerSummary', () => {
  it('returns all expected fields', () => {
    const p = createSpecimen()
    const summary = buildPolicyReviewerSummary(p)
    expect(summary.policyNumber).toBe('KSK-2026-001')
    expect(summary.provider).toBe('Anadolu Sigorta')
    expect(summary.type).toBe('kasko')
    expect(summary.typeTr).toBe('Kasko')
    expect(summary.insured).toBe('Erdem Yılmaz')
    expect(summary.status).toBe('active')
    expect(summary.aiConfidence).toBe(0.85)
    expect(summary.deductibleUncertain).toBe(true)
    expect(summary.premiumMissing).toBe(false)
    expect(summary.insuredMissing).toBe(false)
  })

  it('builds coverages with locale-resolved names', () => {
    const p = createSpecimen()
    const summary = buildPolicyReviewerSummary(p, { locale: 'tr' })
    expect(summary.coverages[0].name).toBe('Kasko Ana Teminatı')
    expect(summary.coverages[1].name).toBe('İhtiyari Mali Mesuliyet')
  })

  it('applies applySafeWording to insights', () => {
    const p = createSpecimen()
    const summary = buildPolicyReviewerSummary(p, { locale: 'tr' })
    for (const insight of summary.insights) {
      expect(insight).not.toMatch(/\bmükemmel\b/i)
      expect(insight).not.toMatch(/\bmuafiyetsiz\b/i)
    }
  })

  it('separates conditional deductibles', () => {
    const p = createSpecimen()
    const summary = buildPolicyReviewerSummary(p)
    expect(summary.hasConditionalDeductibles).toBe(true)
    expect(summary.conditionalDeductibles).toHaveLength(1)
    expect(summary.conditionalDeductibles[0]).toContain('Pert total')
  })

  it('returns empty conditionalDeductibles when none present', () => {
    const p = createSpecimen({ conditionalDeductibles: [] })
    const summary = buildPolicyReviewerSummary(p)
    expect(summary.hasConditionalDeductibles).toBe(false)
    expect(summary.conditionalDeductibles).toHaveLength(0)
  })

  it('uses EN locale when specified', () => {
    const p = createSpecimen()
    const summary = buildPolicyReviewerSummary(p, { locale: 'en' })
    expect(summary.coverages[0].name).toBe('Comprehensive Auto Insurance')
    // Insights should be in English and safe-worded
    for (const insight of summary.insights) {
      expect(insight).not.toMatch(/\bexcellent\b/i)
    }
  })

  it('uses custom formatAmount when provided', () => {
    const p = createSpecimen()
    const summary = buildPolicyReviewerSummary(p, {
      locale: 'en',
      formatAmount: (n) => `$${n}`,
    })
    expect(summary.premium).toBe('$31140')
    expect(summary.monthlyPremium).toBe('$2595')
  })
})

// ── Legacy Record Backfill Strategy Tests ─────────────────────────────

describe('Legacy Precedence and Hydration', () => {
  it('legacy arrays authoritative over shallow UI arrays', () => {
    // We create a mock AnalyzedPolicy that contains legacy coverages representing a backfilled state
    const p = createSpecimen({
      coverages: [
        {
          name: 'Legal Protection',
          nameTr: 'Hukuksal Koruma',
          limit: 80000, // Legacy authoritative value
          deductible: 0,
          included: true,
        },
      ],
    }) as any

    // Simulate what happens if extracted_data also existed on the record for some reason
    p.extracted_data = {
      coverages: [
        { name: 'Legal Protection', limit: 4000 }, // Weak single-shot hallucinated extraction
      ],
    }
    p.raw_data = {
      coverages: [{ name: 'Legal Protection', limit: 80000 }],
    }

    // Since the mapper places raw_data legacy fields into the UI `AnalyzedPolicy.coverages`
    // and discards `extracted_data`, the builder only sees authoritative coverages.
    const summary = buildPolicyReviewerSummary(p, { locale: 'tr' })
    const legalCoverage = summary.coverages.find(
      (c) => c.name.toLowerCase().includes('hukuksal') || c.name.toLowerCase().includes('legal')
    )

    expect(legalCoverage).toBeDefined()
    expect(legalCoverage?.limit).toContain('80')
    expect(legalCoverage?.limit).not.toContain('4.000') // Hallucinated limit rejected
  })

  it('re-extraction authoritative for missing header fields', () => {
    // Explicitly test that if the top-level insured identity was missing,
    // the system accepts the mapped name from the hydration backfill script
    const p = createSpecimen({
      insuredPerson: 'Eriş Ambalaj Sanayi', // Hydrated mapped output
      insuredMissing: false,
    })

    const summary = buildPolicyReviewerSummary(p, { locale: 'tr' })
    expect(summary.insured).toBe('Eriş Ambalaj Sanayi')
    expect(summary.insured).not.toBe('Doğrulanamadı')
  })

  it('no misleading fallback values for unrecoverable records', () => {
    // Assert exactly that Unrecoverable buckets output only Cannot Verify
    // instead of misleading "today" dates or empty dash strings
    const p = createSpecimen({
      insuredPerson: '',
      insuredMissing: true,
      startDate: '',
      expiryDate: '',
      premiumMissing: true,
    })

    const summary = buildPolicyReviewerSummary(p, { locale: 'en' })
    expect(summary.insured).toBe('Cannot Verify')
    expect(summary.period).toBe('Cannot Verify')
    expect(summary.premium).toBe('Not Specified')

    const summaryTr = buildPolicyReviewerSummary(p, { locale: 'tr' })
    expect(summaryTr.insured).toBe('Doğrulanamadı')
    expect(summaryTr.period).toBe('Doğrulanamadı')
    expect(summaryTr.premium).toBe('Belirtilmemiş')
  })
})
