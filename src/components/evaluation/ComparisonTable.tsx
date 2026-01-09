import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { TrophyIndicator, RankBadge } from './WinnerBadge'
import { GradeBadge } from './GradeBadge'
import type { PolicyComparison, ComparisonMetric, ComparisonPolicy } from '@/lib/policy-evaluation/types'

interface ComparisonTableProps {
  comparison: PolicyComparison
  className?: string
}

/**
 * Side-by-side comparison table showing metrics across policies.
 * Supports horizontal scroll on mobile with sticky first column.
 */
export function ComparisonTable({ comparison, className }: ComparisonTableProps) {
  const { locale } = useI18n()
  const { policies, metrics, rankings } = comparison

  // Get ranking for a policy
  const getRanking = (policyId: string) => {
    return rankings.find(r => r.policyId === policyId)
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-600 min-w-[140px] z-10">
              {locale === 'tr' ? 'Metrik' : 'Metric'}
            </th>
            {policies.map((p) => (
              <th key={p.policy.id} className="px-4 py-3 text-center min-w-[140px]">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg" aria-hidden="true">{p.policy.logo}</span>
                  <span className="font-semibold text-gray-900 text-sm">{p.label || p.policy.provider}</span>
                  <span className="text-xs text-gray-500">{p.policy.policyNumber}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Overall Score Row */}
          <tr className="bg-blue-50/50">
            <td className="sticky left-0 bg-blue-50/50 px-4 py-3 font-medium text-gray-900 z-10">
              {locale === 'tr' ? 'Genel Puan' : 'Overall Score'}
            </td>
            {policies.map((p) => {
              const rank = getRanking(p.policy.id)
              const isWinner = comparison.winners.overallBest === p.policy.id
              return (
                <td key={p.policy.id} className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-lg font-bold text-gray-900">{p.evaluation.overallScore}</span>
                    <GradeBadge grade={p.evaluation.grade} size="sm" />
                    {isWinner && <TrophyIndicator isWinner isBest />}
                    {rank && <RankBadge rank={rank.overallRank} size="sm" />}
                  </div>
                </td>
              )
            })}
          </tr>

          {/* Metric Rows */}
          {metrics.map((metric) => (
            <MetricRow key={metric.name} metric={metric} policies={policies} locale={locale} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface MetricRowProps {
  metric: ComparisonMetric
  policies: ComparisonPolicy[]
  locale: string
}

function MetricRow({ metric, policies, locale }: MetricRowProps) {
  const name = locale === 'tr' ? metric.nameTR : metric.name

  const formatValue = (value: number | string, unit: string): string => {
    if (typeof value === 'string') return value
    if (unit === 'TRY' || unit === '₺') return formatCurrency(value)
    if (unit === '%') return `${value.toFixed(1)}%`
    if (unit === 'days') return locale === 'tr' ? `${value} gün` : `${value} days`
    return value.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="sticky left-0 bg-white hover:bg-gray-50 px-4 py-3 font-medium text-gray-700 z-10">
        {name}
        {metric.marketBenchmark !== undefined && (
          <div className="text-xs text-gray-400 mt-0.5">
            {locale === 'tr' ? 'Piyasa:' : 'Market:'} {formatValue(metric.marketBenchmark, metric.unit)}
          </div>
        )}
      </td>
      {policies.map((p) => {
        const metricValue = metric.values.find(v => v.policyId === p.policy.id)
        if (!metricValue) return <td key={p.policy.id} className="px-4 py-3 text-center text-gray-400">-</td>

        return (
          <td key={p.policy.id} className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <span
                className={cn(
                  'font-medium',
                  metricValue.isBest && 'text-emerald-700',
                  metricValue.isWorst && 'text-red-600',
                  !metricValue.isBest && !metricValue.isWorst && 'text-gray-900'
                )}
              >
                {formatValue(metricValue.value, metric.unit)}
              </span>
              <TrophyIndicator isBest={metricValue.isBest} isWorst={metricValue.isWorst} isWinner={false} />
            </div>
            {metricValue.percentile !== undefined && (
              <div className="text-xs text-gray-400 mt-0.5">
                {locale === 'tr' ? 'Yüzdelik:' : 'Percentile:'} {metricValue.percentile}%
              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
}

/**
 * Compact comparison summary showing just winners
 */
interface ComparisonSummaryProps {
  comparison: PolicyComparison
  className?: string
}

export function ComparisonSummary({ comparison, className }: ComparisonSummaryProps) {
  const { locale } = useI18n()
  const { policies, winners } = comparison

  const getPolicy = (id: string) => policies.find(p => p.policy.id === id)

  const categories = [
    { key: 'overallBest' as const, labelEN: 'Overall Best', labelTR: 'Genel En İyi' },
    { key: 'bestPremium' as const, labelEN: 'Best Premium', labelTR: 'En İyi Prim' },
    { key: 'bestCoverage' as const, labelEN: 'Best Coverage', labelTR: 'En İyi Teminat' },
    { key: 'bestValue' as const, labelEN: 'Best Value', labelTR: 'En İyi Değer' },
  ]

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-3', className)}>
      {categories.map(({ key, labelEN, labelTR }) => {
        const winnerId = winners[key]
        const winner = getPolicy(winnerId)
        if (!winner) return null

        return (
          <div key={key} className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {locale === 'tr' ? labelTR : labelEN}
            </p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl" aria-hidden="true">{winner.policy.logo}</span>
              <span className="font-medium text-gray-900 text-sm truncate">
                {winner.label || winner.policy.provider}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
