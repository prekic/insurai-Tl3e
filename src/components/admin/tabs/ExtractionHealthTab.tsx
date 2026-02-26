/**
 * Extraction Health Tab
 *
 * Visualizes the /api/admin/monitoring/extraction-health endpoint:
 * - 24h success/failure rates with error rate indicator
 * - Per-provider latency and failure breakdown
 * - Recent error list with expandable details
 * - Auto-refresh every 10 seconds
 */

import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '@/lib/admin/api'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Server,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProviderStats {
  total: number
  failed: number
  avg_latency_ms: number
}

interface RecentError {
  requestId: string
  provider: string
  code: string
  message: string
  timestamp: string
}

interface HourlyBucket {
  hour: string
  total: number
  success: number
  failed: number
  avg_latency_ms: number
}

interface ExtractionHealthData {
  last_24h: {
    total: number
    success: number
    failed: number
    error_rate: number
  }
  by_provider: Record<string, ProviderStats>
  recent_errors: RecentError[]
  hourly_buckets?: HourlyBucket[]
  buffer_size: number
}

export function ExtractionHealthTab() {
  const [data, setData] = useState<ExtractionHealthData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())

  const fetchHealth = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/monitoring/extraction-health')
      const json = await response.json()
      if (json.success) {
        setData(json.data)
        setError(null)
      } else {
        setError(json.error || 'Failed to fetch extraction health')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchHealth, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchHealth])

  const toggleError = (requestId: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(requestId)) {
        next.delete(requestId)
      } else {
        next.add(requestId)
      }
      return next
    })
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading extraction health...</span>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
        <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 font-medium">{error}</p>
        <Button variant="outline" onClick={fetchHealth} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { last_24h, by_provider, recent_errors, buffer_size } = data
  const errorRatePercent = (last_24h.error_rate * 100).toFixed(1)
  const isHealthy = last_24h.error_rate < 0.05
  const isWarning = last_24h.error_rate >= 0.05 && last_24h.error_rate < 0.2
  const providers = Object.entries(by_provider)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Extraction Health</h2>
          <p className="text-sm text-gray-500">
            Last 24 hours &middot; Buffer: {buffer_size} events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(autoRefresh && 'bg-green-50 border-green-200')}
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', autoRefresh && 'animate-spin')} />
            {autoRefresh ? 'Auto' : 'Paused'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchHealth}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Extractions"
          value={String(last_24h.total)}
          icon={<Activity className="h-5 w-5 text-blue-500" />}
          color="blue"
        />
        <SummaryCard
          label="Successful"
          value={String(last_24h.success)}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          color="green"
        />
        <SummaryCard
          label="Failed"
          value={String(last_24h.failed)}
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          color={last_24h.failed > 0 ? 'red' : 'green'}
        />
        <SummaryCard
          label="Error Rate"
          value={`${errorRatePercent}%`}
          icon={
            isHealthy ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : isWarning ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )
          }
          color={isHealthy ? 'green' : isWarning ? 'amber' : 'red'}
        />
      </div>

      {/* Overall Health Status */}
      <div
        className={cn(
          'p-4 rounded-xl border flex items-center gap-3',
          isHealthy
            ? 'bg-green-50 border-green-200'
            : isWarning
              ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'
        )}
      >
        {isHealthy ? (
          <CheckCircle className="h-6 w-6 text-green-600" />
        ) : isWarning ? (
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        ) : (
          <XCircle className="h-6 w-6 text-red-600" />
        )}
        <div>
          <p
            className={cn(
              'font-semibold',
              isHealthy ? 'text-green-800' : isWarning ? 'text-amber-800' : 'text-red-800'
            )}
          >
            {isHealthy
              ? 'Extraction Pipeline Healthy'
              : isWarning
                ? 'Elevated Error Rate'
                : 'High Error Rate — Investigate'}
          </p>
          <p
            className={cn(
              'text-sm',
              isHealthy ? 'text-green-700' : isWarning ? 'text-amber-700' : 'text-red-700'
            )}
          >
            {last_24h.total === 0
              ? 'No extractions recorded in the buffer. Server may have restarted recently.'
              : `${last_24h.success} of ${last_24h.total} extractions succeeded in the current buffer window.`}
          </p>
        </div>
      </div>

      {/* Hourly Volume Chart (Last 24 Hours) */}
      {data.hourly_buckets && data.hourly_buckets.length > 0 && (
        <HourlyChart buckets={data.hourly_buckets} />
      )}

      {/* Per-Provider Breakdown */}
      {providers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Server className="h-5 w-5 text-gray-500" />
              Provider Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Provider
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Failed
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Error Rate
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Avg Latency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Latency
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {providers.map(([provider, stats]) => {
                  const providerErrorRate = stats.total > 0 ? stats.failed / stats.total : 0
                  const latencyColor =
                    stats.avg_latency_ms < 5000
                      ? 'text-green-600'
                      : stats.avg_latency_ms < 15000
                        ? 'text-amber-600'
                        : 'text-red-600'
                  const latencyBarWidth = Math.min(100, (stats.avg_latency_ms / 30000) * 100)
                  const latencyBarColor =
                    stats.avg_latency_ms < 5000
                      ? 'bg-green-400'
                      : stats.avg_latency_ms < 15000
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                  return (
                    <tr key={provider} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900 capitalize">{provider}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-gray-700">
                        {stats.total}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        <span
                          className={
                            stats.failed > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'
                          }
                        >
                          {stats.failed}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        <span
                          className={
                            providerErrorRate > 0.1 ? 'text-red-600 font-semibold' : 'text-gray-500'
                          }
                        >
                          {(providerErrorRate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn('font-mono font-medium', latencyColor)}>
                          {formatLatency(stats.avg_latency_ms)}
                        </span>
                      </td>
                      <td className="px-6 py-4 w-32">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={cn('h-2 rounded-full', latencyBarColor)}
                            style={{ width: `${latencyBarWidth}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Errors */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Recent Errors
            {recent_errors.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                {recent_errors.length}
              </span>
            )}
          </h3>
        </div>
        {recent_errors.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
            No errors in the current buffer window.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recent_errors.map((err) => {
              const isExpanded = expandedErrors.has(err.requestId)
              return (
                <div key={err.requestId} className="hover:bg-gray-50">
                  <button
                    onClick={() => toggleError(err.requestId)}
                    className="w-full px-6 py-3 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded capitalize">
                            {err.provider}
                          </span>
                          <span className="px-2 py-0.5 text-xs font-mono bg-red-50 text-red-700 rounded">
                            {err.code || 'UNKNOWN'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatTimestamp(err.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1 truncate">{err.message}</p>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-6 pb-4 ml-10">
                      <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
                        <div className="flex gap-2">
                          <span className="text-gray-500 font-medium w-24 flex-shrink-0">
                            Request ID:
                          </span>
                          <span className="font-mono text-gray-700 break-all">{err.requestId}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-gray-500 font-medium w-24 flex-shrink-0">
                            Provider:
                          </span>
                          <span className="text-gray-700 capitalize">{err.provider}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-gray-500 font-medium w-24 flex-shrink-0">
                            Error Code:
                          </span>
                          <span className="font-mono text-red-700">{err.code || 'N/A'}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-gray-500 font-medium w-24 flex-shrink-0">
                            Timestamp:
                          </span>
                          <span className="text-gray-700">
                            {new Date(err.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 font-medium">Full Message:</span>
                          <p className="mt-1 font-mono text-xs text-gray-600 bg-white rounded p-2 border border-gray-200 whitespace-pre-wrap">
                            {err.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info Footer */}
      <p className="text-xs text-gray-400 text-center">
        Metrics are stored in-memory (buffer size: {buffer_size}). Data resets on server restart.
        For persistent metrics, extraction events are also written to the database.
      </p>
    </div>
  )
}

// Helper Components

function HourlyChart({ buckets }: { buckets: HourlyBucket[] }) {
  const maxTotal = Math.max(...buckets.map((b) => b.total), 1)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-blue-500" />
        Extraction Volume (Last 24 Hours)
      </h3>

      {/* Chart */}
      <div className="relative">
        <div className="flex items-end gap-1 h-40">
          {buckets.map((bucket, i) => {
            const successHeight = maxTotal > 0 ? (bucket.success / maxTotal) * 100 : 0
            const failedHeight = maxTotal > 0 ? (bucket.failed / maxTotal) * 100 : 0
            const isHovered = hoveredIndex === i

            return (
              <div
                key={bucket.hour}
                className="flex-1 flex flex-col items-stretch justify-end h-full relative cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Tooltip */}
                {isHovered && bucket.total > 0 && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                    <div className="font-medium">
                      {new Date(bucket.hour).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div>Total: {bucket.total}</div>
                    <div className="text-green-300">Success: {bucket.success}</div>
                    {bucket.failed > 0 && (
                      <div className="text-red-300">Failed: {bucket.failed}</div>
                    )}
                    <div className="text-gray-300">Avg: {formatLatency(bucket.avg_latency_ms)}</div>
                  </div>
                )}
                {/* Bar */}
                {bucket.failed > 0 && (
                  <div
                    className={cn('w-full rounded-t-sm', isHovered ? 'bg-red-500' : 'bg-red-400')}
                    style={{ height: `${failedHeight}%`, minHeight: bucket.failed > 0 ? '2px' : 0 }}
                  />
                )}
                {bucket.success > 0 && (
                  <div
                    className={cn(
                      'w-full',
                      isHovered ? 'bg-green-500' : 'bg-green-400',
                      bucket.failed === 0 && 'rounded-t-sm'
                    )}
                    style={{
                      height: `${successHeight}%`,
                      minHeight: bucket.success > 0 ? '2px' : 0,
                    }}
                  />
                )}
                {bucket.total === 0 && (
                  <div className="w-full bg-gray-100 rounded-t-sm" style={{ height: '2px' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* X-axis labels (every 3rd hour) */}
        <div className="flex gap-1 mt-2">
          {buckets.map((bucket, i) => (
            <div key={bucket.hour} className="flex-1 text-center">
              {i % 3 === 0 ? (
                <span className="text-[10px] text-gray-400">
                  {new Date(bucket.hour).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-green-400 rounded-sm" />
          Success
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-red-400 rounded-sm" />
          Failed
        </div>
        <div className="ml-auto text-gray-400">
          Peak: {Math.max(...buckets.map((b) => b.total))} / hour
        </div>
      </div>
    </div>
  )
}

interface SummaryCardProps {
  label: string
  value: string
  icon: React.ReactNode
  color: 'blue' | 'green' | 'red' | 'amber'
}

function SummaryCard({ label, value, icon, color }: SummaryCardProps) {
  const bgColors = {
    blue: 'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
    red: 'bg-red-50 border-red-100',
    amber: 'bg-amber-50 border-amber-100',
  }

  return (
    <div className={cn('rounded-xl border p-4', bgColors[color])}>
      <div className="flex items-center justify-between mb-2">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  )
}

// Utility functions

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  return date.toLocaleDateString()
}
