/**
 * Confirmation Dialog Component
 *
 * A reusable modal dialog for confirming destructive or important actions.
 * Supports different variants (danger, warning, info) and custom content.
 */

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { AlertTriangle, Trash2, LogOut, AlertCircle, X, Loader2 } from 'lucide-react'
import { Button } from './button'

type DialogVariant = 'danger' | 'warning' | 'info'

interface ConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: DialogVariant
  icon?: ReactNode
  isLoading?: boolean
  /** For extra dangerous actions, require typing a confirmation phrase */
  confirmPhrase?: string
}

const variantStyles: Record<DialogVariant, { bg: string; icon: string; button: string }> = {
  danger: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    button: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    bg: 'bg-amber-50',
    icon: 'text-amber-600',
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  info: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
}

const variantIcons: Record<DialogVariant, ReactNode> = {
  danger: <Trash2 size={24} />,
  warning: <AlertTriangle size={24} />,
  info: <AlertCircle size={24} />,
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  icon,
  isLoading = false,
  confirmPhrase,
}: ConfirmationDialogProps) {
  const [inputValue, setInputValue] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)

  const styles = variantStyles[variant]
  const defaultIcon = variantIcons[variant]

  const handleConfirm = async () => {
    if (confirmPhrase && inputValue !== confirmPhrase) {
      return
    }

    setIsConfirming(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      // Error handling should be done by the caller
      console.error('Confirmation action failed:', error)
    } finally {
      setIsConfirming(false)
      setInputValue('')
    }
  }

  const handleClose = () => {
    if (!isConfirming && !isLoading) {
      setInputValue('')
      onClose()
    }
  }

  const canConfirm = !confirmPhrase || inputValue === confirmPhrase

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Close dialog"
          disabled={isConfirming || isLoading}
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className={`${styles.bg} p-6 flex justify-center`}>
          <div className={`${styles.icon}`}>{icon || defaultIcon}</div>
        </div>

        {/* Content */}
        <div className="p-6">
          <h2 id="dialog-title" className="text-xl font-semibold text-gray-900 text-center mb-2">
            {title}
          </h2>
          <p className="text-gray-600 text-center mb-6">{description}</p>

          {/* Confirmation phrase input */}
          {confirmPhrase && (
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-2">
                Type <span className="font-mono font-semibold text-red-600">{confirmPhrase}</span> to
                confirm:
              </p>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
                placeholder={confirmPhrase}
                disabled={isConfirming || isLoading}
                autoFocus
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={isConfirming || isLoading}
            >
              {cancelText}
            </Button>
            <Button
              className={`flex-1 ${styles.button}`}
              onClick={handleConfirm}
              disabled={!canConfirm || isConfirming || isLoading}
            >
              {isConfirming || isLoading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                confirmText
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook for managing confirmation dialog state
 */
export function useConfirmation() {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<Omit<ConfirmationDialogProps, 'isOpen' | 'onClose'> | null>(
    null
  )

  const confirm = useCallback(
    (options: Omit<ConfirmationDialogProps, 'isOpen' | 'onClose'>): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfig({
          ...options,
          onConfirm: async () => {
            await options.onConfirm()
            resolve(true)
          },
        })
        setIsOpen(true)
      })
    },
    []
  )

  const close = useCallback(() => {
    setIsOpen(false)
    setConfig(null)
  }, [])

  const ConfirmationDialogComponent = config ? (
    <ConfirmationDialog {...config} isOpen={isOpen} onClose={close} />
  ) : null

  return { confirm, close, ConfirmationDialog: ConfirmationDialogComponent }
}

/**
 * Context for global confirmation dialogs
 */
interface ConfirmationContextValue {
  confirm: (options: Omit<ConfirmationDialogProps, 'isOpen' | 'onClose'>) => Promise<boolean>
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null)

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { confirm, ConfirmationDialog } = useConfirmation()

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      {ConfirmationDialog}
    </ConfirmationContext.Provider>
  )
}

export function useConfirmationDialog() {
  const context = useContext(ConfirmationContext)
  if (!context) {
    throw new Error('useConfirmationDialog must be used within a ConfirmationProvider')
  }
  return context
}

/**
 * Pre-built confirmation dialogs for common actions
 */
export const confirmations = {
  deletePolicy: {
    title: 'Delete Policy',
    description:
      'Are you sure you want to delete this policy? This action cannot be undone and all associated data will be permanently removed.',
    confirmText: 'Delete Policy',
    variant: 'danger' as const,
    icon: <Trash2 size={24} />,
  },

  clearAllData: {
    title: 'Clear All Data',
    description:
      'Are you sure you want to clear all policies and data? This will permanently delete all your uploaded policies and analysis results.',
    confirmText: 'Clear All Data',
    variant: 'danger' as const,
    confirmPhrase: 'DELETE',
  },

  signOut: {
    title: 'Sign Out',
    description:
      'Are you sure you want to sign out? You will need to sign in again to access your policies.',
    confirmText: 'Sign Out',
    variant: 'warning' as const,
    icon: <LogOut size={24} />,
  },

  deleteAccount: {
    title: 'Delete Account',
    description:
      'This will permanently delete your account and all associated data. This action is irreversible.',
    confirmText: 'Delete My Account',
    variant: 'danger' as const,
    confirmPhrase: 'DELETE MY ACCOUNT',
  },

  removeApiKey: {
    title: 'Remove API Key',
    description:
      'Are you sure you want to remove this API key? You will need to re-enter it to use this feature again.',
    confirmText: 'Remove Key',
    variant: 'warning' as const,
  },
}
