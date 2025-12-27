import { Briefcase, Users, Building2 } from 'lucide-react'

export function WhoItsFor() {
  const audiences = [
    {
      icon: Briefcase,
      title: 'Insurance Brokers',
      description: 'Quickly analyze and compare policies for your clients.',
    },
    {
      icon: Building2,
      title: 'Corporate Risk Managers',
      description: 'Manage complex policy portfolios with ease.',
    },
    {
      icon: Users,
      title: 'Individual Policyholders',
      description: 'Understand your coverage in plain language.',
    },
  ]

  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl mb-6 tracking-tight">
            Built for <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">insurance professionals</span>
          </h2>
          <p className="text-xl text-gray-600">
            Whether you're a broker, risk manager, or policyholder, InsurAI helps you understand your coverage.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {audiences.map((audience, i) => {
            const Icon = audience.icon
            return (
              <div key={i} className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 text-center hover:shadow-xl transition-all">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Icon className="text-white" size={32} />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{audience.title}</h3>
                <p className="text-gray-600">{audience.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
