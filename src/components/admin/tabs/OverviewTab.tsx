/**
 * Overview Tab
 * Shows key metrics, system health, and quick stats
 * All cards are clickable — expanding to show 1-level-deeper detail
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { adminFetch } from '@/lib/admin/api'
import type { SystemHealth, ServerMetrics, AdminSection } from '@/types/admin'
import {
  Activity,
  Brain,
  FileText,
  Users,
  DollarSign,
  Clock,
  Cpu,
  HardDrive,
  Zap,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'

interface OverviewTabProps {
  systemHealth: SystemHealth | null
  onNavigate?: (tab: AdminSection) => void
}

interface AIStatsResponse {
  totalRequests: number
  totalTokens: number
  totalCost: number
  errorRate: number
  averageResponseTime: number
  byProvider: Record<string, {
    requests: number
    tokens: { input: number; output: number; total: number }
    cost: number
    errorCount: number
    averageResponseTime: number
    errorRate: number
  }>
  byOperation: Record<string, {
    requests: number
    successRate: number
    averageResponseTime: number
    averageTokens: number
    totalCost: number
    // Legacy fields (may not be present from server)
    successes?: number
    totalResponseTime?: number
    totalTokens?: number
  }>
}

interface PolicyStatsResponse {
  total: number
  byType: Record<string, number>
  byStatus: Record<string, number>
  averageExtractionTime: number
  extractionSuccessRate: number
  ocrUsageRate: number
}

// Which detail panel is expanded
type ExpandedCard = 'ai_requests' | 'ai_cost' | 'policies' | 'response_time' | null

export function OverviewTab({ systemHealth, onNavigate }: OverviewTabProps) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null)
  const [aiStats, setAiStats] = useState<AIStatsResponse | null>(null)
  const [policyStats, setPolicyStats] = useState<PolicyStatsResponse | null>(null)
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null)
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null)

  useEffect(() => {
    adminFetch('/api/admin/metrics')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setMetrics(data.data)
      })
      .catch(console.error)

    const today = new Date()
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
    adminFetch(`/api/admin/ai/stats?startDate=${startOfDay}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAiStats(data.data)
      })
      .catch(console.error)

    adminFetch(`/api/admin/policies/stats?startDate=${startOfDay}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setPolicyStats(data.data)
      })
      .catch(console.error)
  }, [])

  const toggleCard = (card: ExpandedCard) => {
    setExpandedCard((prev) => (prev === card ? null : card))
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'unhealthy':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-100 text-green-800">Healthy</Badge>
      case 'degraded':
        return <Badge className="bg-yellow-100 text-yellow-800">Degraded</Badge>
      case 'unhealthy':
        return <Badge className="bg-red-100 text-red-800">Unhealthy</Badge>
      default:
        return <Badge>Unknown</Badge>
    }
  }

  const providerEntries = aiStats?.byProvider
    ? Object.entries(aiStats.byProvider)
    : []
  const operationEntries = aiStats?.byOperation
    ? Object.entries(aiStats.byOperation)
    : []

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="text-gray-500">Monitor system health and key metrics at a glance. Click any card to see details.</p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AI Requests Today */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
          onClick={() => toggleCard('ai_requests')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">AI Requests Today</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(aiStats?.totalRequests ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Brain className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {providerEntries.length} provider{providerEntries.length !== 1 ? 's' : ''} active
              </span>
              {expandedCard === 'ai_requests' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Cost Today */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500"
          onClick={() => toggleCard('ai_cost')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">AI Cost Today</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${(aiStats?.totalCost ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {(aiStats?.totalTokens ?? 0).toLocaleString()} tokens
              </span>
              {expandedCard === 'ai_cost' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Policies Processed */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-purple-500"
          onClick={() => toggleCard('policies')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Policies Processed</p>
                <p className="text-2xl font-bold text-gray-900">
                  {policyStats?.total || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {policyStats?.byType ? Object.keys(policyStats.byType).length : 0} types
              </span>
              {expandedCard === 'policies' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Avg Response Time */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-orange-500"
          onClick={() => toggleCard('response_time')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Avg Response Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {aiStats?.averageResponseTime
                    ? `${(aiStats.averageResponseTime / 1000).toFixed(1)}s`
                    : '0s'}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              {(aiStats?.errorRate || 0) < 0.05 ? (
                <span className="flex items-center text-green-600">
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Normal
                </span>
              ) : (
                <span className="flex items-center text-yellow-600">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Elevated
                </span>
              )}
              {expandedCard === 'response_time' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expanded Detail Panel */}
      {expandedCard && (
        <Card className="border-t-4 border-t-blue-500 animate-in fade-in duration-200">
          <CardContent className="pt-6">
            {expandedCard === 'ai_requests' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">AI Requests Breakdown</h3>
                  <button
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); onNavigate?.('ai_operations') }}
                  >
                    View Full AI Operations <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* By Provider */}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">By Provider</p>
                  {providerEntries.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No requests recorded today</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {providerEntries.map(([provider, data]) => (
                        <div key={provider} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium capitalize text-sm">{provider}</span>
                            <Badge variant="outline" className="text-xs">{data.requests} req</Badge>
                          </div>
                          <div className="text-xs text-gray-500 space-y-0.5">
                            <div className="flex justify-between">
                              <span>Tokens:</span>
                              <span>{(data.tokens?.total ?? 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Cost:</span>
                              <span>${(data.cost ?? 0).toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Errors:</span>
                              <span className={(data.errorCount ?? 0) > 0 ? 'text-red-600 font-medium' : ''}>
                                {data.errorCount ?? 0}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Avg Latency:</span>
                              <span>
                                {(data.averageResponseTime ?? 0) > 0
                                  ? `${((data.averageResponseTime ?? 0) / 1000).toFixed(1)}s`
                                  : '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* By Operation */}
                {operationEntries.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">By Operation</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 uppercase">
                            <th className="pb-2 pr-4">Operation</th>
                            <th className="pb-2 pr-4 text-right">Requests</th>
                            <th className="pb-2 pr-4 text-right">Success</th>
                            <th className="pb-2 pr-4 text-right">Avg Latency</th>
                            <th className="pb-2 text-right">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operationEntries.map(([op, data]) => (
                            <tr key={op} className="border-t border-gray-100">
                              <td className="py-2 pr-4 font-medium capitalize">{op}</td>
                              <td className="py-2 pr-4 text-right">{data.requests}</td>
                              <td className="py-2 pr-4 text-right">
                                {`${((data.successRate ?? 0) * 100).toFixed(0)}%`}
                              </td>
                              <td className="py-2 pr-4 text-right">
                                {(data.averageResponseTime ?? 0) > 0
                                  ? `${((data.averageResponseTime ?? 0) / 1000).toFixed(1)}s`
                                  : '-'}
                              </td>
                              <td className="py-2 text-right">${(data.totalCost ?? 0).toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {expandedCard === 'ai_cost' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Cost Breakdown</h3>
                  <button
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); onNavigate?.('analytics') }}
                  >
                    View Full Analytics <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>

                {providerEntries.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No cost data recorded today</p>
                ) : (
                  <>
                    {/* Cost by provider bar chart */}
                    <div className="space-y-3">
                      {providerEntries.map(([provider, data]) => {
                        const maxCost = Math.max(...providerEntries.map(([, d]) => d.cost), 0.001)
                        const pct = (data.cost / maxCost) * 100
                        return (
                          <div key={provider}>
                            <div className="flex items-center justify-between mb-1 text-sm">
                              <span className="capitalize font-medium">{provider}</span>
                              <span className="text-gray-700">${(data.cost ?? 0).toFixed(4)}</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                              <div
                                className="bg-green-500 h-2.5 rounded-full transition-all"
                                style={{ width: `${Math.max(pct, 1)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                              <span>Input: {(data.tokens?.input ?? 0).toLocaleString()} tokens</span>
                              <span>Output: {(data.tokens?.output ?? 0).toLocaleString()} tokens</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Totals summary */}
                    <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-4 text-center text-sm">
                      <div>
                        <p className="text-gray-500">Total Cost</p>
                        <p className="font-semibold">${(aiStats?.totalCost ?? 0).toFixed(4)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Total Tokens</p>
                        <p className="font-semibold">{(aiStats?.totalTokens ?? 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Error Rate</p>
                        <p className={`font-semibold ${(aiStats?.errorRate || 0) > 0.05 ? 'text-red-600' : 'text-green-600'}`}>
                          {aiStats ? `${(aiStats.errorRate * 100).toFixed(1)}%` : '0%'}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {expandedCard === 'policies' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Policy Processing Breakdown</h3>
                  <button
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); onNavigate?.('policies') }}
                  >
                    View All Policies <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>

                {!policyStats || policyStats.total === 0 ? (
                  <p className="text-sm text-gray-400 italic">No policies processed today</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* By Type */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">By Type</p>
                      <div className="space-y-2">
                        {Object.entries(policyStats.byType ?? {}).map(([type, count]) => (
                          <div key={type} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                            <span className="text-sm capitalize">{type}</span>
                            <Badge variant="outline">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* By Status */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">By Status</p>
                      <div className="space-y-2">
                        {Object.entries(policyStats.byStatus ?? {}).map(([status, count]) => (
                          <div key={status} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                            <span className="text-sm capitalize">{status}</span>
                            <Badge variant="outline">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Extraction Stats */}
                    <div className="sm:col-span-2 bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-4 text-center text-sm">
                      <div>
                        <p className="text-gray-500">Avg Extraction</p>
                        <p className="font-semibold">
                          {policyStats.averageExtractionTime
                            ? `${(policyStats.averageExtractionTime / 1000).toFixed(1)}s`
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Success Rate</p>
                        <p className="font-semibold text-green-600">
                          {policyStats.extractionSuccessRate
                            ? `${(policyStats.extractionSuccessRate * 100).toFixed(0)}%`
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">OCR Usage</p>
                        <p className="font-semibold">
                          {policyStats.ocrUsageRate
                            ? `${(policyStats.ocrUsageRate * 100).toFixed(0)}%`
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {expandedCard === 'response_time' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Response Time by Provider</h3>
                  <button
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); onNavigate?.('extraction_health') }}
                  >
                    View Extraction Health <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>

                {providerEntries.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No response time data today</p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {providerEntries.map(([provider, data]) => {
                        const avgMs = data.averageResponseTime ?? 0
                        const avgS = avgMs / 1000
                        // Scale: 0-60s max for bar
                        const pct = Math.min((avgMs / 60000) * 100, 100)
                        const barColor = avgS > 30 ? 'bg-red-500' : avgS > 10 ? 'bg-yellow-500' : 'bg-blue-500'
                        return (
                          <div key={provider}>
                            <div className="flex items-center justify-between mb-1 text-sm">
                              <span className="capitalize font-medium">{provider}</span>
                              <span className="text-gray-700">{avgS.toFixed(1)}s avg</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                              <div
                                className={`${barColor} h-2.5 rounded-full transition-all`}
                                style={{ width: `${Math.max(pct, 1)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                              <span>{data.requests} requests</span>
                              <span>
                                Error rate: {data.requests > 0
                                  ? `${(((data.errorCount ?? 0) / data.requests) * 100).toFixed(1)}%`
                                  : '0%'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Overall summary */}
                    <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-4 text-center text-sm">
                      <div>
                        <p className="text-gray-500">Overall Avg</p>
                        <p className="font-semibold">
                          {aiStats?.averageResponseTime
                            ? `${(aiStats.averageResponseTime / 1000).toFixed(1)}s`
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Total Requests</p>
                        <p className="font-semibold">{aiStats?.totalRequests || 0}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Error Rate</p>
                        <p className={`font-semibold ${(aiStats?.errorRate || 0) > 0.05 ? 'text-red-600' : 'text-green-600'}`}>
                          {aiStats ? `${(aiStats.errorRate * 100).toFixed(1)}%` : '0%'}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* System Health and Resources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Component Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Component Health
            </CardTitle>
            <CardDescription>Click a component for details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {systemHealth?.components.map((component) => (
                <div key={component.name}>
                  <div
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() =>
                      setExpandedComponent(
                        expandedComponent === component.name ? null : component.name
                      )
                    }
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(component.status)}
                      <div>
                        <p className="font-medium text-gray-900">{component.name}</p>
                        <p className="text-sm text-gray-500">{component.details}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(component.status)}
                      {expandedComponent === component.name ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded component detail */}
                  {expandedComponent === component.name && (
                    <div className="ml-11 mt-1 mb-2 p-3 bg-white border border-gray-200 rounded-lg text-sm space-y-2 animate-in fade-in duration-150">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-gray-500">Response Time</span>
                          <p className="font-medium">
                            {component.responseTime !== undefined
                              ? `${component.responseTime}ms`
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Status</span>
                          <p className="font-medium capitalize">{component.status}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Last Checked</span>
                          <p className="font-medium">
                            {component.lastChecked
                              ? new Date(component.lastChecked).toLocaleTimeString()
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Details</span>
                          <p className="font-medium">{component.details || 'N/A'}</p>
                        </div>
                      </div>
                      {/* Provider-specific: show matching AI stats */}
                      {(() => {
                        const providerName = component.name.toLowerCase()
                        const matchedProvider = providerEntries.find(
                          ([p]) => providerName.includes(p)
                        )
                        if (matchedProvider) {
                          const [, data] = matchedProvider
                          return (
                            <div className="border-t border-gray-100 pt-2 mt-2">
                              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Today&apos;s Usage</p>
                              <div className="grid grid-cols-4 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Requests</span>
                                  <p className="font-medium">{data.requests}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Tokens</span>
                                  <p className="font-medium">{(data.tokens?.total ?? 0).toLocaleString()}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Cost</span>
                                  <p className="font-medium">${(data.cost ?? 0).toFixed(4)}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Errors</span>
                                  <p className={`font-medium ${(data.errorCount ?? 0) > 0 ? 'text-red-600' : ''}`}>
                                    {data.errorCount ?? 0}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Server Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Server Resources
            </CardTitle>
            <CardDescription>Current resource utilization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* CPU */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium">CPU Usage</span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {(metrics?.cpu?.usage ?? 0).toFixed(1)}%
                  </span>
                </div>
                <Progress value={metrics?.cpu?.usage ?? 0} className="h-2" />
                <p className="text-xs text-gray-500 mt-1">
                  {metrics?.cpu.cores || 0} cores available
                </p>
              </div>

              {/* Memory */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium">Memory Usage</span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {(metrics?.memory?.percentage ?? 0).toFixed(1)}%
                  </span>
                </div>
                <Progress value={metrics?.memory?.percentage ?? 0} className="h-2" />
                <p className="text-xs text-gray-500 mt-1">
                  {formatBytes(metrics?.memory.used || 0)} / {formatBytes(metrics?.memory.total || 0)}
                </p>
              </div>

              {/* Heap */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium">Heap Usage</span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {metrics?.process.heapTotal
                      ? ((metrics.process.heapUsed / metrics.process.heapTotal) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <Progress
                  value={
                    metrics?.process.heapTotal
                      ? (metrics.process.heapUsed / metrics.process.heapTotal) * 100
                      : 0
                  }
                  className="h-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formatBytes(metrics?.process.heapUsed || 0)} / {formatBytes(metrics?.process.heapTotal || 0)}
                </p>
              </div>

              {/* Network — bonus detail */}
              {metrics?.network && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium">Network</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                    <div>
                      <p>Req/min</p>
                      <p className="font-medium text-gray-900">{metrics.network.requestsPerMinute}</p>
                    </div>
                    <div>
                      <p>Bytes In</p>
                      <p className="font-medium text-gray-900">{formatBytes(metrics.network.bytesIn)}</p>
                    </div>
                    <div>
                      <p>Bytes Out</p>
                      <p className="font-medium text-gray-900">{formatBytes(metrics.network.bytesOut)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Process Info — bonus detail */}
              {metrics?.process && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium">Process</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                    <div>
                      <p>PID</p>
                      <p className="font-medium text-gray-900">{metrics.process.pid}</p>
                    </div>
                    <div>
                      <p>Uptime</p>
                      <p className="font-medium text-gray-900">{formatUptime(metrics.process.uptime)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Provider Usage — wired with real data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Provider Usage (Today)
          </CardTitle>
          <CardDescription>Request distribution across AI providers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['openai', 'anthropic', 'google'].map((provider) => {
              const isConfigured = systemHealth?.components.find(
                (c) => c.name.toLowerCase().includes(provider)
              )?.status === 'healthy'
              const providerData = aiStats?.byProvider[provider]

              return (
                <div
                  key={provider}
                  className={`p-4 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${
                    isConfigured ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                  }`}
                  onClick={() => onNavigate?.('ai_operations')}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium capitalize">{provider}</span>
                    {isConfigured ? (
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    ) : (
                      <Badge variant="outline">Not Configured</Badge>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Requests:</span>
                      <span className="font-medium">{providerData?.requests || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tokens:</span>
                      <span className="font-medium">{(providerData?.tokens?.total ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Cost:</span>
                      <span className="font-medium">${(providerData?.cost ?? 0).toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions — wired to navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
              onClick={() => onNavigate?.('ai_operations')}
            >
              <Brain className="h-6 w-6 text-blue-600 mb-2" />
              <p className="font-medium">AI Operations</p>
              <p className="text-sm text-gray-500">View AI requests</p>
            </button>
            <button
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
              onClick={() => onNavigate?.('processing_logs')}
            >
              <FileText className="h-6 w-6 text-purple-600 mb-2" />
              <p className="font-medium">Document Journey</p>
              <p className="text-sm text-gray-500">View processing logs</p>
            </button>
            <button
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
              onClick={() => onNavigate?.('users')}
            >
              <Users className="h-6 w-6 text-green-600 mb-2" />
              <p className="font-medium">Manage Users</p>
              <p className="text-sm text-gray-500">View active users</p>
            </button>
            <button
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
              onClick={() => onNavigate?.('extraction_health')}
            >
              <Activity className="h-6 w-6 text-orange-600 mb-2" />
              <p className="font-medium">Extraction Health</p>
              <p className="text-sm text-gray-500">Monitor extraction pipeline</p>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default OverviewTab
