/**
 * Retention Settings Panel
 * Configure data retention periods for processing logs and extraction metrics
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSkeleton } from '@/components/ui/loading'
import { adminFetch } from '@/lib/admin/api'
import { Clock, Save, Trash2, Database, Info, RefreshCw } from 'lucide-react'
import type { SettingValue } from '../SettingsTab'

interface RetentionSettingsPanelProps {
  settings: SettingValue[]
  onUpdate: (key: string, value: unknown, reason?: string) => Promise<void>
  onBatchUpdate?: (
    updates: Array<{ key: string; value: unknown }>,
    reason?: string
  ) => Promise<void>
  isLoading: boolean
  isSaving: boolean
}

export function RetentionSettingsPanel({
  settings,
  onUpdate,
  isLoading,
  isSaving,
}: RetentionSettingsPanelProps) {
  const getVal = (key: string): string => {
    const s = settings.find((s) => s.key === key)
    return s ? String(s.value) : ''
  }

  const [logDays, setLogDays] = useState('')
  const [metricsDays, setMetricsDays] = useState('')
  const [dirty, setDirty] = useState(false)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)

  useEffect(() => {
    if (settings.length > 0) {
      setLogDays(getVal('processing_log_retention_days'))
      setMetricsDays(getVal('extraction_metrics_retention_days'))
      setDirty(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  const logNum = parseInt(logDays)
  const metricsNum = parseInt(metricsDays)

  const validationErrors: string[] = []
  if (isNaN(logNum) || logNum < 1 || logNum > 365) {
    validationErrors.push('Processing log retention must be 1-365 days')
  }
  if (isNaN(metricsNum) || metricsNum < 1 || metricsNum > 365) {
    validationErrors.push('Extraction metrics retention must be 1-365 days')
  }

  const canSave = dirty && validationErrors.length === 0

  const handleSave = async () => {
    const updates: Array<{ key: string; value: unknown }> = []
    if (getVal('processing_log_retention_days') !== logDays) {
      updates.push({ key: 'processing_log_retention_days', value: logDays })
    }
    if (getVal('extraction_metrics_retention_days') !== metricsDays) {
      updates.push({ key: 'extraction_metrics_retention_days', value: metricsDays })
    }

    for (const u of updates) {
      await onUpdate(u.key, u.value, 'Updated retention settings')
    }
    setDirty(false)
  }

  const handleManualCleanup = async () => {
    setCleanupRunning(true)
    setCleanupResult(null)
    try {
      const res = await adminFetch(`/api/admin/processing-logs/cleanup?daysOld=${logNum || 90}`, {
        method: 'POST',
      })
      const json = await res.json()
      if (json.success) {
        setCleanupResult(`Cleanup completed: ${json.deleted ?? 0} old logs removed`)
      } else {
        setCleanupResult(`Cleanup failed: ${json.error || 'Unknown error'}`)
      }
    } catch (err) {
      setCleanupResult(`Cleanup error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setCleanupRunning(false)
    }
  }

  if (isLoading) {
    return <SettingsSkeleton groups={2} itemsPerGroup={2} />
  }

  if (settings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Clock className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">No Retention Settings Found</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Run migration 025 to seed retention configuration.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Retention Periods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-500" />
            Data Retention Periods
          </CardTitle>
          <CardDescription>
            Configure how long data is kept before automatic cleanup via pg_cron
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 border rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Processing Logs
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={logDays}
                  onChange={(e) => {
                    setLogDays(e.target.value)
                    setDirty(true)
                  }}
                  className="w-24"
                />
                <span className="text-sm text-gray-500">days</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Document processing pipeline logs. Cleanup runs daily at 04:00 UTC.
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Extraction Metrics
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={metricsDays}
                  onChange={(e) => {
                    setMetricsDays(e.target.value)
                    setDirty(true)
                  }}
                  className="w-24"
                />
                <span className="text-sm text-gray-500">days</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                AI extraction success/failure records. Cleanup runs daily at 03:00 UTC.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Cleanup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" />
            Manual Cleanup
          </CardTitle>
          <CardDescription>
            Trigger an immediate cleanup of processing logs older than the configured retention
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={handleManualCleanup}
              disabled={cleanupRunning}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {cleanupRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Run Cleanup Now
                </>
              )}
            </Button>
            <span className="text-sm text-gray-500">
              Deletes processing logs older than {logNum || 90} days
            </span>
          </div>
          {cleanupResult && (
            <div
              className={`mt-3 text-sm px-3 py-2 rounded ${cleanupResult.includes('failed') || cleanupResult.includes('error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}
            >
              {cleanupResult}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {dirty && validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <ul className="list-disc list-inside space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Save + Info */}
      <div className="flex items-center justify-between">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-blue-700 text-sm flex-1 mr-4">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            Retention values are read by pg_cron cleanup functions at execution time. Changes take
            effect on the next scheduled run (03:00/04:00 UTC daily).
          </span>
        </div>
        <Button onClick={handleSave} disabled={!canSave || isSaving}>
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  )
}
