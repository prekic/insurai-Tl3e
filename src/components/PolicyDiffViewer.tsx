import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { AlertTriangle, AlertCircle, Info, ArrowRight } from 'lucide-react'
import type { PolicyFieldDiff } from '@/lib/policy-utils'

interface PolicyDiffViewerProps {
  changes: PolicyFieldDiff[]
  className?: string
  compact?: boolean
}

/**
 * Component to display policy field differences in a clear visual format
 */
export function PolicyDiffViewer({ changes, className, compact = false }: PolicyDiffViewerProps) {
  const { locale } = useI18n()

  if (changes.length === 0) {
    return (
      <div className={cn('text-center py-4 text-gray-500', className)}>
        {locale === 'tr' ? 'Degisiklik bulunamadi' : 'No changes detected'}
      </div>
    )
  }

  // Sort changes by significance
  const sortedChanges = [...changes].sort((a, b) => {
    const order = { critical: 0, major: 1, moderate: 2, minor: 3 }
    return order[a.significance] - order[b.significance]
  })

  return (
    <div className={cn('space-y-2', className)}>
      {sortedChanges.map((change, index) => (
        <DiffRow key={`${change.field}-${index}`} change={change} compact={compact} />
      ))}
    </div>
  )
}

interface DiffRowProps {
  change: PolicyFieldDiff
  compact?: boolean
}

function DiffRow({ change, compact = false }: DiffRowProps) {
  const { locale } = useI18n()

  const label = locale === 'tr' ? change.fieldLabelTr : change.fieldLabel

  // Format values based on type
  const formatValue = (value: unknown, type: PolicyFieldDiff['type']): string => {
    if (value === null || value === undefined || value === '') {
      return locale === 'tr' ? '(bos)' : '(empty)'
    }

    switch (type) {
      case 'number':
        return formatCurrency(Number(value))
      case 'date':
        return formatDate(String(value))
      case 'array':
        if (Array.isArray(value)) {
          return value.length > 0
            ? `${value.length} ${locale === 'tr' ? 'madde' : 'item(s)'}`
            : locale === 'tr'
              ? '(bos)'
              : '(empty)'
        }
        return String(value)
      default:
        return String(value)
    }
  }

  const oldValueStr = formatValue(change.oldValue, change.type)
  const newValueStr = formatValue(change.newValue, change.type)

  const getSignificanceConfig = () => {
    switch (change.significance) {
      case 'critical':
        return {
          icon: AlertTriangle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          label: locale === 'tr' ? 'Kritik' : 'Critical',
        }
      case 'major':
        return {
          icon: AlertCircle,
          color: 'text-amber-600',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          label: locale === 'tr' ? 'Onemli' : 'Major',
        }
      case 'moderate':
        return {
          icon: Info,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          label: locale === 'tr' ? 'Orta' : 'Moderate',
        }
      case 'minor':
      default:
        return {
          icon: Info,
          color: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          label: locale === 'tr' ? 'Kucuk' : 'Minor',
        }
    }
  }

  const config = getSignificanceConfig()
  const Icon = config.icon

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border',
          config.bgColor,
          config.borderColor
        )}
      >
        <Icon className={cn('w-4 h-4 flex-shrink-0', config.color)} />
        <span className="font-medium text-gray-700 text-sm">{label}:</span>
        <span className="text-gray-500 text-sm line-through">{oldValueStr}</span>
        <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <span className={cn('font-medium text-sm', config.color)}>{newValueStr}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        config.borderColor
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 px-4 py-2', config.bgColor)}>
        <Icon className={cn('w-4 h-4', config.color)} />
        <span className="font-medium text-gray-900">{label}</span>
        <span className={cn('text-xs px-1.5 py-0.5 rounded', config.bgColor, config.color)}>
          {config.label}
        </span>
      </div>

      {/* Values */}
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        <div className="p-3 bg-white">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {locale === 'tr' ? 'Onceki Deger' : 'Previous Value'}
          </div>
          <div className="text-gray-600 line-through">{oldValueStr}</div>
        </div>
        <div className="p-3 bg-white">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {locale === 'tr' ? 'Yeni Deger' : 'New Value'}
          </div>
          <div className={cn('font-medium', config.color)}>{newValueStr}</div>
        </div>
      </div>

      {/* Show array details for arrays */}
      {change.type === 'array' && (
        <ArrayDiffDetail oldValue={change.oldValue} newValue={change.newValue} />
      )}
    </div>
  )
}

interface ArrayDiffDetailProps {
  oldValue: unknown
  newValue: unknown
}

function ArrayDiffDetail({ oldValue, newValue }: ArrayDiffDetailProps) {
  const { locale } = useI18n()

  const oldArray = Array.isArray(oldValue) ? oldValue : []
  const newArray = Array.isArray(newValue) ? newValue : []

  // Find added and removed items (simple string comparison)
  const oldSet = new Set(oldArray.map((v) => JSON.stringify(v)))
  const newSet = new Set(newArray.map((v) => JSON.stringify(v)))

  const added = newArray.filter((v) => !oldSet.has(JSON.stringify(v)))
  const removed = oldArray.filter((v) => !newSet.has(JSON.stringify(v)))

  if (added.length === 0 && removed.length === 0) {
    return null
  }

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-2 text-sm">
      {removed.length > 0 && (
        <div>
          <span className="text-red-600 font-medium">
            {locale === 'tr' ? 'Kaldirilan:' : 'Removed:'}
          </span>
          <ul className="mt-1 space-y-1">
            {removed.slice(0, 5).map((item, i) => (
              <li key={i} className="text-gray-600 line-through pl-3">
                - {typeof item === 'string' ? item : JSON.stringify(item)}
              </li>
            ))}
            {removed.length > 5 && (
              <li className="text-gray-400 pl-3">
                +{removed.length - 5} {locale === 'tr' ? 'daha' : 'more'}
              </li>
            )}
          </ul>
        </div>
      )}
      {added.length > 0 && (
        <div>
          <span className="text-green-600 font-medium">
            {locale === 'tr' ? 'Eklenen:' : 'Added:'}
          </span>
          <ul className="mt-1 space-y-1">
            {added.slice(0, 5).map((item, i) => (
              <li key={i} className="text-gray-600 pl-3">
                + {typeof item === 'string' ? item : JSON.stringify(item)}
              </li>
            ))}
            {added.length > 5 && (
              <li className="text-gray-400 pl-3">
                +{added.length - 5} {locale === 'tr' ? 'daha' : 'more'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Compact summary of changes (for use in cards/headers)
 */
export function PolicyDiffSummary({
  changes,
  className,
}: {
  changes: PolicyFieldDiff[]
  className?: string
}) {
  const { locale } = useI18n()

  const critical = changes.filter((c) => c.significance === 'critical').length
  const major = changes.filter((c) => c.significance === 'major').length
  const other = changes.length - critical - major

  return (
    <div className={cn('flex items-center gap-3 text-sm', className)}>
      {critical > 0 && (
        <span className="flex items-center gap-1 text-red-600">
          <AlertTriangle className="w-3.5 h-3.5" />
          {critical} {locale === 'tr' ? 'kritik' : 'critical'}
        </span>
      )}
      {major > 0 && (
        <span className="flex items-center gap-1 text-amber-600">
          <AlertCircle className="w-3.5 h-3.5" />
          {major} {locale === 'tr' ? 'onemli' : 'major'}
        </span>
      )}
      {other > 0 && (
        <span className="flex items-center gap-1 text-gray-500">
          <Info className="w-3.5 h-3.5" />
          {other} {locale === 'tr' ? 'diger' : 'other'}
        </span>
      )}
    </div>
  )
}
