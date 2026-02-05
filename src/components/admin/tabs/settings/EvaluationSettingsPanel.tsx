/**
 * Evaluation Settings Panel
 * Configure policy scoring weights and grade thresholds
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Save,
  Scale,
  Trophy,
  Target,
  AlertCircle,
  Info,
} from 'lucide-react'
import type { SettingValue } from '../SettingsTab'

interface EvaluationSettingsPanelProps {
  settings: SettingValue[]
  onUpdate: (key: string, value: unknown, reason?: string) => Promise<void>
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
  isLoading,
  isSaving,
}: EvaluationSettingsPanelProps) {
  const [editingWeights, setEditingWeights] = useState(false)
  const [editingGrades, setEditingGrades] = useState(false)
  const [tempWeights, setTempWeights] = useState<Record<string, number>>({})
  const [tempGrades, setTempGrades] = useState<Record<string, number>>({})
  const [editReason, setEditReason] = useState('')

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

  const totalWeight = useMemo(() => {
    const weights = editingWeights ? tempWeights : currentWeights
    return Object.values(weights).reduce((sum, w) => sum + w, 0)
  }, [editingWeights, tempWeights, currentWeights])

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
    for (const [key, value] of Object.entries(tempWeights)) {
      if (value !== currentWeights[key]) {
        await onUpdate(key, value, editReason || 'Updated via weights panel')
      }
    }
    setEditingWeights(false)
  }

  const saveGrades = async () => {
    for (const [key, value] of Object.entries(tempGrades)) {
      if (value !== currentGrades[key]) {
        await onUpdate(key, value, editReason || 'Updated via grades panel')
      }
    }
    setEditingGrades(false)
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
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-gray-500">Loading evaluation settings...</div>
        </CardContent>
      </Card>
    )
  }

  if (settings.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-gray-500 flex flex-col items-center gap-2">
            <AlertCircle className="h-8 w-8" />
            <p>No evaluation settings found. Run the database migration to seed default values.</p>
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
              <span
                className={totalWeight !== 100 ? 'text-red-500 font-medium' : 'text-green-500'}
              >
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
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={weight}
                        onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                        className="w-20"
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
              <CardDescription>
                Set the minimum score required for each grade level
              </CardDescription>
            </div>
            {!editingGrades ? (
              <Button onClick={startEditingGrades}>Edit Thresholds</Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={saveGrades} disabled={isSaving}>
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

          {/* Info box */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-blue-700">
            <Info className="h-4 w-4 mt-0.5" />
            <div className="text-sm">
              <strong>How grades work:</strong> A policy with a score of 85 would receive grade B
              (if B threshold is 80 and A threshold is 90). Score below D threshold gets grade F.
            </div>
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
                  !WEIGHT_KEYS.includes(s.key) && !GRADE_KEYS.includes(s.key)
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
