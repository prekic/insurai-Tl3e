import type { StatementType } from '@/types/display'

interface SafetyLabelProps {
  statementType: StatementType
  className?: string
}

const LABEL_CONFIG: Record<
  StatementType,
  { text: string; bgClass: string; textClass: string; icon: string }
> = {
  confirmed_from_policy: {
    text: 'Policy Confirmed',
    bgClass: 'safety-label--confirmed',
    textClass: '',
    icon: '✓',
  },
  conditional_from_policy: {
    text: 'Conditional',
    bgClass: 'safety-label--conditional',
    textClass: '',
    icon: '⚠',
  },
  app_benchmark: {
    text: 'Market Comparison',
    bgClass: 'safety-label--benchmark',
    textClass: '',
    icon: '📊',
  },
  unclear_not_verified: {
    text: 'Not Verified',
    bgClass: 'safety-label--unclear',
    textClass: '',
    icon: '?',
  },
}

/**
 * Presentational badge component that renders a statement classification label.
 * Does NOT compute wording — receives pre-classified StatementType from the interpreter.
 */
export function SafetyLabel({ statementType, className = '' }: SafetyLabelProps) {
  const config = LABEL_CONFIG[statementType]

  return (
    <span
      className={`safety-label ${config.bgClass} ${className}`}
      data-statement-type={statementType}
      role="status"
      aria-label={config.text}
    >
      <span className="safety-label__icon">{config.icon}</span>
      <span className="safety-label__text">{config.text}</span>
    </span>
  )
}
