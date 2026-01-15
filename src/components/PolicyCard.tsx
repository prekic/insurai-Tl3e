import { Eye, Trash2, MessageSquare, CheckSquare, Square, Sparkles, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { Badge } from './ui/badge'
import { GradeBadge, StatusIndicator, ScoreBreakdown, OverallScore } from './evaluation'
import { usePolicyEvaluation } from '@/hooks/usePolicyEvaluation'
import type { AnalyzedPolicy, DuplicatePolicy } from '@/types/policy'
import { POLICY_TYPES } from '@/types/policy'

interface PolicyCardProps {
  policy: AnalyzedPolicy
  onView?: (id: string) => void
  onDelete?: (id: string) => void
  onChat?: (id: string) => void
  onSelect?: (id: string) => void
  isSelected?: boolean
  showEvaluation?: boolean
  showActions?: boolean
  compact?: boolean
  className?: string
  isNew?: boolean
  duplicateInfo?: DuplicatePolicy | null
}

/**
 * PolicyCard component displaying policy information with optional evaluation scores.
 * Supports selection mode for multi-policy comparison.
 */
export function PolicyCard({
  policy,
  onView,
  onDelete,
  onChat,
  onSelect,
  isSelected = false,
  showEvaluation = true,
  showActions = true,
  compact = false,
  className,
  isNew = false,
  duplicateInfo = null,
}: PolicyCardProps) {
  const { t, locale } = useI18n()
  const { evaluation } = usePolicyEvaluation(showEvaluation ? policy : undefined)

  const policyTypeInfo = POLICY_TYPES[policy.type]
  const typeLabel = locale === 'tr' ? policyTypeInfo?.labelTr || policy.typeTr : policyTypeInfo?.label || policy.type

  const isDuplicate = duplicateInfo !== null

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'destructive' | 'default' => {
    switch (status) {
      case 'active': return 'success'
      case 'expiring': return 'warning'
      case 'expired': return 'destructive'
      default: return 'default'
    }
  }

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active': return t.policy.active
      case 'expiring': return t.policy.expiring
      case 'expired': return t.policy.expired
      case 'pending': return t.policy.pending
      default: return status
    }
  }

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(policy.id)
    } else if (onView) {
      onView(policy.id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCardClick()
    }
  }

  if (compact) {
    return (
      <div
        className={cn(
          'bg-white rounded-xl border p-3 transition-all cursor-pointer relative',
          isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300',
          isNew && !isSelected && 'border-green-400 bg-green-50/30',
          isDuplicate && !isSelected && 'border-amber-400 bg-amber-50/30',
          className
        )}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`${policy.provider} ${typeLabel}${isSelected ? ` - ${t.a11y.selected}` : ''}${isNew ? ' - New' : ''}${isDuplicate ? ' - Duplicate' : ''}`}
      >
        {/* New/Duplicate indicator badges */}
        {(isNew || isDuplicate) && (
          <div className="absolute -top-2 -right-2 flex gap-1">
            {isNew && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-green-500 text-white rounded-full shadow-sm">
                <Sparkles className="w-2.5 h-2.5" />
                {locale === 'tr' ? 'Yeni' : 'New'}
              </span>
            )}
            {isDuplicate && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500 text-white rounded-full shadow-sm">
                <Copy className="w-2.5 h-2.5" />
                {locale === 'tr' ? 'Kopya' : 'Duplicate'}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Selection indicator */}
          {onSelect && (
            <div className="flex-shrink-0">
              {isSelected ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : (
                <Square className="w-5 h-5 text-gray-300" />
              )}
            </div>
          )}

          {/* Logo */}
          <span className="text-2xl flex-shrink-0" aria-hidden="true">{policy.logo}</span>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{policy.provider}</p>
            <p className="text-xs text-gray-500 truncate">{typeLabel}</p>
          </div>

          {/* Grade */}
          {evaluation && (
            <GradeBadge grade={evaluation.grade} size="sm" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-white rounded-xl border transition-all relative',
        isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200',
        onSelect && 'cursor-pointer hover:border-gray-300',
        isNew && !isSelected && 'border-green-400 ring-1 ring-green-200',
        isDuplicate && !isSelected && 'border-amber-400 ring-1 ring-amber-200',
        className
      )}
      onClick={onSelect ? handleCardClick : undefined}
      onKeyDown={onSelect ? handleKeyDown : undefined}
      role={onSelect ? 'button' : 'article'}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? isSelected : undefined}
      aria-label={onSelect ? `${policy.provider} ${typeLabel}${isSelected ? ` - ${t.a11y.selected}` : ''}${isNew ? ' - New' : ''}${isDuplicate ? ' - Duplicate' : ''}` : undefined}
    >
      {/* New/Duplicate indicator badges */}
      {(isNew || isDuplicate) && (
        <div className="absolute -top-2.5 right-3 flex gap-1.5 z-10">
          {isNew && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-green-500 text-white rounded-full shadow-sm">
              <Sparkles className="w-3 h-3" />
              {locale === 'tr' ? 'Yeni' : 'New'}
            </span>
          )}
          {isDuplicate && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-amber-500 text-white rounded-full shadow-sm">
              <Copy className="w-3 h-3" />
              {locale === 'tr' ? 'Kopya' : 'Duplicate'}
            </span>
          )}
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          {/* Selection checkbox */}
          {onSelect && (
            <div className="flex-shrink-0 pt-1">
              {isSelected ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : (
                <Square className="w-5 h-5 text-gray-300" />
              )}
            </div>
          )}

          {/* Logo and basic info */}
          <span className="text-3xl flex-shrink-0" aria-hidden="true">{policy.logo}</span>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 overflow-hidden">
                <h3 className="font-semibold text-gray-900 truncate">{policy.provider}</h3>
                <p className="text-sm text-gray-500 truncate">{policy.policyNumber}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {evaluation && (
                  <>
                    <GradeBadge grade={evaluation.grade} size="md" />
                    <StatusIndicator status={evaluation.status} showLabel={false} size="sm" />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Type and Status badges */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-xs">
            {policyTypeInfo?.icon} {typeLabel}
          </Badge>
          <Badge variant={getStatusBadgeVariant(policy.status)}>
            {getStatusLabel(policy.status)}
          </Badge>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t.policy.coverage}</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(policy.coverage)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t.policy.premium}</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(policy.premium)}/yr</p>
          </div>
        </div>

        {/* Evaluation section */}
        {showEvaluation && evaluation && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center gap-4">
              <OverallScore score={evaluation.overallScore} size="sm" showLabel={false} />
              <div className="flex-1">
                <ScoreBreakdown breakdown={evaluation.scoreBreakdown} variant="mini" />
              </div>
            </div>
          </div>
        )}

        {/* Expiry date */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
          <span className="text-gray-500">{t.policy.expiryDate}</span>
          <span className="font-medium text-gray-900">{formatDate(policy.expiryDate)}</span>
        </div>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="px-4 pb-4 flex items-center gap-2">
          {onView && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onView(policy.id)
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              aria-label={`${t.common.view} ${policy.provider}`}
            >
              <Eye className="w-4 h-4" />
              {t.common.view}
            </button>
          )}
          {onChat && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onChat(policy.id)
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              aria-label={`${t.nav.chat} ${policy.provider}`}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(policy.id)
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              aria-label={`${t.common.delete} ${policy.provider}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Grid of PolicyCards with optional selection mode
 */
interface PolicyCardGridProps {
  policies: AnalyzedPolicy[]
  onView?: (id: string) => void
  onDelete?: (id: string) => void
  onChat?: (id: string) => void
  selectedIds?: string[]
  onSelect?: (id: string) => void
  showEvaluation?: boolean
  compact?: boolean
  className?: string
  newPolicyIds?: Set<string>
  duplicateMap?: Map<string, DuplicatePolicy>
}

export function PolicyCardGrid({
  policies,
  onView,
  onDelete,
  onChat,
  selectedIds = [],
  onSelect,
  showEvaluation = true,
  compact = false,
  className,
  newPolicyIds = new Set(),
  duplicateMap = new Map(),
}: PolicyCardGridProps) {
  if (policies.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        compact
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {policies.map((policy) => (
        <PolicyCard
          key={policy.id}
          policy={policy}
          onView={onView}
          onDelete={onDelete}
          onChat={onChat}
          onSelect={onSelect}
          isSelected={selectedIds.includes(policy.id)}
          showEvaluation={showEvaluation}
          showActions={!onSelect}
          compact={compact}
          isNew={newPolicyIds.has(policy.id)}
          duplicateInfo={duplicateMap.get(policy.id) || null}
        />
      ))}
    </div>
  )
}
