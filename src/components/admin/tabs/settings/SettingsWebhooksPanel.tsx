/**
 * Settings Webhooks Panel
 *
 * Manage webhook subscriptions for settings change notifications.
 * Supports CRUD, test ping, delivery log, and secret management.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SettingsSkeleton } from '@/components/ui/loading'
import { adminFetch } from '@/lib/admin/api'
import {
  Plus,
  Trash2,
  Send,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface Webhook {
  id: string
  name: string
  url: string
  secret: string
  events: string[]
  categories: string[]
  enabled: boolean
  created_at: string
  updated_at: string
  last_triggered_at?: string
  failure_count: number
}

interface WebhookDelivery {
  id: string
  webhook_id: string
  event: string
  payload: Record<string, unknown>
  status: 'pending' | 'success' | 'failed'
  status_code?: number
  response_body?: string
  attempts: number
  error_message?: string
  created_at: string
  completed_at?: string
}

interface TestResult {
  success: boolean
  statusCode?: number
  responseBody?: string
  error?: string
  durationMs: number
}

const ALL_EVENTS = [
  { value: 'setting.updated', label: 'Setting Updated' },
  { value: 'setting.batch_updated', label: 'Batch Updated' },
  { value: 'setting.imported', label: 'Settings Imported' },
  { value: 'feature_flag.toggled', label: 'Feature Flag Toggled' },
]

const ALL_CATEGORIES = [
  { value: 'ai', label: 'AI' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'rate_limits', label: 'Rate Limits' },
  { value: 'ocr', label: 'OCR' },
  { value: 'fuzzy_matching', label: 'Fuzzy Matching' },
  { value: 'gap_analysis', label: 'Gap Analysis' },
  { value: 'ui', label: 'UI' },
  { value: 'email', label: 'Email' },
]

// =============================================================================
// COMPONENT
// =============================================================================

export function SettingsWebhooksPanel() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchWebhooks = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await adminFetch('/api/admin/webhooks')
      const data = await response.json()
      if (data.success) {
        setWebhooks(data.data)
      } else {
        setError(data.error || 'Failed to load webhooks')
      }
    } catch (err) {
      setError('Failed to connect to server')
      console.warn('[WebhooksPanel] Fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  const handleCreated = (webhook: Webhook) => {
    setWebhooks((prev) => [webhook, ...prev])
    setShowCreate(false)
  }

  const handleUpdated = (updated: Webhook) => {
    setWebhooks((prev) => prev.map((wh) => (wh.id === updated.id ? updated : wh)))
  }

  const handleDeleted = (id: string) => {
    setWebhooks((prev) => prev.filter((wh) => wh.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  if (isLoading) return <SettingsSkeleton />

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-600">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchWebhooks}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Webhooks</h3>
          <p className="text-sm text-gray-500 mt-1">
            Get notified when settings change. Payloads are signed with HMAC-SHA256.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Webhook
        </Button>
      </div>

      {showCreate && (
        <CreateWebhookForm
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {webhooks.length === 0 && !showCreate ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <p className="text-sm">No webhooks configured yet.</p>
            <p className="text-xs mt-1">Add a webhook to receive notifications when settings change.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <WebhookCard
              key={wh.id}
              webhook={wh}
              expanded={expandedId === wh.id}
              onToggleExpand={() => setExpandedId(expandedId === wh.id ? null : wh.id)}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// CREATE FORM
// =============================================================================

function CreateWebhookForm({
  onCreated,
  onCancel,
}: {
  onCreated: (webhook: Webhook) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['setting.updated'])
  const [categories, setCategories] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || !url.trim() || events.length === 0) return

    setIsSaving(true)
    setError(null)

    try {
      const response = await adminFetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, events, categories }),
      })
      const data = await response.json()

      if (data.success) {
        // Show the secret before calling onCreated (which masks it)
        setCreatedSecret(data.data.secret)
      } else {
        setError(data.error || 'Failed to create webhook')
      }
    } catch (err) {
      setError('Connection error')
      console.warn('[WebhooksPanel] Create error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyAndClose = () => {
    onCreated({ ...({} as Webhook), name, url, events, categories, enabled: true } as Webhook)
  }

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  // Show secret after successful creation
  if (createdSecret) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-green-800">Webhook Created</CardTitle>
          <CardDescription className="text-green-700">
            Save this signing secret now — it won&apos;t be shown again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white px-3 py-2 rounded border text-sm font-mono text-gray-800 overflow-x-auto">
              {createdSecret}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(createdSecret)
                setCopiedSecret(true)
                setTimeout(() => setCopiedSecret(false), 2000)
              }}
            >
              {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button size="sm" onClick={handleCopyAndClose}>
            Done
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">New Webhook</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-gray-700">Name</label>
            <Input
              placeholder="e.g. Slack Notification"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">URL</label>
            <Input
              placeholder="https://example.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Events</label>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((ev) => (
              <button
                key={ev.value}
                type="button"
                onClick={() => toggleEvent(ev.value)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  events.includes(ev.value)
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {ev.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            Category Filter <span className="text-gray-400">(leave empty for all)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => toggleCategory(cat.value)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  categories.includes(cat.value)
                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSaving || !name.trim() || !url.trim() || events.length === 0}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Create
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// WEBHOOK CARD
// =============================================================================

function WebhookCard({
  webhook,
  expanded,
  onToggleExpand,
  onUpdated,
  onDeleted,
}: {
  webhook: Webhook
  expanded: boolean
  onToggleExpand: () => void
  onUpdated: (webhook: Webhook) => void
  onDeleted: (id: string) => void
}) {
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [isToggling, setIsToggling] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loadingDeliveries, setLoadingDeliveries] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const response = await adminFetch(`/api/admin/webhooks/${webhook.id}/test`, {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        setTestResult(data.data)
      }
    } catch (err) {
      setTestResult({ success: false, error: 'Connection error', durationMs: 0 })
      console.warn('[WebhooksPanel] Test error:', err)
    } finally {
      setIsTesting(false)
    }
  }

  const handleToggle = async () => {
    setIsToggling(true)
    try {
      const response = await adminFetch(`/api/admin/webhooks/${webhook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !webhook.enabled }),
      })
      const data = await response.json()
      if (data.success) {
        onUpdated(data.data)
      }
    } catch (err) {
      console.warn('[WebhooksPanel] Toggle error:', err)
    } finally {
      setIsToggling(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await adminFetch(`/api/admin/webhooks/${webhook.id}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (data.success) {
        onDeleted(webhook.id)
      }
    } catch (err) {
      console.warn('[WebhooksPanel] Delete error:', err)
    } finally {
      setIsDeleting(false)
      setConfirmDelete(false)
    }
  }

  const loadDeliveries = async () => {
    setLoadingDeliveries(true)
    try {
      const response = await adminFetch(`/api/admin/webhooks/${webhook.id}/deliveries?limit=10`)
      const data = await response.json()
      if (data.success) {
        setDeliveries(data.data)
      }
    } catch (err) {
      console.warn('[WebhooksPanel] Deliveries error:', err)
    } finally {
      setLoadingDeliveries(false)
    }
  }

  useEffect(() => {
    if (expanded) {
      loadDeliveries()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  return (
    <Card className={!webhook.enabled ? 'opacity-60' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleToggle}
              disabled={isToggling}
              className="flex-shrink-0"
              title={webhook.enabled ? 'Disable' : 'Enable'}
            >
              {webhook.enabled ? (
                <ToggleRight className="h-5 w-5 text-green-600" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-gray-400" />
              )}
            </button>
            <div className="min-w-0">
              <h4 className="font-medium text-sm text-gray-900 truncate">{webhook.name}</h4>
              <p className="text-xs text-gray-500 font-mono truncate">{webhook.url}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {webhook.failure_count > 0 && (
              <Badge variant="destructive" className="text-xs">
                {webhook.failure_count} failed
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={handleTest} disabled={isTesting}>
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggleExpand}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Event tags */}
        <div className="flex flex-wrap gap-1 mt-1">
          {webhook.events.map((ev) => (
            <span key={ev} className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
              {ev}
            </span>
          ))}
          {webhook.categories.length > 0 &&
            webhook.categories.map((cat) => (
              <span key={cat} className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
                {cat}
              </span>
            ))}
        </div>
      </CardHeader>

      {/* Test result */}
      {testResult && (
        <CardContent className="pt-0 pb-2">
          <div
            className={`text-xs px-3 py-2 rounded ${
              testResult.success
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {testResult.success ? (
              <span>Test ping successful ({testResult.statusCode}) in {testResult.durationMs}ms</span>
            ) : (
              <span>Test failed: {testResult.error} ({testResult.durationMs}ms)</span>
            )}
          </div>
        </CardContent>
      )}

      {/* Expanded details */}
      {expanded && (
        <CardContent className="pt-0 border-t mt-2 space-y-3">
          {/* Secret */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Signing Secret</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 px-2 py-1 rounded text-xs font-mono text-gray-600 overflow-hidden">
                {showSecret ? webhook.secret : '••••••••••••••••••••'}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span>Created: {new Date(webhook.created_at).toLocaleDateString()}</span>
            {webhook.last_triggered_at && (
              <span>Last triggered: {new Date(webhook.last_triggered_at).toLocaleString()}</span>
            )}
          </div>

          {/* Recent Deliveries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Recent Deliveries</label>
              <Button variant="ghost" size="sm" onClick={loadDeliveries} disabled={loadingDeliveries}>
                <RefreshCw className={`h-3 w-3 ${loadingDeliveries ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {loadingDeliveries ? (
              <p className="text-xs text-gray-400">Loading...</p>
            ) : deliveries.length === 0 ? (
              <p className="text-xs text-gray-400">No deliveries yet</p>
            ) : (
              <div className="border rounded divide-y max-h-48 overflow-y-auto">
                {deliveries.map((d) => (
                  <div key={d.id} className="px-3 py-2 text-xs flex items-center gap-2">
                    {d.status === 'success' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    ) : d.status === 'failed' ? (
                      <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    )}
                    <span className="text-gray-600 font-mono">{d.event}</span>
                    <span className="text-gray-400 ml-auto">
                      {d.status_code && `${d.status_code} · `}
                      {d.attempts} attempt{d.attempts !== 1 ? 's' : ''}
                      {' · '}
                      {new Date(d.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="flex justify-end pt-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete this webhook?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default SettingsWebhooksPanel
