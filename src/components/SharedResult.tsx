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
import { getTrialResult, getShareId, getTrialTimeRemaining, formatTimeRemaining } from '@/lib/free-trial'
import type { AnalyzedPolicy } from '@/types/policy'

type ViewState = 'loading' | 'found' | 'not_found' | 'expired'

export function SharedResult() {
  const { shareId } = useParams<{ shareId: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<ViewState>('loading')
  const [policy, setPolicy] = useState<AnalyzedPolicy | null>(null)
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Analysis Not Found
            </h1>
            <p className="text-gray-600 mb-6">
              This shared link is not available. The analysis may have been removed or the link is incorrect.
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => navigate('/try')}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
              >
                <Sparkles size={18} className="mr-2" />
                Try Free Analysis
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Home
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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Link Expired
            </h1>
            <p className="text-gray-600 mb-6">
              This shared analysis has expired. Analysis results are available for 24 hours.
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => navigate('/try')}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
              >
                <Sparkles size={18} className="mr-2" />
                Try Free Analysis
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Home
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
              <p className="font-medium text-blue-900">Shared Analysis</p>
              <p className="text-sm text-blue-700">
                {timeRemaining > 0
                  ? `Expires in ${formatTimeRemaining(timeRemaining)}`
                  : 'Expiring soon'}
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/try')}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            Try Your Own
          </Button>
        </div>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="text-emerald-600" size={28} />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">
                Policy Analysis
              </h1>
              <p className="text-gray-600 text-sm mt-1">
                {fileName} • {policy.typeTr || policy.type} • {policy.provider}
              </p>
            </div>
          </div>
        </div>

        {/* Policy Summary */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6">
            <h2 className="text-white font-semibold text-lg">Policy Summary</h2>
            <p className="text-slate-300 text-sm">
              {policy.typeTr || policy.type} • {policy.provider}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Key Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">Policy Number</div>
                <div className="font-semibold text-gray-900">{policy.policyNumber}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">Insured</div>
                <div className="font-semibold text-gray-900">{policy.insuredPerson || 'N/A'}</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">Premium</div>
                <div className="font-semibold text-gray-900">
                  ₺{policy.premium?.toLocaleString('tr-TR') || 'N/A'}
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">Coverage</div>
                <div className="font-semibold text-gray-900">
                  {policy.coverages?.some(c => c.isMarketValue)
                    ? 'Rayiç Değer'
                    : `₺${policy.coverage?.toLocaleString('tr-TR') || 'N/A'}`}
                </div>
              </div>
            </div>

            {/* Coverages */}
            {policy.coverages && policy.coverages.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">
                  Coverages ({policy.coverages.length})
                </h3>
                <div className="space-y-2">
                  {policy.coverages.slice(0, 5).map((cov, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                      <span className="text-sm text-emerald-800">{cov.nameTr || cov.name}</span>
                      <span className="text-sm font-medium text-emerald-700">
                        {cov.isUnlimited
                          ? 'Sınırsız'
                          : cov.isMarketValue
                            ? 'Rayiç Değer'
                            : cov.included && (!cov.limit || cov.limit === 0)
                              ? '✓ Dahil'
                              : `₺${cov.limit?.toLocaleString('tr-TR')}`}
                      </span>
                    </div>
                  ))}
                  {policy.coverages.length > 5 && (
                    <p className="text-sm text-gray-500 text-center py-2">
                      +{policy.coverages.length - 5} more coverages
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Exclusions */}
            {policy.exclusions && policy.exclusions.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">
                  Key Exclusions
                </h3>
                <div className="space-y-2">
                  {policy.exclusions.slice(0, 3).map((exc, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                      <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-red-800">{exc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Insights */}
            {policy.aiInsights && policy.aiInsights.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <Sparkles size={16} />
                  AI Insights
                </h3>
                <div className="space-y-2">
                  {policy.aiInsights.slice(0, 3).map((insight, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-blue-800">{insight.replace(/^[✓✔]\s*/, '')}</p>
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
              <h3 className="text-white font-bold text-lg mb-1">
                Want to analyze your own policy?
              </h3>
              <p className="text-blue-100 text-sm">
                Get instant AI-powered analysis of your insurance policies.
              </p>
            </div>
            <Button
              onClick={() => navigate('/try')}
              className="bg-white text-blue-600 hover:bg-blue-50 whitespace-nowrap"
            >
              <Sparkles size={18} className="mr-2" />
              Try Free
              <ArrowRight size={18} className="ml-2" />
            </Button>
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <Shield size={14} className="text-emerald-600" />
            <span>KVKK Compliant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock size={14} className="text-blue-600" />
            <span>Your data is secure</span>
          </div>
        </div>
      </div>
    </div>
  )
}
