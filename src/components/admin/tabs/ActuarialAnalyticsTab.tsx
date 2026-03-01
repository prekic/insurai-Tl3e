import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '@/lib/admin/api'
import { Button } from '@/components/ui/button'
import { RefreshCw, Activity, AlertTriangle, CheckCircle, XCircle, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

interface DailyBucket {
  date: string
  total: number
  success: number
  failed: number
  avg_latency_ms: number
  avg_layer_a_ms: number
  avg_layer_b_ms: number
  avg_layer_c_ms: number
  avg_layer_d_ms: number | null
}

interface ActuarialAnalyticsData {
  overall: {
    total: number
    success: number
    failed: number
    error_rate: number
  }
  daily_buckets: DailyBucket[]
  buffer_size: number
}

export function ActuarialAnalyticsTab() {
  const [data, setData] = useState<ActuarialAnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [viewMode, setViewMode] = useState<'volume' | 'latency'>('volume')

  const fetchAnalytics = useCallback(async (selectedDays: number) => {
    try {
      setIsLoading(true)
      const response = await adminFetch(`/api/admin/actuarial/analytics?days=${selectedDays}`)
      const json = await response.json()
      if (json.success) {
        setData(json.data)
        setError(null)
      } else {
        setError(json.error || 'Failed to fetch analytics')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics(days)
  }, [fetchAnalytics, days])

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading actuarial analytics...</span>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
        <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 font-medium">{error}</p>
        <Button variant="outline" onClick={() => fetchAnalytics(days)} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { overall, daily_buckets } = data
  const errorRatePercent = (overall.error_rate * 100).toFixed(1)
  const isHealthy = overall.error_rate < 0.05
  const isWarning = overall.error_rate >= 0.05 && overall.error_rate < 0.2

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Actuarial Analytics & Observability
          </h2>
          <p className="text-sm text-gray-500">
            Monitor real-world engine performance and duration bounds
          </p>
        </div>

        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="border-none bg-transparent text-sm font-medium focus:ring-0 cursor-pointer px-2"
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
          <div className="w-px h-4 bg-gray-300 mx-1"></div>
          <button
            onClick={() => setViewMode('volume')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              viewMode === 'volume'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Volume View
          </button>
          <button
            onClick={() => setViewMode('latency')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              viewMode === 'latency'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Latency View
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Runs"
          value={String(overall.total)}
          icon={<Activity className="h-5 w-5 text-blue-500" />}
          color="blue"
        />
        <SummaryCard
          label="Successful"
          value={String(overall.success)}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          color="green"
        />
        <SummaryCard
          label="Failed/Ineligible"
          value={String(overall.failed)}
          icon={<XCircle className="h-5 w-5 text-amber-500" />}
          color={overall.failed > 0 ? 'amber' : 'green'}
        />
        <SummaryCard
          label="Rejection Rate"
          value={`${errorRatePercent}%`}
          icon={
            isHealthy ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : isWarning ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )
          }
          color={isHealthy ? 'green' : isWarning ? 'amber' : 'red'}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {viewMode === 'volume' ? (
              <Activity className="h-5 w-5 text-blue-500" />
            ) : (
              <Layers className="h-5 w-5 text-indigo-500" />
            )}
            {viewMode === 'volume' ? 'Run Volume' : 'Average Latency Bounds by Layer'}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAnalytics(days)}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {daily_buckets && daily_buckets.length > 0 ? (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {viewMode === 'volume' ? (
                <BarChart data={daily_buckets} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val) =>
                      new Date(val).getDate() +
                      ' ' +
                      new Date(val).toLocaleString('default', { month: 'short' })
                    }
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar
                    dataKey="success"
                    name="Eligible Runs"
                    stackId="a"
                    fill="#3B82F6"
                    radius={[0, 0, 4, 4]}
                  />
                  <Bar
                    dataKey="failed"
                    name="Ineligible Runs"
                    stackId="a"
                    fill="#FCD34D"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              ) : (
                <LineChart data={daily_buckets} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val) =>
                      new Date(val).getDate() +
                      ' ' +
                      new Date(val).toLocaleString('default', { month: 'short' })
                    }
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    dx={-10}
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                    tickFormatter={(val) => `${val}ms`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    formatter={(val: number) => [`${val} ms`, '']}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line
                    type="monotone"
                    dataKey="avg_latency_ms"
                    name="Total Duration"
                    stroke="#4F46E5"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_layer_a_ms"
                    name="Layer A (Semantic)"
                    stroke="#EC4899"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg_layer_c_ms"
                    name="Layer C (Monte Carlo)"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 h-[300px] text-gray-500">
            <Activity size={32} className="text-gray-300 mb-2" />
            <p>No analytics data available for this timeframe.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: 'blue' | 'green' | 'amber' | 'red'
}) {
  const bgColors = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    amber: 'bg-amber-50',
    red: 'bg-red-50',
  }
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
      <div className={cn('p-3 rounded-xl shrink-0', bgColors[color])}>{icon}</div>
      <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}
