import { describe, it, expect, vi } from 'vitest'
import { generateAnalysisBundle } from '../engine'
import { evaluateDisplayMode } from '../review-thresholds'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { ValidationResult } from '@/lib/ai/validator'

describe('generateAnalysisBundle (integration)', () => {
  it('KASKO-first proof: correctly generates full analysis bundle with separation', () => {
    // @ts-expect-error - mismatch due to schema update
    const mockData: ExtractedPolicyData = {
      policyType: 'kasko',
      policyNumber: '12345',
      provider: 'Test Sigorta',
      premium: 12000,
      confidence: {
        overall: 0.95,
        premium: 0.95,
        coverages: 0.9,
        policyNumber: 0.99,
        provider: 0.99,
        dates: 0.99,
      },
      coverages: [
        { name: 'Kasko', isMarketValue: true, deductible: 0 },
        { name: 'İMM', limit: 10000000, isUnlimited: false, deductible: 0 },
      ],
      exclusions: [],
      specialConditions: [],
    } as ExtractedPolicyData

    const mockValidation: ValidationResult = { isValid: true, flags: [] }

    const bundle = generateAnalysisBundle('test-pol-1', mockData, mockValidation)

    // Root structure
    expect(bundle.policyId).toBe('test-pol-1')
    expect(bundle.analysisVersion).toBe('1.0.0')
    expect(bundle.validatorResult).toEqual(mockValidation)

    // Score bundle: internalOverallScore is internal-only
    expect(bundle.scoreBundle.internalOverallScore.internalOnly).toBe(true)
    expect(bundle.scoreBundle.internalOverallScore.value).toBeGreaterThan(0)

    // extractionQualityScore should be ~95
    const ext = bundle.scoreBundle.scores.extractionQualityScore
    expect(ext.scoreValue).toBe(95)
    expect(ext.suppressed).toBeUndefined()

    // policyStructureScore should include market value bonus
    const struct = bundle.scoreBundle.scores.policyStructureScore
    expect(struct.scoreValue).toBeGreaterThanOrEqual(50)

    // consumerSafetyScore: no deductibles so base 70
    const safety = bundle.scoreBundle.scores.consumerSafetyScore
    expect(safety.scoreValue).toBe(70)

    // competitivenessScore: has benchmark provenance (mock), so should NOT be suppressed
    const comp = bundle.scoreBundle.scores.competitivenessScore
    expect(comp.suppressed).toBe(false)

    // Insights: rayic deger confirmed
    const rayic = bundle.insightBundle.insights.find(
      (i) => i.generatedByRule === 'DETERMINISTIC_RAYIC_DEGER'
    )
    expect(rayic).toBeDefined()
    expect(rayic!.type).toBe('positive_confirmed')
    expect(rayic!.basisType).toBe('policy_fact')

    // Benchmarks: premium comparison eligible
    const premComp = bundle.benchmarkBundle.comparisons.find((c) => c.comparedField === 'premium')
    expect(premComp).toBeDefined()
    expect(premComp!.displayEligibility).toBe(true)

    // Benchmark references have full provenance
    for (const ref of Object.values(bundle.benchmarkBundle.references)) {
      expect(ref.provenance.sourceName).toBeTruthy()
      expect(ref.provenance.geography).toBeTruthy()
      expect(ref.provenance.effectiveDateRange.start).toBeTruthy()
    }
  })

  it('suppresses benchmark and competitiveness when confidence is low', () => {
    const mockData: ExtractedPolicyData = {
      policyType: 'kasko',
      premium: 12000,
      confidence: { overall: 0.6, premium: 0.6, coverages: 0.5 },
      coverages: [{ name: 'Kasko', isMarketValue: false, deductible: 5000 }],
      evidence: {
        insights: [{ text: 'Has strict deductible', textEn: 'fully covered', quote: 'test' }],
      },
    } as ExtractedPolicyData

    const mockValidation: ValidationResult = {
      isValid: false,
      // @ts-expect-error - mismatch due to schema update
      flags: [{ level: 'Warning', message: 'Low confidence test', ruleId: 'TEST_01' }],
    }

    const bundle = generateAnalysisBundle('test-pol-2', mockData, mockValidation)

    // Benchmark suppressed
    const premComp = bundle.benchmarkBundle.comparisons.find((c) => c.comparedField === 'premium')
    expect(premComp?.displayEligibility).toBe(false)
    expect(premComp?.reasonIfSuppressed).toContain('Suppressed')

    // The benchmark references have valid provenance, but the COMPARISON
    // is suppressed because extraction confidence is low.
    expect(premComp?.displayEligibility).toBe(false)

    // Dangerous insight suppressed
    const filtered = bundle.insightBundle.insights.find(
      (i) => i.generatedByRule === 'AI_RAW_FILTERED'
    )
    expect(filtered).toBeDefined()
    expect(filtered!.displayEligibility).toBe(false)

    // Extraction quality penalized
    const ext = bundle.scoreBundle.scores.extractionQualityScore
    expect(ext.scoreValue).toBe(50) // 60 - 10 warning
  })

  it('works correctly when benchmark data is entirely absent', () => {
    // @ts-expect-error - mismatch due to schema update
    const mockData: ExtractedPolicyData = {
      policyType: undefined as unknown as string, // Simulate missing policy type
      coverages: [],
    } as ExtractedPolicyData

    const mockValidation: ValidationResult = { isValid: true, flags: [] }

    const bundle = generateAnalysisBundle('test-pol-3', mockData, mockValidation)

    // Benchmark bundle should be empty
    expect(bundle.benchmarkBundle.comparisons).toHaveLength(0)
    expect(Object.keys(bundle.benchmarkBundle.references)).toHaveLength(0)

    // competitivenessScore should be suppressed
    const comp = bundle.scoreBundle.scores.competitivenessScore
    expect(comp.suppressed).toBe(true)
    expect(comp.suppressionReason).toContain('suppressed')

    // Score bundle should still have other scores
    expect(bundle.scoreBundle.scores.extractionQualityScore).toBeDefined()
    expect(bundle.scoreBundle.scores.policyStructureScore).toBeDefined()
    expect(bundle.scoreBundle.scores.consumerSafetyScore).toBeDefined()
  })

  // ============================================================================
  // Safe-default path coverage (Issue #333)
  // ============================================================================

  describe('safe-default path (Issue #333)', () => {
    it('returns a complete AnalysisBundle when called with null data', () => {
      const mockValidation: ValidationResult = { isValid: false, flags: [] }
      // Cast through unknown to test the runtime null guard
      const bundle = generateAnalysisBundle(
        'test-null-1',
        null as unknown as ExtractedPolicyData,
        mockValidation
      )

      // Bundle has the expected top-level shape (not the old broken stub)
      expect(bundle.policyId).toBe('test-null-1')
      expect(bundle.analysisVersion).toBe('safe-default')
      expect(bundle.validatorResult).toEqual(mockValidation)

      // ScoreBundle has internalOverallScore (not the old `overall: 0` field)
      expect(bundle.scoreBundle.internalOverallScore.internalOnly).toBe(true)
      expect(bundle.scoreBundle.internalOverallScore.value).toBe(0)
      expect(bundle.scoreBundle.internalOverallScore.derivationRule).toBe('SAFE_DEFAULT')

      // ScoreBundle.scores has all 5 score families
      expect(bundle.scoreBundle.scores.extractionQualityScore).toBeDefined()
      expect(bundle.scoreBundle.scores.policyStructureScore).toBeDefined()
      expect(bundle.scoreBundle.scores.consumerSafetyScore).toBeDefined()
      expect(bundle.scoreBundle.scores.competitivenessScore).toBeDefined()
      expect(bundle.scoreBundle.scores.riskAttentionScore).toBeDefined()

      // Each score is a fully-formed ScoreDetail with suppressed: true
      const ext = bundle.scoreBundle.scores.extractionQualityScore
      expect(ext.scoreValue).toBe(0)
      expect(ext.scoreScale).toBe(100)
      expect(ext.scoreVersion).toBe('safe-default')
      expect(ext.suppressed).toBe(true)
      expect(ext.suppressionReason).toBe('null_extraction_data')
      expect(ext.warnings).toContain('null_extraction_data')

      // InsightBundle and BenchmarkBundle have proper bundleVersion fields
      expect(bundle.insightBundle.insights).toEqual([])
      expect(bundle.insightBundle.bundleVersion).toBe('safe-default')
      expect(bundle.benchmarkBundle.references).toEqual({})
      expect(bundle.benchmarkBundle.comparisons).toEqual([])
      expect(bundle.benchmarkBundle.bundleVersion).toBe('safe-default')
    })

    it('safe-default bundle passes through evaluateDisplayMode without crashing', () => {
      const mockValidation: ValidationResult = { isValid: false, flags: [] }
      const bundle = generateAnalysisBundle(
        'test-null-2',
        null as unknown as ExtractedPolicyData,
        mockValidation
      )

      // The crash in Issue #333 was: evaluateDisplayMode reads
      // analysis.scoreBundle.scores.extractionQualityScore without optional chain
      // and threw on the old `{ overall: 0, components: {} }` stub. With the
      // complete safe default, this call must succeed.
      const minimalData = {} as ExtractedPolicyData
      let result: ReturnType<typeof evaluateDisplayMode>
      expect(() => {
        result = evaluateDisplayMode(minimalData, mockValidation, bundle)
      }).not.toThrow()
      expect(result!).toBeDefined()
      expect(result!.mode).toBeDefined()
      // With all scores at 0 (well below HUMAN_REVIEW_THRESHOLD = 30),
      // the strict evaluator should route to human_review_required
      expect(result!.mode).toBe('human_review_required')
    })

    it('returns safe-default with error reason when an internal helper throws', async () => {
      // Mock the scoring module to throw, forcing the catch block in
      // generateAnalysisBundle to fire
      vi.resetModules()
      vi.doMock('../scoring', () => ({
        generateScoreBundle: () => {
          throw new Error('synthetic test failure')
        },
      }))
      const { generateAnalysisBundle: freshBundle } = await import('../engine')

      // @ts-expect-error - mismatch due to schema update
      const mockData: ExtractedPolicyData = {
        policyType: 'kasko',
        coverages: [],
      } as ExtractedPolicyData
      const mockValidation: ValidationResult = { isValid: true, flags: [] }
      const bundle = freshBundle('test-error-1', mockData, mockValidation)

      // Bundle is the safe default with the synthetic error message captured
      expect(bundle.analysisVersion).toBe('safe-default')
      expect(bundle.scoreBundle.scores.extractionQualityScore.suppressed).toBe(true)
      expect(bundle.scoreBundle.scores.extractionQualityScore.suppressionReason).toContain(
        'synthetic test failure'
      )
      vi.doUnmock('../scoring')
      vi.resetModules()
    })
  })
})
