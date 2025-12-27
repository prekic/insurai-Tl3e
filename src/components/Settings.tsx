import { useState, useId } from 'react'
import { ArrowLeft, Moon, Sun, Bell, Shield, Globe, Key, LogOut, ChevronRight, Monitor, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { useI18n, useLanguageSelector } from '@/lib/i18n'

interface SettingsProps {
  onBack: () => void
  onNavigateToAdmin?: () => void
}

// Accessible Toggle Switch Component
interface ToggleSwitchProps {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleSwitch({ id, label, checked, onChange }: ToggleSwitchProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onChange(!checked)
    }
  }

  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-gray-700 cursor-pointer">
        {label}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        onKeyDown={handleKeyDown}
        className={`relative w-12 h-6 rounded-full transition-colors focus-ring ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        }`}
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

export function Settings({ onBack, onNavigateToAdmin }: SettingsProps) {
  const { t, isRTL } = useI18n()
  const { currentLocale, locales, setLocale, isLoading, progress } = useLanguageSelector()
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light')
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    renewalReminders: true,
    marketUpdates: false,
  })
  const baseId = useId()

  const themeOptions = [
    { value: 'light', label: t.settings.light, icon: Sun },
    { value: 'dark', label: t.settings.dark, icon: Moon },
    { value: 'system', label: t.settings.system, icon: Monitor },
  ]

  const notificationLabels: Record<string, string> = {
    email: t.settings.emailNotifications,
    push: t.settings.pushNotifications,
    renewalReminders: t.settings.renewalReminders,
    marketUpdates: t.settings.marketUpdates,
  }

  const handleLanguageChange = async (locale: string) => {
    try {
      await setLocale(locale)
      toast.success(t.success.settingsSaved, {
        description: `Language changed to ${locales.find(l => l.code === locale)?.nativeName}`,
      })
    } catch (error) {
      console.error('Failed to change language:', error)
      toast.error(t.errors.unknownError)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white rounded-lg transition-colors focus-ring"
            aria-label={t.common.back}
          >
            <ArrowLeft size={24} aria-hidden="true" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{t.settings.title}</h1>
        </div>

        <div className="space-y-6">
          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="text-amber-500" size={20} aria-hidden="true" />
                {t.settings.appearance}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset>
                <legend className="sr-only">{t.settings.theme}</legend>
                <div
                  className="grid grid-cols-3 gap-3"
                  role="radiogroup"
                  aria-label={t.settings.theme}
                >
                  {themeOptions.map((option) => {
                    const Icon = option.icon
                    const isSelected = theme === option.value
                    return (
                      <button
                        key={option.value}
                        onClick={() => setTheme(option.value as typeof theme)}
                        role="radio"
                        aria-checked={isSelected}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all focus-ring ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon
                          size={24}
                          className={isSelected ? 'text-blue-600' : 'text-gray-600'}
                          aria-hidden="true"
                        />
                        <span className={`text-sm font-medium ${isSelected ? 'text-blue-600' : 'text-gray-600'}`}>
                          {option.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="text-blue-500" size={20} aria-hidden="true" />
                {t.settings.notifications}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(notifications).map(([key, value]) => (
                <ToggleSwitch
                  key={key}
                  id={`${baseId}-${key}`}
                  label={notificationLabels[key] || key}
                  checked={value}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, [key]: checked }))
                  }
                />
              ))}
            </CardContent>
          </Card>

          {/* Language Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="text-green-500" size={20} aria-hidden="true" />
                {t.settings.language}
                {isLoading && (
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Translation Progress */}
              {isLoading && progress.status === 'translating' && (
                <div className="mb-4 p-3 bg-blue-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-blue-700">{progress.message}</span>
                    <span className="text-sm font-medium text-blue-700">{Math.round(progress.progress)}%</span>
                  </div>
                  <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Language Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {locales.map((locale) => {
                  const isActive = locale.code === currentLocale
                  return (
                    <button
                      key={locale.code}
                      onClick={() => handleLanguageChange(locale.code)}
                      disabled={isLoading}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all focus-ring text-left ${
                        isActive
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      aria-pressed={isActive}
                    >
                      <span className="text-xl" aria-hidden="true">{locale.flag}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                          {locale.nativeName}
                        </p>
                        <p className={`text-xs truncate ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                          {locale.name}
                        </p>
                      </div>
                      {isActive && (
                        <Check size={16} className="text-blue-600 flex-shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Info text */}
              <p className="mt-4 text-xs text-gray-500 text-center">
                Any language can be used. AI translates new languages automatically and caches them for future use.
              </p>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="text-purple-500" size={20} aria-hidden="true" />
                {t.settings.security}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors focus-ring">
                <div className="flex items-center gap-3">
                  <Key size={20} className="text-gray-600" aria-hidden="true" />
                  <span className="text-gray-700">{t.settings.changePassword}</span>
                </div>
                <ChevronRight size={20} className="text-gray-400" aria-hidden="true" />
              </button>
              <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors focus-ring">
                <div className="flex items-center gap-3">
                  <Shield size={20} className="text-gray-600" aria-hidden="true" />
                  <span className="text-gray-700">{t.settings.twoFactor}</span>
                </div>
                <ChevronRight size={20} className="text-gray-400" aria-hidden="true" />
              </button>
            </CardContent>
          </Card>

          {/* Admin Panel Link */}
          {onNavigateToAdmin && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <button
                  onClick={onNavigateToAdmin}
                  className="w-full flex items-center justify-between p-4 bg-white rounded-xl hover:shadow-md transition-all focus-ring"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Shield className="text-purple-600" size={20} aria-hidden="true" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">{t.settings.adminPanel}</p>
                      <p className="text-sm text-gray-500">{t.settings.adminDescription}</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-400" aria-hidden="true" />
                </button>
              </CardContent>
            </Card>
          )}

          {/* Sign Out */}
          <Button variant="outline" className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onBack}>
            <LogOut size={18} aria-hidden="true" />
            {t.nav.signOut}
          </Button>
        </div>
      </div>
    </div>
  )
}
