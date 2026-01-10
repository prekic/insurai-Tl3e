import { useState } from 'react'
import { X, AlertTriangle, Copy, GitMerge, FileX, Files, Loader2 } from 'lucide-react'
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
  /** Called to close the dialog */
  onClose: () => void
  /** Whether an action is in progress */
  isLoading?: boolean
}

/**
 * Modal dialog for resolving policy conflicts (duplicates and amendments)
 */
export function ConflictResolutionDialog({
  conflict,
  newPolicy: _newPolicy,
  onSkip,
  onReplace,
  onKeepBoth,
  onTrackAmendment,
  onClose,
  isLoading = false,
}: ConflictResolutionDialogProps) {
  // _newPolicy kept for potential future UI enhancements (showing side-by-side comparison)
  void _newPolicy
  const { locale } = useI18n()
  const [showDetails, setShowDetails] = useState(false)

  if (conflict.type === 'noConflict') {
    return null
  }

  const isExactDuplicate = conflict.type === 'exactDuplicate'
  const isAmendment = conflict.type === 'amendment'
  const existingPolicy = conflict.existingPolicy
  const changes = isAmendment ? conflict.changes : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={!isLoading ? onClose : undefined}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-3 px-6 py-4 border-b',
            isExactDuplicate ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              isExactDuplicate ? 'bg-amber-100' : 'bg-blue-100'
            )}
          >
            {isExactDuplicate ? (
              <Copy className="w-5 h-5 text-amber-600" />
            ) : (
              <GitMerge className="w-5 h-5 text-blue-600" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {isExactDuplicate
                ? locale === 'tr'
                  ? 'Ayni Police Bulundu'
                  : 'Duplicate Policy Found'
                : locale === 'tr'
                  ? 'Police Degisikligi Algilandi'
                  : 'Policy Amendment Detected'}
            </h2>
            <p className="text-sm text-gray-600">
              {isExactDuplicate
                ? locale === 'tr'
                  ? 'Bu police veritabaninizda zaten mevcut.'
                  : 'This policy already exists in your database.'
                : locale === 'tr'
                  ? 'Mevcut policede degisiklikler tespit edildi.'
                  : 'Changes detected from an existing policy.'}
            </p>
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
        <div className="flex-1 overflow-y-auto p-6">
          {/* Existing policy info */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              {locale === 'tr' ? 'Mevcut Police' : 'Existing Policy'}
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
              <span className="text-3xl">{existingPolicy.logo || '📄'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{existingPolicy.provider}</p>
                <p className="text-sm text-gray-500">{existingPolicy.policyNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">{existingPolicy.typeTr || existingPolicy.type}</p>
                {existingPolicy.insuredPerson && (
                  <p className="text-xs text-gray-400">{existingPolicy.insuredPerson}</p>
                )}
              </div>
            </div>
          </div>

          {/* Amendment diff */}
          {isAmendment && changes.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-500">
                  {locale === 'tr'
                    ? `${changes.length} Degisiklik Tespit Edildi`
                    : `${changes.length} Change(s) Detected`}
                </h3>
                <PolicyDiffSummary changes={changes} />
              </div>

              {/* Summary warning for critical/major changes */}
              {changes.some((c) => c.significance === 'critical' || c.significance === 'major') && (
                <div className="flex items-start gap-3 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    {locale === 'tr'
                      ? 'Bu degisiklikler onemli police sartlarini etkiliyor. Lutfen dikkatli inceleyin.'
                      : 'These changes affect important policy terms. Please review carefully.'}
                  </div>
                </div>
              )}

              {/* Toggle for full details */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-blue-600 hover:text-blue-700 mb-3"
              >
                {showDetails
                  ? locale === 'tr'
                    ? 'Detaylari Gizle'
                    : 'Hide Details'
                  : locale === 'tr'
                    ? 'Tum Degisiklikleri Goster'
                    : 'Show All Changes'}
              </button>

              {showDetails && (
                <PolicyDiffViewer changes={changes} className="mb-4" />
              )}

              {!showDetails && (
                <PolicyDiffViewer changes={changes.slice(0, 3)} compact className="mb-4" />
              )}
            </div>
          )}

          {/* Duplicate info for exact match */}
          {isExactDuplicate && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">
                {locale === 'tr'
                  ? 'Yeni yuklenen police mevcut kayitla tamamen ayni. Ne yapmak istersiniz?'
                  : 'The uploaded policy is identical to an existing record. What would you like to do?'}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex flex-wrap gap-3 justify-end">
            {isExactDuplicate ? (
              // Exact duplicate options
              <>
                <ActionButton
                  icon={FileX}
                  label={locale === 'tr' ? 'Atla' : 'Skip'}
                  description={locale === 'tr' ? 'Yeni policeyi kaydetme' : "Don't save the new policy"}
                  onClick={onSkip}
                  disabled={isLoading}
                  variant="secondary"
                />
                <ActionButton
                  icon={Copy}
                  label={locale === 'tr' ? 'Guncelle' : 'Update Existing'}
                  description={locale === 'tr' ? 'Mevcut kaydi guncelle' : 'Replace with uploaded data'}
                  onClick={onReplace}
                  disabled={isLoading}
                  variant="primary"
                />
                <ActionButton
                  icon={Files}
                  label={locale === 'tr' ? 'Ikisini de Sakla' : 'Keep Both'}
                  description={locale === 'tr' ? 'Ayri kayitlar olarak sakla' : 'Save as separate records'}
                  onClick={onKeepBoth}
                  disabled={isLoading}
                  variant="secondary"
                />
              </>
            ) : (
              // Amendment options
              <>
                <ActionButton
                  icon={FileX}
                  label={locale === 'tr' ? 'Atla' : 'Skip'}
                  description={locale === 'tr' ? 'Degisiklikleri uygulama' : "Don't apply changes"}
                  onClick={onSkip}
                  disabled={isLoading}
                  variant="secondary"
                />
                <ActionButton
                  icon={GitMerge}
                  label={locale === 'tr' ? 'Degisiklik Olarak Kaydet' : 'Track as Amendment'}
                  description={
                    locale === 'tr'
                      ? 'Guncelle ve gecmisi sakla'
                      : 'Update and keep version history'
                  }
                  onClick={onTrackAmendment}
                  disabled={isLoading}
                  variant="primary"
                  loading={isLoading}
                />
                <ActionButton
                  icon={Files}
                  label={locale === 'tr' ? 'Ayri Kaydet' : 'Save Separately'}
                  description={locale === 'tr' ? 'Yeni kayit olarak ekle' : 'Add as new record'}
                  onClick={onKeepBoth}
                  disabled={isLoading}
                  variant="secondary"
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
        'flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-colors min-w-[140px]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      )}
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Icon className="w-5 h-5" />
      )}
      <span className="font-medium text-sm">{label}</span>
      <span
        className={cn(
          'text-xs',
          variant === 'primary' ? 'text-blue-100' : 'text-gray-500'
        )}
      >
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
  const { locale } = useI18n()

  if (conflict.type === 'noConflict') {
    return null
  }

  const isExactDuplicate = conflict.type === 'exactDuplicate'

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        isExactDuplicate
          ? 'bg-amber-50 border-amber-200'
          : 'bg-blue-50 border-blue-200',
        className
      )}
    >
      {isExactDuplicate ? (
        <Copy className="w-5 h-5 text-amber-600 flex-shrink-0" />
      ) : (
        <GitMerge className="w-5 h-5 text-blue-600 flex-shrink-0" />
      )}
      <div className="flex-1 text-sm">
        <span className="font-medium text-gray-900">
          {isExactDuplicate
            ? locale === 'tr'
              ? 'Kopya police algilandi'
              : 'Duplicate detected'
            : locale === 'tr'
              ? 'Degisiklik algilandi'
              : 'Amendment detected'}
        </span>
        <span className="text-gray-600 ml-1">
          {isExactDuplicate
            ? locale === 'tr'
              ? '- Bu police zaten mevcut'
              : '- This policy already exists'
            : locale === 'tr'
              ? `- ${conflict.changes.length} degisiklik`
              : `- ${conflict.changes.length} change(s)`}
        </span>
      </div>
      <button
        onClick={onShowDialog}
        className={cn(
          'px-3 py-1.5 text-sm font-medium rounded-lg',
          isExactDuplicate
            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
        )}
      >
        {locale === 'tr' ? 'Coz' : 'Resolve'}
      </button>
      <button onClick={onDismiss} className="p-1 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
