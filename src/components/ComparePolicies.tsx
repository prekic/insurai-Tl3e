import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus,
  X,
  AlertTriangle,
  Lightbulb,
  Scale,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { usePolicies } from '@/lib/policy-context'
import { usePolicyComparison } from '@/hooks/usePolicyComparison'
import { PolicyCard } from './PolicyCard'
import {
  ComparisonTable,
  ComparisonSummary,
  CoverageMatrix,
  CoverageSummary,
  RecommendationList,
  GradeBadge,
} from './evaluation'
import { exportComparisonToCSV, exportComparisonToPDF } from '@/lib/export'
import type { AnalyzedPolicy } from '@/types/policy'
import type { PolicyComparison as PolicyComparisonType } from '@/lib/policy-evaluation/types'
import { emitEvaluation } from '@/lib/actuarial-engine'

/**
 * ComparePolicies page for side-by-side policy comparison.
 * Supports URL state for shareable comparisons.
 */
export function ComparePolicies() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t, locale, isRTL } = useI18n()
  const { policies, isLoading } = usePolicies()

  // Get selected IDs from URL
  const urlIds = useMemo(() => {
    const idsParam = searchParams.get('ids')
    if (!idsParam) return []
    return idsParam.split(',').filter(Boolean)
  }, [searchParams])

  // Validate IDs against available policies
  const { validIds, invalidIds, selectedPolicies } = useMemo(() => {
    const policyMap = new Map(policies.map((p) => [p.id, p]))
    const valid = urlIds.filter((id) => policyMap.has(id))
    const invalid = urlIds.filter((id) => !policyMap.has(id))
    const selected = valid
      .map((id) => policyMap.get(id))
      .filter((p): p is AnalyzedPolicy => p !== undefined)
    return { validIds: valid, invalidIds: invalid, selectedPolicies: selected }
  }, [urlIds, policies])

  // Selection state
  const [showSelector, setShowSelector] = useState(selectedPolicies.length < 2)

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    metrics: true,
    coverage: true,
    differences: true,
    recommendation: true,
  })

  // Export dropdown state
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [exportMenuOpen])

  const handleExportPdf = useCallback(() => {
    exportComparisonToPDF(selectedPolicies)
    setExportMenuOpen(false)
    toast.success(t.comparison.pdfExported)
  }, [selectedPolicies, t.comparison.pdfExported])

  const handleExportCsv = useCallback(() => {
    exportComparisonToCSV(selectedPolicies)
    setExportMenuOpen(false)
    toast.success(t.comparison.csvExported)
  }, [selectedPolicies, t.comparison.csvExported])

  // Run comparison
  const { comparison, isValid, validationMessage, error } = usePolicyComparison(selectedPolicies)

  // P1: Emit actuarial timing events for each evaluated policy
  useEffect(() => {
    if (!comparison?.actuarialResults) return
    comparison.actuarialResults.forEach((result, index) => {
      if (result.layerTimings && selectedPolicies[index]) {
        emitEvaluation(selectedPolicies[index].id, result)
      }
    })
  }, [comparison?.actuarialResults, selectedPolicies])

  // Update URL when selection changes
  const updateUrl = (ids: string[]) => {
    const newParams = new URLSearchParams(searchParams)
    if (ids.length > 0) {
      newParams.set('ids', ids.join(','))
    } else {
      newParams.delete('ids')
    }
    setSearchParams(newParams, { replace: true })
  }

  // Toggle policy selection
  const togglePolicy = (policyId: string) => {
    if (validIds.includes(policyId)) {
      updateUrl(validIds.filter((id) => id !== policyId))
    } else if (validIds.length < 4) {
      updateUrl([...validIds, policyId])
    }
  }

  // Remove policy from selection
  const removePolicy = (policyId: string) => {
    updateUrl(validIds.filter((id) => id !== policyId))
  }

  // Clear all selections
  const clearAll = () => {
    updateUrl([])
    setShowSelector(true)
  }

  // Auto-hide selector when we have valid comparison
  useEffect(() => {
    if (selectedPolicies.length >= 2 && !showSelector) {
      // Keep selector closed
    } else if (selectedPolicies.length < 2) {
      setShowSelector(true)
    }
  }, [selectedPolicies.length, showSelector])

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-slate-50 flex items-center justify-center"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="animate-pulse text-gray-500">{t.common.loading}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t.comparison.title}</h1>
            <p className="text-gray-600">{t.comparison.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedPolicies.length > 0 && (
              <Button variant="outline" onClick={clearAll} className="gap-2">
                <X className="w-4 h-4" />
                {t.comparison.clearAll}
              </Button>
            )}
            {comparison && (
              <div className="relative" ref={exportMenuRef}>
                <Button
                  variant="outline"
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.comparison.exportComparison}</span>
                </Button>
                {exportMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button
                      onClick={handleExportPdf}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <FileText size={16} className="text-red-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900">
                        {t.comparison.exportPdf}
                      </span>
                    </button>
                    <button
                      onClick={handleExportCsv}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <FileSpreadsheet size={16} className="text-green-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900">
                        {t.comparison.exportCsv}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => setShowSelector(!showSelector)}
              className="gap-2"
            >
              {showSelector ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {t.comparison.selectPolicies}
              {selectedPolicies.length > 0 && (
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                  {selectedPolicies.length}/4
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Invalid IDs warning */}
        {invalidIds.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">
                {t.comparison.policiesNoLongerExist.replace('{count}', String(invalidIds.length))}
              </p>
              <p className="text-sm text-amber-700 mt-1">{t.comparison.policiesDeletedOrMoved}</p>
            </div>
          </div>
        )}

        {/* Policy Selector */}
        {showSelector && (
          <div className="mb-8 bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {t.comparison.selectPoliciesToCompare}
              </h2>
              <span className="text-sm text-gray-500">
                {t.comparison.selectedCount.replace('{count}', String(selectedPolicies.length))}
              </span>
            </div>

            {policies.length === 0 ? (
              <div className="text-center py-8">
                <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">{t.comparison.uploadFirst}</p>
                <Button onClick={() => navigate('/upload?autoOpen=true')}>
                  {t.comparison.uploadPolicy}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {policies.map((policy) => (
                  <PolicyCard
                    key={policy.id}
                    policy={policy}
                    compact
                    showEvaluation={false}
                    showActions={false}
                    isSelected={validIds.includes(policy.id)}
                    onSelect={() => togglePolicy(policy.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected Policies Preview */}
        {selectedPolicies.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {selectedPolicies.map((policy, index) => (
                <div
                  key={policy.id}
                  className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-white rounded-lg border border-gray-200"
                >
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="text-lg" aria-hidden="true">
                    {policy.logo}
                  </span>
                  <span className="font-medium text-gray-900">{policy.provider}</span>
                  <button
                    onClick={() => removePolicy(policy.id)}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    aria-label={`${t.comparison.removePolicy} ${policy.provider}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {selectedPolicies.length < 4 && (
                <button
                  onClick={() => setShowSelector(true)}
                  className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t.comparison.addPolicy}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Validation Message */}
        {!isValid && validationMessage && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl text-center">
            <Scale className="w-12 h-12 text-blue-400 mx-auto mb-4" />
            <p className="text-blue-800 font-medium">{t.comparison.selectMinTwo}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">{t.comparison.comparisonError}</p>
              <p className="text-sm text-red-700 mt-1">{error.message}</p>
            </div>
          </div>
        )}

        {/* Comparison Results */}
        {comparison && (
          <div className="space-y-6">
            {/* Quick Stats Summary */}
            <QuickStatsCard comparison={comparison} t={t} />

            {/* Score Comparison Chart */}
            <ScoreComparisonChart comparison={comparison} t={t} />

            {/* Winners Summary */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t.comparison.categoryWinners}
              </h2>
              <ComparisonSummary comparison={comparison} />
            </section>

            {/* Comparison Table */}
            <CollapsibleSection
              title={t.comparison.metricsComparison}
              expanded={expandedSections.metrics}
              onToggle={() => toggleSection('metrics')}
            >
              <ComparisonTable comparison={comparison} />
            </CollapsibleSection>

            {/* Coverage Matrix with Diff Highlighting */}
            <CollapsibleSection
              title={t.comparison.coverageMatrix}
              expanded={expandedSections.coverage}
              onToggle={() => toggleSection('coverage')}
            >
              <CoverageSummary comparison={comparison} className="mb-4" />
              <EnhancedCoverageMatrix comparison={comparison} t={t} locale={locale} />
            </CollapsibleSection>

            {/* Key Differences */}
            {comparison.analysis.keyDifferences.length > 0 && (
              <CollapsibleSection
                title={t.comparison.keyDifferences}
                expanded={expandedSections.differences}
                onToggle={() => toggleSection('differences')}
              >
                <div className="space-y-3">
                  {comparison.analysis.keyDifferences.map((diff, index) => (
                    <DifferenceCard key={index} difference={diff} locale={locale} t={t} />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Tradeoffs */}
            {comparison.analysis.tradeoffs.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Scale className="w-5 h-5 text-gray-600" />
                  {t.comparison.tradeoffs}
                </h2>
                <div className="space-y-4">
                  {comparison.analysis.tradeoffs.map((tradeoff, index) => (
                    <TradeoffCard
                      key={index}
                      tradeoff={tradeoff}
                      policies={comparison.policies}
                      locale={locale}
                      t={t}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* AI Recommendation */}
            <CollapsibleSection
              title={t.comparison.aiRecommendation}
              expanded={expandedSections.recommendation}
              onToggle={() => toggleSection('recommendation')}
              icon={<Lightbulb className="w-5 h-5 text-amber-500" />}
            >
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
                <p className="text-gray-800 leading-relaxed">
                  {locale === 'tr'
                    ? comparison.analysis.recommendationTR
                    : comparison.analysis.recommendation}
                </p>

                {/* Winner highlight */}
                {comparison.winners.overallBest && (
                  <div className="mt-4 pt-4 border-t border-amber-200 flex items-center gap-3">
                    {(() => {
                      const winner = comparison.policies.find(
                        (p) => p.policy.id === comparison.winners.overallBest
                      )
                      if (!winner) return null
                      return (
                        <>
                          <span className="text-2xl">{winner.policy.logo}</span>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {winner.label || winner.policy.provider}
                            </p>
                            <p className="text-sm text-gray-600">
                              {t.comparison.recommendedChoice}
                            </p>
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <GradeBadge grade={winner.evaluation.grade} size="lg" />
                            <span className="text-2xl font-bold text-gray-900">
                              {winner.evaluation.overallScore}
                            </span>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>

              {/* Recommendations from winner policy */}
              {(() => {
                const winner = comparison.policies.find(
                  (p) => p.policy.id === comparison.winners.overallBest
                )
                if (!winner || winner.evaluation.recommendations.length === 0) return null
                return (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      {t.comparison.improvementSuggestions}
                    </h3>
                    <RecommendationList
                      recommendations={winner.evaluation.recommendations}
                      maxItems={3}
                      compact
                    />
                  </div>
                )
              })()}
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  )
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string
  expanded: boolean
  onToggle: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  icon,
  children,
}: CollapsibleSectionProps) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        aria-expanded={expanded}
      >
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {expanded && <div className="px-6 pb-6">{children}</div>}
    </section>
  )
}

// Difference Card Component
interface DifferenceCardProps {
  difference: {
    aspect: string
    aspectTR: string
    description: string
    descriptionTR: string
    significance: 'major' | 'moderate' | 'minor'
    favoredPolicy: string
  }
  locale: string
  t: { comparison: { major: string; moderate: string; minor: string } }
}

function DifferenceCard({ difference, locale, t }: DifferenceCardProps) {
  const significanceStyles = {
    major: 'border-l-red-500 bg-red-50',
    moderate: 'border-l-amber-500 bg-amber-50',
    minor: 'border-l-blue-500 bg-blue-50',
  }

  return (
    <div className={cn('border-l-4 rounded-r-lg p-4', significanceStyles[difference.significance])}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-medium text-gray-900">
            {locale === 'tr' ? difference.aspectTR : difference.aspect}
          </h4>
          <p className="text-sm text-gray-700 mt-1">
            {locale === 'tr' ? difference.descriptionTR : difference.description}
          </p>
        </div>
        <span
          className={cn(
            'px-2 py-0.5 text-xs font-medium rounded',
            difference.significance === 'major' && 'bg-red-100 text-red-700',
            difference.significance === 'moderate' && 'bg-amber-100 text-amber-700',
            difference.significance === 'minor' && 'bg-blue-100 text-blue-700'
          )}
        >
          {t.comparison[difference.significance]}
        </span>
      </div>
    </div>
  )
}

// Tradeoff Card Component
interface TradeoffCardProps {
  tradeoff: {
    option1: { policyId: string; advantage: string; advantageTR: string }
    option2: { policyId: string; advantage: string; advantageTR: string }
    recommendation: string
    recommendationTR: string
  }
  policies: { policy: { id: string; logo: string; provider: string }; label?: string }[]
  locale: string
  t: { comparison: { recommendation: string } }
}

function TradeoffCard({ tradeoff, policies, locale, t }: TradeoffCardProps) {
  const getPolicy = (id: string) => policies.find((p) => p.policy.id === id)
  const policy1 = getPolicy(tradeoff.option1.policyId)
  const policy2 = getPolicy(tradeoff.option2.policyId)

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="flex items-start gap-3">
          {policy1 && (
            <>
              <span className="text-xl">{policy1.policy.logo}</span>
              <div>
                <p className="font-medium text-gray-900">
                  {policy1.label || policy1.policy.provider}
                </p>
                <p className="text-sm text-gray-600">
                  {locale === 'tr' ? tradeoff.option1.advantageTR : tradeoff.option1.advantage}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-start gap-3">
          {policy2 && (
            <>
              <span className="text-xl">{policy2.policy.logo}</span>
              <div>
                <p className="font-medium text-gray-900">
                  {policy2.label || policy2.policy.provider}
                </p>
                <p className="text-sm text-gray-600">
                  {locale === 'tr' ? tradeoff.option2.advantageTR : tradeoff.option2.advantage}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-700 pt-3 border-t border-gray-200">
        <strong>{t.comparison.recommendation}</strong>{' '}
        {locale === 'tr' ? tradeoff.recommendationTR : tradeoff.recommendation}
      </p>
    </div>
  )
}

// =============================================================================
// Quick Stats Summary Card
// =============================================================================

interface QuickStatsCardProps {
  comparison: PolicyComparisonType
  t: {
    comparison: {
      quickStats: string
      avgScore: string
      avgPremium: string
      totalCoverage: string
      policiesCompared: string
    }
  }
}

function QuickStatsCard({ comparison, t }: QuickStatsCardProps) {
  const { formatConverted } = useDisplayCurrency()
  const avgScore = Math.round(
    comparison.policies.reduce((sum, p) => sum + p.evaluation.overallScore, 0) /
      comparison.policies.length
  )
  const avgPremium =
    comparison.policies.reduce((sum, p) => sum + p.policy.premium, 0) / comparison.policies.length
  const totalCoverage = comparison.policies.reduce((sum, p) => sum + p.policy.coverage, 0)

  const stats = [
    {
      label: t.comparison.policiesCompared,
      value: String(comparison.policies.length),
      icon: <Scale className="w-5 h-5 text-blue-500" />,
    },
    {
      label: t.comparison.avgScore,
      value: `${avgScore}/100`,
      icon: <BarChart3 className="w-5 h-5 text-emerald-500" />,
    },
    {
      label: t.comparison.avgPremium,
      value: formatConverted(avgPremium),
      icon: <TrendingUp className="w-5 h-5 text-amber-500" />,
    },
    {
      label: t.comparison.totalCoverage,
      value: formatConverted(totalCoverage),
      icon: <TrendingUp className="w-5 h-5 text-purple-500" />,
    },
  ]

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-600" />
        {t.comparison.quickStats}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-gradient-to-br from-gray-50 to-white p-3 sm:p-4 rounded-xl border border-gray-100"
          >
            <div className="flex items-center gap-2 mb-1">
              {stat.icon}
              <span className="text-xs text-gray-500 truncate">{stat.label}</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-gray-900 truncate">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// =============================================================================
// Score Comparison Chart (CSS-based horizontal bars)
// =============================================================================

interface ScoreComparisonChartProps {
  comparison: PolicyComparisonType
  t: {
    comparison: {
      scoreChart: string
      premium: string
      coverage: string
      deductible: string
      compliance: string
      value: string
      overall: string
      best: string
    }
  }
}

function ScoreComparisonChart({ comparison, t }: ScoreComparisonChartProps) {
  const categories = ['premium', 'coverage', 'deductible', 'compliance', 'value'] as const
  const categoryLabels: Record<string, string> = {
    premium: t.comparison.premium,
    coverage: t.comparison.coverage,
    deductible: t.comparison.deductible,
    compliance: t.comparison.compliance,
    value: t.comparison.value,
  }

  const policyColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-600" />
        {t.comparison.scoreChart}
      </h2>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {comparison.policies.map((p, i) => {
          const rankInfo = comparison.rankings.find((r) => r.policyId === p.policy.id)
          const topsisGrade = rankInfo?.actuarialGrade

          return (
            <div key={p.policy.id} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: policyColors[i] }} />
              <span className="font-medium text-gray-700">{p.label || p.policy.provider}</span>
              <GradeBadge grade={p.evaluation.grade} size="sm" />
              {topsisGrade && (
                <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                  Actuarial: {topsisGrade}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Category bars */}
      <div className="space-y-4">
        {categories.map((cat) => {
          const scores = comparison.policies.map((p) => p.evaluation.scoreBreakdown[cat].score)
          const maxScore = Math.max(...scores)

          return (
            <div key={cat}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700">{categoryLabels[cat]}</span>
                <span className="text-xs text-gray-400">
                  {t.comparison.best}: {maxScore}
                </span>
              </div>
              <div className="space-y-1.5">
                {comparison.policies.map((p, i) => {
                  const score = p.evaluation.scoreBreakdown[cat].score
                  const isBest =
                    score === maxScore && scores.filter((s) => s === maxScore).length === 1
                  return (
                    <div key={p.policy.id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16 sm:w-20 truncate">
                        {p.label || p.policy.provider}
                      </span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${score}%`, backgroundColor: policyColors[i] }}
                        />
                      </div>
                      <span
                        className={cn(
                          'text-xs font-medium w-8 text-right',
                          isBest ? 'text-emerald-600' : 'text-gray-600'
                        )}
                      >
                        {score}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Overall Classic */}
        <div className="pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-gray-900">{t.comparison.overall}</span>
          </div>
          <div className="space-y-1.5">
            {comparison.policies.map((p, i) => {
              const score = p.evaluation.overallScore
              const isBest = p.policy.id === comparison.winners.overallBest
              return (
                <div key={p.policy.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16 sm:w-20 truncate">
                    {p.label || p.policy.provider}
                  </span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700 ease-out',
                        isBest && 'ring-2 ring-offset-1 ring-emerald-400'
                      )}
                      style={{ width: `${score}%`, backgroundColor: policyColors[i] }}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-sm font-bold w-8 text-right',
                      isBest ? 'text-emerald-600' : 'text-gray-700'
                    )}
                  >
                    {score}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Overall Actuarial (TOPSIS) */}
        <div className="pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-blue-900">Actuarial TOPSIS Score</span>
            <span className="text-xs text-gray-500 text-right">Beta Engine</span>
          </div>
          <div className="space-y-1.5">
            {comparison.policies.map((p, i) => {
              const rankInfo = comparison.rankings.find((r) => r.policyId === p.policy.id)
              // Calculate 0-100 closeness
              const closenessScore = Math.round((rankInfo?.actuarialCloseness || 0) * 100)
              const topsisRank = rankInfo?.actuarialRank || 99
              // find best by looking for rank 1
              const isBest = topsisRank === 1

              return (
                <div key={p.policy.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-16 sm:w-20 truncate">
                    {p.label || p.policy.provider}
                  </span>
                  <div className="flex-1 h-6 bg-blue-50 rounded-full overflow-hidden relative">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700 ease-out',
                        isBest && 'ring-2 ring-offset-1 ring-blue-400'
                      )}
                      style={{ width: `${closenessScore}%`, backgroundColor: policyColors[i] }}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-sm font-bold w-12 text-right',
                      isBest ? 'text-blue-700' : 'text-gray-700'
                    )}
                  >
                    #{topsisRank} ({closenessScore})
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

// =============================================================================
// Enhanced Coverage Matrix with Diff Highlighting
// =============================================================================

interface EnhancedCoverageMatrixProps {
  comparison: PolicyComparisonType
  t: { comparison: { included: string; notIncluded: string; best: string } }
  locale: string
}

function EnhancedCoverageMatrix({ comparison, t, locale }: EnhancedCoverageMatrixProps) {
  const { formatConverted } = useDisplayCurrency()
  if (!comparison.coverageMatrix || comparison.coverageMatrix.length === 0) {
    return <CoverageMatrix comparison={comparison} />
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm min-w-[500px]">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 font-medium text-gray-600 sticky left-0 bg-white">
              {locale === 'tr' ? 'Teminat' : 'Coverage'}
            </th>
            {comparison.policies.map((p) => (
              <th
                key={p.policy.id}
                className="text-center py-2 px-2 font-medium text-gray-600 whitespace-nowrap"
              >
                {p.label || p.policy.provider}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.coverageMatrix.map((row) => {
            const limits = row.policies.map((p) => p.limit)
            const maxLimit = Math.max(...limits.filter((l) => l > 0))
            const allIncluded = row.policies.every((p) => p.included)
            const noneIncluded = row.policies.every((p) => !p.included)
            const hasDiff = !allIncluded && !noneIncluded

            return (
              <tr
                key={row.coverageName}
                className={cn('border-b border-gray-100', hasDiff && 'bg-amber-50/50')}
              >
                <td className="py-2 px-3 font-medium text-gray-800 sticky left-0 bg-inherit whitespace-nowrap">
                  {locale === 'tr' ? row.coverageNameTR : row.coverageName}
                </td>
                {row.policies.map((p) => {
                  const isBest =
                    p.limit === maxLimit &&
                    maxLimit > 0 &&
                    limits.filter((l) => l === maxLimit).length === 1
                  return (
                    <td
                      key={p.policyId}
                      className={cn(
                        'text-center py-2 px-2',
                        !p.included && 'bg-red-50/70',
                        isBest && 'bg-emerald-50/70'
                      )}
                    >
                      {p.included ? (
                        <div>
                          <span
                            className={cn(
                              'font-medium',
                              isBest ? 'text-emerald-700' : 'text-gray-900'
                            )}
                          >
                            {p.limit > 0 ? formatConverted(p.limit) : t.comparison.included}
                          </span>
                          {isBest && (
                            <span className="ml-1 text-[10px] text-emerald-600 font-semibold">
                              {t.comparison.best}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-red-500 text-xs font-medium">
                          {t.comparison.notIncluded}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
