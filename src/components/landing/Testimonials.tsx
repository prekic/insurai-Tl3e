import { Briefcase, Building2, Users } from 'lucide-react'

export function Testimonials() {
  const useCases = [
    {
      icon: Briefcase,
      audience: 'Insurance Brokers',
      scenario: 'Upload client policies, get instant coverage gap reports, and present side-by-side comparisons — all in minutes instead of hours.',
    },
    {
      icon: Building2,
      audience: 'Corporate Risk Managers',
      scenario: 'Analyze complex commercial policies against market benchmarks and identify under-insured areas before renewal season.',
    },
    {
      icon: Users,
      audience: 'Individual Policyholders',
      scenario: 'Upload your kasko or health policy and get a plain-language explanation of what is and isn&apos;t covered.',
    },
  ]

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-10 md:mb-16">
          <h2 className="text-3xl md:text-5xl mb-4 md:mb-6 tracking-tight">
            What you can <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">do with InsurAI</span>
          </h2>
          <p className="text-lg md:text-xl text-gray-600">
            Real use cases for insurance professionals and policyholders.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
          {useCases.map((useCase, i) => {
            const Icon = useCase.icon
            return (
              <div key={i} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 md:p-8 border border-gray-100 shadow-lg">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="text-white" size={22} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{useCase.audience}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{useCase.scenario}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
