/**
 * Admin Notifications Tab
 *
 * Displays API errors, billing issues, and system notifications
 */

import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '@/lib/admin/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface AdminNotification {
  id: string
  type: 'error' | 'warning' | 'info'
  category: 'billing' | 'api_error' | 'rate_limit' | 'system' | 'security'
  title: string
  message: string
  provider?: string
  details?: Record<string, unknown>
  acknowledged: boolean
  created_at: string
  acknowledged_at?: string
  acknowledged_by?: string
}

const categoryLabels: Record<string, string> = {
  billing: 'Billing',
  api_error: 'API Error',
  rate_limit: 'Rate Limit',
  system: 'System',
  security: 'Security',
}

const categoryColors: Record<string, string> = {
  billing: 'bg-red-100 text-red-800',
  api_error: 'bg-orange-100 text-orange-800',
  rate_limit: 'bg-yellow-100 text-yellow-800',
  system: 'bg-blue-100 text-blue-800',
  security: 'bg-purple-100 text-purple-800',
}

const typeIcons: Record<string, string> = {
  error: '!',
  warning: '!',
  info: 'i',
}

const typeColors: Record<string, string> = {
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
}

export function NotificationsTab() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)
      const url = filter === 'all'
        ? '/api/admin/notifications'
        : `/api/admin/notifications?category=${filter}`
      const response = await adminFetch(url)
      const data = await response.json()

      if (data.success) {
        setNotifications(data.data || [])
        setError(null)
      } else {
        setError(data.error || 'Failed to load notifications')
      }
    } catch (err) {
      setError('Failed to load notifications')
      console.error('Failed to load notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleAcknowledge = async (id: string) => {
    try {
      setAcknowledging(id)
      const response = await adminFetch(`/api/admin/notifications/${id}/acknowledge`, {
        method: 'POST',
      })
      const data = await response.json()

      if (data.success) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, acknowledged: true, acknowledged_at: new Date().toISOString() } : n)
        )
      }
    } catch (err) {
      console.error('Failed to acknowledge notification:', err)
    } finally {
      setAcknowledging(null)
    }
  }

  const handleAcknowledgeAll = async () => {
    try {
      setAcknowledging('all')
      const response = await adminFetch('/api/admin/notifications/acknowledge-all', {
        method: 'POST',
      })
      const data = await response.json()

      if (data.success) {
        setNotifications(prev =>
          prev.map(n => ({ ...n, acknowledged: true, acknowledged_at: new Date().toISOString() }))
        )
      }
    } catch (err) {
      console.error('Failed to acknowledge all notifications:', err)
    } finally {
      setAcknowledging(null)
    }
  }

  const unacknowledgedCount = notifications.filter(n => !n.acknowledged).length

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="text-center text-red-600">
            <p className="font-medium">Error loading notifications</p>
            <p className="text-sm mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={fetchNotifications}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Notifications</h2>
          <p className="text-sm text-gray-500">
            API errors, billing issues, and system alerts
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unacknowledgedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAcknowledgeAll}
              disabled={acknowledging === 'all'}
            >
              {acknowledging === 'all' ? 'Acknowledging...' : `Acknowledge All (${unacknowledgedCount})`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchNotifications}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All
        </Button>
        {Object.entries(categoryLabels).map(([key, label]) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-gray-500">
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm mt-1">
                {filter === 'all'
                  ? 'All systems are running smoothly'
                  : `No ${categoryLabels[filter]?.toLowerCase()} notifications`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={notification.acknowledged ? 'opacity-60' : ''}
            >
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  {/* Type Icon */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full ${typeColors[notification.type]} flex items-center justify-center`}>
                    <span className="text-white font-bold text-sm">
                      {typeIcons[notification.type]}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">
                        {notification.title}
                      </h3>
                      <Badge className={categoryColors[notification.category]}>
                        {categoryLabels[notification.category]}
                      </Badge>
                      {notification.provider && (
                        <Badge variant="outline">
                          {notification.provider}
                        </Badge>
                      )}
                      {notification.acknowledged && (
                        <Badge variant="secondary">
                          Acknowledged
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1 text-gray-600">
                      {notification.message}
                    </p>

                    {notification.details && (
                      <details className="mt-2">
                        <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                          Show details
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto">
                          {JSON.stringify(notification.details, null, 2)}
                        </pre>
                      </details>
                    )}

                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                      <span title={formatDate(notification.created_at)}>
                        {formatRelativeTime(notification.created_at)}
                      </span>
                      {notification.acknowledged_at && (
                        <span>
                          Acknowledged by {notification.acknowledged_by || 'admin'} at {formatDate(notification.acknowledged_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {!notification.acknowledged && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAcknowledge(notification.id)}
                      disabled={acknowledging === notification.id}
                    >
                      {acknowledging === notification.id ? '...' : 'Acknowledge'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default NotificationsTab
