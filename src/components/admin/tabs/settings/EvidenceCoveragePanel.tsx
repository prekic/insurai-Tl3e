import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, AlertTriangle, CheckCircle, Eye, FileWarning } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  PolicyEvaluationResult,
  EvidenceCoverageReport,
  EvidenceValidation,
} from '@/lib/actuarial-engine/types'

interface EvidenceCoveragePanelProps {
  evaluationResult: PolicyEvaluationResult | null
}

/**
 * Confidence distribution buckets used for the histogram.
 */
interface ConfidenceBucket {
  label: string
  min: number
  max: number
  count: number
  color: string
}

function buildConfidenceBuckets(validations: EvidenceValidation[]): ConfidenceBucket[] {
  const buckets: ConfidenceBucket[] = [
    { label: '0–20%', min: 0, max: 0.2, count: 0, color: 'bg-red-500' },
    { label: '20–40%', min: 0.2, max: 0.4, count: 0, color: 'bg-orange-500' },
    { label: '40–60%', min: 0.4, max: 0.6, count: 0, color: 'bg-amber-500' },
    { label: '60–80%', min: 0.6, max: 0.8, count: 0, color: 'bg-blue-500' },
    { label: '80–100%', min: 0.8, max: 1.01, count: 0, color: 'bg-green-500' },
  ]

  for (const v of validations) {
    if (!v.hasEvidence) continue
    const conf = v.avgConfidence
    for (const bucket of buckets) {
      if (conf >= bucket.min && conf < bucket.max) {
        bucket.count++
        break
      }
    }
  }

  return buckets
}

function getCoverageColor(percent: number): string {
  if (percent >= 80) return 'text-green-700'
  if (percent >= 50) return 'text-amber-700'
  return 'text-red-700'
}

function getCoverageBg(percent: number): string {
  if (percent >= 80) return 'bg-green-100'
  if (percent >= 50) return 'bg-amber-100'
  return 'bg-red-100'
}

export function EvidenceCoveragePanel({ evaluationResult }: EvidenceCoveragePanelProps) {
  const coverage = evaluationResult?.evidenceCoverage ?? null

  // Build all validations from the coverage report — the report only gives
  // fieldsNeedingReview directly, so we derive a "all validations" list.
  // Since the report doesn't include ALL individual validations, we work
  // with what we have: fieldsNeedingReview for the detail table.
  const allValidations = useMemo(() => {
    if (!coverage) return []
    return coverage.fieldsNeedingReview
  }, [coverage])

  const confidenceBuckets = useMemo(() => {
    if (!coverage) return []
    return buildConfidenceBuckets(coverage.fieldsNeedingReview)
  }, [coverage])

  const maxBucketCount = useMemo(
    () => Math.max(1, ...confidenceBuckets.map((b) => b.count)),
    [confidenceBuckets]
  )

  if (!evaluationResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-gray-400" />
            Evidence Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm">
            No evaluation data available. Run an actuarial evaluation to see evidence coverage
            metrics.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!coverage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-gray-400" />
            Evidence Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm">
            No evidence coverage data in this evaluation result.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4" data-testid="evidence-coverage-panel">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CoverageRateCard coverage={coverage} />
        <FieldsWithEvidenceCard coverage={coverage} />
        <ReviewStatusCard coverage={coverage} />
      </div>

      {/* Confidence Distribution */}
      {confidenceBuckets.some((b) => b.count > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Confidence Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {confidenceBuckets.map((bucket) => (
                <div key={bucket.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16 shrink-0">{bucket.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', bucket.color)}
                      style={{ width: `${(bucket.count / maxBucketCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-600 w-6 text-right">
                    {bucket.count}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fields Needing Review */}
      {allValidations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-amber-600" />
              Fields Needing Review ({allValidations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium text-gray-600">Field</th>
                    <th className="py-2 px-3 font-medium text-gray-600">Evidence</th>
                    <th className="py-2 px-3 font-medium text-gray-600">Confidence</th>
                    <th className="py-2 px-3 font-medium text-gray-600">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {allValidations.map((v) => (
                    <tr key={v.fieldPath} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-xs">{v.fieldPath}</td>
                      <td className="py-2 px-3">
                        {v.hasEvidence ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {v.evidenceCount}
                          </span>
                        ) : (
                          <span className="text-red-600 flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            None
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={cn(
                            'font-mono text-xs',
                            v.avgConfidence >= 0.7
                              ? 'text-green-700'
                              : v.avgConfidence >= 0.4
                                ? 'text-amber-700'
                                : 'text-red-700'
                          )}
                        >
                          {v.hasEvidence ? `${(v.avgConfidence * 100).toFixed(0)}%` : '—'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-500">{v.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Card Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

function CoverageRateCard({ coverage }: { coverage: EvidenceCoverageReport }) {
  const color = getCoverageColor(coverage.coveragePercent)
  const bg = getCoverageBg(coverage.coveragePercent)
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', bg)}>
            <Shield className={cn('h-5 w-5', color)} />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Coverage Rate</p>
            <p className={cn('text-2xl font-bold', color)} data-testid="coverage-rate">
              {coverage.coveragePercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FieldsWithEvidenceCard({ coverage }: { coverage: EvidenceCoverageReport }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100">
            <Eye className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Fields with Evidence</p>
            <p className="text-2xl font-bold text-gray-900" data-testid="fields-with-evidence">
              {coverage.fieldsWithEvidence}{' '}
              <span className="text-sm font-normal text-gray-500">/ {coverage.totalFields}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ReviewStatusCard({ coverage }: { coverage: EvidenceCoverageReport }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-2 rounded-lg',
              coverage.overallNeedsReview ? 'bg-amber-100' : 'bg-green-100'
            )}
          >
            {coverage.overallNeedsReview ? (
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-700" />
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Review Status</p>
            <p
              className={cn(
                'text-lg font-semibold',
                coverage.overallNeedsReview ? 'text-amber-700' : 'text-green-700'
              )}
              data-testid="review-status"
            >
              {coverage.overallNeedsReview
                ? `${coverage.fieldsNeedingReview.length} fields need review`
                : 'All fields verified'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
