/**
 * UserPreferencesPanel
 *
 * Allows authenticated users to customize their personal preferences.
 * These preferences override admin defaults for the UI and email categories.
 */

import { useState } from 'react'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { Button } from '@/components/ui/button'
import {
  Save,
  RotateCcw,
  Check,
  AlertCircle,
  X,
  Settings2,
  Mail,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { UserOverridableCategory, PreferenceFieldMeta } from '@/lib/config/user-overridable'

export function UserPreferencesPanel() {
  const {
    preferences,
    isLoading,
    isSaving,
    error,
    successMessage,
    isAuthenticated,
    updatePreference,
    savePreferences,
    resetCategory,
    resetPreference,
    isModified,
    getAdminDefault,
    getFieldMeta,
  } = useUserPreferences()

  const [expandedCategory, setExpandedCategory] = useState<UserOverridableCategory | null>('ui')

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Settings2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p className="text-lg font-medium text-gray-600">Sign in to customize preferences</p>
        <p className="text-sm mt-1">Personal preferences are available to logged-in users.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const categories: Array<{
    id: UserOverridableCategory
    label: string
    icon: React.ReactNode
    description: string
  }> = [
    {
      id: 'ui',
      label: 'Display Preferences',
      icon: <Settings2 className="h-5 w-5" />,
      description: 'Customize how content is displayed',
    },
    {
      id: 'email',
      label: 'Email Preferences',
      icon: <Mail className="h-5 w-5" />,
      description: 'Manage email notifications and reminders',
    },
  ]

  const hasAnyModifications = categories.some((cat) =>
    getFieldMeta(cat.id).some((field) => isModified(cat.id, field.key))
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">My Preferences</h2>
          <p className="text-sm text-gray-500 mt-1">
            Customize your experience. These settings override system defaults.
          </p>
        </div>
        <Button onClick={savePreferences} disabled={isSaving || !hasAnyModifications}>
          {isSaving ? (
            <span className="flex items-center gap-2">
              <Save className="h-4 w-4 animate-pulse" />
              Saving...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              Save Preferences
            </span>
          )}
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Category Sections */}
      <div className="space-y-4">
        {categories.map((category) => {
          const fields = getFieldMeta(category.id)
          const isExpanded = expandedCategory === category.id
          const modifiedCount = fields.filter((f) => isModified(category.id, f.key)).length

          return (
            <div key={category.id} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="text-gray-600">{category.icon}</div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">{category.label}</div>
                    <div className="text-sm text-gray-500">{category.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {modifiedCount > 0 && (
                    <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {modifiedCount} customized
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Category Fields */}
              {isExpanded && (
                <div className="border-t border-gray-200">
                  <div className="divide-y divide-gray-100">
                    {fields.map((field) => (
                      <PreferenceField
                        key={field.key}
                        field={field}
                        category={category.id}
                        value={
                          preferences[category.id][field.key] !== undefined
                            ? preferences[category.id][field.key]
                            : getAdminDefault(category.id, field.key)
                        }
                        isOverridden={isModified(category.id, field.key)}
                        adminDefault={getAdminDefault(category.id, field.key)}
                        onChange={(value) => updatePreference(category.id, field.key, value)}
                        onReset={() => resetPreference(category.id, field.key)}
                      />
                    ))}
                  </div>

                  {/* Reset Category Button */}
                  {modifiedCount > 0 && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-200">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resetCategory(category.id)}
                        disabled={isSaving}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset {category.label} to Defaults
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
// PREFERENCE FIELD COMPONENT
// =============================================================================

interface PreferenceFieldProps {
  field: PreferenceFieldMeta
  category: UserOverridableCategory
  value: unknown
  isOverridden: boolean
  adminDefault: unknown
  onChange: (value: unknown) => void
  onReset: () => void
}

function PreferenceField({
  field,
  value,
  isOverridden,
  adminDefault,
  onChange,
  onReset,
}: PreferenceFieldProps) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{field.label}</span>
          {isOverridden && (
            <span className="bg-blue-50 text-blue-600 text-xs px-1.5 py-0.5 rounded">
              customized
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>
        {isOverridden && adminDefault !== undefined && (
          <p className="text-xs text-gray-400 mt-0.5">
            Default: {formatValue(adminDefault)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {field.type === 'boolean' && (
          <BooleanInput
            value={value as boolean}
            onChange={onChange}
          />
        )}

        {field.type === 'number' && (
          <NumberInput
            value={value as number}
            min={field.min}
            max={field.max}
            onChange={onChange}
          />
        )}

        {field.type === 'array' && (
          <ArrayInput
            value={value as number[]}
            onChange={onChange}
          />
        )}

        {isOverridden && (
          <button
            onClick={onReset}
            className="text-gray-400 hover:text-gray-600 p-1"
            title="Reset to default"
            aria-label={`Reset ${field.label} to default`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// INPUT COMPONENTS
// =============================================================================

function BooleanInput({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={!!value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      onChange={(e) => {
        const num = parseInt(e.target.value, 10)
        if (!isNaN(num)) {
          onChange(num)
        }
      }}
      className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-right focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
    />
  )
}

function ArrayInput({
  value,
  onChange,
}: {
  value: number[]
  onChange: (v: number[]) => void
}) {
  const [inputValue, setInputValue] = useState('')

  const currentValues = Array.isArray(value) ? value : []

  const handleAdd = () => {
    const num = parseInt(inputValue, 10)
    if (!isNaN(num) && !currentValues.includes(num)) {
      const updated = [...currentValues, num].sort((a, b) => b - a)
      onChange(updated)
      setInputValue('')
    }
  }

  const handleRemove = (num: number) => {
    onChange(currentValues.filter((v) => v !== num))
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-1 justify-end">
        {currentValues.map((num) => (
          <span
            key={num}
            className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full"
          >
            {num}
            <button
              onClick={() => handleRemove(num)}
              className="text-gray-400 hover:text-gray-600"
              aria-label={`Remove ${num}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add"
          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <Button variant="outline" size="sm" onClick={handleAdd} disabled={!inputValue} className="h-6 px-2 text-xs">
          +
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// HELPERS
// =============================================================================

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
