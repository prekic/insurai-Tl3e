import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvidenceCoveragePanel } from './EvidenceCoveragePanel'
import type { PolicyEvaluationResult, EvidenceCoverageReport } from '@/lib/actuarial-engine/types'

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makeMinimalEvalResult(
  overrides: Partial<PolicyEvaluationResult> = {}
): PolicyEvaluationResult {
  return {
    eligible: true,
    blockingReasons: [],
    warnings: [],
    productMismatches: [],
    compliance: {
      eligible: true,
      blockingReasons: [],
      warnings: [],
      checkedAt: new Date().toISOString(),
      rulesetVersion: 'test-v1',
    },
    semanticExclusions: [],
    evidenceCoverage: {
      totalFields: 10,
      fieldsWithEvidence: 8,
      coveragePercent: 80,
      fieldsNeedingReview: [],
      overallNeedsReview: false,
    },
    scenarioScores: {},
    expectedOutOfPocket: {
      expectedCost: { currency: 'TRY', amount: 0 },
      premium: { currency: 'TRY', amount: 15000 },
      expectedUncoveredLoss: { currency: 'TRY', amount: 0 },
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
      scenarioBreakdown: [],
      config: { numSimulations: 1000, seed: 42, confidenceInterval: 0.9 },
      contractQualityFactor: 1,
    },
    contractQualityScore: 80,
    configSnapshot: { ruleset: 'test' },
    needsReview: false,
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('EvidenceCoveragePanel', () => {
  it('renders empty state when evaluationResult is null', () => {
    render(<EvidenceCoveragePanel evaluationResult={null} />)
    expect(screen.getByText(/No evaluation data available/)).toBeInTheDocument()
  })

  it('renders empty state when evidenceCoverage is missing', () => {
    const result = makeMinimalEvalResult({
      evidenceCoverage: undefined as unknown as EvidenceCoverageReport,
    })
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByText(/No evidence coverage data/)).toBeInTheDocument()
  })

  it('displays coverage rate percentage', () => {
    const result = makeMinimalEvalResult()
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByTestId('coverage-rate')).toHaveTextContent('80.0%')
  })

  it('displays fields with evidence count', () => {
    const result = makeMinimalEvalResult()
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByTestId('fields-with-evidence')).toHaveTextContent('8')
    expect(screen.getByTestId('fields-with-evidence')).toHaveTextContent('/ 10')
  })

  it('shows "All fields verified" when overallNeedsReview is false', () => {
    const result = makeMinimalEvalResult()
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByTestId('review-status')).toHaveTextContent('All fields verified')
  })

  it('shows review warning when overallNeedsReview is true', () => {
    const result = makeMinimalEvalResult({
      evidenceCoverage: {
        totalFields: 10,
        fieldsWithEvidence: 5,
        coveragePercent: 50,
        fieldsNeedingReview: [
          {
            fieldPath: 'coverages[0].limit',
            hasEvidence: false,
            evidenceCount: 0,
            avgConfidence: 0,
            needsReview: true,
            reason: 'Missing evidence',
          },
          {
            fieldPath: 'premium.amount',
            hasEvidence: true,
            evidenceCount: 1,
            avgConfidence: 0.3,
            needsReview: true,
            reason: 'Low confidence',
          },
        ],
        overallNeedsReview: true,
      },
    })
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByTestId('review-status')).toHaveTextContent('2 fields need review')
  })

  it('renders fields needing review table', () => {
    const result = makeMinimalEvalResult({
      evidenceCoverage: {
        totalFields: 5,
        fieldsWithEvidence: 3,
        coveragePercent: 60,
        fieldsNeedingReview: [
          {
            fieldPath: 'coverages[0].limit',
            hasEvidence: false,
            evidenceCount: 0,
            avgConfidence: 0,
            needsReview: true,
            reason: 'No evidence pointer found',
          },
          {
            fieldPath: 'premium.amount',
            hasEvidence: true,
            evidenceCount: 1,
            avgConfidence: 0.35,
            needsReview: true,
            reason: 'Below confidence threshold',
          },
        ],
        overallNeedsReview: true,
      },
    })
    render(<EvidenceCoveragePanel evaluationResult={result} />)

    // Table headers
    expect(screen.getByText('Field')).toBeInTheDocument()
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.getByText('Confidence')).toBeInTheDocument()
    expect(screen.getByText('Reason')).toBeInTheDocument()

    // Field paths
    expect(screen.getByText('coverages[0].limit')).toBeInTheDocument()
    expect(screen.getByText('premium.amount')).toBeInTheDocument()

    // Evidence status
    expect(screen.getByText('None')).toBeInTheDocument()

    // Reasons
    expect(screen.getByText('No evidence pointer found')).toBeInTheDocument()
    expect(screen.getByText('Below confidence threshold')).toBeInTheDocument()
  })

  it('does not render review table when no fields need review', () => {
    const result = makeMinimalEvalResult()
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.queryByText('Fields Needing Review')).not.toBeInTheDocument()
  })

  it('renders confidence distribution histogram with data', () => {
    const result = makeMinimalEvalResult({
      evidenceCoverage: {
        totalFields: 6,
        fieldsWithEvidence: 4,
        coveragePercent: 67,
        fieldsNeedingReview: [
          {
            fieldPath: 'f1',
            hasEvidence: true,
            evidenceCount: 2,
            avgConfidence: 0.95,
            needsReview: true,
            reason: 'test',
          },
          {
            fieldPath: 'f2',
            hasEvidence: true,
            evidenceCount: 1,
            avgConfidence: 0.55,
            needsReview: true,
            reason: 'test',
          },
          {
            fieldPath: 'f3',
            hasEvidence: true,
            evidenceCount: 1,
            avgConfidence: 0.85,
            needsReview: true,
            reason: 'test',
          },
          {
            fieldPath: 'f4',
            hasEvidence: false,
            evidenceCount: 0,
            avgConfidence: 0,
            needsReview: true,
            reason: 'missing',
          },
        ],
        overallNeedsReview: true,
      },
    })
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByText('Confidence Distribution')).toBeInTheDocument()
    expect(screen.getByText('80–100%')).toBeInTheDocument()
    expect(screen.getByText('40–60%')).toBeInTheDocument()
  })

  it('applies green color for high coverage rate', () => {
    const result = makeMinimalEvalResult({
      evidenceCoverage: {
        totalFields: 10,
        fieldsWithEvidence: 9,
        coveragePercent: 90,
        fieldsNeedingReview: [],
        overallNeedsReview: false,
      },
    })
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByTestId('coverage-rate')).toHaveTextContent('90.0%')
  })

  it('applies red color for low coverage rate', () => {
    const result = makeMinimalEvalResult({
      evidenceCoverage: {
        totalFields: 10,
        fieldsWithEvidence: 2,
        coveragePercent: 20,
        fieldsNeedingReview: [],
        overallNeedsReview: false,
      },
    })
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByTestId('coverage-rate')).toHaveTextContent('20.0%')
  })

  it('renders data-testid on the panel container', () => {
    const result = makeMinimalEvalResult()
    render(<EvidenceCoveragePanel evaluationResult={result} />)
    expect(screen.getByTestId('evidence-coverage-panel')).toBeInTheDocument()
  })
})
