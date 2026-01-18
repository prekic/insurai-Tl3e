/**
 * Config Tab
 * Application configuration and feature flags management
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Settings,
  Save,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Check,
} from 'lucide-react'

interface AppConfig {
  id: string
  category: string
  key: string
  value: unknown
  type: string
  description: string
}

interface FeatureFlag {
  id: string
  name: string
  description: string
  enabled: boolean
  enabledPercentage?: number
}

export function ConfigTab() {
  const [configs, setConfigs] = useState<AppConfig[]>([])
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [configsRes, flagsRes] = await Promise.all([
        fetch('/api/admin/config'),
        fetch('/api/admin/feature-flags'),
      ])

      const configsData = await configsRes.json()
      const flagsData = await flagsRes.json()

      if (configsData.success) setConfigs(configsData.data)
      if (flagsData.success) setFeatureFlags(flagsData.data)
    } catch (error) {
      console.error('Failed to fetch config:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfig = async (id: string, value: unknown) => {
    try {
      const response = await fetch(`/api/admin/config/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })

      if (response.ok) {
        setConfigs(configs.map((c) => (c.id === id ? { ...c, value } : c)))
        setEditingConfig(null)
        setSavedIds((prev) => new Set([...prev, id]))
        setTimeout(() => {
          setSavedIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        }, 2000)
      }
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  const toggleFeatureFlag = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/admin/feature-flags/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })

      if (response.ok) {
        setFeatureFlags(featureFlags.map((f) => (f.id === id ? { ...f, enabled: !enabled } : f)))
      }
    } catch (error) {
      console.error('Failed to toggle feature flag:', error)
    }
  }

  const groupedConfigs = configs.reduce(
    (acc, config) => {
      if (!acc[config.category]) acc[config.category] = []
      acc[config.category].push(config)
      return acc
    },
    {} as Record<string, AppConfig[]>
  )

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      ai: 'AI Configuration',
      rate_limits: 'Rate Limits',
      security: 'Security',
      features: 'Features',
      ui: 'UI Settings',
      notifications: 'Notifications',
      system: 'System',
    }
    return labels[category] || category
  }

  const renderConfigValue = (config: AppConfig) => {
    if (editingConfig === config.id) {
      return (
        <div className="flex gap-2">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-40"
          />
          <Button
            size="sm"
            onClick={() => {
              let value: unknown = editValue
              if (config.type === 'number') value = Number(editValue)
              if (config.type === 'boolean') value = editValue === 'true'
              if (config.type === 'json') value = JSON.parse(editValue)
              saveConfig(config.id, value)
            }}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditingConfig(null)}>
            Cancel
          </Button>
        </div>
      )
    }

    if (config.type === 'boolean') {
      return (
        <button
          onClick={() => saveConfig(config.id, !config.value)}
          className={`p-1 rounded ${config.value ? 'text-green-600' : 'text-gray-400'}`}
        >
          {config.value ? (
            <ToggleRight className="h-6 w-6" />
          ) : (
            <ToggleLeft className="h-6 w-6" />
          )}
        </button>
      )
    }

    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
          {typeof config.value === 'object'
            ? JSON.stringify(config.value)
            : String(config.value)}
        </span>
        {savedIds.has(config.id) ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditingConfig(config.id)
              setEditValue(
                typeof config.value === 'object'
                  ? JSON.stringify(config.value)
                  : String(config.value)
              )
            }}
          >
            Edit
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
          <p className="text-gray-500">Manage application settings and feature flags</p>
        </div>
        <Button onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>Enable or disable features</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4 text-gray-500">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {featureFlags.map((flag) => (
                <div
                  key={flag.id}
                  className={`p-4 rounded-lg border ${
                    flag.enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{flag.name}</span>
                        {flag.enabledPercentage !== undefined && flag.enabledPercentage < 100 && (
                          <Badge variant="outline">{flag.enabledPercentage}% rollout</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{flag.description}</p>
                    </div>
                    <button
                      onClick={() => toggleFeatureFlag(flag.id, flag.enabled)}
                      className={`p-1 rounded ${flag.enabled ? 'text-green-600' : 'text-gray-400'}`}
                    >
                      {flag.enabled ? (
                        <ToggleRight className="h-8 w-8" />
                      ) : (
                        <ToggleLeft className="h-8 w-8" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration by Category */}
      {Object.entries(groupedConfigs).map(([category, categoryConfigs]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {getCategoryLabel(category)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryConfigs.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <div className="font-medium">{config.key}</div>
                    <div className="text-sm text-gray-500">{config.description}</div>
                  </div>
                  {renderConfigValue(config)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default ConfigTab
