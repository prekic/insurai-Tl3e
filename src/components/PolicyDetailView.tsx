import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Share2, Shield, AlertTriangle, Check, X, Sparkles, TrendingUp, TrendingDown, BarChart3, Loader2, Car, Scale, Users, Briefcase, Gavel, LifeBuoy } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { PolicyDocuments } from './PolicyDocuments'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Coverage, CoverageCategory } from '@/types/policy'
import {
  KASKO_COVERAGE_CATEGORIES,
  detectCoverageCategory,
  shouldShowUnlimited,
  shouldShowIncluded,
  groupCoverageSubLimits,
  type GroupedCoverage,
} from '@/lib/knowledge/kasko-knowledge'

/**
 * Format coverage limit with special handling for unlimited and market value
 * Uses kasko knowledge hub for intelligent detection
 */
function formatCoverageLimit(coverage: Coverage): string {
  // Explicit flags take priority
  if (coverage.isUnlimited) {
    return 'Sınırsız'
  }
  if (coverage.isMarketValue) {
    return 'Rayiç Değer'
  }

  // Use kasko knowledge hub for intelligent detection
  if (shouldShowUnlimited(coverage.name, coverage.limit)) {
    return 'Sınırsız'
  }
  if (shouldShowIncluded(coverage.name, coverage.limit)) {
    return 'Dahil'
  }

  // Legacy fallback checks
  if (coverage.limit === 0) {
    const nameLower = coverage.name.toLowerCase()
    if (nameLower.includes('sınırsız') || nameLower.includes('unlimited')) {
      return 'Sınırsız'
    }
    if (nameLower.includes('rayiç') || nameLower.includes('market value')) {
      return 'Rayiç Değer'
    }
    // Services without numeric limits
    if (nameLower.includes('asistans') || nameLower.includes('hizmet') ||
        nameLower.includes('ikame') || nameLower.includes('onarım')) {
      return 'Dahil'
    }
    return 'Dahil' // Default to "Dahil" instead of ₺0 for zero-limit coverages
  }
  return formatCurrency(coverage.limit)
}

/**
 * Get icon for coverage category
 */
function getCategoryIcon(category: CoverageCategory) {
  switch (category) {
    case 'main': return Car
    case 'liability': return Scale
    case 'personal_accident': return Users
    case 'supplementary': return Briefcase
    case 'assistance': return LifeBuoy
    case 'legal': return Gavel
    default: return Shield
  }
}

/**
 * Get category display info
 */
function getCategoryInfo(category: CoverageCategory) {
  const info = KASKO_COVERAGE_CATEGORIES[category as keyof typeof KASKO_COVERAGE_CATEGORIES]
  if (info) {
    return {
      labelTr: info.labelTr,
      labelEn: info.labelEn,
      color: info.color,
    }
  }
  return { labelTr: 'Diğer', labelEn: 'Other', color: 'gray' }
}

/**
 * Get background color based on coverage importance
 */
function getCoverageBackground(coverage: Coverage): string {
  const importance = coverage.importance || 'standard'

  if (!coverage.included) {
    return 'bg-gray-50'
  }

  switch (importance) {
    case 'critical':
      return 'bg-green-50'
    case 'standard':
      return 'bg-blue-50'
    case 'minor':
      return 'bg-gray-50'
    default:
      return 'bg-green-50'
  }
}

/**
 * Get icon color based on coverage importance
 */
function getCoverageIconStyle(coverage: Coverage): { bg: string; icon: string } {
  const importance = coverage.importance || 'standard'

  if (!coverage.included) {
    return { bg: 'bg-gray-200', icon: 'text-gray-400' }
  }

  switch (importance) {
    case 'critical':
      return { bg: 'bg-green-100', icon: 'text-green-600' }
    case 'standard':
      return { bg: 'bg-blue-100', icon: 'text-blue-600' }
    case 'minor':
      return { bg: 'bg-gray-100', icon: 'text-gray-500' }
    default:
      return { bg: 'bg-green-100', icon: 'text-green-600' }
  }
}

/**
 * Check if an exclusion is critical
 */
function isExclusionCritical(exclusion: string): boolean {
  const criticalPatterns = [
    'kasıt', 'kasdi', 'intentional',
    'alkol', 'alcohol',
    'uyuşturucu', 'drug',
    'savaş', 'war',
    'terör', 'terror',
    'nükleer', 'nuclear',
    'deprem', 'earthquake',
    'sel', 'flood',
    'ehliyet', 'license',
    'hız', 'speed',
    'kaçak', 'illegal',
    'ruhsatsız', 'unlicensed',
  ]
  const lowerExclusion = exclusion.toLowerCase()
  return criticalPatterns.some(pattern => lowerExclusion.includes(pattern))
}

/**
 * Coverages grouped by category component
 * Groups and displays coverages in organized sections
 */
function CoveragesByCategory({
  coverages,
  policyType,
  locale,
}: {
  coverages: Coverage[]
  policyType: string
  locale: string
}) {
  // Filter and prepare coverages
  const filteredCoverages = coverages.filter(coverage => {
    // Always keep coverages with limits, unlimited flag, or market value flag
    if (coverage.limit > 0) return true
    if (coverage.isUnlimited) return true
    if (coverage.isMarketValue) return true

    // Keep service coverages
    const nameLower = (coverage.name || '').toLowerCase()
    if (shouldShowUnlimited(nameLower, 0) || shouldShowIncluded(nameLower, 0)) {
      return true
    }

    // Filter out zero-limit entries that look like policy category headers
    const categoryPatterns = [
      'zorunlu mali sorumluluk',
      'trafik sigortası',
      'kasko sigortası',
      'konut sigortası',
    ]
    return !categoryPatterns.some(pattern => nameLower.includes(pattern))
  })

  // Group coverages by category, then apply sub-limit grouping
  const groupedCoverages = useMemo(() => {
    const groups: Record<string, Coverage[]> = {
      main: [],
      liability: [],
      personal_accident: [],
      supplementary: [],
      assistance: [],
      legal: [],
      other: [],
    }

    for (const coverage of filteredCoverages) {
      const category = coverage.category || detectCoverageCategory(coverage.name)
      if (groups[category]) {
        groups[category].push(coverage)
      } else {
        groups.other.push(coverage)
      }
    }

    // Apply sub-limit grouping to each category
    const groupedWithSubLimits: Record<string, GroupedCoverage[]> = {}
    for (const [category, coverages] of Object.entries(groups)) {
      groupedWithSubLimits[category] = groupCoverageSubLimits(coverages)
    }

    return groupedWithSubLimits
  }, [filteredCoverages])

  // Category order for display
  const categoryOrder: CoverageCategory[] = [
    'main',
    'liability',
    'personal_accident',
    'supplementary',
    'assistance',
    'legal',
    'other',
  ]

  // For kasko, add implicit coverages note
  const isKasko = policyType === 'kasko'

  return (
    <div className="space-y-6">
      {/* Implicit coverages note for kasko */}
      {isKasko && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
            <Check className="text-green-600" size={18} />
            {locale === 'tr' ? 'Temel Kasko Teminatları (Dahil)' : 'Base Kasko Coverage (Included)'}
          </div>
          <p className="text-sm text-green-700">
            {locale === 'tr'
              ? 'Çarpma/Çarpışma, Hırsızlık, Yangın, Doğal Afetler (deprem, sel, dolu, fırtına) tüm kasko poliçelerinde standart olarak dahildir.'
              : 'Collision, Theft, Fire, Natural Disasters (earthquake, flood, hail, storm) are included as standard in all kasko policies.'}
          </p>
        </div>
      )}

      {/* Grouped coverages */}
      {categoryOrder.map(categoryKey => {
        const categoryCoverages = groupedCoverages[categoryKey]
        if (!categoryCoverages || categoryCoverages.length === 0) return null

        const categoryInfo = getCategoryInfo(categoryKey)
        const CategoryIcon = getCategoryIcon(categoryKey)

        return (
          <div key={categoryKey}>
            <div className="flex items-center gap-2 mb-3">
              <CategoryIcon className="text-gray-600" size={18} />
              <h4 className="font-semibold text-gray-900">{categoryInfo.labelTr}</h4>
              <Badge variant="outline" className="text-xs">
                {categoryCoverages.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {categoryCoverages.map((groupedCoverage, i) => {
                // Handle grouped coverages with sub-limits
                if (groupedCoverage.isGrouped && groupedCoverage.subLimits) {
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-blue-50 border border-blue-100"
                    >
                      {/* Parent coverage header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Check className="text-blue-600" size={14} />
                        </div>
                        <p className="font-medium text-gray-900">{groupedCoverage.name}</p>
                      </div>
                      {/* Sub-limits grid */}
                      <div className="ml-10 grid grid-cols-2 gap-2">
                        {groupedCoverage.subLimits.map((subLimit, j) => (
                          <div key={j} className="flex justify-between items-center bg-white/60 px-3 py-2 rounded-md">
                            <span className="text-sm text-gray-600">{subLimit.label}</span>
                            <span className={`text-sm font-medium ${subLimit.isUnlimited ? 'text-blue-600' : 'text-gray-900'}`}>
                              {subLimit.isUnlimited ? 'Sınırsız' : formatCurrency(subLimit.limit)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }

                // Regular (non-grouped) coverage
                const coverage = groupedCoverage as unknown as Coverage
                const iconStyle = getCoverageIconStyle(coverage)
                const limitDisplay = formatCoverageLimit(coverage)
                const isSpecialValue = coverage.isUnlimited || coverage.isMarketValue ||
                  limitDisplay === 'Dahil' || limitDisplay === 'Sınırsız' || limitDisplay === 'Rayiç Değer'

                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-3 rounded-lg ${getCoverageBackground(coverage)}`}
                  >
                    <div className="flex items-center gap-3">
                      {coverage.included !== false ? (
                        <div className={`w-7 h-7 ${iconStyle.bg} rounded-lg flex items-center justify-center`}>
                          <Check className={iconStyle.icon} size={14} />
                        </div>
                      ) : (
                        <div className="w-7 h-7 bg-gray-200 rounded-lg flex items-center justify-center">
                          <X className="text-gray-400" size={14} />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{coverage.name}</p>
                        {coverage.nameTr && coverage.nameTr !== coverage.name && (
                          <p className="text-xs text-gray-500">{coverage.nameTr}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold text-sm ${isSpecialValue ? 'text-blue-600' : 'text-gray-900'}`}>
                        {limitDisplay}
                      </p>
                      {coverage.deductible > 0 && (
                        <p className="text-xs text-gray-500">Muafiyet: {formatCurrency(coverage.deductible)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

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
                      <p className="text-sm text-gray-500">Insured</p>
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
                      <p className="text-2xl font-bold text-gray-900">
                        {policy.coverage === 0 && policy.coverages.some(c => c.isMarketValue)
                          ? 'Rayiç Değer'
                          : formatCurrency(policy.coverage)}
                      </p>
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

            {/* Vehicle Information (Kasko Only) */}
            {policy.type === 'kasko' && policy.vehicleInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Car className="text-blue-600" size={20} />
                    {locale === 'tr' ? 'Araç Bilgileri' : 'Vehicle Information'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {policy.vehicleInfo.plate && (
                      <div>
                        <p className="text-sm text-gray-500">Plaka</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.plate}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.make && (
                      <div>
                        <p className="text-sm text-gray-500">Marka</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.make}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.model && (
                      <div>
                        <p className="text-sm text-gray-500">Model</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.model}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.year && (
                      <div>
                        <p className="text-sm text-gray-500">Model Yılı</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.year}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.usage && (
                      <div>
                        <p className="text-sm text-gray-500">Kullanım Şekli</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.usage}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.vehicleClass && (
                      <div>
                        <p className="text-sm text-gray-500">Araç Sınıfı</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.vehicleClass}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Coverages - Grouped by Category */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {locale === 'tr' ? 'Teminat Detayları' : 'Coverage Details'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CoveragesByCategory
                  coverages={policy.coverages}
                  policyType={policy.type}
                  locale={locale}
                />
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
                  {policy.exclusions.map((exclusion, i) => {
                    const isCritical = isExclusionCritical(exclusion)
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-3 p-3 rounded-lg min-h-[2.5rem] ${
                          isCritical ? 'bg-red-50' : 'bg-amber-50'
                        }`}
                      >
                        <X
                          className={`flex-shrink-0 ${isCritical ? 'text-red-600' : 'text-amber-600'}`}
                          size={16}
                        />
                        <span className={`text-sm leading-relaxed ${isCritical ? 'text-red-800 font-medium' : 'text-gray-700'}`}>
                          {exclusion}
                        </span>
                        {isCritical && (
                          <Badge variant="destructive" className="text-xs ml-auto">
                            Kritik
                          </Badge>
                        )}
                      </li>
                    )
                  })}
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
