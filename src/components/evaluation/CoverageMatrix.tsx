import { Check, X, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { TrophyIndicator } from './WinnerBadge'
import type { PolicyComparison, CoverageComparison, ComparisonPolicy } from '@/lib/policy-evaluation/types'

interface CoverageMatrixProps {
  comparison: PolicyComparison
  className?: string
}

/**
 * Coverage comparison matrix showing which coverages are included
 * in each policy with limits and deductibles.
 */
export function CoverageMatrix({ comparison, className }: CoverageMatrixProps) {
  const { locale } = useI18n()
  const { policies, coverageMatrix } = comparison

  if (coverageMatrix.length === 0) {
    return (
      <div className={cn('text-center py-8 text-gray-500', className)}>
        {locale === 'tr' ? 'Teminat karşılaştırması mevcut değil' : 'No coverage comparison available'}
      </div>
    )
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-600 min-w-[160px] z-10">
              {locale === 'tr' ? 'Teminat' : 'Coverage'}
            </th>
            {policies.map((p) => (
              <th key={p.policy.id} className="px-4 py-3 text-center min-w-[140px]">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg" aria-hidden="true">{p.policy.logo}</span>
                  <span className="font-semibold text-gray-900 text-sm">{p.label || p.policy.provider}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {coverageMatrix.map((coverage) => (
            <CoverageRow
              key={coverage.coverageName}
              coverage={coverage}
              policies={policies}
              locale={locale}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface CoverageRowProps {
  coverage: CoverageComparison
  policies: ComparisonPolicy[]
  locale: string
}

function CoverageRow({ coverage, policies, locale }: CoverageRowProps) {
  const name = locale === 'tr' ? coverage.coverageNameTR : coverage.coverageName

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="sticky left-0 bg-white hover:bg-gray-50 px-4 py-3 font-medium text-gray-700 z-10">
        {name}
        {coverage.marketBenchmark !== undefined && (
          <div className="text-xs text-gray-400 mt-0.5">
            {locale === 'tr' ? 'Piyasa:' : 'Market:'} {formatCurrency(coverage.marketBenchmark)}
          </div>
        )}
      </td>
      {policies.map((p) => {
        const policyCoverage = coverage.policies.find(pc => pc.policyId === p.policy.id)
        if (!policyCoverage) {
          return (
            <td key={p.policy.id} className="px-4 py-3 text-center">
              <Minus className="w-4 h-4 text-gray-300 mx-auto" />
            </td>
          )
        }

        const isBest = coverage.bestPolicyId === p.policy.id
        const isWorst = coverage.worstPolicyId === p.policy.id

        return (
          <td key={p.policy.id} className="px-4 py-3 text-center">
            <CoverageCell
              included={policyCoverage.included}
              limit={policyCoverage.limit}
              deductible={policyCoverage.deductible}
              isBest={isBest}
              isWorst={isWorst}
              locale={locale}
            />
          </td>
        )
      })}
    </tr>
  )
}

interface CoverageCellProps {
  included: boolean
  limit: number
  deductible: number
  isBest: boolean
  isWorst: boolean
  locale: string
}

function CoverageCell({ included, limit, deductible, isBest, isWorst, locale }: CoverageCellProps) {
  if (!included) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center">
          <X className="w-4 h-4 text-red-500" />
        </div>
        <span className="text-xs text-gray-400">
          {locale === 'tr' ? 'Dahil değil' : 'Not included'}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center">
          <Check className="w-4 h-4 text-emerald-500" />
        </div>
        {isBest && <TrophyIndicator isWinner isBest />}
      </div>
      <div className="text-sm">
        <span className={cn('font-medium', isBest && 'text-emerald-700', isWorst && 'text-orange-600')}>
          {formatCurrency(limit)}
        </span>
      </div>
      {deductible > 0 && (
        <div className="text-xs text-gray-400">
          {locale === 'tr' ? 'Muafiyet:' : 'Deductible:'} {formatCurrency(deductible)}
        </div>
      )}
    </div>
  )
}

/**
 * Compact coverage summary showing coverage count per policy
 */
interface CoverageSummaryProps {
  comparison: PolicyComparison
  className?: string
}

export function CoverageSummary({ comparison, className }: CoverageSummaryProps) {
  const { locale } = useI18n()
  const { policies, coverageMatrix } = comparison

  return (
    <div className={cn('flex flex-wrap gap-4 justify-center', className)}>
      {policies.map((p) => {
        const includedCount = coverageMatrix.filter(
          c => c.policies.find(pc => pc.policyId === p.policy.id)?.included
        ).length

        return (
          <div key={p.policy.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-lg" aria-hidden="true">{p.policy.logo}</span>
            <span className="text-sm font-medium text-gray-700">
              {p.label || p.policy.provider}
            </span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
              {includedCount}/{coverageMatrix.length} {locale === 'tr' ? 'teminat' : 'coverages'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
