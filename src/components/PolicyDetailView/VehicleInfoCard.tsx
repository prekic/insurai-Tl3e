import { Car, Briefcase } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { useI18n } from '@/lib/i18n'
import type { AnalyzedPolicy } from '@/types/policy'

interface VehicleInfoCardProps {
  policy: AnalyzedPolicy
}

export function VehicleInfoCard({ policy }: VehicleInfoCardProps) {
  const { t, locale } = useI18n()

  if (policy.type !== 'kasko' && policy.type !== 'traffic') {
    return null
  }

  const vehicleInfo = policy.vehicleInfo || {}
  const isCommercial = vehicleInfo.usage?.toLowerCase() === 'commercial'

  // Headline vehicle fields are rendered UNCONDITIONALLY so a parsing failure
  // surfaces as an explicit "Cannot Verify" row rather than silently missing.
  // The April 24 human review flagged the silent-hide pattern as a trust bug:
  // a hidden row looks intentional (as if the policy didn't contain the data),
  // whereas an empty row signals extraction failure and invites a re-scan.
  const renderField = (label: string, value: string | number | undefined | null) => {
    const hasValue =
      value !== undefined &&
      value !== null &&
      (typeof value === 'number' || value.trim().length > 0)
    return (
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        {hasValue ? (
          <p className="font-semibold text-gray-900">{value}</p>
        ) : (
          <p
            className="italic text-gray-400"
            data-testid="vehicle-field-cannot-verify"
            aria-label={t.policy.cannotVerify}
          >
            {t.policy.cannotVerify}
          </p>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Car className="text-blue-600" size={20} />
          {t.policy.vehicleInfoTitle}
        </CardTitle>
        {isCommercial && (
          <div className="mt-2 text-[10px] sm:text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2 flex items-start gap-1.5">
            <Briefcase size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                {locale === 'tr' ? 'Ticari Araç Politikası' : 'Commercial Vehicle Policy'}
              </p>
              <p className="text-blue-600 mt-0.5 opacity-90 leading-tight">
                {locale === 'tr'
                  ? 'Bu araç ticari kullanım amaçlı olduğundan, pazar benchmark ve fiyat analizleri yanıltıcı olmaması adına devre dışı bırakılmıştır.'
                  : 'As this is a commercial vehicle, market benchmark and price analyses are disabled to avoid misleading representations.'}
              </p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          {renderField(t.policy.plate, vehicleInfo.plate)}
          {renderField(t.policy.make, vehicleInfo.make)}
          {renderField(t.policy.model, vehicleInfo.model)}
          {renderField(t.policy.modelYear, vehicleInfo.year)}
          {vehicleInfo.usage && renderField(t.policy.usageType, vehicleInfo.usage)}
          {vehicleInfo.vehicleClass && renderField(t.policy.vehicleClass, vehicleInfo.vehicleClass)}
        </div>
      </CardContent>
    </Card>
  )
}
