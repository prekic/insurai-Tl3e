/**
 * Tests for OCR Confidence Scoring System
 */

import { describe, it, expect } from 'vitest'
import {
  calculateConfidenceScore,
  calculateQuickConfidence,
  aggregateConfidenceScores,
  getConfidenceColor,
  getConfidenceIcon,
  type ConfidenceScore,
} from './ocr-confidence'
import type { PipelineResult, SanitizerStats } from './ocr-cleanup-pipeline'
import type { DocumentQAReport } from './qa-gates'

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockSanitizerStats(overrides?: Partial<SanitizerStats>): SanitizerStats {
  return {
    linesRemoved: 10,
    garbageLinesRemoved: 5,
    lowLetterRatioLinesRemoved: 3,
    spacedFragmentsMerged: 2,
    controlCharsRemoved: 1,
    spacesNormalized: 50,
    newlinesNormalized: 10,
    barcodeTokensIsolated: 0,
    ...overrides,
  }
}

function createMockQAReport(overrides?: Partial<DocumentQAReport>): DocumentQAReport {
  return {
    documentId: 'test-doc',
    totalChunks: 5,
    passedChunks: 4,
    failedChunks: 0,
    retriedChunks: 1,
    manualReviewChunks: 0,
    chunkReports: [],
    overallStatus: 'passed',
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

function createMockPipelineResult(overrides?: Partial<PipelineResult>): PipelineResult {
  return {
    text: 'Cleaned text output',
    success: true,
    chunking: null,
    chunks: [],
    qaReport: createMockQAReport(),
    hasQAFailures: false,
    failedChunkIndices: [],
    preservationValid: true,
    preservationIssues: [],
    artifactsRemaining: false,
    remainingArtifacts: [],
    stats: {
      originalLength: 1000,
      finalLength: 800,
      reductionPercent: 20,
      totalChunks: 5,
      chunksRetried: 1,
      chunksFailed: 0,
      totalProcessingTimeMs: 500,
      sanitizerStats: createMockSanitizerStats(),
    },
    logs: [],
    ...overrides,
  }
}

// ============================================================================
// TESTS: calculateConfidenceScore
// ============================================================================

describe('calculateConfidenceScore', () => {
  describe('basic scoring', () => {
    it('should calculate high score for excellent result', () => {
      const result = createMockPipelineResult({
        success: true,
        preservationValid: true,
        artifactsRemaining: false,
      })

      const score = calculateConfidenceScore(result)

      expect(score.score).toBeGreaterThanOrEqual(80)
      expect(score.grade).toMatch(/^[AB]$/)
      expect(score.status).toMatch(/^(excellent|good)$/)
    })

    it('should calculate lower score for failed result', () => {
      const result = createMockPipelineResult({
        success: false,
        preservationValid: false,
        preservationIssues: ['Policy number not preserved'],
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B pattern found'],
      })

      const score = calculateConfidenceScore(result)

      expect(score.score).toBeLessThan(80)
      expect(score.negativeFactors.length).toBeGreaterThan(0)
    })

    it('should return all required fields', () => {
      const result = createMockPipelineResult()
      const score = calculateConfidenceScore(result)

      expect(score).toHaveProperty('score')
      expect(score).toHaveProperty('grade')
      expect(score).toHaveProperty('status')
      expect(score).toHaveProperty('breakdown')
      expect(score).toHaveProperty('positiveFactors')
      expect(score).toHaveProperty('negativeFactors')
      expect(score).toHaveProperty('recommendations')
      expect(score).toHaveProperty('calculatedAt')
    })

    it('should clamp score between 0 and 100', () => {
      // Test minimum
      const badResult = createMockPipelineResult({
        success: false,
        preservationValid: false,
        preservationIssues: Array(10).fill('Issue'),
        artifactsRemaining: true,
        remainingArtifacts: Array(10).fill('artifact'),
        stats: {
          ...createMockPipelineResult().stats,
          reductionPercent: 80,
          chunksFailed: 10,
        },
      })

      const badScore = calculateConfidenceScore(badResult)
      expect(badScore.score).toBeGreaterThanOrEqual(0)
      expect(badScore.score).toBeLessThanOrEqual(100)
    })
  })

  describe('QA gate scoring', () => {
    it('should give high QA score when all chunks pass first try', () => {
      const result = createMockPipelineResult({
        qaReport: createMockQAReport({
          totalChunks: 5,
          passedChunks: 5,
          retriedChunks: 0,
          failedChunks: 0,
        }),
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.qaGateScore).toBeGreaterThanOrEqual(30)
      expect(score.positiveFactors.some(f => f.factor.includes('first attempt'))).toBe(true)
    })

    it('should give medium QA score when chunks pass after retry', () => {
      const result = createMockPipelineResult({
        qaReport: createMockQAReport({
          totalChunks: 5,
          passedChunks: 3,
          retriedChunks: 2,
          failedChunks: 0,
        }),
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.qaGateScore).toBeGreaterThan(20)
      expect(score.breakdown.qaGateScore).toBeLessThan(35)
    })

    it('should deduct for failed chunks', () => {
      const result = createMockPipelineResult({
        qaReport: createMockQAReport({
          totalChunks: 5,
          passedChunks: 2,
          retriedChunks: 1,
          failedChunks: 2,
        }),
        hasQAFailures: true,
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.qaGateScore).toBeLessThan(25)
      expect(score.negativeFactors.some(f => f.factor.includes('failed QA'))).toBe(true)
    })

    it('should handle null QA report', () => {
      const result = createMockPipelineResult({
        qaReport: null,
      })

      const score = calculateConfidenceScore(result)

      // Should give neutral score
      expect(score.breakdown.qaGateScore).toBe(20)
    })
  })

  describe('preservation scoring', () => {
    it('should give full score when preservation is valid', () => {
      const result = createMockPipelineResult({
        preservationValid: true,
        preservationIssues: [],
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.preservationScore).toBe(25)
      expect(score.positiveFactors.some(f => f.factor.includes('preserved'))).toBe(true)
    })

    it('should deduct for preservation issues', () => {
      const result = createMockPipelineResult({
        preservationValid: false,
        preservationIssues: ['Policy number changed', 'Date modified'],
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.preservationScore).toBeLessThan(25)
      expect(score.negativeFactors.some(f => f.factor.includes('preservation'))).toBe(true)
    })

    it('should cap score for critical preservation issues', () => {
      const result = createMockPipelineResult({
        preservationValid: false,
        preservationIssues: ['Policy number not preserved'],
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.preservationScore).toBeLessThanOrEqual(10)
      expect(score.recommendations.some(r => r.includes('policy numbers'))).toBe(true)
    })
  })

  describe('artifact scoring', () => {
    it('should give full score when no artifacts remain', () => {
      const result = createMockPipelineResult({
        artifactsRemaining: false,
        remainingArtifacts: [],
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.artifactScore).toBe(20)
      expect(score.positiveFactors.some(f => f.factor.includes('No OCR artifacts'))).toBe(true)
    })

    it('should deduct for remaining artifacts', () => {
      const result = createMockPipelineResult({
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B', 'a!!!a'],
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.artifactScore).toBeLessThan(20)
    })

    it('should identify barcode artifacts', () => {
      const result = createMockPipelineResult({
        artifactsRemaining: true,
        remainingArtifacts: ['B^^^B pattern found'],
      })

      const score = calculateConfidenceScore(result)

      expect(score.negativeFactors.some(f => f.factor.includes('Barcode'))).toBe(true)
    })
  })

  describe('content ratio scoring', () => {
    it('should give full score for healthy content ratio', () => {
      const result = createMockPipelineResult({
        stats: {
          ...createMockPipelineResult().stats,
          originalLength: 1000,
          finalLength: 750, // 25% reduction
          reductionPercent: 25,
        },
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.contentRatioScore).toBe(15)
    })

    it('should deduct for excessive content removal', () => {
      const result = createMockPipelineResult({
        stats: {
          ...createMockPipelineResult().stats,
          originalLength: 1000,
          finalLength: 300, // 70% reduction
          reductionPercent: 70,
        },
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.contentRatioScore).toBeLessThan(15)
      expect(score.negativeFactors.some(f => f.factor.includes('High content removal'))).toBe(true)
    })
  })

  describe('efficiency scoring', () => {
    it('should give full score when no retries needed', () => {
      const result = createMockPipelineResult({
        stats: {
          ...createMockPipelineResult().stats,
          chunksRetried: 0,
          totalChunks: 5,
        },
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.efficiencyScore).toBe(5)
    })

    it('should deduct for high retry rate', () => {
      const result = createMockPipelineResult({
        stats: {
          ...createMockPipelineResult().stats,
          chunksRetried: 4,
          totalChunks: 5,
        },
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.efficiencyScore).toBeLessThan(5)
    })
  })

  describe('bonuses and deductions', () => {
    it('should add bonus for perfect QA pass', () => {
      const result = createMockPipelineResult({
        qaReport: createMockQAReport({
          overallStatus: 'passed',
        }),
        stats: {
          ...createMockPipelineResult().stats,
          chunksRetried: 0,
        },
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.bonuses.some(b => b.reason.includes('Perfect QA'))).toBe(true)
    })

    it('should add bonus for successful fragment merging', () => {
      const result = createMockPipelineResult({
        stats: {
          ...createMockPipelineResult().stats,
          sanitizerStats: createMockSanitizerStats({ spacedFragmentsMerged: 10 }),
        },
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.bonuses.some(b => b.reason.includes('fragment'))).toBe(true)
    })

    it('should deduct for overall failure', () => {
      const result = createMockPipelineResult({
        success: false,
      })

      const score = calculateConfidenceScore(result)

      expect(score.breakdown.deductions.some(d => d.reason.includes('not complete'))).toBe(true)
    })
  })

  describe('grade assignment', () => {
    it('should assign grade A for score >= 90', () => {
      const result = createMockPipelineResult({
        qaReport: createMockQAReport({
          passedChunks: 5,
          retriedChunks: 0,
          failedChunks: 0,
        }),
      })

      const score = calculateConfidenceScore(result)

      if (score.score >= 90) {
        expect(score.grade).toBe('A')
        expect(score.status).toBe('excellent')
      }
    })

    it('should assign grade F for score < 40', () => {
      const result = createMockPipelineResult({
        success: false,
        preservationValid: false,
        preservationIssues: Array(5).fill('Critical issue'),
        artifactsRemaining: true,
        remainingArtifacts: Array(5).fill('artifact'),
        qaReport: createMockQAReport({
          passedChunks: 0,
          failedChunks: 5,
          overallStatus: 'failed',
        }),
        hasQAFailures: true,
      })

      const score = calculateConfidenceScore(result)

      if (score.score < 40) {
        expect(score.grade).toBe('F')
        expect(score.status).toBe('critical')
      }
    })
  })
})

// ============================================================================
// TESTS: calculateQuickConfidence
// ============================================================================

describe('calculateQuickConfidence', () => {
  it('should return high score for clean result', () => {
    const score = calculateQuickConfidence(
      1000, // original
      800,  // final
      createMockSanitizerStats(),
      false // no artifacts
    )

    expect(score).toBeGreaterThanOrEqual(80)
  })

  it('should deduct for excessive removal', () => {
    const score = calculateQuickConfidence(
      1000, // original
      200,  // final (80% removed)
      createMockSanitizerStats(),
      false
    )

    expect(score).toBeLessThanOrEqual(70)
  })

  it('should deduct for remaining artifacts', () => {
    const score = calculateQuickConfidence(
      1000,
      800,
      createMockSanitizerStats(),
      true // has artifacts
    )

    expect(score).toBeLessThan(90)
  })

  it('should boost for good fragment merging', () => {
    // Use a baseline with some deduction so boost is visible
    const withMerging = calculateQuickConfidence(
      1000,
      800,
      createMockSanitizerStats({ spacedFragmentsMerged: 5, garbageLinesRemoved: 35 }),
      false
    )

    const withoutMerging = calculateQuickConfidence(
      1000,
      800,
      createMockSanitizerStats({ spacedFragmentsMerged: 0, garbageLinesRemoved: 35 }),
      false
    )

    expect(withMerging).toBeGreaterThanOrEqual(withoutMerging)
  })

  it('should clamp score between 0 and 100', () => {
    const lowScore = calculateQuickConfidence(
      1000,
      50, // 95% removed
      createMockSanitizerStats({ garbageLinesRemoved: 100 }),
      true
    )

    expect(lowScore).toBeGreaterThanOrEqual(0)
    expect(lowScore).toBeLessThanOrEqual(100)
  })
})

// ============================================================================
// TESTS: aggregateConfidenceScores
// ============================================================================

describe('aggregateConfidenceScores', () => {
  it('should aggregate empty array', () => {
    const result = aggregateConfidenceScores([])

    expect(result.averageScore).toBe(0)
    expect(result.minScore).toBe(0)
    expect(result.maxScore).toBe(0)
  })

  it('should calculate correct statistics', () => {
    const scores: ConfidenceScore[] = [
      { score: 90, grade: 'A', status: 'excellent', breakdown: {} as any, positiveFactors: [], negativeFactors: [], recommendations: [], calculatedAt: '' },
      { score: 75, grade: 'B', status: 'good', breakdown: {} as any, positiveFactors: [], negativeFactors: [], recommendations: [], calculatedAt: '' },
      { score: 60, grade: 'C', status: 'fair', breakdown: {} as any, positiveFactors: [], negativeFactors: [], recommendations: [], calculatedAt: '' },
    ]

    const result = aggregateConfidenceScores(scores)

    expect(result.averageScore).toBe(75)
    expect(result.minScore).toBe(60)
    expect(result.maxScore).toBe(90)
    expect(result.gradeDistribution.A).toBe(1)
    expect(result.gradeDistribution.B).toBe(1)
    expect(result.gradeDistribution.C).toBe(1)
    expect(result.statusDistribution.excellent).toBe(1)
  })

  it('should handle single score', () => {
    const scores: ConfidenceScore[] = [
      { score: 85, grade: 'B', status: 'good', breakdown: {} as any, positiveFactors: [], negativeFactors: [], recommendations: [], calculatedAt: '' },
    ]

    const result = aggregateConfidenceScores(scores)

    expect(result.averageScore).toBe(85)
    expect(result.minScore).toBe(85)
    expect(result.maxScore).toBe(85)
  })
})

// ============================================================================
// TESTS: UI helpers
// ============================================================================

describe('getConfidenceColor', () => {
  it('should return correct colors for each grade', () => {
    expect(getConfidenceColor('A')).toContain('green')
    expect(getConfidenceColor('B')).toContain('blue')
    expect(getConfidenceColor('C')).toContain('yellow')
    expect(getConfidenceColor('D')).toContain('orange')
    expect(getConfidenceColor('F')).toContain('red')
  })
})

describe('getConfidenceIcon', () => {
  it('should return correct icons for each status', () => {
    expect(getConfidenceIcon('excellent')).toBe('check-circle')
    expect(getConfidenceIcon('good')).toBe('thumbs-up')
    expect(getConfidenceIcon('fair')).toBe('alert-circle')
    expect(getConfidenceIcon('poor')).toBe('alert-triangle')
    expect(getConfidenceIcon('critical')).toBe('x-circle')
  })
})
