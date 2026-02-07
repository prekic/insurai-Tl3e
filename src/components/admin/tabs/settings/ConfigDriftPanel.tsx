/**
 * Config Drift Panel
 *
 * Detect when runtime configuration has drifted from a known-good baseline.
 * Admins can save baselines, run drift checks, and see per-setting differences.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SettingsSkeleton } from '@/components/ui/loading'
import { adminFetch } from '@/lib/admin/api'
import {
  Camera,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  Loader2,
  Star,
  AlertCircle,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface BaselineSummary {
  id: string
  name: string
  description?: string
  isActive: boolean
  settingsCount: number
  createdBy?: string
  createdAt: string
}

interface DriftChange {
  category: string
  key: string
  baselineValue: unknown
  currentValue: unknown
}

interface DriftReport {
  baseline: { id: string; name: string; created_at: string }
  drifts: DriftChange[]
  totalSettings: number
  driftedCount: number
  matchedCount: number
  missingFromCurrent: number
  addedSinceBaseline: number
  checkedAt: string
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ConfigDriftPanel() {
  const [baselines, setBaselines] = useState<BaselineSummary[]>([])
  const [report, setReport] = useState<DriftReport | null>(null)
  const [noBaseline, setNoBaseline] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBaselines = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/drift/baselines')
      const data = await response.json()
      if (data.success) {
        setBaselines(data.data)
      }
    } catch (err) {
      setError('Failed to load baselines')
      console.warn('[DriftPanel] Fetch error:', err)
    }
  }, [])

  const runDriftCheck = useCallback(async (baselineId?: string) => {
    setIsChecking(true)
    setError(null)
    try {
      const url = baselineId
        ? `/api/admin/drift/check/${baselineId}`
        : '/api/admin/drift/check'
      const response = await adminFetch(url)
      const data = await response.json()
      if (data.success) {
        if (data.data === null) {
          setNoBaseline(true)
          setReport(null)
        } else {
          setReport(data.data)
          setNoBaseline(false)
        }
      }
    } catch (err) {
      setError('Failed to run drift check')
      console.warn('[DriftPanel] Check error:', err)
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      await fetchBaselines()
      await runDriftCheck()
      setIsLoading(false)
    }
    init()
  }, [fetchBaselines, runDriftCheck])

  const handleCreated = (baseline: BaselineSummary) => {
    setBaselines((prev) => {
      // If new baseline is active, deactivate others
      const updated = baseline.isActive
        ? prev.map((b) => ({ ...b, isActive: false }))
        : prev
      return [baseline, ...updated]
    })
    setShowCreate(false)
    // Re-run drift check
    runDriftCheck()
  }

  const handleActivate = async (id: string) => {
    try {
      const response = await adminFetch(`/api/admin/drift/baselines/${id}/activate`, {
        method: 'PUT',
      })
      const data = await response.json()
      if (data.success) {
        setBaselines((prev) =>
          prev.map((b) => ({ ...b, isActive: b.id === id }))
        )
        runDriftCheck()
      }
    } catch (err) {
      console.warn('[DriftPanel] Activate error:', err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await adminFetch(`/api/admin/drift/baselines/${id}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (data.success) {
        setBaselines((prev) => prev.filter((b) => b.id !== id))
        if (report?.baseline.id === id) {
          setReport(null)
        }
      }
    } catch (err) {
      console.warn('[DriftPanel] Delete error:', err)
    }
  }

  if (isLoading) return <SettingsSkeleton />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Config Drift Detection</h3>
          <p className="text-sm text-gray-500 mt-1">
            Compare current settings against a saved baseline to detect unintended changes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runDriftCheck()}
            disabled={isChecking || noBaseline}
          >
            {isChecking ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Check Now
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
            <Camera className="h-4 w-4 mr-1" />
            Save Baseline
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Create Baseline Form */}
      {showCreate && (
        <CreateBaselineForm
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Drift Report */}
      {noBaseline && !showCreate && (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <Camera className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm font-medium">No baseline set</p>
            <p className="text-xs mt-1">Save a baseline snapshot to start detecting configuration drift.</p>
          </CardContent>
        </Card>
      )}

      {report && <DriftReportView report={report} />}

      {/* Saved Baselines */}
      {baselines.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Saved Baselines</h4>
          <div className="space-y-2">
            {baselines.map((b) => (
              <BaselineCard
                key={b.id}
                baseline={b}
                onActivate={handleActivate}
                onDelete={handleDelete}
                onCheck={(id) => runDriftCheck(id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// CREATE FORM
// =============================================================================

function CreateBaselineForm({
  onCreated,
  onCancel,
}: {
  onCreated: (baseline: BaselineSummary) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setIsSaving(true)
    try {
      const response = await adminFetch('/api/admin/drift/baselines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          activate: true,
        }),
      })
      const data = await response.json()
      if (data.success) {
        onCreated(data.data)
      }
    } catch (err) {
      console.warn('[DriftPanel] Create error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Save Current Config as Baseline</CardTitle>
        <CardDescription>
          Takes a snapshot of all current settings to use as a comparison point.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-700">Name</label>
          <Input
            placeholder="e.g. Post-deploy Feb 6"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700">Description (optional)</label>
          <Input
            placeholder="Notes about this baseline..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSaving || !name.trim()}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Camera className="h-4 w-4 mr-1" />
            )}
            Save Baseline
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// DRIFT REPORT VIEW
// =============================================================================

function DriftReportView({ report }: { report: DriftReport }) {
  const hasDrift = report.driftedCount > 0

  // Group drifts by category
  const grouped = report.drifts.reduce<Record<string, DriftChange[]>>((acc, d) => {
    if (!acc[d.category]) acc[d.category] = []
    acc[d.category].push(d)
    return acc
  }, {})

  return (
    <Card className={hasDrift ? 'border-amber-200' : 'border-green-200'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasDrift ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            <CardTitle className="text-base">
              {hasDrift ? 'Drift Detected' : 'No Drift'}
            </CardTitle>
          </div>
          <span className="text-xs text-gray-400">
            vs &quot;{report.baseline.name}&quot; ({new Date(report.baseline.created_at).toLocaleDateString()})
          </span>
        </div>
        <CardDescription>
          {hasDrift
            ? `${report.driftedCount} of ${report.totalSettings} settings have changed since baseline.`
            : `All ${report.matchedCount} settings match the baseline.`}
        </CardDescription>
      </CardHeader>

      {/* Summary badges */}
      <CardContent className="pt-0 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-green-700 bg-green-50">
            {report.matchedCount} matched
          </Badge>
          {report.driftedCount > 0 && (
            <Badge variant="outline" className="text-amber-700 bg-amber-50">
              {report.driftedCount - report.missingFromCurrent - report.addedSinceBaseline} changed
            </Badge>
          )}
          {report.addedSinceBaseline > 0 && (
            <Badge variant="outline" className="text-blue-700 bg-blue-50">
              {report.addedSinceBaseline} added
            </Badge>
          )}
          {report.missingFromCurrent > 0 && (
            <Badge variant="outline" className="text-red-700 bg-red-50">
              {report.missingFromCurrent} removed
            </Badge>
          )}
        </div>

        {/* Drift details by category */}
        {hasDrift && (
          <div className="space-y-3">
            {Object.entries(grouped).map(([category, changes]) => (
              <div key={category}>
                <h4 className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{categoryLabel(category)}</Badge>
                  <span className="text-gray-400">{changes.length} drift{changes.length !== 1 ? 's' : ''}</span>
                </h4>
                <div className="border rounded-lg divide-y">
                  {changes.map((change) => (
                    <div
                      key={`${change.category}-${change.key}`}
                      className="px-3 py-2 flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-600 font-mono text-xs">{change.key}</span>
                      <div className="flex items-center gap-2 text-xs">
                        {change.baselineValue === undefined ? (
                          <span className="text-blue-600 italic">new</span>
                        ) : change.currentValue === undefined ? (
                          <span className="text-red-600 italic">removed</span>
                        ) : (
                          <>
                            <span className="text-red-600 line-through">
                              {formatVal(change.baselineValue)}
                            </span>
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                            <span className="text-green-600 font-medium">
                              {formatVal(change.currentValue)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 text-right">
          Checked {new Date(report.checkedAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// BASELINE CARD
// =============================================================================

function BaselineCard({
  baseline,
  onActivate,
  onDelete,
  onCheck,
}: {
  baseline: BaselineSummary
  onActivate: (id: string) => void
  onDelete: (id: string) => void
  onCheck: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="flex items-center justify-between border rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {baseline.isActive && (
          <Star className="h-4 w-4 text-amber-500 flex-shrink-0" fill="currentColor" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">
            {baseline.name}
            {baseline.isActive && (
              <span className="text-xs text-amber-600 ml-2">active</span>
            )}
          </p>
          <p className="text-xs text-gray-400">
            {baseline.settingsCount} settings &middot; {new Date(baseline.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {!baseline.isActive && (
          <Button variant="ghost" size="sm" onClick={() => onActivate(baseline.id)} title="Set as active">
            <Star className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onCheck(baseline.id)} title="Compare against this baseline">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <Button variant="destructive" size="sm" onClick={() => { onDelete(baseline.id); setConfirmDelete(false) }}>
              <XCircle className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600"
            onClick={() => setConfirmDelete(true)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// HELPERS
// =============================================================================

function formatVal(value: unknown): string {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return value >= 1000 ? value.toLocaleString() : String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    ai: 'AI', evaluation: 'Evaluation', rate_limits: 'Rate Limits',
    ocr: 'OCR', fuzzy_matching: 'Fuzzy Matching', gap_analysis: 'Gap Analysis',
    ui: 'UI', email: 'Email',
  }
  return labels[category] || category
}

export default ConfigDriftPanel
