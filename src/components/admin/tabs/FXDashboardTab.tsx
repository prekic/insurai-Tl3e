import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/loading'
import { adminFetch } from '@/lib/admin/api'
import { toast } from 'sonner'
import { Activity, RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'

interface FXRateHistory {
  id: string
  base_currency: string
  rates: Record<string, number>
  source: string
  created_at: string
}

export function FXDashboardTab() {
  const [isLoading, setIsLoading] = useState(true)
  const [history, setHistory] = useState<FXRateHistory[]>([])

  const fetchHistory = async () => {
    try {
      setIsLoading(true)
      const res = await adminFetch('/api/admin/fx/history')
      const data = await res.json()

      if (data.success && data.data) {
        setHistory(data.data)
      } else {
        toast.error(data.error || 'Failed to load FX history')
      }
    } catch (err) {
      console.error('Error fetching FX history:', err)
      toast.error('Error connecting to API')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  const chartData = useMemo(() => {
    // Reverse to get chronological order for charts
    const sorted = [...history].reverse()
    return sorted.map((entry) => {
      return {
        timestamp: format(new Date(entry.created_at), 'MM/dd HH:mm'),
        EUR: entry.rates.EUR,
        GBP: entry.rates.GBP,
        JPY: entry.rates.JPY,
        CAD: entry.rates.CAD,
        AUD: entry.rates.AUD,
      }
    })
  }, [history])

  const latestRates = history.length > 0 ? history[0] : null
  const previousRates = history.length > 1 ? history[1] : null

  const calculateChange = (currency: string) => {
    if (!latestRates || !previousRates) return 0
    const current = latestRates.rates[currency]
    const previous = previousRates.rates[currency]
    if (!current || !previous) return 0
    return ((current - previous) / previous) * 100
  }

  if (isLoading && history.length === 0) {
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
            <Activity className="h-6 w-6 text-green-600" />
            FX Rates Monitoring
          </h2>
          <p className="text-gray-500 mt-1">
            Monitor real-time exchange rates and historical fluctuations for configured currencies.
          </p>
        </div>
        <Button onClick={fetchHistory} disabled={isLoading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {!latestRates ? (
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No FX Data Available</h3>
            <p className="text-gray-500 text-center max-w-sm mt-2">
              The system hasn&apos;t recorded any FX rate data yet. Rates are fetched automatically
              when quotes are requested.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {['EUR', 'GBP', 'JPY', 'CAD', 'AUD'].map((currency) => {
              const rate = latestRates.rates[currency]
              const change = calculateChange(currency)
              const isPositive = change > 0
              const isSignificant = Math.abs(change) > 5

              return (
                <Card key={currency} className={isSignificant ? 'border-amber-400' : ''}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="text-sm font-medium text-gray-500">USD / {currency}</div>
                      {isSignificant && (
                        <span title="Significant Deviation (>5%)">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <div className="text-2xl font-bold">
                        {rate ? rate.toFixed(currency === 'JPY' ? 2 : 4) : 'N/A'}
                      </div>
                    </div>
                    {change !== 0 && (
                      <div
                        className={`text-xs mt-1 flex items-center font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}
                      >
                        <TrendingUp className={`h-3 w-3 mr-1 ${!isPositive && 'rotate-180'}`} />
                        {Math.abs(change).toFixed(2)}%
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Historical Exchange Rates</CardTitle>
              <CardDescription>
                Exchange rates against USD for the last 100 recorded data points
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                      dataKey="timestamp"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: 'none',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Legend iconType="circle" />
                    <Line
                      type="monotone"
                      dataKey="EUR"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="GBP"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="JPY"
                      stroke="#ec4899"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="CAD"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="AUD"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">Recorded At</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium text-right">EUR</th>
                      <th className="px-4 py-3 font-medium text-right">GBP</th>
                      <th className="px-4 py-3 font-medium text-right">JPY</th>
                      <th className="px-4 py-3 font-medium text-right">CAD</th>
                      <th className="px-4 py-3 font-medium text-right">AUD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 20).map((record) => (
                      <tr key={record.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500">
                          {format(new Date(record.created_at), 'MMM dd, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {record.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {record.rates.EUR?.toFixed(4) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {record.rates.GBP?.toFixed(4) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {record.rates.JPY?.toFixed(2) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {record.rates.CAD?.toFixed(4) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {record.rates.AUD?.toFixed(4) || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {history.length > 20 && (
                <div className="mt-4 text-center text-sm text-gray-500">
                  Showing latest 20 records of {history.length} total fetched.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
