/**
 * Generic Settings Panel
 * Renders any category's settings as editable key-value fields.
 * Used for simpler categories (FX, Server/Cache, Webhooks, Cost) that
 * don't need custom layout like AI or Evaluation panels.
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SettingsSkeleton } from '@/components/ui/loading'
import { Save, AlertCircle, RotateCcw } from 'lucide-react'
import type { SettingValue } from '../SettingsTab'

interface SettingGroup {
  title: string
  description: string
  keys: string[]
}

interface GenericSettingsPanelProps {
  settings: SettingValue[]
  onUpdate: (key: string, value: unknown, reason?: string) => Promise<void>
  isLoading: boolean
  isSaving: boolean
  title: string
  description: string
  groups?: SettingGroup[]
  /** Friendly display names for keys */
  keyLabels?: Record<string, string>
  /** Descriptions per key */
  keyDescriptions?: Record<string, string>
}

// Friendly labels for common settings
const DEFAULT_KEY_LABELS: Record<string, string> = {
  // FX
  server_cache_ttl_ms: 'Server Cache TTL (ms)',
  supported_currencies: 'Supported Currencies (JSON)',
  fallback_rates: 'Fallback Rates (JSON)',
  api_timeout_ms: 'API Timeout (ms)',
  client_cache_ttl_ms: 'Client Cache TTL (ms)',
  // Server/Cache
  db_query_timeout_ms: 'DB Query Timeout (ms)',
  config_cache_ttl_ms: 'Config Cache TTL (ms)',
  prompt_cache_ttl_ms: 'Prompt Cache TTL (ms)',
  translation_cache_ttl_ms: 'Translation Cache TTL (ms)',
  rate_limit_config_cache_ttl_ms: 'Rate Limit Config Cache TTL (ms)',
  // Webhooks
  max_delivery_attempts: 'Max Delivery Attempts',
  delivery_timeout_ms: 'Delivery Timeout (ms)',
  max_response_body_length: 'Max Response Body Length',
  // Cost
  token_pricing: 'Token Pricing (JSON)',
  // OCR Pipeline
  pdf_load_timeout_ms: 'PDF Load Timeout (ms)',
  max_worker_failures: 'Max Worker Failures',
  ocr_cleanup_timeout_ms: 'OCR Cleanup Timeout (ms)',
  // Monitoring Buffers
  extraction_buffer_size: 'Extraction Buffer Size',
  max_metrics_buffer_size: 'Max Metrics Buffer Size',
  max_alert_history: 'Max Alert History',
  max_response_times: 'Max Response Times',
  server_perf_max_events: 'Server Perf Max Events',
  server_perf_max_age_ms: 'Server Perf Max Age (ms)',
  // UI
  trial_expiry_ms: 'Trial Expiry (ms)',
}

const DEFAULT_KEY_DESCRIPTIONS: Record<string, string> = {
  server_cache_ttl_ms: 'How long FX rates are cached on the server (default: 6 hours)',
  supported_currencies: 'JSON array of supported currency symbols',
  fallback_rates: 'JSON object of fallback rates when API unavailable',
  api_timeout_ms: 'Timeout for FX API calls',
  client_cache_ttl_ms: 'How long FX rates are cached in the browser',
  db_query_timeout_ms: 'Timeout for Supabase config/prompt queries',
  config_cache_ttl_ms: 'Config service in-memory cache TTL',
  prompt_cache_ttl_ms: 'Prompt service in-memory cache TTL',
  translation_cache_ttl_ms: 'Translation service in-memory cache TTL',
  rate_limit_config_cache_ttl_ms: 'Rate limit config cache TTL',
  max_delivery_attempts: 'Max webhook delivery retry attempts',
  delivery_timeout_ms: 'Webhook HTTP request timeout',
  max_response_body_length: 'Max chars to capture from webhook response',
  token_pricing: 'JSON object mapping model names to cost per 1K tokens',
  pdf_load_timeout_ms: 'PDF.js loading timeout',
  max_worker_failures: 'Max PDF.js worker failures before forcing fake worker',
  ocr_cleanup_timeout_ms: 'LLM OCR cleanup timeout',
  extraction_buffer_size: 'In-memory extraction metrics ring buffer size',
  max_metrics_buffer_size: 'Max monitoring metrics buffer size',
  max_alert_history: 'Max alert history entries retained',
  max_response_times: 'Max response time samples retained',
  server_perf_max_events: 'Max server perf tracking events',
  server_perf_max_age_ms: 'Server perf events max age',
  trial_expiry_ms: 'Free trial session duration (default: 24 hours)',
}

export function GenericSettingsPanel({
  settings,
  onUpdate,
  isLoading,
  isSaving,
  title,
  description,
  groups,
  keyLabels = {},
  keyDescriptions = {},
}: GenericSettingsPanelProps) {
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())

  // Initialize edit values from settings
  useEffect(() => {
    const vals: Record<string, string> = {}
    for (const s of settings) {
      const v = s.value
      vals[s.key] = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '')
    }
    setEditValues(vals)
    setDirtyKeys(new Set())
  }, [settings])

  if (isLoading) return <SettingsSkeleton />

  const getLabel = (key: string) =>
    keyLabels[key] ||
    DEFAULT_KEY_LABELS[key] ||
    key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  const getDescription = (key: string) =>
    keyDescriptions[key] || DEFAULT_KEY_DESCRIPTIONS[key] || ''

  const handleChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }))
    const original = settings.find((s) => s.key === key)
    const origStr =
      typeof original?.value === 'object'
        ? JSON.stringify(original.value, null, 2)
        : String(original?.value ?? '')
    if (value !== origStr) {
      setDirtyKeys((prev) => new Set(prev).add(key))
    } else {
      setDirtyKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const handleSave = async (key: string) => {
    const setting = settings.find((s) => s.key === key)
    const rawVal = editValues[key]
    let parsedVal: unknown = rawVal

    // Try to parse as number
    if (setting?.valueType === 'number' || /^\d+$/.test(rawVal)) {
      parsedVal = Number(rawVal)
    }
    // Try to parse as JSON for object types
    if (rawVal.startsWith('[') || rawVal.startsWith('{')) {
      try {
        parsedVal = JSON.parse(rawVal)
      } catch {
        // Keep as string if invalid JSON
      }
    }

    await onUpdate(key, parsedVal)
    setDirtyKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const handleReset = (key: string) => {
    const original = settings.find((s) => s.key === key)
    const origStr =
      typeof original?.value === 'object'
        ? JSON.stringify(original.value, null, 2)
        : String(original?.value ?? '')
    setEditValues((prev) => ({ ...prev, [key]: origStr }))
    setDirtyKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const renderSetting = (key: string) => {
    const setting = settings.find((s) => s.key === key)
    if (!setting) return null
    const isDirty = dirtyKeys.has(key)
    const value = editValues[key] ?? ''
    const isJsonField = value.startsWith('[') || value.startsWith('{')

    return (
      <div key={key} className="flex flex-col gap-1.5 rounded-lg border bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{getLabel(key)}</span>
            {isDirty && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                Modified
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isDirty && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReset(key)}
                  disabled={isSaving}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={() => handleSave(key)} disabled={isSaving}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
        {getDescription(key) && <p className="text-xs text-gray-500">{getDescription(key)}</p>}
        {isJsonField ? (
          <textarea
            className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            rows={4}
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        ) : (
          <Input
            type="text"
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            className="font-mono text-sm"
          />
        )}
      </div>
    )
  }

  const renderGroup = (group: SettingGroup) => {
    const groupSettings = group.keys.filter((k) => settings.some((s) => s.key === k))
    if (groupSettings.length === 0) return null
    return (
      <Card key={group.title}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{group.title}</CardTitle>
          <CardDescription>{group.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">{groupSettings.map(renderSetting)}</CardContent>
      </Card>
    )
  }

  if (settings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-gray-500">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p className="text-sm">No settings found for this category.</p>
          <p className="text-xs mt-1">Settings will appear here once seeded in the database.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      {groups ? (
        groups.map(renderGroup)
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-4">
            {settings.map((s) => renderSetting(s.key))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
