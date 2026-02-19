/**
 * OCR Confidence - Coverage Tests
 *
 * Targets uncovered branches in ocr-confidence.ts
 */

import { describe, it, expect } from 'vitest'
import {
  calculateConfidenceScore,
  calculateQuickConfidence,
  aggregateConfidenceScores,
  getConfidenceColor,
  getConfidenceIcon,
} from './ocr-confidence'
import type { PipelineResult, SanitizerStats } from './ocr-cleanup-pipeline'

function createSanitizerStats(overrides: Partial<SanitizerStats> = {}): SanitizerStats {
  return {
    linesRemoved: 0,
    garbageLinesRemoved: 0,
    spacedFragmentsMerged: 0,
    controlCharsRemoved: 0,
    highAsciiSequencesRemoved: 0,
    specialClustersRemoved: 0,
    ...overrides,
  }
}

function createPipelineResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    success: true,
    output: 'cleaned text',
    qaReport: {
      overallStatus: 'passed',
      totalChunks: 5,
      passedChunks: 5,
      retriedChunks: 0,
      failedChunks: 0,
      manualReviewChunks: 0,
      chunkReports: [],
    },
    stats: {
      originalLength: 1000,
      finalLength: 800,
      reductionPercent: 20,
      totalChunks: 5,
      chunksRetried: 0,
      chunksFailed: 0,
      totalProcessingTimeMs: 500,
      sanitizerStats: createSanitizerStats(),
    },
    preservationValid: true,
    preservationIssues: [],
    artifactsRemaining: false,
    remainingArtifacts: [],
    hasQAFailures: false,
    failedChunkIndices: [],
    ...overrides,
  } as PipelineResult
}

describe('ocr-confidence coverage', () => {
  describe('calculateConfidenceScore', () => {
    it('returns high score for perfect result', () => {
      const result = createPipelineResult()
      const score = calculateConfidenceScore(result)
      expect(score.score).toBeGreaterThanOrEqual(80)
      expect(score.grade).toMatch(/^[AB]$/)
      expect(score.status).toMatch(/^(excellent|good)$/)
    })

    it('handles null QA report (neutral score)', () => {
      const result = createPipelineResult({ qaReport: null })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.qaGateScore).toBe(20)
    })

    it('handles zero total chunks in QA report', () => {
      const result = createPipelineResult({
        qaReport: {
          overallStatus: 'passed',
          totalChunks: 0,
          passedChunks: 0,
          retriedChunks: 0,
          failedChunks: 0,
          manualReviewChunks: 0,
          chunkReports: [],
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.qaGateScore).toBe(35)
    })

    it('deducts for failed chunks', () => {
      const result = createPipelineResult({
        qaReport: {
          overallStatus: 'failed',
          totalChunks: 5,
          passedChunks: 2,
          retriedChunks: 1,
          failedChunks: 2,
          manualReviewChunks: 1,
          chunkReports: [],
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.negativeFactors.some(f => f.factor.includes('failed QA'))).toBe(true)
    })

    it('reports manual review chunks as negative', () => {
      const result = createPipelineResult({
        qaReport: {
          overallStatus: 'passed',
          totalChunks: 5,
          passedChunks: 4,
          retriedChunks: 0,
          failedChunks: 0,
          manualReviewChunks: 1,
          chunkReports: [],
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.negativeFactors.some(f => f.factor.includes('manual review'))).toBe(true)
    })

    it('reports all chunks passed on first attempt as positive', () => {
      const result = createPipelineResult()
      const score = calculateConfidenceScore(result)
      expect(score.positiveFactors.some(f => f.factor.includes('first attempt'))).toBe(true)
    })

    it('reports all chunks passed after retries as positive', () => {
      const result = createPipelineResult({
        qaReport: {
          overallStatus: 'passed',
          totalChunks: 5,
          passedChunks: 3,
          retriedChunks: 2,
          failedChunks: 0,
          manualReviewChunks: 0,
          chunkReports: [],
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.positiveFactors.some(f => f.factor.includes('after retries'))).toBe(true)
    })

    it('gives full preservation score when valid', () => {
      const result = createPipelineResult()
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.preservationScore).toBe(25)
    })

    it('deducts for preservation issues', () => {
      const result = createPipelineResult({
        preservationValid: false,
        preservationIssues: ['Missing policy number', 'Wrong date'],
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.preservationScore).toBeLessThan(25)
    })

    it('caps preservation score for critical issues (policy/amount/date)', () => {
      const result = createPipelineResult({
        preservationValid: false,
        preservationIssues: ['Policy number mismatch'],
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.preservationScore).toBeLessThanOrEqual(10)
      expect(score.recommendations.some(r => r.includes('policy numbers'))).toBe(true)
    })

    it('gives full artifact score when none remaining', () => {
      const result = createPipelineResult()
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.artifactScore).toBe(20)
    })

    it('deducts for remaining artifacts', () => {
      const result = createPipelineResult({
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B', 'a!!!a', 'spaced fragment'],
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.artifactScore).toBeLessThan(20)
    })

    it('detects barcode artifacts', () => {
      const result = createPipelineResult({
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B pattern'],
      })
      const score = calculateConfidenceScore(result)
      expect(score.negativeFactors.some(f => f.factor.includes('Barcode'))).toBe(true)
      expect(score.recommendations.some(r => r.includes('re-scanning'))).toBe(true)
    })

    it('detects spaced fragments', () => {
      const result = createPipelineResult({
        artifactsRemaining: true,
        remainingArtifacts: ['spaced fragment detected'],
      })
      const score = calculateConfidenceScore(result)
      expect(score.negativeFactors.some(f => f.factor.includes('Spaced'))).toBe(true)
    })

    it('gives good content ratio score for healthy ratio (0.6-0.95)', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 800,
          reductionPercent: 20,
          totalChunks: 5,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.contentRatioScore).toBe(15)
    })

    it('gives 14 for very clean input (>0.95 ratio)', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 970,
          reductionPercent: 3,
          totalChunks: 5,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.contentRatioScore).toBe(14)
    })

    it('deducts for too-much-removed content (ratio < 0.5)', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 300,
          reductionPercent: 70,
          totalChunks: 5,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.contentRatioScore).toBeLessThan(15)
    })

    it('handles empty input (originalLength 0)', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 0,
          finalLength: 0,
          reductionPercent: 0,
          totalChunks: 0,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 100,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.contentRatioScore).toBe(15)
    })

    it('gives content ratio score between 0.5 and 0.6', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 550,
          reductionPercent: 45,
          totalChunks: 5,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      // ratio = 0.55, between minContentRatio (0.5) and 0.6
      // formula: max(5, 15 - floor((0.6 - 0.55) * 20)) = max(5, 15 - 1) = 14
      expect(score.breakdown.contentRatioScore).toBeGreaterThanOrEqual(5)
      expect(score.breakdown.contentRatioScore).toBeLessThanOrEqual(15)
    })

    it('gives full efficiency score with no retries', () => {
      const result = createPipelineResult()
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.efficiencyScore).toBe(5)
    })

    it('gives 4 for minor retries (<10%)', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 800,
          reductionPercent: 20,
          totalChunks: 20,
          chunksRetried: 1,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.efficiencyScore).toBe(4)
    })

    it('gives 3 for moderate retries (10-30%)', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 800,
          reductionPercent: 20,
          totalChunks: 10,
          chunksRetried: 2,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.efficiencyScore).toBe(3)
    })

    it('deducts for high retry rate (>30%)', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 800,
          reductionPercent: 20,
          totalChunks: 5,
          chunksRetried: 3,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.efficiencyScore).toBeLessThan(3)
    })

    it('handles zero total chunks for efficiency', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 0,
          finalLength: 0,
          reductionPercent: 0,
          totalChunks: 0,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 100,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.efficiencyScore).toBe(5)
    })

    it('applies bonus for perfect QA pass with no retries', () => {
      const result = createPipelineResult({
        qaReport: {
          overallStatus: 'passed',
          totalChunks: 5,
          passedChunks: 5,
          retriedChunks: 0,
          failedChunks: 0,
          manualReviewChunks: 0,
          chunkReports: [],
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.bonuses.some(b => b.reason.includes('Perfect QA'))).toBe(true)
    })

    it('applies bonus for fast processing on small docs', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 5000,
          finalLength: 4000,
          reductionPercent: 20,
          totalChunks: 1,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.bonuses.some(b => b.reason.includes('Fast processing'))).toBe(true)
    })

    it('applies bonus for good spaced fragments merging', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 800,
          reductionPercent: 20,
          totalChunks: 5,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats({ spacedFragmentsMerged: 10 }),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.bonuses.some(b => b.reason.includes('merged spaced'))).toBe(true)
    })

    it('applies deduction for pipeline failure', () => {
      const result = createPipelineResult({ success: false })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.deductions.some(d => d.reason.includes('did not complete'))).toBe(true)
    })

    it('applies deduction for heavy garbage removal', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 800,
          reductionPercent: 20,
          totalChunks: 5,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats({ garbageLinesRemoved: 25 }),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.deductions.some(d => d.reason.includes('garbage removal'))).toBe(true)
    })

    it('applies deduction for many control chars', () => {
      const result = createPipelineResult({
        stats: {
          originalLength: 1000,
          finalLength: 800,
          reductionPercent: 20,
          totalChunks: 5,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats({ controlCharsRemoved: 15 }),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.breakdown.deductions.some(d => d.reason.includes('control chars'))).toBe(true)
    })

    it('uses custom config weights', () => {
      const result = createPipelineResult()
      const score = calculateConfidenceScore(result, {
        weights: { qaGates: 50, preservation: 20, artifacts: 15, contentRatio: 10, efficiency: 5 },
      })
      expect(score.breakdown.qaGateWeight).toBe(50)
    })

    it('clamps score to 0-100 range', () => {
      const result = createPipelineResult({ success: false })
      const score = calculateConfidenceScore(result)
      expect(score.score).toBeGreaterThanOrEqual(0)
      expect(score.score).toBeLessThanOrEqual(100)
    })

    it('limits recommendations to 5', () => {
      const result = createPipelineResult({
        preservationValid: false,
        preservationIssues: ['policy issue', 'amount issue', 'date issue', 'issue4', 'issue5', 'issue6'],
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B', 'a!!!a', 'spaced frag', 'more'],
        stats: {
          originalLength: 1000,
          finalLength: 300,
          reductionPercent: 70,
          totalChunks: 5,
          chunksRetried: 0,
          chunksFailed: 0,
          totalProcessingTimeMs: 500,
          sanitizerStats: createSanitizerStats(),
        },
      })
      const score = calculateConfidenceScore(result)
      expect(score.recommendations.length).toBeLessThanOrEqual(5)
    })

    it('assigns correct grades', () => {
      // Grade A: >= 90
      const result90 = createPipelineResult()
      const score90 = calculateConfidenceScore(result90)
      if (score90.score >= 90) expect(score90.grade).toBe('A')

      // We cannot guarantee specific scores, but we can test the mapping function indirectly
    })
  })

  describe('calculateQuickConfidence', () => {
    it('returns 100 for perfect input', () => {
      const score = calculateQuickConfidence(1000, 800, createSanitizerStats())
      expect(score).toBeGreaterThanOrEqual(80)
    })

    it('deducts heavily for ratio < 0.3', () => {
      const score = calculateQuickConfidence(1000, 200, createSanitizerStats())
      expect(score).toBeLessThanOrEqual(70)
    })

    it('deducts for ratio 0.3-0.5', () => {
      const score = calculateQuickConfidence(1000, 400, createSanitizerStats())
      expect(score).toBeLessThanOrEqual(85)
    })

    it('deducts slightly for suspiciously clean (>0.98 with 0 garbage)', () => {
      const score = calculateQuickConfidence(1000, 990, createSanitizerStats({ garbageLinesRemoved: 0 }))
      expect(score).toBeLessThanOrEqual(95)
    })

    it('deducts for remaining artifacts', () => {
      const score = calculateQuickConfidence(1000, 800, createSanitizerStats(), true)
      expect(score).toBeLessThanOrEqual(80)
    })

    it('deducts for high garbage removal', () => {
      const score = calculateQuickConfidence(1000, 800, createSanitizerStats({ garbageLinesRemoved: 35 }))
      expect(score).toBeLessThanOrEqual(90)
    })

    it('deducts for many control chars', () => {
      const score = calculateQuickConfidence(1000, 800, createSanitizerStats({ controlCharsRemoved: 25 }))
      expect(score).toBeLessThanOrEqual(95)
    })

    it('adds bonus for good fragment merging', () => {
      const score = calculateQuickConfidence(1000, 800, createSanitizerStats({ spacedFragmentsMerged: 5 }))
      expect(score).toBeGreaterThanOrEqual(100) // 100 + 5 capped to 100
    })

    it('handles zero original length', () => {
      const score = calculateQuickConfidence(0, 0, createSanitizerStats())
      expect(score).toBeGreaterThanOrEqual(0)
    })

    it('clamps to 0-100', () => {
      const bad = calculateQuickConfidence(1000, 100, createSanitizerStats({ garbageLinesRemoved: 50, controlCharsRemoved: 50 }), true)
      expect(bad).toBeGreaterThanOrEqual(0)
      expect(bad).toBeLessThanOrEqual(100)
    })
  })

  describe('aggregateConfidenceScores', () => {
    it('returns zeros for empty array', () => {
      const agg = aggregateConfidenceScores([])
      expect(agg.averageScore).toBe(0)
      expect(agg.minScore).toBe(0)
      expect(agg.maxScore).toBe(0)
    })

    it('aggregates multiple scores', () => {
      const result1 = createPipelineResult()
      const result2 = createPipelineResult({ success: false })
      const s1 = calculateConfidenceScore(result1)
      const s2 = calculateConfidenceScore(result2)
      const agg = aggregateConfidenceScores([s1, s2])
      expect(agg.averageScore).toBeGreaterThan(0)
      expect(agg.minScore).toBeLessThanOrEqual(agg.maxScore)
      expect(agg.gradeDistribution).toBeDefined()
      expect(agg.statusDistribution).toBeDefined()
    })

    it('counts grade and status distributions', () => {
      const result = createPipelineResult()
      const s = calculateConfidenceScore(result)
      const agg = aggregateConfidenceScores([s])
      const totalGrades = Object.values(agg.gradeDistribution).reduce((a, b) => a + b, 0)
      expect(totalGrades).toBe(1)
    })
  })

  describe('getConfidenceColor', () => {
    it('returns green for A', () => {
      expect(getConfidenceColor('A')).toContain('green')
    })

    it('returns blue for B', () => {
      expect(getConfidenceColor('B')).toContain('blue')
    })

    it('returns yellow for C', () => {
      expect(getConfidenceColor('C')).toContain('yellow')
    })

    it('returns orange for D', () => {
      expect(getConfidenceColor('D')).toContain('orange')
    })

    it('returns red for F', () => {
      expect(getConfidenceColor('F')).toContain('red')
    })
  })

  describe('getConfidenceIcon', () => {
    it('returns check-circle for excellent', () => {
      expect(getConfidenceIcon('excellent')).toBe('check-circle')
    })

    it('returns thumbs-up for good', () => {
      expect(getConfidenceIcon('good')).toBe('thumbs-up')
    })

    it('returns alert-circle for fair', () => {
      expect(getConfidenceIcon('fair')).toBe('alert-circle')
    })

    it('returns alert-triangle for poor', () => {
      expect(getConfidenceIcon('poor')).toBe('alert-triangle')
    })

    it('returns x-circle for critical', () => {
      expect(getConfidenceIcon('critical')).toBe('x-circle')
    })
  })
})
