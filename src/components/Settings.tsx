import { useState, useId, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Moon,
  Sun,
  Bell,
  Shield,
  Globe,
  Key,
  LogOut,
  ChevronRight,
  Monitor,
  Loader2,
  Check,
  Eye,
  EyeOff,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { ConfirmationDialog, confirmations } from './ui/confirmation-dialog'
import { useI18n, useLanguageSelector } from '@/lib/i18n'
import { usePolicies } from '@/lib/policy-context'
import { exportToCSV, exportPoliciesToPDF } from '@/lib/export'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuth } from '@/lib/supabase/auth-context'

// Local storage keys
const STORAGE_KEYS = {
  OPENAI: 'insurai_openai_key',
  ANTHROPIC: 'insurai_anthropic_key',
  GOOGLE_CLOUD: 'insurai_google_cloud_key',
  THEME: 'insurai_theme',
  NOTIFICATIONS: 'insurai_notifications',
} as const

// For backwards compatibility
const API_KEY_STORAGE = {
  OPENAI: STORAGE_KEYS.OPENAI,
  ANTHROPIC: STORAGE_KEYS.ANTHROPIC,
  GOOGLE_CLOUD: STORAGE_KEYS.GOOGLE_CLOUD,
} as const

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

// API Key Input Component
interface APIKeyInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  onSave: () => void
  onClear: () => void
  isConfigured: boolean
}

function APIKeyInput({ label, value, onChange, placeholder, onSave, onClear, isConfigured }: APIKeyInputProps) {
  const [showKey, setShowKey] = useState(false)
  const [isEditing, setIsEditing] = useState(!isConfigured)

  const maskedValue = value ? '•'.repeat(Math.min(value.length, 40)) + value.slice(-4) : ''

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {isConfigured && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check size={12} />
            Configured
          </span>
        )}
      </div>

      {isEditing ? (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <Button
            size="sm"
            onClick={() => {
              onSave()
              setIsEditing(false)
            }}
            disabled={!value.trim()}
          >
            Save
          </Button>
          {isConfigured && (
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-gray-100 rounded-lg font-mono text-sm text-gray-600 truncate">
            {maskedValue || 'Not configured'}
          </div>
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
          {isConfigured && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onClear}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

type ThemeOption = 'light' | 'dark' | 'system'

interface NotificationSettings {
  email: boolean
  push: boolean
  renewalReminders: boolean
  marketUpdates: boolean
}

const defaultNotifications: NotificationSettings = {
  email: true,
  push: true,
  renewalReminders: true,
  marketUpdates: false,
}

export function Settings() {
  const navigate = useNavigate()
  const { t, isRTL } = useI18n()
  const { currentLocale, locales, setLocale, isLoading, progress } = useLanguageSelector()
  const { policies, clearAllPolicies } = usePolicies()
  const { user, signOut } = useAuth()

  // Load theme from localStorage
  const [theme, setTheme] = useState<ThemeOption>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME)
    return (saved as ThemeOption) || 'light'
  })

  // Load notifications from localStorage
  const [notifications, setNotifications] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)
    if (saved) {
      try {
        return { ...defaultNotifications, ...JSON.parse(saved) }
      } catch {
        return defaultNotifications
      }
    }
    return defaultNotifications
  })

  const baseId = useId()

  // Confirmation dialog states
  const [showClearDataDialog, setShowClearDataDialog] = useState(false)
  const [showSignOutDialog, setShowSignOutDialog] = useState(false)
  const [showRemoveApiKeyDialog, setShowRemoveApiKeyDialog] = useState<string | null>(null)

  // Save theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.THEME, theme)
    // Apply theme to document (for future dark mode implementation)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Save notifications to localStorage when they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications))
  }, [notifications])

  // API Key state
  const [openaiKey, setOpenaiKey] = useState('')
  const [openaiConfigured, setOpenaiConfigured] = useState(false)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [anthropicConfigured, setAnthropicConfigured] = useState(false)
  const [googleCloudKey, setGoogleCloudKey] = useState('')
  const [googleCloudConfigured, setGoogleCloudConfigured] = useState(false)

  // Load saved API keys on mount
  useEffect(() => {
    // OpenAI
    const savedOpenai = localStorage.getItem(API_KEY_STORAGE.OPENAI)
    if (savedOpenai) {
      setOpenaiKey(savedOpenai)
      setOpenaiConfigured(true)
    }
    const envOpenai = import.meta.env.VITE_OPENAI_API_KEY
    if (envOpenai && envOpenai !== 'sk-...') {
      setOpenaiConfigured(true)
    }

    // Anthropic
    const savedAnthropic = localStorage.getItem(API_KEY_STORAGE.ANTHROPIC)
    if (savedAnthropic) {
      setAnthropicKey(savedAnthropic)
      setAnthropicConfigured(true)
    }
    const envAnthropic = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (envAnthropic && envAnthropic !== 'sk-ant-...') {
      setAnthropicConfigured(true)
    }

    // Google Cloud
    const savedGoogle = localStorage.getItem(API_KEY_STORAGE.GOOGLE_CLOUD)
    if (savedGoogle) {
      setGoogleCloudKey(savedGoogle)
      setGoogleCloudConfigured(true)
    }
    const envGoogle = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY
    if (envGoogle) {
      setGoogleCloudConfigured(true)
    }
  }, [])

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
        description: `Language changed to ${locales.find((l) => l.code === locale)?.nativeName}`,
      })
    } catch (error) {
      console.error('Failed to change language:', error)
      toast.error(t.errors.unknownError)
    }
  }

  const handleSaveOpenAIKey = () => {
    if (openaiKey.trim()) {
      localStorage.setItem(API_KEY_STORAGE.OPENAI, openaiKey.trim())
      setOpenaiConfigured(true)
      toast.success('OpenAI API key saved', {
        description: 'AI-powered extraction is now enabled.',
      })
    }
  }

  const handleClearOpenAIKey = () => {
    setShowRemoveApiKeyDialog('openai')
  }

  const confirmClearOpenAIKey = () => {
    localStorage.removeItem(API_KEY_STORAGE.OPENAI)
    setOpenaiKey('')
    setOpenaiConfigured(false)
    toast.success('OpenAI API key removed')
    setShowRemoveApiKeyDialog(null)
  }

  const handleSaveAnthropicKey = () => {
    if (anthropicKey.trim()) {
      localStorage.setItem(API_KEY_STORAGE.ANTHROPIC, anthropicKey.trim())
      setAnthropicConfigured(true)
      toast.success('Claude API key saved', {
        description: 'Multi-model consensus is now available.',
      })
    }
  }

  const handleClearAnthropicKey = () => {
    setShowRemoveApiKeyDialog('anthropic')
  }

  const confirmClearAnthropicKey = () => {
    localStorage.removeItem(API_KEY_STORAGE.ANTHROPIC)
    setAnthropicKey('')
    setAnthropicConfigured(false)
    toast.success('Claude API key removed')
    setShowRemoveApiKeyDialog(null)
  }

  const handleSaveGoogleCloudKey = () => {
    if (googleCloudKey.trim()) {
      localStorage.setItem(API_KEY_STORAGE.GOOGLE_CLOUD, googleCloudKey.trim())
      setGoogleCloudConfigured(true)
      toast.success('Google Cloud API key saved', {
        description: 'OCR for scanned documents is now enabled.',
      })
    }
  }

  const handleClearGoogleCloudKey = () => {
    setShowRemoveApiKeyDialog('google')
  }

  const confirmClearGoogleCloudKey = () => {
    localStorage.removeItem(API_KEY_STORAGE.GOOGLE_CLOUD)
    setGoogleCloudKey('')
    setGoogleCloudConfigured(false)
    toast.success('Google Cloud API key removed')
    setShowRemoveApiKeyDialog(null)
  }

  const handleExportCSV = () => {
    if (policies.length === 0) {
      toast.error('No policies to export')
      return
    }
    exportToCSV(policies, 'insurai-policies')
    toast.success('Policies exported', {
      description: `${policies.length} policies exported to CSV`,
    })
  }

  const handleExportPDF = () => {
    if (policies.length === 0) {
      toast.error('No policies to export')
      return
    }
    exportPoliciesToPDF(policies, 'Insurance Portfolio Report')
    toast.success('PDF report generated', {
      description: 'Print dialog will open to save as PDF',
    })
  }

  const handleClearData = () => {
    setShowClearDataDialog(true)
  }

  const confirmClearData = async () => {
    await clearAllPolicies()
    toast.success('All data cleared', {
      description: 'Your policies have been removed.',
    })
    setShowClearDataDialog(false)
  }

  const handleSignOut = () => {
    setShowSignOutDialog(true)
  }

  const confirmSignOut = async () => {
    try {
      await signOut()
      navigate('/')
    } catch {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 sm:mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white rounded-lg transition-colors focus-ring"
            aria-label={t.common.back}
          >
            <ArrowLeft size={24} aria-hidden="true" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t.settings.title}</h1>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* AI Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="text-purple-500" size={20} aria-hidden="true" />
                AI Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* OpenAI */}
              <div className="space-y-2">
                <APIKeyInput
                  label="OpenAI API Key (GPT-4)"
                  value={openaiKey}
                  onChange={setOpenaiKey}
                  placeholder="sk-proj-..."
                  onSave={handleSaveOpenAIKey}
                  onClear={handleClearOpenAIKey}
                  isConfigured={openaiConfigured}
                />
                <p className="text-xs text-gray-500">
                  Primary AI for document extraction.{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Get key
                  </a>
                </p>
              </div>

              {/* Anthropic */}
              <div className="space-y-2">
                <APIKeyInput
                  label="Claude API Key (Anthropic)"
                  value={anthropicKey}
                  onChange={setAnthropicKey}
                  placeholder="sk-ant-..."
                  onSave={handleSaveAnthropicKey}
                  onClear={handleClearAnthropicKey}
                  isConfigured={anthropicConfigured}
                />
                <p className="text-xs text-gray-500">
                  Backup AI for multi-model consensus.{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Get key
                  </a>
                </p>
              </div>

              {/* Google Cloud */}
              <div className="space-y-2">
                <APIKeyInput
                  label="Google Cloud API Key (OCR)"
                  value={googleCloudKey}
                  onChange={setGoogleCloudKey}
                  placeholder="AIza..."
                  onSave={handleSaveGoogleCloudKey}
                  onClear={handleClearGoogleCloudKey}
                  isConfigured={googleCloudConfigured}
                />
                <p className="text-xs text-gray-500">
                  For scanned document OCR.{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Get key
                  </a>
                </p>
              </div>

              {/* AI Status Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${openaiConfigured || anthropicConfigured ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-700">
                    Extraction: <strong>{openaiConfigured || anthropicConfigured ? 'On' : 'Demo'}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${openaiConfigured && anthropicConfigured ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-700">
                    Consensus: <strong>{openaiConfigured && anthropicConfigured ? 'On' : 'Off'}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${googleCloudConfigured ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-700">
                    OCR: <strong>{googleCloudConfigured ? 'On' : 'Off'}</strong>
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                API keys are stored locally and never sent to our servers.
              </p>
            </CardContent>
          </Card>

          {/* Data & Export */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="text-indigo-500" size={20} aria-hidden="true" />
                Data & Export
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Export buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="outline" className="justify-start gap-2" onClick={handleExportCSV}>
                  <FileSpreadsheet size={18} className="text-green-600" />
                  Export to Excel (CSV)
                </Button>
                <Button variant="outline" className="justify-start gap-2" onClick={handleExportPDF}>
                  <FileText size={18} className="text-red-600" />
                  Export to PDF
                </Button>
              </div>

              <p className="text-xs text-gray-500">
                Export your {policies.length} policies to Excel or PDF format for backup or sharing.
              </p>

              {/* Storage info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <Database size={16} className="text-gray-500" />
                  <span className="text-sm text-gray-700">
                    Storage: <strong>{isSupabaseConfigured() ? 'Cloud (Supabase)' : 'Local Browser'}</strong>
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 w-full sm:w-auto"
                  onClick={handleClearData}
                >
                  <Trash2 size={14} className="mr-1" />
                  Clear All Data
                </Button>
              </div>
            </CardContent>
          </Card>

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
                <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label={t.settings.theme}>
                  {themeOptions.map((option) => {
                    const Icon = option.icon
                    const isSelected = theme === option.value
                    return (
                      <button
                        key={option.value}
                        onClick={() => setTheme(option.value as typeof theme)}
                        role="radio"
                        aria-checked={isSelected}
                        className={`flex flex-col items-center gap-1 sm:gap-2 p-3 sm:p-4 rounded-xl border-2 transition-all focus-ring ${
                          isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon
                          size={20}
                          className={isSelected ? 'text-blue-600' : 'text-gray-600'}
                          aria-hidden="true"
                        />
                        <span
                          className={`text-xs sm:text-sm font-medium ${isSelected ? 'text-blue-600' : 'text-gray-600'}`}
                        >
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
                  onChange={(checked) => setNotifications((prev) => ({ ...prev, [key]: checked }))}
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
                {isLoading && <Loader2 size={16} className="animate-spin text-blue-500" />}
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
                      className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl border-2 transition-all focus-ring text-left ${
                        isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      aria-pressed={isActive}
                    >
                      <span className="text-lg sm:text-xl" aria-hidden="true">
                        {locale.flag}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs sm:text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}
                        >
                          {locale.nativeName}
                        </p>
                        <p className={`text-xs truncate hidden sm:block ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                          {locale.name}
                        </p>
                      </div>
                      {isActive && <Check size={14} className="text-blue-600 flex-shrink-0" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>

              {/* Info text */}
              <p className="mt-4 text-xs text-gray-500 text-center">
                Any language can be used. AI translates new languages automatically.
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
              <button className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-gray-50 rounded-xl transition-colors focus-ring">
                <div className="flex items-center gap-3">
                  <Key size={18} className="text-gray-600" aria-hidden="true" />
                  <span className="text-sm sm:text-base text-gray-700">{t.settings.changePassword}</span>
                </div>
                <ChevronRight size={18} className="text-gray-400" aria-hidden="true" />
              </button>
              <button className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-gray-50 rounded-xl transition-colors focus-ring">
                <div className="flex items-center gap-3">
                  <Shield size={18} className="text-gray-600" aria-hidden="true" />
                  <span className="text-sm sm:text-base text-gray-700">{t.settings.twoFactor}</span>
                </div>
                <ChevronRight size={18} className="text-gray-400" aria-hidden="true" />
              </button>
            </CardContent>
          </Card>

          {/* Account Info */}
          {user && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="text-gray-500" size={20} aria-hidden="true" />
                  Account
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                    <p className="text-xs text-gray-500">Signed in</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sign Out */}
          <Button
            variant="outline"
            className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleSignOut}
          >
            <LogOut size={18} aria-hidden="true" />
            {t.nav.signOut}
          </Button>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={showClearDataDialog}
        onClose={() => setShowClearDataDialog(false)}
        onConfirm={confirmClearData}
        {...confirmations.clearAllData}
      />

      <ConfirmationDialog
        isOpen={showSignOutDialog}
        onClose={() => setShowSignOutDialog(false)}
        onConfirm={confirmSignOut}
        {...confirmations.signOut}
      />

      <ConfirmationDialog
        isOpen={showRemoveApiKeyDialog === 'openai'}
        onClose={() => setShowRemoveApiKeyDialog(null)}
        onConfirm={confirmClearOpenAIKey}
        title="Remove OpenAI API Key"
        description="Are you sure you want to remove the OpenAI API key? AI-powered extraction will be disabled until you add a new key."
        confirmText="Remove Key"
        variant="warning"
      />

      <ConfirmationDialog
        isOpen={showRemoveApiKeyDialog === 'anthropic'}
        onClose={() => setShowRemoveApiKeyDialog(null)}
        onConfirm={confirmClearAnthropicKey}
        title="Remove Claude API Key"
        description="Are you sure you want to remove the Claude API key? Multi-model consensus will be disabled until you add a new key."
        confirmText="Remove Key"
        variant="warning"
      />

      <ConfirmationDialog
        isOpen={showRemoveApiKeyDialog === 'google'}
        onClose={() => setShowRemoveApiKeyDialog(null)}
        onConfirm={confirmClearGoogleCloudKey}
        title="Remove Google Cloud API Key"
        description="Are you sure you want to remove the Google Cloud API key? OCR for scanned documents will be disabled until you add a new key."
        confirmText="Remove Key"
        variant="warning"
      />
    </div>
  )
}
