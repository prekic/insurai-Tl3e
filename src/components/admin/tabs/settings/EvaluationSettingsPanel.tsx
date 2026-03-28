/**
 * Evaluation Settings Panel
 * Configure policy scoring weights and grade thresholds
 */

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SettingsSkeleton } from '@/components/ui/loading'
import { validateGradeThresholds, type ValidationResult } from '@/lib/admin/settings-validation'
import { Save, Scale, Trophy, Target, AlertCircle, Info, BarChart3, Cpu, Clock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { SettingValue } from '../SettingsTab'
import { adminFetch } from '@/lib/admin/api'

interface EvaluationSettingsPanelProps {
  settings: SettingValue[]
  onUpdate: (key: string, value: unknown, reason?: string) => Promise<void>
  onBatchUpdate?: (
    updates: Array<{ key: string; value: unknown }>,
    reason?: string
  ) => Promise<void>
  isLoading: boolean
  isSaving: boolean
}

const WEIGHT_KEYS = [
  'weight_premium',
  'weight_coverage',
  'weight_deductible',
  'weight_compliance',
  'weight_value',
]

const GRADE_KEYS = [
  'grade_a_threshold',
  'grade_b_threshold',
  'grade_c_threshold',
  'grade_d_threshold',
]

export function EvaluationSettingsPanel({
  settings,
  onUpdate,
  onBatchUpdate,
  isLoading,
  isSaving,
}: EvaluationSettingsPanelProps) {
  const [editingWeights, setEditingWeights] = useState(false)
  const [editingGrades, setEditingGrades] = useState(false)
  const [tempWeights, setTempWeights] = useState<Record<string, number>>({})
  const [tempGrades, setTempGrades] = useState<Record<string, number>>({})
  const [editingPerformance, setEditingPerformance] = useState(false)
  const [tempPerformance, setTempPerformance] = useState<Record<string, unknown>>({})
  const [editingBenchmark, setEditingBenchmark] = useState(false)
  const [tempBenchmark, setTempBenchmark] = useState<Record<string, number>>({})
  const [editReason, setEditReason] = useState('')
  const [metrics, setMetrics] = useState<{ avgLayerCMs: number | null; sampleSize: number } | null>(
    null
  )

  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await adminFetch('/api/admin/actuarial/performance-metrics')
        if (!res.ok) return
        const json = await res.json()
        if (json.success && json.data) {
          setMetrics(json.data)
        }
      } catch (err) {
        console.error('Failed to load performance metrics', err)
      }
    }
    loadMetrics()
  }, [])

  // Calculate current weight values
  const currentWeights = useMemo(() => {
    const weights: Record<string, number> = {}
    WEIGHT_KEYS.forEach((key) => {
      const setting = settings.find((s) => s.key === key)
      weights[key] = setting ? Number(setting.value) : 0
    })
    return weights
  }, [settings])

  // Calculate current grade thresholds
  const currentGrades = useMemo(() => {
    const grades: Record<string, number> = {}
    GRADE_KEYS.forEach((key) => {
      const setting = settings.find((s) => s.key === key)
      grades[key] = setting ? Number(setting.value) : 0
    })
    return grades
  }, [settings])

  // Calculate current performance settings
  const currentPerformance = useMemo(() => {
    const workerEnabled = settings.find((s) => s.key === 'worker_enabled')
    const workerIterations = settings.find((s) => s.key === 'worker_iterations')
    return {
      worker_enabled: workerEnabled
        ? workerEnabled.value === 'true' || workerEnabled.value === true
        : true,
      worker_iterations: workerIterations ? Number(workerIterations.value) : 10000,
    }
  }, [settings])

  const currentBenchmark = useMemo(() => {
    const agingSetting = settings.find((s) => s.key === 'benchmark_aging_days')
    const staleSetting = settings.find((s) => s.key === 'benchmark_stale_days')
    return {
      benchmark_aging_days: agingSetting ? Number(agingSetting.value) : 180,
      benchmark_stale_days: staleSetting ? Number(staleSetting.value) : 365,
    }
  }, [settings])

  const totalWeight = useMemo(() => {
    const weights = editingWeights ? tempWeights : currentWeights
    return Object.values(weights).reduce((sum, w) => sum + w, 0)
  }, [editingWeights, tempWeights, currentWeights])

  // Validate grade thresholds are in descending order
  const gradeValidation = useMemo((): ValidationResult | null => {
    if (!editingGrades) return null
    return validateGradeThresholds({
      grade_a_threshold: tempGrades.grade_a_threshold ?? 0,
      grade_b_threshold: tempGrades.grade_b_threshold ?? 0,
      grade_c_threshold: tempGrades.grade_c_threshold ?? 0,
      grade_d_threshold: tempGrades.grade_d_threshold ?? 0,
    })
  }, [editingGrades, tempGrades])

  const canSaveGrades = !gradeValidation || gradeValidation.valid

  const startEditingWeights = () => {
    setTempWeights({ ...currentWeights })
    setEditingWeights(true)
    setEditReason('')
  }

  const startEditingGrades = () => {
    setTempGrades({ ...currentGrades })
    setEditingGrades(true)
    setEditReason('')
  }

  const handleWeightChange = (key: string, value: number) => {
    setTempWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }))
  }

  const handleGradeChange = (key: string, value: number) => {
    setTempGrades((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }))
  }

  const saveWeights = async () => {
    const changedEntries = Object.entries(tempWeights).filter(
      ([key, value]) => value !== currentWeights[key]
    )
    const reason = editReason || 'Updated via weights panel'

    if (changedEntries.length > 0 && onBatchUpdate) {
      await onBatchUpdate(
        changedEntries.map(([key, value]) => ({ key, value })),
        reason
      )
    } else {
      for (const [key, value] of changedEntries) {
        await onUpdate(key, value, reason)
      }
    }
    setEditingWeights(false)
  }

  const saveGrades = async () => {
    const changedEntries = Object.entries(tempGrades).filter(
      ([key, value]) => value !== currentGrades[key]
    )
    const reason = editReason || 'Updated via grades panel'

    if (changedEntries.length > 0 && onBatchUpdate) {
      await onBatchUpdate(
        changedEntries.map(([key, value]) => ({ key, value })),
        reason
      )
    } else {
      for (const [key, value] of changedEntries) {
        await onUpdate(key, value, reason)
      }
    }
    setEditingGrades(false)
  }

  const benchmarkValidation = useMemo(() => {
    if (!editingBenchmark) return null
    const aging = tempBenchmark.benchmark_aging_days ?? 180
    const stale = tempBenchmark.benchmark_stale_days ?? 365
    if (aging >= stale) {
      return { valid: false, message: 'Aging threshold must be less than stale threshold' }
    }
    if (aging < 30 || stale < 60) {
      return { valid: false, message: 'Aging minimum is 30 days, stale minimum is 60 days' }
    }
    return { valid: true, message: '' }
  }, [editingBenchmark, tempBenchmark])

  const startEditingBenchmark = () => {
    setTempBenchmark({ ...currentBenchmark })
    setEditingBenchmark(true)
    setEditReason('')
  }

  const saveBenchmark = async () => {
    const changedEntries = Object.entries(tempBenchmark).filter(
      ([key, value]) => value !== currentBenchmark[key as keyof typeof currentBenchmark]
    )
    const reason = editReason || 'Updated via benchmark freshness panel'

    if (changedEntries.length > 0 && onBatchUpdate) {
      await onBatchUpdate(
        changedEntries.map(([key, value]) => ({ key, value })),
        reason
      )
    } else {
      for (const [key, value] of changedEntries) {
        await onUpdate(key, value, reason)
      }
    }
    setEditingBenchmark(false)
  }

  const getWeightColor = (key: string) => {
    const colors: Record<string, string> = {
      weight_premium: 'bg-blue-500',
      weight_coverage: 'bg-green-500',
      weight_deductible: 'bg-yellow-500',
      weight_compliance: 'bg-purple-500',
      weight_value: 'bg-orange-500',
    }
    return colors[key] || 'bg-gray-500'
  }

  const getWeightLabel = (key: string) => {
    const labels: Record<string, string> = {
      weight_premium: 'Premium',
      weight_coverage: 'Coverage',
      weight_deductible: 'Deductible',
      weight_compliance: 'Compliance',
      weight_value: 'Value',
    }
    return labels[key] || key
  }

  const getGradeLabel = (key: string) => {
    const labels: Record<string, { grade: string; color: string }> = {
      grade_a_threshold: { grade: 'A', color: 'text-green-600 bg-green-100' },
      grade_b_threshold: { grade: 'B', color: 'text-blue-600 bg-blue-100' },
      grade_c_threshold: { grade: 'C', color: 'text-yellow-600 bg-yellow-100' },
      grade_d_threshold: { grade: 'D', color: 'text-orange-600 bg-orange-100' },
    }
    return labels[key] || { grade: '?', color: 'text-gray-600 bg-gray-100' }
  }

  if (isLoading) {
    return <SettingsSkeleton groups={3} itemsPerGroup={4} />
  }

  if (settings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <BarChart3 className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900">No Evaluation Settings Found</h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Run the database migration to seed default scoring weights and grade thresholds.
              </p>
            </div>
            <code className="px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 font-mono">
              npx supabase migration up
            </code>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Scoring Weights */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-blue-500" />
                Scoring Weights
              </CardTitle>
              <CardDescription>
                Adjust how different factors contribute to the overall policy score
              </CardDescription>
            </div>
            {!editingWeights ? (
              <Button onClick={startEditingWeights}>Edit Weights</Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={saveWeights} disabled={isSaving || totalWeight !== 100}>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditingWeights(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Weight visualization bar */}
          <div className="mb-6">
            <div className="h-8 rounded-lg overflow-hidden flex">
              {WEIGHT_KEYS.map((key) => {
                const weight = editingWeights ? tempWeights[key] : currentWeights[key]
                if (weight === 0) return null
                return (
                  <div
                    key={key}
                    className={`${getWeightColor(key)} flex items-center justify-center text-white text-xs font-medium transition-all`}
                    style={{ width: `${weight}%` }}
                  >
                    {weight > 10 && `${weight}%`}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-500">
              <span>0%</span>
              <span className={totalWeight !== 100 ? 'text-red-500 font-medium' : 'text-green-500'}>
                Total: {totalWeight}%
              </span>
              <span>100%</span>
            </div>
          </div>

          {/* Weight sliders */}
          <div className="space-y-4">
            {WEIGHT_KEYS.map((key) => {
              const weight = editingWeights ? tempWeights[key] : currentWeights[key]

              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="w-24">
                    <Badge className={`${getWeightColor(key)} text-white`}>
                      {getWeightLabel(key)}
                    </Badge>
                  </div>
                  {editingWeights ? (
                    <>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={weight}
                        onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                        className="flex-1 accent-blue-600"
                        aria-label={`${getWeightLabel(key)} weight slider`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={weight}
                        aria-valuetext={`${weight}%`}
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={weight}
                        onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                        className="w-20"
                        aria-label={`${getWeightLabel(key)} weight input`}
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full">
                        <div
                          className={`h-2 ${getWeightColor(key)} rounded-full transition-all`}
                          style={{ width: `${weight}%` }}
                        />
                      </div>
                      <span className="w-20 text-right font-mono">{weight}%</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Edit reason */}
          {editingWeights && (
            <div className="mt-4">
              <Input
                placeholder="Reason for weight changes (optional)"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
              />
            </div>
          )}

          {/* Warning for invalid total */}
          {editingWeights && totalWeight !== 100 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2 text-yellow-700">
              <AlertCircle className="h-4 w-4" />
              <span>Weights must sum to 100% (currently {totalWeight}%)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grade Thresholds */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Grade Thresholds
              </CardTitle>
              <CardDescription>Set the minimum score required for each grade level</CardDescription>
            </div>
            {!editingGrades ? (
              <Button onClick={startEditingGrades}>Edit Thresholds</Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={saveGrades} disabled={isSaving || !canSaveGrades}>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditingGrades(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Grade scale visualization */}
          <div className="mb-6">
            <div className="h-8 rounded-lg overflow-hidden flex">
              {['F', 'D', 'C', 'B', 'A'].map((grade, index) => {
                const colors = [
                  'bg-red-500',
                  'bg-orange-500',
                  'bg-yellow-500',
                  'bg-blue-500',
                  'bg-green-500',
                ]
                return (
                  <div
                    key={grade}
                    className={`${colors[index]} flex-1 flex items-center justify-center text-white font-bold`}
                  >
                    {grade}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-500">
              <span>0</span>
              {GRADE_KEYS.slice()
                .reverse()
                .map((key) => {
                  const threshold = editingGrades ? tempGrades[key] : currentGrades[key]
                  return (
                    <span key={key} className="font-mono">
                      {threshold}
                    </span>
                  )
                })}
              <span>100</span>
            </div>
          </div>

          {/* Grade threshold inputs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {GRADE_KEYS.map((key) => {
              const { grade, color } = getGradeLabel(key)
              const threshold = editingGrades ? tempGrades[key] : currentGrades[key]

              return (
                <div key={key} className="text-center">
                  <div
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${color} text-2xl font-bold mb-2`}
                  >
                    {grade}
                  </div>
                  <div className="text-sm text-gray-500 mb-1">Minimum Score</div>
                  {editingGrades ? (
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={threshold}
                      onChange={(e) => handleGradeChange(key, Number(e.target.value))}
                      className="text-center"
                    />
                  ) : (
                    <div className="text-2xl font-mono font-bold">{threshold}</div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Edit reason */}
          {editingGrades && (
            <div className="mt-4">
              <Input
                placeholder="Reason for threshold changes (optional)"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
              />
            </div>
          )}

          {/* Validation error for grade thresholds */}
          {editingGrades && gradeValidation && !gradeValidation.valid && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{gradeValidation.error}</span>
            </div>
          )}

          {/* Info box */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-blue-700">
            <Info className="h-4 w-4 mt-0.5" />
            <div className="text-sm">
              <strong>How grades work:</strong> A policy with a score of 85 would receive grade B
              (if B threshold is 80 and A threshold is 90). Score below D threshold gets grade F.
              <br />
              <strong>Note:</strong> Thresholds must be in descending order (A {'>'} B {'>'} C {'>'}{' '}
              D).
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-purple-500" />
                Performance Settings
              </CardTitle>
              <CardDescription>Configure background Web Worker evaluation limits</CardDescription>
            </div>
            {!editingPerformance ? (
              <Button
                onClick={() => {
                  setTempPerformance({ ...currentPerformance })
                  setEditingPerformance(true)
                  setEditReason('')
                }}
              >
                Edit Settings
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    const changedEntries = Object.entries(tempPerformance).filter(
                      ([key, value]) =>
                        String(value) !==
                        String(currentPerformance[key as keyof typeof currentPerformance])
                    )
                    const reason = editReason || 'Updated via performance settings'

                    if (changedEntries.length > 0 && onBatchUpdate) {
                      await onBatchUpdate(
                        changedEntries.map(([key, value]) => ({ key, value: String(value) })),
                        reason
                      )
                    } else {
                      for (const [key, value] of changedEntries) {
                        await onUpdate(key, String(value), reason)
                      }
                    }
                    setEditingPerformance(false)
                  }}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditingPerformance(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="space-y-1">
                <Label className="text-base font-medium">Use Web Workers</Label>
                <p className="text-sm text-gray-500">
                  Run heavy Monte Carlo actuarial simulations in the background, keeping the UI
                  responsive.
                </p>
              </div>
              <Switch
                checked={Boolean(
                  editingPerformance
                    ? tempPerformance.worker_enabled
                    : currentPerformance.worker_enabled
                )}
                onCheckedChange={(checked: boolean) =>
                  setTempPerformance((prev) => ({ ...prev, worker_enabled: checked }))
                }
                disabled={!editingPerformance}
              />
            </div>

            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <div className="space-y-1">
                  <Label className="text-base font-medium">Worker Iterations</Label>
                  <p className="text-sm text-gray-500">
                    Number of Monte Carlo simulations per evaluation. Higher is more accurate but
                    slower.
                  </p>
                  {metrics && metrics.sampleSize > 0 && (
                    <p className="text-xs text-blue-600 font-medium">
                      Average simulation time: {metrics.avgLayerCMs}ms (last {metrics.sampleSize}{' '}
                      runs)
                    </p>
                  )}
                </div>
                <div className="font-mono bg-white px-3 py-1 rounded text-lg font-semibold border shadow-sm">
                  {Number(
                    editingPerformance
                      ? tempPerformance.worker_iterations
                      : currentPerformance.worker_iterations
                  ).toLocaleString()}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">1,000</span>
                <input
                  type="range"
                  min="1000"
                  max="250000"
                  step="1000"
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  value={Number(
                    editingPerformance
                      ? tempPerformance.worker_iterations
                      : currentPerformance.worker_iterations
                  )}
                  onChange={(e) =>
                    setTempPerformance((prev) => ({
                      ...prev,
                      worker_iterations: Number(e.target.value),
                    }))
                  }
                  disabled={!editingPerformance}
                />
                <span className="text-sm text-gray-500">250,000</span>
              </div>
            </div>

            {editingPerformance && (
              <div className="mt-4">
                <Input
                  placeholder="Reason for performance change (optional)"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Benchmark Freshness Thresholds */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Benchmark Freshness Thresholds
              </CardTitle>
              <CardDescription>
                Control when market benchmark data is flagged as aging or stale
              </CardDescription>
            </div>
            {!editingBenchmark && (
              <Button
                variant="outline"
                size="sm"
                onClick={startEditingBenchmark}
                disabled={isSaving}
              >
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
              <Info className="h-4 w-4 flex-shrink-0" />
              <span>
                Benchmarks with dataDate older than the aging threshold show a warning. Beyond the
                stale threshold, confidence is downgraded and language is hedged.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Aging Threshold (days)</label>
                <div className="text-xs text-gray-500 mb-2">
                  Data older than this is flagged as aging (default: 180)
                </div>
                {editingBenchmark ? (
                  <Input
                    type="number"
                    min={30}
                    max={730}
                    value={tempBenchmark.benchmark_aging_days ?? 180}
                    onChange={(e) =>
                      setTempBenchmark((prev) => ({
                        ...prev,
                        benchmark_aging_days: Number(e.target.value),
                      }))
                    }
                  />
                ) : (
                  <span className="font-mono bg-gray-100 px-3 py-2 rounded text-sm inline-block">
                    {currentBenchmark.benchmark_aging_days} days
                  </span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Stale Threshold (days)</label>
                <div className="text-xs text-gray-500 mb-2">
                  Data older than this downgrades confidence (default: 365)
                </div>
                {editingBenchmark ? (
                  <Input
                    type="number"
                    min={60}
                    max={1460}
                    value={tempBenchmark.benchmark_stale_days ?? 365}
                    onChange={(e) =>
                      setTempBenchmark((prev) => ({
                        ...prev,
                        benchmark_stale_days: Number(e.target.value),
                      }))
                    }
                  />
                ) : (
                  <span className="font-mono bg-gray-100 px-3 py-2 rounded text-sm inline-block">
                    {currentBenchmark.benchmark_stale_days} days
                  </span>
                )}
              </div>
            </div>

            {editingBenchmark && benchmarkValidation && !benchmarkValidation.valid && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {benchmarkValidation.message}
              </div>
            )}

            {editingBenchmark && (
              <div className="space-y-3 pt-2">
                <Input
                  placeholder="Reason for change (optional)"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={saveBenchmark}
                    disabled={
                      isSaving || (benchmarkValidation !== null && !benchmarkValidation.valid)
                    }
                    size="sm"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Save Thresholds
                  </Button>
                  <Button variant="outline" onClick={() => setEditingBenchmark(false)} size="sm">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Other Evaluation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-green-500" />
            Other Evaluation Settings
          </CardTitle>
          <CardDescription>Additional settings for policy evaluation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {settings
              .filter(
                (s) =>
                  !WEIGHT_KEYS.includes(s.key) &&
                  !GRADE_KEYS.includes(s.key) &&
                  s.key !== 'worker_enabled' &&
                  s.key !== 'worker_iterations' &&
                  s.key !== 'benchmark_aging_days' &&
                  s.key !== 'benchmark_stale_days'
              )
              .map((setting) => (
                <div
                  key={setting.key}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <div className="font-medium">
                      {setting.key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </div>
                    <div className="text-sm text-gray-500">{setting.description}</div>
                  </div>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                    {String(setting.value)}
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
