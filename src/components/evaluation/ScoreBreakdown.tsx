import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import type { PolicyEvaluation, ScoreBreakdown as ScoreBreakdownType } from '@/lib/policy-evaluation/types'

interface ScoreBreakdownProps {
  breakdown: PolicyEvaluation['scoreBreakdown']
  variant?: 'mini' | 'full'
  className?: string
}

interface SingleScoreProps {
  score: number
  label: string
  weight?: number
  details?: string
  variant: 'mini' | 'full'
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'bg-emerald-500'
  if (score >= 75) return 'bg-blue-500'
  if (score >= 60) return 'bg-amber-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function getScoreTextColor(score: number): string {
  if (score >= 90) return 'text-emerald-700'
  if (score >= 75) return 'text-blue-700'
  if (score >= 60) return 'text-amber-700'
  if (score >= 40) return 'text-orange-700'
  return 'text-red-700'
}

function getScoreBgColor(score: number): string {
  if (score >= 90) return 'bg-emerald-50'
  if (score >= 75) return 'bg-blue-50'
  if (score >= 60) return 'bg-amber-50'
  if (score >= 40) return 'bg-orange-50'
  return 'bg-red-50'
}

function SingleScore({ score, label, weight, details, variant }: SingleScoreProps) {
  if (variant === 'mini') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap',
          getScoreBgColor(score),
          getScoreTextColor(score)
        )}
        title={details}
      >
        <span>{label}</span>
        <span className="font-bold">{Math.round(score)}</span>
      </span>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">
          {label}
          {weight && <span className="text-gray-400 ml-1">({weight}%)</span>}
        </span>
        <span className={cn('font-bold', getScoreTextColor(score))}>{Math.round(score)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', getScoreColor(score))}
          style={{ width: `${score}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {details && <p className="text-xs text-gray-500 mt-0.5">{details}</p>}
    </div>
  )
}

/**
 * Score breakdown component showing category scores
 * in either mini (horizontal pills) or full (vertical bars) format.
 */
export function ScoreBreakdown({ breakdown, variant = 'full', className }: ScoreBreakdownProps) {
  const { locale } = useI18n()

  const categories: Array<{ key: keyof PolicyEvaluation['scoreBreakdown']; data: ScoreBreakdownType }> = [
    { key: 'premium', data: breakdown.premium },
    { key: 'coverage', data: breakdown.coverage },
    { key: 'deductible', data: breakdown.deductible },
    { key: 'compliance', data: breakdown.compliance },
    { key: 'value', data: breakdown.value },
  ]

  if (variant === 'mini') {
    // Show top 3 categories in mini view
    const topCategories = [...categories].sort((a, b) => b.data.weight - a.data.weight).slice(0, 3)

    return (
      <div className={cn('flex flex-wrap gap-1', className)}>
        {topCategories.map(({ key, data }) => (
          <SingleScore
            key={key}
            score={data.score}
            label={locale === 'tr' ? data.categoryTR : data.category}
            variant="mini"
            details={locale === 'tr' ? data.detailsTR : data.details}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {categories.map(({ key, data }) => (
        <SingleScore
          key={key}
          score={data.score}
          label={locale === 'tr' ? data.categoryTR : data.category}
          weight={data.weight}
          details={locale === 'tr' ? data.detailsTR : data.details}
          variant="full"
        />
      ))}
    </div>
  )
}

/**
 * Overall score display with circular progress indicator
 */
interface OverallScoreProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function OverallScore({ score, size = 'md', showLabel = true, className }: OverallScoreProps) {
  const { locale } = useI18n()

  const sizeStyles = {
    sm: { container: 'w-12 h-12', text: 'text-sm', label: 'text-xs' },
    md: { container: 'w-16 h-16', text: 'text-lg', label: 'text-xs' },
    lg: { container: 'w-20 h-20', text: 'text-xl', label: 'text-sm' },
  }

  const style = sizeStyles[size]
  const circumference = 2 * Math.PI * 45 // radius = 45
  const strokeDashoffset = circumference - (score / 100) * circumference

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className={cn('relative', style.container)}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn('transition-all duration-700', getScoreTextColor(score))}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-bold', style.text, getScoreTextColor(score))}>{Math.round(score)}</span>
        </div>
      </div>
      {showLabel && (
        <span className={cn('text-gray-500', style.label)}>
          {locale === 'tr' ? 'Puan' : 'Score'}
        </span>
      )}
    </div>
  )
}
