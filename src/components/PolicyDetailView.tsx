import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Share2, Shield, AlertTriangle, Check, X, Sparkles, TrendingUp, TrendingDown, BarChart3, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { PolicyDocuments } from './PolicyDocuments'
import { formatCurrency, formatDate } from '@/lib/utils'
import { usePolicies } from '@/lib/policy-context'
import { useI18n } from '@/lib/i18n'
import { usePolicyEvaluation } from '@/hooks/usePolicyEvaluation'
import { GradeBadge } from './evaluation/GradeBadge'
import { StatusIndicator } from './evaluation/StatusIndicator'
import { ScoreBreakdown } from './evaluation/ScoreBreakdown'
import { RecommendationCard } from './evaluation/RecommendationCard'
import type { AnalyzedPolicy } from '@/types/policy'

export function PolicyDetailView() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { getPolicyById, fetchPolicyById } = usePolicies()
  const { locale } = useI18n()

  // Try local cache first, then fetch from Supabase if not found
  const [policy, setPolicy] = useState<AnalyzedPolicy | undefined>(() =>
    id ? getPolicyById(id) : undefined
  )
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(!policy && !!id)

  useEffect(() => {
    // If policy is already in local cache, no need to fetch
    if (policy || !id) return

    let cancelled = false
    setIsLoadingPolicy(true)

    fetchPolicyById(id).then((fetchedPolicy) => {
      if (cancelled) return
      setPolicy(fetchedPolicy ?? undefined)
      setIsLoadingPolicy(false)
    }).catch(() => {
      if (cancelled) return
      setIsLoadingPolicy(false)
    })

    return () => {
      cancelled = true
    }
  }, [id, policy, fetchPolicyById])

  const { evaluation, isLoading: isEvaluationLoading } = usePolicyEvaluation(policy)

  // Show loading state while fetching policy
  if (isLoadingPolicy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading policy...</p>
        </div>
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Policy not found</h2>
          <p className="text-gray-600 mb-4">The policy you&apos;re looking for doesn&apos;t exist.</p>
          <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{policy.logo}</span>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{policy.provider}</h1>
                <p className="text-gray-600">{policy.policyNumber}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Share2 size={18} />
              Share
            </Button>
            <Button variant="outline" className="gap-2">
              <Download size={18} />
              Download
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Policy Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="text-blue-600" size={20} />
                  Policy Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500">Policy Type</p>
                      <p className="font-semibold text-gray-900">{policy.typeTr}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Insured Person</p>
                      <p className="font-semibold text-gray-900">{policy.insuredPerson || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Location</p>
                      <p className="font-semibold text-gray-900">{policy.location || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500">Coverage Limit</p>
                      <p className="text-2xl font-bold text-gray-900">{formatCurrency(policy.coverage)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Annual Premium</p>
                      <p className="text-xl font-semibold text-gray-900">{formatCurrency(policy.premium)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Deductible</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(policy.deductible)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Coverages */}
            <Card>
              <CardHeader>
                <CardTitle>Coverage Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {policy.coverages.map((coverage, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-4 rounded-xl ${
                        coverage.included ? 'bg-green-50' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {coverage.included ? (
                          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                            <Check className="text-green-600" size={16} />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">
                            <X className="text-gray-400" size={16} />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{coverage.name}</p>
                          <p className="text-sm text-gray-500">{coverage.nameTr}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatCurrency(coverage.limit)}</p>
                        {coverage.deductible > 0 && (
                          <p className="text-sm text-gray-500">Deductible: {formatCurrency(coverage.deductible)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Exclusions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-500" size={20} />
                  Exclusions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {policy.exclusions.map((exclusion, i) => (
                    <li key={i} className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                      <X className="text-amber-600" size={16} />
                      <span className="text-gray-700">{exclusion}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Badge variant={policy.status === 'active' ? 'success' : 'warning'} className="mb-4">
                    {policy.status === 'active' ? 'Active' : 'Expiring Soon'}
                  </Badge>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Start Date</span>
                      <span className="font-medium">{formatDate(policy.startDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Expiry Date</span>
                      <span className="font-medium">{formatDate(policy.expiryDate)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Policy Evaluation */}
            {evaluation && !isEvaluationLoading && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="text-blue-600" size={20} />
                    {locale === 'tr' ? 'Poliçe Değerlendirmesi' : 'Policy Evaluation'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Overall Score with Grade */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold text-gray-900">{evaluation.overallScore}</div>
                      <div className="text-sm text-gray-500">/100</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <GradeBadge grade={evaluation.grade} size="md" />
                      <StatusIndicator status={evaluation.status} showLabel size="sm" />
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      {locale === 'tr' ? 'Puan Dağılımı' : 'Score Breakdown'}
                    </p>
                    <ScoreBreakdown
                      breakdown={evaluation.scoreBreakdown}
                      variant="full"
                    />
                  </div>

                  {/* Top Recommendations */}
                  {evaluation.recommendations.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        {locale === 'tr' ? 'Öneriler' : 'Recommendations'}
                      </p>
                      <div className="space-y-2">
                        {evaluation.recommendations.slice(0, 2).map((rec, i) => (
                          <RecommendationCard key={i} recommendation={rec} compact />
                        ))}
                      </div>
                      {evaluation.recommendations.length > 2 && (
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          +{evaluation.recommendations.length - 2} {locale === 'tr' ? 'daha fazla öneri' : 'more recommendations'}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Policy Documents */}
            <PolicyDocuments policyId={policy.id} />

            {/* AI Insights */}
            <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-900">
                  <Sparkles className="text-purple-600" size={20} />
                  AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-purple-600">Confidence:</span>
                    <span className="font-semibold text-purple-900">{Math.round(policy.aiConfidence * 100)}%</span>
                  </div>
                  {policy.aiInsights.map((insight, i) => (
                    <div key={i} className="p-3 bg-white/60 rounded-lg text-sm text-gray-700">
                      {insight}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Market Comparison */}
            {policy.marketComparison && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="text-blue-600" size={20} />
                    Market Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-500">Your Premium</span>
                        <span className="text-sm text-gray-500">Market Avg</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">{formatCurrency(policy.premium)}</span>
                        <span className="font-semibold text-gray-600">{formatCurrency(policy.marketComparison.averagePremium)}</span>
                      </div>
                      {policy.premium < policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-green-600 text-sm">
                          <TrendingDown size={14} />
                          <span>{Math.round((1 - policy.premium / policy.marketComparison.averagePremium) * 100)}% below average</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-gray-500 mb-1">Market Percentile</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${policy.marketComparison.percentile}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900">{policy.marketComparison.percentile}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
