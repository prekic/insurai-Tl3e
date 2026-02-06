/**
 * Settings Tab
 * Comprehensive settings management with specialized panels for each category
 */

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Download,
  Upload,
  FileWarning,
  Activity,
  Layers,
} from 'lucide-react'

// Sub-panels
import { AISettingsPanel } from './settings/AISettingsPanel'
import { EvaluationSettingsPanel } from './settings/EvaluationSettingsPanel'
import { RateLimitsPanel } from './settings/RateLimitsPanel'
import { OCRSettingsPanel } from './settings/OCRSettingsPanel'
import { FeatureFlagsPanel } from './settings/FeatureFlagsPanel'
import { SettingsHistoryPanel } from './settings/SettingsHistoryPanel'
import { ConfigPerformancePanel } from './settings/ConfigPerformancePanel'
import { SettingsTemplatesPanel } from './settings/SettingsTemplatesPanel'

type SettingsCategory = 'ai' | 'evaluation' | 'rate_limits' | 'ocr' | 'feature_flags' | 'history' | 'performance' | 'templates'

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
  {
    id: 'performance',
    label: 'Performance',
    description: 'Config fetch latency and cache hit rates',
    icon: <Activity className="h-5 w-5" />,
  },
  {
    id: 'templates',
    label: 'Templates',
    description: 'Apply predefined configuration profiles',
    icon: <Layers className="h-5 w-5" />,
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

interface ImportResult {
  summary: { totalUpdated: number; totalSkipped: number; totalErrors: number }
  results: {
    settings: { updated: number; skipped: number; errors: string[] }
    featureFlags: { updated: number; skipped: number; errors: string[] }
    regionalFactors: { updated: number; skipped: number; errors: string[] }
  }
}

export function SettingsTab() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('ai')
  const [settings, setSettings] = useState<SettingsData>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<Record<string, unknown> | null>(null)
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge')
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const batchUpdateSettings = async (
    updates: Array<{ category: string; key: string; value: unknown }>,
    reason?: string
  ) => {
    setIsSaving(true)
    setError(null)
    try {
      const response = await adminFetch('/api/admin/settings/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, reason }),
      })

      const data = await response.json()
      if (data.success) {
        // Update local state for all changed settings
        setSettings((prev) => {
          const next = { ...prev }
          for (const result of data.data.results) {
            const cat = result.category
            next[cat] = (next[cat] || []).map((s: SettingValue) =>
              s.key === result.key ? { ...s, value: result.newValue } : s
            )
          }
          return next
        })
        const count = data.data.updated
        setSuccessMessage(`${count} setting${count !== 1 ? 's' : ''} updated successfully`)
        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        if (data.validationErrors) {
          const msgs = data.validationErrors.map(
            (e: { key: string; error: string }) => `${e.key}: ${e.error}`
          )
          setError(`Validation failed: ${msgs.join('; ')}`)
        } else {
          setError(data.error || 'Failed to update settings')
        }
      }
    } catch (err) {
      console.error('Failed to batch update settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    setError(null)
    try {
      const response = await adminFetch('/api/admin/settings/export')
      const json = await response.json()
      if (!json.success) {
        setError(json.error || 'Export failed')
        return
      }

      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `insurai-config-${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setSuccessMessage('Configuration exported successfully')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Export failed:', err)
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset state
    setImportFile(file)
    setImportPreview(null)
    setImportResult(null)
    setError(null)

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      // Basic validation
      if (!data.version || !data.exportedAt) {
        setError('Invalid configuration file: missing version or exportedAt')
        setImportFile(null)
        return
      }

      setImportPreview(data)
      setShowImportDialog(true)
    } catch {
      setError('Failed to parse configuration file. Please select a valid JSON file.')
      setImportFile(null)
    }

    // Reset file input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImport = async () => {
    if (!importPreview) return

    setIsImporting(true)
    setError(null)
    try {
      const response = await adminFetch('/api/admin/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: importPreview,
          mode: importMode,
          reason: `Imported from backup (${importFile?.name || 'unknown'})`,
        }),
      })

      const json = await response.json()
      if (!json.success) {
        setError(json.error || 'Import failed')
        return
      }

      setImportResult(json.data)

      // Refresh settings to reflect changes
      if (json.data.summary.totalUpdated > 0) {
        await fetchSettings()
      }
    } catch (err) {
      console.error('Import failed:', err)
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const closeImportDialog = () => {
    setShowImportDialog(false)
    setImportFile(null)
    setImportPreview(null)
    setImportResult(null)
  }

  const renderPanel = () => {
    const categorySettings = settings[activeCategory] || []

    switch (activeCategory) {
      case 'ai':
        return (
          <AISettingsPanel
            settings={categorySettings}
            onUpdate={(key, value, reason) => updateSetting('ai', key, value, reason)}
            onBatchUpdate={(updates, reason) =>
              batchUpdateSettings(
                updates.map((u) => ({ ...u, category: 'ai' })),
                reason
              )
            }
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )
      case 'evaluation':
        return (
          <EvaluationSettingsPanel
            settings={categorySettings}
            onUpdate={(key, value, reason) => updateSetting('evaluation', key, value, reason)}
            onBatchUpdate={(updates, reason) =>
              batchUpdateSettings(
                updates.map((u) => ({ ...u, category: 'evaluation' })),
                reason
              )
            }
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )
      case 'rate_limits':
        return (
          <RateLimitsPanel
            settings={categorySettings}
            onUpdate={(key, value, reason) => updateSetting('rate_limits', key, value, reason)}
            onBatchUpdate={(updates, reason) =>
              batchUpdateSettings(
                updates.map((u) => ({ ...u, category: 'rate_limits' })),
                reason
              )
            }
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )
      case 'ocr':
        return (
          <OCRSettingsPanel
            settings={categorySettings}
            onUpdate={(key, value, reason) => updateSetting('ocr', key, value, reason)}
            onBatchUpdate={(updates, reason) =>
              batchUpdateSettings(
                updates.map((u) => ({ ...u, category: 'ocr' })),
                reason
              )
            }
            isLoading={isLoading}
            isSaving={isSaving}
          />
        )
      case 'feature_flags':
        return <FeatureFlagsPanel />
      case 'history':
        return <SettingsHistoryPanel />
      case 'performance':
        return <ConfigPerformancePanel />
      case 'templates':
        return (
          <SettingsTemplatesPanel
            settings={settings}
            onBatchUpdate={batchUpdateSettings}
            isSaving={isSaving}
          />
        )
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
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Select configuration file to import"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isSaving || isImporting}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isLoading || isSaving || isExporting}
          >
            <Download className={`h-4 w-4 mr-2 ${isExporting ? 'animate-bounce' : ''}`} />
            Export
          </Button>
          <Button onClick={fetchSettings} disabled={isLoading || isSaving}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
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

      {/* Import Dialog */}
      {showImportDialog && importPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-label="Import configuration">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileWarning className="h-5 w-5 text-amber-500" />
                  Import Configuration
                </h2>
                <button onClick={closeImportDialog} className="text-gray-400 hover:text-gray-600" aria-label="Close dialog">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {!importResult ? (
                <>
                  {/* File Info */}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">File</span>
                      <span className="font-medium">{importFile?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Exported</span>
                      <span className="font-medium">{new Date(importPreview.exportedAt as string).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">By</span>
                      <span className="font-medium">{(importPreview.exportedBy as string) || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Version</span>
                      <span className="font-medium">v{importPreview.version as number}</span>
                    </div>
                  </div>

                  {/* Contents Preview */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">Contents</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {importPreview.settings != null && (
                        <div className="bg-blue-50 rounded px-3 py-2">
                          <span className="text-blue-700 font-medium">{Object.keys(importPreview.settings as object).length}</span>
                          <span className="text-blue-600 ml-1">setting categories</span>
                        </div>
                      )}
                      {Array.isArray(importPreview.featureFlags) && (
                        <div className="bg-purple-50 rounded px-3 py-2">
                          <span className="text-purple-700 font-medium">{(importPreview.featureFlags as unknown[]).length}</span>
                          <span className="text-purple-600 ml-1">feature flags</span>
                        </div>
                      )}
                      {Array.isArray(importPreview.regionalFactors) && (
                        <div className="bg-green-50 rounded px-3 py-2">
                          <span className="text-green-700 font-medium">{(importPreview.regionalFactors as unknown[]).length}</span>
                          <span className="text-green-600 ml-1">regional factors</span>
                        </div>
                      )}
                      {Array.isArray(importPreview.providers) && (
                        <div className="bg-orange-50 rounded px-3 py-2">
                          <span className="text-orange-700 font-medium">{(importPreview.providers as unknown[]).length}</span>
                          <span className="text-orange-600 ml-1">providers</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Import Mode */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">Import Mode</h3>
                    <div className="space-y-2">
                      <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${importMode === 'merge' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="importMode"
                          value="merge"
                          checked={importMode === 'merge'}
                          onChange={() => setImportMode('merge')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-medium text-sm">Merge</div>
                          <div className="text-xs text-gray-500">Only update settings that exist in both backup and database. Safest option.</div>
                        </div>
                      </label>
                      <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${importMode === 'overwrite' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="importMode"
                          value="overwrite"
                          checked={importMode === 'overwrite'}
                          onChange={() => setImportMode('overwrite')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-medium text-sm">Overwrite</div>
                          <div className="text-xs text-gray-500">Replace all values with backup values. Read-only settings are still protected.</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {importMode === 'overwrite' && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>Overwrite mode will replace current values. An audit trail will be created for every change.</span>
                    </div>
                  )}
                </>
              ) : (
                /* Import Results */
                <div className="space-y-4">
                  {/* Summary */}
                  <div className={`rounded-lg p-4 text-center ${importResult.summary.totalErrors > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                    <div className="text-2xl font-bold text-gray-900">{importResult.summary.totalUpdated}</div>
                    <div className="text-sm text-gray-600">settings updated</div>
                    <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500">
                      <span>{importResult.summary.totalSkipped} unchanged</span>
                      {importResult.summary.totalErrors > 0 && (
                        <span className="text-red-600">{importResult.summary.totalErrors} errors</span>
                      )}
                    </div>
                  </div>

                  {/* Detail Breakdown */}
                  {(['settings', 'featureFlags', 'regionalFactors'] as const).map((section) => {
                    const r = importResult.results[section]
                    if (r.updated === 0 && r.skipped === 0 && r.errors.length === 0) return null
                    return (
                      <div key={section} className="text-sm">
                        <div className="font-medium text-gray-700 mb-1 capitalize">{section.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div className="flex gap-3 text-xs text-gray-500">
                          {r.updated > 0 && <span className="text-green-600">{r.updated} updated</span>}
                          {r.skipped > 0 && <span>{r.skipped} skipped</span>}
                          {r.errors.length > 0 && <span className="text-red-600">{r.errors.length} errors</span>}
                        </div>
                        {r.errors.length > 0 && (
                          <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                            {r.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                            {r.errors.length > 5 && <li>...and {r.errors.length - 5} more</li>}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              {!importResult ? (
                <>
                  <Button variant="outline" onClick={closeImportDialog} disabled={isImporting}>
                    Cancel
                  </Button>
                  <Button onClick={handleImport} disabled={isImporting}>
                    {isImporting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Configuration
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button onClick={closeImportDialog}>
                  <Check className="h-4 w-4 mr-2" />
                  Done
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsTab
