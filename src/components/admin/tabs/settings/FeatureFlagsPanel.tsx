/**
 * Feature Flags Panel
 * Enable/disable features and manage rollout percentages
 */

import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '@/lib/admin/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FeatureFlagSkeleton } from '@/components/ui/loading'
import {
  Sliders,
  Save,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Users,
  Calendar,
  AlertCircle,
  Info,
  Percent,
  Flag,
} from 'lucide-react'

interface FeatureFlag {
  id: string
  key: string
  description: string
  enabled: boolean
  rolloutPercentage: number
  userSegments: string[]
  conditions: Record<string, unknown>
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export function FeatureFlagsPanel() {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingFlag, setEditingFlag] = useState<string | null>(null)
  const [editRollout, setEditRollout] = useState<number>(0)

  const fetchFlags = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await adminFetch('/api/admin/settings/feature-flags')
      const data = await response.json()
      if (data.success) {
        setFlags(data.data)
      } else {
        setError(data.error || 'Failed to fetch feature flags')
      }
    } catch (err) {
      console.error('Failed to fetch feature flags:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch feature flags')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFlags()
  }, [fetchFlags])

  const toggleFlag = async (flag: FeatureFlag) => {
    setIsSaving(true)
    setError(null)
    try {
      const response = await adminFetch(`/api/admin/settings/feature-flags/${flag.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !flag.enabled }),
      })

      const data = await response.json()
      if (data.success) {
        setFlags((prev) =>
          prev.map((f) => (f.key === flag.key ? { ...f, enabled: !f.enabled } : f))
        )
      } else {
        setError(data.error || 'Failed to toggle feature flag')
      }
    } catch (err) {
      console.error('Failed to toggle feature flag:', err)
      setError(err instanceof Error ? err.message : 'Failed to toggle feature flag')
    } finally {
      setIsSaving(false)
    }
  }

  const updateRollout = async (flag: FeatureFlag) => {
    setIsSaving(true)
    setError(null)
    try {
      const response = await adminFetch(`/api/admin/settings/feature-flags/${flag.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolloutPercentage: editRollout }),
      })

      const data = await response.json()
      if (data.success) {
        setFlags((prev) =>
          prev.map((f) =>
            f.key === flag.key ? { ...f, rolloutPercentage: editRollout } : f
          )
        )
        setEditingFlag(null)
      } else {
        setError(data.error || 'Failed to update rollout percentage')
      }
    } catch (err) {
      console.error('Failed to update rollout:', err)
      setError(err instanceof Error ? err.message : 'Failed to update rollout')
    } finally {
      setIsSaving(false)
    }
  }

  const startEditingRollout = (flag: FeatureFlag) => {
    setEditingFlag(flag.key)
    setEditRollout(flag.rolloutPercentage)
  }

  const getFlagStatusBadge = (flag: FeatureFlag) => {
    if (!flag.enabled) {
      return <Badge variant="outline" className="bg-gray-100 text-gray-600">Disabled</Badge>
    }
    if (flag.rolloutPercentage === 100) {
      return <Badge className="bg-green-100 text-green-700">Fully Enabled</Badge>
    }
    if (flag.rolloutPercentage > 0) {
      return <Badge className="bg-yellow-100 text-yellow-700">{flag.rolloutPercentage}% Rollout</Badge>
    }
    return <Badge className="bg-blue-100 text-blue-700">Enabled (0%)</Badge>
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sliders className="h-5 w-5" />
              Feature Flags
            </h2>
            <p className="text-sm text-gray-500">
              Control feature availability and manage gradual rollouts
            </p>
          </div>
        </div>
        <FeatureFlagSkeleton count={3} />
      </div>
    )
  }

  if (error && flags.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">Failed to Load Feature Flags</h3>
              <p className="text-gray-500 text-sm max-w-sm">{error}</p>
            </div>
            <Button onClick={fetchFlags}>
              <RefreshCw className="h-4 w-4 mr-2" />
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
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            Feature Flags
          </h2>
          <p className="text-sm text-gray-500">
            Control feature availability and manage gradual rollouts
          </p>
        </div>
        <Button onClick={fetchFlags} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Feature flags grid */}
      <div className="grid gap-4">
        {flags.map((flag) => (
          <Card
            key={flag.key}
            className={`transition-colors ${
              flag.enabled ? 'border-green-200' : 'border-gray-200'
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">
                      {flag.key
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                    </h3>
                    {getFlagStatusBadge(flag)}
                  </div>
                  <p className="text-gray-600 text-sm mb-3">{flag.description}</p>

                  {/* Metadata */}
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    {flag.userSegments.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span>{flag.userSegments.join(', ')}</span>
                      </div>
                    )}
                    {flag.expiresAt && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Expires: {formatDate(flag.expiresAt)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span>Updated: {formatDate(flag.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Toggle button */}
                <button
                  onClick={() => toggleFlag(flag)}
                  disabled={isSaving}
                  className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    flag.enabled
                      ? 'text-green-600 hover:bg-green-50'
                      : 'text-gray-400 hover:bg-gray-50'
                  }`}
                  role="switch"
                  aria-checked={flag.enabled}
                  aria-label={`Toggle ${flag.key.replace(/_/g, ' ')}: ${flag.enabled ? 'Enabled' : 'Disabled'}`}
                >
                  {flag.enabled ? (
                    <ToggleRight className="h-8 w-8" />
                  ) : (
                    <ToggleLeft className="h-8 w-8" />
                  )}
                </button>
              </div>

              {/* Rollout slider */}
              {flag.enabled && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Percent className="h-4 w-4" />
                      Rollout Percentage
                    </span>
                    {editingFlag === flag.key ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => updateRollout(flag)}
                          disabled={isSaving}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingFlag(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditingRollout(flag)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>

                  {editingFlag === flag.key ? (
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={editRollout}
                        onChange={(e) => setEditRollout(Number(e.target.value))}
                        className="flex-1 accent-blue-600"
                        aria-label={`Rollout percentage for ${flag.key.replace(/_/g, ' ')}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={editRollout}
                        aria-valuetext={`${editRollout}%`}
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={editRollout}
                        onChange={(e) => setEditRollout(Number(e.target.value))}
                        className="w-20"
                        aria-label={`Rollout percentage input`}
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-2 transition-all ${
                            flag.rolloutPercentage === 100
                              ? 'bg-green-500'
                              : flag.rolloutPercentage > 50
                                ? 'bg-blue-500'
                                : flag.rolloutPercentage > 0
                                  ? 'bg-yellow-500'
                                  : 'bg-gray-300'
                          }`}
                          style={{ width: `${flag.rolloutPercentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono w-12 text-right">
                        {flag.rolloutPercentage}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* No flags message */}
      {flags.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Flag className="h-8 w-8 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">No Feature Flags Configured</h3>
                <p className="text-gray-500 text-sm max-w-sm">
                  Run the database migration to add default feature flags for gradual rollouts.
                </p>
              </div>
              <code className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 font-mono">
                npx supabase migration up
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-blue-700">
        <Info className="h-5 w-5 mt-0.5" />
        <div className="text-sm">
          <strong>How feature flags work:</strong> When a flag is enabled with a rollout percentage
          less than 100%, users are deterministically assigned to the feature based on their user ID
          hash. This ensures consistent behavior for each user while allowing gradual rollouts.
        </div>
      </div>
    </div>
  )
}
