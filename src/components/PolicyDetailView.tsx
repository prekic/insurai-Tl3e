import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Shield, AlertTriangle, Sparkles, Loader2, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { PolicyDocuments } from './PolicyDocuments'
import { usePolicies } from '@/lib/policy-context'
import { usePolicyEvaluation } from '@/hooks/usePolicyEvaluation'
import type { AnalyzedPolicy } from '@/types/policy'
import { useI18n } from '@/lib/i18n'
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
import { PolicyScenariosSection } from './PolicyDetailView/PolicyScenariosSection'
import {
  MobileEvaluationCard,
  MobileInsightsCard,
  DesktopEvaluationCard,
  DesktopInsightsCard,
} from './PolicyDetailView/PolicyScoreSection'
import { PolicyOverviewCard } from './PolicyDetailView/PolicyOverviewCard'
import { FinancialWarningsCard } from './PolicyDetailView/FinancialWarningsCard'
import {
  MobileMarketComparisonCard,
  DesktopMarketComparisonCard,
} from './PolicyDetailView/MarketComparisonCard'
import { ActuarialInsightsCard } from './PolicyDetailView/ActuarialInsightsCard'
import { SidebarStatusCard } from './PolicyDetailView/SidebarStatusCard'

import { usePilotGateOptions } from '@/hooks/usePilotGateOptions'
import { useDisplaySafeSummary } from '@/hooks/useDisplaySafeSummary'
import { buildPolicyReviewerSummary } from '@/lib/reviewer/policy-reviewer-summary'

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
            <PolicyOverviewCard policy={policy} />

            {/* Critical Financial Warnings */}
            <FinancialWarningsCard evaluation={evaluation} />

            {/* Plain-Language Scenario Explainability Layer */}
            <PolicyScenariosSection
              scenarios={evaluation?.scenarioCards}
              isUnverified={isUnverified}
            />

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
              evaluation={evaluation}
            />

            {/* Market Comparison - Mobile only */}
            <MobileMarketComparisonCard
              policy={policy}
              evaluation={evaluation}
              isUnverified={isUnverified}
            />

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
            <SidebarStatusCard policy={policy} />

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
              evaluation={evaluation}
            />

            {/* Market Comparison - Only show when we have valid premium data */}
            <DesktopMarketComparisonCard
              policy={policy}
              evaluation={evaluation}
              isUnverified={isUnverified}
            />

            <ActuarialInsightsCard
              policy={policy}
              evaluation={evaluation}
              actuarialResult={actuarialResult}
              isUnverified={isUnverified}
            />

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
