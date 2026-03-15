/**
 * Shared Result Page
 *
 * Displays a shared trial analysis result.
 * Results are stored in localStorage with a 24-hour expiry.
 * Only the original user can share their result (share ID is stored locally).
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
  Shield,
  Lock,
} from 'lucide-react'
import { Button } from './ui/button'
import {
  getTrialResult,
  getShareId,
  getTrialTimeRemaining,
  formatTimeRemaining,
} from '@/lib/free-trial'
import { useI18n } from '@/lib/i18n'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import type { AnalyzedPolicy } from '@/types/policy'
import { useDisplaySafeSummary } from '@/hooks/useDisplaySafeSummary'

type ViewState = 'loading' | 'found' | 'not_found' | 'expired'

export function SharedResult() {
  const { shareId } = useParams<{ shareId: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { formatConverted } = useDisplayCurrency()
  const [state, setState] = useState<ViewState>('loading')
  const [policy, setPolicy] = useState<AnalyzedPolicy | null>(null)
  const displaySummary = useDisplaySafeSummary(policy)
  const [fileName, setFileName] = useState<string>('')
  const [timeRemaining, setTimeRemaining] = useState<number>(0)

  useEffect(() => {
    // Check if the share ID matches the local trial result
    const localShareId = getShareId()

    if (!shareId || shareId !== localShareId) {
      // Share ID doesn't match local storage
      // In a production app, you'd fetch from a server here
      setState('not_found')
      return
    }

    const result = getTrialResult()
    if (!result) {
      setState('expired')
      return
    }

    setPolicy(result.policy)
    setFileName(result.fileName)
    setTimeRemaining(getTrialTimeRemaining())
    setState('found')
  }, [shareId])

  // Update time remaining every minute
  useEffect(() => {
    if (state !== 'found') return

    const interval = setInterval(() => {
      const remaining = getTrialTimeRemaining()
      setTimeRemaining(remaining)
      if (remaining <= 0) {
        setState('expired')
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [state])

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (state === 'not_found') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-12 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FileText className="text-gray-400" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.shared.analysisNotFound}</h1>
            <p className="text-gray-600 mb-6">{t.shared.analysisNotFoundDesc}</p>
            <div className="space-y-3">
              <Button
                onClick={() => navigate('/try')}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
              >
                <Sparkles size={18} className="mr-2" />
                {t.shared.tryFreeAnalysis}
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                {t.shared.backToHome}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-12 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Clock className="text-amber-600" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.shared.linkExpired}</h1>
            <p className="text-gray-600 mb-6">{t.shared.linkExpiredDesc}</p>
            <div className="space-y-3">
              <Button
                onClick={() => navigate('/try')}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
              >
                <Sparkles size={18} className="mr-2" />
                {t.shared.tryFreeAnalysis}
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                {t.shared.backToHome}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Found state - show the analysis
  if (!policy) return null

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Shared Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="text-blue-600" size={20} />
            <div>
              <p className="font-medium text-blue-900">{t.shared.sharedAnalysis}</p>
              <p className="text-sm text-blue-700">
                {timeRemaining > 0
                  ? t.shared.expiresIn.replace('{time}', formatTimeRemaining(timeRemaining))
                  : t.shared.expiringSoon}
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/try')}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            {t.shared.tryYourOwn}
          </Button>
        </div>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="text-emerald-600" size={28} />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">{t.shared.policyAnalysis}</h1>
              <p className="text-gray-600 text-sm mt-1">
                {fileName} • {policy.typeTr || policy.type} • {policy.provider}
              </p>
            </div>
          </div>
        </div>

        {/* Policy Summary */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6">
            <h2 className="text-white font-semibold text-lg">{t.shared.policySummary}</h2>
            <p className="text-slate-300 text-sm">
              {policy.typeTr || policy.type} • {policy.provider}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Key Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">{t.shared.policyNumber}</div>
                <div className="font-semibold text-gray-900">{policy.policyNumber}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">{t.shared.insured}</div>
                <div className="font-semibold text-gray-900">{policy.insuredPerson || 'N/A'}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">{t.shared.premium}</div>
                <div className="font-semibold text-gray-900">
                  {policy.premium ? formatConverted(policy.premium) : 'N/A'}
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">{t.shared.coverage}</div>
                <div className="font-semibold text-gray-900">
                  {displaySummary?.protectionBasisCard
                    ? displaySummary.protectionBasisCard.basisDetail
                    : 'N/A'}
                </div>
              </div>
            </div>

            {/* Coverages — from display interpreter */}
            {displaySummary && displaySummary.keyCoverageCards.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">
                  {t.shared.coveragesCount.replace(
                    '{count}',
                    String(displaySummary.keyCoverageCards.length)
                  )}
                </h3>
                <div className="space-y-2">
                  {displaySummary.keyCoverageCards
                    .filter((c) => c.displayEligibility)
                    .slice(0, 5)
                    .map((card) => (
                      <div
                        key={card.id}
                        className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg"
                      >
                        <span className="text-sm text-emerald-800">{card.coverageName}</span>
                        <span className="text-sm font-medium text-emerald-700">
                          {card.limit || '✓'}
                        </span>
                      </div>
                    ))}
                  {displaySummary.keyCoverageCards.length > 5 && (
                    <p className="text-sm text-gray-500 text-center py-2">
                      {t.shared.moreCoverages.replace(
                        '{count}',
                        String(displaySummary.keyCoverageCards.length - 5)
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Missing/Unclear — from display interpreter */}
            {displaySummary && displaySummary.missingOrUnclearCards.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">{t.shared.keyExclusions}</h3>
                <div className="space-y-2">
                  {displaySummary.missingOrUnclearCards
                    .filter((c) => c.displayEligibility)
                    .slice(0, 3)
                    .map((card) => (
                      <div
                        key={card.id}
                        className="flex items-start gap-2 p-3 bg-red-50 rounded-lg"
                      >
                        <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-red-800">{card.body}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Claim Risks — from display interpreter */}
            {displaySummary && displaySummary.claimReductionRiskCards.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <Sparkles size={16} />
                  {t.shared.aiInsights}
                </h3>
                <div className="space-y-2">
                  {displaySummary.claimReductionRiskCards
                    .filter((c) => c.displayEligibility)
                    .slice(0, 3)
                    .map((card) => (
                      <div key={card.id} className="flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-800">{card.body}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 mb-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <h3 className="text-white font-bold text-lg mb-1">{t.shared.wantToAnalyze}</h3>
              <p className="text-blue-100 text-sm">{t.shared.wantToAnalyzeDesc}</p>
            </div>
            <Button
              onClick={() => navigate('/try')}
              className="bg-white text-blue-600 hover:bg-blue-50 whitespace-nowrap"
            >
              <Sparkles size={18} className="mr-2" />
              {t.shared.tryFree}
              <ArrowRight size={18} className="ml-2" />
            </Button>
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <Shield size={14} className="text-emerald-600" />
            <span>{t.shared.kvkkCompliant}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock size={14} className="text-blue-600" />
            <span>{t.shared.dataSecure}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
