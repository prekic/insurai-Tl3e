/**
 * AI Settings Panel
 * Configure AI providers, models, temperatures, and extraction settings
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SettingsSkeleton } from '@/components/ui/loading'
import {
  Save,
  Sparkles,
  Thermometer,
  Clock,
  Zap,
  ToggleLeft,
  ToggleRight,
  FileQuestion,
} from 'lucide-react'
import type { SettingValue } from '../SettingsTab'

interface AISettingsPanelProps {
  settings: SettingValue[]
  onUpdate: (key: string, value: unknown, reason?: string) => Promise<void>
  isLoading: boolean
  isSaving: boolean
}

// Group settings by function
const SETTING_GROUPS = {
  models: {
    title: 'AI Models',
    description: 'Configure which models to use for extraction and chat',
    keys: [
      'openai_extraction_model',
      'openai_backup_model',
      'anthropic_extraction_model',
      'anthropic_backup_model',
    ],
  },
  parameters: {
    title: 'Model Parameters',
    description: 'Fine-tune model behavior',
    keys: ['temperature', 'chat_temperature', 'max_tokens', 'min_confidence'],
  },
  timeouts: {
    title: 'Timeouts & Limits',
    description: 'Control extraction timing and resource usage',
    keys: ['extraction_timeout_ms', 'max_retries', 'retry_delay_ms'],
  },
  fallback: {
    title: 'Fallback & Consensus',
    description: 'Configure provider fallback and multi-provider consensus',
    keys: [
      'preferred_provider',
      'enable_fallback',
      'consensus_enabled',
      'consensus_agreement_threshold',
    ],
  },
}

const MODEL_OPTIONS = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
  ],
}

export function AISettingsPanel({ settings, onUpdate, isLoading, isSaving }: AISettingsPanelProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editReason, setEditReason] = useState<string>('')

  const getSettingByKey = (key: string): SettingValue | undefined => {
    return settings.find((s) => s.key === key)
  }

  const handleEdit = (setting: SettingValue) => {
    setEditingKey(setting.key)
    setEditValue(String(setting.value))
    setEditReason('')
  }

  const handleSave = async (setting: SettingValue) => {
    let value: unknown = editValue
    if (setting.valueType === 'number') value = Number(editValue)
    if (setting.valueType === 'boolean') value = editValue === 'true'
    await onUpdate(setting.key, value, editReason || undefined)
    setEditingKey(null)
  }

  const handleToggle = async (setting: SettingValue) => {
    await onUpdate(setting.key, !setting.value, 'Toggled via admin panel')
  }

  const renderSettingInput = (setting: SettingValue) => {
    const isEditing = editingKey === setting.key

    // Boolean toggle
    if (setting.valueType === 'boolean') {
      const keyLabel = setting.key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
      return (
        <button
          onClick={() => handleToggle(setting)}
          disabled={isSaving}
          className={`p-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            setting.value ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-500'
          }`}
          role="switch"
          aria-checked={setting.value as boolean}
          aria-label={`${keyLabel}: ${setting.value ? 'Enabled' : 'Disabled'}`}
        >
          {setting.value ? (
            <ToggleRight className="h-7 w-7" />
          ) : (
            <ToggleLeft className="h-7 w-7" />
          )}
        </button>
      )
    }

    // Model selection dropdown
    if (setting.key.includes('model')) {
      const isOpenAI = setting.key.includes('openai')
      const options = isOpenAI ? MODEL_OPTIONS.openai : MODEL_OPTIONS.anthropic

      if (isEditing) {
        return (
          <div className="flex flex-col gap-2">
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              {options.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <Input
              placeholder="Reason for change (optional)"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSave(setting)} disabled={isSaving}>
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

      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            {String(setting.value)}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => handleEdit(setting)}>
            Change
          </Button>
        </div>
      )
    }

    // Number input with slider for temperatures
    if (setting.key.includes('temperature')) {
      if (isEditing) {
        return (
          <div className="flex flex-col gap-2 w-64">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1"
              />
              <span className="font-mono text-sm w-12">{editValue}</span>
            </div>
            <Input
              placeholder="Reason for change"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSave(setting)} disabled={isSaving}>
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

      const tempValue = Number(setting.value)
      const tempColor =
        tempValue < 0.3 ? 'text-blue-600' : tempValue < 0.7 ? 'text-yellow-600' : 'text-red-600'

      return (
        <div className="flex items-center gap-2">
          <Thermometer className={`h-4 w-4 ${tempColor}`} />
          <span className={`font-mono ${tempColor}`}>{String(setting.value)}</span>
          <Button size="sm" variant="ghost" onClick={() => handleEdit(setting)}>
            Adjust
          </Button>
        </div>
      )
    }

    // Generic number/string input
    if (isEditing) {
      return (
        <div className="flex flex-col gap-2">
          <Input
            type={setting.valueType === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-40"
          />
          <Input
            placeholder="Reason for change"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleSave(setting)} disabled={isSaving}>
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

    return (
      <div className="flex items-center gap-2">
        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
          {String(setting.value)}
        </span>
        <Button size="sm" variant="ghost" onClick={() => handleEdit(setting)}>
          Edit
        </Button>
      </div>
    )
  }

  const renderSettingRow = (setting: SettingValue) => {
    const keyLabel = setting.key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())

    return (
      <div
        key={setting.key}
        className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0"
      >
        <div className="flex-1">
          <div className="font-medium text-gray-900">{keyLabel}</div>
          <div className="text-sm text-gray-500">{setting.description}</div>
        </div>
        <div className="ml-4">{renderSettingInput(setting)}</div>
      </div>
    )
  }

  if (isLoading) {
    return <SettingsSkeleton groups={4} itemsPerGroup={3} />
  }

  if (settings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <FileQuestion className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">No AI Settings Found</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Run the database migration to seed default AI configuration values.
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
      {Object.entries(SETTING_GROUPS).map(([groupKey, group]) => {
        const groupSettings = group.keys
          .map((key) => getSettingByKey(key))
          .filter((s): s is SettingValue => s !== undefined)

        if (groupSettings.length === 0) return null

        return (
          <Card key={groupKey}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {groupKey === 'models' && <Sparkles className="h-5 w-5 text-purple-500" />}
                {groupKey === 'parameters' && <Thermometer className="h-5 w-5 text-orange-500" />}
                {groupKey === 'timeouts' && <Clock className="h-5 w-5 text-blue-500" />}
                {groupKey === 'fallback' && <Zap className="h-5 w-5 text-yellow-500" />}
                {group.title}
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-gray-100">
                {groupSettings.map((setting) => renderSettingRow(setting))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
