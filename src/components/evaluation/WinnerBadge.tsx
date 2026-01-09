import { Trophy, Award, Star, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

type WinnerCategory = 'overall' | 'premium' | 'coverage' | 'value' | 'compliance'

interface WinnerBadgeProps {
  category?: WinnerCategory
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

interface CategoryConfig {
  icon: typeof Trophy
  labelEN: string
  labelTR: string
  color: string
  bg: string
}

const CATEGORY_CONFIG: Record<WinnerCategory, CategoryConfig> = {
  overall: {
    icon: Crown,
    labelEN: 'Best Overall',
    labelTR: 'En İyi Genel',
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
  },
  premium: {
    icon: Trophy,
    labelEN: 'Best Premium',
    labelTR: 'En İyi Prim',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  coverage: {
    icon: Award,
    labelEN: 'Best Coverage',
    labelTR: 'En İyi Teminat',
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
  },
  value: {
    icon: Star,
    labelEN: 'Best Value',
    labelTR: 'En İyi Değer',
    color: 'text-purple-600',
    bg: 'bg-purple-50 border-purple-200',
  },
  compliance: {
    icon: Award,
    labelEN: 'Best Compliance',
    labelTR: 'En İyi Uyumluluk',
    color: 'text-teal-600',
    bg: 'bg-teal-50 border-teal-200',
  },
}

const SIZE_STYLES = {
  sm: { icon: 'w-3 h-3', text: 'text-xs', padding: 'px-1.5 py-0.5' },
  md: { icon: 'w-4 h-4', text: 'text-sm', padding: 'px-2 py-1' },
}

/**
 * Winner badge component for showing category winners in comparisons.
 */
export function WinnerBadge({
  category = 'overall',
  size = 'sm',
  showLabel = false,
  className,
}: WinnerBadgeProps) {
  const { locale } = useI18n()
  const config = CATEGORY_CONFIG[category]
  const Icon = config.icon
  const sizeStyle = SIZE_STYLES[size]
  const label = locale === 'tr' ? config.labelTR : config.labelEN

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        config.bg,
        config.color,
        sizeStyle.text,
        sizeStyle.padding,
        className
      )}
      title={label}
      role="status"
      aria-label={label}
    >
      <Icon className={sizeStyle.icon} aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </span>
  )
}

/**
 * Simple trophy icon for indicating winner in tables
 */
interface TrophyIndicatorProps {
  isWinner: boolean
  isBest?: boolean
  isWorst?: boolean
  className?: string
}

export function TrophyIndicator({ isWinner, isBest, isWorst, className }: TrophyIndicatorProps) {
  const { locale } = useI18n()

  if (!isWinner && !isBest && !isWorst) {
    return null
  }

  if (isWorst) {
    return (
      <span
        className={cn('inline-flex items-center text-gray-400', className)}
        title={locale === 'tr' ? 'En düşük' : 'Lowest'}
        aria-label="Lowest value"
      >
        <Trophy className="w-3 h-3 opacity-30" />
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex items-center text-amber-500', className)}
      title={locale === 'tr' ? 'En iyi' : 'Best'}
      aria-label="Best value"
    >
      <Trophy className="w-4 h-4" />
    </span>
  )
}

/**
 * Rank badge for showing position (1st, 2nd, 3rd, etc.)
 */
interface RankBadgeProps {
  rank: number
  size?: 'sm' | 'md'
  className?: string
}

export function RankBadge({ rank, size = 'sm', className }: RankBadgeProps) {
  const { locale } = useI18n()

  const getRankColor = (r: number) => {
    if (r === 1) return 'bg-amber-100 text-amber-800 border-amber-200'
    if (r === 2) return 'bg-gray-100 text-gray-700 border-gray-200'
    if (r === 3) return 'bg-orange-100 text-orange-700 border-orange-200'
    return 'bg-gray-50 text-gray-500 border-gray-200'
  }

  const getRankLabel = (r: number) => {
    if (locale === 'tr') {
      return `${r}.`
    }
    if (r === 1) return '1st'
    if (r === 2) return '2nd'
    if (r === 3) return '3rd'
    return `${r}th`
  }

  const sizeStyle = SIZE_STYLES[size]

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded border font-bold',
        getRankColor(rank),
        sizeStyle.text,
        sizeStyle.padding,
        'min-w-[28px]',
        className
      )}
      role="status"
      aria-label={`Rank ${rank}`}
    >
      {getRankLabel(rank)}
    </span>
  )
}
