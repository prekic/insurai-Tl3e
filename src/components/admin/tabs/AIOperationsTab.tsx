/**
 * AI Operations Tab
 * Monitor all AI requests, prompts, responses, and costs
 */

import { adminFetch } from '@/lib/admin/api'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { AIRequest, AIProvider, AIOperation } from '@/types/admin'
import {
  Search,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Coins,
  MessageSquare,
  FileText,
  Eye,
  RefreshCw,
} from 'lucide-react'

export function AIOperationsTab() {
  const [requests, setRequests] = useState<AIRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Filters
  const [providerFilter, setProviderFilter] = useState<AIProvider | ''>('')
  const [operationFilter, setOperationFilter] = useState<AIOperation | ''>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchRequests = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (providerFilter) params.append('provider', providerFilter)
      if (operationFilter) params.append('operation', operationFilter)
      if (statusFilter) params.append('status', statusFilter)
      params.append('limit', '100')

      const response = await adminFetch(`/api/admin/ai/requests?${params}`)
      const data = await response.json()

      if (data.success) {
        setRequests(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch AI requests:', error)
    } finally {
      setIsLoading(false)
    }
  }, [providerFilter, operationFilter, statusFilter])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const filteredRequests = requests.filter((req) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        req.prompt.toLowerCase().includes(query) ||
        req.response?.toLowerCase().includes(query) ||
        req.id.toLowerCase().includes(query) ||
        req.userId?.toLowerCase().includes(query)
      )
    }
    return true
  })

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800">Success</Badge>
      case 'error':
        return <Badge className="bg-red-100 text-red-800">Error</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
      case 'timeout':
        return <Badge className="bg-orange-100 text-orange-800">Timeout</Badge>
      case 'rate_limited':
        return <Badge className="bg-purple-100 text-purple-800">Rate Limited</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'extraction':
        return <FileText className="h-4 w-4" />
      case 'chat':
        return <MessageSquare className="h-4 w-4" />
      case 'ocr':
        return <Eye className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'text-green-600 bg-green-50'
      case 'anthropic':
        return 'text-orange-600 bg-orange-50'
      case 'google':
        return 'text-blue-600 bg-blue-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  // Calculate stats
  const totalRequests = requests.length
  const totalCost = requests.reduce((sum, r) => sum + (r.cost?.total ?? 0), 0)
  const totalTokens = requests.reduce((sum, r) => sum + (r.tokens?.total ?? 0), 0)
  const avgResponseTime = requests.length > 0
    ? requests.reduce((sum, r) => sum + r.responseTime, 0) / requests.length
    : 0
  const errorCount = requests.filter((r) => r.status === 'error').length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Operations</h1>
          <p className="text-gray-500">Monitor all AI requests, prompts, and responses</p>
        </div>
        <Button onClick={fetchRequests} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Total Requests</div>
            <div className="text-2xl font-bold">{totalRequests}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Total Cost</div>
            <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Total Tokens</div>
            <div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Avg Response</div>
            <div className="text-2xl font-bold">{(avgResponseTime / 1000).toFixed(2)}s</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Errors</div>
            <div className="text-2xl font-bold text-red-600">{errorCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search prompts, responses, IDs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value as AIProvider | '')}
            >
              <option value="">All Providers</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
            </select>
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              value={operationFilter}
              onChange={(e) => setOperationFilter(e.target.value as AIOperation | '')}
            >
              <option value="">All Operations</option>
              <option value="extraction">Extraction</option>
              <option value="chat">Chat</option>
              <option value="ocr">OCR</option>
            </select>
            <select
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="pending">Pending</option>
              <option value="timeout">Timeout</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      <Card>
        <CardHeader>
          <CardTitle>Request Log</CardTitle>
          <CardDescription>
            Showing {filteredRequests.length} of {totalRequests} requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No AI requests found
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((request) => (
                <div
                  key={request.id}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                >
                  {/* Request Header */}
                  <div
                    className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                    onClick={() => setExpandedId(expandedId === request.id ? null : request.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${getProviderColor(request.provider)}`}>
                        {getOperationIcon(request.operation)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{request.operation}</span>
                          <Badge variant="outline" className="text-xs">
                            {request.provider}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {request.model}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(request.timestamp).toLocaleString()}
                          {request.userId && ` • User: ${request.userId.slice(0, 8)}...`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Clock className="h-3 w-3" />
                          {(request.responseTime / 1000).toFixed(2)}s
                        </div>
                        <div className="flex items-center gap-1 text-gray-600">
                          <Coins className="h-3 w-3" />
                          ${(request.cost?.total ?? 0).toFixed(4)}
                        </div>
                      </div>
                      {getStatusBadge(request.status)}
                      {expandedId === request.id ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === request.id && (
                    <div className="p-4 border-t border-gray-200 space-y-4">
                      {/* Token Usage */}
                      <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="text-xs text-gray-500">Input Tokens</div>
                          <div className="font-medium">{(request.tokens?.input ?? 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Output Tokens</div>
                          <div className="font-medium">{(request.tokens?.output ?? 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Total Cost</div>
                          <div className="font-medium">${(request.cost?.total ?? 0).toFixed(6)}</div>
                        </div>
                      </div>

                      {/* System Prompt */}
                      {request.systemPrompt && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-700">System Prompt</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(request.systemPrompt ?? '', `system-${request.id}`)}
                            >
                              {copiedId === `system-${request.id}` ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto max-h-40">
                            {request.systemPrompt}
                          </pre>
                        </div>
                      )}

                      {/* User Prompt */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-700">User Prompt / Input</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(request.prompt, `prompt-${request.id}`)}
                          >
                            {copiedId === `prompt-${request.id}` ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <pre className="p-3 bg-blue-50 text-blue-900 rounded-lg text-sm overflow-x-auto max-h-60">
                          {request.prompt.length > 2000
                            ? `${request.prompt.slice(0, 2000)}...\n\n[Truncated - ${request.prompt.length} total characters]`
                            : request.prompt}
                        </pre>
                      </div>

                      {/* Response */}
                      {request.response && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-700">Response</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(request.response ?? '', `response-${request.id}`)}
                            >
                              {copiedId === `response-${request.id}` ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <pre className="p-3 bg-green-50 text-green-900 rounded-lg text-sm overflow-x-auto max-h-60">
                            {request.response.length > 2000
                              ? `${request.response.slice(0, 2000)}...\n\n[Truncated - ${request.response.length} total characters]`
                              : request.response}
                          </pre>
                        </div>
                      )}

                      {/* Error */}
                      {request.error && (
                        <div>
                          <h4 className="font-medium text-red-700 mb-2">Error</h4>
                          <pre className="p-3 bg-red-50 text-red-900 rounded-lg text-sm overflow-x-auto">
                            {request.error}
                          </pre>
                        </div>
                      )}

                      {/* Parameters */}
                      {Object.keys(request.parameters ?? {}).length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-700 mb-2">Parameters</h4>
                          <pre className="p-3 bg-gray-50 rounded-lg text-sm overflow-x-auto">
                            {JSON.stringify(request.parameters, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Request ID:</span>
                          <div className="font-mono text-xs">{request.id}</div>
                        </div>
                        {request.policyId && (
                          <div>
                            <span className="text-gray-500">Policy ID:</span>
                            <div className="font-mono text-xs">{request.policyId}</div>
                          </div>
                        )}
                        {request.clientIp && (
                          <div>
                            <span className="text-gray-500">Client IP:</span>
                            <div className="font-mono text-xs">{request.clientIp}</div>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">Endpoint:</span>
                          <div className="font-mono text-xs">{request.endpoint}</div>
                        </div>
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

export default AIOperationsTab
