import { Shield, Check, X, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function ComparisonMock() {
  const { t } = useTranslation()

  const policies = [
    { name: 'Kasko A', provider: 'Allianz', premium: '₺4,200/yr', coverage: '₺500,000' },
    { name: 'Kasko B', provider: 'AXA', premium: '₺3,800/yr', coverage: '₺450,000' },
  ]

  const features = [
    { name: t.landing.comparisonCollision, policy1: true, policy2: true },
    { name: t.landing.comparisonTheft, policy1: true, policy2: true },
    { name: t.landing.comparisonNaturalDisaster, policy1: true, policy2: false },
    { name: t.landing.comparisonGlass, policy1: true, policy2: 'partial' },
    { name: t.landing.comparisonRoadside, policy1: true, policy2: true },
  ]

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
            <Shield className="text-white" size={20} />
          </div>
          <div>
            <h3 className="text-white font-semibold">{t.landing.comparisonTitle}</h3>
            <p className="text-slate-300 text-sm">{t.landing.comparisonSubtitle}</p>
          </div>
        </div>
      </div>

      {/* Policy Headers */}
      <div className="grid grid-cols-3 border-b border-gray-100">
        <div className="p-4 bg-gray-50">
          <span className="text-sm font-medium text-gray-600">{t.landing.comparisonCoverage}</span>
        </div>
        {policies.map((policy, i) => (
          <div key={i} className="p-4 text-center border-l border-gray-100">
            <p className="font-semibold text-gray-900">{policy.name}</p>
            <p className="text-xs text-gray-500">{policy.provider}</p>
            <p className="text-sm font-medium text-blue-600 mt-1">{policy.premium}</p>
          </div>
        ))}
      </div>

      {/* Comparison Rows */}
      {features.map((feature, i) => (
        <div key={i} className="grid grid-cols-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <div className="p-4">
            <span className="text-sm text-gray-700">{feature.name}</span>
          </div>
          <div className="p-4 flex justify-center items-center border-l border-gray-100">
            {feature.policy1 === true && (
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                <Check size={14} className="text-green-600" />
              </div>
            )}
          </div>
          <div className="p-4 flex justify-center items-center border-l border-gray-100">
            {feature.policy2 === true && (
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                <Check size={14} className="text-green-600" />
              </div>
            )}
            {feature.policy2 === false && (
              <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                <X size={14} className="text-red-600" />
              </div>
            )}
            {feature.policy2 === 'partial' && (
              <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={14} className="text-amber-600" />
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
        <p className="text-sm text-center text-gray-600">
          <span className="font-medium text-blue-600">{t.landing.comparisonAiInsight}</span> {t.landing.comparisonAiInsightText}
        </p>
      </div>
    </div>
  )
}

export function ComparisonMockMobile() {
  const { t } = useTranslation()

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4">
        <div className="flex items-center gap-2">
          <Shield className="text-white" size={16} />
          <span className="text-white font-medium text-sm">{t.landing.comparisonSample}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {[
          { label: t.landing.comparisonBestCoverage, value: 'Allianz Kasko', color: 'text-blue-600' },
          { label: t.landing.comparisonLowestPremium, value: 'AXA Kasko', color: 'text-green-600' },
          { label: t.landing.comparisonAiPick, value: 'Allianz Kasko', color: 'text-purple-600' },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <span className="text-sm text-gray-600">{item.label}</span>
            <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4">
        <p className="text-xs text-gray-400 text-center">{t.landing.comparisonDisclaimer}</p>
      </div>
    </div>
  )
}
