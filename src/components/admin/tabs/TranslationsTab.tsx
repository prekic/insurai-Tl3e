/**
 * Translations Tab
 * Admin panel for managing translations across all locales.
 * Supports inline editing, coverage stats, locale management,
 * and import/export per locale.
 */

import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '@/lib/admin/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SettingsSkeleton } from '@/components/ui/loading'
import {
  Globe,
  Search,
  Save,
  RefreshCw,
  Download,
  Upload,
  Plus,
  Check,
  X,
  AlertCircle,
  Languages,
  FileText,
  ChevronDown,
  ChevronRight,
  Pencil,
  BarChart3,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface Locale {
  code: string
  name: string
  nativeName: string
  flag: string
  isRtl: boolean
  isActive: boolean
  isDefault: boolean
  displayOrder: number
}

interface CoverageStats {
  totalKeys: number
  translatedKeys: number
  percentage: number
  sections: Record<string, { total: number; translated: number; percentage: number }>
}

interface NewLocaleForm {
  code: string
  name: string
  nativeName: string
  flag: string
  isRtl: boolean
}

// ─── Component ───────────────────────────────────────────────────────

export function TranslationsTab() {
  // State
  const [locales, setLocales] = useState<Locale[]>([])
  const [selectedLocale, setSelectedLocale] = useState<string>('')
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>({})
  const [coverage, setCoverage] = useState<CoverageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  // Editing state
  const [editingKey, setEditingKey] = useState<string | null>(null) // "section.key"
  const [editValue, setEditValue] = useState('')

  // New locale dialog
  const [showNewLocale, setShowNewLocale] = useState(false)
  const [newLocale, setNewLocale] = useState<NewLocaleForm>({
    code: '',
    name: '',
    nativeName: '',
    flag: '',
    isRtl: false,
  })
  const [isCreatingLocale, setIsCreatingLocale] = useState(false)

  // Import state
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // AI translation state
  const [isAITranslating, setIsAITranslating] = useState(false)
  const [aiTranslateStats, setAiTranslateStats] = useState<{
    total: number; translated: number; failed: number; skipped: number
  } | null>(null)

  // ─── Data Loading ────────────────────────────────────────────────

  const loadLocales = useCallback(async () => {
    try {
      const response = await adminFetch('/api/translations/locales')
      const data = await response.json()
      if (data.success && data.locales) {
        setLocales(data.locales)
        // Auto-select first locale if none selected
        if (!selectedLocale && data.locales.length > 0) {
          const defaultLocale = data.locales.find((l: Locale) => l.isDefault)
          setSelectedLocale(defaultLocale?.code || data.locales[0].code)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locales')
    }
  }, [selectedLocale])

  const loadTranslations = useCallback(async (locale: string) => {
    if (!locale) return
    setIsLoading(true)
    setError(null)
    try {
      const response = await adminFetch(`/api/translations/${locale}`)
      const data = await response.json()
      if (data.success && data.translations) {
        setTranslations(data.translations)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load translations')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadCoverage = useCallback(async (locale: string) => {
    if (!locale) return
    try {
      const response = await adminFetch(`/api/translations/admin/${locale}/coverage`)
      const data = await response.json()
      if (data.success && data.coverage) {
        setCoverage(data.coverage)
      }
    } catch {
      // Non-critical, don't show error
    }
  }, [])

  useEffect(() => {
    loadLocales()
  }, [loadLocales])

  useEffect(() => {
    if (selectedLocale) {
      loadTranslations(selectedLocale)
      loadCoverage(selectedLocale)
    }
  }, [selectedLocale, loadTranslations, loadCoverage])

  // ─── Editing ─────────────────────────────────────────────────────

  const startEdit = (section: string, key: string, currentValue: string) => {
    setEditingKey(`${section}.${key}`)
    setEditValue(currentValue)
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const saveEdit = async () => {
    if (!editingKey || !selectedLocale) return
    const [section, key] = editingKey.split('.')
    setIsSaving(true)
    setError(null)
    try {
      const response = await adminFetch(`/api/translations/admin/${selectedLocale}/${section}/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: editValue }),
      })
      const data = await response.json()
      if (data.success) {
        // Update local state
        setTranslations((prev) => ({
          ...prev,
          [section]: {
            ...prev[section],
            [key]: editValue,
          },
        }))
        setEditingKey(null)
        setEditValue('')
        setSuccess(`Translation updated: ${section}.${key}`)
        setTimeout(() => setSuccess(null), 3000)
        // Refresh coverage
        loadCoverage(selectedLocale)
      } else {
        setError(data.error || 'Failed to update translation')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update translation')
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Locale Management ──────────────────────────────────────────

  const createLocale = async () => {
    if (!newLocale.code || !newLocale.name) return
    setIsCreatingLocale(true)
    setError(null)
    try {
      const response = await adminFetch('/api/translations/admin/locales', {
        method: 'POST',
        body: JSON.stringify(newLocale),
      })
      const data = await response.json()
      if (data.success) {
        setShowNewLocale(false)
        setNewLocale({ code: '', name: '', nativeName: '', flag: '', isRtl: false })
        setSuccess(`Locale "${newLocale.code}" created successfully`)
        setTimeout(() => setSuccess(null), 3000)
        await loadLocales()
      } else {
        setError(data.error || 'Failed to create locale')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create locale')
    } finally {
      setIsCreatingLocale(false)
    }
  }

  // ─── Import/Export ───────────────────────────────────────────────

  const handleExport = async () => {
    if (!selectedLocale) return
    setIsExporting(true)
    setError(null)
    try {
      const response = await adminFetch(`/api/translations/admin/${selectedLocale}/export`)
      const data = await response.json()
      if (data.success) {
        const blob = new Blob([JSON.stringify(data.translations, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `translations-${selectedLocale}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setSuccess(`Translations for "${selectedLocale}" exported`)
        setTimeout(() => setSuccess(null), 3000)
      } else {
        setError(data.error || 'Export failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedLocale) return
    setIsImporting(true)
    setError(null)
    try {
      const text = await file.text()
      const importData = JSON.parse(text)
      const response = await adminFetch(`/api/translations/admin/${selectedLocale}/import`, {
        method: 'POST',
        body: JSON.stringify({ translations: importData }),
      })
      const data = await response.json()
      if (data.success) {
        setSuccess(`Imported ${data.stats?.created || 0} new + ${data.stats?.updated || 0} updated translations`)
        setTimeout(() => setSuccess(null), 5000)
        await loadTranslations(selectedLocale)
        await loadCoverage(selectedLocale)
      } else {
        setError(data.error || 'Import failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Ensure valid JSON format.')
    } finally {
      setIsImporting(false)
      // Reset file input
      e.target.value = ''
    }
  }

  // ─── Invalidate Cache ───────────────────────────────────────────

  const invalidateCache = async () => {
    try {
      const response = await adminFetch('/api/translations/admin/cache/invalidate', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        setSuccess('Translation cache invalidated')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch {
      // Non-critical
    }
  }

  // ─── AI Translation ────────────────────────────────────────────

  const handleAITranslate = async () => {
    if (!selectedLocale || selectedLocale === 'en') return
    setIsAITranslating(true)
    setAiTranslateStats(null)
    setError(null)
    try {
      const response = await adminFetch(`/api/translations/admin/${selectedLocale}/ai-translate`, {
        method: 'POST',
        body: JSON.stringify({ sourceLocale: 'en' }),
      })
      const data = await response.json()
      if (data.success) {
        setAiTranslateStats(data.stats)
        setSuccess(`AI translation completed: ${data.stats.translated} keys translated`)
        setTimeout(() => setSuccess(null), 5000)
        // Refresh translations and coverage
        await loadTranslations(selectedLocale)
        await loadCoverage(selectedLocale)
      } else {
        setError(data.error || 'AI translation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI translation failed')
    } finally {
      setIsAITranslating(false)
    }
  }

  // ─── Section toggling ──────────────────────────────────────────

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedSections(new Set(Object.keys(translations)))
  }

  const collapseAll = () => {
    setExpandedSections(new Set())
  }

  // ─── Filtering ─────────────────────────────────────────────────

  const getFilteredSections = (): Record<string, Record<string, string>> => {
    if (!searchQuery.trim()) return translations

    const query = searchQuery.toLowerCase()
    const filtered: Record<string, Record<string, string>> = {}

    for (const [section, keys] of Object.entries(translations)) {
      const matchedKeys: Record<string, string> = {}
      for (const [key, value] of Object.entries(keys)) {
        if (
          key.toLowerCase().includes(query) ||
          value.toLowerCase().includes(query) ||
          section.toLowerCase().includes(query)
        ) {
          matchedKeys[key] = value
        }
      }
      if (Object.keys(matchedKeys).length > 0) {
        filtered[section] = matchedKeys
      }
    }
    return filtered
  }

  const filteredSections = getFilteredSections()
  const totalKeys = Object.values(translations).reduce((sum, section) => sum + Object.keys(section).length, 0)
  const filteredCount = Object.values(filteredSections).reduce((sum, section) => sum + Object.keys(section).length, 0)

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Languages className="h-6 w-6 text-blue-600" />
            Translation Management
          </h2>
          <p className="text-gray-500 mt-1">
            Edit translations, manage languages, and track coverage
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={invalidateCache}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Clear Cache
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewLocale(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Language
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

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>{success}</span>
        </div>
      )}

      {aiTranslateStats && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span>AI Translation Results:</span>
            <Badge variant="secondary">{aiTranslateStats.translated} translated</Badge>
            {aiTranslateStats.failed > 0 && (
              <Badge variant="destructive">{aiTranslateStats.failed} failed</Badge>
            )}
            {aiTranslateStats.skipped > 0 && (
              <span className="text-blue-500">{aiTranslateStats.skipped} already done</span>
            )}
          </div>
          <button onClick={() => setAiTranslateStats(null)} className="text-blue-400 hover:text-blue-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Locale Selector */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Locale list */}
        <div className="lg:w-64 flex-shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Languages
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {locales.map((locale) => (
                <button
                  key={locale.code}
                  onClick={() => setSelectedLocale(locale.code)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                    selectedLocale === locale.code
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{locale.flag}</span>
                    <span>{locale.nativeName}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    {locale.isDefault && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        default
                      </Badge>
                    )}
                    {locale.isRtl && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        RTL
                      </Badge>
                    )}
                  </span>
                </button>
              ))}
              {locales.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No locales found</p>
              )}
            </CardContent>
          </Card>

          {/* Coverage Stats */}
          {coverage && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Coverage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Overall */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600">Overall</span>
                      <span className="font-medium">{coverage.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          coverage.percentage === 100
                            ? 'bg-green-500'
                            : coverage.percentage >= 80
                              ? 'bg-blue-500'
                              : coverage.percentage >= 50
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                        }`}
                        style={{ width: `${coverage.percentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {coverage.translatedKeys} / {coverage.totalKeys} keys
                    </div>
                  </div>

                  {/* Per section */}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {Object.entries(coverage.sections)
                      .sort(([, a], [, b]) => a.percentage - b.percentage)
                      .map(([section, stats]) => (
                        <div key={section} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500 w-20 truncate" title={section}>
                            {section}
                          </span>
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                stats.percentage === 100 ? 'bg-green-500' : 'bg-yellow-500'
                              }`}
                              style={{ width: `${stats.percentage}%` }}
                            />
                          </div>
                          <span className="text-gray-400 w-8 text-right">{stats.percentage}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Translation editor */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search keys, values, or sections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting || !selectedLocale}>
                <Download className={`h-4 w-4 mr-1 ${isExporting ? 'animate-bounce' : ''}`} />
                Export
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  disabled={isImporting || !selectedLocale}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isImporting || !selectedLocale}
                  onClick={(e) => {
                    const input = (e.currentTarget.parentElement as HTMLLabelElement).querySelector('input')
                    input?.click()
                  }}
                >
                  <Upload className={`h-4 w-4 mr-1 ${isImporting ? 'animate-spin' : ''}`} />
                  Import
                </Button>
              </label>
              <Button
                variant="default"
                size="sm"
                onClick={handleAITranslate}
                disabled={isAITranslating || !selectedLocale || selectedLocale === 'en'}
                title={selectedLocale === 'en' ? 'Cannot AI-translate the source language' : 'Use AI to translate missing keys from English'}
              >
                <Languages className={`h-4 w-4 mr-1 ${isAITranslating ? 'animate-spin' : ''}`} />
                {isAITranslating ? 'Translating...' : 'AI Translate'}
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
            <span>{totalKeys} total keys</span>
            {searchQuery && (
              <span className="text-blue-600">{filteredCount} matching</span>
            )}
            <span>{Object.keys(filteredSections).length} sections</span>
          </div>

          {/* Loading */}
          {isLoading && <SettingsSkeleton />}

          {/* No locale selected */}
          {!isLoading && !selectedLocale && (
            <div className="text-center py-20 text-gray-400">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a language to edit translations</p>
            </div>
          )}

          {/* Translation sections */}
          {!isLoading && selectedLocale && (
            <div className="space-y-3">
              {Object.entries(filteredSections)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([section, keys]) => {
                  const isExpanded = expandedSections.has(section)
                  const keyCount = Object.keys(keys).length

                  return (
                    <Card key={section} className="overflow-hidden">
                      {/* Section header */}
                      <button
                        onClick={() => toggleSection(section)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{section}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {keyCount} {keyCount === 1 ? 'key' : 'keys'}
                        </Badge>
                      </button>

                      {/* Section content */}
                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          <div className="divide-y divide-gray-50">
                            {Object.entries(keys)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([key, value]) => {
                                const fullKey = `${section}.${key}`
                                const isEditing = editingKey === fullKey

                                return (
                                  <div
                                    key={key}
                                    className={`px-4 py-2.5 flex items-start gap-3 ${
                                      isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    {/* Key name */}
                                    <div className="w-40 flex-shrink-0 pt-1">
                                      <code className="text-xs text-gray-500 break-all">{key}</code>
                                    </div>

                                    {/* Value */}
                                    <div className="flex-1 min-w-0">
                                      {isEditing ? (
                                        <div className="flex items-center gap-2">
                                          <Input
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            className="text-sm"
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') saveEdit()
                                              if (e.key === 'Escape') cancelEdit()
                                            }}
                                          />
                                          <Button
                                            size="sm"
                                            onClick={saveEdit}
                                            disabled={isSaving}
                                            className="flex-shrink-0"
                                          >
                                            <Save className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={cancelEdit}
                                            className="flex-shrink-0"
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <div
                                          className="text-sm text-gray-700 cursor-pointer group flex items-start gap-2"
                                          onClick={() => startEdit(section, key, value)}
                                        >
                                          <span className="break-words flex-1">{value || <em className="text-gray-300">empty</em>}</span>
                                          <Pencil className="h-3 w-3 text-gray-300 group-hover:text-blue-500 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })}

              {Object.keys(filteredSections).length === 0 && !isLoading && (
                <div className="text-center py-12 text-gray-400">
                  <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p>No translations match your search</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Locale Dialog */}
      {showNewLocale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Plus className="h-5 w-5 text-blue-500" />
                  Add New Language
                </h3>
                <button onClick={() => setShowNewLocale(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Language Code *
                </label>
                <Input
                  placeholder="e.g., de, fr, es"
                  value={newLocale.code}
                  onChange={(e) => setNewLocale({ ...newLocale, code: e.target.value.toLowerCase() })}
                  maxLength={10}
                />
                <p className="text-xs text-gray-400 mt-1">ISO 639-1 code (2-letter)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  English Name *
                </label>
                <Input
                  placeholder="e.g., German, French"
                  value={newLocale.name}
                  onChange={(e) => setNewLocale({ ...newLocale, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Native Name
                </label>
                <Input
                  placeholder="e.g., Deutsch, Français"
                  value={newLocale.nativeName}
                  onChange={(e) => setNewLocale({ ...newLocale, nativeName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Flag Emoji
                  </label>
                  <Input
                    placeholder="e.g., 🇩🇪"
                    value={newLocale.flag}
                    onChange={(e) => setNewLocale({ ...newLocale, flag: e.target.value })}
                    maxLength={4}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newLocale.isRtl}
                      onChange={(e) => setNewLocale({ ...newLocale, isRtl: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">Right-to-Left</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowNewLocale(false)}>
                Cancel
              </Button>
              <Button
                onClick={createLocale}
                disabled={isCreatingLocale || !newLocale.code || !newLocale.name}
              >
                {isCreatingLocale ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Language
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TranslationsTab
