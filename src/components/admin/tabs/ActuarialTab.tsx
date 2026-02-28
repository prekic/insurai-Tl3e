import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/loading'
import { adminFetch } from '@/lib/admin/api'
import { toast } from 'sonner'
import { Save, History, Calculator, AlertTriangle, Timer } from 'lucide-react'
import { EvidenceCoveragePanel } from './settings/EvidenceCoveragePanel'
import type { PolicyEvaluationResult, LayerTimings } from '@/lib/actuarial-engine/types'
import { subscribeEvaluation } from '@/lib/actuarial-engine'

// Define the shape of our config from the DB
interface ActuarialConfigSet {
  id: string
  name: string
  description: string
  configType: string
  isActive: boolean
  updatedAt: string
  latestVersion: {
    id: string
    version: number
    configData: Record<string, unknown>
    changeSummary: string
    createdAt: string
  } | null
}

/** In-memory ring buffer for recent evaluation timings (client-side). */
const TIMING_BUFFER_MAX = 50
const timingBuffer: Array<{ timestamp: string; policyId: string; timings: LayerTimings }> = []

/**
 * Records a timing event from a client-side evaluation.
 * Called by external code (e.g. ComparePolicies / PolicyDetailView).
 */
export function recordEvaluationTiming(policyId: string, timings: LayerTimings) {
  timingBuffer.push({ timestamp: new Date().toISOString(), policyId, timings })
  if (timingBuffer.length > TIMING_BUFFER_MAX) timingBuffer.shift()
}

export function ActuarialTab() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [configs, setConfigs] = useState<Record<string, ActuarialConfigSet>>({})
  const [editedData, setEditedData] = useState<Record<string, string>>({})
  const [lastEvalResult, setLastEvalResult] = useState<PolicyEvaluationResult | null>(null)

  // Fetch configs on mount
  useEffect(() => {
    fetchConfigs()
  }, [])

  // P1: Subscribe to actuarial evaluation events from the event bus
  useEffect(() => {
    return subscribeEvaluation((event) => {
      // Record timing in the ring buffer
      if (event.result.layerTimings) {
        recordEvaluationTiming(event.policyId, event.result.layerTimings)
      }
      // Update the evidence coverage panel with the latest result
      setLastEvalResult(event.result)
    })
  }, [])

  const fetchConfigs = async () => {
    try {
      setIsLoading(true)
      const res = await adminFetch('/api/admin/actuarial/configs')
      const data = await res.json()

      if (data.success && data.data) {
        // Map array of sets to an object mapping by name
        const configMap: Record<string, ActuarialConfigSet> = {}
        const editMap: Record<string, string> = {}

        data.data.forEach((c: ActuarialConfigSet) => {
          configMap[c.name] = c
          if (c.latestVersion?.configData) {
            editMap[c.name] = JSON.stringify(c.latestVersion.configData, null, 2)
          }
        })

        setConfigs(configMap)
        setEditedData(editMap)
      } else {
        toast.error('Failed to load actuarial configurations')
      }
    } catch (err) {
      console.error('Error fetching actuarial configs:', err)
      toast.error('Error connecting to config API')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditorChange = (name: string, value: string) => {
    setEditedData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSaveConfig = async (name: string) => {
    try {
      setIsSaving(true)
      const rawJson = editedData[name]
      let configData

      // 1. Validate JSON
      try {
        configData = JSON.parse(rawJson)
      } catch (_e) {
        toast.error(`Invalid JSON for ${name}`)
        setIsSaving(false)
        return
      }

      // 2. Submit to API to create new version
      const res = await adminFetch(`/api/admin/actuarial/configs/${name}/version`, {
        method: 'POST',
        body: JSON.stringify({
          configData,
          changeSummary: 'Updated via Admin UI Editor',
        }),
      })

      const result = await res.json()

      if (result.success) {
        toast.success(`Successfully saved new version for ${name}`)
        fetchConfigs() // Refresh to get the latest versions
      } else {
        toast.error(result.error || `Failed to save ${name}`)
      }
    } catch (err) {
      console.error('Error saving config:', err)
      toast.error('Server error while saving configuration')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-indigo-600" />
            Actuarial Engine Configuration
          </h2>
          <p className="text-gray-500 mt-1">
            Manage the parameters for the 4-layer actuarial evaluation, including Monte Carlo,
            TOPSIS, and Risk Scenarios.
          </p>
        </div>
        <Button onClick={fetchConfigs} disabled={isSaving} variant="outline" size="sm">
          <History className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800">Caution: Actuarial Mathematics</p>
          <p className="text-sm text-amber-700 mt-1">
            Modifying these parameters drastically shifts the mathematical calculations for Expected
            Out-Of-Pocket (EOOP) limits and TOPSIS closeness scores. Ensure inputs match target
            domain (e.g. valid scenario codes and sum(weights) = 1.0) before saving.
          </p>
        </div>
      </div>

      {/* Performance Timings Section */}
      <PerformanceTimingsCard timings={timingBuffer} />

      {/* Evidence Coverage Section */}
      <EvidenceCoveragePanel evaluationResult={lastEvalResult} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.values(configs).map((set) => (
          <Card key={set.id} className="flex flex-col">
            <CardHeader className="bg-gray-50/50 border-b pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{formatConfigName(set.name)}</CardTitle>
                  <CardDescription className="mt-1">{set.description}</CardDescription>
                </div>
                <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap">
                  v{set.latestVersion?.version || 0}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col">
              <div className="bg-[#1e1e1e] p-4 flex-1">
                <textarea
                  className="w-full h-64 bg-transparent text-[#d4d4d4] font-mono text-sm focus:outline-none resize-y"
                  value={editedData[set.name] || ''}
                  onChange={(e) => handleEditorChange(set.name, e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                <div className="text-xs text-gray-500">
                  Last updated:{' '}
                  {new Date(set.latestVersion?.createdAt || set.updatedAt).toLocaleString()}
                </div>
                <Button
                  onClick={() => handleSaveConfig(set.name)}
                  disabled={isSaving}
                  size="sm"
                  variant="default"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save New Version
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance Timings Sub-Component
// ─────────────────────────────────────────────────────────────────────────────

function PerformanceTimingsCard({
  timings,
}: {
  timings: Array<{ timestamp: string; policyId: string; timings: LayerTimings }>
}) {
  const stats = useMemo(() => {
    if (timings.length === 0) return null
    const totals = timings.map((t) => t.timings.total_ms)
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length
    const max = Math.max(...totals)
    const min = Math.min(...totals)
    const avgA = timings.reduce((a, t) => a + t.timings.layerA_ms, 0) / timings.length
    const avgB = timings.reduce((a, t) => a + t.timings.layerB_ms, 0) / timings.length
    const avgC = timings.reduce((a, t) => a + t.timings.layerC_ms, 0) / timings.length
    const dTimings = timings.filter((t) => t.timings.layerD_ms !== undefined)
    const avgD =
      dTimings.length > 0
        ? dTimings.reduce((a, t) => a + (t.timings.layerD_ms ?? 0), 0) / dTimings.length
        : null
    return { count: timings.length, avg, max, min, avgA, avgB, avgC, avgD }
  }, [timings])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className="h-4 w-4 text-indigo-600" />
          Evaluation Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!stats ? (
          <p className="text-gray-500 text-sm">
            No evaluation timings recorded yet. Run an actuarial evaluation to see performance data.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 uppercase">Evaluations</p>
                <p className="text-lg font-bold text-gray-900">{stats.count}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 uppercase">Avg Total</p>
                <p className="text-lg font-bold text-gray-900">{stats.avg.toFixed(1)}ms</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 uppercase">Min</p>
                <p className="text-lg font-bold text-green-700">{stats.min.toFixed(1)}ms</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 uppercase">Max</p>
                <p className="text-lg font-bold text-red-700">{stats.max.toFixed(1)}ms</p>
              </div>
            </div>
            <div className="text-xs text-gray-600 space-y-1 border-t pt-2">
              <p>Layer A (Semantic): avg {stats.avgA.toFixed(1)}ms</p>
              <p>Layer B (Compliance): avg {stats.avgB.toFixed(1)}ms</p>
              <p>Layer C (Monte Carlo): avg {stats.avgC.toFixed(1)}ms</p>
              {stats.avgD !== null && <p>Layer D (TOPSIS): avg {stats.avgD.toFixed(1)}ms</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Helper to formulate names like 'monte_carlo_defaults' -> 'Monte Carlo Defaults'
function formatConfigName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
