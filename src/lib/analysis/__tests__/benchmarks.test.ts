import { describe, it, expect } from 'vitest'
import { generateBenchmarkBundle, validateProvenance, validateGeography } from '../benchmarks'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { BenchmarkProvenance } from '@/types/analysis'

describe('validateProvenance', () => {
  const completeProvenance: BenchmarkProvenance = {
    sourceName: 'Tramer/SBM 2024',
    sourceVersion: 'v1.4',
    geography: 'tr-TR',
    effectiveDateRange: { start: '2024-01-01', end: '2024-12-31' },
    marketSegment: 'retail',
    productType: 'standard',
    matchType: 'approximate',
    matchConfidence: 0.95,
    dataQuality: 'high',
  }

  it('accepts complete provenance', () => {
    const result = validateProvenance(completeProvenance)
    expect(result.valid).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('rejects missing sourceName', () => {
    const result = validateProvenance({ ...completeProvenance, sourceName: '' })
    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('Missing sourceName')
  })

  it('rejects missing geography', () => {
    const result = validateProvenance({ ...completeProvenance, geography: '' })
    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('Missing geography')
  })

  it('rejects missing effectiveDateRange', () => {
    const result = validateProvenance({
      ...completeProvenance,
      effectiveDateRange: { start: '' },
    })
    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('Missing effectiveDateRange.start')
  })

  it('rejects low matchConfidence', () => {
    const result = validateProvenance({ ...completeProvenance, matchConfidence: 0.5 })
    expect(result.valid).toBe(false)
    expect(result.reasons[0]).toContain('below threshold')
  })

  it('rejects low dataQuality', () => {
    const result = validateProvenance({ ...completeProvenance, dataQuality: 'low' })
    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('dataQuality is low')
  })

  it('rejects missing marketSegment', () => {
    const result = validateProvenance({ ...completeProvenance, marketSegment: '' })
    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('Missing marketSegment')
  })

  it('accumulates multiple failures', () => {
    const result = validateProvenance({
      ...completeProvenance,
      sourceName: '',
      geography: '',
      matchConfidence: 0.3,
    })
    expect(result.valid).toBe(false)
    expect(result.reasons.length).toBeGreaterThanOrEqual(3)
  })
})

describe('validateGeography', () => {
  it('accepts matching geographies', () => {
    const result = validateGeography('tr-TR', 'tr-TR')
    expect(result.valid).toBe(true)
  })

  it('rejects mismatched geographies', () => {
    const result = validateGeography('de-DE', 'tr-TR')
    expect(result.valid).toBe(false)
    expect(result.reasons[0]).toContain('Geography mismatch')
  })

  it('rejects missing benchmark geography', () => {
    const result = validateGeography('', 'tr-TR')
    expect(result.valid).toBe(false)
  })
})

describe('generateBenchmarkBundle', () => {
  it('returns empty bundle when policy type is missing', () => {
    const data = { premium: 10000 } as ExtractedPolicyData
    const bundle = generateBenchmarkBundle(data)
    expect(Object.keys(bundle.references)).toHaveLength(0)
    expect(bundle.comparisons).toHaveLength(0)
  })

  it('returns empty bundle when premium is missing', () => {
    const data = { policyType: 'kasko' } as ExtractedPolicyData
    const bundle = generateBenchmarkBundle(data)
    expect(bundle.comparisons).toHaveLength(0)
  })

  it('policy-only analysis works when benchmark data is absent', () => {
    // This proves the bundle generator doesn't crash with minimal data
    const data = { policyType: 'kasko' } as ExtractedPolicyData
    const bundle = generateBenchmarkBundle(data)
    expect(bundle.bundleVersion).toBe('1.0.0')
    expect(bundle.comparisons).toHaveLength(0)
  })

  it('suppresses benchmark output when policy extraction confidence is low', () => {
    // @ts-expect-error - mismatch due to schema update
    const data = {
      policyType: 'kasko',
      premium: 12000,
      confidence: { overall: 0.6, premium: 0.5, coverages: 0.4 },
      coverages: [],
    } as ExtractedPolicyData

    const bundle = generateBenchmarkBundle(data)
    const premComp = bundle.comparisons.find((c) => c.comparedField === 'premium')
    expect(premComp).toBeDefined()
    expect(premComp!.displayEligibility).toBe(false)
    expect(premComp!.reasonIfSuppressed).toContain('Suppressed')
    expect(premComp!.reasonIfSuppressed).toContain('confidence')
  })

  it('allows benchmark output when all provenance and confidence requirements are met', () => {
    // @ts-expect-error - mismatch due to schema update
    const data = {
      policyType: 'kasko',
      premium: 12000,
      confidence: { overall: 0.95, premium: 0.95, coverages: 0.9 },
      coverages: [],
    } as ExtractedPolicyData

    const bundle = generateBenchmarkBundle(data)
    const premComp = bundle.comparisons.find((c) => c.comparedField === 'premium')
    expect(premComp).toBeDefined()
    expect(premComp!.displayEligibility).toBe(true)
    expect(premComp!.reasonIfSuppressed).toBeUndefined()
  })

  it('suppresses benchmark output for geography mismatch', () => {
    // @ts-expect-error - mismatch due to schema update
    const data = {
      policyType: 'kasko',
      premium: 12000,
      confidence: { overall: 0.95, premium: 0.95, coverages: 0.9 },
      coverages: [],
    } as ExtractedPolicyData

    // Policy is in Germany, but benchmark data is for Turkey
    const bundle = generateBenchmarkBundle(data, 'de-DE')
    const premComp = bundle.comparisons.find((c) => c.comparedField === 'premium')
    expect(premComp).toBeDefined()
    expect(premComp!.displayEligibility).toBe(false)
    expect(premComp!.reasonIfSuppressed).toContain('Geography mismatch')
  })

  it('all references have full provenance objects', () => {
    // @ts-expect-error - mismatch due to schema update
    const data = {
      policyType: 'kasko',
      premium: 12000,
      confidence: { overall: 0.95, premium: 0.95, coverages: 0.9 },
      coverages: [],
    } as ExtractedPolicyData

    const bundle = generateBenchmarkBundle(data)
    for (const ref of Object.values(bundle.references)) {
      expect(ref.provenance).toBeDefined()
      expect(ref.provenance.sourceName).toBeTruthy()
      expect(ref.provenance.geography).toBeTruthy()
      expect(ref.provenance.effectiveDateRange.start).toBeTruthy()
      expect(ref.provenance.marketSegment).toBeTruthy()
      expect(ref.provenance.productType).toBeTruthy()
    }
  })
})
