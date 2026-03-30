import { cn } from '@/lib/utils'
import type { EvaluationGrade } from '@/lib/policy-evaluation/types'

interface GradeBadgeProps {
  grade: EvaluationGrade
  isProvisional?: boolean
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const GRADE_STYLES: Record<EvaluationGrade, string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-amber-100 text-amber-800 border-amber-200',
  D: 'bg-orange-100 text-orange-800 border-orange-200',
  F: 'bg-red-100 text-red-800 border-red-200',
}

const PROVISIONAL_STYLE = 'bg-gray-100 text-gray-400 border-gray-200 border-dashed hover:text-gray-600 transition-colors cursor-help'

const SIZE_STYLES = {
  sm: 'text-xs px-1.5 py-0.5 min-w-[20px]',
  md: 'text-sm px-2 py-0.5 min-w-[24px]',
  lg: 'text-base px-2.5 py-1 min-w-[32px]',
}

/**
 * Grade badge component displaying A-F evaluation grades
 * with appropriate color coding or provisional state.
 */
export function GradeBadge({ grade, isProvisional = false, size = 'md', showLabel = false, className }: GradeBadgeProps) {
  const content = showLabel ? `Grade ${grade}` : grade
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-bold rounded border',
        isProvisional ? PROVISIONAL_STYLE : GRADE_STYLES[grade],
        SIZE_STYLES[size],
        className
      )}
      role="status"
      aria-label={isProvisional ? `Provisional Grade ${grade}` : `Grade ${grade}`}
      title={isProvisional ? "Provisional Grade — model confidence is low, verification pending, or benchmark is untrusted" : "Model-based grade — thresholds are configurable and subject to recalibration"}
    >
      {isProvisional && !showLabel ? `${grade}?` : content}
    </span>
  )
}

/**
 * Get the grade color for use in other components
 */
export function getGradeColor(grade: EvaluationGrade): string {
  const colorMap: Record<EvaluationGrade, string> = {
    A: 'emerald',
    B: 'blue',
    C: 'amber',
    D: 'orange',
    F: 'red',
  }
  return colorMap[grade]
}
