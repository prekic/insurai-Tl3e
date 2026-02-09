import { ShieldCheck, Zap, Target } from 'lucide-react'

export function WhyChooseUs() {
  const differentiators = [
    {
      icon: ShieldCheck,
      title: 'KVKK Compliant',
      description: 'Privacy-first design for Turkish data protection',
    },
    {
      icon: Zap,
      title: 'No Signup Required',
      description: 'Try a full policy analysis free, instantly',
    },
    {
      icon: Target,
      title: 'Turkey-Focused',
      description: 'Built specifically for Turkish insurance market',
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
