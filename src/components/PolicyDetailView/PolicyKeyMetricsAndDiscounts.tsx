import { BadgePercent } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import type { AnalyzedPolicy } from '@/types/policy'

interface PolicyKeyMetricsAndDiscountsProps {
  policy: AnalyzedPolicy
}

/**
 * Sprint 1 PR-S1.1 — extraction-fallback for the hero deductible label.
 * When `policy.deductiblePercent` didn't get populated by classifyExclusions()
 * but `policy.conditionalDeductibles[]` has canonical "<label>: %<N>" entries
 * (gotcha #93), parse the highest-% scenario so the hero shows a number-
 * anchored label rather than the generic "Conditional" placeholder.
 */
function getHighestDeductibleScenario(
  provisions: string[] | undefined
): { label: string; percent: number } | null {
  if (!provisions || provisions.length === 0) return null
  let max: { label: string; percent: number } | null = null
  for (const p of provisions) {
    const match = p.match(/^(.+?):\s*%(\d+)/)
    if (match) {
      const percent = parseInt(match[2], 10)
      if (!Number.isNaN(percent) && (!max || percent > max.percent)) {
        max = { label: match[1].trim(), percent }
      }
    }
  }
  return max
}

export function PolicyKeyMetricsAndDiscounts({ policy }: PolicyKeyMetricsAndDiscountsProps) {
  const { t, locale } = useI18n()
  const { formatConverted } = useDisplayCurrency()

  const isConditionalDeductible =
    policy.deductibleUncertain || (policy.type === 'kasko' && policy.deductible === 0)

  // Sprint 3 #14 — surface the AS+ (Anlaşmalı Servis) network warning when
  // the policy carries an "Anlaşmalı olmayan servis" named-deductible scenario.
  // Detection is derived from the existing canonical conditionalDeductibles
  // strings (gotcha #93) — no new schema field required.
  const hasNonNetworkServisCallout = (policy.conditionalDeductibles ?? []).some((p) =>
    /Anla[şs]mal[ıi] olmayan servis/i.test(p)
  )

  // Sprint 1 PR-S1.1 — fallback for hero deductible when extraction didn't
  // populate `deductiblePercent`. Resolved once per render.
  const fallbackDeductibleScenario = !policy.deductiblePercent
    ? getHighestDeductibleScenario(policy.conditionalDeductibles)
    : null

  const renderDeductibleLabel = (): string => {
    if (policy.deductiblePercent && policy.deductiblePercent > 0) {
      return locale === 'tr'
        ? `%${policy.deductiblePercent} tenzili muafiyet`
        : `${policy.deductiblePercent}% proportional deductible`
    }
    if (fallbackDeductibleScenario) {
      return `%${fallbackDeductibleScenario.percent} — ${fallbackDeductibleScenario.label}`
    }
    if (isConditionalDeductible) {
      return t.policy.deductibleConditional
    }
    if (policy.deductible > 0) {
      return formatConverted(policy.deductible)
    }
    return t.global.none
  }

  const discountList: Array<{ type: string; rate: string }> = []
  if (policy.discounts) {
    if (policy.discounts.ncdDiscount) {
      // Sprint 3 PR-S3.2 — when previousInsurer is set, append "preserved
      // from <insurer>" to the NCD label. Surfaces the transfer context the
      // Round-4 reviewer flagged on the Anadolu policy (renewed from Sompo
      // Japan with %50 NCD preserved).
      const ncdBaseLabel = locale === 'tr' ? 'Hasarsızlık İndirimi' : 'No Claims Discount'
      const transferSuffix = policy.previousInsurer
        ? locale === 'tr'
          ? ` — ${policy.previousInsurer} devri`
          : ` — preserved from ${policy.previousInsurer}`
        : ''
      discountList.push({
        type: ncdBaseLabel + transferSuffix,
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
            isConditionalDeductible || fallbackDeductibleScenario
              ? 'text-amber-600'
              : 'text-gray-900'
          }`}
          title={renderDeductibleLabel()}
        >
          {renderDeductibleLabel()}
        </p>
        {hasNonNetworkServisCallout && (
          <small
            role="note"
            data-testid="servis-network-callout"
            className="block mt-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 leading-tight"
          >
            {t.policy.servisNetworkCallout}
          </small>
        )}
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
