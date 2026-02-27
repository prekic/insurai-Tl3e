/**
 * Monitoring Alerts Panel
 * Configure extraction health alert thresholds and notification settings
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSkeleton } from '@/components/ui/loading'
import { adminFetch } from '@/lib/admin/api'
import { Bell, Save, AlertTriangle, Activity, Mail, Info, RefreshCw } from 'lucide-react'
import type { SettingValue } from '../SettingsTab'

interface MonitoringAlertsPanelProps {
  settings: SettingValue[]
  onUpdate: (key: string, value: unknown, reason?: string) => Promise<void>
  onBatchUpdate?: (
    updates: Array<{ key: string; value: unknown }>,
    reason?: string
  ) => Promise<void>
  isLoading: boolean
  isSaving: boolean
}

interface AlertStatus {
  lastFired: Record<string, number>
}

export function MonitoringAlertsPanel({
  settings,
  onUpdate,
  isLoading,
  isSaving,
}: MonitoringAlertsPanelProps) {
  const [alertStatus, setAlertStatus] = useState<AlertStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)

  const getVal = (key: string): string => {
    const s = settings.find((s) => s.key === key)
    return s ? String(s.value) : ''
  }

  const [warningThreshold, setWarningThreshold] = useState('')
  const [criticalThreshold, setCriticalThreshold] = useState('')
  const [latencyMs, setLatencyMs] = useState('')
  const [cooldownMin, setCooldownMin] = useState('')
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailAddresses, setEmailAddresses] = useState('')
  const [minRequests, setMinRequests] = useState('')
  const [dirty, setDirty] = useState(false)

  // Sync from settings on load
  useEffect(() => {
    if (settings.length > 0) {
      setWarningThreshold(getVal('error_rate_warning_threshold'))
      setCriticalThreshold(getVal('error_rate_critical_threshold'))
      setLatencyMs(getVal('avg_latency_critical_ms'))
      setCooldownMin(getVal('alert_cooldown_minutes'))
      setEmailEnabled(getVal('enable_email_alerts') === 'true')
      setEmailAddresses(getVal('alert_email_addresses'))
      setMinRequests(getVal('min_provider_requests_for_latency_alert') || '3')
      setDirty(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  const fetchAlertStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await adminFetch('/api/admin/monitoring/alerts/status')
      const json = await res.json()
      if (json.success) {
        setAlertStatus(json.data)
      }
    } catch {
      // Silently fail — status is informational
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlertStatus()
  }, [fetchAlertStatus])

  const warnNum = parseFloat(warningThreshold)
  const critNum = parseFloat(criticalThreshold)
  const latNum = parseInt(latencyMs)
  const coolNum = parseInt(cooldownMin)
  const minReqNum = parseInt(minRequests)

  const validationErrors: string[] = []
  if (isNaN(warnNum) || warnNum < 0 || warnNum > 1)
    validationErrors.push('Warning threshold must be 0-1')
  if (isNaN(critNum) || critNum < 0 || critNum > 1)
    validationErrors.push('Critical threshold must be 0-1')
  if (warnNum >= critNum) validationErrors.push('Warning must be less than critical')
  if (isNaN(latNum) || latNum < 1000) validationErrors.push('Latency must be at least 1000ms')
  if (isNaN(coolNum) || coolNum < 1 || coolNum > 60)
    validationErrors.push('Cooldown must be 1-60 minutes')
  if (isNaN(minReqNum) || minReqNum < 1 || minReqNum > 100)
    validationErrors.push('Min provider requests must be 1-100')

  const canSave = dirty && validationErrors.length === 0

  const handleSave = async () => {
    const updates: Array<{ key: string; value: unknown }> = []
    if (getVal('error_rate_warning_threshold') !== warningThreshold) {
      updates.push({ key: 'error_rate_warning_threshold', value: warningThreshold })
    }
    if (getVal('error_rate_critical_threshold') !== criticalThreshold) {
      updates.push({ key: 'error_rate_critical_threshold', value: criticalThreshold })
    }
    if (getVal('avg_latency_critical_ms') !== latencyMs) {
      updates.push({ key: 'avg_latency_critical_ms', value: latencyMs })
    }
    if (getVal('alert_cooldown_minutes') !== cooldownMin) {
      updates.push({ key: 'alert_cooldown_minutes', value: cooldownMin })
    }
    if (getVal('enable_email_alerts') !== String(emailEnabled)) {
      updates.push({ key: 'enable_email_alerts', value: String(emailEnabled) })
    }
    if (getVal('alert_email_addresses') !== emailAddresses) {
      updates.push({ key: 'alert_email_addresses', value: emailAddresses })
    }
    if (getVal('min_provider_requests_for_latency_alert') !== minRequests) {
      updates.push({ key: 'min_provider_requests_for_latency_alert', value: minRequests })
    }

    for (const u of updates) {
      await onUpdate(u.key, u.value, 'Updated monitoring alert settings')
    }
    setDirty(false)
  }

  if (isLoading) {
    return <SettingsSkeleton groups={3} itemsPerGroup={2} />
  }

  if (settings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Bell className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">No Monitoring Settings Found</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Run migration 025 to seed monitoring configuration.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const activeAlertCount = alertStatus ? Object.keys(alertStatus.lastFired).length : 0

  return (
    <div className="space-y-6">
      {/* Alert Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Alert Status
          </CardTitle>
          <CardDescription>Current state of extraction health alerts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              {activeAlertCount > 0 ? (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {activeAlertCount} alert{activeAlertCount !== 1 ? 's' : ''} fired recently
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600">
                  <Activity className="h-4 w-4" />
                  <span className="text-sm font-medium">No recent alerts</span>
                </div>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={fetchAlertStatus} disabled={statusLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${statusLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          {alertStatus && activeAlertCount > 0 && (
            <div className="mt-3 space-y-1">
              {Object.entries(alertStatus.lastFired).map(([key, timestamp]) => (
                <div key={key} className="text-xs text-gray-500 flex justify-between">
                  <span className="font-mono">{key}</span>
                  <span>{new Date(timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Rate Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Error Rate Thresholds
          </CardTitle>
          <CardDescription>
            Configure when alerts fire based on 24h extraction error rate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Warning Threshold
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={warningThreshold}
                  onChange={(e) => {
                    setWarningThreshold(e.target.value)
                    setDirty(true)
                  }}
                  className="w-28"
                />
                <span className="text-sm text-gray-500">({(warnNum * 100 || 0).toFixed(0)}%)</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Creates a warning notification</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Critical Threshold
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={criticalThreshold}
                  onChange={(e) => {
                    setCriticalThreshold(e.target.value)
                    setDirty(true)
                  }}
                  className="w-28"
                />
                <span className="text-sm text-gray-500">({(critNum * 100 || 0).toFixed(0)}%)</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Creates an error notification</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Latency Critical (ms)
              </label>
              <Input
                type="number"
                min="1000"
                step="1000"
                value={latencyMs}
                onChange={(e) => {
                  setLatencyMs(e.target.value)
                  setDirty(true)
                }}
                className="w-32"
              />
              <p className="text-xs text-gray-400 mt-1">Per-provider avg latency alert</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alert Cooldown (minutes)
              </label>
              <Input
                type="number"
                min="1"
                max="60"
                value={cooldownMin}
                onChange={(e) => {
                  setCooldownMin(e.target.value)
                  setDirty(true)
                }}
                className="w-28"
              />
              <p className="text-xs text-gray-400 mt-1">Min time between same alert type</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Provider Requests
              </label>
              <Input
                type="number"
                min="1"
                max="100"
                value={minRequests}
                onChange={(e) => {
                  setMinRequests(e.target.value)
                  setDirty(true)
                }}
                className="w-28"
              />
              <p className="text-xs text-gray-400 mt-1">
                Min requests before latency alerts fire (prevents false positives)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-purple-500" />
            Email Notifications
          </CardTitle>
          <CardDescription>Optionally send alert emails to admin addresses</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => {
                  setEmailEnabled(e.target.checked)
                  setDirty(true)
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
            </label>
            <span className="text-sm font-medium text-gray-700">Enable email alerts</span>
          </div>
          {emailEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Addresses
              </label>
              <Input
                type="text"
                value={emailAddresses}
                onChange={(e) => {
                  setEmailAddresses(e.target.value)
                  setDirty(true)
                }}
                placeholder="admin@example.com, ops@example.com"
              />
              <p className="text-xs text-gray-400 mt-1">Comma-separated email addresses</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {dirty && validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <ul className="list-disc list-inside space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center justify-between">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-blue-700 text-sm flex-1 mr-4">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>Alerts check the 24h error rate periodically. Cooldown prevents alert storms.</span>
        </div>
        <Button onClick={handleSave} disabled={!canSave || isSaving}>
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  )
}
