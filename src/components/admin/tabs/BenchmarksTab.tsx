/**
 * Benchmarks Tab
 * Premium benchmarks management for policy evaluation
 * Allows admin to edit min/avg/max premiums and choose comparison method
 */

import { adminFetch } from '@/lib/admin/api'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  BarChart3,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Calculator,
  Percent,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'

interface PremiumBenchmark {
  id: string
  insurance_type: string
  insurance_type_tr: string
  sub_type: string | null
  sub_type_tr: string | null
  min_premium: number
  avg_premium: number
  max_premium: number
  comparison_method: 'direct_premium' | 'value_based'
  value_min_rate: number | null
  value_avg_rate: number | null
  value_max_rate: number | null
  currency: string
  year: number
  source: string | null
  source_tr: string | null
  notes: string | null
  notes_tr: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const COMPARISON_METHODS = [
  { value: 'direct_premium', label: 'Direkt Prim Karşılaştırması', labelEn: 'Direct Premium Comparison' },
  { value: 'value_based', label: 'Değer Bazlı (% Oran)', labelEn: 'Value Based (% Rate)' },
]

const INSURANCE_TYPES_DEFAULT = [
  { value: 'zmss', label: 'Zorunlu Mali Sorumluluk (Trafik)' },
  { value: 'kasko', label: 'Kasko' },
  { value: 'dask', label: 'DASK (Zorunlu Deprem)' },
  { value: 'home', label: 'Konut Sigortası' },
  { value: 'health', label: 'Sağlık Sigortası' },
  { value: 'life', label: 'Hayat Sigortası' },
  { value: 'business', label: 'İşyeri Sigortası' },
  { value: 'nakliyat', label: 'Nakliyat Sigortası' },
]

export function BenchmarksTab() {
  const [benchmarks, setBenchmarks] = useState<PremiumBenchmark[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<PremiumBenchmark>>({})
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [newBenchmark, setNewBenchmark] = useState<Partial<PremiumBenchmark>>({
    comparison_method: 'direct_premium',
    currency: 'TRY',
    year: new Date().getFullYear(),
    is_active: true,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [showBulkUpdate, setShowBulkUpdate] = useState(false)
  const [bulkUpdateData, setBulkUpdateData] = useState({
    year: new Date().getFullYear() + 1,
    multiplier: 1.2,
    insurance_type: '',
  })

  const fetchBenchmarks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await adminFetch('/api/admin/benchmarks?is_active=true')
      const data = await response.json()
      if (data.success) {
        setBenchmarks(data.data)
        // Expand first type by default
        if (data.data.length > 0) {
          const types = [...new Set(data.data.map((b: PremiumBenchmark) => b.insurance_type))]
          setExpandedTypes(new Set([types[0] as string]))
        }
      } else {
        setError(data.error || 'Failed to fetch benchmarks')
      }
    } catch (err) {
      console.error('Failed to fetch benchmarks:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch benchmarks')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBenchmarks()
  }, [fetchBenchmarks])

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const startEditing = (benchmark: PremiumBenchmark) => {
    setEditingId(benchmark.id)
    setEditData({ ...benchmark })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveBenchmark = async () => {
    if (!editingId || !editData) return

    setIsSaving(true)
    setError(null)
    try {
      const response = await adminFetch(`/api/admin/benchmarks/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })

      const data = await response.json()
      if (data.success) {
        setBenchmarks(benchmarks.map(b => b.id === editingId ? data.data : b))
        setEditingId(null)
        setEditData({})
      } else {
        setError(data.error || 'Failed to save benchmark')
      }
    } catch (err) {
      console.error('Failed to save benchmark:', err)
      setError(err instanceof Error ? err.message : 'Failed to save benchmark')
    } finally {
      setIsSaving(false)
    }
  }

  const createBenchmark = async () => {
    if (!newBenchmark.insurance_type || !newBenchmark.insurance_type_tr) {
      setError('Insurance type is required')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const response = await adminFetch('/api/admin/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBenchmark),
      })

      const data = await response.json()
      if (data.success) {
        setBenchmarks([...benchmarks, data.data])
        setShowAddForm(false)
        setNewBenchmark({
          comparison_method: 'direct_premium',
          currency: 'TRY',
          year: new Date().getFullYear(),
          is_active: true,
        })
        // Expand the type to show new benchmark
        setExpandedTypes(prev => new Set([...prev, data.data.insurance_type]))
      } else {
        setError(data.error || 'Failed to create benchmark')
      }
    } catch (err) {
      console.error('Failed to create benchmark:', err)
      setError(err instanceof Error ? err.message : 'Failed to create benchmark')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteBenchmark = async (id: string) => {
    if (!confirm('Bu benchmark\'ı silmek istediğinizden emin misiniz?')) return

    try {
      const response = await adminFetch(`/api/admin/benchmarks/${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.success) {
        setBenchmarks(benchmarks.filter(b => b.id !== id))
      } else {
        setError(data.error || 'Failed to delete benchmark')
      }
    } catch (err) {
      console.error('Failed to delete benchmark:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete benchmark')
    }
  }

  const runBulkUpdate = async () => {
    if (!bulkUpdateData.year || !bulkUpdateData.multiplier) {
      setError('Year and multiplier are required')
      return
    }

    if (!confirm(`Tüm ${bulkUpdateData.insurance_type || 'sigorta'} benchmark'larını ${bulkUpdateData.multiplier}x çarpanı ile güncellemek istediğinizden emin misiniz?`)) {
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const response = await adminFetch('/api/admin/benchmarks/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkUpdateData),
      })

      const data = await response.json()
      if (data.success) {
        setShowBulkUpdate(false)
        fetchBenchmarks() // Refresh the list
      } else {
        setError(data.error || 'Failed to bulk update benchmarks')
      }
    } catch (err) {
      console.error('Failed to bulk update:', err)
      setError(err instanceof Error ? err.message : 'Failed to bulk update benchmarks')
    } finally {
      setIsSaving(false)
    }
  }

  // Group benchmarks by insurance type
  const groupedBenchmarks = benchmarks.reduce((acc, benchmark) => {
    if (!acc[benchmark.insurance_type]) {
      acc[benchmark.insurance_type] = {
        label: benchmark.insurance_type_tr,
        benchmarks: [],
      }
    }
    acc[benchmark.insurance_type].benchmarks.push(benchmark)
    return acc
  }, {} as Record<string, { label: string; benchmarks: PremiumBenchmark[] }>)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value)
  }

  const formatPercent = (value: number | null) => {
    if (value === null) return '-'
    return `%${(value * 100).toFixed(2)}`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin mr-2" size={20} />
        <span>Benchmark verileri yükleniyor...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={24} />
            Prim Benchmark Yönetimi
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Poliçe değerlendirmesi için kullanılan prim benchmark değerlerini yönetin
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulkUpdate(!showBulkUpdate)}>
            <TrendingUp size={16} className="mr-2" />
            Toplu Güncelle
          </Button>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus size={16} className="mr-2" />
            Yeni Benchmark
          </Button>
          <Button variant="outline" onClick={fetchBenchmarks}>
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
          <AlertTriangle size={20} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto">
            <X size={16} />
          </Button>
        </div>
      )}

      {/* Bulk Update Form */}
      {showBulkUpdate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Toplu Prim Güncellemesi</CardTitle>
            <CardDescription>
              Yıllık enflasyon veya piyasa değişikliklerine göre tüm benchmark değerlerini güncelleyin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium">Sigorta Türü</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                  value={bulkUpdateData.insurance_type}
                  onChange={e => setBulkUpdateData({ ...bulkUpdateData, insurance_type: e.target.value })}
                >
                  <option value="">Tümü</option>
                  {INSURANCE_TYPES_DEFAULT.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Yeni Yıl</label>
                <Input
                  type="number"
                  value={bulkUpdateData.year}
                  onChange={e => setBulkUpdateData({ ...bulkUpdateData, year: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Çarpan (ör: 1.2 = %20 artış)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={bulkUpdateData.multiplier}
                  onChange={e => setBulkUpdateData({ ...bulkUpdateData, multiplier: parseFloat(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={runBulkUpdate} disabled={isSaving} className="w-full">
                  {isSaving ? <RefreshCw className="animate-spin mr-2" size={16} /> : <TrendingUp size={16} className="mr-2" />}
                  Güncelle
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add New Benchmark Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Yeni Benchmark Ekle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Sigorta Türü (EN)*</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                  value={newBenchmark.insurance_type || ''}
                  onChange={e => {
                    const selected = INSURANCE_TYPES_DEFAULT.find(t => t.value === e.target.value)
                    setNewBenchmark({
                      ...newBenchmark,
                      insurance_type: e.target.value,
                      insurance_type_tr: selected?.label || '',
                    })
                  }}
                >
                  <option value="">Seçin...</option>
                  {INSURANCE_TYPES_DEFAULT.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Sigorta Türü (TR)*</label>
                <Input
                  value={newBenchmark.insurance_type_tr || ''}
                  onChange={e => setNewBenchmark({ ...newBenchmark, insurance_type_tr: e.target.value })}
                  placeholder="ör: Kasko"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Alt Tür (EN)</label>
                <Input
                  value={newBenchmark.sub_type || ''}
                  onChange={e => setNewBenchmark({ ...newBenchmark, sub_type: e.target.value })}
                  placeholder="ör: economy"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Alt Tür (TR)</label>
                <Input
                  value={newBenchmark.sub_type_tr || ''}
                  onChange={e => setNewBenchmark({ ...newBenchmark, sub_type_tr: e.target.value })}
                  placeholder="ör: Ekonomik Araç"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Karşılaştırma Yöntemi*</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                  value={newBenchmark.comparison_method || 'direct_premium'}
                  onChange={e => setNewBenchmark({ ...newBenchmark, comparison_method: e.target.value as 'direct_premium' | 'value_based' })}
                >
                  {COMPARISON_METHODS.map(method => (
                    <option key={method.value} value={method.value}>{method.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Yıl</label>
                <Input
                  type="number"
                  value={newBenchmark.year || new Date().getFullYear()}
                  onChange={e => setNewBenchmark({ ...newBenchmark, year: parseInt(e.target.value) })}
                />
              </div>

              {/* Premium fields */}
              <div>
                <label className="text-sm font-medium">Min Prim (₺)*</label>
                <Input
                  type="number"
                  value={newBenchmark.min_premium || ''}
                  onChange={e => setNewBenchmark({ ...newBenchmark, min_premium: parseFloat(e.target.value) })}
                  placeholder="3000"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Ort Prim (₺)*</label>
                <Input
                  type="number"
                  value={newBenchmark.avg_premium || ''}
                  onChange={e => setNewBenchmark({ ...newBenchmark, avg_premium: parseFloat(e.target.value) })}
                  placeholder="4500"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max Prim (₺)*</label>
                <Input
                  type="number"
                  value={newBenchmark.max_premium || ''}
                  onChange={e => setNewBenchmark({ ...newBenchmark, max_premium: parseFloat(e.target.value) })}
                  placeholder="8000"
                />
              </div>

              {/* Value-based rate fields (shown when comparison_method is value_based) */}
              {newBenchmark.comparison_method === 'value_based' && (
                <>
                  <div>
                    <label className="text-sm font-medium">Min Oran (%)</label>
                    <Input
                      type="number"
                      step="0.001"
                      value={newBenchmark.value_min_rate ? newBenchmark.value_min_rate * 100 : ''}
                      onChange={e => setNewBenchmark({ ...newBenchmark, value_min_rate: parseFloat(e.target.value) / 100 })}
                      placeholder="1.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Ort Oran (%)</label>
                    <Input
                      type="number"
                      step="0.001"
                      value={newBenchmark.value_avg_rate ? newBenchmark.value_avg_rate * 100 : ''}
                      onChange={e => setNewBenchmark({ ...newBenchmark, value_avg_rate: parseFloat(e.target.value) / 100 })}
                      placeholder="2.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Max Oran (%)</label>
                    <Input
                      type="number"
                      step="0.001"
                      value={newBenchmark.value_max_rate ? newBenchmark.value_max_rate * 100 : ''}
                      onChange={e => setNewBenchmark({ ...newBenchmark, value_max_rate: parseFloat(e.target.value) / 100 })}
                      placeholder="4.0"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium">Kaynak</label>
                <Input
                  value={newBenchmark.source || ''}
                  onChange={e => setNewBenchmark({ ...newBenchmark, source: e.target.value })}
                  placeholder="TSB Market Data"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Kaynak (TR)</label>
                <Input
                  value={newBenchmark.source_tr || ''}
                  onChange={e => setNewBenchmark({ ...newBenchmark, source_tr: e.target.value })}
                  placeholder="TSB Piyasa Verileri"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                İptal
              </Button>
              <Button onClick={createBenchmark} disabled={isSaving}>
                {isSaving ? <RefreshCw className="animate-spin mr-2" size={16} /> : <Plus size={16} className="mr-2" />}
                Ekle
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Benchmarks List by Type */}
      {Object.keys(groupedBenchmarks).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Henüz benchmark verisi bulunmuyor. Yukarıdaki butonu kullanarak yeni benchmark ekleyin.
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedBenchmarks).map(([type, { label, benchmarks: typeBenchmarks }]) => (
          <Card key={type}>
            <CardHeader
              className="cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleType(type)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {expandedTypes.has(type) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  {label}
                  <Badge variant="outline">{typeBenchmarks.length}</Badge>
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {typeBenchmarks[0]?.comparison_method === 'value_based' ? (
                    <Badge variant="secondary" className="gap-1">
                      <Percent size={12} />
                      Değer Bazlı
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Calculator size={12} />
                      Direkt Prim
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            {expandedTypes.has(type) && (
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Alt Tür</th>
                        <th className="text-right py-2 px-2">Min Prim</th>
                        <th className="text-right py-2 px-2">Ort Prim</th>
                        <th className="text-right py-2 px-2">Max Prim</th>
                        {typeBenchmarks[0]?.comparison_method === 'value_based' && (
                          <>
                            <th className="text-right py-2 px-2">Min %</th>
                            <th className="text-right py-2 px-2">Ort %</th>
                            <th className="text-right py-2 px-2">Max %</th>
                          </>
                        )}
                        <th className="text-right py-2 px-2">Yıl</th>
                        <th className="text-right py-2 px-2">Kaynak</th>
                        <th className="text-right py-2 px-2">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeBenchmarks.map(benchmark => (
                        <tr key={benchmark.id} className="border-b hover:bg-gray-50">
                          {editingId === benchmark.id ? (
                            // Edit mode
                            <>
                              <td className="py-2 px-2">
                                <Input
                                  value={editData.sub_type_tr || ''}
                                  onChange={e => setEditData({ ...editData, sub_type_tr: e.target.value })}
                                  className="h-8"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  type="number"
                                  value={editData.min_premium || ''}
                                  onChange={e => setEditData({ ...editData, min_premium: parseFloat(e.target.value) })}
                                  className="h-8 w-24 text-right"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  type="number"
                                  value={editData.avg_premium || ''}
                                  onChange={e => setEditData({ ...editData, avg_premium: parseFloat(e.target.value) })}
                                  className="h-8 w-24 text-right"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  type="number"
                                  value={editData.max_premium || ''}
                                  onChange={e => setEditData({ ...editData, max_premium: parseFloat(e.target.value) })}
                                  className="h-8 w-24 text-right"
                                />
                              </td>
                              {benchmark.comparison_method === 'value_based' && (
                                <>
                                  <td className="py-2 px-2">
                                    <Input
                                      type="number"
                                      step="0.001"
                                      value={editData.value_min_rate ? (editData.value_min_rate * 100).toFixed(2) : ''}
                                      onChange={e => setEditData({ ...editData, value_min_rate: parseFloat(e.target.value) / 100 })}
                                      className="h-8 w-20 text-right"
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <Input
                                      type="number"
                                      step="0.001"
                                      value={editData.value_avg_rate ? (editData.value_avg_rate * 100).toFixed(2) : ''}
                                      onChange={e => setEditData({ ...editData, value_avg_rate: parseFloat(e.target.value) / 100 })}
                                      className="h-8 w-20 text-right"
                                    />
                                  </td>
                                  <td className="py-2 px-2">
                                    <Input
                                      type="number"
                                      step="0.001"
                                      value={editData.value_max_rate ? (editData.value_max_rate * 100).toFixed(2) : ''}
                                      onChange={e => setEditData({ ...editData, value_max_rate: parseFloat(e.target.value) / 100 })}
                                      className="h-8 w-20 text-right"
                                    />
                                  </td>
                                </>
                              )}
                              <td className="py-2 px-2">
                                <Input
                                  type="number"
                                  value={editData.year || ''}
                                  onChange={e => setEditData({ ...editData, year: parseInt(e.target.value) })}
                                  className="h-8 w-20 text-right"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  value={editData.source_tr || ''}
                                  onChange={e => setEditData({ ...editData, source_tr: e.target.value })}
                                  className="h-8"
                                />
                              </td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" onClick={saveBenchmark} disabled={isSaving}>
                                    <Check size={14} className="text-green-600" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={cancelEditing}>
                                    <X size={14} className="text-red-600" />
                                  </Button>
                                </div>
                              </td>
                            </>
                          ) : (
                            // View mode
                            <>
                              <td className="py-2 px-2 font-medium">{benchmark.sub_type_tr || '-'}</td>
                              <td className="py-2 px-2 text-right">{formatCurrency(benchmark.min_premium)}</td>
                              <td className="py-2 px-2 text-right font-medium text-blue-600">{formatCurrency(benchmark.avg_premium)}</td>
                              <td className="py-2 px-2 text-right">{formatCurrency(benchmark.max_premium)}</td>
                              {benchmark.comparison_method === 'value_based' && (
                                <>
                                  <td className="py-2 px-2 text-right text-gray-500">{formatPercent(benchmark.value_min_rate)}</td>
                                  <td className="py-2 px-2 text-right font-medium text-purple-600">{formatPercent(benchmark.value_avg_rate)}</td>
                                  <td className="py-2 px-2 text-right text-gray-500">{formatPercent(benchmark.value_max_rate)}</td>
                                </>
                              )}
                              <td className="py-2 px-2 text-right">{benchmark.year}</td>
                              <td className="py-2 px-2 text-right text-gray-500 text-xs">{benchmark.source_tr || benchmark.source || '-'}</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => startEditing(benchmark)}>
                                    <Edit2 size={14} />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => deleteBenchmark(benchmark.id)}>
                                    <Trash2 size={14} className="text-red-500" />
                                  </Button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Explanation for comparison method */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                  {typeBenchmarks[0]?.comparison_method === 'value_based' ? (
                    <>
                      <strong>Değer Bazlı Karşılaştırma:</strong> Prim, sigortalanan değerin yüzdesi olarak değerlendirilir.
                      Örneğin, 500.000₺ değerindeki bir araç için %2.5 oran = 12.500₺ beklenen prim.
                    </>
                  ) : (
                    <>
                      <strong>Direkt Prim Karşılaştırması:</strong> Prim doğrudan min/ort/max değerleriyle karşılaştırılır.
                      Örneğin, 4.500₺ ortalama prim altındaki değerler iyi kabul edilir.
                    </>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  )
}
