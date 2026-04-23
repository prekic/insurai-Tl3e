import { Car, Briefcase } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { useI18n } from '@/lib/i18n'
import type { AnalyzedPolicy } from '@/types/policy'

interface VehicleInfoCardProps {
  policy: AnalyzedPolicy
}

export function VehicleInfoCard({ policy }: VehicleInfoCardProps) {
  const { t, locale } = useI18n()

  if (policy.type !== 'kasko' || !policy.vehicleInfo) {
    return null
  }

  const isCommercial = policy.vehicleInfo.usage?.toLowerCase() === 'commercial'

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
          {policy.vehicleInfo.plate && (
            <div>
              <p className="text-sm text-gray-500">{t.policy.plate}</p>
              <p className="font-semibold text-gray-900">{policy.vehicleInfo.plate}</p>
            </div>
          )}
          {policy.vehicleInfo.make && (
            <div>
              <p className="text-sm text-gray-500">{t.policy.make}</p>
              <p className="font-semibold text-gray-900">{policy.vehicleInfo.make}</p>
            </div>
          )}
          {policy.vehicleInfo.model && (
            <div>
              <p className="text-sm text-gray-500">{t.policy.model}</p>
              <p className="font-semibold text-gray-900">{policy.vehicleInfo.model}</p>
            </div>
          )}
          {policy.vehicleInfo.year && (
            <div>
              <p className="text-sm text-gray-500">{t.policy.modelYear}</p>
              <p className="font-semibold text-gray-900">{policy.vehicleInfo.year}</p>
            </div>
          )}
          {policy.vehicleInfo.usage && (
            <div>
              <p className="text-sm text-gray-500">{t.policy.usageType}</p>
              <p className="font-semibold text-gray-900">{policy.vehicleInfo.usage}</p>
            </div>
          )}
          {policy.vehicleInfo.vehicleClass && (
            <div>
              <p className="text-sm text-gray-500">{t.policy.vehicleClass}</p>
              <p className="font-semibold text-gray-900">{policy.vehicleInfo.vehicleClass}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
