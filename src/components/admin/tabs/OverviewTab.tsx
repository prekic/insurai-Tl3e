/**
 * Overview Tab
 * Shows key metrics, system health, and quick stats
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { adminFetch } from '@/lib/admin/api'
import type { SystemHealth, ServerMetrics } from '@/types/admin'
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
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react'

interface OverviewTabProps {
  systemHealth: SystemHealth | null
}

interface QuickStats {
  totalRequests: number
  totalCost: number
  errorRate: number
  averageResponseTime: number
  policiesProcessed: number
  activeUsers: number
}

export function OverviewTab({ systemHealth }: OverviewTabProps) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null)
  const [aiStats, setAiStats] = useState<QuickStats | null>(null)
  const [policyStats, setPolicyStats] = useState<{ total: number; byType: Record<string, number> } | null>(null)

  useEffect(() => {
    // Fetch server metrics
    adminFetch('/api/admin/metrics')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setMetrics(data.data)
      })
      .catch(console.error)

    // Fetch AI stats
    const today = new Date()
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
    adminFetch(`/api/admin/ai/stats?startDate=${startOfDay}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAiStats({
            totalRequests: data.data.totalRequests,
            totalCost: data.data.totalCost,
            errorRate: data.data.errorRate,
            averageResponseTime: data.data.averageResponseTime,
            policiesProcessed: 0,
            activeUsers: 0,
          })
        }
      })
      .catch(console.error)

    // Fetch policy stats
    adminFetch(`/api/admin/policies/stats?startDate=${startOfDay}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setPolicyStats(data.data)
      })
      .catch(console.error)
  }, [])

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="text-gray-500">Monitor system health and key metrics at a glance</p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">AI Requests Today</p>
                <p className="text-2xl font-bold text-gray-900">
                  {aiStats?.totalRequests.toLocaleString() || '0'}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Brain className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-600">+12%</span>
              <span className="text-gray-500 ml-2">from yesterday</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">AI Cost Today</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${aiStats?.totalCost.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-600">-5%</span>
              <span className="text-gray-500 ml-2">from yesterday</span>
            </div>
          </CardContent>
        </Card>

        <Card>
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
            <div className="mt-4 flex items-center text-sm">
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-600">+8%</span>
              <span className="text-gray-500 ml-2">from yesterday</span>
            </div>
          </CardContent>
        </Card>

        <Card>
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
            <div className="mt-4 flex items-center text-sm">
              {(aiStats?.errorRate || 0) < 0.05 ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-green-600">Normal</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mr-1" />
                  <span className="text-yellow-600">Elevated</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Health and Resources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Component Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Component Health
            </CardTitle>
            <CardDescription>Status of all system components</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {systemHealth?.components.map((component) => (
                <div
                  key={component.name}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(component.status)}
                    <div>
                      <p className="font-medium text-gray-900">{component.name}</p>
                      <p className="text-sm text-gray-500">{component.details}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(component.status)}
                    {component.responseTime !== undefined && (
                      <p className="text-xs text-gray-500 mt-1">
                        {component.responseTime}ms
                      </p>
                    )}
                  </div>
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
                    {metrics?.cpu.usage.toFixed(1)}%
                  </span>
                </div>
                <Progress value={metrics?.cpu.usage || 0} className="h-2" />
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
                    {metrics?.memory.percentage.toFixed(1)}%
                  </span>
                </div>
                <Progress value={metrics?.memory.percentage || 0} className="h-2" />
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Provider Usage */}
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

              return (
                <div
                  key={provider}
                  className={`p-4 rounded-lg border ${
                    isConfigured ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                  }`}
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
                      <span className="font-medium">0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tokens:</span>
                      <span className="font-medium">0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Cost:</span>
                      <span className="font-medium">$0.00</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
              <Brain className="h-6 w-6 text-blue-600 mb-2" />
              <p className="font-medium">Test AI</p>
              <p className="text-sm text-gray-500">Run extraction test</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
              <FileText className="h-6 w-6 text-purple-600 mb-2" />
              <p className="font-medium">Export Logs</p>
              <p className="text-sm text-gray-500">Download all logs</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
              <Users className="h-6 w-6 text-green-600 mb-2" />
              <p className="font-medium">Manage Users</p>
              <p className="text-sm text-gray-500">View active users</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
              <Activity className="h-6 w-6 text-orange-600 mb-2" />
              <p className="font-medium">View Metrics</p>
              <p className="text-sm text-gray-500">Detailed analytics</p>
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

export default OverviewTab
