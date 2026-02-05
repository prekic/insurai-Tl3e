/**
 * Settings History Panel
 * Display audit log for settings changes
 */

import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '@/lib/admin/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  History,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  FileText,
  ArrowRight,
  Filter,
  ChevronLeft,
  ChevronRight,
  Brain,
  Gauge,
  Timer,
  Eye,
  AlertCircle,
} from 'lucide-react'

interface SettingsHistoryEntry {
  id: string
  settingId: string | null
  category: string
  key: string
  previousValue: unknown
  newValue: unknown
  changedBy: string | null
  changedByEmail: string
  changedAt: string
  reason: string | null
  ipAddress: string | null
  userAgent: string | null
}

interface HistoryPagination {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  ai: 'bg-purple-100 text-purple-800',
  evaluation: 'bg-blue-100 text-blue-800',
  rate_limits: 'bg-orange-100 text-orange-800',
  ocr: 'bg-green-100 text-green-800',
  feature_flags: 'bg-gray-100 text-gray-800',
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  ai: <Brain className="h-4 w-4" />,
  evaluation: <Gauge className="h-4 w-4" />,
  rate_limits: <Timer className="h-4 w-4" />,
  ocr: <Eye className="h-4 w-4" />,
  feature_flags: <FileText className="h-4 w-4" />,
}

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI Settings',
  evaluation: 'Evaluation',
  rate_limits: 'Rate Limits',
  ocr: 'OCR',
  feature_flags: 'Feature Flags',
}

export function SettingsHistoryPanel() {
  const [history, setHistory] = useState<SettingsHistoryEntry[]>([])
  const [pagination, setPagination] = useState<HistoryPagination>({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async (offset = 0) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (categoryFilter) params.append('category', categoryFilter)
      params.append('limit', '20')
      params.append('offset', String(offset))

      const response = await adminFetch(`/api/admin/settings/history?${params}`)
      const data = await response.json()

      if (data.success) {
        setHistory(data.data.history)
        setPagination(data.data.pagination)
      } else {
        setError(data.error || 'Failed to fetch history')
      }
    } catch (err) {
      console.error('Failed to fetch settings history:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch history')
    } finally {
      setIsLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => {
    fetchHistory(0)
  }, [fetchHistory])

  const handleNextPage = () => {
    const newOffset = pagination.offset + pagination.limit
    fetchHistory(newOffset)
  }

  const handlePrevPage = () => {
    const newOffset = Math.max(0, pagination.offset - pagination.limit)
    fetchHistory(newOffset)
  }

  const filteredHistory = history.filter((entry) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        entry.key.toLowerCase().includes(query) ||
        entry.category.toLowerCase().includes(query) ||
        entry.changedByEmail.toLowerCase().includes(query) ||
        (entry.reason && entry.reason.toLowerCase().includes(query))
      )
    }
    return true
  })

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(empty)'
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatKeyLabel = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
  }

  if (isLoading && history.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
            <p className="text-gray-500">Loading settings history...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">Failed to Load History</h3>
              <p className="text-gray-500 text-sm max-w-sm">{error}</p>
            </div>
            <Button onClick={() => fetchHistory(0)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (history.length === 0 && !searchQuery && !categoryFilter) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <History className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">No Settings Changes Yet</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Settings changes will appear here when administrators modify configuration values.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by key, category, or user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="">All Categories</option>
                <option value="ai">AI Settings</option>
                <option value="evaluation">Evaluation</option>
                <option value="rate_limits">Rate Limits</option>
                <option value="ocr">OCR</option>
                <option value="feature_flags">Feature Flags</option>
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() => fetchHistory(0)}
              disabled={isLoading}
              aria-label="Refresh history"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-500" />
            Settings Change History
          </CardTitle>
          <CardDescription>
            {filteredHistory.length === 0
              ? 'No matching changes found'
              : `Showing ${filteredHistory.length} of ${pagination.total} changes`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No settings changes match your search criteria
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
                >
                  {/* Entry Header */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setExpandedId(expandedId === entry.id ? null : entry.id)
                      }
                    }}
                    aria-expanded={expandedId === entry.id}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${CATEGORY_COLORS[entry.category] || 'bg-gray-100'}`}>
                        {CATEGORY_ICONS[entry.category] || <FileText className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">
                            {formatKeyLabel(entry.key)}
                          </span>
                          <Badge variant="outline" className={CATEGORY_COLORS[entry.category] || ''}>
                            {CATEGORY_LABELS[entry.category] || entry.category}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {entry.changedByEmail}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(entry.changedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {entry.reason && (
                        <span className="text-xs text-gray-400 max-w-[200px] truncate hidden sm:block">
                          {entry.reason}
                        </span>
                      )}
                      {expandedId === entry.id ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === entry.id && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-4">
                      {/* Value Change */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm text-gray-700">Value Change</h4>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                          <div className="flex-1 w-full">
                            <div className="text-xs text-gray-500 mb-1">Previous Value</div>
                            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 font-mono text-sm text-red-800 overflow-x-auto">
                              <pre className="whitespace-pre-wrap break-all">
                                {formatValue(entry.previousValue)}
                              </pre>
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0 hidden sm:block" />
                          <div className="flex-1 w-full">
                            <div className="text-xs text-gray-500 mb-1">New Value</div>
                            <div className="bg-green-50 border border-green-200 rounded px-3 py-2 font-mono text-sm text-green-800 overflow-x-auto">
                              <pre className="whitespace-pre-wrap break-all">
                                {formatValue(entry.newValue)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Reason */}
                      {entry.reason && (
                        <div className="space-y-1">
                          <h4 className="font-medium text-sm text-gray-700">Reason for Change</h4>
                          <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded px-3 py-2">
                            {entry.reason}
                          </p>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Changed At:</span>{' '}
                          <span className="text-gray-900">
                            {new Date(entry.changedAt).toLocaleString()}
                          </span>
                        </div>
                        {entry.ipAddress && (
                          <div>
                            <span className="text-gray-500">IP Address:</span>{' '}
                            <span className="font-mono text-gray-900">{entry.ipAddress}</span>
                          </div>
                        )}
                        {entry.settingId && (
                          <div>
                            <span className="text-gray-500">Setting ID:</span>{' '}
                            <span className="font-mono text-xs text-gray-600">{entry.settingId}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-500">
                Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={pagination.offset === 0 || isLoading}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!pagination.hasMore || isLoading}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default SettingsHistoryPanel
