import { useState } from 'react'
import { ChevronDown, ChevronUp, Quote } from 'lucide-react'
import { useI18n, type TranslationDictionary } from '@/lib/i18n'
import type { PolicyStatus } from '@/types/policy'

export function EvidenceQuote({ quote, quoteTr }: { quote: string; quoteTr?: string }) {
  const { t } = useI18n()
  const [showQuote, setShowQuote] = useState(false)

  if (!quote) return null

  return (
    <div className="mt-4 border-t border-gray-100 pt-3 w-full">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowQuote(!showQuote)
        }}
        className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
      >
        <Quote size={12} />
        {showQuote ? t.common.hideQuote : t.common.showQuote}
      </button>
      {showQuote && (
        <div className="mt-2 space-y-2">
          {quoteTr && (
            <div className="text-xs text-gray-800 bg-blue-50 p-2 text-left rounded border border-blue-100 leading-relaxed font-medium">
              &quot;{quoteTr}&quot;
            </div>
          )}
          <div
            className={`text-left rounded italic whitespace-pre-wrap leading-relaxed ${
              quoteTr
                ? 'text-[11px] text-gray-500 bg-gray-50 border border-gray-100 p-2 opacity-80'
                : 'text-xs text-gray-600 bg-blue-50/50 border border-blue-100/50 p-2'
            }`}
          >
            &quot;{quote}&quot;
          </div>
        </div>
      )}
    </div>
  )
}

export function TruncatableText({
  text,
  maxLength,
  showFullTextTranslation,
  showLessTranslation,
}: {
  text: string
  maxLength: number
  showFullTextTranslation: string
  showLessTranslation: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (text.length <= maxLength) {
    return <span className="leading-relaxed block">{text}</span>
  }

  const displayText = isExpanded ? text : `${text.slice(0, maxLength)}...`

  return (
    <div className="space-y-1 w-full">
      <span className="leading-relaxed block">{displayText}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsExpanded(!isExpanded)
        }}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
      >
        {isExpanded ? (
          <>
            <ChevronUp size={12} />
            {showLessTranslation}
          </>
        ) : (
          <>
            <ChevronDown size={12} />
            {showFullTextTranslation.replace('{chars}', (text.length - maxLength).toString())}
          </>
        )}
      </button>
    </div>
  )
}

export function getStatusVariant(
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

export function getStatusLabel(status: PolicyStatus, t: TranslationDictionary): string {
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
