import { CheckCircle, ThumbsUp, AlertCircle, AlertTriangle, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EvaluationStatus } from '@/lib/policy-evaluation/types'
import { useI18n } from '@/lib/i18n'

interface StatusIndicatorProps {
  status: EvaluationStatus
  showIcon?: boolean
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

interface StatusConfig {
  icon: LucideIcon
  color: string
  bg: string
  border: string
  labelEN: string
  labelTR: string
}

const STATUS_CONFIG: Record<EvaluationStatus, StatusConfig> = {
  excellent: {
    icon: CheckCircle,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    labelEN: 'Excellent',
    labelTR: 'Mükemmel',
  },
  good: {
    icon: ThumbsUp,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    labelEN: 'Good',
    labelTR: 'İyi',
  },
  fair: {
    icon: AlertCircle,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    labelEN: 'Fair',
    labelTR: 'Orta',
  },
  poor: {
    icon: AlertTriangle,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    labelEN: 'Poor',
    labelTR: 'Zayıf',
  },
  critical: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    labelEN: 'Critical',
    labelTR: 'Kritik',
  },
}

const SIZE_STYLES = {
  sm: { icon: 'w-3 h-3', text: 'text-xs', padding: 'px-1.5 py-0.5' },
  md: { icon: 'w-4 h-4', text: 'text-sm', padding: 'px-2 py-1' },
  lg: { icon: 'w-5 h-5', text: 'text-base', padding: 'px-2.5 py-1.5' },
}

/**
 * Status indicator component displaying evaluation status
 * (excellent, good, fair, poor, critical) with icon and label.
 */
export function StatusIndicator({
  status,
  showIcon = true,
  showLabel = true,
  size = 'md',
  className,
}: StatusIndicatorProps) {
  const { locale } = useI18n()
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const sizeStyle = SIZE_STYLES[size]
  const label = locale === 'tr' ? config.labelTR : config.labelEN

  if (!showIcon && !showLabel) {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        config.bg,
        config.border,
        config.color,
        sizeStyle.text,
        sizeStyle.padding,
        className
      )}
      role="status"
      aria-label={label}
    >
      {showIcon && <Icon className={sizeStyle.icon} aria-hidden="true" />}
      {showLabel && <span>{label}</span>}
    </span>
  )
}

/**
 * Get status configuration for use in other components
 */
export function getStatusConfig(status: EvaluationStatus) {
  return STATUS_CONFIG[status]
}
