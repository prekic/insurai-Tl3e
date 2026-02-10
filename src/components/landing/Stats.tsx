import { FileText, Languages, ShieldCheck, Clock } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function Stats() {
  const { t } = useTranslation()

  const capabilities = [
    { icon: FileText, label: t.landing.statPolicyTypes, value: t.landing.statPolicyTypesValue, detail: t.landing.statPolicyTypesDetail },
    { icon: Languages, label: t.landing.statLanguages, value: t.landing.statLanguagesValue, detail: t.landing.statLanguagesDetail },
    { icon: ShieldCheck, label: t.landing.statCoverageChecks, value: t.landing.statCoverageChecksValue, detail: t.landing.statCoverageChecksDetail },
    { icon: Clock, label: t.landing.statAnalysisTime, value: t.landing.statAnalysisTimeValue, detail: t.landing.statAnalysisTimeDetail },
  ]

  return (
    <section className="py-10 md:py-12 bg-gradient-to-b from-blue-50/60 to-slate-50/60 border-y border-blue-100/50">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
          {capabilities.map((cap, i) => (
            <div key={i} className="text-center p-3 md:p-0">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-white rounded-xl mb-2 shadow-sm border border-blue-100">
                <cap.icon size={20} className="text-blue-600" />
              </div>
              <div className="text-2xl md:text-3xl font-bold text-gray-900">{cap.value}</div>
              <p className="text-xs md:text-sm font-medium text-gray-700 mt-1">{cap.label}</p>
              <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">{cap.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
