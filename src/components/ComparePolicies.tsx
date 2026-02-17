import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, X, AlertTriangle, Lightbulb, Scale, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
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
import type { AnalyzedPolicy } from '@/types/policy'

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
    const policyMap = new Map(policies.map(p => [p.id, p]))
    const valid = urlIds.filter(id => policyMap.has(id))
    const invalid = urlIds.filter(id => !policyMap.has(id))
    const selected = valid.map(id => policyMap.get(id)).filter((p): p is AnalyzedPolicy => p !== undefined)
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

  // Run comparison
  const { comparison, isValid, validationMessage, error } = usePolicyComparison(selectedPolicies)

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
      updateUrl(validIds.filter(id => id !== policyId))
    } else if (validIds.length < 4) {
      updateUrl([...validIds, policyId])
    }
  }

  // Remove policy from selection
  const removePolicy = (policyId: string) => {
    updateUrl(validIds.filter(id => id !== policyId))
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
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="animate-pulse text-gray-500">
          {t.common.loading}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {t.comparison.title}
            </h1>
            <p className="text-gray-600">
              {t.comparison.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedPolicies.length > 0 && (
              <Button variant="outline" onClick={clearAll} className="gap-2">
                <X className="w-4 h-4" />
                {t.comparison.clearAll}
              </Button>
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
              <p className="text-sm text-amber-700 mt-1">
                {t.comparison.policiesDeletedOrMoved}
              </p>
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
                <p className="text-gray-600 mb-4">
                  {t.comparison.uploadFirst}
                </p>
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
            <div className="flex flex-wrap gap-3">
              {selectedPolicies.map((policy, index) => (
                <div
                  key={policy.id}
                  className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200"
                >
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="text-lg" aria-hidden="true">{policy.logo}</span>
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
            <p className="text-blue-800 font-medium">
              {t.comparison.selectMinTwo}
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">
                {t.comparison.comparisonError}
              </p>
              <p className="text-sm text-red-700 mt-1">{error.message}</p>
            </div>
          </div>
        )}

        {/* Comparison Results */}
        {comparison && (
          <div className="space-y-6">
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

            {/* Coverage Matrix */}
            <CollapsibleSection
              title={t.comparison.coverageMatrix}
              expanded={expandedSections.coverage}
              onToggle={() => toggleSection('coverage')}
            >
              <CoverageSummary comparison={comparison} className="mb-4" />
              <CoverageMatrix comparison={comparison} />
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
                    <TradeoffCard key={index} tradeoff={tradeoff} policies={comparison.policies} locale={locale} t={t} />
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
                  {locale === 'tr' ? comparison.analysis.recommendationTR : comparison.analysis.recommendation}
                </p>

                {/* Winner highlight */}
                {comparison.winners.overallBest && (
                  <div className="mt-4 pt-4 border-t border-amber-200 flex items-center gap-3">
                    {(() => {
                      const winner = comparison.policies.find(p => p.policy.id === comparison.winners.overallBest)
                      if (!winner) return null
                      return (
                        <>
                          <span className="text-2xl">{winner.policy.logo}</span>
                          <div>
                            <p className="font-semibold text-gray-900">{winner.label || winner.policy.provider}</p>
                            <p className="text-sm text-gray-600">
                              {t.comparison.recommendedChoice}
                            </p>
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <GradeBadge grade={winner.evaluation.grade} size="lg" />
                            <span className="text-2xl font-bold text-gray-900">{winner.evaluation.overallScore}</span>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>

              {/* Recommendations from winner policy */}
              {(() => {
                const winner = comparison.policies.find(p => p.policy.id === comparison.winners.overallBest)
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

function CollapsibleSection({ title, expanded, onToggle, icon, children }: CollapsibleSectionProps) {
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
  const getPolicy = (id: string) => policies.find(p => p.policy.id === id)
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
                <p className="font-medium text-gray-900">{policy1.label || policy1.policy.provider}</p>
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
                <p className="font-medium text-gray-900">{policy2.label || policy2.policy.provider}</p>
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
