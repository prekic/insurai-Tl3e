import { Upload, Sparkles, Award } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function HowItWorks() {
  const { t } = useTranslation()

  const steps = [
    {
      icon: Upload,
      title: t.landing.step1Title,
      description: t.landing.step1Description,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Sparkles,
      title: t.landing.step2Title,
      description: t.landing.step2Description,
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Award,
      title: t.landing.step3Title,
      description: t.landing.step3Description,
      color: 'from-green-500 to-emerald-500',
    },
  ]

  return (
    <section id="how-it-works" className="py-14 md:py-24 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-10 md:mb-20">
          <div className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-full mb-4 md:mb-6">
            <Sparkles className="text-blue-600" size={16} />
            <span className="text-sm font-medium text-blue-900">{t.landing.simpleProcess}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl md:text-5xl mb-3 md:mb-6 tracking-tight">
            {t.landing.howItWorksHeadline}
          </h2>
          <p className="text-base md:text-xl text-gray-600">
            {t.landing.howItWorksDesc}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 md:gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={index} className="relative group">
                <div className="relative bg-white rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-md md:shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 group-hover:-translate-y-2">
                  <div className="absolute -top-3 -left-3 md:-top-4 md:-left-4 w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-gray-900 to-gray-700 text-white rounded-xl md:rounded-2xl flex items-center justify-center font-bold shadow-xl text-sm md:text-lg">
                    {index + 1}
                  </div>
                  <div className={`inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br ${step.color} rounded-xl md:rounded-2xl mb-4 md:mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform`}>
                    <Icon className="text-white" size={22} />
                  </div>
                  <h3 className="text-lg md:text-2xl font-semibold mb-2 md:mb-3 text-gray-900">{step.title}</h3>
                  <p className="text-sm md:text-base text-gray-600 leading-relaxed">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/3 -right-4 w-8 h-0.5 bg-gradient-to-r from-gray-300 to-transparent" />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
