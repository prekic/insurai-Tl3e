import { BadgePercent } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import type { AnalyzedPolicy } from '@/types/policy'

interface PolicyKeyMetricsAndDiscountsProps {
  policy: AnalyzedPolicy
}

export function PolicyKeyMetricsAndDiscounts({ policy }: PolicyKeyMetricsAndDiscountsProps) {
  const { t, locale } = useI18n()
  const { formatConverted } = useDisplayCurrency()

  const isConditionalDeductible =
    policy.deductibleUncertain || (policy.type === 'kasko' && policy.deductible === 0)

  const discountList: Array<{ type: string; rate: string }> = []
  if (policy.discounts) {
    if (policy.discounts.ncdDiscount) {
      discountList.push({
        type: locale === 'tr' ? 'Hasarsızlık İndirimi' : 'No Claims Discount',
        rate: '%' + policy.discounts.ncdDiscount,
      })
    }
    if (policy.discounts.groupDiscount) {
      discountList.push({
        type: locale === 'tr' ? 'Grup/Kurum İndirimi' : 'Group/Corporate Discount',
        rate: '%' + policy.discounts.groupDiscount,
      })
    }
    if (policy.discounts.otherDiscountPct) {
      discountList.push({
        type: locale === 'tr' ? 'Diğer İndirimler' : 'Other Discounts',
        rate: '%' + policy.discounts.otherDiscountPct,
      })
    }
  }

  return (
    <>
      {/* Premium & Deductible row */}
      <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
        <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">{t.policy.premiumLabel}</p>
        <p
          className={`text-sm font-semibold truncate ${policy.premiumMissing ? 'text-amber-600' : 'text-gray-900'}`}
        >
          {policy.premiumMissing
            ? t.policy.notSpecified
            : policy.premium > 0
              ? formatConverted(policy.premium)
              : t.policy.notSpecified}
        </p>
        {/* Premium breakdown: stacked Net + BSMV when both are present */}
        {policy.premiumNet && policy.premiumTax && (
          <dl className="mt-1 space-y-0.5">
            <div className="flex justify-between gap-2 text-[10px] text-gray-500">
              <dt className="truncate">{t.policy.premiumNet}</dt>
              <dd className="font-medium text-gray-700 whitespace-nowrap">
                {formatConverted(policy.premiumNet)}
              </dd>
            </div>
            <div className="flex justify-between gap-2 text-[10px] text-gray-500">
              <dt className="truncate">{t.policy.premiumTax}</dt>
              <dd className="font-medium text-gray-700 whitespace-nowrap">
                {formatConverted(policy.premiumTax)}
              </dd>
            </div>
          </dl>
        )}
      </div>
      <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
        <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">{t.policy.deductibleLabel}</p>
        <p
          className={`text-sm font-semibold truncate ${
            isConditionalDeductible ? 'text-amber-600' : 'text-gray-900'
          }`}
        >
          {policy.deductiblePercent && policy.deductiblePercent > 0
            ? locale === 'tr'
              ? `%${policy.deductiblePercent} tenzili muafiyet`
              : `${policy.deductiblePercent}% proportional deductible`
            : isConditionalDeductible
              ? t.policy.deductibleConditional
              : policy.deductible > 0
                ? formatConverted(policy.deductible)
                : t.global.none}
        </p>
      </div>

      {/* Discounts Section */}
      {discountList.length > 0 && (
        <div className="col-span-2 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent rounded-xl border border-emerald-500/20 overflow-hidden shadow-sm relative group transition-all duration-300 hover:shadow-md hover:border-emerald-500/30">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-teal-500/5 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>
          <div className="relative p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-emerald-800 font-semibold mb-2.5 flex items-center gap-1.5 tracking-wide uppercase">
              <BadgePercent size={15} className="text-emerald-600" />
              {locale === 'tr' ? 'İndirimler / Ek Avantajlar' : 'Discounts / Extra Benefits'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {discountList.map((discount, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center text-xs sm:text-sm bg-white/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-emerald-100/50 hover:bg-white hover:-translate-y-0.5 transition-all duration-200 shadow-sm"
                >
                  <span className="text-emerald-900 font-medium truncate" title={discount.type}>
                    {discount.type}
                  </span>
                  <span className="font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent whitespace-nowrap ml-2 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 shadow-inner">
                    {discount.rate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
