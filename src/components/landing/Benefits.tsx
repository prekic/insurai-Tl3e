import { Shield, Zap, Globe, Clock, Lock, BarChart3 } from 'lucide-react'

export function Benefits() {
  const benefits = [
    {
      icon: Shield,
      title: 'Comprehensive Analysis',
      description: 'AI extracts every detail from your policy documents automatically.',
    },
    {
      icon: Zap,
      title: 'Instant Results',
      description: 'Get detailed coverage breakdowns in seconds, not hours.',
    },
    {
      icon: Globe,
      title: 'Multi-Language Support',
      description: 'Works with Turkish and English policies seamlessly.',
    },
    {
      icon: Clock,
      title: 'Renewal Tracking',
      description: 'Never miss a renewal with automated reminders.',
    },
    {
      icon: Lock,
      title: 'Bank-Level Security',
      description: 'Your documents are encrypted and protected.',
    },
    {
      icon: BarChart3,
      title: 'Market Benchmarks',
      description: 'Compare your coverage against market standards.',
    },
  ]

  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl mb-6 tracking-tight">
            Why choose <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">InsurAI</span>
          </h2>
          <p className="text-xl text-gray-600">
            The most powerful insurance analysis platform for Turkish market professionals.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {benefits.map((benefit, i) => {
            const Icon = benefit.icon
            return (
              <div key={i} className="p-6 bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-100 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="text-blue-600" size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
