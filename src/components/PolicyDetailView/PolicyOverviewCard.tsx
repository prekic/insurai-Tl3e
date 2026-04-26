import { Shield, Briefcase, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { useI18n } from '@/lib/i18n'
import type { AnalyzedPolicy } from '@/types/policy'
import { PolicyKeyMetricsAndDiscounts } from './PolicyKeyMetricsAndDiscounts'
import { getStatusVariant, getStatusLabel } from './shared'

export function PolicyOverviewCard({ policy }: { policy: AnalyzedPolicy }) {
  const { t, locale } = useI18n()
  const { formatConverted } = useDisplayCurrency()

  return (
    <Card className="overflow-hidden w-full">
      <CardHeader className="py-2 px-3 sm:py-4 sm:px-6 bg-gradient-to-r from-blue-50 to-blue-100/50">
        <CardTitle className="flex items-center justify-between gap-2 overflow-hidden">
          <span className="flex items-center gap-2 text-sm sm:text-base font-semibold text-gray-800 truncate">
            <Shield className="text-blue-600 flex-shrink-0" size={16} />
            <span className="truncate">{t.policy.policySummary}</span>
          </span>
          <Badge variant={getStatusVariant(policy.status)} className="text-xs flex-shrink-0">
            {getStatusLabel(policy.status, t)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm w-full overflow-hidden">
          <div className="col-span-2 p-2.5 sm:p-3 bg-blue-50 rounded-lg border border-blue-100 overflow-hidden">
            <p className="text-xs text-blue-600 font-medium mb-1">{t.policy.coverageLabel}</p>
            <p className="text-lg sm:text-xl font-bold text-blue-700 truncate">
              {policy.type === 'kasko'
                ? policy.vehicleUsage === 'commercial' && policy.sigortaBedeli
                  ? formatConverted(policy.sigortaBedeli)
                  : t.policy.vehicleMarketValue
                : formatConverted(policy.coverage)}
            </p>
            {policy.type === 'kasko' &&
              (policy.vehicleUsage === 'commercial' && policy.sigortaBedeli ? (
                <p className="text-[10px] text-blue-500 mt-0.5">Sigorta Bedeli</p>
              ) : (
                <p className="text-[10px] text-blue-500 mt-0.5">{t.policy.marketValueHelp}</p>
              ))}
          </div>

          <PolicyKeyMetricsAndDiscounts policy={policy} />

          <div className="col-span-2 p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">{t.policy.insured}</p>
            <div className="flex items-center gap-2">
              <p
                className="text-sm font-semibold text-gray-900 truncate"
                title={policy.insuredPerson}
              >
                {policy.insuredPerson || '-'}
              </p>
              {policy.insuredEntityType === 'corporate' && (
                <div
                  className="flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
                  title="Corporate / Ticari"
                >
                  <Briefcase size={12} />
                  <span>Kurumsal</span>
                </div>
              )}
              {policy.insuredEntityType === 'individual' && (
                <div
                  className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded"
                  title="Individual / Bireysel"
                >
                  <Users size={12} />
                  <span>Bireysel</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
            <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
              {t.policy.policyNumberLabel}
            </p>
            <p className="text-sm font-semibold text-gray-900 truncate">{policy.policyNumber}</p>
          </div>

          {policy.type !== 'kasko' && policy.type !== 'traffic' && policy.location && (
            <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">{t.policy.location}</p>
              <p className="text-sm font-semibold text-gray-900 truncate">{policy.location}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t text-xs text-gray-500">
          <div className="truncate">
            <span className="text-gray-400">{t.policy.dates.start}</span>{' '}
            <span className="font-medium text-gray-700">
              {formatDate(policy.startDate, locale)}
            </span>
          </div>
          <div className="truncate text-right">
            <span className="text-gray-400">{t.policy.dates.end}</span>{' '}
            <span className="font-medium text-gray-700">
              {formatDate(policy.expiryDate, locale)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
