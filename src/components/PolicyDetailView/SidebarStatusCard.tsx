import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import type { AnalyzedPolicy } from '@/types/policy'
import { getStatusVariant, getStatusLabel } from './shared'

export function SidebarStatusCard({ policy }: { policy: AnalyzedPolicy }) {
  const { t, locale } = useI18n()

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center">
          <Badge variant={getStatusVariant(policy.status)} className="mb-4">
            {getStatusLabel(policy.status, t)}
          </Badge>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">{t.policy.startDate}</span>
              <span className="font-medium">{formatDate(policy.startDate, locale)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">{t.policy.endDate}</span>
              <span className="font-medium">{formatDate(policy.expiryDate, locale)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
