import { AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export function FinancialWarningsCard({ evaluation }: { evaluation: any }) {
  const { locale } = useI18n()

  const criticalIssues = evaluation?.compliance?.issues?.filter(
    (i: any) => i.severity === 'critical' || i.severity === 'high'
  )

  if (!criticalIssues || criticalIssues.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <AlertTriangle className="text-red-600" size={20} />
        {locale === 'tr' ? 'Kritik Finansal Riskler' : 'Critical Financial Risks'}
      </h3>
      {criticalIssues.map((issue: any, idx: number) => (
        <div key={idx} className="border-l-4 border-red-500 bg-red-50 p-4 rounded-r-lg shadow-sm">
          <div className="flex gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-sm font-semibold text-red-900 mb-1">
                {locale === 'tr' ? issue.descriptionTR : issue.description}
              </p>
              <p className="text-xs text-red-700">
                {locale === 'tr'
                  ? 'Bu durum poliçenin koruma kapasitesini ciddi şekilde zayıflatır.'
                  : 'This significantly weakens the policy protection capability.'}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
