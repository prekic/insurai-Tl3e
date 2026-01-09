import { cn } from '@/lib/utils'
import type { EvaluationGrade } from '@/lib/policy-evaluation/types'

interface GradeBadgeProps {
  grade: EvaluationGrade
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

const SIZE_STYLES = {
  sm: 'text-xs px-1.5 py-0.5 min-w-[20px]',
  md: 'text-sm px-2 py-0.5 min-w-[24px]',
  lg: 'text-base px-2.5 py-1 min-w-[32px]',
}

/**
 * Grade badge component displaying A-F evaluation grades
 * with appropriate color coding.
 */
export function GradeBadge({ grade, size = 'md', showLabel = false, className }: GradeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-bold rounded border',
        GRADE_STYLES[grade],
        SIZE_STYLES[size],
        className
      )}
      role="status"
      aria-label={`Grade ${grade}`}
    >
      {showLabel ? `Grade ${grade}` : grade}
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
