import { Info, BarChart3, AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { AnalyzedPolicy } from '@/types/policy'

export function ActuarialInsightsCard({
  policy,
  evaluation,
  actuarialResult,
  isUnverified,
}: {
  policy: AnalyzedPolicy
  evaluation: any
  actuarialResult: any
  isUnverified: boolean
}) {
  const { t, locale } = useI18n()

  if (!actuarialResult) return null

  return (
    <>
      {/* Score system explanation — shown when both systems are visible */}
      {evaluation && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-500 leading-relaxed">
              <p className="font-medium text-gray-600 mb-1">
                {locale === 'tr'
                  ? 'İki farklı değerlendirme sistemi'
                  : 'Two different evaluation systems'}
              </p>
              <p>
                {locale === 'tr'
                  ? 'Poliçe Değerlendirmesi teminat kapsamı ve prim oranını değerlendirir. Sözleşme Kalite Puanı ise yedek parça, onarım ağı ve tazminat koşullarını ölçer. İki puan farklı boyutları ölçtüğü için farklılık gösterebilir.'
                  : 'Policy Evaluation measures coverage scope and premium. Contract Quality Score measures parts standards, repair network, and indemnity terms. These scores measure different dimensions and may differ.'}
              </p>
              {/* Weight breakdown for policy evaluation */}
              {evaluation.scoreBreakdown && (
                <p className="mt-1.5 text-gray-400">
                  {locale === 'tr' ? 'Puanlamada ağırlıklar' : 'Scoring weights'}:{' '}
                  {locale === 'tr' ? 'Teminat' : 'Coverage'}{' '}
                  {evaluation.scoreBreakdown.coverage.weight}%,{' '}
                  {locale === 'tr' ? 'Prim' : 'Premium'} {evaluation.scoreBreakdown.premium.weight}
                  %, {locale === 'tr' ? 'Uyum' : 'Compliance'}{' '}
                  {evaluation.scoreBreakdown.compliance.weight}%,{' '}
                  {locale === 'tr' ? 'Muafiyet' : 'Deductible'}{' '}
                  {evaluation.scoreBreakdown.deductible.weight}%,{' '}
                  {locale === 'tr' ? 'Değer' : 'Value'} {evaluation.scoreBreakdown.value.weight}%
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Beta Actuarial Engine Insights */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl p-4 sm:p-5 mt-6 border border-blue-100">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="text-blue-600 w-5 h-5" />
          <h3 className="font-semibold text-gray-900">Beta Actuarial Engine (EOOP)</h3>
        </div>
        {isUnverified && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mb-3">
            <AlertTriangle size={12} className="flex-shrink-0" />
            <span>
              {locale === 'tr'
                ? 'TASLAK — Bu değerler henüz kesinleşmemiştir'
                : 'DRAFT — These values are not finalized'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 border border-blue-50">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t.policy.expectedOutOfPocket}
            </p>
            {/* EOOP value — annotated when precision is partial */}
            {actuarialResult.contractQualityScore === 0 ? (
              <div className="flex items-end gap-2 mt-1">
                <p className="text-xl font-bold text-gray-400">N/A</p>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <p
                    className={`text-2xl font-bold ${actuarialResult.eoopPrecision === 'partial' ? 'text-amber-700' : 'text-gray-900'}`}
                  >
                    {actuarialResult.eoopPrecision === 'partial' ? '~' : ''}
                    {actuarialResult.expectedOutOfPocket.expectedCost.amount.toLocaleString()}{' '}
                    {actuarialResult.expectedOutOfPocket.expectedCost.currency}
                  </p>
                  {actuarialResult.eoopPrecision === 'partial' && (
                    <span className="text-[10px] text-amber-600 font-medium mb-1.5">
                      ({locale === 'tr' ? 'taban tahmin' : 'base estimate'})
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {t.policy.premiumLabel}{' '}
                  <span className="font-medium">
                    {actuarialResult.expectedOutOfPocket.premium.amount.toLocaleString()}{' '}
                    {actuarialResult.expectedOutOfPocket.premium.currency}
                  </span>
                </p>
                <p className="text-sm text-gray-600">
                  {t.policy.expectedUncoveredLoss}{' '}
                  <span className="font-medium text-amber-600">
                    {actuarialResult.expectedOutOfPocket.expectedUncoveredLoss.amount.toLocaleString()}{' '}
                    {actuarialResult.expectedOutOfPocket.expectedUncoveredLoss.currency}
                  </span>
                </p>
              </>
            )}
            {/* EOOP precision warnings — driven by eoopPrecision + eoopLimitations */}
            {actuarialResult.eoopPrecision === 'partial' &&
              actuarialResult.eoopLimitations &&
              actuarialResult.eoopLimitations.length > 0 && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                  <p className="font-medium mb-1 flex items-center gap-1">
                    <AlertTriangle className="flex-shrink-0" size={12} />
                    {locale === 'tr'
                      ? 'Gerçek cepten harcama gösterilenden önemli ölçüde yüksek olabilir:'
                      : 'Actual out-of-pocket exposure may be materially higher:'}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {actuarialResult.eoopLimitations.map((limitation: string, i: number) => (
                      <li key={i}>{limitation}</li>
                    ))}
                  </ul>
                  {policy.deductiblePercent && policy.deductiblePercent > 0 && (
                    <p className="mt-1.5 text-[10px] text-amber-600 italic">
                      {locale === 'tr'
                        ? `Örnek: 100.000 TL hasarda %${policy.deductiblePercent} muafiyet = ${((100000 * policy.deductiblePercent) / 100).toLocaleString('tr-TR')} TL ek cepten maliyet`
                        : `Example: on a 100,000 TL claim, ${policy.deductiblePercent}% deductible = ${((100000 * policy.deductiblePercent) / 100).toLocaleString()} TL additional out-of-pocket`}
                    </p>
                  )}
                </div>
              )}
          </div>

          <div className="bg-white rounded-lg p-4 border border-blue-50">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
              {t.policy.contractQualityScore}
            </p>
            <div className="flex items-end gap-2">
              <p
                className={`text-2xl font-bold ${actuarialResult.contractQualityIsEstimated ? 'text-amber-600' : 'text-gray-900'}`}
              >
                {actuarialResult.contractQualityIsEstimated ? '~' : ''}
                {Math.round(actuarialResult.contractQualityScore)}
              </p>
              <span className="text-sm font-medium text-gray-500 mb-1">/ 100</span>
              {actuarialResult.contractQualityIsEstimated && (
                <span className="text-[10px] text-amber-600 font-medium mb-1.5">
                  ({locale === 'tr' ? 'tahmini' : 'estimated'})
                </span>
              )}
            </div>

            <p className="text-sm text-gray-600 mt-2">
              {t.policy.partsStandard}{' '}
              <span className="font-medium capitalize">
                {actuarialResult.indemnityMechanics?.partsStandard?.value || t.global.unspecified}
              </span>
            </p>
            <p className="text-sm text-gray-600">
              {t.policy.repairNetwork}{' '}
              <span className="font-medium capitalize">
                {actuarialResult.indemnityMechanics?.repairNetworkRule?.value?.replace('_', ' ') ||
                  t.global.unspecified}
              </span>
            </p>
            {/* Actuarial caveat when inputs are incomplete */}
            {(actuarialResult.needsReview ||
              actuarialResult.indemnityMechanics?.partsStandard?.value === 'unspecified' ||
              actuarialResult.indemnityMechanics?.repairNetworkRule?.value === 'unspecified') && (
              <p className="text-xs text-amber-600 mt-2 flex items-start gap-1">
                <AlertTriangle className="flex-shrink-0 mt-0.5" size={12} />
                <span>
                  {locale === 'tr'
                    ? 'Tahmini puan, belirtilmemiş sözleşme detayları nedeniyle geçici niteliktedir'
                    : 'Score is provisional — some contract-detail inputs could not be confirmed'}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
