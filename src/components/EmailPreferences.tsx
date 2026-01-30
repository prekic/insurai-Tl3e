/**
 * Email Preferences Component
 *
 * Allows users to manage their email notification preferences.
 */

import { useId } from 'react'
import { Mail, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { useEmailPreferences, type EmailPreferences as EmailPrefsType } from '@/hooks/useEmailPreferences'
import { useI18n } from '@/lib/i18n'

// Toggle Switch Component
interface ToggleSwitchProps {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

function ToggleSwitch({ id, label, description, checked, onChange, disabled }: ToggleSwitchProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (!disabled) onChange(!checked)
    }
  }

  return (
    <div className="flex items-start justify-between py-3">
      <div className="flex-1 pr-4">
        <label htmlFor={id} className={`text-gray-700 cursor-pointer font-medium ${disabled ? 'opacity-50' : ''}`}>
          {label}
        </label>
        {description && (
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`relative w-12 h-6 rounded-full transition-colors focus-ring flex-shrink-0 ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

// Email preference labels and descriptions
const EMAIL_PREF_CONFIG: Record<keyof EmailPrefsType, { label: string; labelTr: string; description: string; descriptionTr: string }> = {
  policy_alerts: {
    label: 'Policy Alerts',
    labelTr: 'Poliçe Bildirimleri',
    description: 'Get notified when your policy is uploaded and analyzed',
    descriptionTr: 'Poliçeniz yüklendiğinde ve analiz edildiğinde bildirim alın',
  },
  expiration_reminders: {
    label: 'Expiration Reminders',
    labelTr: 'Vade Hatırlatmaları',
    description: 'Receive reminders before your policies expire (30, 14, 7, 3, 1 days)',
    descriptionTr: 'Poliçelerinizin süresi dolmadan önce hatırlatma alın (30, 14, 7, 3, 1 gün)',
  },
  weekly_digest: {
    label: 'Weekly Digest',
    labelTr: 'Haftalık Özet',
    description: 'Get a weekly summary of your policy status and recommendations',
    descriptionTr: 'Poliçe durumunuz ve önerileriniz hakkında haftalık özet alın',
  },
  marketing: {
    label: 'Product Updates',
    labelTr: 'Ürün Güncellemeleri',
    description: 'Learn about new features and improvements',
    descriptionTr: 'Yeni özellikler ve iyileştirmeler hakkında bilgi alın',
  },
}

export function EmailPreferences() {
  const baseId = useId()
  const { locale } = useI18n()
  const {
    preferences,
    isLoading,
    error,
    updatePreference,
    isConfigured,
  } = useEmailPreferences()

  const isTurkish = locale === 'tr'

  const handleToggle = async (key: keyof EmailPrefsType, value: boolean) => {
    try {
      await updatePreference(key, value)
      toast.success(isTurkish ? 'Tercih güncellendi' : 'Preference updated')
    } catch {
      toast.error(isTurkish ? 'Tercih güncellenemedi' : 'Failed to update preference')
    }
  }

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="text-blue-500" size={20} aria-hidden="true" />
            {isTurkish ? 'Email Bildirimleri' : 'Email Notifications'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-gray-500 text-sm">
            <AlertCircle size={16} />
            <span>
              {isTurkish
                ? 'Email bildirimleri henüz yapılandırılmamış.'
                : 'Email notifications are not configured yet.'}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="text-blue-500" size={20} aria-hidden="true" />
          {isTurkish ? 'Email Bildirimleri' : 'Email Notifications'}
          {isLoading && <Loader2 size={16} className="animate-spin text-blue-500" />}
        </CardTitle>
        <CardDescription>
          {isTurkish
            ? 'Hangi email bildirimlerini almak istediğinizi seçin'
            : 'Choose which email notifications you want to receive'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-lg">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {(Object.keys(EMAIL_PREF_CONFIG) as Array<keyof EmailPrefsType>).map((key) => {
            const config = EMAIL_PREF_CONFIG[key]
            return (
              <ToggleSwitch
                key={key}
                id={`${baseId}-${key}`}
                label={isTurkish ? config.labelTr : config.label}
                description={isTurkish ? config.descriptionTr : config.description}
                checked={preferences[key]}
                onChange={(value) => handleToggle(key, value)}
                disabled={isLoading}
              />
            )
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            {isTurkish
              ? 'Not: Şifre sıfırlama gibi işlemsel emailler her zaman gönderilir.'
              : 'Note: Transactional emails like password reset are always sent.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default EmailPreferences
