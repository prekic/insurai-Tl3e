/**
 * Settings Templates Panel
 *
 * Allows admins to apply predefined configuration profiles with one click.
 * Shows a diff preview before applying changes.
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Rocket,
  Wallet,
  Scale,
  ShieldCheck,
  Presentation,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  Check,
  Loader2,
} from 'lucide-react'
import {
  SETTINGS_TEMPLATES,
  computeTemplateDiff,
  getCategoryLabel,
  type SettingsTemplate,
} from '@/lib/admin/settings-templates'
import type { SettingValue } from '../SettingsTab'

interface SettingsTemplatesPanelProps {
  settings: Record<string, SettingValue[]>
  onBatchUpdate: (
    updates: Array<{ category: string; key: string; value: unknown }>,
    reason?: string
  ) => Promise<void>
  isSaving: boolean
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Rocket: <Rocket className="h-6 w-6" />,
  Wallet: <Wallet className="h-6 w-6" />,
  Scale: <Scale className="h-6 w-6" />,
  ShieldCheck: <ShieldCheck className="h-6 w-6" />,
  Presentation: <Presentation className="h-6 w-6" />,
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string; iconBg: string }> = {
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    iconBg: 'bg-blue-100 text-blue-600',
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-700',
    iconBg: 'bg-green-100 text-green-600',
  },
  gray: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-700',
    badge: 'bg-gray-100 text-gray-700',
    iconBg: 'bg-gray-100 text-gray-600',
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-700',
    iconBg: 'bg-purple-100 text-purple-600',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    iconBg: 'bg-amber-100 text-amber-600',
  },
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    // Format large numbers with commas
    if (value >= 1000) return value.toLocaleString()
    // Format decimals
    if (!Number.isInteger(value)) return String(value)
    return String(value)
  }
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export function SettingsTemplatesPanel({
  settings,
  onBatchUpdate,
  isSaving,
}: SettingsTemplatesPanelProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<SettingsTemplate | null>(null)
  const [applied, setApplied] = useState(false)

  const diff = useMemo(() => {
    if (!selectedTemplate) return null
    return computeTemplateDiff(selectedTemplate, settings)
  }, [selectedTemplate, settings])

  const handleApply = async () => {
    if (!selectedTemplate || !diff || diff.changes.length === 0) return

    const updates = diff.changes.map((c) => ({
      category: c.category,
      key: c.key,
      value: c.newValue,
    }))

    await onBatchUpdate(updates, `Applied template: ${selectedTemplate.name}`)
    setApplied(true)
  }

  const handleBack = () => {
    setSelectedTemplate(null)
    setApplied(false)
  }

  // Diff preview view
  if (selectedTemplate && diff) {
    const colors = COLOR_MAP[selectedTemplate.color] || COLOR_MAP.gray

    // Group changes by category
    const groupedChanges = diff.changes.reduce<Record<string, typeof diff.changes>>(
      (acc, change) => {
        if (!acc[change.category]) acc[change.category] = []
        acc[change.category].push(change)
        return acc
      },
      {}
    )

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${colors.iconBg}`}>
              {ICON_MAP[selectedTemplate.icon]}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{selectedTemplate.name}</h3>
              <p className="text-sm text-gray-500">{selectedTemplate.description}</p>
            </div>
          </div>
        </div>

        {/* Applied success message */}
        {applied && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <Check className="h-4 w-4" />
            <span>Template &quot;{selectedTemplate.name}&quot; applied successfully</span>
          </div>
        )}

        {/* Changes summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {applied ? 'Applied Changes' : 'Preview Changes'}
            </CardTitle>
            <CardDescription>
              {diff.changes.length === 0
                ? 'No changes needed — all settings already match this template.'
                : `${diff.changes.length} setting${diff.changes.length !== 1 ? 's' : ''} will be ${applied ? 'were' : ''} updated${diff.unchanged > 0 ? `, ${diff.unchanged} already match${diff.unchanged !== 1 ? '' : 'es'}` : ''}`}
            </CardDescription>
          </CardHeader>

          {diff.changes.length > 0 && (
            <CardContent className="pt-0">
              <div className="space-y-4">
                {Object.entries(groupedChanges).map(([category, changes]) => (
                  <div key={category}>
                    <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {getCategoryLabel(category)}
                      </Badge>
                      <span className="text-gray-400 text-xs">
                        {changes.length} change{changes.length !== 1 ? 's' : ''}
                      </span>
                    </h4>
                    <div className="border rounded-lg divide-y">
                      {changes.map((change) => (
                        <div
                          key={`${change.category}-${change.key}`}
                          className="px-3 py-2 flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-600 font-mono text-xs">
                            {change.key}
                          </span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-red-600 line-through">
                              {formatValue(change.currentValue)}
                            </span>
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                            <span className="text-green-600 font-medium">
                              {formatValue(change.newValue)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Warning for non-balanced templates */}
        {selectedTemplate.id !== 'balanced' && diff.changes.length > 0 && !applied && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              This will override {diff.changes.length} setting{diff.changes.length !== 1 ? 's' : ''}.
              All changes are logged in the audit trail and can be reverted individually.
            </span>
          </div>
        )}

        {/* Action buttons */}
        {!applied && diff.changes.length > 0 && (
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleBack} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Apply {diff.changes.length} Change{diff.changes.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Template selection grid
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Configuration Templates</h3>
        <p className="text-sm text-gray-500 mt-1">
          Apply a predefined configuration profile to quickly adjust multiple settings at once.
          You&apos;ll see a preview of all changes before they are applied.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_TEMPLATES.map((template) => {
          const colors = COLOR_MAP[template.color] || COLOR_MAP.gray

          return (
            <Card
              key={template.id}
              className={`cursor-pointer transition-all hover:shadow-md border ${colors.border} hover:ring-2 hover:ring-offset-1 hover:ring-${template.color}-300`}
              onClick={() => {
                setSelectedTemplate(template)
                setApplied(false)
              }}
              role="button"
              tabIndex={0}
              aria-label={`Select ${template.name} template`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedTemplate(template)
                  setApplied(false)
                }
              }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={`p-2 rounded-lg ${colors.iconBg}`}>
                    {ICON_MAP[template.icon]}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 mt-1" />
                </div>
                <CardTitle className="text-base mt-2">{template.name}</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1">
                  {template.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {template.overrides.length} setting{template.overrides.length !== 1 ? 's' : ''}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export default SettingsTemplatesPanel
