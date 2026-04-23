import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import type { AnalyzedPolicy } from '@/types/policy'

interface MarketComparisonCardProps {
  policy: AnalyzedPolicy
  evaluation: any
}

export function MobileMarketComparisonCard({ policy, evaluation }: MarketComparisonCardProps) {
  const { t, locale } = useI18n()
  const { formatConverted } = useDisplayCurrency()

  if (
    !policy.marketComparison ||
    policy.premium <= 0 ||
    evaluation?.benchmarkConfidence?.level === 'suppressed'
  ) {
    return null
  }

  return (
    <Card className="lg:hidden">
      <CardHeader className="py-2 px-3 sm:py-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <TrendingUp className="text-blue-600 flex-shrink-0" size={18} />
          <span className="truncate">{t.policy.marketComparison}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <div className="space-y-3">
          {/* Freshness badge — mobile */}
          {evaluation?.benchmarkConfidence?.freshness &&
            evaluation.benchmarkConfidence.freshness !== 'current' && (
              <div
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] ${
                  evaluation.benchmarkConfidence.freshness === 'stale'
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-amber-50 border border-amber-200 text-amber-700'
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    evaluation.benchmarkConfidence.freshness === 'stale'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                  }`}
                />
                <span>
                  {locale === 'tr'
                    ? evaluation.benchmarkConfidence.freshness === 'stale'
                      ? `Veriler ${evaluation.benchmarkConfidence.dataAgeDays ?? '?'} gün eski. Tarihsel referans.`
                      : `Veri: ${evaluation.benchmarkConfidence.dataAsOf || '?'}`
                    : evaluation.benchmarkConfidence.freshness === 'stale'
                      ? `Data is ${evaluation.benchmarkConfidence.dataAgeDays ?? '?'} days old. Historical reference only.`
                      : `Data: ${evaluation.benchmarkConfidence.dataAsOf || '?'}`}
                </span>
              </div>
            )}
          {evaluation?.benchmarkConfidence?.level === 'low' ? (
            <div className="py-2 text-xs text-gray-500 italic text-center">
              {locale === 'tr'
                ? 'Eksik veriler nedeniyle piyasa karşılaştırması kullanılamıyor'
                : 'Market comparison unavailable due to missing inputs'}
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{t.policy.yourPremium}</span>
                  <span className="text-xs text-gray-500">{t.policy.marketAvg}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900">
                    {formatConverted(policy.premium)}
                  </span>
                  <span className="font-semibold text-sm text-gray-600">
                    {formatConverted(policy.marketComparison.averagePremium)}
                  </span>
                </div>
                {policy.premium < policy.marketComparison.averagePremium && (
                  <div className="flex items-center gap-1 mt-1 text-green-600 text-xs">
                    <TrendingDown size={12} />
                    <span>
                      {Math.round(
                        (1 - policy.premium / policy.marketComparison.averagePremium) * 100
                      )}
                      % {t.policy.belowAverage}
                    </span>
                  </div>
                )}
                {policy.premium > policy.marketComparison.averagePremium && (
                  <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs">
                    <TrendingUp size={12} />
                    <span>
                      {Math.round(
                        (policy.premium / policy.marketComparison.averagePremium - 1) * 100
                      )}
                      % {t.policy.aboveAverage}
                    </span>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-500 mb-1">{t.policy.marketPercentile}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600"
                      style={{ width: `${policy.marketComparison.percentile}%` }}
                    />
                  </div>
                  <span className="font-semibold text-gray-900 text-xs">
                    {policy.marketComparison.percentile}%
                  </span>
                </div>
              </div>
            </>
          )}
          {/* Missing context factors warning */}
          {evaluation?.benchmarkConfidence?.level === 'low' && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 leading-tight">
              <p className="font-medium mb-0.5">
                {locale === 'tr'
                  ? 'Karşılaştırma düşük güvenilirlikte — eksik bağlam:'
                  : 'Low-confidence comparison — missing context:'}
              </p>
              <ul className="list-disc list-inside">
                {evaluation.benchmarkConfidence.factors
                  .filter((f: any) => !f.present)
                  .map((f: any) => (
                    <li key={f.factor}>{locale === 'tr' ? f.factorTr : f.factor}</li>
                  ))}
              </ul>
            </div>
          )}
          {/* Benchmark disclaimer */}
          {evaluation?.benchmarkDisclaimer && (
            <p className="text-[10px] text-gray-400 mt-2 leading-tight italic">
              {locale === 'tr' ? evaluation.benchmarkDisclaimerTr : evaluation.benchmarkDisclaimer}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function DesktopMarketComparisonCard({ policy, evaluation }: MarketComparisonCardProps) {
  const { t, locale } = useI18n()
  const { formatConverted } = useDisplayCurrency()

  if (
    !policy.marketComparison ||
    policy.premium <= 0 ||
    evaluation?.benchmarkConfidence?.level === 'suppressed'
  ) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="text-blue-600" size={18} />
          {t.policy.marketComparison}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Freshness badge */}
          {evaluation?.benchmarkConfidence?.freshness &&
            evaluation.benchmarkConfidence.freshness !== 'current' && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded text-xs ${
                  evaluation.benchmarkConfidence.freshness === 'stale'
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-amber-50 border border-amber-200 text-amber-700'
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    evaluation.benchmarkConfidence.freshness === 'stale'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                  }`}
                />
                <span>
                  {locale === 'tr'
                    ? evaluation.benchmarkConfidence.freshness === 'stale'
                      ? `Karşılaştırma verileri ${evaluation.benchmarkConfidence.dataAgeDays ?? '?'} gün eski (${evaluation.benchmarkConfidence.dataAsOf || '?'}). Yalnızca tarihsel referans.`
                      : `Piyasa verileri ${evaluation.benchmarkConfidence.dataAsOf || '?'} tarihli`
                    : evaluation.benchmarkConfidence.freshness === 'stale'
                      ? `Benchmark data is ${evaluation.benchmarkConfidence.dataAgeDays ?? '?'} days old (from ${evaluation.benchmarkConfidence.dataAsOf || '?'}). Historical reference only.`
                      : `Market data from ${evaluation.benchmarkConfidence.dataAsOf || '?'}`}
                </span>
              </div>
            )}
          {evaluation?.benchmarkConfidence?.level === 'low' ? (
            <div className="py-4 text-sm text-gray-500 italic text-center">
              {locale === 'tr'
                ? 'Eksik veriler nedeniyle piyasa karşılaştırması kullanılamıyor'
                : 'Market comparison unavailable due to missing inputs'}
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs sm:text-sm text-gray-500">{t.policy.yourPremium}</span>
                  <span className="text-xs sm:text-sm text-gray-500">{t.policy.marketAvg}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">
                    {formatConverted(policy.premium)}
                  </span>
                  <span className="font-semibold text-gray-600">
                    {formatConverted(policy.marketComparison.averagePremium)}
                  </span>
                </div>
                {policy.premium < policy.marketComparison.averagePremium && (
                  <div className="flex items-center gap-1 mt-1 text-green-600 text-xs sm:text-sm">
                    <TrendingDown size={14} />
                    <span>
                      {Math.round(
                        (1 - policy.premium / policy.marketComparison.averagePremium) * 100
                      )}
                      % {t.policy.belowAverage}
                    </span>
                  </div>
                )}
                {policy.premium > policy.marketComparison.averagePremium && (
                  <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs sm:text-sm">
                    <TrendingUp size={14} />
                    <span>
                      {Math.round(
                        (policy.premium / policy.marketComparison.averagePremium - 1) * 100
                      )}
                      % {t.policy.aboveAverage}
                    </span>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs sm:text-sm text-gray-500 mb-1">{t.policy.marketPercentile}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600"
                      style={{ width: `${policy.marketComparison.percentile}%` }}
                    />
                  </div>
                  <span className="font-semibold text-gray-900 text-sm">
                    {policy.marketComparison.percentile}%
                  </span>
                </div>
              </div>
            </>
          )}
          {/* Missing context factors warning */}
          {evaluation?.benchmarkConfidence?.level === 'low' && (
            <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 leading-tight">
              <p className="font-medium mb-1">
                {locale === 'tr'
                  ? 'Karşılaştırma düşük güvenilirlikte — eksik bağlam:'
                  : 'Low-confidence comparison — missing context:'}
              </p>
              <ul className="list-disc list-inside">
                {evaluation.benchmarkConfidence.factors
                  .filter((f: any) => !f.present)
                  .map((f: any) => (
                    <li key={f.factor}>{locale === 'tr' ? f.factorTr : f.factor}</li>
                  ))}
              </ul>
            </div>
          )}
          {/* Benchmark disclaimer */}
          {evaluation?.benchmarkDisclaimer && (
            <p className="text-xs text-gray-400 mt-3 leading-tight italic">
              {locale === 'tr' ? evaluation.benchmarkDisclaimerTr : evaluation.benchmarkDisclaimer}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
