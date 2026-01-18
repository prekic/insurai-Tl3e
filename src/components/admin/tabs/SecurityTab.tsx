/**
 * Security Tab
 * Security monitoring, rate limiting, and blocked IPs
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Shield,
  AlertTriangle,
  Ban,
  RefreshCw,
  Clock,
  Plus,
  Trash2,
  CheckCircle,
} from 'lucide-react'

interface RateLimitConfig {
  endpoint: string
  windowMs: number
  maxRequests: number
  currentUsage: number
  blockedRequests: number
}

interface BlockedIP {
  ip: string
  reason: string
  blockedAt: string
  expiresAt?: string
  requestCount: number
  isManual: boolean
}

interface SecurityLog {
  id: string
  timestamp: string
  eventType: string
  severity: string
  userId?: string
  ipAddress: string
  details: Record<string, unknown>
  resolved: boolean
}

export function SecurityTab() {
  const [rateLimits, setRateLimits] = useState<RateLimitConfig[]>([])
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([])
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newBlockIP, setNewBlockIP] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [rateLimitRes, logsRes] = await Promise.all([
        fetch('/api/admin/security/rate-limits'),
        fetch('/api/admin/security/logs?limit=20'),
      ])

      const rateLimitData = await rateLimitRes.json()
      const logsData = await logsRes.json()

      if (rateLimitData.success) {
        setRateLimits(rateLimitData.data.endpoints)
        setBlockedIPs(rateLimitData.data.blockedIPs)
      }
      if (logsData.success) {
        setSecurityLogs(logsData.data)
      }
    } catch (error) {
      console.error('Failed to fetch security data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const blockIP = async () => {
    if (!newBlockIP || !newBlockReason) return

    try {
      const response = await fetch('/api/admin/security/block-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: newBlockIP, reason: newBlockReason }),
      })

      if (response.ok) {
        setBlockedIPs([
          ...blockedIPs,
          {
            ip: newBlockIP,
            reason: newBlockReason,
            blockedAt: new Date().toISOString(),
            requestCount: 0,
            isManual: true,
          },
        ])
        setNewBlockIP('')
        setNewBlockReason('')
      }
    } catch (error) {
      console.error('Failed to block IP:', error)
    }
  }

  const unblockIP = async (ip: string) => {
    try {
      const response = await fetch(`/api/admin/security/block-ip/${ip}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setBlockedIPs(blockedIPs.filter((b) => b.ip !== ip))
      }
    } catch (error) {
      console.error('Failed to unblock IP:', error)
    }
  }

  const resolveLog = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/security/logs/${id}/resolve`, {
        method: 'POST',
      })

      if (response.ok) {
        setSecurityLogs(securityLogs.map((l) => (l.id === id ? { ...l, resolved: true } : l)))
      }
    } catch (error) {
      console.error('Failed to resolve log:', error)
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge className="bg-red-100 text-red-800">Critical</Badge>
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800">High</Badge>
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
      case 'low':
        return <Badge className="bg-blue-100 text-blue-800">Low</Badge>
      default:
        return <Badge variant="outline">{severity}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security</h1>
          <p className="text-gray-500">Monitor rate limits, blocked IPs, and security events</p>
        </div>
        <Button onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Rate Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Rate Limits
          </CardTitle>
          <CardDescription>Current rate limit configuration and usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {rateLimits.map((limit) => (
              <div key={limit.endpoint} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono text-sm">{limit.endpoint}</span>
                    <span className="text-gray-500 text-sm ml-2">
                      ({limit.maxRequests} requests / {limit.windowMs / 60000}min)
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">{limit.currentUsage}</span>
                    <span className="text-gray-400"> / {limit.maxRequests}</span>
                  </div>
                </div>
                <Progress
                  value={(limit.currentUsage / limit.maxRequests) * 100}
                  className="h-2"
                />
                {limit.blockedRequests > 0 && (
                  <div className="mt-2 text-sm text-red-600">
                    {limit.blockedRequests} requests blocked
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Blocked IPs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Blocked IPs
          </CardTitle>
          <CardDescription>Manage IP blocklist</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Add new block */}
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="IP address"
              value={newBlockIP}
              onChange={(e) => setNewBlockIP(e.target.value)}
              className="w-40"
            />
            <Input
              placeholder="Reason"
              value={newBlockReason}
              onChange={(e) => setNewBlockReason(e.target.value)}
              className="flex-1"
            />
            <Button onClick={blockIP} disabled={!newBlockIP || !newBlockReason}>
              <Plus className="h-4 w-4 mr-2" />
              Block
            </Button>
          </div>

          {/* Blocked IPs list */}
          {blockedIPs.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No blocked IPs</div>
          ) : (
            <div className="space-y-2">
              {blockedIPs.map((blocked) => (
                <div
                  key={blocked.ip}
                  className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
                >
                  <div>
                    <span className="font-mono">{blocked.ip}</span>
                    <span className="text-gray-500 text-sm ml-2">{blocked.reason}</span>
                    <div className="text-xs text-gray-400">
                      Blocked: {new Date(blocked.blockedAt).toLocaleString()}
                      {blocked.expiresAt && ` • Expires: ${new Date(blocked.expiresAt).toLocaleString()}`}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => unblockIP(blocked.ip)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Events
          </CardTitle>
          <CardDescription>Recent security-related events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4 text-gray-500">Loading...</div>
          ) : securityLogs.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No security events</div>
          ) : (
            <div className="space-y-3">
              {securityLogs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    log.resolved ? 'bg-gray-50' : 'bg-orange-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {log.resolved ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">
                          {log.eventType.replace(/_/g, ' ')}
                        </span>
                        {getSeverityBadge(log.severity)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                        {' • '}
                        <span className="font-mono">{log.ipAddress}</span>
                        {log.userId && ` • User: ${log.userId.slice(0, 8)}...`}
                      </div>
                    </div>
                  </div>
                  {!log.resolved && (
                    <Button variant="outline" size="sm" onClick={() => resolveLog(log.id)}>
                      Resolve
                    </Button>
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

export default SecurityTab
