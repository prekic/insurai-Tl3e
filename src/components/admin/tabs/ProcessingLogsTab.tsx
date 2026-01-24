/**
 * Processing Logs Tab
 *
 * Admin dashboard tab for viewing and managing document processing logs.
 * Shows the journey of each uploaded document through the extraction pipeline.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  FileText,
  Eye,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Activity,
  Brain,
  ScanLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/admin/api'
import DocumentJourneyViewer from '../DocumentJourneyViewer'
import type { DocumentProcessingLog } from '@/types/processing-log'

interface ProcessingStats {
  total: number
  completed: number
  failed: number
  processing: number
  avg_duration_ms: number
  ocr_usage_rate: number
  ai_provider_breakdown: Record<string, number>
}

// Error panel component for showing recent failures
function RecentErrorsPanel({
  errors,
  onViewLog,
}: {
  errors: DocumentProcessingLog[]
  onViewLog: (log: DocumentProcessingLog) => void
}) {
  const [expandedError, setExpandedError] = useState<string | null>(null)

  if (errors.length === 0) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 text-red-800 font-medium mb-3">
        <XCircle size={20} />
        Recent Extraction Failures ({errors.length})
      </div>
      <div className="space-y-3">
        {errors.map((log) => (
          <div
            key={log.id || log.document_id}
            className="bg-white border border-red-200 rounded-lg overflow-hidden"
          >
            {/* Error Header */}
            <div
              className="p-3 cursor-pointer hover:bg-red-50 transition-colors"
              onClick={() => setExpandedError(
                expandedError === log.document_id ? null : log.document_id
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-red-500" size={16} />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {log.filename}
                    </div>
                    <div className="text-xs text-gray-500">
                      {log.error_stage && `Stage: ${log.error_stage} • `}
                      {new Date(log.started_at).toLocaleString('tr-TR')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewLog(log)
                    }}
                  >
                    <Eye size={14} className="mr-1" />
                    Details
                  </Button>
                  {expandedError === log.document_id ? (
                    <ChevronUp size={16} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400" />
                  )}
                </div>
              </div>
            </div>

            {/* Expanded Error Details */}
            {expandedError === log.document_id && (
              <div className="border-t border-red-200 p-3 bg-red-50/50">
                {/* Error Message */}
                <div className="mb-3">
                  <div className="text-xs font-medium text-red-700 mb-1">Error Message</div>
                  <div className="text-sm text-red-900 font-mono bg-white p-2 rounded border border-red-200">
                    {log.error_message || 'No error message'}
                  </div>
                </div>

                {/* Error Type */}
                {log.error_type && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-red-700 mb-1">Error Type</div>
                    <div className="text-sm text-red-900">
                      {log.error_type}
                    </div>
                  </div>
                )}

                {/* Error Context */}
                {log.error_context && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-red-700 mb-1">Context</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {log.error_context.extraction_provider && (
                        <div className="bg-white p-2 rounded border border-red-200">
                          <span className="text-gray-500">Provider:</span>{' '}
                          <span className="font-medium">{log.error_context.extraction_provider}</span>
                        </div>
                      )}
                      {log.error_context.document_length && (
                        <div className="bg-white p-2 rounded border border-red-200">
                          <span className="text-gray-500">Doc Length:</span>{' '}
                          <span className="font-medium">{log.error_context.document_length.toLocaleString()} chars</span>
                        </div>
                      )}
                      {log.error_context.last_successful_stage && (
                        <div className="bg-white p-2 rounded border border-red-200">
                          <span className="text-gray-500">Last OK Stage:</span>{' '}
                          <span className="font-medium">{log.error_context.last_successful_stage}</span>
                        </div>
                      )}
                      {log.error_context.ocr_used !== undefined && (
                        <div className="bg-white p-2 rounded border border-red-200">
                          <span className="text-gray-500">OCR Used:</span>{' '}
                          <span className="font-medium">{log.error_context.ocr_used ? 'Yes' : 'No'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Stack Trace */}
                {log.error_stack && (
                  <div>
                    <div className="text-xs font-medium text-red-700 mb-1">Stack Trace</div>
                    <pre className="text-xs text-red-800 bg-white p-2 rounded border border-red-200 overflow-x-auto max-h-32">
                      {log.error_stack}
                    </pre>
                  </div>
                )}

                {/* Data at Failure */}
                {log.error_context?.data_at_failure && Object.keys(log.error_context.data_at_failure).length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-red-700 mb-1">Data at Failure</div>
                    <pre className="text-xs text-red-800 bg-white p-2 rounded border border-red-200 overflow-x-auto max-h-32">
                      {JSON.stringify(log.error_context.data_at_failure, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface Filters {
  status: string
  ocr_used: string
  ai_provider: string
  search: string
  from_date: string
  to_date: string
}

export function ProcessingLogsTab() {
  const [logs, setLogs] = useState<DocumentProcessingLog[]>([])
  const [recentErrors, setRecentErrors] = useState<DocumentProcessingLog[]>([])
  const [stats, setStats] = useState<ProcessingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<DocumentProcessingLog | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 20

  const [filters, setFilters] = useState<Filters>({
    status: '',
    ocr_used: '',
    ai_provider: '',
    search: '',
    from_date: '',
    to_date: '',
  })

  // Fetch recent errors for prominent display
  const fetchRecentErrors = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set('limit', '10')
      params.set('status', 'failed')
      // Get errors from last 7 days
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      params.set('from_date', sevenDaysAgo.toISOString().split('T')[0])

      const response = await adminFetch(`/api/admin/processing-logs?${params.toString()}`)
      const data = await response.json()
      if (data.success) {
        setRecentErrors(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch recent errors:', err)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/processing-logs/stats?days=30')
      const data = await response.json()
      if (data.success) {
        setStats(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('limit', String(pageSize))
      params.set('offset', String(page * pageSize))

      if (filters.status) params.set('status', filters.status)
      if (filters.ocr_used) params.set('ocr_used', filters.ocr_used)
      if (filters.ai_provider) params.set('ai_provider', filters.ai_provider)
      if (filters.search) params.set('search', filters.search)
      if (filters.from_date) params.set('from_date', filters.from_date)
      if (filters.to_date) params.set('to_date', filters.to_date)

      const response = await adminFetch(`/api/admin/processing-logs?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setLogs(data.data)
        setTotal(data.total)
      } else {
        setError(data.error || 'Failed to fetch logs')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs')
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    fetchLogs()
    fetchStats()
    fetchRecentErrors()
  }, [fetchLogs, fetchStats, fetchRecentErrors])

  const handleRefresh = () => {
    fetchLogs()
    fetchStats()
    fetchRecentErrors()
  }

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(0) // Reset to first page on filter change
  }

  const clearFilters = () => {
    setFilters({
      status: '',
      ocr_used: '',
      ai_provider: '',
      search: '',
      from_date: '',
      to_date: '',
    })
    setPage(0)
  }

  const exportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `processing-logs-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatDate = (iso?: string) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('tr-TR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <CheckCircle size={12} />
            Completed
          </span>
        )
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            <XCircle size={12} />
            Failed
          </span>
        )
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            <Loader2 size={12} className="animate-spin" />
            Processing
          </span>
        )
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
            <AlertTriangle size={12} />
            Partial
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
            <Clock size={12} />
            {status}
          </span>
        )
    }
  }

  // If a log is selected, show the detail view
  if (selectedLog) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setSelectedLog(null)}>
            Back to List
          </Button>
          <h2 className="text-lg font-semibold">Document Journey</h2>
        </div>
        <DocumentJourneyViewer log={selectedLog} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Activity size={16} />
              Total Processed
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle size={16} />
              Completed
            </div>
            <div className="text-2xl font-bold text-green-600 mt-1">{stats.completed}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <XCircle size={16} />
              Failed
            </div>
            <div className="text-2xl font-bold text-red-600 mt-1">{stats.failed}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Clock size={16} />
              Avg Duration
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {formatDuration(stats.avg_duration_ms)}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-600 text-sm">
              <ScanLine size={16} />
              OCR Usage
            </div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {stats.ocr_usage_rate.toFixed(0)}%
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-600 text-sm">
              <Brain size={16} />
              AI Provider
            </div>
            <div className="text-sm font-medium text-gray-900 mt-1">
              {Object.entries(stats.ai_provider_breakdown)
                .map(([provider, count]) => `${provider}: ${count}`)
                .join(', ') || '-'}
            </div>
          </div>
        </div>
      )}

      {/* Recent Errors Panel - Prominent display for admin */}
      <RecentErrorsPanel
        errors={recentErrors}
        onViewLog={setSelectedLog}
      />

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search by filename..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} className="mr-2" />
            Filters
            {showFilters ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={cn('mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportLogs}>
            <Download size={16} className="mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="processing">Processing</option>
                <option value="partial">Partial</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OCR Used</label>
              <select
                value={filters.ocr_used}
                onChange={(e) => handleFilterChange('ocr_used', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">AI Provider</label>
              <select
                value={filters.ai_provider}
                onChange={(e) => handleFilterChange('ai_provider', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={filters.from_date}
                onChange={(e) => handleFilterChange('from_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={filters.to_date}
                onChange={(e) => handleFilterChange('to_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Document
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stages
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                OCR / AI
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Started
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                  Loading processing logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  <FileText className="mx-auto mb-2 text-gray-300" size={32} />
                  No processing logs found
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="text-gray-400" size={16} />
                      <div>
                        <div className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
                          {log.filename}
                        </div>
                        {log.extracted_summary?.policy_number && (
                          <div className="text-xs text-gray-500">
                            {log.extracted_summary.policy_number}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(log.status)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {log.stages.length} stages
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDuration(log.total_duration_ms)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {log.ocr_used && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                          <ScanLine size={10} />
                          {log.ocr_engine || 'OCR'}
                        </span>
                      )}
                      {log.ai_provider && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                          <Brain size={10} />
                          {log.ai_provider}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(log.started_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLog(log)}
                    >
                      <Eye size={16} className="mr-1" />
                      View Journey
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * pageSize >= total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProcessingLogsTab
