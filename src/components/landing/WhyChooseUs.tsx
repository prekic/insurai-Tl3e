import { Award, Users, Globe } from 'lucide-react'

export function WhyChooseUs() {
  const features = [
    {
      icon: Award,
      stat: '4.9/5',
      label: 'User Rating',
    },
    {
      icon: Users,
      stat: '15K+',
      label: 'Active Users',
    },
    {
      icon: Globe,
      stat: '50+',
      label: 'Insurance Partners',
    },
  ]

  return (
    <section className="py-16 bg-gradient-to-r from-slate-800 to-slate-900">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24">
          {features.map((feature, i) => {
            const Icon = feature.icon
            return (
              <div key={i} className="text-center text-white">
                <Icon className="mx-auto mb-3 opacity-80" size={32} />
                <div className="text-4xl font-bold">{feature.stat}</div>
                <div className="text-slate-300">{feature.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
