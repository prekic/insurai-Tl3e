/**
 * Settings Tab
 * Comprehensive settings management with specialized panels for each category
 */

import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '@/lib/admin/api'
import { Button } from '@/components/ui/button'
import {
  Brain,
  Gauge,
  Timer,
  Eye,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Sliders,
  History,
} from 'lucide-react'

// Sub-panels
import { AISettingsPanel } from './settings/AISettingsPanel'
import { EvaluationSettingsPanel } from './settings/EvaluationSettingsPanel'
import { RateLimitsPanel } from './settings/RateLimitsPanel'
import { OCRSettingsPanel } from './settings/OCRSettingsPanel'
import { FeatureFlagsPanel } from './settings/FeatureFlagsPanel'
import { SettingsHistoryPanel } from './settings/SettingsHistoryPanel'

type SettingsCategory = 'ai' | 'evaluation' | 'rate_limits' | 'ocr' | 'feature_flags' | 'history'

interface CategoryConfig {
  id: SettingsCategory
  label: string
  description: string
  icon: React.ReactNode
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: 'ai',
    label: 'AI Settings',
    description: 'Configure AI providers, models, and extraction settings',
    icon: <Brain className="h-5 w-5" />,
  },
  {
    id: 'evaluation',
    label: 'Policy Evaluation',
    description: 'Scoring weights, grade thresholds, and evaluation rules',
    icon: <Gauge className="h-5 w-5" />,
  },
  {
    id: 'rate_limits',
    label: 'Rate Limits',
    description: 'API rate limiting and quota management',
    icon: <Timer className="h-5 w-5" />,
  },
  {
    id: 'ocr',
    label: 'OCR Settings',
    description: 'OCR confidence thresholds and quality settings',
    icon: <Eye className="h-5 w-5" />,
  },
  {
    id: 'feature_flags',
    label: 'Feature Flags',
    description: 'Enable or disable features and manage rollouts',
    icon: <Sliders className="h-5 w-5" />,
  },
  {
    id: 'history',
    label: 'History',
    description: 'View audit log of all settings changes',
    icon: <History className="h-5 w-5" />,
  },
]

export interface SettingValue {
  key: string
  value: unknown
  valueType: string
  description: string
  defaultValue?: unknown
  validationSchema?: unknown
}

export interface SettingsData {
  [category: string]: SettingValue[]
}

export function SettingsTab() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('ai')
  const [settings, setSettings] = useState<SettingsData>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Fetch settings for all categories
      const categories = ['ai', 'evaluation', 'rate_limits', 'ocr']
      const responses = await Promise.all(
        categories.map((cat) => adminFetch(`/api/admin/settings/${cat}`))
      )

      const data: SettingsData = {}
      for (let i = 0; i < categories.length; i++) {
        const json = await responses[i].json()
        if (json.success && json.data?.settings) {
          // API returns { data: { category, settings: [...] } }
          data[categories[i]] = json.data.settings
        } else if (json.success && Array.isArray(json.data)) {
          // Fallback if API returns array directly
          data[categories[i]] = json.data
        }
      }

      setSettings(data)
    } catch (err) {
      console.error('Failed to fetch settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch settings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateSetting = async (category: string, key: string, value: unknown, reason?: string) => {
    setIsSaving(true)
    setError(null)
    try {
      const response = await adminFetch(`/api/admin/settings/${category}/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, reason }),
      })

      const data = await response.json()
      if (data.success) {
        // Update local state
        setSettings((prev) => ({
          ...prev,
          [category]: prev[category]?.map((s) =>
            s.key === key ? { ...s, value } : s
          ) || [],
        }))
        setSuccessMessage(`Setting "${key}" updated successfully`)
        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        setError(data.error || 'Failed to update setting')
      }
    } catch (err) {
      console.error('Failed to update setting:', err)
      setError(err instanceof Error ? err.message : 'Failed to update setting')
    } finally {
      setIsSaving(false)
    }
  }

  const renderPanel = () => {
    const categorySettings = settings[activeCategory] || []

    switch (activeCategory) {
      case 'ai':
        return (
          <AISettingsPanel
            settings={categorySettings}
            onUpdate={(key, value, reason) => updateSetting('ai', key, value, reason)}
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )
      case 'evaluation':
        return (
          <EvaluationSettingsPanel
            settings={categorySettings}
            onUpdate={(key, value, reason) => updateSetting('evaluation', key, value, reason)}
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )
      case 'rate_limits':
        return (
          <RateLimitsPanel
            settings={categorySettings}
            onUpdate={(key, value, reason) => updateSetting('rate_limits', key, value, reason)}
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )
      case 'ocr':
        return (
          <OCRSettingsPanel
            settings={categorySettings}
            onUpdate={(key, value, reason) => updateSetting('ocr', key, value, reason)}
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )
      case 'feature_flags':
        return <FeatureFlagsPanel />
      case 'history':
        return <SettingsHistoryPanel />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500">Configure application behavior and thresholds</p>
        </div>
        <Button onClick={fetchSettings} disabled={isLoading || isSaving}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Category Navigation */}
      <nav aria-label="Settings categories">
        <div className="flex overflow-x-auto pb-2 -mx-1 px-1 gap-2 scrollbar-hide md:flex-wrap md:overflow-visible">
          {CATEGORIES.map((category) => (
            <Button
              key={category.id}
              variant={activeCategory === category.id ? 'default' : 'outline'}
              onClick={() => setActiveCategory(category.id)}
              className="flex items-center gap-2 whitespace-nowrap flex-shrink-0"
              aria-pressed={activeCategory === category.id}
              aria-label={`${category.label}: ${category.description}`}
            >
              {category.icon}
              <span className="hidden sm:inline">{category.label}</span>
              <span className="sm:hidden">{category.label.split(' ')[0]}</span>
            </Button>
          ))}
        </div>
      </nav>

      {/* Active Panel */}
      <div className="min-h-[400px]">{renderPanel()}</div>
    </div>
  )
}

export default SettingsTab
