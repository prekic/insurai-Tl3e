import { ArrowLeft, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/lib/i18n'
import { getShortCompanyName } from '@/lib/insurance-display'
import type { AnalyzedPolicy } from '@/types/policy'

interface PolicyMetadataHeaderProps {
  policy: AnalyzedPolicy
  isTrialResult: boolean
  isUnverified: boolean
  children?: React.ReactNode // For export menu
}

export function PolicyMetadataHeader({
  policy,
  isTrialResult,
  isUnverified,
  children,
}: PolicyMetadataHeaderProps) {
  const navigate = useNavigate()
  const { t, locale } = useI18n()

  const handleShare = async () => {
    if (isUnverified) {
      toast.warning(
        locale === 'tr'
          ? 'DOĞRULANMAMIŞ — Paylaşım inceleme tamamlanana kadar devre dışı'
          : 'UNVERIFIED — Sharing disabled until review is complete'
      )
      return
    }
    try {
      const shareUrl = `${window.location.origin}/policy/${policy.id}`
      if (navigator.share) {
        await navigator.share({
          title: `${getShortCompanyName(policy.provider)} - ${policy.typeTr}`,
          text: `${t.policy.policy} ${policy.policyNumber}`,
          url: shareUrl,
        })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        toast.success(t.common.linkCopied)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error(t.common.shareFailed)
      }
    }
  }

  return (
    <div className="sticky top-0 z-10 bg-white border-b shadow-sm w-full">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3 w-full">
        <div className="flex items-center gap-2 w-full">
          {/* Back button - minimal padding */}
          <button
            onClick={() => (isTrialResult ? navigate('/') : navigate(-1))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            aria-label={t.common.back}
          >
            <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
          </button>

          {/* Policy type as title, provider and plate as subtitles */}
          <div className="flex items-center gap-2 flex-1 overflow-hidden" style={{ minWidth: 0 }}>
            <span className="text-lg sm:text-2xl flex-shrink-0">{policy.logo}</span>
            <div className="overflow-hidden" style={{ minWidth: 0 }}>
              <h1
                className="text-sm sm:text-base font-bold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ maxWidth: '100%' }}
                title={policy.typeTr}
              >
                {policy.typeTr}
              </h1>
              <p
                className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis"
                title={policy.provider}
              >
                {getShortCompanyName(policy.provider)}
              </p>
              {/* Show plate for vehicle policies */}
              {(policy.type === 'kasko' || policy.type === 'traffic') &&
                policy.vehicleInfo?.plate && (
                  <p className="text-xs text-blue-600 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    🚗 {policy.vehicleInfo.plate}
                  </p>
                )}
            </div>
          </div>

          {/* Action buttons - ICON ONLY on mobile, no exceptions */}
          <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
            <button
              onClick={handleShare}
              className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${isUnverified ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label={t.common.share}
              aria-disabled={isUnverified}
            >
              <Share2 size={18} className="text-gray-600" />
            </button>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
