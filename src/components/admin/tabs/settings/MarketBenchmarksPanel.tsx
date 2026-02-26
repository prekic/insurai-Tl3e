import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSkeleton } from '@/components/ui/loading'
import { adminFetch } from '@/lib/admin/api'
import { Building2, Plus, Edit2, Trash2, X, RefreshCw, AlertCircle } from 'lucide-react'

export interface MarketBenchmark {
  id: string
  policy_type: string
  coverage_type: string
  coverage_name_tr: string
  region_code: string | null
  year: number
  min_limit: number | null
  typical_limit: number | null
  max_limit: number | null
  min_deductible: number | null
  typical_deductible: number | null
  max_deductible: number | null
  inclusion_rate: number | null
  importance: 'critical' | 'important' | 'standard' | 'optional'
  source: string | null
  notes: string | null
  is_active: boolean
  currency: string
  created_at: string
  updated_at: string
}

export function MarketBenchmarksPanel() {
  const [benchmarks, setBenchmarks] = useState<MarketBenchmark[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBenchmark, setEditingBenchmark] = useState<MarketBenchmark | null>(null)

  const fetchBenchmarks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await adminFetch('/api/admin/settings/benchmarks')
      const json = await res.json()
      if (json.success) {
        setBenchmarks(json.data)
      } else {
        setError(json.error || 'Failed to fetch benchmarks')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch benchmarks')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBenchmarks()
  }, [fetchBenchmarks])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this benchmark? It will be marked as inactive.'))
      return

    setIsSaving(true)
    setError(null)
    try {
      const res = await adminFetch(`/api/admin/settings/benchmarks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: false }),
      })
      const json = await res.json()
      if (json.success) {
        setBenchmarks((prev) => prev.map((b) => (b.id === id ? { ...b, is_active: false } : b)))
      } else {
        setError(json.error || 'Failed to delete benchmark')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete benchmark')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (benchmark: MarketBenchmark) => {
    setEditingBenchmark(benchmark)
    setIsFormOpen(true)
  }

  const handleAddNew = () => {
    setEditingBenchmark(null)
    setIsFormOpen(true)
  }

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const benchmarkData = {
      policy_type: formData.get('policy_type') as string,
      coverage_type: formData.get('coverage_type') as string,
      coverage_name_tr: formData.get('coverage_name_tr') as string,
      region_code: (formData.get('region_code') as string) || null,
      year: parseInt(formData.get('year') as string),
      min_limit: formData.get('min_limit') ? parseInt(formData.get('min_limit') as string) : null,
      typical_limit: formData.get('typical_limit')
        ? parseInt(formData.get('typical_limit') as string)
        : null,
      max_limit: formData.get('max_limit') ? parseInt(formData.get('max_limit') as string) : null,
      min_deductible: formData.get('min_deductible')
        ? parseInt(formData.get('min_deductible') as string)
        : null,
      typical_deductible: formData.get('typical_deductible')
        ? parseInt(formData.get('typical_deductible') as string)
        : null,
      max_deductible: formData.get('max_deductible')
        ? parseInt(formData.get('max_deductible') as string)
        : null,
      inclusion_rate: formData.get('inclusion_rate')
        ? parseFloat(formData.get('inclusion_rate') as string)
        : null,
      importance: formData.get('importance') as MarketBenchmark['importance'],
      source: (formData.get('source') as string) || null,
      notes: (formData.get('notes') as string) || null,
      is_active: formData.get('is_active') === 'on',
      currency: (formData.get('currency') as string) || 'TRY',
    }

    try {
      const url = editingBenchmark
        ? `/api/admin/settings/benchmarks/${editingBenchmark.id}`
        : '/api/admin/settings/benchmarks'
      const method = editingBenchmark ? 'PUT' : 'POST'

      const res = await adminFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(benchmarkData),
      })

      const json = await res.json()

      if (json.success) {
        if (editingBenchmark) {
          setBenchmarks((prev) => prev.map((b) => (b.id === editingBenchmark.id ? json.data : b)))
        } else {
          setBenchmarks((prev) => [json.data, ...prev])
        }
        setIsFormOpen(false)
        setEditingBenchmark(null)
      } else {
        setError(json.error || 'Failed to save benchmark')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save benchmark')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading && !isFormOpen && benchmarks.length === 0) {
    return <SettingsSkeleton groups={1} itemsPerGroup={1} />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              Coverage Market Benchmarks
            </CardTitle>
            <CardDescription>
              Configure typical coverage values by policy type and region to generate AI insights
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchBenchmarks} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={handleAddNew} disabled={isFormOpen}>
              <Plus className="h-4 w-4 mr-1" />
              Add Benchmark
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isFormOpen ? (
            <div className="border rounded-lg p-6 bg-gray-50 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingBenchmark ? 'Edit Benchmark' : 'Add New Benchmark'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Policy Type *
                    </label>
                    <Input
                      name="policy_type"
                      defaultValue={editingBenchmark?.policy_type || ''}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Coverage Type *
                    </label>
                    <Input
                      name="coverage_type"
                      defaultValue={editingBenchmark?.coverage_type || ''}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Coverage Name (TR) *
                    </label>
                    <Input
                      name="coverage_name_tr"
                      defaultValue={editingBenchmark?.coverage_name_tr || ''}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Region Code
                    </label>
                    <Input
                      name="region_code"
                      defaultValue={editingBenchmark?.region_code || ''}
                      placeholder="e.g., TR, 34"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year *</label>
                    <Input
                      type="number"
                      name="year"
                      defaultValue={editingBenchmark?.year || new Date().getFullYear()}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Importance *
                    </label>
                    <select
                      name="importance"
                      defaultValue={editingBenchmark?.importance || 'standard'}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    >
                      <option value="critical">Critical</option>
                      <option value="important">Important</option>
                      <option value="standard">Standard</option>
                      <option value="optional">Optional</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Limit
                    </label>
                    <Input
                      type="number"
                      name="min_limit"
                      defaultValue={editingBenchmark?.min_limit || ''}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Typical Limit
                    </label>
                    <Input
                      type="number"
                      name="typical_limit"
                      defaultValue={editingBenchmark?.typical_limit || ''}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Limit
                    </label>
                    <Input
                      type="number"
                      name="max_limit"
                      defaultValue={editingBenchmark?.max_limit || ''}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Deductible
                    </label>
                    <Input
                      type="number"
                      name="min_deductible"
                      defaultValue={editingBenchmark?.min_deductible || ''}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Typical Deductible
                    </label>
                    <Input
                      type="number"
                      name="typical_deductible"
                      defaultValue={editingBenchmark?.typical_deductible || ''}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Deductible
                    </label>
                    <Input
                      type="number"
                      name="max_deductible"
                      defaultValue={editingBenchmark?.max_deductible || ''}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Inclusion Rate (0-100)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      name="inclusion_rate"
                      defaultValue={editingBenchmark?.inclusion_rate || ''}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                    <Input name="currency" defaultValue={editingBenchmark?.currency || 'TRY'} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                    <Input name="source" defaultValue={editingBenchmark?.source || ''} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <Input name="notes" defaultValue={editingBenchmark?.notes || ''} />
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      defaultChecked={editingBenchmark ? editingBenchmark.is_active : true}
                    />
                    <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                      Active
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    {editingBenchmark ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium">Policy Type</th>
                  <th className="px-4 py-3 font-medium">Coverage</th>
                  <th className="px-4 py-3 font-medium">Typical Limit</th>
                  <th className="px-4 py-3 font-medium">Typical Deductible</th>
                  <th className="px-4 py-3 font-medium">Importance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No market benchmarks configured yet.
                    </td>
                  </tr>
                ) : (
                  benchmarks.map((benchmark) => (
                    <tr key={benchmark.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{benchmark.policy_type}</td>
                      <td className="px-4 py-3">{benchmark.coverage_name_tr}</td>
                      <td className="px-4 py-3">
                        {benchmark.typical_limit !== null && benchmark.typical_limit !== undefined
                          ? benchmark.typical_limit.toLocaleString()
                          : '-'}{' '}
                        {benchmark.typical_limit !== null && benchmark.typical_limit !== undefined
                          ? benchmark.currency
                          : ''}
                      </td>
                      <td className="px-4 py-3">
                        {benchmark.typical_deductible !== null &&
                        benchmark.typical_deductible !== undefined
                          ? benchmark.typical_deductible.toLocaleString()
                          : '-'}{' '}
                        {benchmark.typical_deductible !== null &&
                        benchmark.typical_deductible !== undefined
                          ? benchmark.currency
                          : ''}
                      </td>
                      <td className="px-4 py-3 capitalize">{benchmark.importance}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${benchmark.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                        >
                          {benchmark.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-600"
                            onClick={() => handleEdit(benchmark)}
                          >
                            <span className="sr-only">Edit</span>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600"
                            onClick={() => handleDelete(benchmark.id)}
                            disabled={!benchmark.is_active || isSaving}
                          >
                            <span className="sr-only">Delete</span>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
