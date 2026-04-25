import { useState, useEffect } from 'react'
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Area,
  Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase/client'
import { useTranslation } from '@/lib/i18n/i18n-context'

interface HistoricalResult {
  id: string
  created_at: string
  topsis_closeness: number
  topsis_grade: string
  monte_carlo_lower_bound: number | null
  monte_carlo_upper_bound: number | null
}

interface PolicyActuarialHistoryChartProps {
  policyId: string
}

export function PolicyActuarialHistoryChart({ policyId }: PolicyActuarialHistoryChartProps) {
  const [data, setData] = useState<HistoricalResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation()

  useEffect(() => {
    async function fetchHistory() {
      try {
        setIsLoading(true)
        setError(null)
        // We use the primary Supabase client to fetch directly
        const { data: results, error: fetchError } = await supabase
          .from('actuarial_evaluation_results')
          .select('id, evaluated_at, topsis_closeness, topsis_grade, result_data')
          .eq('policy_id', policyId)
          .order('evaluated_at', { ascending: true })
          .limit(20)

        if (fetchError) {
          throw new Error('Failed to fetch history: ' + fetchError.message)
        }
        if (results) {
          const formattedData = results.map(
            (r: {
              id: string
              evaluated_at: string
              topsis_closeness: number
              topsis_grade: string
              result_data?: {
                expectedOutOfPocket?: { percentiles?: { p5?: number; p95?: number } }
              }
            }) => ({
              id: r.id,
              created_at: r.evaluated_at,
              topsis_closeness: r.topsis_closeness,
              topsis_grade: r.topsis_grade,
              monte_carlo_lower_bound: r.result_data?.expectedOutOfPocket?.percentiles?.p5 ?? null,
              monte_carlo_upper_bound: r.result_data?.expectedOutOfPocket?.percentiles?.p95 ?? null,
            })
          )
          setData(formattedData as HistoricalResult[])
        } else {
          throw new Error('Invalid response')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    if (policyId) {
      fetchHistory()
    }
  }, [policyId])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.policy.evaluationHistory}</CardTitle>
          <CardDescription>{t.policy.evaluationHistoryLoading}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    // P0: Never leak raw Supabase / internal error strings to users.
    // Log for debugging and suppress entirely from UI rendering.
    console.warn('[PolicyActuarialHistoryChart] History fetch error (suppressed from UI):', error)
    return null
  }

  if (data.length === 0) {
    // Suppress empty-state card — an empty chart card is UI noise for users
    // who don't have historical evaluations yet.
    return null
  }

  // Format data for Recharts
  const chartData = data.map((d) => {
    return {
      date: new Date(d.created_at).toLocaleDateString(),
      fullDate: new Date(d.created_at).toLocaleString(),
      score: d.topsis_closeness,
      grade: d.topsis_grade,
      // Create a range array for Area chart: [lower, upper]
      confidenceArea:
        d.monte_carlo_lower_bound !== null && d.monte_carlo_upper_bound !== null
          ? [d.monte_carlo_lower_bound, d.monte_carlo_upper_bound]
          : null,
      lower: d.monte_carlo_lower_bound,
      upper: d.monte_carlo_upper_bound,
    }
  })

  // Check if any point has confidence intervals
  const hasConfidenceIntervals = chartData.some((d) => d.confidenceArea !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.policy.evaluationHistory}</CardTitle>
        <CardDescription>{t.policy.evaluationHistoryDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{
                top: 20,
                right: 20,
                bottom: 20,
                left: 0,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value} `}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12, fill: '#6B7280' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  Intl.NumberFormat('en-US', {
                    notation: 'compact',
                    compactDisplay: 'short',
                  }).format(value)
                }
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="bg-white p-3 border border-gray-200 shadow-sm rounded-lg">
                        <p className="font-medium text-sm text-gray-900 mb-1">{data.fullDate}</p>
                        <p className="text-sm text-blue-600 font-semibold">
                          Score: {Number(data.score).toFixed(2)} (Grade {data.grade})
                        </p>
                        {data.lower !== null && data.upper !== null && (
                          <p className="text-xs text-gray-500 mt-1">
                            95% CI: [{Number(data.lower).toFixed(2)},{' '}
                            {Number(data.upper).toFixed(2)}]
                          </p>
                        )}
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend verticalAlign="top" height={36} />

              {/* Confidence Interval Band */}
              {hasConfidenceIntervals && (
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="confidenceArea"
                  fill="#93C5FD"
                  stroke="none"
                  fillOpacity={0.3}
                  name="95% Confidence Interval"
                  isAnimationActive={true}
                />
              )}

              {/* Main Score Line */}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="score"
                stroke="#3B82F6"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: '#FFFFFF' }}
                activeDot={{ r: 6, strokeWidth: 0, fill: '#3B82F6' }}
                name="Actuarial Score"
                isAnimationActive={true}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
