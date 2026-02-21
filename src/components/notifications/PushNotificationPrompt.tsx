/**
 * PushNotificationPrompt
 *
 * A soft banner shown after a successful policy extraction, inviting the user
 * to enable browser push notifications for future extraction completions.
 *
 * - Shows only once every 7 days (localStorage cooldown)
 * - Does not render if already subscribed or if the browser doesn't support push
 * - Shows a "permission denied" state when the user has blocked notifications in the browser
 */

import { useState, useEffect } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'
import { usePushNotifications } from '@/hooks/usePushNotifications'

const DISMISSED_KEY = 'insurai_push_dismissed_until'
const DISMISSED_DAYS = 7

function isDismissed(): boolean {
  try {
    const value = localStorage.getItem(DISMISSED_KEY)
    if (!value) return false
    return Date.now() < parseInt(value, 10)
  } catch {
    return false
  }
}

function dismiss(): void {
  try {
    const until = Date.now() + DISMISSED_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(DISMISSED_KEY, String(until))
  } catch {
    // localStorage unavailable — ignore
  }
}

interface PushNotificationPromptProps {
  /** Called when the banner is dismissed or successfully subscribed */
  onDismiss?: () => void
}

export function PushNotificationPrompt({ onDismiss }: PushNotificationPromptProps) {
  const { t } = useTranslation()
  const { isSupported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show the banner if:
    // - Push is supported
    // - Not already subscribed
    // - Permission not already granted (they're already subscribed elsewhere)
    // - Not dismissed within the cooldown window
    if (isSupported && !isSubscribed && permission !== 'granted' && !isDismissed()) {
      setVisible(true)
    }
  }, [isSupported, isSubscribed, permission])

  const handleEnable = async () => {
    const ok = await subscribe()
    if (ok || Notification.permission === 'denied') {
      setVisible(false)
      onDismiss?.()
    }
  }

  const handleDismiss = () => {
    dismiss()
    setVisible(false)
    onDismiss?.()
  }

  if (!visible) return null

  // Permission denied state — user blocked in browser settings
  if (permission === 'denied') {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <div className="min-w-0">
          <span className="font-medium text-gray-700">{t.notifications.permissionDenied}: </span>
          {t.notifications.permissionDeniedHint}
        </div>
        <button
          onClick={handleDismiss}
          className="ml-auto shrink-0 text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // Default opt-in banner
  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
      role="region"
      aria-label={t.notifications.promptTitle}
    >
      <Bell className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-blue-900">{t.notifications.promptTitle}</p>
        <p className="mt-0.5 text-xs text-blue-700">{t.notifications.promptBody}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={handleEnable}
            disabled={isLoading}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {isLoading ? '…' : t.notifications.enableButton}
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            {t.notifications.maybeLater}
          </button>
        </div>
      </div>

      <button
        onClick={handleDismiss}
        className="ml-auto shrink-0 text-blue-400 hover:text-blue-600"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
