import { ShieldCheck, Zap, Target } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/i18n-context'

export function WhyChooseUs() {
  const { t } = useTranslation()

  const differentiators = [
    {
      icon: ShieldCheck,
      title: t.landing.whyKvkkTitle,
      description: t.landing.whyKvkkDesc,
    },
    {
      icon: Zap,
      title: t.landing.whyNoSignupTitle,
      description: t.landing.whyNoSignupDesc,
    },
    {
      icon: Target,
      title: t.landing.whyTurkeyTitle,
      description: t.landing.whyTurkeyDesc,
    },
  ]

  return (
    <section className="py-12 md:py-16 bg-gradient-to-r from-slate-800 to-slate-900">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 md:gap-24">
          {differentiators.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="flex sm:flex-col items-center sm:text-center gap-4 sm:gap-0 text-white">
                <Icon className="sm:mb-3 opacity-80 flex-shrink-0" size={28} />
                <div>
                  <div className="text-lg font-bold sm:text-xl">{item.title}</div>
                  <div className="text-sm text-slate-300">{item.description}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
