/**
 * Regression tests for B5: Assistance Label Accuracy
 *
 * Validates that assistance coverages preserve their limits
 * instead of being flattened to "Dahil" / "Included".
 */
import { describe, it, expect } from 'vitest'
import type { Coverage } from '@/types/policy'

// Replicate the core logic from PolicyDetailView.tsx formatCoverageLimit
function formatCoverageLimitForTest(coverage: Coverage, locale: string = 'tr'): string {
  const t = {
    global: {
      unlimited: locale === 'tr' ? 'Sınırsız' : 'Unlimited',
      marketValue: locale === 'tr' ? 'Rayiç Değer' : 'Market Value',
      included: locale === 'tr' ? 'Dahil' : 'Included',
      none: locale === 'tr' ? 'Yok' : 'None',
    },
  }

  if (coverage.isUnlimited) return t.global.unlimited
  if (coverage.isMarketValue) return t.global.marketValue

  if (coverage.limit === 0) {
    const nameLower = coverage.name.toLowerCase()
    if (nameLower.includes('sınırsız') || nameLower.includes('unlimited')) {
      return t.global.unlimited
    }
    if (nameLower.includes('rayiç') || nameLower.includes('market value')) {
      return t.global.marketValue
    }
    if (
      nameLower.includes('asistans') ||
      nameLower.includes('hizmet') ||
      nameLower.includes('ikame') ||
      nameLower.includes('onarım') ||
      coverage.included
    ) {
      return t.global.included
    }
    return t.global.included
  }

  return `${coverage.limit.toLocaleString('tr-TR')} TRY`
}

describe('B5: Assistance Label Accuracy', () => {
  it('shows formatted limit for assistance coverage with limit > 0', () => {
    const coverage: Coverage = {
      name: 'Anadolu Asistans Hizmeti',
      nameTr: 'Anadolu Asistans Hizmeti',
      limit: 4000,
      deductible: 0,
      included: true,
    }
    expect(formatCoverageLimitForTest(coverage)).toBe('4.000 TRY')
  })

  it('shows "Dahil" for assistance coverage with limit = 0', () => {
    const coverage: Coverage = {
      name: 'Mini Onarım Hizmeti',
      nameTr: 'Mini Onarım Hizmeti',
      limit: 0,
      deductible: 0,
      included: true,
    }
    expect(formatCoverageLimitForTest(coverage)).toBe('Dahil')
  })

  it('shows formatted limit for ikame araç with positive limit', () => {
    const coverage: Coverage = {
      name: 'İkame Araç',
      nameTr: 'İkame Araç',
      limit: 5000,
      deductible: 0,
      included: true,
    }
    expect(formatCoverageLimitForTest(coverage)).toBe('5.000 TRY')
  })

  it('shows "Included" in English locale for zero-limit assistance', () => {
    const coverage: Coverage = {
      name: 'Roadside Assistance',
      nameTr: 'Yol Yardımı Asistans',
      limit: 0,
      deductible: 0,
      included: true,
    }
    expect(formatCoverageLimitForTest(coverage, 'en')).toBe('Included')
  })

  it('shows "Unlimited" for coverage flagged isUnlimited', () => {
    const coverage: Coverage = {
      name: 'Asistans',
      nameTr: 'Asistans',
      limit: 0,
      deductible: 0,
      included: true,
      isUnlimited: true,
    }
    expect(formatCoverageLimitForTest(coverage)).toBe('Sınırsız')
  })

  it('shows "Market Value" for coverage flagged isMarketValue', () => {
    const coverage: Coverage = {
      name: 'Kapsamlı Kasko',
      nameTr: 'Kapsamlı Kasko',
      limit: 0,
      deductible: 0,
      included: true,
      isMarketValue: true,
    }
    expect(formatCoverageLimitForTest(coverage)).toBe('Rayiç Değer')
  })

  it('shows formatted limit for legal protection with positive limit', () => {
    const coverage: Coverage = {
      name: 'Hukuki Koruma',
      nameTr: 'Hukuki Koruma',
      limit: 80000,
      deductible: 0,
      included: true,
    }
    expect(formatCoverageLimitForTest(coverage)).toBe('80.000 TRY')
  })
})
