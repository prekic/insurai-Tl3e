import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Shield,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Loader2,
  Users,
  Briefcase,
  Info,
  ChevronDown,
} from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { PolicyDocuments } from './PolicyDocuments'
import { formatDate } from '@/lib/utils'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { usePolicies } from '@/lib/policy-context'
import { usePolicyEvaluation } from '@/hooks/usePolicyEvaluation'
import type { PolicyStatus, AnalyzedPolicy } from '@/types/policy'
import { useI18n, type TranslationDictionary } from '@/lib/i18n'
import { usePdfExport } from '@/hooks/usePdfExport'
import { exportSinglePolicyToCSV, exportSinglePolicyToExcel, exportToText } from '@/lib/export'
import {
  evaluateAndRankPolicies,
  mapAnalyzedToActuarialInput,
  emitEvaluation,
} from '@/lib/actuarial-engine'
import { PolicyActuarialHistoryChart } from './actuarial/PolicyActuarialHistoryChart'

import { CoveragesByCategory, ExclusionsSection } from './PolicyDetailView/PolicyCoverageSection'
import { PolicyMetadataHeader } from './PolicyDetailView/PolicyMetadataHeader'
import { PolicyExportMenu } from './PolicyDetailView/PolicyExportMenu'
import { VehicleInfoCard } from './PolicyDetailView/VehicleInfoCard'
import { PolicyKeyMetricsAndDiscounts } from './PolicyDetailView/PolicyKeyMetricsAndDiscounts'
import { PolicyScenariosSection } from './PolicyDetailView/PolicyScenariosSection'
import {
  MobileEvaluationCard,
  MobileInsightsCard,
  DesktopEvaluationCard,
  DesktopInsightsCard,
} from './PolicyDetailView/PolicyScoreSection'

import { usePilotGateOptions } from '@/hooks/usePilotGateOptions'
import { useDisplaySafeSummary } from '@/hooks/useDisplaySafeSummary'
import { buildPolicyReviewerSummary } from '@/lib/reviewer/policy-reviewer-summary'

function getStatusVariant(
  status: PolicyStatus
): 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
      return 'success'
    case 'expiring':
      return 'warning'
    case 'expired':
      return 'destructive'
    case 'pending':
      return 'secondary'
    case 'draft':
      return 'outline'
    default:
      return 'default'
  }
}

function getStatusLabel(status: PolicyStatus, t: TranslationDictionary): string {
  switch (status) {
    case 'active':
      return t.policy.activeStatus
    case 'expiring':
      return t.policy.expiringSoonStatus
    case 'expired':
      return t.policy.expiredStatus
    case 'pending':
      return t.policy.pendingStatus
    case 'draft':
      return t.policy.draftStatus
    default:
      return status
  }
}

interface LocationState {
  policy?: AnalyzedPolicy
  isTrialResult?: boolean
  lowConfidence?: boolean
  confidenceScore?: number
}

export function PolicyDetailView() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const { getPolicyById, fetchPolicyById } = usePolicies()
  const { t, locale } = useI18n()
  const { formatConverted } = useDisplayCurrency()

  // Check for policy passed via location state (for trial results)
  const locationState = location.state as LocationState | null
  const trialPolicy = locationState?.policy
  const isTrialResult = locationState?.isTrialResult ?? false
  const lowConfidence = locationState?.lowConfidence ?? false
  const confidenceScore = locationState?.confidenceScore

  // Try local cache first, then fetch from Supabase if not found
  const [policy, setPolicy] = useState<AnalyzedPolicy | undefined>(
    () => trialPolicy ?? (id ? getPolicyById(id) : undefined)
  )
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(!policy && !!id && !trialPolicy)

  useEffect(() => {
    // If policy is already in local cache, no need to fetch
    if (policy || !id) return

    let cancelled = false
    setIsLoadingPolicy(true)

    fetchPolicyById(id)
      .then((fetchedPolicy) => {
        if (cancelled) return
        setPolicy(fetchedPolicy ?? undefined)
        setIsLoadingPolicy(false)
      })
      .catch((error) => {
        console.error('Failed to load policy within PolicyDetailView:', error)
        if (cancelled) return
        setIsLoadingPolicy(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, policy, fetchPolicyById])

  const { evaluation, isLoading: isEvaluationLoading } = usePolicyEvaluation(policy)

  // Mobile expandable section states
  const [coveragesExpanded, setCoveragesExpanded] = useState(true) // Default expanded - important content
  const [exclusionsExpanded, setExclusionsExpanded] = useState(false) // Default collapsed

  // Export dropdown state
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const { exportPolicy, isGenerating: isPdfGenerating } = usePdfExport()

  // KASKO pilot gate — checks feature flag + user segment
  const pilotOptions = usePilotGateOptions()
  const displaySummary = useDisplaySafeSummary(policy, pilotOptions)
  const isPilotResult = displaySummary?.isPilotResult ?? false
  const isDraft = displaySummary?.isDraft ?? false
  const isVerificationPending =
    isPilotResult && displaySummary?.pilotReviewStatus === 'pending_review'
  // Also include evaluation.isProvisional (which checks benchmarkStatus and AI confidence internally)
  const isUnverified =
    isDraft || isVerificationPending || lowConfidence || (evaluation?.isProvisional ?? false)

  // The canonical summary for all reviewer rendering paths in this view
  const reviewerSummary = useMemo(() => {
    if (!policy) return null
    return buildPolicyReviewerSummary(policy, { locale })
  }, [policy, locale])

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

  // Actuarial Engine Integration
  const actuarialResult = useMemo(() => {
    if (!policy) return null
    if (isTrialResult) return null

    // Beta Actuarial engine currently only supports specific policy types
    const supportedTypes = ['kasko', 'traffic', 'dask', 'zas']
    if (!supportedTypes.includes(policy.type)) return null

    try {
      const input = mapAnalyzedToActuarialInput(policy)
      const results = evaluateAndRankPolicies([input])
      return results[0]
    } catch (err) {
      console.error('Failed to run beta Actuarial Engine', err)
      return null
    }
  }, [policy, isTrialResult])

  // P1: Emit actuarial timing data to event bus for ActuarialTab
  useEffect(() => {
    if (actuarialResult?.layerTimings && policy) {
      emitEvaluation(policy.id, actuarialResult)
    }
  }, [actuarialResult, policy])

  // Export handlers
  const draftExportBlocked = useCallback(() => {
    if (isUnverified) {
      setExportMenuOpen(false)
      toast.warning(
        locale === 'tr'
          ? 'DOĞRULANMAMIŞ — Dışa aktarma inceleme tamamlanana kadar devre dışı'
          : 'UNVERIFIED — Export disabled until review is complete'
      )
      return true
    }
    return false
  }, [isUnverified, locale])

  const handleExportPdf = useCallback(async () => {
    if (!policy || draftExportBlocked()) return
    setExportMenuOpen(false)
    try {
      const success = await exportPolicy(policy)
      if (success) {
        toast.success(t.exportMenu.pdfSuccess)
      } else {
        toast.error(t.exportMenu.popupBlocked)
      }
    } catch (err) {
      console.error('Failed to export PDF:', err)
      toast.error(t.exportMenu.pdfSuccess ? 'PDF export failed' : 'PDF export failed')
    }
  }, [policy, exportPolicy, t.exportMenu.pdfSuccess, t.exportMenu.popupBlocked, draftExportBlocked])

  const handleExportCsv = useCallback(() => {
    if (!policy || draftExportBlocked()) return
    setExportMenuOpen(false)
    exportSinglePolicyToCSV(policy, locale as 'tr' | 'en')
    toast.success(t.exportMenu.csvSuccess)
  }, [policy, locale, t.exportMenu.csvSuccess, draftExportBlocked])

  const handleExportExcel = useCallback(async () => {
    if (!policy || draftExportBlocked()) return
    setExportMenuOpen(false)
    try {
      await exportSinglePolicyToExcel(policy, locale as 'tr' | 'en')
      toast.success(t.exportMenu.excelSuccess)
    } catch (err) {
      toast.error(locale === 'tr' ? 'Excel dışa aktarımı başarısız oldu' : 'Excel export failed')
      console.error(err)
    }
  }, [policy, locale, t.exportMenu.excelSuccess, draftExportBlocked])

  const handleExportText = useCallback(() => {
    if (!policy || !reviewerSummary || draftExportBlocked()) return
    setExportMenuOpen(false)

    const summary = exportToText(policy, locale)

    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${reviewerSummary.policyNumber.replace(/[^a-zA-Z0-9]/g, '_')}_summary.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(t.exportMenu.textSuccess)
  }, [policy, reviewerSummary, locale, t, draftExportBlocked])

  // Show loading state while fetching policy
  if (isLoadingPolicy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">{t.common.loading}</p>
        </div>
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.policy.policyNotFound}</h2>
          <p className="text-gray-600 mb-4">{t.policy.policyNotFoundDesc}</p>
          <Button onClick={() => navigate('/dashboard')}>{t.policy.goToDashboard}</Button>
        </div>
      </div>
    )
  }

  // After the null guards above, both policy and reviewerSummary are guaranteed non-null.
  // Extract to a const so TypeScript narrows the type without needing non-null assertions.
  const summary = reviewerSummary as NonNullable<typeof reviewerSummary>

  return (
    <div className="min-h-screen bg-slate-50 w-full max-w-[100vw] overflow-x-hidden">
      {/* Draft Result Banner (Persistent, Warning) - Priority 2 */}
      {isUnverified && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 py-2 sm:py-3 px-4 sticky top-0 z-[60] font-medium text-center shadow-sm">
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <span className="text-sm sm:text-base">
              <strong className="uppercase tracking-wide">
                {locale === 'tr' ? 'Doğrulanmamış AI çıktısı' : 'Unverified AI output'}
              </strong>
              {' — '}
              {locale === 'tr'
                ? 'Yapay zeka çıkarımı henüz insan uzman onayı almamıştır. Sonuçları dikkatle inceleyiniz.'
                : 'AI output has not yet received human expert verification. Please review results carefully.'}
            </span>
          </div>
        </div>
      )}

      {/* Mobile-first header - ultra compact */}
      {/* Trial result banner */}
      {isTrialResult && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} />
              <span className="text-sm font-medium">{t.policy.freeTrialResult}</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="bg-white text-blue-600 hover:bg-blue-50"
              onClick={() => navigate('/auth?mode=signup')}
            >
              {t.policy.signUpAndSave}
            </Button>
          </div>
        </div>
      )}
      {lowConfidence && (
        <div className="bg-amber-50 border-b border-amber-200 py-3 px-4">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-amber-800">
                {t.policy.lowConfidenceScore.replace(
                  '{score}',
                  (confidenceScore ? Math.round(confidenceScore * 100) : '?').toString()
                )}
              </span>
              <span className="text-xs text-amber-600 ml-2">{t.policy.verifyImportantFields}</span>
            </div>
          </div>
        </div>
      )}

      <PolicyMetadataHeader
        policy={policy}
        isTrialResult={isTrialResult}
        isUnverified={isUnverified}
      >
        <PolicyExportMenu
          isUnverified={isUnverified}
          draftExportBlocked={draftExportBlocked}
          isPdfGenerating={isPdfGenerating}
          handleExportPdf={handleExportPdf}
          handleExportCsv={handleExportCsv}
          handleExportExcel={handleExportExcel}
          handleExportText={handleExportText}
        />
      </PolicyMetadataHeader>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-3 sm:py-6 w-full overflow-hidden overflow-x-hidden">
        <div className="grid lg:grid-cols-3 gap-3 sm:gap-6 w-full min-w-0">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
            {/* Policy Overview - Ultra compact mobile-first - ALWAYS Turkish */}
            <Card className="overflow-hidden w-full">
              <CardHeader className="py-2 px-3 sm:py-4 sm:px-6 bg-gradient-to-r from-blue-50 to-blue-100/50">
                <CardTitle className="flex items-center justify-between gap-2 overflow-hidden">
                  <span className="flex items-center gap-2 text-sm sm:text-base font-semibold text-gray-800 truncate">
                    <Shield className="text-blue-600 flex-shrink-0" size={16} />
                    <span className="truncate">{t.policy.policySummary}</span>
                  </span>
                  <Badge
                    variant={getStatusVariant(policy.status)}
                    className="text-xs flex-shrink-0"
                  >
                    {getStatusLabel(policy.status, t)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                {/* Key info in compact 2-column grid localized */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm w-full overflow-hidden">
                  {/* Coverage - stacked vertically to prevent overflow */}
                  <div className="col-span-2 p-2.5 sm:p-3 bg-blue-50 rounded-lg border border-blue-100 overflow-hidden">
                    <p className="text-xs text-blue-600 font-medium mb-1">
                      {t.policy.coverageLabel}
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-blue-700 truncate">
                      {policy.type === 'kasko'
                        ? t.policy.vehicleMarketValue
                        : formatConverted(policy.coverage)}
                    </p>
                    {policy.type === 'kasko' && (
                      <p className="text-[10px] text-blue-500 mt-0.5">{t.policy.marketValueHelp}</p>
                    )}
                  </div>

                  <PolicyKeyMetricsAndDiscounts policy={policy} />

                  {/* Insured - full width for long names */}
                  <div className="col-span-2 p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                      {t.policy.insured}
                    </p>
                    <div className="flex items-center gap-2">
                      <p
                        className="text-sm font-semibold text-gray-900 truncate"
                        title={policy.insuredPerson}
                      >
                        {policy.insuredPerson || '-'}
                      </p>
                      {policy.insuredEntityType === 'corporate' && (
                        <div
                          className="flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
                          title="Corporate / Ticari"
                        >
                          <Briefcase size={12} />
                          <span>Kurumsal</span>
                        </div>
                      )}
                      {policy.insuredEntityType === 'individual' && (
                        <div
                          className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded"
                          title="Individual / Bireysel"
                        >
                          <Users size={12} />
                          <span>Bireysel</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Policy number */}
                  <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                      {t.policy.policyNumberLabel}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {policy.policyNumber}
                    </p>
                  </div>

                  {/* Location for non-vehicle policies */}

                  {policy.type !== 'kasko' && policy.type !== 'traffic' && policy.location && (
                    <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                      <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                        {t.policy.location}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {policy.location}
                      </p>
                    </div>
                  )}
                </div>

                {/* Dates row */}
                <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t text-xs text-gray-500">
                  <div className="truncate">
                    <span className="text-gray-400">{t.policy.dates.start}</span>{' '}
                    <span className="font-medium text-gray-700">
                      {formatDate(policy.startDate, locale)}
                    </span>
                  </div>
                  <div className="truncate text-right">
                    <span className="text-gray-400">{t.policy.dates.end}</span>{' '}
                    <span className="font-medium text-gray-700">
                      {formatDate(policy.expiryDate, locale)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Critical Financial Warnings */}
            {evaluation?.compliance?.issues?.some(
              (i) => i.severity === 'critical' || i.severity === 'high'
            ) && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="text-red-600" size={20} />
                  {locale === 'tr' ? 'Kritik Finansal Riskler' : 'Critical Financial Risks'}
                </h3>
                {evaluation.compliance.issues
                  .filter((i) => i.severity === 'critical' || i.severity === 'high')
                  .map((issue, idx) => (
                    <div
                      key={idx}
                      className="border-l-4 border-red-500 bg-red-50 p-4 rounded-r-lg shadow-sm"
                    >
                      <div className="flex gap-3">
                        <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                        <div>
                          <p className="text-sm font-semibold text-red-900 mb-1">
                            {locale === 'tr' ? issue.descriptionTR : issue.description}
                          </p>
                          <p className="text-xs text-red-700">
                            {locale === 'tr'
                              ? 'Bu durum poliçenin koruma kapasitesini ciddi şekilde zayıflatır.'
                              : 'This significantly weakens the policy protection capability.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Plain-Language Scenario Explainability Layer */}
            <PolicyScenariosSection scenarios={evaluation?.scenarioCards} />

            {/* Policy Evaluation - Mobile only (high priority) */}
            <MobileEvaluationCard
              evaluation={evaluation}
              isEvaluationLoading={isEvaluationLoading}
              isUnverified={isUnverified}
              locale={locale}
              t={t}
            />

            {/* AI Insights - Mobile only (high priority) */}
            <MobileInsightsCard
              policy={policy}
              summary={summary}
              isPilotResult={isPilotResult}
              displaySummary={displaySummary}
              locale={locale}
              t={t}
              isUnverified={isUnverified}
            />

            {/* Market Comparison - Mobile only */}
            {policy.marketComparison &&
              policy.premium > 0 &&
              evaluation?.benchmarkConfidence?.level !== 'suppressed' && (
                <Card className="lg:hidden">
                  <CardHeader className="py-2 px-3 sm:py-4 sm:px-6">
                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                      <TrendingUp className="text-blue-600 flex-shrink-0" size={18} />
                      <span className="truncate">{t.policy.marketComparison}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-6">
                    <div className="space-y-3">
                      {/* Freshness badge — mobile */}
                      {evaluation?.benchmarkConfidence?.freshness &&
                        evaluation.benchmarkConfidence.freshness !== 'current' && (
                          <div
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] ${
                              evaluation.benchmarkConfidence.freshness === 'stale'
                                ? 'bg-red-50 border border-red-200 text-red-700'
                                : 'bg-amber-50 border border-amber-200 text-amber-700'
                            }`}
                          >
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                evaluation.benchmarkConfidence.freshness === 'stale'
                                  ? 'bg-red-500'
                                  : 'bg-amber-500'
                              }`}
                            />
                            <span>
                              {locale === 'tr'
                                ? evaluation.benchmarkConfidence.freshness === 'stale'
                                  ? `Veriler ${evaluation.benchmarkConfidence.dataAgeDays ?? '?'} gün eski. Tarihsel referans.`
                                  : `Veri: ${evaluation.benchmarkConfidence.dataAsOf || '?'}`
                                : evaluation.benchmarkConfidence.freshness === 'stale'
                                  ? `Data is ${evaluation.benchmarkConfidence.dataAgeDays ?? '?'} days old. Historical reference only.`
                                  : `Data: ${evaluation.benchmarkConfidence.dataAsOf || '?'}`}
                            </span>
                          </div>
                        )}
                      {evaluation?.benchmarkConfidence?.level === 'low' ? (
                        <div className="py-2 text-xs text-gray-500 italic text-center">
                          {locale === 'tr'
                            ? 'Eksik veriler nedeniyle piyasa karşılaştırması kullanılamıyor'
                            : 'Market comparison unavailable due to missing inputs'}
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-500">{t.policy.yourPremium}</span>
                              <span className="text-xs text-gray-500">{t.policy.marketAvg}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm text-gray-900">
                                {formatConverted(policy.premium)}
                              </span>
                              <span className="font-semibold text-sm text-gray-600">
                                {formatConverted(policy.marketComparison.averagePremium)}
                              </span>
                            </div>
                            {policy.premium < policy.marketComparison.averagePremium && (
                              <div className="flex items-center gap-1 mt-1 text-green-600 text-xs">
                                <TrendingDown size={12} />
                                <span>
                                  {Math.round(
                                    (1 - policy.premium / policy.marketComparison.averagePremium) *
                                      100
                                  )}
                                  % {t.policy.belowAverage}
                                </span>
                              </div>
                            )}
                            {policy.premium > policy.marketComparison.averagePremium && (
                              <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs">
                                <TrendingUp size={12} />
                                <span>
                                  {Math.round(
                                    (policy.premium / policy.marketComparison.averagePremium - 1) *
                                      100
                                  )}
                                  % {t.policy.aboveAverage}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-xs text-gray-500 mb-1">
                              {t.policy.marketPercentile}
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-600"
                                  style={{ width: `${policy.marketComparison.percentile}%` }}
                                />
                              </div>
                              <span className="font-semibold text-gray-900 text-xs">
                                {policy.marketComparison.percentile}%
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                      {/* Missing context factors warning */}
                      {evaluation?.benchmarkConfidence?.level === 'low' && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 leading-tight">
                          <p className="font-medium mb-0.5">
                            {locale === 'tr'
                              ? 'Karşılaştırma düşük güvenilirlikte — eksik bağlam:'
                              : 'Low-confidence comparison — missing context:'}
                          </p>
                          <ul className="list-disc list-inside">
                            {evaluation.benchmarkConfidence.factors
                              .filter((f) => !f.present)
                              .map((f) => (
                                <li key={f.factor}>{locale === 'tr' ? f.factorTr : f.factor}</li>
                              ))}
                          </ul>
                        </div>
                      )}
                      {/* Benchmark disclaimer */}
                      {evaluation?.benchmarkDisclaimer && (
                        <p className="text-[10px] text-gray-400 mt-2 leading-tight italic">
                          {locale === 'tr'
                            ? evaluation.benchmarkDisclaimerTr
                            : evaluation.benchmarkDisclaimer}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Vehicle Information (Kasko Only) */}
            <VehicleInfoCard policy={policy} />

            {/* Coverages - Grouped by Category - Expandable */}
            <Card className="overflow-hidden">
              <CardHeader className="py-3 px-4 sm:py-4 sm:px-6">
                <button
                  onClick={() => setCoveragesExpanded(!coveragesExpanded)}
                  className="flex items-center justify-between w-full"
                >
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Shield className="text-blue-600" size={20} />
                    {t.policy.coverageDetails}
                    <Badge variant="outline" className="text-xs ml-1">
                      {summary.coverages.length}
                    </Badge>
                  </CardTitle>
                  <ChevronDown
                    size={20}
                    className={`text-gray-400 transition-transform ${coveragesExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </CardHeader>
              {coveragesExpanded && (
                <CardContent>
                  <CoveragesByCategory
                    groupedCoverages={summary.groupedCoverages}
                    policyType={summary.type}
                    locale={locale}
                  />
                </CardContent>
              )}
              {!coveragesExpanded && (
                <CardContent className="pt-0 pb-3">
                  <p className="text-sm text-gray-500">{t.policy.clickToViewDetails}</p>
                </CardContent>
              )}
            </Card>

            {/* Exclusions - Comprehensive Analysis - Expandable */}
            <Card className="overflow-hidden">
              <CardHeader className="py-3 px-4 sm:py-4 sm:px-6">
                <button
                  onClick={() => setExclusionsExpanded(!exclusionsExpanded)}
                  className="flex items-center justify-between w-full"
                >
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <AlertTriangle className="text-amber-500" size={20} />
                    {t.policy.exclusionsAndQuestions}
                    <Badge variant="outline" className="text-xs ml-1">
                      {summary.exclusions.length}
                    </Badge>
                  </CardTitle>
                  <ChevronDown
                    size={20}
                    className={`text-gray-400 transition-transform ${exclusionsExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </CardHeader>
              {exclusionsExpanded ? (
                <CardContent className="pt-0">
                  <ExclusionsSection
                    analysis={summary.groupedExclusions}
                    policyType={policy.type}
                    locale={locale}
                    evidenceData={policy.evidenceData?.exclusions}
                    quoteTranslations={policy.evidenceData?.quoteTranslations?.exclusions}
                  />
                </CardContent>
              ) : (
                <CardContent className="pt-0 pb-3">
                  <p className="text-sm text-gray-500">{t.policy.exclusionsDesc}</p>
                </CardContent>
              )}
            </Card>

            {/* Policy Documents - Mobile only (shown in sidebar on desktop) */}
            <div className="lg:hidden">
              <PolicyDocuments policyId={policy.id} />
            </div>
          </div>

          {/* Sidebar - Desktop only */}
          <div className="hidden lg:block space-y-6 min-w-0 overflow-hidden">
            {/* Status Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Badge variant={getStatusVariant(policy.status)} className="mb-4">
                    {getStatusLabel(policy.status, t)}
                  </Badge>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t.policy.startDate}</span>
                      <span className="font-medium">{formatDate(policy.startDate, locale)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t.policy.endDate}</span>
                      <span className="font-medium">{formatDate(policy.expiryDate, locale)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Policy Evaluation */}
            {evaluation && !isEvaluationLoading && (
              <DesktopEvaluationCard
                evaluation={evaluation}
                isEvaluationLoading={isEvaluationLoading}
                isUnverified={isUnverified}
                locale={locale}
                t={t}
              />
            )}

            {/* AI Insights */}
            <DesktopInsightsCard
              policy={policy}
              summary={summary}
              isPilotResult={isPilotResult}
              displaySummary={displaySummary}
              locale={locale}
              t={t}
              isUnverified={isUnverified}
            />

            {/* Market Comparison - Only show when we have valid premium data */}
            {policy.marketComparison &&
              policy.premium > 0 &&
              evaluation?.benchmarkConfidence?.level !== 'suppressed' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="text-blue-600" size={18} />
                      {t.policy.marketComparison}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Freshness badge */}
                      {evaluation?.benchmarkConfidence?.freshness &&
                        evaluation.benchmarkConfidence.freshness !== 'current' && (
                          <div
                            className={`flex items-center gap-2 px-3 py-2 rounded text-xs ${
                              evaluation.benchmarkConfidence.freshness === 'stale'
                                ? 'bg-red-50 border border-red-200 text-red-700'
                                : 'bg-amber-50 border border-amber-200 text-amber-700'
                            }`}
                          >
                            <span
                              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                evaluation.benchmarkConfidence.freshness === 'stale'
                                  ? 'bg-red-500'
                                  : 'bg-amber-500'
                              }`}
                            />
                            <span>
                              {locale === 'tr'
                                ? evaluation.benchmarkConfidence.freshness === 'stale'
                                  ? `Karşılaştırma verileri ${evaluation.benchmarkConfidence.dataAgeDays ?? '?'} gün eski (${evaluation.benchmarkConfidence.dataAsOf || '?'}). Yalnızca tarihsel referans.`
                                  : `Piyasa verileri ${evaluation.benchmarkConfidence.dataAsOf || '?'} tarihli`
                                : evaluation.benchmarkConfidence.freshness === 'stale'
                                  ? `Benchmark data is ${evaluation.benchmarkConfidence.dataAgeDays ?? '?'} days old (from ${evaluation.benchmarkConfidence.dataAsOf || '?'}). Historical reference only.`
                                  : `Market data from ${evaluation.benchmarkConfidence.dataAsOf || '?'}`}
                            </span>
                          </div>
                        )}
                      {evaluation?.benchmarkConfidence?.level === 'low' ? (
                        <div className="py-4 text-sm text-gray-500 italic text-center">
                          {locale === 'tr'
                            ? 'Eksik veriler nedeniyle piyasa karşılaştırması kullanılamıyor'
                            : 'Market comparison unavailable due to missing inputs'}
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs sm:text-sm text-gray-500">
                                {t.policy.yourPremium}
                              </span>
                              <span className="text-xs sm:text-sm text-gray-500">
                                {t.policy.marketAvg}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-gray-900">
                                {formatConverted(policy.premium)}
                              </span>
                              <span className="font-semibold text-gray-600">
                                {formatConverted(policy.marketComparison.averagePremium)}
                              </span>
                            </div>
                            {policy.premium < policy.marketComparison.averagePremium && (
                              <div className="flex items-center gap-1 mt-1 text-green-600 text-xs sm:text-sm">
                                <TrendingDown size={14} />
                                <span>
                                  {Math.round(
                                    (1 - policy.premium / policy.marketComparison.averagePremium) *
                                      100
                                  )}
                                  % {t.policy.belowAverage}
                                </span>
                              </div>
                            )}
                            {policy.premium > policy.marketComparison.averagePremium && (
                              <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs sm:text-sm">
                                <TrendingUp size={14} />
                                <span>
                                  {Math.round(
                                    (policy.premium / policy.marketComparison.averagePremium - 1) *
                                      100
                                  )}
                                  % {t.policy.aboveAverage}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-xs sm:text-sm text-gray-500 mb-1">
                              {t.policy.marketPercentile}
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-600"
                                  style={{ width: `${policy.marketComparison.percentile}%` }}
                                />
                              </div>
                              <span className="font-semibold text-gray-900 text-sm">
                                {policy.marketComparison.percentile}%
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                      {/* Missing context factors warning */}
                      {evaluation?.benchmarkConfidence?.level === 'low' && (
                        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 leading-tight">
                          <p className="font-medium mb-1">
                            {locale === 'tr'
                              ? 'Karşılaştırma düşük güvenilirlikte — eksik bağlam:'
                              : 'Low-confidence comparison — missing context:'}
                          </p>
                          <ul className="list-disc list-inside">
                            {evaluation.benchmarkConfidence.factors
                              .filter((f) => !f.present)
                              .map((f) => (
                                <li key={f.factor}>{locale === 'tr' ? f.factorTr : f.factor}</li>
                              ))}
                          </ul>
                        </div>
                      )}
                      {/* Benchmark disclaimer */}
                      {evaluation?.benchmarkDisclaimer && (
                        <p className="text-xs text-gray-400 mt-3 leading-tight italic">
                          {locale === 'tr'
                            ? evaluation.benchmarkDisclaimerTr
                            : evaluation.benchmarkDisclaimer}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Score system explanation — shown when both systems are visible */}
            {evaluation && actuarialResult && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-500 leading-relaxed">
                    <p className="font-medium text-gray-600 mb-1">
                      {locale === 'tr'
                        ? 'İki farklı değerlendirme sistemi'
                        : 'Two different evaluation systems'}
                    </p>
                    <p>
                      {locale === 'tr'
                        ? 'Poliçe Değerlendirmesi teminat kapsamı ve prim oranını değerlendirir. Sözleşme Kalite Puanı ise yedek parça, onarım ağı ve tazminat koşullarını ölçer. İki puan farklı boyutları ölçtüğü için farklılık gösterebilir.'
                        : 'Policy Evaluation measures coverage scope and premium. Contract Quality Score measures parts standards, repair network, and indemnity terms. These scores measure different dimensions and may differ.'}
                    </p>
                    {/* Weight breakdown for policy evaluation */}
                    {evaluation.scoreBreakdown && (
                      <p className="mt-1.5 text-gray-400">
                        {locale === 'tr' ? 'Puanlamada ağırlıklar' : 'Scoring weights'}:{' '}
                        {locale === 'tr' ? 'Teminat' : 'Coverage'}{' '}
                        {evaluation.scoreBreakdown.coverage.weight}%,{' '}
                        {locale === 'tr' ? 'Prim' : 'Premium'}{' '}
                        {evaluation.scoreBreakdown.premium.weight}%,{' '}
                        {locale === 'tr' ? 'Uyum' : 'Compliance'}{' '}
                        {evaluation.scoreBreakdown.compliance.weight}%,{' '}
                        {locale === 'tr' ? 'Muafiyet' : 'Deductible'}{' '}
                        {evaluation.scoreBreakdown.deductible.weight}%,{' '}
                        {locale === 'tr' ? 'Değer' : 'Value'}{' '}
                        {evaluation.scoreBreakdown.value.weight}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Beta Actuarial Engine Insights */}
            {actuarialResult && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl p-4 sm:p-5 mt-6 border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="text-blue-600 w-5 h-5" />
                  <h3 className="font-semibold text-gray-900">Beta Actuarial Engine (EOOP)</h3>
                </div>
                {isUnverified && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mb-3">
                    <AlertTriangle size={12} className="flex-shrink-0" />
                    <span>
                      {locale === 'tr'
                        ? 'TASLAK — Bu değerler henüz kesinleşmemiştir'
                        : 'DRAFT — These values are not finalized'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-50">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      {t.policy.expectedOutOfPocket}
                    </p>
                    {/* EOOP value — annotated when precision is partial */}
                    {actuarialResult.contractQualityScore === 0 ? (
                      <div className="flex items-end gap-2 mt-1">
                        <p className="text-xl font-bold text-gray-400">N/A</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-end gap-2">
                          <p
                            className={`text-2xl font-bold ${actuarialResult.eoopPrecision === 'partial' ? 'text-amber-700' : 'text-gray-900'}`}
                          >
                            {actuarialResult.eoopPrecision === 'partial' ? '~' : ''}
                            {actuarialResult.expectedOutOfPocket.expectedCost.amount.toLocaleString()}{' '}
                            {actuarialResult.expectedOutOfPocket.expectedCost.currency}
                          </p>
                          {actuarialResult.eoopPrecision === 'partial' && (
                            <span className="text-[10px] text-amber-600 font-medium mb-1.5">
                              ({locale === 'tr' ? 'taban tahmin' : 'base estimate'})
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {t.policy.premiumLabel}{' '}
                          <span className="font-medium">
                            {actuarialResult.expectedOutOfPocket.premium.amount.toLocaleString()}{' '}
                            {actuarialResult.expectedOutOfPocket.premium.currency}
                          </span>
                        </p>
                        <p className="text-sm text-gray-600">
                          {t.policy.expectedUncoveredLoss}{' '}
                          <span className="font-medium text-amber-600">
                            {actuarialResult.expectedOutOfPocket.expectedUncoveredLoss.amount.toLocaleString()}{' '}
                            {actuarialResult.expectedOutOfPocket.expectedUncoveredLoss.currency}
                          </span>
                        </p>
                      </>
                    )}
                    {/* EOOP precision warnings — driven by eoopPrecision + eoopLimitations */}
                    {actuarialResult.eoopPrecision === 'partial' &&
                      actuarialResult.eoopLimitations &&
                      actuarialResult.eoopLimitations.length > 0 && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                          <p className="font-medium mb-1 flex items-center gap-1">
                            <AlertTriangle className="flex-shrink-0" size={12} />
                            {locale === 'tr'
                              ? 'Gerçek cepten harcama gösterilenden önemli ölçüde yüksek olabilir:'
                              : 'Actual out-of-pocket exposure may be materially higher:'}
                          </p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {actuarialResult.eoopLimitations.map((limitation, i) => (
                              <li key={i}>{limitation}</li>
                            ))}
                          </ul>
                          {policy.deductiblePercent && policy.deductiblePercent > 0 && (
                            <p className="mt-1.5 text-[10px] text-amber-600 italic">
                              {locale === 'tr'
                                ? `Örnek: 100.000 TL hasarda %${policy.deductiblePercent} muafiyet = ${((100000 * policy.deductiblePercent) / 100).toLocaleString('tr-TR')} TL ek cepten maliyet`
                                : `Example: on a 100,000 TL claim, ${policy.deductiblePercent}% deductible = ${((100000 * policy.deductiblePercent) / 100).toLocaleString()} TL additional out-of-pocket`}
                            </p>
                          )}
                        </div>
                      )}
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-blue-50">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      {t.policy.contractQualityScore}
                    </p>
                    <div className="flex items-end gap-2">
                      <p
                        className={`text-2xl font-bold ${actuarialResult.contractQualityIsEstimated ? 'text-amber-600' : 'text-gray-900'}`}
                      >
                        {actuarialResult.contractQualityIsEstimated ? '~' : ''}
                        {Math.round(actuarialResult.contractQualityScore)}
                      </p>
                      <span className="text-sm font-medium text-gray-500 mb-1">/ 100</span>
                      {actuarialResult.contractQualityIsEstimated && (
                        <span className="text-[10px] text-amber-600 font-medium mb-1.5">
                          ({locale === 'tr' ? 'tahmini' : 'estimated'})
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mt-2">
                      {t.policy.partsStandard}{' '}
                      <span className="font-medium capitalize">
                        {actuarialResult.indemnityMechanics?.partsStandard?.value ||
                          t.global.unspecified}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600">
                      {t.policy.repairNetwork}{' '}
                      <span className="font-medium capitalize">
                        {actuarialResult.indemnityMechanics?.repairNetworkRule?.value?.replace(
                          '_',
                          ' '
                        ) || t.global.unspecified}
                      </span>
                    </p>
                    {/* Actuarial caveat when inputs are incomplete */}
                    {(actuarialResult.needsReview ||
                      actuarialResult.indemnityMechanics?.partsStandard?.value === 'unspecified' ||
                      actuarialResult.indemnityMechanics?.repairNetworkRule?.value ===
                        'unspecified') && (
                      <p className="text-xs text-amber-600 mt-2 flex items-start gap-1">
                        <AlertTriangle className="flex-shrink-0 mt-0.5" size={12} />
                        <span>
                          {locale === 'tr'
                            ? 'Tahmini puan, belirtilmemiş sözleşme detayları nedeniyle geçici niteliktedir'
                            : 'Score is provisional — some contract-detail inputs could not be confirmed'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Historical Score Trend */}
            <div className="mt-6">
              <PolicyActuarialHistoryChart policyId={policy.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
