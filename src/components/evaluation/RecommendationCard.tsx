import {
  AlertCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  TrendingUp,
  Shield,
  DollarSign,
  Plus,
  Search,
  CheckCircle,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import type { Recommendation } from '@/lib/policy-evaluation/types'

interface RecommendationCardProps {
  recommendation: Recommendation
  onDismiss?: () => void
  compact?: boolean
  className?: string
}

type Priority = Recommendation['priority']
type RecommendationType = Recommendation['type']

interface PriorityConfig {
  borderColor: string
  bgColor: string
  iconColor: string
  icon: typeof AlertCircle
  labelEN: string
  labelTR: string
}

const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  critical: {
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50',
    iconColor: 'text-red-600',
    icon: AlertCircle,
    labelEN: 'Critical',
    labelTR: 'Kritik',
  },
  high: {
    borderColor: 'border-l-orange-500',
    bgColor: 'bg-orange-50',
    iconColor: 'text-orange-600',
    icon: AlertTriangle,
    labelEN: 'High Priority',
    labelTR: 'Yüksek Öncelik',
  },
  medium: {
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-50',
    iconColor: 'text-amber-600',
    icon: Lightbulb,
    labelEN: 'Medium Priority',
    labelTR: 'Orta Öncelik',
  },
  low: {
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
    icon: Info,
    labelEN: 'Suggestion',
    labelTR: 'Öneri',
  },
}

const TYPE_ICONS: Record<RecommendationType, typeof TrendingUp> = {
  increase_coverage: TrendingUp,
  reduce_deductible: DollarSign,
  add_coverage: Plus,
  review_premium: Search,
  compliance: Shield,
  optimize: CheckCircle,
}

/**
 * Recommendation card component displaying policy improvement suggestions
 * with priority levels and estimated impact.
 */
export function RecommendationCard({
  recommendation,
  onDismiss,
  compact = false,
  className,
}: RecommendationCardProps) {
  const { locale } = useI18n()
  const priorityConfig = PRIORITY_CONFIG[recommendation.priority]
  const PriorityIcon = priorityConfig.icon
  const TypeIcon = TYPE_ICONS[recommendation.type] || Lightbulb

  const title = locale === 'tr' ? recommendation.titleTR : recommendation.title
  const description = locale === 'tr' ? recommendation.descriptionTR : recommendation.description
  const priorityLabel = locale === 'tr' ? priorityConfig.labelTR : priorityConfig.labelEN

  const impact = recommendation.estimatedImpact

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border-l-4',
          priorityConfig.borderColor,
          priorityConfig.bgColor,
          className
        )}
      >
        <TypeIcon className={cn('w-4 h-4 flex-shrink-0', priorityConfig.iconColor)} />
        <span className="text-sm font-medium text-gray-800 truncate">{title}</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-auto p-0.5 text-gray-400 hover:text-gray-600 rounded"
            aria-label={locale === 'tr' ? 'Kapat' : 'Dismiss'}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border-l-4 overflow-hidden',
        priorityConfig.borderColor,
        priorityConfig.bgColor,
        className
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn('p-1.5 rounded-full', priorityConfig.bgColor)}>
            <PriorityIcon className={cn('w-4 h-4', priorityConfig.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-xs font-medium uppercase tracking-wide', priorityConfig.iconColor)}>
                {priorityLabel}
              </span>
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-white/50"
                  aria-label={locale === 'tr' ? 'Kapat' : 'Dismiss'}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <h4 className="font-semibold text-gray-900 mt-1">{title}</h4>
          </div>
        </div>

        {/* Description */}
        <p className="mt-2 text-sm text-gray-700 leading-relaxed">{description}</p>

        {/* Estimated Impact */}
        {impact && (
          <div className="mt-3 pt-3 border-t border-gray-200/50">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              {locale === 'tr' ? 'Tahmini Etki' : 'Estimated Impact'}
            </p>
            <div className="flex flex-wrap gap-2">
              {impact.premiumChange !== undefined && (
                <ImpactBadge
                  label={locale === 'tr' ? 'Prim' : 'Premium'}
                  value={impact.premiumChange}
                  suffix="%"
                  inverse
                />
              )}
              {impact.coverageChange !== undefined && (
                <ImpactBadge
                  label={locale === 'tr' ? 'Teminat' : 'Coverage'}
                  value={impact.coverageChange}
                  suffix="%"
                />
              )}
              {impact.riskReduction !== undefined && (
                <ImpactBadge
                  label={locale === 'tr' ? 'Risk Azaltma' : 'Risk Reduction'}
                  value={impact.riskReduction}
                  suffix="%"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ImpactBadgeProps {
  label: string
  value: number
  suffix?: string
  inverse?: boolean // For premium, lower is better
}

function ImpactBadge({ label, value, suffix = '', inverse = false }: ImpactBadgeProps) {
  const isPositive = inverse ? value < 0 : value > 0
  const displayValue = inverse ? -value : value

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
      )}
    >
      <span>{label}:</span>
      <span className="font-bold">
        {displayValue > 0 ? '+' : ''}
        {displayValue}
        {suffix}
      </span>
    </span>
  )
}

/**
 * Recommendation list component for displaying multiple recommendations
 */
interface RecommendationListProps {
  recommendations: Recommendation[]
  maxItems?: number
  compact?: boolean
  onDismiss?: (index: number) => void
  className?: string
}

export function RecommendationList({
  recommendations,
  maxItems,
  compact = false,
  onDismiss,
  className,
}: RecommendationListProps) {
  const { locale } = useI18n()

  // Sort by priority
  const priorityOrder: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...recommendations].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
  const display = maxItems ? sorted.slice(0, maxItems) : sorted
  const remaining = maxItems ? recommendations.length - maxItems : 0

  if (recommendations.length === 0) {
    return (
      <div className={cn('text-sm text-gray-500 text-center py-4', className)}>
        {locale === 'tr' ? 'Öneri bulunmuyor' : 'No recommendations'}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {display.map((rec, index) => (
        <RecommendationCard
          key={`${rec.type}-${index}`}
          recommendation={rec}
          compact={compact}
          onDismiss={onDismiss ? () => onDismiss(index) : undefined}
        />
      ))}
      {remaining > 0 && (
        <p className="text-sm text-gray-500 text-center pt-1">
          {locale === 'tr' ? `+${remaining} daha fazla öneri` : `+${remaining} more recommendations`}
        </p>
      )}
    </div>
  )
}
