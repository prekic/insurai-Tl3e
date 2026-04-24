import { ShieldAlert, Check } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { ScenarioCard } from '@/lib/policy-evaluation/types'

interface PolicyScenariosSectionProps {
  scenarios: ScenarioCard[] | undefined
  /** Hides all scenario cards when the extraction gate is active. Scenarios
   *  computed from incomplete data can be misleading (e.g. an "IMM unlimited"
   *  card derived from a policy whose coverage rows are placeholders). */
  isUnverified?: boolean
}

export function PolicyScenariosSection({ scenarios, isUnverified }: PolicyScenariosSectionProps) {
  const { t, locale } = useI18n()

  if (isUnverified) {
    return null
  }

  if (!scenarios || scenarios.length === 0) {
    return null
  }

  const coveredScenarios = scenarios.filter((s) => s.financialStatus === 'covered')
  const riskScenarios = scenarios.filter((s) => s.financialStatus !== 'covered')

  const renderScenarioCard = (scenario: ScenarioCard) => (
    <div
      key={scenario.id}
      className="border rounded-lg p-4 bg-white shadow-sm flex flex-col h-full"
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <h4 className="font-semibold text-sm text-gray-900 line-clamp-2">
          {locale === 'tr' ? scenario.titleTR : scenario.title}
        </h4>
        <div
          className={`flex-shrink-0 w-3 h-3 rounded-full mt-1 ${
            scenario.financialStatus === 'covered'
              ? 'bg-green-500'
              : scenario.financialStatus === 'partially_covered'
                ? 'bg-amber-500'
                : 'bg-red-500'
          }`}
        />
      </div>
      <p className="text-xs text-gray-600 mb-3 flex-grow">
        {locale === 'tr' ? scenario.descriptionTR : scenario.description}
      </p>

      <div className="space-y-2 text-[11px] leading-relaxed mb-3 border-t border-gray-100 pt-3">
        {((locale === 'tr' ? scenario.insurerPaysTR : scenario.insurerPays) ||
          scenario.insurerPays) && (
          <div className="flex justify-between border-b border-gray-50 pb-1">
            <span className="text-gray-500">
              {locale === 'tr' ? 'Sigortacı Öder:' : 'Insurer Pays:'}
            </span>
            <span className="font-medium text-green-700 max-w-[60%] text-right">
              {locale === 'tr'
                ? scenario.insurerPaysTR || scenario.insurerPays
                : scenario.insurerPays}
            </span>
          </div>
        )}
        {((locale === 'tr' ? scenario.userPaysTR : scenario.userPays) || scenario.userPays) && (
          <div className="flex justify-between border-b border-gray-50 pb-1">
            <span className="text-gray-500">
              {locale === 'tr' ? 'Kullanıcı Öder:' : 'User Pays:'}
            </span>
            <span className="font-medium text-amber-700 max-w-[60%] text-right">
              {locale === 'tr' ? scenario.userPaysTR || scenario.userPays : scenario.userPays}
            </span>
          </div>
        )}
        {((locale === 'tr' ? scenario.triggerTR : scenario.trigger) || scenario.trigger) && (
          <div className="flex justify-between border-b border-gray-50 pb-1">
            <span className="text-gray-500">{locale === 'tr' ? 'Örnek Olay:' : 'Trigger:'}</span>
            <span className="font-medium text-gray-800 max-w-[60%] text-right">
              {locale === 'tr' ? scenario.triggerTR || scenario.trigger : scenario.trigger}
            </span>
          </div>
        )}
        {((locale === 'tr' ? scenario.whyItMattersTR : scenario.whyItMatters) ||
          scenario.whyItMatters) && (
          <div className="pt-1 mt-2 bg-blue-50/50 p-2 border border-blue-100/50 rounded text-blue-800 italic font-medium">
            {locale === 'tr'
              ? scenario.whyItMattersTR || scenario.whyItMatters
              : scenario.whyItMatters}
          </div>
        )}
        {((locale === 'tr' ? scenario.caveatTR : scenario.caveat) || scenario.caveat) && (
          <div
            className="mt-2 flex gap-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800"
            role="note"
          >
            <span className="font-semibold flex-shrink-0">
              {locale === 'tr' ? 'İstisna:' : 'Caveat:'}
            </span>
            <span>{locale === 'tr' ? scenario.caveatTR || scenario.caveat : scenario.caveat}</span>
          </div>
        )}
      </div>

      {(scenario.riskAmount || scenario.riskAmountTR) && (
        <div className="mt-auto bg-gray-50 rounded p-2 text-xs font-medium text-gray-800 border-l-2 border-gray-300">
          {locale === 'tr' ? scenario.riskAmountTR || scenario.riskAmount : scenario.riskAmount}
        </div>
      )}
    </div>
  )

  return (
    <>
      {riskScenarios.length > 0 && (
        <div className="space-y-4 pt-2">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="text-blue-600" size={20} />
            {locale === 'tr' ? 'Senaryo Risk Analizi' : 'Scenario Risk Analysis'}
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {riskScenarios.map(renderScenarioCard)}
          </div>
        </div>
      )}
      {coveredScenarios.length > 0 && (
        <div className="space-y-4 pt-2">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Check className="text-green-600" size={20} />
            {t.policy.coveredScenariosTitle}
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {coveredScenarios.map(renderScenarioCard)}
          </div>
        </div>
      )}
    </>
  )
}
