/**
 * Alerts Tab
 * System alerts and notifications management
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  RefreshCw,
  Eye,
  Check,
} from 'lucide-react'

interface AdminAlert {
  id: string
  timestamp: string
  type: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  title: string
  message: string
  acknowledged: boolean
  acknowledgedAt?: string
  acknowledgedBy?: string
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string
  resourceType?: string
  resourceId?: string
}

export function AlertsTab() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unacknowledged' | 'unresolved'>('unresolved')

  useEffect(() => {
    fetchAlerts()
  }, [])

  const fetchAlerts = async () => {
    setIsLoading(true)
    try {
      // Simulated alerts - in production, fetch from /api/admin/alerts
      const mockAlerts: AdminAlert[] = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          type: 'high_error_rate',
          severity: 'error',
          title: 'High Error Rate Detected',
          message: 'Error rate exceeded 10% threshold in the last 5 minutes. 15 out of 120 requests failed.',
          acknowledged: false,
          resolved: false,
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          type: 'cost_threshold',
          severity: 'warning',
          title: 'Daily Cost Approaching Limit',
          message: 'AI costs have reached 80% of daily budget ($80 of $100).',
          acknowledged: true,
          acknowledgedAt: new Date(Date.now() - 3000000).toISOString(),
          acknowledgedBy: 'admin@insurai.com',
          resolved: false,
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          type: 'api_latency',
          severity: 'warning',
          title: 'High API Latency',
          message: 'Average response time exceeded 5s threshold. Current: 6.2s',
          acknowledged: true,
          acknowledgedAt: new Date(Date.now() - 6000000).toISOString(),
          acknowledgedBy: 'admin@insurai.com',
          resolved: true,
          resolvedAt: new Date(Date.now() - 5400000).toISOString(),
          resolvedBy: 'system',
        },
        {
          id: '4',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          type: 'new_user_signup',
          severity: 'info',
          title: 'New User Registration',
          message: 'A new user has registered: user@example.com',
          acknowledged: true,
          resolved: true,
          resolvedAt: new Date(Date.now() - 80000000).toISOString(),
        },
      ]

      setAlerts(mockAlerts)
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const acknowledgeAlert = (id: string) => {
    setAlerts(alerts.map((a) =>
      a.id === id
        ? {
            ...a,
            acknowledged: true,
            acknowledgedAt: new Date().toISOString(),
            acknowledgedBy: 'admin',
          }
        : a
    ))
  }

  const resolveAlert = (id: string) => {
    setAlerts(alerts.map((a) =>
      a.id === id
        ? {
            ...a,
            resolved: true,
            resolvedAt: new Date().toISOString(),
            resolvedBy: 'admin',
          }
        : a
    ))
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'info':
        return <Info className="h-5 w-5 text-blue-500" />
      default:
        return <Bell className="h-5 w-5 text-gray-500" />
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge className="bg-red-100 text-red-800">Critical</Badge>
      case 'error':
        return <Badge className="bg-red-100 text-red-800">Error</Badge>
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>
      case 'info':
        return <Badge className="bg-blue-100 text-blue-800">Info</Badge>
      default:
        return <Badge>{severity}</Badge>
    }
  }

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === 'unacknowledged') return !alert.acknowledged
    if (filter === 'unresolved') return !alert.resolved
    return true
  })

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length
  const unresolvedCount = alerts.filter((a) => !a.resolved).length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500">System notifications and alerts</p>
        </div>
        <Button onClick={fetchAlerts} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Bell className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{alerts.length}</div>
                <div className="text-sm text-gray-500">Total Alerts</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <Eye className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{unacknowledgedCount}</div>
                <div className="text-sm text-gray-500">Unacknowledged</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{unresolvedCount}</div>
                <div className="text-sm text-gray-500">Unresolved</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({alerts.length})
        </Button>
        <Button
          variant={filter === 'unacknowledged' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unacknowledged')}
        >
          Unacknowledged ({unacknowledgedCount})
        </Button>
        <Button
          variant={filter === 'unresolved' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unresolved')}
        >
          Unresolved ({unresolvedCount})
        </Button>
      </div>

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <CardTitle>Alert History</CardTitle>
          <CardDescription>
            Showing {filteredAlerts.length} alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading alerts...</div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {filter === 'all' ? 'No alerts' : `No ${filter} alerts`}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${
                    alert.resolved
                      ? 'bg-gray-50 border-gray-200'
                      : alert.severity === 'critical' || alert.severity === 'error'
                      ? 'bg-red-50 border-red-200'
                      : alert.severity === 'warning'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(alert.severity)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{alert.title}</span>
                          {getSeverityBadge(alert.severity)}
                          {alert.resolved && (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                        <div className="text-xs text-gray-400 mt-2">
                          {new Date(alert.timestamp).toLocaleString()}
                          {alert.acknowledgedAt && (
                            <span className="ml-2">
                              • Acknowledged {new Date(alert.acknowledgedAt).toLocaleString()}
                              {alert.acknowledgedBy && ` by ${alert.acknowledgedBy}`}
                            </span>
                          )}
                          {alert.resolvedAt && (
                            <span className="ml-2">
                              • Resolved {new Date(alert.resolvedAt).toLocaleString()}
                              {alert.resolvedBy && ` by ${alert.resolvedBy}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!alert.resolved && (
                      <div className="flex gap-2">
                        {!alert.acknowledged && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Acknowledge
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolveAlert(alert.id)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Resolve
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AlertsTab
