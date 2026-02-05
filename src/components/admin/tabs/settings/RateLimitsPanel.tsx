/**
 * Rate Limits Panel
 * Configure API rate limiting and quota management
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SettingsSkeleton } from '@/components/ui/loading'
import {
  validateSetting,
  getValidationDescription,
  type ValidationResult,
} from '@/lib/admin/settings-validation'
import {
  Timer,
  Save,
  Shield,
  MessageSquare,
  FileText,
  Eye,
  Activity,
  Info,
  Gauge,
  AlertCircle,
} from 'lucide-react'
import type { SettingValue } from '../SettingsTab'

interface RateLimitsPanelProps {
  settings: SettingValue[]
  onUpdate: (key: string, value: unknown, reason?: string) => Promise<void>
  isLoading: boolean
  isSaving: boolean
}

// Group settings by endpoint
const ENDPOINT_GROUPS = {
  chat: {
    title: 'Chat Endpoint',
    description: '/api/ai/chat - Policy chat conversations',
    icon: <MessageSquare className="h-5 w-5 text-blue-500" />,
    keys: ['chat_requests_per_hour', 'chat_window_ms'],
  },
  extraction: {
    title: 'Extraction Endpoints',
    description: '/api/ai/extract/* - Policy data extraction',
    icon: <FileText className="h-5 w-5 text-green-500" />,
    keys: ['extraction_requests_per_hour', 'extraction_window_ms'],
  },
  ocr: {
    title: 'OCR Endpoint',
    description: '/api/ai/ocr - Document OCR processing',
    icon: <Eye className="h-5 w-5 text-purple-500" />,
    keys: ['ocr_requests_per_hour', 'ocr_window_ms'],
  },
  health: {
    title: 'Health Endpoint',
    description: '/api/health - Server health checks',
    icon: <Activity className="h-5 w-5 text-orange-500" />,
    keys: ['health_requests_per_minute', 'health_window_ms'],
  },
}

export function RateLimitsPanel({
  settings,
  onUpdate,
  isLoading,
  isSaving,
}: RateLimitsPanelProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editReason, setEditReason] = useState('')
  const [validationError, setValidationError] = useState<ValidationResult | null>(null)

  const getSettingByKey = (key: string): SettingValue | undefined => {
    return settings.find((s) => s.key === key)
  }

  const handleEdit = (setting: SettingValue) => {
    setEditingKey(setting.key)
    setEditValue(String(setting.value))
    setEditReason('')
    setValidationError(null)
  }

  // Validate on value change
  useEffect(() => {
    if (editingKey && editValue !== '') {
      const result = validateSetting(editingKey, Number(editValue))
      setValidationError(result.valid ? null : result)
    }
  }, [editingKey, editValue])

  const handleSave = async (setting: SettingValue) => {
    const value = Number(editValue)

    // Final validation before save
    const result = validateSetting(setting.key, value)
    if (!result.valid) {
      setValidationError(result)
      return
    }

    await onUpdate(setting.key, value, editReason || undefined)
    setEditingKey(null)
    setValidationError(null)
  }

  const canSave = !validationError && editValue !== ''

  const formatValue = (key: string, value: number) => {
    if (key.includes('window_ms')) {
      const seconds = value / 1000
      if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} hours`
      if (seconds >= 60) return `${(seconds / 60).toFixed(0)} minutes`
      return `${seconds} seconds`
    }
    if (key.includes('per_hour')) return `${value} req/hour`
    if (key.includes('per_minute')) return `${value} req/min`
    return String(value)
  }

  const getUsageLevel = (requestsPerHour: number) => {
    if (requestsPerHour >= 100) return { level: 'high', color: 'text-red-600', bg: 'bg-red-100' }
    if (requestsPerHour >= 50) return { level: 'medium', color: 'text-yellow-600', bg: 'bg-yellow-100' }
    return { level: 'low', color: 'text-green-600', bg: 'bg-green-100' }
  }

  const renderSettingInput = (setting: SettingValue) => {
    const isEditing = editingKey === setting.key
    const validationHint = getValidationDescription(setting.key)

    if (isEditing) {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className={`w-32 ${validationError ? 'border-red-300 focus:ring-red-500' : ''}`}
              aria-invalid={!!validationError}
            />
            <span className="text-sm text-gray-500">
              {setting.key.includes('window_ms') ? 'ms' : 'requests'}
            </span>
          </div>
          {validationError && (
            <div className="flex items-center gap-1 text-red-600 text-xs">
              <AlertCircle className="h-3 w-3" />
              <span>{validationError.error}</span>
            </div>
          )}
          {validationHint && !validationError && (
            <div className="text-xs text-gray-500">{validationHint}</div>
          )}
          <Input
            placeholder="Reason for change"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleSave(setting)} disabled={isSaving || !canSave}>
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingKey(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )
    }

    const value = Number(setting.value)
    const isRequestLimit = setting.key.includes('per_hour') || setting.key.includes('per_minute')

    return (
      <div className="flex items-center gap-2">
        <span className={`font-mono px-3 py-1 rounded text-sm ${isRequestLimit ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
          {formatValue(setting.key, value)}
        </span>
        <Button size="sm" variant="ghost" onClick={() => handleEdit(setting)}>
          Edit
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return <SettingsSkeleton groups={5} itemsPerGroup={2} />
  }

  if (settings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Gauge className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">No Rate Limit Settings Found</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Run the database migration to seed default rate limiting configuration.
              </p>
            </div>
            <code className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 font-mono">
              npx supabase migration up
            </code>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            Rate Limiting Overview
          </CardTitle>
          <CardDescription>
            Rate limits protect the API from abuse and control AI costs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(ENDPOINT_GROUPS).map(([groupKey, group]) => {
              const requestSetting = settings.find((s) =>
                group.keys.some((k) => s.key === k && (k.includes('per_hour') || k.includes('per_minute')))
              )
              const requests = requestSetting ? Number(requestSetting.value) : 0
              const { level, color, bg } = getUsageLevel(requests)

              return (
                <div
                  key={groupKey}
                  className="p-4 border rounded-lg hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {group.icon}
                    <span className="font-medium text-sm">{group.title}</span>
                  </div>
                  <div className={`text-2xl font-bold ${color}`}>
                    {requests}
                  </div>
                  <div className="text-xs text-gray-500">
                    requests/{requestSetting?.key.includes('per_minute') ? 'min' : 'hr'}
                  </div>
                  <Badge variant="outline" className={`mt-2 ${bg} ${color} border-0`}>
                    {level} traffic
                  </Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Endpoint Settings */}
      {Object.entries(ENDPOINT_GROUPS).map(([groupKey, group]) => {
        const groupSettings = group.keys
          .map((key) => getSettingByKey(key))
          .filter((s): s is SettingValue => s !== undefined)

        if (groupSettings.length === 0) return null

        return (
          <Card key={groupKey}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {group.icon}
                {group.title}
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {groupSettings.map((setting) => (
                  <div
                    key={setting.key}
                    className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <div className="font-medium">
                        {setting.key
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </div>
                      <div className="text-sm text-gray-500">{setting.description}</div>
                    </div>
                    {renderSettingInput(setting)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-gray-500" />
            Global Rate Limit Settings
          </CardTitle>
          <CardDescription>Settings that apply across all endpoints</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {settings
              .filter(
                (s) =>
                  !Object.values(ENDPOINT_GROUPS).some((g) => g.keys.includes(s.key))
              )
              .map((setting) => (
                <div
                  key={setting.key}
                  className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <div className="font-medium">
                      {setting.key
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                    </div>
                    <div className="text-sm text-gray-500">{setting.description}</div>
                  </div>
                  {renderSettingInput(setting)}
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Info box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-blue-700">
        <Info className="h-5 w-5 mt-0.5" />
        <div className="text-sm">
          <strong>How rate limiting works:</strong> Each IP address has its own request counter.
          When a limit is exceeded, the API returns a 429 status code with a Retry-After header.
          The window resets after the configured time period.
        </div>
      </div>
    </div>
  )
}
