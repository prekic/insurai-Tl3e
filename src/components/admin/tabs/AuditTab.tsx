/**
 * Audit Tab
 * Audit trail and activity logging
 */

import { adminFetch } from '@/lib/admin/api'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  ScrollText,
  Search,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronUp,
  User,
  Settings,
  FileText,
  Shield,
  Key,
} from 'lucide-react'

interface AuditLog {
  id: string
  timestamp: string
  actorId: string
  actorEmail: string
  action: string
  resourceType: string
  resourceId?: string
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>
  ipAddress: string
}

export function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')

  useEffect(() => {
    fetchLogs()
  }, [actionFilter, resourceFilter])

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (actionFilter) params.append('action', actionFilter)
      if (resourceFilter) params.append('resourceType', resourceFilter)
      params.append('limit', '100')

      const response = await adminFetch(`/api/admin/audit/logs?${params}`)
      const data = await response.json()

      if (data.success) {
        setLogs(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const exportLogs = async () => {
    try {
      const response = await adminFetch('/api/admin/export')
      const data = await response.json()

      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export logs:', error)
    }
  }

  const filteredLogs = logs.filter((log) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        log.actorEmail.toLowerCase().includes(query) ||
        log.action.toLowerCase().includes(query) ||
        log.resourceType.toLowerCase().includes(query) ||
        log.resourceId?.toLowerCase().includes(query)
      )
    }
    return true
  })

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      create: 'bg-green-100 text-green-800',
      update: 'bg-blue-100 text-blue-800',
      delete: 'bg-red-100 text-red-800',
      enable: 'bg-green-100 text-green-800',
      disable: 'bg-orange-100 text-orange-800',
      login: 'bg-purple-100 text-purple-800',
      logout: 'bg-gray-100 text-gray-800',
    }
    return <Badge className={colors[action] || 'bg-gray-100 text-gray-800'}>{action}</Badge>
  }

  const getResourceIcon = (resourceType: string) => {
    switch (resourceType) {
      case 'user':
        return <User className="h-4 w-4" />
      case 'config':
        return <Settings className="h-4 w-4" />
      case 'policy':
        return <FileText className="h-4 w-4" />
      case 'feature_flag':
        return <Shield className="h-4 w-4" />
      case 'api_key':
        return <Key className="h-4 w-4" />
      default:
        return <ScrollText className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-gray-500">Track all administrative actions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportLogs}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by user, action, or resource..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="enable">Enable</option>
              <option value="disable">Disable</option>
              <option value="login">Login</option>
            </select>
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
            >
              <option value="">All Resources</option>
              <option value="user">User</option>
              <option value="policy">Policy</option>
              <option value="config">Config</option>
              <option value="feature_flag">Feature Flag</option>
              <option value="prompt_template">Prompt Template</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} of {logs.length} entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading audit logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No audit logs found</div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                >
                  <div
                    className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        {getResourceIcon(log.resourceType)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          {getActionBadge(log.action)}
                          <span className="text-gray-500 text-sm capitalize">
                            {log.resourceType.replace(/_/g, ' ')}
                          </span>
                          {log.resourceId && (
                            <span className="font-mono text-xs text-gray-400">
                              {log.resourceId}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          by <span className="font-medium">{log.actorEmail}</span>
                          {' • '}
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-xs text-gray-400">{log.ipAddress}</span>
                      {log.changes && log.changes.length > 0 && (
                        expandedId === log.id ? (
                          <ChevronUp className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        )
                      )}
                    </div>
                  </div>

                  {/* Expanded Changes */}
                  {expandedId === log.id && log.changes && log.changes.length > 0 && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                      <h4 className="font-medium text-sm text-gray-700 mb-3">Changes</h4>
                      <div className="space-y-2">
                        {log.changes.map((change, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-4 text-sm"
                          >
                            <span className="font-medium text-gray-700 w-32">{change.field}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">
                                  {String(change.oldValue) || '(empty)'}
                                </span>
                                <span className="text-gray-400">→</span>
                                <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs">
                                  {String(change.newValue) || '(empty)'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AuditTab
