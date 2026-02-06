/**
 * Config Performance Panel
 *
 * Displays real-time config fetch performance metrics:
 * - Active performance alerts with severity indicators
 * - Cache hit/miss rates
 * - DB fetch latency (avg, p50, p95, p99)
 * - Per-category breakdown
 * - TTL recommendation
 * - Alert threshold configuration
 * - Recent events log
 */

import { useState, useEffect, useCallback } from 'react'
import { configPerformanceMonitor } from '@/lib/config'
import type { PerformanceSnapshot, AlertThresholds, PerformanceAlert } from '@/lib/config'
import { DEFAULT_ALERT_THRESHOLDS } from '@/lib/config'
import { adminFetch } from '@/lib/admin/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  RefreshCw, Activity, Database, Zap, Clock, AlertTriangle, CheckCircle,
  Server, Monitor, Bell, BellOff, Settings, X,
} from 'lucide-react'

type MetricsSource = 'client' | 'server'

export function ConfigPerformancePanel() {
  const [clientSnapshot, setClientSnapshot] = useState<PerformanceSnapshot | null>(null)
  const [serverSnapshot, setServerSnapshot] = useState<Record<string, unknown> | null>(null)
  const [source, setSource] = useState<MetricsSource>('client')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showThresholdConfig, setShowThresholdConfig] = useState(false)
  const [thresholdEdits, setThresholdEdits] = useState<Partial<AlertThresholds>>({})
  const [isSavingThresholds, setIsSavingThresholds] = useState(false)

  const refreshMetrics = useCallback(() => {
    const snap = configPerformanceMonitor.getSnapshot()
    setClientSnapshot(snap)
  }, [])

  const fetchServerMetrics = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/settings/performance')
      const json = await response.json()
      if (json.success) {
        setServerSnapshot(json.data)
      }
    } catch {
      // Server metrics are optional
    }
  }, [])

  useEffect(() => {
    refreshMetrics()
    fetchServerMetrics()
  }, [refreshMetrics, fetchServerMetrics])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      refreshMetrics()
      if (source === 'server') fetchServerMetrics()
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, source, refreshMetrics, fetchServerMetrics])

  const snapshot = source === 'client' ? clientSnapshot : null
  const serverSnap = source === 'server' ? serverSnapshot : null

  const displayData = source === 'client' ? snapshot : serverSnap
  const totalEvents = source === 'client'
    ? (snapshot?.totalEvents ?? 0)
    : ((serverSnap?.totalEvents as number) ?? 0)

  const cacheData = source === 'client'
    ? snapshot?.cache
    : (serverSnap?.cache as PerformanceSnapshot['cache'] | undefined)

  const dbLatency = source === 'client'
    ? snapshot?.dbLatency
    : (serverSnap?.dbLatency as PerformanceSnapshot['dbLatency'] | undefined)

  const overallLatency = source === 'client'
    ? snapshot?.overallLatency
    : (serverSnap?.overallLatency as PerformanceSnapshot['overallLatency'] | undefined)

  const categories = source === 'client'
    ? snapshot?.categories
    : (serverSnap?.categories as PerformanceSnapshot['categories'] | undefined)

  // Get alerts from the appropriate source
  const alerts: PerformanceAlert[] = source === 'client'
    ? (snapshot?.alerts ?? [])
    : ((serverSnap?.alerts as PerformanceAlert[]) ?? [])

  const currentThresholds: AlertThresholds = source === 'client'
    ? (snapshot?.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS)
    : ((serverSnap?.alertThresholds as AlertThresholds) ?? DEFAULT_ALERT_THRESHOLDS)

  const openThresholdConfig = () => {
    setThresholdEdits({ ...currentThresholds })
    setShowThresholdConfig(true)
  }

  const saveThresholds = async () => {
    setIsSavingThresholds(true)
    try {
      if (source === 'client') {
        configPerformanceMonitor.setAlertThresholds(thresholdEdits)
        refreshMetrics()
      } else {
        const response = await adminFetch('/api/admin/settings/performance/thresholds', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(thresholdEdits),
        })
        const json = await response.json()
        if (json.success) {
          await fetchServerMetrics()
        }
      }
      setShowThresholdConfig(false)
    } catch {
      // Failed to save
    } finally {
      setIsSavingThresholds(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Config Performance</h2>
          {autoRefresh && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
          {alerts.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
              <Bell className="h-3 w-3" />
              {alerts.length} alert{alerts.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Source toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setSource('client')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${source === 'client' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Monitor className="h-3.5 w-3.5" />
              Client
            </button>
            <button
              onClick={() => { setSource('server'); fetchServerMetrics() }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${source === 'server' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Server className="h-3.5 w-3.5" />
              Server
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            Auto
          </label>
          <Button variant="outline" size="sm" onClick={() => { refreshMetrics(); fetchServerMetrics() }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2" data-testid="active-alerts">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                alert.severity === 'critical'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              {alert.severity === 'critical' ? (
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Bell className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${
                  alert.severity === 'critical' ? 'text-red-800' : 'text-amber-800'
                }`}>
                  {alert.message}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Triggered {new Date(alert.triggeredAt).toLocaleTimeString()}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                alert.severity === 'critical'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {alert.severity}
              </span>
            </div>
          ))}
        </div>
      )}

      {!displayData || totalEvents === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Activity className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No performance data yet</p>
          <p className="text-sm mt-1">
            Metrics will appear as configuration is fetched.
            {source === 'client' && ' Navigate to other settings tabs to generate events.'}
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Events */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Database className="h-4 w-4" />
                Total Fetches
              </div>
              <div className="text-2xl font-bold text-gray-900">{totalEvents}</div>
              <div className="text-xs text-gray-400 mt-1">
                {cacheData ? `${cacheData.cacheMisses} DB queries` : ''}
              </div>
            </div>

            {/* Cache Hit Rate */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Zap className="h-4 w-4" />
                Cache Hit Rate
              </div>
              <div className={`text-2xl font-bold ${getCacheHitColor(cacheData?.hitRate ?? 0)}`}>
                {cacheData ? `${(cacheData.hitRate * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {cacheData ? `${cacheData.cacheHits} hits / ${cacheData.cacheMisses} misses` : ''}
              </div>
            </div>

            {/* DB Latency (Avg) */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Clock className="h-4 w-4" />
                DB Avg Latency
              </div>
              <div className={`text-2xl font-bold ${getLatencyColor(dbLatency?.avgMs ?? 0)}`}>
                {dbLatency && dbLatency.count > 0 ? `${dbLatency.avgMs.toFixed(0)}ms` : 'N/A'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {dbLatency && dbLatency.count > 0
                  ? `p95: ${dbLatency.p95Ms.toFixed(0)}ms · p99: ${dbLatency.p99Ms.toFixed(0)}ms`
                  : 'No DB fetches yet'}
              </div>
            </div>

            {/* Error Rate */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <AlertTriangle className="h-4 w-4" />
                Error Rate
              </div>
              <div className={`text-2xl font-bold ${(source === 'client' ? snapshot?.errorRate : (serverSnap?.errorRate as number)) ?? 0 > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {((source === 'client' ? snapshot?.errorRate : (serverSnap?.errorRate as number)) ?? 0 * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {totalEvents > 0 ? 'of all fetches' : ''}
              </div>
            </div>
          </div>

          {/* Latency Distribution */}
          {dbLatency && dbLatency.count > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Database className="h-4 w-4" />
                DB Fetch Latency Distribution
              </h3>
              <div className="grid grid-cols-6 gap-2 text-center">
                {[
                  { label: 'Min', value: dbLatency.minMs },
                  { label: 'Avg', value: dbLatency.avgMs },
                  { label: 'P50', value: dbLatency.p50Ms },
                  { label: 'P95', value: dbLatency.p95Ms },
                  { label: 'P99', value: dbLatency.p99Ms },
                  { label: 'Max', value: dbLatency.maxMs },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-xs text-gray-400 mb-1">{label}</div>
                    <div className={`text-sm font-semibold ${getLatencyColor(value)}`}>
                      {value.toFixed(0)}ms
                    </div>
                  </div>
                ))}
              </div>
              {overallLatency && overallLatency.count > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  Overall (incl. cache hits): avg {overallLatency.avgMs.toFixed(1)}ms · p95 {overallLatency.p95Ms.toFixed(0)}ms
                  {' · '}{overallLatency.count} requests
                </div>
              )}
            </div>
          )}

          {/* Per-Category Stats */}
          {categories && categories.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Per-Category Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-500 font-medium">Category</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Fetches</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Avg Latency</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Hit Rate</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.category} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 font-medium text-gray-900">{cat.category}</td>
                        <td className="py-2 text-right text-gray-600">{cat.fetchCount}</td>
                        <td className={`py-2 text-right font-medium ${getLatencyColor(cat.avgLatencyMs)}`}>
                          {cat.avgLatencyMs.toFixed(0)}ms
                        </td>
                        <td className={`py-2 text-right font-medium ${getCacheHitColor(cat.cacheHitRate)}`}>
                          {(cat.cacheHitRate * 100).toFixed(0)}%
                        </td>
                        <td className={`py-2 text-right ${cat.errorCount > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          {cat.errorCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alert Thresholds Configuration */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Alert Thresholds
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => showThresholdConfig ? setShowThresholdConfig(false) : openThresholdConfig()}
              >
                {showThresholdConfig ? (
                  <><X className="h-3.5 w-3.5 mr-1" /> Cancel</>
                ) : (
                  <><Settings className="h-3.5 w-3.5 mr-1" /> Configure</>
                )}
              </Button>
            </div>

            {showThresholdConfig ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ThresholdInput
                    label="Cache Hit Rate Warning"
                    description="Alert when hit rate drops below"
                    value={thresholdEdits.cacheHitRateWarning ?? currentThresholds.cacheHitRateWarning}
                    onChange={(v) => setThresholdEdits({ ...thresholdEdits, cacheHitRateWarning: v })}
                    format="percent"
                    min={0}
                    max={1}
                    step={0.05}
                  />
                  <ThresholdInput
                    label="Cache Hit Rate Critical"
                    description="Critical alert when hit rate drops below"
                    value={thresholdEdits.cacheHitRateCritical ?? currentThresholds.cacheHitRateCritical}
                    onChange={(v) => setThresholdEdits({ ...thresholdEdits, cacheHitRateCritical: v })}
                    format="percent"
                    min={0}
                    max={1}
                    step={0.05}
                  />
                  <ThresholdInput
                    label="Error Rate Warning"
                    description="Alert when error rate exceeds"
                    value={thresholdEdits.errorRateWarning ?? currentThresholds.errorRateWarning}
                    onChange={(v) => setThresholdEdits({ ...thresholdEdits, errorRateWarning: v })}
                    format="percent"
                    min={0}
                    max={1}
                    step={0.01}
                  />
                  <ThresholdInput
                    label="Error Rate Critical"
                    description="Critical alert when error rate exceeds"
                    value={thresholdEdits.errorRateCritical ?? currentThresholds.errorRateCritical}
                    onChange={(v) => setThresholdEdits({ ...thresholdEdits, errorRateCritical: v })}
                    format="percent"
                    min={0}
                    max={1}
                    step={0.01}
                  />
                  <ThresholdInput
                    label="DB Latency Warning (ms)"
                    description="Alert when avg DB latency exceeds"
                    value={thresholdEdits.dbLatencyWarning ?? currentThresholds.dbLatencyWarning}
                    onChange={(v) => setThresholdEdits({ ...thresholdEdits, dbLatencyWarning: v })}
                    format="ms"
                    min={0}
                    max={10000}
                    step={10}
                  />
                  <ThresholdInput
                    label="DB Latency Critical (ms)"
                    description="Critical alert when avg DB latency exceeds"
                    value={thresholdEdits.dbLatencyCritical ?? currentThresholds.dbLatencyCritical}
                    onChange={(v) => setThresholdEdits({ ...thresholdEdits, dbLatencyCritical: v })}
                    format="ms"
                    min={0}
                    max={10000}
                    step={10}
                  />
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Button size="sm" onClick={saveThresholds} disabled={isSavingThresholds}>
                    Save Thresholds
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setThresholdEdits({ ...DEFAULT_ALERT_THRESHOLDS })}
                  >
                    Reset to Defaults
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-500">Cache Hit Rate:</span>{' '}
                  <span className="font-medium text-amber-600">{(currentThresholds.cacheHitRateWarning * 100).toFixed(0)}%</span>
                  {' / '}
                  <span className="font-medium text-red-600">{(currentThresholds.cacheHitRateCritical * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-gray-500">Error Rate:</span>{' '}
                  <span className="font-medium text-amber-600">{(currentThresholds.errorRateWarning * 100).toFixed(0)}%</span>
                  {' / '}
                  <span className="font-medium text-red-600">{(currentThresholds.errorRateCritical * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-gray-500">DB Latency:</span>{' '}
                  <span className="font-medium text-amber-600">{currentThresholds.dbLatencyWarning}ms</span>
                  {' / '}
                  <span className="font-medium text-red-600">{currentThresholds.dbLatencyCritical}ms</span>
                </div>
              </div>
            )}

            {alerts.length === 0 && totalEvents >= (currentThresholds.minEventsForAlert ?? 20) && (
              <div className="mt-3 flex items-center gap-2 text-xs text-green-600">
                <BellOff className="h-3.5 w-3.5" />
                All metrics within thresholds
              </div>
            )}
          </div>

          {/* TTL Recommendation (client-side only) */}
          {source === 'client' && snapshot?.ttlRecommendation && (
            <div className={`rounded-lg p-4 border ${getRecommendationStyle(snapshot.ttlRecommendation.suggestedTtlMs, snapshot.ttlRecommendation.currentTtlMs)}`}>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                {snapshot.ttlRecommendation.suggestedTtlMs === snapshot.ttlRecommendation.currentTtlMs ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                Cache TTL Recommendation
              </h3>
              <div className="text-sm text-gray-700">
                <p>{snapshot.ttlRecommendation.reason}</p>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span>Current: <strong>{formatMs(snapshot.ttlRecommendation.currentTtlMs)}</strong></span>
                  {snapshot.ttlRecommendation.suggestedTtlMs !== snapshot.ttlRecommendation.currentTtlMs && (
                    <span>Suggested: <strong>{formatMs(snapshot.ttlRecommendation.suggestedTtlMs)}</strong></span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    snapshot.ttlRecommendation.confidence === 'high' ? 'bg-green-100 text-green-700' :
                    snapshot.ttlRecommendation.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {snapshot.ttlRecommendation.confidence} confidence
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Events (client-side only) */}
          {source === 'client' && snapshot?.recentEvents && snapshot.recentEvents.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Events (last 20)</h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-1.5 text-gray-500 font-medium">Time</th>
                      <th className="text-left py-1.5 text-gray-500 font-medium">Category</th>
                      <th className="text-left py-1.5 text-gray-500 font-medium">Method</th>
                      <th className="text-right py-1.5 text-gray-500 font-medium">Latency</th>
                      <th className="text-center py-1.5 text-gray-500 font-medium">Cache</th>
                      <th className="text-center py-1.5 text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.recentEvents.map((event, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-gray-500 font-mono">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-1.5 text-gray-900">{event.category}</td>
                        <td className="py-1.5 text-gray-600">{event.method}</td>
                        <td className={`py-1.5 text-right font-mono ${getLatencyColor(event.latencyMs)}`}>
                          {event.latencyMs.toFixed(1)}ms
                        </td>
                        <td className="py-1.5 text-center">
                          {event.cacheHit ? (
                            <span className="text-green-600">HIT</span>
                          ) : (
                            <span className="text-amber-600">MISS</span>
                          )}
                        </td>
                        <td className="py-1.5 text-center">
                          {event.success ? (
                            <span className="text-green-600">OK</span>
                          ) : (
                            <span className="text-red-600" title={event.errorMessage}>ERR</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// =============================================================================
// THRESHOLD INPUT COMPONENT
// =============================================================================

interface ThresholdInputProps {
  label: string
  description: string
  value: number
  onChange: (value: number) => void
  format: 'percent' | 'ms'
  min: number
  max: number
  step: number
}

function ThresholdInput({ label, description, value, onChange, format, min, max, step }: ThresholdInputProps) {
  const displayValue = format === 'percent' ? (value * 100).toFixed(0) : String(value)

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      <p className="text-xs text-gray-500">{description}</p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={displayValue}
          onChange={(e) => {
            const raw = Number(e.target.value)
            onChange(format === 'percent' ? raw / 100 : raw)
          }}
          min={format === 'percent' ? min * 100 : min}
          max={format === 'percent' ? max * 100 : max}
          step={format === 'percent' ? step * 100 : step}
          className="w-24 text-sm"
        />
        <span className="text-xs text-gray-500">{format === 'percent' ? '%' : 'ms'}</span>
      </div>
    </div>
  )
}

// =============================================================================
// HELPERS
// =============================================================================

function getCacheHitColor(rate: number): string {
  if (rate >= 0.8) return 'text-green-600'
  if (rate >= 0.5) return 'text-amber-600'
  return 'text-red-600'
}

function getLatencyColor(ms: number): string {
  if (ms < 50) return 'text-green-600'
  if (ms < 200) return 'text-amber-600'
  return 'text-red-600'
}

function getRecommendationStyle(suggested: number, current: number): string {
  if (suggested === current) return 'bg-green-50 border-green-200'
  return 'bg-amber-50 border-amber-200'
}

function formatMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)}min`
  if (ms >= 1000) return `${(ms / 1000).toFixed(0)}s`
  return `${ms}ms`
}
