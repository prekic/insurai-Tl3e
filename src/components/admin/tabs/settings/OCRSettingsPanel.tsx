/**
 * OCR Settings Panel
 * Configure OCR confidence thresholds, quality settings, and processing options
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSkeleton } from '@/components/ui/loading'
import {
  Eye,
  Save,
  Sliders,
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  ScanText,
} from 'lucide-react'
import type { SettingValue } from '../SettingsTab'

interface OCRSettingsPanelProps {
  settings: SettingValue[]
  onUpdate: (key: string, value: unknown, reason?: string) => Promise<void>
  onBatchUpdate?: (updates: Array<{ key: string; value: unknown }>, reason?: string) => Promise<void>
  isLoading: boolean
  isSaving: boolean
}

// Group settings by purpose
const SETTING_GROUPS = {
  confidence: {
    title: 'Confidence Thresholds',
    description: 'Minimum confidence levels for accepting OCR results',
    keys: [
      'min_confidence_threshold',
      'high_confidence_threshold',
      'char_confidence_threshold',
      'word_confidence_threshold',
    ],
  },
  density: {
    title: 'Text Density Analysis',
    description: 'Thresholds for determining if a document needs OCR',
    keys: [
      'min_chars_per_page',
      'skip_ocr_chars_threshold',
      'selective_ocr_chars_threshold',
    ],
  },
  quality: {
    title: 'Quality Settings',
    description: 'Settings for OCR output quality and validation',
    keys: [
      'garbage_ratio_threshold',
      'min_insurance_terms_ratio',
      'encoding_issue_threshold',
    ],
  },
  processing: {
    title: 'Processing Options',
    description: 'Control how documents are processed',
    keys: [
      'max_pages_per_request',
      'enable_page_splitting',
      'prefer_document_ai',
    ],
  },
}

export function OCRSettingsPanel({
  settings,
  onUpdate,
  isLoading,
  isSaving,
}: OCRSettingsPanelProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [editReason, setEditReason] = useState('')

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
    await onUpdate(setting.key, !setting.value, 'Toggled via OCR settings panel')
  }

  const getConfidenceIndicator = (value: number) => {
    if (value >= 0.8) {
      return {
        icon: <CheckCircle className="h-4 w-4 text-green-500" />,
        label: 'High',
        color: 'text-green-600',
      }
    }
    if (value >= 0.5) {
      return {
        icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
        label: 'Medium',
        color: 'text-yellow-600',
      }
    }
    return {
      icon: <XCircle className="h-4 w-4 text-red-500" />,
      label: 'Low',
      color: 'text-red-600',
    }
  }

  const renderConfidenceSlider = (setting: SettingValue) => {
    const isEditing = editingKey === setting.key
    const value = isEditing ? Number(editValue) : Number(setting.value)
    const indicator = getConfidenceIndicator(value)
    const keyLabel = setting.key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())

    if (isEditing) {
      return (
        <div className="flex flex-col gap-2 w-64">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 accent-blue-600"
              aria-label={`${keyLabel} slider`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Number(editValue) * 100)}
              aria-valuetext={`${(Number(editValue) * 100).toFixed(0)}%`}
            />
            <span className="font-mono text-sm w-16 text-right">
              {(Number(editValue) * 100).toFixed(0)}%
            </span>
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

    return (
      <div className="flex items-center gap-3">
        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${
              value >= 0.8 ? 'bg-green-500' : value >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${value * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-1">
          {indicator.icon}
          <span className={`font-mono ${indicator.color}`}>
            {(value * 100).toFixed(0)}%
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => handleEdit(setting)}>
          Adjust
        </Button>
      </div>
    )
  }

  const renderSettingInput = (setting: SettingValue) => {
    const isEditing = editingKey === setting.key

    // Boolean toggle
    if (setting.valueType === 'boolean') {
      return (
        <Button
          variant={setting.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleToggle(setting)}
          disabled={isSaving}
        >
          {setting.value ? 'Enabled' : 'Disabled'}
        </Button>
      )
    }

    // Confidence threshold (0-1 range)
    if (setting.key.includes('confidence') || setting.key.includes('ratio') || setting.key.includes('threshold')) {
      const value = Number(setting.value)
      if (value >= 0 && value <= 1) {
        return renderConfidenceSlider(setting)
      }
    }

    // Generic number/string input
    if (isEditing) {
      return (
        <div className="flex flex-col gap-2">
          <Input
            type={setting.valueType === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-32"
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
        <span className="font-mono bg-gray-100 px-3 py-1 rounded text-sm">
          {String(setting.value)}
        </span>
        <Button size="sm" variant="ghost" onClick={() => handleEdit(setting)}>
          Edit
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return <SettingsSkeleton groups={5} itemsPerGroup={3} />
  }

  if (settings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <ScanText className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">No OCR Settings Found</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Run the database migration to seed default OCR configuration values.
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
      {/* Decision Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-500" />
            OCR Decision Flow
          </CardTitle>
          <CardDescription>
            How the system decides whether to use OCR on a document
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <div className="flex flex-col items-center p-4 bg-blue-50 rounded-lg">
              <FileText className="h-8 w-8 text-blue-500 mb-2" />
              <span className="font-medium">PDF Upload</span>
            </div>
            <div className="flex-1 border-t-2 border-dashed border-gray-300 mx-2" />
            <div className="flex flex-col items-center p-4 bg-yellow-50 rounded-lg">
              <Sliders className="h-8 w-8 text-yellow-500 mb-2" />
              <span className="font-medium">Text Density Check</span>
              <span className="text-xs text-gray-500 mt-1">
                &gt;{String(getSettingByKey('skip_ocr_chars_threshold')?.value ?? 200)} chars/page
              </span>
            </div>
            <div className="flex-1 border-t-2 border-dashed border-gray-300 mx-2" />
            <div className="flex flex-col items-center p-4 bg-green-50 rounded-lg">
              <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
              <span className="font-medium">Skip OCR</span>
              <span className="text-xs text-gray-500 mt-1">Digital PDF</span>
            </div>
          </div>
          <div className="flex justify-center my-2">
            <span className="text-xs text-gray-400">or if below threshold...</span>
          </div>
          <div className="flex items-center justify-center text-sm">
            <div className="flex flex-col items-center p-4 bg-orange-50 rounded-lg">
              <Eye className="h-8 w-8 text-orange-500 mb-2" />
              <span className="font-medium">Full OCR</span>
              <span className="text-xs text-gray-500 mt-1">Scanned Document</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings by Group */}
      {Object.entries(SETTING_GROUPS).map(([groupKey, group]) => {
        const groupSettings = group.keys
          .map((key) => getSettingByKey(key))
          .filter((s): s is SettingValue => s !== undefined)

        if (groupSettings.length === 0) return null

        return (
          <Card key={groupKey}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {groupKey === 'confidence' && <Sliders className="h-5 w-5 text-blue-500" />}
                {groupKey === 'density' && <FileText className="h-5 w-5 text-green-500" />}
                {groupKey === 'quality' && <CheckCircle className="h-5 w-5 text-purple-500" />}
                {groupKey === 'processing' && <Eye className="h-5 w-5 text-orange-500" />}
                {group.title}
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {groupSettings.map((setting) => (
                  <div
                    key={setting.key}
                    className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-1 mr-4">
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

      {/* Other Settings */}
      {(() => {
        const allGroupKeys = Object.values(SETTING_GROUPS).flatMap((g) => g.keys)
        const otherSettings = settings.filter((s) => !allGroupKeys.includes(s.key))

        if (otherSettings.length === 0) return null

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-gray-500" />
                Other OCR Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {otherSettings.map((setting) => (
                  <div
                    key={setting.key}
                    className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-1 mr-4">
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
      })()}

      {/* Info box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-blue-700">
        <Info className="h-5 w-5 mt-0.5" />
        <div className="text-sm">
          <strong>OCR Decision Engine:</strong> The system uses a multi-factor analysis including
          text density, character encoding quality, insurance term matching, and field extraction
          success to determine the optimal OCR strategy for each document.
        </div>
      </div>
    </div>
  )
}
