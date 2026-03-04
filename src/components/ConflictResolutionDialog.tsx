import { useState } from 'react'
import {
  X,
  AlertTriangle,
  Copy,
  GitMerge,
  FileX,
  Files,
  Loader2,
  RefreshCw,
  CheckCircle,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import type { Policy } from '@/types/policy'
import type { PreUploadCheckResult } from '@/lib/policy-utils'
import { PolicyDiffViewer, PolicyDiffSummary } from './PolicyDiffViewer'

interface ConflictResolutionDialogProps {
  /** The conflict detection result */
  conflict: PreUploadCheckResult
  /** The new policy being uploaded */
  newPolicy: Policy
  /** Called when user chooses to skip (don't save new policy) */
  onSkip: () => void
  /** Called when user chooses to replace existing with new */
  onReplace: () => void
  /** Called when user chooses to keep both policies */
  onKeepBoth: () => void
  /** Called when user chooses to track as amendment */
  onTrackAmendment: () => void
  /** Called when user wants to edit the extracted policy data before saving */
  onEdit?: () => void
  /** Called to close the dialog */
  onClose: () => void
  /** Whether an action is in progress */
  isLoading?: boolean
}

/**
 * Modal dialog for resolving policy conflicts (duplicates, extraction variance, and amendments)
 */
export function ConflictResolutionDialog({
  conflict,
  newPolicy: _newPolicy,
  onSkip,
  onReplace,
  onKeepBoth,
  onTrackAmendment,
  onEdit,
  onClose,
  isLoading = false,
}: ConflictResolutionDialogProps) {
  // _newPolicy kept for potential future UI enhancements (showing side-by-side comparison)
  void _newPolicy
  const { t } = useI18n()
  const [showDetails, setShowDetails] = useState(false)

  if (conflict.type === 'noConflict') {
    return null
  }

  const isExactDuplicate = conflict.type === 'exactDuplicate'
  const isExtractionVariance = conflict.type === 'extractionVariance'
  const isAmendment = conflict.type === 'amendment'
  const isVerifiedAmendment = isAmendment && conflict.isVerifiedAmendment
  const existingPolicy = conflict.existingPolicy
  const changes = isAmendment || isExtractionVariance ? conflict.changes : []

  // Determine dialog style based on conflict type
  const getDialogStyle = () => {
    if (isExactDuplicate || isExtractionVariance) {
      return { bgColor: 'bg-amber-50', borderColor: 'border-amber-200', iconBg: 'bg-amber-100' }
    }
    if (isVerifiedAmendment) {
      return { bgColor: 'bg-green-50', borderColor: 'border-green-200', iconBg: 'bg-green-100' }
    }
    return { bgColor: 'bg-blue-50', borderColor: 'border-blue-200', iconBg: 'bg-blue-100' }
  }

  const style = getDialogStyle()

  // Get the appropriate icon
  const getIcon = () => {
    if (isExactDuplicate) return <Copy className="w-5 h-5 text-amber-600" />
    if (isExtractionVariance) return <RefreshCw className="w-5 h-5 text-amber-600" />
    if (isVerifiedAmendment) return <CheckCircle className="w-5 h-5 text-green-600" />
    return <GitMerge className="w-5 h-5 text-blue-600" />
  }

  // Get dialog title
  const getTitle = () => {
    if (isExactDuplicate) return t.conflictResolution.duplicateFound
    if (isExtractionVariance) return t.conflictResolution.extractionVariance
    if (isVerifiedAmendment) return t.conflictResolution.verifiedAmendment
    return t.conflictResolution.possibleAmendment
  }

  // Get dialog description
  const getDescription = () => {
    if (isExactDuplicate) return t.conflictResolution.duplicateDesc
    if (isExtractionVariance) return t.conflictResolution.extractionVarianceDesc
    if (isVerifiedAmendment) return t.conflictResolution.verifiedAmendmentDesc
    return t.conflictResolution.possibleAmendmentDesc
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={!isLoading ? onClose : undefined} />

      {/* Dialog - use dvh for mobile Safari compatibility */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-3 px-6 py-4 border-b',
            style.bgColor,
            style.borderColor
          )}
        >
          <div
            className={cn('w-10 h-10 rounded-full flex items-center justify-center', style.iconBg)}
          >
            {getIcon()}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{getTitle()}</h2>
            <p className="text-sm text-gray-600">{getDescription()}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg hover:bg-white/50 text-gray-500 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {/* Existing policy info */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              {t.conflictResolution.existingPolicy}
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3 sm:gap-4 overflow-hidden">
              <span className="text-2xl sm:text-3xl flex-shrink-0">
                {existingPolicy.logo || '📄'}
              </span>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="font-medium text-gray-900 truncate">{existingPolicy.provider}</p>
                <p className="text-sm text-gray-500 break-all">{existingPolicy.policyNumber}</p>
              </div>
              <div className="text-right flex-shrink-0 max-w-[100px] sm:max-w-[140px]">
                <p className="text-sm text-gray-500 truncate">
                  {existingPolicy.typeTr || existingPolicy.type}
                </p>
                {existingPolicy.insuredPerson && (
                  <p className="text-xs text-gray-400 truncate">{existingPolicy.insuredPerson}</p>
                )}
              </div>
            </div>
          </div>

          {/* Amendment or Extraction Variance diff */}
          {(isAmendment || isExtractionVariance) && changes.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-500">
                  {t.conflictResolution.differencesDetected.replace(
                    '{count}',
                    String(changes.length)
                  )}
                </h3>
                <PolicyDiffSummary changes={changes} />
              </div>

              {/* Info box based on type */}
              {isExtractionVariance && (
                <div className="flex items-start gap-3 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    {t.conflictResolution.extractionVarianceInfo}
                  </div>
                </div>
              )}

              {isVerifiedAmendment && (
                <div className="flex items-start gap-3 p-3 mb-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-green-800">
                    {t.conflictResolution.verifiedAmendmentInfo}
                  </div>
                </div>
              )}

              {isAmendment &&
                !isVerifiedAmendment &&
                changes.some(
                  (c) => c.significance === 'critical' || c.significance === 'major'
                ) && (
                  <div className="flex items-start gap-3 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      {t.conflictResolution.criticalDifferencesInfo}
                    </div>
                  </div>
                )}

              {/* Toggle for full details */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-blue-600 hover:text-blue-700 mb-3"
              >
                {showDetails
                  ? t.conflictResolution.hideDetails
                  : t.conflictResolution.showAllDifferences}
              </button>

              {showDetails && (
                <div className="max-w-full overflow-x-auto">
                  <PolicyDiffViewer changes={changes} className="mb-4" />
                </div>
              )}

              {!showDetails && (
                <div className="max-w-full overflow-x-auto">
                  <PolicyDiffViewer changes={changes.slice(0, 3)} compact className="mb-4" />
                </div>
              )}
            </div>
          )}

          {/* Duplicate info for exact match */}
          {isExactDuplicate && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">{t.conflictResolution.duplicateIdentical}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 sm:justify-end">
            {isExactDuplicate ? (
              // Exact duplicate options
              <>
                <ActionButton
                  icon={FileX}
                  label={t.conflictResolution.skip}
                  description={t.conflictResolution.skipDesc}
                  onClick={onSkip}
                  disabled={isLoading}
                  variant="secondary"
                />
                <ActionButton
                  icon={Copy}
                  label={t.conflictResolution.updateExisting}
                  description={t.conflictResolution.updateDesc}
                  onClick={onReplace}
                  disabled={isLoading}
                  variant="primary"
                />
                <ActionButton
                  icon={Files}
                  label={t.conflictResolution.keepBoth}
                  description={t.conflictResolution.keepBothDesc}
                  onClick={onKeepBoth}
                  disabled={isLoading}
                  variant="secondary"
                />
              </>
            ) : isExtractionVariance ? (
              // Extraction variance options - prioritize Skip
              <>
                <ActionButton
                  icon={FileX}
                  label={t.conflictResolution.skipRecommended}
                  description={t.conflictResolution.skipRecommendedDesc}
                  onClick={onSkip}
                  disabled={isLoading}
                  variant="primary"
                />
                {onEdit && (
                  <ActionButton
                    icon={Pencil}
                    label={t.conflictResolution.edit}
                    description={t.conflictResolution.editDesc}
                    onClick={onEdit}
                    disabled={isLoading}
                    variant="secondary"
                  />
                )}
                <ActionButton
                  icon={Copy}
                  label={t.conflictResolution.updateAnyway}
                  description={t.conflictResolution.updateAnywayDesc}
                  onClick={onReplace}
                  disabled={isLoading}
                  variant="secondary"
                />
                <ActionButton
                  icon={Files}
                  label={t.conflictResolution.saveSeparately}
                  description={t.conflictResolution.saveSeparatelyDesc}
                  onClick={onKeepBoth}
                  disabled={isLoading}
                  variant="secondary"
                />
              </>
            ) : (
              // Amendment options (verified or unverified)
              <>
                <ActionButton
                  icon={FileX}
                  label={t.conflictResolution.skipAmendment}
                  description={t.conflictResolution.skipAmendmentDesc}
                  onClick={onSkip}
                  disabled={isLoading}
                  variant="secondary"
                />
                {onEdit && (
                  <ActionButton
                    icon={Pencil}
                    label={t.conflictResolution.edit}
                    description={t.conflictResolution.editDesc}
                    onClick={onEdit}
                    disabled={isLoading}
                    variant="secondary"
                  />
                )}
                <ActionButton
                  icon={GitMerge}
                  label={t.conflictResolution.trackAmendment}
                  description={t.conflictResolution.trackAmendmentDesc}
                  onClick={onTrackAmendment}
                  disabled={isLoading}
                  variant={isVerifiedAmendment ? 'primary' : 'secondary'}
                  loading={isLoading}
                />
                <ActionButton
                  icon={Files}
                  label={t.conflictResolution.saveSeparately}
                  description={t.conflictResolution.saveSeparatelyDesc}
                  onClick={onKeepBoth}
                  disabled={isLoading}
                  variant={isVerifiedAmendment ? 'secondary' : 'primary'}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  onClick: () => void
  disabled?: boolean
  variant: 'primary' | 'secondary'
  loading?: boolean
}

function ActionButton({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  variant,
  loading,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-colors',
        'w-full sm:w-auto sm:min-w-[140px]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      )}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
      <span className="font-medium text-sm">{label}</span>
      <span className={cn('text-xs', variant === 'primary' ? 'text-blue-100' : 'text-gray-500')}>
        {description}
      </span>
    </button>
  )
}

/**
 * Simple inline duplicate warning banner (alternative to modal)
 */
export function DuplicateWarningBanner({
  conflict,
  onDismiss,
  onShowDialog,
  className,
}: {
  conflict: PreUploadCheckResult
  onDismiss: () => void
  onShowDialog: () => void
  className?: string
}) {
  const { t } = useI18n()

  if (conflict.type === 'noConflict') {
    return null
  }

  const isExactDuplicate = conflict.type === 'exactDuplicate'
  const isExtractionVariance = conflict.type === 'extractionVariance'
  const isAmendment = conflict.type === 'amendment'
  const isVerifiedAmendment = isAmendment && conflict.isVerifiedAmendment

  // Determine styling based on type
  const getStyle = () => {
    if (isExactDuplicate || isExtractionVariance) {
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        buttonBg: 'bg-amber-100',
        buttonText: 'text-amber-700',
        buttonHover: 'hover:bg-amber-200',
      }
    }
    if (isVerifiedAmendment) {
      return {
        bg: 'bg-green-50',
        border: 'border-green-200',
        buttonBg: 'bg-green-100',
        buttonText: 'text-green-700',
        buttonHover: 'hover:bg-green-200',
      }
    }
    return {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      buttonBg: 'bg-blue-100',
      buttonText: 'text-blue-700',
      buttonHover: 'hover:bg-blue-200',
    }
  }

  const style = getStyle()

  // Get the appropriate icon
  const getIcon = () => {
    if (isExactDuplicate) return <Copy className="w-5 h-5 text-amber-600 flex-shrink-0" />
    if (isExtractionVariance) return <RefreshCw className="w-5 h-5 text-amber-600 flex-shrink-0" />
    if (isVerifiedAmendment) return <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
    return <GitMerge className="w-5 h-5 text-blue-600 flex-shrink-0" />
  }

  // Get message
  const getMessage = () => {
    if (isExactDuplicate) {
      return {
        title: t.conflictResolution.duplicate,
        detail: `- ${t.conflictResolution.alreadyExists}`,
      }
    }
    if (isExtractionVariance) {
      return {
        title: t.conflictResolution.extractionVarianceShort,
        detail: `- ${t.conflictResolution.sameDocDifferent}`,
      }
    }
    if (isVerifiedAmendment) {
      return {
        title: t.conflictResolution.officialAmendment,
        detail: `- ${t.conflictResolution.changeCount.replace('{count}', String(conflict.changes.length))}`,
      }
    }
    return {
      title: t.conflictResolution.possibleChange,
      detail: `- ${t.conflictResolution.diffCount.replace('{count}', String(conflict.changes.length))}`,
    }
  }

  const message = getMessage()

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        style.bg,
        style.border,
        className
      )}
    >
      {getIcon()}
      <div className="flex-1 text-sm">
        <span className="font-medium text-gray-900">{message.title}</span>
        <span className="text-gray-600 ml-1">{message.detail}</span>
      </div>
      <button
        onClick={onShowDialog}
        className={cn(
          'px-3 py-1.5 text-sm font-medium rounded-lg',
          style.buttonBg,
          style.buttonText,
          style.buttonHover
        )}
      >
        {t.conflictResolution.resolve}
      </button>
      <button onClick={onDismiss} className="p-1 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
